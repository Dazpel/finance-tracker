# Correction-Aware, Stable Categorization — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Make transaction categorization deterministic per-merchant by learning from genuine user corrections, fix the inverted revenue sign gate, and reduce LLM drift.

**Architecture:** A new pure `correction-lookup` module builds a per-user `merchant→category` map from ground-truth corrections; `categorizeBatch` consults it before the deterministic signal pre-filter and the LLM. Few-shot examples are class-balanced and frozen. A `categorySource` provenance flag distinguishes human truth from AI guesses. The amount-sign gate is corrected to match storage/UI/mobile convention.

**Tech Stack:** Next.js, Prisma (Postgres), Vercel AI SDK (`ai` + `@ai-sdk/openai`), zod, vitest (new, dev-only).

## Global Constraints

- **Storage sign convention (Plaid):** expenses POSITIVE, revenue/deposits NEGATIVE. Money-in ⇔ `amount < 0`. Verified across `syncTransactions.ts:34`, `draftReport.ts:140-141`, `prismaFunctions.ts:692-698`, web UI, and `finance-tracker-mobile` (`TransactionItem.tsx:21` `isIncome = amount < 0`). Do NOT change any UI/API/mobile code.
- **Canonical categories:** the 12 in `src/lib/categories.ts` (`CANONICAL_CATEGORIES`). `isCanonicalCategory` validates.
- **Ground truth = actively chosen only:** `SyncedTransaction.categorySource = 'user'` OR `Transaction.account_id = LOCAL_ACCOUNT_ID` (`"new_transaction"`). Passively-approved AI rows are excluded.
- **No git commits** — the repo owner commits. Commit steps below are documentation only; do not execute them.
- **Separation of concerns:** new code split into `types.ts` / `constants.ts` / function files; never one blob.
- **Determinism:** all new map/example logic must be deterministic given the same input set.

---

### Task 1: Test harness (vitest, dev-only)

**Files:**
- Modify: `package.json` (devDeps + `test` script)
- Create: `vitest.config.ts`

- [ ] **Step 1:** `npm install -D vitest vite-tsconfig-paths`
- [ ] **Step 2:** Create `vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: { include: ["src/**/*.test.ts"], environment: "node" },
});
```

- [ ] **Step 3:** Add to `package.json` scripts: `"test": "vitest run"`, `"test:watch": "vitest"`.
- [ ] **Step 4:** Verify: `npm test` → exits 0 with "No test files found" (or runs none).
- [ ] **Step 5 (commit — DO NOT RUN):** `git add package.json package-lock.json vitest.config.ts`

---

### Task 2: Correction-lookup module — keys & normalization

**Files:**
- Create: `src/lib/ai/correction-lookup/types.ts`
- Create: `src/lib/ai/correction-lookup/constants.ts`
- Create: `src/lib/ai/correction-lookup/keys.ts`
- Test: `src/lib/ai/correction-lookup/keys.test.ts`

**Interfaces produced:**
- `type Flow = "in" | "out"`
- `flowOf(amount: number | null | undefined): Flow`
- `normalizeMerchant(merchantName, name): string`
- `makeCorrectionKey({merchantName?, name?, amount?}): string | null`
- `const GENERIC_MERCHANT: RegExp`

- [ ] **Step 1: Write failing tests** `keys.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { flowOf, normalizeMerchant, makeCorrectionKey } from "./keys";

describe("flowOf", () => {
  it("treats negative as inflow (money in)", () => {
    expect(flowOf(-100)).toBe("in");
  });
  it("treats positive as outflow (expense)", () => {
    expect(flowOf(25)).toBe("out");
  });
  it("treats zero/null as outflow", () => {
    expect(flowOf(0)).toBe("out");
    expect(flowOf(null)).toBe("out");
  });
});

describe("normalizeMerchant", () => {
  it("prefers merchant_name, lowercased + trimmed", () => {
    expect(normalizeMerchant("  Whole Foods ", "WF STORE 123")).toBe("whole foods");
  });
  it("falls back to name when merchant missing", () => {
    expect(normalizeMerchant(null, "  Shell Oil ")).toBe("shell oil");
  });
});

describe("makeCorrectionKey", () => {
  it("combines merchant and flow", () => {
    expect(makeCorrectionKey({ merchantName: "Stripe", name: "x", amount: -500 })).toBe("stripe|in");
    expect(makeCorrectionKey({ merchantName: "Stripe", name: "x", amount: 5 })).toBe("stripe|out");
  });
  it("returns null for empty merchant", () => {
    expect(makeCorrectionKey({ merchantName: "", name: "", amount: -1 })).toBeNull();
  });
  it("returns null for generic merchants", () => {
    expect(makeCorrectionKey({ merchantName: "POS DEBIT", name: "x", amount: -1 })).toBeNull();
  });
});
```

- [ ] **Step 2:** Run `npx vitest run src/lib/ai/correction-lookup/keys.test.ts` → FAIL (module missing).
- [ ] **Step 3:** Create `types.ts`:

```ts
import type { CanonicalCategory } from "@lib/categories";

export type Flow = "in" | "out";

export type GroundTruthRow = {
  merchantName: string | null;
  name: string;
  amount: number | null;
  category: CanonicalCategory;
  createdAt: Date; // recency tiebreaker
};

export type CorrectionMap = Map<string, CanonicalCategory>;
```

- [ ] **Step 4:** Create `constants.ts`:

```ts
// Merchant prefixes too generic to learn a stable category from. Mirrors the
// guard used in categorize.ts; centralized here so both consult one source.
export const GENERIC_MERCHANT = /^(sq|pos|payment|transfer|refund)/i;
```

- [ ] **Step 5:** Create `keys.ts`:

```ts
import type { Flow } from "./types";
import { GENERIC_MERCHANT } from "./constants";

// Stored Plaid convention: expenses positive, revenue/deposits NEGATIVE.
// Money in (inflow) ⇔ amount < 0. Matches UI, reports, and mobile.
export function flowOf(amount: number | null | undefined): Flow {
  return typeof amount === "number" && amount < 0 ? "in" : "out";
}

export function normalizeMerchant(
  merchantName: string | null | undefined,
  name: string | null | undefined,
): string {
  return (merchantName?.trim() || name?.trim() || "").toLowerCase();
}

export function makeCorrectionKey(input: {
  merchantName?: string | null;
  name?: string | null;
  amount?: number | null;
}): string | null {
  const merchant = normalizeMerchant(input.merchantName, input.name);
  if (!merchant) return null;
  if (GENERIC_MERCHANT.test(merchant)) return null;
  return `${merchant}|${flowOf(input.amount)}`;
}
```

- [ ] **Step 6:** Run tests → PASS.
- [ ] **Step 7 (commit — DO NOT RUN):** add the four files.

---

### Task 3: Correction-lookup module — buildCorrectionMap

**Files:**
- Create: `src/lib/ai/correction-lookup/buildCorrectionMap.ts`
- Create: `src/lib/ai/correction-lookup/index.ts`
- Test: `src/lib/ai/correction-lookup/buildCorrectionMap.test.ts`

**Interfaces produced:** `buildCorrectionMap(rows: GroundTruthRow[]): CorrectionMap`

- [ ] **Step 1: Write failing tests:**

```ts
import { describe, it, expect } from "vitest";
import { buildCorrectionMap } from "./buildCorrectionMap";
import type { GroundTruthRow } from "./types";

const row = (o: Partial<GroundTruthRow>): GroundTruthRow => ({
  merchantName: "Acme", name: "Acme", amount: -100, category: "Revenue",
  createdAt: new Date("2026-01-01"), ...o,
});

describe("buildCorrectionMap", () => {
  it("maps a single correction by merchant|flow", () => {
    const m = buildCorrectionMap([row({})]);
    expect(m.get("acme|in")).toBe("Revenue");
  });
  it("keeps inflow and outflow of same merchant separate", () => {
    const m = buildCorrectionMap([
      row({ amount: -100, category: "Revenue" }),
      row({ amount: 100, category: "Fees & Adjustments" }),
    ]);
    expect(m.get("acme|in")).toBe("Revenue");
    expect(m.get("acme|out")).toBe("Fees & Adjustments");
  });
  it("majority vote wins conflicts", () => {
    const m = buildCorrectionMap([
      row({ category: "Revenue" }),
      row({ category: "Revenue" }),
      row({ category: "Others" }),
    ]);
    expect(m.get("acme|in")).toBe("Revenue");
  });
  it("most-recent breaks ties", () => {
    const m = buildCorrectionMap([
      row({ category: "Others", createdAt: new Date("2026-01-01") }),
      row({ category: "Revenue", createdAt: new Date("2026-05-01") }),
    ]);
    expect(m.get("acme|in")).toBe("Revenue");
  });
  it("skips generic merchants", () => {
    const m = buildCorrectionMap([row({ merchantName: "POS 123", name: "POS 123" })]);
    expect(m.size).toBe(0);
  });
});
```

- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Create `buildCorrectionMap.ts`:

```ts
import type { CanonicalCategory } from "@lib/categories";
import type { CorrectionMap, GroundTruthRow } from "./types";
import { makeCorrectionKey } from "./keys";

// Deterministic merchant→category map from user-corrected ground truth.
// Conflicts: majority vote; ties → most recent; final tie → lexicographic.
export function buildCorrectionMap(rows: GroundTruthRow[]): CorrectionMap {
  const tally = new Map<
    string,
    Map<CanonicalCategory, { count: number; latest: number }>
  >();

  for (const row of rows) {
    const key = makeCorrectionKey(row);
    if (!key) continue;
    const byCat = tally.get(key) ?? new Map<CanonicalCategory, { count: number; latest: number }>();
    const ts = row.createdAt.getTime();
    const cur = byCat.get(row.category) ?? { count: 0, latest: 0 };
    cur.count += 1;
    if (ts > cur.latest) cur.latest = ts;
    byCat.set(row.category, cur);
    tally.set(key, byCat);
  }

  const map: CorrectionMap = new Map();
  for (const [key, byCat] of tally) {
    let best: CanonicalCategory | null = null;
    let bestCount = -1;
    let bestLatest = -1;
    for (const [cat, { count, latest }] of byCat) {
      const better =
        count > bestCount ||
        (count === bestCount && latest > bestLatest) ||
        (count === bestCount && latest === bestLatest && (best === null || cat < best));
      if (better) {
        best = cat;
        bestCount = count;
        bestLatest = latest;
      }
    }
    if (best) map.set(key, best);
  }
  return map;
}
```

- [ ] **Step 4:** Create `index.ts`:

```ts
export * from "./types";
export * from "./keys";
export * from "./buildCorrectionMap";
```

- [ ] **Step 5:** Run → PASS.
- [ ] **Step 6 (commit — DO NOT RUN).**

---

### Task 4: Balanced, frozen few-shot selection

**Files:**
- Create: `src/lib/ai/exampleSelection.ts`
- Test: `src/lib/ai/exampleSelection.test.ts`

**Interfaces consumed:** `CategorizeExample` from `@lib/ai/categorize`, `CANONICAL_CATEGORIES`.
**Interfaces produced:** `selectBalancedExamples(userExamples, fallback, opts): CategorizeExample[]` where `opts = { minUser: number; max: number; perCategoryCap: number }`.

- [ ] **Step 1: Write failing tests:**

```ts
import { describe, it, expect } from "vitest";
import { selectBalancedExamples } from "./exampleSelection";
import type { CategorizeExample } from "./categorize";

const ex = (name: string, category: CategorizeExample["category"]): CategorizeExample => ({ name, category });

describe("selectBalancedExamples", () => {
  it("caps examples per category", () => {
    const user = [ex("a", "Revenue"), ex("b", "Revenue"), ex("c", "Revenue"), ex("d", "Groceries")];
    const out = selectBalancedExamples(user, [], { minUser: 1, max: 30, perCategoryCap: 2 });
    expect(out.filter((e) => e.category === "Revenue").length).toBe(2);
    expect(out.filter((e) => e.category === "Groceries").length).toBe(1);
  });
  it("is deterministic regardless of input order", () => {
    const a = [ex("z", "Groceries"), ex("a", "Revenue")];
    const b = [ex("a", "Revenue"), ex("z", "Groceries")];
    const optsP = { minUser: 1, max: 30, perCategoryCap: 5 };
    expect(selectBalancedExamples(a, [], optsP)).toEqual(selectBalancedExamples(b, [], optsP));
  });
  it("appends fallback when below minUser", () => {
    const user = [ex("a", "Revenue")];
    const fb = [ex("Whole Foods", "Groceries")];
    const out = selectBalancedExamples(user, fb, { minUser: 5, max: 30, perCategoryCap: 5 });
    expect(out.some((e) => e.name === "Whole Foods")).toBe(true);
  });
  it("does not append fallback when at/above minUser", () => {
    const user = [ex("a", "Revenue"), ex("b", "Groceries")];
    const fb = [ex("Whole Foods", "Groceries")];
    const out = selectBalancedExamples(user, fb, { minUser: 2, max: 30, perCategoryCap: 5 });
    expect(out.some((e) => e.name === "Whole Foods")).toBe(false);
  });
  it("caps total at max", () => {
    const user = Array.from({ length: 50 }, (_, i) => ex(`m${i}`, "Shopping"));
    const out = selectBalancedExamples(user, [], { minUser: 1, max: 10, perCategoryCap: 100 });
    expect(out.length).toBe(10);
  });
});
```

- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Create `exampleSelection.ts`:

```ts
import type { CategorizeExample } from "@lib/ai/categorize";
import { CANONICAL_CATEGORIES } from "@lib/categories";

const catIndex = (c: CategorizeExample["category"]): number =>
  CANONICAL_CATEGORIES.indexOf(c);

// Deterministic order: by canonical-category position, then name.
function sortDeterministic(examples: CategorizeExample[]): CategorizeExample[] {
  return [...examples].sort((a, b) => {
    const d = catIndex(a.category) - catIndex(b.category);
    return d !== 0 ? d : a.name.localeCompare(b.name);
  });
}

function capPerCategory(examples: CategorizeExample[], cap: number): CategorizeExample[] {
  const counts = new Map<string, number>();
  const out: CategorizeExample[] = [];
  for (const e of sortDeterministic(examples)) {
    const n = counts.get(e.category) ?? 0;
    if (n >= cap) continue;
    counts.set(e.category, n + 1);
    out.push(e);
  }
  return out;
}

// Class-balanced, frozen-order few-shot selection. A shifting/imbalanced
// example set is a primary cause of label drift, so order and balance are
// deterministic. Fallback is appended only when the user has too few.
export function selectBalancedExamples(
  userExamples: CategorizeExample[],
  fallback: CategorizeExample[],
  opts: { minUser: number; max: number; perCategoryCap: number },
): CategorizeExample[] {
  const capped = capPerCategory(userExamples, opts.perCategoryCap);
  const base =
    capped.length >= opts.minUser
      ? capped
      : [...capped, ...sortDeterministic(fallback)];
  return base.slice(0, opts.max);
}
```

- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5 (commit — DO NOT RUN).**

---

### Task 5: Schema — `categorySource` provenance flag

**Files:**
- Modify: `prisma/schema.prisma` (`SyncedTransaction` + new enum)
- Create: `prisma/migrations/20260618120000_add_category_source/migration.sql`

- [ ] **Step 1:** Add enum near other enums in `schema.prisma`:

```prisma
enum CategorySource {
  user   // manual human correction (ground truth)
  lookup // applied deterministically from the learned correction map
  signal // detectStrongSignal deterministic rule
  ai     // LLM
}
```

- [ ] **Step 2:** Add column to `SyncedTransaction` (after `userCategoryOverride`):

```prisma
  categorySource         CategorySource?
```

- [ ] **Step 3:** Create `migration.sql`:

```sql
-- CreateEnum
CREATE TYPE "CategorySource" AS ENUM ('user', 'lookup', 'signal', 'ai');

-- AlterTable
ALTER TABLE "SyncedTransaction" ADD COLUMN "categorySource" "CategorySource";
-- Existing rows left NULL: legacy userCategoryOverride mixes AI + user with no
-- reliable way to split retroactively. Source accrues going forward.
```

- [ ] **Step 4:** `npx prisma generate` → succeeds; `Prisma.SyncedTransactionUpdateInput` now has `categorySource`.
- [ ] **Step 5:** `npx tsc --noEmit` → no new errors from the schema change.
- [ ] **Step 6 (commit — DO NOT RUN).**

---

### Task 6: Fix inverted revenue sign gate in `categorize.ts`

**Files:**
- Modify: `src/lib/ai/categorize.ts`

**Rationale:** stored revenue is NEGATIVE; `isInflow = amount > 0` is backwards.

- [ ] **Step 1: Write failing test** `src/lib/ai/categorize.signal.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { detectStrongSignal } from "./categorize";

describe("detectStrongSignal revenue gate (stored: revenue negative)", () => {
  it("payroll DEPOSIT (negative amount) is Revenue", () => {
    expect(detectStrongSignal({ name: "ACME Payroll", plaidCategory: ["Transfer", "Payroll"], amount: -2000, merchantName: null })).toBe("Revenue");
  });
  it("vendor expense named payroll (positive amount) is NOT Revenue", () => {
    expect(detectStrongSignal({ name: "Gusto Subscription", plaidCategory: ["Service", "Subscription"], amount: 40, merchantName: "Gusto" })).not.toBe("Revenue");
  });
  it("transfer-root inflow (negative) is Revenue", () => {
    expect(detectStrongSignal({ name: "Zelle From X", plaidCategory: ["Transfer"], amount: -150, merchantName: null })).toBe("Revenue");
  });
});
```

- [ ] **Step 2:** Run → FAIL (current code uses `amount > 0`).
- [ ] **Step 3:** Change line 146 from `t.amount > 0` to `t.amount < 0`:

```ts
  const isInflow = typeof t.amount === "number" && t.amount < 0;
```

- [ ] **Step 4:** Update the convention comments (lines ~11 and ~119-135) to state the corrected convention (expenses positive, revenue/deposits NEGATIVE; money in ⇔ amount < 0), and reference `draftReport.ts:140`.
- [ ] **Step 5:** Update the system-prompt text so the model's rule matches storage. Replace every "amount > 0"/"amount <= 0"/positive-negative phrasing in the FLOW DETECTION and HARD NEGATIVE sections:
  - "Revenue requires amount > 0" → "Revenue requires amount < 0 (money in)."
  - "amount <= 0 means outflow … NEVER return Revenue" → "amount >= 0 means outflow … NEVER return Revenue."
  - "When amount > 0, classify as Revenue and STOP if ANY…" → "When amount < 0, classify as Revenue and STOP if ANY…".
  - HARD NEGATIVE "Revenue requires amount > 0. A negative-amount row is NEVER Revenue…" → "Revenue requires amount < 0. A positive-amount (or zero) row is NEVER Revenue…".
- [ ] **Step 6:** Run the signal test → PASS. Run full suite → PASS.
- [ ] **Step 7 (commit — DO NOT RUN):** isolated commit `fix: correct inverted revenue amount gate in AI categorization`.

---

### Task 7: Wire lookup + provenance + seed into `categorizeBatch`

**Files:**
- Modify: `src/lib/ai/categorize.ts`

**Interfaces produced:**
- `type CategorizeSource = "lookup" | "signal" | "ai"`
- `type CategorizeResult = { category: CanonicalCategory; source: CategorizeSource }`
- `categorizeBatch(transactions, userExamples, correctionMap?): Promise<Map<string, CategorizeResult>>`
- Export `FALLBACK_EXAMPLES`, `MIN_USER_EXAMPLES`, `MAX_USER_EXAMPLES`.

- [ ] **Step 1: Write failing test** `src/lib/ai/categorize.batch.test.ts` (lookup + signal, no LLM call):

```ts
import { describe, it, expect } from "vitest";
import { categorizeBatch } from "./categorize";

describe("categorizeBatch precedence (no LLM)", () => {
  it("correction map wins, tagged 'lookup'", async () => {
    const map = new Map([["stripe|in", "Revenue" as const]]);
    const out = await categorizeBatch(
      [{ id: "1", name: "Stripe", merchantName: "Stripe", plaidCategory: ["Service"], amount: -500 }],
      [], map,
    );
    expect(out.get("1")).toEqual({ category: "Revenue", source: "lookup" });
  });
  it("falls back to deterministic signal, tagged 'signal'", async () => {
    const out = await categorizeBatch(
      [{ id: "2", name: "Shell", merchantName: "Shell", plaidCategory: ["Travel", "Gas Stations"], amount: 40 }],
      [], new Map(),
    );
    expect(out.get("2")).toEqual({ category: "Car", source: "signal" });
  });
});
```

- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Add types/exports; add `const CATEGORIZE_SEED = 7;`. Change `categorizeBatch` signature to accept `correctionMap?: CorrectionMap` and return `Map<string, CategorizeResult>`. In the pre-filter loop, consult the map first:

```ts
for (const t of transactions) {
  if (correctionMap) {
    const key = makeCorrectionKey(t);
    const hit = key ? correctionMap.get(key) : undefined;
    if (hit) { out.set(t.id, { category: hit, source: "lookup" }); continue; }
  }
  const signal = detectStrongSignal(t);
  if (signal) { out.set(t.id, { category: signal, source: "signal" }); continue; }
  residual.push(t);
}
```

  Import `makeCorrectionKey` and `CorrectionMap` from `./correction-lookup`. Remove the local `GENERIC_MERCHANT` const and import it from `./correction-lookup/constants` (single source). Add `seed: CATEGORIZE_SEED` to the `generateText` call (keep `temperature: 0`, no `topP`). Set LLM results as `{ category: r.category, source: "ai" }`. Remove the internal fallback-example block (selection now happens upstream in Task 8) — `examples` is just `userExamples.slice(0, MAX_USER_EXAMPLES)`.
- [ ] **Step 4:** Run batch test + full suite → PASS.
- [ ] **Step 5:** `npx tsc --noEmit` → the return-type change surfaces a type error at the `categorizeForUser` call site (fixed in Task 8). That is expected.
- [ ] **Step 6 (commit — DO NOT RUN) after Task 8 compiles.**

---

### Task 8: Build ground truth + balanced examples in `categorizeForUser`

**Files:**
- Modify: `src/lib/ai/categorizeForUser.ts`

**Interfaces consumed:** `buildCorrectionMap`, `GroundTruthRow` from `@lib/ai/correction-lookup`; `selectBalancedExamples` from `@lib/ai/exampleSelection`; `CategorizeResult`, `FALLBACK_EXAMPLES`, `MIN_USER_EXAMPLES`, `MAX_USER_EXAMPLES` from `@lib/ai/categorize`; `LOCAL_ACCOUNT_ID` from `utils/constants`.

- [ ] **Step 1:** Add a `PER_CATEGORY_CAP = 6` constant.
- [ ] **Step 2:** Replace the `history`/`userExamples` block (lines ~55-69) with two ground-truth queries:

```ts
const [syncedCorrections, manualTxns] = await Promise.all([
  prisma.syncedTransaction.findMany({
    where: { userId, categorySource: "user", userSoftDeleted: false },
    orderBy: { createdAt: "desc" },
    take: 500,
    select: { merchant_name: true, name: true, amount: true, userCategoryOverride: true, createdAt: true },
  }),
  prisma.transaction.findMany({
    where: { userId, account_id: LOCAL_ACCOUNT_ID },
    orderBy: { createdAt: "desc" },
    take: 500,
    select: { name: true, amount: true, category: true, createdAt: true },
  }),
]);

const groundTruth: GroundTruthRow[] = [
  ...syncedCorrections.flatMap((r) =>
    r.userCategoryOverride && isCanonicalCategory(r.userCategoryOverride)
      ? [{ merchantName: r.merchant_name, name: r.name, amount: r.amount, category: r.userCategoryOverride, createdAt: r.createdAt }]
      : []),
  ...manualTxns.flatMap((r) => {
    const label = r.category[0];
    return label && isCanonicalCategory(label)
      ? [{ merchantName: null, name: r.name, amount: r.amount, category: label, createdAt: r.createdAt }]
      : [];
  }),
];

const correctionMap = buildCorrectionMap(groundTruth);

const userExamples: CategorizeExample[] = groundTruth.map((g) => ({
  name: g.name,
  category: g.category,
}));

const examples = selectBalancedExamples(userExamples, FALLBACK_EXAMPLES, {
  minUser: MIN_USER_EXAMPLES,
  max: MAX_USER_EXAMPLES,
  perCategoryCap: PER_CATEGORY_CAP,
});
```

- [ ] **Step 3:** Pass `examples` and `correctionMap` to `categorizeBatch(inputs, examples, correctionMap)`.
- [ ] **Step 4:** Update result handling: `assignments` is now `Map<string, CategorizeResult>`. Group by `(category, source)` for write-back. Omitted ids fall back to `{ category: "Others", source: "ai" }`:

```ts
const byCatSource = new Map<string, { category: CanonicalCategory; source: CategorizeResult["source"]; ids: string[] }>();
for (const r of chunk) {
  const res = assignments.get(r.id) ?? { category: "Others" as const, source: "ai" as const };
  const k = `${res.category}|${res.source}`;
  const entry = byCatSource.get(k) ?? { category: res.category, source: res.source, ids: [] };
  entry.ids.push(r.id);
  byCatSource.set(k, entry);
}
for (const { category, source, ids } of byCatSource.values()) {
  const { count } = await prisma.syncedTransaction.updateMany({
    where: { id: { in: ids } },
    data: { userCategoryOverride: category, categorySource: source },
  });
  totalUpdated += count;
  if (count < ids.length) totalFailed += ids.length - count;
}
```

- [ ] **Step 5:** Remove now-unused imports (`type CategorizeExample` stays; drop nothing else unused). `npx tsc --noEmit` → clean.
- [ ] **Step 6:** Run full suite → PASS.
- [ ] **Step 7 (commit — DO NOT RUN).**

---

### Task 9: Tag user corrections with `categorySource: 'user'` in both write paths

**Files:**
- Modify: `src/app/api/mobile/transactions/synced/[id]/route.ts`
- Modify: `src/app/api/prisma/synced-transactions/[id]/route.ts`

- [ ] **Step 1 (mobile route ~L69):** when applying the category override, also set source:

```ts
if (v.userCategoryOverride !== undefined) {
  data.userCategoryOverride = v.userCategoryOverride;
  data.categorySource = v.userCategoryOverride === null ? null : "user";
}
```

- [ ] **Step 2 (web route):** import `{ Prisma }` from `@prisma/client`; type `const data: Prisma.SyncedTransactionUpdateInput = {};`. Then:

```ts
if (body.userCategoryOverride !== undefined) {
  data.userCategoryOverride = body.userCategoryOverride;
  data.categorySource = body.userCategoryOverride === null ? null : "user";
}
```

- [ ] **Step 3:** `npx tsc --noEmit` → clean.
- [ ] **Step 4 (commit — DO NOT RUN).**

---

### Task 10: Full verification

- [ ] **Step 1:** `npm test` → all green.
- [ ] **Step 2:** `npx tsc --noEmit` → clean.
- [ ] **Step 3:** `npm run lint` → no new errors in touched files.
- [ ] **Step 4:** Manual sanity (documented, not automated): a payroll deposit (negative amount) now resolves Revenue via `signal`; a corrected merchant resolves via `lookup` on the next run.
- [ ] **Step 5:** Report results to the owner for commit + `prisma migrate` application.

## Self-Review (spec coverage)

- Provenance flag → Task 5, 9 (write paths), 8 (AI path). ✅
- Two ground-truth sources, passive-AI excluded → Task 8 queries. ✅
- Deterministic lookup, precedence lookup→signal→LLM → Task 7. ✅
- Balanced/frozen few-shot → Task 4, 8. ✅
- `seed`, temp 0, no topP → Task 7. ✅
- NULL backfill → Task 5. ✅
- Sign-convention fix (resolved as inverted) → Task 6. ✅
- No UI/API/mobile changes → respected. ✅
