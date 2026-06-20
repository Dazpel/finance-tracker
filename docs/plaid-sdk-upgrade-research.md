# Plaid Node SDK Upgrade Research (38 → 42)

**Date:** 2026-06-19
**Researched with:** Context7 (`/plaid/plaid-node`) + Plaid official changelog/docs/blog + plaid-node GitHub CHANGELOG, verified through a 5-angle, adversarial deep-research pass (97 agents, 25 claims, 23 confirmed / 2 refuted)
**Current version:** `plaid` **^38.0.0** · `react-plaid-link` **^4.1.1**
**Latest version:** `plaid` **42.2.0** (released 2026-04-27) · `react-plaid-link` **4.1.1** (already latest)

> **TL;DR** — Unlike the Prisma 7 jump, this is **not an architectural rewrite**. The plaid SDK is generated from Plaid's OpenAPI schema, and all four major bumps (39→42) stay on the **same dated API version `2020-09-14`** — only the OAS build suffix increments. **None of the breaking changes in 39–42 touch the APIs this app uses**, with one type-level exception in `41.0.0` that only bites *if* we start pinning the PFC version field. **Recommendation: do the bump — it's low-risk and incremental.** The far more valuable (and separate) work the research surfaced is a **data-model opportunity**: the app still reads the **legacy `transaction.category[]` field**. Because this account was enabled in **2024**, those legacy fields are **retained** (no forced migration), so adopting `personal_finance_category` / **PFCv2** is pure upside. The standout is PFCv2's **`confidence_level`** field (§4.3): a 5-level certainty score that maps directly onto our cost-conscious AI categorizer — gate high-confidence transactions to skip the LLM entirely, and route only the uncertain tail through the model and to the user for review. Schedule that as its own feature ticket, not bundled into the version bump.

---

## 1. Where we are today

| Item | Value |
|------|-------|
| `plaid` | `^38.0.0` (latest `42.2.0`) |
| `react-plaid-link` | `^4.1.1` — **already latest, no action** |
| Client setup | `src/lib/plaid/client.ts` — `new PlaidApi(new Configuration({...}))`, header `Plaid-Version: '2020-09-14'` |
| Plaid APIs used | `transactionsSync`, `transactionsGet`, `transactionsRefresh`, `transactionsRecurringGet`, `accountsGet`, `linkTokenCreate`, `itemPublicTokenExchange`, `itemGet`, `itemRemove`, `itemWebhookUpdate`, `webhookVerificationKeyGet`, `sandboxItemFireWebhook` |
| Plaid types imported | `Configuration`, `PlaidApi`, `PlaidEnvironments`, `AccountBase`, `Transaction`, `TransactionBase`, `TransactionStream`, `RemovedTransaction`, `CountryCode`, `Products`, `WebhookType`, `SandboxItemFireWebhookRequestWebhookCodeEnum` |
| Categorization source | **Legacy `transaction.category[]`** across ~12 files (`TransactionsPage.tsx`, `reports/*`, `utils/functions.ts`, `utils/insights.ts`, mobile category routes). **No** use of `personal_finance_category` anywhere. |
| Deprecated/removed fields used | **None** — no `personal_finance_category_version`, `include_personal_finance_category`, `include_logo_and_counterparty_beta`, `RecurringFrequency`, or `/transactions/enrich` usage (verified by grep) |
| Runtime | Node `22.x` (v22.22.2) — fully supported |

**Why this matters:** our SDK usage surface is clean and central. The version bump is mostly a `package.json` change plus a TypeScript typecheck. The real exposure is data-model, not SDK-version.

---

## 2. The two questions that decide risk — both answered "no change needed"

### 2.1 Does the pinned `Plaid-Version: 2020-09-14` need to change? → **No.**
- Only **four** dated Plaid API versions have ever existed: `2017-03-08`, `2018-05-22`, `2019-05-29`, `2020-09-14`. `2020-09-14` is the newest; **no newer dated version exists.**
- The plaid-node README states the SDK *"only supports the latest Plaid API version, 2020-09-14."* Every release from `39.0.0` (OAS `2020-09-14_1.667.0`) through `42.2.0` (OAS `2020-09-14_1.688.6`) keeps the **same date prefix** — only the build suffix moves. The header value *is* the date prefix, so suffix bumps are irrelevant.
- Plaid evolves `2020-09-14` **in-place** via a rolling changelog rather than issuing new dated versions. Our `src/lib/plaid/client.ts:14` is already correct and stays as-is.

### 2.2 Is `/transactions/get` deprecated? → **No formal deprecation.**
- Plaid *encourages* `/transactions/sync` for new work but uses only soft language; there is **no `deprecated`/sunset/removal date** for `/transactions/get`. Legacy update webhooks still fire for backward compatibility. We already use `transactionsSync` in `src/lib/plaid/syncTransactions.ts`, so we're on the recommended path.

---

## 3. Version-by-version breaking changes (39 → 42) and impact on us

Sourced from the plaid-node CHANGELOG. **"Impact" column is specific to this app's API surface.**

| Version | Breaking change | Impact on us |
|---------|-----------------|--------------|
| **39.0.0** | Removed `/cra/check_report/plaid_credit_score/get`; `item_id` now required on `/cra/monitoring_insights/subscribe`; CRA schema title change | ❌ None — CRA product unused |
| **40.0.0** | `user_token` made optional on several CRA endpoints; dropped `PLAID-NEW-USER-API-ENABLED` header in favor of `with_upgraded_user` | ❌ None — CRA unused |
| **41.0.0** | **(a)** *"Make Personal Financial Category version fields **enums**"* · **(b)** Removed `/user/items/list` (never customer-exposed) | ⚠️ **(a) only if we pin the PFC version field.** We don't today, so no impact now. If we adopt PFCv2 (§4.1) we must pass the **enum value**, not a raw string. **(b)** zero impact. |
| **42.0.0** | Removed deprecated beta `recurrence` field + `Recurrence`/`RecurringFrequency` schemas from `/transactions/enrich`; investments now return `InvestmentAccount` instead of `AccountBase`; `CraPartnerInsightsPrism` nullable; removed Plaid Check Score | ❌ None — we don't use enrich/investments/CRA/Check. **Note:** the `AccountBase`→`InvestmentAccount` swap is **investments-only**; our `accountsGet` still returns `AccountBase`. The removed `RecurringFrequency` is an **Enrich** type, *not* the `TransactionStream` frequency our `transactionsRecurringGet` returns. |
| **41.1–41.4, 42.1–42.2** | Additive only (new endpoints/fields: `/user/items/remove`, `/item/products/terminate`, PFC on `BaseReportTransaction`, etc.) | ❌ No breaking impact |

**Verified conclusion:** across 39–42 the breaking changes are concentrated in **CRA/credit, Investments, Protect/Signal, IDV, and Enrich** — products this app does not use. The **only** change that even touches our surface is the `41.0.0` PFC-version-field enum, and it's dormant unless/until we opt into PFCv2.

> ⚠️ **Honest caveat (flagged by adversarial verification):** the upgrade is **low-risk, not zero-touch**. The blanket claim "no breaking change touches our APIs" was *refuted* precisely because of the `41.0.0` enum change. Treat §5 as a real (small) checklist, not a rubber stamp.

---

## 4. New capabilities worth leveraging (2024–2026)

### 4.1 Personal Finance Categories v2 (PFCv2) — **the headline opportunity** ⭐
- Released **December 2025**: an AI-enhanced taxonomy reporting **~10% category-level** and **~20% subcategory-level** accuracy gains (vendor self-reported), with a more granular schema (new income, loan-disbursement, loan-repayment, and bank-fee subcategories).
- v1 and v2 coexist. **Existing customers opt in** per-request via `options.personal_finance_category_version = v2` on `/transactions/sync`, `/get`, `/recurring/get`, and `/enrich`. Accounts enabled **before Dec 2025 default to v1**; v1 still works but is **no longer being improved**.
- The `personal_finance_category` object carries `primary`, `detailed`, and `confidence_level`.
- **Why this is the real prize:** this app feeds categories into AI categorization (`src/lib/ai/*`), reports, insights, and threshold alerts. Adopting `personal_finance_category` (+ `confidence_level`) would give the AI layer a far stronger, structured signal than the legacy `category[]` string array it currently parses.

### 4.2 Legacy `category` / `category_id` freeze — **resolved: not at risk** ✅
- Plaid **removed** the legacy `category_id` / `category` fields only for customers **enabled for Transactions on/after May 5, 2025**. Pre-May-2025 customers keep them ("no plans to remove… at this time").
- **This account was enabled in 2024 (confirmed by owner)** → we are a **pre-cutoff customer**: the legacy `category[]` fields the app reads in ~12 places are **retained and keep working**. No silent "Others" risk from the removal, and no forced migration.
- Same cutoff logic for PFCv2 defaults: 2024 enablement means we **default to PFCv1** and must **explicitly opt into PFCv2** (§4.1) — it won't switch under us.
- **Net:** legacy categorization is safe to keep running today. Moving to `personal_finance_category` is now a pure *upside* decision (better data, see §4.3), not a forced fix.

### 4.3 `confidence_level` — **highest-leverage feature for our AI categorizer** ⭐⭐
PFCv2's `personal_finance_category` object has three fields — and the third is the one that maps directly onto how this app already works:

| Field | Meaning |
|-------|---------|
| `primary` | High-level category (broad bucket) |
| `detailed` | Granular category; also usable as a unique category identifier |
| `confidence_level` | Plaid's statistical certainty about the categorization |

**`confidence_level` has exactly five values, with quoted thresholds from Plaid docs:**

| Value | Plaid's definition |
|-------|--------------------|
| `VERY_HIGH` | *"more than 98% confident that this category reflects the intent of the transaction"* |
| `HIGH` | *"more than 90% confident…"* |
| `MEDIUM` | *"moderately confident…"* |
| `LOW` | *"may reflect the intent, but there may be other categories that are more accurate"* |
| `UNKNOWN` | *"we don't know the confidence level for this category"* |

(In the SDK these surface as `transaction.personal_finance_category.confidence_level` — a `string` field; if pinning the **version** via `personal_finance_category_version`, that field is now an **enum** per `41.0.0`, §3.)

#### Why this is a strong fit for *our* pipeline specifically
Our `categorizeForUser.ts` → `categorizeBatch` flow today sends **every** uncategorized transaction through the LLM, passing the legacy `category[]` array as a weak hint, and tags provenance as `lookup | signal | ai`. The code comments repeatedly flag **token cost** as a concern (`GROUND_TRUTH_LIMIT`, "burn tokens", "re-spend tokens forever"). `confidence_level` lets us cut that cost and raise quality at the same time:

1. **Confidence gate → skip the LLM for easy transactions (biggest win).**
   When Plaid returns `VERY_HIGH`/`HIGH`, map `personal_finance_category.detailed` → our canonical category directly and **skip the AI call entirely**. Add a new provenance `categorySource: "plaid"`. Only `MEDIUM` / `LOW` / `UNKNOWN` rows fall through to `categorizeBatch`. On a typical feed the majority of transactions are high-confidence, so this can **remove most LLM calls** — direct token/latency savings on every sync and the monthly report build.

2. **Stronger prompt signal for the rows that *do* hit the model.**
   Replace the legacy `category[]` hint in `CategorizeInput.plaidCategory` with `detailed` + `confidence_level`. A granular PFCv2 label plus "Plaid is only `LOW` confident here" is a much better prior than `["Service","Subscription"]`, and tells the model when to lean on the user's examples/correction map instead.

3. **Prioritize transactions for user review (improves ground truth).**
   Surface `LOW` / `UNKNOWN` rows first in the UI for the user to confirm. Those confirmations feed the existing `categorySource: "user"` ground-truth → `correctionMap`, so the system gets *more* accurate exactly where Plaid is *least* sure. This turns confidence into a targeted active-learning loop instead of asking users to review everything.

4. **Cleaner trust hierarchy.**
   The app already models provenance (`lookup` > `signal` > `ai`). `confidence_level` slots in naturally: `user override` > `lookup` (correction map) > `plaid VERY_HIGH/HIGH` > `ai` (for the ambiguous tail). Each tier is cheaper and more trustworthy than the LLM fallback.

> **Caveat:** the ~98%/~90% figures and PFCv2's accuracy gains are **Plaid self-reported**. Before wiring a hard "skip the LLM" gate, validate against our own corrected ground truth (we already store `categorySource: "user"` rows) — e.g. measure how often `VERY_HIGH`/`HIGH` Plaid categories agree with user corrections on a sample before trusting them blindly.

#### How `confidence_level` interacts with *our custom categories* — and is it "better than the LLM"?
The single most important thing to internalize: **`confidence_level` is Plaid's confidence in *Plaid's own* taxonomy, not in our 12 canonical categories.** Our set (`src/lib/categories.ts`) is app-specific (`Food & Drink`, `Groceries`, `Car`, `Foster`, `Revenue`, …); PFCv2 is Plaid's own ~16-primary taxonomy (`FOOD_AND_DRINK`, `RENT_AND_UTILITIES`, `TRANSPORTATION`, `INCOME`, …). They are **not 1:1**, so adoption requires a deterministic mapping layer `Plaid PFC → CanonicalCategory`, and mapping quality varies a lot:

| Our category | Plaid PFCv2 source | Mapping quality |
|---|---|---|
| Food & Drink | `FOOD_AND_DRINK` *(minus groceries)* | ✅ clean — but needs `detailed` to exclude groceries |
| Groceries | `FOOD_AND_DRINK_GROCERIES` (detailed) | ✅ clean — **only via `detailed`, not `primary`** |
| Bills & Utilities | `RENT_AND_UTILITIES` | ✅ clean |
| Entertainment | `ENTERTAINMENT` | ✅ clean |
| Fees & Adjustments | `BANK_FEES` | ✅ clean |
| Car | `TRANSPORTATION` | 🟡 mostly (Plaid splits out `TRAVEL`) |
| Revenue | `INCOME` / `TRANSFER_IN` | 🟡 needs deposit logic |
| Shopping | `GENERAL_MERCHANDISE` / `HOME_IMPROVEMENT` | 🟡 `GENERAL_MERCHANDISE` is very broad |
| Health & Wellness vs Personal | `MEDICAL` / `PERSONAL_CARE` | 🔴 ambiguous — two of ours, blurred Plaid lines |
| **Foster** | *(none)* | 🔴 **no Plaid equivalent — Plaid can never produce this** |

**The critical trap:** a `VERY_HIGH` confidence on `GENERAL_MERCHANDISE` is still ambiguous in *our* taxonomy (Shopping? Groceries? Others?). Plaid's 98% certainty is that *its* label matches transaction intent — it says nothing about whether *our mapping* picked the right canonical bucket. Confidence only "transfers" to our accuracy where the mapping is **also 1:1**. So the gate condition must be **`confidence ≥ HIGH` AND the Plaid category maps to exactly one canonical category** — never confidence alone.

**Is it better than the LLM?** Neither is strictly better — they're strongest in different places, which is exactly why a confidence *router* beats picking one:

- **Where Plaid + confidence wins (better than the LLM):**
  - *Merchant identification* — Plaid is trained on billions of real transactions + a merchant DB the LLM lacks; it resolves garbled descriptors (`AMZN MKTP US*2X4…`) far more reliably than a general LLM.
  - *High-confidence, clean-mapping categories* (the ✅ rows) — on those, `VERY_HIGH`/`HIGH` is trustworthy, deterministic, free, and instant; strictly better than spending tokens.
- **Where the LLM wins (Plaid can't compete):**
  - *Custom categories* — `Foster` especially: Plaid has no concept of it, so confidence is meaningless; only the LLM + correction map can produce it.
  - *User-specific intent* — our pipeline learns from `categorySource: "user"` ground truth (the user's personal conventions). Plaid is one-size-fits-all and will never know them.
  - *Ambiguous mappings* (🟡/🔴 rows) — the LLM uses amount sign, name, and user examples to disambiguate where the mapping is many-to-one.
- **The authority above both:** the **user correction map** (exact `categorySource: "user"` lookups) is literal user intent and must always win over both Plaid and the LLM.

**Verdict:** don't frame it as "Plaid vs LLM." Use `confidence_level` as a **router** in a trust ladder, not a replacement:

```
1. user correction map (exact match)         → user intent, always wins
2. Plaid HIGH/VERY_HIGH + unambiguous mapping → trust Plaid, SKIP the LLM   ← the savings
3. everything else (LOW/UNKNOWN, ambiguous    → LLM + examples + correction map
   mapping, or custom-only like Foster)
```

So: **for clean-mapping, high-confidence transactions it is better than the LLM (and cheaper); for custom and personal-intent categories it is not — the LLM + our ground truth is irreplaceable.** The win is not replacing the LLM; it's *not paying for it* on the easy majority so we can spend it on the hard tail.

### 4.4 Other available products (not currently used — informational)
- **Statements**, **Signal**, **Enrich** (counterparty/merchant enrichment), and **Layer** are all available on the current SDK. Note: the research **refuted** the claim that standard `/transactions` responses carry a rich `counterparties` array (name/entity_id/logos/IBAN) by default — **do not assume counterparty enrichment without re-verifying** against the Enrich product docs.

---

## 5. Upgrade checklist (the actual work)

The SDK bump itself was small. Status (done 2026-06-20):

1. ✅ **Bumped the dep:** `pnpm add plaid@42.2.0` (this is a **pnpm** project — `npm install` errors on the `.pnpm` store; `react-plaid-link` left at latest `4.1.1`). `package.json` now `"plaid": "^42.2.0"`.
2. ✅ **Typecheck:** `pnpm exec tsc --noEmit` → **exit 0, clean** — we import only stable types (`AccountBase`, `Transaction`, `TransactionBase`, `TransactionStream`, `RemovedTransaction`, `CountryCode`, `Products`, `WebhookType`). The `AccountBase` import is safe (unchanged for `accountsGet`).
3. ✅ **No client change:** `src/lib/plaid/client.ts` and the `Plaid-Version: 2020-09-14` header unchanged.
4. ✅ **Tests:** `pnpm exec vitest run src/lib/ai src/lib/plaid` → **26 passed (5 files)**.
5. ⬜ **Sandbox smoke test (optional, recommended before deploy):** Link token create → public-token exchange → `accountsGet` → `transactionsSync` → recurring → `webhookVerificationKeyGet` + `sandboxItemFireWebhook`. (`scripts/fire-sync-webhook.ts` already exists for this.) Not yet run.

The version upgrade itself is complete; only the optional live sandbox smoke test remains.

**Separately scheduled (optional, higher value):**
6. Confirm Transactions enablement date (§4.2) and decide on PFCv2 adoption (§4.1).
7. If adopting PFCv2: pass the **enum** `personal_finance_category_version` (per `41.0.0`), read `personal_finance_category.{primary,detailed,confidence_level}`, and migrate the ~12 `category[]` read sites + the AI categorization layer. This is a feature project, not a dependency bump.

---

## 6. Open questions (carry-overs to confirm before the PFC work)
1. ~~What is this app's Plaid Transactions enablement date?~~ **Resolved: enabled 2024 → pre-cutoff. Legacy `category[]` retained; defaults to PFCv1; PFCv2 is opt-in.** (§4.2)
2. **Validate Plaid confidence vs. our ground truth** before trusting a "skip the LLM on `VERY_HIGH`/`HIGH`" gate — measure agreement against stored `categorySource: "user"` corrections. (§4.3)
3. **Scope of the PFCv2 + confidence migration** — touches `categorize.ts`/`categorizeForUser.ts` (new `plaid` provenance + confidence gate), the ~12 `category[]` read sites, reports, insights, and alerts; size it as its own ticket.

---

## 7. Recommendation

| Decision | Verdict |
|----------|---------|
| **Bump `plaid` 38 → 42.2.0** | ✅ **Yes — low-risk, do it.** Central client, no API-surface breaking changes, header unchanged, types stable. A `package.json` bump + typecheck + sandbox smoke test. |
| **Change `Plaid-Version` header** | ❌ **No.** `2020-09-14` is the latest dated version and what the SDK targets. |
| **Bump `react-plaid-link`** | ❌ **No.** Already on latest `4.1.1`. |
| **Migrate legacy `category[]` → `personal_finance_category` / PFCv2 + `confidence_level`** | 🟡 **Worth doing, schedule separately.** Highest-value item here — especially the `confidence_level` gate that can cut most LLM calls (§4.3). It's a feature migration, not part of the SDK bump. Enablement date confirmed (2024) → legacy fields safe, so this is upside-only and can be done on our timeline. Validate Plaid confidence against our ground truth before trusting a hard skip-the-LLM gate. |

---

### Sources (all primary, current as of June 2026)
- plaid-node CHANGELOG — https://github.com/plaid/plaid-node/blob/master/CHANGELOG.md
- plaid-node README (API version support) — https://github.com/plaid/plaid-node/blob/master/README.md
- Context7 `/plaid/plaid-node` (SDK 42.2.0, OAS 2020-09-14)
- Plaid API versioning — https://plaid.com/docs/api/versioning/
- PFCv2 migration — https://plaid.com/docs/transactions/pfc-migration/
- AI-enhanced categorization (PFCv2) — https://plaid.com/blog/ai-enhanced-transaction-categorization/
- `/transactions/sync` migration — https://plaid.com/docs/transactions/sync-migration/
- Transactions API — https://plaid.com/docs/api/products/transactions/
- Plaid changelog (legacy category removal) — https://plaid.com/docs/changelog/
- npm `plaid` versions — https://www.npmjs.com/package/plaid?activeTab=versions
