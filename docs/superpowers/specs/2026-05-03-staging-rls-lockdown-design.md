# Staging lockdown — Supabase RLS + mobile auth surface

## Context

The mobile app (`finance-tracker-mobile`, Expo) ships the Supabase **anon key** in its binary and the Supabase staging database has **RLS disabled on every public table** (`relrowsecurity = f` for all 14 tables, zero rows in `pg_policies`). Anyone who extracts the anon key from the APK/IPA can currently read and write every row of `User`, `Transaction`, `PlaidAccount`, `PushToken`, etc. via Supabase REST — bypassing the app entirely. Prod has the same posture per user confirmation.

Two adjacent issues compound this:
1. The mobile-only data path goes through `/api/mobile/*` and `/api/push-tokens` (Next.js → Prisma). Auth uses `requireMobileUser` (`src/lib/auth/requireMobileUser.ts`), which verifies the Supabase JWT but **does not check `User.authorized`** — any Google-signed-in user with a `User` row passes.
2. The mobile app has one direct-DB call left — `isUserAuthorized()` in `lib/supabase.ts` reads `User.authorized` via `supabase.from("User")`. Even after the JWT fix this represents a second access path that needs the anon key to remain useful.
3. `POST /api/push-tokens` (`src/app/api/push-tokens/route.ts:35`) does an unscoped `pushToken.deleteMany({ where: { token } })` — a malicious authenticated user with another user's push token can delete the victim's row, silently disabling their notifications.

Goal: make staging safe to test, then mirror to prod. Per Supabase guidance ("without policies, no one can read or write data" — `apps/learn/content/foundations/security.mdx`), enabling RLS with no policies is the documented deny-all pattern. Prisma connects as `postgres` (superuser, bypasses RLS), so the backend keeps working unchanged.

Identity refactor (binding to Supabase `sub` instead of email) is **deferred** per user direction.

## Architecture after this change

```
Mobile  --(Google ID token)-->  Supabase Auth  --(Supabase JWT)-->  Mobile
Mobile  --(Bearer JWT)------->  Next.js /api/mobile/*  -->  Prisma  -->  Postgres
                                                               |
                                                          (postgres role,
                                                           bypasses RLS)
Anon key in mobile binary -->  Supabase REST  -->  blocked by RLS deny-all
```

Mobile uses Supabase **only** for `auth.*` after this change. The anon key becomes powerless against `public` data.

## Changes

### 1. SQL migration — enable RLS on every public table

New file: `prisma/migrations/<timestamp>_enable_rls_lockdown/migration.sql`

```sql
alter table "User"                 enable row level security;
alter table "Transaction"          enable row level security;
alter table "PlaidAccount"         enable row level security;
alter table "PlaidCursor"          enable row level security;
alter table "PlaidSyncLock"        enable row level security;
alter table "PushToken"            enable row level security;
alter table "ExpenseThreshold"     enable row level security;
alter table "Note"                 enable row level security;
alter table "NotificationLog"      enable row level security;
alter table "RecurringReport"      enable row level security;
alter table "RecurringTransaction" enable row level security;
alter table "Report"               enable row level security;
alter table "SyncedTransaction"    enable row level security;
```

No `force row level security` — Prisma's `postgres` role must keep bypassing. No policies — that is the deny-all. `_prisma_migrations` was left untouched here (Prisma manages it), but the Supabase linter flags it as a public table without RLS; the follow-up migration `20260610000000_enable_rls_on_prisma_migrations` enables RLS on it the same way (Prisma's `postgres` role still bypasses).

### 2. Server-side authorization gate

File: `src/lib/auth/requireMobileUser.ts`

- Add `authorized: true` to the `select` clause.
- Return `403 Forbidden` when `user.authorized === false`.

```ts
const user = await prisma.user.findUnique({
  where: { email: auth.email },
  select: { id: true, email: true, authorized: true },
});
if (!user) return { ok: false, response: Response.json({ error: "User not found" }, { status: 404 }) };
if (!user.authorized) return { ok: false, response: Response.json({ error: "Not authorized" }, { status: 403 }) };
return { ok: true, user: { id: user.id, email: user.email } };
```

### 3. Replace direct-DB authorization read with an API endpoint

New route: `src/app/api/mobile/me/route.ts`

```ts
import { verifySupabaseJwt } from "@lib/auth/verifySupabaseJwt";
import prisma from "@lib/prisma/prismaClient";

export async function GET(request: Request) {
  const auth = await verifySupabaseJwt(request);
  if (!auth) return Response.json({ success: false, error: "Unauthorized" }, { status: 401 });

  const user = await prisma.user.findUnique({
    where: { email: auth.email },
    select: { id: true, email: true, authorized: true, name: true },
  });
  if (!user) return Response.json({ success: true, response: { authorized: false, reason: "User not found" } });

  return Response.json({
    success: true,
    response: { authorized: user.authorized, user: user.authorized ? user : null },
  });
}
```

Note: this uses `verifySupabaseJwt` directly (not `requireMobileUser`) because we want to return `authorized: false` rather than a 403 — the mobile app uses this response to decide whether to show the "not authorized, contact admin" screen.

### 4. Mobile — switch `isUserAuthorized` to the new endpoint

File: `lib/supabase.ts` and/or `services/api.ts`

- Move `isUserAuthorized(email)` out of `lib/supabase.ts`, reimplement as `fetchMe()` in `services/api.ts` using the existing `authenticatedFetch` helper. Returns `{ authorized, user }`.
- `context/AuthContext.tsx` (lines 63, 121, 204): replace `isUserAuthorized(email)` with `fetchMe()`. The argument disappears (server reads email from JWT). Branching stays the same.
- After this, the only Supabase call in the mobile app is `supabase.auth.*` — confirm with `grep -r "supabase\." finance-tracker-mobile --include='*.ts' --include='*.tsx'`.

### 5. Tighten `pushToken` POST handler — scope cross-row delete

File: `src/app/api/push-tokens/route.ts:33-47`

**Today (vulnerable):**
```ts
prisma.pushToken.deleteMany({ where: { token: parsed.data.token } }),
```
A malicious authenticated mobile user who learns another user's Expo push token (low-likelihood but trivially-exploited-once-known) can delete that user's `PushToken` row, silently disabling their push notifications until the victim re-registers.

**Fix — scope the delete by either current user OR matching deviceId:**
```ts
prisma.pushToken.deleteMany({
  where: {
    token: parsed.data.token,
    OR: [
      { userId: auth.user.id },           // cleaning up our own stale row
      { deviceId: parsed.data.deviceId }, // legitimate device-transitions-between-users case
    ],
  },
}),
```

Reasoning:
- `token` is `@unique` (schema line 239) — at most one row matches the token globally.
- The legitimate "user A logs out, user B logs in on same physical device" case still works because `deviceId` is generated client-side per install (`finance-tracker-mobile/lib/deviceId.ts`) and persists across sign-outs, so it matches user A's existing row.
- An attacker with another user's token but a different `deviceId` and `userId` cannot satisfy either OR branch — the deleteMany becomes a no-op.

**Edge case — token already owned by another user with a different deviceId.** After the scoped deleteMany no-ops, the subsequent `upsert` will hit the `token @unique` constraint and Prisma throws `P2002`. Wrap the transaction in try/catch and return `409 Conflict` with `{ success: false, error: "Token already registered" }` so the mobile client can prompt Expo for a fresh token rather than seeing a 500.

### 6. Update `AGENTS.md` — codify the mobile-API authorization rules

File: `/Users/alexandervictoria/Desktop/github-projects/finance-tracker/AGENTS.md`

Insert a new top-level section **"Mobile API & Security"** between the existing **"Security Considerations"** subsection (line 208–215) and **"Development Workflow"** (line 217). Content:

```markdown
## Mobile API & Security (REQUIRED reading before any change to `/api/mobile/*`, `/api/push-tokens`, or anything that uses `requireMobileUser`)

### Architecture

- Mobile clients (Expo) authenticate with Google → exchange the Google ID token for a Supabase JWT (`supabase.auth.signInWithIdToken`).
- The mobile app uses Supabase **only** for `auth.*` (sign-in, session refresh, sign-out). It must NEVER call `supabase.from(...)`, `supabase.rpc(...)`, `supabase.storage`, or `supabase.functions`. All data goes through Next.js.
- All mobile data flows: `Authorization: Bearer <supabase JWT>` → Next.js (`/api/mobile/*`, `/api/push-tokens`) → Prisma → Postgres.
- JWT verification: `src/lib/auth/verifySupabaseJwt.ts` (jose + Supabase JWKS).
- Auth gate: `src/lib/auth/requireMobileUser.ts` (verifies JWT, looks up user by email, enforces `authorized = true`).

### RLS posture (do not weaken)

- Every table in the `public` schema has RLS enabled with **no policies** — i.e. deny-all to every Postgres role except superusers.
- Prisma connects as the `postgres` superuser via the Supabase pooler, which bypasses RLS, so backend code keeps working unchanged.
- The Supabase anon key shipped in the mobile binary is therefore powerless against `public` data — direct REST/PostgREST attempts return empty.
- **Do not add policies that grant access to the `anon` or `authenticated` roles.** That would re-open the direct-Supabase data path the lockdown closed.
- **Do not switch Prisma's connection role away from `postgres` without also writing per-table RLS policies.** The current invariant is "all data access via Next.js, none direct."

### Authorization rules for every mobile route

1. **Always use `requireMobileUser`** as the first line of the handler:
   ```ts
   const auth = await requireMobileUser(request);
   if (!auth.ok) return auth.response;
   ```
   Do not roll your own JWT verification. `requireMobileUser` is the only function that enforces the `authorized = true` whitelist.

2. **Every Prisma query touching user-scoped data MUST filter by `userId: auth.user.id`** in `where`. This applies to: `findFirst`, `findMany`, `findUnique` (when keyed on a non-`userId` column), `update`, `delete`, `updateMany`, `deleteMany`, `aggregate`, `groupBy`, `count`, `upsert`.

3. **`updateMany` and `deleteMany` without a `userId` clause are forbidden.** Scoping by another field that "feels" identifying (a token, a transaction id, a name, a deviceId) is not authorization. If you genuinely need a cross-user mutation (rare — usually only cron / webhook code), it does not belong on a mobile route.

4. **Never trust body- or URL-supplied user identifiers.** If the route accepts an entity id, verify ownership before mutating:
   ```ts
   const row = await prisma.transaction.findUnique({ where: { id }, select: { userId: true } });
   if (!row || row.userId !== auth.user.id) {
     return Response.json({ success: false, error: "Not found" }, { status: 404 });
   }
   ```

5. **Validate request bodies with Zod.** Pattern: `src/app/api/push-tokens/route.ts`. Reject before touching the DB.

6. **Response shape:** `{ success: true, response: <data> }` on success, `{ success: false, error: <string|object> }` on failure. The mobile `authenticatedFetch` helper (`finance-tracker-mobile/services/api.ts`) parses this shape.

### Checklist for any new mobile route or any change to an existing one

- [ ] First line of the handler is `const auth = await requireMobileUser(request); if (!auth.ok) return auth.response;`
- [ ] Every Prisma call in the handler has `userId: auth.user.id` in `where` (or, for `upsert`, in the unique-key composite).
- [ ] No `deleteMany` / `updateMany` without `userId: auth.user.id` in `where`.
- [ ] If the body contains an entity id, an explicit ownership check is in place.
- [ ] Body validated with Zod.
- [ ] Response shape matches `{ success, response | error }`.

### Why this matters

The RLS deny-all closes the direct-Supabase-REST attack vector but does **not** protect data from a malicious authenticated mobile user — Prisma bypasses RLS, so all authorization for mobile-API requests happens in route code. A single missing `userId` filter is an immediate cross-tenant data hole. Treat the checklist above as non-negotiable.
```

## Critical files

- **Read-only references:**
  - `src/lib/auth/verifySupabaseJwt.ts` — JWT verification via JWKS, reuse as-is
  - `src/lib/prisma/prismaClient.ts` — Prisma singleton
  - `prisma/schema.prisma` line 24 (`authorized Boolean @default(false)`)
- **Modify:**
  - `src/lib/auth/requireMobileUser.ts`
  - `src/app/api/push-tokens/route.ts`
  - `AGENTS.md`
  - `finance-tracker-mobile/lib/supabase.ts`
  - `finance-tracker-mobile/context/AuthContext.tsx`
  - `finance-tracker-mobile/services/api.ts`
- **Create:**
  - `prisma/migrations/<ts>_enable_rls_lockdown/migration.sql`
  - `src/app/api/mobile/me/route.ts`

## Verification (staging-only)

Run in this order. Each step has a pass/fail signal.

### Step 1 — pre-flight on staging

```bash
PGPASSWORD='staging_db_***' psql "postgresql://postgres.vvnqplnngpbquyeyobup@aws-0-us-west-1.pooler.supabase.com:5432/postgres" \
  -c "select tablename, relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace join pg_tables t on t.tablename=c.relname where n.nspname='public' order by tablename;"
```
Expect: all tables `relrowsecurity = f` (current state).

### Step 2 — apply migration to staging

`pnpm prisma migrate deploy` (against staging `DATABASE_URL`). Re-run the query from Step 1; expect all `t`.

### Step 3 — confirm anon key is now powerless

With staging anon key + URL:
```bash
curl -s "$STAGING_SUPABASE_URL/rest/v1/User?select=*" \
  -H "apikey: $STAGING_ANON_KEY" -H "Authorization: Bearer $STAGING_ANON_KEY"
```
Expect: empty array `[]` or 401-style response, **not** rows. Repeat for `Transaction` and `PushToken`.

### Step 4 — confirm Prisma still works

Hit the Next.js app (staging deploy or `pnpm dev` against staging DB):
- `GET /api/mobile/current-month-report` with a valid Supabase JWT for an `authorized=true` user → 200, returns report.
- Same with `authorized=false` user → 403 (proves Step 2 gate).
- Same with no `Authorization` header → 401.
- `GET /api/mobile/me` with valid JWT for `authorized=true` user → `{authorized: true, user: {...}}`.
- Same for `authorized=false` user → `{authorized: false, user: null}`.

### Step 5 — mobile end-to-end

Run the Expo app against staging (`EXPO_PUBLIC_MONEYEYE_URL=<staging>`):
- Sign in with an authorized Google account → app loads, `/me` returns `authorized: true`, current-month-report renders.
- Sign in with an unauthorized Google account → "not authorized" screen, sign-out triggered.
- Push token registration succeeds (`POST /api/push-tokens` returns 200).
- Search the bundle for residual direct-DB calls: `grep -rn "supabase\.\(from\|rpc\|storage\|functions\)" finance-tracker-mobile/` should return zero matches.

### Step 5a — `pushToken` cross-user delete is closed

With two authorized test users (A and B), each having registered a `PushToken` row:
- As user B, `POST /api/push-tokens` with body `{ token: <A's token>, deviceId: <B's deviceId> }`. Expect: `409 Conflict`, A's row in DB unchanged.
- As user B on the same physical device A used to be on (same `deviceId`), POST with the new Expo token. Expect: A's row removed, B's row created — the legitimate transition path still works.
- Confirm in DB: `select "userId", "deviceId", token from "PushToken" order by "userId";` matches expectations after each scenario.

### Step 6 — rollback plan

If anything is broken on staging after Step 2, revert by dropping RLS:
```sql
alter table "User" disable row level security;
-- ...repeat for all 13 tables
```
This is reversible and instant. Code changes (Steps 2–4 above) ship via normal git revert.

## Out of scope (explicit)

- Identity refactor — `requireMobileUser` keeps email lookup. Adding `supabaseUserId` is a follow-up.
- Prod rollout — same migration applies, but execute only after staging passes Steps 1–5.
- `force row level security` / dedicated app DB role — not needed while Prisma uses the `postgres` superuser.
- Per-table policies for `auth.uid()` — not needed in this architecture (no direct client → DB path remains).
