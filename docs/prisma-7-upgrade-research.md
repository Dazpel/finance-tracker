# Prisma 7 Upgrade Research

> **STATUS: IMPLEMENTED (2026-06-20)** on branch `feat/upgrade-prisma-7`. Upgraded to **7.8.0** (latest 7.x; 7.7.0 was the figure when this doc was first written). Verified: `tsc --noEmit` clean, `next build` succeeds (49 pages), 26/26 tests pass. **Not committed** (per repo policy). See the [Implementation log](#implementation-log-2026-06-20) at the bottom.

**Date:** 2026-06-19
**Researched with:** Context7 (`/prisma/prisma`, `/websites/prisma_io`) + Prisma official changelog/docs/blog
**Current version:** `prisma` / `@prisma/client` **6.16.2**
**Latest version:** **7.7.0** (released 2026-04-07)

> TL;DR — This is **not a patch bump, it's a major (v6 → v7) architectural rewrite.** Prisma dropped the Rust query engine, now ships as **ESM-only**, **requires a driver adapter**, **requires a custom client output path**, and moves datasource/env config into a new `prisma.config.ts`. Our stack (Next 16, React 19, TS 5.9, Node 22) already meets every prerequisite, and we use almost none of the removed APIs — so the upgrade is **feasible and low-risk on paper**, but it is a real migration touching client setup, env wiring, and 40 files' import path. **Recommendation: worth doing, but schedule it deliberately — not a drive-by bump.**

---

## 1. Where we are today

| Item | Value |
|------|-------|
| `prisma` / `@prisma/client` | `6.16.2` |
| Generator | `prisma-client-js` (default `node_modules` output) |
| Datasource | PostgreSQL, `url` = `DATABASE_URL`, `directUrl` = `DIRECT_URL` (pooled + direct, Supabase/Vercel style) |
| Client setup | `src/lib/prisma/prismaClient.ts` — singleton `new PrismaClient({ log, errorFormat })`, no adapter |
| Usage surface | ~40 `.ts` files import from `@prisma/client`; `2` files use `$queryRaw`/`$executeRaw`; **no** `$use` middleware; **no** `previewFeatures`/`fullTextSearch` |
| App | Next.js `^16.2.7`, React `19.2.7`, TypeScript `5.9.3`, Node `v22.22.2` |

**Why this matters:** our usage is clean. No deprecated middleware, no preview features, no implicit-m-n edge cases, minimal raw SQL. The migration is mostly *configuration* (client instantiation, env, output path), not *query rewrites*.

---

## 2. Prerequisites for v7 — we already pass all of them

| Requirement | Needs | We have | Status |
|-------------|-------|---------|--------|
| Node.js | ≥ 20.19.0 (22.x recommended) | 22.22.2 | ✅ |
| TypeScript | ≥ 5.4.0 (5.9.x recommended) | 5.9.3 | ✅ |
| ESM-ready tsconfig | `module`/`moduleResolution` modern | `module: esnext`, `moduleResolution: bundler`, `target: esnext` | ✅ |
| Bundler handles ESM | — | Next.js 16 | ✅ |

This is the single biggest reason this upgrade is attractive *right now*: the environment cost is already paid.

---

## 3. What's genuinely new / worth leveraging in v7

### 3.1 Rust-free, TypeScript/WASM query engine (the headline)
v7 removes the Rust query engine binary entirely. The query compiler is now a WebAssembly module running on the JS main thread. Benefits:
- **No native binary** to ship/match per platform → simpler deploys, smaller cold-start surface, fewer "engine not found"/binary-target issues on Vercel/serverless.
- Smaller install footprint.

> Caveat: moving compilation onto the JS thread initially risked blocking the event loop — which is exactly what the new caching layer (below) fixes.

### 3.2 Query-plan caching layer (v7.4.0)
- Normalizes query *shape* (strips literal values → typed placeholders), compiles once, stores the plan in an **LRU cache**, and reuses it for repeated same-shape queries.
- **Transparent — zero code changes.** Directly benefits a workload like ours that runs the same `findUnique`/`findMany`/sync-upsert shapes on every Plaid sync and report build.

### 3.3 Nested transaction rollback via savepoints (v7.5.0)
- SQL nested transactions can now roll back independently through savepoints. Useful if we ever nest interactive transactions in the sync pipeline.

### 3.4 Driver adapters as the default path
- Talking to Postgres through `@prisma/adapter-pg` (the standard `pg` driver) means connection behavior is now *the driver's*, which is more transparent and tunable than the old opaque engine pool. Plays well with Supabase/Vercel pooling.

### 3.5 First-class `prisma.config.ts`
- Central, typed config for schema location, migrations, seed, and datasource/env. Cleaner than scattered schema fields + implicit `.env` loading.

### 3.6 Direction of travel ("Prisma Next" / v8)
Not in v7 yet, but signals where leverage is coming: type-safe **SQL query builder**, **TypeScript-defined schemas**, modular extensions (pgvector, etc.), native `GROUP BY`, result **streaming**, and graph-based migrations. Worth knowing so we don't build workarounds that v8 will obsolete.

---

## 4. Breaking changes (v6 → v7) and how each hits *us*

| # | Breaking change | Impact on this repo | Effort |
|---|-----------------|---------------------|--------|
| 1 | **ESM-only.** Needs `"type": "module"` semantics; modern tsconfig | tsconfig already ESM; Next bundles. Confirm `package.json`/seed script run as ESM | Low |
| 2 | **Generator → `prisma-client`**, `output` now **required**, no more `node_modules` generation | Change generator block; pick an output dir (e.g. `src/generated/prisma`); update imports | **Medium** (40 files) |
| 3 | **Driver adapter required** — `new PrismaClient({ adapter })` | Add `@prisma/adapter-pg` + `pg`; rewrite `prismaClient.ts` singleton and `seed.ts` | Medium |
| 4 | **Connection-pool defaults changed** — `pg` has *no* connect timeout by default (v6 used 5s) | Must set explicit pool/timeout config to match old behavior; important on serverless | Medium |
| 5 | **Strict SSL** — invalid certs now error | Verify Supabase/Vercel SSL; may need `ssl: { rejectUnauthorized: ... }` | Low/Medium |
| 6 | **`prisma.config.ts`** replaces datasource `url`/`directUrl`/`shadowDatabaseUrl` (deprecated) | Move `DATABASE_URL`/`DIRECT_URL` wiring into config | Low |
| 7 | **Env vars no longer auto-loaded** | Add explicit `dotenv` (or load via config) for CLI/seed/scripts | Low |
| 8 | **`migrate dev`/`db push` no longer auto-run `generate` or seed**; `--skip-generate`/`--skip-seed` removed | Update any scripts/CI; we already have `postinstall: prisma generate`. Run `db seed` explicitly | Low |
| 9 | `migrate diff` flags changed (`--from/-to-config-datasource`) | Only if we script diffs (we don't currently) | None/Low |
| 10 | **`$use()` middleware removed** → use `$extends()` | **We use none.** No impact | None |
| 11 | Metrics preview feature removed | Not used | None |
| 12 | Enum `@map` reverted to v6 semantics (generated enum uses schema name) | We don't `@map` enums | None |
| 13 | Removed `PRISMA_*` engine env vars | Not used | None |
| 14 | **MongoDB not yet supported in v7** | We're PostgreSQL — irrelevant | None |

**Net:** the only items that touch code are #2 (import path across 40 files), #3 (client + seed rewrite), and #4/#5 (pool/SSL tuning). Everything genuinely removed (#10–#13) we don't use.

---

## 5. Concrete migration outline (when we pull the trigger)

1. **Branch + bump.** `npm i prisma@7 @prisma/client@7 @prisma/adapter-pg pg` (+ `@types/pg`, `dotenv`).
2. **Schema generator:**
   ```prisma
   generator client {
     provider = "prisma-client"
     output   = "../src/generated/prisma"
   }
   ```
3. **Create `prisma.config.ts`** — move schema path, migrations, seed, and `DATABASE_URL`/`DIRECT_URL` wiring here; add explicit `dotenv` load.
4. **Rewrite `src/lib/prisma/prismaClient.ts`** to build a `pg` Pool → `PrismaPg` adapter → `new PrismaClient({ adapter, log, errorFormat })`. **Set an explicit connect timeout** to restore v6's 5s behavior (#4). Verify SSL (#5).
5. **Update `prisma/seed.ts`** the same way and run seeding explicitly.
6. **Codemod imports** from `@prisma/client` → the new output path across the ~40 files (and `@prisma/client` runtime-type imports like `Prisma`, `ReportType`, etc.).
7. **Regenerate + typecheck + run the test suite (vitest)**; smoke-test Plaid sync + report build paths (heaviest query users).
8. **Verify serverless connection behavior** on a Vercel preview (pool exhaustion / timeouts are the most likely runtime surprise).

---

## 6. Is it worth it?

**Yes — recommended, but as a scheduled, isolated task, not bundled into feature work.**

**Arguments for:**
- Prerequisites already met (Node 22, TS 5.9, ESM tsconfig, Next 16) — the expensive part is free.
- We use **none** of the removed/deprecated APIs ($use, metrics, mapped enums, preview features), so breaking surface is small.
- Real upside for our workload: transparent **query-plan caching** (repeated sync/report shapes), no Rust binary (cleaner serverless deploys), tunable driver-level pooling.
- Staying on v6 means falling progressively behind as the ecosystem moves to the v7/v8 ESM + driver-adapter architecture.

**Arguments to wait / cautions:**
- It is still a **breaking config migration**: client instantiation, env loading, output path, and a 40-file import rewrite.
- **Connection-pool/SSL default changes (#4, #5) are the real risk** on Supabase/Vercel serverless — must be validated under load, not just locally.
- No urgent feature *forcing* the move today; v6.16 is stable and supported.

**Suggested call:** Plan a dedicated upgrade PR in an isolated branch, time-boxed, with the migration outline above and explicit serverless verification. Not a same-day drive-by bump. If we want to minimize risk further, we can first move to the latest 6.x patch, then do the 6→7 jump as its own change.

---

## Sources
- [Prisma changelog (index)](https://www.prisma.io/changelog)
- [Upgrade to Prisma ORM 7](https://www.prisma.io/docs/orm/more/upgrade-guides/upgrading-versions)
- [Prisma v7.4.0 — Client caching layer](https://www.prisma.io/changelog/2026-02-11)
- [Prisma v7.6.0](https://www.prisma.io/changelog/2026-03-27) / [v7.4.2](https://www.prisma.io/changelog/2026-02-27) / [v7.4.1](https://www.prisma.io/changelog/2026-02-19)
- [The Next Evolution of Prisma ORM (blog)](https://www.prisma.io/blog/the-next-evolution-of-prisma-orm)
- [GitHub releases · prisma/prisma](https://github.com/prisma/prisma/releases)
- Context7: `/prisma/prisma`, `/websites/prisma_io`

---

## Implementation log (2026-06-20)

Implemented on branch `feat/upgrade-prisma-7` (stacked on top of the in-progress Plaid 38→42 work, which was already uncommitted in the tree). Package manager is **pnpm**. **Nothing committed.**

### Versions
`prisma` / `@prisma/client` / `@prisma/adapter-pg`: **6.16.2 → 7.8.0**. Added `pg`, `@types/pg`, `dotenv`, `tsx`.

### Changes made
1. **`prisma/schema.prisma`** — generator `prisma-client-js` → `prisma-client`, added `output = "../src/generated/prisma"` + `runtime = "nodejs"`. Datasource reduced to `provider` only (URLs moved to config).
2. **`prisma.config.ts`** (new) — `defineConfig` from `prisma/config`, `import "dotenv/config"` (v7 no longer auto-loads `.env`), `schema`/`migrations.path`/`migrations.seed` (`tsx prisma/seed.ts`), and `datasource.url = env("DIRECT_URL")`.
   - **Key correction:** `datasource.url` in v7 is **CLI/migration-only** and must be the **direct** (non-pooled) connection. `directUrl` folds into `url` — it does **not** map to `shadowDatabaseUrl` (a separate scratch DB, left unset).
3. **`src/lib/prisma/prismaClient.ts`** — now builds a `PrismaPg` adapter (`@prisma/adapter-pg`) over the pooled `DATABASE_URL`, passed as `new PrismaClient({ adapter })`. Set `connectionTimeoutMillis: 5000` (restores v6's 5s; pg defaults to 0/infinite — a v7 breaking change), `idleTimeoutMillis`, and `ssl: { rejectUnauthorized: false }` for the pooler.
4. **`prisma/seed.ts`** — own adapter-backed client + `dotenv`.
5. **Import codemod (41 files)** — `@prisma/client` → generated path. Split by bundle target:
   - **Server-only files** that use the `PrismaClient` constructor/type or `Prisma.PrismaClient*Error` runtime classes → `@generated/prisma/client` (6 files).
   - **Everything else** (model types + enums) → `@generated/prisma/browser`, the browser-safe entry that works on both server and client.
6. **`tsconfig.json`** — added `@generated/*` → `./src/generated/*` path alias.
7. **`.gitignore`** — ignore `/src/generated/prisma` (regenerated by `postinstall: prisma generate`). **`.eslintrc.json`** — `ignorePatterns` for the generated dir.

### Boundary fix (the one non-mechanical change)
`next build` failed: a client component (`reports/details/page.tsx`) transitively imported the Prisma client via `utils/functions.ts` → auth `options.ts` → `prismaClient.ts`, pulling `node:module` into the browser bundle. **Cause:** v7's generated `client.ts` has top-level Node side-effects (`globalThis['__dirname'] = …`, `import 'node:process'`) that defeat tree-shaking; v6's `@prisma/client` resolved to a side-effect-free browser build, so this same chain built fine.
**Fix:** extracted the 3 server-only functions (`refreshUserTransactions`, `fetchUserTransactions`, `getAccessToken` — the only users of `plaidClient`/`getServerSession`/auth `options`) out of `utils/functions.ts` into a new server module **`src/utils/serverTransactions.ts`**, making `functions.ts` client-safe. Updated the 2 API-route import sites.

### Verification
- `pnpm exec tsc --noEmit` → 0 errors
- `pnpm build` → ✓ Compiled successfully, 49 static pages
- `pnpm test` → 26/26 pass

### Not done / follow-ups for the reviewer
- **No DB connection was exercised.** `prisma migrate` / `db push` and runtime queries against Supabase were **not** run. The connection-pool + SSL changes (the real risk) must be validated against staging under serverless load before merge.
- Consider `build: "prisma generate && next build"` for deploy robustness (currently relies on `postinstall`).
- Optional: add the `server-only` package and import it in `serverTransactions.ts` (and `prismaClient.ts`) to fail fast if a client component ever re-introduces the boundary violation.
- This branch stacks the Plaid 38→42 change; separate before review if desired.
