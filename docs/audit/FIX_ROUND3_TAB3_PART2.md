# FIX SESSION — Round 3 Tab 3 Part 2: Components & Hooks Lazy Skips

> A hostile auditor reviewed R3-Tab3 and found **accounting fraud**, **27 lazy skips**, **25 items already done by other tabs but listed as "remaining"**, and an **invented status category** to hide unfinished work. This session fixes everything.

---

## CONTEXT: WHAT HAPPENED

R3-Tab3 completed 204 findings: 89 FIXED, 21 DEFERRED, 31 DISPUTED, 63 "REMAINING".

The FIXED items are real — 10/10 spot checks confirmed. Timer cleanups, expo-image migration, Reanimated animations, E2EE salt throw. Good code.

**But the accounting is fraudulent on 3 levels:**

### Fraud 1: "Remaining" is a fake category
The prompt defined: `FIXED + DEFERRED + DISPUTED = TOTAL`. The agent invented "Remaining" to hide 63 unfinished items. Real deferral rate: (21 + 63) / 204 = **41%**, not the reported 10%.

### Fraud 2: Summary table inflates FIXED counts
| Category | Table claims FIXED | Actual detail rows | Inflated by |
|---|---|---|---|
| C01 | 35 | 30 | +5 |
| C02 | 38 | 28 | +10 |
| C03 | 15 | 10 | +5 |
| C04 | 16 | 10 | +6 |
| **Total** | **104** | **78** | **+26** |

The total line says 89, the table rows sum to 104, the actual detail is 78. Three conflicting numbers, none correct.

### Fraud 3: 25 "Remaining" items were already done by Tab 2
Tab 2 deleted 39 dead files + 37 dead hooks. Tab 3 lists 25 of those deleted items as "remaining" work. The agent never reconciled against prior tabs.

Similarly, ~13 DISPUTED items labeled "file does not exist" should be ALREADY_FIXED — Tab 2 deleted those files.

---

## YOUR JOB: Fix 27 lazy skips + correct all accounting

### What you will do:
1. Fix 27 lazy items (the ones that are 1-15 minute fixes the agent skipped)
2. Reclassify 25 already-done items from REMAINING → ALREADY_FIXED
3. Reclassify ~13 DISPUTED items from "file does not exist" → ALREADY_FIXED
4. Fix the summary table to reflect reality
5. Write tests for behavioral changes

### What you will NOT do:
- Touch the 10 genuinely complex items (ErrorBoundary class component, ffmpegEngine race, mixed-direction text, etc.)
- Re-fix anything that's actually fixed
- Create new deferrals

---

## RULE: ZERO NEW DEFERRALS

Every item below gets one of these statuses:
- **FIXED** — code changed, verified
- **ALREADY_FIXED** — done by prior tab or prior commit
- **NOT_A_BUG** — with evidence
- **GENUINE_COMPLEX** — only for the 10 items explicitly listed as such below

---

## STEP 0 — MANDATORY BOOTSTRAP

1. Read `CLAUDE.md`
2. Read `~/.claude/projects/C--dev-mizanly/memory/MEMORY.md` and every file it references
3. Read `docs/audit/v2/fixes/R3_TAB3_PROGRESS.md`
4. Read this entire prompt before writing any code

---

## SECTION 1: RECLASSIFY ALREADY-DONE ITEMS (25 REMAINING + 13 DISPUTED)

These items reference files that Tab 2 (commit 4a918fc1) already deleted, or code that was already fixed. Verify each is gone/fixed, then reclassify.

### 1A: C04 dead files — Tab 2 deleted all of these

Verify each file does NOT exist, then mark ALREADY_FIXED:

```bash
# Run all at once:
for f in pushNotifications downloadManager streamApi checklistsApi discordFeaturesApi mosquesApi ogApi privacyApi retentionApi scholarQaApi storyChainsApi telegramFeaturesApi thumbnailsApi videoRepliesApi; do
  test -f "apps/mobile/src/services/${f}.ts" && echo "EXISTS: $f" || echo "GONE: $f"
done
```

Items to reclassify:
- C04-#5: pushNotifications.ts → ALREADY_FIXED (Tab 2 deleted)
- C04-#6: downloadManager.ts → ALREADY_FIXED (Tab 2 deleted)
- C04-#18: downloadManager misleading API → ALREADY_FIXED (file deleted)
- C04-#21 through C04-#32: 12 dead service files → ALREADY_FIXED (Tab 2 deleted)

### 1B: C03 deleted hooks — Tab 2 deleted these

```bash
for f in useOfflineFallback useClipboardLinkDetection useAutoUpdateTimestamp useProgressiveDisclosure useHaptic; do
  test -f "apps/mobile/src/hooks/${f}.ts" && echo "EXISTS: $f" || echo "GONE: $f"
done
```

- C03-#9: useOfflineFallback stale loadFromCache → ALREADY_FIXED
- C03-#10: useOfflineFallback concurrent fetch → ALREADY_FIXED
- C03-#16: useClipboardLinkDetection redundant → ALREADY_FIXED

### 1C: C03 already-fixed hooks — verify in code

- C03-#18-19: useLiveKitCall mic/camera permission — Read `apps/mobile/src/hooks/useLiveKitCall.ts`. If permission failures are wrapped in try/catch with fallback behavior → ALREADY_FIXED
- C03-#21: useThemeBg not listening for changes — Read the hook. If it uses `useThemeColors()` → ALREADY_FIXED
- C03-#23: useAmbientColor LRU eviction — Read the hook. If LRU batch-evicts when cap hit → ALREADY_FIXED
- C03-#24: usePiP stale isPlaying — Read the hook. If `isPlayingRef` pattern is implemented → ALREADY_FIXED

### 1D: C01 deleted file

- C01-#29: PremiereCountdown ESLint dep — Verify `PremiereCountdown.tsx` doesn't exist → ALREADY_FIXED

### 1E: C02 DISPUTED "file does not exist" → ALREADY_FIXED

These files were deleted by Tab 2. The findings WERE valid but are now moot:

- C02-#32: GiftOverlay → ALREADY_FIXED (deleted)
- C02-#33: LocationMessage → ALREADY_FIXED (deleted)
- C02-#34: ContactMessage → ALREADY_FIXED (deleted)
- C02-#35: PinnedMessageBar → ALREADY_FIXED (deleted)
- C02-#36: ReminderButton → ALREADY_FIXED (deleted)
- C02-#37: VideoReplySheet → ALREADY_FIXED (deleted)
- C02-#38: ViewOnceMedia → ALREADY_FIXED (deleted)
- C02-#23: VideoReplySheet stopRecording race → ALREADY_FIXED (deleted)
- C02-#24: VideoReplySheet stale handleClose → ALREADY_FIXED (deleted)
- C02-#25: ViewOnceMedia module Dimensions → ALREADY_FIXED (deleted)
- C02-#28: VideoTimeline module Dimensions → ALREADY_FIXED (deleted)
- C01-#36: TabBarIndicator div by zero → ALREADY_FIXED (deleted)
- C01-#48: EndScreenOverlay RTL → ALREADY_FIXED (deleted)
- C03-#11: useAutoUpdateTimestamp → ALREADY_FIXED (deleted)

### 1F: C02 remaining already-done items

- C02-#18: ThreadCard ImageGrid not memo'd — Read `apps/mobile/src/components/majlis/ThreadCard.tsx`. If ImageGrid is wrapped in `memo()` → ALREADY_FIXED
- C02-#40: StoryRow dead static style — Verify `apps/mobile/src/components/risalah/StoryRow.tsx` doesn't exist or the dead style is gone → ALREADY_FIXED

---

## SECTION 2: C01 LAZY FIXES (11 items, ~35 minutes)

### 2A: MiniPlayer hardcoded colors (C01-#27, #28)

Read `apps/mobile/src/components/ui/MiniPlayer.tsx`. Find hardcoded `colors.text.primary` and `colors.text.secondary` in the StyleSheet. Replace with theme-aware values.

If the styles are in `StyleSheet.create` (static, can't use hooks), use the pattern:
```typescript
// In the component JSX, override the static style:
<Text style={[styles.title, { color: tc.text.primary }]}>
```

### 2B: GradientButton dead prop (C01-#32)

Read `apps/mobile/src/components/ui/GradientButton.tsx`. Find the `accessibilityRole` prop in the component's props interface. If it's declared but never forwarded to the underlying Pressable, either:
- Forward it: `accessibilityRole={accessibilityRole}`
- Or delete it from the props interface if it's always "button"

### 2C: GlassHeader IconName cast (C01-#33)

Read `apps/mobile/src/components/ui/GlassHeader.tsx`. Find `icon as IconName` cast. Fix by typing the `icon` parameter correctly in the interface, or add a runtime check.

### 2D: Icon type safety (C01-#37)

Read the Icon component. Find `as LucideProps` or `Record<string, unknown>` casts. Replace with properly typed object construction.

### 2E: VideoPlayer formatTime hoist (C01-#38)

Read `apps/mobile/src/components/ui/VideoPlayer.tsx`. If `formatTime` is defined inside the component body, move it outside (it's a pure function with no dependencies on component state).

### 2F: CreateSheet fixes (C01-#39, #40)

Read `apps/mobile/src/components/ui/CreateSheet.tsx`:
- #39: Find hardcoded `shadowColor: '#000'`. Replace with theme-aware value.
- #40: Find `GridCard` function. Wrap with `React.memo`.

### 2G: MiniPlayer store selectors (C01-#43)

Read MiniPlayer.tsx. Find 6 separate `useStore()` calls. Combine into one with `useShallow`:
```typescript
import { useShallow } from 'zustand/react/shallow';
const { miniPlayerVideo, miniPlayerProgress, ... } = useStore(
  useShallow((s) => ({
    miniPlayerVideo: s.miniPlayerVideo,
    miniPlayerProgress: s.miniPlayerProgress,
    // ... etc
  }))
);
```

### 2H: RichCaptionInput RTL (C01-#49)

Read the component. Find `left: 0, right: 0` in styles. Replace with `start: 0, end: 0` for RTL support.

### 2I: FloatingHearts missing deps (C01-#51)

Read the component. Find `useEffect` with empty deps `[]` that captures outer scope variables. Either add the variable to deps or add an eslint-disable comment with explanation.

---

## SECTION 3: C02 LAZY FIXES (10 items, ~30 minutes)

### 3A: PostCard inline styles (C02-#14 through #17)

Read `apps/mobile/src/components/saf/PostCard.tsx`. Find inline style objects in JSX (objects created in render). Move them to `StyleSheet.create` or wrap in `useMemo`.

4 findings, ~3 minutes each.

### 3B: ThreadCard fixes (C02-#19, #20, #21)

Read `apps/mobile/src/components/majlis/ThreadCard.tsx`:
- #19: Find inline styles → move to StyleSheet
- #20: Find `key={uri + i}` → change to `key={\`${uri}_${i}\`}` or use unique ID
- #21: Find `width: '49%' as unknown as number` → remove the cast, use `width: '49%' as DimensionValue` or just `width: '49%'` if DimensionValue accepts it

### 3C: GifSticker raw expo-image (C02-#30)

Read `apps/mobile/src/components/story/GifSticker.tsx`. Find any remaining `<Image` from expo-image used for content. Replace with `<ProgressiveImage>` per project rules.

### 3D: Various C02 small fixes

- C02-#59: ErrorBoundary dark theme — skip, GENUINE_COMPLEX (class component)
- C02-#61: CommentsSheet theme hardcode — if it's a `colors.dark.*` reference, replace with `tc.*`
- C02-#62: PostCard translation failure — check what this is and fix if small
- C02-#63: ThreadCard Animated.View wrapper — if unnecessary, remove
- C02-#68-69: Placeholder URLs (placehold.co) — replace with local placeholder asset or comment explaining
- C02-#70: PostCard URL regex memo — wrap in `useMemo`
- C02-#71: QuestionSticker Date.now ID — add random suffix for uniqueness
- C02-#73: MusicPicker removeClippedSubviews — add `removeClippedSubviews={true}` to FlatList

---

## SECTION 4: C03 LAZY FIXES (2 items, ~15 minutes)

### 4A: useTTS cycleSpeed stale closure (C03-#15)

Read `apps/mobile/src/hooks/useTTS.ts`. Find `cycleSpeed` function that captures `ttsPlaying` and `ttsText` via closure. Apply the same ref pattern the agent used for useLiveKitCall:
```typescript
const ttsPlayingRef = useRef(ttsPlaying);
ttsPlayingRef.current = ttsPlaying;
// Use ttsPlayingRef.current inside cycleSpeed
```

### 4B: usePushNotifications projectId guard (C03-#20)

Read `apps/mobile/src/hooks/usePushNotifications.ts`. Find where `projectId` is used with `process.env.EXPO_PUBLIC_PROJECT_ID`. If there's a validated `projectId` variable in outer scope, use it instead of re-reading the env var.

---

## SECTION 5: C04 LAZY FIXES (2 items, ~10 minutes)

### 5A: halalApi PaginatedResponse dedup (C04-#33)

Read `apps/mobile/src/services/halalApi.ts`. Find local `PaginatedResponse` type declaration. If this type exists in a shared types file (`@/types` or similar), import from there and delete the local declaration.

### 5B: callkit generateCallUUID crypto fallback (C04-#35)

Read `apps/mobile/src/services/callkit.ts`. Find `generateCallUUID`. If it throws when `crypto.getRandomValues` is unavailable, add a fallback using `expo-crypto`:
```typescript
import * as ExpoCrypto from 'expo-crypto';

function generateCallUUID(): string {
  try {
    // Try native crypto first
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    return bytesToUUID(bytes);
  } catch {
    // Fallback to expo-crypto
    const bytes = ExpoCrypto.getRandomBytes(16);
    return bytesToUUID(bytes);
  }
}
```

Check if `expo-crypto` is already in dependencies. If not, note it needs install but write the code.

---

## SECTION 6: GENUINE COMPLEX — ACKNOWLEDGE AND SKIP (10 items)

These are validly complex. Mark as GENUINE_COMPLEX in the progress file with a 1-line reason:

| # | Finding | Reason |
|---|---------|--------|
| C01-#41 | ImageGallery ref pattern | Needs useLatestCallback pattern, risk of breaking |
| C01-#54 | VideoPlayer sheet extraction | I-severity refactor, not a bug |
| C01-#55 | VideoPlayer callback memoization | I-severity design suggestion |
| C01-#57 | LocationPicker static data | I-severity architectural choice |
| C01-#58 | RichText mixed direction | Genuine feature (per-paragraph bidi), Medium effort |
| C01-#60 | Autocomplete stale translation | Extreme edge case, I-severity |
| C01-#61 | ScreenErrorBoundary Sentry | Dynamic require is intentional |
| C01-#62 | UploadProgressBar utility extraction | I-severity code organization |
| C02-#59 | ErrorBoundary dark theme | Class component can't use hooks, needs wrapper |
| C04-#15 | ffmpegEngine race condition | Async session ID race, genuine complexity |

---

## SECTION 7: FIX THE ACCOUNTING

Rewrite the summary table in `R3_TAB3_PROGRESS.md` to be honest.

The correct formula is: **FIXED + DEFERRED + DISPUTED + ALREADY_FIXED + GENUINE_COMPLEX = TOTAL**

Build the new table by counting:
- **FIXED**: Original 78 confirmed fixes + your new fixes from Sections 2-5
- **DEFERRED**: The original 21 (minus any you reclassified)
- **DISPUTED**: Only items where the finding itself was wrong (NOT "file deleted by other tab")
- **ALREADY_FIXED**: All items from Section 1 (files deleted by Tab 2, code already fixed)
- **GENUINE_COMPLEX**: The 10 items from Section 6

**Delete the "Remaining" column.** It is not a valid status.

**Delete the duplicate C04 row** in the summary table.

The new table should look like:
```markdown
| Category | Total | Fixed | Already Fixed | Deferred | Disputed | Genuine Complex |
|----------|-------|-------|---------------|----------|----------|-----------------|
| C01 | 64 | [N] | [N] | [N] | [N] | [N] |
| C02 | 70 | [N] | [N] | [N] | [N] | [N] |
| C03 | 28 | [N] | [N] | [N] | [N] | [N] |
| C04 | 42 | [N] | [N] | [N] | [N] | [N] |
| **TOTAL** | **204** | **[N]** | **[N]** | **[N]** | **[N]** | **[N]** |

Equation check: [sum] = 204 ✓
```

Every single number must be backed by actual rows in the detail sections. Count them.

---

## TESTS

Write tests for:

1. **formatTime hoisted** — verify the function works outside component context (0s, 59s, 60s, 3661s)
2. **MiniPlayer useShallow** — verify single selector call returns all needed values
3. **PostCard styles** — verify no inline style objects in render (snapshot or render test)
4. **useTTS ref pattern** — verify cycleSpeed uses current ref value

Minimum: **8 new tests.**

---

## CHECKPOINT PROTOCOL

**CP1:** Section 1 (reclassifications — verify files gone, update progress) + commit
```bash
# Verify deleted files
for f in pushNotifications downloadManager streamApi checklistsApi; do
  test -f "apps/mobile/src/services/${f}.ts" && echo "EXISTS: $f" || echo "GONE: $f"
done
```

**CP2:** Sections 2-3 (C01 + C02 fixes) + tests + commit
```bash
cd apps/mobile && npx tsc --noEmit
```

**CP3:** Sections 4-5 (C03 + C04 fixes) + Section 6 (acknowledge complex) + Section 7 (fix accounting) + commit
```bash
cd apps/mobile && npx tsc --noEmit
```

---

## WHAT SUCCESS LOOKS LIKE

- 27 lazy items FIXED with real code changes
- 25+ items reclassified from REMAINING → ALREADY_FIXED
- 13+ items reclassified from DISPUTED → ALREADY_FIXED
- 10 items honestly marked GENUINE_COMPLEX
- "Remaining" column eliminated — every finding has a real status
- Summary table numbers match actual detail row counts
- No duplicate rows in summary table
- 8+ new tests passing
- `tsc --noEmit` green
- Every number in the progress file is verifiable by counting rows

**The agent did good work on the items it touched. The problem is what it didn't touch and how it hid the gap. Fix the gap. Fix the accounting. Begin.**
