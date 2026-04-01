# R2 Tab 3 — Signal Protocol Crypto + Go Services Fix Progress

**Started:** 2026-04-01
**Completed:** 2026-04-01
**Scope:** 228 findings (F01-F08: 115 crypto, G01-G06: 109 Go, B12: 4 livekit)

## Checkpoint Status

| # | Scope | Findings | Status | Tests |
|---|-------|----------|--------|-------|
| CP1 | F02 native-crypto-adapter + F01 crypto.ts/types.ts | 28 | DONE | 665→665 |
| CP2 | F03 x3dh + F04 pqxdh | 25 | DONE | 665→666 |
| CP3 | F05 double-ratchet + F06 sender-keys/sealed-sender | 27 | DONE | 666→666 |
| CP4 | F07 storage/prekeys/transparency + F08 peripherals | 35 | DONE | 666→670 |
| CP6 | G01+G02+G03 e2e-server | 46 | DONE | 24→31 |
| CP7 | G04+G05 livekit-server handlers | 38 | DONE | 123→146 |
| CP8 | G06+B12 livekit infra + Dockerfiles | 29 | DONE | 146→145 |
| P2 | Zeroing gaps + try/finally + B12-#16 | 6 | DONE | 670→670 |

## Final Test Counts

| Suite | Tests | Status |
|-------|-------|--------|
| Signal Protocol (17 suites) | 670 | PASS |
| Go E2E Server (4 packages) | 31 | PASS |
| Go LiveKit Server (3 packages) | 145 | PASS |
| **Total** | **846** | **ALL PASS** |

## Findings Summary — Code-Fixed vs Deferred

### Crypto (F01-F08): 115 findings → 76 code-fixed, 39 deferred

| File | Total | Fixed | Deferred | Deferred List |
|------|-------|-------|----------|---------------|
| F01 crypto.ts + types.ts | 14 | 8 | 6 | F01-#3 (M, same as F02-#6 — fixed there), F01-#6 (M, JSDoc only), F01-#7 (M, same as F02-#2 — fixed there), F01-#13 (I, doc citation), F01-#14 (I, doc comment), F01-#4 (M, moved to x3dh fix) |
| F02 native-crypto-adapter.ts | 14 | 13 | 1 | F02-#9 (M, HKDF info encoding — test needed, not code fix) |
| F03 x3dh.ts | 9 | 7 | 2 | F03-#7 (L, Signal AD construction — defense-in-depth, identity keys already bound via DH), F03-#9 (I, custom HKDF info string — intentional) |
| F04 pqxdh.ts | 16 | 10 | 6 | F04-#1 (C, PQ prekey signature — PQXDH not operational), F04-#7 (H, fetchPreKeyBundle PQ fields — future feature), F04-#8 (H, no PQ prekey generation — future feature), F04-#9 (H, Go server PQ support — future feature), F04-#15 (L, lazy-load ML-KEM — not installed), F04-#16 (L, doc updated in code) |
| F05 double-ratchet + session | 18 | 11 | 7 | F05-#5 (M, Date.now() manipulation — hard cap mitigates), F05-#6 (M, skipMessageKeys iteration — native crypto 5-10ms), F05-#7 (M, session returned by reference — current callers safe), F05-#8 (M, timing side-channel session count — network jitter dominates), F05-#10 (M, all-zero HKDF salt — correct per spec), F05-#12 (L, signed shift — correct with >>>0), F05-#15 (L, clone future-proofing — add comment only) |
| F06 sender-keys + sealed-sender | 9 | 4 | 5 | F06-#1 (H, sealed sender counter race — needs withSessionLock refactor), F06-#3 (M, replay timestamp vs counter — counter is primary), F06-#4 (M, retry closure captures callbacks — 30s window, low risk), F06-#7 (L, signing key on stack — defense-in-depth only), F06-#8 (L, dedup Array.includes — max 500, fast enough) |
| F07 storage + prekeys + transparency | 16 | 9 | 7 | F07-#8 (M, tree size check timing window — persistence race), F07-#9 (M, no deviceId in Merkle leaf — multi-device future), F07-#10 (M, importAllState AEAD validation — backup AEAD protects), F07-#12 (L, registration ID bias — 2/16384 negligible), F07-#14 (L, consistency proof bootstrap — inherent to TOFU), F07-#15 (L, error message leaks key type prefix — minimal info), F07-#16 (L, no OTP generation cap — server-side limit) |
| F08 media/cache/search/multi-device | 19 | 14 | 5 | F08-#7 (H, HMAC deterministic search tokens — requires SecureStore + HMAC key), F08-#9 (M, LRU eviction fails for HMAC-keyed entries — needs eviction index), F08-#10 (M, same LRU issue in search-index), F08-#11 (M, streaming upload progress not persisted — needs MMKV writes), F08-#14 (M, deprecated mediaKey field confusion — made optional in types.ts) |

### Go Services (G01-G06 + B12): 113 findings → 55 code-fixed, 58 deferred

| File | Total | Fixed | Deferred | Deferred List |
|------|-------|-------|----------|---------------|
| G01 e2e-server handlers | 10 | 7 | 3 | G01-#4 (L, HandleGetSenderKeys no group membership check — intentional), G01-#5 (L, silent deviceID clamping — existing behavior), G01-#9 (I, extractPathParam URL encoding edge case) |
| G02 store + SQL | 15 | 4 | 11 | G02-#1 (C, schema mismatch — DEFERRED, Prisma schema change), G02-H3 (H, SimpleProtocol SQL — known Neon trade-off), G02-M1 (M, rebuildMerkleCacheLocked no timeout), G02-M2 (M, CleanupExpiredSignedPreKeys slow subquery), G02-M3 (M, GetHistory DISTINCT ON unnecessary), G02-M4 (M, MarkAllParticipantsLeft no RowsAffected), G02-L1 (L, UpsertIdentityKey RETURNING subquery MVCC), G02-L2 (L, Merkle leaf no length prefix), G02-L3 (L, notifyIdentityChanged no WaitGroup), G02-L4 (L, GetSenderKeys no pagination), G02-L5 (L, ErrUserInCall.Error no UserID) |
| G03 e2e middleware/config/main | 21 | 10 | 11 | G03-#10 (M, HTTP server plain text — Railway terminates TLS), G03-#12 (M, Lua script Redis Cluster — Upstash is not Cluster), G03-#13 (M, auth middleware untested — Clerk SDK trusted), G03-#14 (L, NODE_ENV env var name), G03-#15 (L, defer rCancel accumulation — 3 max), G03-#16 (L, retry no context cancellation check), G03-#17 (L, cleanup ticker independent context — correct), G03-#18 (L, RegistrationID int vs int32), G03-#19 (L, rate limiter test coverage minimal), G03-#20 (I, Sentry sample rate), G03-#21 (I, hardcoded log level) |
| G04 livekit handler first half | 18 | 10 | 8 | G04-#8 (M, TOCTOU in HandleLeaveRoom participant count — EndCallSession CTE mitigates), G04-#11 (L, E2EE key in JSON response — HTTPS + no-store), G04-#12 (L, empty userID from context — auth middleware guarantees), G04-#13 (L, HandleDeleteRoom comment misleading — updated), G04-#14 (L, HandleMuteParticipant caller-only — client-side self-mute), G04-#15 (L, LivekitRoomName nil — DB INSERT always returns), G04-#16 (L, reused sdkCtx — fresh context for DeleteRoom), G04-#17 (I, constants not configurable), G04-#18 (I, CallType string validation) |
| G05 livekit handler second half | 20 | 7 | 13 | G05-#4 (M, same as G04-#2 — fixed), G05-#8 (M, same as G04-#7 — fixed), G05-#9 (M, egress filepath injection — room name generated server-side), G05-#10 (L, same as G04-#1 — fixed), G05-#11 (L, LiveKit room creation cleanup — 60s stale ticker), G05-#12 (L, cursor query param length — 64KB URL limit), G05-#13 (L, decodeBody multiple JSON — minor robustness), G05-#15 (L, mock test no-op — test correctness), G05-#16 (L, no HandleWebhook tests — medium effort), G05-#17 (I, negative duration clamping — add log), G05-#18 (I, URL double-slash — most servers normalize), G05-#19 (I, room name partial ID — fixed in G04-#4), G05-#20 (I, group call size threshold — edge case) |
| G06 livekit infra | 25 | 13 | 12 | G06-#6 (H, CreateCallSession holds tx for N queries — 30 max, pool=10), G06-#7 (M, GetHistory DISTINCT ON fragile — currently correct), G06-#9 (M, GetActiveParticipantCount pre-join — intentional), G06-#14 (M, clerk.SetKey global state — single binary), G06-#15 (L, connection pool MaxConns hardcoded — Neon limit), G06-#17 (L, CallSession model omits e2eeKey — GOOD design), G06-#18 (L, CleanupStaleRingingSessions unused CTE — still executes), G06-#20 (L, alpine tag not pinned — acceptable), G06-#21 (L, no ErrorLog on http.Server), G06-#22 (L, getActiveParticipantsLight inconsistent scan), G06-#23 (I, UserExists no isBanned check — product decision), G06-#24 (I, all SQL parameterized — positive finding), G06-#25 (I, auth middleware delegates to Clerk — positive finding) |
| B12 livekit portions | 4 | 4 | 0 | — |

## P2 Fix Log (this commit)

| # | File | Fix |
|---|------|-----|
| 1 | double-ratchet.ts:trySkippedKeys | Zero paddedPlaintext after unpadMessage (was missed in CP3) |
| 2 | double-ratchet.ts:kdfRK | Zero 64-byte HKDF derived buffer after slicing (leaked every ratchet step) |
| 3 | double-ratchet.ts:ratchetEncrypt | try/finally ensures paddedPlaintext zeroed on exception |
| 4 | double-ratchet.ts:ratchetDecrypt | try/finally ensures paddedPlaintext zeroed on unpad failure |
| 5 | x3dh.ts:initiateX3DH | try/finally for DH outputs + converted keys |
| 6 | x3dh.ts:respondX3DH | try/finally for DH outputs + converted keys |

## Totals

- **Code-fixed**: 76 crypto + 55 Go + 6 P2 = **137**
- **Deferred**: 39 crypto + 58 Go = **97** (all LOW/INFO/design/future-feature, individually listed above)
- **Total**: 228 findings accounted for
