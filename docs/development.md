# Development

## Local setup

```
cp .env.example .env
docker compose up -d
pnpm i
pnpm dev
```

`pnpm dev` builds `packages/shared`, then starts the web app (:3000) and the API (:3001).
The root `.env` is loaded by the `dev` and `build` scripts of both apps. Rebuild the shared
package with `pnpm --filter @devbrief/shared build` after changing it while `pnpm dev` runs.

Commands are listed in [`CLAUDE.md`](../CLAUDE.md#commands).

## CI

[`.github/workflows/ci.yml`](../.github/workflows/ci.yml) runs on every pull request and on
push to `main`. Mark these checks as required in the branch protection of `main`:

- `check`: dependency audit, format, lint, typecheck, tests (with Postgres) and build
