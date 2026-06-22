Investigate the failing CI check(s).

Steps:
1. Inspect the latest failing command and its error output.
2. Reproduce locally with the narrowest command: `pnpm typecheck`, `pnpm lint`, or `pnpm vitest run <file>`.
3. Identify the smallest likely cause. Check `docs/troubleshooting.md` for known traps (stale Prisma client, dynamic-server-usage, test cross-contamination).
4. Make the minimal fix.
5. Re-run the narrowest relevant command, then `pnpm verify` if the fix touched shared code.
6. Summarize the root cause and how you verified.

Do not refactor unrelated code.
