FROM node:20-alpine AS base
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app

# Install only API dependencies (no mobile/workspace)
FROM base AS deps
COPY apps/api/package.json apps/api/package-lock.json* ./
RUN npm install --omit=dev || npm install

# Build
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY apps/api/ ./
RUN npx prisma generate
RUN npx nest build

# Production
FROM base AS runner
ENV NODE_ENV=production
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nestjs
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/prisma ./prisma
USER nestjs
EXPOSE 3000
CMD ["node", "dist/main.js"]