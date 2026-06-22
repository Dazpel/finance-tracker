@AGENTS.md

## Claude-specific notes

- Use TodoWrite for multi-step tasks.
- Prefer editing existing files over creating new abstractions; find the closest existing pattern first.
- Run the narrowest relevant check first — see the verification ladder in `AGENTS.md`.
- Task → file routing: `docs/agent-map.md`. Recurring errors: `docs/troubleshooting.md`.
- When choosing between two implementations, prefer the smaller change and explain the tradeoff.
- Nested instruction files carry domain rules — read them when you work in that area:
  - `src/app/api/mobile/CLAUDE.md` — mobile API auth & RLS (read before touching `/api/mobile/*`).
  - `prisma/CLAUDE.md` — schema, migrations, generated client.
  - `src/lib/ai/CLAUDE.md` — transaction categorization.
