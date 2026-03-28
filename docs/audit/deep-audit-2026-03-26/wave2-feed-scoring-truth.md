# Wave 2 Seam: Feed Scoring Complete Truth Table

## Summary
25 feed endpoints analyzed. 6 have broken pagination (3 ForYou page 2+ returns empty, 3 trending page 2 = page 1). 3 distinct decay formulas. viewsCount always 0 for Posts/Threads. Block/mute caps range from 0 to 10000.

## BROKEN PAGINATION (6 endpoints)

### Page 2+ returns EMPTY (cursor="20" → new Date("20") = Invalid Date)
1. PostsService.getFeed (ForYou) — posts.service.ts:176+193
2. ThreadsService.getFeed (ForYou) — threads.service.ts:150+173
3. ReelsService.getFeed — reels.service.ts:317+341

### Page 2 = Page 1 (cursor ignored, always slice(0, limit))
4. PostsService.getTrendingFallback — posts.service.ts:277-311
5. ThreadsService.getTrendingThreads — threads.service.ts:235-282
6. ReelsService.getTrendingReels — reels.service.ts:398-450

### WORKING pagination
- PostsService Following/Chronological/Favorites — correct cursor-based
- FeedService.getTrendingFeed — best implementation (score:id:timestamp keyset)
- PersonalizedFeedService.getTrendingFeed — correct ID cursor
- VideosService.getFeed — correct cursor-based

## viewsCount ALWAYS 0 (Posts + Threads)

No code anywhere increments Post.viewsCount or Thread.viewsCount. Only Reels (line 900) and Videos (line 758) have view counting.

**Impact on scoring:**
- Posts ForYou: `views * 0.1` = always 0 (minor)
- PersonalizedFeed engagementScore: `total/views` = 0 when views=0 (makes engagement component 0)
- Recommendations engagementScore: same — engagement is 0 for all posts/threads

## 3 Distinct Decay Formulas

| Formula | Endpoints |
|---------|-----------|
| `1/ageHours^1.5` | Posts ForYou, Threads ForYou |
| `1/ageHours^1.2` | Reels getFeed |
| `1/ageHours` (linear) | 5 trending endpoints |
| `log10(eng+1)/5 * piecewise` | PersonalizedFeed trending (unique) |

## 5 Distinct Time Windows

| Window | Endpoints |
|--------|-----------|
| 24h | PersonalizedFeed trending, CommunityTrending |
| 48h | Recommendations fallback (posts/threads) |
| 72h | ForYou (posts/threads/reels) |
| 7d | All trending endpoints, PersonalizedFeed recency |
| All time | Following, Featured, Hashtags, Videos, IslamicEditorial |

## Block/Mute Cap Chaos

| Cap | Endpoints | Risk |
|-----|-----------|------|
| 0 (none) | CommunityTrending, NearbyContent | Blocked users' content visible |
| take:50 | RecommendationsService (all), VideosService | User with 51+ blocks sees blocked content |
| take:1000 | PostsService ForYou/Following/Chronological | Moderate |
| take:10000 | ThreadsService, ReelsService, FeedService, PersonalizedFeed | Safe |

## Scoring Weight Inconsistencies

| Counter | Posts ForYou | Posts Trending | Threads ForYou | Reels Feed | Personalized | Recommendations |
|---------|-------------|---------------|----------------|------------|-------------|----------------|
| likes | 3 | 1 | 3 | 2 | 1 | 1 |
| comments | 5 | 2 | 5 (replies) | 4 | 2 | 2 |
| shares | 7 | 3 | 4 (reposts) | 6 | 3 | 3 |
| saves | 2 | 2 | — | — | 4 | 2 |
| views | 0.1 | — | — | 0.1 | rate | rate |

**Same content gets different scores depending on which feed endpoint serves it.** A post with 100 likes + 50 comments scores 550 in ForYou but 200 in Trending.

## Missing Lifecycle Filters

| Filter | How many endpoints missing? |
|--------|---------------------------|
| isBanned | 19 of 25 (only Posts ForYou, Reels getFeed, Videos getFeed, and 3 search check it) |
| isDeleted | ALL 25 (never checked) |
| isPrivate | 5 (Following feeds, Threads Following, some recommendations) |
| visibility | 4 (Following feeds don't filter visibility — PRIVATE posts leak) |

## PersonalizedFeed Score Overflow
Weights sum to 1.0 but additive boosts push max to **1.155**: followedHashtag +0.15, verifiedScholar +0.10, newCreator +0.05. Content with all boosts active gets disproportionately ranked.

## Hashtags Trending = All-Time Popularity (NOT Trending)
hashtags.service.ts:155-178 uses cumulative `postsCount + reelsCount + threadsCount + videosCount`. No time window. A hashtag popular a year ago stays "trending" forever.
