# src/app/api/mobile — Mobile API & Security

REQUIRED reading before any change to `/api/mobile/*`, `/api/push-tokens`, or anything that uses `requireMobileUser`.

## Architecture

- Mobile clients (Expo, repo `finance-tracker-mobile`) authenticate with Google → exchange the Google ID token for a Supabase JWT (`supabase.auth.signInWithIdToken`).
- The mobile app uses Supabase **only** for `auth.*` (sign-in, session refresh, sign-out). It must NEVER call `supabase.from(...)`, `supabase.rpc(...)`, `supabase.storage`, or `supabase.functions`. All data goes through Next.js.
- All mobile data flows: `Authorization: Bearer <supabase JWT>` → Next.js (`/api/mobile/*`, `/api/push-tokens`) → Prisma → Postgres.
- JWT verification: `src/lib/auth/verifySupabaseJwt.ts` (jose + Supabase JWKS).
- Auth gate: `src/lib/auth/requireMobileUser.ts` — verifies the JWT, looks up the user by email, enforces `User.authorized = true`. This is the only function that enforces the whitelist.

## RLS posture (do not weaken)

- Every table in the `public` schema has Postgres RLS enabled with **no policies** — i.e. deny-all to every role *except* those Postgres exempts from RLS: the table owner, superusers, and roles with the `BYPASSRLS` attribute (we deliberately do **not** set `FORCE ROW LEVEL SECURITY`, so the owner stays exempt). This includes Prisma's own `_prisma_migrations` table; any new public table (including tooling tables) must get RLS too.
- Prisma connects as the `postgres` superuser via the Supabase pooler and bypasses RLS, so backend code keeps working unchanged.
- The Supabase anon key shipped in the mobile binary is therefore powerless against `public` data — direct REST/PostgREST attempts return empty.
- **Do not add policies that grant access to the `anon` or `authenticated` Postgres roles.** That re-opens the direct-Supabase data path.
- **Do not switch Prisma's connection role away from `postgres` without also writing per-table RLS policies.** The current invariant is "all data access via Next.js, none direct."

## Authorization rules for every mobile route

1. **Always use `requireMobileUser`** as the first line of the handler:
   ```ts
   const auth = await requireMobileUser(request);
   if (!auth.ok) return auth.response;
   ```
   Do not roll your own JWT verification.

   **Sole exception: `/api/mobile/me`.** That route reports the whitelist verdict so the mobile app can render the "not authorized" screen, which means a non-`authorized` user must get a 200 with `{ authorized: false }` rather than the 403 `requireMobileUser` would return. It still verifies the JWT directly via `verifySupabaseJwt` and exposes no user-scoped data. Do not extend this carve-out to any other route.

2. **Every Prisma query touching user-scoped data MUST filter by `userId: auth.user.id`** in `where`. This applies to `findFirst`, `findMany`, `findUnique` (when keyed on a non-`userId` column), `update`, `delete`, `updateMany`, `deleteMany`, `aggregate`, `groupBy`, `count`, `upsert`.

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

## Checklist for any new mobile route or any change to an existing one

- [ ] First line of the handler is `const auth = await requireMobileUser(request); if (!auth.ok) return auth.response;`
- [ ] Every Prisma call in the handler has `userId: auth.user.id` in `where` (or, for `upsert`, in the unique-key composite).
- [ ] No `deleteMany` / `updateMany` without `userId: auth.user.id` in `where`.
- [ ] If the body contains an entity id, an explicit ownership check is in place.
- [ ] Body validated with Zod.
- [ ] Response shape matches `{ success, response | error }`.

## Why this matters

The RLS deny-all closes the direct-Supabase-REST attack vector but does **not** protect data from a malicious authenticated mobile user — Prisma bypasses RLS, so all authorization for mobile-API requests happens in route code. A single missing `userId` filter is an immediate cross-tenant data hole.
