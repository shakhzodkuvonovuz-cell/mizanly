# Agent #32 — Mobile Custom Hooks Deep Audit

**Scope:** All 23 hook files in `apps/mobile/src/hooks/`
**Agent:** Claude Opus 4.6 (1M context)
**Date:** 2026-03-21
**Method:** Line-by-line read of every file, cross-referenced with store, services, theme, and usage across 271 consumer files

---

## Summary

- **Files audited:** 23 hook files
- **Total findings:** 52
- **Critical (P0):** 4
- **High (P1):** 11
- **Medium (P2):** 18
- **Low (P3):** 19

---

## Finding #1 — CRITICAL (P0): useChatLock JSON.parse without try/catch

**File:** `apps/mobile/src/hooks/useChatLock.ts`
**Line:** 13
**Code:**
```ts
return JSON.parse(stored) as string[];
```
**Issue:** `getLockedIds()` calls `JSON.parse(stored)` without any try/catch. If `SecureStore` returns malformed data (corrupted storage, device migration, encoding issues), this crashes the app with an unhandled exception. Since this is called in `isLocked`, `lockConversation`, and `unlockConversation`, any corruption in this single SecureStore key makes ALL chat lock operations crash.

**Impact:** App crash every time user opens any conversation that checks lock status. Unrecoverable without clearing app data.

**Fix:**
```ts
async function getLockedIds(): Promise<string[]> {
  const stored = await SecureStore.getItemAsync(LOCKED_CHATS_KEY);
  if (!stored) return [];
  try {
    const parsed = JSON.parse(stored);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    // Corrupted data — reset to empty
    await SecureStore.deleteItemAsync(LOCKED_CHATS_KEY);
    return [];
  }
}
```

---

## Finding #2 — CRITICAL (P0): useChatLock silently bypasses authentication when no biometrics

**File:** `apps/mobile/src/hooks/useChatLock.ts`
**Lines:** 23, 26
**Code:**
```ts
const hasHardware = await LocalAuthentication.hasHardwareAsync();
if (!hasHardware) return true; // No biometrics hardware = skip auth

const isEnrolled = await LocalAuthentication.isEnrolledAsync();
if (!isEnrolled) return true; // No biometrics enrolled = skip auth
```
**Issue:** If a device has no biometric hardware OR no biometrics enrolled, the `authenticate()` function returns `true` (success) unconditionally. This means:
1. A user locks a chat on a device with biometrics
2. They lose their phone
3. Someone picks it up, factory resets / disables biometrics
4. All "locked" chats are now accessible without any authentication

Even on the same device: if the user removes their fingerprint enrollment in Settings, all locked chats become instantly accessible. The security feature is decorative if biometrics can be removed.

**Impact:** Chat lock provides false sense of security. Sensitive conversations are fully accessible to anyone who can remove biometrics enrollment.

**Fix:** When no biometrics available, should fall back to device passcode (which `disableDeviceFallback: false` already attempts for the auth prompt), but the early returns prevent ever reaching the auth call. At minimum, should return `false` (deny access) when biometrics unavailable, or require a separate PIN/password as fallback.

---

## Finding #3 — CRITICAL (P0): useTranslation isRTL ignores Urdu

**File:** `apps/mobile/src/hooks/useTranslation.ts`
**Line:** 11
**Code:**
```ts
const isRTL = language === 'ar';
```
**Issue:** Urdu (`ur`) is a right-to-left language, but `isRTL` only checks for Arabic (`ar`). The app supports 8 languages including Urdu. Any component using `isRTL` from this hook will render Urdu text with wrong layout direction — left-to-right instead of right-to-left.

**Impact:** Urdu users see broken layout throughout the entire app. Every screen that uses `isRTL` for conditional RTL styling (flexDirection, textAlign, padding, margins, icon positions) will be wrong.

**Fix:**
```ts
const isRTL = language === 'ar' || language === 'ur';
```

---

## Finding #4 — CRITICAL (P0): useTranslation changeLanguage only accepts 'en' | 'ar'

**File:** `apps/mobile/src/hooks/useTranslation.ts`
**Line:** 13
**Code:**
```ts
const changeLanguage = (lang: 'en' | 'ar') => {
  return i18n.changeLanguage(lang);
};
```
**Issue:** The `changeLanguage` function's type signature restricts language changes to only English and Arabic. The app supports 8 languages (`en`, `ar`, `tr`, `ur`, `bn`, `fr`, `id`, `ms`), but this hook only allows switching between 2. Any settings screen using this hook to change language will fail at compile time (TypeScript error) if it tries to set Turkish, Urdu, Bengali, French, Indonesian, or Malay.

**Impact:** 6 out of 8 supported languages cannot be selected via this hook. Language picker in settings is broken for 75% of supported languages.

**Fix:**
```ts
const changeLanguage = (lang: 'en' | 'ar' | 'tr' | 'ur' | 'bn' | 'fr' | 'id' | 'ms') => {
  return i18n.changeLanguage(lang);
};
```

---

## Finding #5 — HIGH (P1): useBackgroundUpload has no cleanup on unmount

**File:** `apps/mobile/src/hooks/useBackgroundUpload.ts`
**Lines:** 13-91
**Code:** The entire hook has no `useEffect` cleanup. The `xhrRef` holds a reference to an in-progress XMLHttpRequest, but if the component unmounts while an upload is in progress:
1. The XHR continues running
2. The `setState` calls in event handlers (`load`, `error`, `progress`) attempt to update state on an unmounted component
3. React will log "Can't perform a React state update on an unmounted component" warnings
4. The upload completes but the `onComplete` callback fires on a stale closure

**Impact:** Memory leak on unmount. State update warnings. The uploaded file URL from `onComplete` is lost because the callback captures stale parent scope.

**Fix:** Add an effect that aborts the XHR on unmount:
```ts
useEffect(() => {
  return () => {
    if (xhrRef.current) {
      xhrRef.current.abort();
      xhrRef.current = null;
    }
  };
}, []);
```
Or add a `mountedRef` pattern to guard `setState` calls.

---

## Finding #6 — HIGH (P1): useBackgroundUpload setState in async callbacks without mount guard

**File:** `apps/mobile/src/hooks/useBackgroundUpload.ts`
**Lines:** 36, 42, 49, 55, 70
**Code:**
```ts
xhr.upload.addEventListener('progress', (event) => {
  if (event.lengthComputable) {
    const progress = event.loaded / event.total;
    setState({ progress, status: 'uploading' }); // No mount check
  }
});
```
**Issue:** All `setState` calls inside XHR event handlers and the inner `fetch(...).catch()` have no guard against the component being unmounted. Unlike `useAmbientColor` which properly uses a `mountedRef`, this hook fires state updates blindly.

**Impact:** React warnings in console. Potential memory leaks if React cannot garbage-collect the component due to lingering setState references.

---

## Finding #7 — HIGH (P1): usePayment is dead code (zero consumers)

**File:** `apps/mobile/src/hooks/usePayment.ts`
**Lines:** 1-122 (entire file)
**Issue:** `usePayment` is imported by zero files outside its own definition. Grep across the entire mobile codebase found only 1 match: the hook file itself. No screen (send-tip, membership-tiers, donate, gift-shop, etc.) actually uses this hook.

**Impact:** Dead code adding bundle size. More importantly, all payment screens are NOT using Stripe — they likely just create database records without actual payment processing. The hook that would bridge Stripe to the UI is never wired.

---

## Finding #8 — HIGH (P1): useReducedMotion and useAccessibleAnimation are dead code (zero consumers)

**File:** `apps/mobile/src/hooks/useReducedMotion.ts`
**Lines:** 1-45 (entire file)
**Issue:** Neither `useReducedMotion` nor `useAccessibleAnimation` is imported by any file outside the hook definition. Grep found 1 match for each — only the definition file. Zero consumers.

**Impact:** The "reduce motion" accessibility feature does nothing. All animations play at full speed regardless of user preference. This is an accessibility violation — users with vestibular disorders who enable "Reduce Motion" in their device settings get no relief.

---

## Finding #9 — HIGH (P1): useFpsMonitor is dead code (zero consumers)

**File:** `apps/mobile/src/hooks/useFpsMonitor.ts`
**Lines:** 1-54 (entire file)
**Issue:** `useFpsMonitor` is not imported by any file outside itself. The dev-only performance monitoring tool was built but never wired into any component.

**Impact:** FPS monitoring is unavailable during development. No jank detection.

---

## Finding #10 — HIGH (P1): useVideoPreload is dead code (zero consumers)

**File:** `apps/mobile/src/hooks/useVideoPreload.ts`
**Lines:** 1-52 (entire file)
**Issue:** `useVideoPreload` is not imported by any file outside itself. The reel preloading hook was built but never wired into the Bakra tab. Only `useVideoPreloader` (the more advanced version) is used, in `bakra.tsx`.

**Impact:** Dead code. Not harmful but confusing to have two video preload hooks where one is unused.

---

## Finding #11 — HIGH (P1): useBackgroundUpload is dead code (zero consumers)

**File:** `apps/mobile/src/hooks/useBackgroundUpload.ts`
**Lines:** 1-91 (entire file)
**Issue:** `useBackgroundUpload` is not imported by any file outside itself. No creation screen (create-post, create-story, create-reel, etc.) uses this hook for uploads.

**Impact:** All upload functionality in creation screens either doesn't exist (confirmed by agent #37 — story upload is broken) or uses a different mechanism. This hook is orphaned dead code.

---

## Finding #12 — HIGH (P1): usePulseGlow is dead code (zero consumers)

**File:** `apps/mobile/src/hooks/usePulseGlow.ts`
**Lines:** 1-41 (entire file)
**Issue:** `usePulseGlow` is not imported by any file outside itself. The pulsing glow animation hook is unused.

**Impact:** Dead code. No visual component uses the pulse animation.

---

## Finding #13 — HIGH (P1): clearAmbientCache is never called (memory leak)

**File:** `apps/mobile/src/hooks/useAmbientColor.ts`
**Lines:** 123-125
**Code:**
```ts
export function clearAmbientCache(): void {
  colorCache.clear();
}
```
**Issue:** The comment says "call on memory warning" but `clearAmbientCache` is never imported or called by any file. The module-level `colorCache` Map grows unboundedly as users scroll through videos. Each unique `imageUri` adds an entry that is never evicted.

**Impact:** Memory leak proportional to number of unique video thumbnails viewed. On a long session browsing reels/videos, this map grows continuously. No memory warning handler is wired.

**Fix:** Wire `clearAmbientCache` to `AppState` memory warning events in the root layout, or add a LRU eviction strategy to the cache.

---

## Finding #14 — HIGH (P1): useAmbientColor module-level Map prevents garbage collection

**File:** `apps/mobile/src/hooks/useAmbientColor.ts`
**Line:** 5
**Code:**
```ts
const colorCache = new Map<string, { dominant: string; secondary: string }>();
```
**Issue:** Module-level `Map` lives for the entire app lifetime. Combined with Finding #13 (never cleared), this is a persistent memory leak. Unlike a WeakMap, string keys are never automatically garbage-collected.

**Impact:** Memory pressure grows over time. On low-memory devices, could trigger app kills.

---

## Finding #15 — MEDIUM (P2): useTranslation has unused import

**File:** `apps/mobile/src/hooks/useTranslation.ts`
**Line:** 2
**Code:**
```ts
import i18next from '@/i18n';
```
**Issue:** The `i18next` import is never used in the hook body. The hook uses `useI18nTranslation()` from `react-i18next` and `i18n` from its return value. The direct `i18next` import is dead code.

**Impact:** Unnecessary module import. Tree-shaking should remove it, but it's confusing code.

---

## Finding #16 — MEDIUM (P2): useEntranceAnimation missing dependency array values

**File:** `apps/mobile/src/hooks/useEntranceAnimation.ts`
**Line:** 35
**Code:**
```ts
useEffect(() => {
  opacity.value = withDelay(delay, withTiming(1, timingConfig));
  translateY.value = withDelay(delay, withTiming(0, timingConfig));
}, []);
```
**Issue:** The `useEffect` has an empty dependency array `[]`, but it references `delay`, `opacity`, `translateY`, and `timingConfig` from the outer scope. If the parent component re-renders with different `delay` or `duration` props, the animation won't re-trigger.

This is likely intentional for entrance animations (fire once on mount), but the React linter `react-hooks/exhaustive-deps` would flag this. The missing deps are: `delay`, `opacity`, `translateY`, `timingConfig`.

**Impact:** If props change after mount, animation doesn't re-fire. For entrance animations this is usually expected, but the code should have an eslint-disable comment explaining the intent.

---

## Finding #17 — MEDIUM (P2): usePulseGlow missing dependency array values

**File:** `apps/mobile/src/hooks/usePulseGlow.ts`
**Line:** 34
**Code:**
```ts
useEffect(() => {
  opacity.value = withRepeat(
    withTiming(maxOpacity, {
      duration: duration / 2,
      easing: Easing.inOut(Easing.ease),
    }),
    -1,
    true,
  );
}, []);
```
**Issue:** Same pattern as Finding #16. Empty dependency array but references `opacity`, `maxOpacity`, and `duration` from outer scope. If options change, the animation doesn't update.

**Impact:** Animation parameters are frozen from first mount. Low severity since this hook is unused anyway (Finding #12).

---

## Finding #18 — MEDIUM (P2): useIslamicTheme returns stale results

**File:** `apps/mobile/src/hooks/useIslamicTheme.ts`
**Lines:** 12-15
**Code:**
```ts
return useMemo(() => {
  if (!islamicThemeEnabled) return null;
  return getActiveIslamicTheme();
}, [islamicThemeEnabled]);
```
**Issue:** `getActiveIslamicTheme()` returns a theme based on the current Hijri date and time (Ramadan, Eid, Jummah, etc.). The `useMemo` dependency is only `islamicThemeEnabled` — it does NOT depend on the current date/time. If the user keeps the app open across a date boundary (e.g., the night Ramadan starts, or when Jummah Friday begins), the theme won't update until `islamicThemeEnabled` toggles.

**Impact:** Islamic theme overlays (Ramadan moon, Eid decorations, Jummah accent colors) won't appear or disappear at the correct time unless the user restarts the app or toggles the setting.

**Fix:** Add a time-based dependency or a periodic re-evaluation (e.g., check every minute or on AppState change to 'active').

---

## Finding #19 — MEDIUM (P2): useIsEidToday returns stale results

**File:** `apps/mobile/src/hooks/useIslamicTheme.ts`
**Lines:** 22-26
**Code:**
```ts
return useMemo(() => {
  if (!islamicThemeEnabled) return false;
  return isEidToday();
}, [islamicThemeEnabled]);
```
**Issue:** Same staleness as Finding #18. `isEidToday()` is date-dependent but `useMemo` only re-evaluates when `islamicThemeEnabled` changes. If the app stays open across midnight when Eid starts, `isEidToday()` returns the old value.

**Impact:** Eid decorations (EidFrame, confetti, special greetings) won't appear at the correct time.

---

## Finding #20 — MEDIUM (P2): usePayment no race condition protection

**File:** `apps/mobile/src/hooks/usePayment.ts`
**Lines:** 10-47
**Code:**
```ts
const payTip = async (receiverId: string, amount: number) => {
  setLoading(true);
  setError(null);
  try {
    const paymentIntent = await paymentsApi.createPaymentIntent({...});
    const { error: initError } = await initPaymentSheet({...});
    // ...
  }
```
**Issue:** All 5 async methods (`payTip`, `subscribeTier`, `cancelSubscription`, `attachPaymentMethod`, `fetchPaymentMethods`) share a single `loading` state. If a user rapidly taps "tip" and "subscribe", both set `loading = true` and race against each other. The first to finish sets `loading = false` while the other is still in progress.

Also, none of these functions are wrapped in `useCallback`, so they're recreated on every render.

**Impact:** Loading state is unreliable. Double-tap could trigger duplicate payment intents. Moot since the hook is unused (Finding #7), but the code quality is poor.

---

## Finding #21 — MEDIUM (P2): usePayment functions are not memoized

**File:** `apps/mobile/src/hooks/usePayment.ts`
**Lines:** 10, 49, 67, 82, 97
**Code:** All 5 returned functions (`payTip`, `subscribeTier`, `cancelSubscription`, `attachPaymentMethod`, `fetchPaymentMethods`) are plain `async` arrow functions, not wrapped in `useCallback`.

**Issue:** Every render of the consuming component recreates all 5 functions. If any of these were passed as props to memoized children, the memo would be defeated.

**Impact:** Minor performance issue. Reduced since hook is unused.

---

## Finding #22 — MEDIUM (P2): useHaptic functions are not memoized

**File:** `apps/mobile/src/hooks/useHaptic.ts`
**Lines:** 9-43
**Code:** All 7 returned functions (`light`, `medium`, `heavy`, `success`, `warning`, `error`, `selection`) are plain arrow functions, not wrapped in `useCallback`.

**Issue:** Every render of a consuming component recreates all 7 haptic functions. Since `useHaptic` is used in 13+ components (BottomSheet, CommentsSheet, PostCard, etc.), these unnecessary recreations happen frequently.

**Impact:** Minor performance degradation. The functions are stable (no closures over state), so wrapping in `useCallback(fn, [])` with empty deps would be safe and eliminate unnecessary child re-renders.

---

## Finding #23 — MEDIUM (P2): useChatLock functions are not memoized

**File:** `apps/mobile/src/hooks/useChatLock.ts`
**Lines:** 38, 44, 57, 68, 73
**Code:** All 5 returned functions (`isLocked`, `lockConversation`, `unlockConversation`, `authenticateForChat`, `isBiometricAvailable`) are plain async arrow functions with no `useCallback`.

**Issue:** Every render recreates all 5 functions. Unlike Finding #22, these functions are async and involve I/O (SecureStore, biometrics), so unnecessary recreations are wasteful.

**Impact:** Minor performance issue. More concerning: if these are passed to useEffect dependencies, they'd trigger infinite re-render loops.

---

## Finding #24 — MEDIUM (P2): usePiP enterPiP has stale isPlaying closure

**File:** `apps/mobile/src/hooks/usePiP.ts`
**Lines:** 26-43
**Code:**
```ts
const enterPiP = useCallback(() => {
  if (!isPiPSupported || !isPlaying) return;
  // ...
}, [isPiPSupported, isPlaying]);
```
**Issue:** `enterPiP` correctly includes `isPlaying` in its dependency array. However, the `AppState` listener effect (line 51-60) captures `enterPiP` and `exitPiP` in its closure:
```ts
useEffect(() => {
  const subscription = AppState.addEventListener('change', (state) => {
    if (state === 'background' && isPlaying && isPiPSupported) {
      enterPiP();
    }
    // ...
  });
  return () => subscription.remove();
}, [isPlaying, isPiPActive, isPiPSupported, enterPiP, exitPiP]);
```
The effect subscribes and unsubscribes on every `isPlaying` change, which is correct. However, the redundant `isPlaying` check inside the listener AND in `enterPiP` means `enterPiP()` is called only to immediately return because it already checked `isPlaying`. This is not a bug but is confusingly redundant code.

**Impact:** No functional bug, but confusing double-guard pattern.

---

## Finding #25 — MEDIUM (P2): usePiP iOS PiP is not actually implemented

**File:** `apps/mobile/src/hooks/usePiP.ts`
**Lines:** 36-37
**Code:**
```ts
// iOS: handled via expo-av useNativeControls
setIsPiPActive(true);
```
**Issue:** On iOS, the comment says PiP is "handled via expo-av useNativeControls," but the hook just sets state to `true` without actually invoking any iOS PiP API. Expo AV's native controls provide a PiP button on the video player itself, but this hook's `enterPiP()` on iOS does nothing real — it only updates React state.

**Impact:** `isPiPActive` reports `true` on iOS but no actual PiP mode is entered. Any UI that reacts to `isPiPActive` (hiding controls, showing overlay) activates incorrectly.

---

## Finding #26 — MEDIUM (P2): usePushNotifications EXPO_PUBLIC_PROJECT_ID is a placeholder

**File:** `apps/mobile/src/hooks/usePushNotifications.ts`
**Line:** 74
**Code:**
```ts
const tokenData = await Notifications.getExpoPushTokenAsync({
  projectId: process.env.EXPO_PUBLIC_PROJECT_ID,
});
```
**Issue:** In `eas.json`, `EXPO_PUBLIC_PROJECT_ID` is set to `"SET_ME"`. If this placeholder is used at runtime, `getExpoPushTokenAsync` will fail because it needs a valid Expo project ID.

**Impact:** Push notifications completely non-functional until the env var is set correctly.

---

## Finding #27 — MEDIUM (P2): usePushNotifications platform excludes web

**File:** `apps/mobile/src/hooks/usePushNotifications.ts`
**Line:** 77
**Code:**
```ts
const platform = Platform.OS === 'ios' ? 'ios' : 'android';
```
**Issue:** If running on web (Expo Web), `Platform.OS` is `'web'`, which falls through to `'android'` in this ternary. The token registration would send `platform: 'android'` for a web client, potentially sending Android-format push notifications to a web browser.

**Impact:** Push notifications broken on web platform (wrong platform identifier sent to backend).

---

## Finding #28 — MEDIUM (P2): usePushNotificationHandler creates functions on every render

**File:** `apps/mobile/src/hooks/usePushNotificationHandler.ts`
**Lines:** 116, 223
**Code:**
```ts
const handleNotificationNavigation = (data: NotificationData) => { ... };
const navigateFromNotification = (data: NotificationData) => { ... };
```
**Issue:** `handleNotificationNavigation` is defined inside the hook body without `useCallback`. While it's primarily used inside `useEffect` (which captures it via closure), the returned `navigateFromNotification` function is recreated every render.

**Impact:** Minor. Any consumer that passes `navigateFromNotification` to a child's deps or memo will see unnecessary re-renders.

---

## Finding #29 — MEDIUM (P2): useTTS resume restarts from beginning instead of resuming

**File:** `apps/mobile/src/hooks/useTTS.ts`
**Lines:** 121-131
**Code:**
```ts
const resume = useCallback(() => {
  if (!ttsText) return;
  setTTSPlaying(true);
  const language = detectLanguage(ttsText);
  Speech.speak(ttsText, {
    language,
    rate: currentSpeedRef.current,
    // ...
  });
}, [ttsText, setTTSPlaying]);
```
**Issue:** The `resume` function calls `Speech.speak(ttsText, ...)` which starts reading from the beginning of the text. `expo-speech` does not support pause/resume — only `stop()` and `speak()`. So after "pausing" (which calls `Speech.stop()`), "resuming" restarts from the beginning.

**Impact:** Poor UX. Users expect resume to continue from where they left off. Long articles/posts will restart from the beginning every time. The function name is misleading.

**Fix:** Either: (a) rename to `restart`, (b) track position by splitting text into sentences and resuming from the last completed sentence, or (c) add a disclaimer in the UI that resume restarts.

---

## Finding #30 — MEDIUM (P2): useTTS cycleSpeed has race condition

**File:** `apps/mobile/src/hooks/useTTS.ts`
**Lines:** 139-157
**Code:**
```ts
const cycleSpeed = useCallback(() => {
  const currentIndex = SPEED_OPTIONS.indexOf(ttsSpeed as TTSSpeed);
  const nextIndex = (currentIndex + 1) % SPEED_OPTIONS.length;
  const newSpeed = SPEED_OPTIONS[nextIndex];
  setTTSSpeed(newSpeed);

  if (ttsPlaying && ttsText) {
    Speech.stop();
    Speech.speak(ttsText, {
      language,
      rate: newSpeed,
      // ...
    });
  }
}, [ttsSpeed, ttsPlaying, ttsText, setTTSSpeed, setTTSPlaying]);
```
**Issue:** `Speech.stop()` followed immediately by `Speech.speak()` has a race condition. `stop()` is async internally (fires `onStopped` callback), and the `onStopped` callback sets `setTTSPlaying(false)`. So the sequence is:
1. `Speech.stop()` — triggers async onStopped
2. `Speech.speak(...)` — starts new speech, sets up new onDone/onStopped
3. `onStopped` from step 1 fires — sets `ttsPlaying = false`
4. Speech is actually playing but state says it's not

**Impact:** After changing speed, the TTS mini player may show "paused" even though speech is actively playing.

---

## Finding #31 — MEDIUM (P2): useVideoPreload has unused Video import and preloadRefs

**File:** `apps/mobile/src/hooks/useVideoPreload.ts`
**Lines:** 2, 10
**Code:**
```ts
import { Video } from 'expo-av';
// ...
const preloadRefs = useRef<Video[]>([]);
```
**Issue:** `Video` is imported and used as a type for `preloadRefs`, but `preloadRefs` is never read, pushed to, or iterated. It's dead code within dead code (the entire hook is unused per Finding #10).

**Impact:** Unnecessary import increases bundle size marginally.

---

## Finding #32 — MEDIUM (P2): useVideoPreloader loadStates Map grows without bound

**File:** `apps/mobile/src/hooks/useVideoPreloader.ts`
**Lines:** 25, 31-37
**Code:**
```ts
const [loadStates, setLoadStates] = useState<Map<string, VideoLoadState>>(new Map());

const updateState = useCallback((url: string, state: VideoLoadState) => {
  setLoadStates(prev => {
    const next = new Map(prev);
    next.set(url, state);
    return next;
  });
}, []);
```
**Issue:** While `preloadedUrls` is bounded at 20 entries (line 98-103), the `loadStates` Map in React state is never pruned. Every URL ever loaded gets a permanent entry in this Map. The `clearAll` function clears it, but during normal scrolling through a feed of 100+ reels, the Map grows to 100+ entries.

Also, `setLoadStates(prev => new Map(prev))` creates a new Map copy on every state update — O(n) allocation for each video preload state change.

**Impact:** Memory leak in React state. New Map allocation becomes expensive as the map grows.

**Fix:** Prune `loadStates` alongside `preloadedUrls` eviction, or use a bounded LRU structure.

---

## Finding #33 — LOW (P3): useAnimatedPress worklet annotation inside useCallback

**File:** `apps/mobile/src/hooks/useAnimatedPress.ts`
**Lines:** 19, 23
**Code:**
```ts
const onPressIn = useCallback(() => {
  'worklet';
  scale.value = withSpring(scaleTo, spring);
}, [scale, scaleTo, spring]);
```
**Issue:** The `'worklet'` directive inside a `useCallback` wrapped function is correct for Reanimated 2/3 when using workletized callbacks. However, the `spring` object in the dependency array is likely recreated if `options` changes, because destructuring creates a new reference:
```ts
const { scaleTo = 0.92, spring = animation.spring.bouncy } = options ?? {};
```
If `options` is `undefined`, `spring` defaults to `animation.spring.bouncy` which is a constant (from `as const`), so reference stability is maintained. But if `options.spring` is passed as a new object literal each render, the callbacks are recreated every render.

**Impact:** Minor performance concern. Most callers likely don't pass `spring` option, so the default constant is used and reference is stable.

---

## Finding #34 — LOW (P3): useAmbientColor hex-appending opacity may produce invalid colors

**File:** `apps/mobile/src/hooks/useAmbientColor.ts`
**Lines:** 74-75
**Code:**
```ts
const dom = `${primary}4D`;
const sec = `${accent}33`;
```
**Issue:** This appends hex alpha to the color string. But `react-native-image-colors` may return colors in various formats: `#RRGGBB`, `#RRGGBBAA`, `rgb(r,g,b)`, or named colors. Appending `4D` to `rgb(255,0,0)` produces `rgb(255,0,0)4D` which is invalid. Appending to `#RRGGBBAA` produces a 10-character hex string.

**Impact:** If `react-native-image-colors` returns non-hex format, the ambient color is invalid and may cause rendering issues or be ignored by React Native.

**Fix:** Normalize the color to hex format before appending alpha, or use a color manipulation library.

---

## Finding #35 — LOW (P3): useAmbientColor hash function may have poor distribution

**File:** `apps/mobile/src/hooks/useAmbientColor.ts`
**Lines:** 105-108
**Code:**
```ts
let hash = 0;
for (let i = 0; i < uri.length; i++) {
  hash = ((hash << 5) - hash + uri.charCodeAt(i)) | 0;
}
```
**Issue:** This is the djb2 hash function which is fine for general use, but CDN URLs often share long common prefixes (e.g., `https://pub-xxxx.r2.dev/uploads/videos/thumbnails/`) and only differ in the final path segment. The hash incorporates all characters equally, but the shared prefix dominates early iterations. For very similar URLs, the hue values may cluster.

**Impact:** Fallback ambient colors may look too similar for adjacent videos in a feed. Low severity since this is only the fallback when image color extraction fails.

---

## Finding #36 — LOW (P3): useFpsMonitor uses performance.now() which may not exist on all RN platforms

**File:** `apps/mobile/src/hooks/useFpsMonitor.ts`
**Lines:** 12-13
**Code:**
```ts
const lastTime = useRef(performance.now());
const lastLogTime = useRef(performance.now());
```
**Issue:** `performance.now()` is available in React Native via the JSC/Hermes engine, so this is generally fine. However, the `__DEV__` guard (line 47) protects against running in production, but the `useRef` initialization on lines 12-13 runs unconditionally (even in production). If `performance` were unavailable, it would crash on mount.

**Impact:** Very low risk since `performance` exists in modern RN engines. The `useRef` initializers execute in production even though the effect doesn't, wasting trivial CPU.

---

## Finding #37 — LOW (P3): useFpsMonitor console.log in dev only but no __DEV__ guard on tick

**File:** `apps/mobile/src/hooks/useFpsMonitor.ts`
**Lines:** 16-44
**Code:**
```ts
const tick = useCallback(() => {
  // ... no __DEV__ guard inside tick
}, [threshold, logInterval]);
```
**Issue:** The `tick` callback is created with `useCallback` outside the `__DEV__` guard. The `useEffect` on line 46 only runs the rAF loop if `__DEV__` is true, so `tick` is never called in production. But the `useCallback` allocation still happens in production.

**Impact:** Trivial wasted allocation. Could move `tick` definition inside the `__DEV__` block.

---

## Finding #38 — LOW (P3): useNetworkStatus may set isOffline=true when state.isConnected is null

**File:** `apps/mobile/src/hooks/useNetworkStatus.ts`
**Lines:** 9-10
**Code:**
```ts
const unsubscribe = NetInfo.addEventListener((state) => {
  setIsOffline(!state.isConnected);
});
```
**Issue:** `NetInfo`'s `state.isConnected` can be `null` (unknown) during initial detection. `!null` evaluates to `true`, so the app briefly shows as "offline" when network state is unknown (e.g., during app startup).

**Impact:** Brief flash of offline banner on app launch before network state resolves.

**Fix:**
```ts
setIsOffline(state.isConnected === false);  // Only show offline when explicitly false
```

---

## Finding #39 — LOW (P3): useIsWeb is a constant that doesn't need to be a hook

**File:** `apps/mobile/src/hooks/useIsWeb.ts`
**Lines:** 1-15
**Code:**
```ts
export function useIsWeb(): boolean {
  return Platform.OS === 'web';
}
```
**Issue:** `Platform.OS` is a compile-time constant in React Native — it never changes at runtime. This doesn't use any React hooks (no useState, useEffect, etc.), so it's a plain function masquerading as a hook. Using it as a hook means it can only be called inside components, but it could just be a constant export.

**Impact:** Not a bug but misleading API design. Callers must follow hook rules unnecessarily.

---

## Finding #40 — LOW (P3): useScrollDirection doesn't debounce rapid scroll events

**File:** `apps/mobile/src/hooks/useScrollDirection.ts`
**Lines:** 14-36
**Code:**
```ts
const onScroll = useCallback(
  (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const currentY = event.nativeEvent.contentOffset.y;
    const diff = currentY - scrollY.current;
    // ... withTiming animations on every scroll event
  },
  [headerHeight, tabBarHeight, headerTranslateY, tabBarTranslateY],
);
```
**Issue:** Every scroll event triggers `withTiming` animations. On fast scrolling, this fires dozens of times per second. While Reanimated handles interrupting animations gracefully, the frequent `withTiming` calls create many animation frames that are immediately superseded.

**Impact:** Minor performance concern. The 5px dead-zone (`diff > 5` / `diff < -5`) helps, but on fast flings, many animations start and are immediately canceled.

---

## Finding #41 — LOW (P3): useScrollDirection mutable ref not in useCallback deps

**File:** `apps/mobile/src/hooks/useScrollDirection.ts`
**Line:** 10
**Code:**
```ts
const scrollY = useRef(0);
// ...
const onScroll = useCallback(
  (event) => {
    const currentY = event.nativeEvent.contentOffset.y;
    const diff = currentY - scrollY.current;
    // ...
    scrollY.current = currentY;
  },
  [headerHeight, tabBarHeight, headerTranslateY, tabBarTranslateY],
);
```
**Issue:** `scrollY` is a mutable ref that's read and written inside `onScroll`, but it's not in the dependency array. This is actually correct behavior (refs are stable and don't need to be deps), but the linter may flag it. Not a bug.

**Impact:** None. This is correct React patterns.

---

## Finding #42 — LOW (P3): usePushNotificationHandler type-casts notification data unsafely

**File:** `apps/mobile/src/hooks/usePushNotificationHandler.ts`
**Line:** 91
**Code:**
```ts
const data = response.notification.request.content.data as NotificationData;
```
**Issue:** Blindly casting unknown push notification data to `NotificationData`. If the backend sends a notification with unexpected structure, or a push notification comes from a different source (Expo, FCM directly), the data may not match the expected type. The `handleNotificationNavigation` function does check `if (!data.type)`, which provides a minimal guard.

**Impact:** Low risk since there's a `!data.type` fallback. But if `data` is `null` or not an object, accessing `.type` would throw.

---

## Finding #43 — LOW (P3): usePushNotificationHandler creates duplicate foreground handler on re-render

**File:** `apps/mobile/src/hooks/usePushNotificationHandler.ts`
**Lines:** 48-70
**Code:**
```ts
useEffect(() => {
  const configureForegroundHandler = async () => {
    try {
      const Notifications = await import('expo-notifications');
      Notifications.setNotificationHandler({...});
    } catch {}
  };
  configureForegroundHandler();
}, []);
```
**Issue:** `setNotificationHandler` is called on mount with `[]` deps. If this hook is used in multiple components or the component remounts (e.g., navigation), the handler is set multiple times. `setNotificationHandler` replaces the previous handler, so this is idempotent — but the async import and handler setup run unnecessarily.

**Impact:** Negligible. The handler is set identically each time.

---

## Finding #44 — LOW (P3): usePushNotifications registered ref doesn't reset on sign-out

**File:** `apps/mobile/src/hooks/usePushNotifications.ts`
**Lines:** 8, 46, 79
**Code:**
```ts
const registered = useRef(false);
// ...
useEffect(() => {
  if (!isSignedIn || registered.current) return;
  // ...
  registered.current = true;
}, [isSignedIn]);
```
**Issue:** When `isSignedIn` transitions from `true` to `false` (sign-out) and back to `true` (sign-in as different user), `registered.current` remains `true` from the first registration. The new user's push token is never registered.

**Impact:** After sign-out and sign-in as a different user, push notifications continue going to the first user's token registration. The second user doesn't receive push notifications.

**Fix:** Reset `registered.current = false` when `isSignedIn` becomes `false`:
```ts
useEffect(() => {
  if (!isSignedIn) {
    registered.current = false;
    return;
  }
  if (registered.current) return;
  // ... register
}, [isSignedIn]);
```

---

## Finding #45 — LOW (P3): usePushNotifications token refresh listener uses wrong type

**File:** `apps/mobile/src/hooks/usePushNotifications.ts`
**Line:** 82
**Code:**
```ts
tokenSubscription.current = Notifications.addPushTokenListener(async (newToken) => {
  try {
    const newPlatform = Platform.OS === 'ios' ? 'ios' : 'android';
    await devicesApi.register(newToken.data, newPlatform);
  }
```
**Issue:** `addPushTokenListener` receives a `DevicePushToken` object, not an Expo push token. The `data` field on `DevicePushToken` is the native FCM/APNs token, not the Expo push token. But `devicesApi.register` likely expects an Expo push token (the `getExpoPushTokenAsync` result from line 73-75). Registering a native token where an Expo token is expected means push notifications via Expo's service won't work for refreshed tokens.

**Impact:** After a token refresh (rare event), push notifications may stop working because the wrong token format is registered.

---

## Finding #46 — LOW (P3): useTTS LANGUAGE_MAP is unused

**File:** `apps/mobile/src/hooks/useTTS.ts`
**Lines:** 9-18
**Code:**
```ts
const LANGUAGE_MAP: Record<string, string> = {
  en: 'en-US',
  ar: 'ar-SA',
  tr: 'tr-TR',
  ur: 'ur-PK',
  bn: 'bn-BD',
  fr: 'fr-FR',
  id: 'id-ID',
  ms: 'ms-MY',
};
```
**Issue:** `LANGUAGE_MAP` is defined but never used. The `detectLanguage` function (lines 41-58) hardcodes the same language codes inline instead of referencing this map. The map was presumably intended for mapping the current i18n locale to a TTS language, but that approach was replaced with content-based detection.

**Impact:** Dead code. Confusing to readers.

---

## Finding #47 — LOW (P3): useTTS detectLanguage falls back to English for Malay/Indonesian

**File:** `apps/mobile/src/hooks/useTTS.ts`
**Lines:** 56-57
**Code:**
```ts
// Check for Malay/Indonesian (harder to distinguish, use locale fallback)
return 'en-US';
```
**Issue:** The comment says "use locale fallback" but the function returns `'en-US'` instead of actually falling back to the user's locale. Malay and Indonesian text that doesn't contain special characters will be read aloud in English pronunciation, which sounds wrong.

**Impact:** Malay and Indonesian users hear their text read with English pronunciation. The `LANGUAGE_MAP` (Finding #46) was presumably meant to solve this but is unused.

**Fix:** Import the user's current locale and use `LANGUAGE_MAP` for the fallback:
```ts
return LANGUAGE_MAP[i18n.language] || 'en-US';
```

---

## Finding #48 — LOW (P3): useTTS isQuranText detection is too broad

**File:** `apps/mobile/src/hooks/useTTS.ts`
**Lines:** 28-39
**Code:**
```ts
function isQuranText(text: string): boolean {
  const quranPatterns = [
    /سورة/,            // "Surah" in Arabic
    /آية/,              // "Ayah" in Arabic
    /﷽/,               // Bismillah Unicode
    /بِسْمِ اللَّهِ/,    // Bismillah
    /\(\d+:\d+\)/,      // (2:255) style references
    /Surah\s+\w+/i,     // English surah references
    /Quran\s+\d+/i,     // Quran chapter references
  ];
  return quranPatterns.some((p) => p.test(text));
}
```
**Issue:** The pattern `\(\d+:\d+\)` matches any text containing parenthesized number:number patterns, like "(3:00)" (a time), "(1:2)" (a ratio), or code snippets. Similarly, any Arabic text mentioning "surah" (a common word) triggers this detection. This causes TTS to refuse to read legitimate non-Quran content.

The `بِسْمِ اللَّهِ` pattern is also very common in everyday Muslim writing (people begin letters/posts with Bismillah) and shouldn't block TTS.

**Impact:** TTS refuses to read many legitimate posts/threads that happen to contain these common patterns. Users tap "listen" and nothing happens.

---

## Finding #49 — LOW (P3): useResponsive getResponsiveInfo is called twice on mount

**File:** `apps/mobile/src/hooks/useResponsive.ts`
**Lines:** 32-33
**Code:**
```ts
const [info, setInfo] = useState<ResponsiveInfo>(() =>
  getResponsiveInfo(Dimensions.get('window').width),
);
```
**Issue:** The lazy initializer computes `getResponsiveInfo` on first mount. Then the `Dimensions.addEventListener` fires immediately with the current dimensions, calling `setInfo` again with the same value. React will bail out of the re-render since the value is the same (shallow comparison of object — wait, actually it's a new object every time, so it WILL re-render).

Actually, `getResponsiveInfo` returns a new object, and React uses `Object.is` comparison for state updates. A new object with same values !== previous object, so the component re-renders once unnecessarily on mount.

**Impact:** One extra render on mount. Negligible.

---

## Finding #50 — LOW (P3): useWebKeyboardShortcuts Esc prevents default even when can't go back

**File:** `apps/mobile/src/hooks/useWebKeyboardShortcuts.ts`
**Lines:** 37-42
**Code:**
```ts
if (e.key === 'Escape') {
  e.preventDefault();
  if (router.canGoBack()) {
    router.back();
  }
  return;
}
```
**Issue:** `e.preventDefault()` is called before checking `router.canGoBack()`. If the user is on the root screen and presses Escape, the browser default Escape behavior is suppressed but no navigation happens. On web, Escape is sometimes used to exit fullscreen or close native dialogs — this suppression could interfere.

**Impact:** Minor web UX issue. Escape key does nothing when there's no history, but prevents browser defaults.

**Fix:** Move `e.preventDefault()` inside the `canGoBack()` check.

---

## Finding #51 — LOW (P3): useVideoPreloader preloadCount is a ref that's read synchronously

**File:** `apps/mobile/src/hooks/useVideoPreloader.ts`
**Line:** 138
**Code:**
```ts
preloadCount: preloadedUrls.current.size,
```
**Issue:** The returned `preloadCount` reads from a ref synchronously during render. Since refs don't trigger re-renders, `preloadCount` may be stale — it shows the count at the time of the last render, not the current actual count. If `onViewableChange` adds or evicts URLs between renders, consumers see a stale number.

**Impact:** Any UI displaying "X videos preloaded" shows outdated count.

---

## Finding #52 — LOW (P3): useVideoPreloader isReady has empty dependency array

**File:** `apps/mobile/src/hooks/useVideoPreloader.ts`
**Lines:** 116-118
**Code:**
```ts
const isReady = useCallback((url: string): boolean => {
  return preloadedUrls.current.has(url);
}, []);
```
**Issue:** The `useCallback` with `[]` deps means the function reference is stable. However, `preloadedUrls.current` is a mutable ref, so the function's behavior changes over time even though the reference doesn't. This is correct React pattern (refs don't need to be in deps), but consumers who rely on reference equality to detect "something changed" (e.g., in a `useMemo` or `useEffect` dep array) won't re-evaluate when the preloaded set changes.

**Impact:** Consumers that check `isReady(url)` in a `useMemo` dep array won't recompute when the url becomes ready. They need to use `getLoadState` instead, which is backed by React state.

---

## Dead Code Summary

The following hooks are completely unused (zero consumers outside their definition file):

| Hook | File | Lines of Code |
|------|------|---------------|
| `useReducedMotion` | useReducedMotion.ts | 45 |
| `useAccessibleAnimation` | useReducedMotion.ts | (same file) |
| `usePayment` | usePayment.ts | 122 |
| `useFpsMonitor` | useFpsMonitor.ts | 54 |
| `useVideoPreload` | useVideoPreload.ts | 52 |
| `useBackgroundUpload` | useBackgroundUpload.ts | 91 |
| `usePulseGlow` | usePulseGlow.ts | 41 |
| `clearAmbientCache` | useAmbientColor.ts | 3 |

**Total dead hook code: ~408 lines across 6 files (+ 1 function)**

---

## Hooks with Only 1-2 Consumers (fragile wiring)

| Hook | Consumers |
|------|-----------|
| `useAmbientColor` | VideoPlayer.tsx only |
| `useEntranceAnimation` | EmptyState.tsx only |
| `useIsEidToday` | _layout.tsx only |
| `useScrollDirection` | saf.tsx only |
| `useVideoPreloader` | bakra.tsx only |
| `useWebKeyboardShortcuts` | (tabs)/_layout.tsx only |
| `useIslamicTheme` | _layout.tsx only |

---

## Cross-Reference with Previous Audit (Agent Index)

The previous audit index entry for Agent #32 listed 30 findings with top items:
- useChatLock JSON.parse without try/catch (crash) -- **Confirmed, Finding #1**
- useTranslation isRTL ignores Urdu -- **Confirmed, Finding #3**
- useBackgroundUpload no unmount cleanup -- **Confirmed, Finding #5**

This deep audit found **52 findings** (vs the 30 estimated), including additional critical items:
- useChatLock bypasses auth when no biometrics (Finding #2)
- useTranslation changeLanguage restricted to 2 of 8 languages (Finding #4)
- 7 completely dead hooks with ~408 lines of unused code
- usePushNotifications doesn't re-register after sign-out/sign-in (Finding #44)
- usePushNotifications token refresh sends wrong token format (Finding #45)
- useTTS resume restarts from beginning (Finding #29)
- useTTS speed change race condition (Finding #30)
