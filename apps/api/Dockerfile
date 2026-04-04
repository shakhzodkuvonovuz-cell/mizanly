# ── Stage 1: Build ────────────────────────────────────────────
FROM node:20-alpine AS builder
LABEL maintainer="Mizanly <eng@mizanly.app>" \
      description="Mizanly NestJS API — REST backend for the Mizanly social platform" \
      org.opencontainers.image.source="https://github.com/mizanly/mizanly" \
      org.opencontainers.image.licenses="UNLICENSED"

WORKDIR /app

# Copy root package files for workspace install
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY packages/ packages/

# Install dependencies (production only)
RUN npm ci --legacy-peer-deps --omit=dev && \
    npm cache clean --force

# Copy Prisma schema and generate client
COPY apps/api/prisma/ apps/api/prisma/
RUN npx prisma generate --schema=apps/api/prisma/schema.prisma

# Copy API source and build
COPY apps/api/tsconfig.json apps/api/nest-cli.json apps/api/
COPY apps/api/src/ apps/api/src/
RUN cd apps/api && npx nest build

# ── Stage 2: Production runtime ──────────────────────────────
FROM node:20-alpine AS runner
LABEL maintainer="Mizanly <eng@mizanly.app>" \
      description="Mizanly NestJS API — REST backend for the Mizanly social platform"

WORKDIR /app

# Security: run as non-root
RUN addgroup -S app && adduser -S app -G app

# Copy built artifacts and node_modules from builder
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/api/dist ./dist
COPY --from=builder /app/apps/api/prisma ./prisma
COPY --from=builder /app/apps/api/node_modules/.prisma ./node_modules/.prisma

USER app

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3000/api/v1/health || exit 1

CMD ["node", "dist/main.js"]
