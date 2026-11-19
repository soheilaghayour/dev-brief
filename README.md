# DevBrief

A daily brief for developers: stories from Hacker News, Dev.to and curated RSS feeds,
deduplicated, tagged and ranked, with optional AI summaries. The requirements are in
[`docs/prd.md`](docs/prd.md).

## Stack

pnpm monorepo: Next.js (App Router) web app, NestJS API, shared Zod contracts and core
logic, PostgreSQL. Details in [`docs/architecture.md`](docs/architecture.md) and PRD §4.

## Run locally

Needs Node from `.nvmrc`, pnpm and Docker.

```
docker compose up -d
pnpm i
pnpm dev
```

Settings come from `.env.example`; copy it to `.env` to override any value.

The web app runs on http://localhost:3000 and the API on http://localhost:3001; `/api/*` on
the web origin is rewritten to the API. More in [`docs/development.md`](docs/development.md).
