# Category Detail Page + Threshold Progress + Notification Deep-Linking — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the mobile app's category detail page to a real per-category transactions endpoint, add threshold-progress visualization to home cards and the detail hero, and route notification taps to the corresponding category page.

**Architecture:** New web endpoint `GET /api/mobile/category-transactions` reuses `resolveCategory` / `resolveAmount` from `src/lib/reports/draftReport.ts` so the per-category list matches what the home `Report` totals were computed from. Mobile gains pure helpers in `lib/threshold/` (visual-state derivation) and `lib/notification/` (deep-link parser). `usePushNotifications` learns cold-start + warm-app routing via `expo-router`. Code is organized by concern — separate `types.ts` / `constants.ts` / pure-function files in domain folders.

**Tech Stack:** Web — Next.js 16 + Prisma + Zod + `requireMobileUser`. Mobile — Expo SDK 55, expo-router v7, expo-notifications v55, TanStack Query, NativeWind 4.

**Spec:** `docs/superpowers/specs/2026-05-03-category-detail-threshold-and-deeplink-design.md`

**Repos touched:** two — `finance-tracker` (web, this repo) and `finance-tracker-mobile` (sibling at `../finance-tracker-mobile`). Each task is annotated with its working directory.

---

## File structure

**New files — web (`finance-tracker`):**

```
src/app/api/mobile/category-transactions/
  route.ts                              # handler — auth gate, parse, query, serialize
  _utils/
    constants.ts                        # CATEGORY_KEY_TO_CANONICAL_NAME map
    schemas.ts                          # Zod QuerySchema
    filter.ts                           # filterAndResolve(rows, canonicalName) (pure)
    serialize.ts                        # serializeTransaction(row) (pure)

scripts/
  test-category-transactions.ts         # endpoint smoke test against a real userId
```

**New files — mobile (`finance-tracker-mobile`):**

```
lib/threshold/
  types.ts                              # ThresholdLevel, ThresholdState
  constants.ts                          # COLOR_WARNING, COLOR_REACHED, COLOR_OVER
  deriveState.ts                        # deriveThresholdState (pure)
  index.ts                              # re-exports

lib/notification/
  types.ts                              # AlertNotificationData, ParsedDeepLink, NotificationLevel
  parseDeepLink.ts                      # parseAlertNotification (pure)
  index.ts                              # re-exports

lib/monthKey.ts                         # currentMonthKey()

scripts/
  test-threshold-state.ts               # asserts deriveThresholdState boundaries
  test-parse-deeplink.ts                # asserts parseAlertNotification cases
```

**Edited files — mobile:**

```
services/api.ts                         # + fetchCategoryTransactions
types/index.ts                          # + CategoryTransaction, CategoryTransactionsResponse;
                                        #   remove legacy Transaction; drop transactionCount from CategoryData
lib/categories.ts                       # drop transactionCount from deriveCategoryData
components/CategoryCard.tsx             # threshold UI, drop count subtitle, drop /500 bar, re-enable navigation
components/TransactionItem.tsx          # accept CategoryTransaction; optional Pending badge
app/(app)/category/[id].tsx             # rewrite — real fetcher, hero card, threshold treatment
hooks/usePushNotifications.ts           # cold-start handler + real response listener via parseAlertNotification
```

**Deleted files — mobile:**

```
services/mockData.ts
```

---

## Prerequisites

None — `requireMobileUser`, `displayNameToKey`, `resolveCategory`, `resolveAmount`, and the existing `services/api.ts` infrastructure are all already in place from prior PRs (`#36`, `#37`, and the in-flight mobile-home-refactor work).

The mobile repo does not have a test framework. Pure functions are verified via `pnpm dlx tsx scripts/<name>.ts` in each repo. This is the same pattern used by `finance-tracker/scripts/test-threshold-check-april.ts`.

---

## Task 1: Web — endpoint constants

**Working dir:** `finance-tracker`

**Files:**
- Create: `src/app/api/mobile/category-transactions/_utils/constants.ts`

- [ ] **Step 1: Write the file**

```ts
// Maps mobile-side CategoryKey values to the canonical Title-Case category
// name returned by resolveCategory (in src/lib/reports/draftReport.ts).
// Single source of truth for the key↔display mapping in this endpoint —
// the wider web app uses display names directly in normalizeCategory.
export const CATEGORY_KEY_TO_CANONICAL_NAME = {
  foodAndDrink: "Food & Drink",
  billsAndUtilities: "Bills & Utilities",
  car: "Car",
  entertainment: "Entertainment",
  groceries: "Groceries",
  healthAndWellness: "Health & Wellness",
  personal: "Personal",
  shopping: "Shopping",
  feesAndAdjustments: "Fees & Adjustments",
  others: "Others",
  foster: "Foster",
  revenue: "Revenue",
} as const;

export type CategoryKey = keyof typeof CATEGORY_KEY_TO_CANONICAL_NAME;
```

- [ ] **Step 2: Type-check**

Run: `pnpm tsc --noEmit`
Expected: zero errors related to this file.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/mobile/category-transactions/_utils/constants.ts
git commit -m "feat(web): add CATEGORY_KEY_TO_CANONICAL_NAME for mobile category endpoint"
```

---

## Task 2: Web — endpoint Zod schema

**Working dir:** `finance-tracker`

**Files:**
- Create: `src/app/api/mobile/category-transactions/_utils/schemas.ts`

- [ ] **Step 1: Write the file**

```ts
import { z } from "zod";
import { CATEGORY_KEY_TO_CANONICAL_NAME } from "./constants";

const CATEGORY_KEYS = Object.keys(CATEGORY_KEY_TO_CANONICAL_NAME) as [
  keyof typeof CATEGORY_KEY_TO_CANONICAL_NAME,
  ...Array<keyof typeof CATEGORY_KEY_TO_CANONICAL_NAME>
];

export const QuerySchema = z.object({
  key: z.enum(CATEGORY_KEYS),
  monthKey: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "monthKey must match YYYY-MM"),
});

export type Query = z.infer<typeof QuerySchema>;
```

- [ ] **Step 2: Type-check**

Run: `pnpm tsc --noEmit`
Expected: zero errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/mobile/category-transactions/_utils/schemas.ts
git commit -m "feat(web): add QuerySchema for /api/mobile/category-transactions"
```

---

## Task 3: Web — pure filter helper

**Working dir:** `finance-tracker`

**Files:**
- Create: `src/app/api/mobile/category-transactions/_utils/filter.ts`

- [ ] **Step 1: Write the file**

```ts
import type { SyncedTransaction } from "@prisma/client";
import { resolveCategory } from "@lib/reports/draftReport";

// Mirrors the per-row filtering done by computeReportTotals so the per-category
// transaction list matches what the home Report totals were computed from:
//   - Skip userSoftDeleted rows.
//   - Resolve effective category via resolveCategory (respects userCategoryOverride).
export function filterAndResolve(
  rows: SyncedTransaction[],
  canonicalCategoryName: string
): SyncedTransaction[] {
  return rows.filter((t) => {
    if (t.userSoftDeleted) return false;
    return resolveCategory(t) === canonicalCategoryName;
  });
}
```

- [ ] **Step 2: Type-check**

Run: `pnpm tsc --noEmit`
Expected: zero errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/mobile/category-transactions/_utils/filter.ts
git commit -m "feat(web): add filterAndResolve pure helper for mobile category endpoint"
```

---

## Task 4: Web — pure serializer

**Working dir:** `finance-tracker`

**Files:**
- Create: `src/app/api/mobile/category-transactions/_utils/serialize.ts`

- [ ] **Step 1: Write the file**

```ts
import type { SyncedTransaction } from "@prisma/client";
import { resolveAmount } from "@lib/reports/draftReport";

export type SerializedCategoryTransaction = {
  id: string;
  transactionId: string;
  name: string;
  merchantName: string | null;
  amount: number;            // resolveAmount applied; Plaid sign convention preserved
  date: string;              // "YYYY-MM-DD"
  pending: boolean;
  categoryOverridden: boolean;
};

// Maps a SyncedTransaction row to the wire shape exposed by
// GET /api/mobile/category-transactions. We intentionally drop:
//   - account_id / plaidAccountId / pending_transaction_id (internal Plaid plumbing)
//   - userCategoryOverride / userAmountOverride (already applied via resolve helpers)
//   - notes / original_description (not needed for the v1 list)
// Keep this function pure — no I/O, no Date.now() — so it can be tested in isolation.
export function serializeTransaction(
  row: SyncedTransaction
): SerializedCategoryTransaction {
  return {
    id: row.id,
    transactionId: row.transaction_id,
    name: row.name,
    merchantName: row.merchant_name,
    amount: resolveAmount(row),
    date: row.date,
    pending: row.pending,
    categoryOverridden: row.userCategoryOverride !== null,
  };
}
```

- [ ] **Step 2: Type-check**

Run: `pnpm tsc --noEmit`
Expected: zero errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/mobile/category-transactions/_utils/serialize.ts
git commit -m "feat(web): add serializeTransaction pure helper for mobile category endpoint"
```

---

## Task 5: Web — route handler

**Working dir:** `finance-tracker`

**Files:**
- Create: `src/app/api/mobile/category-transactions/route.ts`

- [ ] **Step 1: Write the file**

```ts
import prisma from "@lib/prisma/prismaClient";
import { requireMobileUser } from "@lib/auth/requireMobileUser";
import { monthDateRange } from "@lib/reports/draftReport";
import { CATEGORY_KEY_TO_CANONICAL_NAME } from "./_utils/constants";
import { QuerySchema } from "./_utils/schemas";
import { filterAndResolve } from "./_utils/filter";
import { serializeTransaction } from "./_utils/serialize";

export async function GET(request: Request) {
  const auth = await requireMobileUser(request);
  if (!auth.ok) return auth.response;

  const url = new URL(request.url);
  const parsed = QuerySchema.safeParse({
    key: url.searchParams.get("key"),
    monthKey: url.searchParams.get("monthKey"),
  });
  if (!parsed.success) {
    return Response.json(
      { success: false, error: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { key, monthKey } = parsed.data;
  const [yearStr, monthStr] = monthKey.split("-");
  const target = { year: Number(yearStr), month: Number(monthStr) };
  const range = monthDateRange(target);
  const canonicalName = CATEGORY_KEY_TO_CANONICAL_NAME[key];

  try {
    const rows = await prisma.syncedTransaction.findMany({
      where: {
        userId: auth.user.id,
        date: { gte: range.gte, lt: range.lt },
      },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    });

    const transactions = filterAndResolve(rows, canonicalName).map(serializeTransaction);

    return Response.json({
      success: true,
      response: { key, monthKey, canonicalName, transactions },
    });
  } catch (error) {
    console.error("[/api/mobile/category-transactions]", error);
    return Response.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}
```

- [ ] **Step 2: Type-check**

Run: `pnpm tsc --noEmit`
Expected: zero errors.

- [ ] **Step 3: Smoke-test the route exists**

Start dev server: `pnpm dev`
In another terminal: `curl -i 'http://localhost:3000/api/mobile/category-transactions?key=foodAndDrink&monthKey=2026-05'`
Expected: `401 Unauthorized` (no bearer). Confirms the route is registered and `requireMobileUser` is gating.
Stop dev server.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/mobile/category-transactions/route.ts
git commit -m "feat(web): add GET /api/mobile/category-transactions handler"
```

---

## Task 6: Web — endpoint smoke test script

**Working dir:** `finance-tracker`

**Files:**
- Create: `scripts/test-category-transactions.ts`

- [ ] **Step 1: Write the script**

```ts
/**
 * Smoke-tests /api/mobile/category-transactions by exercising the same code
 * path the route uses (filter + serialize) directly against the dev DB.
 *
 * Usage:
 *   pnpm dlx tsx --env-file=.env scripts/test-category-transactions.ts <email> <key> <monthKey>
 *
 * Example:
 *   pnpm dlx tsx --env-file=.env scripts/test-category-transactions.ts you@example.com foodAndDrink 2026-05
 */
import prisma from "../src/lib/prisma/prismaClient";
import { monthDateRange } from "../src/lib/reports/draftReport";
import { CATEGORY_KEY_TO_CANONICAL_NAME } from "../src/app/api/mobile/category-transactions/_utils/constants";
import { filterAndResolve } from "../src/app/api/mobile/category-transactions/_utils/filter";
import { serializeTransaction } from "../src/app/api/mobile/category-transactions/_utils/serialize";

const main = async () => {
  const email = process.argv[2];
  const key = process.argv[3] as keyof typeof CATEGORY_KEY_TO_CANONICAL_NAME;
  const monthKey = process.argv[4];
  if (!email || !key || !monthKey) {
    console.error(
      "Usage: test-category-transactions.ts <email> <key> <monthKey>"
    );
    process.exit(1);
  }
  const canonicalName = CATEGORY_KEY_TO_CANONICAL_NAME[key];
  if (!canonicalName) {
    console.error(`Unknown key: ${key}`);
    process.exit(1);
  }

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, email: true },
  });
  if (!user) {
    console.error(`No user for ${email}`);
    process.exit(1);
  }

  const [y, m] = monthKey.split("-").map(Number);
  const range = monthDateRange({ year: y, month: m });

  const rows = await prisma.syncedTransaction.findMany({
    where: {
      userId: user.id,
      date: { gte: range.gte, lt: range.lt },
    },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
  });

  const filtered = filterAndResolve(rows, canonicalName);
  const transactions = filtered.map(serializeTransaction);

  console.log(
    `[ctx] user=${email} key=${key} canonical="${canonicalName}" monthKey=${monthKey}`
  );
  console.log(
    `[result] ${rows.length} rows fetched, ${filtered.length} after filter`
  );
  for (const t of transactions.slice(0, 10)) {
    console.log(
      `  - ${t.date} | ${t.name.padEnd(30).slice(0, 30)} | $${t.amount.toFixed(2).padStart(10)} | pending=${t.pending} | overridden=${t.categoryOverridden}`
    );
  }
  if (transactions.length > 10) console.log(`  … and ${transactions.length - 10} more`);
};

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
```

- [ ] **Step 2: Run against your own user**

Run: `pnpm dlx tsx --env-file=.env scripts/test-category-transactions.ts <your-email> foodAndDrink <current-YYYY-MM>`
Expected:
- `[ctx]` line prints user + key + canonical name + monthKey.
- `[result]` line prints `<N> rows fetched, <M> after filter` with `M <= N`.
- Up to 10 rows printed in date-desc order; pending/overridden flags reflect DB state.

- [ ] **Step 3: Run for a known empty case**

Run: `pnpm dlx tsx --env-file=.env scripts/test-category-transactions.ts <your-email> foster 2026-01`
Expected: `[result] <N> rows fetched, 0 after filter` (assuming you have no Foster spend in that month).

- [ ] **Step 4: Commit**

```bash
git add scripts/test-category-transactions.ts
git commit -m "feat(web): add scripts/test-category-transactions.ts for endpoint smoke testing"
```

---

## Task 7: Web — endpoint validation sweep

**Working dir:** `finance-tracker`

**Files:** none (verification only)

- [ ] **Step 1: Start dev server**

Run: `pnpm dev`

- [ ] **Step 2: Bad key → 400**

Run: `curl -i 'http://localhost:3000/api/mobile/category-transactions?key=bogus&monthKey=2026-05' -H "Authorization: Bearer fake"`
Expected: `401 Unauthorized` (auth fails first — that's correct, as `requireMobileUser` runs before parsing).

Run with a real bearer token (`pnpm dlx tsx --env-file=.env scripts/verify-supabase-jwt.ts <token>` first to confirm it decodes): `curl -i 'http://localhost:3000/api/mobile/category-transactions?key=bogus&monthKey=2026-05' -H "Authorization: Bearer <real>"`
Expected: `400 Bad Request` with `{"success":false,"error":{"fieldErrors":{"key":...}}}`.

- [ ] **Step 3: Bad monthKey → 400**

Run: `curl -i 'http://localhost:3000/api/mobile/category-transactions?key=foodAndDrink&monthKey=2026-13' -H "Authorization: Bearer <real>"`
Expected: `400 Bad Request` with `monthKey` field error.

- [ ] **Step 4: Happy path → 200**

Run: `curl -s 'http://localhost:3000/api/mobile/category-transactions?key=foodAndDrink&monthKey=<current-YYYY-MM>' -H "Authorization: Bearer <real>" | jq '.success, .response.canonicalName, .response.transactions | length'`
Expected: `true`, `"Food & Drink"`, `<count>`.

- [ ] **Step 5: Stop dev server.**

No commit (verification step).

---

## Task 8: Mobile — `lib/threshold/types.ts`

**Working dir:** `finance-tracker-mobile`

**Files:**
- Create: `lib/threshold/types.ts`

- [ ] **Step 1: Write the file**

```ts
export type ThresholdLevel = "none" | "ok" | "warning" | "reached" | "over";

export type ThresholdState = {
  level: ThresholdLevel;
  percent: number;            // 0–999, rounded; 0 when level === "none"
  fillRatio: number;          // 0–1, capped at 1 (for the bar width)
  color: string;              // hex; category color for "ok", palette for warn/reached/over
  pillLabel: string | null;   // "Warning" | "Reached" | "Over budget" | null
};
```

- [ ] **Step 2: Type-check**

Run: `pnpm tsc --noEmit`
Expected: zero errors.

- [ ] **Step 3: Commit**

```bash
git add lib/threshold/types.ts
git commit -m "feat(mobile): add lib/threshold/types.ts"
```

---

## Task 9: Mobile — `lib/threshold/constants.ts`

**Working dir:** `finance-tracker-mobile`

**Files:**
- Create: `lib/threshold/constants.ts`

- [ ] **Step 1: Write the file**

```ts
// Threshold-state colors. The "ok" color is the category's own identity color
// (passed in to deriveThresholdState), so under-threshold cards keep their
// existing visual identity. These three palette colors take over only when the
// user has crossed a notification boundary.
export const COLOR_WARNING = "#FFB800";   // 70% reached
export const COLOR_REACHED = "#F39C12";   // 100% reached
export const COLOR_OVER    = "#E74C3C";   // strictly over
```

- [ ] **Step 2: Type-check**

Run: `pnpm tsc --noEmit`
Expected: zero errors.

- [ ] **Step 3: Commit**

```bash
git add lib/threshold/constants.ts
git commit -m "feat(mobile): add lib/threshold/constants.ts"
```

---

## Task 10: Mobile — `lib/threshold/deriveState.ts`

**Working dir:** `finance-tracker-mobile`

**Files:**
- Create: `lib/threshold/deriveState.ts`

- [ ] **Step 1: Write the file**

```ts
import type { ThresholdState } from "./types";
import { COLOR_OVER, COLOR_REACHED, COLOR_WARNING } from "./constants";

// Pure. Boundaries match src/lib/notifications/thresholdCheck.ts on the web:
//   warning  = spent >= threshold * 0.7
//   reached  = spent >= threshold
//   over     = spent  > threshold (strict)
// threshold <= 0 short-circuits to "none" — used for revenue and for any
// category the user hasn't set a threshold on.
export function deriveThresholdState(
  spent: number,
  threshold: number,
  categoryColor: string
): ThresholdState {
  if (threshold <= 0) {
    return {
      level: "none",
      percent: 0,
      fillRatio: 0,
      color: categoryColor,
      pillLabel: null,
    };
  }

  const ratio = spent / threshold;
  const percent = Math.round(ratio * 100);
  const fillRatio = Math.min(Math.max(ratio, 0), 1);

  if (spent > threshold) {
    return { level: "over", percent, fillRatio, color: COLOR_OVER, pillLabel: "Over budget" };
  }
  if (spent >= threshold) {
    return { level: "reached", percent, fillRatio, color: COLOR_REACHED, pillLabel: "Reached" };
  }
  if (spent >= threshold * 0.7) {
    return { level: "warning", percent, fillRatio, color: COLOR_WARNING, pillLabel: "Warning" };
  }
  return { level: "ok", percent, fillRatio, color: categoryColor, pillLabel: null };
}
```

- [ ] **Step 2: Type-check**

Run: `pnpm tsc --noEmit`
Expected: zero errors.

- [ ] **Step 3: Commit**

```bash
git add lib/threshold/deriveState.ts
git commit -m "feat(mobile): add deriveThresholdState pure helper"
```

---

## Task 11: Mobile — `lib/threshold/index.ts`

**Working dir:** `finance-tracker-mobile`

**Files:**
- Create: `lib/threshold/index.ts`

- [ ] **Step 1: Write the file**

```ts
export { deriveThresholdState } from "./deriveState";
export type { ThresholdLevel, ThresholdState } from "./types";
export { COLOR_WARNING, COLOR_REACHED, COLOR_OVER } from "./constants";
```

- [ ] **Step 2: Type-check**

Run: `pnpm tsc --noEmit`
Expected: zero errors.

- [ ] **Step 3: Commit**

```bash
git add lib/threshold/index.ts
git commit -m "feat(mobile): add lib/threshold barrel re-exports"
```

---

## Task 12: Mobile — `scripts/test-threshold-state.ts`

**Working dir:** `finance-tracker-mobile`

**Files:**
- Create: `scripts/test-threshold-state.ts`

- [ ] **Step 1: Write the script**

```ts
/**
 * Asserts deriveThresholdState behavior at the 70% / 100% / over boundaries
 * and the threshold=0 short-circuit. Run in CI / locally:
 *
 *   pnpm dlx tsx scripts/test-threshold-state.ts
 *
 * The script exits non-zero on any console.assert failure.
 */
import { deriveThresholdState } from "../lib/threshold";

const RED   = "#FF6B6B";  // dummy category color
let failed = 0;
const assert = (cond: unknown, msg: string) => {
  if (cond) {
    console.log(`  ok  — ${msg}`);
  } else {
    console.error(`  FAIL — ${msg}`);
    failed++;
  }
};

console.log("[case] threshold = 0 → level 'none', no pill");
{
  const s = deriveThresholdState(123, 0, RED);
  assert(s.level === "none", `level === "none" (got ${s.level})`);
  assert(s.percent === 0, `percent === 0 (got ${s.percent})`);
  assert(s.fillRatio === 0, `fillRatio === 0 (got ${s.fillRatio})`);
  assert(s.pillLabel === null, `pillLabel === null (got ${s.pillLabel})`);
  assert(s.color === RED, `color === categoryColor (got ${s.color})`);
}

console.log("[case] spent 0 / threshold 400 → ok");
{
  const s = deriveThresholdState(0, 400, RED);
  assert(s.level === "ok", `level === "ok" (got ${s.level})`);
  assert(s.percent === 0, `percent === 0`);
  assert(s.color === RED, `color === categoryColor`);
  assert(s.pillLabel === null, `pillLabel === null`);
}

console.log("[case] spent 200 / threshold 400 (50%) → ok");
{
  const s = deriveThresholdState(200, 400, RED);
  assert(s.level === "ok", `level === "ok"`);
  assert(s.percent === 50, `percent === 50`);
}

console.log("[case] spent 280 / threshold 400 (70% boundary) → warning");
{
  const s = deriveThresholdState(280, 400, RED);
  assert(s.level === "warning", `level === "warning" (got ${s.level})`);
  assert(s.pillLabel === "Warning", `pillLabel === "Warning"`);
  assert(s.color === "#FFB800", `color === COLOR_WARNING`);
}

console.log("[case] spent 400 / threshold 400 (100% boundary) → reached");
{
  const s = deriveThresholdState(400, 400, RED);
  assert(s.level === "reached", `level === "reached"`);
  assert(s.pillLabel === "Reached", `pillLabel === "Reached"`);
  assert(s.color === "#F39C12", `color === COLOR_REACHED`);
  assert(s.fillRatio === 1, `fillRatio === 1`);
}

console.log("[case] spent 401 / threshold 400 (just over) → over");
{
  const s = deriveThresholdState(401, 400, RED);
  assert(s.level === "over", `level === "over"`);
  assert(s.pillLabel === "Over budget", `pillLabel === "Over budget"`);
  assert(s.color === "#E74C3C", `color === COLOR_OVER`);
  assert(s.fillRatio === 1, `fillRatio capped at 1 (got ${s.fillRatio})`);
}

console.log("[case] spent 600 / threshold 400 (way over, 150%) → over, fill cap, percent 150");
{
  const s = deriveThresholdState(600, 400, RED);
  assert(s.level === "over", `level === "over"`);
  assert(s.percent === 150, `percent === 150`);
  assert(s.fillRatio === 1, `fillRatio === 1 (capped)`);
}

if (failed > 0) {
  console.error(`\n${failed} assertion(s) failed`);
  process.exit(1);
}
console.log("\nall threshold-state cases passed");
```

- [ ] **Step 2: Run the script**

Run: `pnpm dlx tsx scripts/test-threshold-state.ts`
Expected: every line prints `ok — …`, final line `all threshold-state cases passed`. Exit code 0.

- [ ] **Step 3: Commit**

```bash
git add scripts/test-threshold-state.ts
git commit -m "test(mobile): add scripts/test-threshold-state.ts asserting boundary behavior"
```

---

## Task 13: Mobile — `lib/notification/types.ts`

**Working dir:** `finance-tracker-mobile`

**Files:**
- Create: `lib/notification/types.ts`

- [ ] **Step 1: Write the file**

```ts
import type { CategoryDisplayName, CategoryKey } from "../../types";

// Mirrors the Prisma enum on the web side. Kept as a union literal here so
// we don't pull a runtime dep on Prisma into the mobile bundle.
export type NotificationLevel = "WARNING_70" | "REACHED_100" | "EXCEEDED";

export type AlertNotificationData = {
  category: CategoryDisplayName;
  level: NotificationLevel;
  monthKey: string;            // "YYYY-MM"
};

export type ParsedDeepLink = {
  categoryKey: CategoryKey;
  monthKey: string;
};
```

- [ ] **Step 2: Type-check**

Run: `pnpm tsc --noEmit`
Expected: zero errors.

- [ ] **Step 3: Commit**

```bash
git add lib/notification/types.ts
git commit -m "feat(mobile): add lib/notification/types.ts"
```

---

## Task 14: Mobile — `lib/notification/parseDeepLink.ts`

**Working dir:** `finance-tracker-mobile`

**Files:**
- Create: `lib/notification/parseDeepLink.ts`

- [ ] **Step 1: Write the file**

```ts
import type * as Notifications from "expo-notifications";
import { displayNameToKey, type CategoryDisplayName } from "../../types";
import type { ParsedDeepLink } from "./types";

const MONTH_KEY_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

// Pure. Returns the deep-link target for a notification carrying our alert
// payload shape, or null for any other notification. Single point of trust
// for "is this notification one of ours, and where should it route?"
export function parseAlertNotification(
  notification: Notifications.Notification
): ParsedDeepLink | null {
  const data = notification.request?.content?.data as
    | Record<string, unknown>
    | undefined;
  if (!data) return null;

  const { category, monthKey } = data;
  if (typeof category !== "string" || typeof monthKey !== "string") return null;
  if (!MONTH_KEY_RE.test(monthKey)) return null;

  const categoryKey = displayNameToKey[category as CategoryDisplayName];
  if (!categoryKey) return null;

  return { categoryKey, monthKey };
}
```

- [ ] **Step 2: Type-check**

Run: `pnpm tsc --noEmit`
Expected: zero errors.

- [ ] **Step 3: Commit**

```bash
git add lib/notification/parseDeepLink.ts
git commit -m "feat(mobile): add parseAlertNotification deep-link parser"
```

---

## Task 15: Mobile — `lib/notification/index.ts`

**Working dir:** `finance-tracker-mobile`

**Files:**
- Create: `lib/notification/index.ts`

- [ ] **Step 1: Write the file**

```ts
export { parseAlertNotification } from "./parseDeepLink";
export type {
  AlertNotificationData,
  NotificationLevel,
  ParsedDeepLink,
} from "./types";
```

- [ ] **Step 2: Type-check**

Run: `pnpm tsc --noEmit`
Expected: zero errors.

- [ ] **Step 3: Commit**

```bash
git add lib/notification/index.ts
git commit -m "feat(mobile): add lib/notification barrel re-exports"
```

---

## Task 16: Mobile — `scripts/test-parse-deeplink.ts`

**Working dir:** `finance-tracker-mobile`

**Files:**
- Create: `scripts/test-parse-deeplink.ts`

- [ ] **Step 1: Write the script**

```ts
/**
 * Asserts parseAlertNotification on valid + invalid payload shapes. Run:
 *
 *   pnpm dlx tsx scripts/test-parse-deeplink.ts
 *
 * Exits non-zero on any failure.
 */
import { parseAlertNotification } from "../lib/notification";

let failed = 0;
const assert = (cond: unknown, msg: string) => {
  if (cond) {
    console.log(`  ok  — ${msg}`);
  } else {
    console.error(`  FAIL — ${msg}`);
    failed++;
  }
};

// Build a fake Notifications.Notification with a given data payload.
const makeNotif = (data: unknown) => ({
  request: {
    identifier: "x",
    content: {
      title: "t",
      subtitle: null,
      body: "b",
      data,
      sound: null,
      badge: null,
      categoryIdentifier: null,
      attachments: [],
    },
    trigger: null,
  },
  date: 0,
}) as any;

console.log("[case] valid alert payload → ParsedDeepLink");
{
  const out = parseAlertNotification(
    makeNotif({ category: "Groceries", level: "WARNING_70", monthKey: "2026-05" })
  );
  assert(out !== null, "result is non-null");
  assert(out?.categoryKey === "groceries", `categoryKey === "groceries" (got ${out?.categoryKey})`);
  assert(out?.monthKey === "2026-05", `monthKey === "2026-05"`);
}

console.log("[case] all 12 known display names map to a CategoryKey");
{
  const names = [
    "Food & Drink", "Bills & Utilities", "Car", "Entertainment",
    "Groceries", "Health & Wellness", "Personal", "Shopping",
    "Fees & Adjustments", "Others", "Foster", "Revenue",
  ];
  for (const name of names) {
    const out = parseAlertNotification(
      makeNotif({ category: name, level: "REACHED_100", monthKey: "2026-05" })
    );
    assert(out !== null, `"${name}" → ParsedDeepLink`);
  }
}

console.log("[case] missing data → null");
{
  const out = parseAlertNotification(makeNotif(undefined));
  assert(out === null, "undefined data → null");
}

console.log("[case] missing category → null");
{
  const out = parseAlertNotification(
    makeNotif({ level: "WARNING_70", monthKey: "2026-05" })
  );
  assert(out === null, "missing category → null");
}

console.log("[case] missing monthKey → null");
{
  const out = parseAlertNotification(
    makeNotif({ category: "Groceries", level: "WARNING_70" })
  );
  assert(out === null, "missing monthKey → null");
}

console.log("[case] malformed monthKey → null");
{
  const out = parseAlertNotification(
    makeNotif({ category: "Groceries", level: "WARNING_70", monthKey: "2026-13" })
  );
  assert(out === null, '"2026-13" → null');
}

console.log("[case] unknown category → null");
{
  const out = parseAlertNotification(
    makeNotif({ category: "Crypto Speculation", level: "WARNING_70", monthKey: "2026-05" })
  );
  assert(out === null, "unknown display name → null");
}

if (failed > 0) {
  console.error(`\n${failed} assertion(s) failed`);
  process.exit(1);
}
console.log("\nall deep-link parser cases passed");
```

- [ ] **Step 2: Run**

Run: `pnpm dlx tsx scripts/test-parse-deeplink.ts`
Expected: every assertion `ok`, final line `all deep-link parser cases passed`.

- [ ] **Step 3: Commit**

```bash
git add scripts/test-parse-deeplink.ts
git commit -m "test(mobile): add scripts/test-parse-deeplink.ts asserting parser cases"
```

---

## Task 17: Mobile — `lib/monthKey.ts`

**Working dir:** `finance-tracker-mobile`

**Files:**
- Create: `lib/monthKey.ts`

- [ ] **Step 1: Write the file**

```ts
// Returns "YYYY-MM" for the current UTC month. Mirrors the monthKey shape
// used by the web /api/mobile/category-transactions endpoint and by the
// notification payload (formatAlertPush).
export function currentMonthKey(): string {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}
```

- [ ] **Step 2: Type-check**

Run: `pnpm tsc --noEmit`
Expected: zero errors.

- [ ] **Step 3: Commit**

```bash
git add lib/monthKey.ts
git commit -m "feat(mobile): add currentMonthKey() helper"
```

---

## Task 18: Mobile — types for category transactions wire shape

**Working dir:** `finance-tracker-mobile`

**Files:**
- Modify: `types/index.ts`

- [ ] **Step 1: Add the new types and remove the legacy `Transaction` interface and the `transactionCount` field on `CategoryData`**

Replace the existing `Transaction` interface (lines 98–107) and the `CategoryData` interface (lines 109–117) with:

```ts
// ---------- API wire shape: per-category transactions ----------

export type CategoryTransaction = {
  id: string;
  transactionId: string;
  name: string;
  merchantName: string | null;
  amount: number;             // Plaid sign convention (expenses positive, revenue negative)
  date: string;               // "YYYY-MM-DD"
  pending: boolean;
  categoryOverridden: boolean;
};

export type CategoryTransactionsResponse = {
  key: CategoryKey;
  monthKey: string;
  canonicalName: string;
  transactions: CategoryTransaction[];
};

// ---------- Home-screen card ----------

export interface CategoryData {
  key: CategoryKey;
  displayName: CategoryDisplayName;
  amount: number;
  color: string;
  icon: string;
  threshold: number;
}
```

(Note: the legacy `Transaction` interface had been used only by `services/mockData.ts`, which is being deleted in a later task. `transactionCount` on `CategoryData` had no consumer once the home `<CategoryCard>` count subtitle is removed.)

- [ ] **Step 2: Type-check (will fail until later tasks)**

Run: `pnpm tsc --noEmit`
Expected: errors in `services/mockData.ts` (references to `Transaction`) and `lib/categories.ts` (references to `transactionCount`). These are addressed in Tasks 20 and 25. Note the failing files; do not fix them in this task.

- [ ] **Step 3: Commit**

```bash
git add types/index.ts
git commit -m "feat(mobile): add CategoryTransaction wire types; drop legacy Transaction + transactionCount"
```

---

## Task 19: Mobile — `services/api.ts` fetcher

**Working dir:** `finance-tracker-mobile`

**Files:**
- Modify: `services/api.ts`

- [ ] **Step 1: Add the import and fetcher**

At the top of `services/api.ts`, update the `import type` line that currently reads:

```ts
import type { ReportRow, ExpenseThresholdRow } from "../types";
```

to:

```ts
import type {
  CategoryKey,
  CategoryTransactionsResponse,
  ExpenseThresholdRow,
  ReportRow,
} from "../types";
```

Then append the new fetcher at the bottom of the file:

```ts
export const fetchCategoryTransactions = (params: {
  key: CategoryKey;
  monthKey: string;
}) =>
  authenticatedFetch<CategoryTransactionsResponse>(
    `/api/mobile/category-transactions?key=${encodeURIComponent(
      params.key
    )}&monthKey=${encodeURIComponent(params.monthKey)}`
  );
```

- [ ] **Step 2: Type-check**

Run: `pnpm tsc --noEmit`
Expected: still errors in `services/mockData.ts` and `lib/categories.ts`; no NEW errors in `services/api.ts`.

- [ ] **Step 3: Commit**

```bash
git add services/api.ts
git commit -m "feat(mobile): add fetchCategoryTransactions to services/api.ts"
```

---

## Task 20: Mobile — drop `transactionCount` from `lib/categories.ts`

**Working dir:** `finance-tracker-mobile`

**Files:**
- Modify: `lib/categories.ts`

- [ ] **Step 1: Update `deriveCategoryData`**

Replace the entire body of `deriveCategoryData` (the file's only export) with:

```ts
import {
  CATEGORIES,
  type CategoryData,
  type CategoryKey,
  type ReportRow,
  type ExpenseThresholdRow,
} from "../types";

export function deriveCategoryData(
  report: ReportRow,
  thresholds: ExpenseThresholdRow
): CategoryData[] {
  return CATEGORIES
    .map((cat) => {
      const amount = (report as unknown as Record<CategoryKey, number>)[cat.key] ?? 0;
      const threshold =
        cat.key === "revenue"
          ? 0
          : (thresholds as unknown as Record<string, number>)[cat.key] ?? 0;
      return {
        ...cat,
        amount,
        threshold,
      };
    })
    .filter((c) => c.amount > 0 || c.key === "revenue")
    .sort((a, b) => {
      if (a.key === "revenue") return 1;
      if (b.key === "revenue") return -1;
      return b.amount - a.amount;
    });
}
```

(Removes the `transactionCount: 0` field — `CategoryData` no longer has it.)

- [ ] **Step 2: Type-check**

Run: `pnpm tsc --noEmit`
Expected: only the `services/mockData.ts` errors remain. Anything referencing `category.transactionCount` (`components/CategoryCard.tsx`, the old `app/(app)/category/[id].tsx`) will surface here. Note them; they are addressed in Tasks 22 and 23. Do not fix them in this task — keep the diff scoped.

- [ ] **Step 3: Commit**

```bash
git add lib/categories.ts
git commit -m "feat(mobile): drop transactionCount from deriveCategoryData"
```

---

## Task 21: Mobile — `<TransactionItem>` accepts `CategoryTransaction` + Pending badge

**Working dir:** `finance-tracker-mobile`

**Files:**
- Modify: `components/TransactionItem.tsx`

- [ ] **Step 1: Replace the file content**

```tsx
import { View, Text } from "react-native";
import type { CategoryTransaction } from "../types";

interface TransactionItemProps {
  transaction: CategoryTransaction;
  color: string;
}

export function TransactionItem({ transaction, color }: TransactionItemProps) {
  const formatCurrency = (amount: number) => {
    const absAmount = Math.abs(amount);
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(absAmount);
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };

  const isIncome = transaction.amount < 0;

  return (
    <View className="flex-row items-center py-4 border-b border-card-border">
      <View
        className="w-10 h-10 rounded-xl items-center justify-center mr-3"
        style={{ backgroundColor: `${color}15` }}
      >
        <View
          className="w-3 h-3 rounded-full"
          style={{ backgroundColor: color }}
        />
      </View>

      <View className="flex-1">
        <Text className="text-text-primary text-base font-medium mb-0.5" numberOfLines={1}>
          {transaction.name}
        </Text>
        <View className="flex-row items-center">
          <Text className="text-text-secondary text-xs">
            {formatDate(transaction.date)}
          </Text>
          {transaction.pending && (
            <View className="ml-2 px-1.5 py-0.5 rounded bg-card-border">
              <Text className="text-text-secondary text-[10px] font-semibold uppercase tracking-wide">
                Pending
              </Text>
            </View>
          )}
        </View>
      </View>

      <Text
        className="text-base font-semibold"
        style={{ color: isIncome ? "#58D68D" : color }}
      >
        {isIncome ? "+" : "-"}
        {formatCurrency(transaction.amount)}
      </Text>
    </View>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `pnpm tsc --noEmit`
Expected: no new errors in this file. Remaining errors should be limited to `services/mockData.ts`, `app/(app)/category/[id].tsx`, and `components/CategoryCard.tsx`.

- [ ] **Step 3: Commit**

```bash
git add components/TransactionItem.tsx
git commit -m "feat(mobile): TransactionItem accepts CategoryTransaction; render Pending badge"
```

---

## Task 22: Mobile — `<CategoryCard>` threshold UI + re-enable navigation

**Working dir:** `finance-tracker-mobile`

**Files:**
- Modify: `components/CategoryCard.tsx`

- [ ] **Step 1: Replace the file content**

```tsx
import { View, Text, Pressable } from "react-native";
import { useRouter } from "expo-router";
import { CategoryData } from "../types";
import { getCategoryRoute } from "../lib/routes";
import { deriveThresholdState } from "../lib/threshold";

interface CategoryCardProps {
  category: CategoryData;
}

export function CategoryCard({ category }: CategoryCardProps) {
  const router = useRouter();

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const handlePress = () => router.push(getCategoryRoute(category.key));

  const isRevenue = category.key === "revenue";
  const state = deriveThresholdState(category.amount, category.threshold, category.color);

  return (
    <Pressable
      onPress={handlePress}
      className="bg-card-bg rounded-2xl p-4 mb-3 border border-card-border active:opacity-80 active:scale-[0.98]"
      style={{
        shadowColor: category.color,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 8,
        elevation: 3,
      }}
    >
      <View className="flex-row items-center justify-between">
        <View className="flex-row items-center flex-1">
          <View
            className="w-12 h-12 rounded-xl items-center justify-center mr-3"
            style={{ backgroundColor: `${category.color}20` }}
          >
            <Text className="text-2xl">{category.icon}</Text>
          </View>
          <View className="flex-1 flex-row items-center flex-wrap">
            <Text className="text-text-primary text-base font-semibold">
              {category.displayName}
            </Text>
            {state.pillLabel && (
              <View
                className="ml-2 px-1.5 py-0.5 rounded"
                style={{ backgroundColor: `${state.color}26` }}
              >
                <Text
                  style={{ color: state.color }}
                  className="text-[10px] font-bold uppercase tracking-wide"
                >
                  {state.pillLabel}
                </Text>
              </View>
            )}
          </View>
        </View>

        <View className="items-end">
          <Text
            className="text-lg font-bold"
            style={{ color: isRevenue ? "#58D68D" : category.color }}
          >
            {isRevenue ? "+" : "-"}
            {formatCurrency(category.amount)}
          </Text>
          <View
            className="w-2 h-2 rounded-full mt-1"
            style={{ backgroundColor: category.color }}
          />
        </View>
      </View>

      {state.level !== "none" && (
        <>
          <View className="h-1.5 bg-card-border rounded-full mt-3 overflow-hidden">
            <View
              className="h-full rounded-full"
              style={{ width: `${state.fillRatio * 100}%`, backgroundColor: state.color }}
            />
          </View>
          <View className="flex-row justify-between mt-1.5">
            <Text className="text-text-secondary text-xs">
              <Text className="text-text-primary font-semibold">
                {formatCurrency(category.amount)}
              </Text>{" "}
              of {formatCurrency(category.threshold)}
            </Text>
            <Text className="text-text-primary text-xs font-semibold">
              {state.percent}%
            </Text>
          </View>
        </>
      )}
    </Pressable>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `pnpm tsc --noEmit`
Expected: no errors in this file. Remaining errors should be confined to `services/mockData.ts` and `app/(app)/category/[id].tsx`.

- [ ] **Step 3: Commit**

```bash
git add components/CategoryCard.tsx
git commit -m "feat(mobile): CategoryCard threshold bar + state pill; re-enable navigation; drop count subtitle"
```

---

## Task 23: Mobile — rewrite category detail page

**Working dir:** `finance-tracker-mobile`

**Files:**
- Modify: `app/(app)/category/[id].tsx`

- [ ] **Step 1: Replace the file content**

```tsx
import { View, Text, ScrollView, ActivityIndicator, Pressable } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { SafeAreaView } from "react-native-safe-area-context";
import { TransactionItem } from "../../../components/TransactionItem";
import {
  fetchCategoryTransactions,
  fetchCurrentMonthReport,
} from "../../../services/api";
import { CategoryKey, getCategoryInfo } from "../../../types";
import { useAuth } from "../../../context/AuthContext";
import { currentMonthKey } from "../../../lib/monthKey";
import { deriveThresholdState } from "../../../lib/threshold";

export default function CategoryTransactionsScreen() {
  const { id } = useLocalSearchParams<{ id: CategoryKey }>();
  const router = useRouter();
  const { user } = useAuth();
  const monthKey = currentMonthKey();

  const categoryInfo = getCategoryInfo(id as CategoryKey);
  const isRevenue = id === "revenue";

  // Same query the home screen uses; warm-cache hit when home was visited first.
  const reportQuery = useQuery({
    queryKey: ["currentMonthReport", user?.email],
    queryFn: fetchCurrentMonthReport,
    enabled: !!user?.email,
  });

  const txQuery = useQuery({
    queryKey: ["categoryTransactions", monthKey, id],
    queryFn: () =>
      fetchCategoryTransactions({ key: id as CategoryKey, monthKey }),
    enabled: !!id,
  });

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(Math.abs(amount));

  const spent =
    (reportQuery.data?.report as unknown as Record<string, number> | undefined)?.[id ?? ""] ??
    0;
  const threshold = isRevenue
    ? 0
    : (reportQuery.data?.thresholds as unknown as Record<string, number> | undefined)?.[
        id ?? ""
      ] ?? 0;
  const state = deriveThresholdState(
    spent,
    threshold,
    categoryInfo?.color ?? "#6366F1"
  );

  if (txQuery.isPending) {
    return (
      <SafeAreaView className="flex-1 bg-app-bg items-center justify-center">
        <ActivityIndicator size="large" color={categoryInfo?.color || "#6366F1"} />
        <Text className="text-text-secondary mt-4">Loading transactions...</Text>
      </SafeAreaView>
    );
  }

  if (txQuery.isError) {
    return (
      <SafeAreaView className="flex-1 bg-app-bg" edges={["top"]}>
        <View className="px-5 pt-2 pb-4">
          <Pressable
            onPress={() => router.back()}
            className="flex-row items-center mb-4"
          >
            <Text className="text-accent text-base mr-1">←</Text>
            <Text className="text-accent text-base">Back</Text>
          </Pressable>
        </View>
        <View className="flex-1 items-center justify-center px-6">
          <Text className="text-text-primary text-lg font-bold mb-2">
            Couldn't load transactions
          </Text>
          <Text className="text-text-secondary text-sm text-center mb-6">
            {txQuery.error instanceof Error
              ? txQuery.error.message
              : "Unable to load category transactions."}
          </Text>
          <Pressable
            onPress={() => txQuery.refetch()}
            className="px-6 py-3 rounded-xl bg-card-bg border border-card-border active:opacity-70"
          >
            <Text className="text-text-primary text-base font-semibold">Try again</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const transactions = txQuery.data?.transactions ?? [];

  return (
    <SafeAreaView className="flex-1 bg-app-bg" edges={["top"]}>
      <View className="px-5 pt-2 pb-4">
        <Pressable
          onPress={() => router.back()}
          className="flex-row items-center mb-4"
        >
          <Text className="text-accent text-base mr-1">←</Text>
          <Text className="text-accent text-base">Back</Text>
        </Pressable>

        <View className="flex-row items-center">
          <View
            className="w-14 h-14 rounded-2xl items-center justify-center mr-4"
            style={{ backgroundColor: `${categoryInfo?.color}20` }}
          >
            <Text className="text-3xl">{categoryInfo?.icon}</Text>
          </View>
          <View className="flex-1">
            <Text className="text-text-primary text-2xl font-bold">
              {categoryInfo?.displayName}
            </Text>
            <Text className="text-text-secondary text-sm mt-0.5">
              {transactions.length} transaction{transactions.length !== 1 ? "s" : ""} this month
            </Text>
          </View>
        </View>
      </View>

      {/* Hero card */}
      <View
        className="mx-5 mb-4 p-4 rounded-2xl border"
        style={{
          borderColor:
            state.level === "none" ? "rgba(255,255,255,0.06)" : `${state.color}4D`,
          backgroundColor:
            state.level === "none" ? "transparent" : `${state.color}14`,
        }}
      >
        <View className="flex-row justify-between items-baseline">
          <View>
            <Text className="text-text-secondary text-[10px] uppercase tracking-wide">
              {isRevenue ? "Earned" : "Spent"}
            </Text>
            <Text
              className="text-3xl font-bold"
              style={{ color: state.color }}
            >
              {isRevenue ? "+" : "-"}{formatCurrency(spent)}
            </Text>
          </View>
          {state.level !== "none" && (
            <View className="items-end">
              <Text className="text-text-secondary text-[10px] uppercase tracking-wide">Limit</Text>
              <Text className="text-text-secondary text-sm">{formatCurrency(threshold)}</Text>
            </View>
          )}
        </View>

        {state.level !== "none" && (
          <>
            <View className="h-2 bg-card-border rounded-full mt-3 overflow-hidden">
              <View
                className="h-full rounded-full"
                style={{
                  width: `${state.fillRatio * 100}%`,
                  backgroundColor: state.color,
                }}
              />
            </View>
            <View className="flex-row justify-between items-center mt-2">
              <Text className="text-text-secondary text-xs">
                <Text className="text-text-primary font-semibold">{state.percent}%</Text>{" "}
                of budget
              </Text>
              {state.pillLabel && (
                <View
                  className="px-2 py-0.5 rounded"
                  style={{ backgroundColor: `${state.color}26` }}
                >
                  <Text
                    style={{ color: state.color }}
                    className="text-[10px] font-bold uppercase tracking-wide"
                  >
                    {state.pillLabel}
                  </Text>
                </View>
              )}
            </View>
          </>
        )}
      </View>

      {/* Transactions */}
      <ScrollView className="flex-1 px-5" showsVerticalScrollIndicator={false}>
        <Text className="text-text-primary text-lg font-bold mb-2">Transactions</Text>

        {transactions.length > 0 ? (
          <View className="bg-card-bg rounded-2xl border border-card-border px-4 mb-8">
            {transactions.map((transaction) => (
              <TransactionItem
                key={transaction.id}
                transaction={transaction}
                color={categoryInfo?.color || "#6366F1"}
              />
            ))}
          </View>
        ) : (
          <View className="bg-card-bg rounded-2xl border border-card-border p-8 items-center">
            <Text className="text-4xl mb-3">📭</Text>
            <Text className="text-text-secondary text-base">No transactions found</Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `pnpm tsc --noEmit`
Expected: only `services/mockData.ts` errors remain (its imports of `CATEGORIES`, `CategoryKey`, and `Transaction`).

- [ ] **Step 3: Commit**

```bash
git add app/\(app\)/category/\[id\].tsx
git commit -m "feat(mobile): rewrite category detail page on real data + threshold hero"
```

---

## Task 24: Mobile — `usePushNotifications` cold-start + response listener

**Working dir:** `finance-tracker-mobile`

**Files:**
- Modify: `hooks/usePushNotifications.ts`

- [ ] **Step 1: Replace the file content**

```ts
import { useEffect, useRef, useState } from "react";
import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import { Platform } from "react-native";
import Constants from "expo-constants";
import { useRouter } from "expo-router";
import { getOrCreateDeviceId } from "../lib/deviceId";
import { postPushToken, deletePushToken } from "../services/api";
import { parseAlertNotification } from "../lib/notification";
import { getCategoryRoute } from "../lib/routes";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

export type PushNotificationState = {
  expoPushToken: string | null;
  notification: Notifications.Notification | null;
  error: string | null;
};

export function usePushNotifications(enabled: boolean) {
  const [expoPushToken, setExpoPushToken] = useState<string | null>(null);
  const [notification, setNotification] = useState<Notifications.Notification | null>(null);
  const [error, setError] = useState<string | null>(null);
  const notificationListener = useRef<Notifications.EventSubscription | null>(null);
  const responseListener = useRef<Notifications.EventSubscription | null>(null);
  const router = useRouter();

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;

    // Cold-start: if the app launched from a tap while killed, route to the
    // category page after auth has resolved (enabled === true means auth is
    // verified). The cancelled flag prevents a stale enabled→false transition
    // from pushing routes for a previous user.
    (async () => {
      try {
        const last = await Notifications.getLastNotificationResponseAsync();
        if (cancelled || !last) return;
        const parsed = parseAlertNotification(last.notification);
        if (parsed) router.push(getCategoryRoute(parsed.categoryKey));
      } catch (err) {
        console.error("Error handling cold-start notification:", err);
      }
    })();

    registerForPushNotificationsAsync()
      .then(async (token) => {
        if (token) {
          setExpoPushToken(token);
          try {
            const deviceId = await getOrCreateDeviceId();
            await postPushToken({ token, deviceId });
          } catch (err) {
            console.error("Error registering push token with backend:", err);
          }
        }
      })
      .catch((err) => {
        console.error("Error registering for push notifications:", err);
        setError(err.message || "Failed to register for push notifications");
      });

    notificationListener.current = Notifications.addNotificationReceivedListener(
      (n) => setNotification(n)
    );

    responseListener.current = Notifications.addNotificationResponseReceivedListener(
      (response) => {
        const parsed = parseAlertNotification(response.notification);
        if (parsed) router.push(getCategoryRoute(parsed.categoryKey));
      }
    );

    return () => {
      cancelled = true;
      if (notificationListener.current) {
        notificationListener.current.remove();
      }
      if (responseListener.current) {
        responseListener.current.remove();
      }
    };
  }, [enabled, router]);

  return { expoPushToken, notification, error };
}

async function registerForPushNotificationsAsync(): Promise<string | null> {
  let token: string | null = null;

  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("budget-alerts", {
      name: "Budget Alerts",
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: "#0F0F1A",
    });
  }

  if (Device.isDevice) {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== "granted") {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== "granted") {
      console.warn("Failed to get push token for push notification!");
      return null;
    }

    try {
      const projectId = Constants.expoConfig?.extra?.eas?.projectId;
      if (!projectId) {
        console.warn("Project ID not found in app.json");
        return null;
      }

      token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
    } catch (error) {
      console.error("Error getting Expo push token:", error);
      return null;
    }
  } else {
    console.warn("Must use physical device for Push Notifications");
  }

  return token;
}

export async function unregisterPushToken(token: string | null): Promise<void> {
  if (!token) return;
  try {
    await deletePushToken({ token });
  } catch (error) {
    console.error("Error unregistering push token:", error);
  }
}
```

- [ ] **Step 2: Type-check**

Run: `pnpm tsc --noEmit`
Expected: only `services/mockData.ts` errors remain.

- [ ] **Step 3: Commit**

```bash
git add hooks/usePushNotifications.ts
git commit -m "feat(mobile): cold-start handling + real response listener for push deep-linking"
```

---

## Task 25: Mobile — delete `services/mockData.ts`

**Working dir:** `finance-tracker-mobile`

**Files:**
- Delete: `services/mockData.ts`

- [ ] **Step 1: Verify nothing imports it**

Run: `grep -rn "from.*mockData\|require.*mockData" app components services lib hooks context types`
Expected: zero hits.

- [ ] **Step 2: Delete the file**

```bash
git rm services/mockData.ts
```

- [ ] **Step 3: Type-check — should now be clean**

Run: `pnpm tsc --noEmit`
Expected: zero errors.

- [ ] **Step 4: Commit**

```bash
git commit -m "chore(mobile): delete services/mockData.ts (no remaining consumers)"
```

---

## Task 26: Mobile — verify `app/(app)/index.tsx` still works

**Working dir:** `finance-tracker-mobile`

**Files:** none (verification only — `index.tsx` already passes `category` to `<CategoryCard>` and doesn't read `transactionCount` directly)

- [ ] **Step 1: Type-check the home file**

Run: `pnpm tsc --noEmit`
Expected: zero errors.

- [ ] **Step 2: Run lint**

Run: `pnpm lint`
Expected: zero new errors. (Existing baseline warnings are fine.)

No commit (verification step).

---

## Task 27: End-to-end smoke test on real device

**Working dirs:** both repos

**Files:** none (verification only)

- [ ] **Step 1: Start the web dev server**

In `finance-tracker`: `pnpm dev`

- [ ] **Step 2: Start the mobile dev client**

In `finance-tracker-mobile`: `pnpm start` (or `pnpm ios` / `pnpm android` if a simulator is needed). Confirm `EXPO_PUBLIC_MONEYEYE_URL` resolves to the dev-server host.

- [ ] **Step 3: Home → category navigation**

On the device/simulator: home screen → tap any non-revenue category card with non-zero spend.
Expected: navigates to the category detail page; hero shows real spend; transactions list populated, sorted desc.

- [ ] **Step 4: Threshold visual sweep**

Log into the web app, go to `/thresholds`. Set:
- Groceries → $400
- Food & Drink → $1
- Foster → $0

Force a sync (either wait for the next Plaid webhook or run `pnpm dlx tsx --env-file=.env scripts/fire-sync-webhook.ts`).

In the mobile app, refresh home. With normal spend:
- Groceries card → amber bar + "Warning" pill (assuming spent >= $280) OR no pill (assuming < $280).
- Food & Drink card → red bar + "Over budget" pill.
- Foster card → no bar, no pill.

Tap Food & Drink: detail hero matches the home pill state and color.

- [ ] **Step 5: Warm-app deep-link**

App in foreground on home. From a separate terminal in `finance-tracker`:

```bash
pnpm dlx tsx --env-file=.env scripts/test-threshold-check-april.ts <your-email> --clear-logs
```

(Use `--clear-logs` so previously-fired levels can re-fire.) Tap the in-app banner.
Expected: routes to the corresponding category detail page; hero matches the alert level.

- [ ] **Step 6: Cold-start deep-link**

Force-quit the mobile app from the multitasking switcher. Run the `test-threshold-check-april.ts` script with `--clear-logs` again. Tap the lock-screen / notification-tray banner while the app is killed.
Expected: app launches, signs in, and lands directly on the category detail page (not home).

- [ ] **Step 7: Signed-out tap**

Sign out of the mobile app (this also calls `deletePushToken` so any subsequent webhook will not deliver to this device). For testing the "stale notification tap" path: don't fire a new alert; instead use a notification still showing in the tray from a previous test. Tap it.
Expected: app opens to `/login`, no crash.

- [ ] **Step 8: Bad / stale category key**

Manually craft a notification with `category: "Crypto Speculation"` via Expo's notification tester (`https://expo.dev/notifications`) to your push token. Tap it.
Expected: parser returns null; tap is a no-op (you stay on whichever screen you were on, or land on home if cold-started).

No commit (verification step).

---

## Task 28: Final verification + cleanup pass

**Working dirs:** both repos

**Files:** none — final pass

- [ ] **Step 1: Web type-check**

In `finance-tracker`: `pnpm tsc --noEmit`
Expected: zero errors.

- [ ] **Step 2: Web lint**

In `finance-tracker`: `pnpm lint`
Expected: zero new errors.

- [ ] **Step 3: Mobile type-check**

In `finance-tracker-mobile`: `pnpm tsc --noEmit`
Expected: zero errors.

- [ ] **Step 4: Mobile lint**

In `finance-tracker-mobile`: `pnpm lint`
Expected: zero new errors.

- [ ] **Step 5: Mobile pure-helper sweep**

Run: `pnpm dlx tsx scripts/test-threshold-state.ts && pnpm dlx tsx scripts/test-parse-deeplink.ts`
Expected: both scripts print `…all cases passed` and exit 0.

- [ ] **Step 6: Verify mockData.ts is gone**

Run: `find . -path ./node_modules -prune -o -name 'mockData.ts' -print`
Expected: no hits.

- [ ] **Step 7: Push branches and open PRs**

For each repo:
```bash
git push -u origin <branch-name>
gh pr create --title "feat: category detail page + threshold progress + notification deep-linking" \
  --body "$(cat <<'EOF'
## Summary
- New `/api/mobile/category-transactions` endpoint (web) — per-category transactions for a given month, mirrors `resolveCategory` / `resolveAmount` semantics.
- Category detail page (mobile) rewritten on real data; deletes `services/mockData.ts`.
- Threshold-progress visualization on home `<CategoryCard>` and category detail hero (color-shifting bar + state pill + `$X of $Y`).
- Notification tap routes to the corresponding category page — cold-start friendly via `getLastNotificationResponseAsync()`.

Spec: `docs/superpowers/specs/2026-05-03-category-detail-threshold-and-deeplink-design.md`
Plan: `docs/superpowers/plans/2026-05-03-category-detail-threshold-and-deeplink.md`

## Test plan
- [x] `pnpm tsc --noEmit` clean (both repos)
- [x] `pnpm lint` clean (both repos)
- [x] `scripts/test-threshold-state.ts` passes
- [x] `scripts/test-parse-deeplink.ts` passes
- [x] `scripts/test-category-transactions.ts` returns expected rows for own user
- [x] curl with no bearer → 401; bad key → 400; bad monthKey → 400; happy path → 200
- [x] Real-device sweep: home navigation, threshold visuals, warm-app deep-link, cold-start deep-link, signed-out tap

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

(Web and mobile are separate PRs since they live in separate repos. Land them in either order — web endpoint is backwards-compatible until mobile starts calling it.)

---

## Self-review

**Spec coverage check:**
- Web endpoint route + auth gate + Zod validation + filter + serialize → Tasks 1–5.
- Endpoint smoke testing → Tasks 6–7.
- `lib/threshold/` (types/constants/derive/index) → Tasks 8–11; verification → Task 12.
- `lib/notification/` (types/parser/index) → Tasks 13–15; verification → Task 16.
- `lib/monthKey.ts` → Task 17.
- `services/api.ts` fetcher → Task 19.
- `types/index.ts` updates (CategoryTransaction, CategoryTransactionsResponse, drop legacy Transaction + transactionCount) → Task 18.
- `lib/categories.ts` cleanup → Task 20.
- `<TransactionItem>` updated to `CategoryTransaction` + Pending badge → Task 21.
- `<CategoryCard>` threshold UI + re-enable navigation + drop count subtitle → Task 22.
- Category detail page rewrite (unified hero) → Task 23.
- `usePushNotifications` cold-start + response listener → Task 24.
- `services/mockData.ts` deletion → Task 25.
- Real-device sweep covering all spec testing rows → Tasks 27–28.

**Placeholder scan:** no "TBD" / "TODO" / "implement later" / "appropriate error handling" / "similar to". Each step shows complete code or commands.

**Type consistency:**
- `CategoryTransaction` shape consistent across `serialize.ts` (Task 4), `types/index.ts` (Task 18), `services/api.ts` (Task 19), `<TransactionItem>` (Task 21), and the detail page (Task 23).
- `ThresholdState.color` returned by `deriveThresholdState` is consumed identically in `<CategoryCard>` (Task 22) and the category-detail hero (Task 23).
- `parseAlertNotification` signature matches its consumers in Task 24.
- `getCategoryRoute(category.key)` and `getCategoryRoute(parsed.categoryKey)` both pass a `CategoryKey` — same shape `getCategoryRoute` already accepts in `lib/routes.ts`.
