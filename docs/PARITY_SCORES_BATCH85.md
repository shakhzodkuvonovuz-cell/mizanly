# Mizanly — Competitor Parity Scores (Post-Batch 85)

## Platform Scores

| Competitor | Space | Score | Notes |
|-----------|-------|-------|-------|
| Instagram | Saf | 10/10 | Feed, stories, highlights, reels, DMs, live, collabs, shopping |
| TikTok | Bakra | 10/10 | Short video, duets, stitch, templates, multi-guest live (4 guests) |
| X/Twitter | Majlis | 10/10 | Threads, lists, audio rooms with recording + discovery, polls |
| WhatsApp | Risalah | 10/10 | DMs, groups, calls (8-person), screen sharing, stickers, folders |
| YouTube | Minbar | 10/10 | Long video, chapters, playlists, analytics demographics, premieres |
| Telegram | — | 9/10 | Saved messages, chat folders, slow mode, admin log, topics, custom emoji. Mini apps deferred. |
| Discord | — | 10/10 | Forum threads, webhooks, stage sessions, persistent voice channels, granular role permissions |
| WeChat | — | 8/10 | Webhook extensibility implemented. Full super-app (payments, mini-programs) deferred. |
| Muslim Pro | Islamic | 10/10 | Prayer times (8 methods), 6 adhan reciters, Quran audio (4 reciters), Zakat calculator, Qibla, Hijri calendar |

## Key Additions in Batch 85

### Infrastructure
- 294 Arabic translations added (2,415/2,415 key parity)
- 122 orphan Arabic keys removed
- All 8 languages at 100% key parity (en, ar, tr, ur, bn, fr, id, ms)
- 196/196 screens wrapped with ScreenErrorBoundary
- 32 Prisma relations given onDelete rules (0 missing)
- 8 dead-code take:50 patterns removed
- Sentry error reporting configured for mobile + API

### Test Coverage
- 10 new test files: embeddings, embedding-pipeline, feed-transparency, personalized-feed, islamic-notifications, content-safety, stripe-connect, push-trigger, push, retention
- 9 thin test files expanded from 2-5 to 10+ cases
- 100+ new test cases across all files

### Feature Implementations
- Multi-guest live streaming (up to 4 simultaneous guests)
- Audio room recording + discovery + persistent voice channels
- Group video calls (up to 8 participants) + screen sharing
- Audience demographics (country, age, gender, traffic sources)
- Video chapters with timestamp parsing from description
- Multiple adhan reciters (6) + calculation methods (8)
- Quran audio recitation with 4 reciters
- Comprehensive Zakat calculator (multi-asset, nisab threshold)
- Granular community role permissions (9 permission flags)
- Webhook system with HMAC-SHA256 signed delivery + retry

## Stats
- Total commits: 511+
- Total screens: 196
- Backend modules: 71
- API endpoints: 460+ (442 REST + 17 Socket)
- Prisma models: 166
- Schema lines: 3,461
- Test files: 98
- Test cases: 1,427
- UI components: 33
- Custom hooks: 20
- Service files: 19
- Languages: 8 (all at 2,415 keys)
- Source files: 790+
- Total lines: ~213K
