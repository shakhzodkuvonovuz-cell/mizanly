# FIX SESSION — Round 4 Tab 1: Tab Screens (D41 + D42)

> 97 findings across the 7 highest-traffic screens in the app: saf (feed), bakra (reels), majlis (threads), minbar (videos), risalah (messages), create, _layout.

---

## RULES — LEARNED FROM 12 PREVIOUS TABS

### RULE 0: YOU ARE BEING AUDITED
A hostile auditor will verify every fix. Previous agents were caught: inventing fake "REMAINING" categories, inflating FIXED counts, fabricating reference counts, and deferring 47% of work. You will be caught.

### RULE 1: TOTAL ACCOUNTING
Every finding listed by ID. `FIXED + DEFERRED + ALREADY_FIXED + NOT_A_BUG = TOTAL`. If D41 has 56 findings, all 56 appear. No "REMAINING" category. No silent skips.

### RULE 2: DEFERRAL CAP — 15%
Maximum 15% of findings can be DEFERRED (~15 items). If you defer more than 15, the session fails. Every deferral needs a specific technical blocker, not "low priority."

### RULE 3: "FIXED" = CODE CHANGED
Not a TODO comment. Not a console.log. Actual code change that addresses the finding.

### RULE 4: TESTS — minimum 15
Screen fixes need at minimum structural verification tests (component renders, no crashes, correct imports).

### RULE 5: READ BEFORE EDIT
For every fix: Read the actual screen file first. Understand context. Don't grep-replace blindly.

### RULE 6: PATTERN COMPLETION
When you fix a pattern (e.g., missing loading state), check ALL screens in your scope for the same pattern.

### RULE 7: CHECKPOINT = TSC + COMMIT
Every checkpoint: `cd apps/mobile && npx tsc --noEmit`, then commit. No batching 50 fixes.

### RULE 8: NO SUBAGENTS FOR CODE
Do everything directly. Subagents produce buggy, shallow work.

### RULE 9: NO CO-AUTHORED-BY
No AI attribution in commits.

---

## STEP 0 — MANDATORY BOOTSTRAP

1. Read `CLAUDE.md` — especially Mobile Screen Rules
2. Read `~/.claude/projects/C--dev-mizanly/memory/MEMORY.md` and every file it references
3. Read BOTH audit files IN FULL:
   - `docs/audit/v2/wave4/D41.md` (56 findings — saf, bakra, majlis, minbar)
   - `docs/audit/v2/wave4/D42.md` (41 findings — risalah, create, _layout)
4. Create: `docs/audit/v2/fixes/R4_TAB1_PROGRESS.md`

---

## YOUR SCOPE

```
apps/mobile/app/(tabs)/saf.tsx
apps/mobile/app/(tabs)/bakra.tsx
apps/mobile/app/(tabs)/majlis.tsx
apps/mobile/app/(tabs)/minbar.tsx
apps/mobile/app/(tabs)/risalah.tsx
apps/mobile/app/(tabs)/create.tsx
apps/mobile/app/(tabs)/_layout.tsx
```

**FORBIDDEN:**
- Backend API code (other tabs)
- `schema.prisma`
- `apps/api/src/`
- Components in `apps/mobile/src/components/` (R3 Tab 3 handled those)
- Signal protocol files

---

## COMMON SCREEN FIX PATTERNS

### Loading states
```typescript
if (isLoading) return <Skeleton.PostCard />;  // NOT ActivityIndicator
```

### Error states
```typescript
if (isError) return <EmptyState icon="alert-circle" title={t('common.error')} action={{ label: t('common.retry'), onPress: refetch }} />;
```

### Empty states
```typescript
if (!data?.length) return <EmptyState icon="inbox" title={t('feed.empty')} subtitle={t('feed.emptySubtitle')} />;
```

### i18n — NO hardcoded English
```typescript
// WRONG: "No posts yet"
// RIGHT: t('feed.noPosts')
// Add keys to ALL 8 language files: en, ar, tr, ur, bn, fr, id, ms
```

### Cleanup on unmount
```typescript
useEffect(() => {
  const timer = setTimeout(...);
  return () => clearTimeout(timer);  // ALWAYS clean up
}, []);
```

### Theme-aware colors
```typescript
const tc = useThemeColors();
// Use tc.text.primary, tc.bg.primary — NOT colors.dark.*
```

---

## FIX ORDER
1. Criticals first (crashes, data loss)
2. Highs (broken features, security)
3. Mediums (UX gaps, missing states)
4. Lows (cosmetic, optimization)
5. Infos (suggestions)

---

## TEST COMMANDS
```bash
cd apps/mobile && npx tsc --noEmit
cd apps/mobile && npx jest --config src/hooks/__tests__/jest.config.js  # If any hook tests
```

---

## DELIVERABLES
- 97/97 findings documented (FIXED/DEFERRED/ALREADY_FIXED/NOT_A_BUG)
- Max 15 deferred (15% cap)
- 15+ new tests
- All 7 tab screens with proper loading/error/empty states
- Zero hardcoded English in these screens
- Progress file with accurate counts

**97 findings. 97 documented. These are the screens every user sees first. Make them flawless. Begin.**
