# Wave 3: Cron Job Registry & Reliability Audit

## Summary
14 @Cron jobs + 1 setInterval + 1 orphan method. ZERO have Sentry integration. 8 of 14 have NO error handling. NO overlap/lock protection on any job. 1 dead code path (disappearing messages never expire).

## P0 — Critical

### processExpiredMessages is DEAD CODE — never scheduled
- **File:** messages.service.ts:1251
- Has no @Cron decorator. Only called from tests.
- **Impact:** View-once messages persist forever. Disappearing messages never disappear. Privacy violation.

### ZERO Sentry integration in ANY cron job
- All 14 jobs fail silently. HttpExceptionFilter only catches HTTP errors. Cron runs outside HTTP context.

## P1 — High

### publishScheduledMessages can cause duplicate message sends
- **File:** messages.service.ts:1193 — runs every minute
- No dedup/lock. If run A processes 50 messages and run B starts next minute, B reads same 50 messages A hasn't finished updating.

### snapshotFollowerCounts is a memory/connection bomb
- **File:** users.service.ts:832 — runs 2 AM daily
- `take: 200000` loads 200K users into memory. Then 200K upserts (100 concurrent per batch).
- **Impact:** OOM on Railway's 512MB/1GB. Connection pool exhaustion.

### processScheduledDeletions — GDPR compliance failure
- **File:** privacy.service.ts:15 — runs 3 AM daily
- If this job silently fails, users who requested deletion are never deleted.
- No Sentry, no alerting. GDPR violation goes undetected.

## Complete Cron Registry

| # | Job | Schedule | Error Handling | Cap | Overlap Lock | Sentry |
|---|-----|----------|---------------|-----|-------------|--------|
| 1 | publishOverdueContent | Every 1min | NONE | No cap (updateMany) | NONE | NO |
| 2 | publishScheduledMessages | Every 1min | Per-item | 50/tick | **NONE — DUPES** | NO |
| 3 | notifyScheduledPostsPublished | Every 5min | .catch(()=>{}) | 50 | Redis dedup | NO |
| 4 | processScheduledDeletions | 3 AM daily | Per-user | 50 | Safe (daily) | NO |
| 5 | purgeOldIpAddresses | 4 AM daily | Full try/catch | No cap | Safe | NO |
| 6 | cleanupOldNotifications | 3 AM daily | **NONE** | **NO CAP** | Safe | NO |
| 7 | reconcileUserFollowCounts | 4 AM daily | **NONE** | 1000 | Safe | NO |
| 8 | reconcilePostCounts | 4 AM 15th monthly | **NONE** | 500 | Safe | NO |
| 9 | reconcileUserPostCounts | 4:30 AM Sun | **NONE** | 500 | Safe | NO |
| 10 | reconcileSearchIndex | 5 AM Sun | .catch(()=>{}) | 1000/type | Safe | NO |
| 11 | sendVerseOfTheDay | 6 AM daily | Full try/catch | 1000 | Safe | NO |
| 12 | checkIslamicEventReminders | 8 AM daily | **NONE** | 10000 | Redis dedup | NO |
| 13 | snapshotFollowerCounts | 2 AM daily | Partial | **200K** | Safe | NO |
| 14 | sendWeeklyScreenTimeDigest | 9 AM Sun | **NONE** | 10000 | **No dedup** | NO |

## Schedule Collisions
- **3 AM:** processScheduledDeletions + cleanupOldNotifications (both hit Notification table)
- **4 AM:** reconcileUserFollowCounts + purgeOldIpAddresses
- **4 AM on 15th:** adds reconcilePostCounts to above

## Additional Bugs
- sendVerseOfTheDay: verse number calculation `Math.ceil(verseNumber/50)` produces invalid Quran references
- checkIslamicEventReminders: approximate Hijri conversion unreliable — events may fire on wrong days
- cleanupOldNotifications: unbounded DELETE could lock Notification table for minutes at scale
- sendWeeklyScreenTimeDigest: no dedup — server restart on Sunday = duplicate digest notifications
