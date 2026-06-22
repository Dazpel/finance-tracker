# Agent-Optimized Repo Layer — Design

**Date:** 2026-06-20
**Status:** Approved (design phase)
**Topic:** Restructure repo instructions and add agent-facing scaffolding so Claude Code and other coding agents work with more signal and less context bloat.

## Goal

Make the repo an effective agent interface. An agent should quickly answer: where do I change this, what conventions apply, how do I verify, and what must I not touch — without loading a 300-line root file for every task.

Guiding principle (from `claude-code-agent-optimized-repo-research.md`): **maximize signal, not context.** Short root instructions; domain detail colocated with code; fast verification; a few high-value workflows.

## Scope

**In scope (high-signal subset):**
1. Instruction-file restructure (CLAUDE.md import + AGENTS.md trim + nested files).
2. Verification scripts in `package.json`.
3. `docs/agent-map.md` (task → file routing).
4. `docs/troubleshooting.md` (recurring traps).
5. `.claude/commands/` — `add-feature`, `fix-ci`, `write-tests`.
6. `.github/` PR + issue templates.

**Out of scope (explicitly deferred):**
- Guardrail hooks (block `.env` reads, generated-file edits).
- Claude Code GitHub Action.
- CI enforcement / branch protection.

## Current state (verified)

- `AGENTS.md` exists, 297 lines — strong but long; warns of context bloat per research.
- No `CLAUDE.md` — Claude Code does not auto-load `AGENTS.md`.
- No nested instruction files, no `docs/agent-map.md`, no `docs/troubleshooting.md`, no `.github` templates, no `.claude/commands/`.
- `package.json` scripts: `dev`, `build`, `start`, `lint` (`next lint`), `test` (`vitest run`), `test:watch`, `postinstall` (`prisma generate`). No `typecheck`, no `verify`.
- Generated Prisma client at `src/generated/prisma` is **git-ignored** and already carries `Do not edit` headers + `@ts-nocheck`; ESLint already ignores it. No marker work needed — mention only.
- High-risk zones: `src/app/api/mobile/*` (many routes, RLS/JWT auth), `prisma/`, `src/lib/ai/` (has colocated tests).
- Stack: Next.js 16 (App Router), React 19, TypeScript, Prisma + Postgres, NextAuth v4, Plaid, TanStack Query, HeroUI, Tailwind, Recharts. pnpm.

## Design

### 1. Instruction-file restructure

**`CLAUDE.md` (new, ~15 lines):**
```md
@AGENTS.md

## Claude-specific notes
- Use TodoWrite for multi-step tasks.
- Prefer editing existing files over creating new abstractions.
- Run the narrowest relevant check first (see verification ladder in AGENTS.md).
- Task → file routing: docs/agent-map.md. Recurring errors: docs/troubleshooting.md.
- When choosing between two implementations, prefer the smaller change and explain the tradeoff.
```

**`AGENTS.md` (trim 297 → ~120 lines):** keep project overview, stack, golden commands, structure map, separation-of-concerns rule, the verification ladder, and a short safety/scope section. **Relocate** (move, do not duplicate) the heavy domain blocks into nested files. Replace each moved block with a one-line pointer to its new home.

**Nested instruction files:**
- `src/app/api/mobile/CLAUDE.md` — the **entire** mobile-API / RLS / `requireMobileUser` security section + the per-route checklist, moved verbatim from AGENTS.md. **No duplication left in the root.** AGENTS.md keeps only a one-line pointer.
- `prisma/CLAUDE.md` — schema + migration rules (`schema.prisma` and migration together, `npx prisma migrate dev`, `npx prisma generate`), staging-column naming convention `<entityName>Uuid` (e.g. `reportUuid`, `plaidAccountUuid`), do not edit the generated client at `src/generated/prisma`.
- `src/lib/ai/CLAUDE.md` — categorization patterns; tests live beside code (`categorize.signal.test.ts`, `categorize.batch.test.ts`, `exampleSelection.test.ts`); run the relevant signal/batch test after changes.

### 2. Verification scripts (`package.json`)

Add:
- `"typecheck": "tsc --noEmit"`
- `"verify": "pnpm typecheck && pnpm lint && pnpm test"`

Keep existing `lint` (`next lint`), `build`, `test`, `test:watch`. AGENTS.md documents the **verification ladder**:
1. Run the narrowest relevant test first.
2. Run `pnpm typecheck` if types/schema changed.
3. Run `pnpm lint` if style could be affected.
4. Run `pnpm build` only if routing, server components, config, or rendering behavior changed.

### 3. `docs/agent-map.md`

Task → file routing grounded in the real structure:
- Add a page → `src/app/<route>/page.tsx`, page-private helpers in `<route>/_utils/`.
- Add / change a mobile API route → `src/app/api/mobile/<route>/route.ts`; **read `src/app/api/mobile/CLAUDE.md` first**.
- Change DB schema → `prisma/schema.prisma` + migration; see `prisma/CLAUDE.md`.
- Add a reusable component → `src/components/<Name>/<Name>.tsx`.
- AI categorization change → `src/lib/ai/`; see `src/lib/ai/CLAUDE.md`.

Golden examples section: `EditTransactionModal/` (modal pattern), a `_utils/api.ts` (extracted fetch pattern), a mobile route as the auth template, `ReportsTable/` (table pattern).

### 4. `docs/troubleshooting.md`

Recurring traps:
- Prisma client stale / type errors after schema change → `npx prisma generate`.
- Next.js 16 dynamic-server-usage errors → request APIs (`headers()`, `cookies()`, auth) used in a static render path.
- Tests pass alone but fail together → shared state, global mocks, fake timers, unreset fixtures.
- Mobile 401/403 → JWT verification / `User.authorized` whitelist; see mobile CLAUDE.md.

### 5. `.claude/commands/`

Three command files tuned to this stack (pnpm, vitest, verification ladder, "find the closest existing pattern first"):
- `add-feature.md`
- `fix-ci.md`
- `write-tests.md`

### 6. `.github/` templates

- `.github/pull_request_template.md` — summary / changed areas / verification checklist (typecheck, lint, test, build, manual QA) / risk / notes.
- `.github/ISSUE_TEMPLATE/task.md` — problem / expected / repro / relevant files / acceptance criteria / constraints.

## Testing / verification

This is a docs-and-config change. Verification:
- `pnpm typecheck` runs (proves the new script works).
- `pnpm verify` chain runs end to end.
- `@AGENTS.md` import resolves (CLAUDE.md picks up AGENTS.md content).
- Manual read-through: no security/domain content lost in the AGENTS.md trim — every removed block has a pointer to its new nested home, and the mobile block exists in exactly one place.

## Risks

- **Content loss during AGENTS.md trim.** Mitigation: relocate verbatim into nested files; diff old vs. new to confirm every block landed somewhere.
- **Stale instructions over time.** Mitigation: keep files short and link rather than duplicate.
