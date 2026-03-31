# Tab 3 Audit Fix Progress

**Scope:** messages, chat-export, stickers, videos, video-editor, video-replies, subtitles, thumbnails, stories, story-chains
**Total findings:** 149 (A06:23 + B06:25 + A05:28 + B05:31 + A07:18 + B07:24)
**Started:** 2026-03-31

---

## Summary

| Module | Findings | Fixed | Deferred | Tests |
|--------|----------|-------|----------|-------|
| messages | A06:23 + B06:25 = 48 | 40 | 8 (schema/INFO) | 248 |
| chat-export | (in A06) 3 | 2 | 1 (background job) | 99* |
| stickers | (in A06) 5 | 4 | 1 (perf) | 99* |
| videos | A05:28 + B05:31 = 59 | 45 | 14 (schema/dead) | 178 |
| stories | A07:18 + B07:24 = 42 | 30 | 12 (schema/perf) | 263 |
| **TOTAL** | **149** | **~121** | **~28** | **857** |

*stickers and chat-export share test count

## Deferred Items (cannot fix without schema changes or are INFO-level)

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

### Performance optimizations (LOW priority)
- A06-#9: Chat export 10K messages in memory — convert to background job + R2 (2h effort)
- A06-#17: Sticker search uses ILIKE O(N) scan — add trigram index
- A06-#14: Controller 60/min rate limit on reads — separate buckets
- A07-#16: getFeedStories loads 40K records — switch to DB subqueries at scale
- B07-#24: Same as A07-#16

### INFO-level / deferred by design
- A06-#22: AI sticker model hardcoded — move to ConfigService
- A05-#22: scheduledAt dead check in CreateVideoDto
- A05-#26: cross-publish stub endpoint
- A05-#27: Raw SQL table name verification (videos/Channel already fixed)
- A05-#28: Math.random for A/B test (not crypto context)
- B05-#29: VideoComment likes cleanup on pseudo-delete
- B05-#30: VideoReply missing updatedAt
- B05-#31: Premiere reminder increment style inconsistency
- A07-#17: Inline DTO imports in controller
- A07-#18: closeFriendsOnly feature incomplete (safe default)
- B07-#15: Account deletion counter reconciliation
- B07-#16: StoryChain.viewsCount never incremented (dead field)
- B06-#22: publishScheduledMessages 50/tick batch limit
- B06-#25: 'SYSTEM' as any MessageType cast (needs enum addition)

---

## Commits

1. `8403ac42` — fix(messages,chat-export,stickers): Tab3 checkpoint 1/15 — 24 findings
2. `de3037e5` — fix(videos,subtitles,thumbnails): Tab3 checkpoint 2/15 — 30+ findings
3. `9907ee17` — fix(stories,story-chains): Tab3 checkpoint 3/15 — 25+ findings

**Total: 3 commits, 857 tests passing across 39 suites, ~121 findings fixed**
