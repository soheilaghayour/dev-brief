# Operations

Production deploy, backups and the restore runbook, plus OAuth app setup. Production is one Hetzner VPS running Coolify with three containers on one domain ([PRD §4.1](prd.md#41-system-diagram)): `web`, `api` and a Coolify-managed `postgres`. Nothing is deployed yet; `devbrief.example` below stands for the domain the owner buys ([O2](prd.md#34-open-items)). Nothing in the repo hard-codes it: the values come from the environment.

## First-time setup

[`provision.sh`](provision.sh) is an interactive wizard for steps 1 to 6, 8's secrets and 9's credentials: it opens each provider page, says what to click and writes the values you copy to a private file outside the repo (`~/.config/devbrief/production.env`, mode 600) and an application-only copy beside it, `production.coolify.env`. Run `bash docs/provision.sh`, then enter the values from the `.coolify.env` file in Coolify as listed below, and delete that copy afterwards. Re-running the wizard reuses every saved value; it asks before rotating a generated secret.

1. **Domain.** Buy it and point an `A` record at the VPS.
2. **VPS.** Hetzner Cloud, Ubuntu 24.04, the smallest shared-vCPU plan with at least 4 GB RAM. Coolify builds Next.js on this same machine, so add 2 GB of swap (`fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile`, plus a line in `/etc/fstab`) so a build cannot push the running containers out of memory.
3. **Coolify.** Install it on the VPS (`curl -fsSL https://cdn.coollabs.io/coolify/install.sh | bash` as root), open `http://<ip>:8000` and create the admin account at once.
4. **Postgres.** In a Coolify project: New → Database → PostgreSQL, version 18 (pinned; never `latest`). The clustering migration runs `CREATE EXTENSION pg_trgm`, which the official `postgres:18` image ships in contrib, so nothing needs installing. Keep it internal (no public port). Copy its internal connection URL: it becomes the API's `DATABASE_URL`.
5. **Backups.** See [Backups](#backups).
6. **API application.** New → Application → this GitHub repository, branch `main`, build pack Dockerfile.
   - Base directory `/`, Dockerfile location `/apps/api/Dockerfile`, port `3001`.
   - Domains: `https://devbrief.example/api`. Turn **Strip Prefixes off**: the API serves `/api/v1/*` and `/api/auth/*` with the prefix intact. Traefik routes the longer path to the API and everything else to `web`.
   - Health check: leave the Coolify toggle **off**. A dashboard check runs `curl` or `wget` inside the container, which the slim image does not have; with it off Coolify uses the image's own `HEALTHCHECK` (a `node -e "fetch(...)"` call to `/api/v1/health`), and starts the new container beside the old one and switches only when it reports healthy. On the first deploy confirm in the deployment log that Coolify waited for "healthy".
   - Advanced → **Source commit availability → Available during build** (older Coolify: _Include Source Commit in Build_). Without it the build never sees `SOURCE_COMMIT`, the release is `unknown`, and Sentry and `smoke:prod` flag it.
   - Advanced → **Gzip compression → Disabled**: [`/api/v1/copilot/*`](prd.md#642-sse-wire-format-post-apiv1copilotask) (Phase 3) streams SSE and must not be compressed or buffered.
   - Environment variables: the [API table](#environment-variables). Untick "Available at Buildtime" for each secret; the image build needs none of them.
7. **Web application.** Same repository and branch, Dockerfile `/apps/web/Dockerfile`, port `3000`, domain `https://devbrief.example`, health check toggle off (the image's `HEALTHCHECK` requests `/`), and the same **Available during build** source-commit setting as the API. Mark `API_INTERNAL_URL`, `NEXT_PUBLIC_SENTRY_DSN`, `FEATURE_SUMMARIES`, `FEATURE_CLUSTERS`, `FEATURE_COPILOT`, `FEATURE_COLLECTIONS`, `SENTRY_AUTH_TOKEN`, `SENTRY_ORG` and `SENTRY_PROJECT` as build variables (the DSN and the feature flags are baked into the client bundle; the build fetches the landing page's data from `API_INTERNAL_URL`, and falls back to the sample if the API is not up yet). Environment: the [web table](#environment-variables).
8. **Secrets.** Generate `BETTER_AUTH_SECRET` and `INTERNAL_API_TOKEN` (the wizard does); `INTERNAL_API_TOKEN` must be identical in `api` and `web`.
9. **OAuth apps and the GitHub source token.** Register the production apps with the callbacks in [OAuth apps](#oauth-apps), and create the token in [GitHub source token](#github-source-token).
10. **Auto-deploy.** On both applications enable automatic deployment from `main` (Coolify's GitHub App, or the webhook URL added to the repository). CI must be green before merging, as ever; Coolify deploys the push.
11. **Sources.** The API seeds them itself at every start (see [Deploy and rollback](#deploy-and-rollback)), so there is nothing to run by hand. Set `INGEST_ON_BOOT=true` so the first start fills the feed; the hourly job takes over from there (it needs `INGEST_SCHEDULE=true`).
12. **Check the deploy.** `SMOKE_BASE_URL=https://devbrief.example pnpm smoke:prod` (see [Post-deploy checks](#post-deploy-checks)).

## Environment variables

[`.env.example`](../.env.example) lists every variable with its meaning. All are set in Coolify only; nothing secret is committed. The API and web both fail to start on an invalid environment, so a missing value shows up as a failed deploy, not as a broken site.

| Variable                                                                               | api | web | Value in production                                                                                                                                |
| :------------------------------------------------------------------------------------- | :-- | :-- | :------------------------------------------------------------------------------------------------------------------------------------------------- |
| `APP_URL`                                                                              | yes | yes | `https://devbrief.example`, also a build variable                                                                                                  |
| `DATABASE_URL`                                                                         | yes |     | the Coolify Postgres internal URL                                                                                                                  |
| `INTERNAL_API_TOKEN`                                                                   | yes | yes | the same secret in both                                                                                                                            |
| `API_INTERNAL_URL`                                                                     |     | yes | `https://devbrief.example`: server-side calls go out and back in through the proxy (see below)                                                     |
| `BETTER_AUTH_SECRET`                                                                   | yes |     | `openssl rand -base64 32`                                                                                                                          |
| `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | yes |     | the production OAuth apps                                                                                                                          |
| `AUTH_TEST_MODE`                                                                       | yes |     | `false` (the API refuses `true` in production)                                                                                                     |
| `INGEST_SCHEDULE`                                                                      | yes |     | `true` (the default in production, but set it): off, neither the hourly ingestion nor the daily maintenance runs                                   |
| `INGEST_ON_BOOT`                                                                       | yes |     | `true`                                                                                                                                             |
| `FEATURE_SUMMARIES`, `FEATURE_CLUSTERS`, `FEATURE_COPILOT`, `FEATURE_COLLECTIONS`      | yes | yes | `false` until the feature launches; one shared variable per flag, see [Feature flags in Coolify](#feature-flags-in-coolify)                        |
| `IP_HASH_SECRET`                                                                       | yes |     | 32+ random characters (`openssl rand -base64 32`); required once `FEATURE_SUMMARIES` or `FEATURE_COPILOT` is `true`                                |
| `ANTHROPIC_API_KEY`                                                                    | yes |     | required once `FEATURE_SUMMARIES`, `FEATURE_CLUSTERS` or `FEATURE_COPILOT` is `true` (see [Anthropic key](#anthropic-key-and-spend-limit-phase-2)) |
| `AUTO_SUMMARIES`                                                                       | yes |     | `true` together with `FEATURE_SUMMARIES`; off, no summary is made after ingestion runs                                                             |
| `AUTO_CLUSTERING`                                                                      | yes |     | `true` together with `FEATURE_CLUSTERS`; off, no story is clustered after ingestion runs                                                           |
| `GITHUB_TOKEN`                                                                         | yes |     | the fine-grained token from [GitHub source token](#github-source-token); unset skips GitHub                                                        |
| `SENTRY_DSN`                                                                           | yes |     | the `devbrief-api` project's DSN; unset turns reporting off                                                                                        |
| `NEXT_PUBLIC_SENTRY_DSN`                                                               |     | yes | the `devbrief-web` project's DSN, build variable                                                                                                   |
| `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT`                                    |     | yes | build variables for the source-map upload; without the token the upload is skipped                                                                 |
| `PORT`, `NODE_ENV`, `APP_VERSION`, `NEXT_PUBLIC_APP_VERSION`, `HOSTNAME`               |     |     | set by the Dockerfiles; do not set them. The release is Coolify's `SOURCE_COMMIT` (the commit)                                                     |
| `API_PROXY_URL`                                                                        |     |     | leave unset: it bakes a dev rewrite into the web build                                                                                             |

`API_INTERNAL_URL` is the public URL: see [DECISIONS.md](../DECISIONS.md).

### Feature flags in Coolify

Production has two applications, `api` and `web`, and each flag must have the same value in both: the API answers the routes, the web build decides what the HTML shows, so a flag set on one app only leaves the feature half on. Set each flag once as a Coolify shared variable (the environment's **Shared Variables**, one per flag: `FEATURE_SUMMARIES`, `FEATURE_CLUSTERS`, `FEATURE_COPILOT`, `FEATURE_COLLECTIONS`) and reference it from both apps as `{{environment.FEATURE_COPILOT}}`. On `web`, leave each reference's **Build time** dropdown on "Available during build" (the default): the flags are inlined by `next build`, so after a change redeploy `web` as well as `api`. Keep Build secrets on build arguments (not Docker BuildKit secrets), or the Dockerfile `ARG`s receive nothing and every flag builds off. Radar and follow/mute have no flag and need no variable.

## Deploy and rollback

A push to `main` makes Coolify build both images from the Dockerfiles and replace the containers. The API image's start command (the `CMD` in [`apps/api/Dockerfile`](../apps/api/Dockerfile)) runs the migration, then the seed, then the server: a failed migration or seed exits non-zero, the new container never turns healthy, and Coolify leaves the old container serving (the deployment shows as failed in Coolify).

The seed runs at every API start. It is idempotent and writes each source's `enabled` flag, so switching a source on or off is a change to `apps/api/prisma/seed/sources.json` plus a deploy. The RSS blog sources are off ([PRD §8.8](prd.md#88-content-rights)); their stories stay and age out under retention unless saved.

### Takedown

- To switch a source off, set `enabled: false` in `apps/api/prisma/seed/sources.json` and deploy. A change made only in the database is reverted at the next start.
- To remove a single story, delete it by hand. It can reappear while it is still in the upstream window (HN top stories, Dev.to's 7 days). Durable per-story blocking is not supported, by the owner's choice of simplicity.
- Log the request in `docs/changelog.md`.

A failed migration blocks every later deploy (Prisma P3009) until it is resolved, so a fixing commit alone does not recover. Resolve it from the running (old) API container's Terminal in Coolify:

1. Inspect: `node_modules/.bin/prisma migrate status` names the failed migration; the deployment log shows the SQL error.
2. Undo whatever the failed migration changed before it stopped (connect with `psql` from the Postgres resource's terminal).
3. Tell Prisma it is not applied: `node_modules/.bin/prisma migrate resolve --rolled-back <migration_folder_name>`. If you completed its changes by hand instead, use `--applied <migration_folder_name>`.
4. Push the fixed migration (a new folder; an applied or failed folder is never edited) and let Coolify redeploy.

The old container keeps serving while the new one migrates, so a migration must stay compatible with the previous release: add first, remove in a later release.

Rollback: Coolify → the application → Deployments → pick the last good deployment → Rollback (or redeploy the previous commit). Migrations only move forward, so a rollback is safe only when the bad release added no migration; otherwise ship a new migration that undoes it.

## Post-deploy checks

```
SMOKE_BASE_URL=https://devbrief.example pnpm smoke:prod
```

It checks `/api/v1/health` (`db: ok`, a real release version), the landing page, the guest feed, the security headers on web and API responses, and `/feed` server TTFB at most 400 ms ([§8.5](prd.md#85-performance-budgets)), measured from the machine that runs the smoke, network round trip included. It runs only the public flows: the signed-in flows (smoke tests 3 and 4) use `AUTH_TEST_MODE`, which production refuses, so they run in CI only. The guest-save flow joins the suite when [F1.4](prd.md#f14-guest-saves) ships its smoke test.

## Sentry

Two projects, `devbrief-api` and `devbrief-web`. Both SDKs run with `sendDefaultPii: false`, strip cookies, `authorization`, `x-internal-token` and client IPs in `beforeSend`, and tag every event with the release, the commit that Coolify passes as `SOURCE_COMMIT` when "Available during build" is set (the same value `/api/v1/health` returns as `version`). The web build uploads source maps when `SENTRY_AUTH_TOKEN`, `SENTRY_ORG` and `SENTRY_PROJECT` are set as build variables and deletes them from the image afterwards. The API runs from compiled JavaScript without an upload step, so its stack traces point into `dist/` ([DECISIONS.md](../DECISIONS.md)).

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
2. Start a scratch database: `docker run --rm -d --name restore-test -e POSTGRES_PASSWORD=test postgres:18`. The tools run inside it, so their version always matches the dump.
3. Restore it. A custom-format dump (`.dmp`): `docker cp <file> restore-test:/tmp/backup.dmp && docker exec restore-test pg_restore --no-owner -U postgres -d postgres /tmp/backup.dmp`; a plain `.sql.gz`: `gunzip -c <file> | docker exec -i restore-test psql -U postgres`. Use the database name the Coolify resource uses.
4. Check it: `docker exec restore-test psql -U postgres -c 'select count(*) from "Story"'` is non-zero and `docker exec restore-test psql -U postgres -c 'select count(*) from _prisma_migrations'` matches the number of folders in `apps/api/prisma/migrations`.
5. Stop the container (`docker stop restore-test`).

To restore for real after data loss: create a new Postgres resource from the same steps, restore into it, point the API's `DATABASE_URL` at it and redeploy.

| Date | Backup file | Restored in | Checks passed | By  |
| :--- | :---------- | :---------- | :------------ | :-- |
|      |             |             |               |     |

## Anthropic key and spend limit (Phase 2)

The API refuses to start with `FEATURE_SUMMARIES=true`, `FEATURE_CLUSTERS=true` or `FEATURE_COPILOT=true` and no `ANTHROPIC_API_KEY`. Summaries and the copilot also need `IP_HASH_SECRET`; clusters do not. Before turning summaries or clusters on:

1. Record the real AC-2.3.7 model reply ([issue #57](https://github.com/soheilaghayour/dev-brief/issues/57), steps in [`apps/api/test/fixtures/llm/README.md`](../apps/api/test/fixtures/llm/README.md)). Until then the fixture holds a hand-written placeholder and its tests are skipped, so the prompt-injection defence is unproven against the real model.
2. In the Anthropic Console, create an API key in a workspace used only by DevBrief, and set it as `ANTHROPIC_API_KEY` on the API application in Coolify. Never commit it.
3. In the Console's limits for that workspace, set a monthly spend limit of $2. The in-app daily caps stop spend at $1.98 a month ([§8.1](prd.md#81-llm-cost-model-claude-haiku-55-010--1m-input-050--1m-output-for-prompts--100k-tokens)); the provider limit is the backstop if they fail.
4. Set `AUTO_SUMMARIES=true` with `FEATURE_SUMMARIES=true`: it is a separate switch so that CI, which runs the API with summaries on and a placeholder key, never calls the model.
   Likewise `AUTO_CLUSTERING=true` with `FEATURE_CLUSTERS=true`, after recording the real clustering replies ([issue #82](https://github.com/soheilaghayour/dev-brief/issues/82), steps in the same fixtures README): while `clusterMatch.v1.pairs.json` holds a placeholder, the accuracy test skips and clustering doesn't launch.
5. After the deploy, `GET /api/v1/health` shows `llm.spentTodayUsd` against `llm.capUsd`.

The caps and the per-token prices can be overridden with the `LLM_CAP_*` and `LLM_PRICE_*` variables listed in [`.env.example`](../.env.example); leave them unset in production unless the PRD changes them. Changing `LLM_MODEL` to a model without a price in `apps/api/src/modules/llm/budget.ts` also needs both price variables, or the API refuses to start.

## Example briefings (Phase 3)

The landing's three example briefings, and the copilot's fallback when the daily budget is spent, are generated once by hand: run it after the Phase 3 launch and whenever the examples look stale. It runs the real copilot pipeline for each question in `EXAMPLE_QUESTIONS`, so it needs `ANTHROPIC_API_KEY` and makes three calls billed to the `copilot` ledger feature (cost: [§8.1](prd.md#81-llm-cost-model-claude-haiku-55-010--1m-input-050--1m-output-for-prompts--100k-tokens)).

Run it in the API application's Terminal in Coolify (the image has no `pnpm`, so run the compiled CLI):

```
node dist/cli/generateExampleBriefings.js --confirm-database <database name from DATABASE_URL>
```

The database name is the last part of `DATABASE_URL` (Coolify's default is `postgres`); running without the flag prints it, with its host.

- Without the flag, or with a name that differs from `DATABASE_URL`, it refuses to start.
- Run the preflight in production first (the story counts it prints before any model call, which is also what happens when a question is thin); replace an example question only if its count there is under 3. Replacing a question is the owner's call.
- It prints each question's retrieved story count first. A question with fewer than 3 stories, or a failed generation, stops it with a non-zero exit and the old examples stay; pick a replacement question in `packages/shared/src/a2ui/exampleQuestions.ts` and deploy before running it again.
- It prints each call's cost and the total.
- Two concurrent runs can't mix sets (each swaps all rows in one transaction), but both are billed.
- Turn the copilot on only after the API is live and the examples are generated (this runbook): set the shared `FEATURE_COPILOT`, redeploy `api`, then redeploy `web` once the new `api` is healthy. the landing otherwise shows the one-tab sample with its "Sample data" label. A web build made while the API is unreachable also ships the sample, and the landing swaps in the real examples on the next 15-minute revalidation.
- The landing picks the new examples up within 15 minutes (ISR); the endpoint itself caches for up to 60 s plus 300 s stale-while-revalidate.

## GitHub source token

The GitHub source calls the Search API with a token (30 searches per minute instead of 10). It is a separate credential from the OAuth app below and needs no permissions, because it only searches public repositories ([§8.6](prd.md#86-security-basics)).

1. Open GitHub → Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token.
2. Name it `devbrief-search`, pick an expiration (put the renewal date in the calendar), and set Repository access to **Public repositories**. Add no permissions.
3. Generate it and copy it into the API application's environment in Coolify as `GITHUB_TOKEN`, then redeploy.
4. After the next hourly run, `GET /api/v1/sources` lists `github` as `healthy`. Until the token is set, every run records the source as `skipped` with "GITHUB_TOKEN not set", and a source that has never finished a run stays out of health, the sidebar and the landing's count ([DECISIONS.md](../DECISIONS.md)), so health stays `ok`.

When the token expires, searches fail, and after 3 failed runs the source's circuit opens: generate a new token and replace the value.

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

### Manual check with real credentials

With both apps registered and the variables set, run `pnpm dev` and check:

1. `/sign-in` → Continue with GitHub: GitHub's consent screen asks only for email addresses (`user:email`); after it you return to `/feed` signed in; the session cookie is `HttpOnly`, `Secure`, `SameSite=Lax` and has no `Domain`.
2. Sign out, then Continue with Google using an account with the same verified email: `/settings` shows both GitHub and Google as linked providers for one user.
3. A GitHub account whose primary email is unverified on GitHub is refused: `/sign-in` says to verify the email first, and no user or linked account is created.
