# Build from the repository root: docker build -f apps/web/Dockerfile .
FROM node:26-slim AS build
WORKDIR /repo
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
# package.json is the one home of the pnpm version.
RUN npm install --global "$(node -p "require('./package.json').packageManager")"
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
# The api's postinstall hook generates the Prisma client, which needs the schema.
COPY apps/api/prisma apps/api/prisma
COPY apps/api/prisma.config.ts apps/api/
RUN pnpm install --frozen-lockfile
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/web apps/web
# Public values the Next build inlines into the client bundle (SOURCE_COMMIT is the release); the source-map upload runs only with a token.
ARG SOURCE_COMMIT=unknown
ENV NEXT_PUBLIC_APP_VERSION=$SOURCE_COMMIT
# APP_URL becomes metadataBase, the canonical URL and the OG tags, so the build needs the real origin.
ARG APP_URL
ENV APP_URL=$APP_URL
ARG NEXT_PUBLIC_SENTRY_DSN
ARG NEXT_PUBLIC_FEATURE_SUMMARIES
ARG NEXT_PUBLIC_FEATURE_PREFERENCES
ARG NEXT_PUBLIC_FEATURE_CLUSTERS
ARG NEXT_PUBLIC_FEATURE_COPILOT
ARG NEXT_PUBLIC_FEATURE_RADAR
ARG NEXT_PUBLIC_FEATURE_COLLECTIONS
ARG SENTRY_AUTH_TOKEN
ARG SENTRY_ORG
ARG SENTRY_PROJECT
RUN pnpm --filter @devbrief/shared build && pnpm --filter web build

FROM node:26-slim AS runtime
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0 NEXT_TELEMETRY_DISABLED=1
WORKDIR /app
COPY --from=build --chown=node:node /repo/apps/web/.next/standalone ./
COPY --from=build --chown=node:node /repo/apps/web/.next/static ./apps/web/.next/static
USER node
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + process.env.PORT + '/').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"
CMD ["node", "apps/web/server.js"]
