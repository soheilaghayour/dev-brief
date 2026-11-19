# Decisions

Judgment calls in force. Requirements live in [`docs/prd.md`](docs/prd.md); this file
links to them instead of restating them.

## Decisions

- **When two tools fit, pick the one German product-startup job ads ask for.** DevBrief is a portfolio piece; every extra piece of complexity needs a stated reason, here or in the PRD.
- **GitHub Issues are the backlog.** One home for planned work; a `backlog.md` would copy it and drift.
- **`CLAUDE.md` is the one home for agent rules; `AGENTS.md` only points to it.** PRD §4.2 asks for both files; two copies of the same rules drift apart.
- **`@/*` maps to `src/*` inside each app, and `packages/shared` is imported as `@devbrief/shared`.** The PRD names neither; one import style in both apps keeps moves cheap.
- **RSS items with a missing or unparseable date are skipped.** F1.2 doesn't cover the case, and substituting the fetch time would rank old posts as fresh.
- **Node 26 (the current Active LTS) and pnpm 12, pinned in `.nvmrc` and `packageManager`.** Tooling versions come from one place each; CI reads both.
- **Nest 12 is ESM-only, so the API and `packages/shared` are ES modules with `.js` import specifiers.** One module system across the repo; the web app is bundled by Next.
- **TypeScript stays on 6.0.x.** `typescript-eslint` doesn't support 7 yet; raise it when it does.
- **The `zod` advisory GHSA-mrhx-c7xc-m3w5 is ignored in `pnpm audit`; every request-input `z.array()` gets `.max()`.** Only 4.6.6 fixes it, and the PRD pins Zod 3.25 for `@a2ui/react` ([§4.1](docs/prd.md#41-system-diagram)); request bodies are capped at 100 KB ([§8.6](docs/prd.md#86-security-basics)). Remove the ignore when the pin lifts.
- **Prisma stays on 7.10.x.** The npm `latest` tag already points at an 8.0 release candidate; the PRD specifies Prisma 7 ([§4.2](docs/prd.md#42-monorepo-layout)).
- **`Verification` keeps the `identifier` index the Better Auth CLI generates, though PRD §5.2 omits it.** The CLI output is the authority for its models ([§5.1](docs/prd.md#51-phase-map)); the index serves its lookups by identifier.
- **`Story.searchVector` declares its generation expression as `@default(dbgenerated(...))` and its GIN index as `@@index`, though PRD [§5.2](docs/prd.md#52-prisma-schema) shows neither.** Without them Prisma sees drift against the hand-edited migration and would drop the index; CI runs `prisma migrate diff --exit-code` to keep it so.
- **Integration tests use their own database, `DATABASE_URL_TEST`.** They truncate every table, which must not wipe the dev data; migrations and tests read the same variable.
- **Uber Engineering is replaced by Shopify Engineering in the seeded RSS list.** Uber's feed URLs return 404 or 406; Shopify's `blog.atom` works and is a comparable engineering blog ([F1.2](docs/prd.md#f12-scheduled-ingestion)).
- **Local env lives in one root `.env`, loaded by `dotenv-cli` in each app's `dev` and `build` scripts; `dev` falls back to `.env.example`, so a fresh clone runs without a `.env`.** Next only reads its own folder's `.env`, and Node refuses `--env-file` in `NODE_OPTIONS`; a missing variable still fails fast at boot.
- **An `exclude` phrase vetoes a tag even when a source tag names it.** [Appendix A](docs/prd.md#appendix-a--tag-taxonomy-v1) runs excludes after source tags; a "Rust Belt" post tagged `rust` by Dev.to is still not about Rust.
- **`canonicalizeUrl` throws on a string that is not an http(s) URL.** Adapters parse upstream items with Zod and drop invalid ones ([CLAUDE.md](CLAUDE.md)); a silent fallback would let a broken URL become a dedup key.
- **`percentile` counts the item itself in its window.** The mid-rank formula in [Appendix B](docs/prd.md#appendix-b--ranking-formula) needs the item in `n`, which keeps p in (0, 1).
- **The API hand-rolls a small Zod pipe and generates OpenAPI with `zod-to-json-schema` instead of using `nestjs-zod`.** `nestjs-zod` declares peers up to Nest 11 and the API runs Nest 12; the pipe is 15 lines and `@nestjs/swagger` still serves the document.
- **The throttler counts one bucket per client IP across all routes.** The library's default key includes the route, which would turn the 120 req/min global limit into a per-route limit.
- **The Origin guard exempts the safe methods GET, HEAD and OPTIONS.** Express answers HEAD with the GET handler, and [§6.1](docs/prd.md#61-conventions)'s CSRF rule targets state-changing requests.
- **An oversized body answers 400 `VALIDATION_FAILED`.** [§6.1](docs/prd.md#61-conventions) has no 413 code and requires the status to match the code.
- **The web server's API calls carry `x-internal-token` (env `INTERNAL_API_TOKEN`) and skip the rate limit.** Server-side calls reach the API without Traefik and without `X-Forwarded-For`, so all visitors would share one 120 req/min bucket; the token is compared in constant time and the API port is not published.
- **Health is `ok` or `degraded` (a source is stale or open); a down database answers 503 `UPSTREAM_UNAVAILABLE`, so `db` is always `ok` in a 200.** [§6.2](docs/prd.md#62-rest-endpoints--phase-1) names the fields but not their values.
- **A source whose kind has no registered adapter is recorded as `skipped`, not `failed`.** The seed lists Dev.to and RSS before their adapters exist; counting them as failures would open their circuits and mark every run `partial` ([F1.2](docs/prd.md#f12-scheduled-ingestion)).
- **The overall run is `failed` only when every source that ran failed, and `skipped` when none ran; skipped sources do not count.** [§8.3](docs/prd.md#83-external-sources-timeouts-retries-circuit-breaking) defines `partial` for "one source failed"; with no source left to succeed, `partial` would hide a total outage, and an all-skipped run recorded as `success` would show green during one.
- **"Last successful run" for `INGEST_ON_BOOT` means an overall run with status `success` or `partial`.** A partial run still refreshed the feed, so re-running at once on every restart would only hammer the sources ([AC-1.2.1](docs/prd.md#f12-scheduled-ingestion)).
- **Sources fetch in parallel but write to the database one source at a time.** Two sources inserting the same canonical URL or title at once would hit the unique constraint or split a Story; writes are cheap next to the network calls.
- **The ingestion lock is a Postgres advisory lock on its own `pg` connection, not the Prisma pool.** A session-level lock must be released on the connection that took it; it also frees itself if the process dies mid-run.
- **`pnpm --filter api ingest:once` builds the shared package and the API, then runs the compiled CLI.** tsx (esbuild) does not emit the decorator metadata Nest's injection reads, and the compiled API imports the shared package from its `dist`.
- **The HN fixtures in `apps/api/test/fixtures/hn/` are real Firebase payloads under a composed id list.** The issue's counts (100 ids, 3 jobs, 2 dead items) must be exact, so the list mixes ids recorded from `topstories`, `jobstories` and a scan of recent items.
- **A re-ingested HN item keeps the Story's first title.** Only the SourceItem title follows edits; re-tagging and title dedup stay stable for a Story.
- **The 4-min run budget covers the source fetches, not the database writes or post-run steps.** A hung write would hold the lock until restart; bounding it is left to the first issue that needs it.
- **A source is `healthy` within 2 hours of its last success, `stale` after, and `circuit_open` while its circuit is open; `/health` and `/sources` share this one rule.** [AC-1.3.11](docs/prd.md#f13-feed-and-discovery) leaves 2-3 h undefined; one constant, `SOURCE_STALE_AFTER_HOURS`, is easy to change.
- **The feed query selects only ids and sort keys in raw SQL; a Prisma read then loads the cards.** The keyset, tag, kind and full-text filters need `$queryRaw` ([§4.2](docs/prd.md#42-monorepo-layout)); loading sources and items through Prisma avoids hand-rolled JSON aggregation.
- **`POST /stories/lookup` drops repeated ids, keeping the first occurrence.** Order is the input order; a card twice in the result would only be noise.
- **Health is never cached and the API version comes from `APP_VERSION` (default `dev`).** A cached health answer would hide an outage.

- **Geist comes from `next/font/google`, not the `geist` package.** It self-hosts a Latin-only subset with `display: swap` as [§7.1](docs/prd.md#71-design-references-and-system) asks; the package ships every weight and subset unsplit. The build needs network access to fetch the font once.
- **The shortcuts help dialog loads on first `?`.** The root layout wraps every page, and the landing budget ([§8.5](docs/prd.md#85-performance-budgets)) can't carry Radix Dialog for a dialog most visitors never open.
- **The sidebar has Feed and Saved, plus Radar behind its flag; Collections arrives with its P3 issue.** Collections has no index route in [§7.2](docs/prd.md#72-routes-and-views), so a `g c` link would point nowhere.
- **E2E runs as the last steps of the `check` job, not as a second job.** One required check, and install, build and Postgres run once; the smoke tests need the built apps and a seeded database, which `check` already has.
- **The first-load JS budgets are 160 KB (landing) and 170 KB (`/feed`) gzip, measured, not the original 90 KB.** Next 16 and React 19 alone weigh ≈135 KB gzip, so 90 KB can't be met by any code change. The shell keeps Radix Dialog (sheets, help dialog) and Sonner out of first load and uses a plain radiogroup for the theme toggle; what remains is the root providers [§7.1](docs/prd.md#71-design-references-and-system) lists (tailwind-merge, TanStack Query, hotkeys, next-themes). Lighthouse ≥ 95 on the landing page is the primary gate.
- **Mobile navigation and mobile filters are two separate sheets, both loaded on first open.** The menu opens a left drawer with the navigation; filters open a bottom sheet (AC-1.3.12), so the filter UI is rendered once per breakpoint and never inside the drawer.
- **The shortcut registry treats a sequence's first key as pending for 1 s.** A plain single-key shortcut does not run in that window, so `g` then `s` (go to Saved) never also fires `s` (save).

## Open PM questions

- Clustering method, thresholds and UI, to revisit with the user before Phase 2 issues exist: [PRD §3.4 O1](docs/prd.md#34-open-items).
- Buying the domain (`devbrief.dev` is a placeholder): [O2](docs/prd.md#34-open-items).
- Whether GitHub star snapshots are worth it over the "new repos by stars" proxy: [O3](docs/prd.md#34-open-items).
- `@a2ui/react` version, React v1.0 support and SSR, re-checked when Phase 3 starts: [O4](docs/prd.md#34-open-items).

## Rejected and left-out approaches

- **Fastify, Drizzle:** Express (Nest's default) and Prisma are what job ads ask for.
- **Lucia:** deprecated; Better Auth with its Prisma adapter replaces it.
- **Vercel, Railway, Render:** one Hetzner VPS with Coolify runs the always-on API (cron, SSE) at a fixed few euros a month ([§4.1](docs/prd.md#41-system-diagram)).
- **Supabase:** Postgres runs as a container on the same VPS.
- **Embeddings and vector search:** tags, full-text search and `pg_trgm` cover the need; reconsidered only if clustering misses its accuracy target ([§1.7](docs/prd.md#17-non-goals-all-phases), O1).
- **Email/password sign-in:** GitHub and Google OAuth only ([AC-1.5.1](docs/prd.md#f15-auth-account-saves-and-merge)).
- **Email digests:** the weekly digest is a Markdown download or clipboard copy ([AC-3.4.4](docs/prd.md#f34-collections-notes-and-digest)).
- **A separate worker process, queues, Redis:** one API process serves REST, SSE and cron ([§1.5](docs/prd.md#15-product-principles)).
- **An A2UI adapter layer or in-house fallback renderer:** `@a2ui/react` is pinned to an exact version and upgraded like any dependency.
- **LLM tagging in Phase 1:** the deterministic taxonomy is pure and testable ([Appendix A](docs/prd.md#appendix-a--tag-taxonomy-v1)); LLM tags are an optional Phase 2 add-on (F2.7).
