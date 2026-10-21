# COSMOZ API — production image (multi-stage, pnpm monorepo)
# Build from the repository root:
#   docker build -f apps/api/Dockerfile -t cosmoz-api .
FROM node:24-bookworm-slim AS base
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable

# ── Dependencies ─────────────────────────────────────────────────────────────
FROM base AS deps
WORKDIR /repo
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/api/package.json apps/api/
COPY packages/shared/package.json packages/shared/
RUN corepack pnpm install --frozen-lockfile --ignore-scripts \
 && corepack pnpm rebuild

# ── Build ────────────────────────────────────────────────────────────────────
FROM deps AS build
WORKDIR /repo
COPY apps/api/ apps/api/
COPY packages/shared/ packages/shared/
RUN corepack pnpm --filter @cosmoz/api prisma:generate \
 && corepack pnpm --filter @cosmoz/api build

# ── Runtime ──────────────────────────────────────────────────────────────────
FROM base AS runtime
WORKDIR /repo
ENV NODE_ENV=production
# Prisma engines require openssl.
RUN apt-get update -qq && apt-get install -y -qq openssl && rm -rf /var/lib/apt/lists/*
COPY --from=build /repo/apps/api/dist apps/api/dist
COPY --from=build /repo/apps/api/prisma apps/api/prisma
COPY --from=build /repo/node_modules node_modules
COPY --from=build /repo/packages packages/
COPY apps/api/package.json apps/api/
WORKDIR /repo/apps/api
EXPOSE 4000
# Health check targets the unversioned infrastructure endpoint.
HEALTHCHECK --interval=30s --timeout=3s --retries=3 \
  CMD node -e "fetch('http://localhost:4000/health/live').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "--enable-source-maps", "dist/apps/api/src/main.js"]
