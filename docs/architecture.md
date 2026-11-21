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

### Clustering

`apps/api/src/modules/clustering/` groups stories that report the same event. `ClusteringStep` is the first post-run step (before the rank recompute) and runs when both `FEATURE_CLUSTERS` and `AUTO_CLUSTERING` are on. It decides the stories this run created (`firstSeenAt` at or after the run's start on the database clock), one at a time in `publishedAt`, then `id` order:

1. **Pre-filter.** `ClusterPoolService` loads once per run every story within ±72 h of the new ones, with its cluster's size, and computes each story's entity tokens, title trigrams and CVE/GHSA ids once. `rankClusterCandidates` (`packages/shared/src/core/clustering.ts`) scores `0.45·trgm + 0.45·ent + 0.10·link` in memory (`trgm` is `pg_trgm`'s similarity, computed in TypeScript; `link` is the same project URL or a shared advisory id), offers each cluster once through its best member, skips clusters of 12, drops scores under `CLUSTER_CANDIDATE_MIN_SCORE` and keeps the top 5. This run's not-yet-decided stories are left out. No candidate means no model call and a `null` `clusterScore`.
2. **Decision.** One `LlmService.generateStructured` call (feature `cluster`, `refId` the story, the run's signal) with the `clusterMatch.v1` prompt: S and the candidates in `<source>` blocks, the candidates labelled `c1`..`c5` and mapped back by the server. `clusterDecision` joins S to the matched candidate at confidence `CLUSTER_MIN_CONFIDENCE` or more; `clusterScore` stores the confidence, or 0 for `none`.
3. **Writes.** `ClusterMembershipService` writes each decision in one transaction: S joins the matched story's cluster (read again inside the transaction; a conditional update keeps it at 12 or fewer), or pairs with the matched single story in a new `Cluster` whose representative is that story. Two multi-member clusters never merge. Choosing the representative again and the cluster's rank upkeep belong to the cluster feed issue (#79), which merges before or together with this step.
4. **Fail-safe.** `clusterFailureAction`: a spent cap or a provider error stops the step for the run; invalid or refused output leaves that story single and moves on; an unexpected error is logged, leaves that story single, and stops the step after three in a row. A run makes at most `CLUSTER_MAX_CALLS_PER_RUN` calls. The run's signal is checked before each call and aborts the one in flight, and a story is never decided in a later run.

### Summaries

`apps/api/src/modules/summaries/` builds a story's TL;DR and community consensus. `SummariesService.generate(storyId, trigger, { userId?, signal? })` returns `{ kind: 'cached' | 'created', summary }`: a story with a `Summary` row is answered from it with no fetch and no LLM call, and only a successful call writes a row.

1. **Inputs.** `SummaryInputsService.collectSummaryInputs` loads the story and its own source items (with `FEATURE_CLUSTERS` on, those of every member of its cluster, the representative's first): each HN item's comment tree from HN Algolia (`GET /api/v1/items/{id}`, at most 4 in flight across all summaries), each Dev.to item's comments (`GET /api/comments?a_id=`), and one Dev.to article body (`GET /api/articles/{id}`) as the text: the representative's first Dev.to item's, else the first Dev.to member's in `rankScore` order, else the first excerpt in member order. Dev.to requests go through `common/devto/DevtoClient`, whose one serial queue ingestion's Dev.to adapter shares. A malformed comment is dropped and counted; any failed fetch cancels the story's other fetches and throws `SummaryInputsUnavailableError`, scoped to the `story` (a 404 or malformed payload) or its `upstream` (5xx, 429, timeout, an aborted signal).
2. **Prompt.** `flattenComments` orders the comments breadth-first across the threads and trims them to their token budget; `llm/prompts/storySummary.v1.ts` puts the title, the text and each comment in its own `<source>` block and holds the system prompt, the output schema `StorySummaryLlmSchema` and the per-call budgets. A changed prompt is a new file with the next `PROMPT_VERSION`, which every `Summary` row stores.
3. **Call and store.** `LlmService.generateStructured` with feature `summary_auto` or `summary_on_demand`; the server adds `basedOnComments` and drops the consensus below 5 comments. A unique-key conflict with a concurrent call returns that call's row as `raced`.

**Clusters.** With `FEATURE_CLUSTERS` on, a cluster has one summary, stored on its representative. `findSummary` (`common/story-card/clusterSummary.ts`) is the one lookup: the newest `Summary` among a story's cluster members, or the story's own when it is single. `generate`, `GET /stories/:id/summary`, story detail, `ClusterDetail.summary` and `hasSummary` all use it, so a cluster with a summary on any member is `cached` for every member. A clustered `generate` is single-flight per cluster within the process (`SummariesService` keeps one in-flight promise per cluster id): concurrent requests for any member await it and answer `cached`, so they make one model call. Across instances the unique `Summary.storyId` decides.

`AutoSummariesStep` runs after the rank recompute and before the feed cache is cleared in every ingestion run, when both `FEATURE_SUMMARIES` and `AUTO_SUMMARIES` are on. It summarises the unsummarised Top-window stories with at least 10 comments, in `rankScore` order, leaving out those (with clusters on, those clusters) whose auto call failed today, until 20 auto summaries exist for the UTC day, 25 stories were tried, the HN items of the tried stories reach 25 requests, or the run's 4-min budget is spent. With clusters on, a candidate is a primary story whose comments sum to 10 over all its cluster's items and whose cluster has no summary on any member. `autoFailureAction` in `summaryRules.ts` decides each failure: a spent cap, a provider error or an upstream failure stops the step for the run; invalid or refused output and a story-scoped input failure skip to the next story. `GET /api/v1/stories/:id/summary` serves a stored summary, and with `FEATURE_SUMMARIES` on, story cards carry `hasSummary` and the story detail its `summary`.

`POST /api/v1/stories/:id/summary` (`OnDemandSummaryService`) is the on-demand path: a stored summary answers 200 for free; otherwise a daily quota slot (20 per user, 5 per guest keyed by IP digest `sha256(ip + daily salt)` plus device id, in `RateLimitCounter`) is taken, `generate` runs, and the response is 201. Over the quota is 429 `QUOTA_EXCEEDED`; the route also has a 5/min/IP window. The story page shows the result in `SummaryPanel`, with a Summarize button when none is stored. Choices: [DECISIONS](../DECISIONS.md).

## Clusters

A cluster is a `Cluster` row plus `clusterId`, `isPrimary` and `clusterScore` on its member stories (written by the clustering step). The read side keeps three things current:

- **Rank.** `planRankUpdates` counts `k` for a clustered story over `Cluster.sourceKinds`, so every member carries the same cross-source bonus. After scoring, each cluster with a member in the Top window takes its best-scored member (ties by `id desc`) as representative; only members inside the window compete. `RankingService` then writes `Cluster.representativeStoryId`, `Cluster.rankScore` (the representative's `rankScore`) and `Cluster.sourceKinds` (the union of the members' current kinds) and leaves `isPrimary` true on that member only, all in one transaction batch per cluster. With `FEATURE_CLUSTERS` off the recompute ignores clusters.
- **Retention.** The daily cluster upkeep step runs after the 90-day purge and finds broken clusters in the database (`clusterNeedsUpkeep`: fewer than two members, a wrong count, or not exactly the representative primary). `planClusterUpkeep` (`dailyRules.ts`) decides each: recount `memberCount` and `sourceKinds` and re-pick the representative, or, with fewer than two members left, delete the cluster and reset the remaining story to a single primary story (its `clusterScore` stays).
- **Reads.** With `FEATURE_CLUSTERS` on, every feed query shape filters `isPrimary = true` (the `(isPrimary, rankScore, id)` index), so a cluster is its representative's one card and filters, mutes and follows act on the representative. Cards carry `cluster`, loaded for a page in one query (`common/story-card/clusterCards.ts`); `GET /stories/:id` adds `clusterMembers`, and `GET /clusters/:id` returns the representative and the other members. With the flag off none of these fields is sent.
