# Mizanly Production Deploy Checklist

## 1. Database (Neon PostgreSQL)
- [ ] Create production Neon project at neon.tech
- [ ] Set `DATABASE_URL` and `DIRECT_DATABASE_URL` in Railway
- [ ] Run `npx prisma db push` against production DB
- [ ] Verify all 81 models created successfully
- [ ] Enable connection pooling (PgBouncer) for production traffic

## 2. Railway (API Server)
- [ ] Create Railway project with NestJS service
- [ ] Connect GitHub repo, set root directory to `apps/api`
- [ ] Set build command: `npm run build`
- [ ] Set start command: `npm run start:prod`
- [ ] Set all environment variables (see `.env.example`)
- [ ] Enable health check on `/api/v1/health`
- [ ] Set custom domain: `api.mizanly.app`
- [ ] Enable auto-deploy on push to `main`

## 3. Clerk (Authentication)
- [ ] Create production Clerk instance
- [ ] Set `CLERK_SECRET_KEY` and `CLERK_PUBLISHABLE_KEY` (production keys)
- [ ] Configure webhook endpoint: `https://api.mizanly.app/api/v1/auth/webhook`
- [ ] Set `CLERK_WEBHOOK_SECRET` from Clerk dashboard
- [ ] Enable social sign-in (Apple, Google)
- [ ] Configure email/phone verification templates
- [ ] Set allowed origins for production domains

## 4. Cloudflare R2 (Media Storage)
- [ ] Create R2 bucket `mizanly-media`
- [ ] Set CORS policy allowing `https://mizanly.app` and `https://api.mizanly.app`
- [ ] Create API token with R2 read/write permissions
- [ ] Set `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`
- [ ] Set `R2_PUBLIC_URL` to custom domain or R2 public URL
- [ ] Configure lifecycle rules (cleanup temp uploads after 24h)

## 5. Cloudflare Stream (Video)
- [ ] Enable Stream on Cloudflare account
- [ ] Create API token for Stream
- [ ] Set `CF_STREAM_API_TOKEN` and `CF_STREAM_ACCOUNT_ID`
- [ ] Configure video upload limits and allowed origins

## 6. Upstash Redis
- [ ] Create Upstash Redis database (Global region recommended)
- [ ] Set `REDIS_URL` in Railway
- [ ] Verify rate limiting works (100 req/min global throttle)

## 7. Meilisearch
- [ ] Deploy Meilisearch instance (Meilisearch Cloud or self-hosted)
- [ ] Set `MEILISEARCH_HOST` and `MEILISEARCH_API_KEY`
- [ ] Create indexes: `users`, `posts`, `threads`, `channels`
- [ ] Configure searchable attributes and ranking rules

## 8. Stripe (Payments)
- [ ] Create Stripe production account
- [ ] Set `STRIPE_SECRET_KEY` (live key)
- [ ] Configure webhook endpoint: `https://api.mizanly.app/api/v1/payments/webhook`
- [ ] Set `STRIPE_WEBHOOK_SECRET`
- [ ] Enable Connect for creator payouts (if needed)

## 9. Sentry (Error Monitoring)
- [ ] Create Sentry project for NestJS API
- [ ] Set `SENTRY_DSN` in Railway
- [ ] Create Sentry project for React Native (Expo)
- [ ] Configure source maps upload in EAS build

## 10. Resend (Email)
- [ ] Configure Resend with verified domain
- [ ] Set `RESEND_API_KEY` in Railway

## 11. WebRTC (TURN Server)
- [ ] Set up TURN server (Twilio, Metered, or self-hosted coturn)
- [ ] Set `TURN_SERVER_URL`, `TURN_USERNAME`, `TURN_CREDENTIAL`

## 12. Expo / EAS (Mobile Builds)
- [ ] Configure `eas.json` with production profile
- [ ] Set `EXPO_PUBLIC_API_URL=https://api.mizanly.app`
- [ ] Set `EXPO_PUBLIC_PROJECT_ID` for push notifications
- [ ] Build iOS: `eas build --platform ios --profile production`
- [ ] Build Android: `eas build --platform android --profile production`
- [ ] Configure push notification credentials (FCM + APNs) in Expo dashboard
- [ ] Submit to App Store / Google Play

## 13. Web Deploy
- [ ] Build web: `npx expo export --platform web`
- [ ] Deploy to Cloudflare Pages or Vercel
- [ ] Set custom domain: `mizanly.app`
- [ ] Configure service worker for PWA

## 14. DNS
- [ ] `mizanly.app` → web deploy (Cloudflare Pages / Vercel)
- [ ] `api.mizanly.app` → Railway
- [ ] `media.mizanly.app` → R2 bucket public URL

## 15. Pre-Launch Verification
- [ ] Test sign-up / sign-in flow on all platforms
- [ ] Test push notifications on real iOS and Android devices
- [ ] Test media upload (photo + video)
- [ ] Test real-time messaging via Socket.io
- [ ] Test video calls with TURN server
- [ ] Verify rate limiting works
- [ ] Verify CORS allows all expected origins
- [ ] Run lighthouse audit on web version
- [ ] Security audit: check for exposed secrets, OWASP top 10
