# Agent #34 — Auth + Onboarding Screens Deep Audit

**Scope:** All auth and onboarding mobile screens (9 files)
**Agent:** Claude Opus 4.6 (1M context) — Audit Agent #34 of 67
**Date:** 2026-03-21

## Files Audited (line by line)

| File | Lines | Path |
|------|-------|------|
| Auth Layout | 11 | `apps/mobile/app/(auth)/_layout.tsx` |
| Sign In | 302 | `apps/mobile/app/(auth)/sign-in.tsx` |
| Sign Up | 473 | `apps/mobile/app/(auth)/sign-up.tsx` |
| Forgot Password | 226 | `apps/mobile/app/(auth)/forgot-password.tsx` |
| Onboarding Layout | 12 | `apps/mobile/app/onboarding/_layout.tsx` |
| Username | 252 | `apps/mobile/app/onboarding/username.tsx` |
| Profile | 298 | `apps/mobile/app/onboarding/profile.tsx` |
| Interests | 199 | `apps/mobile/app/onboarding/interests.tsx` |
| Suggested | 166 | `apps/mobile/app/onboarding/suggested.tsx` |
| Root Layout (AuthGuard) | 367 | `apps/mobile/app/_layout.tsx` |

**Total findings: 42**

---

## FINDING 1 — CRITICAL / SHIP BLOCKER
**interests.tsx has a SYNTAX ERROR on line 2-4 — entire onboarding screen will not compile**

- **File:** `apps/mobile/app/onboarding/interests.tsx`
- **Lines:** 2-4
- **Code:**
```tsx
import {
  View, Text, Pressable, StyleSheet, ScrollView,
import { useRouter, useLocalSearchParams } from 'expo-router';
```
- **Issue:** The destructured import from `react-native` opens `{` on line 2 but NEVER closes with `}` before line 4 starts a completely new `import` statement. The closing brace and `from 'react-native'` are missing entirely. This is an unclosed import statement — a JavaScript syntax error.
- **Impact:** The interests screen will fail to compile. Metro bundler will throw a parse error. Since this is a mandatory step in onboarding, NO new user can complete onboarding. The entire onboarding flow is broken.
- **Fix:** Line 3 should end with `} from 'react-native';` and line 4 should be the next import.

---

## FINDING 2 — CRITICAL / SHIP BLOCKER
**onboardingComplete is only set in suggested.tsx, but interests.tsx skips suggested screen entirely — infinite onboarding loop**

- **File:** `apps/mobile/app/onboarding/interests.tsx` line 71, `apps/mobile/app/onboarding/suggested.tsx` line 44, `apps/mobile/app/_layout.tsx` line 194
- **Code (interests.tsx line 71):**
```tsx
router.replace('/(tabs)/saf');
```
- **Code (suggested.tsx line 44):**
```tsx
await user?.update({ unsafeMetadata: { onboardingComplete: true } });
```
- **Code (_layout.tsx line 194):**
```tsx
const hasUsername = !!(user?.unsafeMetadata?.onboardingComplete);
```
- **Issue:** The interests screen (line 70-71) explicitly says `// 2-step onboarding: go directly to app (skip suggested)` and calls `router.replace('/(tabs)/saf')` — it never navigates to the suggested screen. The suggested screen is the ONLY place that sets `onboardingComplete: true` in Clerk metadata. Therefore, `onboardingComplete` is NEVER set. The AuthGuard in `_layout.tsx` line 194-196 checks `user?.unsafeMetadata?.onboardingComplete` and if it's falsy, redirects to `/onboarding/username`. This creates an infinite loop: user completes onboarding -> lands on tabs -> AuthGuard runs -> onboardingComplete is undefined -> redirects back to onboarding.
- **Impact:** Every new user will be stuck in an infinite onboarding loop. They can never reach the main app.
- **Fix:** Either (a) set `onboardingComplete: true` in the interests screen's `handleContinue` and `handleSkip` before navigating, or (b) don't skip the suggested screen.

---

## FINDING 3 — CRITICAL / SHIP BLOCKER
**Username chosen in onboarding is NEVER saved to the backend**

- **File:** `apps/mobile/app/onboarding/username.tsx` lines 113-121
- **Code:**
```tsx
const handleContinue = async () => {
    if (!isValid) return;
    setLoading(true);
    try {
      // Skip profile step — go directly to interests (2-step onboarding)
      router.push({ pathname: '/onboarding/interests', params: { username } });
    } finally {
      setLoading(false);
    }
  };
```
- **Issue:** The username screen checks availability with `authApi.checkUsername`, but when the user presses Continue, it ONLY navigates to interests — it does NOT call `authApi.register()` or any other endpoint to save the username. The username is passed as a navigation param to interests, but interests doesn't save it either. The profile screen (`profile.tsx`) would have saved it via `usersApi.updateMe({ username })`, but the profile screen is SKIPPED (comment on line 117: "Skip profile step").
- **Secondary issue:** Even if the profile screen were not skipped, `usersApi.updateMe` calls `PATCH /users/me` which uses `UpdateProfileDto`. The `UpdateProfileDto` does NOT have a `username` field. With `forbidNonWhitelisted: true` in main.ts (line 92), sending `username` in the request body would cause a 400 Bad Request error.
- **Impact:** After onboarding, the user has no username set in the Mizanly backend. The user's profile will show the auto-generated `user_<clerkId>` username from the webhook handler, not the one they chose.
- **Fix:** Call `authApi.register()` in the username screen's handleContinue to persist the username to the backend. Or add `username` to `UpdateProfileDto`.

---

## FINDING 4 — CRITICAL
**authApi.register() is NEVER called anywhere in the mobile app**

- **File:** `apps/mobile/src/services/api.ts` line 213-214
- **Code:**
```tsx
register: (data: { clerkId: string; username: string; displayName: string; avatarUrl?: string }) =>
    api.post<User>('/auth/register', data),
```
- **Issue:** The `authApi.register` method exists in the API service but is never imported or called anywhere in the mobile codebase. The backend `POST /auth/register` endpoint creates the user in the database with the chosen username and display name. Without calling it, the user record is only created by the Clerk webhook handler (if configured — and per CLAUDE.md, `CLERK_WEBHOOK_SECRET` is EMPTY, so webhooks are broken too).
- **Impact:** New users may have no database record at all, or only a webhook-created record with auto-generated username `user_<last8chars>`.
- **Fix:** Call `authApi.register()` during onboarding after username selection.

---

## FINDING 5 — CRITICAL
**authApi.updateProfile does not exist — interests.tsx will throw TypeError**

- **File:** `apps/mobile/app/onboarding/interests.tsx` line 64
- **Code:**
```tsx
await authApi.updateProfile({ madhab: selectedMadhab }).catch(() => {});
```
- **Issue:** The `authApi` object (defined in `api.ts` lines 212-220) has these methods: `register`, `me`, `checkUsername`, `setInterests`, `suggestedUsers`. There is NO `updateProfile` method. Calling `authApi.updateProfile()` will throw `TypeError: authApi.updateProfile is not a function`. The `.catch(() => {})` on the same line will catch the TypeError and silently swallow it, so the madhab is never saved. However, if the syntax error (Finding #1) is fixed first, this error will silently fail.
- **Impact:** User's madhab selection is never saved to the backend.
- **Fix:** Either add `updateProfile` to `authApi`, or use `usersApi.updateMe({ madhab })` — but note that `madhab` is also not in `UpdateProfileDto`, so the backend DTO would need updating too.

---

## FINDING 6 — CRITICAL
**madhab field cannot be saved via any existing endpoint**

- **File:** `apps/api/src/modules/users/dto/update-profile.dto.ts` (no `madhab` field)
- **Prisma schema line 270:** `madhab String? @db.VarChar(20)` exists on User model
- **Issue:** The User model has a `madhab` field, but `UpdateProfileDto` does not include it. Even if `authApi.updateProfile` existed and called `PATCH /users/me`, the `madhab` field would be rejected by `forbidNonWhitelisted: true` validation. The `RegisterDto` also doesn't include `madhab`. There is NO endpoint that can set the user's madhab.
- **Impact:** The entire madhab selection UI in onboarding is cosmetic-only — it can never be persisted.
- **Fix:** Add `madhab` to `UpdateProfileDto` or `RegisterDto`.

---

## FINDING 7 — HIGH
**Social auth buttons are non-functional stubs (sign-in and sign-up)**

- **File:** `apps/mobile/app/(auth)/sign-in.tsx` lines 183-199
- **File:** `apps/mobile/app/(auth)/sign-up.tsx` lines 310-317
- **Code (sign-in.tsx):**
```tsx
<Pressable
  style={({ pressed }) => [styles.socialBtn, pressed && styles.socialBtnPressed]}
  onPress={() => haptic.light()}
>
```
- **Code (sign-up.tsx):**
```tsx
<Pressable style={({ pressed }) => [styles.socialBtn, pressed && styles.socialBtnPressed]}>
  <Text style={styles.socialText}>{t('auth.google')}</Text>
</Pressable>
```
- **Issue:** The Google and Apple social auth buttons do nothing. On sign-in, they only trigger a haptic vibration. On sign-up, they don't even have an `onPress` handler at all. Clerk supports OAuth providers, but the Clerk OAuth flow is not wired up.
- **Impact:** Users who expect to sign in with Google/Apple will tap the buttons and nothing will happen. Misleading UI.
- **Fix:** Either implement Clerk OAuth flow (`useOAuth` hook) or remove/disable the social buttons with a "Coming soon" indicator.

---

## FINDING 8 — HIGH
**6 i18n keys used in sign-up.tsx are MISSING from all language files**

- **File:** `apps/mobile/app/(auth)/sign-up.tsx`
- **Missing keys:**
  1. `auth.passwordPlaceholderMin` (line 250) — used as password placeholder
  2. `auth.termsAgreement` (line 299) — terms text
  3. `auth.checkEmail` (line 129) — verification heading
  4. `auth.verificationSent` (line 131) — verification subtitle
  5. `auth.checkSpam` (line 165) — spam folder hint
  6. `auth.verifyEmail` (line 168) — verify button label
  7. `auth.joinTitle` (line 215) — sign-up heading
- **Issue:** These keys do not exist in `apps/mobile/src/i18n/en.json` or any other language file. The `t()` function will return the raw key string (e.g., `"auth.checkEmail"`) as fallback, which users will see as literal text.
- **Impact:** Sign-up screen will show raw i18n key strings instead of user-friendly text. Affects all 8 languages.
- **Fix:** Add all 7 keys to all 8 language files.

---

## FINDING 9 — HIGH
**Forgot-password screen: no navigation after successful password reset**

- **File:** `apps/mobile/app/(auth)/forgot-password.tsx` lines 79-84
- **Code:**
```tsx
const result = await signIn.resetPassword({ password: newPassword });
if (result.status === 'complete') {
    await setActive({ session: result.createdSessionId });
    Alert.alert(t('common.success'), t('auth.passwordResetSuccess'));
}
```
- **Issue:** After a successful password reset, the code calls `setActive` (which creates a session) and shows a blocking `Alert.alert`. The AuthGuard in `_layout.tsx` will detect the session change and try to navigate, but the Alert dialog is blocking. The user is left on the password reset screen with a modal alert. After dismissing the alert, the AuthGuard redirect might fire (depends on timing), but there's no explicit `router.replace` to take the user to the appropriate destination.
- **Impact:** Confusing UX — user sees "Password reset successfully" but stays on the reset screen. Race condition between Alert dismissal and AuthGuard redirect.
- **Fix:** Replace `Alert.alert` with a proper navigation: `router.replace('/(tabs)/saf')` or show a toast instead of a blocking alert.

---

## FINDING 10 — HIGH
**Sign-up verification: no back button to return from verification to signup form**

- **File:** `apps/mobile/app/(auth)/sign-up.tsx` lines 117-191
- **Issue:** Once `pendingVerification` is set to `true`, the entire screen renders the verification UI. There is no back button, no way to go back to the email/password form if the user entered the wrong email. The user is stuck on the verification screen. The only way out is to force-close the app.
- **Impact:** If a user enters the wrong email during signup, they cannot correct it. They must close and reopen the app.
- **Fix:** Add a back/cancel button that sets `setPendingVerification(false)` to return to the signup form.

---

## FINDING 11 — HIGH
**Username screen: username is not reserved/saved during availability check — race condition**

- **File:** `apps/mobile/app/onboarding/username.tsx` lines 99-109, 113-121
- **Issue:** The username availability check (`authApi.checkUsername`) only checks if the username exists in the database at check time. Between the time the check returns `available: true` and the user completes onboarding, another user could register the same username. The username is never reserved or locked. The backend `checkUsername` (auth.service.ts line 109-113) does a simple `findUnique` with no locking.
- **Impact:** Two users going through onboarding simultaneously could both see the same username as "available", and the second one to register would get a conflict error (or worse, silently fail since `register` is never called — see Finding #4).
- **Fix:** Use a database advisory lock or short-lived reservation record to hold the username during onboarding.

---

## FINDING 12 — HIGH
**Onboarding flow skips profile screen but references it in layout**

- **File:** `apps/mobile/app/onboarding/_layout.tsx` lines 6-7, `apps/mobile/app/onboarding/username.tsx` line 118
- **Code (layout):**
```tsx
<Stack.Screen name="username" />
<Stack.Screen name="profile" />
<Stack.Screen name="interests" />
<Stack.Screen name="suggested" />
```
- **Code (username.tsx):**
```tsx
router.push({ pathname: '/onboarding/interests', params: { username } });
```
- **Issue:** The onboarding layout defines 4 screens (username -> profile -> interests -> suggested), but the username screen skips directly to interests, and interests skips directly to tabs. The profile and suggested screens are unreachable in the current flow. This means:
  - Profile screen (display name, bio, avatar) is never shown — users never set their display name during onboarding
  - Suggested screen (follow suggestions, `onboardingComplete` setter) is never shown — causing the infinite loop (Finding #2)
- **Impact:** 2 of 4 onboarding screens are dead code. Display name never set. `onboardingComplete` never set.
- **Fix:** Either restore the full 4-step flow, or properly implement the 2-step flow by moving `onboardingComplete` and `register` calls into the interests screen.

---

## FINDING 13 — HIGH
**AuthGuard allows anonymous browsing but has inconsistent redirect logic**

- **File:** `apps/mobile/app/_layout.tsx` lines 181-201
- **Code:**
```tsx
if (!isSignedIn) {
    // Allow anonymous browsing of feed tabs — only redirect to auth if in onboarding
    if (inOnboarding) router.replace('/(auth)/sign-in');
    // If user is already in auth screens or tabs, let them stay
} else {
    // Signed in but no username set → onboarding
    const hasUsername = !!(user?.unsafeMetadata?.onboardingComplete);
    if (!hasUsername && !inOnboarding) {
        router.replace('/onboarding/username');
    } else if (hasUsername && (inAuthGroup || inOnboarding)) {
        router.replace('/(tabs)/saf');
    }
}
```
- **Issue 1:** The variable is named `hasUsername` but actually checks `onboardingComplete`, not whether a username exists. Misleading variable name.
- **Issue 2:** Anonymous users can browse tabs but can perform no actions (all API calls require auth). There's no gate when they try to interact — they'll get raw 401 errors from the API with no user-friendly redirect to sign-in.
- **Issue 3:** The `user?.unsafeMetadata` Clerk property is only available after a network call to Clerk. On slow connections, `user` might be partially loaded, causing the check to fail and trigger unnecessary onboarding redirects for returning users.
- **Impact:** Returning users on slow connections may be briefly redirected to onboarding, then back to tabs. Anonymous users get raw errors when trying to interact.

---

## FINDING 14 — MEDIUM
**Sign-in: 2FA redirect navigates to wrong screen path pattern**

- **File:** `apps/mobile/app/(auth)/sign-in.tsx` line 63
- **Code:**
```tsx
router.push('/(screens)/2fa-verify' as never);
```
- **Issue:** When Clerk returns `needs_second_factor`, the user is pushed to the 2FA verify screen. However, this navigates to the standalone 2FA screen in `(screens)` which is designed for settings-based 2FA verification, not for the sign-in flow. The 2FA verify screen (`apps/mobile/app/(screens)/2fa-verify.tsx`) may not properly complete the sign-in flow after verification — it likely has its own navigation logic.
- **Impact:** 2FA sign-in flow may break or behave unexpectedly because the standalone 2FA screen is not integrated with the sign-in session flow.
- **Fix:** Either create a dedicated 2FA verification step within the auth flow, or ensure the 2fa-verify screen handles the sign-in continuation case.

---

## FINDING 15 — MEDIUM
**Sign-in: Keyboard dismiss wrapper breaks accessibility**

- **File:** `apps/mobile/app/(auth)/sign-in.tsx` line 76
- **Code:**
```tsx
<Pressable style={{ flex: 1 }} onPress={Keyboard.dismiss} accessible={false}>
```
- **Issue:** The entire screen content is wrapped in a `Pressable` with `accessible={false}`. While `accessible={false}` hides this wrapper from the accessibility tree, the interaction model is unusual — a full-screen Pressable intercepting all taps. This can interfere with screen readers and touch event propagation.
- **Impact:** Minor accessibility concern — screen reader users may have difficulty navigating if the Pressable intercepts events unexpectedly.
- **Fix:** Use `Pressable` only on a background overlay area, or use a different approach like `TouchableWithoutFeedback` with `onPress={Keyboard.dismiss}`.

---

## FINDING 16 — MEDIUM
**Sign-up: Resend code button has empty catch — no user feedback**

- **File:** `apps/mobile/app/(auth)/sign-up.tsx` lines 176-181
- **Code:**
```tsx
onPress={async () => {
    try {
        await signUp?.prepareEmailAddressVerification({ strategy: 'email_code' });
    } catch {}
}}
```
- **Issue:** The resend code button catches all errors silently with an empty `catch {}`. If the resend fails (network error, rate limit), the user gets no feedback — they think the code was sent when it wasn't.
- **Impact:** Users may wait for a code that was never sent. No loading indicator during resend either.
- **Fix:** Show a success toast on successful resend, and an error message on failure. Add a loading state and rate-limit the resend button (e.g., 60-second cooldown).

---

## FINDING 17 — MEDIUM
**Sign-up: Social auth buttons have no onPress handler at all**

- **File:** `apps/mobile/app/(auth)/sign-up.tsx` lines 311-316
- **Code:**
```tsx
<Pressable style={({ pressed }) => [styles.socialBtn, pressed && styles.socialBtnPressed]}>
    <Text style={styles.socialText}>{t('auth.google')}</Text>
</Pressable>
<Pressable style={({ pressed }) => [styles.socialBtn, pressed && styles.socialBtnPressed]}>
    <Text style={styles.socialText}>{t('auth.apple')}</Text>
</Pressable>
```
- **Issue:** Unlike sign-in (which at least calls `haptic.light()`), the sign-up social buttons have NO `onPress` prop at all. They are completely inert — pressing them does absolutely nothing (not even a haptic).
- **Impact:** Buttons are clickable (they show pressed state via the style callback) but do nothing. Confusing for users.

---

## FINDING 18 — MEDIUM
**suggested.tsx: Duplicate accessibilityRole prop on Pressable elements**

- **File:** `apps/mobile/app/onboarding/suggested.tsx` lines 94 and 109
- **Code:**
```tsx
<Pressable accessibilityRole="button" accessibilityRole="button"
```
- **Issue:** The `accessibilityRole` prop is specified twice on the same element. In React, later props overwrite earlier ones, so this technically works (second value wins), but it indicates a copy-paste error and triggers ESLint `jsx-no-duplicate-props` warnings.
- **Impact:** Code quality issue. No functional impact but indicates sloppy code.
- **Fix:** Remove the duplicate `accessibilityRole="button"`.

---

## FINDING 19 — MEDIUM
**suggested.tsx: FlatList missing RefreshControl — violates mandatory code rule**

- **File:** `apps/mobile/app/onboarding/suggested.tsx` line 79-105
- **Code:**
```tsx
<FlatList
    removeClippedSubviews={true}
    data={suggested || []}
    ...
/>
```
- **Issue:** Per CLAUDE.md rule #7: "ALL FlatLists must have `<RefreshControl>`". This FlatList has no `onRefresh`, `refreshing`, or `RefreshControl` prop.
- **Impact:** Users cannot pull-to-refresh the suggested users list if it fails to load or shows stale data.
- **Fix:** Add `onRefresh` and `refreshing` props or wrap with `<RefreshControl>`.

---

## FINDING 20 — MEDIUM
**suggested.tsx: Loading state for "Get Started" button uses Skeleton instead of ActivityIndicator**

- **File:** `apps/mobile/app/onboarding/suggested.tsx` line 114
- **Code:**
```tsx
{finishing ? <Skeleton.Rect width={24} height={24} borderRadius={radius.full} /> : <Text style={styles.btnText}>{...}</Text>}
```
- **Issue:** Per CLAUDE.md rule: "ActivityIndicator OK in buttons only — use `<Skeleton>` for content loading." The button loading state uses `Skeleton.Rect` inside a button, which is backwards — Skeleton is for content areas, ActivityIndicator is for buttons. A `Skeleton.Rect` inside a button looks like a loading shimmer rectangle rather than a spinner.
- **Impact:** Visual inconsistency with the rest of the app's button loading patterns.
- **Fix:** Use `<ActivityIndicator size="small" color="#fff" />` for button loading state.

---

## FINDING 21 — MEDIUM
**suggested.tsx: handleFollow silently catches all errors**

- **File:** `apps/mobile/app/onboarding/suggested.tsx` lines 28-38
- **Code:**
```tsx
const handleFollow = async (userId: string) => {
    try {
        if (following.has(userId)) {
            await followsApi.unfollow(userId);
            ...
        } else {
            await followsApi.follow(userId);
            ...
        }
    } catch {}
};
```
- **Issue:** The follow/unfollow action catches all errors silently. If the API call fails (network, auth, 404), the UI shows the follow state as changed (optimistic update via `setFollowing`) but it was never persisted. Wait — actually the state is set inside the try block before the catch, so if the API throws, the state change DID happen. Then the catch silently swallows the error. This means on error, the local state diverges from the server state.
- **Impact:** The user sees "Following" but the follow was never saved server-side.
- **Fix:** Revert the state change in the catch block, or use an optimistic update pattern with rollback.

---

## FINDING 22 — MEDIUM
**profile.tsx: Not wrapped in SafeAreaView — content overlaps status bar**

- **File:** `apps/mobile/app/onboarding/profile.tsx` line 96
- **Code:**
```tsx
return (
    <View style={styles.container}>
```
- **Styles (line 197-199):**
```tsx
container: {
    flex: 1, backgroundColor: colors.dark.bg,
    alignItems: 'center', paddingHorizontal: spacing.xl,
    paddingTop: 60,
},
```
- **Issue:** Unlike all other auth/onboarding screens which use `<SafeAreaView>`, the profile screen uses a plain `<View>` with hardcoded `paddingTop: 60`. This hardcoded value may not be correct for all device types (iPhone 15 Pro Max has a larger notch area than iPhone SE). Also, `paddingTop: 60` is a magic number not from the theme system.
- **Impact:** Content may overlap the status bar on some devices, or have too much/little padding on others.
- **Fix:** Use `<SafeAreaView>` wrapper and remove the hardcoded paddingTop.

---

## FINDING 23 — MEDIUM
**profile.tsx: Avatar placeholder is not tappable — no photo upload**

- **File:** `apps/mobile/app/onboarding/profile.tsx` lines 106-119
- **Code:**
```tsx
{user?.imageUrl ? (
    <Image source={{ uri: user.imageUrl }} style={styles.avatar} contentFit="cover" />
) : (
    <Animated.View style={[styles.avatarPlaceholderWrap, pulseStyle]}>
        <View style={[styles.avatar, styles.avatarPlaceholder]}>
            <Icon name="camera" size="lg" color={colors.text.tertiary} />
            <Text style={styles.avatarHintInner}>{t('onboarding.profile.addPhoto')}</Text>
        </View>
    </Animated.View>
)}
```
- **Issue:** The avatar placeholder shows a camera icon and "Add photo" text with a pulsing animation suggesting interactivity, but it is NOT wrapped in a Pressable or touchable — it cannot be tapped. The hint text below (line 120-122) says "You can change this later in settings", but showing a camera icon and "Add photo" creates a clear expectation that tapping it will open image picker.
- **Impact:** Users will tap the avatar placeholder expecting to set their photo, but nothing happens. Misleading UI.
- **Fix:** Either make it tappable (open image picker), or remove the camera icon and "Add photo" text and just show a plain avatar placeholder.

---

## FINDING 24 — MEDIUM
**profile.tsx: onChangeText shadows the `t` function from useTranslation**

- **File:** `apps/mobile/app/onboarding/profile.tsx` line 136
- **Code:**
```tsx
onChangeText={(t) => { setDisplayName(t); setError(''); }}
```
- **Issue:** The callback parameter is named `t`, which shadows the `t` function from `useTranslation()` (declared on line 28). While this doesn't cause a bug in the current code (the `t` function isn't used inside this callback), it's a code smell that could lead to bugs if someone adds a `t()` call inside the callback later.
- **Impact:** No functional bug currently, but poor code hygiene that could cause subtle bugs later.
- **Fix:** Rename the parameter: `onChangeText={(text) => { setDisplayName(text); setError(''); }}`.

---

## FINDING 25 — MEDIUM
**profile.tsx: Progress bar animation shows "step 2 of 4" but onboarding is "2-step"**

- **File:** `apps/mobile/app/onboarding/profile.tsx` lines 22, 39
- **Code:**
```tsx
const STEP = 2; // Step 2 of 4 in onboarding
...
progressWidth.value = withSpring(50, animation.spring.responsive);
```
- **Issue:** The comment says "Step 2 of 4" and the progress bar fills to 50%. But the current onboarding flow is 2 steps (username -> interests), not 4. The profile screen itself is skipped. If it were shown, the progress indicator would be inconsistent with the actual number of steps.
- **Impact:** If the profile screen is ever re-enabled, the progress indicator will show incorrect progress (50% at step 2 of 2 instead of 100%).
- **Fix:** Update STEP and progress calculation to match actual flow.

---

## FINDING 26 — MEDIUM
**interests.tsx: Progress dots show "step 2 of 2" but all dots are active**

- **File:** `apps/mobile/app/onboarding/interests.tsx` lines 82-86
- **Code:**
```tsx
<View style={styles.progress}>
    {[1, 2].map((i) => (
        <View key={i} style={[styles.dot, i <= 2 && styles.dotActive]} />
    ))}
</View>
```
- **Issue:** The condition `i <= 2` is always true for both dots (i=1 and i=2), so both dots are always active/green. This means the progress indicator shows "complete" from the very start of the interests screen, not "step 2 of 2 in progress".
- **Impact:** The progress indicator provides no useful information — it always looks fully complete.
- **Fix:** Either highlight only the current step, or use a different visual pattern (filled bar up to current step).

---

## FINDING 27 — MEDIUM
**interests.tsx: username param from navigation is received but never used**

- **File:** `apps/mobile/app/onboarding/interests.tsx` line 41
- **Code:**
```tsx
const { username } = useLocalSearchParams<{ username: string }>();
```
- **Issue:** The `username` parameter is destructured from search params but never used anywhere in the interests screen. It was intended to be passed to the profile screen (which is now skipped), or to a registration API call that doesn't exist in this flow.
- **Impact:** Unused variable. The username chosen by the user is received here but discarded.
- **Fix:** Either use the username to call `authApi.register()`, or remove the unused destructuring.

---

## FINDING 28 — MEDIUM
**interests.tsx: INTERESTS array uses icon names not in the official 44-icon list**

- **File:** `apps/mobile/app/onboarding/interests.tsx` lines 15-28
- **Code:**
```tsx
{ id: 'quran', label: 'onboarding.interests.quran', icon: 'book-open' },
{ id: 'fiqh', label: 'onboarding.interests.fiqh', icon: 'shield' },
{ id: 'business', label: 'onboarding.interests.business', icon: 'briefcase' },
{ id: 'education', label: 'onboarding.interests.education', icon: 'file-text' },
```
- **Issue:** While these icons DO exist in the Icon component (verified in Icon.tsx lines 34-37, 120-138), CLAUDE.md's "44 valid names" list in the Component Quick Reference only lists a subset. The `Icon` component's actual type definition includes `book-open`, `shield`, `briefcase`, `file-text` as valid names. So this is NOT a bug — but the documentation in CLAUDE.md is incomplete (it lists 44 names but the Icon actually supports ~55).
- **Impact:** No functional issue. Documentation gap.

---

## FINDING 29 — MEDIUM
**username.tsx: USERNAME_RE allows consecutive dots and underscores**

- **File:** `apps/mobile/app/onboarding/username.tsx` line 31
- **Code:**
```tsx
const USERNAME_RE = /^[a-z0-9_.]{3,30}$/;
```
- **Issue:** The regex allows:
  - Starting with a dot or underscore: `._user`, `..name`
  - Consecutive dots/underscores: `user..name`, `user__name`
  - Ending with a dot or underscore: `username.`, `username_`
  - All dots: `...` (3 dots is a valid username)
  - Dot-underscore sequences: `._._._`

  These would create odd-looking profile URLs (mizanly.com/@...) and potential display issues.
- **Impact:** Users can create hard-to-read or confusing usernames. Backend may accept these even if they display poorly.
- **Fix:** Use a stricter regex: `/^[a-z][a-z0-9._]{1,28}[a-z0-9]$/` and disallow consecutive dots/underscores.

---

## FINDING 30 — MEDIUM
**username.tsx: handleContinue has unnecessary try/finally with loading state**

- **File:** `apps/mobile/app/onboarding/username.tsx` lines 113-121
- **Code:**
```tsx
const handleContinue = async () => {
    if (!isValid) return;
    setLoading(true);
    try {
        router.push({ pathname: '/onboarding/interests', params: { username } });
    } finally {
        setLoading(false);
    }
};
```
- **Issue:** `router.push()` is synchronous (it schedules a navigation, doesn't return a Promise that resolves when navigation completes). The `setLoading(true)` and `setLoading(false)` around it happen essentially instantly. The `try/finally` pattern with `setLoading` is cargo-cult from API calls and serves no purpose here since there's no async work being done.
- **Impact:** No functional issue, but misleading code structure — the loading spinner appears for a microsecond (invisible to users) and the button's `disabled` state based on `loading` never actually prevents double-taps.
- **Fix:** Either make this function do actual async work (like calling `authApi.register`), or remove the loading state entirely.

---

## FINDING 31 — MEDIUM
**sign-in.tsx: Error message shown from Clerk uses `longMessage` which can be very long**

- **File:** `apps/mobile/app/(auth)/sign-in.tsx` line 68
- **Code:**
```tsx
setError(e.errors?.[0]?.longMessage || e.errors?.[0]?.message || e.message || 'Sign in failed');
```
- **Issue:** Clerk's `longMessage` field can contain multi-sentence explanations like "Password is incorrect. Try again, or use another method." These are long strings that may not fit well in the single-line error text area (styled with `textAlign: 'center'`). Also, the fallback `'Sign in failed'` is a hardcoded English string, not using i18n.
- **Impact:** Long error messages may look cramped. Fallback text is not translated.
- **Fix:** Use `e.errors?.[0]?.message` (shorter) as the primary, and use `t('auth.signInFailed')` as the fallback.

---

## FINDING 32 — MEDIUM
**sign-in.tsx: console.error in production code**

- **File:** `apps/mobile/app/(auth)/sign-in.tsx` line 66
- **Code:**
```tsx
console.error('Sign in error:', JSON.stringify(err, null, 2));
```
- **Issue:** Production code should not log full error details including potentially sensitive information (tokens, user data) via `console.error`. `JSON.stringify(err, null, 2)` will serialize the entire Clerk error object which may contain session tokens or internal state.
- **Impact:** Sensitive data may appear in device logs. Performance impact from serializing large error objects.
- **Fix:** Remove or reduce to a minimal log: `console.warn('Sign in failed:', (err as Error).message)`.

---

## FINDING 33 — MEDIUM
**sign-up.tsx: Password strength meter has no label or visual feedback text**

- **File:** `apps/mobile/app/(auth)/sign-up.tsx` lines 69-77, 268-286
- **Code:**
```tsx
const strength = password.length === 0 ? 0
    : password.length < 6 ? 1
    : password.length < 8 ? 2
    : /[A-Z]/.test(password) && /[0-9]/.test(password) ? 4 : 3;
```
- **Issue:** The password strength indicator shows colored bars (red/orange/green) but has no text label telling the user what the strength level means ("Weak", "Medium", "Strong"). Users who are colorblind cannot distinguish the strength levels. Also, the strength algorithm only checks uppercase and numbers, not special characters — a password like `aaaaaaaA1` gets a score of 4 (max) despite being weak.
- **Impact:** Accessibility issue for colorblind users. Strength meter gives false confidence for weak passwords.
- **Fix:** Add text labels ("Weak", "Fair", "Good", "Strong") and improve the algorithm to check for special characters and common patterns.

---

## FINDING 34 — LOW
**Auth layout declares a forgot-password screen route that exists but is inconsistent**

- **File:** `apps/mobile/app/(auth)/_layout.tsx` line 8
- **Code:**
```tsx
<Stack.Screen name="forgot-password" />
```
- **Issue:** The layout declares the route but it's the only screen without `ScreenErrorBoundary` wrapping in the component itself — wait, actually `forgot-password.tsx` does wrap with `ScreenErrorBoundary` at line 94. So this is actually fine. However, the `forgot-password` screen uses `ScreenErrorBoundary` as a direct wrapper of the exported component (not wrapping a separate content component), which is inconsistent with sign-in and sign-up which use the "content component + wrapper" pattern.
- **Impact:** Inconsistent code structure but no functional issue.

---

## FINDING 35 — LOW
**sign-in.tsx: Hardcoded gradient size in bgGlow**

- **File:** `apps/mobile/app/(auth)/sign-in.tsx` lines 83-89
- **Code:**
```tsx
style={{ width: 250, height: 250, borderRadius: radius.full }}
```
- **Issue:** The decorative gradient glow has hardcoded `width: 250, height: 250` pixel values rather than using responsive dimensions. On small screens (iPhone SE), this glow may take up too much space. On large screens (iPad), it may look tiny.
- **Impact:** Minor visual inconsistency across device sizes.
- **Fix:** Use percentage-based or `Dimensions.get('window')`-based sizing.

---

## FINDING 36 — LOW
**sign-up.tsx: strength bar gap uses hardcoded 4**

- **File:** `apps/mobile/app/(auth)/sign-up.tsx` line 384
- **Code:**
```tsx
strengthRow: {
    flexDirection: 'row',
    gap: 4,
    marginTop: spacing.xs,
},
```
- **Issue:** `gap: 4` is a hardcoded value. Should use `spacing.xs` (which is also 4, but using the theme token is the convention).
- **Impact:** Minor inconsistency with theme system.

---

## FINDING 37 — LOW
**sign-up.tsx: strengthBar borderRadius uses hardcoded 1.5**

- **File:** `apps/mobile/app/(auth)/sign-up.tsx` line 390
- **Code:**
```tsx
strengthBar: {
    ...
    borderRadius: 1.5,
    backgroundColor: colors.dark.border,
},
```
- **Issue:** `borderRadius: 1.5` is a hardcoded value below the smallest theme radius (`radius.sm = 6`). While the theme doesn't have a suitable tiny radius for 3px-tall bars, the hardcoded value should ideally be extracted to a constant.
- **Impact:** Negligible.

---

## FINDING 38 — LOW
**sign-in.tsx: Missing `accessibilityRole="button"` on sign-up link Pressable**

- **File:** `apps/mobile/app/(auth)/sign-in.tsx` line 205-211
- **Code:**
```tsx
<Pressable
    onPress={() => router.replace('/(auth)/sign-up')}
    hitSlop={8}
    accessibilityRole="link"
>
```
- **Issue:** The "Sign Up" navigation link uses `accessibilityRole="link"` which is correct for navigation. However, the "Forgot Password?" link at line 158-164 has no `accessibilityRole` at all.
- **Impact:** Minor accessibility gap on the forgot password link.
- **Fix:** Add `accessibilityRole="link"` to the forgot password Pressable.

---

## FINDING 39 — LOW
**forgot-password.tsx: No keyboard dismiss wrapper**

- **File:** `apps/mobile/app/(auth)/forgot-password.tsx`
- **Issue:** The forgot-password screen has a `<Pressable onPress={Keyboard.dismiss}>` wrapper (line 100), matching sign-in.tsx. This is fine. However, it's worth noting that sign-up.tsx does NOT have this wrapper, which means tapping outside the inputs on sign-up won't dismiss the keyboard.
- **Impact:** Minor UX inconsistency — sign-up screen keyboard doesn't dismiss on background tap.

---

## FINDING 40 — LOW
**profile.tsx: inputRow style has `color` and `fontSize` properties on a View**

- **File:** `apps/mobile/app/onboarding/profile.tsx` lines 255-256
- **Code:**
```tsx
inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.dark.bgElevated,
    borderRadius: radius.lg,
    color: colors.text.primary,      // ← View doesn't use color
    fontSize: fontSize.base,          // ← View doesn't use fontSize
    ...
},
```
- **Issue:** The `inputRow` style is applied to a `<View>`, but it contains `color` and `fontSize` properties which only apply to `<Text>` and `<TextInput>` components. These properties are silently ignored on `<View>` in React Native.
- **Impact:** No visual impact (properties are ignored), but it's dead/misleading code.
- **Fix:** Remove `color` and `fontSize` from `inputRow` style.

---

## FINDING 41 — LOW
**suggested.tsx: FlatList uses removeClippedSubviews but list is typically small**

- **File:** `apps/mobile/app/onboarding/suggested.tsx` line 80
- **Code:**
```tsx
<FlatList removeClippedSubviews={true} ... />
```
- **Issue:** `removeClippedSubviews={true}` is a performance optimization for long lists. The suggested users list in onboarding is typically 5-10 items. Using `removeClippedSubviews` on such a short list adds complexity without benefit, and can occasionally cause rendering bugs on Android where items flicker or disappear.
- **Impact:** Potential Android rendering glitch for no performance benefit.
- **Fix:** Remove `removeClippedSubviews={true}` for this short list.

---

## FINDING 42 — LOW
**sign-in.tsx and sign-up.tsx: `useEffect` dependencies missing for shared values**

- **File:** `apps/mobile/app/(auth)/sign-in.tsx` lines 43-46
- **Code:**
```tsx
useEffect(() => {
    logoScale.value = withSpring(1, animation.spring.bouncy);
    logoOpacity.value = withTiming(1, { duration: 600 });
}, []);
```
- **Issue:** The useEffect has an empty dependency array `[]`, but it references `logoScale` and `logoOpacity` (Reanimated shared values). While Reanimated shared values are stable references and this won't cause bugs, ESLint's `react-hooks/exhaustive-deps` rule would flag this. Same pattern in sign-up.tsx lines 43-46 and username.tsx lines 44-46.
- **Impact:** No functional issue. ESLint warnings.

---

## Summary

### By Severity

| Severity | Count | Description |
|----------|-------|-------------|
| CRITICAL / SHIP BLOCKER | 3 | interests.tsx syntax error, onboardingComplete never set (infinite loop), username never saved |
| CRITICAL | 3 | authApi.register never called, authApi.updateProfile doesn't exist, madhab can't be saved |
| HIGH | 7 | Social auth stubs, 7 missing i18n keys, no navigation after password reset, no back from verification, username race condition, 2 screens unreachable, AuthGuard inconsistency |
| MEDIUM | 16 | 2FA redirect path, keyboard dismiss a11y, resend silently fails, social auth no handler, duplicate props, FlatList no RefreshControl, Skeleton in button, follow error swallowed, no SafeAreaView, avatar not tappable, variable shadowing, progress indicators wrong, username regex weak, loading state cargo-cult, long error messages, console.error in prod, password strength a11y |
| LOW | 9 | Inconsistent error boundary pattern, hardcoded gradient size, hardcoded gap/radius, missing a11y role, keyboard dismiss inconsistency, View style dead properties, removeClippedSubviews unnecessary, useEffect deps |

### The 3 Ship Blockers in Detail

1. **interests.tsx SYNTAX ERROR (line 2-4):** Missing closing brace and `from 'react-native'` in import statement. The file will not compile. Metro bundler will crash.

2. **onboardingComplete NEVER SET:** The only place that sets `onboardingComplete: true` is `suggested.tsx` line 44, but `interests.tsx` line 71 skips directly to `/(tabs)/saf`, never reaching `suggested.tsx`. The AuthGuard checks `onboardingComplete` and redirects back to onboarding if false = **infinite loop**.

3. **Username NEVER SAVED to backend:** The username screen checks availability but never calls any API to reserve/save the username. `authApi.register()` is defined but never called anywhere in the mobile app. The profile screen (which would have called `usersApi.updateMe({ username })`) is skipped. Even if it weren't skipped, `UpdateProfileDto` doesn't have a `username` field and `forbidNonWhitelisted: true` would cause a 400 error.

### The Complete Onboarding Data Flow (Current, Broken)

```
1. User signs up via Clerk (sign-up.tsx) → Clerk session active
2. AuthGuard detects isSignedIn && !onboardingComplete → redirect to /onboarding/username
3. Username screen: user picks username, checks availability → navigates to /onboarding/interests
   ❌ Username NOT saved anywhere (authApi.register never called)
4. Interests screen: SYNTAX ERROR — cannot compile
   Even if fixed:
   ❌ authApi.updateProfile doesn't exist (madhab never saved)
   ✅ authApi.setInterests works
   ❌ Navigates to /(tabs)/saf without setting onboardingComplete
5. AuthGuard runs again → onboardingComplete is undefined → redirect to /onboarding/username
   🔄 INFINITE LOOP
```
