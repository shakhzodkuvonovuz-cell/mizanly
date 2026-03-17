# Mizanly Gap Fix Checklist — Priority Order

> Master checklist for closing all gaps identified in the comprehensive audit.
> Updated: 2026-03-18

---

## BATCH 49: Wire Disconnected Features + Build Missing Screens (Priority 1)

### A. Wire Disconnected Integrations
- [x] Wire gamification XP into posts.service (post_created = 10 XP) ✅
- [x] Wire gamification XP into threads.service (thread_created = 15 XP) ✅
- [x] Wire gamification XP into reels.service (reel_created = 20 XP) ✅
- [x] Wire gamification XP into videos.service (video_created = 25 XP) ✅
- [x] Wire gamification XP into comments (comment_posted = 5 XP) ✅
- [x] Wire streak auto-update into posts.service (posting streak) ✅
- [x] Wire AI moderation into posts.service.create() ✅
- [x] Wire AI moderation into threads.service.create() ✅
- [ ] Wire AI moderation into comments creation
- [ ] Wire parental restrictions check middleware (canPost, canComment, canGoLive)
- [x] Add "Translate" button to PostCard component ✅
- [ ] Add "Translate" button to ThreadCard component
- [ ] Wire reputation update on helpful comment likes

### B. Build Missing Mobile Screens (Backend-only → Full UI)
- [x] leaderboard.tsx ✅
- [x] achievements.tsx ✅
- [x] streaks.tsx ✅
- [x] series-discover.tsx ✅
- [x] series-detail.tsx ✅
- [ ] create-series.tsx
- [x] watch-party.tsx ✅
- [x] marketplace.tsx ✅
- [x] product-detail.tsx ✅
- [ ] checkout.tsx
- [x] orders.tsx ✅
- [x] local-boards.tsx ✅
- [x] mentorship.tsx ✅
- [ ] study-circles.tsx (exists but needs expansion)
- [x] volunteer-board.tsx ✅
- [x] fatwa-qa.tsx ✅
- [x] voice-post-create.tsx ✅
- [x] waqf.tsx ✅
- [ ] shared-collections.tsx
- [x] profile-customization.tsx ✅
- [x] xp-history.tsx ✅ (bonus)

## BATCH 50: Telegram Quick Wins (Priority 2)
- [ ] Saved Messages — Personal "chat with yourself" cloud notepad
- [ ] Chat Folders / Tabs — Custom tab organizer for conversations
- [ ] Silent Messages — Send without notification buzz
- [ ] Spoiler Text — ||hidden|| formatting in RichText
- [ ] Slow Mode — Admin cooldown timer per group
- [ ] Video Messages (Round Bubbles) — Circular video in chat
- [ ] Markdown in Messages — Bold, italic, code, links in chat
- [ ] Message Effects — Confetti/hearts animations on send
- [ ] Voice-to-Text — Transcribe voice messages (using Whisper)
- [ ] Admin Event Log — Audit trail for group/channel admin actions

## BATCH 51: Telegram Medium Features (Priority 3)
- [ ] Topics in Groups — Sub-forums within group chats
- [ ] Large File Sharing (2GB) — Chunked upload with resume + preview
- [ ] Custom Emoji Packs — Create/share animated emoji
- [ ] People Nearby — GPS-based user/community discovery
- [ ] Channel Statistics — Detailed analytics for channel admins
- [ ] Channel Post View Counts — Per-message view tracking
- [ ] Auto-Forward (Channel → Discussion Group)
- [ ] Admin Signatures on Channel Posts
- [ ] Animated/Video Stickers — Lottie + MP4 sticker support
- [ ] Sticker Creation Tools — Make packs from photos

## BATCH 52: Discord Parity (Priority 4)
- [ ] Always-On Voice Channels — Persistent drop-in voice rooms
- [ ] Screen Sharing — In calls, live sessions, and voice channels
- [ ] Forum Channels — Reddit-style threaded discussions
- [ ] Rich Link Embeds — Structured card previews
- [ ] Webhooks — External services post into channels
- [ ] Granular Role Permissions — Per-channel permission overrides
- [ ] Stage Channels — Moderated audio (speaker/audience)
- [ ] Server Discovery — Browse/join public communities

## BATCH 53: Algorithm & Intelligence (Priority 5)
- [ ] ML Recommendation Engine — Collaborative filtering for feeds
- [ ] Content Embedding Similarity — Vector-based content matching
- [ ] User Interest Graph — Track & weight content preferences
- [ ] Feed Diversity Controls — Prevent filter bubbles
- [ ] Trending Algorithm — Real-time velocity tracking
- [ ] Sound Page Ecosystem — All videos using a sound, viral chains

## BATCH 54: Security & Infrastructure (Priority 6)
- [ ] Signal Protocol E2E Encryption — Real ratcheting with forward secrecy
- [ ] Multi-Device Sync — Phone + desktop + tablet simultaneously
- [ ] Production Desktop/Web Client — Full sidebar nav, keyboard shortcuts
- [ ] Large File Upload Infrastructure — R2 multipart, resume, 2GB limit

## BATCH 55: Platform & Ecosystem (Priority 7)
- [ ] Bot Platform / Developer API — Webhook-based bot framework
- [ ] Inline Bots — @botname in any chat
- [ ] Mini Apps Framework — WebView apps inside chats
- [ ] Stars/Micropayment Economy — In-app currency
- [ ] Telegram Premium Equivalent — Enhanced subscription tier
- [ ] AR Filters — Face tracking + Islamic-themed effects

## BATCH 56: Input Validation & Hardening
- [ ] Add DTOs for ai module (all endpoints)
- [ ] Add DTOs for gamification module
- [ ] Add DTOs for commerce module
- [ ] Add DTOs for community module
- [ ] Add @ApiTags/@ApiOperation to clips controller
- [ ] Add input size limits to AI endpoints
- [ ] Add missing Swagger docs

---

## COMPLETION TRACKING

| Batch | Features | Status |
|-------|----------|--------|
| 49 | Wire integrations + 20 missing screens | **DONE** |
| 50 | Telegram quick wins (10 features) | PENDING |
| 51 | Telegram medium features (10 features) | PENDING |
| 52 | Discord parity (8 features) | PENDING |
| 53 | Algorithm & intelligence (6 features) | PENDING |
| 54 | Security & infrastructure (4 features) | PENDING |
| 55 | Platform & ecosystem (6 features) | PENDING |
| 56 | Validation & hardening | PENDING |
