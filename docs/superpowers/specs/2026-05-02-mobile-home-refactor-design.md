# Mobile Home Screen Refactor + Phase 2 Push Wiring + SDK 55 Bump — Design

**Date:** 2026-05-02
**Status:** Brainstorm complete, awaiting user review before writing-plans
**Author:** Alex (with Claude)

## Summary

Refactor `finance-tracker-mobile` so its home screen renders the user's real ongoing-month report (currently it reads `services/mockData.ts`). At the same time, finish the Phase 2 push-notifications work that was deferred from `2026-04-30-push-notifications-and-thresholds-design.md` (web side: `verifySupabaseJwt`, `/api/push-tokens`, `ExpoPushNotifier`; mobile side: env var unification, persistent UUID `deviceId`, bearer auth on the push-token hook). And bump Expo SDK 54 → 55 with the dependency sweep that ships alongside it.

Sign-in screen is intentionally untouched. The category-detail page stays on `mockData.ts` (its refactor is a separate plan that needs a per-category transactions endpoint).

The work ships in **two PRs** so SDK migration noise doesn't cross-contaminate feature work.

## Goals

- Mobile home screen displays the real current-month report (totals + per-category breakdown) sourced from a new web endpoint.
- Mobile is on Expo SDK 55, RN 0.83.1, React 19.2, expo-router v7. New Architecture only.
- Web has a `verifySupabaseJwt` helper plus a small `requireMobileUser(req)` wrapper used by every mobile-targeted endpoint.
- `POST /api/push-tokens` and `DELETE /api/push-tokens` are live on web and used by mobile.
- `ExpoPushNotifier` ships and is selected by `getDefaultNotifier(userId)` whenever the user has any registered `PushToken` rows; falls back to email otherwise.
- Mobile `usePushNotifications` is fixed: env var is unified, `deviceId` is a persistent UUID via `expo-secure-store`, and registration uses `Authorization: Bearer <token>` instead of an `email` body field.
- `foster` category is added to the mobile data model (mobile previously had 10 expense categories; web has 11).

## Non-goals

- No threshold-progress visualization on home cards (data is plumbed through, UI is a follow-up).
- No category-detail page refactor — it stays on `mockData.ts` for now.
- No notification tap deep-linking — payload carries `{category, level, monthKey}` for future use, mobile just opens to home on tap.
- No NativeWind v5 / Tailwind v4 migration (NativeWind v5 is preview-only as of May 2026).
- No async-storage v3 bump (recent major; not bundling with the SDK migration).
- No TypeScript 6 bump.
- No multi-device management UI (registration works; no UI to view/revoke per-device).
- No sign-in screen changes.

## Decisions log (from brainstorm Q&A)

| # | Question | Decision |
|---|---|---|
| Q1 | Scope of refactor | A + B: home screen real data **plus** full Phase 2 push wiring (web + mobile). Threshold visuals on home deferred. |
| Q2 | How mobile fetches the report | Approach A: new `/api/mobile/current-month-report` endpoint with Supabase JWT bearer auth, mirroring the push-tokens auth pattern. |
| Q3 | Version upgrade aggressiveness | Approach A: latest stable everything, including major bumps. NativeWind v5 + Tailwind v4 + async-storage v3 explicitly excluded — they're either preview or not appropriate to bundle with this work. |
| Q4 | Foster category | Approach A: add to mobile to keep the data model aligned with web. |
| Architecture | Where the logic lives | Approach 1: thin endpoint, fat client. Web returns the raw `Report` row + `ExpenseThreshold` row + a pre-formatted `monthLabel`. Mobile owns display logic. |
| Order | Bump SDK first or last | First, in its own PR, before any feature work. |

## Architecture

### One-paragraph overview

Mobile gets real data by calling a new web endpoint authed with the same Supabase JWT bearer pattern used by `/api/push-tokens`. The push-tokens endpoint and `ExpoPushNotifier` (deferred from the prior spec) ship at the same time, completing the end-to-end push pipeline. The mobile push hook is fixed in three ways called out in the prior spec. SDK 55 bump is a separate PR that lands first.

### Web-side new files

```
src/lib/auth/
  verifySupabaseJwt.ts        # HS256 verify via jose, returns {email, sub} | null
  requireMobileUser.ts        # combines verifySupabaseJwt + User lookup, returns {user} | Response

src/app/api/mobile/current-month-report/
  route.ts                    # GET — { report, thresholds, monthLabel }

src/app/api/push-tokens/
  route.ts                    # POST + DELETE
```

### Web-side edited files

```
src/lib/notifications/notifier.ts
  + ExpoPushNotifier class
  + getDefaultNotifier(userId) is now per-user; selects ExpoPushNotifier when user has PushToken rows, EmailNotifier otherwise. DRY_RUN still wins.

src/lib/notifications/templates.ts
  + formatAlertPush(alert) — title/body/data/channelId/sound shape from prior spec

src/lib/notifications/thresholdCheck.ts
  Thread userId into the getDefaultNotifier() call (one-line change).

.env.example
  + SUPABASE_JWT_SECRET
```

### Mobile-side new files

```
services/api.ts
  authenticatedFetch(path, init?)       — bearer auth helper
  fetchCurrentMonthReport()
  postPushToken({token, deviceId})
  deletePushToken({token})

lib/categories.ts
  deriveCategoryData(report, thresholds) — pure helper; folds Report + ExpenseThreshold into CategoryData[]
```

### Mobile-side edited files

```
app/(app)/index.tsx               # one useQuery against fetchCurrentMonthReport, replaces mock calls
hooks/usePushNotifications.ts     # env var unified, UUID deviceId, bearer auth
context/AuthContext.tsx           # call usePushNotifications(state.isAuthenticated); sign-out path captures token before signOut
types/index.ts                    # + foster (key, displayName, icon 🏠, color)
```

### Mobile-side intentionally untouched

```
app/(auth)/login.tsx              # sign-in stays
app/(app)/category/[id].tsx       # still mock-data; out of scope
services/mockData.ts              # still imported by the category page
```

## Web — endpoint and helper details

### `verifySupabaseJwt.ts`

Spec'd verbatim in the prior doc (`2026-04-30-push-notifications-and-thresholds-design.md` § "Supabase JWT verification"). Uses `jose` (already a dep). Reads `SUPABASE_JWT_SECRET` from env. Returns `{email, sub}` on success, `null` on any failure. ~25 lines.

### `requireMobileUser.ts`

Small wrapper that combines JWT verification with the User lookup so route handlers stay tight:

```typescript
export type RequireMobileUserResult =
  | { ok: true; user: { id: string; email: string } }
  | { ok: false; response: Response };

export async function requireMobileUser(req: Request): Promise<RequireMobileUserResult> {
  const auth = await verifySupabaseJwt(req);
  if (!auth) {
    return { ok: false, response: Response.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  const user = await prisma.user.findUnique({
    where: { email: auth.email },
    select: { id: true, email: true },
  });
  if (!user) {
    return { ok: false, response: Response.json({ error: "User not found" }, { status: 404 }) };
  }
  return { ok: true, user };
}
```

Three endpoints will use it.

### `GET /api/mobile/current-month-report/route.ts`

```typescript
export async function GET(req: Request) {
  const auth = await requireMobileUser(req);
  if (!auth.ok) return auth.response;

  const now = new Date();
  const month = now.getUTCMonth() + 1;
  const year = now.getUTCFullYear();
  const monthLabel = now.toLocaleString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });

  const [report, thresholds] = await Promise.all([
    prisma.report.findFirst({
      where: {
        userId: auth.user.id,
        month, year,
        reportType: "MONTHLY",
        autoMaintainedAt: { not: null },
      },
    }),
    prisma.expenseThreshold.upsert({
      where: { userId: auth.user.id },
      update: {},
      create: { userId: auth.user.id },
    }),
  ]);

  return Response.json({
    success: true,
    response: { report, thresholds, monthLabel },
  });
}
```

`report` is `null` when no current-month auto-maintained report exists yet (brand new user, or month boundary before any sync). Mobile renders an empty state in that case.

### `POST` / `DELETE /api/push-tokens/route.ts`

Body shapes and behavior already specified in the prior spec. Both handlers use `requireMobileUser`. Idempotent. Cross-user device-rotation handled by deleting any existing row owning the same `token` value before upserting.

### `ExpoPushNotifier`

Implements the `Notifier` interface. POSTs to `https://exp.host/--/api/v2/push/send`, one message per (alert × token). On `DeviceNotRegistered` errors from Expo's response, deletes the offending `PushToken` row.

### `getDefaultNotifier(userId)` — per-user dispatcher

Currently signature is `getDefaultNotifier(): Notifier`. Becomes `getDefaultNotifier(userId: string): Promise<Notifier>`. Logic:

1. If `DRY_RUN_NOTIFICATIONS === "true"` → `DryRunNotifier`. (Unchanged precedence.)
2. Else, query `prisma.pushToken.count({ where: { userId } })`. If `> 0` → `ExpoPushNotifier`. Else → `EmailNotifier`.

Caller change in `thresholdCheck.ts`:

```diff
- notifier: Notifier = getDefaultNotifier(),
+ notifier: Notifier = await getDefaultNotifier(userId),
```

(Default args can't await — actual change is to do the lookup inside the function body if `notifier` arg is `undefined`. Equivalent shape.)

### `formatAlertPush`

Already specified in prior doc. Pure function in `templates.ts`.

## Mobile — file-by-file behavior

### `services/api.ts`

```typescript
const BASE_URL = process.env.EXPO_PUBLIC_MONEYEYE_URL ?? "http://localhost:3000";

export class NotAuthenticatedError extends Error {}

async function getBearer(): Promise<string> {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) throw new NotAuthenticatedError("No active session");
  return token;
}

async function authenticatedFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = await getBearer();
  const url = `${BASE_URL.replace(/\/$/, "")}${path}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      ...init.headers,
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
  });
  if (res.status === 401) throw new NotAuthenticatedError("Unauthorized");
  const json = await res.json();
  if (!res.ok || json?.success === false) {
    throw new Error(json?.error ?? `HTTP ${res.status}`);
  }
  return json.response as T;
}

export type CurrentMonthResponse = {
  report: ReportRow | null;
  thresholds: ExpenseThresholdRow;
  monthLabel: string;
};

export const fetchCurrentMonthReport = () =>
  authenticatedFetch<CurrentMonthResponse>("/api/mobile/current-month-report");

export const postPushToken = (body: { token: string; deviceId: string }) =>
  authenticatedFetch<void>("/api/push-tokens", {
    method: "POST",
    body: JSON.stringify(body),
  });

export const deletePushToken = (body: { token: string }) =>
  authenticatedFetch<void>("/api/push-tokens", {
    method: "DELETE",
    body: JSON.stringify(body),
  });
```

`ReportRow` and `ExpenseThresholdRow` are typed in `types/index.ts` (see below).

### `app/(app)/index.tsx`

Replace the existing two `useQuery` calls with one:

```typescript
const { data, isLoading, error, refetch } = useQuery({
  queryKey: ["currentMonthReport"],
  queryFn: fetchCurrentMonthReport,
});

const categories = useMemo(
  () => (data?.report ? deriveCategoryData(data.report, data.thresholds) : []),
  [data]
);
```

Branches:
- `isLoading && !refreshing` → existing `ActivityIndicator` + "Loading your finances…"
- `error` → "Couldn't load your report." + "Try again" `Pressable` calling `refetch`
- `data?.report === null` → empty state: "No report yet for {data.monthLabel}. We'll build one as soon as your bank syncs."
- otherwise → existing layout (header, `<ExpenseSummary>`, list of `<CategoryCard>`s)

`<ExpenseSummary>` props come from the report row directly (`report.expenses`, `report.revenue`, `report.total`, `data.monthLabel`).

`<CategoryCard>`'s `transactionCount` is dropped from the API in v1 (would require joining `SyncedTransaction` rows; doubles the query). For now, the card either hides the count or shows "—". When the category-detail page is refactored, it'll fetch its own transactions.

### `lib/categories.ts`

```typescript
export function deriveCategoryData(
  report: ReportRow,
  thresholds: ExpenseThresholdRow
): CategoryData[] {
  return CATEGORIES
    .map((cat) => {
      const amount = (report as Record<string, number>)[cat.key] ?? 0;
      const threshold = (thresholds as Record<string, number>)[cat.key] ?? 0;
      return { ...cat, amount, threshold, transactionCount: 0 };
    })
    .filter((c) => c.amount > 0 || c.key === "revenue")
    .sort((a, b) => {
      if (a.key === "revenue") return 1;
      if (b.key === "revenue") return -1;
      return b.amount - a.amount;
    });
}
```

`threshold` is plumbed through but unused by current UI — added now so the future threshold-visualization refactor doesn't need a re-fetch.

### `hooks/usePushNotifications.ts`

Three changes:

1. **Env var unified.** Both `register` and `unregister` go through `services/api.ts`'s `authenticatedFetch`, which reads `EXPO_PUBLIC_MONEYEYE_URL` once. The hook itself no longer reads any env vars.

2. **Persistent UUID `deviceId`** via the helper from the prior spec:

```typescript
async function getOrCreateDeviceId(): Promise<string> {
  let id = await SecureStore.getItemAsync("device_id");
  if (!id) {
    id = Crypto.randomUUID();
    await SecureStore.setItemAsync("device_id", id);
  }
  return id;
}
```

3. **Bearer auth via `services/api.ts`.** Hook signature changes from `usePushNotifications(userEmail?)` to `usePushNotifications(enabled: boolean)`. The `enabled` flag is `true` once `AuthContext` knows the user is authenticated; `false` otherwise (no permission prompt before sign-in). Internally, registration and unregistration call `postPushToken` / `deletePushToken` from `services/api.ts` — no email body, no manual headers.

The exported `unregisterPushToken(token)` helper is rewritten to call `deletePushToken({ token })`.

### `context/AuthContext.tsx`

- Replace `usePushNotifications(state.user?.email || undefined)` with `usePushNotifications(state.isAuthenticated)`.
- Sign-out path: capture `expoPushToken` before `supabase.auth.signOut()` (already does this); the `unregisterPushToken` call now uses `deletePushToken` under the hood — best-effort with try/catch.

### `types/index.ts`

Append `foster` to:
- `CategoryKey` union
- `CategoryDisplayName` union (display: "Foster")
- `CATEGORIES` array — pick `🏠` icon and a warm color (e.g., `#F39C12`)
- `displayNameToKey` map

Add new types for the mobile API response:

```typescript
export type ReportRow = {
  id: number;
  reportName: string;
  reportType: "MONTHLY" | "ANNUAL";
  createdAt: string;
  month: number;
  year: number;
  foodAndDrink: number;
  billsAndUtilities: number;
  car: number;
  entertainment: number;
  groceries: number;
  healthAndWellness: number;
  personal: number;
  shopping: number;
  feesAndAdjustments: number;
  others: number;
  foster: number;
  revenue: number;
  expenses: number;
  total: number;
};

export type ExpenseThresholdRow = {
  id: string;
  userId: string;
  foodAndDrink: number;
  billsAndUtilities: number;
  car: number;
  entertainment: number;
  groceries: number;
  healthAndWellness: number;
  personal: number;
  shopping: number;
  feesAndAdjustments: number;
  others: number;
  foster: number;
};
```

The existing `Report` type stays as the legacy mock shape; `mockData.ts` can keep using it. The category page may need a small update so it tolerates `foster` as a `CategoryKey` (the union widening is the change; the page reads from mockData which doesn't have foster transactions, so empty list is fine).

## Version upgrade plan (PR 1)

### What changes

| Package | From | To | Why |
|---|---|---|---|
| expo | ~54.0.30 | ~55.0.x | SDK bump |
| expo-* (all) | various | ~55.x.x | Unified versioning per SDK 55 |
| react | 19.1.0 | 19.2.x | SDK 55 pairing |
| react-dom | 19.1.0 | 19.2.x | "" |
| @types/react | ~19.1.0 | ~19.2.x | "" |
| react-native | 0.81.5 | 0.83.1 | "" |
| react-native-reanimated | ~4.1.1 | 4.3.x | RN ecosystem minor |
| react-native-screens | ~4.16.0 | 4.24.x | "" |
| react-native-gesture-handler | ~2.28.0 | 2.31.x | "" |
| react-native-safe-area-context | ^5.6.2 | 5.7.x | "" |
| react-native-worklets | 0.5.1 | 0.8.x | Verify reanimated peer-dep |
| @supabase/supabase-js | ^2.89.0 | ^2.105.x | Routine minor |
| @tanstack/react-query | ^5.90.15 | ^5.100.x | Routine minor |
| @react-native-google-signin/google-signin | ^16.1.1 | ^16.1.2 | Patch |

### What does *not* change

| Package | Held at | Reason |
|---|---|---|
| nativewind | 4.2.x | v5 is preview-only |
| tailwindcss | 3.4.x | Only matters if NativeWind v5 |
| @react-native-async-storage/async-storage | 2.x | v3 is fresh; not bundling with SDK migration |
| typescript | 5.9.x | v6 is transitional |

### Required code/config changes

1. `app.json`:
   - Remove `android.useNextNotificationsApi: true` (deprecated/no-op).
   - Verify `expo-notifications` config plugin is present (it already is).
   - Verify `experiments.typedRoutes: true` still works (it does in v7).
2. Grep for `Stack.Screen` `reset` prop — not used in this codebase, so no rename needed.
3. `expo-notifications` 55 throws (was: warns) on Expo Go Android. Not relevant — this app uses `expo-dev-client`.
4. `npx expo prebuild --clean` — regenerates `ios/` (picks up the `EXNotifications` → `ExpoNotifications` pod rename for free) and `android/`.

### Procedure

1. Branch off main.
2. `npx expo install expo@^55.0.0 --fix`
3. `npx expo install --fix`
4. Apply `app.json` cleanups.
5. `pnpm install`
6. `npx expo prebuild --clean`
7. `pnpm tsc --noEmit`
8. Run on iOS simulator + physical Android device.
9. Smoke test: app boots, sign-in works, navigation works, NativeWind classes render, push permission prompt appears on a fresh install.
10. Commit, push, PR.

No feature changes. Roll back is `git revert` the one PR.

## Testing strategy

Mobile has no test framework. Verification is via real device + standalone web scripts.

| Layer | Verification |
|---|---|
| SDK 55 bump (PR 1) | Boots on iOS sim, boots on physical Android. Sign-in works. Navigation works. NativeWind styles render. No console warnings about deprecated APIs. |
| `verifySupabaseJwt` | New web script `scripts/verify-supabase-jwt.ts` — paste a real Supabase access token (grab from RN debug console), prints `{email, sub}` on success or `null`. Catches secret mismatches before deploy. |
| `requireMobileUser` | Covered transitively by endpoint smoke tests below. |
| `GET /api/mobile/current-month-report` | curl with real bearer → 200 + correct shape; no header → 401; bearer for an unknown email → 404. Verify `report: null` path by clearing the current-month auto-maintained Report row in dev. |
| `POST /api/push-tokens` | curl with real bearer + `{token, deviceId}` → 200; idempotent re-POST → still 200, single row. POST with same `token` from a different bearer → original row deleted, new row created. |
| `DELETE /api/push-tokens` | curl → 200, row gone; second DELETE → still 200, idempotent. |
| `ExpoPushNotifier` | Force a threshold breach (lower a threshold below current spend in `/thresholds`), trigger a sync via `scripts/fire-sync-webhook.ts`, watch for the push notification on a real registered device. |
| Mobile home screen | Real device, real session, real network. Confirm: report renders with real numbers; pull-to-refresh works; sign-out path deletes the `PushToken` row (verify in Prisma Studio); re-sign-in re-registers. |
| Empty state | Clear the current-month Report row in dev — verify "No report yet" copy renders. |
| Error state | Stop dev server with app foregrounded, refresh — verify error UI + retry button. |
| Foster category | Insert a synthetic `foster: 50` value into a Report row in dev, observe Foster card renders correctly with icon/color. |
| Cross-device | Register the same user on a second physical device. Both rows persist. Force a threshold breach. Both devices receive the push. |

## Phasing

### PR 1 — SDK 55 bump (no feature changes)

- Section 4 work only.
- Lands first.
- App still works against `mockData.ts` for the home screen and the broken push hook (registration call still 404s against the not-yet-built endpoint, which is fine because the hook swallows errors).

### PR 2 — Home screen real data + Phase 2 push end-to-end

- All web changes (sections 2a–2e).
- All mobile changes (sections 3a–3e).
- Ships behind `DRY_RUN_NOTIFICATIONS=true` initially. Flip after verifying a real push reaches a real device.

## Risks

| Risk | Mitigation |
|---|---|
| SDK 55 surfaces a NativeWind / RN-CSS-interop incompatibility we don't see until runtime | SDK bump lands in its own PR; smoke-test on real device before PR 2 builds anything on top. Roll back is `git revert` the one PR. |
| `SUPABASE_JWT_SECRET` mismatch in prod (silent 401s) | `scripts/verify-supabase-jwt.ts` tests secret + token roundtrip *before* deploying. Canary the first push-token POST in prod logs. |
| Bearer captured *after* Supabase signOut → 401 on unregister | Capture bearer before signOut; try/catch on the unregister call. Orphaned `PushToken` row gets cleaned on next dispatch via `DeviceNotRegistered`. |
| Mobile/web Report shape drift | Mobile reads only known keys via `deriveCategoryData`; unknown fields ignored. Foster being added now is the canary that this works. |
| Concurrent webhooks racing the push dispatch | Already mitigated by Phase 1's insert-log-first / dispatch-second ordering in `thresholdCheck.ts`. No new risk. |
| `expo-notifications` 55 silently changes permission re-prompt behavior | Re-test on a fresh install (uninstall, reinstall, sign in, observe prompt). |
| User authenticated on web but not mirrored to our `User` table | Endpoint returns 404; mobile shows "User not found" and forces sign-out. Same model as web's `isUserAuthorized`. |
| `ExpoPushNotifier` fan-out is N alerts × M tokens — can spam Expo's API | Acceptable at current scale. If volume grows, batch in groups of 100 (Expo's documented chunk size). Out of scope for this round. |

## Open follow-ups (not in this design)

- Threshold-progress visualization on `<CategoryCard>`.
- Category-detail page → real per-category transactions endpoint + mobile rewrite.
- Notification tap deep-linking (data payload is already there).
- Multi-device management UI.
- NativeWind v5 / Tailwind v4 migration.
- `async-storage` v3 bump.
- Sign-in screen redesign.

## Spec self-review

- **Placeholders:** none.
- **Internal consistency:** the file-touch lists in §Architecture and the per-section detail sections agree. The two PRs in §Phasing match the work decomposition in §Architecture.
- **Scope:** focused enough for a single implementation plan that itself splits into two PRs. The three independent strands (SDK bump, web API, mobile UI) are decoupled enough for subagent-driven execution but tightly coupled in commits.
- **Ambiguity check:** `transactionCount` on `<CategoryCard>` is explicitly downgraded to "—" in v1 — called out so the reviewer doesn't expect counts. `getDefaultNotifier` signature change is called out (becomes per-user / async).
