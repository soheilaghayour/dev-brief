# Development

## Local setup

Quickstart: [`README.md`](../README.md#run-locally).

Get the pinned pnpm with `npm i -g corepack && corepack enable` (or `npm i -g pnpm@<version from packageManager>`), then `rehash` in zsh; older pnpm (e.g. Homebrew's 9.x) fails with "broken lockfile".

`pnpm dev` builds `packages/shared` first, then keeps it rebuilt in watch mode; the API restarts when it changes (a `git pull` included; tsc doesn't delete `dist` files for removed or renamed sources, which is harmless through the `.` export). A pull that changes shared and the API together can log one `does not provide an export named` crash that recovers by itself once shared rebuilds. Running an app on its own (`pnpm --filter api dev`) needs `pnpm --filter @devbrief/shared dev` (or `build`) alongside it. After `git pull`, still run `pnpm i` if the lockfile changed.

The `dev` scripts and the API's `db:*` scripts load the root `.env` over `.env.example`; the web `build` loads only `.env`. Commands are listed in [`CLAUDE.md`](../CLAUDE.md#commands).

A variable exported in your shell wins over `.env`: a `GITHUB_TOKEN` there (some tools export one) becomes the GitHub source's token, so use a fine-grained token with no permissions ([§8.6](prd.md#86-security-basics)).

## Cron jobs

`INGEST_SCHEDULE` registers the hourly ingestion (:05 UTC) and the daily maintenance (03:15 UTC). Unset, it is on in production and off elsewhere, and `.env.example` sets it to `false`, so `pnpm dev` ingests only when you run `pnpm --filter api ingest:once`; set it to `true` in `.env` to try the schedule. `createTestApp` forces it off (a test opts in with `createTestApp([], { INGEST_SCHEDULE: 'true' })`), and so does CI's e2e API, so no test touches the live sources. `INGEST_ON_BOOT` is independent of it.

## Feature flags

An unlaunched feature is off until its one variable, `FEATURE_<NAME>`, is `true`: the API reads it at boot and the web build inlines the same variable, so rebuild the web app after changing it (`pnpm dev` restarts both). `pnpm build` reads only `.env`, not `.env.example`, so set every `FEATURE_*` you want on there; `FEATURE_COLLECTIONS` set only in `.env.example` is on for the API but off in a build. The flags are `FEATURE_COLLECTIONS` (on in `.env.example`), `FEATURE_SUMMARIES`, `FEATURE_CLUSTERS` and `FEATURE_COPILOT`. To turn on summaries locally, put `FEATURE_SUMMARIES=true` in the root `.env` and restart `pnpm dev`. Summaries, clusters and the copilot need an `ANTHROPIC_API_KEY`, and summaries and the copilot also an `IP_HASH_SECRET`; `AUTO_SUMMARIES=true` additionally summarises the top stories after each ingestion run, which calls the live model. `AUTO_CLUSTERING=true` likewise clusters the new stories after each run, with one live model call per new story that has candidates.

## End-to-end tests

`pnpm e2e` runs Playwright against the built apps and starts the API with `AUTH_TEST_MODE=true`; start that API with `INGEST_SCHEDULE=false` (the default outside production) so e2e runs never hit the live sources. Build the web app with the dev proxy baked in first, since Next fixes rewrites at build time: `API_PROXY_URL=http://localhost:3001 pnpm build`. The session cookie is `Secure`; Chrome and Firefox accept it on `http://localhost`, Safari may not.

## Database

`docker compose up -d` starts Postgres. `prisma generate` runs on install and build and needs no database.

`pnpm test` runs against `DATABASE_URL_TEST` (`devbrief_test`, created on demand), never the dev database: it applies the migrations once and starts each integration test file on emptied tables (`useTestDatabase()`).

## CI

[`.github/workflows/ci.yml`](../.github/workflows/ci.yml) runs on every pull request and on
push to `main`. Mark these checks as required in the branch protection of `main`:

- `check`: dependency audit, format, lint, typecheck, tests (with Postgres) and build
