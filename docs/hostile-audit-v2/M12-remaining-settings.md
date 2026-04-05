# M12 — Remaining Settings Screens (Hostile Audit)

**Date:** 2026-04-05
**Auditor:** Opus 4.6
**Scope:** 10 files under `apps/mobile/app/(screens)/`

| File | Lines |
|------|-------|
| `media-settings.tsx` | 533 |
| `quiet-mode.tsx` | 557 |
| `wind-down.tsx` | 231 |
| `blocked-keywords.tsx` | 287 |
| `storage-management.tsx` | 562 |
| `manage-data.tsx` | 466 |
| `content-filter-settings.tsx` | 429 |
| `status-privacy.tsx` | 458 |
| `disappearing-default.tsx` | 354 |
| `disappearing-settings.tsx` | 373 |

---

## Findings Summary

| Severity | Count |
|----------|-------|
| Critical | 2 |
| High | 8 |
| Medium | 16 |
| Low | 11 |
| Info | 5 |
| **Total** | **42** |

---

## Critical

### C1. `manage-data.tsx` L297-298 — Unhandled `mutateAsync` rejection in delete account flow
```
onPress: async () => {
    await deleteAccountMutation.mutateAsync();
},
```
`mutateAsync` throws on failure. This `await` is inside an `Alert.alert` callback with no try/catch. If the server returns an error, the promise rejection is unhandled. The `onError` callback on the mutation fires, but the uncaught async exception in the alert callback can crash the app on some RN versions.

**File:** `manage-data.tsx` **Lines:** 297-298

### C2. `storage-management.tsx` L59 — Cache category double-counts all other categories
The `cache` category's `dir` is set to the root `cacheDirectory`:
```
{ key: 'cache', labelKey: 'storage.cache', icon: 'layers', dir: cacheDir },
```
But `images/`, `videos/`, `voice/`, `documents/` are subdirectories of `cacheDir`. `getDirectorySize` (line 63-82) iterates children of `cacheDir` which includes those subdirectories. So `sizes.cache` includes bytes from images, videos, voice, and documents. Then `totalUsed` (line 217) sums ALL categories including the already-counted cache, producing a grossly inflated total. A user with 50MB of images sees ~100MB total (50MB counted twice).

**File:** `storage-management.tsx` **Lines:** 59, 217

---

## High

### H1. `media-settings.tsx` L157-164 — Auto-play useEffect missing `t` in dependency array
```
useEffect(() => {
    settingsApi.getAutoPlay().then(res => { ... }).catch((err) => {
      ...
      showToast({ message: t('common.somethingWentWrong'), variant: 'error' });
    });
  }, []);
```
The `t` function is used inside the effect but is not in the dependency array. If the language changes while the component is mounted, the stale `t` closure produces the wrong language string. React Hooks exhaustive-deps lint rule would flag this.

**File:** `media-settings.tsx` **Lines:** 157-164

### H2. `media-settings.tsx` L186-193 — `saveSettings` useCallback missing `t` in dependency array
```
const saveSettings = useCallback(async (updated: MediaSettings) => {
    ...
    showToast({ message: t('common.somethingWentWrong'), variant: 'error' });
    ...
  }, []);
```
Empty dependency array means `t` is captured at mount time and never updated.

**File:** `media-settings.tsx` **Lines:** 186-193

### H3. `media-settings.tsx` L153 — `ambientMode` initialized from store outside React lifecycle
```
const [ambientMode, setAmbientMode] = useState(useStore.getState().ambientModeEnabled);
```
Calling `useStore.getState()` in `useState` initializer is not reactive. If the store value changes between render cycles (e.g., from another screen), this component never knows. Should use `useStore(state => state.ambientModeEnabled)` selector instead.

**File:** `media-settings.tsx` **Line:** 153

### H4. `disappearing-default.tsx` L230-354 — Hardcoded `colors.dark.*` in StyleSheet breaks light theme
The entire `StyleSheet.create` block uses `colors.dark.bg`, `colors.dark.bgCard`, `colors.dark.border`, `colors.dark.borderLight` (lines 233, 267, 270, 306, 321, 325, 328). This component does NOT use `createStyles(tc)` pattern. On a light theme, the background, borders, and cards would all render in dark-mode colors.

Found at lines: 233, 267, 270, 306, 321, 325, 328.

**File:** `disappearing-default.tsx` **Lines:** 230-354

### H5. `disappearing-settings.tsx` L222-373 — Hardcoded `colors.dark.*` in StyleSheet breaks light theme
Same issue as H4. Lines 225, 270, 296, 299, 314, 323 all reference `colors.dark.*`. The JSX (lines 94, 123, 144, etc.) correctly uses `tc.*` via inline styles, so many tokens are overridden at runtime, but `optionBorder` (line 314), `radio` (line 323), and `lockBadge` (line 270) use `colors.dark.*` without runtime override.

**File:** `disappearing-settings.tsx` **Lines:** 225, 270, 296, 299, 314, 323

### H6. `content-filter-settings.tsx` L344-428 — Hardcoded `colors.text.*` in static StyleSheet
Uses `colors.text.secondary` (lines 344, 386), `colors.text.primary` (lines 378, 406), `colors.text.tertiary` (line 423) in the static `StyleSheet.create`. These are dark-mode-only values. The JSX does override some of them with `{ color: tc.text.* }` inline styles, but the `sectionHeader` (line 344), `levelDesc` (line 386), and `infoText` (line 423) use the static style color as-is without inline override in some code paths.

**File:** `content-filter-settings.tsx` **Lines:** 344, 378, 386, 406, 423

### H7. `storage-management.tsx` L63-82 — `getDirectorySize` only reads one level deep
```
const children = await FileSystem.readDirectoryAsync(dirUri);
...
total += childInfo.size ?? 0;
```
If a child is a directory (e.g., `images/thumbnails/`), its `size` property from `getInfoAsync` is typically 0 or just the directory metadata size on most platforms. The function does not recurse into subdirectories. Reported storage sizes will be significantly underreported for any directory with nested subdirs.

**File:** `storage-management.tsx` **Lines:** 63-82

### H8. `quiet-mode.tsx` L88-92 — Mutations dropped silently when `isPending`
```
const save = (updates: ...) => {
    if (mutation.isPending) return;
    mutation.mutate(updates);
  };
```
If the user rapidly toggles schedule on, then picks a start time, the start time mutation is silently dropped because the schedule toggle mutation is still in flight. No feedback is shown. The UI shows the new time but the server never receives it. Should queue mutations or at minimum show a toast that the change was not saved.

**File:** `quiet-mode.tsx` **Lines:** 88-92

---

## Medium

### M1. `media-settings.tsx` L271 — Hardcoded `#FFFFFF` for Switch thumb color
```
thumbColor={settings.dataSaver ? '#FFFFFF' : tc.text.tertiary}
```
Should use a theme token like `colors.text.onColor` or `tc.text.primary` for consistency.

**File:** `media-settings.tsx` **Line:** 271

### M2. `quiet-mode.tsx` L222, L256 — Hardcoded `#fff` for Switch thumb color
```
thumbColor="#fff"
```
Appears twice. Should use a theme token.

**File:** `quiet-mode.tsx` **Lines:** 222, 256

### M3. `blocked-keywords.tsx` L266 — Hardcoded `#FFF` for button text color
```
addBtnText: { color: '#FFF', fontWeight: '700', fontSize: fontSize.sm },
```
Should use `colors.text.onColor` or similar theme token.

**File:** `blocked-keywords.tsx` **Line:** 266

### M4. `media-settings.tsx` L510, L517 — Static `colors.text.tertiary` in StyleSheet
```
ambientHint: { ... color: colors.text.tertiary, ... },
footerText: { ... color: colors.text.tertiary, ... },
```
These colors are set in the static StyleSheet but are overridden by inline styles in JSX (lines 399, 406). Misleading dead style values that would break if the inline override were removed.

**File:** `media-settings.tsx` **Lines:** 510, 517

### M5. `content-filter-settings.tsx` L355, L371, L394, L412 — Hardcoded `rgba` border colors in static StyleSheet
```
borderColor: 'rgba(45,53,72,0.3)',   // lines 355-356, 394-395
backgroundColor: 'rgba(45,53,72,0.4)',  // line 371
backgroundColor: 'rgba(45,53,72,0.5)',  // line 412 separator
```
These are raw RGBA values not from the theme system. Will look wrong on light theme.

**File:** `content-filter-settings.tsx` **Lines:** 355, 371, 394, 412

### M6. `content-filter-settings.tsx` — No RTL support at all
Unlike every other file in this audit, this screen never destructures `isRTL`, never uses `rtlFlexRow()` or `rtlTextAlign()`. All `flexDirection: 'row'` in the level cards, toggle rows, and info row are hardcoded LTR. Arabic/Urdu users will see a broken layout.

**File:** `content-filter-settings.tsx` **Entire file**

### M7. `disappearing-default.tsx` — No RTL support at all
Same as M6. Never uses `isRTL`, `rtlFlexRow()`, or `rtlTextAlign()`. All flex rows and text alignment are LTR-only.

**File:** `disappearing-default.tsx` **Entire file**

### M8. `disappearing-settings.tsx` — No RTL support at all
Same as M6/M7. Never uses `isRTL`, `rtlFlexRow()`, or `rtlTextAlign()`.

**File:** `disappearing-settings.tsx` **Entire file**

### M9. `status-privacy.tsx` — No RTL support at all
Same as M6-M8. Never uses `isRTL`, `rtlFlexRow()`, or `rtlTextAlign()`.

**File:** `status-privacy.tsx` **Entire file**

### M10. `manage-data.tsx` L404, L421, L436, L464 — Raw `fontWeight` instead of `fonts.*` family
```
actionLabel: { ... fontWeight: '500' },
actionButtonText: { ... fontWeight: '600' },
infoLabel: { ... fontWeight: '500' },
link: { ... fontWeight: '600' },
```
Project rule: use `fontFamily: fonts.bodyMedium` / `fonts.bodySemiBold` instead of raw `fontWeight`. These bypass the custom font system and render in the system font.

**File:** `manage-data.tsx` **Lines:** 404, 421, 436, 464

### M11. `wind-down.tsx` L204, L229 — Raw `fontWeight` instead of `fonts.*` family
```
breathText: { ... fontWeight: '600' },
closeBtnText: { ... fontWeight: '500' },
```
Same issue as M10.

**File:** `wind-down.tsx` **Lines:** 204, 229

### M12. `content-filter-settings.tsx` L346, L380, L408 — Raw `fontWeight` instead of `fonts.*` family
```
sectionHeader: { ... fontWeight: '700' },
levelTitle: { ... fontWeight: '600' },
toggleLabel: { ... fontWeight: '500' },
```
Same issue as M10.

**File:** `content-filter-settings.tsx` **Lines:** 346, 380, 408

### M13. `blocked-keywords.tsx` L266 — Raw `fontWeight: '700'`
```
addBtnText: { color: '#FFF', fontWeight: '700', fontSize: fontSize.sm },
```
Should use `fontFamily: fonts.bodyBold`.

**File:** `blocked-keywords.tsx` **Line:** 266

### M14. `disappearing-settings.tsx` L6 — Unused import `FadeInDown`
```
import Animated, { FadeIn, FadeInUp, FadeInDown, ZoomIn } from 'react-native-reanimated';
```
`FadeInDown` is imported but never used anywhere in the file. Dead import.

**File:** `disappearing-settings.tsx` **Line:** 6

### M15. `media-settings.tsx` L356-359 — Auto-play API save is fire-and-forget with no rollback
```
setAutoPlay(option);
settingsApi.updateAutoPlay(option).catch((err) => { ... });
useStore.getState().setAutoPlaySetting(option);
```
If the API call fails, the local state and the store are already set to the new value. The toast shows an error but the UI and store remain in the wrong state. No rollback to previous value.

**File:** `media-settings.tsx` **Lines:** 353-361

### M16. `quiet-mode.tsx` L348-358, L361-372 — 96 items in time picker bottom sheet without virtualization
`TIME_OPTIONS` has 96 entries (24h * 4 quarters). Each is rendered in a `ScrollView`, not a `FlatList`. This means all 96 items mount simultaneously, which is wasteful and can cause jank on low-end devices.

**File:** `quiet-mode.tsx` **Lines:** 348-358, 361-372

---

## Low

### L1. `storage-management.tsx` L190-211 — `categories` not in `loadSizes` dependency array
```
const categories = getCategories();  // line 190 — called every render
const loadSizes = useCallback(async () => {
    ...
    for (const cat of categories) {  // captures current reference
    ...
  }, []);
```
`categories` is created fresh every render but `loadSizes` captures the first instance due to `[]` deps. Since `getCategories()` always returns the same structure this is benign, but it is technically stale.

**File:** `storage-management.tsx` **Lines:** 190-211

### L2. `status-privacy.tsx` L78 — useEffect missing `t` in dependency array
```
useEffect(() => {
    ...
    showToast({ message: t('statusPrivacy.loadError'), variant: 'error' });
    ...
  }, []);
```
`t` is used but not listed as a dependency.

**File:** `status-privacy.tsx` **Lines:** 37-78

### L3. `disappearing-default.tsx` L39-59 — useEffect missing `t` in dependency array
Same pattern. `t` is used inside the effect for `showToast` but the dependency array is `[]`.

**File:** `disappearing-default.tsx` **Lines:** 39-59

### L4. `blocked-keywords.tsx` L78-88 — `handleDelete` missing `t` in dependency array
```
const handleDelete = useCallback((id: string, word: string) => {
    ...
    Alert.alert(
      t('screens.blockedKeywords.removeAlertTitle'),
    ...
  }, [deleteMutation, haptic]);
```
`t` is used but not listed.

**File:** `blocked-keywords.tsx` **Lines:** 78-88

### L5. `media-settings.tsx` L159 — Unsafe cast without full validation
```
setAutoPlay(res.autoPlaySetting.toLowerCase() as 'wifi' | 'always' | 'never');
```
If the server returns an unexpected value (e.g., `"cellular"`), this casts it to the union type without runtime check. Should validate against expected values first.

**File:** `media-settings.tsx` **Line:** 159

### L6. `manage-data.tsx` L118-169 — `formatExportAsText` chains multiple `as Record<string, unknown>` casts
Several unchecked casts: line 123 `data.profile as Record<string, unknown>`, line 138 `item as Record<string, unknown>`, line 155 `data.messages as { count?: number }`. If the API shape changes, these silently produce `undefined` fields rather than failing visibly.

**File:** `manage-data.tsx` **Lines:** 118-169

### L7. `blocked-keywords.tsx` L80 — Destructive deletion uses `Alert.alert` instead of confirmation bottom sheet
Project rule says `showToast()` for mutation feedback and `Alert.alert` only for destructive confirmations. This is technically compliant for a destructive action, but the project prefers `<BottomSheet>` over RN `Modal`/`Alert` per the mobile-screens rules. Other files (quiet-mode, manage-data, storage-management) also use `Alert.alert` for destructive confirmations, so this is a pattern inconsistency rather than a single-file issue.

**File:** `blocked-keywords.tsx` **Line:** 80

### L8. `storage-management.tsx` L48-49 — `formatBytes` produces `NaN` for negative input
```
const i = Math.floor(Math.log(bytes) / Math.log(k));
```
If `bytes` is negative (shouldn't happen normally but defensive coding), `Math.log` returns `NaN`, and the function returns `NaN undefined`. Should clamp to `Math.max(0, bytes)`.

**File:** `storage-management.tsx` **Lines:** 44-50

### L9. `manage-data.tsx` L309 — Comment says "no RefreshControl" but no loading state either
The screen makes no API call on mount (mutations are user-triggered), yet there is no loading skeleton or any indication of network state on initial render. The `exportDataMutation`, `clearWatchHistoryMutation`, and `deleteAccountMutation` all fire on press, but the screen provides no initial loading state to indicate readiness — acceptable since it's a static action screen, but worth noting.

**File:** `manage-data.tsx` **Line:** 309

### L10. `content-filter-settings.tsx` L69-83 — Mutations not guarded against concurrent execution
Unlike `quiet-mode.tsx` which at least has `if (mutation.isPending) return`, the content filter screen fires `mutation.mutate()` on every toggle/level change with no concurrency guard. Rapid toggling can fire multiple parallel requests, and the rollback on error (line 77-79) resets ALL local state to null (server values), losing any successful intermediate changes.

**File:** `content-filter-settings.tsx` **Lines:** 69-83, 91-128

### L11. `wind-down.tsx` L133-135 — `setTimeout` used for debounce guard reset
```
setTimeout(() => { isExitingRef.current = false; }, 500);
```
This timer is not cleaned up on unmount. If the component unmounts before 500ms (which it will, since this navigates away), the timeout fires on a stale ref. Benign since `isExitingRef` is a ref not state, but untidy.

**File:** `wind-down.tsx` **Lines:** 133-135, 146-148

---

## Info

### I1. `quiet-mode.tsx` — `KeyboardAvoidingView` imported but never used
Line 4 imports `KeyboardAvoidingView` but it never appears in the JSX.

**File:** `quiet-mode.tsx` **Line:** 4

### I2. `blocked-keywords.tsx` — `SafeAreaView` imported from `react-native-safe-area-context` but only used in error state
The main (non-error) render uses `SafeAreaView` (line 145) but the `ScreenErrorBoundary` wraps it, which may have its own safe area handling.

**File:** `blocked-keywords.tsx` **Lines:** 8, 127, 145

### I3. `manage-data.tsx` L30 — Unused import `navigate` from `@/utils/navigation`
Actually, `navigate` IS used on line 370, so this is used. However, `AsyncStorage` is imported (line 2) and only used for clearing search history (line 252). This is fine but notable that search history is stored in AsyncStorage while it could be cleared via an API call.

**File:** `manage-data.tsx` **Line:** 2

### I4. `media-settings.tsx` L491-492 — `as const` type assertion on StyleSheet alignment values
```
alignItems: 'center' as const,
justifyContent: 'center' as const,
```
These `as const` are unnecessary inside `StyleSheet.create` — the types are already correctly inferred. Harmless but noisy.

**File:** `media-settings.tsx` **Lines:** 491-492

### I5. `disappearing-default.tsx` L260, L290, L350 — Static `colors.text.*` and `colors.dark.*` in StyleSheet that ARE overridden by JSX inline styles
Some static style values (e.g., `optionLabel` color on line 290, `description` color on line 262) use the dark-mode literal but the JSX passes `{ color: tc.text.* }` inline. The inline style wins, so these are dead values. Not a bug but misleading — someone might remove the inline style thinking the StyleSheet has it covered.

**File:** `disappearing-default.tsx` **Lines:** 260, 290, 350

---

## Summary Table by File

| File | C | H | M | L | I | Total |
|------|---|---|---|---|---|-------|
| `media-settings.tsx` | 0 | 3 | 3 | 1 | 1 | 8 |
| `quiet-mode.tsx` | 0 | 1 | 2 | 0 | 1 | 4 |
| `wind-down.tsx` | 0 | 0 | 1 | 1 | 0 | 2 |
| `blocked-keywords.tsx` | 0 | 0 | 1 | 2 | 1 | 4 |
| `storage-management.tsx` | 1 | 1 | 0 | 2 | 0 | 4 |
| `manage-data.tsx` | 1 | 0 | 1 | 2 | 1 | 5 |
| `content-filter-settings.tsx` | 0 | 1 | 3 | 1 | 0 | 5 |
| `status-privacy.tsx` | 0 | 0 | 1 | 1 | 0 | 2 |
| `disappearing-default.tsx` | 0 | 1 | 1 | 1 | 1 | 4 |
| `disappearing-settings.tsx` | 0 | 1 | 2 | 0 | 0 | 3 |
| **Total** | **2** | **8** | **16** | **11** | **5** | **42** |

---

## Top Priority Fixes (ordered by impact)

1. **C1** — Wrap `deleteAccountMutation.mutateAsync()` in try/catch inside Alert callback (`manage-data.tsx:297`)
2. **C2** — Fix cache double-counting: subtract subcategory sizes from cache, or exclude subdirs when computing cache size (`storage-management.tsx:59,217`)
3. **H4/H5** — Convert `disappearing-default.tsx` and `disappearing-settings.tsx` to `createStyles(tc)` pattern to support light theme
4. **H6** — Convert `content-filter-settings.tsx` static styles to `createStyles(tc)` pattern
5. **H7** — Make `getDirectorySize` recursive or document the limitation
6. **H8** — Queue or debounce mutations in quiet-mode to prevent silently dropped saves
7. **M6-M9** — Add RTL support to 4 screens that completely lack it (content-filter, disappearing-default, disappearing-settings, status-privacy)
8. **M10-M13** — Replace raw `fontWeight` with `fontFamily: fonts.*` in 4 files
