Add or update tests for the changed behavior (Vitest).

Rules:
- Prefer focused unit tests over broad snapshots. Test behavior, not implementation details.
- Colocate tests next to the code as `*.test.ts` (see `src/lib/ai/*.test.ts` for the pattern).
- Use existing test utilities before creating new ones.
- For mobile API routes, cover the auth/ownership rules from `src/app/api/mobile/CLAUDE.md` (unauthorized → 403, missing `userId` scope, ownership checks).
- Run only the relevant file first: `pnpm vitest run <path>`. Then `pnpm test` if shared code changed.
