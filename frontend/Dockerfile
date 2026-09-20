# syntax=docker/dockerfile:1.7
#
# Next.js app, built once for the live-ledger backend and served from Next's
# standalone output. node:24 is multi-arch, so this builds natively on both
# arm64 (Apple Silicon) and amd64 — no `platform:` pin needed.

########################################################################
# Stage 1 — dependencies. Only the lockfile lands here, so a source edit
# never re-runs npm ci.
########################################################################
FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci

########################################################################
# Stage 2 — build.
########################################################################
FROM node:24-alpine AS builder
WORKDIR /app

# `NEXT_PUBLIC_*` values are inlined into the bundle at build time, so the
# backend switch and the status-rail label are build arguments, not runtime env.
ARG NEXT_PUBLIC_LEDGER=canton
ARG NEXT_PUBLIC_LEDGER_ENDPOINT="localhost:6864 (Canton sandbox in Docker)"
ENV NEXT_PUBLIC_LEDGER=$NEXT_PUBLIC_LEDGER \
    NEXT_PUBLIC_LEDGER_ENDPOINT=$NEXT_PUBLIC_LEDGER_ENDPOINT \
    NEXT_OUTPUT=standalone \
    NEXT_TELEMETRY_DISABLED=1

COPY --from=deps /app/node_modules ./node_modules
COPY . .
# `public/` is empty in this repo, so git does not carry it and a fresh clone
# has no such directory for the runtime stage to copy.
RUN mkdir -p public && npm run build

########################################################################
# Stage 3 — runtime. Ships the standalone server and the static assets;
# no npm, no lockfile, no full node_modules tree.
########################################################################
FROM node:24-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

# `LEDGER_JSON_API` is read server-side, inside this container, so it must name
# the Canton service by its compose hostname. Overridden in docker-compose.yml.
ENV LEDGER_JSON_API=http://canton:6864

COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

USER node
EXPOSE 3000
CMD ["node", "server.js"]
