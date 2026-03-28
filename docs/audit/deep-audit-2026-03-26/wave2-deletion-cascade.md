# Wave 2 Seam: Deletion → Cascade Across All Models

## Summary
169 models with user-linking FK identified. Only 20 handled by deleteAccount, 19 by deleteAllUserData. ~120 models (~71%) survive deletion entirely. 28+ GDPR Article 9 (religious) data models never deleted. 50+ R2 URL fields orphaned. 16+ Redis key patterns with PII never cleaned.

## P0 — GDPR Legal Violations

### 1. Messages NOT anonymized — user DM content, voice, media survive
### 2. 28+ models with GDPR Art 9 religious data never deleted
- QuranReadingPlan, DhikrSession, FastingLog, HajjProgress, HifzProgress, PrayerNotificationSetting, ContentFilterSetting, MosqueMembership, MosquePost, DuaBookmark, CharityCampaign, IslamicEvent, ScholarQA, ScholarQuestion, FatwaQuestion, StudyCircle, Mentorship, DhikrChallenge, DhikrChallengeParticipant, WaqfFund, ZakatFund, HalalBusiness, etc.

### 3. Cron queries WRONG field (`deletedAt` instead of `scheduledDeletionAt`)
### 4. R2 media NEVER deleted — 50+ URL fields across 27+ models orphaned
### 5. ScholarVerification.documentUrls (identity documents) survive deletion

## Two Divergent Implementations

| Aspect | deleteAccount | deleteAllUserData | Gap |
|--------|--------------|-------------------|-----|
| Location PII strip on posts/reels | NO | YES | DA leaks location |
| Thread reply anonymization | NO | YES | DA leaves content |
| CircleMember/Restrict/FollowRequest | YES | NO | DU misses |
| ThreadBookmark/VideoBookmark | YES | NO | DU misses |
| Notification/WatchHistory/Settings/Streak | NO | YES | DA misses |
| Redis cache clear | YES (user:username) | NO | DU leaves Redis |

## Coverage Matrix Summary

| Category | Models | Handled by EITHER | MISSED |
|----------|--------|-------------------|--------|
| Core content (Post/Reel/Thread/Video/Story) | 5 | 5 (soft-delete) | Location PII |
| Comments/Reactions | 11 | 2 | 9 |
| Social graph (Follow/Block/Mute) | 5 | 5 | - |
| Messaging | 8 | 0 | 8 (CRITICAL) |
| Islamic/Religious | 28+ | 0 | 28+ (Art 9) |
| Financial (Tip/Order/Gift/Coin) | 10 | 0 | Preserved (correct for audit trail) |
| Creator tools | 15+ | 0 | 15+ |
| Community/Circles | 10+ | 1 | 9+ |
| User content (Draft/Saved/Alt) | 8+ | 0 | 8+ (PII) |
| Settings/Preferences | 5 | 1 | 4 |
| Search/Feed behavior | 5 | 0 | 5 |
| Media/Stickers | 6 | 0 | 6 |
| Admin/Moderation | 4 | 0 | Preserved (correct for audit) |

## Never Cleaned on Deletion

### R2/Cloudflare Stream — 50+ URL fields
avatarUrl, coverUrl, mediaUrls[], videoUrl, thumbnailUrl, hlsUrl, dashUrl, audioUrl, recordingUrl, documentUrls[], images[], clipUrl, backgroundUrl — all persist forever

### Redis — 16+ key patterns
user:username, user:customer:*, user:mosque:*, session:*, negative_signals:*, prayer_times:*, feed:foryou:*, ab_assign:*, recommended:channels:*

### Meilisearch — 6 indexes
users, posts, threads, reels, videos, hashtags — documents never removed

### Counters — never decremented
User.followersCount/followingCount on OTHER users, Circle.membersCount, Channel.subscribersCount, Hashtag.postsCount/reelsCount/threadsCount

## Root Cause
1. Soft-delete makes onDelete:Cascade rules decorative — they never fire
2. Two independent implementations evolved separately without a shared checklist
3. No schema-driven deletion generator that auto-discovers all user-linked models
