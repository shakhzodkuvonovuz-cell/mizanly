# Wave 1: Trending/Feed Window Correctness Audit

## Summary
9 findings. 1 HIGH, 4 MEDIUM, 3 LOW, 1 verified correct.

## HIGH

### F1: Trending hashtags have NO time window or decay
- **File:** `hashtags.service.ts:155-178`
- **Evidence:** Raw SQL sorts by `postsCount + reelsCount + threadsCount + videosCount` — lifetime cumulative counters. No WHERE on createdAt, no decay.
- **Failure:** A hashtag popular in January stays "trending" in December. Not trending — just "most popular ever."

## MEDIUM

### F2: Inconsistent trending windows across services (24h/72h/7d)
- PersonalizedFeedService: **24h** with 12h half-life (documented)
- FeedService trending: **7 days** with linear decay
- PostsService for-you: **72 hours** with power-law decay
- ThreadsService/ReelsService trending: **7 days** with linear decay
- CLAUDE.md claims "24h window with 12h decay" — only true for one service

### F3: In-memory scoring with 200-row candidate ceiling
- All trending methods fetch `take: 200` then score in JS
- If 5000 posts in window, only 200 most recent scored
- Pagination broken: cursor is createdAt-ordered but results are score-ordered

### F5: Scoring weights exceed 1.0 when boosts active
- Base weights sum to 1.0, but additive boosts (+0.15 hashtag, +0.10 scholar, +0.05 new creator) push beyond
- Content with multiple boosts gets disproportionately ranked

### F6: Exploration slots only in RecommendationsService
- 15% exploration correctly implemented in recommendations
- Main feeds (ForYou, Following, Trending) have ZERO exploration

## LOW

### F4: 3+ different decay formulas across services
### F9: CommunityTrending sorts by likesCount only (no decay within 24h window)

## VERIFIED CORRECT
### F7: Islamic boost location-awareness works with real GPS coordinates
