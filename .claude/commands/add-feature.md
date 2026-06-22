Implement the requested feature in this Next.js 16 / Prisma / pnpm codebase.

Steps:
1. Find the closest existing pattern (`docs/agent-map.md` lists golden examples). Reuse existing components, hooks, `_utils` helpers, and test utilities.
2. Read any nested `CLAUDE.md` for the area you're touching — especially `src/app/api/mobile/CLAUDE.md` for mobile routes.
3. Make the smallest complete implementation. Keep `page.tsx` focused on state/composition; push logic into `_utils/` or `src/lib/`.
4. Add or update tests for the behavior (colocated `*.test.ts`).
5. Verify with the ladder: narrowest test → `pnpm typecheck` if types/schema changed → `pnpm lint` → `pnpm build` only if routing/config/rendering changed.
6. Summarize changed files and how you verified.

Do not add dependencies without explaining why. Prefer minimal, focused changes.
