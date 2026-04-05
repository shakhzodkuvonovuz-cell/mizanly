# I13: Mobile Provider Tree Audit

**Scope:** `apps/mobile/app/_layout.tsx` provider hierarchy, ordering, failure handling, cleanup on sign-out.

**Auditor:** Hostile code audit, 2026-04-05

---

## Provider Tree (outside-in)

```
GestureHandlerRootView          (1) gesture system root
  ErrorBoundary                 (2) crash boundary
    ClerkProvider               (3) auth context
      ClerkLoaded               (4) blocks render until Clerk SDK ready
        QueryClientProvider     (5) React Query cache
          SocketProvider        (6) Socket.io connection
            [all children]      (7) UI, handlers, Stack navigator
```

---

## Findings

### I13-01 [HIGH] No SafeAreaProvider in the tree

**What:** The entire app has no `<SafeAreaProvider>` wrapping. The `react-native-safe-area-context` `SafeAreaProvider` must be a high-level ancestor for `useSafeAreaInsets()` and `<SafeAreaView>` to work correctly.

**Impact:** On iOS devices with notches (iPhone X+) and Android with display cutouts, screens that rely on `useSafeAreaInsets()` will get incorrect values (defaults to 0) or throw. Any screen using `SafeAreaView` from `react-native-safe-area-context` (as opposed to the deprecated RN built-in) requires the provider.

**Evidence:** Grep for `SafeAreaProvider` across `apps/mobile` returned zero files. The import does not exist in `_layout.tsx`.

**Risk:** Layout broken on every notch device. Practically every modern phone.

---

### I13-02 [HIGH] QueryClient is module-level singleton -- persists across sign-out/sign-in cycles

**What:** `const queryClient = new QueryClient(...)` is declared at module scope (line 207), outside any component. When User A signs out and User B signs in, the same `queryClient` instance is reused. User B's session inherits User A's stale cached query data.

**Evidence:**
- `_layout.tsx` line 207: `const queryClient = new QueryClient({...})` -- module scope, never recreated.
- Sign-out in `settings.tsx` line 242: `storeLogout(); queryClient.clear(); await signOut();` -- calls `queryClient.clear()`.
- Sign-out in `account-switcher.tsx` line 156-158: `await signOut(); queryClient.clear();` -- calls clear AFTER signOut (race: Clerk auth removed before cache cleared, so in-flight queries with old auth may re-populate cache).

**Partial mitigation:** `queryClient.clear()` is called in `settings.tsx`. However:
1. **Not called in `_layout.tsx` AuthGuard** -- if Clerk's 30-day session timeout triggers `signOut()` (line 333), no `queryClient.clear()` is called. User's old data persists in cache until next cold start.
2. **Not called in `account-settings.tsx`** -- deactivate/delete account calls `signOut()` (lines 151, 159) without clearing the query cache.
3. **Not called in `banned.tsx`** -- banned user sign-out (line 30) does not clear cache.
4. **Not called in `manage-data.tsx`** -- delete account flow (line 221) does not clear cache.
5. **Race in account-switcher.tsx** -- `signOut()` fires before `queryClient.clear()`, allowing in-flight queries to refresh with error responses that pollute the cache.

**Data leak scenario:** User A signs out via session timeout. User B signs in on same device. User B sees User A's cached feed, conversations, notifications until queries naturally expire (5 minute staleTime).

---

### I13-03 [MEDIUM] Clerk failure is not handled -- app renders nothing on Clerk SDK init failure

**What:** `ClerkLoaded` (line 603) blocks rendering until Clerk's SDK initializes. If Clerk's backend is unreachable (DNS failure, Clerk outage, airplane mode on cold start), the app shows a blank screen indefinitely. There is no timeout, fallback UI, or error state.

**Evidence:** The tree is `ClerkProvider > ClerkLoaded > QueryClientProvider > ...`. If Clerk SDK cannot load (e.g., no network on first launch), `ClerkLoaded` never renders its children. The user sees the splash screen forever (or a white screen after splash hides at line 537).

**Note:** `SplashScreen.hideAsync()` is called on fonts loaded (line 537), which happens independently of Clerk. So the splash hides, revealing nothing.

---

### I13-04 [MEDIUM] SocketProvider cleanup on sign-out is correct, but Signal Protocol sessions are NOT cleaned up

**What:** `SocketProvider` correctly disconnects the socket when `isSignedIn` becomes false (lines 63-71). However, `initSignal()` (line 310) initializes the Signal Protocol with the current user's identity and pre-warms sessions with their contacts. When sign-out occurs:
- Socket is disconnected (good)
- QueryClient may or may not be cleared (see I13-02)
- Zustand store is partially reset (good)
- **Signal Protocol sessions, identity keys, and pre-warmed session state are NOT cleaned up**

**Evidence:** `initSignal()` is called in AuthGuard's useEffect (line 289-312) when `isSignedIn && user?.id`. But there is no corresponding cleanup in the useEffect's return function. The useEffect dependency array is `[isSignedIn, getToken, user?.id]` -- when `isSignedIn` flips to false, the effect re-runs but only the `if (!isSignedIn || !user?.id) return;` guard fires, executing no cleanup.

**Impact:** Signal Protocol stores (MMKV with AEAD-encrypted sessions) from User A remain on-device when User B signs in. While encrypted, they consume storage and could confuse the protocol if User B happens to message the same contacts.

---

### I13-05 [MEDIUM] Provider ordering: SocketProvider wraps UI but has no dependency on QueryClient

**What:** The `SocketProvider` is nested inside `QueryClientProvider`. This is correct for components that need both. However, the `SocketProvider` itself does NOT use React Query -- it uses raw `useAuth()` from Clerk and direct Zustand store. The nesting works but is misleading.

More importantly, components that render BETWEEN `QueryClientProvider` and `SocketProvider` (like `ThemeAwareStatusBar`, `OfflineBanner`, `CallActiveBar`, `IslamicThemeBanner`, `AuthGuard`, `AppStateHandler`) are inside `SocketProvider` but several of them don't need socket access. This is fine architecturally but means:

**Real issue:** `AuthGuard` and `AppStateHandler` are INSIDE `SocketProvider`. If `SocketProvider` throws during render (which it won't in current code, but would if someone adds error-throwing logic), it would take down the auth redirect logic.

**Severity note:** This is a design smell, not a bug. Current code is safe.

---

### I13-06 [MEDIUM] Multiple AppState.addEventListener subscriptions compete

**What:** Four separate components each register their own `AppState.addEventListener('change', ...)`:
1. `focusManager.setEventListener` (line 200) -- React Query focus refetch
2. `AppStateHandler` (line 399) -- invalidates stale queries + widget sync
3. `BiometricLockOverlay` (line 436) -- triggers biometric auth on foreground
4. `SocketProvider` (line 154) -- disconnects on background, reconnects on foreground

**Issue:** All four fire on every app state change. The biometric lock overlay can block the screen while the socket reconnects and queries invalidate in the background. If biometric auth fails or is cancelled, the user can't interact with the app while stale data is being refetched behind the lock overlay. This isn't a bug per se, but:

- The biometric prompt fires EVERY time the app comes to foreground (line 437-447), even if the user was only away for 1 second (switching apps briefly). There is no debounce or minimum-away threshold.
- The React Query `focusManager` and `AppStateHandler` both trigger refetches simultaneously, potentially doubling network traffic on foreground.

---

### I13-07 [LOW] EidCelebrationOverlay uses setTimeout without cleanup handle

**What:** Line 170: `setTimeout(() => setShowCelebration(false), 3000)`. If the component unmounts before the timeout fires (e.g., fast navigation), `setShowCelebration(false)` is called on an unmounted component.

**Evidence:** React strict mode would warn about state updates on unmounted components. In production, this is a no-op (React ignores it), but it's sloppy.

---

### I13-08 [LOW] initCallKit() and setCallKitHandlers() execute at module-import time

**What:** Lines 50-69 execute at the top of the module, before any React component mounts. `initCallKit()` and `setCallKitHandlers()` are called during JS bundle evaluation.

**Concern:** `setCallKitHandlers` at line 66 calls `useStore.getState()` inside the `onEndCall` handler. This is fine (Zustand supports getState outside React), but the `navigate()` call in `onAnswerCall` (line 55) uses the `navigate` utility from `@/utils/navigation`, which depends on the navigation container being mounted. Before the app fully renders, `navigate()` would fail silently or queue.

**Mitigation present:** `setNavigationReady()` is called from AuthGuard (line 264) once the navigation state is ready, which gates queued events. This is a reasonable pattern.

---

### I13-09 [LOW] Mutation onMutate handler is incomplete / dead code

**What:** Lines 217-222 in the QueryClient mutation defaults:
```typescript
onMutate: () => {
  const { NetInfo } = require('@react-native-community/netinfo') ?? {};
  // Simple check: if the store says offline, reject early
  // (The actual network check happens via useNetworkStatus hook)
},
```

This handler requires `@react-native-community/netinfo`, destructures it, then does **nothing** with it. The comment says "Block mutations when offline" but no blocking logic exists. The `require()` runs on every mutation start, adding unnecessary module resolution overhead.

---

### I13-10 [INFO] No BottomSheetModalProvider

**What:** The app uses bottom sheets (per mobile-screens rules: `<BottomSheet>` instead of Modal). If `@gorhom/bottom-sheet`'s `BottomSheetModalProvider` is required (it is for `BottomSheetModal` usage), it's missing from the provider tree.

**Evidence:** `BottomSheetModalProvider` does not appear in `_layout.tsx`. If any screen uses `BottomSheetModal` (as opposed to the basic `BottomSheet`), it would crash at runtime.

---

## Summary Table

| ID | Severity | Finding | Impact |
|----|----------|---------|--------|
| I13-01 | HIGH | No SafeAreaProvider | Broken layout on every notched device |
| I13-02 | HIGH | QueryClient persists across sign-out (4+ sign-out paths miss `.clear()`) | User A's data leaked to User B |
| I13-03 | MEDIUM | No Clerk failure/timeout fallback | Infinite blank screen on Clerk outage |
| I13-04 | MEDIUM | Signal Protocol sessions not cleaned on sign-out | Stale E2E sessions persist across users |
| I13-05 | MEDIUM | Provider ordering: SocketProvider wrapping is fine but AuthGuard inside it | Design smell |
| I13-06 | MEDIUM | 4 competing AppState listeners, no biometric debounce | Double refetch, biometric on every 1s switch |
| I13-07 | LOW | setTimeout without cleanup in EidCelebrationOverlay | React warning on unmount |
| I13-08 | LOW | CallKit init at module-import time | Acceptable with navigationReady gate |
| I13-09 | LOW | Mutation onMutate handler is dead code | Wasted require() on every mutation |
| I13-10 | INFO | No BottomSheetModalProvider | Runtime crash if BottomSheetModal used |

**Counts:** 2 HIGH, 4 MEDIUM, 3 LOW, 1 INFO = 10 findings total.
