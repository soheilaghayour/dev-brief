# Operations

Production deploy, backups and the restore runbook, plus OAuth app setup. Production is one Hetzner VPS running Coolify with three containers on one domain ([PRD §4.1](prd.md#41-system-diagram)): `web`, `api` and a Coolify-managed `postgres`. Nothing is deployed yet; `devbrief.example` below stands for the domain the owner buys ([O2](prd.md#34-open-items)). Nothing in the repo hard-codes it: the values come from the environment.

## First-time setup

[`provision.sh`](provision.sh) is an interactive wizard for steps 1 to 6 and 8's secrets: it opens each provider page, says what to click and writes the values you copy to the git-ignored `.env.production`. Run `bash docs/provision.sh`, then enter the values in Coolify as listed below. Delete `.env.production` afterwards.

1. **Domain.** Buy it and point an `A` record at the VPS.
2. **VPS.** Hetzner Cloud, Ubuntu 24.04, the smallest shared-vCPU plan with at least 4 GB RAM.
3. **Coolify.** Install it on the VPS (`curl -fsSL https://cdn.coollabs.io/coolify/install.sh | bash` as root), open `http://<ip>:8000` and create the admin account at once.
4. **Postgres.** In a Coolify project: New → Database → PostgreSQL, version 18 (pinned; never `latest`). Keep it internal (no public port). Copy its internal connection URL: it becomes the API's `DATABASE_URL`.
5. **Backups.** See [Backups](#backups).
6. **API application.** New → Application → this GitHub repository, branch `main`, build pack Dockerfile.
   - Base directory `/`, Dockerfile location `/apps/api/Dockerfile`, port `3001`.
   - Domains: `https://devbrief.example/api`. Turn **Strip Prefixes off**: the API serves `/api/v1/*` and `/api/auth/*` with the prefix intact. Traefik routes the longer path to the API and everything else to `web`.
   - Health check: path `/api/v1/health`, port `3001`, enabled. Coolify then starts the new container beside the old one and switches only when it is healthy.
   - Do not enable gzip/compression for this application: [`/api/v1/copilot/*`](prd.md#642-sse-wire-format-post-apiv1copilotask) (Phase 3) streams SSE and must not be compressed or buffered.
   - Environment variables: the [API table](#environment-variables).
7. **Web application.** Same repository and branch, Dockerfile `/apps/web/Dockerfile`, port `3000`, domain `https://devbrief.example`. Mark `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_AUTH_TOKEN`, `SENTRY_ORG` and `SENTRY_PROJECT` as build variables (the DSN is baked into the client bundle). Environment: the [web table](#environment-variables).
8. **Secrets.** Generate `BETTER_AUTH_SECRET` and `INTERNAL_API_TOKEN` (the wizard does); `INTERNAL_API_TOKEN` must be identical in `api` and `web`.
9. **OAuth apps.** Register the production apps with the callbacks in [OAuth apps](#oauth-apps).
10. **Auto-deploy.** On both applications enable automatic deployment from `main` (Coolify's GitHub App, or the webhook URL added to the repository). CI must be green before merging, as ever; Coolify deploys the push.
11. **Seed the sources** once, after the first deploy: in the API application's Terminal run `node dist/cli/seed.js`. It is idempotent. Set `INGEST_ON_BOOT=true` so the first start fills the feed; the hourly job takes over from there.
12. **Check the deploy.** `SMOKE_BASE_URL=https://devbrief.example pnpm smoke:prod` (see [Post-deploy checks](#post-deploy-checks)).

## Environment variables

[`.env.example`](../.env.example) lists every variable with its meaning. All are set in Coolify only; nothing secret is committed. The API and web both fail to start on an invalid environment, so a missing value shows up as a failed deploy, not as a broken site.

| Variable                                                                               | api | web | Value in production                                                                            |
| :------------------------------------------------------------------------------------- | :-- | :-- | :--------------------------------------------------------------------------------------------- |
| `APP_URL`                                                                              | yes | yes | `https://devbrief.example`                                                                     |
| `DATABASE_URL`                                                                         | yes |     | the Coolify Postgres internal URL                                                              |
| `INTERNAL_API_TOKEN`                                                                   | yes | yes | the same 16+ character secret in both                                                          |
| `API_INTERNAL_URL`                                                                     |     | yes | `https://devbrief.example`: server-side calls go out and back in through the proxy (see below) |
| `BETTER_AUTH_SECRET`                                                                   | yes |     | `openssl rand -base64 32`                                                                      |
| `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | yes |     | the production OAuth apps                                                                      |
| `AUTH_TEST_MODE`                                                                       | yes |     | `false` (the API refuses `true` in production)                                                 |
| `INGEST_ON_BOOT`                                                                       | yes |     | `true`                                                                                         |
| `SENTRY_DSN`                                                                           | yes |     | the `devbrief-api` project's DSN; unset turns reporting off                                    |
| `NEXT_PUBLIC_SENTRY_DSN`                                                               |     | yes | the `devbrief-web` project's DSN, build variable                                               |
| `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT`                                    |     | yes | build variables for the source-map upload; without the token the upload is skipped             |
| `PORT`, `NODE_ENV`, `APP_VERSION`, `NEXT_PUBLIC_APP_VERSION`, `HOSTNAME`               |     |     | set by the Dockerfiles; do not set them. The release is Coolify's `SOURCE_COMMIT` (the commit) |
| `API_PROXY_URL`                                                                        |     |     | leave unset: it bakes a dev rewrite into the web build                                         |

`API_INTERNAL_URL` is the public URL because container names change on every Coolify deploy, so a fixed `http://api:3001` is not available; the web server's calls carry `INTERNAL_API_TOKEN` and skip the per-IP rate limit either way.

## Deploy and rollback

A push to `main` makes Coolify build both images from the Dockerfiles and replace the containers. The API image's start command is `prisma migrate deploy && node dist/main.js`: a failed migration exits non-zero, the new container never turns healthy, and Coolify leaves the old container serving (the deployment shows as failed in Coolify). Fix forward with a new commit.

Rollback: Coolify → the application → Deployments → pick the last good deployment → Rollback (or redeploy the previous commit). Migrations only move forward, so a rollback is safe only when the bad release added no migration; otherwise ship a new migration that undoes it.

## Post-deploy checks

```
SMOKE_BASE_URL=https://devbrief.example pnpm smoke:prod
```

It checks `/api/v1/health` (`db: ok`, a real release version), the landing page, the guest feed, the security headers on web and API responses, and `/feed` server TTFB at most 400 ms ([§8.5](prd.md#85-performance-budgets)). It runs only the public flows: the signed-in flows (smoke tests 3 and 4) use `AUTH_TEST_MODE`, which production refuses, so they run in CI only. The guest-save flow joins the suite when [F1.4](prd.md#f14-guest-saves) ships its smoke test.

## Sentry

Two projects, `devbrief-api` and `devbrief-web`. Both SDKs run with `sendDefaultPii: false` and tag every event with the release, the commit that Coolify passes as `SOURCE_COMMIT` (the same value `/api/v1/health` returns as `version`). The web build uploads source maps when `SENTRY_AUTH_TOKEN`, `SENTRY_ORG` and `SENTRY_PROJECT` are set as build variables and deletes them from the image afterwards. The API runs from compiled JavaScript without an upload step, so its stack traces point into `dist/`.

Beyond unhandled errors, the API sends one event when a source fails 3 times in a row ([§8.3](prd.md#83-external-sources-timeouts-retries-circuit-breaking)), not on every retry.

To check Sentry end to end after the first deploy, throw once from a scratch branch or call the API with a request that makes it fail, and look for the event with the right release.

## Backups

Coolify backs up its managed Postgres to S3-compatible object storage ([§5.3](prd.md#53-retention-and-data-lifecycle)).

1. Create a private bucket (Hetzner Object Storage works) and S3 credentials.
2. Coolify → Storages (S3) → add the endpoint, bucket and keys; use Validate to test the connection.
3. The Postgres resource → Backups → add a scheduled backup: frequency `0 2 * * *` (daily), S3 enabled with the storage above, retention 14 days for the S3 copies (set the local retention low; the S3 copies are the ones that count).
4. Run it once with Backup now and confirm the file appears in the bucket.

### Restore rehearsal

Do this once after the first backup, and note it in the log below. It restores into a throwaway container, never into production:

1. Download the latest backup file from the bucket (any S3 client, for example `aws s3 cp --endpoint-url <endpoint> s3://<bucket>/<path> .`).
2. Start a scratch database: `docker run --rm -d --name restore-test -e POSTGRES_PASSWORD=test -p 5433:5432 postgres:18`.
3. Restore it. A custom-format dump (`.dmp`) restores with `pg_restore --no-owner -h localhost -p 5433 -U postgres -d postgres <file>`; a plain `.sql.gz` with `gunzip -c <file> | psql -h localhost -p 5433 -U postgres`. Use the database name the Coolify resource uses.
4. Check it: `psql ... -c 'select count(*) from "Story"'` is non-zero, and `DATABASE_URL=postgresql://postgres:test@localhost:5433/postgres pnpm --filter api exec prisma migrate status` reports the schema up to date.
5. Stop the container (`docker stop restore-test`).

To restore for real after data loss: create a new Postgres resource from the same steps, restore into it, point the API's `DATABASE_URL` at it and redeploy.

| Date | Backup file | Restored in | Checks passed | By  |
| :--- | :---------- | :---------- | :------------ | :-- |
|      |             |             |               |     |

## Spend limit (Phase 2)

Placeholder: set a monthly spend limit at the LLM provider before enabling Phase 2 summaries, to back the in-app daily caps ([§8.1](prd.md#81-llm-cost-model-claude-haiku-55-010--1m-input-050--1m-output-for-prompts--100k-tokens)).

## OAuth apps

Sign-in uses a GitHub OAuth app and a Google OAuth client. Create one of each for local development and one of each for production; the callback URLs are `${APP_URL}/api/auth/callback/github` and `${APP_URL}/api/auth/callback/google`. Register the production apps once the domain is bought ([PRD §3.4 O2](prd.md#34-open-items)).

| Environment | `APP_URL`                                           | GitHub callback                                     | Google callback                                     |
| :---------- | :-------------------------------------------------- | :-------------------------------------------------- | :-------------------------------------------------- |
| Local       | `http://localhost:3000`                             | `http://localhost:3000/api/auth/callback/github`    | `http://localhost:3000/api/auth/callback/google`    |
| Production  | `https://devbrief.example` (placeholder, see above) | `https://devbrief.example/api/auth/callback/github` | `https://devbrief.example/api/auth/callback/google` |

### GitHub OAuth app

1. Open GitHub → Settings → Developer settings → OAuth Apps → New OAuth App.
2. Set the homepage URL to `APP_URL` and the authorization callback URL to the GitHub callback above.
3. Generate a client secret. Copy the client ID and secret to `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET`.
4. The app requests only the `user:email` scope, which needs no setting on GitHub's side.

### Google OAuth client

1. Open Google Cloud Console → APIs & Services → OAuth consent screen, and configure an external app with the scopes `openid`, `email` and `profile`.
2. Under Credentials, create an OAuth client ID of type Web application.
3. Add `APP_URL` as an authorized JavaScript origin and the Google callback above as an authorized redirect URI.
4. Copy the client ID and secret to `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`.

### Other auth variables

- `BETTER_AUTH_SECRET`: 32+ random characters; generate with `openssl rand -base64 32`. Changing it signs every user out.
- `AUTH_TEST_MODE`: leave `false`. It exists for the Playwright run, and the API refuses to start with `true` in production or when `APP_URL` is not `localhost`, `127.0.0.1` or `::1`.
- `API_PROXY_URL`: leave unset for production builds. It bakes a dev `/api/*` rewrite into the web build; in production Traefik routes `/api`.

### Manual check with real credentials

With both apps registered and the variables set, run `pnpm dev` and check:

1. `/sign-in` → Continue with GitHub: GitHub's consent screen asks only for email addresses (`user:email`); after it you return to `/feed` signed in; the session cookie is `HttpOnly`, `Secure`, `SameSite=Lax` and has no `Domain`.
2. Sign out, then Continue with Google using an account with the same verified email: `/settings` shows both GitHub and Google as linked providers for one user.
3. A GitHub account whose primary email is unverified on GitHub is refused: `/sign-in` says to verify the email first, and no user or linked account is created.
