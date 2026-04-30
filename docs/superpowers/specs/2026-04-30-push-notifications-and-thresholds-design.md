# Push Notifications and Spending Thresholds — Design

**Date:** 2026-04-30
**Status:** Brainstorm complete, awaiting user review before writing-plans
**Author:** Alex (with Claude)

## Summary

Add user-configurable per-category spending thresholds, plus a check-and-notify pipeline that fires alerts when monthly spend crosses 70% of, reaches 100% of, or exceeds the threshold for any category. Phase 1 ships email-only via the existing SendGrid integration. Phase 2 wires up Expo push notifications to the existing `finance-tracker-mobile` app once it's ready.

The full end-to-end flow is designed up front so the architecture has the right seams (a `Notifier` interface, a clean check function, idempotent integration points). Phase 1 implementation lands the threshold half plus the email-shaped half of the pipeline; Phase 2 is a follow-up plan that drops in `ExpoPushNotifier`, the `/api/push-tokens` endpoint, and the mobile-side cleanups.

## Goals

- A user can set per-category dollar thresholds via a new `/thresholds` page in the web app.
- After every Plaid sync and after every AI categorize cron run, the system checks each category's monthly spend against the user's threshold and fires alerts at three levels: 70% reached, 100% reached, exceeded.
- Each alert fires at most once per `(user, category, level, month)`.
- v1 delivers via email; v2 delivers via Expo push to registered mobile devices.
- The categorize cron also fixes a latent gap (it doesn't recompute monthly `Report` totals after changing categorizations).

## Decisions log (from brainstorming Q&A)

| # | Question | Decision |
|---|---|---|
| Q1 | Scope of this brainstorm | Full end-to-end design; implementation phased — thresholds + email first, push later |
| Q2 | Threshold model | One `ExpenseThreshold` row per user, per-category dollar columns (mirrors `Report` shape). Single value applies to current and future months. |
| Q3 | When the check runs | After both Plaid sync (`upsertCurrentMonthDraftReport`) and AI categorize cron. Cron also triggers a recompute for affected users. |
| Q4 | Notification channel | Email now (existing SendGrid), push later (Expo). `Notifier` interface is the seam. |
| Q5 | Categories + defaults | All 11 expense categories thresholdable. Pre-seed Food & Drink $400, Groceries $400, Entertainment $400, Shopping $300. Other 7 default to 0 (silent until user sets). |
| Q6 | Levels + dedupe | Three levels: `WARNING_70`, `REACHED_100`, `EXCEEDED`. Use strict `>` for EXCEEDED, not a `1.01` magic number. Dedupe key = `(userId, category, level, month)`. |
| Q7 | Push provider | Expo Push API. Confirmed by inspecting `finance-tracker-mobile`: `expo-notifications` already configured, EAS `projectId` set, `usePushNotifications.ts` already drafted. |
| Q8 | Mobile auth | Verify Supabase JWT (HS256, shared `SUPABASE_JWT_SECRET`) on `/api/push-tokens`. Bridge Supabase identity to our `User` row via the `email` claim. |
| Q9 | Threshold-change mid-month | Natural dedupe behavior — fire only levels not yet logged. No special clearing of `NotificationLog` on threshold edits. Drops budget below current spend → user gets the new "you're over" alert; raises budget → no re-alert (already informed). |

## Architecture choice

Three options were considered for organizing the check-and-notify pipeline:

- **Inline within sync code** — tightest coupling, hardest to test in isolation.
- **Event-driven** — cleanest separation, requires new event-bus infra not present today.
- **Service module with explicit calls** — chosen. Sibling to `src/lib/reports/draftReport.ts`, follows the established codebase pattern, independently testable, swap channels via DI.

## Data model

Three new Prisma models, two new enums, additive migration only. No changes to existing models.

```prisma
model ExpenseThreshold {
  id                 String   @id @default(uuid())
  userId             String   @unique
  user               User     @relation(fields: [userId], references: [id])
  // Pre-seeded defaults
  foodAndDrink       Float    @default(400)
  groceries          Float    @default(400)
  entertainment      Float    @default(400)
  shopping           Float    @default(300)
  // Available but silent until user sets > 0
  billsAndUtilities  Float    @default(0)
  car                Float    @default(0)
  healthAndWellness  Float    @default(0)
  personal           Float    @default(0)
  feesAndAdjustments Float    @default(0)
  others             Float    @default(0)
  foster             Float    @default(0)
  createdAt          DateTime @default(now())
  updatedAt          DateTime @updatedAt
}

model NotificationLog {
  id        String              @id @default(uuid())
  userId    String
  user      User                @relation(fields: [userId], references: [id])
  category  String              // canonical category name, e.g. "Food & Drink"
  level     NotificationLevel
  month     String              // "YYYY-MM"
  channel   NotificationChannel
  sentAt    DateTime            @default(now())

  @@unique([userId, category, level, month])
  @@index([userId, month])
}

model PushToken {
  id        String   @id @default(uuid())
  userId    String
  user      User     @relation(fields: [userId], references: [id])
  token     String   @unique           // ExpoPushToken[xxx]
  deviceId  String                     // UUID persisted via expo-secure-store
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@unique([userId, deviceId])
  @@index([userId])
}

enum NotificationLevel {
  WARNING_70
  REACHED_100
  EXCEEDED
}

enum NotificationChannel {
  EMAIL
  PUSH
}
```

**Conventions:**

- `ExpenseThreshold.<column> <= 0` means "no threshold for this category — never alert me." Any positive value is checked.
- `NotificationLog.category` stores the canonical Title-Case display name (e.g., `"Food & Drink"`) since it's surfaced in copy and logs. The check loop works in column-key space (e.g., `foodAndDrink`) and only converts to display name at dispatch time.
- `NotificationLog.month` is `"YYYY-MM"` strings (matches the format already used in the existing sketch and trivially derivable from a `Date`).
- `PushToken` uses non-nullable `deviceId` because the mobile hook will always supply a persistent UUID after the cleanups in Phase 2.

**Migration + backfill:**

- Forward-only migration. Adds three tables and two enums; touches nothing existing.
- `prisma/seed.ts` (or a one-shot script under `scripts/`) inserts an `ExpenseThreshold` row for every existing `User` that doesn't already have one. Idempotent. The Prisma `@default` values populate automatically on insert.

## Web API + UI

### Endpoints

- `GET /api/prisma/thresholds` — returns the authenticated user's `ExpenseThreshold` row. If somehow missing, creates it on the fly with schema defaults. Auth: NextAuth session (matches sibling `/api/prisma/*` routes).
- `PUT /api/prisma/thresholds` — body is a partial `{ [columnKey]: amount }` map. Zod validates each key is one of the 11 expense column names and each amount is `>= 0` and `< 1_000_000`. Single `prisma.expenseThreshold.update`. Returns the updated row.

### Page route

- `/thresholds` — top-level route alongside `/insights`, `/reports`, `/transactions`. Add `THRESHOLDS_PAGE: "/thresholds"` to `appRoutes` in `src/utils/constants.ts` and a sidebar entry to the existing nav component.
- `src/app/thresholds/page.tsx` — server component shell (session check + redirect-if-unauth) rendering a `<ThresholdsTable />` client component. Mirrors how `/reports` etc. are structured.

### `<ThresholdsTable />` UI

- One row per expense category, in `CANONICAL_CATEGORIES` order (excluding Revenue).
- Each row: category name + icon, currency input (`startContent="$"`, `min={0}`), inline Save button.
- `0` rendered as muted "No threshold" placeholder when the input is unfocused.
- Save button per row activates only on dirty value; on click, fires `PUT` with just that one column. Optimistic update via TanStack Query.
- Header copy: "Set monthly spending limits per category. Get notified at 70%, 100%, and over budget. Set to 0 to disable alerts for a category."

**Why per-row save:** no dirty-form tracking, no navigation guard, a typo in one row doesn't roll back others.

**Out of scope:** threshold-change history, per-month overrides, "preview alerts that would fire if I drop this to $X", bulk import, reset-to-defaults button.

## Check-and-notify pipeline

New module: `src/lib/notifications/`.

### Module shape

```
src/lib/notifications/
  thresholdCheck.ts      # checkThresholdsAndNotify() — main entrypoint
  notifier.ts            # Notifier interface + EmailNotifier (Phase 1) + ExpoPushNotifier (Phase 2)
  templates.ts           # formatAlertEmail() / formatAlertPush() — pure
  monthKey.ts            # toMonthKey(date) → "YYYY-MM"
  index.ts               # re-exports
```

### Public function

```typescript
export async function checkThresholdsAndNotify(
  userId: string,
  now: Date = new Date(),
  notifier: Notifier = defaultNotifier,
  options: { dryRun?: boolean } = {}
): Promise<{ fired: Alert[] }>;

export type Alert = {
  category: CanonicalCategory;     // "Food & Drink"
  level: NotificationLevel;        // WARNING_70 | REACHED_100 | EXCEEDED
  spent: number;
  limit: number;
  monthKey: string;                // "YYYY-MM"
};
```

### Algorithm

1. Compute `monthKey` from `now` (`"YYYY-MM"`).
2. In parallel, load:
   - The user's `ExpenseThreshold` row.
   - The user's auto-maintained `Report` row for the current month/year (the row populated by `upsertCurrentMonthDraftReport`). If absent, return `{ fired: [] }`.
   - All `NotificationLog` rows for `(userId, month=monthKey)` — one query, all 33 candidate (category × level) combinations.
3. Iterate the 11 expense column keys (`EXPENSE_KEYS` constant: `["foodAndDrink", "billsAndUtilities", "car", "entertainment", "groceries", "healthAndWellness", "personal", "shopping", "feesAndAdjustments", "others", "foster"]`):
   - `limit = thresholds[key]`. If `limit <= 0`, skip.
   - `spent = report[key]` (positive per the `draftReport.ts` sign convention).
   - Cross-check:
     - `WARNING_70` if `spent >= limit * 0.7`
     - `REACHED_100` if `spent >= limit`
     - `EXCEEDED` if `spent > limit` (strict `>`)
   - For each crossed level, look up `(category, level)` in the in-memory `NotificationLog` set. If absent, queue an `Alert`.
4. For each queued alert:
   - If `options.dryRun`, just collect into the return list and continue.
   - Otherwise, `prisma.notificationLog.create` inside a try/catch. On `P2002` (concurrent worker won the race): skip. On success: push onto `dispatched[]`.
5. Single dispatch call: `await notifier.dispatch(userId, dispatched)`. If it throws, log and continue — log rows are already committed, so we won't retry. User misses one alert. Acceptable for v1.

**Why insert-log-first, dispatch-second:** two concurrent webhooks racing the same alert. Insert-first means the loser hits the unique constraint and bails before sending a duplicate. SendGrid + Prisma can't share a transaction; this ordering is the available primitive.

### `Notifier` interface

```typescript
export interface Notifier {
  channel: NotificationChannel;  // EMAIL | PUSH
  dispatch(userId: string, alerts: Alert[]): Promise<void>;
}
```

**`EmailNotifier`** (Phase 1):
- Loads `User.email` for the user.
- Renders one email summarizing all alerts in the batch via `formatAlertEmail`.
- Sends via existing `@sendgrid/mail` setup.
- No-op if alerts array is empty.

**`ExpoPushNotifier`** (Phase 2):
- Loads all `PushToken` rows for the user.
- POSTs to `https://exp.host/--/api/v2/push/send` — one message per alert per token.
- On `DeviceNotRegistered` error from Expo, deletes the offending `PushToken` row.

**`defaultNotifier`:**
- Phase 1: always `EmailNotifier`.
- Phase 2: prefer `ExpoPushNotifier` if the user has any `PushToken` rows; else fall back to `EmailNotifier`. Decision lives in a tiny dispatcher function — no preferences UI in v1 or v2.

### Two integration points

**(1) `upsertCurrentMonthDraftReport` (Plaid webhook path).** Add at end of function, after the existing `update`/`create`:

```typescript
try {
  await checkThresholdsAndNotify(userId, now);
} catch (err) {
  console.error(`Threshold check failed for user=${userId}:`, err);
}
```

The webhook already runs inside `after(...)` — off the request path.

**(2) `categorize-synced-transactions` cron.** Two changes, both required because the cron currently leaves `Report` totals stale:

- For each user whose rows were touched by the categorize loop, call `upsertCurrentMonthDraftReport(userId, now)`. This fixes the latent stale-totals gap.
- Then call `checkThresholdsAndNotify(userId, now)`.

Both wrapped in per-user try/catch so one user's failure doesn't break the loop. Note: `upsertCurrentMonthDraftReport` itself does *not* call the threshold check — only its explicit callers do, so we don't double-fire.

### Safety knob

`DRY_RUN_NOTIFICATIONS=true` env var (read once at module load) flips `defaultNotifier` to a no-op variant that logs intended sends without dispatching. Production deploys can ship with this true and flip after smoke-testing in logs.

## Mobile push registration + JWT auth (Phase 2)

### Backend endpoint

`src/app/api/push-tokens/route.ts` — single file with `POST` + `DELETE` handlers.

**`POST /api/push-tokens`**
- Auth: `Authorization: Bearer <supabase access token>`.
- Body: `{ token: string, deviceId: string }` — no `email` field (sourced from JWT).
- Validation (Zod): `token` matches `/^ExpoPushToken\[.+\]$/`; `deviceId` is a UUID.
- Behavior: in a transaction, delete any existing `PushToken` rows with the same `token` value (handles the cross-user device-rotation case), then upsert on `(userId, deviceId)`. Update existing row's `token` if present.
- Returns: `200 { success: true }`. `401` on bad JWT. `404` if no `User` row matches the JWT email.

**`DELETE /api/push-tokens`**
- Auth: same JWT bearer.
- Body: `{ token: string }`.
- Behavior: `prisma.pushToken.deleteMany({ where: { userId, token } })` — scoped to authenticated user. Idempotent.

### Supabase JWT verification

`src/lib/auth/verifySupabaseJwt.ts`:

```typescript
import { jwtVerify } from "jose";

const SUPABASE_JWT_SECRET = new TextEncoder().encode(
  process.env.SUPABASE_JWT_SECRET!
);

// Returns { email, sub } on success, null on any failure (missing header, bad
// token, missing claim). Route handlers map null → 401 Response themselves —
// keeps this helper free of custom error classes.
export async function verifySupabaseJwt(
  req: Request
): Promise<{ email: string; sub: string } | null> {
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, SUPABASE_JWT_SECRET, {
      audience: "authenticated",
    });
    if (typeof payload.email !== "string") return null;
    return { email: payload.email, sub: payload.sub as string };
  } catch {
    return null;
  }
}
```

Route handler usage:

```typescript
const auth = await verifySupabaseJwt(request);
if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
const user = await prisma.user.findUnique({ where: { email: auth.email } });
if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });
```

- `jose` is already a dep — no new packages.
- `SUPABASE_JWT_SECRET` is the HS256 shared secret from Supabase project settings → API → JWT Settings.
- Bridge from Supabase identity → our `User` row is via the `email` claim (Google sign-in on both web and mobile → same email). If the email has no matching `User`, the endpoint returns 404 — matches the existing authorization model.
- If you ever migrate Supabase to asymmetric JWTs, swap `SUPABASE_JWT_SECRET` for `createRemoteJWKSet` from `jose`. ~5-line change.

### Mobile-side cleanups (in `finance-tracker-mobile` repo)

Three issues found during inspection of the existing `usePushNotifications.ts`:

1. **Env var inconsistency.** Register uses `EXPO_PUBLIC_MONEYEYE_URL`; unregister uses `EXPO_PUBLIC_API_URL`. Standardize on `EXPO_PUBLIC_MONEYEYE_URL`.

2. **Non-unique device ID.** Replace `Device.modelName || Device.deviceName` with a UUID persisted via `expo-secure-store`:

   ```typescript
   import * as SecureStore from "expo-secure-store";
   import * as Crypto from "expo-crypto";

   async function getOrCreateDeviceId(): Promise<string> {
     let id = await SecureStore.getItemAsync("device_id");
     if (!id) {
       id = Crypto.randomUUID();
       await SecureStore.setItemAsync("device_id", id);
     }
     return id;
   }
   ```

   Both deps already in `package.json`.

3. **Replace `email` body field with bearer auth.** Hook signature changes from `usePushNotifications(userEmail?)` to `usePushNotifications(getAccessToken: () => Promise<string | null>)`. The `getAccessToken` is sourced from the existing `AuthContext` / Supabase client. Register/unregister calls attach `Authorization: Bearer <token>` instead of sending `email` in the body.

## Templates

Pure functions in `src/lib/notifications/templates.ts`. No I/O — easy to snapshot-test, trivial to swap copy.

### Email

```typescript
export function formatAlertEmail(
  user: { email: string },
  alerts: Alert[]
): { subject: string; html: string; text: string };
```

**Subject line — count-driven:**
- 1 alert: `"{Category} budget {action}"` — e.g., `"Groceries budget reached 70%"`, `"Shopping over budget"`.
- 2+ alerts: `"{N} budget alerts for {Month Year}"` — e.g., `"3 budget alerts for April 2026"`.

**Body:**
- Greeting tied to count.
- One block per alert: bold category, level label, spend line `$290.00 of $400.00 (73%)`. For `EXCEEDED`, append `· $50.00 over`.
- CTA → `${NEXTAUTH_URL}/thresholds` ("Adjust your thresholds") + secondary → `${NEXTAUTH_URL}/reports` ("See current report").
- Footer: "You're getting this because you have spending thresholds set on MoneyEye."

**Styling:** matches existing `src/utils/emailTemplates.ts`. Reuse layout wrapper if it exists; otherwise mirror inline styles. Same brand color (`#0F0F1A`) as the mobile `app.json`.

**Level copy** centralized in a `LEVEL_COPY` constant:

| Level         | Subject fragment | Body label                |
|---------------|------------------|---------------------------|
| `WARNING_70`  | `reached 70%`    | `Warning · 70% reached`   |
| `REACHED_100` | `reached`        | `Budget reached · 100%`   |
| `EXCEEDED`    | `over budget`    | `Over budget`             |

### Push (Phase 2)

```typescript
export function formatAlertPush(alert: Alert): {
  title: string;
  body: string;
  data: { category: string; level: NotificationLevel; monthKey: string };
};
```

- One push per alert (no batching — pushes stack naturally on lock screens).
- `title`: `"Budget alert"` (constant).
- `body`: `"{Category}: ${spent} of ${limit} ({pct}%)"`. For `EXCEEDED`: `"{Category} over budget: ${spent} of ${limit}"`.
- `data`: opaque payload `{ category, level, monthKey }` for future deep-linking on tap. Mobile-side handling deferred.
- `channelId`: `"budget-alerts"` (matches the Android channel already created in `usePushNotifications.ts`).
- `sound`: default.

## Testing strategy

**Constraint:** the codebase has no test framework today (no `jest`/`vitest`, no `test` script). v1 stays consistent with that — verification is via standalone scripts under `scripts/` + manual checks. Adding a test framework is a separate decision; the design is structured so pure modules are unit-testable the moment one lands.

| Layer | Verification |
|---|---|
| Schema + migration | `prisma migrate dev --create-only` to inspect SQL; apply; check via `prisma studio`; run seed; verify all existing users got an `ExpenseThreshold` row |
| Pure modules (templates, monthKey, level math) | `scripts/preview-alert-email.ts` renders to stdout (eyeball each level + multi-alert path); `scripts/test-threshold-math.ts` asserts via `console.assert` |
| `checkThresholdsAndNotify` | `dryRun: true` option computes alerts without writing/dispatching. `scripts/test-threshold-check.ts` runs it against a real userId and pretty-prints. |
| Low-threshold e2e | Set own Groceries threshold to `$1`, fire `scripts/fire-sync-webhook.ts`, verify email arrives. Second sync confirms dedupe via `NotificationLog`. |
| `/api/prisma/thresholds` | Curl GET/PUT with real session cookie; verify validation (invalid keys, negative, oversize → 400) |
| `/api/push-tokens` (Phase 2) | Curl with a real Supabase access token. Verify: valid → 200, missing/garbage → 401, no matching User → 404, idempotent re-register, cross-user token rotation. Mobile-side: install dev build on real device, sign in, verify row in `prisma studio`, sign out, verify deletion. |
| Categorize cron regression | Console.log instrumentation: cron run with no eligible rows → no recompute; cron updating 5 rows across 2 users → exactly 2 recomputes + 2 threshold checks; one user throwing → other user still processed |
| Plaid webhook regression | Webhook with no transactions still completes cleanly (early exit when no `Report` row) |
| Production canary | Deploy with email-only and `DRY_RUN_NOTIFICATIONS=false`. Watch SendGrid logs for first 2-3 emails. Adjust thresholds based on a week of real data. |

## File layout

### Web repo (`finance-tracker`)

**New files:**

```
prisma/migrations/<ts>_thresholds_notifications/migration.sql

src/lib/notifications/
  thresholdCheck.ts
  notifier.ts
  templates.ts
  monthKey.ts
  index.ts

src/lib/auth/
  verifySupabaseJwt.ts                      [Phase 2]

src/app/api/prisma/thresholds/
  route.ts

src/app/api/push-tokens/
  route.ts                                  [Phase 2]

src/app/thresholds/
  page.tsx

src/components/ThresholdsTable/
  index.tsx

scripts/
  preview-alert-email.ts
  test-threshold-check.ts
  test-threshold-math.ts
```

**Edited files:**

```
prisma/schema.prisma
  └─ add ExpenseThreshold, NotificationLog, PushToken models + 2 enums

prisma/seed.ts
  └─ idempotent backfill: ensure every existing User has an ExpenseThreshold row

src/lib/reports/draftReport.ts
  └─ at end of upsertCurrentMonthDraftReport: try { checkThresholdsAndNotify(userId, now) } catch (logged)

src/app/api/cronjob/categorize-synced-transactions/route.ts
  └─ after per-user updateMany loop: per touched user, upsertCurrentMonthDraftReport + checkThresholdsAndNotify, each in try/catch

src/utils/constants.ts
  └─ add THRESHOLDS_PAGE: "/thresholds" to appRoutes

src/components/sidebar/<existing nav file>
  └─ add /thresholds nav entry

.env / .env.example
  └─ add SUPABASE_JWT_SECRET (Phase 2), DRY_RUN_NOTIFICATIONS (Phase 1)
```

### Mobile repo (`finance-tracker-mobile`) — Phase 2

```
hooks/usePushNotifications.ts
  - env var unification (EXPO_PUBLIC_MONEYEYE_URL only)
  - persistent device UUID via expo-secure-store + expo-crypto
  - hook signature: getAccessToken getter; replace email body with Authorization bearer

context/AuthContext.tsx
  - expose getAccessToken() if not already available
```

## Implementation phasing

The design is end-to-end. Implementation ships in two phases.

### Phase 1 — Thresholds + email (next plan)

1. Schema migration (3 models + 2 enums) and seed-existing-users script.
2. `src/lib/notifications/` module — `thresholdCheck.ts`, `notifier.ts` with **only** `EmailNotifier`, `templates.ts` with **only** `formatAlertEmail`, `monthKey.ts`.
3. `/api/prisma/thresholds` GET + PUT.
4. `/thresholds` page + `<ThresholdsTable />`.
5. Sidebar nav + `appRoutes` entry.
6. `upsertCurrentMonthDraftReport` integration (1 line + try/catch).
7. `categorize-synced-transactions` cron integration (per-touched-user recompute + threshold check + per-user try/catch).
8. `DRY_RUN_NOTIFICATIONS` safety knob.
9. Dev scripts (`preview-alert-email.ts`, `test-threshold-check.ts`, `test-threshold-math.ts`).
10. Production canary against own thresholds.

### Phase 2 — Push (separate plan, when mobile is ready)

1. `verifySupabaseJwt.ts`.
2. `/api/push-tokens` POST + DELETE.
3. `ExpoPushNotifier` in `notifier.ts`; `defaultNotifier` switch.
4. `formatAlertPush` in `templates.ts`.
5. Mobile-side cleanups in `finance-tracker-mobile`.
6. End-to-end verification on a real device.

### Phase 3 — Future (out of scope)

- Per-month threshold overrides.
- User notification preferences (opt-out per channel/category).
- "You're back under budget" recovery alerts.
- `vitest` + real tests.
- Retry queue for failed dispatches.

## Risk register

| Risk | Mitigation |
|---|---|
| Categorize cron now also recomputes reports — could change runtime | Cron has `maxDuration = 60`; recompute is per-user, only for touched users. Tiny incremental cost. Monitor first runs after deploy. |
| Concurrent webhooks racing the same alert | Insert `NotificationLog` first, dispatch second. Loser hits P2002 and bails before sending. |
| Stale Plaid totals when AI cron changes a category — already a latent gap today | Phase 1 fixes this gap (cron now triggers `upsertCurrentMonthDraftReport`). Side benefit, not new risk. |
| Pre-seeded defaults annoy users who don't want them | Defaults chosen for the single current user (you). If multi-user comes later, revisit per Q5(b). |
| SendGrid down → user misses an alert | Acceptable for v1. If volume grows, add retry queue (Phase 3). |
| Supabase JWT verification fails in prod (wrong secret, alg mismatch) | Phase 2 risk — smoke-test mobile→backend roundtrip before any Phase 2 deploy. |
| Manual transaction edits in the UI don't trigger threshold check in v1 | Picked up on next Plaid sync. Acceptable; flag if bug reports surface. |

## Out of scope (explicit non-goals)

- Per-month threshold overrides (Q2 option C).
- Auto-derived thresholds from rolling spend (Q2 option D).
- User notification preferences UI / opt-out per channel.
- Recovery alerts ("you're back under budget").
- Daily/weekly digest summaries.
- Localization.
- HTML email previewer.
- Retry queue for failed dispatches.
- Webhook for "any other place totals could change" (manual transaction edits, etc.) — covered on next sync.
- CI test job; load testing.
