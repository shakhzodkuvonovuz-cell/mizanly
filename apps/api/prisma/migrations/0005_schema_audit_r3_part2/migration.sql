-- Schema Audit Round 3: Tab 4 Part 2 — Remaining lazy deferrals
-- 13 String→Enum conversions, 4 dead model annotations, 3 @relation additions, 7 @@unique

-- ============================================================
-- 1. NEW ENUM TYPES (13)
-- ============================================================

CREATE TYPE "FeedContentType" AS ENUM ('post', 'reel', 'thread', 'video');
CREATE TYPE "StickerResponseType" AS ENUM ('poll', 'quiz', 'question', 'countdown', 'slider', 'add_yours', 'emoji', 'music', 'location', 'gif');
CREATE TYPE "QuranPlanType" AS ENUM ('30day', '60day', '90day');
CREATE TYPE "MediaType" AS ENUM ('image', 'video', 'audio', 'document', 'voice');
CREATE TYPE "StickerStyle" AS ENUM ('cartoon', 'calligraphy', 'emoji', 'geometric', 'kawaii');
CREATE TYPE "TierLevel" AS ENUM ('bronze', 'silver', 'gold', 'platinum', 'diamond');
CREATE TYPE "ScreenPosition" AS ENUM ('top-left', 'top-right', 'bottom-left', 'bottom-right', 'center');
CREATE TYPE "TrafficSource" AS ENUM ('browse', 'search', 'suggested', 'external', 'direct');
CREATE TYPE "DemoAgeRange" AS ENUM ('13-17', '18-24', '25-34', '35-44', '45-54', '55+');
CREATE TYPE "DemoGender" AS ENUM ('male', 'female', 'other');
CREATE TYPE "XPReason" AS ENUM ('post_created', 'thread_created', 'reel_created', 'video_created', 'comment_posted', 'comment_helpful', 'quran_read', 'dhikr_completed', 'challenge_completed', 'streak_milestone_7', 'streak_milestone_30', 'streak_milestone_100', 'first_follower', 'verified', 'custom');
CREATE TYPE "CreatorCategory" AS ENUM ('educator', 'entertainer', 'scholar', 'business', 'journalist');

-- ============================================================
-- 2. STRING→ENUM COLUMN CONVERSIONS (13)
-- ============================================================

ALTER TABLE "feed_dismissals" ALTER COLUMN "contentType" TYPE "FeedContentType" USING "contentType"::"FeedContentType";

ALTER TABLE "story_sticker_responses" ALTER COLUMN "stickerType" TYPE "StickerResponseType" USING "stickerType"::"StickerResponseType";

ALTER TABLE "quran_reading_plans" ALTER COLUMN "planType" TYPE "QuranPlanType" USING "planType"::"QuranPlanType";

ALTER TABLE "saved_messages" ALTER COLUMN "mediaType" TYPE "MediaType" USING "mediaType"::"MediaType";

ALTER TABLE "generated_stickers" ALTER COLUMN "style" TYPE "StickerStyle" USING "style"::"StickerStyle";
ALTER TABLE "generated_stickers" ALTER COLUMN "style" SET DEFAULT 'cartoon'::"StickerStyle";

ALTER TABLE "membership_tiers" ALTER COLUMN "level" TYPE "TierLevel" USING "level"::"TierLevel";
ALTER TABLE "membership_tiers" ALTER COLUMN "level" SET DEFAULT 'bronze'::"TierLevel";

ALTER TABLE "end_screens" ALTER COLUMN "position" TYPE "ScreenPosition" USING "position"::"ScreenPosition";
ALTER TABLE "end_screens" ALTER COLUMN "position" SET DEFAULT 'bottom-right'::"ScreenPosition";

ALTER TABLE "viewer_demographics" ALTER COLUMN "source" TYPE "TrafficSource" USING "source"::"TrafficSource";
ALTER TABLE "viewer_demographics" ALTER COLUMN "source" SET DEFAULT 'browse'::"TrafficSource";
ALTER TABLE "viewer_demographics" ALTER COLUMN "ageRange" TYPE "DemoAgeRange" USING "ageRange"::"DemoAgeRange";
ALTER TABLE "viewer_demographics" ALTER COLUMN "gender" TYPE "DemoGender" USING "gender"::"DemoGender";

ALTER TABLE "xp_history" ALTER COLUMN "reason" TYPE "XPReason" USING "reason"::"XPReason";

ALTER TABLE "gift_records" ALTER COLUMN "contentType" TYPE "FeedContentType" USING "contentType"::"FeedContentType";

ALTER TABLE "users" ALTER COLUMN "creatorCategory" TYPE "CreatorCategory" USING "creatorCategory"::"CreatorCategory";

-- ============================================================
-- 3. @RELATION ADDITIONS (3 new FKs)
-- ============================================================

-- AudioTrack.userId FK
ALTER TABLE "audio_tracks" ADD COLUMN IF NOT EXISTS "userId" TEXT;
ALTER TABLE "audio_tracks" ADD CONSTRAINT "audio_tracks_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX IF NOT EXISTS "audio_tracks_userId_idx" ON "audio_tracks"("userId");

-- FatwaQuestion.answeredBy FK (existing column, now with FK constraint)
ALTER TABLE "fatwa_questions" ADD CONSTRAINT "fatwa_questions_answeredBy_fkey" FOREIGN KEY ("answeredBy") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- BroadcastChannel.createdById (new column + FK)
ALTER TABLE "broadcast_channels" ADD COLUMN IF NOT EXISTS "createdById" TEXT;
ALTER TABLE "broadcast_channels" ADD CONSTRAINT "broadcast_channels_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX IF NOT EXISTS "broadcast_channels_createdById_idx" ON "broadcast_channels"("createdById");

-- ============================================================
-- 4. REPORT DUPLICATE PREVENTION (7 unique constraints)
-- ============================================================

CREATE UNIQUE INDEX IF NOT EXISTS "reports_reporterId_reportedPostId_key" ON "reports"("reporterId", "reportedPostId");
CREATE UNIQUE INDEX IF NOT EXISTS "reports_reporterId_reportedCommentId_key" ON "reports"("reporterId", "reportedCommentId");
CREATE UNIQUE INDEX IF NOT EXISTS "reports_reporterId_reportedMessageId_key" ON "reports"("reporterId", "reportedMessageId");
CREATE UNIQUE INDEX IF NOT EXISTS "reports_reporterId_reportedThreadId_key" ON "reports"("reporterId", "reportedThreadId");
CREATE UNIQUE INDEX IF NOT EXISTS "reports_reporterId_reportedReelId_key" ON "reports"("reporterId", "reportedReelId");
CREATE UNIQUE INDEX IF NOT EXISTS "reports_reporterId_reportedVideoId_key" ON "reports"("reporterId", "reportedVideoId");
CREATE UNIQUE INDEX IF NOT EXISTS "reports_reporterId_reportedUserId_key" ON "reports"("reporterId", "reportedUserId");

-- Note: @deprecated annotations on LocalBoard, SharedCollection, VolunteerOpportunity, UserReputation
-- are schema-only (Prisma doc comments) and don't require migration SQL.
