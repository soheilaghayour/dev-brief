# Build from the repository root: docker build -f apps/api/Dockerfile .
FROM node:26-slim AS build
WORKDIR /repo
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
# package.json is the one home of the pnpm version.
RUN npm install --global "$(node -p "require('./package.json').packageManager")"
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
# The postinstall hook generates the Prisma client, which needs the schema.
COPY apps/api/prisma apps/api/prisma
COPY apps/api/prisma.config.ts apps/api/
RUN pnpm install --frozen-lockfile
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/api apps/api
RUN pnpm --filter @devbrief/shared build && pnpm --filter api build
# A self-contained production tree for the api only (it includes the built dist); --ignore-scripts skips the postinstall, which needs dev tooling (the client is already generated into dist).
RUN pnpm --filter api --prod --ignore-scripts deploy --legacy /out && test -f /out/dist/main.js

FROM node:26-slim AS runtime
# Prisma's schema engine needs OpenSSL.
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production PORT=3001
WORKDIR /app
COPY --from=build --chown=node:node /out/package.json /out/prisma.config.ts ./
COPY --from=build --chown=node:node /out/node_modules ./node_modules
COPY --from=build --chown=node:node /out/prisma ./prisma
COPY --from=build --chown=node:node /out/dist ./dist
# --ignore-scripts skipped @prisma/engines' postinstall, which fetches the schema engine migrate deploy needs; fetch it now, not at container start.
RUN node node_modules/.pnpm/node_modules/@prisma/engines/scripts/postinstall.js \
  && ls node_modules/.pnpm/node_modules/@prisma/engines/schema-engine-*
# Coolify passes the deployed commit as SOURCE_COMMIT; it is the release Sentry and /health report.
ARG SOURCE_COMMIT=unknown
ENV APP_VERSION=$SOURCE_COMMIT
USER node
EXPOSE 3001
HEALTHCHECK --interval=15s --timeout=5s --start-period=60s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + process.env.PORT + '/api/v1/health').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"
# A failed migration exits non-zero, so the container never turns healthy and Coolify keeps the old one serving.
CMD ["sh", "-c", "node_modules/.bin/prisma migrate deploy && exec node dist/main.js"]
