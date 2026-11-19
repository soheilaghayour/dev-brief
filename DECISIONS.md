# Decisions

Judgment calls in force. Requirements live in [`docs/prd.md`](docs/prd.md); this file
links to them instead of restating them.

## Decisions

- **When two tools fit, pick the one German product-startup job ads ask for.** DevBrief is a portfolio piece; every extra piece of complexity needs a stated reason, here or in the PRD.
- **GitHub Issues are the backlog.** One home for planned work; a `backlog.md` would copy it and drift.
- **`CLAUDE.md` is the one home for agent rules; `AGENTS.md` only points to it.** PRD §4.2 asks for both files; two copies of the same rules drift apart.
- **Every file name is kebab-case; the symbol it exports keeps its own case** (`story-card.tsx` exports `StoryCard`). One rule covers shadcn's generated files, Next.js reserved files, Nest's `feed.controller.ts` and the files the PRD already names (`compile-briefing.ts`, `briefing-plan.ts`).
- **`@/*` maps to `src/*` inside each app, and `packages/shared` is imported as `@devbrief/shared`.** The PRD names neither; one import style in both apps keeps moves cheap.
- **An RSS item without a parseable publish date is skipped.** F1.2 doesn't cover the case, and substituting the fetch time would rank an old post as fresh.

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
