# Algorithm & Recommendation Engine — Deep Audit

> Audited: March 21, 2026  
> Files reviewed: `feed.service.ts`, `personalized-feed.service.ts`, `recommendations.service.ts`, `embeddings.service.ts`, `embedding-pipeline.service.ts`, `feed-transparency.service.ts`, `feed.controller.ts`

---

## Architecture Overview

Mizanly's feed algorithm implements a **multi-stage ranking pipeline**:

| Stage | Component | What it does |
|-------|-----------|-------------|
| **1. Candidate Generation** | `EmbeddingsService.findSimilarByVector()` | pgvector KNN — top 500 candidates by cosine similarity to user interest vector |
| **2. Scoring** | `PersonalizedFeedService.getPersonalizedFeed()` | Weighted scoring: similarity (35%) + engagement (25%) + recency (15%) + Islamic boost (15%) + session (10%) |
| **3. Diversity Reranking** | Same method | No same-author back-to-back filtering |

### Embeddings Infrastructure

- **Model**: Gemini `text-embedding-004` at 768 dimensions
- **Storage**: pgvector in PostgreSQL (Neon) with cosine distance operator (`<=>`)
- **Content text**: caption + hashtags + location + category combined into single embedding
- **User interest vector**: Average of last 50 liked/saved/long-viewed content embeddings
- **Backfill**: `EmbeddingPipelineService` processes all existing content in batches of 20 with 100ms rate-limit delay

### Islamic-Aware Boosting (Unique Differentiator)

The `getIslamicBoost()` method applies contextual boosts to Islamic content:

- **Base boost**: 10% for any content with Islamic hashtags (30 recognized tags)
- **Jummah (Friday)**: +15%, extra +10% during midday prayer window (11-14h)
- **Prayer windows**: +10% during approximate prayer times (Fajr, Dhuhr, Asr, Maghrib, Isha)
- **Ramadan**: +20% during Ramadan period (hardcoded dates)
- **Cap**: Maximum 50% total Islamic boost

### Session Signal Tracking

In-memory `Map<userId, SessionData>` tracks:
- Viewed content IDs (for deduplication)
- Liked/saved category counts (for in-session topic boosting)
- Scroll depth
- 30-minute session timeout with auto-reset

---

## Findings

### HIGH PRIORITY

#### 1. SQL Injection in `findSimilarByVector` (SECURITY)

**File**: `embeddings.service.ts` lines 280-311  
**Issue**: `filterTypes` and `excludeIds` arrays are interpolated into raw SQL via string concatenation in `$queryRawUnsafe`. User-controlled contentIds flow through the recommendations pipeline into these parameters.

**Fix**: Use parameterized queries with `$queryRaw` tagged template literals, or build parameter arrays dynamically:
```typescript
// BEFORE (vulnerable):
conditions.push(`"contentId" NOT IN (${excludeIds.map(id => `'${id}'`).join(',')})`);

// AFTER (safe):
// Use ANY($1) with parameterized array
```

#### 2. User Interest Vector Averages Into Noise

**File**: `embeddings.service.ts` `getUserInterestVector()`  
**Issue**: Averaging all 50 interaction embeddings into one vector creates a "muddy centroid" for users with diverse interests. A user who likes both Islamic calligraphy AND tech tutorials gets a vector pointing to neither.

**Fix**: Implement multi-cluster interest representation:
1. Cluster user's 50 interaction embeddings into 2-3 centroids (k-means)
2. Retrieve candidates for each centroid separately
3. Merge candidate pools before scoring
4. Apply exponential time decay to weight recent interactions

#### 3. No Exploration Mechanism (Cold Content Dies)

**File**: `personalized-feed.service.ts` `calculateEngagementScore()`  
**Issue**: `total_engagement / views_count` = 0 for new content with 0 views. New content from new creators can never surface through the personalized pipeline.

**Fix**: Reserve 10-15% of feed slots as exploration budget:
- Fill with fresh content (< 100 views, < 6 hours old)
- Use Thompson Sampling or epsilon-greedy selection
- Track explore/exploit ratio as a system metric

### MEDIUM PRIORITY

#### 4. Scoring Weights Are Hardcoded and Inconsistent

**File**: `personalized-feed.service.ts` line 198 vs `recommendations.service.ts` line 234  
**Issue**: PersonalizedFeedService uses 35/25/15/15/10 weights. RecommendationsService uses 40/35/25 weights. No way to A/B test or tune.

**Fix**: Extract into a config service backed by Redis. Implement user bucketing for A/B tests.

#### 5. Session Signals In-Memory Only

**File**: `personalized-feed.service.ts` `sessionSignals` Map  
**Issue**: Resets on service restart, doesn't work across multiple Railway instances.

**Fix**: Move to Redis hashes with 30-minute TTL. Already have Redis client injected in other services.

#### 6. Islamic Boost Uses Hardcoded Prayer Times

**File**: `personalized-feed.service.ts` `getIslamicBoost()`  
**Issue**: Fixed hour ranges (Fajr = 4-6 AM) regardless of user location/timezone.

**Fix**: Integrate with existing `prayer-calculator.ts` for location-aware prayer windows.

### LOW PRIORITY

#### 7. Diversity Reranking Too Naive

**Current**: Only prevents same-author back-to-back.  
**Missing**: Same hashtag cluster diversity, content type mixing, emotional tone variation.

#### 8. Trending Feed Window Too Wide

**File**: `getTrendingFeed()` uses 48-hour window.  
**Issue**: For a new platform with low volume, this is fine. At scale, 48 hours of content sorted by likes creates a "popular-get-more-popular" feedback loop.

---

## Recommended Priority Order

1. **Week 1**: Fix SQL injection in embeddings (security critical)
2. **Week 1**: Move session signals to Redis (30-min fix)
3. **Week 2**: Implement exploration slots (10% of feed)
4. **Week 3**: Split user interest vector into multi-cluster
5. **Month 2**: Build A/B testing framework for weights
6. **Month 2**: Integrate location-aware prayer times into boost
