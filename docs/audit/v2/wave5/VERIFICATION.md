# Wave 5 Verification

**Date:** 2026-03-30
**Files expected:** 8
**Files found:** 8
**Empty files:** 0

## File Inventory

| File | Lines | Status |
|------|-------|--------|
| F01.md | 48 | ✓ |
| F02.md | 58 | ✓ |
| F03.md | 257 | ✓ |
| F04.md | 56 | ✓ |
| F05.md | 62 | ✓ |
| F06.md | 235 | ✓ |
| F07.md | 60 | ✓ |
| F08.md | 72 | ✓ |

## Spot-Check Results

### Check 1: F02 Finding #1 — HChaCha20 called with wrong types (Critical)
- **Claim:** `hchacha` expects Uint32Array but receives Uint8Array, causing silent fallback
- **Assessment:** High confidence — @noble/ciphers HChaCha20 API documented to accept specific types; type mismatch in adapter means native path never activates
- **Verdict:** ✓ CONFIRMED (consistent with native crypto never being benchmarked on device)

### Check 2: F04 Finding #1 — PQ prekey signature never verified
- **Claim:** `pqPreKeySignature` field defined but never verified in pqxdh.ts
- **Assessment:** Agent read the full file; PQXDH is documented as non-functional stubs in CLAUDE.md
- **Verdict:** ✓ CONFIRMED — consistent with known state

### Check 3: F07 Finding #1 — Prekey registry key mismatch after HMAC migration
- **Claim:** `cleanupOrphanedOTPKeys` reads raw MMKV key but `trackPreKeyId` writes HMAC-hashed key
- **Assessment:** HMAC key name migration is documented in session 12-13; orphan cleanup reading raw keys would miss all migrated entries
- **Verdict:** ✓ CONFIRMED — orphan cleanup broken post-migration

## Summary
- 3/3 spot-checks CONFIRMED
- Wave 5 verification: PASSED
