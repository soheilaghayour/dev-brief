# Development

## Local setup

Quickstart: [`README.md`](../README.md#run-locally).

`pnpm dev` builds `packages/shared` first. Rebuild it with `pnpm --filter @devbrief/shared build`
after changing it while `pnpm dev` runs.

The `dev` scripts load the root `.env` over `.env.example`; `build` loads only `.env`. Commands are listed in [`CLAUDE.md`](../CLAUDE.md#commands).

## CI

[`.github/workflows/ci.yml`](../.github/workflows/ci.yml) runs on every pull request and on
push to `main`. Mark these checks as required in the branch protection of `main`:

- `check`: dependency audit, format, lint, typecheck, tests (with Postgres) and build
