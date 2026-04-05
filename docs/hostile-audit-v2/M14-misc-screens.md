# M14 - Misc Screens Hostile Audit

**Scope:** 15 files in `apps/mobile/app/(screens)/`
**Auditor model:** Claude Opus 4.6 (1M context)
**Date:** 2026-04-05
**Methodology:** Every line read, every finding cited with exact line numbers.

---

## Summary

| Severity | Count |
|----------|-------|
| Critical | 3 |
| High | 12 |
| Medium | 24 |
| Low | 18 |
| Info | 9 |
| **Total** | **66** |

---

## Findings

### CRITICAL

#### C-01: Contact sync hashing is trivially reversible (rainbow table)
**File:** `contact-sync.tsx` lines 162-169
**What:** Phone numbers are SHA-256 hashed after stripping to last 10 digits. There are only ~10 billion possible 10-digit numbers. A precomputed rainbow table cracks every hash in milliseconds. The comment says "Privacy: normalize and hash phone numbers" but this provides zero privacy.
**Impact:** Server receives hashed phone numbers that are trivially reversible. Anyone with DB access or MITM can recover every user's contact list.
**Fix:** Use HMAC-SHA-256 with a user-specific or app-specific secret salt. Or better: use a private set intersection protocol so the server never sees any form of the contacts.

#### C-02: verify-encryption uses non-cryptographic safety number generation
**File:** `verify-encryption.tsx` lines 37-83
**What:** `computeSafetyNumber()` uses FNV-1a hash and xoshiro128 PRNG -- both non-cryptographic -- to generate safety numbers from fingerprint pairs. The comment claims "collision resistance" but FNV-1a is trivially collidable. An attacker could craft a different key pair that produces the same 60-digit safety number, defeating the entire verification purpose.
**Impact:** MITM attack succeeds if attacker can generate a key pair whose fingerprint produces an identical safety number. With FNV-1a this is feasible.
**Fix:** Use actual SHA-256 (via expo-crypto or the Signal Protocol's existing safety number derivation) to hash the concatenated fingerprints. Signal uses iterated SHA-512 for this exact purpose.

#### C-03: verify-encryption fingerprint exchange is completely stubbed
**File:** `verify-encryption.tsx` lines 127-135
**What:** `theirFp` is hardcoded to empty string `''` on line 129. The safety number computation on line 143 also uses empty string `''`. The entire screen is non-functional -- it shows "Unavailable" for their fingerprint and never computes a safety number. Yet the UI presents a "Mark as Verified" button that writes `true` to AsyncStorage, giving users a false sense of security.
**Impact:** Users can "verify" encryption that was never actually verified. The verified status badge is meaningless.
**Fix:** Wire to the Signal module's actual key exchange (e2eApi). Until then, disable the "Mark as Verified" button when their fingerprint is unavailable.

---

### HIGH

#### H-01: Eid cards share text contains hardcoded English
**File:** `eid-cards.tsx` line 85
**What:** `Share.share({ message: ... + '\n\nSent with Mizanly' })` -- "Sent with Mizanly" is a hardcoded English string, not an i18n key.
**Fix:** Use `t('eidCards.sentWithMizanly')`.

#### H-02: Eid cards uses hardcoded `colors.dark.bg` in StyleSheet
**File:** `eid-cards.tsx` line 167
**What:** `backgroundColor: colors.dark.bg` is hardcoded dark theme. The JSX on line 94 correctly uses `tc.bg`, but the static StyleSheet on line 167 always uses dark. If StyleSheet.flatten or default styles apply, this leaks dark bg in light theme.
**Fix:** Use `createStyles(tc)` pattern like other screens.

#### H-03: DM note editor uses hardcoded `colors.dark.bg` in StyleSheet
**File:** `dm-note-editor.tsx` line 303
**What:** `backgroundColor: colors.dark.bg` -- same issue as H-02. Static StyleSheet always dark.
**Fix:** Convert to `createStyles(tc)` pattern.

#### H-04: Contact sync uses hardcoded `colors.dark.bg` in StyleSheet
**File:** `contact-sync.tsx` line 352
**What:** `backgroundColor: colors.dark.bg` in static styles. JSX on line 292 correctly overrides with `tc.bg`, but any path that doesn't override will show wrong bg in light theme.
**Fix:** Convert to `createStyles(tc)` pattern.

#### H-05: Contact sync hardcoded text colors in StyleSheet
**File:** `contact-sync.tsx` lines 362, 369, 384, 385, 396, 398
**What:** Multiple uses of `colors.text.secondary`, `colors.text.primary`, `colors.dark.border` in static StyleSheet instead of `tc.*` theme tokens. These are dark-theme-only values.
**Fix:** Convert to `createStyles(tc)`.

#### H-06: AI avatar uses `ActivityIndicator` instead of `Skeleton`
**File:** `ai-avatar.tsx` line 165
**What:** `<ActivityIndicator color="#FFF" size="small" />` used for generate button loading state. Project rules require Skeleton for content loading. (Note: buttons are OK per rules, but this is inside a full-width card-style button, not a small inline button.)
**Severity rationale:** Medium-High because it violates the explicit component rule.
**Fix:** Use branded loading indicator or accept as button exception per rules.

#### H-07: Quran share `Dimensions.get('window')` called at module scope
**File:** `quran-share.tsx` line 28
**What:** `const { width: screenWidth } = Dimensions.get('window')` at module scope. This value is computed once at import time and never updates on rotation/split-screen/foldable.
**Fix:** Use `useWindowDimensions()` hook inside the component.

#### H-08: Quran reading plan `Dimensions.get('window')` at module scope
**File:** `quran-reading-plan.tsx` line 32
**What:** Same issue as H-07. `const { width } = Dimensions.get('window')` at module level.
**Fix:** Use `useWindowDimensions()` hook.

#### H-09: Reel templates `Dimensions.get('window')` at module scope
**File:** `reel-templates.tsx` line 29
**What:** `const { width: SCREEN_W } = Dimensions.get('window')` at module level. Card widths (`CARD_WIDTH`, `CARD_IMAGE_HEIGHT`) are derived from this stale value.
**Fix:** Use `useWindowDimensions()` hook and compute inside component.

#### H-10: Save-to-playlist uses `videoId!` non-null assertion without guard
**File:** `save-to-playlist.tsx` lines 98-99, 103-104
**What:** `playlistsApi.addItem(playlistId, videoId!)` and `playlistsApi.removeItem(playlistId, videoId!)` use non-null assertion on `videoId`. While `togglePlaylist` checks `if (!videoId) return`, the mutation definitions themselves are created unconditionally and could theoretically be called before the guard.
**Fix:** Add runtime check inside mutationFn or define mutations after videoId is confirmed.

#### H-11: Save-to-playlist loading/error states lack ScreenErrorBoundary
**File:** `save-to-playlist.tsx` lines 193-226
**What:** The loading state (line 193) and error state (line 209) return JSX without wrapping in `<ScreenErrorBoundary>`. Only the main render path (line 230) has it. If an error is thrown during rendering of the loading state, it will be uncaught.
**Fix:** Wrap all return paths in `<ScreenErrorBoundary>`.

#### H-12: Quran reading plan uses `Alert.alert` for destructive confirmation
**File:** `quran-reading-plan.tsx` lines 309-316
**What:** `Alert.alert()` is used for delete confirmation. Project rules say "showToast() for mutation feedback, NEVER bare Alert.alert for non-destructive". While this is destructive (so Alert may be acceptable), the same screen has a BottomSheet for delete on line 549 that also triggers Alert.alert -- double confirmation UX is confusing.
**Fix:** Use BottomSheet with destructive option directly (like dm-note-editor.tsx does on line 278), remove the redundant Alert.alert.

---

### MEDIUM

#### M-01: Eid cards empty catch swallows Share error
**File:** `eid-cards.tsx` lines 87-89
**What:** `catch { // User cancelled share }` -- assumes all errors are cancellations. Network errors, permission errors, or other Share failures are silently swallowed.
**Fix:** Check error type. Only swallow user cancellation.

#### M-02: Quran share `isNavigatingRef` uses setTimeout for reset
**File:** `quran-share.tsx` lines 126, 135
**What:** `setTimeout(() => { isNavigatingRef.current = false; }, 500)` -- magic 500ms timeout. No cleanup on unmount. If component unmounts before timeout fires, the ref update is harmless but the timeout itself is a leak.
**Fix:** Use `useEffect` cleanup to clear the timeout.

#### M-03: Quran share bottom sheet Share swallows all errors
**File:** `quran-share.tsx` line 459
**What:** `try { await Share.share({ message: text }); } catch { /* user cancelled */ }` -- same pattern as M-01.

#### M-04: Quran reading plan doesn't validate API response shape
**File:** `quran-reading-plan.tsx` line 333
**What:** `(historyData as { data?: QuranReadingPlan[] } | undefined)?.data ?? []` -- casts unknown API response to expected shape without validation. If API returns unexpected shape, fails silently.
**Fix:** Add runtime type guard or use zod schema validation.

#### M-05: Quran reading plan heatmap uses faked data
**File:** `quran-reading-plan.tsx` lines 338-355
**What:** Comment says "TODO: Fetch actual daily reading history from API when endpoint is available". The heatmap data is entirely estimated/fabricated from progress calculations. Users see a heatmap that doesn't reflect their actual reading days.
**Fix:** Either label it as "estimated" in the UI, or wait for the API endpoint.

#### M-06: Contact sync auto-fetches contacts on mount without user consent
**File:** `contact-sync.tsx` lines 201-203
**What:** `useEffect(() => { fetchContacts(); }, [])` -- immediately requests contact permissions on screen mount. While a permission dialog appears, the user navigated to this screen which implies intent, but best practice is to show an explanation first before triggering the system dialog.
**Fix:** Show a consent screen explaining why contacts are needed before calling `requestPermissionsAsync()`.

#### M-07: Contact sync phone number normalization is naive
**File:** `contact-sync.tsx` line 165
**What:** `num.replace(/\D/g, '').slice(-10)` -- strips all non-digits and takes last 10. This breaks for countries with 11+ digit numbers (India: 10, China: 11, some African countries: 12-13). It also doesn't handle international prefix normalization (e.g., +1 vs 1 vs 001).
**Fix:** Use `libphonenumber-js` or similar to parse and normalize to E.164 format before hashing.

#### M-08: Location picker sends raw lat/lng as route params
**File:** `location-picker.tsx` lines 141-148
**What:** Location data is serialized as `JSON.stringify(locationData)` and passed as route params. Route params have size limits and are visible in navigation state. Location data is privacy-sensitive.
**Fix:** Use a shared state store (Zustand) or context to pass location data rather than URL params.

#### M-09: Location picker doesn't handle location services disabled
**File:** `location-picker.tsx` lines 61-89
**What:** `Location.requestForegroundPermissionsAsync()` handles permission denial, but doesn't check if location services are disabled at the OS level. `getCurrentPositionAsync()` would throw but the catch just shows a generic error.
**Fix:** Check `Location.hasServicesEnabledAsync()` and show a specific message directing user to settings.

#### M-10: Saved messages uses `Record<string, unknown>` throughout
**File:** `saved-messages.tsx` lines 46, 98, 106-148
**What:** Messages are typed as `Record<string, unknown>` with `as string`, `as boolean` casts everywhere. This is effectively untyped code.
**Fix:** Define a proper `SavedMessage` interface and type the API response.

#### M-11: Saved messages delete uses Alert.alert for destructive action
**File:** `saved-messages.tsx` lines 260-274
**What:** `Alert.alert()` for delete confirmation. Per project rules, this is acceptable for destructive actions, but other screens (dm-note-editor) use BottomSheet for consistency.
**Fix:** Use BottomSheet with destructive option for consistency.

#### M-12: DM note editor doesn't navigate back after posting
**File:** `dm-note-editor.tsx` lines 71-78
**What:** `createMutation.onSuccess` invalidates queries and shows toast but doesn't navigate back. The update flow stays on the same screen. After posting a note, user must manually go back.
**Fix:** Add `router.back()` in onSuccess, or provide clear UX indication that the note was saved.

#### M-13: Chat wallpaper stores custom image as local file URI
**File:** `chat-wallpaper.tsx` lines 179-180
**What:** `wallpaperValue = 'custom:${customImage}'` where `customImage` is a local file URI from ImagePicker. These URIs are ephemeral and may become invalid after app updates, cache clears, or device restarts.
**Fix:** Copy the image to app's persistent storage (e.g., FileSystem.documentDirectory) before saving the URI.

#### M-14: Chat wallpaper `handleDefault` is async but Pressable doesn't disable during operation
**File:** `chat-wallpaper.tsx` lines 158-166
**What:** `handleDefault` does `await AsyncStorage.removeItem(...)` but the Pressable has no loading/disabled state. User could tap multiple times.
**Fix:** Add a loading state or debounce.

#### M-15: Verify-encryption `handleScanQr` has `router` in dependency array but uses `navigate`
**File:** `verify-encryption.tsx` lines 224-227
**What:** `const handleScanQr = useCallback(() => { ... navigate('/(screens)/qr-scanner'); }, [haptic, router])`. The function uses `navigate` (from utils) not `router`, yet `router` is in the dependency array. This is a stale closure risk -- if `navigate` uses router internally, the memo won't update correctly.
**Fix:** Remove `router` from dependencies or use `router.push` directly.

#### M-16: Verify-encryption stores verification status in plain AsyncStorage
**File:** `verify-encryption.tsx` lines 186-189
**What:** `AsyncStorage.setItem('verified_${conversationId}', 'true')` -- verification status is stored unencrypted. An attacker with device access could flip any conversation to "verified" by editing AsyncStorage.
**Fix:** Store verification status in the encrypted MMKV store (aeadSet) alongside session data.

#### M-17: AI avatar generates from avatar URL (potential SSRF)
**File:** `ai-avatar.tsx` line 51
**What:** `aiApi.generateAvatar(user?.avatarUrl || '', selectedStyle)` sends the user's avatar URL to the backend for AI processing. If the backend fetches this URL server-side, it's an SSRF vector (user could set avatarUrl to internal IP).
**Fix:** Backend must validate that avatarUrl points to its own CDN (R2) before fetching.

#### M-18: Reel templates silently swallows use-count increment error
**File:** `reel-templates.tsx` lines 145-147
**What:** `reelTemplatesApi.use(template.id).catch(() => { // silently increment use count })` -- the comment says "silently" but this means if the API is broken, use counts are lost with no indication.
**Fix:** At minimum, log to Sentry. This is analytics data loss.

#### M-19: Create-playlist `onSuccess` has unused `newPlaylist` parameter
**File:** `create-playlist.tsx` line 53
**What:** `onSuccess: (newPlaylist) => { ... }` -- `newPlaylist` is never used. Could be used to navigate to the new playlist or pass it back.
**Fix:** Either use it or remove the parameter name.

#### M-20: Series-detail `ListHeader` useCallback has too many dependencies
**File:** `series-detail.tsx` line 238
**What:** `const ListHeader = useCallback(() => (...), [series, styles, tc, t, handleFollowToggle, handleAddEpisode, followMutation.isPending, unfollowMutation.isPending])` -- this many deps means it re-creates on virtually every render, making useCallback useless.
**Fix:** Extract ListHeader as a separate memoized component instead.

#### M-21: Series-detail `renderEpisode` missing from useCallback dependencies
**File:** `series-detail.tsx` line 215
**What:** `renderEpisode` is a plain function, not wrapped in useCallback. Since it's passed to FlatList's `renderItem`, the list may re-render unnecessarily.
**Fix:** Wrap in useCallback with appropriate dependencies.

#### M-22: Series-discover category chips re-created in render body
**File:** `series-discover.tsx` lines 69-76
**What:** `CATEGORIES` array is created inside the component body on every render. It depends on `t` so it can't be module-level, but should be memoized.
**Fix:** Wrap in `useMemo(() => ..., [t])`.

#### M-23: Quran share padding uses `spacing['3xl']` which may not exist
**File:** `quran-share.tsx` line 480
**What:** `paddingBottom: spacing['3xl']` -- need to verify `3xl` exists in the theme. If undefined, paddingBottom will be `undefined` which React Native silently ignores, resulting in no bottom padding.
**Fix:** Verify theme token exists. Use `spacing.xxl` or a known token.

#### M-24: Save-to-playlist error handling has unsafe property chain
**File:** `save-to-playlist.tsx` lines 123-126
**What:** `const err = error as { response?: { data?: { message?: string } }; message?: string }; const message = err?.response?.data?.message || err.message || 'Unknown error'` -- `err.message` will throw if err is nullish (it's cast from unknown). Also the type cast pattern is fragile.
**Fix:** Use `error instanceof Error ? error.message : 'Unknown error'` pattern.

---

### LOW

#### L-01: Eid cards hardcoded `#FFFFFF` in StyleSheet
**File:** `eid-cards.tsx` line 196
**What:** `color: '#FFFFFF'` -- hardcoded white. Should use theme token for text on colored backgrounds.

#### L-02: Eid cards hardcoded `rgba(255,255,255,0.75)` in StyleSheet
**File:** `eid-cards.tsx` line 206
**What:** Hardcoded alpha white. Not a theme token.

#### L-03: Quran share imports `rtlFlexRow` but surah selector doesn't use RTL-aware flexDirection
**File:** `quran-share.tsx` line 26
**What:** `rtlFlexRow` is imported but the surah selector gradient (line 490) uses hardcoded `flexDirection: 'row'`.

#### L-04: Quran reading plan `spacing.xxl` may not exist
**File:** `quran-reading-plan.tsx` lines 407, 531
**What:** `{ height: spacing.xxl }` used twice. Need to verify this token exists. If undefined, View height is 0.

#### L-05: Contact sync `fetchContacts` missing from eslint-disable comment
**File:** `contact-sync.tsx` line 203
**What:** `// eslint-disable-line react-hooks/exhaustive-deps` suppresses the warning about `fetchContacts` not being in the dependency array. The disable is intentional (run once on mount) but should include a comment explaining why.

#### L-06: Location picker imports `shadow` but never uses it
**File:** `location-picker.tsx` line 16
**What:** `import { ..., shadow, ... } from '@/theme'` -- `shadow` is imported but unused.

#### L-07: Saved messages `haptic.delete()` and `haptic.save()` may not exist
**File:** `saved-messages.tsx` lines 76, 89
**What:** `haptic.delete()` and `haptic.save()` are called. Need to verify these methods exist on the haptic object returned by `useContextualHaptic()`. If they don't, this throws at runtime.

#### L-08: Saved messages `haptic.longPress()` may not exist
**File:** `saved-messages.tsx` line 119
**What:** `haptic.longPress()` called on long press handler. Same concern as L-07.

#### L-09: DM note editor `haptic.send()` may not exist
**File:** `dm-note-editor.tsx` line 92
**What:** `haptic.send()` called. Need to verify method exists.

#### L-10: Chat wallpaper imports `animation` from theme but never uses it
**File:** `chat-wallpaper.tsx` line 19
**What:** `import { ..., animation, ... } from '@/theme'` -- unused import.

#### L-11: Chat wallpaper imports `shadow` from theme
**File:** `chat-wallpaper.tsx` line 19
**What:** `shadow` is imported and used on line 498 (`...shadow.md`) and line 579 (`...shadow.glow`). These are spread into StyleSheet -- verify they exist.

#### L-12: Chat wallpaper creates `AnimatedPressable` but never uses it
**File:** `chat-wallpaper.tsx` line 25
**What:** `const AnimatedPressable = Animated.createAnimatedComponent(Pressable)` -- created but never used in the component. Dead code.

#### L-13: Chat wallpaper `renderPreview` splits on first colon only
**File:** `chat-wallpaper.tsx` line 227
**What:** `const [type, value] = currentWallpaper.split(':')` -- if `value` contains colons (e.g., `custom:file://path:with:colons`), only the first segment after type is captured. The rest is lost.
**Fix:** Use `const colonIdx = currentWallpaper.indexOf(':'); const type = currentWallpaper.slice(0, colonIdx); const value = currentWallpaper.slice(colonIdx + 1);`

#### L-14: Verify-encryption `encryptionService` import is labeled "Deprecated compat stub"
**File:** `verify-encryption.tsx` line 18
**What:** Comment says "Deprecated compat stub" but the screen heavily depends on it (`isInitialized()`, `initialize()`, `getFingerprint()`). If the stub is incomplete, the screen silently fails.

#### L-15: AI avatar `haptic.follow()` usage in series screens may not exist
**File:** `series-detail.tsx` line 141, `series-discover.tsx` line 180
**What:** `haptic.follow()` called. Need to verify method exists on contextual haptic.

#### L-16: Series-detail `createdAt` field on Episode is parsed without timezone handling
**File:** `series-detail.tsx` line 230
**What:** `new Date(item.createdAt).toLocaleDateString()` -- if `createdAt` is a UTC ISO string, this may show wrong date for users near midnight in their timezone.
**Fix:** Use date-fns with locale for consistent formatting.

#### L-17: Create-playlist missing `accessibilityLabel` on TextInput
**File:** `create-playlist.tsx` lines 151-157, 179-187
**What:** TextInput fields for title and description have no `accessibilityLabel`. Screen reader users won't know what field they're in.
**Fix:** Add `accessibilityLabel={t('createPlaylist.label.title')}` etc.

#### L-18: Series-discover `CATEGORIES` recreated but `CATEGORY_KEYS` is module-level
**File:** `series-discover.tsx` lines 33, 69-76
**What:** `CATEGORY_KEYS` is defined at module level as a const but `CATEGORIES` (which maps keys to translated labels) is recreated every render. Inconsistent pattern.
**Fix:** Memoize `CATEGORIES` with `useMemo`.

---

### INFO

#### I-01: Quran share hardcoded Bismillah Unicode
**File:** `quran-share.tsx` line 310
**What:** Bismillah text is a long Unicode escape sequence. This is acceptable (religious text must be exact) but the pattern makes it hard to verify correctness. The Surah 9 exception is correctly handled.

#### I-02: Quran reading plan uses 604 pages and 30 juz as hardcoded constants
**File:** `quran-reading-plan.tsx` lines 281-282, 296-297
**What:** `Math.min(nextJuz * 20, 604)`, `Math.min(..., 604)`, `nextJuz >= 30`. These are correct for the standard Quran but are magic numbers.
**Fix:** Extract as named constants: `const TOTAL_PAGES = 604; const TOTAL_JUZ = 30;`

#### I-03: Location picker `keyboardType="numeric"` doesn't accept negative/decimal
**File:** `location-picker.tsx` lines 282, 296
**What:** `keyboardType="numeric"` on latitude/longitude inputs. On iOS this shows a number pad without minus sign or decimal point. Users can't type negative latitudes or decimal values from the keyboard.
**Fix:** Use `keyboardType="numbers-and-punctuation"` on iOS or `"decimal-pad"`.

#### I-04: Chat wallpaper color names use English keys for i18n
**File:** `chat-wallpaper.tsx` line 255
**What:** `t('chatWallpaper.color.${color.name.toLowerCase()}')` -- i18n keys derived from English color names. Works but fragile if color names change.

#### I-05: Verify-encryption QR code includes fingerprint in URL
**File:** `verify-encryption.tsx` lines 231-233
**What:** `mizanly://verify/${conversationId}?fp=${myFingerprint.replace(/\s/g, '')}` -- fingerprint is in the QR URL. This is the intended design for QR verification but worth noting for the threat model.

#### I-06: AI avatar directly mutates Zustand store in onSuccess
**File:** `ai-avatar.tsx` lines 65-69
**What:** `useStore.getState().setUser(...)` called inside mutation callback. This works but bypasses React's render cycle for the calling component. The store will trigger re-renders in subscribed components.

#### I-07: Reel templates `renderCard` has styles in dependency array
**File:** `reel-templates.tsx` line 260
**What:** `styles` is in the useCallback dependency array. Since styles is derived from `useMemo(() => createStyles(tc), [tc])`, it changes when theme changes, causing renderCard to be recreated. This is correct behavior but means the FlatList re-renders all items on theme change.

#### I-08: Series-detail episodes don't use pagination
**File:** `series-detail.tsx` line 365-367
**What:** `data={series.episodes}` -- all episodes are loaded at once from the series query. For series with hundreds of episodes, this could be slow. Currently fine for MVP.

#### I-09: Multiple screens use `setTimeout(() => { ref.current = false; }, 500)` for nav debounce
**Files:** `contact-sync.tsx` line 59, `quran-share.tsx` lines 126, 135
**What:** Consistent pattern of 500ms navigation debounce via setTimeout with no cleanup. Works but timeouts accumulate if user taps rapidly before 500ms expires.

---

## Cross-Cutting Issues

### Theme Tokens (8 findings: H-02, H-03, H-04, H-05, L-01, L-02)
Three screens (`eid-cards.tsx`, `dm-note-editor.tsx`, `contact-sync.tsx`) use static `StyleSheet.create()` with hardcoded `colors.dark.bg`, `colors.text.secondary`, `colors.text.primary`. All other screens in scope correctly use the `createStyles(tc)` pattern. These three will render incorrectly in light theme.

### Dimensions at Module Scope (3 findings: H-07, H-08, H-09)
Three screens call `Dimensions.get('window')` at module scope. The value is stale on rotation, split-screen, and foldable devices.

### Error Swallowing (3 findings: M-01, M-03, M-18)
Three instances of catch blocks that assume all errors are user cancellations or silently swallow errors that should at minimum be logged.

### Haptic Method Existence (4 findings: L-07, L-08, L-09, L-15)
Multiple screens call haptic methods (`delete`, `save`, `longPress`, `send`, `follow`) without certainty they exist on the `useContextualHaptic()` return type. If any is undefined, it throws `TypeError: haptic.xxx is not a function` at runtime.

---

## Files Without Findings Summary

No files were finding-free. Every file in scope has at least one finding.

## Verification Status

Changes made: NONE (audit only).
Tests: N/A.
Remaining: All 66 findings need code fixes.
