# X20: Cron/Scheduler Coverage — Hostile Audit

**Date:** 2026-04-05
**Scope:** All `@Cron` decorators in `apps/api/src/`
**Module registration:** `ScheduleModule.forRoot()` in `app.module.ts` (line 141) — confirmed active
**`@Interval` usage:** NONE found (good — all time-based tasks use `@Cron`)
**`SchedulerRegistry` usage:** NONE found (no dynamic cron registration)

---

## Complete Cron Inventory

| # | Service | Method | Schedule | Description | Has Lock? |
|---|---------|--------|----------|-------------|-----------|
| 1 | `counter-reconciliation.service.ts` | `reconcileUserFollowCounts` | `0 4 * * *` (daily 4 AM) | Fix followers/following count drift | YES |
| 2 | `counter-reconciliation.service.ts` | reconcilePostLikesCount | `0 4 15 * *` (15th monthly 4 AM) | Fix post likes count drift | YES |
| 3 | `counter-reconciliation.service.ts` | reconcilePostCommentsCount | `30 4 * * 0` (Sun 4:30 AM) | Fix post comments count drift | YES |
| 4 | `counter-reconciliation.service.ts` | reconcilePostSharesCount | `15 4 15 * *` (15th monthly 4:15 AM) | Fix post shares count | YES |
| 5 | `counter-reconciliation.service.ts` | reconcilePostSavesCount | `30 4 15 * *` (15th monthly 4:30 AM) | Fix post saves count | YES |
| 6 | `counter-reconciliation.service.ts` | reconcileUserPostsCount | `45 4 * * *` (daily 4:45 AM) | Fix user posts count | YES |
| 7 | `counter-reconciliation.service.ts` | reconcileUserThreadsCount | `0 5 * * *` (daily 5 AM) | Fix user threads count | YES |
| 8 | `counter-reconciliation.service.ts` | reconcileCircleMembersCount | `35 4 * * 0` (Sun 4:35 AM) | Fix circle member count | YES |
| 9 | `counter-reconciliation.service.ts` | reconcileVideoLikesCount | `0 5 15 * *` (15th monthly 5 AM) | Fix video likes count | YES |
| 10 | `counter-reconciliation.service.ts` | reconcileVideoCommentsCount | `15 5 15 * *` (15th monthly 5:15 AM) | Fix video comments count | YES |
| 11 | `counter-reconciliation.service.ts` | reconcileReelLikesCount | `30 5 15 * *` (15th monthly 5:30 AM) | Fix reel likes count | YES |
| 12 | `counter-reconciliation.service.ts` | reconcileReelCommentsCount | `0 6 15 * *` (15th monthly 6 AM) | Fix reel comments count | YES |
| 13 | `counter-reconciliation.service.ts` | reconcileUnreadCounts | `45 5 15 * *` (15th monthly 5:45 AM) | Fix conversation unread count | YES |
| 14 | `search-reconciliation.service.ts` | `reconcileSearchIndex` | `0 5 * * 0` (Sun 5 AM) | Re-index last 7 days of content in Meilisearch | YES |
| 15 | `payment-reconciliation.service.ts` | `reconcileAll` | `0 6 * * *` (daily 6 AM) | Reconcile tips, orders, subs, coins vs Stripe | YES |
| 16 | `devices.service.ts` | `cleanupStaleTokens` | `0 0 4 * * *` (daily 4 AM) | Delete inactive devices older than 90 days | YES |
| 17 | `downloads.service.ts` | `cleanupExpiredDownloads` | `0 4 * * *` (daily 4 AM) | Delete expired offline downloads | YES |
| 18 | `circles.service.ts` | `cleanupExpiredCircleInvites` | `0 3 * * *` (daily 3 AM) | Delete expired circle invites | YES |
| 19 | `users.service.ts` | `snapshotFollowerCounts` | `0 2 * * *` (daily 2 AM) | Daily follower count snapshot for growth charts | YES |
| 20 | `users.service.ts` | `sendWeeklyScreenTimeDigest` | `0 9 * * 0` (Sun 9 AM) | Weekly screen time report notification | YES (Redis dedup) |
| 21 | `scheduling.service.ts` | `publishOverdueContent` | `EVERY_MINUTE` | Publish posts/threads/reels/videos past scheduledAt | YES |
| 22 | `messages.service.ts` | `publishScheduledMessages` | `EVERY_MINUTE` | Auto-send scheduled DMs/group messages | YES (manual lock) |
| 23 | `messages.service.ts` | `processExpiredMessages` | `EVERY_MINUTE` | Delete disappearing/view-once messages | YES |
| 24 | `messages.service.ts` | `cleanupExpiredDMNotes` | `0 2 * * *` (daily 2 AM) | Delete expired DM notes | YES |
| 25 | `islamic.service.ts` | `sendVerseOfTheDay` | `0 6 * * *` (daily 6 AM) | Push random Quran verse to all users | YES |
| 26 | `islamic.service.ts` | `checkIslamicEventReminders` | `0 8 * * *` (daily 8 AM) | Notify about Ramadan/Eid/etc. | YES |
| 27 | `islamic.service.ts` | `reconcileDhikrCounter` | `0 * * * *` (hourly) | Reconcile Redis vs DB dhikr total | YES |
| 28 | `upload-cleanup.service.ts` | `cleanupOrphanedUploads` | `0 3 * * *` (daily 3 AM) | Delete R2 objects with no DB reference | YES |
| 29 | `privacy.service.ts` | `hardDeletePurgedUsers` | `0 30 4 * * *` (daily 4:30 AM) | GDPR: permanently delete soft-deleted users after 90 days | YES |
| 30 | `privacy.service.ts` | `processScheduledDeletions` | `EVERY_DAY_AT_3AM` | Process scheduled account deletions | YES |
| 31 | `privacy.service.ts` | `purgeOldIpAddresses` | `0 15 4 * * *` (daily 4:15 AM) | GDPR: null IP addresses older than 90 days | YES |
| 32 | `notifications.service.ts` | `cleanupOldNotifications` | `0 30 3 * * *` (daily 3:30 AM) | Delete read notifications > 90 days, unread > 1 year | YES |
| 33 | `two-factor.service.ts` | `rotateEncryptionKeys` | `0 30 5 * * *` (daily 5:30 AM) | TOTP secret key rotation/encryption | YES |
| 34 | `stories.service.ts` | `cleanupExpiredStories` | `0 45 3 * * *` (daily 3:45 AM) | Soft-delete expired non-highlight stories > 7 days | YES |

**Total: 34 cron jobs across 13 services.**

---

## FINDINGS

### CRITICAL

| # | Finding | Severity | Details |
|---|---------|----------|---------|
| X20-C1 | **Schedule collision at 4 AM daily** | Medium | `reconcileUserFollowCounts` (4:00), `cleanupStaleTokens` (4:00), and `cleanupExpiredDownloads` (4:00) all fire at exactly the same time. While they have independent Redis locks, three simultaneous heavy queries at 4 AM could cause DB connection pool exhaustion. Recommend staggering by 5-10 minutes. |
| X20-C2 | **Schedule collision at 3 AM daily** | Medium | `cleanupExpiredCircleInvites` (3:00) and `cleanupOrphanedUploads` (3:00) fire simultaneously. The orphan cleanup does ListObjectsV2 to R2 which could be slow. Stagger. |
| X20-C3 | **No cron for expired event cleanup** | Medium | `EventsService` creates events with `startDate`/`endDate` but there is NO cron to clean up or archive past events. Events persist forever in the DB. At scale, query performance degrades. |
| X20-C4 | **No cron for expired promotion cleanup** | Low | `promotions.service.ts` has promotions with `endDate` but no cleanup cron. Promotions with passed `endDate` remain active in DB. |
| X20-C5 | **No cron for stale audio room cleanup** | Medium | `AudioRoomsService` creates rooms with status `LIVE` or `SCHEDULED` but there is NO cron to auto-end rooms that have been "live" for an unreasonable duration (e.g., > 24 hours). A crashed host leaves a permanent ghost room. |
| X20-C6 | **No cron for stale live session cleanup** | Medium | `LiveService` creates live sessions with `LIVE` status. If the host crashes or disconnects without calling endSession, the session stays `LIVE` forever. No cron to detect and auto-end stale sessions (e.g., no viewer activity for 1 hour). |
| X20-C7 | **No cron for expired scheduled content that was never published** | Low | `scheduling.service.ts` publishes overdue content every minute, but if `publishOverdueContent` has a bug and misses items, there is no reconciliation cron. Consider a daily "stale scheduled content" sweep as a safety net. |
| X20-C8 | **No cron for orphaned conversation cleanup** | Low | Messages can be deleted leaving empty conversations. No cron to clean up conversations with 0 messages. Low priority since soft-deletes are used. |
| X20-C9 | **No cron for BullMQ dead letter / stuck job cleanup** | Medium | BullMQ jobs that fail all retries end up in the failed/dead-letter queue. No cron to: (a) alert on stuck jobs, (b) retry or purge old failed jobs, (c) clean completed jobs older than N days. Redis memory grows unbounded. |
| X20-C10 | **No cron for Redis analytics list consumption** | High | CLAUDE.md explicitly states: "Analytics events pile up in Redis with no consumer (audit finding)." No cron or worker consumes the `analytics:events` Redis list. This is unbounded Redis memory growth. |
| X20-C11 | **Monthly counter reconciliations are too infrequent** | Low | Post likes, shares, saves, video likes/comments, reel likes/comments only reconcile on the 15th of each month. A counter drift on the 16th persists for nearly 30 days before correction. Consider weekly for high-visibility counters. |

### POSITIVE OBSERVATIONS

- All 34 crons use `acquireCronLock()` for distributed locking (safe for multi-instance Railway deployment)
- Lock TTLs are appropriate (55s for minutely, 3500s for daily)
- Good staggering overall across the 2-6 AM window
- Sentry capture on all cron failures
- Counter reconciliation is comprehensive (13 separate counter types)
- Message expiry cron properly clears E2E crypto metadata (forward secrecy)
- GDPR deletion crons (hard delete, IP purge, account deletion) all present and locked

---

## MISSING SCHEDULED CLEANUP TASKS

| Resource | Has Create? | Has Expiry/TTL? | Has Cleanup Cron? | Risk |
|----------|-------------|-----------------|-------------------|------|
| Events | YES | Has endDate | **NO** | Ghost events in DB |
| Audio Rooms | YES | No TTL | **NO** | Permanent ghost rooms |
| Live Sessions | YES | No TTL | **NO** | Permanent ghost sessions |
| Promotions | YES | Has endDate | **NO** | Stale active promotions |
| Challenge (gamification) | YES | Has endDate + isActive | **NO** | Challenges never marked inactive after endDate |
| BullMQ dead-letter | N/A | N/A | **NO** | Redis memory leak |
| Redis analytics list | N/A | N/A | **NO** | Redis memory leak (acknowledged in CLAUDE.md) |
| Draft posts | YES | No TTL | **NO** | Drafts accumulate forever (low risk, per-user) |
