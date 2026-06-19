# Correction-Aware, Stable Transaction Categorization — Design

**Date:** 2026-06-18
**Status:** Approved (pending spec review)
**Area:** `src/lib/ai/categorize.ts`, `src/lib/ai/categorizeForUser.ts`, write paths, Prisma schema

## Problem

On repeated categorization runs, transactions from the same merchant land in
different canonical categories — especially the **Revenue** class. The symptom
the user observes is **merchant-level inconsistency**: similar transactions
(e.g. recurring payouts/deposits) are categorized inconsistently across runs or
within a batch.

Two root causes, confirmed by investigation + research:

1. **LLM nondeterminism.** `temperature: 0` is greedy decoding, *not*
   deterministic decoding. No `seed` is set. On near-tie cases (Revenue vs
   Others) tiny floating-point / batch-routing differences flip the argmax.
2. **No memoization of human intent.** Each transaction is classified
   independently by a stochastic model, so the same merchant can resolve
   differently every time. The user's genuine corrections are **never fed
   back** into classification.

### Key finding: no provenance today

Both the AI (`categorizeForUser.ts:114` `updateMany`) and the user's manual
corrections (`api/prisma/synced-transactions/[id]`,
`api/mobile/transactions/synced/[id]`) write to the **same field**
`SyncedTransaction.userCategoryOverride` (`schema.prisma:176`). Nothing
distinguishes "AI guessed this" from "human corrected this." So the existing
override data is contaminated and cannot be cleanly used as ground truth.

Categorization is already **idempotent** (only rows with
`userCategoryOverride: null` are processed), so the drift is *across similar
rows*, not re-writes of a single row.

## Goals

- Same merchant → same category, deterministically, once the user has expressed
  intent for it.
- Use **genuine** user corrections (not AI guesses) to improve matching.
- Reduce residual LLM drift on the genuine ambiguous tail.

## Non-goals (YAGNI)

- No confidence-score / human-review-queue system (deferred — "Approach C").
- No re-categorization of existing `ai` rows when the correction map later
  grows (idempotency preserved; optional future backfill noted below).
- No change to the draft-report timing window (display-only; data is correct).
- No change to the `Transaction` model or `approveReport` (see Ground Truth).

## Ground Truth — what counts as a "user" category

Only **actively-chosen** categories are ground truth. Two clean sources:

1. **`SyncedTransaction` where `categorySource = 'user'`** — active corrections
   made via the override API routes. These persist in the live table after a
   report is approved, so we read them directly here.
2. **`Transaction` where `account_id = 'new_transaction'`** (`LOCAL_ACCOUNT_ID`,
   `src/utils/constants.ts:74`) — manually-authored report rows the user typed
   in `createReport` (`prismaFunctions.ts:244`).

**Explicitly excluded:** synced rows the AI/signal categorized and the user
approved *without changing that row* (passive approval). Treating these as
ground truth would let the deterministic map **amplify AI errors** — exactly the
Revenue drift we are fixing. (Decision: "Exclude from both.")

### Existing-data implications

- The legacy `userCategoryOverride` blob mixes AI guesses and user corrections
  with no retroactive way to split them → backfills to `NULL`. It begins
  contributing only as *new* corrections land.
- Manually-created `Transaction` rows are cleanly identifiable **today**
  (`account_id = 'new_transaction'`), so that historical ground truth is usable
  on day one.

## Design

### 1. Provenance flag (schema migration)

Add to `SyncedTransaction` **only** (not `Transaction`):

```prisma
enum CategorySource {
  user    // manual human correction (ground truth)
  lookup  // applied deterministically from the learned correction map
  signal  // detectStrongSignal deterministic rule
  ai      // LLM
}

model SyncedTransaction {
  // ...
  categorySource CategorySource?
}
```

**Migration** (style per `prisma/migrations/2026*_*`): create enum, add nullable
column. **Backfill: leave existing non-null `userCategoryOverride` rows as
`NULL`** — investigation confirmed no reliable retroactive signal (no audit log;
`updatedAt` is clobbered by Plaid pending→posted carryover). Mislabeling AI
guesses as `user` would poison the map; `NULL` is the honest value.

### 2. Write-path tagging

- `api/prisma/synced-transactions/[id]/route.ts` (~L54) and
  `api/mobile/transactions/synced/[id]/route.ts` (~L69): when setting
  `userCategoryOverride`, also set `categorySource: 'user'`.
- `categorizeBatch` return type changes from
  `Map<string, CanonicalCategory>` to
  `Map<string, { category: CanonicalCategory; source: 'lookup' | 'signal' | 'ai' }>`
  so the distinction (currently lost in a flat map) reaches the caller.
- `categorizeForUser.ts` persists `categorySource` per the returned source
  alongside `userCategoryOverride`.

### 3. Correction lookup layer — the core consistency fix

New module, structured per the project convention (split into
`types` / `constants` / functions — do **not** bundle everything in one file).
Suggested: `src/lib/ai/correction-lookup/` with `types.ts`, `constants.ts`,
`buildCorrectionMap.ts` (or equivalent file split).

**Build** a per-user `Map<string, CanonicalCategory>` from the two ground-truth
sources above:

- **Key:** `` `${normalizedMerchant}|${flow}` `` where
  `normalizedMerchant = (merchant_name || name).trim().toLowerCase()`
  (`Transaction` rows have no `merchant_name`, so they use `name`), and `flow`
  is the canonical inflow/outflow direction (see Verification below).
- **Skip** keys whose merchant matches `GENERIC_MERCHANT`
  (`/^(sq|pos|payment|transfer|refund)/i`) — too ambiguous to learn from.
- **Conflict resolution** (same key, multiple corrected categories): majority
  vote; most-recent wins on ties. Deterministic.

**Consult** the map in `categorizeBatch` **before** `detectStrongSignal`. A hit
returns `{ category, source: 'lookup' }` and never touches the model.

**Precedence:** `lookup` → `detectStrongSignal` (`signal`) → LLM (`ai`).
A genuine user correction outranks deterministic rules and the model. (Accepted
risk: a single bad correction propagates to that merchant; acceptable for v1 —
the product intent is "respect my corrections.")

### 4. Few-shot from corrections (layer B)

In `categorizeForUser`, source few-shot examples from the **same two
ground-truth sources** (replacing the current pull from *all* `Transaction`
history, which is mostly passively-approved AI guesses):

- **Class-balanced:** cap examples per category to kill majority-label bias
  (the documented cause of over-predicting a class like Revenue).
- **Frozen deterministic order:** sort by `(category, name)`. A shifting example
  set is itself a primary drift cause.
- **Backfill** toward `MIN_USER_EXAMPLES` (5) with `FALLBACK_EXAMPLES` when a
  user has few corrections; cap at `MAX_USER_EXAMPLES` (30).

Merchants already covered by the deterministic map are handled before the LLM,
so examples mainly help the model **generalize** to similar, not-yet-corrected
merchants.

### 5. LLM determinism knobs

In the `generateText` call (`categorize.ts:321`):

- Add a constant `seed` (top-level AI-SDK setting).
- Keep `temperature: 0`.
- Leave `topP` unset (avoid a second stochastic axis).
- Keep structured output / strict JSON schema.

Accept that the API floor is "mostly deterministic"; this reduces, not
eliminates, tail variance — which is why the deterministic map (§3) does the
heavy lifting.

## Verification — sign convention (RESOLVED)

**Outcome:** the convention is uniform across both ground-truth sources, and the
pre-existing categorizer was *inverted*. Resolved during implementation; no
open verification item remains.

**Evidence gathered:**

- Stored `amount` (both `SyncedTransaction` and `Transaction`) follows Plaid's
  row-level convention — **expenses POSITIVE, revenue/deposits NEGATIVE**
  (money in ⇔ `amount < 0`). Confirmed at:
  - `syncTransactions.ts:34` — `amount: t.amount` written raw, no flip.
  - `draftReport.ts:140-141` — explicit comment; `resolveAmount` returns raw.
  - `prismaFunctions.ts:692-698` — totals SQL does `SUM(amount)*-1` for
    expenses and `ABS(amount)` for revenue.
- Both tables share this convention, so `flow = amount < 0 ? 'in' : 'out'` is
  computed identically everywhere (no per-source divergence — the earlier
  "opposite conventions" worry was unfounded).
- Every other layer agrees and flips only at presentation: web UI
  (`TransactionsTable.tsx:506` `-cellValue`; `EditTransactionModal.tsx:76` +
  re-flip `TransactionsPage.tsx:232`), reports/SQL, and **finance-tracker-mobile**
  (`TransactionItem.tsx:21` `isIncome = amount < 0`; mobile does no local
  categorization).
- **`categorize.ts` was the sole outlier:** `isInflow = amount > 0` fired the
  Revenue path on expenses and suppressed it on real deposits — the primary
  driver of the observed Revenue instability.

**Fix applied (Task 6):** `detectStrongSignal` now uses `amount < 0`, and the
LLM prompt's flow rules were flipped to match. The correction-map `flowOf` uses
the same rule. No UI/API/mobile changes were needed (storage convention and all
presentation layers were already correct).

## Data Flow (after change)

```
categorizeForUser(userId)
  ├─ build correctionMap from:
  │     SyncedTransaction{ categorySource:'user', userSoftDeleted:false }
  │     Transaction{ account_id:'new_transaction' }
  ├─ build few-shot examples from the SAME two sources (balanced, frozen order)
  │     + FALLBACK_EXAMPLES to reach MIN_USER_EXAMPLES
  └─ for each chunk → categorizeBatch(inputs, examples, correctionMap)
        per transaction:
          1. correctionMap hit?      → { category, source:'lookup' }
          2. detectStrongSignal hit? → { category, source:'signal' }
          3. else LLM (seed, temp 0) → { category, source:'ai' }
     persist userCategoryOverride + categorySource per source
```

## Files touched

| File | Change |
|---|---|
| `prisma/schema.prisma` | add `CategorySource` enum + `categorySource` column on `SyncedTransaction` |
| `prisma/migrations/2026..._add_category_source/` | create enum, add column, `NULL` backfill |
| `src/lib/ai/correction-lookup/*` | **new** — build per-user merchant→category map (types/constants/functions split) |
| `src/lib/ai/categorize.ts` | consult map first; structured return with `source`; add `seed`; keep `temperature:0` and leave `topP` unset |
| `src/lib/ai/categorizeForUser.ts` | source ground-truth corrections; balanced/frozen few-shot; persist `categorySource` |
| `src/app/api/prisma/synced-transactions/[id]/route.ts` | set `categorySource:'user'` |
| `src/app/api/mobile/transactions/synced/[id]/route.ts` | set `categorySource:'user'` |

## Open questions / future work

- Optional later backfill that re-applies a grown correction map to existing
  `ai` rows (would break strict idempotency — deliberately deferred).
- If correction volume stays low, revisit whether passively-approved rows should
  feed *few-shot only* (currently excluded by decision).
```
