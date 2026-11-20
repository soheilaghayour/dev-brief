Recorded provider replies that tests replay through the mock model. CI never calls the live LLM.

`storySummary.v1.prompt-injection.json` is the reply of `LLM_MODEL` (Claude Haiku 5.5) to the AC-2.3.7 case: the story-summary v1 prompt built from `../hn-algolia/prompt-injection.json`. It is written by `apps/api/test/recordLlmFixtures.ts`, which sends that prompt once through `LlmService` with a stand-in ledger and stores the reply's content, finish reason, usage and warnings.

**While the file holds `"placeholder": true`, its reply is hand-written, not recorded, and the tests that read it are skipped with a warning.** Record it with a real key before `FEATURE_SUMMARIES` is turned on in production, and again whenever `storySummary.v1.ts` is replaced by a new prompt version. From the repo root, with `ANTHROPIC_API_KEY` exported in the shell or set in the git-ignored root `.env`:

```sh
pnpm --filter @devbrief/shared build
pnpm --filter api exec dotenv -e ../../.env -e ../../.env.example -- tsx test/recordLlmFixtures.ts injection
```

One call costs well under $0.001. The script prints the parsed summary; check that it describes the named-arguments discussion and follows none of the injected comment's instructions, then run `pnpm exec vitest run --project api src/modules/llm/prompts` and commit the file.

## Cluster pairs

`clusterMatch.v1.pairs.json` holds `LLM_MODEL`'s reply to each pair of `../cluster-pairs.json` and `../cluster-pairs.heldout.json` that passes the candidate pre-filter, keyed by pair id: the clusterMatch v1 prompt built exactly as `ClusteringStep` builds it, with the pair's other story as the only candidate. `requestHashes` holds a hash of the system prompt and user prompt each reply answers, and `test/integration/clusterAccuracy.test.ts` fails when a hash no longer matches, so a changed prompt or pair can't be replayed against an old reply. A reply the model got wrong (invalid or refused output) is recorded too, so the replay leaves the story single as production does.

**While the file holds `"placeholder": true`, its replies are hand-written (all `none`), not recorded, and the AC-2.1.1 precision and recall test is skipped with a warning.** Deleting the flag without recording fails the recall assertion. Record it with a real key (owner step, [issue #82](https://github.com/soheilaghayour/dev-brief/issues/82)) before `FEATURE_CLUSTERS` goes on in production, and again whenever `clusterMatch.v1.ts` or the pairs change. The script needs no database. From the repo root, with `ANTHROPIC_API_KEY` set as above:

```sh
pnpm --filter @devbrief/shared build
pnpm --filter api exec dotenv -e ../../.env -e ../../.env.example -- tsx test/recordLlmFixtures.ts pairs
```

About 40 calls cost under $0.01. The script prints each reply next to the pair's label; then run `pnpm exec vitest run --project api test/integration/clusterAccuracy.test.ts`, which prints precision and recall (and the held-out ones), and commit the file. **If a number misses its target (0.90 and 0.70), do not tune the constants, the prompt or the pairs and record again:** that fits the fixture instead of the model. Report the numbers to the orchestrator or the owner on #82, who decide.
