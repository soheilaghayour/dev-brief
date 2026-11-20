# Architecture

The system as built. The target design is in [`prd.md`](prd.md) §4.

Two apps and one shared package:

- `apps/web`: Next.js, served on one origin with the API.
- `apps/api`: NestJS on Express, global prefix `api/v1`.
- `packages/shared`: Zod contracts and pure core functions used by both apps.

## AI pipeline

`apps/api/src/modules/llm/` is the only code that calls a model. Feature modules import `LlmModule` and call `LlmService.generateStructured({ feature, schema, system, prompt, maxOutputTokens })`, which returns the validated object with its token counts and cost, or throws `SpendCapReachedError` (callers answer 503 `SPEND_CAP_REACHED`) or `GenerationFailedError` (502 `GENERATION_FAILED`).

Each call runs reserve → call → settle against the `LlmUsage` ledger (`SpendLedgerService`):

1. **Reserve.** The estimated input plus `maxOutputTokens`, priced as the call's worst case, must fit under both the feature's daily cap and the global one. The reservation inserts a `reserved` row; a refused one throws before the model is called.
2. **Call.** The Vercel AI SDK's `generateText` with `Output.object` and the Anthropic provider (`LLM_MODEL`), thinking off and effort `low`, with no SDK retries.
3. **Settle.** The row becomes `settled` at the cost of the AI SDK's `usage`, or `failed` at the usage a failure may have billed.

A retry, after invalid output or a transient provider error, is a new reserve → call → settle with its own row; `RETRY_POLICY` in `llm.service.ts` holds the rules, and [`DECISIONS.md`](../DECISIONS.md) the estimate, settle and retry rules with their reasons.

The caps, the price table and the cost math live in `llm/budget.ts`, as pure functions; env overrides each cap and the configured model's prices. Committed spend counts an open reservation at `reservedUsd` and a closed row at `costUsd`, per UTC day; `GET /health` reports the same figure as `llm.spentTodayUsd`.

Reservations are serialised per UTC day: each runs in one transaction that first takes `pg_advisory_xact_lock(<ledger key>, <UTC day number>)`, so two concurrent reservations can't both read the spend from before the other's row. A reservation that times out fails closed with `SpendCapReachedError`.
