-- Schema Audit Round 3: Tab 4 — Comprehensive schema improvements
-- 108 findings (S01: 42, S02: 66) + ~30 deferred items from Rounds 1-2
-- Categories: redundant indexes, missing indexes, @updatedAt, isRemoved, enums, type changes

-- ============================================================
-- 1. REMOVE REDUNDANT INDEXES (15 total)
-- These indexes are redundant because @unique or @@id already creates an index on the leading column.
-- ============================================================

DROP INDEX IF EXISTS "users_username_idx";
DROP INDEX IF EXISTS "users_clerkId_idx";
DROP INDEX IF EXISTS "broadcast_channels_slug_idx";
DROP INDEX IF EXISTS "channels_handle_idx";
DROP INDEX IF EXISTS "hashtags_name_idx";
DROP INDEX IF EXISTS "user_interests_userId_idx";
DROP INDEX IF EXISTS "blocked_keywords_userId_idx";
DROP INDEX IF EXISTS "dua_bookmarks_userId_idx";
DROP INDEX IF EXISTS "hadith_bookmarks_userId_idx";
DROP INDEX IF EXISTS "saved_searches_userId_idx";
DROP INDEX IF EXISTS "dhikr_challenge_participants_userId_idx";
DROP INDEX IF EXISTS "hifz_progress_userId_idx";
DROP INDEX IF EXISTS "series_episodes_seriesId_number_idx";
DROP INDEX IF EXISTS "waitlist_entries_referralCode_idx";
DROP INDEX IF EXISTS "coin_balances_userId_idx";
DROP INDEX IF EXISTS "processed_webhook_events_eventId_idx";

-- ============================================================
-- 2. ADD MISSING INDEXES (~20 new indexes)
-- ============================================================

CREATE INDEX IF NOT EXISTS "users_previousUsername_idx" ON "users"("previousUsername");
CREATE INDEX IF NOT EXISTS "stories_highlightAlbumId_idx" ON "stories"("highlightAlbumId");
CREATE INDEX IF NOT EXISTS "story_chains_createdAt_participantCount_idx" ON "story_chains"("createdAt" DESC, "participantCount" DESC);
CREATE INDEX IF NOT EXISTS "conversations_createdById_idx" ON "conversations"("createdById");
CREATE INDEX IF NOT EXISTS "messages_conversationId_isPinned_idx" ON "messages"("conversationId", "isPinned");
CREATE INDEX IF NOT EXISTS "saved_posts_postId_idx" ON "saved_posts"("postId");
CREATE INDEX IF NOT EXISTS "videos_userId_idx" ON "videos"("userId");
CREATE INDEX IF NOT EXISTS "reel_comments_userId_idx" ON "reel_comments"("userId");
CREATE INDEX IF NOT EXISTS "video_comments_userId_idx" ON "video_comments"("userId");
CREATE INDEX IF NOT EXISTS "moderation_log_isAppealed_appealResolved_idx" ON "moderation_log"("isAppealed", "appealResolved");
CREATE INDEX IF NOT EXISTS "moderation_log_action_createdAt_idx" ON "moderation_log"("action", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "reports_reportedPostId_idx" ON "reports"("reportedPostId");
CREATE INDEX IF NOT EXISTS "reports_reportedCommentId_idx" ON "reports"("reportedCommentId");
CREATE INDEX IF NOT EXISTS "reports_reportedMessageId_idx" ON "reports"("reportedMessageId");
CREATE INDEX IF NOT EXISTS "reports_reviewedById_idx" ON "reports"("reviewedById");
CREATE UNIQUE INDEX IF NOT EXISTS "community_roles_communityId_name_key" ON "community_roles"("communityId", "name");
CREATE UNIQUE INDEX IF NOT EXISTS "community_notes_contentType_contentId_authorId_key" ON "community_notes"("contentType", "contentId", "authorId");
CREATE UNIQUE INDEX IF NOT EXISTS "story_highlight_albums_userId_position_key" ON "story_highlight_albums"("userId", "position");
-- Note: existing @@index([userId]) on story_highlight_albums is implicitly removed by the @@unique replacement

-- ============================================================
-- 3. ADD NEW FIELDS: @updatedAt, isRemoved, isAutoFlagged
-- All new columns have defaults, so they're safe for existing rows.
-- ============================================================

-- isRemoved fields (soft-delete for moderation)
ALTER TABLE "stories" ADD COLUMN IF NOT EXISTS "isRemoved" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "stories" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "thread_replies" ADD COLUMN IF NOT EXISTS "isRemoved" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "thread_replies" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "reel_comments" ADD COLUMN IF NOT EXISTS "isRemoved" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "reel_comments" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "video_comments" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- @updatedAt fields on mutable models
ALTER TABLE "audio_tracks" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "story_sticker_responses" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "channel_members" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "circle_members" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "live_participants" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "saved_posts" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "profile_links" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "sticker_packs" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "circle_invites" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "post_collabs" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "membership_subscriptions" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "tips" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "mentorships" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "watch_parties" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "webhooks" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "stage_sessions" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "mosque_communities" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "halal_restaurants" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "waqf_funds" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "custom_emoji_packs" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "collab_invites" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "volunteer_opportunities" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "islamic_events" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "post_promotions" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- isAutoFlagged + updatedAt on ModerationLog
ALTER TABLE "moderation_log" ADD COLUMN IF NOT EXISTS "isAutoFlagged" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "moderation_log" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- ============================================================
-- 4. ENUM CONVERSIONS: String → Enum
-- IMPORTANT: Run these ONLY after verifying existing data matches the enum values.
-- Each ALTER uses a USING clause to cast existing string data to the new enum type.
-- ============================================================

-- Create new enum types
CREATE TYPE "ConversationRole" AS ENUM ('member', 'admin', 'owner');
CREATE TYPE "CallParticipantRole" AS ENUM ('caller', 'callee');
CREATE TYPE "PermissionLevel" AS ENUM ('everyone', 'contacts', 'followers', 'nobody');
CREATE TYPE "AudioRoomStatus" AS ENUM ('live', 'scheduled', 'ended');
CREATE TYPE "AudioRoomRole" AS ENUM ('listener', 'speaker', 'moderator', 'host');
CREATE TYPE "DonationStatus" AS ENUM ('pending', 'completed', 'failed', 'refunded');
CREATE TYPE "FundStatus" AS ENUM ('active', 'completed', 'closed');
CREATE TYPE "PlaylistCollabRole" AS ENUM ('editor', 'viewer');
CREATE TYPE "MosqueMemberRole" AS ENUM ('member', 'admin', 'imam');
CREATE TYPE "AgeRating" AS ENUM ('G', 'PG', 'PG13', 'R');
CREATE TYPE "DmRestriction" AS ENUM ('none', 'contacts_only', 'disabled');
CREATE TYPE "IslamicKnowledgeLevel" AS ENUM ('beginner', 'intermediate', 'advanced', 'all');
CREATE TYPE "RsvpStatus" AS ENUM ('going', 'maybe', 'not_going');
CREATE TYPE "PromotionStatus" AS ENUM ('active', 'paused', 'completed', 'cancelled');
CREATE TYPE "MemberSubStatus" AS ENUM ('active', 'cancelled', 'expired', 'pending', 'past_due', 'cancel_pending');

-- Redefine TipStatus with lowercase values (was unused, so safe)
-- The existing UPPER_CASE TipStatus was never used by any column.
DROP TYPE IF EXISTS "TipStatus";
CREATE TYPE "TipStatus" AS ENUM ('pending', 'completed', 'failed', 'disputed');

-- Convert columns
ALTER TABLE "conversation_members" ALTER COLUMN "role" TYPE "ConversationRole" USING "role"::"ConversationRole";
ALTER TABLE "conversation_members" ALTER COLUMN "role" SET DEFAULT 'member'::"ConversationRole";

ALTER TABLE "call_participants" ALTER COLUMN "role" TYPE "CallParticipantRole" USING "role"::"CallParticipantRole";
ALTER TABLE "call_participants" ALTER COLUMN "role" SET DEFAULT 'caller'::"CallParticipantRole";

ALTER TABLE "user_settings" ALTER COLUMN "messagePermission" TYPE "PermissionLevel" USING "messagePermission"::"PermissionLevel";
ALTER TABLE "user_settings" ALTER COLUMN "messagePermission" SET DEFAULT 'everyone'::"PermissionLevel";
ALTER TABLE "user_settings" ALTER COLUMN "mentionPermission" TYPE "PermissionLevel" USING "mentionPermission"::"PermissionLevel";
ALTER TABLE "user_settings" ALTER COLUMN "mentionPermission" SET DEFAULT 'everyone'::"PermissionLevel";
ALTER TABLE "user_settings" ALTER COLUMN "lastSeenVisibility" TYPE "PermissionLevel" USING "lastSeenVisibility"::"PermissionLevel";
ALTER TABLE "user_settings" ALTER COLUMN "lastSeenVisibility" SET DEFAULT 'everyone'::"PermissionLevel";

ALTER TABLE "user_settings" ALTER COLUMN "islamicKnowledgeLevel" TYPE "IslamicKnowledgeLevel" USING "islamicKnowledgeLevel"::"IslamicKnowledgeLevel";
ALTER TABLE "user_settings" ALTER COLUMN "islamicKnowledgeLevel" SET DEFAULT 'all'::"IslamicKnowledgeLevel";

ALTER TABLE "audio_rooms" ALTER COLUMN "status" TYPE "AudioRoomStatus" USING "status"::"AudioRoomStatus";
ALTER TABLE "audio_rooms" ALTER COLUMN "status" SET DEFAULT 'live'::"AudioRoomStatus";

ALTER TABLE "audio_room_participants" ALTER COLUMN "role" TYPE "AudioRoomRole" USING "role"::"AudioRoomRole";
ALTER TABLE "audio_room_participants" ALTER COLUMN "role" SET DEFAULT 'listener'::"AudioRoomRole";

ALTER TABLE "tips" ALTER COLUMN "status" TYPE "TipStatus" USING "status"::"TipStatus";
ALTER TABLE "tips" ALTER COLUMN "status" SET DEFAULT 'pending'::"TipStatus";

ALTER TABLE "charity_donations" ALTER COLUMN "status" TYPE "DonationStatus" USING "status"::"DonationStatus";
ALTER TABLE "charity_donations" ALTER COLUMN "status" SET DEFAULT 'pending'::"DonationStatus";

ALTER TABLE "zakat_funds" ALTER COLUMN "status" TYPE "FundStatus" USING "status"::"FundStatus";
ALTER TABLE "zakat_funds" ALTER COLUMN "status" SET DEFAULT 'active'::"FundStatus";

ALTER TABLE "community_treasuries" ALTER COLUMN "status" TYPE "FundStatus" USING "status"::"FundStatus";
ALTER TABLE "community_treasuries" ALTER COLUMN "status" SET DEFAULT 'active'::"FundStatus";

ALTER TABLE "playlist_collaborators" ALTER COLUMN "role" TYPE "PlaylistCollabRole" USING "role"::"PlaylistCollabRole";
ALTER TABLE "playlist_collaborators" ALTER COLUMN "role" SET DEFAULT 'editor'::"PlaylistCollabRole";

ALTER TABLE "mosque_memberships" ALTER COLUMN "role" TYPE "MosqueMemberRole" USING "role"::"MosqueMemberRole";
ALTER TABLE "mosque_memberships" ALTER COLUMN "role" SET DEFAULT 'member'::"MosqueMemberRole";

ALTER TABLE "mosque_communities" ALTER COLUMN "madhab" TYPE "MadhhabType" USING "madhab"::"MadhhabType";

ALTER TABLE "event_rsvps" ALTER COLUMN "status" TYPE "RsvpStatus" USING "status"::"RsvpStatus";
ALTER TABLE "event_rsvps" ALTER COLUMN "status" SET DEFAULT 'going'::"RsvpStatus";

ALTER TABLE "post_promotions" ALTER COLUMN "status" TYPE "PromotionStatus" USING "status"::"PromotionStatus";
ALTER TABLE "post_promotions" ALTER COLUMN "status" SET DEFAULT 'active'::"PromotionStatus";

ALTER TABLE "membership_subscriptions" ALTER COLUMN "status" TYPE "MemberSubStatus" USING "status"::"MemberSubStatus";
ALTER TABLE "membership_subscriptions" ALTER COLUMN "status" SET DEFAULT 'active'::"MemberSubStatus";

ALTER TABLE "parental_controls" ALTER COLUMN "maxAgeRating" TYPE "AgeRating" USING "maxAgeRating"::"AgeRating";
ALTER TABLE "parental_controls" ALTER COLUMN "maxAgeRating" SET DEFAULT 'PG'::"AgeRating";

ALTER TABLE "parental_controls" ALTER COLUMN "dmRestriction" TYPE "DmRestriction" USING "dmRestriction"::"DmRestriction";
ALTER TABLE "parental_controls" ALTER COLUMN "dmRestriction" SET DEFAULT 'none'::"DmRestriction";

-- ============================================================
-- 5. TYPE CHANGES: Int → BigInt, String → Json, add relation
-- ============================================================

ALTER TABLE "channels" ALTER COLUMN "subscribersCount" TYPE BIGINT;
ALTER TABLE "channels" ALTER COLUMN "totalViews" TYPE BIGINT;

-- String → Json conversions (existing data must be valid JSON)
ALTER TABLE "halal_businesses" ALTER COLUMN "openingHours" TYPE JSONB USING "openingHours"::JSONB;
ALTER TABLE "hajj_progress" ALTER COLUMN "checklistJson" TYPE JSONB USING "checklistJson"::JSONB;
ALTER TABLE "achievements" ALTER COLUMN "criteria" TYPE JSONB USING "criteria"::JSONB;

-- StickerPack.ownerId FK (no schema change needed — just adding the constraint)
ALTER TABLE "sticker_packs" ADD CONSTRAINT "sticker_packs_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
