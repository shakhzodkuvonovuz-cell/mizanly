# Wave 13 Verification — Prisma Schema

**Agents:** 2 (S01-S02) | **Files:** 2 | **Empty:** 0

| Agent | Bytes | Scope |
|-------|-------|-------|
| S01 | 19,608 | Lines 1-2500 (~40 models) |
| S02 | 23,229 | Lines 2501-5037 (~100 models) |

## Key Criticals
- S01: Conversation lockCode plaintext, CallSession e2eeKey plaintext
- S02: TwoFactorSecret migration gap, Webhook token/secret plaintext, backupCodes unsalted SHA-256
