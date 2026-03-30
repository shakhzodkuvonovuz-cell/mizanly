# Audit V2 — Combined Summary (Part 1 + Part 2)

**Date:** 2026-03-30
**Total agents deployed:** 139 (60 Part 1 + 79 Part 2)
**Total files on disk:** 139
**Total findings:** ~4,781 (1,256 Part 1 + ~3,525 Part 2)

## Combined Severity Breakdown

| Part | Waves | Agents | C | H | M | L | I | Total |
|------|-------|--------|---|---|---|---|---|-------|
| Part 1 | 1,2,3,5,6,9 | 60 | 92 | 302 | 398 | 282 | 124 | 1,256 |
| Part 2 | 4,7,8,10,11,12,13 | 79 | 193 | 547 | 1,445 | 1,006 | 334 | 3,525 |
| **Combined** | **13 waves** | **139** | **285** | **849** | **1,843** | **1,288** | **458** | **4,781** |

## By Wave (all 13)

| Wave | Focus | Agents | C | H | M | L | I | Total |
|------|-------|--------|---|---|---|---|---|-------|
| 1 | Backend Security | 16 | 14 | 80 | 114 | 84 | 45 | 353 |
| 2 | Data Integrity | 12 | 14 | 60 | 85 | 59 | 27 | 269 |
| 3 | Cross-Module | 10 | 27 | 53 | 64 | 44 | 25 | 232 |
| 4 | Mobile Screens UX | 42 | 28 | 256 | 812 | 654 | 210 | 1,960 |
| 5 | Crypto & E2E | 8 | 6 | 30 | 40 | 31 | 4 | 115 |
| 6 | Go Services | 6 | 3 | 17 | 35 | 33 | 16 | 109 |
| 7 | Testing Gaps | 14 | 109 | 106 | 210 | 83 | 37 | 545 |
| 8 | i18n & Accessibility | 6 | 17 | 97 | 166 | 53 | 0 | 333 |
| 9 | Performance | 8 | 28 | 62 | 60 | 31 | 7 | 188 |
| 10 | Infrastructure | 5 | 20 | 24 | 44 | 26 | 21 | 135 |
| 11 | Architecture | 6 | 4 | 20 | 80 | 112 | 26 | 242 |
| 12 | Components & Hooks | 4 | 9 | 26 | 90 | 50 | 27 | 202 |
| 13 | Prisma Schema | 2 | 6 | 18 | 43 | 28 | 13 | 108 |

## Top 30 Critical Findings Across Both Parts

### Part 1 Criticals (from PART1_SUMMARY.md)
1. GDPR deletion purge skips Clerk-deleted users (X04)
2. Tip completion has no idempotency — double-credits diamonds (X03)
3. Single-user urgent report auto-hides ANY post — weaponizable censorship (X08)
4. Disappearing message expiry 60x faster than configured (B06)
5. Group admin role check case mismatch — all admin features dead (B06)
6. Story reaction raw SQL wrong column names — crashes (B07)
7. Fire-and-forget tip→receiver mapping — wrong user credited (A09)
8. Dismissed urgent reports don't restore auto-hidden content (A10)
9. Parental controls writes plaintext PIN over scrypt hash (A15)
10. Live session raw SQL uses model name not table name (A16)
11. moderatorId: 'system' FK violation — auto-moderation broken (B11)
12. Fatwa answerId stores text not CUID — FK crash (B09)
13. Subscribe_presence lets any user intercept sealed sender (X02)
14. markRead broadcasts badge increment instead of sync (X05)
15. HChaCha20 wrong types — native AEAD is dead code (F02)

### Part 2 Criticals (from PART2_SUMMARY.md)
16. Parental controls PIN gate cosmetic — data fetched before verify (D26)
17. verify-encryption screen entirely stubbed (D37)
18. saf.tsx FlashList viewability tracking broken (D41)
19. saf.tsx globalThis dwell-time memory leak (D41)
20. Gift shop coins credited before Stripe confirms (D18)
21. Donate records donation before payment confirmed (D15)
22. Send-tip double-tap creates duplicate PaymentIntents (D33)
23. Waqf PaymentIntent created but never confirmed (D39)
24. Reel remix param mismatch — feature 100% broken (D30)
25. Zakat calculator i18n keys don't exist — raw paths shown (D40)
26. Counter reconciliation SQL uses wrong table names (K03)
27. prisma db push --accept-data-loss in production (K05)
28. Signal+LiveKit tests missing from CI (K01)
29. LiveKit API client broken — full URLs prepended with base (C04)
30. Conversation lockCode stored plaintext (S01)

## Unified Systemic Patterns

### Architecture
1. **Zero event-driven architecture** — 80+ modules all use synchronous DI injection, blocking microservice extraction
2. **NotificationsService is a god-dependency** — 21 services inject it with 39 synchronous calls
3. **God screens** — conversation/[id].tsx (3,169 lines), video-editor.tsx (2,606 lines)
4. **Dead code** — ~5,400 lines across 75+ items (services, components, hooks, queue processors)

### Security & Data
5. **Raw SQL table name mismatches** — 8+ services use Prisma model names vs @@map snake_case
6. **Banned/deleted user content leaks** — 30+ getById endpoints missing filters
7. **Edit bypasses moderation** — update() never calls contentSafety on any content type
8. **Missing DTO validation** — 25+ endpoints use bare @Body() strings
9. **Non-atomic multi-step operations** — 20+ services lack $transaction
10. **Plaintext credentials** — lockCode, webhook token/secret, e2eeKey in schema

### Mobile UX
11. **Light mode universally broken** — ~200 screens use hardcoded dark colors
12. **RTL missing** — ~80% of screens use Left/Right instead of Start/End
13. **Payment double-tap** — 4 money screens allow duplicate charges
14. **Facade screens** — 5+ screens have UI but non-functional backends
15. **i18n keys missing** — ~50 screens reference keys that don't exist in JSON

### Testing
16. **8 of 15 common services have ZERO tests**
17. **28+ message service methods untested**
18. **Both Go services have zero store/SQL tests**
19. **Integration tests are misnamed unit tests**
20. **6 of 13 queue processors are dead code** (no producer)

## File Index

### Part 1 (60 files)
- `docs/audit/v2/wave1/A01.md` - `A16.md` (16 files)
- `docs/audit/v2/wave2/B01.md` - `B12.md` (12 files)
- `docs/audit/v2/wave3/X01.md` - `X10.md` (10 files)
- `docs/audit/v2/wave5/F01.md` - `F08.md` (8 files)
- `docs/audit/v2/wave6/G01.md` - `G06.md` (6 files)
- `docs/audit/v2/wave9/J01.md` - `J08.md` (8 files)

### Part 2 (79 files)
- `docs/audit/v2/wave4/D01.md` - `D42.md` (42 files)
- `docs/audit/v2/wave7/T01.md` - `T14.md` (14 files)
- `docs/audit/v2/wave8/I01.md` - `I06.md` (6 files)
- `docs/audit/v2/wave10/K01.md` - `K05.md` (5 files)
- `docs/audit/v2/wave11/L01.md` - `L06.md` (6 files)
- `docs/audit/v2/wave12/C01.md` - `C04.md` (4 files)
- `docs/audit/v2/wave13/S01.md` - `S02.md` (2 files)

---
*139 agents. 13 waves. ~4,781 findings. Every finding at file:line, persisted to disk.*
