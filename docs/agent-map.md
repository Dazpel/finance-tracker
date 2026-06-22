# Agent map

Task → file routing for MoneyEye. Find the closest existing pattern before inventing a new one.

## Common task → files

### Add or change a page
- `src/app/<route>/page.tsx` — state, composition, event wiring only.
- `src/app/<route>/_utils/` — page-private constants, `api.ts`, helpers.
- Shared UI it needs → `src/components/<Name>/`.

### Add or change a mobile API route
- `src/app/api/mobile/<route>/route.ts`.
- **Read `src/app/api/mobile/CLAUDE.md` first** — auth (`requireMobileUser`), `userId` scoping, RLS, response shape are mandatory.
- Auth helpers: `src/lib/auth/requireMobileUser.ts`, `src/lib/auth/verifySupabaseJwt.ts`.

### Add or change a web API route
- `src/app/api/<area>/route.ts` (e.g. `auth/`, `plaid/`, `reports/`, `notes/`, `cronjob/`, `push-tokens/`).

### Change the database schema
- `prisma/schema.prisma` + a migration (`npx prisma migrate dev`).
- `prisma/seed.ts` if seed data is affected. See `prisma/CLAUDE.md`.

### Add a reusable component
- `src/components/<Name>/<Name>.tsx` (one folder per component).

### Change transaction categorization
- `src/lib/ai/` — see `src/lib/ai/CLAUDE.md`. Run the colocated `*.test.ts`.

### Change reports logic
- `src/lib/reports/` and the relevant tables/pages (`ReportsTable/`, `src/app/reports/`).

### Change Plaid integration
- `src/lib/plaid/` and `src/app/api/plaid/`.

## Golden examples (copy these patterns)

- **Modal:** `src/components/EditTransactionModal/`
- **Table:** `src/components/ReportsTable/`
- **Page-private API wrapper:** a `src/app/<route>/_utils/api.ts`
- **Mobile route (auth template):** any `route.ts` under `src/app/api/mobile/` — e.g. `transactions/synced/[id]/route.ts`
- **Zod-validated body:** `src/app/api/push-tokens/route.ts`
- **Colocated tests:** `src/lib/ai/*.test.ts`

## Rule of thumb

Before adding a new pattern, find the closest existing implementation and follow it.
