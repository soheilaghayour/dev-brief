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

### Summaries

`apps/api/src/modules/summaries/` builds a story's TL;DR and community consensus. `SummariesService.generate(storyId, trigger, { userId? })` returns `{ kind: 'cached' | 'created', summary }`: a story with a `Summary` row is answered from it with no fetch and no LLM call, and only a successful call writes a row.

1. **Inputs.** `SummaryInputsService.collectSummaryInputs` loads the story and its own source items: each HN item's comment tree from HN Algolia (`GET /api/v1/items/{id}`, up to 4 at a time), each Dev.to item's comments (`GET /api/comments?a_id=`), and the first Dev.to item's article body (`GET /api/articles/{id}`) as the text, else the story's excerpt. Dev.to requests from all summaries share one serial queue. Any failed fetch throws `SummaryInputsUnavailableError`.
2. **Prompt.** `flattenComments` orders the comments breadth-first across the threads and trims them to their token budget; `llm/prompts/storySummary.v1.ts` puts the title, the text and each comment in its own `<source>` block and holds the system prompt, the output schema `StorySummaryLlmSchema` and the per-call budgets. A changed prompt is a new file with the next `PROMPT_VERSION`, which every `Summary` row stores.
3. **Call and store.** `LlmService.generateStructured` with feature `summary_auto` or `summary_on_demand`; the server adds `basedOnComments` and drops the consensus below 5 comments. A unique-key conflict with a concurrent call returns that call's row as `cached`.

`AutoSummariesStep` runs after the rank recompute in every ingestion run when both `FEATURE_SUMMARIES` and `AUTO_SUMMARIES` are on. It summarises the unsummarised Top-window stories with at least 10 comments, in `rankScore` order, until 20 auto summaries exist for the UTC day; it stops on `SpendCapReachedError` and skips a story whose fetch or generation failed. `GET /api/v1/stories/:id/summary` serves a stored summary, and with `FEATURE_SUMMARIES` on, story cards carry `hasSummary` and the story detail its `summary`.
