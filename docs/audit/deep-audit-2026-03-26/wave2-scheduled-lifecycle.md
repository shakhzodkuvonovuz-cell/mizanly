# Wave 2 Seam: Scheduled Content Complete Lifecycle

## Summary
13 bugs. 5 Critical, 4 High, 4 Medium. The entire scheduled content pipeline fires side effects at creation (not publication), has zero publication-time side effects, and cancelSchedule accidentally publishes instead of canceling.

## CRITICAL

### 1. Zero publication-time side effects
- `publishOverdueContent` only sets `scheduledAt = null`. Does NOT: notify followers, re-index search, invalidate feed cache, fire analytics, notify channel subscribers.
- Content silently becomes visible with no announcement.

### 2. All side effects fire at CREATION, not publication
- Mention/tag/collaborator notifications fire immediately (users get notified about invisible content)
- XP awarded immediately (XP for unpublished content)
- Hashtag counts inflated immediately (trending affected by invisible content)
- Search indexed immediately (reels/videos indexed with future scheduledAt)
- User postsCount/reelsCount/threadsCount incremented immediately

### 3. All getById methods expose scheduled content to ANYONE with the ID
- posts.service.ts:734, reels.service.ts:469, threads.service.ts:435, videos.service.ts:341
- No scheduledAt check. All interactions (like/comment/save/share/report) possible on unpublished content.

### 4. Race condition kills author notification
- `publishOverdueContent` (every 1 min) nullifies scheduledAt BEFORE `notifyScheduledPostsPublished` (every 5 min) can find it
- Author never told their scheduled post went live

### 5. publishOverdueContent erases original scheduledAt
- Sets scheduledAt=null, destroying audit trail. Original schedule time lost forever.

## HIGH

### 6. cancelSchedule immediately PUBLISHES instead of reverting to draft
- Both `cancelSchedule` and `publishNow` do identical thing: `{ scheduledAt: null }`
- User intending to "cancel" accidentally publishes

### 7. threads.getUserThreads always hides owner's scheduled threads
- Line 898: no owner check (unlike users.service and reels.service which correctly use `isOwn ? {} : filter`)

### 8. Video feed/channel/recommendations have no scheduledAt filter
- videos.service.ts:264 (feed), 816 (recommended), channels.service.ts:268 (channel videos)

### 9. "Reel ready!" notification fires regardless of scheduledAt
- After Stream processing: user gets "Your reel is now live" for future-scheduled reel

## MEDIUM

### 10. publishNow and cancelSchedule are semantically identical
### 11. No publication notification for reels/threads/videos (only posts, and that's broken)
### 12. Cron has no error handling, monitoring, alerting, or transaction wrapping
### 13. No isRemoved check in publishOverdueContent (removed content gets "published")

## CORRECTLY IMPLEMENTED
- 70+ queries across 8 services correctly filter scheduledAt
- Owner can see own scheduled posts/reels on profile (users.service correctly uses isOwn check)
- Reschedule validation requires 15+ min from now
- Cron query is idempotent (catches up on missed items)
- Timezone handling correct (UTC throughout)
