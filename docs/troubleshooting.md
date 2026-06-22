# Troubleshooting

Recurring, project-specific traps and their fixes.

## Prisma client stale / type errors after a schema change
Regenerate the client:
```
npx prisma generate
```
The client lives at `src/generated/prisma` (git-ignored). Don't edit it by hand.

## Migration drift / "schema out of sync"
Create and apply a migration instead of editing the DB directly:
```
npx prisma migrate dev
```
Update `prisma/seed.ts` if the change affects seed data. See `prisma/CLAUDE.md`.

## Next.js 16 "Dynamic server usage" errors
A route used a request-specific API (`headers()`, `cookies()`, auth/session) in a path being statically rendered. Move request logic to the right boundary or make the route dynamic.

## Mobile API returns 401 / 403
- 401: JWT missing/invalid — check `Authorization: Bearer <supabase JWT>` and `verifySupabaseJwt`.
- 403: user not on the whitelist (`User.authorized = false`) — enforced by `requireMobileUser`.
- Exception: `/api/mobile/me` returns 200 `{ authorized: false }` by design. See `src/app/api/mobile/CLAUDE.md`.

## Mobile client gets empty data hitting Supabase directly
Expected. `public` tables are RLS deny-all to `anon`/`authenticated`. All mobile data must go through `/api/mobile/*`. Do not add policies to re-open the direct path.

## Tests pass individually but fail together
Look for shared state, global mocks, fake timers, or test fixtures that aren't reset between tests.

## Typecheck passes but build fails (or vice versa)
`pnpm typecheck` (`tsc --noEmit`) checks types only. Run `pnpm build` when routing, server components, config, or rendering behavior changed — see the verification ladder in `AGENTS.md`.
