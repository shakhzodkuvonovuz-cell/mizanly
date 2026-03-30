# Audit V2 — Part 1 Summary

**Date:** 2026-03-30
**Total agents deployed:** 60
**Total findings:** 1,256
**Agent files on disk:** 60 (verified)

## Severity Breakdown by Wave

| Wave | Focus | Agents | C | H | M | L | I | Total |
|------|-------|--------|---|---|---|---|---|-------|
| 1 | Backend Security | 16 | 14 | 80 | 114 | 84 | 45 | 353 |
| 2 | Data Integrity | 12 | 14 | 60 | 85 | 59 | 27 | 269 |
| 3 | Cross-Module | 10 | 27 | 53 | 64 | 44 | 25 | 232 |
| 5 | Crypto & E2E | 8 | 6 | 30 | 40 | 31 | 4 | 115 |
| 6 | Go Services | 6 | 3 | 17 | 35 | 33 | 16 | 109 |
| 9 | Performance | 8 | 28 | 62 | 60 | 31 | 7 | 188 |
| **Total** | | **60** | **92** | **302** | **398** | **282** | **124** | **1,256** |

## Top 20 Critical Findings

| # | Wave | Agent | File:Line | Finding | Impact |
|---|------|-------|-----------|---------|--------|
| 1 | W3 | X04 | privacy.service.ts:152 | GDPR deletion purge skips Clerk-deleted users (`isDeleted: false` filter) | PII persists forever — GDPR violation |
| 2 | W3 | X03 | payments.service.ts:654 | Tip completion has no idempotency guard — webhook retry double-credits diamonds | Money bug — double payment |
| 3 | W3 | X08 | reports.service.ts | Single-user urgent report auto-hides ANY post instantly — weaponizable censorship | Any user can censor any content |
| 4 | W2 | B06 | messages.service.ts:1714 | Disappearing message expiry unit mismatch (minutes stored, seconds consumed) — 60x faster deletion | Messages vanish in minutes instead of days |
| 5 | W2 | B06 | messages.service.ts | Group admin role check uses 'ADMIN' vs stored 'admin' — all admin features dead | Group management completely broken |
| 6 | W2 | B07 | stories.service.ts:484-492 | Story reaction summary raw SQL uses wrong column names | Feature crashes at runtime |
| 7 | W1 | A09 | payments.service.ts:90 | Fire-and-forget PaymentMapping DB write — tip→receiver mapping silently lost | Wrong tip credited to wrong user |
| 8 | W1 | A10 | reports.service.ts | Dismissed urgent reports don't restore auto-hidden content — one-way censorship | Content permanently hidden |
| 9 | W1 | A15 | parental-controls.service.ts:180-183 | `updateControls` writes plaintext PIN over scrypt hash | PIN stored in plaintext — auth broken |
| 10 | W1 | A16 | live.service.ts:230 | Raw SQL uses `"LiveSession"` not `"live_sessions"` — 3 runtime crashes | Live viewer counts completely broken |
| 11 | W2 | B11 | content-safety.service.ts:329 | `moderatorId: 'system'` FK violation — automated moderation silently fails | CSAM/terrorism auto-removal broken in production |
| 12 | W2 | B09 | community.service.ts:147 | Fatwa `answerId` stores text not CUID — FK constraint violation | Fatwa answer feature crashes |
| 13 | W3 | X02 | chat.gateway.ts:977 | `subscribe_presence` lets any user intercept sealed sender events | Sealed sender metadata protection defeated |
| 14 | W3 | X05 | notifications.service.ts:100 | markRead broadcasts badge increment instead of sync — badge goes UP on read | Notification badge permanently wrong |
| 15 | W5 | F02 | native-crypto-adapter.ts:163 | HChaCha20 called with wrong types — native AEAD is dead code | All crypto falls back to slow pure JS |
| 16 | W5 | F04 | pqxdh.ts | PQ prekey signature never verified — server can substitute ML-KEM keys | Post-quantum protection nullified |
| 17 | W5 | F08 | media-crypto.ts | MediaEncryptionContext reusable — catastrophic XChaCha20 nonce reuse | Encrypted media decryptable by attacker |
| 18 | W9 | J02 | schema.prisma | Post feed query has no composite index — full table scan on every load | Feed loads O(n) on total posts |
| 19 | W9 | J06 | media-processor | Media queue fully built but `mediaQueue.add()` never called — EXIF GPS leaks | User location exposed in every photo |
| 20 | W9 | J07 | redis patterns | HyperLogLog impression keys (12KB each) have NO TTL — 1.2GB at 100K posts | Redis OOM at scale |

## Systemic Patterns

### Pattern 1: Raw SQL Table Name Mismatches (8+ instances)
Prisma `@@map` renames models to snake_case tables, but raw SQL uses PascalCase Prisma model names. Found in: `live.service.ts`, `stream.service.ts`, `channels.service.ts`, `polls.service.ts`, `threads.service.ts`, `stories.service.ts`, `videos.service.ts`. All crash at runtime with "relation does not exist."

### Pattern 2: Banned/Deleted User Content Leakage (30+ instances)
Direct access endpoints (`getById`, `getComments`, `getRecommended`, `getUserPosts`) consistently omit `isBanned`/`isDeactivated`/`isDeleted` filters that feed queries correctly include. Every content type affected.

### Pattern 3: Edit Bypasses Content Moderation (All Content Types)
`create()` calls `contentSafety.moderateText()` but `update()`/`edit()` never does. Applies to: posts, comments, threads, reels, channel posts, community content. Bait-and-switch attack on viral content.

### Pattern 4: Missing DTO Validation (25+ endpoints)
Bare `@Body('field')` string extraction or inline TypeScript types instead of class-validator DTO classes. Bypasses NestJS `ValidationPipe` entirely — no length limits, no type checking, no sanitization.

### Pattern 5: Non-Atomic Multi-Step Operations (20+ instances)
Services perform create/update/delete sequences without `$transaction`. Partial failures leave orphaned data, incorrect counters, or half-applied state changes.

### Pattern 6: Key Material Not Zeroed (15+ instances across Signal)
X3DH shared secrets, HKDF derived buffers, DH outputs, sender key chain keys, identity key private bytes — all persist on the JS heap after use. Exploitable only by memory dump (root/jailbreak), but violates defense-in-depth.

### Pattern 7: Silent Error Swallowing (Go Services)
At least 15 locations in Go handlers discard DB operation return values with `_`. E2EE key wipe failures, participant status updates, and cleanup operations all silently fail.

### Pattern 8: Feed Dismiss Feature is a No-Op
`getDismissedIds()` exists and is tested but is NEVER called from any feed query. The dismiss button does nothing across all feed types.

## Per-Agent File Index

### Wave 1 — Backend Security (16 agents)
- `docs/audit/v2/wave1/A01.md` — auth, users, two-factor, devices (21 findings)
- `docs/audit/v2/wave1/A02.md` — posts, bookmarks, collabs (25 findings)
- `docs/audit/v2/wave1/A03.md` — reels, reel-templates, clips (24 findings)
- `docs/audit/v2/wave1/A04.md` — threads, majlis-lists (19 findings)
- `docs/audit/v2/wave1/A05.md` — videos, video-editor, video-replies, subtitles, thumbnails (28 findings)
- `docs/audit/v2/wave1/A06.md` — messages, chat-export, stickers (23 findings)
- `docs/audit/v2/wave1/A07.md` — stories, story-chains (18 findings)
- `docs/audit/v2/wave1/A08.md` — notifications, webhooks (18 findings)
- `docs/audit/v2/wave1/A09.md` — payments, monetization, gifts, commerce (28 findings)
- `docs/audit/v2/wave1/A10.md` — follows, blocks, mutes, restricts, reports, moderation (20 findings)
- `docs/audit/v2/wave1/A11.md` — search, hashtags, embeddings, recommendations (17 findings)
- `docs/audit/v2/wave1/A12.md` — feed, promotions, polls (22 findings)
- `docs/audit/v2/wave1/A13.md` — channels, channel-posts, communities, community-notes (24 findings)
- `docs/audit/v2/wave1/A14.md` — islamic, mosques, halal, scholar-qa (22 findings)
- `docs/audit/v2/wave1/A15.md` — admin, waitlist, privacy, parental-controls, settings (22 findings)
- `docs/audit/v2/wave1/A16.md` — live, audio-rooms, audio-tracks, broadcast, stream (22 findings)

### Wave 2 — Data Integrity (12 agents)
- `docs/audit/v2/wave2/B01.md` — User, UserSettings, UserProfile, Follow, Block, Mute, Restrict, Device (21 findings)
- `docs/audit/v2/wave2/B02.md` — Post, PostComment, PostReaction, PostBookmark, PostTaggedUser, PostView (24 findings)
- `docs/audit/v2/wave2/B03.md` — Reel, ReelComment, ReelReaction, ReelBookmark, ReelView (21 findings)
- `docs/audit/v2/wave2/B04.md` — Thread, ThreadComment, ThreadReaction, MajlisList (20 findings)
- `docs/audit/v2/wave2/B05.md` — Video, VideoComment, VideoReaction, VideoBookmark, VideoView, VideoReply (31 findings)
- `docs/audit/v2/wave2/B06.md` — Conversation, Message, MessageReaction, MessageMedia, ConversationParticipant (22 findings)
- `docs/audit/v2/wave2/B07.md` — Story, StoryReaction, StoryHighlight, StoryChain (22 findings)
- `docs/audit/v2/wave2/B08.md` — CoinBalance, CoinTransaction, Gift, Cashout, Donation, PaymentMapping (23 findings)
- `docs/audit/v2/wave2/B09.md` — Channel, ChannelPost, ChannelSubscription, Community, CommunityNote (22 findings)
- `docs/audit/v2/wave2/B10.md` — Notification, PushToken, NotificationSetting, FailedJob (20 findings)
- `docs/audit/v2/wave2/B11.md` — Report, ModerationAction, BannedHash, FlaggedContent, Appeal (24 findings)
- `docs/audit/v2/wave2/B12.md` — CallSession, CallParticipant, WaitlistEntry, FeatureFlag, Event, Poll (19 findings)

### Wave 3 — Cross-Module Connectivity (10 agents)
- `docs/audit/v2/wave3/X01.md` — Post Lifecycle (22 findings)
- `docs/audit/v2/wave3/X02.md` — Message & E2E (17 findings)
- `docs/audit/v2/wave3/X03.md` — Payment & Commerce (34 findings)
- `docs/audit/v2/wave3/X04.md` — User Lifecycle (22 findings)
- `docs/audit/v2/wave3/X05.md` — Notification Pipeline (21 findings)
- `docs/audit/v2/wave3/X06.md` — Feed & Algorithm (24 findings)
- `docs/audit/v2/wave3/X07.md` — Real-time Sockets + Queues (21 findings)
- `docs/audit/v2/wave3/X08.md` — Content Moderation (32 findings)
- `docs/audit/v2/wave3/X09.md` — Search & Discovery (17 findings)
- `docs/audit/v2/wave3/X10.md` — Mobile ↔ Backend API Parity (22 findings)

### Wave 5 — Crypto & E2E Encryption (8 agents)
- `docs/audit/v2/wave5/F01.md` — crypto.ts, types.ts (14 findings)
- `docs/audit/v2/wave5/F02.md` — native-crypto-adapter.ts (14 findings)
- `docs/audit/v2/wave5/F03.md` — x3dh.ts (9 findings)
- `docs/audit/v2/wave5/F04.md` — pqxdh.ts (16 findings)
- `docs/audit/v2/wave5/F05.md` — double-ratchet.ts, session.ts (18 findings)
- `docs/audit/v2/wave5/F06.md` — sender-keys.ts, sealed-sender.ts (9 findings)
- `docs/audit/v2/wave5/F07.md` — storage.ts, prekeys.ts, key-transparency.ts (16 findings)
- `docs/audit/v2/wave5/F08.md` — media-crypto, streaming, offline-queue, cache, search-index, multi-device, etc. (19 findings)

### Wave 6 — Go Services (6 agents)
- `docs/audit/v2/wave6/G01.md` — e2e-server handlers (10 findings)
- `docs/audit/v2/wave6/G02.md` — e2e-server store + SQL (15 findings)
- `docs/audit/v2/wave6/G03.md` — e2e-server middleware, config, main (21 findings)
- `docs/audit/v2/wave6/G04.md` — livekit-server handler first half (18 findings)
- `docs/audit/v2/wave6/G05.md` — livekit-server handler second half + tests (20 findings)
- `docs/audit/v2/wave6/G06.md` — livekit-server store, config, middleware, Dockerfile (25 findings)

### Wave 9 — Performance (8 agents)
- `docs/audit/v2/wave9/J01.md` — N+1 Queries (22 findings)
- `docs/audit/v2/wave9/J02.md` — Missing DB Indexes (40 findings)
- `docs/audit/v2/wave9/J03.md` — React Re-renders (19 findings)
- `docs/audit/v2/wave9/J04.md` — Memory Leaks (13 findings)
- `docs/audit/v2/wave9/J05.md` — Bundle Size (20 findings)
- `docs/audit/v2/wave9/J06.md` — Image & Media (16 findings)
- `docs/audit/v2/wave9/J07.md` — Redis Patterns (20 findings)
- `docs/audit/v2/wave9/J08.md` — API Response Size (38 findings)

## Verification

All 6 waves verified with spot-checks:
- Wave 1: 3/3 confirmed, `docs/audit/v2/wave1/VERIFICATION.md`
- Wave 2: 2/3 confirmed + 1 partial, `docs/audit/v2/wave2/VERIFICATION.md`
- Wave 3: 3/3 confirmed, `docs/audit/v2/wave3/VERIFICATION.md`
- Wave 5: 3/3 confirmed, `docs/audit/v2/wave5/VERIFICATION.md`
- Wave 6: 3/3 confirmed, `docs/audit/v2/wave6/VERIFICATION.md`
- Wave 9: 3/3 confirmed, `docs/audit/v2/wave9/VERIFICATION.md`

**17/18 spot-checked findings confirmed as real issues in source code.**

---
*Part 2 covers: Wave 4 (Mobile UX), Wave 7 (Testing), Wave 8 (i18n), Wave 10 (Infrastructure), Wave 11 (Architecture), Wave 12 (Components), Wave 13 (Schema) — 57 additional agents.*
