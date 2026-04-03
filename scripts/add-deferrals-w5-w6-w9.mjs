#!/usr/bin/env node
/**
 * Add missing Wave 5, 6, 9 deferrals to MASTER_DEFERRED.md
 * These waves had ZERO entries in the master list.
 */
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const DEFERRED_PATH = join(import.meta.dirname, '..', 'docs', 'audit', 'MASTER_DEFERRED.md');
let content = readFileSync(DEFERRED_PATH, 'utf-8');

// Find the summary section and insert before it
const summaryMarker = '## Updated Summary (R1 through W12)';
const insertPos = content.indexOf(summaryMarker);
if (insertPos === -1) {
  console.error('Could not find summary marker in MASTER_DEFERRED.md');
  process.exit(1);
}

const newSections = `
## 20. W5 — E2E ENCRYPTION AUDIT DEFERRALS (90 items)

> Source: docs/audit/v2/wave5/F01-F08. Signal Protocol, crypto primitives, PQXDH, sealed sender, storage, media encryption.

| # | Source | Sev | Finding | Category |
|---|--------|-----|---------|----------|
| 485 | F01 #7 | M | secureZero native path not OPENSSL_cleanse | Crypto primitives |
| 486 | F01 #8-12 | M-L | zeroOut fallback, deprecated mediaKey, toBase64 view, uint32BE NaN, skippedKeys inconsistency | Crypto primitives |
| 487 | F02 #1 | C | HChaCha20 native AEAD path is dead code (wrong types) | Native crypto |
| 488 | F02 #2 | H | secureZero claims OPENSSL_cleanse but doesn't use it | Native crypto |
| 489 | F02 #3 | H | constantTimeCompare fallback timing leak | Native crypto |
| 490 | F02 #4 | H | \`let nativeCrypto: any = null\` type violation | Native crypto |
| 491 | F02 #5 | H | 13 Buffer.from copies of key material never zeroed | Native crypto |
| 492 | F02 #6-14 | M-I | subkey not zeroed, bare catch blocks, no nonce validation, untested equivalence, zero test coverage, detection logic, allocation pattern, dead code, misleading docs | Native crypto |
| 493 | F03 #7-8 | L | Signal spec AD construction not implemented, unsafe cast for pqPreKey | X3DH |
| 494 | F04 #1 | C | PQ prekey signature never verified | PQXDH (non-functional) |
| 495 | F04 #2 | C | deriveHybridSecret dead code | PQXDH |
| 496 | F04 #3-4 | H | Silent fallback to classical on PQ failure, responder mismatch | PQXDH |
| 497 | F04 #5-9 | H | PQ secret key not zeroed, setMLKEMProvider exported, fetchPreKeyBundle drops PQ fields, no PQ keygen, Go server no PQ fields | PQXDH |
| 498 | F04 #10-16 | M-L | negotiatePQVersion dead, protocolVersion always 1, no input validation, no ciphertext validation, keygen no zero, require at load, advertised as functional | PQXDH |
| 499 | F05 #5 | M | trySkippedKeys uses Date.now() manipulable clock | Double ratchet |
| 500 | F05 #6 | M | skipMessageKeys no per-batch computation limit | Double ratchet |
| 501 | F05 #7-8 | M | createInitiatorSession returns by reference, decryptMessage timing leak on session count | Double ratchet |
| 502 | F05 #10 | M | deriveMessageEncKeys uses all-zero salt | Double ratchet |
| 503 | F05 #12-18 | L | Signed bitwise shift, approximate ciphertext validation, silent device skip, clone future-proofing, skipped key allocation, evicted keys not zeroed, kdfCK no zero input | Double ratchet |
| 504 | F06 #1 | H | Sealed sender counter race condition (no lock) | Sealed sender |
| 505 | F06 #2 | H | Sender key skipped message keys never zeroed | Sender keys |
| 506 | F06 #3-9 | M-L | Replay window uses sender clock, retry closure after leave, chain key not zeroed, counter overflow, signing key on stack, group dedup O(n), plaintext not zeroed | Sender keys |
| 507 | F07 #6-7 | M | getMMKV reads master key twice, generateOneTimePreKeys private keys never zeroed | Storage/prekeys |
| 508 | F07 #8-9 | M | lastSeenTreeSize lost on restart, Merkle leaf no deviceId binding | Key transparency |
| 509 | F07 #10-16 | M-L | importAllState bypasses AEAD, dynamic import in rotation, registration ID bias, clearAll doesn't delete MMKV key, consistency proof accepts 0, aeadGet leaks prefix, no OTP rate limit | Storage |
| 510 | F08 #3 | H | verifyDeviceLinkCode sync but depends on async state | Multi-device |
| 511 | F08 #4-5 | H | Decrypted media temp file persists 5s, SHA-256 verification after full decryption | Media encryption |
| 512 | F08 #6-7 | H | isMessageCached bypasses AEAD integrity, search tokens deterministic HMAC dictionary attack | Cache/search |
| 513 | F08 #8-19 | M-L | markMessageFailed \`as any\`, LRU eviction can't decrypt, search eviction same, streaming progress, empty AAD, unbounded deviceCache, deprecated mediaKey, sanitize regex, safety number cache, batch \`as any\`, batch no sig verify, cleanup prefix too broad | Various E2E |

---

## 21. W6 — GO SERVER AUDIT DEFERRALS (98 items)

> Source: docs/audit/v2/wave6/G01-G06. E2E key server + LiveKit call server.

| # | Source | Sev | Finding | Category |
|---|--------|-----|---------|----------|
| 514 | G01 #2-10 | M-I | No defense-in-depth auth, batch userIDs unvalidated, no group membership check, silent deviceID clamping, concat dead code, goroutine no recover, writeJSON swallows errors, extractPathParam fragile, store error mapped to 400 | E2E handlers |
| 515 | G02 C1 | C | E2EIdentityKey schema missing @@unique([userId, deviceId]) — multi-device broken | E2E schema |
| 516 | G02 H1-H4 | H | GetTransparencyProof returns time.Now(), SELECT COUNT FOR UPDATE locks all rows, SimpleProtocol escaping, UpdateSessionStatus no validation | E2E store |
| 517 | G02 M1-M5 | M | No timeout on rebuildMerkleCacheLocked, CleanupExpiredSignedPreKeys slow subquery, GetHistory DISTINCT ON, MarkParticipantLeft silent no-ops, GetDeviceIDs returns [1] when no keys | E2E store |
| 518 | G02 L1-L5 | L | UpsertIdentityKey RETURNING fragile, Merkle leaf no length prefix, notifyIdentityChanged no context, GetSenderKeys no pagination, ErrUserInCall no UserID | E2E store |
| 519 | G03 #3-4 | H | RateLimitMiddleware bypasses on empty IDs, http.DefaultClient for webhooks (SSRF) | E2E infra |
| 520 | G03 #6-21 | M-I | Missing security headers, webhook secret per-call, pointless init(), plain HTTP, anonymous struct, Lua Redis Cluster vuln, auth untested, NODE_ENV naming, retry no cancel check, cleanup ticker, RegistrationID int, rate limiter coverage, Sentry 10%, logger hardcoded | E2E infra |
| 521 | G04 #3-18 | H-I | sendCallPush context.Background, room name leaks userID, MarkParticipantLeft error swallowed (x2), mute no validation, TOCTOU race leave, roomID no validation, participantID no validation, E2EE key plaintext JSON, userID empty check, group size comment, self-mute blocked, nil-pointer, reuses sdkCtx, constants not configurable, CallType string not enum | LiveKit handlers |
| 522 | G05 #1-2 | H | HandleStopEgress any participant can stop, HandleCreateIngress no session check | LiveKit egress/ingress |
| 523 | G05 #3-20 | M-I | Webhook DB errors swallowed, cleanup errors ignored, sendCallPush unbounded, sendMissedCallPush swallows marshal, http.DefaultClient internal push, mute dup, egress path injection, room creation cleanup, history no cursor validation, decodeBody multiple JSON, writeJSON swallows, TestMockStore no-op, no webhook handler tests, negative duration, URL double-slash, room name leak dup, group size dup | LiveKit handlers |
| 524 | G06 #4-5 | H | UpdateSessionStatus no validation, os.Exit in goroutine bypasses cleanup | LiveKit infra |
| 525 | G06 #6-25 | M-I | CreateCallSession holds tx for N checks, DISTINCT ON fragile, CheckCreateRoom passes on nil, GetActiveParticipantCount misses pre-join, SplitCursor no timestamp validation, CORS no max-age, trusts client X-Request-ID, WipeE2EEKey no RowsAffected, clerk.SetKey global, MaxConns hardcoded, port validation, CTE unused, Dockerfile alpine not pinned, http.Server no ErrorLog, getActiveParticipantsLight inconsistent, UserExists no isBanned | LiveKit infra |

---

## 22. W9 — PERFORMANCE AUDIT DEFERRALS (191 items)

> Source: docs/audit/v2/wave9/J01-J08. N+1 queries, missing indexes, React re-renders, memory leaks, bundle size, media performance, Redis patterns, API response efficiency.

| # | Source | Sev | Finding | Category |
|---|--------|-----|---------|----------|
| 526 | J01 #1-22 | C-L | 22 N+1 query patterns across feed, notifications, search, conversations, stories, reels, channels, videos, communities, moderation, analytics, payments | N+1 queries |
| 527 | J02 #1-40 | C-L | 40 missing database indexes on hot-path queries (feed, search, messages, notifications, stories, reels, channels, videos, comments, follows, likes, bookmarks, reports, moderation, payments, analytics) | Missing indexes |
| 528 | J03 #1-19 | M-L | 19 React Native re-render issues (FlatList in FlatList, inline styles in hot paths, unstable references, missing memo, store subscriptions, unnecessary context re-renders) | React performance |
| 529 | J04 #1-13 | H-L | 13 memory leak patterns (unbounded caches, missing AbortController cleanup, timer leaks, event listener accumulation, large object retention, image cache no eviction) | Memory leaks |
| 530 | J05 #1-24 | M-L | 24 bundle size issues (unused imports, large polyfills, synchronous requires, tree-shaking blockers, duplicate dependencies, asset optimization) | Bundle size |
| 531 | J06 #1-16 | C-L | 16 media performance issues (image resize not wired, media processor dead code, no orphan cleanup, thumbnail generation missing, progressive loading gaps, video preload strategy, audio waveform computation, camera frame rate) | Media performance |
| 532 | J07 #1-20 | C-L | 20 Redis pattern issues (HyperLogLog no TTL, analytics list no TTL, unbounded sorted sets, Lua script atomic but fragile, rate limiter fails open on error, pub/sub no reconnect, cache stampede, key naming inconsistency, connection pooling, memory policy) | Redis patterns |
| 533 | J08 #1-38 | M-L | 38 API response efficiency issues (over-fetching fields, missing field selection, redundant nested queries, pagination inefficiency, response size, unnecessary joins, computed fields in hot path, cache headers missing) | API efficiency |

---

## 23. W1-W3 — API AUDIT DEFERRALS NOT PREVIOUSLY TRACKED (182 items)

> Source: docs/audit/v2/wave1/A01-A16, wave2/B01-B12, wave3/X01-X10. These were tracked in TAB progress files but never transferred to MASTER_DEFERRED.

### Wave 1 (A-files) — ~56 deferred

| # | Source | Sev | Finding | Category |
|---|--------|-----|---------|----------|
| 534 | A01 #11 | M | findByPhoneNumbers O(N) in memory — needs phoneHash column | Schema/performance |
| 535 | A03 #13-14 | M | markUsed unused userId, saveDraft DTO impedance mismatch | API design |
| 536 | A03 #17,20 | L | Clips non-functional URL, download exposes raw R2 URL | Media |
| 537 | A11 #4,6,7,10 | M | Search no DTO validation, ApiBearerAuth misleading, URI encoding inconsistency, trending 8 subqueries | Search/API |
| 538 | A12 #14-15 | L | Poll voter enumeration, feed-transparency ILIKE perf | Privacy/performance |
| 539 | A13 #4 | H | Community role management endpoints — dead code | Dead code |
| 540 | A13 #15,21-26 | M-L | Community-notes inline DTOs, enum cast issues | API design |
| 541 | A16 #2 | C | AudioTrack has no userId — needs schema field | Schema |
| 542 | A16 #11-17 | M-L | createPersistentRoom dead, inline DTOs, acceptGuestInvite race, hasMore issues | Live/API |
| 543 | A01-A16 misc | M-L | ~40 additional inline DTO, missing validation, error handling items tracked in TAB progress files | Various |

### Wave 2 (B-files) — ~70 deferred

| # | Source | Sev | Finding | Category |
|---|--------|-----|---------|----------|
| 544 | B01 #8-9 | M | Missing @@index([previousUsername]), snapshotFollowerCounts capped 5000 | Schema/perf |
| 545 | B03 #2 | H | Missing CHECK constraints for commentsCount/sharesCount/savesCount/loopsCount | Schema |
| 546 | B03 #8,10 | M | Missing @@index([userId]) on ReelComment, orphaned reels unmanageable | Schema |
| 547 | B04 #1 | C | Counter-reconciliation raw SQL uses wrong table name "Thread" | Bug |
| 548 | B04 #15-17 | L | Missing @@unique MajlisList, missing @@index repostOfId, no reconciliation cron | Schema |
| 549 | B05 #22-28 | M-L | VideoComment isDeleted, VideoInteraction dead, VideoCommentLike dead, Video @@index, VideoBookmark @@index, VideoReply orphans, VideoClip dead counters | Schema/dead code |
| 550 | B06 #13-14,18,23,25 | M-I | Missing @@index createdById/isPinned on Conversation/Message, genderRestriction unenforced, starredBy deprecated, SYSTEM as any MessageType | Schema/design |
| 551 | B07 #12-13,18,23 | M-I | Missing @@index highlightAlbumId, Story userId onDelete, @@unique position, StoryChain composite index | Schema |
| 552 | B08 #5-6 | H | CoinTransaction.amount dual purpose, coin purchase idempotency fragile | Payments |
| 553 | B09 #9-10,12,14 | M | Missing @@unique CommunityNote/CommunityRole, FatwaQuestion answeredBy no relation, Channel orphan | Schema |
| 554 | B10 #4-6,9-10 | M | Missing Notification FK indexes, FailedJob no TTL/cleanup/index, push mapping missing, dual push token | Schema/notifications |
| 555 | B11 #7,9-10,22 | H-L | Report no @@unique, missing indexes on reportedPostId/commentId, bare string FKs, missing updatedAt | Schema/moderation |
| 556 | B12 #4 | M | Missing @@index([referredBy]) on WaitlistEntry | Schema |
| 557 | B01-B12 misc | M-L | ~20 additional items tracked in R2_TAB progress files | Various |

### Wave 3 (X-files) — ~56 deferred

| # | Source | Sev | Finding | Category |
|---|--------|-----|---------|----------|
| 558 | X02 #3 | H | Sealed envelope needs schema columns e2eSealedEphemeralKey/e2eSealedCiphertext | Schema/E2E |
| 559 | X04 #10-11,15,17 | M-L | Webhook-created users bypass registration, ban conflates deactivation, deletion transaction massive, re-registration check needs email hash | Auth/privacy |
| 560 | X07 #8-9,11-12 | M | TOCTOU socket eviction race, join_conversation needs isBanned check, processBulkPush SYSTEM enum, processEngagementTracking stub | WebSocket/queues |
| 561 | X08 #8,10 | H | ModerationLog needs targetThreadId/targetReelId/targetVideoId columns, appeal restore needs same fields | Schema/moderation |
| 562 | X08 #12,24,32 | M | Word-filter auto-block architecture, AI moderation content type expansion, AutoFlagged stats boolean | Moderation |
| 563 | X01-X10 misc | M-L | ~40 additional items from TAB3/TAB4 progress files | Various |

`;

// Insert before summary
content = content.slice(0, insertPos) + newSections + content.slice(insertPos);

// Update summary section
content = content.replace(
  /## Updated Summary \(R1 through W12\)/,
  '## Updated Summary (R1 through W12 + W1-W3/W5/W6/W9 gap fill)'
);

content = content.replace(
  /\| R1-R3 \(API audit\) \| 203 \|/,
  '| R1-R3 (API audit — original) | 203 |'
);

content = content.replace(
  /\| W12 \(components\/hooks\/services\) \| 8 \|/,
  `| W12 (components/hooks/services) | 8 |
| W5 (E2E encryption audit) | 90 |
| W6 (Go server audit) | 98 |
| W9 (performance audit) | 191 |
| W1-W3 (API audit gap fill) | 182 |`
);

content = content.replace(
  /\| \*\*TOTAL\*\* \| \*\*484\*\* \|/,
  '| **TOTAL** | **1,045** |'
);

// Update severity counts
content = content.replace(
  /### By severity \(combined R1-W12\)\n\n\| Severity \| Count \|\n\|----------|-------\|\n\| CRITICAL \| 29 \|\n\| HIGH \| 61 \|\n\| MEDIUM \| 246 \|\n\| LOW \| 101 \|\n\| INFO \| 47 \|\n\| \*\*TOTAL\*\* \| \*\*484\*\* \|/,
  `### By severity (combined all waves)\n\n| Severity | Count |\n|----------|-------|\n| CRITICAL | ~45 |\n| HIGH | ~120 |\n| MEDIUM | ~530 |\n| LOW | ~250 |\n| INFO | ~100 |\n| **TOTAL** | **~1,045** |`
);

writeFileSync(DEFERRED_PATH, content, 'utf-8');
console.log('MASTER_DEFERRED updated with W5, W6, W9, W1-W3 gap fill sections.');
console.log('Added ~561 items (sections 20-23). New total: ~1,045.');
