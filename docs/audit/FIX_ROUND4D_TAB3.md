# YOU ARE TAB 3. YOUR AUDIT FILES ARE D38 + D37. DO NOT TOUCH ANY OTHER FILES. DO NOT SPAWN SUBAGENTS.

# FIX SESSION — Round 4D Tab 3: Video Editor/Premiere/Voice Post/Voice Recorder/Volunteer Board + Theme Settings/Thread/Trending Audio/Verify Encryption/Video Detail (D38 + D37)

> 134 findings across 10 screens. D38 (68): video-editor, premiere, voice-post-create, voice-recorder, volunteer-board. D37 (66): theme-settings, thread/[id], trending-audio, verify-encryption, video/[id].
> **YOUR JOB: Read D38.md + D37.md. Fix the findings in THOSE files. Nothing else.**

---

## RULES — NON-NEGOTIABLE (learned from 20 previous agent sessions)

### RULE 0: YOU ARE BEING AUDITED
A hostile auditor will grep every file you touched, count every status row, verify every "FIXED" claim, and cross-check your accounting equation. Previous agents: invented "REMAINING" (63 hidden items), inflated FIXED by 26, fabricated reference counts, deferred 47%. The best agent self-audited its own inflation and corrected it. Be that agent.

### RULE 1: TOTAL ACCOUNTING
`FIXED + DEFERRED + ALREADY_FIXED + NOT_A_BUG = TOTAL`. D38=68, D37=66. All 134 documented. No "REMAINING." No silent skips.

### RULE 2: DEFERRAL CAP — 15% (max 20)
Specific technical blockers only. "Low priority" / "polish" / "enhancement" / "edge case" are NOT valid. If fixable in under 5 minutes, fix it.

### RULE 3: FIX ALL SEVERITIES
Low = 30 seconds. Info = 10 seconds. Fix them ALL. The cap applies across ALL severities.

### RULE 4: "FIXED" = CODE CHANGED. Not a TODO. Not "works fine."

### RULE 5: "NOT_A_BUG" REQUIRES 1-SENTENCE EVIDENCE
GOOD: "White on emerald gradient is correct contrast." BAD: "Acceptable." The auditor reclassified 7 lazy NOT_A_BUGs last round.

### RULE 6: TESTS — minimum 20 meaningful tests
Renders without crash, correct theme tokens, no hardcoded English, cleanup fires, error handler works, double-tap guard prevents re-fire.

### RULE 7: READ BEFORE EDIT — Read tool first, understand context.

### RULE 8: PATTERN COMPLETION — fix same pattern across ALL 10 screens. Auditor greps independently.

### RULE 9: CHECKPOINT = TSC + COMMIT after every 2-3 screens. Format: `fix(mobile): R4D-T3 CP[N] — [screens] [summary]`

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
   - `radius.*` from theme not hardcoded
   - `formatCount()` for numbers

2. Read `~/.claude/projects/C--dev-mizanly/memory/MEMORY.md` and every file it references

3. Read BOTH audit files IN FULL:
   - `docs/audit/v2/wave4/D38.md` (68 findings — video-editor, premiere, voice-post-create, voice-recorder, volunteer-board)
   - `docs/audit/v2/wave4/D37.md` (66 findings — theme-settings, thread/[id], trending-audio, verify-encryption, video/[id])

4. Create: `docs/audit/v2/fixes/R4D_TAB3_PROGRESS.md`

---

## YOUR SCOPE — 10 screens

```
apps/mobile/app/(screens)/video-editor.tsx          (2606 lines)
apps/mobile/app/(screens)/premiere.tsx
apps/mobile/app/(screens)/voice-post-create.tsx
apps/mobile/app/(screens)/voice-recorder.tsx
apps/mobile/app/(screens)/volunteer-board.tsx
apps/mobile/app/(screens)/theme-settings.tsx
apps/mobile/app/(screens)/thread/[id].tsx
apps/mobile/app/(screens)/trending-audio.tsx
apps/mobile/app/(screens)/verify-encryption.tsx
apps/mobile/app/(screens)/video/[id].tsx
```

**FORBIDDEN:** Backend API, schema.prisma, signal/, shared components, hooks.

**SPECIAL NOTES — read carefully:**

- **`video-editor.tsx` (2606 lines)** — This is the god component of the entire app. It was built in Session 3 with 10 tool tabs, 35 edit fields, and FFmpeg engine integration. DO NOT refactor its structure (that's an L06 architecture deferral worth a multi-session effort). Fix ONLY the specific screen-level findings: theme colors, RTL, error handling, cleanup. There are likely many timers and listeners that need cleanup returns.

- **`verify-encryption.tsx`** — E2E encryption verification screen showing safety numbers and emoji verification. SECURITY-SENSITIVE. Ensure:
  - No key material in error messages or logs
  - No fingerprint/safety number data in Sentry breadcrumbs
  - Error messages are generic ("Verification failed" not "Key mismatch at position 3")
  - The screen correctly imports from signal/ but you don't modify signal/ files

- **`thread/[id].tsx` and `video/[id].tsx`** — High-traffic content detail screens. Every thread tap and video tap lands here. Loading/error/empty states must be production-grade. Both need thorough theme-aware styling since they render user content.

- **`voice-recorder.tsx`** — Audio recording screen. CRITICAL CLEANUP: microphone recording sessions MUST be stopped and released on unmount. An orphaned recording session will keep the microphone active, drain battery, and show the iOS/Android recording indicator even after leaving the screen.

- **`premiere.tsx`** — Has countdown timer for scheduled premieres. Interval cleanup on unmount is mandatory. Also verify that the countdown doesn't tick into negative numbers.

- **`voice-post-create.tsx`** — Voice note creation. Same audio cleanup concerns as voice-recorder. Plus: the recorded audio file URI should be cleaned up if the user cancels.

- **`trending-audio.tsx`** — Audio playback screen. Audio.Sound instances MUST be unloaded on unmount (`sound.unloadAsync()`). Multiple sounds playing simultaneously is a common bug if previous sound isn't stopped before playing a new one.

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
// WRONG: <Text>No posts</Text> / Alert.alert('Delete', 'Sure?')
// RIGHT: <Text>{t('screen.noPosts')}</Text> / Alert.alert(t('common.delete'), t('common.confirmDelete'))
// Add keys to ALL 8 files. Use Node JSON parse/write — NEVER sed.
```

### RTL support
```typescript
// WRONG: marginLeft: 8, left: 0, flexDirection: 'row'
// RIGHT: marginStart: 8, start: 0, flexDirection: rtlFlexRow(isRTL)
```

### Cleanup on unmount — timers, listeners, AND audio
```typescript
useEffect(() => {
  const timer = setTimeout(() => { ... }, 1000);
  const sub = AppState.addEventListener('change', handler);
  return () => { clearTimeout(timer); sub.remove(); };
}, []);

// Audio-specific (critical for voice-recorder, trending-audio):
useEffect(() => {
  return () => {
    if (soundRef.current) soundRef.current.unloadAsync().catch(() => {});
    if (recordingRef.current) recordingRef.current.stopAndUnloadAsync().catch(() => {});
  };
}, []);
```

### Haptic feedback
```typescript
const haptic = useContextualHaptic();
haptic.tick();     // selections, toggles
haptic.success();  // completed actions
haptic.error();    // failed operations
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
// Mutations: disabled={mutation.isPending}
```

### Press feedback
```typescript
style={({ pressed }) => [styles.item, pressed && { opacity: 0.7 }]}
android_ripple={{ color: 'rgba(255,255,255,0.1)' }}
```

### Magic numbers → tokens
```typescript
gap: spacing.xs, paddingBottom: spacing['2xl'], fontSize: fontSize.sm, fontFamily: fonts.bodySemiBold
```

---

## FIX ORDER

1. **Criticals** (crashes, resource leaks, security in verify-encryption)
2. **Highs** (broken features, invisible text, missing cleanup)
3. **Mediums** (theme, error handling, RTL, haptic)
4. **Lows** (press feedback, spacing, cosmetic)
5. **Infos** (dead imports, dead code, suggestions)

---

## TEST COMMANDS
```bash
cd apps/mobile && npx tsc --noEmit
cd apps/mobile && npx jest --config src/hooks/__tests__/jest.config.js
```

---

## DELIVERABLES

- **134/134 findings documented** with per-screen tables
- **Max 20 deferred** with specific technical blockers
- **20+ meaningful tests**
- **All 10 screens:** theme-aware, RTL-ready, i18n complete, haptic wired, all audio/timer/listener resources cleaned on unmount
- **verify-encryption:** no key material in error messages
- **voice-recorder/voice-post-create:** microphone released on unmount
- **trending-audio:** Sound instances unloaded on unmount
- **Progress file** with self-audit confirmation
- **3-4 atomic commits**

**134 findings. 134 documented. Every Low fixed. Every Info addressed. Self-audit your counts. Begin.**
