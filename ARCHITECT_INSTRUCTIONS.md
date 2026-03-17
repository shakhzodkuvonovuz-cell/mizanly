# BATCH 41: Discovery + Creator Economy — 14 Agents

**Date:** 2026-03-17
**Theme:** Tiers 5+6 combined — Feed intelligence (5 remaining features) + Creator Economy (16 features). 7 of 12 Tier 5 features already exist (algorithm feed, recommendations, trending, explore, caught-up, suggestions, not-interested). This batch fills the gaps and builds the full creator economy.

---

## GLOBAL RULES

1. Read `CLAUDE.md` first — mandatory rules
2. No `any` in non-test code. No `@ts-ignore`. No `@ts-expect-error`.
3. NEVER modify any file not explicitly listed in your agent task
4. All new screens: `useTranslation` + `t()`, `ScreenErrorBoundary`, `RefreshControl`
5. Use `radius.*` from theme, `<Icon name="..." />`, `<BottomSheet>` not Modal
6. After completing: `git add -A && git commit -m "feat: batch 41 agent N — <description>"`

---

## AGENT 1: Backend — Topic Follow + Chronological Feed + Favorites

**Modifies:**
- `apps/api/prisma/schema.prisma` (add HashtagFollow model)
- `apps/api/src/modules/hashtags/hashtags.service.ts` (add follow/unfollow methods)
- `apps/api/src/modules/hashtags/hashtags.controller.ts` (add endpoints)
- `apps/api/src/modules/posts/posts.service.ts` (add chronological feed option)

Read ALL 4 files first.

**Schema — add HashtagFollow model:**
```prisma
model HashtagFollow {
  userId    String
  hashtagId String
  createdAt DateTime @default(now())
  @@id([userId, hashtagId])
  @@index([userId])
  @@index([hashtagId])
  @@map("hashtag_follows")
}
```

**hashtags.service.ts — add methods:**
- `followHashtag(userId, hashtagId)` — create HashtagFollow
- `unfollowHashtag(userId, hashtagId)` — delete HashtagFollow
- `getFollowedHashtags(userId, cursor, limit)` — paginated list
- `isFollowing(userId, hashtagId)` — boolean check
- `getFollowersCount(hashtagId)` — count followers

**hashtags.controller.ts — add endpoints:**
```
POST   /hashtags/:id/follow     — follow (ClerkAuthGuard)
DELETE /hashtags/:id/follow     — unfollow (ClerkAuthGuard)
GET    /hashtags/following       — get followed hashtags (ClerkAuthGuard)
```

**posts.service.ts — modify getFeed:**
Find the `getFeed` method. Add a `chronological` type alongside existing `following` and `foryou`:
- When `type === 'chronological'`: return posts from followed users ordered by `createdAt desc` (no scoring, no algorithm)
- When `type === 'favorites'`: return posts from users in the user's circles (close friends) ordered by `createdAt desc`

**~200 lines added across 4 files**

---

## AGENT 2: Backend — Algorithm Transparency + AI Search Placeholder

**Creates:**
- `apps/api/src/modules/feed/feed-transparency.service.ts`

**Modifies:**
- `apps/api/src/modules/feed/feed.module.ts` (register new service)
- `apps/api/src/modules/feed/feed.service.ts` (add controller method if no controller, or add to existing)

Read the feed module files first.

**feed-transparency.service.ts (~150 lines):**
```typescript
// Explains WHY a post appeared in the user's feed
// Returns reasons like:
// - "Trending in #ramadan" (if post has trending hashtag)
// - "Posted by someone you follow" (if following author)
// - "Popular in your network" (if liked by people you follow)
// - "Based on your interests" (if matches user interests)
// - "New from @username" (if recent from followed user)

async explainPost(userId: string, postId: string): Promise<{ reasons: string[] }>
  // 1. Check if user follows the author → "Posted by @username, who you follow"
  // 2. Check if post has trending hashtags → "Trending in #hashtag"
  // 3. Check if post has high engagement → "Popular post with X likes"
  // 4. Check if user has matching interests → "Matches your interest in X"
  // Return array of reason strings (max 3)

async explainThread(userId: string, threadId: string): Promise<{ reasons: string[] }>
  // Same logic for threads
```

**Also add a simple "AI search" placeholder** to search.service.ts or create a new file:
For now, AI search = enhanced keyword search with synonym expansion. Create a `searchEnhanced` method that:
- Takes a natural language query
- Extracts keywords (split by spaces, remove stop words)
- Searches across posts, threads, and reels content
- Returns combined results ranked by relevance (match count)

Add endpoint: `GET /search/enhanced?q=...`

**~250 lines total**

---

## AGENT 3: Mobile — Topic Follow UI + Feed Toggles

**Creates:**
- `apps/mobile/app/(screens)/followed-topics.tsx`

**Modifies:**
- `apps/mobile/app/(tabs)/saf.tsx` (add chronological + favorites toggle)

Read both files first.

**followed-topics.tsx (~300 lines):**
```
Screen showing hashtags the user follows:
1. GlassHeader "Followed Topics" + back
2. Search bar to find new topics to follow
3. FlatList of followed hashtags:
   - Each row: # hashtag name, follower count, follow/unfollow button
   - Swipe to unfollow
4. "Suggested Topics" section below (from trending)
5. Pull-to-refresh, EmptyState, Skeleton loading
```

**saf.tsx modifications:**
Find the existing tab selector (likely "following" | "foryou"). Add two more tabs:
- "chronological" — calls `postsApi.getFeed('chronological', cursor)`
- "favorites" — calls `postsApi.getFeed('favorites', cursor)`

The tab selector should now have 4 options: "For You" | "Following" | "Latest" | "Favorites"

**~350 lines total**

---

## AGENT 4: Mobile — Algorithm Transparency + Enhanced Search

**Creates:**
- `apps/mobile/src/components/AlgorithmCard.tsx`
- `apps/mobile/app/(screens)/why-showing.tsx`

**AlgorithmCard.tsx (~120 lines):**
```tsx
// Small card shown below each post explaining why it appeared
// Props: { reasons: string[]; onDismiss: () => void }
// Shows first reason with "Why am I seeing this?" link
// Tap expands to show all reasons
// Glassmorphic card, emerald accent
```

**why-showing.tsx (~200 lines):**
```
Full screen explaining why a specific post appeared:
1. GlassHeader "Why you're seeing this" + back
2. Post preview card (thumbnail + caption snippet)
3. Reasons list with icons:
   - "You follow @username" (user icon)
   - "Trending in #ramadan" (trending-up icon)
   - "Popular with X likes" (heart icon)
   - "Matches your interests" (check-circle icon)
4. "Not interested" button → dismiss post
5. "See less like this" option
```

**~320 lines total**

---

## AGENT 5: Backend — Creator Economy: Insights + Analytics

**Creates:**
- `apps/api/src/modules/creator/creator.module.ts`
- `apps/api/src/modules/creator/creator.controller.ts`
- `apps/api/src/modules/creator/creator.service.ts`

**Endpoints (8):**
```
GET /creator/insights/post/:postId     — Post insights (impressions, reach, saves, shares)
GET /creator/insights/reel/:reelId     — Reel insights
GET /creator/analytics/overview        — Dashboard overview (followers, engagement, revenue)
GET /creator/analytics/audience        — Audience demographics (top countries, age, gender)
GET /creator/analytics/content         — Content performance (top posts, best posting times)
GET /creator/analytics/growth          — Growth trends (followers over time)
GET /creator/analytics/revenue         — Revenue breakdown (tips, memberships, gifts)
GET /creator/mode                      — Get creator mode status
POST /creator/mode                     — Enable creator mode
```

**Service (~400 lines):**
- `getPostInsights(postId, userId)` — aggregate likes, comments, shares, saves, views from existing data
- `getReelInsights(reelId, userId)` — same for reels
- `getDashboardOverview(userId)` — total followers, total likes, engagement rate, revenue
- `getAudienceDemographics(userId)` — follower locations (from User.location), joined dates
- `getContentPerformance(userId)` — top 10 posts by engagement, posting time analysis
- `getGrowthTrends(userId)` — followers gained per day over last 30 days
- `getRevenueSummary(userId)` — aggregate tips received, membership income
- `enableCreatorMode(userId)` — flag user as creator (add field or use existing)

**~500 lines total**

---

## AGENT 6: Backend — Virtual Gifts + Coins Economy

**Creates:**
- `apps/api/src/modules/gifts/gifts.module.ts`
- `apps/api/src/modules/gifts/gifts.controller.ts`
- `apps/api/src/modules/gifts/gifts.service.ts`

**Modifies:**
- `apps/api/prisma/schema.prisma` (add Gift, CoinTransaction, CoinBalance models)

**Schema:**
```prisma
model CoinBalance {
  id        String   @id @default(cuid())
  userId    String   @unique
  coins     Int      @default(0)
  diamonds  Int      @default(0)
  updatedAt DateTime @updatedAt
  @@map("coin_balances")
}

model CoinTransaction {
  id          String   @id @default(cuid())
  userId      String
  type        String   @db.VarChar(20)  // purchase, gift_sent, gift_received, cashout
  amount      Int
  description String?
  createdAt   DateTime @default(now())
  @@index([userId, createdAt(sort: Desc)])
  @@map("coin_transactions")
}

model GiftRecord {
  id           String   @id @default(cuid())
  senderId     String
  receiverId   String
  giftType     String   @db.VarChar(50)
  coinCost     Int
  contentId    String?
  contentType  String?  @db.VarChar(10)
  createdAt    DateTime @default(now())
  @@index([receiverId])
  @@index([senderId])
  @@map("gift_records")
}
```

**Endpoints (7):**
```
GET    /gifts/balance              — Get coin/diamond balance (auth)
POST   /gifts/purchase             — Purchase coins (auth, body: { amount, paymentMethodId })
POST   /gifts/send                 — Send gift (auth, body: { receiverId, giftType, contentId?, contentType? })
GET    /gifts/catalog              — Get available gifts with prices
GET    /gifts/history              — Transaction history (auth, cursor pagination)
POST   /gifts/cashout              — Request cashout diamonds→USD (auth, body: { diamonds })
GET    /gifts/received/:userId     — Gifts received by user (public)
```

**Gift catalog (hardcoded in service):**
```typescript
const GIFT_CATALOG = [
  { type: 'rose', name: 'Rose', coins: 1, animation: 'float' },
  { type: 'heart', name: 'Heart', coins: 5, animation: 'pulse' },
  { type: 'star', name: 'Star', coins: 10, animation: 'spin' },
  { type: 'crescent', name: 'Crescent Moon', coins: 50, animation: 'glow' },
  { type: 'mosque', name: 'Mosque', coins: 100, animation: 'rise' },
  { type: 'diamond', name: 'Diamond', coins: 500, animation: 'sparkle' },
  { type: 'crown', name: 'Crown', coins: 1000, animation: 'drop' },
  { type: 'galaxy', name: 'Galaxy', coins: 5000, animation: 'explode' },
];
// 100 coins = $1 USD, diamonds = 70% of coin value for cashout (70/30 split)
```

**~500 lines total**

---

## AGENT 7: Backend — Branded Content + Boost Post + Reminders

**Creates:**
- `apps/api/src/modules/promotions/promotions.module.ts`
- `apps/api/src/modules/promotions/promotions.controller.ts`
- `apps/api/src/modules/promotions/promotions.service.ts`

**Schema additions** (add to schema.prisma):
```prisma
model PostPromotion {
  id          String   @id @default(cuid())
  postId      String
  userId      String
  budget      Float
  currency    String   @default("USD") @db.VarChar(3)
  targetReach Int
  actualReach Int      @default(0)
  status      String   @default("active") @db.VarChar(20)
  startsAt    DateTime @default(now())
  endsAt      DateTime
  createdAt   DateTime @default(now())
  @@index([postId])
  @@index([userId])
  @@map("post_promotions")
}

model PostReminder {
  id        String   @id @default(cuid())
  postId    String
  userId    String
  remindAt  DateTime
  sent      Boolean  @default(false)
  createdAt DateTime @default(now())
  @@unique([postId, userId])
  @@index([remindAt])
  @@map("post_reminders")
}
```

**Endpoints (6):**
```
POST   /promotions/boost           — Boost a post (auth, body: { postId, budget, duration })
GET    /promotions/my              — My active promotions (auth)
DELETE /promotions/:id             — Cancel promotion (auth)
POST   /promotions/remind/:postId  — Set reminder for post (auth, body: { remindAt })
DELETE /promotions/remind/:postId  — Remove reminder (auth)
PATCH  /posts/:id/branded          — Mark as branded/sponsored (auth, body: { partnerName })
```

**~400 lines total**

---

## AGENT 8: Mobile — Creator Dashboard Screen

**Creates:**
- `apps/mobile/app/(screens)/creator-dashboard.tsx`
- `apps/mobile/src/services/creatorApi.ts`

**creatorApi.ts (~50 lines):** Mirror all creator backend endpoints.

**creator-dashboard.tsx (~600 lines):**
```
Full creator analytics dashboard:
1. GlassHeader "Creator Studio" + back
2. Overview cards row (horizontal scroll):
   - Followers (count + trend arrow)
   - Engagement Rate (percentage)
   - Total Views (this month)
   - Revenue (this month)
3. Tab sections:
   a. "Content" — top performing posts/reels grid
   b. "Audience" — demographics cards (top countries, follower growth chart placeholder)
   c. "Revenue" — tips, memberships, gifts breakdown
4. "Best Time to Post" card with hour heatmap
5. "Enable Creator Mode" banner if not enabled
6. Pull-to-refresh, Skeleton loading
```

**~650 lines total**

---

## AGENT 9: Mobile — Post Insights Screen

**Creates:**
- `apps/mobile/app/(screens)/post-insights.tsx`

**post-insights.tsx (~400 lines):**
```
Per-post analytics screen:
1. GlassHeader "Insights" + back
2. Post preview card (thumbnail + first line of caption)
3. Engagement summary row: likes, comments, shares, saves (with icons)
4. "Reach" card: impressions count, unique accounts reached
5. "Discovery" card: from feed / from hashtags / from profile / from explore
6. "Interactions" card: profile visits, follows from this post
7. Engagement trend (if post is >24h old, show daily breakdown)
8. Route params: postId, postType ('post' | 'reel')
```

**~400 lines total**

---

## AGENT 10: Mobile — Virtual Gifts UI

**Creates:**
- `apps/mobile/app/(screens)/gift-shop.tsx`
- `apps/mobile/src/components/GiftOverlay.tsx`
- `apps/mobile/src/services/giftsApi.ts`

**giftsApi.ts (~40 lines):** Mirror gifts backend endpoints.

**gift-shop.tsx (~400 lines):**
```
Coin purchase and gift browsing screen:
1. GlassHeader "Gift Shop" + back
2. Coin balance display (gold coin icon + count)
3. "Buy Coins" section: coin packages (100/$0.99, 500/$4.99, 1000/$9.99, 5000/$49.99)
4. Gift catalog grid (2 columns):
   - Each gift: icon/illustration, name, coin cost
   - Tap → send to user (bottom sheet with recipient search)
5. Transaction history tab
6. Cashout section (diamonds → USD)
```

**GiftOverlay.tsx (~200 lines):**
```tsx
// Animated gift overlay shown during live/reel viewing
// Props: { giftType: string; senderName: string; visible: boolean; onDone: () => void }
// Shows: animated gift icon floating up, sender name, coin value
// Animation: scale in → float up → fade out over 3 seconds
// Sounds: haptic feedback on receive
```

**~640 lines total**

---

## AGENT 11: Mobile — Boost Post + Branded Content

**Creates:**
- `apps/mobile/app/(screens)/boost-post.tsx`
- `apps/mobile/app/(screens)/branded-content.tsx`
- `apps/mobile/src/services/promotionsApi.ts`

**promotionsApi.ts (~35 lines):** Mirror promotions endpoints.

**boost-post.tsx (~350 lines):**
```
Post promotion/boost screen:
1. GlassHeader "Boost Post" + back
2. Post preview card
3. Budget selector: $5 / $10 / $25 / $50 / Custom
4. Duration: 1 day / 3 days / 7 days / 14 days
5. Estimated reach display (budget × 100 people per dollar)
6. Target audience (auto / interests)
7. "Boost" GradientButton
```

**branded-content.tsx (~250 lines):**
```
Branded content / partnership label screen:
1. GlassHeader "Branded Content" + back
2. Toggle: "This is a paid partnership"
3. Partner name input
4. Info text about disclosure requirements
5. Preview of how the label will look on the post
6. Save button
```

**~635 lines total**

---

## AGENT 12: Mobile — Post Reminder + Affiliate UI

**Creates:**
- `apps/mobile/src/components/ReminderButton.tsx`
- `apps/mobile/app/(screens)/creator-storefront.tsx`

**ReminderButton.tsx (~100 lines):**
```tsx
// "Remind me" button shown on posts for upcoming events/drops
// Props: { postId: string; remindAt?: string; onToggle: () => void }
// Bell icon, tap to set/cancel reminder
// Date picker for when to remind
```

**creator-storefront.tsx (~400 lines):**
```
Creator shop/storefront screen:
1. GlassHeader "{username}'s Shop" + back
2. Creator avatar + bio + follower count header
3. Product grid (2 columns):
   - Product card: image, name, price, "Buy" button
4. Categories tabs (if creator has categories)
5. "Halal Certified" badge on applicable products
6. Empty state if no products
7. For creators: "Add Product" FAB
```

**~500 lines total**

---

## AGENT 13: Mobile — Revenue + Cashout Screens

**Creates:**
- `apps/mobile/app/(screens)/revenue.tsx`
- `apps/mobile/app/(screens)/cashout.tsx`

**revenue.tsx (~350 lines):**
```
Revenue overview screen:
1. GlassHeader "Revenue" + back
2. Total earnings card (large number, emerald)
3. Breakdown cards:
   - Tips: $X.XX
   - Memberships: $X.XX / month
   - Gifts: $X.XX (diamonds)
4. Transaction history FlatList
5. "Cash Out" GradientButton
6. Revenue split info: "You earn 70% of all revenue"
```

**cashout.tsx (~250 lines):**
```
Cashout screen:
1. GlassHeader "Cash Out" + back
2. Available balance display
3. Amount input (with max button)
4. Payout method selector:
   - Bank account (via Stripe)
   - Saved methods from paymentsApi
5. "Instant Payout" option (small fee)
6. "Standard Payout" option (3-5 business days, free)
7. Confirm button
```

**~600 lines total**

---

## AGENT 14: Backend — Register All New Modules in app.module.ts

**Modifies:**
- `apps/api/src/app.module.ts`

Read the file, then add imports and registrations for:
- `CreatorModule` from `./modules/creator/creator.module`
- `GiftsModule` from `./modules/gifts/gifts.module`
- `PromotionsModule` from `./modules/promotions/promotions.module`

**~10 lines added**

---

## FILE → AGENT CONFLICT MAP

| Agent | Files | Type |
|-------|-------|------|
| 1 | schema.prisma + hashtags service/controller + posts.service.ts (MODIFY) | Backend |
| 2 | feed-transparency.service.ts (NEW) + feed module files (MODIFY) | Backend |
| 3 | followed-topics.tsx (NEW) + saf.tsx (MODIFY) | Mobile |
| 4 | AlgorithmCard.tsx, why-showing.tsx (NEW) | Mobile |
| 5 | modules/creator/ (3 NEW) | Backend |
| 6 | modules/gifts/ (3 NEW) + schema.prisma (MODIFY) | Backend |
| 7 | modules/promotions/ (3 NEW) + schema.prisma (MODIFY) | Backend |
| 8 | creator-dashboard.tsx, creatorApi.ts (NEW) | Mobile |
| 9 | post-insights.tsx (NEW) | Mobile |
| 10 | gift-shop.tsx, GiftOverlay.tsx, giftsApi.ts (NEW) | Mobile |
| 11 | boost-post.tsx, branded-content.tsx, promotionsApi.ts (NEW) | Mobile |
| 12 | ReminderButton.tsx, creator-storefront.tsx (NEW) | Mobile |
| 13 | revenue.tsx, cashout.tsx (NEW) | Mobile |
| 14 | app.module.ts (MODIFY) | Backend |

**CONFLICT:** Agents 1, 6, 7 all modify schema.prisma. Run 1 first, then 6, then 7 sequentially. All others can run in parallel.
