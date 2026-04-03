# Master Deferred List — All Rounds, All Tabs

> Every unresolved item across R1 (72-agent audit), R2 (4 tabs + Part 2s), R3 (4 tabs + Part 2s), and R4 (10 tabs — screen audits Wave 4).
> Last updated: 2026-04-02. No compression. Every item listed.

---

## How to read this file

- **Source**: Which progress file this deferral lives in
- **Sev**: C=Critical, H=High, M=Medium, L=Low, I=Info
- **Status**: DEFERRED = explicitly deferred | NOTED = acceptable risk but not fixed
- Items resolved by later rounds are NOT listed here (only truly open items)

---

## 1. SECURITY — Plaintext Secrets & Encryption (12 items)

| # | Source | Sev | Finding | Blocker |
|---|--------|-----|---------|---------|
| 1 | R3-T4 S01-#1 | C | Conversation.lockCode stored plaintext | Needs app-level hashing (bcrypt on write, compare on read) |
| 2 | R3-T4 S01-#2 | C | CallSession.e2eeKey stored plaintext Bytes | Needs infra-level encryption at rest; key wiped on call end |
| 3 | R3-T4 S02-#1 | C | TwoFactorSecret.secret stored plaintext | Needs encryption migration cron + encrypted column |
| 4 | R3-T4 S02-#2 | C | TwoFactorSecret.backupCodes unsalted SHA-256 | Needs migration to HMAC-SHA256 with per-user salt |
| 5 | R3-T4 S02-#3 | C | Webhook.secret stored plaintext | Needs app-level encryption |
| 6 | R3-T4 S02-#4 | C | Webhook.token stored plaintext | Needs app-level encryption/hashing |
| 7 | R3-T4 S01-#37 | L | LiveSession.streamKey stored plaintext | Needs app-level encryption |
| 8 | R3-T1 K02-#1 | C | Real Neon DB creds in local .env | Secrets manager (Doppler/1Password). Warning added in P2. |
| 9 | R3-T1 K02-#2 | C | Clerk secret key in local .env | Same as above |
| 10 | R3-T1 K02-#3 | C | Stripe secret key in local .env | Same as above |
| 11 | R3-T1 K02-#4 | C | AI API keys in local .env | Same as above |
| 12 | R3-T1 K02-#5 | C | R2 access keys in local .env | Same as above |

---

## 2. ARCHITECTURE — Event-Driven & God Services (16 items)

| # | Source | Sev | Finding | Blocker |
|---|--------|-----|---------|---------|
| 13 | R3-T2 L02-#10 | H | QueueModule ↔ NotificationsModule circular dependency | True cycle masked by @Global+@Optional. Needs event-driven architecture. |
| 14 | R3-T2 L02-#12 | H | NotificationsService is god-dependency (21 services inject it) | Needs @nestjs/event-emitter. CLAUDE.md Scale Roadmap Tier 4. |
| 15 | R3-T2 L02-#14 | H | Zero event-driven architecture | Foundational change — Scale Roadmap Tier 4 item #12 |
| 16 | R3-T2 L02-#4-9 | M | Queue processor forwardRef (6 items) | Needs DlqService extraction to break intra-module circle |
| 17 | R3-T2 L02-#11 | M | Transitive cycle through Gamification | Same root cause as #13 |
| 18 | R3-T2 L02-#13 | M | Dual PushTrigger injection (Follows + Messages bypass pipeline) | Requires event-driven extraction |
| 19 | R3-T2 L02-#18 | M | @Optional masking in Notifications | Requires #13 cycle fix first |
| 20 | R3-T2 L02-#20-22 | M | God service constructors (3 services) | Requires event-driven extraction |
| 21 | R3-T2 L02-#23 | L | FollowsService redundant coupling | Same root cause as #18 |
| 22 | R3-T2 L06-#1 | H | Conversation screen god component (3,169 lines) | Extract useConversation, useVoiceRecording, useMessageEncryption hooks |
| 23 | R3-T2 L06-#2 | H | Video-editor god component (2,606 lines) | Extract to useReducer or Zustand slice |
| 24 | R3-T2 L06-#9 | M | Zustand store monolith (500 lines) | Split into domain slices |
| 25 | R3-T2 L06-#14 | L | Create screens are god components | Extract hooks |
| 26 | R1-[13] F27 | M | Duplicate moderation systems (moderation.service + content-safety.service) | Consolidation needed |
| 27 | R1-[13] F30 | M | Reports service doesn't handle WARN/BAN actions | Needs delegation to admin.service |
| 28 | R3-T4 B11-#16 | M | Appeal model extraction from ModerationLog | Architecture decision |

---

## 3. THEME MIGRATION — XL Effort (5 items)

| # | Source | Sev | Finding | Blocker |
|---|--------|-----|---------|---------|
| 29 | R3-T2 L06-#5 | M | conversation screen colors.dark.* ×28 | Convert to createStyles(tc) pattern |
| 30 | R3-T2 L06-#12 | M | 643 colors.dark.* references across 124 files | Systematic theme migration — XL effort |
| 31 | R3-T2 L06-#13 | M | 1,628 colors.text.* references across 199 files | Same migration |
| 32 | R3-T2 L03-#48-52 | M | Style patterns (5 findings) | Theme migration across 112+ files |
| 33 | R3-T2 L06-#17 | L | Dimensions.get at module scope in 57 files | Replace with useWindowDimensions |

---

## 4. QUEUE & DEAD CODE — Missing Producers (7 items)

| # | Source | Sev | Finding | Blocker |
|---|--------|-----|---------|---------|
| 34 | R3-T1 K04-#3 | H | Media processor dead code — no producer | Needs addMediaProcessingJob + upload pipeline wiring |
| 35 | R3-T1 K04-#4 | H | bulk-push handler — no producer | Needs addBulkPushJob method |
| 36 | R3-T1 K04-#5 | H | track-engagement handler — no producer AND no storage | Needs design + implementation |
| 37 | R3-T1 K04-#7 | M | No fetch timeout in media processor | Moot until #34 is fixed |
| 38 | R3-T1 K04-#8 | M | Unbounded memory from arrayBuffer | Moot until #34 is fixed |
| 39 | R3-T1 K04-#21 | L | S3Client created per-job in media processor | Moot until #34 is fixed |
| 40 | R3-T1 K04-#22 | L | Silent .catch on BlurHash writes | Moot until #34 is fixed |

---

## 5. SCHEMA & DATABASE (14 items)

| # | Source | Sev | Finding | Blocker |
|---|--------|-----|---------|---------|
| 41 | R3-T4 S02-#44 | M | Embedding.postId/userId dangling FKs | Needs app-level cleanup or relation |
| 42 | R3-T4 S02-#45 | M | CreatorEarning no creation API | Needs service work, not schema |
| 43 | R3-T4 B11-#24 | M | ModerationLog field removal | Needs analysis of which field |
| 44 | R3-T4 R2-B09-#13 | M | UserReputation reason field | Needs schema + code change |
| 45 | R1-[15] P1-CASCADE-10/11 | M | Report reporter/reportedUser to SetNull | Requires reporterId to become optional + null-safety |
| 46 | R1-[15] P1-DANGLING-01-08 | M | 8 dangling FK references | Requires schema migration with explicit relations |
| 47 | R1-[15] P1-FKARRAY-01-03 | M | String[] arrays need join tables (starred messages, etc.) | Requires schema migration |
| 48 | R1-[15] P1-INDEX-06-08 | M | Missing indexes (CallSession.endedAt, Embedding contentType+contentId) | Requires schema migration |
| 49 | R1-[15] P1-MONEY-01-04 | M | Float to Decimal (CoinBalance.balance, Product.price) | Requires schema migration + reconciliation |
| 50 | R1-[15] P1-DESIGN-01-04 | M | Major schema redesign (Notification polymorphic, TwoFactorSecret encryption) | Requires major architecture |
| 51 | R1-[02] C-02 | C | Dual balance system (CoinBalance table vs User.coinBalance) | Requires schema consolidation |
| 52 | R1-[02] C-14 | M | Message field abused for Stripe metadata | Needs stripePaymentId on Tip model |
| 53 | R1-[02] C-15 | M | Orders no payment collection | Requires Stripe PaymentIntent integration |
| 54 | R1-[21] F3 | M | No pgvector HNSW index on embeddings | Requires raw SQL migration |

---

## 6. PAYMENTS & FINANCIAL (8 items)

| # | Source | Sev | Finding | Blocker |
|---|--------|-----|---------|---------|
| 55 | R3-T2 L04-#2-3 | C | Payments fire-and-forget (2 items) | Needs payment reconciliation — critical but complex |
| 56 | R1-[02] m-02 | L | CoinTransaction type unvalidated | Needs CoinTransactionType enum |
| 57 | R1-[02] m-03 | L | No currency field on transactions | Needs currency field on CoinTransaction |
| 58 | R1-[02] m-18/19/20 | L | Missing indexes on transaction/order/donation | Schema migration |
| 59 | R1-[02] m-25 | L | No tip idempotency | Needs @@unique on Tip payment ref |
| 60 | R1-[02] m-28 | L | WaqfFund no donations relation | Schema migration |
| 61 | R1-[08] F24 | M | Sticker count not atomic | Needs $transaction or $executeRaw |
| 62 | R1-[08] F25 | M | My Stickers pack name pattern | Needs ownerId on StickerPack model |

---

## 7. MODERATION & CONTENT SAFETY (12 items)

| # | Source | Sev | Finding | Blocker |
|---|--------|-----|---------|---------|
| 63 | R1-[05] F44 | M | Thread images moderation | Content pipeline needs moderateImage call |
| 64 | R1-[05] F45 | M | Video description/thumbnail moderation | Same pipeline hook |
| 65 | R1-[05] F46 | M | Channel name moderation | Same pipeline hook |
| 66 | R1-[10] F7 | M | Fire-and-forget moderation (publish before moderate) | Needs pipeline refactor to await moderation |
| 67 | R1-[10] F8/9/10 | M | Prompt injection in AI templates | Needs XML delimiter approach |
| 68 | R1-[10] F16/17/18 | M | AI cost controls (no per-user quota) | Needs Redis-backed daily/monthly quota |
| 69 | R1-[13] F07 | M | Reports resolve doesn't remove content | Needs shared service with admin |
| 70 | R1-[13] F09 | M | Feature flag value validation | Needs typed flag values |
| 71 | R1-[13] F18 | M | autoRemoveContent ignores comments | Needs Comment model lookup |
| 72 | R1-[13] F21 | M | Admin resolveReport no ModerationLog | Needs ModerationLog.create |
| 73 | R1-[13] F24 | M | Ban no session invalidation | Needs Clerk SDK revokeSession |
| 74 | R1-[13] F28 | M | flagContent sets reporterId to content creator | Auto-flag should use system ID |

---

## 8. NOTIFICATIONS (6 items)

| # | Source | Sev | Finding | Blocker |
|---|--------|-----|---------|---------|
| 75 | R1-[14] C-02 | C | 8 dead notification types never wired | Cross-module changes to emit |
| 76 | R1-[14] C-03 | C | No real-time socket notification delivery | Needs chat gateway integration |
| 77 | R1-[14] C-05 | M | Notification dedup | Needs Redis dedup with TTL |
| 78 | R1-[14] C-08 | M | Expo access token not configured | Needs EXPO_ACCESS_TOKEN env var |
| 79 | R1-[14] M-07 | M | No notification cleanup/retention | Needs cron to delete old read notifs |
| 80 | R1-[14] M-09 | M | No unread-counts endpoint | Needs new controller route |

---

## 9. MESSAGING & REAL-TIME (7 items)

| # | Source | Sev | Finding | Blocker |
|---|--------|-----|---------|---------|
| 81 | R1-[06] F19 | M | Scheduled message auto-send | Needs cron or BullMQ repeatable job |
| 82 | R1-[06] F20-21 | M | Starred messages String[] needs join table | Schema migration |
| 83 | R1-[06] F35 | M | Chat export unbounded memory | Needs streaming with chunked DB reads |
| 84 | R1-[06] F40-42 | M | Quran room: limits, host transfer, cleanup | WebSocket room management refactor |
| 85 | R1-[03] F16 | M | 2FA disconnected from login flow | Needs Clerk SDK middleware |
| 86 | R1-[03] F19 | M | Missing Clerk webhook events | Needs Clerk dashboard config |
| 87 | R1-[03] F33 | M | updateControls no PIN re-verification | Needs PIN verification middleware |

---

## 10. AUTH & PRIVACY (5 items)

| # | Source | Sev | Finding | Blocker |
|---|--------|-----|---------|---------|
| 88 | R1-[03] F22 | M | Envelope store race condition | Needs Prisma $transaction rewrite |
| 89 | R1-[03] F27 | M | Unsalted backup code hash | Needs HMAC-SHA256 migration |
| 90 | R1-[03] F28 | L | Hardcoded English in key change notification | Needs backend i18n with user locale |
| 91 | R1-[09] F25 | M | Data export capped at 50 (GDPR violation) | Needs paginated/streaming export |
| 92 | R1-[04] P2-25 | M | Circle members not notified on add/remove | Needs NotificationsModule import |

---

## 11. SEARCH & DISCOVERY (3 items)

| # | Source | Sev | Finding | Blocker |
|---|--------|-----|---------|---------|
| 93 | R1-[12] F16 | M | Meilisearch filter bypass on content removal | SearchIndexingProcessor needs delete events |
| 94 | R1-[12] F27 | M | Meilisearch only configures 3/6 indexes | threads/reels/videos not configured |
| 95 | R1-[10] F25 | M | Translation cache not invalidated on edit/delete | Needs Redis cache hooks |

---

## 12. MEDIA PIPELINE (5 items)

| # | Source | Sev | Finding | Blocker |
|---|--------|-----|---------|---------|
| 96 | R1-[11] F1 | M | EXIF stripping not wired into upload pipeline | sharp installed but not integrated |
| 97 | R1-[11] F10 | M | Media processor discards resized images | Needs R2 upload from BullMQ worker |
| 98 | R1-[11] F11 | M | BlurHash is stub | Needs blurhash package + processor + DB write |
| 99 | R1-[11] F14 | M | Video publishedAt set at creation not on ready | Needs Stream webhook handler |
| 100 | R1-[21] F4 | M | Trending sort in JS instead of SQL | Needs raw SQL ORDER BY |

---

## 13. COMMUNITY FEATURES (5 items)

| # | Source | Sev | Finding | Blocker |
|---|--------|-----|---------|---------|
| 101 | R1-[09] F02 | M | Role management controller endpoints | Needs CRUD routes for community roles |
| 102 | R1-[09] F11 | M | Scholar QA vote dedup | Needs join table in schema |
| 103 | R1-[09] F12 | M | Halal verify dedup | Needs join table in schema |
| 104 | R1-[09] F13 | M | Community notes content existence check | Needs polymorphic content lookup |
| 105 | R1-[08] F10 | M | Challenge accepts absolute progress | Needs server-side action tracking |

---

## 14. CI/INFRASTRUCTURE (20 items)

| # | Source | Sev | Finding | Blocker |
|---|--------|-----|---------|---------|
| 106 | R3-T1 K02-#6 | C | TOTP encryption key in local .env | KMS is future infrastructure decision |
| 107 | R3-T1 K01-#14 | M | Prisma generate caching in CI | Minor optimization |
| 108 | R3-T1 K01-#16 | M | Coverage thresholds in CI | Requires team decision on minimum % |
| 109 | R3-T1 K01-#18 | M | Docker build verification in CI | Low priority |
| 110 | R3-T1 K01-#21 | M | workers/exif-stripper build in CI | Out of scope (Cloudflare Worker) |
| 111 | R3-T1 K02-#9 | H | INTERNAL_SERVICE_KEY missing from local .env | Railway has it |
| 112 | R3-T1 K02-#13 | H | Mobile .env points to production API with test key | Dev config decision |
| 113 | R3-T1 K02-#16 | M | EXPO_ACCESS_TOKEN at module load time | Needs ConfigService injection refactor |
| 114 | R3-T1 K02-#19 | M | CORS origins resolved at decorator time | Architectural change |
| 115 | R3-T1 K04-#12 | M | Analytics worker no retry config | Works with default |
| 116 | R3-T1 K04-#13 | M | Search indexing worker no retry config | Same |
| 117 | R3-T1 K04-#15 | M | No maxStalledCount on processors | Needs per-processor analysis |
| 118 | R3-T1 K04-#17 | M | Webhook dedup | Needs hash-based jobId |
| 119 | R3-T1 K04-#26 | I | Deprecated AsyncJobService | Removal needs HealthController refactor |
| 120 | R1-[19] C4 | C | No scheduled content publisher cron | Needs @nestjs/schedule or BullMQ |
| 121 | R1-[19] M12 | M | No dead letter queue consumer | Needs BullMQ failed event listener |
| 122 | R1-[18] F37 | M | Per-target-user throttle keying | Needs custom NestJS throttle decorator |
| 123 | R3-T1 K01-#22 | L | Branch protection rules | GitHub UI config |
| 124 | R3-T1 K01-#26 | L | --legacy-peer-deps removal | Requires fixing peer dep conflicts |
| 125 | R3-T1 K05-#18 | L | Inconsistent Railway config formats | Cosmetic |

---

## 15. MOBILE COMPONENTS — Deferred (21 items)

| # | Source | Sev | Finding | Blocker |
|---|--------|-----|---------|---------|
| 126 | R3-T3 C01-#5 | H | Quality selector non-functional | Requires HLS multi-quality source from backend |
| 127 | R3-T3 C01-#7 | H | RichCaptionInput wrong cursor position | TextInput selection API limited on RN |
| 128 | R3-T3 C01-#8 | H | MiniPlayer video leak on expand | Requires stop+navigate orchestration |
| 129 | R3-T3 C02-#2 | H | StickerPackBrowser raw Image | ProgressiveImage needs width/height hints |
| 130 | R3-T3 C02-#5 | H | StickerPicker raw Image | Same as #129 |
| 131 | R3-T3 C02-#12 | H | StickerPackBrowser stickers count | Needs i18n pluralization |
| 132 | R3-T3 C04-#2 | C | GIPHY API key exposed in client code | Needs backend proxy endpoint |
| 133 | R3-T3 C01-#6 | H | EmojiPicker stale Dimensions (tablet) | Edge case |
| 134 | R3-T3 C01-#11 | M | VideoPlayer hardcoded dark colors | Static styles can't use hooks |
| 135 | R3-T3 C01-#12 | M | LocationPicker hardcoded dark colors | Same |
| 136 | R3-T3 C01-#15 | M | Toast stale closure | Stable deps, no real bug |
| 137 | R3-T3 C01-#31 | M | RichText stopPropagation no-op | RN doesn't support it |
| 138 | R3-T3 C02-#22 | M | PostCard ReactionPicker ignores type | Needs mutation + backend refactor |
| 139 | R3-T3 C02-#27 | M | StickerPicker module Dimensions | Low priority, works on phones |
| 140 | R3-T3 C03-#6 | M | sessionId non-reactive ref return | Risk of breaking poll logic |
| 141 | R3-T3 C03-#12 | M | preloadCount non-reactive | UI doesn't display it |
| 142 | R3-T3 C03-#25 | L | useAnimatedPress worklet in useCallback | Reanimated limitation |
| 143 | R3-T3 C04-#10 | M | 429 retry sleeps 120s | Needs AbortController refactor |
| 144 | R3-T3 C04-#11 | M | GIPHY REST no timeout | Needs AbortController |
| 145 | R3-T3 C04-#12 | M | LiveKit createRoom no timeout | Needs AbortController |
| 146 | R3-T3 C04-#13 | M | SOCKET_URL fragile string replace | Low risk |

---

## 16. TYPE SAFETY — Remaining `as any` (12 items)

| # | Source | Sev | Finding | Blocker |
|---|--------|-----|---------|---------|
| 147 | R3-T2 L05-#1 | M | feed.service any[] | Prisma type inference |
| 148 | R3-T2 L05-#2 | M | reports.service any[] | PrismaPromise typing |
| 149 | R3-T2 L05-#6 | M | prisma.service as any | Prisma event type |
| 150 | R3-T2 L05-#9 | M | gifts.service as any on relations | Prisma payload types |
| 151 | R3-T2 L05-#12 | M | socket-io-adapter double cast | Redis adapter typing |
| 152 | R3-T2 L05-#14 | M | stripe webhook generic Record | Use Stripe.Dispute type |
| 153 | R3-T2 L05-#15 | M | search.service limit cast | Fix parameter type |
| 154 | R3-T2 L05-#29 | M | commerce order manual typing | Use Prisma payload type |
| 155 | R3-T2 L06-#3 | H | conversation as any ×4 | Extend EncryptedMessage types |
| 156 | R3-T2 L06-#4 | H | video-editor as any ×2 | Add routes to expo-router types |
| 157 | R3-T2 L05-#3 | L | nsfwCheck any model | NSFWJS type import |
| 158 | R3-T2 L05-#11 | L | privacy.service val as any | Narrow type guard |

---

## 17. PAGINATION & PATTERNS (12 items)

| # | Source | Sev | Finding | Blocker |
|---|--------|-----|---------|---------|
| 159 | R3-T2 L03-#1-8 | M | Date-string cursors (8 services) | Pagination standardization |
| 160 | R3-T2 L03-#9-10 | L | Cursor null/undefined inconsistency | Low risk |
| 161 | R3-T2 L03-#28 | M | 15 services return {success:true} redundantly | Pattern inconsistency |
| 162 | R3-T2 L03-#37-42 | M | Manual useState in broadcast screens (6 findings) | React Query migration |
| 163 | R3-T2 L06-#7 | M | Draft persistence duplicated 4× | Extract useDraftPersistence hook |
| 164 | R3-T2 L06-#8 | M | GifPicker inline in conversation screen | Move to components/risalah/ |
| 165 | R3-T2 L06-#10 | M | feedDismissedIds uses array not Set | Optimization |
| 166 | R3-T2 L06-#11 | M | Decryption O(n) per new message | Track last-decrypted index |
| 167 | R3-T2 L06-#19 | L | PremiumToggle inline in settings screen | Extract to components/ui/ |
| 168 | R1-[06] F58 | L | Broadcast slug change prevention | Schema-level immutable or service check |
| 169 | R3-T2 L04-#9-10 | H | stream.service fetch no try-catch | Needs error handling |
| 170 | R3-T2 L04-#25 | M | privacy hard delete catch | GDPR compliance retry |

---

## 18. UI/UX (3 items)

| # | Source | Sev | Finding | Blocker |
|---|--------|-----|---------|---------|
| 171 | R1-[24] P1-7 | M | LinkPreview needs real OG metadata API | Wire to backend /og endpoint |
| 172 | R1-[24] P2-1 | M | BottomSheet keyboard avoidance | Needs KeyboardAvoidingView wrapper |
| 173 | R1-[24] P2-5 | M | LocationPicker needs expo-location | Needs package + geocoding API |

---

## 19. LOW PRIORITY / COSMETIC (22 items)

| # | Source | Sev | Finding | Blocker |
|---|--------|-----|---------|---------|
| 174 | R3-T1 K01-#11 | H | Go version mismatch claim (may already be resolved) | Verify |
| 175 | R3-T1 K01-#15 | M | --passWithNoTests on integration tests | May already be removed |
| 176 | R3-T1 K01-#23 | L | Flaky test retry | Needs evaluation |
| 177 | R3-T1 K01-#25 | L | pnpm vs npm inconsistency | CLAUDE.md documents both |
| 178 | R3-T1 K02-#17 | M | INTERNAL_SERVICE_KEY empty string default | Fail-closed, actually safe |
| 179 | R3-T1 K02-#21 | L | Dual R2 env var names | Naming convention decision |
| 180 | R3-T1 K02-#22 | L | TOTP without encryption key in prod | Covered by K02-#12 required in prod |
| 181 | R3-T1 K02-#23 | L | Sentry environment default | Railway sets NODE_ENV=production |
| 182 | R3-T1 K02-#24 | L | TRANSPARENCY_SIGNING_KEY silently optional | Go server warning |
| 183 | R3-T1 K02-#25 | L | Dev error response info disclosure | Staging NODE_ENV |
| 184 | R3-T1 K02-#26 | I | Mixed process.env vs ConfigService | Large refactor |
| 185 | R3-T1 K03-#10 | M | Math.random() claim (already uses crypto.randomInt) | Verify |
| 186 | R3-T1 K03-#14 | M | Week ID calculation fragile edge case | Low priority |
| 187 | R3-T1 K03-#22 | L | take:100 batch size during catchup | Performance, not bug |
| 188 | R3-T1 K03-#23 | L | take:5000 cap (may already be cursor-paginated) | Verify |
| 189 | R3-T1 K03-#27 | L | Stripe client with empty string | Fail-closed |
| 190 | R3-T1 K04-#14 | M | Media worker no retry config | Moot until #34 fixed |
| 191 | R3-T1 K04-#19 | L | Dynamic require in queue.module | Cosmetic |
| 192 | R3-T1 K04-#25 | I | Queue prefix | Cosmetic |
| 193 | R3-T1 K04-#27 | I | Queue/Worker shutdown coordination | Deploy edge case |
| 194 | R3-T1 K05-#19 | L | Duplicate start command in e2e-server | Cosmetic |
| 195 | R3-T1 K05-#21-23 | I | Docker labels, API Dockerfile, Go in compose | Cosmetic (3 items) |

---

## 20. NEW FEATURES DISGUISED AS DEFERRALS (8 items)

| # | Source | Sev | Finding | Blocker |
|---|--------|-----|---------|---------|
| 196 | R3-T1 K03-#31 | I | Expired DM note cleanup cron | New feature |
| 197 | R3-T1 K03-#32 | I | Expired circle invite cleanup cron | New feature |
| 198 | R3-T1 K03-#33 | I | Expired download cleanup cron | New feature |
| 199 | R3-T1 K03-#35 | I | Cron health monitoring endpoint | New feature |
| 200 | R1-[05] F65 | M | Video comment like feature | Needs VideoCommentLike model |
| 201 | R1-[09] F20 | M | Community notes somewhat_helpful logic | Design decision |
| 202 | R1-[05] F47-49 | M | Report FK fields for thread/reel/video | Schema migration |
| 203 | R1-[06] F19 | M | Scheduled message auto-send | Needs cron |

---

## Summary

| Category | Count | Criticals |
|----------|-------|-----------|
| Security (plaintext/secrets) | 12 | 11 |
| Architecture (events/god services) | 16 | 0 |
| Theme migration (XL) | 5 | 0 |
| Queue dead code | 7 | 0 |
| Schema/database | 14 | 1 |
| Payments/financial | 8 | 1 |
| Moderation/safety | 12 | 0 |
| Notifications | 6 | 2 |
| Messaging/real-time | 7 | 0 |
| Auth/privacy | 5 | 0 |
| Search/discovery | 3 | 0 |
| Media pipeline | 5 | 0 |
| Community features | 5 | 0 |
| CI/infrastructure | 20 | 2 |
| Mobile components | 21 | 1 |
| Type safety (as any) | 12 | 0 |
| Pagination/patterns | 12 | 0 |
| UI/UX | 3 | 0 |
| Low priority/cosmetic | 22 | 0 |
| New features | 8 | 0 |
| **TOTAL** | **203** | **18** |

---

## 21. ROUND 4 — Screen Audit Deferrals (Wave 4: D01-D42)

> R4A (6 tabs: D02,D05,D06,D07,D10,D41,D42) + R4B (4 tabs: D03,D04,D08,D09,D13,D14,D16,D34). 10 tab sessions covering 40 screens.

### 21A. Offline / Network Detection (cross-cutting — 14 items)

These all need `@react-native-community/netinfo` integration as a cross-screen infrastructure concern.

| # | Source | Sev | Screen | Finding |
|---|--------|-----|--------|---------|
| 204 | R4A-T1 D41-#30 | I | bakra.tsx | No offline/cached data for reels |
| 205 | R4A-T1 D41-#40 | I | majlis.tsx | No offline/cached data for threads |
| 206 | R4A-T1 D41-#51 | I | minbar.tsx | No offline support for video feed |
| 207 | R4A-T1 D41-#54 | M | cross-tab | Feed caching for bakra/majlis/minbar (saf has feedCache, others don't) |
| 208 | R4A-T1 D42-#24 | I | risalah.tsx | Offline indicator for socket disconnect |
| 209 | R4A-T2 D10-#1 | C | conversation/[id] | Offline messages in React state only — needs AsyncStorage queue |
| 210 | R4A-T2 D10-#60 | I | create-broadcast | No offline resilience for broadcast upload |
| 211 | R4A-T3 D05-#37 | I | broadcast/[id] | No offline detection |
| 212 | R4B-T1 D04-#11 | L | blocked.tsx | Offline detection — cross-screen concern |
| 213 | R4B-T1 D04-#62 | M | boost-post.tsx | Offline guard before payment action |
| 214 | R4B-T1 D04-#80 | M | branded-content.tsx | Offline guard |
| 215 | R4B-T3 D13-#15 | M | creator-storefront | No offline handling |
| 216 | R4B-T3 D13-#32 | M | cross-post | No offline detection |
| 217 | R4B-T4 D09-#24 | M | community-posts | No offline handling |

### 21B. Pagination — Backend API Needed (10 items)

These need backend cursor/pagination endpoints that don't exist yet.

| # | Source | Sev | Screen | Finding |
|---|--------|-----|--------|---------|
| 218 | R4A-T5 D07-#25 | M | chat-folder-view | No pagination on conversations — backend API needed |
| 219 | R4B-T1 D03-#5 | H | audio-library.tsx | Pagination needs backend cursor support |
| 220 | R4B-T1 D04-#27 | L | bookmark-collections | Pagination needs backend cursor support |
| 221 | R4B-T2 D08-#79 | H | communities.tsx | Pagination broken — cursor never passed, major refactor |
| 222 | R4B-T3 D13-#17 | M | creator-storefront | Backend needs sellerId + cursor param |
| 223 | R4B-T3 D13-#21 | M | creator-storefront | Backend sellerId filter doesn't exist yet |
| 224 | R4B-T3 D13-#50 | M | dhikr-challenge-detail | Backend needs paginated contributors endpoint |
| 225 | R4B-T4 D09-#44 | L | contact-sync | Server needs pagination endpoint for contacts |
| 226 | R4B-T2 D08-#30 | M | circles.tsx | No pagination — typically < 20 items |
| 227 | R4B-T2 D08-#60 | M | collab-requests | Pending query not paginated — typically < 20 |

### 21C. Optimistic Updates / Cache Mutation (7 items)

Complex cache key management needed for proper optimistic UI.

| # | Source | Sev | Screen | Finding |
|---|--------|-----|--------|---------|
| 228 | R4A-T1 D41-#25 | M | bakra.tsx | Follow button optimistic update needs cache mutation |
| 229 | R4A-T1 D42-#21 | M | risalah.tsx | Archive optimistic update needs cache key management |
| 230 | R4B-T1 D04-#44 | M | bookmark-folders | Optimistic delete with Promise.all rollback |
| 231 | R4B-T2 D08-#44 | M | close-friends | Per-user optimistic toggle needs per-user mutation tracking |
| 232 | R4B-T2 D08-#45 | L | close-friends | isPending blocks all toggles — needs per-user tracking |
| 233 | R4B-T2 D34-#5 | M | series-detail | Follow optimistic — needs cache mutation |
| 234 | R4B-T2 D34-#16 | M | series-discover | Same — optimistic follow |

### 21D. Architecture / State Management (8 items)

Major refactors or structural changes needed.

| # | Source | Sev | Screen | Finding |
|---|--------|-----|--------|---------|
| 235 | R4A-T1 D41-#56 | L | all tabs | Systemic theme pattern (StyleSheet dark + inline tc override) — tech debt |
| 236 | R4A-T2 D10-#32 | H | conversation-info | 7+ inline flexDirection:'row' need comprehensive RTL pass |
| 237 | R4B-T2 D08-#78 | M | communities.tsx | Manual state instead of useQuery — major refactor |
| 238 | R4B-T2 D08-#82 | L | communities.tsx | State lost on navigation — needs global state |
| 239 | R4B-T2 D08-#88 | L | communities.tsx | Fragile category matching — backend returns English |
| 240 | R4B-T2 D34-#41 | H | share-profile | ScreenErrorBoundary doesn't wrap early returns — structural |
| 241 | R4B-T3 D13-#76 | M | dhikr-counter | Offline/crash counter persistence — needs AsyncStorage queue |
| 242 | R4B-T3 D14-#30 | M | cross-post | TextInput hidden by keyboard — needs layout restructure |

### 21E. Animation / Visual Polish (14 items)

Cosmetic improvements, entrance animations, micro-interactions.

| # | Source | Sev | Screen | Finding |
|---|--------|-----|--------|---------|
| 243 | R4A-T1 D41-#14 | I | saf.tsx | FadeIn on scroll items — needs first-load detection |
| 244 | R4A-T1 D41-#26 | M | bakra.tsx | renderItem 14 dependencies — FlashList handles recycling |
| 245 | R4A-T1 D41-#47 | M | minbar.tsx | listHeader 7 dependencies — semantically correct |
| 246 | R4A-T3 D05-#14 | I | broadcast-channels | FadeInUp re-animation — Reanimated limitation |
| 247 | R4A-T3 D05-#50 | I | call-history | FadeInUp re-animation — same limitation |
| 248 | R4A-T3 D05-#69 | I | call/[id] | Video grid no layout animation — LayoutAnimation conflicts |
| 249 | R4A-T3 D05-#93 | I | camera.tsx | Mode selector no animation — cosmetic |
| 250 | R4A-T6 D02-#18 | L | ai-assistant | Stagger entrance animation — polish |
| 251 | R4A-T6 D02-#51 | L | analytics | Period toggle animation — polish |
| 252 | R4B-T2 D08-#89 | I | communities.tsx | FadeInUp stagger causes layout shifts |
| 253 | R4B-T2 D34-#20 | L | series-discover | FadeInUp stagger jank |
| 254 | R4B-T3 D14-#15 | I | disappearing-settings | No animated selection transition |
| 255 | R4B-T4 D09-#29 | I | community-posts | LongPress no visual feedback — needs Animated scale |
| 256 | R4B-T4 D09-#62 | L | content-filter | Level select micro-interaction — needs Animated |

### 21F. Keyboard / Input Handling (5 items)

| # | Source | Sev | Screen | Finding |
|---|--------|-----|--------|---------|
| 257 | R4A-T6 D02-#75 | M | appeal-moderation | KeyboardAvoidingView — complex platform-specific |
| 258 | R4B-T1 D04-#48 | M | bookmark-folders | BottomSheet keyboard avoidance — library internal |
| 259 | R4B-T2 D34-#28 | M | settings | No KAV for search — search at top, rarely covered |
| 260 | R4B-T3 D13-#58 | M | dhikr-challenges | TextInput in BottomSheet — library handles internally |
| 261 | R4B-T3 D13-#35 | I | cross-post | No scroll-to-input |

### 21G. StatusBar Management (3 items)

| # | Source | Sev | Screen | Finding |
|---|--------|-----|--------|---------|
| 262 | R4A-T1 D42-#22 | L | risalah.tsx | No StatusBar component — root layout manages |
| 263 | R4A-T1 D42-#36 | L | _layout.tsx | StatusBar in tab layout — conflicts with screen-level |
| 264 | R4A-T3 D05-#92 | L | camera.tsx | No offline handling — camera facade |

### 21H. Backend Feature Gaps (6 items)

Screen code is ready but backend endpoint/feature doesn't exist.

| # | Source | Sev | Screen | Finding |
|---|--------|-----|--------|---------|
| 265 | R4B-T1 D04-#30 | I | bookmark-collections | Long-press edit/delete needs collection management API |
| 266 | R4B-T1 D04-#68 | L | boost-post | Post thumbnail preview needs post fetch query |
| 267 | R4B-T3 D13-#6 | L | creator-storefront | Out-of-stock white text on dark overlay — intentional |
| 268 | R4B-T3 D14-#36 | M | disposable-camera | Upload retry needs offline queue infrastructure |
| 269 | R4B-T3 D14-#40 | L | disposable-camera | Backend may not support disposable sticker type |
| 270 | R4A-T6 D02-#82 | L | appeal-moderation | Document upload — placeholder feature |

### 21I. Responsive / iPad (5 items)

| # | Source | Sev | Screen | Finding |
|---|--------|-----|--------|---------|
| 271 | R4B-T1 D04-#50 | I | bookmark-folders | SCREEN_W at module scope — standard RN pattern |
| 272 | R4B-T3 D13-#8 | M | creator-storefront | SCREEN_WIDTH stale on resize — iPad only |
| 273 | R4B-T3 D13-#84 | M | dhikr-counter | COUNTER_SIZE not responsive — iPad |
| 274 | R4B-T3 D14-#22 | M | discover | Stale Dimensions on rotation — iPad |
| 275 | R4B-T4 D16-#25 | M | eid-cards | Card width 47% responsive — needs dynamic calc |

### 21J. Minor / Miscellaneous (19 items)

| # | Source | Sev | Screen | Finding |
|---|--------|-----|--------|---------|
| 276 | R4A-T1 D41-#37 | M | majlis.tsx | Scroll restoration 100ms setTimeout — standard pattern |
| 277 | R4A-T2 D10-#30 | I | conversation/[id] | setTimeout race in emitEncryptedMessage — benign |
| 278 | R4A-T2 D10-#73 | L | create-carousel | Sequential carousel upload — perf optimization |
| 279 | R4A-T5 D07-#13 | L | chat-export | No retry on stats load — needs ScrollView refactor |
| 280 | R4A-T5 D07-#14 | L | chat-export | No offline detection — cross-cutting |
| 281 | R4A-T5 D07-#101 | L | chat-theme-picker | Bottom spacer hardcoded 100px |
| 282 | R4A-T6 D02-#11 | M | ai-assistant | SafeAreaView — GlassHeader handles insets |
| 283 | R4A-T6 D02-#16 | M | ai-assistant | BrandedRefreshControl — generates on demand |
| 284 | R4A-T6 D02-#28 | M | ai-avatar | SafeAreaView — GlassHeader handles insets |
| 285 | R4A-T6 D02-#29 | L | ai-avatar | Double-tap generate — has disabled check |
| 286 | R4A-T6 D02-#30 | L | ai-avatar | Double-tap set-profile — has disabled check |
| 287 | R4A-T6 D02-#31 | M | ai-avatar | Avatar pagination — unlikely many avatars |
| 288 | R4A-T6 D02-#49 | L | analytics | Long-press context menu on charts — enhancement |
| 289 | R4A-T6 D02-#52 | L | analytics | RTL border radius — negligible impact |
| 290 | R4A-T6 D02-#92 | L | archive | FlatList pagination — enhancement |
| 291 | R4A-T6 D02-#95 | L | archive | Animation cap at 15 — acceptable |
| 292 | R4B-T1 D04-#15 | L | blocked | Cross-screen query invalidation — architectural |
| 293 | R4B-T1 D04-#79 | L | branded-content | Cross-screen query invalidation — architectural |
| 294 | R4B-T2 D34-#24 | L | settings | Toggle component hardcoded colors — contrast needed |
| 295 | R4B-T3 D13-#9 | L | creator-storefront | RTL flip on centered avatar — would look wrong |
| 296 | R4B-T3 D13-#16 | L | creator-storefront | No refetch on back — minor staleness |
| 297 | R4B-T3 D13-#49 | L | dhikr-challenge-detail | Leaderboard RTL — centered content |
| 298 | R4B-T4 D09-#40 | M | contact-sync | Navigation debounce — needs shared hook |
| 299 | R4B-T4 D09-#41 | M | contact-sync | Offline indicator — NetInfo cross-cutting |
| 300 | R4B-T4 D09-#77 | M | content-settings | Double-tap multiple BottomSheets — library handles |
| 301 | R4B-T4 D09-#82 | L | content-settings | Toggle animation — needs Animated translateX |
| 302 | R4B-T4 D09-#84 | I | content-settings | Offline handling — NetInfo cross-cutting |
| 303 | R4B-T4 D16-#5 | L | edit-channel | Avatar picker debounce — native modal |
| 304 | R4B-T4 D16-#9 | I | edit-channel | Infinite loading edge case — rare |
| 305 | R4B-T4 D16-#21 | I | edit-profile | Cover height 160px — needs responsive |
| 306 | R4B-T2 D08-#31 | L | circles | No refetchOnFocus — stale data acceptable |
| 307 | R4B-T2 D08-#55 | L | collab-requests | No card-level press — has individual buttons |
| 308 | R4B-T2 D34-#47 | M | share-receive | SafeArea inconsistent edges — platform specific |
| 309 | R4B-T2 D34-#49 | L | share-receive | No input validation — target screen validates |
| 310 | R4B-T2 D34-#51 | L | share-receive | No showToast — no API calls on this screen |

---

## Updated Summary

| Category | R1-R3 Count | R4 Count | Total |
|----------|-------------|----------|-------|
| Security (plaintext/secrets) | 12 | 0 | 12 |
| Architecture (events/god services) | 16 | 8 | 24 |
| Theme migration (XL) | 5 | 1 | 6 |
| Queue dead code | 7 | 0 | 7 |
| Schema/database | 14 | 0 | 14 |
| Payments/financial | 8 | 0 | 8 |
| Moderation/safety | 12 | 0 | 12 |
| Notifications | 6 | 0 | 6 |
| Messaging/real-time | 7 | 0 | 7 |
| Auth/privacy | 5 | 0 | 5 |
| Search/discovery | 3 | 0 | 3 |
| Media pipeline | 5 | 0 | 5 |
| Community features | 5 | 0 | 5 |
| CI/infrastructure | 20 | 0 | 20 |
| Mobile components | 21 | 0 | 21 |
| Type safety (as any) | 12 | 0 | 12 |
| Pagination/patterns | 12 | 10 | 22 |
| UI/UX | 3 | 0 | 3 |
| Low priority/cosmetic | 22 | 19 | 41 |
| New features | 8 | 6 | 14 |
| Offline/network detection | 0 | 14 | 14 |
| Optimistic updates | 0 | 7 | 7 |
| Animation/polish | 0 | 14 | 14 |
| Keyboard/input | 0 | 5 | 5 |
| StatusBar | 0 | 3 | 3 |
| Responsive/iPad | 0 | 5 | 5 |
| **TOTAL** | **203** | **107** | **310** |

---

## 22. WAVE 4 — ALL Screen Audit Deferrals (R4 through R4E, 42 D-files, 189 unique items)

> Full extraction from 22 progress files across 5 rounds. Deduplicated by screen+finding.
> **Detailed breakdown:** `docs/audit/SCREEN_DEFERRALS_EXTRACTED.md`

| Category | Count | Biggest Win |
|----------|-------|-------------|
| Offline/NetInfo | 32 | Build `useNetworkStatus` hook → unblocks all 32 |
| Backend-blocked | 30 | API pagination cursors, missing endpoints, auto-publisher |
| Dimensions/Responsive | 22 | Replace module-scope `Dimensions.get` with `useWindowDimensions` |
| Animation/Polish | 17 | Entrance animations, layout shift, stagger caps |
| Schema/Architecture | 16 | Prisma migrations, god component extraction |
| Other | 15 | Mixed (accessibility, performance, edge cases) |
| Optimistic updates | 14 | Complex rollback on paginated InfiniteQuery data |
| Feature not built | 14 | Green screen, go-live picker, ProgressRing, map views |
| Keyboard | 14 | KAV inside BottomSheet, complex scroll-to-input |
| RTL | 12 | Per-element flexDirection decisions in complex screens |
| StatusBar | 3 | `expo-status-bar` style configuration |
| **TOTAL** | **189** | |

### By severity
| Sev | Count |
|-----|-------|
| C | 4 |
| H | 18 |
| M | 99 |
| L | 51 |
| I | 17 |

---

## 23. WAVE 7 — Testing Gap Deferrals

> Wave 7 complete: 928 new tests, 6,651 total, 345 suites, 0 failures. These are the remaining items that couldn't be unit-tested.

| # | Source | Sev | Scope | Finding |
|---|--------|-----|-------|---------|
| 323 | W7-T5 T14#1-8 | C | Integration | 8 critical TS integration paths — no jest config for `apps/api/test/integration/` |
| 324 | W7-T5 T14#15,32 | C | Go | Store-level SQL tests need real PostgreSQL — mocked handlers only |
| 325 | W7-T5 T14#10 | H | Integration | WebSocket gateway integration — needs real Socket.io server |
| 326 | W7-T5 T14#9 | M | Integration | Existing integration tests use mocked services — not true integration |

---

## Updated Summary (R1 through W7)

| Source | Items |
|--------|-------|
| R1-R3 (API audit) | 203 |
| R4-R4E (screen audit, 42 D-files) | 189 |
| W7 (testing gaps) | 4 |
| **TOTAL** | **396** |

### Screen deferrals by category (189 items — see `SCREEN_DEFERRALS_EXTRACTED.md`)

| Category | Count |
|----------|-------|
| Offline/NetInfo | 32 |
| Backend-blocked | 30 |
| Dimensions/Responsive | 22 |
| Animation/Polish | 17 |
| Schema/Architecture | 16 |
| Other | 15 |
| Optimistic updates | 14 |
| Feature not built | 14 |
| Keyboard | 14 |
| RTL | 12 |
| StatusBar | 3 |

---

## 24. WAVE 10 — Infrastructure Deferrals (K01-K05, 27 items)

> Wave 10 complete: 18 fixed, 85 already fixed, 12 NOT_A_BUG, 27 deferred.

### 24A. Secrets in local .env (6 items — user action required)

| # | Source | Sev | Finding |
|---|--------|-----|---------|
| 397 | K02 #1 | C | Real Neon DB credentials in local `.env` — rotate keys, move to secrets manager |
| 398 | K02 #2 | C | Clerk secret key in local `.env` — same |
| 399 | K02 #3 | C | Stripe secret key in local `.env` — same |
| 400 | K02 #4 | C | AI API keys (Anthropic/OpenAI/Gemini) in local `.env` — same + set spend limits |
| 401 | K02 #5 | C | R2 access keys in local `.env` — same |
| 402 | K02 #6 | C | TOTP encryption key in local `.env` — should be in KMS |

### 24B. Dead queue producers (5 items — need feature pipelines)

| # | Source | Sev | Finding |
|---|--------|-----|---------|
| 403 | K04 #3 | H | Media processor — no producer, needs upload pipeline wiring |
| 404 | K04 #4 | H | bulk-push handler — no producer, needs system announcement feature |
| 405 | K04 #5 | H | track-engagement — no producer AND no storage, needs analytics pipeline |
| 406 | K04 #14 | M | Media worker retry config — moot until #403 wired |
| 407 | K04 #24 | I | 5 dead job type producers — same root cause as #403-405 |

### 24C. CI enhancements (7 items)

| # | Source | Sev | Finding |
|---|--------|-----|---------|
| 408 | K01 #16 | M | Coverage thresholds — needs team agreement on target % |
| 409 | K01 #18 | M | Docker build verification in CI — adds 5+ min per run |
| 410 | K01 #21 | M | exif-stripper CI — separate Cloudflare Worker |
| 411 | K01 #22 | L | Branch protection rules — GitHub UI setting |
| 412 | K01 #23 | L | Flaky test retry — medium effort |
| 413 | K01 #27 | I | Landing page CI — static site |
| 414 | K01 #28 | I | Go linters (golangci-lint) |

### 24D. New feature crons (4 items)

| # | Source | Sev | Finding |
|---|--------|-----|---------|
| 415 | K03 #31 | I | Expired DM note cleanup cron |
| 416 | K03 #32 | I | Expired circle invite cleanup cron |
| 417 | K03 #33 | I | Expired download cleanup cron + orphaned files |
| 418 | K03 #35 | I | Cron health monitoring endpoint (`/health/crons`) |

### 24E. Medium refactors (5 items)

| # | Source | Sev | Finding |
|---|--------|-----|---------|
| 419 | K02 #9 | H | INTERNAL_SERVICE_KEY missing from local .env — user must generate |
| 420 | K02 #11 | H | ConfigModule Joi validation schema — main.ts already validates |
| 421 | K02 #18 | M | Dead TURN credentials in local .env — user must remove |
| 422 | K02 #19 | M | CORS origin duplication — low priority refactor |
| 423 | K02 #26 | I | Mixed process.env vs ConfigService — 8+ file migration |

---

---

## 25. WAVE 11 — Architecture Deferrals (L01-L06, 53 items)

> Wave 11 complete: Agent A (8 fixed, 91 already fixed, 21 deferred), Agent B (17 fixed, 57 already fixed, 18 deferred). Hostile audit caught 14 false claims from Agent A — reclassified below.

### 25A. Agent A Deferrals — God Components & XL Migrations (12 items)

| # | Source | Sev | Finding |
|---|--------|-----|---------|
| 424 | L06 #1 | H | God component: conversation/[id].tsx (3,169 lines) — extract useConversation/useVoiceRecording/useMessageEncryption |
| 425 | L06 #2 | H | God component: video-editor.tsx (2,606 lines) — extract to useReducer/Zustand |
| 426 | L06 #5 | M | conversation/[id].tsx 28× colors.dark.* in module-scope StyleSheet |
| 427 | L06 #8 | M | GifPicker/VoicePlayer extraction from conversation screen |
| 428 | L06 #9 | M | Zustand store split into domain slices (500-line monolith) |
| 429 | L06 #11 | M | Message decryption O(n) loop — needs last-decrypted-index tracking |
| 430 | L06 #12 | M | 643 colors.dark.* across 124 files — XL theme migration |
| 431 | L06 #13 | M | 1,628 colors.text.* across 199 files — XL theme migration |
| 432 | L06 #14 | L | God components: create-story/create-reel/create-post (1,300-1,650 lines each) |
| 433 | L06 #16 | L | Tenor vs GIPHY consolidation — two GIF implementations |
| 434 | L06 #17 | L | Dimensions.get at module scope in 40+ files |
| 435 | L06 #20 | I | Query key factory — touching 200+ files |

### 25B. Agent A Deferrals — Dead Feature Infrastructure (9 items)

| # | Source | Sev | Finding |
|---|--------|-----|---------|
| 436 | L01 #70 | M | Feature flags service: awaiting product decisions |
| 437 | L01 #71 | M | A/B testing service: awaiting experiment definitions |
| 438 | L01 #72 | M | Retention service: needs scheduler wiring |
| 439 | L01 #78 | M | CSAM reporting: needs NCMEC registration (US legal entity) |
| 440 | L01 #79 | M | Terrorism reporting: needs GIFCT membership |
| 441 | L01 #80 | M | AU eSafety reporting: needs commissioner registration |
| 442 | L01 #81 | L | Push locale: needs locale field on User model (schema) |
| 443 | L01 #82 | L | Contact sync hashing: client-side phone hash needed |
| 444 | L01 #83 | M | 2FA login integration: needs Clerk webhook setup |

### 25C. Agent A — Audit-Caught False ALREADY_FIXED (10 type safety casts still in code)

| # | Source | Sev | Finding |
|---|--------|-----|---------|
| 445 | L05 #6 | M | `prisma.service.ts:17` — `(this as any).$on` still present |
| 446 | L05 #12 | M | `socket-io-adapter.ts:34` — double `as unknown as` cast still present |
| 447 | L05 #13 | L | `islamic-notifications.service.ts:45` — `as unknown as Record` still present |
| 448 | L05 #14 | M | `stripe-webhook.controller.ts:126` — generic Record instead of Stripe.Dispute |
| 449 | L05 #15 | M | `search.service.ts:170,581,603` — `limit as unknown as string` (3 occurrences) |
| 450 | L05 #20 | L | `VideoPlayer.tsx:269` — unsafe ref cast still present |
| 451 | L05 #21 | L | `WebSidebar.tsx:72` — web-only hovered cast still present |
| 452 | L05 #22 | L | `usePushNotificationHandler.ts:67` — handler cast still present |
| 453 | L05 #27 | L | `PostCard.tsx:285` — redundant `!` assertion still present |
| 454 | L05 #28 | L | `MusicSticker.tsx:188-189` — redundant `!` assertions (3×) still present |

### 25D. Agent A — Audit-Caught Wrong NOT_A_BUG (4 items)

| # | Source | Sev | Finding |
|---|--------|-----|---------|
| 455 | L05 #23 | M | `commerce.service.ts` — 7 redundant `!` after null guard (TS narrows, `!` unnecessary) |
| 456 | L05 #24 | L | `gifts.service.ts:305` — same redundant `!` |
| 457 | L05 #25 | L | `monetization.service.ts:490` — same redundant `!` |
| 458 | L06 #10 | M | `feedDismissedIds` dead store property — zero consumers, should be removed |

### 25E. Agent B Deferrals — Architecture (18 items)

| # | Source | Sev | Finding |
|---|--------|-----|---------|
| 459 | L02 #10 | H | QueueModule↔NotificationsModule cycle — needs event-driven architecture |
| 460 | L02 #12 | H | NotificationsService 21-service fan-in — needs @nestjs/event-emitter |
| 461 | L02 #14 | H | Zero event-driven architecture — Scale Roadmap Tier 4 |
| 462 | L02 #4-9 | M | 6 queue processor forwardRefs on QueueService — needs DlqService extraction |
| 463 | L02 #11 | M | Transitive cycle through GamificationModule |
| 464 | L02 #18 | M | @Optional masking on NotificationsService |
| 465 | L02 #20 | M | PostsService 8-dep god constructor |
| 466 | L02 #21 | M | ReelsService 9-dep god constructor |
| 467 | L02 #22 | M | ThreadsService 8-dep god constructor |
| 468 | L03 #27 | L | discord-features `{ success: true }` — 4 locations |
| 469 | L03 #28 | L | ~30 services return redundant `{ success: true }` — high churn |
| 470 | L03 #36 | L | 16 controllers with inline DTOs — works, high churn |
| 471-476 | L03 | L | 4 compound-key cursor models can't migrate to ID cursor (broadcast subscribers, circle members, grouped notifications × 2) |

---

## Updated Summary (R1 through W11)

| Source | Items |
|--------|-------|
| R1-R3 (API audit) | 203 |
| R4-R4E (screen audit, 42 D-files) | 189 |
| W7 (testing gaps) | 4 |
| W10 (infrastructure) | 27 |
| W11 (architecture) | 53 |
| **TOTAL** | **476** |

### By severity (combined R1-W11)

| Severity | Count |
|----------|-------|
| CRITICAL | 29 |
| HIGH | 57 |
| MEDIUM | 243 |
| LOW | 101 |
| INFO | 46 |
| **TOTAL** | **476** |
