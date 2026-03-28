-- V6-F2b: Add persistent E2E enforcement flag to conversations.
-- Once set to true (on first encrypted message), the server rejects all
-- subsequent plaintext messages in this conversation. Cannot be unset.
-- Replaces the Redis TTL-based check which expired after 24 hours.

ALTER TABLE "conversations" ADD COLUMN "isE2E" BOOLEAN NOT NULL DEFAULT false;

-- Backfill: mark conversations that already have encrypted messages as E2E.
-- This ensures existing E2E conversations are protected immediately.
UPDATE "conversations"
SET "isE2E" = true
WHERE id IN (
  SELECT DISTINCT "conversationId"
  FROM "messages"
  WHERE "e2eVersion" IS NOT NULL
);
