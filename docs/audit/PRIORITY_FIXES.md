# PRIORITY FIXES — Mizanly Audit 2026

## P0 — CRASH / SECURITY (Fix immediately)

### P0-001: Prayer Times Return HARDCODED MOCK DATA
**File:** `apps/api/src/modules/islamic/islamic.service.ts` lines 187-199
**Impact:** ALL users see `05:30 Fajr` regardless of location. **Religiously harmful** — wrong prayer times can invalidate prayer. This is the app's #1 differentiator.
**Fix:** Integrate Aladhan API (`api.aladhan.com/v1/timings`) or implement proper solar angle calculation. The method params already accept lat/lng/method.
**Effort:** Medium (1 day — replace mock with API call, add caching)

### P0-002: Mosque Finder Returns HARDCODED FAMOUS MOSQUES
**File:** `apps/api/src/modules/islamic/islamic.service.ts` lines 236-312
**Impact:** Shows Masjid al-Haram whether user is in Mecca or Minneapolis. Completely useless as a mosque finder.
**Fix:** Use Google Places API or OpenStreetMap Overpass API to query nearby mosques, or query the existing `MosqueCommunity` Prisma model.
**Effort:** Medium (1-2 days)

### P0-003: Image Moderation Always Returns "safe"
**File:** `apps/api/src/modules/moderation/moderation.service.ts` lines 63-67
**Impact:** No NSFW detection. Any image passes. For a family-friendly Muslim app this is a trust-breaking gap.
**Fix:** Integrate AWS Rekognition or Google Cloud Vision for content moderation.
**Effort:** Medium (2-3 days with testing)

## P1 — BROKEN FEATURE (Fix before launch)

### P1-001: 93 Dangling Foreign Keys Without Relations
**File:** `apps/api/prisma/schema.prisma`
**Impact:** User deletion orphans data in 60+ tables. No cascade deletes. No referential integrity.
**Fix:** Add `@relation(fields: [...], references: [id], onDelete: Cascade)` to all internal FK fields. Add corresponding relation arrays on referenced models.
**Effort:** Large (touch 93 fields across ~55 models, plus add relation arrays on User model)

### P1-002: CharityDonation/CharityCampaign Money Fields Use Int
**File:** `apps/api/prisma/schema.prisma` lines 2396, 2413, 2414
**Impact:** Cannot donate fractional amounts ($4.50 becomes $4 or $5). Real money truncation.
**Fix:** Change `amount Int` to `amount Decimal @db.Decimal(12, 2)` on CharityDonation, and `goalAmount`/`raisedAmount` on CharityCampaign.
**Effort:** Small (3 field changes + migration)

## P2 — QUALITY (Fix soon)

### P2-001: Mixed cuid()/uuid() ID Strategy
**File:** `apps/api/prisma/schema.prisma`
**Impact:** Inconsistency. 94 models use cuid(), 61 use uuid(). Not a functional bug but makes the codebase feel unfinished.
**Fix:** Standardize on one (cuid recommended — shorter, sortable). Requires migration.
**Effort:** Large (61 models to change, need data migration)

### P2-002: 7 Models Violate userId Naming Convention
**File:** `apps/api/prisma/schema.prisma`
**Impact:** CLAUDE.md rule violated. ForumThread/ForumReply/CommunityNote use `authorId`, Circle/MajlisList use `ownerId`, HalalBusiness uses `ownerId`, CustomEmojiPack uses `creatorId`.
**Fix:** Rename fields. CLAUDE.md says "NEVER change Prisma schema field names" so this conflicts — leave as-is or update CLAUDE.md.
**Effort:** Medium

### P2-003: 40+ String Fields Should Be Enums
**File:** `apps/api/prisma/schema.prisma`
**Impact:** No DB-level validation on status/type/category fields. Can store invalid values.
**Fix:** Create Prisma enums for all status/type fields. Priority: Order.status, Product.status, OfflineDownload.status.
**Effort:** Large (40+ fields, migrations, update all service code)

### P2-004: 7 Models Missing createdAt Timestamp
**Models:** PollOption, Sticker, CoinBalance, SeriesProgress, UserReputation, VideoChapter, CommunityNoteRating
**Fix:** Add `createdAt DateTime @default(now())` to each.
**Effort:** Small

## P3 — NITPICK

### P3-001: 18 Boolean Fields Not Using isX Prefix
**Impact:** Convention violation. Not a functional issue.
**Fix:** Rename (requires migration and service code updates).
**Effort:** Medium
