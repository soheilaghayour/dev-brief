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
