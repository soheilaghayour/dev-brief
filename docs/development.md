# Development

## Local setup

Quickstart: [`README.md`](../README.md#run-locally).

`pnpm dev` builds `packages/shared` first. Rebuild it with `pnpm --filter @devbrief/shared build`
after changing it while `pnpm dev` runs.

The `dev` scripts load the root `.env` over `.env.example`; `build` loads only `.env`. Commands are listed in [`CLAUDE.md`](../CLAUDE.md#commands).

## Database

`docker compose up -d` starts Postgres. The scripts load the root `.env` over `.env.example`:

- `pnpm --filter api db:migrate`: create and apply a migration (`--create-only` to only create it).
- `pnpm --filter api db:deploy`: apply existing migrations.
- `pnpm --filter api db:seed`: upsert the seeded sources; safe to repeat.
- `pnpm --filter api db:generate`: regenerate the Prisma client. It runs on install and build.

`pnpm test` applies the migrations once, and each integration test file starts on emptied tables
(`useTestDatabase()` in `apps/api/test/integration/testDatabase.ts`).

## CI

[`.github/workflows/ci.yml`](../.github/workflows/ci.yml) runs on every pull request and on
push to `main`. Mark these checks as required in the branch protection of `main`:

- `check`: dependency audit, format, lint, typecheck, tests (with Postgres) and build
