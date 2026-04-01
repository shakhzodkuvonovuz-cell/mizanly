# FIX SESSION — Round 3 Tab 4 Part 2: Schema Lazy Deferrals

> A hostile auditor reviewed R3-Tab4 and found **~18 lazy deferrals** — 13 String→Enum conversions using the exact same pattern already done 20 times, 3 @relation additions using a pattern already done once, and 2 dead models that should be deleted. This session finishes the job.

---

## CONTEXT: WHAT HAPPENED

R3-Tab4 was the best of the four tabs — 92 FIXED, 22 DEFERRED, 16% deferral rate. All fixes verified: 17 enums, 20 column conversions, 28 updatedAt fields, safe migration. Good work.

But the agent did 20 String→Enum conversions and stopped. 13 more use the identical pattern. The agent did 1 @relation fix and stopped. 3 more use the identical pattern. The agent added updatedAt to VolunteerOpportunity then deferred it as "no service" — contradictory.

**Your job: finish the remaining 18 items using patterns already established in this session.**

---

## RULE: ZERO NEW DEFERRALS

Every item below gets:
- **FIXED** — schema changed, migration generated, tsc passes
- **DISPUTED** — with evidence the auditor is wrong

"DEFERRED" is not available. "Low priority" is not a status.

---

## CRITICAL SCHEMA RULES

1. **NEVER rename existing fields** — CLAUDE.md: "Prisma schema field names are FINAL"
2. **NEVER run `prisma db push --accept-data-loss`**
3. **Group related changes into minimal migrations** — don't create 18 individual migrations
4. **All new columns need defaults** for existing rows
5. **Enum conversions need safe USING clauses** — the agent already established the pattern:
```sql
CREATE TYPE "NewEnum" AS ENUM ('VALUE1', 'VALUE2', ...);
ALTER TABLE "table" ALTER COLUMN "field" TYPE "NewEnum" USING "field"::"NewEnum";
```
6. **Test after every migration:** `npx prisma validate && npx prisma generate && npx tsc --noEmit`

---

## STEP 0 — MANDATORY BOOTSTRAP

1. Read `CLAUDE.md`
2. Read `~/.claude/projects/C--dev-mizanly/memory/MEMORY.md` and every file it references
3. Read `docs/audit/v2/fixes/R3_TAB4_PROGRESS.md`
4. Read `apps/api/prisma/schema.prisma` — skim for the existing enum patterns from the prior session
5. Read `apps/api/prisma/migrations/0004_schema_audit_r3/migration.sql` — understand the established pattern
6. Read this entire prompt before writing any code

---

## SECTION 1: STRING→ENUM CONVERSIONS (13 items)

The agent already did 20 of these. You're doing 13 more with the exact same pattern.

**For each item below:**
1. Read the model in schema.prisma
2. Grep the codebase for what values are actually written to this field
3. Create the enum with those values (+ a fallback `OTHER` if the set could grow)
4. Change the field type from `String` to the new enum
5. Add the ALTER COLUMN with USING clause to the migration

### Grep template for finding values:
```bash
grep -rn "fieldName:" apps/api/src/ --include="*.ts" | grep -v spec | grep -v node_modules | head -20
```

### 1A: FeedDismissal.contentType (S01-#32)

```bash
grep -rn "contentType" apps/api/src/modules/feed/ --include="*.ts" | grep -v spec | head -10
```

Expected values: likely `POST`, `REEL`, `THREAD`, `VIDEO`, `STORY` — the content types in the app. Create enum `ContentType` (or `FeedContentType` if `ContentType` already exists).

### 1B: StoryStickerResponse.stickerType (S01-#34)

```bash
grep -rn "stickerType" apps/api/src/modules/stories/ --include="*.ts" | grep -v spec | head -10
```

Expected values: `POLL`, `QUIZ`, `QUESTION`, `COUNTDOWN`, `SLIDER`, `ADD_YOURS`, etc. — matches the story sticker system.

### 1C: User.creatorCategory (S01-#44)

```bash
grep -rn "creatorCategory" apps/api/src/ --include="*.ts" | grep -v spec | head -10
```

If this is genuinely open-ended (user types their own category), mark DISPUTED with evidence. If it's a fixed set (e.g., "artist", "educator", "scholar", "influencer"), create the enum.

### 1D: QuranReadingPlan.planType (S02-#27)

```bash
grep -rn "planType" apps/api/src/modules/islamic/ --include="*.ts" | grep -v spec | head -10
```

### 1E: SavedMessage.mediaType (S02-#28)

```bash
grep -rn "mediaType.*SavedMessage\|SavedMessage.*mediaType" apps/api/src/ --include="*.ts" | grep -v spec | head -10
```

### 1F: GeneratedSticker.style (S02-#47)

```bash
grep -rn "style.*GeneratedSticker\|GeneratedSticker.*style" apps/api/src/ --include="*.ts" | grep -v spec | head -10
```

### 1G: MembershipTier.level (S02-#48)

Expected: `BASIC`, `PRO`, `PREMIUM` or similar tiered set.

### 1H: EndScreen.position (S02-#49)

Expected: `TOP_LEFT`, `TOP_RIGHT`, `BOTTOM_LEFT`, `BOTTOM_RIGHT`, `CENTER` or similar.

### 1I: ViewerDemographic.source (S02-#51)

Expected: `ORGANIC`, `SEARCH`, `RECOMMENDATION`, `SHARE`, `EXTERNAL` or similar.

### 1J: ViewerDemographic.ageRange (S02-#52)

Expected: `UNDER_18`, `18_24`, `25_34`, `35_44`, `45_54`, `55_PLUS` or similar.

### 1K: ViewerDemographic.gender (S02-#52)

Expected: `MALE`, `FEMALE`, `OTHER`, `PREFER_NOT_TO_SAY` or similar.

### 1L: XPHistory.reason (S02-#55)

```bash
grep -rn "reason.*XP\|XP.*reason\|xpHistory.*create" apps/api/src/ --include="*.ts" | grep -v spec | head -20
```

Expected: `POST_CREATED`, `REEL_CREATED`, `COMMENT`, `LIKE_RECEIVED`, `DAILY_LOGIN`, `STREAK_BONUS`, etc.

### 1M: GiftRecord.contentType (S02-#56)

Same as FeedDismissal — likely `POST`, `REEL`, `THREAD`, `VIDEO`. May reuse the same enum from 1A.

**IMPORTANT:** Before creating duplicate enums, check if an existing enum covers the same values. Reuse where possible (e.g., `ContentType` for both FeedDismissal and GiftRecord).

**For any field where grep reveals genuinely open-ended user-input values:** mark as DISPUTED with the grep output as evidence. But most of these will be finite sets.

---

## SECTION 2: DEAD MODEL CLEANUP (2-4 items)

### 2A: Verify dead models have zero service references

```bash
for model in LocalBoard SharedCollection UserReputation VolunteerOpportunity; do
  echo "=== $model ==="
  grep -rn "$model" apps/api/src/ --include="*.ts" | grep -v spec | grep -v schema.prisma | grep -v migration | grep -v node_modules | wc -l
done
```

**For models with ZERO references:**
- Do NOT delete from schema (that would require a DROP TABLE migration which is destructive)
- Instead: add a `@deprecated` comment above the model:
```prisma
/// @deprecated Dead model — no service references. Remove in next major migration.
model LocalBoard {
```
- Mark as FIXED with note: "marked @deprecated, zero service references"

**For models with references:** mark as DISPUTED with the reference count.

### 2B: VolunteerOpportunity contradiction

The agent added updatedAt to VolunteerOpportunity (S02-#41, FIXED) then deferred it as "no service" (S02-#14). Resolve this:
- If the model IS used somewhere → the deferral was wrong, mark S02-#14 as DISPUTED
- If the model is NOT used → the updatedAt addition was wasted effort, but harmless. Mark S02-#14 as FIXED (deprecated annotation)

---

## SECTION 3: @RELATION ADDITIONS (3 items)

The agent already did this once for StickerPack.ownerId (S01-#31). Apply the same pattern:

### 3A: AudioTrack userId FK (R2-A16-#2)

Read the AudioTrack model. If `userId` exists but has no `@relation`:
```prisma
model AudioTrack {
  userId    String
  user      User     @relation(fields: [userId], references: [id])
  // ...
}
```

Also add the reverse relation to User model:
```prisma
model User {
  audioTracks  AudioTrack[]
  // ...
}
```

**CHECK:** Does User already have an `audioTracks` relation? If yes, this is already done.

### 3B: FatwaQuestion.answeredBy (R2-FatwaQuestion)

Read the FatwaQuestion model. If `answeredById` (or `answeredBy`) is a String field without @relation:
```prisma
model FatwaQuestion {
  answeredById  String?
  answeredBy    User?    @relation("FatwaAnswers", fields: [answeredById], references: [id])
  // ...
}
```

Add reverse relation to User:
```prisma
model User {
  fatwaAnswers  FatwaQuestion[]  @relation("FatwaAnswers")
  // ...
}
```

**Named relation** is needed because User likely already has another relation to FatwaQuestion (as the asker).

### 3C: BroadcastChannel owner (R2-BroadcastChannel)

Read the BroadcastChannel model. If there's no owner/creator field:
- Check if `createdById` or `userId` exists. If yes, add @relation.
- If no ownership field exists at all: add `createdById String` + `@relation` + reverse relation on User.

**NOTE:** Adding a new required field to an existing model needs a default or nullable. Use `String?` (nullable) for the migration, then backfill.

---

## SECTION 4: REMAINING R1/R2 DEFERRALS (if time permits)

Check these multi-round deferrals. Fix what's schema-only, acknowledge what needs code:

### 4A: R2-B09-#14 — Channel userId onDelete orphan

Read the Channel model. Check the `onDelete` behavior for the User relation. If it's `Cascade` (deleting user deletes their channels), consider if `SetNull` is safer.

### 4B: B11-#7 — Report @@unique for duplicates

Read the Report model. A report should be unique per (reporterId, targetType, targetId). Check:
```bash
grep -B5 -A20 "model Report " apps/api/prisma/schema.prisma | head -30
```

If the fields exist, add:
```prisma
@@unique([userId, reportedPostId], name: "unique_report_post")
@@unique([userId, reportedReelId], name: "unique_report_reel")
// etc. for each report target type
```

This prevents the same user from filing duplicate reports on the same content. If the field structure doesn't support this cleanly, mark as DISPUTED with schema evidence.

---

## MIGRATION STRATEGY

**One migration for ALL changes:**
```bash
cd apps/api && npx prisma migrate dev --create-only --name schema_audit_r3_part2
```

Then review the generated SQL before applying. Check:
- No DROP TABLE or DROP COLUMN
- All enum conversions use USING clause
- All new columns have defaults
- @deprecated comments don't affect migration (they're schema-only)

---

## CHECKPOINT PROTOCOL

**CP1:** Section 1 (all 13 enum conversions) — generate migration, review SQL, validate
```bash
cd apps/api && npx prisma validate && npx prisma generate && npx tsc --noEmit
```

**CP2:** Sections 2-3 (dead models + relations) — amend migration or create new one
```bash
cd apps/api && npx prisma validate && npx prisma generate && npx tsc --noEmit
cd apps/api && pnpm test  # Verify no regressions
```

**CP3:** Section 4 (remaining R1/R2 deferrals) + update progress file + commit
```bash
cd apps/api && pnpm test && npx tsc --noEmit
```

---

## SERVICE CODE UPDATES

When you convert a String field to an enum, service code that writes to that field may break. For each conversion:

1. After `prisma generate`, run `npx tsc --noEmit`
2. Fix any type errors by importing the new enum from `@prisma/client`
3. Use the same pattern the agent established:
```typescript
import { NewEnum } from '@prisma/client';
// Use NewEnum.VALUE instead of 'VALUE'
```

Do NOT use `as any`. Use the proper Prisma enum import.

---

## PROGRESS FILE UPDATE

Update `docs/audit/v2/fixes/R3_TAB4_PROGRESS.md`:

1. Change each fixed item's status from DEFERRED → **FIXED P2**
2. Update the summary table:
```markdown
| Category | Count | Status |
|----------|-------|--------|
| String→Enum conversions | 33 (was 20) | FIXED |
| @relation added | 4 (was 1) | FIXED |
| Dead models deprecated | 2-4 | FIXED |
| ...existing rows unchanged... |
| Security (plaintext secrets) | 6 | DEFERRED — needs app-level encryption |
| Other deferred | [reduced count] | DEFERRED |

FIXED: [new total] | DEFERRED: [reduced] | DISPUTED: [N] | INFO: 21 = 138 total
```

---

## WHAT SUCCESS LOOKS LIKE

- 13 String→Enum conversions complete (33 total across both sessions)
- 2-4 dead models marked @deprecated
- 3 @relation additions wired correctly (both sides)
- Migration SQL reviewed and safe (no DROP TABLE/COLUMN)
- `prisma validate` passes
- `prisma generate` passes
- `tsc --noEmit` passes
- `pnpm test` passes with 0 regressions
- Progress file updated with accurate counts
- DEFERRED count reduced from 22 to ~6 (only genuinely blocked items remain)

**18 items. Same patterns the agent already proved it could do. Finish the job. Begin.**
