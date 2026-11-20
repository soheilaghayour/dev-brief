# DevBrief

Next 16 differs from training data: read `apps/web/node_modules/next/dist/docs/` before writing web code.

Read order: this file → the `docs/prd.md` sections your issue cites → `DECISIONS.md`.
Authority: `docs/prd.md` (the contract) > `DECISIONS.md` > `CLAUDE.md`: the higher wins;
the lower is corrected in the same commit. In code, the API contract's single source is
the Zod schemas in `packages/shared/src/contracts`.

## One fact, one home

Every fact lives in one place; every other place links to it, never copies it. Code
constants have one source (tag slugs in `core/taxonomy.ts`, LLM caps in `llm/budget.ts`,
phase flags in `config/features.ts`).

| Place                               | Its one job                                                                                                         |
| :---------------------------------- | :------------------------------------------------------------------------------------------------------------------ |
| the contract (`docs/prd.md`)        | requirements with stable IDs (`F1.3`, `AC-1.3.4`, `P1-08`), architecture, schema, API, budgets                      |
| `packages/shared/src/contracts`     | the API contract in code: every request/response Zod schema and its inferred type                                   |
| `DECISIONS.md`                      | judgment calls (a one-sentence bold headline, then its reason), open PM questions, rejected and left-out approaches |
| `README.md`                         | what the app is and how to run it (P1-01)                                                                           |
| `CLAUDE.md`                         | how to work in this repo (`AGENTS.md` is a one-line pointer here)                                                   |
| `docs/architecture.md` (P1-01 stub) | the system as built, including the AI pipeline                                                                      |
| `docs/development.md` (P1-01 stub)  | local setup and dev workflows                                                                                       |
| `docs/operations.md` (P1-01 stub)   | deploy, OAuth app setup, backups and the restore runbook                                                            |
| `docs/changelog.md` (P1-01 stub)    | user-visible changes per release                                                                                    |
| git commits, GitHub issues and PRs  | the history: what was done and why                                                                                  |
| code comments                       | only a _why_ the code can't show                                                                                    |

## Commands

Run from the repo root. P1-01 creates these scripts; `package.json` is their source, so a
changed script updates this list in the same commit.

```
docker compose up -d                                     # local Postgres (dev and integration tests need it)
pnpm dev                                                 # shared + web + api in watch mode
pnpm test                                                # Vitest: unit + API integration against real Postgres
pnpm lint · pnpm typecheck · pnpm build · pnpm format:check
pnpm --filter web size                                   # after build: first-load JS per route against apps/web/bundle-budgets.json
pnpm e2e                                                 # Playwright smoke tests in e2e/
SMOKE_BASE_URL=<url> pnpm smoke:prod                     # public-flow smoke suite against a deployed site
pnpm --filter api db:migrate --create-only               # new migration: only in an issue that declares one
pnpm --filter api db:deploy                              # apply migrations
pnpm --filter api db:generate                            # regenerate the Prisma client (also runs on install and build)
pnpm --filter api db:seed                                # seed sources (idempotent)
pnpm --filter api db:seed:e2e                            # replaces all stories with fixed ones for Playwright (e2e DBs only, see ALLOW_DESTRUCTIVE_SEED)
pnpm --filter api ingest:once                            # one full ingestion run
pnpm --filter @devbrief/shared catalog:generate          # regenerate packages/shared/src/a2ui/catalog.v1.json from the catalog's Zod schemas
```

## Structure

```
apps/
  web/                          # Next.js App Router
    src/app/(marketing)/        # landing (ISR), impressum, privacy
    src/app/(app)/              # app routes inside AppShell: feed, story/[id], saved, settings, sign-in; radar, collections (P3)
    src/components/ui/          # design system: shadcn/ui primitives (generated)
    src/components/{feed,story,landing,layout,saves}/  # app components, one folder per area
    src/features/copilot/       # A2UI catalog implementation + command bar (P3)
    src/features/radar/         # Recharts views (P3)
    src/lib/api/                # typed fetch client; parses every response with the shared schemas
    src/lib/guest/              # Zustand guest store (persist → localStorage)
    src/lib/hotkeys/            # shortcut registry: feeds both handlers and the help dialog
    src/content/                # landing-fixture.json: landing data when the API is unreachable at first build
    src/config/                 # features.ts: phase flags
    scripts/                    # checkBundleBudgets.mjs: the first-load JS gate (PRD §8.5); addCompileHints.mjs: runs after next build
  api/                          # NestJS (Express) + Prisma + scheduled ingestion
    prisma/                     # schema.prisma, migrations/, seed/sources.json
    src/                        # main.ts, app.module.ts, env.ts (Zod-validated env, fail fast)
    src/common/                 # cross-cutting: http, errors, zod, rate-limit, origin-guard, cache, logging
    src/modules/<resource>/     # one Nest module per resource: health, auth, feed, stories, sources, saves, ingestion, ranking, maintenance; P2/P3 modules per PRD §4.2
    src/modules/ingestion/adapters/  # one adapter per source: hn, devto, rss, github (P2)
    src/cli/                    # ingestOnce.ts, seed.ts; generateExampleBriefings.ts (P3)
    test/integration/           # API integration tests (Supertest + real Postgres)
    test/fixtures/              # recorded upstream responses; cluster-pairs.json (P2)
packages/shared/
  src/contracts/                # Zod API schemas + inferred types, one file per resource
  src/core/                     # pure decision functions: canonicalizeUrl, normalizeTitle, taxonomy, tagStory, ranking, …
  src/a2ui/                     # DevBrief catalog prop schemas, BriefingPlan, catalog.v1.json (P3)
e2e/                            # Playwright specs + config
docs/                           # the PRD and the docs in the table above; provision.sh: the one-off production setup wizard
.github/                        # workflows/ci.yml, ISSUE_TEMPLATE/
# apps/api/Dockerfile and apps/web/Dockerfile build from the repo root (docs/operations.md)
```

`apps/*` import from `packages/shared`, never from each other. There is no top-level
`scripts/` folder: seed data and the e2e seed live in `apps/api/prisma/`, and CLIs (including the seed) in `apps/api/src/cli/`.

## Naming conventions

| What                              | Style                                                                          | Example                                                                            |
| :-------------------------------- | :----------------------------------------------------------------------------- | :--------------------------------------------------------------------------------- |
| Folders                           | lowercase / kebab-case                                                         | `components/ui`, `story-detail`                                                    |
| React component files             | PascalCase = the component's name, shadcn/ui included (rename generated files) | `StoryCard.tsx`, `FeedPage.tsx`, `components/ui/Button.tsx`                        |
| Other TS files                    | camelCase                                                                      | `canonicalizeUrl.ts`, `briefingPlan.ts`, `ingestOnce.ts`                           |
| Nest files                        | `<name>.<role>.ts`, camelCase stem                                             | `feed.controller.ts`, `sourceHealth.service.ts`, `feed.module.ts`, `hn.adapter.ts` |
| Next.js reserved files            | the framework's required name                                                  | `page.tsx`, `layout.tsx`, `route.ts`, `not-found.tsx`, `opengraph-image.tsx`       |
| Tests                             | next to the file, same name; API integration in `apps/api/test/integration/`   | `canonicalizeUrl.test.ts`, `test/integration/feed.test.ts`                         |
| Variables / functions             | camelCase                                                                      | `canonicalizeUrl`, `storyId`                                                       |
| Types / components / Nest classes | PascalCase                                                                     | `FeedPage`, `StoryCard`, `FeedController`                                          |
| Zod schemas                       | `XxxSchema` + `type Xxx = z.infer<…>`                                          | `FeedPageSchema` / `FeedPage`                                                      |
| Constants / env vars              | UPPER_SNAKE_CASE                                                               | `TAXONOMY_VERSION`, `RANK_GRAVITY`, `LLM_CAP_GLOBAL_USD_DAY`                       |
| Prisma models / fields            | PascalCase singular / camelCase                                                | `SourceItem.reactionsCount`                                                        |

**Import aliases:** `@/*` → `src/*` inside each app; `packages/shared` by its package name
`@devbrief/shared`. Relative imports only within the same folder.

**JSON is camelCase end to end.** API requests and responses, Zod contracts and Prisma
fields share the same camelCase keys (PRD §6.1). No case-conversion layer. Upstream
snake_case (Dev.to `canonical_url`, `public_reactions_count`) is mapped once, inside its
adapter.

**Names say what they hold or do, file names too.** No general name (`data`, `res`, `tmp`,
`item`, `utils.ts`, `helpers.ts`) where a specific one exists. A folder holds a category, so
a category name like `common/` is its specific name.

## Rules that never change

- Code lives next to its only user, in the nearest folder all its users share: code both apps use goes to `packages/shared`, code several web areas use goes to `src/components/` or `src/lib/`, code several Nest modules use goes to `src/common/`. Tests don't count as users: a file's folder tells a reader who uses it.
- Code that makes a decision (URL canonicalisation, title normalisation, dedup, tagging, ranking, cursor encoding, cost and quota math, guest-merge logic, BriefingPlan → A2UI compilation) only takes data and returns data: no React, no Nest, no Prisma, no `fetch`, and `now` is a parameter. Services, hooks and components call it; they don't contain it: decisions stay testable without a database or a browser.
- Raw sources lie: every HN, Dev.to, RSS and GitHub payload, every LLM output, `process.env` and the guest store read from `localStorage` is parsed with Zod at the boundary before use. An invalid upstream item is dropped and counted; it never crashes a run.
- Every request and response has a schema in `packages/shared/src/contracts`. The API validates every input (and every output in dev and test); the web client parses every response. A contract change updates every consumer in the same PR.
- Nest controllers are thin: the Zod pipe parses the input, the controller calls one service method and returns the contract shape. Services own I/O and orchestration. Env is read only through `env.ts`.
- Prisma client for every query except the feed query, which uses parameterised `$queryRaw` tagged templates (PRD §4.2).
- Server Components by default; `'use client'` goes on the smallest component that needs state, effects, browser APIs or event handlers: client JS is budgeted (PRD §8.5).
- Components reach personal state only through the mode hooks (`useSaves()`; P2/P3: `usePreferences()`, `useCollections()`): they never read storage or branch on auth. The URL (`nuqs`) is the only source of truth for filters.
- Colors only by role (`bg-background`, `text-muted-foreground`, `border-border`, `bg-accent`); palette values exist only in the shadcn CSS variables: design changes stay one-line.
- `components/ui/` is the design system: shadcn primitives that know nothing about stories or sources. App components build on it and never use raw form controls (`<input>`, `<button>`, `<textarea>`, `<select>`); labels and fieldsets are structure, not controls. A2UI catalog components are thin adapters over the same app components (`StoryCard`, `TagBadge`, …), not separate UIs.
- A feature behind an off phase flag is absent from the HTML, and its API routes return 404 `FEATURE_DISABLED`.
- A Prisma migration is created only by an issue that declares the schema change, and only one such branch is open at a time: parallel branches can't produce conflicting migration histories.
- Tests use recorded fixtures: no test makes a live network call and CI never calls the live LLM.
- Don't abstract until code is duplicated three times, and no wrapper component that only forwards props: wrong abstractions cost more than duplication.
- Implement only what the current issue asks: scope creep hides review surface.
- Prefer one principle to exceptions: if a case doesn't fit a rule, the rule is usually worded wrong — state the one principle that covers the case; an exception that can't be avoided gets its reason written next to it: exceptions multiply and hide the real rule.
- Used code stays; unused code is deleted, together with every doc line that names it: a reader trusts that what the docs name exists.
- Every acceptance criterion an issue cites has a test whose name starts with its ID (`it('AC-1.2.4 …')`), and every fixed bug gets a regression test (one that fails if the bug comes back); code with no logic of its own, like a ui primitive that only styles a native control, needs no test: untested rules rot, fixed bugs return.
- TypeScript strict, no `any`: the contract types are the safety net.
- Let TypeScript infer; annotate only where it checks something — contract shapes, discriminated results, empty containers, nullable state, `unknown` at trust boundaries: redundant annotations are noise that drifts.
- Prefer flat lookup tables with `satisfies` over generic helpers and conditional types: a reader sees the mapping, the compiler still checks coverage.
- A function doing several jobs is split into named helpers behind one public function; tests go through the public function: each step reads on its own, and tests stay on the seam callers use.
- JSX stays declarative: side effects and multi-line handlers are named functions outside the returned JSX: the markup reads as structure, the behavior has a name.
- State variants are discriminated unions, not several optional flags: impossible combinations can't be represented.

## Things that will bite you (each gets at least one test in the issue that implements it)

**Ingestion**

1. **Engagement scales differ per source.** 300 HN points and 300 Dev.to reactions mean different things: rank by percentile within the source kind over 7 days, `p = 0.5` below 10 items, RSS at its baseline (Appendix B).
2. **URLs disguise duplicates.** Compare only canonical URLs: `utm_*`, `ref`, `fbclid`, `gclid`, `www.`, trailing slash and fragment stripped, host lowercased, query sorted (P1-03). Dev.to's `canonical_url`, not `url`, is the article's identity, so a cross-post joins the original blog's Story (AC-1.2.4).
3. **Title dedup has a window.** Identical normalised titles join one Story only within ±72 h (AC-1.2.5).
4. **Not every HN item is a story.** Keep `type === "story"` that is neither `dead` nor `deleted`; Ask/Show HN posts without `url` link to their HN item page (AC-1.2.3).
5. **HN has two APIs.** Ingestion uses Firebase (`topstories`, then one `item` call per id); Phase 2 comments use Algolia `GET /api/v1/items/{id}`, which returns the whole nested tree in one call.
6. **Dev.to throttles unauthenticated clients.** Requests are serial, ≥ 2.5 s apart, with `Accept: application/vnd.forem.api-v1+json`; on 429 honour `Retry-After` up to 30 s, then abort the source (§8.3).
7. **RSS dates and guids are missing or malformed.** `externalId = sha1(guid ?? link)`; an item without a parseable date is skipped (DECISIONS.md); descriptions are HTML, stored as plain text ≤ 500 chars; a 304 is a success.
8. **One failing source never fails the run.** Every external fetch goes through `HttpClient` (timeout, retries with jitter, size cap); sources run under `Promise.allSettled`, a failure marks the run `partial` (AC-1.2.7), three in a row open the circuit for 6 h (AC-1.2.8), and the whole run stops at 4 min.
9. **Two API instances overlap during a deploy.** Ingestion holds `pg_try_advisory_lock`; the other instance records `skipped` (AC-1.2.2). A second run over the same data creates nothing (AC-1.2.6).
10. **Day buckets are UTC.** `TagDailyStat`, `RateLimitCounter`, `LlmUsage`, the daily auto-summary count and both cron schedules use UTC days: a story published at 23:30 UTC lands in the same bucket under `TZ=Europe/Berlin`.
11. **Taxonomy aliases are ambiguous.** "React to criticism" is not React, "Let's go build it" is not Go, `ts` counts only as a source tag. A taxonomy change bumps `TAXONOMY_VERSION` (Appendix A).
12. **Saved stories survive retention.** The 90-day purge skips any story with a Save (P1-07).

**API and data**

13. **Feed responses are public and cached.** They carry no personal data: saved state comes from `GET /me/saves/ids`, preferences arrive as query params (§4.3.2). Public reads send `public, max-age=60, stale-while-revalidate=300`; authenticated and personal responses send `Cache-Control: private, no-store` (§6.1).
14. **Keyset pagination needs a tiebreaker.** Every order ends with `id desc`; the cursor encodes its sort, and a cursor from another sort gives 400 `INVALID_CURSOR`.
15. **Every non-GET checks `Origin`.** A request without `Origin: APP_URL` gets 403 `FORBIDDEN_ORIGIN` (AC-1.5.9), so integration tests that mutate send that header.
16. **Better Auth needs the raw body.** Mount `/api/auth` with `toNodeHandler(auth)` before Nest's JSON parser: create the app with `bodyParser: false` (§4.2).
17. **The test sign-in route exists only with `AUTH_TEST_MODE=true`,** and env validation rejects that flag when `NODE_ENV=production` or `APP_URL` is not a loopback host.
18. **Guest → account merge is idempotent.** Repeating `POST /me/merge` creates no rows, duplicates keep the earliest `savedAt`, and a failed merge keeps local data and retries on next load (AC-1.5.5, AC-1.5.6).
19. **Prisma 7 moved the connection URL.** It lives in `prisma.config.ts`, and the client uses `@prisma/adapter-pg`.
20. **`searchVector` is a generated column Prisma can't express.** Its migration is hand-edited after `--create-only`; a following `prisma migrate dev` reports no drift, and no code writes the column (§5.2).
21. **Zod is pinned to 3.25.x workspace-wide,** because `@a2ui/react` peers on `zod ^3.25.76`: write Zod 3 APIs imported from `zod`.
22. **Client IPs come from `X-Forwarded-For` with exactly one trusted hop** and are stored only as `sha256(ip + daily salt)` (§8.6).

**Web**

23. **`localStorage` can be unavailable.** The guest store falls back to memory and nothing throws (AC-1.4.4); stored data is parsed and `migrate()`d by version.
24. **The landing build must survive a dead API.** It renders `landing-fixture.json` with the "Sample data" label (AC-L2).
25. **Single-key shortcuts fire only outside editable elements;** `Esc` works everywhere (AC-1.3.8).

**LLM and A2UI (Phases 2–3)**

26. **Never summarise the same story twice.** `Summary.storyId` is unique; a cached summary returns 200 with zero LLM calls and costs no quota (AC-2.3.1).
27. **Reserve worst-case cost before every LLM call.** Estimated input + `maxOutputTokens` is reserved against the per-feature and global daily caps under a per-day advisory lock, then settled with actual usage (AC-2.6.1).
28. **Upstream text is data, never instructions.** It goes inside delimited `<source>` blocks; links, numbers and titles are injected server-side, and storyIds and tags are checked against allowlists (§8.2).
29. **A2UI is spec v1.0.** Server messages are `createSurface`, `updateComponents`, `updateDataModel` and `deleteSurface`, each with `"version": "1.0"`; the v0.8 names `surfaceUpdate`, `dataModelUpdate` and `beginRendering` are deprecated and appear nowhere. The LLM emits only a BriefingPlan, which the server compiles to A2UI (§6.4.4).
30. **The A2UI renderer has no loading state.** Show the skeleton until the `root` component arrives (AC-3.1.2).
31. **SSE needs heartbeats and a POST-capable client.** Send `: ping` every 15 s; the client streams with `fetch` + `eventsource-parser`, since `EventSource` can't POST; compression and buffering are off for `/api/v1/copilot/*` (§6.4.2).

## Frozen

- `docs/prd.md` changes only in a PR whose purpose is amending it.
- Recorded fixtures in `apps/api/test/fixtures/` are never edited, not even to make a test pass. New test data goes into new fixture files.
- An applied migration is never edited; a change is a new migration.
- Better Auth models are generated by its CLI; hand edits stop at `@@map`.
- Appendix B reference values change only together with their reference tests.

## Working agreements

- A product decision is written to `DECISIONS.md` in the same commit as the code that implements it — never later.
- `DECISIONS.md` lists only decisions in force: a replaced decision is deleted, never marked "superseded".
- Comments are one line, next to the code they explain, and only state a _why_ the code can't show: an upstream quirk, a bite, a guard a reader would otherwise "fix". JSDoc is one sentence on what the function does. Comments and JSDoc carry no issue numbers, commits, dates or history: that belongs in git, the issue and the PR.
- Docs stay minimal: each file does only its job from the table above, and no doc points to commits or git history. No defensive code for cases the app needn't survive.
- Pushback comes first: when a request has a flaw, a risk or a simpler alternative, state it with reasons and wait for the user's decision before implementing. With no pushback, implement right away.
- For tasks with 3+ steps, keep a visible todo list.
- Every diff is read by a human: explain why a change is needed, not only what changed.
- State facts plainly: count as a result only what is new — a check that confirms something already known is "already known", not a gain. Never pad: padding hides the real result.
- One issue per PR, in small commits with clear messages. Each PR lists the PRD IDs and AC IDs it covers and adds a test for each; a PR touching `docs/` keeps the PRD consistent.
- Every PR must pass CI. Run `pnpm typecheck && pnpm lint && pnpm test` before committing.
- Never write test counts into docs, issues or PR descriptions: CI shows whether the tests pass.

## Agent skills

### Issue tracker

GitHub Issues on `soheilaghayour/dev-brief`, via the `gh` CLI. An issue cites the PRD IDs
it implements and states each dependency as a line `Blocked by #N`.

### Triage labels

`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`; plus one phase
label: `phase-1`, `phase-2` or `phase-3`.

### Domain docs

The PRD glossary is the domain language; `DECISIONS.md` is the decision log.
