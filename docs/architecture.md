# Architecture

The system as built. The target design is in [`prd.md`](prd.md) §4.

Two apps and one shared package:

- `apps/web`: Next.js, served on one origin with the API.
- `apps/api`: NestJS on Express, global prefix `api/v1`.
- `packages/shared`: Zod contracts and pure core functions used by both apps.

## AI pipeline

`apps/api/src/modules/llm/` is the only code that calls a model. Feature modules import `LlmModule` and call `LlmService.generateStructured({ feature, schema, system, prompt, maxOutputTokens })`, which returns the validated object with its token counts and cost, or throws `SpendCapReachedError` (callers answer 503 `SPEND_CAP_REACHED`) or `GenerationFailedError` (502 `GENERATION_FAILED`).

Each call runs reserve → call → settle against the `LlmUsage` ledger (`SpendLedgerService`):

1. **Reserve.** The input is estimated at `ceil(chars / 3)` tokens, and its worst case (that input plus `maxOutputTokens`) must fit under both the feature's daily cap and the global one. The reservation inserts a `reserved` row; a refused one throws before the model is called.
2. **Call.** The Vercel AI SDK's `generateText` with `Output.object` and the Anthropic provider (`LLM_MODEL`), thinking off and effort `low`, a 30 s total timeout and one retry on 5xx or 429.
3. **Settle.** The row becomes `settled` at the cost of the AI SDK's `usage`. A failed call becomes `failed`: output that fails the schema at its usage (then one retry, which reserves its own row), an error status at zero, and a timeout or lost connection at its worst case.

The caps, the price table and the cost math live in `llm/budget.ts`, as pure functions; env overrides each cap and the configured model's prices. Committed spend counts an open reservation at `reservedUsd` and a closed row at `costUsd`, per UTC day; `GET /health` reports the same figure as `llm.spentTodayUsd`.

Reservations are serialised per UTC day: each runs in one transaction that first takes `pg_advisory_xact_lock(<ledger key>, <UTC day number>)`, so two concurrent reservations can't both read the spend from before the other's row.
