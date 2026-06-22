# src/lib/ai — Transaction categorization

AI-assisted categorization of transactions into `CANONICAL_CATEGORIES` (`@lib/categories`).

## How categorization resolves (order matters)

A category is resolved by provenance, surfaced as `CategorizeSource`:
1. **`lookup`** — user-correction map (`correction-lookup/`), keyed via `makeCorrectionKey`. Highest priority: respects what the user already fixed.
2. **`signal`** — deterministic signals (e.g. Plaid category, merchant). No model call.
3. **`ai`** — model fallback for the ambiguous tail (`@ai-sdk/openai` + `generateText`/`Output`, Zod-validated).

Prefer resolving without a model call; only fall through to `ai` for genuine ambiguity.

## Conventions

- **Determinism:** `temperature` stays `0` and `CATEGORIZE_SEED` is fixed to reduce run-to-run drift. Do not add a second stochastic axis (e.g. `topP`) without a reason.
- **Amount sign (Plaid convention):** expenses are POSITIVE, revenue/deposits NEGATIVE (money in ⇔ `amount < 0`).
- Keep `types.ts` / `constants.ts` / functions / schemas in separate files (project-wide separation-of-concerns rule).

## Tests live beside the code — run them after changes

- `categorize.signal.test.ts` — signal-tier resolution.
- `categorize.batch.test.ts` — batch behavior.
- `exampleSelection.test.ts` — example selection for the model prompt.
- `correction-lookup/{buildCorrectionMap,keys}.test.ts` — lookup map + key building.

Run the narrowest relevant file first, e.g. `pnpm vitest run src/lib/ai/categorize.signal.test.ts`.
