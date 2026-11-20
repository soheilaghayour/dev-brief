Recorded provider replies that tests replay through the mock model. CI never calls the live LLM.

`storySummary.v1.prompt-injection.json` is the reply of `LLM_MODEL` (Claude Haiku 5.5) to the AC-2.3.7 case: the story-summary v1 prompt built from `../hn-algolia/prompt-injection.json`. It is written by `apps/api/test/recordLlmFixtures.ts`, which sends that prompt once through `LlmService` with a stand-in ledger and stores the reply's content, finish reason, usage and warnings.

**While the file holds `"placeholder": true`, its reply is hand-written, not recorded, and the tests that read it are skipped with a warning.** Record it with a real key before `FEATURE_SUMMARIES` is turned on in production, and again whenever `storySummary.v1.ts` is replaced by a new prompt version. From the repo root, with `ANTHROPIC_API_KEY` exported in the shell or set in the git-ignored root `.env`:

```sh
pnpm --filter @devbrief/shared build
pnpm --filter api exec dotenv -e ../../.env -e ../../.env.example -- tsx test/recordLlmFixtures.ts
```

One call costs well under $0.001. The script prints the parsed summary; check that it describes the named-arguments discussion and follows none of the injected comment's instructions, then run `pnpm exec vitest run --project api src/modules/llm/prompts` and commit the file.
