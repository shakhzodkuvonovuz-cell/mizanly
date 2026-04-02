# YOU ARE TAB 4. YOUR AUDIT FILES ARE D31 + D24. DO NOT TOUCH ANY OTHER FILES. DO NOT SPAWN SUBAGENTS.

# FIX SESSION — Round 4D Tab 4: Reports Detail/Restricted/Revenue/Safety Center/Save to Playlist + Morning Briefing/Mosque Finder/Muted/Mutual Followers/My Reports (D31 + D24)

> 130 findings across 10 screens. D31 (67): reports/[id], restricted, revenue, safety-center, save-to-playlist. D24 (63): morning-briefing, mosque-finder, muted, mutual-followers, my-reports.
> **YOUR JOB: Read D31.md + D24.md. Fix the findings in THOSE files. Nothing else.**

---

## RULES — NON-NEGOTIABLE (learned from 20 previous agent sessions)

### RULE 0: YOU ARE BEING AUDITED
A hostile auditor will grep every file you touched, count every status row, verify every "FIXED" claim, and cross-check your accounting equation. Previous agents: invented "REMAINING" (63 hidden items), inflated FIXED by 26, fabricated reference counts, deferred 47%. The best agent self-audited its own inflation and corrected it. Be that agent.

### RULE 1: TOTAL ACCOUNTING
`FIXED + DEFERRED + ALREADY_FIXED + NOT_A_BUG = TOTAL`. D31=67, D24=63. All 130 documented. No "REMAINING." No silent skips.

### RULE 2: DEFERRAL CAP — 15% (max 19)
Specific technical blockers only. "Low priority" / "polish" / "enhancement" / "edge case" are NOT valid. If fixable in under 5 minutes, fix it.

### RULE 3: FIX ALL SEVERITIES
Low = 30 seconds. Info = 10 seconds. Fix them ALL. The cap applies across ALL severities.

### RULE 4: "FIXED" = CODE CHANGED. Not a TODO. Not "works fine."

### RULE 5: "NOT_A_BUG" REQUIRES 1-SENTENCE EVIDENCE
GOOD: "White on emerald gradient is correct contrast." BAD: "Acceptable." The auditor reclassified 7 lazy NOT_A_BUGs last round.

### RULE 6: TESTS — minimum 20 meaningful tests

### RULE 7: READ BEFORE EDIT — Read tool first, understand context.

### RULE 8: PATTERN COMPLETION — fix same pattern across ALL 10 screens.

### RULE 9: CHECKPOINT = TSC + COMMIT after every 2-3 screens. Format: `fix(mobile): R4D-T4 CP[N] — [screens] [summary]`

### RULE 10: NO SUBAGENTS. NO CO-AUTHORED-BY.

### RULE 11: SELF-AUDIT BEFORE SUBMISSION
Count per-screen rows. Sum. Compare to summary. Fix mismatches. Document: "Self-audit: verified."

---

## STEP 0 — MANDATORY BOOTSTRAP

1. Read `CLAUDE.md` — Mobile Screen Rules:
   - `<Skeleton>` not `<ActivityIndicator>` for loading
   - `<EmptyState>` not bare text for empty/error
   - `<BottomSheet>` not `<Modal>`
   - `showToast()` not `Alert.alert` for non-destructive
   - `<BrandedRefreshControl>` not raw `<RefreshControl>`
   - `<ProgressiveImage>` not raw `<Image>` for content
   - `useContextualHaptic()` not `useHaptic()`
   - `useThemeColors()` → `tc.*` not `colors.dark.*`
   - `radius.*` not hardcoded borderRadius
   - `formatCount()` for numbers

2. Read `~/.claude/projects/C--dev-mizanly/memory/MEMORY.md` and every file it references — especially feedback files

3. Read BOTH audit files IN FULL:
   - `docs/audit/v2/wave4/D31.md` (67 findings — reports/[id], restricted, revenue, safety-center, save-to-playlist)
   - `docs/audit/v2/wave4/D24.md` (63 findings — morning-briefing, mosque-finder, muted, mutual-followers, my-reports)

4. Create: `docs/audit/v2/fixes/R4D_TAB4_PROGRESS.md`

---

## YOUR SCOPE — 10 screens

```
apps/mobile/app/(screens)/reports/[id].tsx          (323 lines)
apps/mobile/app/(screens)/restricted.tsx            (257 lines)
apps/mobile/app/(screens)/revenue.tsx               (546 lines)
apps/mobile/app/(screens)/safety-center.tsx         (112 lines)
apps/mobile/app/(screens)/save-to-playlist.tsx      (344 lines)
apps/mobile/app/(screens)/morning-briefing.tsx
apps/mobile/app/(screens)/mosque-finder.tsx
apps/mobile/app/(screens)/muted.tsx
apps/mobile/app/(screens)/mutual-followers.tsx
apps/mobile/app/(screens)/my-reports.tsx
```

**FORBIDDEN:** Backend API, schema.prisma, signal/, shared components, hooks.

**SPECIAL NOTES — read carefully:**

- **D31 audit notes: "Light mode broken on 4 of 5 screens."** Only `safety-center.tsx` correctly uses theme tokens. The other 4 (reports/[id], restricted, revenue, save-to-playlist) use `colors.text.*` or `colors.dark.*` in StyleSheet instead of `tc.text.*`. This is a systematic fix — after fixing one screen, grep the pattern across all 4.

- **`safety-center.tsx` (112 lines)** — Smallest screen in this batch. Should be the quickest fix. The audit praises it as the only screen that "gets it right" — use it as a reference for how the other D31 screens should look.

- **`revenue.tsx` (546 lines)** — Shows financial data (earnings, payouts, analytics). Ensure:
  - No PII or exact amounts in error messages
  - Proper number formatting via `formatCount()` or Intl.NumberFormat
  - Charts/graphs have loading skeletons
  - Pull-to-refresh for data staleness

- **`mosque-finder.tsx`** — May use location services or maps. Handle:
  - Location permission denial gracefully (EmptyState with "Enable Location" action)
  - Network errors on search (show retry)
  - Empty search results (EmptyState, not blank screen)
  - If using `expo-location`: ensure it's properly imported (type declarations may be needed)

- **`morning-briefing.tsx`** — Contains Islamic content (daily verse, prayer times, Islamic date). Data is curated by the user personally per CLAUDE.md. NEVER AI-generate Quran verses, hadith, or prayer content. Only fix UI/UX issues.

- **`reports/[id].tsx` and `my-reports.tsx`** — Moderation screens. Ensure:
  - Report status is displayed clearly with proper colors (pending=gold, resolved=emerald, rejected=error)
  - Action feedback (appeal, follow-up) has proper toasts
  - No sensitive content (reported message text) leaks into error messages

- **`restricted.tsx` and `muted.tsx`** — User management lists. Similar patterns to `blocked.tsx` (fixed in R4B). Use the same fix patterns: theme-aware list items, unblock/unmute with haptic + toast, error handling on mutations.

- **`mutual-followers.tsx`** — Social list screen. Ensure block/mute filtering is respected in the list, navigation to profiles has double-tap guard.

---

## COMMON FIX PATTERNS — apply to EVERY screen

### Theme-aware colors
```typescript
// Remove from StyleSheet, apply inline:
const tc = useThemeColors();
style={[styles.container, { backgroundColor: tc.bg }]}
style={[styles.text, { color: tc.text.primary }]}
```

### Loading / Error / Empty states
```typescript
if (isLoading) return <Skeleton.PostCard />;
if (isError) return <EmptyState icon="alert-circle" title={t('common.error')} action={{ label: t('common.retry'), onPress: refetch }} />;
if (!data?.length) return <EmptyState icon="inbox" title={t('screen.noItems')} />;
```

### Loading / Error / Empty states
```typescript
if (isLoading) return <Skeleton.PostCard />;
if (isError) return (
  <EmptyState icon="alert-circle" title={t('common.error')}
    action={{ label: t('common.retry'), onPress: refetch }} />
);
if (!data?.length) return <EmptyState icon="inbox" title={t('screen.noItems')} />;
```

### i18n — ALL 8 languages (en, ar, tr, ur, bn, fr, id, ms)
```typescript
// WRONG: <Text>No items</Text> / Alert.alert('Delete', 'Sure?')
// RIGHT: <Text>{t('screen.noItems')}</Text> / Alert.alert(t('common.delete'), t('common.confirmDelete'))
// Add keys to ALL 8 files. Node JSON parse/write — NEVER sed.
```

### RTL support
```typescript
// WRONG: marginLeft: 8, left: 0, flexDirection: 'row'
// RIGHT: marginStart: 8, start: 0, flexDirection: rtlFlexRow(isRTL)
```

### Cleanup on unmount
```typescript
useEffect(() => {
  const timer = setTimeout(() => { ... }, 1000);
  const sub = AppState.addEventListener('change', handler);
  return () => { clearTimeout(timer); sub.remove(); };
}, []);
```

### Haptic feedback
```typescript
const haptic = useContextualHaptic();
haptic.tick();     // selections, toggles
haptic.success();  // completed actions
haptic.error();    // failures
haptic.delete();   // before destructive confirmations
```

### Mutation error handling
```typescript
onSuccess: () => { haptic.success(); showToast({ message: t('screen.success'), variant: 'success' }); },
onError: () => { haptic.error(); showToast({ message: t('common.somethingWentWrong'), variant: 'error' }); },
```

### Double-tap prevention
```typescript
// Navigation: isNavigatingRef with 500ms cooldown
const isNavigatingRef = useRef(false);
const handlePress = useCallback(() => {
  if (isNavigatingRef.current) return;
  isNavigatingRef.current = true;
  router.push('/target');
  setTimeout(() => { isNavigatingRef.current = false; }, 500);
}, []);

// Mutations: disabled={mutation.isPending}
```

### Press feedback
```typescript
<Pressable
  style={({ pressed }) => [styles.item, pressed && { opacity: 0.7 }]}
  android_ripple={{ color: 'rgba(255,255,255,0.1)' }}
>
```

### Magic numbers → tokens
```typescript
// WRONG: gap: 2, paddingBottom: 40, fontSize: 14, fontWeight: '600'
// RIGHT: gap: spacing.xs, paddingBottom: spacing['2xl'], fontSize: fontSize.sm, fontFamily: fonts.bodySemiBold
```

---

## FIX ORDER

1. **Criticals** (crashes, financial data exposure)
2. **Highs** (light mode broken on 4 screens — D31's #1 finding, broken features)
3. **Mediums** (theme remaining, error handling, RTL, haptic, missing states)
4. **Lows** (press feedback, magic numbers, spacing, cosmetic)
5. **Infos** (dead imports, dead code, suggestions)

Work screen by screen within each severity pass.

---

## TEST COMMANDS
```bash
cd apps/mobile && npx tsc --noEmit
cd apps/mobile && npx jest --config src/hooks/__tests__/jest.config.js
```

---

## DELIVERABLES

- **130/130 findings documented** with per-screen tables
- **Max 19 deferred** with specific technical blockers
- **20+ meaningful tests**
- **All 10 screens:** theme-aware (especially the 4 broken D31 screens), RTL-ready, i18n complete (8 languages), haptic wired, error handling on all mutations, cleanup on all timers/listeners
- **revenue.tsx:** proper financial data display, no PII in errors
- **mosque-finder.tsx:** location permission handling
- **morning-briefing.tsx:** Islamic content UI fixes only
- **Progress file** with per-screen tables, summary, equation, self-audit confirmation
- **3-4 atomic commits**

**130 findings. 130 documented. Every Low fixed. Every Info addressed. Self-audit your counts. Begin.**
