# Development

## Local setup

Quickstart: [`README.md`](../README.md#run-locally).

`pnpm dev` builds `packages/shared` first. Rebuild it with `pnpm --filter @devbrief/shared build`
after changing it while `pnpm dev` runs.

The `dev` scripts and the API's `db:*` scripts load the root `.env` over `.env.example`; the web `build` loads only `.env`. Commands are listed in [`CLAUDE.md`](../CLAUDE.md#commands).

## Database

`docker compose up -d` starts Postgres. `prisma generate` runs on install and build and needs no database.

`pnpm test` runs against `DATABASE_URL_TEST` (`devbrief_test`, created on demand), never the dev database: it applies the migrations once and starts each integration test file on emptied tables (`useTestDatabase()`).

## CI

[`.github/workflows/ci.yml`](../.github/workflows/ci.yml) runs on every pull request and on
push to `main`. Mark these checks as required in the branch protection of `main`:

- `check`: dependency audit, format, lint, typecheck, tests (with Postgres) and build
