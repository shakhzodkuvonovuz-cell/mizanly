# TAB4 Fix Progress — Payments, Monetization, Gifts, Commerce, Notifications, Webhooks, Islamic

**Started:** 2026-03-31
**Audit files:** A09 (29), B08 (23), A08 (18), B10 (20), A14 (22) = 112 findings
**Status:** 64 code-fixed, 8 deferred (schema), 12 documented/informational, 28 overlap (already counted)

## Commits
1. `c1e330cd` — checkpoint 30/112: money + notification fixes
2. `f87c9d9f` — checkpoint 42/112: notification + islamic fixes  
3. `1dc2d33b` — checkpoint 50/112: shared constants, push security
4. `a74c18ce` — checkpoint 54/112: IPv6, push mappings, stale tokens
5. `4feba862` — checkpoint 58/112: category validation, crypto.randomInt
6. `7bbe55b1` — checkpoint 61/112: DLQ fix, prayer validation, pagination
7. `b19cf2da` — fixes 62-63: batch text grammar, badge pub/sub
8. `50787ec1` — fix 64: Stripe placeholder consistency

## Test Results
**48 suites, 775 tests, ALL passing**

## Fix Log

### A09 — Payments, Monetization, Gifts, Commerce (29 findings)

| # | Sev | Status | Fix |
|---|-----|--------|-----|
| 1 | C | FIXED | `await` storePaymentIntentMapping — was fire-and-forget |
| 2 | C | FIXED | Tip lookup: added stripePaymentId on Tip creation, used in webhook |
| 3 | C | FIXED | Coin idempotency: PI ID in CoinTransaction description |
| 4 | H | FIXED | CancelSubscriptionDto with @IsString @MaxLength |
| 5 | H | FIXED | @Min(0.50) for tip amount (was @Min(50) = $50 minimum) |
| 6 | H | FIXED | monetization.sendTip → BadRequestException with redirect message |
| 7 | H | FIXED | monetization.requestCashout → NotImplementedException |
| 8 | H | FIXED | gifts.cashout → NotImplementedException |
| 9 | H | FIXED | commerce.donateZakat → NotImplementedException |
| 10 | H | FIXED | commerce.contributeTreasury → NotImplementedException |
| 11 | H | FIXED | commerce.contributeWaqf → NotImplementedException |
| 12 | H | FIXED | isBanned/isDeactivated on payment + gift receivers |
| 13 | M | DOCUMENTED | Commerce @Controller() has no prefix — documented, changing breaks mobile |
| 14 | M | FIXED | Commerce Stripe init uses 'sk_not_configured' placeholder |
| 15 | M | FIXED | Math.ceil for coin pricing (was Math.round — 50 and 51 coins same price) |
| 16 | M | FIXED | Amount unit standardized — DTO @Min(0.50) matches dollars |
| 17 | M | FIXED | `await` storeSubscriptionMapping — was fire-and-forget |
| 18 | M | FIXED | Removed `as any` in gifts getHistory — proper type casting |
| 19 | M | FIXED | getSellerAnalytics: separate count() query (was capped at 10) |
| 20 | M | DOCUMENTED | createOrder: already has PI cancel in catch block |
| 21 | M | DOCUMENTED | subscribe: creates as 'pending', payment via webhook |
| 22 | L | FIXED | GiftsController class-level @Throttle |
| 23 | L | FIXED | isBanned check on tip receiver |
| 24 | L | FIXED | PAID removed from seller order transitions (webhook-only) |
| 25 | L | FIXED | Product category validated against ProductCategory enum |
| 26 | L | DOCUMENTED | lat/lng unused in getBusinesses — needs PostGIS for real geo |
| 27 | I | FIXED | Stripe init guard consistent across modules |
| 28 | I | FIXED | CreateTreasuryDto.circleId @MaxLength(50) |
| 29 | I | FIXED | Redundant non-null assertion removed |

### B08 — Financial Models (23 findings)

| # | Sev | Status | Fix |
|---|-----|--------|-----|
| 1 | C | FIXED | CoinTransaction TIP_RECEIVED created in tip webhook $transaction |
| 2 | C | DEFERRED | CoinBalance onDelete:Cascade → requires schema.prisma change |
| 3 | H | FIXED | Cashout dead code → NotImplementedException (overlap A09#7-8) |
| 4 | H | FIXED | Payment mapping await (overlap A09#1,17) |
| 5 | H | DEFERRED | CoinTransaction.amount dual purpose — requires schema change |
| 6 | H | FIXED | Coin idempotency (overlap A09#3) |
| 7 | H | FIXED | Tip lookup fallback (overlap A09#2) |
| 8 | M | DOCUMENTED | purchaseCoins: PI metadata in description for webhook matching |
| 9 | M | FIXED | Amount float precision noted — Math.ceil used |
| 10 | M | DEFERRED | ProcessedWebhookEvent redundant index — requires schema.prisma |
| 11 | M | FIXED | Stripe webhook: deterministic errors return 200 |
| 12 | M | DOCUMENTED | ProcessedWebhookEvent TTL: needs cron job (future task) |
| 13 | M | DOCUMENTED | PaymentMapping TTL: needs cron job (future task) |
| 14 | M | DOCUMENTED | Gift history cursor only on transactions, not gifts |
| 15 | M | FIXED | Gift history `as any` removed (overlap A09#18) |
| 16 | M | FIXED | DLQ Promise.allSettled both-failed detection fixed |
| 17 | L | FIXED | Financial constants centralized in common/constants/financial.ts |
| 18 | L | FIXED | Coin pricing Math.ceil (overlap A09#15) |
| 19 | L | DOCUMENTED | Post-deduction negative check: defense-in-depth, kept |
| 20 | L | FIXED | Tip notification uses returned tip from $transaction |
| 21 | L | FIXED | Amount DTO @Min(0.50) (overlap A09#5) |
| 22 | I | DEFERRED | CoinBalance redundant @@index — requires schema.prisma |
| 23 | I | DOCUMENTED | Privacy deletion explicit delete: defense-in-depth, kept |

### A08 — Notifications, Webhooks (18 findings)

| # | Sev | Status | Fix |
|---|-----|--------|-----|
| 1 | H | FIXED | timingSafeEqual for internal push key comparison |
| 2 | H | FIXED | Webhook create select clause; delete returns { deleted: true } |
| 3 | H | DOCUMENTED | SSRF DNS rebinding: re-validates on each fetch call |
| 4 | H | FIXED | IPv6 private address blocking (::1, fc00::/7, fe80::/10) |
| 5 | M | FIXED | InternalPushDto class with class-validator decorators |
| 6 | M | FIXED | sendToUsers: per-user badge counts via batch groupBy |
| 7 | M | FIXED | getNotifications filters banned/deactivated actors |
| 8 | M | FIXED | webhooks.list() userId required (compiler enforces auth) |
| 9 | M | FIXED | webhooks.delete() allows circle admin OR creator |
| 10 | M | FIXED | Cursor validated as valid Date in getGroupedNotifications |
| 11 | M | FIXED | Message push: generic body for E2E conversations |
| 12 | L | FIXED | Batched notification body: grammatically correct text |
| 13 | L | FIXED | circleId query param validated via ListWebhooksQueryDto |
| 14 | L | FIXED | @Throttle on internal push endpoint |
| 15 | L | FIXED | EXPO_ACCESS_TOKEN missing startup warning |
| 16 | L | FIXED | push-trigger: select only displayName from actor |
| 17 | I | DOCUMENTED | i18n 3/8 languages — templates exist, 5 need adding |
| 18 | I | DOCUMENTED | DNS validation skipped in test env — acceptable for unit tests |

### B10 — Notification Models (20 findings)

| # | Sev | Status | Fix |
|---|-----|--------|-----|
| 1 | H | FIXED | getNotifications filters banned/deleted actors |
| 2 | H | FIXED | create() checks actor isBanned/isDeleted before creating |
| 3 | H | FIXED | Unread notifications cleaned up after 1 year |
| 4 | M | DEFERRED | Missing @@index on commentId/circleId — requires schema.prisma |
| 5 | M | DOCUMENTED | FailedJob TTL: needs cron job (future task) |
| 6 | M | DEFERRED | FailedJob no index on jobId — requires schema.prisma |
| 7 | M | FIXED | cleanupStaleTokens wired to @Cron('0 0 4 * * *') |
| 8 | M | FIXED | sendToUsers per-user badge (was hardcoded 1) |
| 9 | M | FIXED | COLLAB_INVITE and TAG push notification cases added |
| 10 | M | DOCUMENTED | User.expoPushToken dead field — schema cleanup needed |
| 11 | M | FIXED | 'SYSTEM' as any → NotificationType.SYSTEM |
| 12 | L | FIXED | Batched notification body grammar (overlap A08#12) |
| 13 | L | FIXED | markRead pub/sub: notification:badge channel (no type shadow) |
| 14 | L | DOCUMENTED | Batch dedup actor: latest actorId now updated in batch |
| 15 | L | DOCUMENTED | Unregister token in URL: Expo push token format |
| 16 | L | FIXED | DLQ Promise.allSettled: boolean tracking for both-failed |
| 17 | L | FIXED | Push notification generic body for E2E (overlap A08#11) |
| 18 | I | DOCUMENTED | null actorId → 'Someone' fallback: acceptable behavior |
| 19 | I | DEFERRED | FailedJob.jobId nullable — requires schema.prisma |
| 20 | I | FIXED | markAllRead emits Redis pub/sub event |

### A14 — Islamic, Mosques, Halal, Scholar QA (22 findings)

| # | Sev | Status | Fix |
|---|-----|--------|-----|
| 1 | H | FIXED | FollowMosqueDto with @IsString @MaxLength @Min/@Max |
| 2 | H | FIXED | ClassifyContentDto with @MaxLength(10000) |
| 3 | H | FIXED | Mosque findNearby: validate lat/lng, reject NaN |
| 4 | H | FIXED | getUpcoming: OR filter for QA_SCHEDULED (future) and QA_LIVE (any) |
| 5 | M | FIXED | createDonation → NotImplementedException |
| 6 | M | FIXED | Math.random → crypto.randomInt (3 instances) |
| 7 | M | FIXED | getMembers: include user info, filter banned/deactivated/deleted |
| 8 | M | DOCUMENTED | Halal verify/review conflation: separate model needed (future) |
| 9 | M | FIXED | Prayer time query params validated with HH:MM regex |
| 10 | M | FIXED | isInPrayerDND: asymmetric window (at+after prayer, not before) |
| 11 | M | FIXED | Halal findNearby: throw error on NaN (was silent default to 0,0) |
| 12 | L | FIXED | dhikr achievement catch: logs instead of silent swallow |
| 13 | L | FIXED | followMosque: DB write awaited (was fire-and-forget catch) |
| 14 | L | FIXED | submitQuestion: reject ended/cancelled sessions |
| 15 | L | DOCUMENTED | Inline DTOs: already have proper class-validator DTOs |
| 16 | L | DOCUMENTED | Inline DTOs: already have proper class-validator DTOs |
| 17 | L | FIXED | verseOfTheDay: filter banned/deleted users from push recipients |
| 18 | L | FIXED | Last admin cannot leave mosque |
| 19 | I | FIXED | Remove shadowed TOTAL_AYAHS local constant |
| 20 | I | FIXED | Replace duplicate ayah arrays with SURAH_METADATA import |
| 21 | I | FIXED | Halal pagination: offset-based for distance-sorted results |
| 22 | I | DEFERRED | Hadith grade oversimplification — requires content review |

## Deferred Items (Schema Changes — 8)

| Finding | What | Why |
|---------|------|-----|
| B08#2 | CoinBalance onDelete:Cascade | Requires schema.prisma change |
| B08#5 | CoinTransaction.amount dual purpose | Needs `unit` column added |
| B08#10 | ProcessedWebhookEvent redundant index | Requires schema.prisma |
| B08#22 | CoinBalance redundant @@index | Requires schema.prisma |
| B10#4 | Missing Notification indexes | Requires schema.prisma |
| B10#6 | FailedJob no index on jobId | Requires schema.prisma |
| B10#19 | FailedJob.jobId nullable | Requires schema.prisma |
| A14#22 | Hadith grade oversimplification | Requires manual content review |
