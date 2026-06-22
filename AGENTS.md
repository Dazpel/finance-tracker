# AGENTS.md

Guidance for AI agents working in this codebase. Keep this file short; domain detail lives in nested `CLAUDE.md` files near the code.

## Project overview

**MoneyEye Finance Tracker** — a Next.js 16 personal-finance app. Users connect bank accounts via Plaid, track transactions, generate reports, manage recurring transactions, and get spending insights. An Expo mobile client (`finance-tracker-mobile`) talks to the `/api/mobile/*` routes.

## Stack

Next.js 16 (App Router) · React 19 · TypeScript · Prisma + PostgreSQL · NextAuth v4 · Plaid · TanStack Query · HeroUI (NextUI) · Tailwind · Recharts · Framer Motion. Package manager: **pnpm**.

> When working with Next.js, call the `init` tool from `next-devtools-mcp` at the start of a session to establish context.

## Golden commands

- Install: `pnpm i`
- Dev: `pnpm dev`
- Typecheck: `pnpm typecheck`
- Lint: `pnpm lint`
- Test (all): `pnpm test` · single file: `pnpm vitest run <path>`
- Build: `pnpm build`
- Full verification: `pnpm verify`
- DB: `npx prisma migrate dev` · `npx prisma generate` · `npx prisma studio`

## Verification ladder

Run the narrowest relevant check first; escalate only as the change demands:

1. The narrowest relevant test file.
2. `pnpm typecheck` — if types or the Prisma schema changed.
3. `pnpm lint` — if style could be affected.
4. `pnpm build` — only if routing, server components, config, or rendering behavior changed.

Do not default to a full build for a small change.

## Project structure

```
src/
├── app/                  # App Router pages and API routes
│   ├── api/
│   │   ├── mobile/       # Mobile API — SEE src/app/api/mobile/CLAUDE.md
│   │   ├── auth/  plaid/  prisma/  reports/  notes/  cronjob/
│   │   └── push-tokens/
│   ├── accounts/ insights/ notes/ recurring-transactions/ reports/ settings/ transactions/ thresholds/
│   └── <route>/_utils/   # page-private helpers (private folders)
├── components/           # reusable UI, one folder per component
├── hooks/                # custom React hooks
├── lib/
│   ├── ai/               # transaction categorization — SEE src/lib/ai/CLAUDE.md
│   ├── auth/             # requireMobileUser, verifySupabaseJwt
│   ├── plaid/  prisma/  reports/  notifications/  validation/
├── generated/prisma/     # generated Prisma client — git-ignored, DO NOT EDIT
└── utils/                # cross-route helpers
prisma/                   # schema + migrations — SEE prisma/CLAUDE.md
```

For task → file routing and golden examples, see `docs/agent-map.md`. For recurring errors, see `docs/troubleshooting.md`.

## Component & page organization (separation of concerns)

Page components (`src/app/<route>/page.tsx`) stay focused on **state, composition, and event wiring**. Heavy logic, constants, API wrappers, and UI subcomponents move out. Backed by Next.js docs on [colocation](https://nextjs.org/docs/app/getting-started/project-structure#colocation) and [private folders](https://nextjs.org/docs/app/getting-started/project-structure#private-folders).

- **Reusable UI** (used by >1 page or non-trivial markup): `src/components/<Name>/<Name>.tsx` (one folder per component so siblings can colocate). Examples: `EditTransactionModal/`, `ApproveReportModal/`, `ReportsTable/`.
- **Page-private helpers** (used by one page/route): `src/app/<route>/_utils/<file>.ts`, split by concern (`constants.ts`, `api.ts`, `helpers.ts`). The leading `_` keeps Next.js from routing it.
- **Cross-route helpers**: `src/utils/` (general) or `src/lib/<domain>/` (domain-specific).
- **Inline `fetch`/`axios`** is fine for one-shot reads. Once a page does mutations or touches >1 endpoint, extract to `_utils/api.ts`.
- **Modal pairs** tightly coupled to one component colocate as siblings inside that component's folder; standalone modals any page mounts go in `src/components/`.
- Split new modules into separate files by concern: `types.ts` / `constants.ts` / functions / schemas — never bundle everything in one module.

**Rule of thumb:** if `page.tsx` passes ~200 lines, or a `useState` block sits next to a 30-line async handler doing its own fetch + JSON shaping + error mapping, extract.

## Code style

- camelCase for variables/functions; PascalCase for components and types.
- Function-based React components with hooks; never class components. Use TS interfaces for props.
- Single quotes for TS/JS strings and imports; double quotes for JSX attributes.
- `const` by default; early returns over deep nesting; meaningful constants over magic values.
- No wildcard imports; import only what's needed. 2-space indent; ~120-char lines.
- Keep functions focused (under ~50 lines when reasonable). Follow the existing style in each file.

## Domain rules (nested files — read before working in these areas)

- **Mobile API & security** (`/api/mobile/*`, `/api/push-tokens`, `requireMobileUser`, RLS): `src/app/api/mobile/CLAUDE.md` — **required reading**; a single missing `userId` filter is a cross-tenant data hole.
- **Database** (schema, migrations, generated client, staging-column naming): `prisma/CLAUDE.md`.
- **AI categorization**: `src/lib/ai/CLAUDE.md`.

## Safety & scope

- Do not read, print, or modify `.env*` files.
- Do not edit generated files (`src/generated/prisma`) directly — regenerate with `npx prisma generate`.
- Do not run destructive database commands.
- Do not add dependencies without explaining why.
- Prefer minimal, focused changes over broad rewrites.

## Workflow

1. `pnpm i`, configure env, `pnpm dev`.
2. Find the closest existing pattern before adding a new one.
3. Make the smallest complete change; update/add tests when behavior changes.
4. Run the narrowest relevant check (verification ladder); `pnpm lint` before committing.
5. Summarize changed files and how you verified.
