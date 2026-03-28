# Wave 1: Scheduled Publishing Truth Audit

## Summary
10 findings. 3 HIGH, 4 MEDIUM, 1 LOW-MEDIUM, 2 LOW. 7 queries missing scheduledAt filters.

## HIGH Severity

### F1: `enhancedSearch` leaks scheduled posts to ANY searcher
- **File:** `feed-transparency.service.ts:201`
- **Evidence:** `findMany` with `visibility: 'PUBLIC'` but NO scheduledAt filter
- **Failure:** Any user searching keywords matching scheduled post content sees it before publish time
- **Confidence:** Verified broken

### F2: `videos.getFeed` (Minbar) has no scheduledAt filter
- **File:** `videos.service.ts:264-278`
- **Evidence:** WHERE has `status: PUBLISHED, isRemoved: false` but NO scheduledAt
- **Failure:** Future-scheduled videos appear in Minbar feed immediately for all users
- **Confidence:** Verified broken

### F3: `videos.getRecommended` lacks scheduledAt AND isRemoved filter
- **File:** `videos.service.ts:816-824`
- **Evidence:** WHERE checks status/category/tags but NO scheduledAt, NO isRemoved
- **Failure:** Scheduled AND removed videos appear in "up next" recommendations
- **Confidence:** Verified broken

## MEDIUM Severity

### F4: `getOnThisDay` leaks scheduled posts as memories
- **File:** `feed.service.ts:118-130`
- **Failure:** Owner sees scheduled content in memories (low privacy risk, own content)

### F5: `altProfile.getAltProfilePosts` no scheduledAt filter
- **File:** `alt-profile.service.ts:199-200`
- **Failure:** Scheduled alt-profile posts visible to any viewer

### F6: `suggestedPosts` pgvector hydration no scheduledAt filter
- **File:** `recommendations.service.ts:598-603`
- **Failure:** Scheduled posts with embeddings served in suggestions

### F7: `suggestedThreads` pgvector hydration no scheduledAt filter
- **File:** `recommendations.service.ts:746-751`
- **Failure:** Scheduled threads with embeddings served in suggestions

## LOW-MEDIUM

### F8: `channels.getVideos` and `channels.getAnalytics` no scheduledAt
- **File:** `channels.service.ts:268-292, 380-393`

## LOW

### F9: `audio-tracks.getReelsUsingTrack` no scheduledAt
- **File:** `audio-tracks.service.ts:42-46`

### F10: `publishOverdueContent` erases original scheduledAt timestamp
- **File:** `scheduling.service.ts:252-268` — sets `scheduledAt: null`, losing audit trail

## Correctly Filtered (PASS)
All main feed queries (posts, reels, threads), search, hashtags, personalized feed, trending, profile feeds — all correctly use `OR: [{ scheduledAt: null }, { scheduledAt: { lte: new Date() } }]`. Owner visibility correctly implemented in users.service.ts.
