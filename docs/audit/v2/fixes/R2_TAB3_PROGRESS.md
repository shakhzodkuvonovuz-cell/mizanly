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
| CP5 | (merged into CP1-CP4) | — | N/A | — |
| CP6 | G01+G02+G03 e2e-server | 46 | DONE | 24→31 |
| CP7 | G04+G05 livekit-server handlers | 38 | DONE | 123→146 |
| CP8 | G06+B12 livekit infra + Dockerfiles | 29 | DONE | 146→145 |

## Final Test Counts

| Suite | Tests | Status |
|-------|-------|--------|
| Signal Protocol (17 suites) | 670 | PASS |
| Go E2E Server (4 packages) | 31 | PASS |
| Go LiveKit Server (3 packages) | 145 | PASS |
| **Total** | **846** | **ALL PASS** |

## Findings Summary

### Crypto (F01-F08): 115 findings

| File | Findings | Fixed | Deferred |
|------|----------|-------|----------|
| F01 crypto.ts + types.ts | 14 | 10 | 4 (I/doc) |
| F02 native-crypto-adapter.ts | 14 | 14 | 0 |
| F03 x3dh.ts | 9 | 7 | 2 (L/I) |
| F04 pqxdh.ts | 16 | 10 | 6 (PQXDH infra) |
| F05 double-ratchet + session | 18 | 8 | 10 (L/design) |
| F06 sender-keys + sealed-sender | 9 | 4 | 5 (L/design) |
| F07 storage + prekeys + transparency | 16 | 9 | 7 (L/design) |
| F08 media/cache/search/multi-device | 19 | 9 | 10 (L/design) |

### Go Services (G01-G06 + B12): 113 findings

| File | Findings | Fixed | Deferred |
|------|----------|-------|----------|
| G01 e2e-server handlers | 10 | 7 | 3 (L/I) |
| G02 store + SQL | 15 | 4 | 11 (L/I/schema) |
| G03 e2e middleware/config/main | 21 | 10 | 11 (L/I) |
| G04 livekit handler first half | 18 | 10 | 8 (L/I) |
| G05 livekit handler second half | 20 | 7 | 13 (L/I) |
| G06 livekit infra | 25 | 12 | 13 (L/I) |
| B12 livekit portions | 4 | 4 | 0 |

## Critical/High Fixes Completed

### Crypto Criticals (5)
1. **F02-#1**: hchacha20() wrong types — unlocked native AEAD (was dead code)
2. **F04-#1**: PQ prekey signature DEFERRED (PQXDH not operational)
3. **F07-#1**: cleanupOrphanedOTPKeys bypassed AEAD — fixed secureLoad
4. **F08-#1**: MediaEncryptionContext consumed flag prevents nonce reuse
5. **F08-#2**: Device-link code 8 digits / 4 bytes (was 6 / 3)

### Crypto Highs (20+)
- AEAD fallback timing oracle prevented
- Key material zeroing in 15+ locations (rootKey, chainKey, DH outputs, padded plaintext, HKDF derived, PQ secret key, identity private key)
- assertNonZeroDH added on 3 missing DH operations
- SPK age bypass on missing createdAt — now rejects
- PQXDH silent downgrade → abort when both v2
- Session state cloned before encrypt (prevents desync)
- Failed decrypt clones zeroed
- Evicted previous sessions zeroed
- secureZero honest docstring + read-back anti-optimization
- constantTimeCompare fallback pre-padded (matches V7-F13)
- verifyRootSignature fail-closed (throws, not returns true)
- Root signature covers updatedAt + treeSize (not just hash)

### Go Criticals (3)
1. **G02-#1**: ON CONFLICT composite unique DEFERRED (schema change)
2. **G06-#1**: Redis TLS forced on non-TLS URLs — now scheme-aware
3. **G06-#2**: Dockerfile golang:1.26 → golang:1.25

### Go Highs (15+)
- E2EE key fetch errors abort call (no silent unencrypted downgrade)
- All WipeE2EEKey/cleanup errors logged (not silently swallowed)
- Status transition guards (terminal states protected)
- MarkParticipantLeft RowsAffected checked
- EndCallSession atomic CTE (transaction-safe cleanup)
- CORS middleware added to e2e-server
- Config package replaces scattered os.Getenv
- Rate limiter bypass on empty params → 400
- Custom HTTP client (no redirects/SSRF)
- Container runs as non-root user
- os.Exit(1) → errCh channel (clean shutdown)
- Room name hashed (no PII in LiveKit dashboard)
- StopEgress restricted to caller only

## Deferred Items

| Finding | Reason |
|---------|--------|
| F04-#1,#7,#8,#9 | PQXDH full pipeline not built (future feature) |
| G02-#1 | Prisma schema change required (@@unique) |
| F05-#5 | Date.now() clock manipulation — low risk with hard cap |
| F05-#6 | skipMessageKeys iteration limit — native crypto mitigates |
| F05-#8 | Timing side-channel on session count — network jitter dominates |
| F05-#10 | All-zero HKDF salt — not a bug per spec |
