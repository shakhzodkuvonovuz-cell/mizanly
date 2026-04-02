# FIX SESSION — Round 4B Tab 1: Blocked/Bookmarks/Boost/Branded + Audio/Banned/Biometric/Keywords (D04 + D03)

> 140 findings across 10 screens. D04: blocked, bookmark-collections, bookmark-folders, boost-post, branded-content. D03: audio-library, audio-room, banned, biometric-lock, blocked-keywords.

---

## RULES — NON-NEGOTIABLE (learned from 16 previous agent sessions)

### RULE 0: YOU ARE BEING AUDITED
A hostile auditor will verify every claimed fix at the code level. Previous agents were caught: inventing "REMAINING" categories to hide 63 items, inflating FIXED counts by 26, fabricating reference counts, and deferring 47% of work. The auditor has zero tolerance.

### RULE 1: TOTAL ACCOUNTING — every finding by ID
Your progress file lists every single finding with a status. The equation MUST balance:
```
FIXED + DEFERRED + ALREADY_FIXED + NOT_A_BUG = TOTAL_IN_FILES
```
If D04 has 86 and D03 has 54, you document all 140. No "REMAINING" category. No silent skips.

### RULE 2: DEFERRAL CAP — 15% HARD LIMIT
Maximum 21 items deferred. Every deferral needs a SPECIFIC TECHNICAL BLOCKER — not "low priority", not "polish", not "enhancement." The blocker must name what prevents you from fixing it RIGHT NOW (missing dependency, backend API needed, architectural change required).

### RULE 3: FIX ALL SEVERITIES — Low and Info are NOT optional
Previous agents fixed Criticals and Highs then deferred all Lows. This is unacceptable. A Low-severity hardcoded color takes 30 seconds to fix. An Info-severity dead import takes 10 seconds to delete. Fix them ALL. The deferral cap applies to ALL severities combined — you cannot "save" your deferral budget by skipping Lows.

### RULE 4: "FIXED" = CODE CHANGED
Not a TODO comment. Not a console.log. Not "acceptable as-is." If the status says FIXED, there must be a code diff.

### RULE 5: TESTS — minimum 20
Screen fixes need structural verification tests. For each screen: component renders without crash, correct imports used, no hardcoded English strings in render output. `expect(result).toBeDefined()` alone does not count.

### RULE 6: READ BEFORE EDIT
For every fix: Read the actual screen file FIRST using the Read tool. Understand surrounding code. Don't grep-replace blindly across files.

### RULE 7: PATTERN COMPLETION
When you fix a pattern (e.g., `colors.dark.bg` in StyleSheet), grep your ENTIRE scope for the same pattern and fix ALL instances. The auditor caught agents who fixed 4 of 5 identical bugs in the same file. Fix 5/5 or explain why the 5th is different.

### RULE 8: CHECKPOINT PROTOCOL
After every 2-3 screens: run `cd apps/mobile && npx tsc --noEmit`, then commit with a descriptive message. No batching all 10 screens into one commit.

### RULE 9: NO SUBAGENTS FOR CODE
Do everything directly. Subagents produce buggy, shallow work.

### RULE 10: NO CO-AUTHORED-BY
No AI attribution in commits.

---

## STEP 0 — MANDATORY BOOTSTRAP

1. Read `CLAUDE.md` — especially the Mobile Screen Rules section (components to use, hooks, theme tokens, i18n rules)
2. Read `~/.claude/projects/C--dev-mizanly/memory/MEMORY.md` and every file it references
3. Read BOTH audit files IN FULL — every finding, every line:
   - `docs/audit/v2/wave4/D04.md` (86 findings — blocked, bookmark-collections, bookmark-folders, boost-post, branded-content)
   - `docs/audit/v2/wave4/D03.md` (54 findings — audio-library, audio-room, banned, biometric-lock, blocked-keywords)
4. Create: `docs/audit/v2/fixes/R4B_TAB1_PROGRESS.md`

---

## YOUR SCOPE — 10 screens

```
apps/mobile/app/(screens)/blocked.tsx              (214 lines)
apps/mobile/app/(screens)/bookmark-collections.tsx  (241 lines)
apps/mobile/app/(screens)/bookmark-folders.tsx      (321 lines)
apps/mobile/app/(screens)/boost-post.tsx            (460 lines)
apps/mobile/app/(screens)/branded-content.tsx       (330 lines)
apps/mobile/app/(screens)/audio-library.tsx         (682 lines)
apps/mobile/app/(screens)/audio-room.tsx            (939 lines)
apps/mobile/app/(screens)/banned.tsx                (94 lines)
apps/mobile/app/(screens)/biometric-lock.tsx        (353 lines)
apps/mobile/app/(screens)/blocked-keywords.tsx      (265 lines)
```

**FORBIDDEN:**
- Backend API code (`apps/api/`)
- Prisma schema
- Signal protocol files (`apps/mobile/src/services/signal/`)
- Shared components in `apps/mobile/src/components/` — only fix screen-level code
- Hooks in `apps/mobile/src/hooks/` — only fix screen-level code
- Any screen file NOT listed above

---

## COMMON FIX PATTERNS — apply to EVERY screen

### Theme-aware colors (most common finding)
```typescript
// WRONG — hardcoded dark theme in StyleSheet:
backgroundColor: '#0D1117'    // or colors.dark.bg
color: '#C9D1D9'              // or colors.text.secondary

// RIGHT — remove from StyleSheet, apply inline:
style={[styles.container, { backgroundColor: tc.bg }]}
style={[styles.text, { color: tc.text.primary }]}
```

### Loading / Error / Empty states
```typescript
// Loading:
if (isLoading) return <Skeleton.PostCard />;  // NOT <ActivityIndicator />

// Error:
if (isError) return (
  <EmptyState
    icon="alert-circle"
    title={t('common.error')}
    subtitle={t('common.tryAgain')}
    action={{ label: t('common.retry'), onPress: refetch }}
  />
);

// Empty:
if (!data?.length) return (
  <EmptyState icon="inbox" title={t('screen.empty')} />
);
```

### i18n — NO hardcoded English
```typescript
// WRONG:
<Text>No items found</Text>
Alert.alert('Delete', 'Are you sure?')

// RIGHT:
<Text>{t('screen.noItems')}</Text>
Alert.alert(t('common.delete'), t('common.confirmDelete'))

// Add keys to ALL 8 language files: en, ar, tr, ur, bn, fr, id, ms
// Use Node JSON parse/write for i18n — NEVER sed
```

### RTL support
```typescript
// WRONG:
marginLeft: 8, paddingRight: 12, left: 0, right: 16
flexDirection: 'row'  // (when content order matters)

// RIGHT:
marginStart: 8, paddingEnd: 12, start: 0, end: 16
flexDirection: rtlFlexRow(isRTL)  // import from @/utils/rtl
```

### Cleanup on unmount
```typescript
useEffect(() => {
  const timer = setTimeout(...);
  const sub = AppState.addEventListener(...);
  return () => {
    clearTimeout(timer);
    sub.remove();
  };
}, []);
```

### Haptic feedback
```typescript
const haptic = useContextualHaptic();
// haptic.tick() — selections, toggles
// haptic.success() — completed actions
// haptic.error() — failures
// haptic.delete() — destructive actions (before confirmation dialog)
```

### Error handling on mutations
```typescript
const mutation = useMutation({
  mutationFn: ...,
  onSuccess: () => {
    haptic.success();
    showToast({ message: t('screen.actionSuccess'), variant: 'success' });
    queryClient.invalidateQueries({ queryKey: ['relevant-key'] });
  },
  onError: () => {
    haptic.error();
    showToast({ message: t('common.somethingWentWrong'), variant: 'error' });
  },
});
```

### Double-tap prevention
```typescript
// For navigation:
const isNavigatingRef = useRef(false);
const handlePress = useCallback(() => {
  if (isNavigatingRef.current) return;
  isNavigatingRef.current = true;
  router.push('/target');
  setTimeout(() => { isNavigatingRef.current = false; }, 500);
}, []);

// For mutations: use mutation.isPending
<Pressable disabled={mutation.isPending} onPress={handleAction}>
```

### Press feedback
```typescript
<Pressable
  style={({ pressed }) => [styles.item, pressed && { opacity: 0.7 }]}
  android_ripple={{ color: 'rgba(255,255,255,0.1)' }}
>
```

---

## FIX ORDER

1. **Criticals** in both files first (crashes, data loss, security)
2. **Highs** (broken features, invisible text on light theme)
3. **Mediums** (theme colors, missing error handling, RTL)
4. **Lows** (press feedback, magic numbers, spacing tokens)
5. **Infos** (dead imports, suggestions)

Work screen by screen within each severity pass.

---

## TEST COMMANDS
```bash
cd apps/mobile && npx tsc --noEmit                    # TypeScript check
cd apps/mobile && npx jest --config src/hooks/__tests__/jest.config.js  # Hook tests
```

---

## DELIVERABLES
- 140/140 findings documented (FIXED / DEFERRED / ALREADY_FIXED / NOT_A_BUG)
- Max 21 deferred (15% cap) — with specific technical blockers
- 20+ new tests
- All 10 screens with proper loading/error/empty states
- Zero hardcoded English in render output
- RTL support on all layout-sensitive styles
- Theme-aware colors on all text and backgrounds
- Haptic feedback on all interactive elements
- Error handling on all mutations
- Progress file with per-screen tables and accurate counts

**140 findings. 140 documented. Every Low fixed. Every Info addressed. Begin.**
