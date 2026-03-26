/**
 * Feed Scoring Constants & Documentation
 *
 * The platform uses 3+ different decay formulas intentionally.
 * Each content type has different engagement velocity and lifecycle:
 *
 * ─── FORMULA 1: ForYou Post Feed (posts.service.ts) ───
 * score = engagement / ageHours^1.5
 * engagement = likes*3 + comments*5 + shares*7 + saves*2 + views*0.1
 * Rationale: Posts are text/image-heavy. Comments (5x) and shares (7x) are
 * the strongest signals because they require effort. Aggressive 1.5 decay
 * keeps feed fresh (posts older than ~24h drop fast).
 *
 * ─── FORMULA 2: ForYou Reel Feed (reels.service.ts) ───
 * score = engagement / ageHours^1.2
 * engagement = likes*2 + comments*4 + shares*6 + views*0.1
 * Rationale: Reels have longer shelf life than posts (rewatchable),
 * so decay exponent is lower (1.2 vs 1.5). Shares (6x) still dominate
 * because reels go viral through shares. Views contribute weakly (0.1)
 * since autoplay inflates them.
 *
 * ─── FORMULA 3: Trending Reel (reels.service.ts getTrendingReels) ───
 * completionProxy = min(1, (likes+comments)/views * 5)
 * score = (completionProxy*2 + likes*1 + shares*3 + comments*1.5) / ageHours
 * Rationale: Trending reels prioritize completion rate (proxy for quality).
 * Linear decay (^1.0) because trending should surface older viral content.
 *
 * ─── FORMULA 4: ForYou Thread Feed (threads.service.ts) ───
 * score = engagement / ageHours^1.5
 * engagement = likes*3 + replies*5 + reposts*4
 * Rationale: Threads are conversation-driven. Replies (5x) are the
 * strongest signal (deep conversations). Same aggressive 1.5 decay as posts.
 *
 * ─── FORMULA 5: Trending Thread (threads.service.ts getTrendingThreads) ───
 * replyDepthScore = replies * 3
 * engagementScore = likes*1 + replyDepthScore + reposts*2 + quotes*2.5
 * engagementRate = engagementScore / ageHours
 * Rationale: Reply depth is the strongest thread signal (conversation depth > likes).
 * Quotes (2.5x) are valued highly as they spark new conversations.
 *
 * ─── FORMULA 6: Personalized Feed (personalized-feed.service.ts) ───
 * score = similarity*0.35 + engagement*0.25 + recency*0.15 + islamic*0.15 + session*0.1
 * Capped at 1.0 to prevent boost stacking above ceiling.
 * Rationale: Multi-signal weighted scoring. Vector similarity dominates (0.35)
 * to keep recommendations on-topic. Capped at 1.0 via Math.min() normalization.
 *
 * ─── FORMULA 7: Community Trending (feed.service.ts) ───
 * score = (likes*2 + comments*3 + shares*4) / ageHours^1.2
 * Rationale: Community trending uses lighter decay (1.2) and only covers 24h window.
 *
 * ─── CANDIDATE POOL SIZES ───
 * ForYou posts/reels/threads: 500 candidates (raised from 200)
 * Trending fallback: 500 candidates (raised from 200)
 * Personalized (pgvector KNN): 500 candidates
 * Community trending: 100 candidates
 *
 * ─── CACHE TTLs ───
 * ForYou feed: 60 seconds
 * Trending feeds: 60 seconds
 * Trending hashtags: 5 minutes (300 seconds)
 * Reel feed: 30 seconds
 */

// Candidate pool sizes — how many items to fetch before scoring
export const CANDIDATE_POOL_SIZE = {
  MAIN_FEED: 500,      // ForYou, trending (posts, reels, threads)
  COMMUNITY: 100,      // Community trending (smaller scope)
  PERSONALIZED: 500,   // pgvector KNN candidates
} as const;

// Cache TTLs in seconds
export const FEED_CACHE_TTL = {
  FORYOU: 60,
  TRENDING: 60,
  TRENDING_HASHTAGS: 300,
  REEL_FEED: 30,
} as const;
