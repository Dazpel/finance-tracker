# Draft Report Approval + `userAmountOverride` — Design

**Date:** 2026-05-01
**Status:** Brainstorm complete, awaiting review before writing-plans
**Author:** Alex (with Claude)

## Summary

Wire up the missing UI half of an approval flow that already exists server-side: surface an "Approve" button on the report-detail page that promotes a `PENDING_APPROVAL` monthly report to `APPROVED`, snapshotting `SyncedTransaction` rows into the immutable `Transaction` table.

Add a `userAmountOverride` column to `SyncedTransaction` so the user can correct the amount that actually matters to them (typical case: a charge that was partially reimbursed via Venmo / a roommate / etc.) without touching what Plaid reported. The override flows through the totals computation, the approval snapshot, and the per-row display via a single `resolveAmount` helper.

Drift detection on already-approved reports is **explicitly out of scope** — see "Decisions log" Q4.

## Goals

- A user can approve a `PENDING_APPROVAL` monthly report from the `/reports/details` page with a single click + confirmation.
- Approval is gated on `PENDING_APPROVAL` status only — no approving a `DRAFT` mid-grace-window. The 7-day grace ensures Plaid revisions have settled.
- A user can set `userAmountOverride` on any `SyncedTransaction` while the parent report is in `DRAFT` or `PENDING_APPROVAL`. Override is honored in: report totals, the snapshot copy on approval, and the per-row amount displayed in the transactions table.
- Once a report is `APPROVED`, the override field is read-only along with everything else on the row.
- The approval endpoint persists fresh `Report.foodAndDrink` / `Report.total` / etc. totals in the same DB transaction as the snapshot copy, so any override edits made during `PENDING_APPROVAL` are reflected in both the row-level snapshot and the report card.

## Non-goals

- No drift detection on `APPROVED` reports. If a Plaid revision lands on an already-approved month (rare, per ~7-day Plaid update window), the snapshot stays as-is. Accepted as the rare-case trade-off.
- No re-approval flow. Once approved, approval is permanent. No `lastApprovedAt` / revision tracking.
- No auto-promotion `PENDING_APPROVAL` → `APPROVED`. Manual click only.
- No relaxation of the existing `PENDING_APPROVAL` recompute freeze in `upsertCurrentMonthDraftReport`. Recompute on user edits during `PENDING_APPROVAL` happens lazily — at approval time, via the new totals-write inside the approve endpoint.
- No transaction splits across categories (`$100 = $60 groceries + $40 household`). Different feature, different schema.

## Decisions log (from brainstorm Q&A)

| # | Question | Decision |
|---|---|---|
| Q1 | Late Plaid update on an approved month | Originally option B (detect + flag for re-approval); subsequently dropped entirely. Approval is gated on `PENDING_APPROVAL` (post-7-day grace), making post-approval drift rare enough to ignore. |
| Q2 | What counts as "drift" | Originally option A (Plaid-driven changes on user-untouched fields). N/A now that drift detection is out of scope. |
| Q3 | `userAmountOverride` use case | Option B: reimbursement net. Single nullable `Float`. Reuse existing `notes` for free-text context. |
| Q4 | Re-approval mechanics | N/A — re-approval out of scope. Approval is one-shot. |
| Q5 | UI surface for approval signal | Approve button on report-detail page only. No reports-list badge (no drift state to surface). |
| Q6 | Approval gating | Only `PENDING_APPROVAL` is approvable. `DRAFT` is rejected with "wait for grace window." |
| Q7 | Recompute during `PENDING_APPROVAL` | Stay frozen (current behavior). Approval endpoint takes responsibility for re-computing totals at lock-in time, so override edits made during `PENDING_APPROVAL` still flow through to the final row + card. |

## Architecture

### Data model changes

```prisma
model SyncedTransaction {
  // ...existing fields unchanged
  userAmountOverride Float?
}
```

That is the only schema change. No new columns on `Report`. No new tables.

### The single resolver helper

```ts
// src/lib/reports/draftReport.ts (co-located with resolveCategory for symmetry)
export const resolveAmount = (
  s: Pick<SyncedTransaction, "amount" | "userAmountOverride">
): number => s.userAmountOverride ?? s.amount;
```

Three call sites must read amount through this helper instead of `s.amount` directly:

1. **Totals computation** in `src/lib/reports/draftReport.ts` (the function that aggregates per-category sums for a `DRAFT` recompute).
2. **Approval snapshot** in `src/app/api/prisma/reports/[id]/approve/route.ts` line 103: `amount: resolveAmount(t)`.
3. **Per-row display shaping** in `src/lib/prisma/prismaFunctions.ts` line 216 (the path that maps `SyncedTransaction` rows to display rows for `PENDING_APPROVAL` / `DRAFT` reports).

If `userAmountOverride` semantics ever change (e.g., we add a per-currency override or split semantics), this is the one file that changes.

### Approve endpoint behavior (`src/app/api/prisma/reports/[id]/approve/route.ts`)

The endpoint already exists and is largely correct. Three changes:

1. **Tighten status check** (lines 45-53). Replace the `DRAFT || PENDING_APPROVAL` allowlist with `PENDING_APPROVAL` only. Returning a 409 for `DRAFT` with a message: `"Cannot approve a report still in the 7-day grace window. Wait until status becomes PENDING_APPROVAL."`
2. **Tighten atomic conditional update** (line 86). The `where.status` filter changes from `{ in: [DRAFT, PENDING_APPROVAL] }` to a plain equality on `PENDING_APPROVAL`.
3. **Use `resolveAmount` for the snapshot** (line 103). `amount: resolveAmount(t)`.
4. **Recompute and persist `Report` totals in the same DB transaction.** Inside the existing `prisma.$transaction(...)` block, call the already-exported `computeReportTotals(synced)` from `draftReport.ts` (line 138). After this design lands, that function reads each row's amount via `resolveAmount`, so the returned totals are override-aware. Write those totals into the `tx.report.updateMany(...)` `data` block alongside `status` and `approvedAt`. This guarantees the report card reflects any overrides set during `PENDING_APPROVAL`.

The existing concurrency guard (conditional `updateMany` returning `count: 1` or aborting) carries through unchanged.

### Edit-side: piggyback on the existing bulk-update flow

The PATCH endpoint at `src/app/api/prisma/synced-transactions/[id]/route.ts` accepts `userCategoryOverride` and `userSoftDeleted` server-side, **but has no UI caller anywhere in `src/`**. User edits to synced rows on `DRAFT` / `PENDING_APPROVAL` reports today actually persist via the bulk-update flow:

1. User opens `/reports/edit?data=...`, clicks Edit on a row, and the `EditTransactionModal` opens with editable category + notes (and read-only description / amount when `isPendingReport`).
2. Saves are accumulated into the page's local React state (undo/redo history).
3. Clicking "Update Report" POSTs the entire transactions array to `/api/prisma/reports/update`.
4. That route calls `updateReport()` in `src/lib/prisma/prismaFunctions.ts:410`, which detects pending-monthly status, diffs each row vs live `SyncedTransaction`, batches `userSoftDeleted` / `userCategoryOverride` / `notes` writes inside a `prisma.$transaction(...)`, then calls `computeReportTotals(refreshed)` and writes those totals to the `Report` row (line 561-577).

We thread `userAmountOverride` through the same path:

- Extend `TransactionWithNotes` (or wherever the edit-side row type lives) with `userAmountOverride?: number | null`.
- Add an "Override Amount" `Input` to `EditTransactionModal` rendered only when `isPendingReport`. Existing read-only "Amount" stays as the Plaid reference.
- Capture the override in `handleEditSubmit` in `src/app/reports/edit/page.tsx`. Empty input → `null`. Non-empty → `-Number(value)` matching the existing sign-flip convention for `amount`.
- In `updateReport`, extend the `rowUpdates` shape with `userAmountOverride`, include it in the per-row "unchanged?" comparison, and pass it through the inner `tx.syncedTransaction.update(...)` `data` block.
- `computeReportTotals(refreshed)` already runs at line 568 of `prismaFunctions.ts` for `PENDING_APPROVAL` reports and writes totals at line 570 — so once `computeReportTotals` is override-aware (Architecture § resolver), override edits during `PENDING_APPROVAL` automatically refresh the report card via this path.
- Validation: `updateReport` rejects with `success: false` if any row has a negative `userAmountOverride`. `null` and `0` are allowed (`0` = fully reimbursed; functionally distinct from `userSoftDeleted`).

The orphan PATCH endpoint at `/api/prisma/synced-transactions/[id]/route.ts` is **not** extended in this work — it would be dead code without a UI caller. If a future feature wires a per-row inline edit UI to it, that's the moment to add `userAmountOverride` there.

### UI: Approve button

Location: `src/app/reports/details/page.tsx`, top-right of the report card, alongside the existing View / Edit toggle buttons.

- **Visibility:** rendered only when `report.status === "PENDING_APPROVAL"`. Hidden for `DRAFT` (still in grace) and `APPROVED` (already done).
- **Click flow:**
  1. Open a confirmation modal: `"Approve and lock <Month Year>? Once approved, this report becomes read-only. Late Plaid revisions to this month will not be reflected."`
  2. On confirm, `POST /api/prisma/reports/[id]/approve`.
  3. On 200: toast "Report approved", navigate back to `/reports` so the list re-fetches and the row reflects the new status.
  4. On 409 (`ALREADY_APPROVED`): toast the server's error message and navigate back. (Race-condition friendly — another tab beat us to it.)
  5. On any other error: toast the message, leave the modal open so the user can retry.
- The button uses `isLoading` state from the click handler so users get feedback during the round trip.

## Data flow walkthrough

**Scenario:** User approves April 2026 on May 8 after setting one override during `PENDING_APPROVAL`.

1. April 1 – April 30: Plaid syncs land throughout the month. Each sync triggers `upsertCurrentMonthDraftReport`, which recomputes `Report.foodAndDrink` etc. for the April `DRAFT`. (Unchanged behavior.)
2. May 1 – May 7: April is past, but still in the 7-day grace window. April's `DRAFT` continues to recompute on each sync. `resolveAmount` is now used in totals — for any row without an override, it's identical to `s.amount`. (No behavior change for users without overrides.)
3. May 8: First sync after grace expiry. `upsertCurrentMonthDraftReport` flips April from `DRAFT` to `PENDING_APPROVAL`. No recompute on this transition (existing behavior preserved). Totals are frozen at the May 7 state.
4. May 9: User opens April's detail page. Sees a single charge that was reimbursed by their roommate. Edits the row in the transactions table, sets `userAmountOverride` to the net cost. PATCH fires, `userAmountOverride` is persisted, `upsertCurrentMonthDraftReport` is called and is a no-op (April is `PENDING_APPROVAL`, frozen). The row's display amount updates immediately via the read-path resolver. The report card's total still shows the pre-override total.
5. May 9 (later): User clicks "Approve". Modal confirms. POST hits the approve endpoint:
   - Endpoint loads `synced` rows for April.
   - Inside the transaction:
     - `tx.report.updateMany` flips status to `APPROVED`, sets `approvedAt`, **and** writes recomputed totals (using `resolveAmount` → reflects the override).
     - `tx.transaction.createMany` snapshots rows with `amount: resolveAmount(t)` (override-aware).
   - Returns 200.
   - UI navigates back to `/reports`. April's row now shows the corrected total and `APPROVED` status. The Approve button is no longer rendered for this report.

## Edge cases & error handling

| Case | Handling |
|---|---|
| User clicks Approve on a `DRAFT` report (button shouldn't render, but if forged) | Endpoint returns 409 `"Cannot approve a report still in the 7-day grace window."` — handled by the existing strict status check. |
| Concurrent approve clicks (two tabs) | Existing conditional `updateMany` guard — first one wins, second receives `ALREADY_APPROVED`. UI toasts and navigates back. |
| Plaid revises an April transaction on May 10 (after approval) | Snapshot stays as-is. `SyncedTransaction` updates live but the report does not change. Accepted trade-off (per Non-goals). |
| User sets `userAmountOverride` to `0` | Allowed. Means "fully reimbursed; counts as $0." Note this is functionally distinct from `userSoftDeleted` (the row stays visible in lists; just contributes $0 to totals). |
| User sets `userAmountOverride` to a negative number | Rejected at the API with 400. Out of scope for "reimbursement net" semantics (would flip expense ↔ revenue). |
| User clears `userAmountOverride` (sets to `null`) on a `PENDING_APPROVAL` row, then approves | Snapshot uses `s.amount` (since override is null). Final totals reflect the original Plaid amount. Behaves correctly. |
| `Report` row is missing `month` / `year` somehow | Existing 500 guard at lines 54-58 of approve endpoint. Unchanged. |
| Approval succeeds but post-approve navigation fails (e.g., user closes tab) | Server-side state is correct. Next reload picks up the new state. No corrective action needed. |

## File touch list

**New / modified, server side:**

- `prisma/schema.prisma` — add `userAmountOverride: Float?` to `SyncedTransaction` (one line).
- `prisma/migrations/<ts>_add_user_amount_override/migration.sql` — generated migration.
- `src/lib/reports/draftReport.ts` — add and export `resolveAmount` helper; update `computeReportTotals` (already exported, line 138) to read each row's amount via `resolveAmount` instead of `t.amount` directly.
- `src/app/api/prisma/reports/[id]/approve/route.ts` — tighten status check, switch to `resolveAmount`, add totals recompute inside the transaction.
- `src/lib/prisma/prismaFunctions.ts` — line ~216 per-row display mapping uses `resolveAmount(t)`; `updateReport` (line 410+) extended to thread `userAmountOverride` through the bulk-update diff loop and the inner `tx.syncedTransaction.update` call, with non-negative validation.

**New / modified, client side:**

- `src/utils/types.ts` (or wherever `TransactionWithNotes` is defined) — add `userAmountOverride?: number | null`.
- `src/components/EditTransactionModal/EditTransactionModal.tsx` — add the "Override Amount (optional)" input, rendered only when `isPendingReport`.
- `src/app/reports/edit/page.tsx` — extend `handleEditSubmit` to capture the override and put it on the local row; the existing bulk POST already serializes the row.
- `src/app/reports/details/page.tsx` — add the Approve button + confirmation modal + post-approve navigation.

## Verification

**Manual test plan (post-implementation):**

1. Set the local clock or rely on existing test fixtures for a `PENDING_APPROVAL` report.
2. Open the report's detail page → confirm Approve button is visible.
3. Click Approve → confirm modal copy and CTA correctness.
4. Confirm → check network tab for 200 from `/api/prisma/reports/[id]/approve`, navigate back to `/reports`.
5. Inspect Prisma Studio: `Report.status = APPROVED`, `approvedAt` set, totals match `synced` aggregated through `resolveAmount`. `Transaction` rows present with override-aware amounts.
6. Re-open the report → Approve button no longer rendered. Row override controls are hidden (read-only).
7. Negative case: open a `DRAFT` (current month) report → Approve button is hidden. Forge a POST → 409.
8. `userAmountOverride` flow: on a `PENDING_APPROVAL` row, set override → row display updates → approve → snapshot reflects override.
9. Edge: set override to `0` → row shows $0, totals exclude that row's spend, approval snapshots `0`.
10. Edge: submit a row with `userAmountOverride: -5` through the bulk-update path → server rejects with `success: false`.

No automated test framework currently exists in the repo (per the prior threshold spec). Standalone scripts under `scripts/` are an acceptable substitute if specific cases need codified repro.

## Out of scope (recap, for clarity)

- Drift detection on approved reports (Q1/Q2 originally explored, dropped).
- Re-approval flow / `lastApprovedAt` / revision tracking.
- Auto-promotion `PENDING_APPROVAL` → `APPROVED`.
- Allowing `PENDING_APPROVAL` to recompute live (kept frozen; covered by approve-endpoint recompute).
- Transaction splits across categories.
- Separate "override note" field (existing `notes` is sufficient).
