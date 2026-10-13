# SalesOS — production image (Coolify / any Docker host).
# Build:  docker build -t salesos .
# Run:    docker run -p 3000:3000 --env-file .env.production salesos
# Set MIGRATE_ON_START=true to apply Prisma migrations + prisma/sql/extra.sql on boot.

FROM node:22-bookworm-slim AS base
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH NEXT_TELEMETRY_DISABLED=1
RUN corepack enable && corepack prepare pnpm@10.32.1 --activate
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml ./
COPY prisma ./prisma
RUN pnpm install --frozen-lockfile

FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# NEXT_PUBLIC_APP_URL is inlined at build time (Coolify: "Build Variable").
ARG NEXT_PUBLIC_APP_URL
ENV NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL
RUN pnpm build

FROM node:22-bookworm-slim AS runner
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/* \
  && npm install -g prisma@6.19.3 && npm cache clean --force
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0 \
    UPLOAD_DIR=/app/data/uploads
WORKDIR /app
RUN groupadd -g 1001 app && useradd -u 1001 -g app -m app \
  && mkdir -p /app/data/uploads && chown -R app:app /app/data
# Uploaded photos live here — mount a volume on /app/data to keep them across deploys.
VOLUME ["/app/data"]
COPY --from=build --chown=app:app /app/.next/standalone ./
COPY --from=build --chown=app:app /app/.next/static ./.next/static
COPY --from=build --chown=app:app /app/prisma ./prisma
COPY --chown=app:app docker-entrypoint.sh ./docker-entrypoint.sh
USER app
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["sh", "./docker-entrypoint.sh"]
