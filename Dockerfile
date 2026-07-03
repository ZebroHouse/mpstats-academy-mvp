# Stage 1: Base image with pnpm
FROM node:20-alpine AS base
# openssl: Prisma engine needs libssl at BUILD time too (next build prerenders
# pages that init Prisma). Without it Alpine's musl base falls back to the
# openssl-1.1 engine and fails on missing libssl.so.1.1. Mirrors runner stage.
RUN apk update && apk add --no-cache libc6-compat openssl
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
WORKDIR /app

# Stage 2: Prune monorepo for target app
FROM base AS pruner
RUN pnpm add -g turbo@^2
COPY . .
RUN turbo prune @mpstats/web --docker

# Stage 3: Install dependencies (cached layer)
FROM base AS installer
COPY --from=pruner /app/out/json/ .
RUN pnpm install --frozen-lockfile

# Stage 4: Build (inherits from installer which has node_modules)
FROM installer AS builder
COPY --from=pruner /app/out/full/ .

# NEXT_PUBLIC_ variables must be available at build time
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
ARG NEXT_PUBLIC_SITE_URL
ARG NEXT_PUBLIC_CLOUDPAYMENTS_PUBLIC_ID
ARG NEXT_PUBLIC_YANDEX_ID
# Referral pay-gated (i2) mode flag — empty/false = i1. Inlined at build so the
# client copy (ribbon/banner/rules) matches the DB-side referral_pay_gated flag.
ARG NEXT_PUBLIC_REFERRAL_PAY_GATED

ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL
ENV NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=$NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
ENV NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL
ENV NEXT_PUBLIC_CLOUDPAYMENTS_PUBLIC_ID=$NEXT_PUBLIC_CLOUDPAYMENTS_PUBLIC_ID
ENV NEXT_PUBLIC_YANDEX_ID=$NEXT_PUBLIC_YANDEX_ID
ENV NEXT_PUBLIC_REFERRAL_PAY_GATED=$NEXT_PUBLIC_REFERRAL_PAY_GATED

# Staging-only flags — пустые на prod, передаются из docker-compose.staging.yml
ARG NEXT_PUBLIC_STAGING
ENV NEXT_PUBLIC_STAGING=$NEXT_PUBLIC_STAGING

# Server-side env vars needed at build time for Next.js page data collection
# (tRPC route handler initializes Supabase/OpenRouter clients during build)
ARG SUPABASE_SECRET_KEY
ARG OPENROUTER_API_KEY
ARG DATABASE_URL
ARG DIRECT_URL

ENV SUPABASE_SECRET_KEY=$SUPABASE_SECRET_KEY
ENV OPENROUTER_API_KEY=$OPENROUTER_API_KEY
ENV DATABASE_URL=$DATABASE_URL
ENV DIRECT_URL=$DIRECT_URL

RUN mkdir -p /app/apps/web/public
RUN pnpm turbo build --filter=@mpstats/web

# Collect Prisma engine binaries to a known location (version-independent)
RUN mkdir -p /app/prisma-collected && \
    find /app/node_modules/.pnpm -path '*/.prisma/client/*.so.node' -exec cp {} /app/prisma-collected/ \; && \
    find /app/node_modules/.pnpm -path '*/.prisma/client/schema.prisma' -exec cp {} /app/prisma-collected/ \;

# Stage 5: Production runner (minimal image)
FROM node:20-alpine AS runner
WORKDIR /app

# Fix Prisma: Alpine needs openssl for libssl (Prisma auto-detects linux-musl-openssl-3.0.x)
RUN apk add --no-cache openssl

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs
USER nextjs

COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/public ./apps/web/public

# Copy Prisma engine binaries — version-independent (no hardcoded Prisma version)
COPY --from=builder --chown=nextjs:nodejs /app/prisma-collected/*.so.node ./node_modules/.prisma/client/
COPY --from=builder --chown=nextjs:nodejs /app/prisma-collected/schema.prisma ./node_modules/.prisma/client/

ENV NODE_ENV=production
ENV PRISMA_QUERY_ENGINE_LIBRARY=/app/node_modules/.prisma/client/libquery_engine-linux-musl-openssl-3.0.x.so.node
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

EXPOSE 3000

CMD ["node", "apps/web/server.js"]
