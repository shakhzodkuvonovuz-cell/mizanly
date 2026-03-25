# 428-Finding Gap List — Remaining 124 Code-Fixable Items

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix all 124 code-fixable OPEN items from the 428-finding audit. Zero deferrals.

**Architecture:** Grouped by type for batch execution. Backend fixes first, then mobile, then cross-cutting.

**Tech Stack:** NestJS 10, Prisma, Jest, React Native (Expo SDK 52), TypeScript

---

## BATCH 1: Backend Validation & Safety (8 items) — Quick fixes

| # | Finding | Fix |
|---|---------|-----|
| 3 | SQL injection in embeddings (PARTIAL→FIXED) | Replace $queryRawUnsafe with $queryRaw tagged template |
| 122 | No hashtag limit per post | Add @ArrayMaxSize(30) to hashtags in CreatePostDto + CreateReelDto |
| 123 | No mention limit | Add @ArrayMaxSize(50) to mentions in DTOs |
| 124 | No duplicate post detection | Add content hash dedup in posts.create (SHA-256 of content, check last 24h) |
| 165 | ScreenErrorBoundary no Sentry | Add Sentry.captureException in ScreenErrorBoundary |
| 167 | No promote/demote admin in groups | Add changeRole method to messages.service.ts + controller endpoint |
| 169 | No group invite link | Add generateInviteLink + joinViaLink methods |
| 168 | Group description edit | Add description field to UpdateGroupDto |

## BATCH 2: Frontend Wiring & Missing UI (14 items)

| # | Finding | Fix |
|---|---------|-----|
| 9 | ogApi never called | Wire LinkPreview in PostCard when post has URL |
| 74 | Link preview in PostCard | Same — use ogApi + LinkPreview component |
| 19 | DoubleTapHeart unused | Wire into PostCard, reel/[id].tsx, thread/[id].tsx |
| 26 | Report missing from post/reel/thread detail | Add report button to BottomSheet on those 3 screens |
| 90/106 | Pinned conversations no mobile UI | Add pin/unpin in conversation long-press BottomSheet |
| 95/109 | Mention autocomplete in comments | Wire MentionAutocomplete into post/[id].tsx comment input |
| 107 | Search within conversation | Add search bar in conversation/[id].tsx header |
| 119 | Activity status on profiles | Display lastSeen on profile/[username].tsx |
| 120 | "Follows you" indicator | Render badge when isFollowedBy is true |
| 121 | Thread read indicator | Add isRead tracking + visual indicator on ThreadCard |
| 130 | Reaction picker not on PostCard | Move ReactionPicker from detail to PostCard long-press |
| 87 | Image alt text not rendered | Add accessibilityLabel={post.altText} to PostMedia images |
| 108 | Online/last seen in conversation | Show lastSeen in conversation header |
| 132 | "Follows you" badge on profile | Same as 120 |

## BATCH 3: Content Quality & Safety (10 items)

| # | Finding | Fix |
|---|---------|-----|
| 69 | Hashtag follow not affecting feed | Add followed hashtag boost in personalized-feed scoring |
| 128 | Feed page prefetch | Add Image.prefetch for next page thumbnails in saf.tsx |
| 147 | No haptic on pull-to-refresh | Add haptic.tick() in BrandedRefreshControl at threshold |
| 149 | Skeleton→content crossfade | Add FadeIn animation wrapper when data loads |
| 150 | Like count animation | Add animated counter component for engagement numbers |
| 192 | DM request not enforced | Check messagePermission setting in messages.service.ts before sending |
| 199 | Location not cleaned on deletion | Clear locationName/lat/lng in deleteAllUserData |
| 225 | No unfollow confirmation | Add Alert.alert confirmation before unfollow |
| 226 | Delete post confirmation | Add Alert.alert in PostCard BottomSheet delete |
| 228 | Double-post prevention | Add isSubmitting guard + content hash check |

## BATCH 4: Screens & Flows (12 items)

| # | Finding | Fix |
|---|---------|-----|
| 14 | duet-create no upload | Wire presigned upload pipeline like create-reel |
| 15 | stitch-create no upload | Wire presigned upload pipeline like create-reel |
| 17 | share-receive no post creation | Wire postsApi.create from shared content |
| 36 | Live stream no camera/socket | Wire basic RTMP/HLS via Cloudflare Stream + socket chat |
| 134 | No seller analytics | Add seller stats screen reading from commerce endpoints |
| 136 | No tutorial overlays | Add first-launch coach marks on main tabs |
| 137 | No permission rationale | Add explanation screen before camera/location permission |
| 145 | Content calendar | Add calendar view for scheduled posts |
| 183 | Surah list browser | Add surah browsing screen |
| 210 | Arabic numeral formatting | Add toArabicNumerals utility, apply in Arabic locale |
| 271 | Long captions not expandable | Add "...more" inline expand in PostCard |
| 284 | Content removed notification | Send notification when moderation removes content |

## BATCH 5: Retention & Social (12 items)

| # | Finding | Fix |
|---|---------|-----|
| 70 | Audio message speed control | Add 1x/1.5x/2x playback rate control in conversation |
| 71 | Contact card sharing | Add CONTACT message type rendering + share UI |
| 126 | Quote repost | Add quote-post creation with embedded original |
| 135 | First-launch detection | Add hasOnboarded AsyncStorage flag |
| 172 | Collaborative filtering | Add "also followed by" suggestions |
| 178 | Session timeout | Add idle timeout after 30 days |
| 189 | Mass-report abuse detection | Add report frequency check per reporter |
| 200 | IP retention policy | Add 90-day IP purge cron |
| 217 | Old username redirect (verify) | Verify previousUsername fallback works |
| 289 | "Edited" label on posts | Add editedAt field to Post model, show label |
| 306 | Post edit window | Add 15-min edit window restriction |
| 337 | Upload progress (verify) | Verify UploadProgressBar is on all create screens |

## BATCH 6: Islamic & Cultural (11 items)

| # | Finding | Fix |
|---|---------|-----|
| 210 | Arabic numeral formatting | Utility function + apply in Arabic locale |
| 211 | Gender-appropriate Arabic | Add gender context to i18n for Arabic |
| 212 | Hijri date on posts | Add hijri date next to Gregorian in PostCard for Arabic users |
| 213 | Bismillah before surahs | Add bismillah display in Quran reading |
| 214 | Quran completion celebration | Add khatm celebration screen/animation |
| 215 | Quran verse of the day | Add daily verse push notification |
| 216 | Islamic milestone badges | Add achievement badges for Islamic activities |
| 279 | Islamic event reminders | Add push notifications for Laylat al-Qadr etc. |
| 280 | Community dhikr counter | Add real-time community-wide dhikr total |
| 281 | Mosque prayer time integration | Follow a mosque → get their specific times |
| 184 | Time-based Islamic greeting | Add Sabah al-Khair / Masa al-Khair based on time |

## BATCH 7: Remaining UX & Polish (57 items)

These are the remaining items from categories HH through QQQ. Each is a small fix.
Full list in the 428-finding audit memory file.

Key items:
- Confirmation dialogs (225-228)
- Empty state edge cases (342-345) — already 409 EmptyState usages, verify coverage
- Trust signals (287-295) — verification flow, edited label, member since
- Wellbeing (209, 311-316) — take a break, finite feed, bedtime mode
- Legal (229-232) — DSA, DMCA, law enforcement
- Scale (233-240) — trending cache, write-behind, read replica routing
- Growth (326-329) — referral code, share app, attribution
- Behavioral tracking (297-302) — dwell time, DM shares, save signals

## Execution Order

Start with Batch 1 (backend validation) → Batch 3 (safety) → Batch 2 (frontend wiring) → Batch 5 (retention) → Batch 4 (screens) → Batch 6 (Islamic) → Batch 7 (polish)

## Items NOT in this plan (blocked on external)

| # | Why |
|---|-----|
| 1 | Apple IAP — needs $99 Apple Developer enrollment |
| 2 | google-services.json — needs Firebase project |
| 41-57 | Competitor features — post-launch |
| 419-428 | AR/camera — needs SDK decision + integration project |
| 58 | Landing page — separate web project |
| 62-63 | Admin/moderation dashboard — separate web project |
| 142-143 | Cookie consent/DPA — web + legal |
| 229-232 | DSA/DMCA/law enforcement — legal process |
| 233-240 | Scale prep — infrastructure project |
