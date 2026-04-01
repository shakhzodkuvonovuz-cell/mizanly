# FIX SESSION — Round 3 Tab 4: Prisma Schema (Wave 13: S01-S02) + All Deferred Schema Changes

> 108 schema findings + ~50 deferred schema changes from Rounds 1-2. This is the dedicated schema session.

---

## ANTI-FAILURE RULES (learned from Round 2 agent failures)

### RULE 0: YOU ARE BEING AUDITED
A hostile auditor will verify every schema change, check that migrations are safe, and confirm no data loss. Previous agents: wrote TODO comments as "FIXED" (caught), inflated counts (caught), silently skipped 50% (caught). Assume every claim is verified.

### RULE 1: TOTAL ACCOUNTING
Every finding listed by ID. FIXED + DEFERRED + DISPUTED = TOTAL. S01 has 42 findings, S02 has 66 findings. All 108 + all deferred items from R1/R2 appear in your progress file.

### RULE 2: NO `prisma db push --accept-data-loss`
NEVER run `prisma db push --accept-data-loss`. ALL changes must be safe migrations that preserve existing data. Use `prisma migrate dev --create-only` to generate migration SQL, review it, then apply.

### RULE 3: "FIXED" = schema changed + migration generated + tsc passes
### RULE 4: Pattern completion — if adding @@index to one model, check all similar models
### RULE 5: No inflated counts
### RULE 6: Deferred needs a reason
### RULE 7: Read the current schema before editing
### RULE 8: Checkpoint = tsc + test + commit after every batch of changes

### RULE 9: FIELD NAMES ARE FINAL
Per CLAUDE.md: "Prisma schema field names are FINAL — never rename." You can ADD fields, ADD indexes, ADD relations, CHANGE types (carefully), but NEVER rename existing fields.

### RULE 10: GROUP RELATED CHANGES
Don't make 50 individual migrations. Group related changes:
- All @@index additions in one migration
- All new fields in one migration
- All @updatedAt additions in one migration
- Each sensitive change (type changes, cascade changes) gets its own migration

---

## STEP 0 — MANDATORY BOOTSTRAP

1. Read `CLAUDE.md` — especially "Prisma schema field names are FINAL"
2. Read `~/.claude/projects/C--dev-mizanly/memory/MEMORY.md` and every file it references
3. Read BOTH schema audit files IN FULL:
   - `docs/audit/v2/wave13/S01.md` (42 findings — schema lines 1-2500)
   - `docs/audit/v2/wave13/S02.md` (66 findings — schema lines 2501-5037)
4. Read ALL deferred schema items from Rounds 1-2:
   - `docs/audit/v2/fixes/TAB1_PROGRESS.md` — search for "schema" in Deferred section
   - `docs/audit/v2/fixes/TAB2_PROGRESS.md` — same
   - `docs/audit/v2/fixes/TAB3_PROGRESS.md` — same
   - `docs/audit/v2/fixes/TAB4_PROGRESS.md` — same
   - `docs/audit/v2/fixes/R2_TAB1_PROGRESS.md` — same
   - `docs/audit/v2/fixes/R2_TAB2_PROGRESS.md` — same
   - `docs/audit/v2/fixes/R2_TAB2_PART2_PROGRESS.md` — same
   - `docs/audit/v2/fixes/R2_TAB3_PROGRESS.md` — same
   - `docs/audit/v2/fixes/R2_TAB4_PROGRESS.md` — same
5. Read `apps/api/prisma/schema.prisma` (the full file — it's ~5000 lines)
6. Create: `docs/audit/v2/fixes/R3_TAB4_PROGRESS.md`

---

## YOUR SCOPE

```
apps/api/prisma/schema.prisma          (THE file)
apps/api/prisma/migrations/            (generated migrations)
```

**FORBIDDEN:**
- Renaming ANY existing field
- Deleting ANY existing model without explicit confirmation
- Running `prisma db push --accept-data-loss`
- Modifying service code (other tabs handle that)

**YOU CAN:**
- Add new fields (with defaults for existing rows)
- Add @@index, @@unique
- Add @updatedAt
- Change field types (String → enum, Int → BigInt) with safe migration
- Add @relation where missing
- Change onDelete behavior
- Add CHECK constraints via raw SQL migration
- Remove redundant indexes

---

## SCHEMA CHANGES BY CATEGORY

### Category 1: Security (HIGHEST PRIORITY)
| Finding | Change | Risk |
|---|---|---|
| S01: Conversation.lockCode plaintext | Add encryption at rest (or document as DEFERRED — needs app-level encryption, not just schema) |
| S01: CallSession.e2eeKey plaintext Bytes | Document — key is wiped on call end, encryption at rest is infra-level |
| S01: TwoFactorSecret.secret legacy plaintext | Backfill migration: encrypt existing secrets |
| S01: TwoFactorSecret.backupCodes unsalted SHA-256 | Migrate to salted HMAC (needs code change coordination) |
| S02: Webhook.secret and Webhook.token plaintext | Document — needs app-level encryption |

### Category 2: Missing Indexes (HIGH PRIORITY — from Wave 9 J02)
Add ALL missing composite indexes identified in J02. Group into one migration:
```prisma
// Examples (read J02.md for the full list of 40):
@@index([isRemoved, visibility, createdAt(sort: Desc)])  // Post feed
@@index([conversationId, isPinned, isDeleted])           // Pinned messages
@@index([userId, scheduledAt])                           // Scheduled content
@@index([status, scheduledAt])                           // Live sessions
@@index([userId, isRead, createdAt(sort: Desc)])         // Notifications
```

### Category 3: Missing @updatedAt (MEDIUM — from S02)
27+ mutable models missing `@updatedAt`. Add in one migration:
```prisma
updatedAt DateTime @updatedAt
```
Models: Tip, PostPromotion, MembershipSubscription, PostCollab, WatchParty, Webhook, WaqfFund, etc.

### Category 4: String fields → Enum (MEDIUM — from S02)
20 fields that should be enums:
- ConversationMember.role, CallParticipant.role, Tip.status, AudioRoom.status, etc.
- Each needs a new enum + safe migration (ALTER COLUMN with USING clause)

### Category 5: Missing isRemoved fields (MEDIUM)
- ThreadReply: needs `isRemoved Boolean @default(false)`
- ReelComment: needs `isRemoved Boolean @default(false)`
- Story: needs `isRemoved Boolean @default(false)`

### Category 6: Redundant indexes (LOW)
6 redundant indexes where @unique already creates an implicit index:
- User.username, User.clerkId, Channel.handle, BroadcastChannel.slug, Hashtag.name, UserInterest.userId

### Category 7: Deferred from Rounds 1-2
Collect ALL deferred schema items from progress files and add them here. Expected ~50 items including:
- AudioTrack userId FK (A16-#2)
- Report @@unique for duplicates (B11-#7)
- ModerationLog @@index on appeal fields (B11-#11)
- Various missing @@index from B01, B02, B03, B05, B07, B08, B10
- CoinBalance onDelete:Cascade (B08-#2)
- FailedJob.jobId nullable (B10-#19)
- WaitlistEntry @@index (B12-#4)
- CommunityNote @@unique (B09-#9)
- CommunityRole @@unique (B09-#10)
- G02-#1: Composite unique index for ON CONFLICT

---

## MIGRATION STRATEGY

### Migration 1: Indexes (safe, no data change)
All @@index and @@unique additions. These are always safe — they only add B-tree indexes.

### Migration 2: New fields (safe with defaults)
All new Boolean fields (@default(false)), @updatedAt fields, new optional String fields.

### Migration 3: isRemoved fields (safe with default)
ThreadReply, ReelComment, Story — add `isRemoved Boolean @default(false)`.

### Migration 4: Enum conversions (requires careful migration)
Each String→enum needs:
```sql
CREATE TYPE "NewEnum" AS ENUM ('VALUE1', 'VALUE2', ...);
ALTER TABLE "table" ALTER COLUMN "field" TYPE "NewEnum" USING "field"::"NewEnum";
```
Test with a single enum first, then batch the rest.

### Migration 5: Redundant index removal (safe)
Remove 6 redundant @@index where @unique exists.

### Migration 6: Security fields (if applicable)
Encryption-at-rest changes. May be DEFERRED if they need app-level encryption.

---

## CRITICAL CHECKS BEFORE EACH MIGRATION

1. Generate migration SQL: `npx prisma migrate dev --create-only --name descriptive_name`
2. Read the generated SQL file
3. Verify NO `DROP` statements unless intentional
4. Verify NO `ALTER COLUMN ... DROP NOT NULL` unless intentional
5. Verify all new columns have defaults (for existing rows)
6. Run: `npx prisma generate` — verify Prisma client regenerates
7. Run: `cd apps/api && npx tsc --noEmit` — verify no type errors
8. Run: `cd apps/api && pnpm test` — verify no test failures
9. Commit the migration

---

## TEST COMMANDS
```bash
cd apps/api && npx prisma generate          # Regenerate client
cd apps/api && npx prisma validate          # Validate schema
cd apps/api && npx tsc --noEmit             # Type check
cd apps/api && pnpm test                    # Run tests
```

---

## DELIVERABLES
- 108 S01/S02 findings + ~50 R1/R2 deferred items = ~158 total documented
- All missing indexes added (40+ from J02)
- All missing @updatedAt added (27+ models)
- isRemoved on ThreadReply, ReelComment, Story
- Redundant indexes removed
- Safe migrations (no data loss, no field renames)
- Security findings documented with clear rationale

**~158 findings. ~158 documented. Every migration reviewed. Zero data loss. Begin.**
