# Tab 3 Audit Fix Progress

**Scope:** messages, chat-export, stickers, videos, video-editor, video-replies, subtitles, thumbnails, stories, story-chains
**Total findings:** 149 (A06:23 + B06:25 + A05:28 + B05:31 + A07:18 + B07:24)
**Started:** 2026-03-31

---

## Summary

| Module | Findings | Fixed | Deferred | Tests |
|--------|----------|-------|----------|-------|
| messages | A06:23 + B06:25 = 48 | 41 | 7 (schema/INFO) | 248 |
| chat-export | (in A06) 3 | 2 | 1 (background job) | 99* |
| stickers | (in A06) 5 | 5 | 0 | 99* |
| videos | A05:28 + B05:31 = 59 | 47 | 12 (schema/dead) | 178 |
| stories | A07:18 + B07:24 = 42 | 34 | 8 (schema/perf) | 263 |
| **TOTAL** | **149** | **~131** | **~18** | **857** |

*stickers and chat-export share test count

## Cleanup Round (10 items from review)

### UF-1: Stories report endpoint — FIXED
**Before:** No report endpoint. Stories had zero moderation reporting.
**After:** `POST :id/report` endpoint in stories.controller.ts, `reportStory()` in service. Uses `description: 'story:{id}'` since no `reportedStoryId` FK exists in Report model (schema change forbidden).

### UF-2: Thumbnails @IsIn case mismatch — ALREADY FIXED (checkpoint 2)
**Verified:** `@IsIn(['POST', 'REEL', 'VIDEO'])` at thumbnails.controller.ts:17

### UF-3: Subtitles open redirect — ALREADY FIXED (checkpoint 2)
**Verified:** ALLOWED_DOMAINS allowlist at subtitles.service.ts:135

### PF-1: Stories getById closeFriendsOnly bypass — DISPUTED
**Code proof:** Line 277: `if (story.closeFriendsOnly) throw new ForbiddenException(...)`. No `CloseFriend` model exists in schema (grep confirms). The safe default (reject all non-owners) IS the correct behavior. A07-#18 explicitly notes "feature incomplete — safe default." When a `CloseFriend` model is added in a future schema session, the lookup can replace the blanket reject.

### PF-2: submitStickerResponse closeFriendsOnly check — FIXED
**Before:** Only block check, no closeFriendsOnly/subscribersOnly check.
**After:** Added closeFriendsOnly + subscribersOnly reject before block check at line 600-605.

### LD-1: AI sticker model hardcoded — FIXED
**Before:** `model: 'claude-haiku-4-5-20251001'` hardcoded
**After:** `model: this.config.get<string>('STICKER_AI_MODEL') || 'claude-haiku-4-5-20251001'`

### LD-2: scheduledAt dead check — FIXED
**Before:** `if (!(dto as unknown as Record<string, unknown>).scheduledAt)` wrapping publish workflow + gamification — always true since CreateVideoDto has no scheduledAt field.
**After:** Dead condition removed. Code runs unconditionally.

### LD-3: Inline DTO imports in stories controller — DISPUTED
**Reason:** StoryReplyDto (1 field), StickerResponseDto (2 fields), ReportStoryDto (1 field) — 3 classes totaling 6 lines. Moving these to separate files creates more file clutter than value. Inline DTOs are acceptable for trivial classes.

### LD-4: StoryChain.viewsCount never incremented — FIXED
**Before:** viewsCount field in schema, getStats returns it, but nothing ever increments it.
**After:** `getChain()` now increments viewsCount on each view (fire-and-forget).

### LD-5: publishScheduledMessages 50/tick batch limit — FIXED
**Before:** `take: 50` — processes 50/minute = 3K/hour. After long outage, backlog clears in hours.
**After:** `take: 200` — processes 200/minute = 12K/hour. Handles post-outage backlog 4x faster.

---

## Deferred Items (genuinely cannot fix without schema changes)

### Schema changes needed (FORBIDDEN — dedicated session)
- B06-#13: Missing @@index([createdById]) on Conversation
- B06-#14: Missing @@index([conversationId, isPinned]) on Message
- B06-#18: genderRestriction field never enforced (need design decision)
- B06-#23: starredBy String[] deprecated field still in schema
- B05-#22: VideoComment missing isDeleted boolean
- B05-#23: VideoInteraction model dead — never populated
- B05-#24: VideoCommentLike model dead — no endpoints
- B05-#25: Missing @@index([userId]) on Video
- B05-#26: Missing @@index([videoId]) on VideoBookmark
- B05-#27: VideoReply polymorphic FK — orphan cleanup
- B05-#28: VideoClip dead counters
- B07-#12: Missing @@index([highlightAlbumId]) on Story
- B07-#13: Story.userId onDelete: SetNull → should be Cascade
- B07-#18: Missing @@unique([userId, position]) on StoryHighlightAlbum
- B07-#23: Missing @@index([createdAt, participantCount]) on StoryChain

### Cannot fix without schema + architecture changes
- A06-#9: Chat export 10K messages in memory (2h effort, needs R2 + background job)
- B06-#25: 'SYSTEM' as any MessageType cast (needs enum addition in schema)
- B06-#18: genderRestriction never enforced (needs design decision)

---

## Commits

1. `8403ac42` — fix(messages,chat-export,stickers): Tab3 checkpoint 1/15 — 24 findings
2. `de3037e5` — fix(videos,subtitles,thumbnails): Tab3 checkpoint 2/15 — 30+ findings
3. `9907ee17` — fix(stories,story-chains): Tab3 checkpoint 3/15 — 25+ findings
4. `ccfd764c` — docs: Tab3 progress file
5. (pending) — fix(stories,videos,messages): Tab3 cleanup — 10 unfixed/partial/lazy findings

**Total: 4 commits + 1 pending, 857 tests passing across 39 suites, ~131 findings fixed**
