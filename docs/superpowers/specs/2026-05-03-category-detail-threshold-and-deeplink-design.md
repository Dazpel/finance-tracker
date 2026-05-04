# Category Detail Page + Threshold Progress + Notification Deep-Linking — Design

**Date:** 2026-05-03
**Status:** Brainstorm complete, awaiting user review before writing-plans
**Author:** Alex (with Claude)

## Summary

Finish three explicitly-deferred follow-ups from `2026-05-02-mobile-home-refactor-design.md`:

1. Category detail page on real data (replaces `services/mockData.ts`).
2. Threshold progress visualization on the home `<CategoryCard>` and the category detail hero.
3. Notification tap deep-linking — the push payload `{category, level, monthKey}` already exists from the prior phase 2 work; mobile now routes to the corresponding category page on tap.

These three strands are tightly coupled — the deep-link target is the new category page, the home threshold pill mirrors the alert state, and dropping `mockData.ts` requires both the new endpoint and the rewritten page to land together — so the work ships in a **single PR** spanning both repos.

## Goals

- A new `GET /api/mobile/category-transactions?key=…&monthKey=…` endpoint returns the per-category synced transactions for a given month, sorted desc by date.
- The mobile category detail page (`app/(app)/category/[id].tsx`) renders real `SyncedTransaction` rows scoped to the requested category and month.
- The home `<CategoryCard>` shows a real threshold-progress bar with category-color → amber → red shifts at the 70% / 100% / over boundaries, plus a `$X of $Y` summary line, plus a state pill (`Warning` / `Reached` / `Over budget`).
- The category detail page shows a unified hero card: spend on the left, limit on the right, threshold bar across the bottom, percent + state pill underneath.
- Tapping a budget alert notification routes to the corresponding category page in three scenarios: warm-app foreground, warm-app background, and cold-start (app was killed by the OS).
- `services/mockData.ts` is deleted; navigation from `<CategoryCard>` is re-enabled.

## Non-goals

- Selectable month on the category detail page (always current).
- Historical reports / annual report drill-down on mobile.
- Per-category notification opt-out, recovery alerts, multi-device management UI (all deferred per prior spec).
- Mobile transaction edit (override, soft-delete) — read-only.
- Foreground in-app banner restyling (`Notifications.setNotificationHandler` defaults are kept).
- Threshold-aware visualization on revenue cards (revenue has no threshold by design).
- Adding a test framework to mobile.

## Decisions log (from brainstorm Q&A)

| # | Question | Decision |
|---|---|---|
| Q1 | Endpoint shape for category transactions | A — new dedicated `GET /api/mobile/category-transactions?key=…&monthKey=…`. Thin endpoint, fat client, matches the prior spec's pattern. |
| Q2 | Threshold visual on home `<CategoryCard>` | B — color-shifting bar **plus** `$X of $Y · NN%` line **plus** state pill chip next to the category name. |
| Q3 | Category detail page layout | C — unified hero card combining spend + limit + bar + percent + pill in a single block. |
| Q4 | Notification tap deep-link scope | B — cold-start friendly via `getLastNotificationResponseAsync()`; routes always to current month; tap-while-signed-out drops the intent. |
| Q5 | Home `<CategoryCard>` "X transactions" subtitle | C — drop the count subtitle entirely on home cards. Detail page keeps the count (it's accurate there). |
| Approach | Implementation phasing | A — single PR. Features are tightly coupled; splitting would create artificial sequencing for the same files. |
| Code organization | File structure for new code | Separate by concern — types in `types.ts`, constants in `constants.ts`, schemas in `schemas.ts`, pure functions in named files. Domain folder + `index.ts` re-export when ergonomics matter. |

## Architecture

### One-paragraph overview

Mobile gets a new endpoint for per-category transactions, validated and bearer-authed with the same `requireMobileUser` pattern. The category detail page rewrites against this endpoint, drops the mock-data import, and gains a unified hero card driven by a pure `deriveThresholdState` helper. The same helper drives a slimmed-down `<CategoryCard>` on the home screen — count subtitle out, real bar + `$/$` line + state pill in. A pure `parseAlertNotification` parser and minimal `usePushNotifications` changes (cold-start handler + real response listener) wire the existing push payload to `expo-router`.

### File layout (cross-repo)

**Web — `finance-tracker`:**

```
src/app/api/mobile/category-transactions/
  route.ts                       # handler — auth gate, parse, query, serialize, return
  _utils/
    schemas.ts                   # Zod query schema
    constants.ts                 # CATEGORY_KEY_TO_CANONICAL_NAME map
    serialize.ts                 # Prisma row → API response shape (pure)
    filter.ts                    # filterAndResolve(rows, canonicalName) (pure)
```

**Mobile — `finance-tracker-mobile`:**

```
[new]
  lib/threshold/
    types.ts                     # ThresholdLevel, ThresholdState
    constants.ts                 # COLOR_OK, COLOR_WARNING, COLOR_REACHED, COLOR_OVER
    deriveState.ts               # deriveThresholdState (pure)
    index.ts                     # re-exports
  lib/notification/
    types.ts                     # AlertNotificationData, ParsedDeepLink
    parseDeepLink.ts             # parseAlertNotification (pure)
    index.ts                     # re-exports
  lib/monthKey.ts                # currentMonthKey()

[edited]
  services/api.ts                # + fetchCategoryTransactions
  app/(app)/index.tsx            # no behavior change; relies on re-enabled CategoryCard nav
  app/(app)/category/[id].tsx    # rewrite: real fetcher, hero card, threshold treatment
  components/CategoryCard.tsx    # threshold UI, drop count subtitle, drop hardcoded /500 bar, re-enable navigation
  lib/categories.ts              # drop transactionCount from deriveCategoryData (no remaining consumer)
  components/TransactionItem.tsx # accept CategoryTransaction; optional Pending badge
  hooks/usePushNotifications.ts  # cold-start handler + real response listener using parseAlertNotification
  types/index.ts                 # + CategoryTransaction, CategoryTransactionsResponse; remove legacy Transaction; drop transactionCount from CategoryData

[deleted]
  services/mockData.ts
```

## Web — `GET /api/mobile/category-transactions`

### Auth

`requireMobileUser` (same gate as `/api/mobile/current-month-report` and `/api/push-tokens`).

### Query params

In `_utils/schemas.ts`:

```ts
export const QuerySchema = z.object({
  key: z.enum([
    "foodAndDrink", "billsAndUtilities", "car", "entertainment",
    "groceries", "healthAndWellness", "personal", "shopping",
    "feesAndAdjustments", "others", "foster", "revenue",
  ]),
  monthKey: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
});
```

Bad shape → `400` with `parsed.error.flatten()`.

### Algorithm

1. Parse `monthKey` into `{ year, month }`. Reuse `monthDateRange(target)` from `src/lib/reports/draftReport.ts` for the `[gte, lt)` `date`-string bounds.
2. Resolve `key` → canonical Title-Case name via `_utils/constants.ts` `CATEGORY_KEY_TO_CANONICAL_NAME`.
3. `prisma.syncedTransaction.findMany({ where: { userId: auth.user.id, date: { gte, lt } }, orderBy: [{ date: "desc" }, { createdAt: "desc" }] })`. **No category filter at the DB layer** — `userCategoryOverride` makes that incorrect.
4. In `_utils/filter.ts`: filter `!t.userSoftDeleted` (mirrors `computeReportTotals`); keep rows where `resolveCategory(t) === canonicalName`. Both helpers imported from `src/lib/reports/draftReport.ts` — single source of truth.
5. In `_utils/serialize.ts`: map each surviving row to the wire shape (apply `resolveAmount`, omit `userCategoryOverride`/`userAmountOverride`/`plaidAccountId`/`pending_transaction_id`/`account_id`/`notes`/`original_description`).

### Response

```ts
{
  success: true,
  response: {
    key: CategoryKey,
    monthKey: string,
    canonicalName: string,
    transactions: Array<{
      id: string;
      transactionId: string;
      name: string;
      merchantName: string | null;
      amount: number;            // resolveAmount applied; Plaid sign convention
      date: string;              // "YYYY-MM-DD"
      pending: boolean;
      categoryOverridden: boolean;
    }>,
  }
}
```

### Errors

- `401` from `requireMobileUser`.
- `400` invalid query params.
- `500` on unexpected DB error, logged with `[/api/mobile/category-transactions]` prefix.

### Sign convention

Web stores expenses positive, revenue negative (Plaid convention). The endpoint preserves this on the wire. Mobile UI continues to flip with `Math.abs` + `+`/`-` based on `isRevenue`. No in-flight sign-flipping.

### RLS posture compliance (per AGENTS.md)

- `requireMobileUser` is the first line of the handler.
- The single Prisma read is scoped by `userId: auth.user.id`.
- No `updateMany`/`deleteMany`.
- Body-/URL-supplied identifiers are limited to category key + month; both validated in the Zod schema.
- Response shape `{ success, response | error }`.

## Mobile — types

In `types/index.ts`:

```ts
export type CategoryTransaction = {
  id: string;
  transactionId: string;
  name: string;
  merchantName: string | null;
  amount: number;
  date: string;
  pending: boolean;
  categoryOverridden: boolean;
};

export type CategoryTransactionsResponse = {
  key: CategoryKey;
  monthKey: string;
  canonicalName: string;
  transactions: CategoryTransaction[];
};
```

The legacy `Transaction` interface is removed in this PR — only `mockData.ts` consumed it, and `mockData.ts` is being deleted.

## Mobile — `services/api.ts`

```ts
export const fetchCategoryTransactions = (params: {
  key: CategoryKey;
  monthKey: string;
}) =>
  authenticatedFetch<CategoryTransactionsResponse>(
    `/api/mobile/category-transactions?key=${encodeURIComponent(params.key)}&monthKey=${encodeURIComponent(params.monthKey)}`
  );
```

`authenticatedFetch` already throws `NotAuthenticatedError` on 401 and `Error` on other failures — no new error class.

`services/api.ts` keeps growing (now 5 fetchers). Each is a one-liner; splitting per-endpoint would over-fragment. Revisit if it grows past ~15 fetchers.

## Mobile — `lib/threshold/`

### `types.ts`

```ts
export type ThresholdLevel = "none" | "ok" | "warning" | "reached" | "over";

export type ThresholdState = {
  level: ThresholdLevel;
  percent: number;            // 0–999, rounded; 0 when level === "none"
  fillRatio: number;           // 0–1, capped at 1 (for the bar width)
  color: string;               // hex; category color for ok, palette for warn/reached/over
  pillLabel: string | null;    // "Warning" | "Reached" | "Over budget" | null
};
```

### `constants.ts`

```ts
export const COLOR_WARNING = "#FFB800";
export const COLOR_REACHED = "#F39C12";
export const COLOR_OVER    = "#E74C3C";
```

(`COLOR_OK` is the category's identity color, passed in to `deriveThresholdState`.)

### `deriveState.ts`

```ts
export function deriveThresholdState(
  spent: number,
  threshold: number,
  categoryColor: string
): ThresholdState {
  if (threshold <= 0) {
    return { level: "none", percent: 0, fillRatio: 0, color: categoryColor, pillLabel: null };
  }
  const ratio = spent / threshold;
  const percent = Math.round(ratio * 100);
  const fillRatio = Math.min(Math.max(ratio, 0), 1);

  if (spent > threshold)        return { level: "over",    percent, fillRatio, color: COLOR_OVER,    pillLabel: "Over budget" };
  if (spent >= threshold)       return { level: "reached", percent, fillRatio, color: COLOR_REACHED, pillLabel: "Reached" };
  if (spent >= threshold * 0.7) return { level: "warning", percent, fillRatio, color: COLOR_WARNING, pillLabel: "Warning" };
  return { level: "ok", percent, fillRatio, color: categoryColor, pillLabel: null };
}
```

Boundaries match `src/lib/notifications/thresholdCheck.ts` exactly: `>=` at 70% and 100%, strict `>` for "over."

### `index.ts`

Re-exports `deriveThresholdState`, `ThresholdLevel`, `ThresholdState`.

## Mobile — `lib/notification/`

### `types.ts`

```ts
import type { CategoryDisplayName, CategoryKey } from "../../types";

// NotificationLevel mirrors the web Prisma enum.
export type NotificationLevel = "WARNING_70" | "REACHED_100" | "EXCEEDED";

export type AlertNotificationData = {
  category: CategoryDisplayName;
  level: NotificationLevel;
  monthKey: string;
};

export type ParsedDeepLink = {
  categoryKey: CategoryKey;
  monthKey: string;
};
```

### `parseDeepLink.ts`

Pure. Reads `notification.request.content.data` (typed `unknown` from `expo-notifications`), validates shape, maps `category` (display name) → `CategoryKey` via `displayNameToKey` from `types/index.ts`. Returns `null` on any failure.

```ts
export function parseAlertNotification(
  notification: Notifications.Notification
): ParsedDeepLink | null {
  const data = notification.request?.content?.data as Record<string, unknown> | undefined;
  if (!data) return null;
  const { category, monthKey } = data;
  if (typeof category !== "string" || typeof monthKey !== "string") return null;
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(monthKey)) return null;
  const categoryKey = displayNameToKey[category as CategoryDisplayName];
  if (!categoryKey) return null;
  return { categoryKey, monthKey };
}
```

`level` is read for completeness but not used for routing.

### `index.ts`

Re-exports `parseAlertNotification` + types.

## Mobile — `lib/monthKey.ts`

```ts
export function currentMonthKey(): string {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}
```

Used by the category detail page (always current month) and (defensively) by the deep-link routing if the payload is malformed and we still want to land somewhere reasonable.

## Mobile — `components/CategoryCard.tsx`

Behavior changes:

1. **Re-enable navigation.** Drop the `navigationEnabled = false` flag and the early-return in `handlePress`.
2. **Drop the count subtitle.** Remove the `<Text>` line that renders `transactionCount`. After this change, `CategoryData.transactionCount` has no consumer (the detail page header reads `transactions?.length` from the API response, not from `CategoryData`), so drop the field from `CategoryData` and from `deriveCategoryData` in `lib/categories.ts` in the same PR.
3. **Replace the hardcoded bar** (`amount/500`) with `deriveThresholdState(category.amount, category.threshold, category.color)`.
4. **Add the state pill** next to the category name when `state.pillLabel !== null`.
5. **Add the `$X of $Y · NN%` row** under the bar when `state.level !== "none"`.

When `state.level === "none"` (revenue, or expense category with `threshold <= 0`): no bar, no `$/$` row, no pill — card collapses to icon + name + amount. Intentional minimalism, not a bug.

## Mobile — `app/(app)/category/[id].tsx`

Replace the mockData import with `fetchCategoryTransactions` from `services/api.ts`. The page becomes:

1. Read `id` from `useLocalSearchParams`. Compute `monthKey = currentMonthKey()`.
2. Read the home-query cache for `report` + `thresholds` via `useQuery({ queryKey: ["currentMonthReport", user?.email], queryFn: fetchCurrentMonthReport, enabled: !!user?.email })` — TanStack dedupes; warm cache returns instantly, cold-start deep-link fetches.
3. Run `useQuery({ queryKey: ["categoryTransactions", monthKey, id], queryFn: () => fetchCategoryTransactions({ key, monthKey }), enabled: !!id })`.
4. Compute `spent` from the report row (via `(report as Record<string, number>)[id] ?? 0`) and `threshold` from the thresholds row (or 0 for revenue).
5. Compute `state = deriveThresholdState(spent, threshold, categoryInfo?.color ?? "#6366F1")`.
6. Render header (back button + icon + name + transaction count) → unified hero card → transactions list.

**Hero card shape** (variant C from the brainstorm):

- Top row: left = "Spent" / "Earned" label + big colored amount; right = "Limit" label + threshold value (omitted when `state.level === "none"`).
- Bar: full-width, height 8, `state.color` fill, `state.fillRatio * 100%` width.
- Bottom row: `NN% of budget` left, state pill chip right.

When `state.level === "none"`: hero collapses to just the amount block.

**Transaction list:**
- `<TransactionItem>` accepts a new `CategoryTransaction` shape; old `Transaction` type removed.
- New optional prop `isPending?: boolean` renders a small "Pending" chip before the amount.
- Empty list → existing 📭 placeholder.
- Loading → existing `ActivityIndicator`.
- Error → "Try again" pattern matching the home screen's error UI.

## Mobile — `hooks/usePushNotifications.ts`

Three changes:

1. **Cold-start handling.** Inside the `if (!enabled) return;` guard, before subscribing live listeners, run an IIFE:

   ```ts
   const last = await Notifications.getLastNotificationResponseAsync();
   if (cancelled || !last) return;
   const parsed = parseAlertNotification(last.notification);
   if (parsed) router.push(getCategoryRoute(parsed.categoryKey));
   ```

   `cancelled` is captured from the `useEffect` cleanup so a sign-out mid-flight doesn't push a route.

2. **Replace the `responseListener` console.log** with a real handler:

   ```ts
   responseListener.current = Notifications.addNotificationResponseReceivedListener((response) => {
     const parsed = parseAlertNotification(response.notification);
     if (parsed) router.push(getCategoryRoute(parsed.categoryKey));
   });
   ```

3. **Add `useRouter` to the hook** (`expo-router` is already a dep).

The hook is already auth-gated by `enabled` (which is bound to `state.isAuthenticated` in `AuthContext`), so signed-out taps short-circuit before any routing logic runs. This matches Q4-B: cold-start friendly, current-month only, drop intent on signed-out tap.

## Mobile — `components/TransactionItem.tsx`

- Prop type changes from `Transaction` to `CategoryTransaction`.
- Optional `isPending?: boolean` adds a small "Pending" chip before the amount when true.
- Date formatting and amount formatting unchanged.

## Sign-conventions, edge cases

- `key=revenue` returns rows with negative `amount` (Plaid convention); the existing UI's `isIncome = amount < 0` branch flips the display.
- Soft-deleted rows are excluded server-side; threshold totals on home/hero use the `Report` row, which `computeReportTotals` already excluded soft-deleted from. No mismatch.
- Pending rows ARE returned and DO contribute to home totals (matches `computeReportTotals` which doesn't filter pending). The "Pending" badge is informational only.
- `userCategoryOverride` semantics: a row with `category=["food & drink"]` but `userCategoryOverride="Groceries"` appears in `key=groceries` results, NOT `key=foodAndDrink` results. This matches the home totals.

## Testing strategy

Mobile has no test framework (consistent with prior specs). Verification is via standalone scripts under `scripts/` and real-device smoke tests.

| Layer | Verification |
|---|---|
| `GET /api/mobile/category-transactions` happy path | `curl -H "Authorization: Bearer <token>" '$URL/api/mobile/category-transactions?key=foodAndDrink&monthKey=2026-05'` → 200, sorted desc by date, no `userSoftDeleted` rows, `categoryOverridden` correct. |
| Endpoint validation | Bad `key` → 400; bad `monthKey` → 400; missing bearer → 401; unauthorized user → 401; `key=foster` with no spend → 200 + empty array. |
| Endpoint override semantics | New script `scripts/test-category-transactions.ts` — toggle a row's `userCategoryOverride` and assert the row appears under the new key, disappears from the old. |
| Endpoint amount semantics | Same script — set `userAmountOverride` and assert the response amount reflects it. |
| Endpoint sign convention | `key=revenue` → amounts come back negative; mobile UI flips for display. |
| `deriveThresholdState` | New script `scripts/test-threshold-state.ts` (web side, since the math mirrors `thresholdCheck.ts`) — assert level/percent/fillRatio/pillLabel for the 70% / 100% / over boundaries and the threshold=0 short-circuit. |
| `parseAlertNotification` | New script `scripts/preview-deeplink.ts` (mobile side) — feeds valid alert payload, missing `monthKey`, unknown category, non-alert notification. Asserts `ParsedDeepLink \| null`. |
| Mobile category page — happy path | Real device: tap a card with spend → hero loads, transactions render. |
| Mobile category page — empty state | Soft-delete all current-month rows for a category → 📭 empty state, hero shows the cached Report total. |
| Mobile category page — error state | Stop dev server → "Try again" button. |
| Mobile category page — cold start | Quit app, force a threshold breach, fire `scripts/fire-sync-webhook.ts`, tap from lock screen → app launches, signs in, lands on category page. |
| Mobile category page — warm app | App in foreground, fire webhook, tap in-app banner → routes to category. |
| Mobile category page — signed-out tap | Sign out, tap a stale notification → app opens to `/login`, no crash. |
| Threshold visuals — home | Set thresholds: groceries $400, food&drink $1, foster $0. Force totals: groceries $290 (warning), food $5 (over), foster $50 (no bar). Verify pills + colors + bars. |
| Threshold visuals — detail | Same scenarios; hero color/border/pill match the home card. |
| `mockData.ts` deletion | `pnpm tsc --noEmit` (mobile) clean — no lingering imports. Grep returns zero hits. |

## Risks

| Risk | Mitigation |
|---|---|
| `resolveCategory` divergence between the new endpoint and `computeReportTotals` | Both paths import `resolveCategory` from `src/lib/reports/draftReport.ts`; endpoint must not duplicate the logic. |
| Cold-start tap arrives mid-auth-verification | Hook only runs cold-start IIFE when `enabled === true` (post-auth). `cancelled` flag in cleanup handles enabled true→false. |
| User taps stale notification for a category whose threshold is now 0 | Hero collapses to the spend block; transactions list still loads. No crash. |
| Malicious push payload via future Expo channel hijack | `parseAlertNotification` returns `null` on anything outside the known display-name set + month-key regex. Auth still gates the page. |
| Web returns 400 for a deep-link with a category key the binary knows but the server has retired | "Try again" error UI, user lands on a known route. Same recovery as any endpoint failure. |
| Empty transactions array but non-zero `report.<key>` (grace-window race) | Hero shows the spend, list shows 📭. Surface, don't paper over. |
| `services/mockData.ts` deletion misses an import | `pnpm tsc --noEmit` catches it; grep verifies zero hits. |
| Hero state pill misaligns when category color is unusually dark | The `${state.color}26` (~15%) chip background works against the card's dark theme. Hand-verified for all 11 categories. |

## Phasing

Single PR — three strands ship together.

1. Web — `/api/mobile/category-transactions` route + `_utils/` helpers + script.
2. Mobile — `lib/threshold/`, `lib/notification/`, `lib/monthKey.ts` (new); `services/api.ts`, `types/index.ts` (additions); `hooks/usePushNotifications.ts` (cold-start + response listener); `components/CategoryCard.tsx`, `components/TransactionItem.tsx`, `app/(app)/category/[id].tsx` (rewrites); `services/mockData.ts` (deletion); preview-deeplink script.
3. Real-device verification — both warm and cold-start tap paths; threshold visual sweep across `none`/`ok`/`warning`/`reached`/`over`.

## Open follow-ups (not in this design)

- Selectable month on category detail page.
- Mobile transaction edit (override category, soft-delete).
- Foreground in-app banner restyling.
- Per-category notification opt-out / mute.
- Recovery alerts ("you're back under budget").
- Multi-device management UI.

## Spec self-review

- **Placeholders:** none.
- **Internal consistency:** the file layout in §Architecture matches the per-section detail. The cross-repo touch list in §Phasing matches the file layout. The threshold-bar math in §`deriveState.ts` matches the boundary description in §Q2 of the decisions log and the existing `thresholdCheck.ts` boundaries called out in §Risks.
- **Scope:** focused — one endpoint, one new pure helper for threshold state, one parser for deep-links, one rewrite of the category page, one update to `<CategoryCard>`. Single-PR-sized.
- **Ambiguity check:** "always show current month" is stated explicitly; deep-link `monthKey` is parsed for validation but not consumed for routing. Sign convention is called out twice (endpoint preserves, mobile flips on display) so neither side accidentally double-flips. `state.level === "none"` collapse behavior is described for both `<CategoryCard>` and the hero.
