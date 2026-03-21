# Agent #35: Security + Account Mobile Screens — Deep Line-by-Line Audit

**Date:** 2026-03-21
**Agent:** #35 of 67+
**Scope:** All security, account, privacy, and moderation appeal mobile screens (~18 screens)
**Method:** Line-by-line read of every file, every import, every function, every state variable

---

## Screens Audited

| # | File | Lines | Status |
|---|------|-------|--------|
| 1 | `(screens)/2fa-setup.tsx` | 817 | Audited |
| 2 | `(screens)/2fa-verify.tsx` | 487 | Audited |
| 3 | `(screens)/account-settings.tsx` | 352 | Audited |
| 4 | `(screens)/account-switcher.tsx` | 801 | Audited |
| 5 | `(screens)/biometric-lock.tsx` | 343 | Audited |
| 6 | `(screens)/chat-lock.tsx` | 385 | Audited |
| 7 | `(screens)/parental-controls.tsx` | 803 | Audited |
| 8 | `(screens)/link-child-account.tsx` | 385 | Audited |
| 9 | `(screens)/status-privacy.tsx` | 413 | Audited |
| 10 | `(screens)/blocked.tsx` | 212 | Audited |
| 11 | `(screens)/blocked-keywords.tsx` | 262 | Audited |
| 12 | `(screens)/restricted.tsx` | 254 | Audited |
| 13 | `(screens)/muted.tsx` | 206 | Audited |
| 14 | `(screens)/close-friends.tsx` | 481 | Audited |
| 15 | `(screens)/content-settings.tsx` | 508 | Audited |
| 16 | `(screens)/content-filter-settings.tsx` | 369 | Audited |
| 17 | `(screens)/chat-export.tsx` | 452 | Audited |
| 18 | `(screens)/appeal-moderation.tsx` | 831 | Audited |
| 19 | `(screens)/settings.tsx` | 200+ (partial, first 200 lines) | Audited |

---

## FINDINGS

### FINDING-001: 2FA Backup Code Copy is Stubbed — Clipboard Not Used
- **Severity:** P1 (Critical security UX gap)
- **File:** `apps/mobile/app/(screens)/2fa-setup.tsx`
- **Lines:** 122-132
- **Code:**
```tsx
const copyBackupCode = (code: string) => {
    // In real app: Clipboard.setString(code);
    setCopiedCodes(prev => [...prev, code]);
    Alert.alert(t('common.copied'), t('auth.backupCodeCopied', { code }));
};

const copyAllBackupCodes = () => {
    const allCodes = backupCodes.join('\n');
    // Clipboard.setString(allCodes);
    Alert.alert(t('common.copied'), t('auth.allBackupCodesCopied'));
};
```
- **Issue:** Both `copyBackupCode` and `copyAllBackupCodes` have the actual clipboard copy commented out with `// Clipboard.setString(...)`. The UI shows a "Copied" alert but nothing actually goes to the clipboard. Users believe they've saved their backup codes but haven't. This is a **security-critical stub**: users who lose authenticator access and rely on these "copied" codes will be permanently locked out of their accounts.
- **Fix:** Import `expo-clipboard` and replace the commented lines with actual `Clipboard.setStringAsync()` calls.

---

### FINDING-002: 2FA Backup Code Download is a No-Op
- **Severity:** P1 (Critical security UX gap)
- **File:** `apps/mobile/app/(screens)/2fa-setup.tsx`
- **Lines:** 134-143
- **Code:**
```tsx
const downloadBackupCodes = () => {
    Alert.alert(
      t('auth.downloadBackupCodes'),
      t('auth.downloadBackupCodesMessage'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('common.download'), onPress: () => {} },
      ]
    );
};
```
- **Issue:** The "Download" button's confirm handler is `onPress: () => {}` — a complete no-op. There is no file writing, no sharing, nothing. Users think they are downloading backup codes but nothing happens. Combined with FINDING-001, users have **no way** to actually save their 2FA backup codes.
- **Fix:** Implement using `expo-file-system` to write a text file and `expo-sharing` to share it, or use `Share.share()` with the codes as message content.

---

### FINDING-003: 2FA Secret Key Copy Button is a No-Op
- **Severity:** P2 (Security UX gap)
- **File:** `apps/mobile/app/(screens)/2fa-setup.tsx`
- **Lines:** 311
- **Code:**
```tsx
<Pressable onPress={() => {}}>
```
- **Issue:** The manual secret key Pressable (the fallback for users who can't scan QR) has `onPress={() => {}}` — a no-op. The secret is displayed with `selectable` (line 316), so the user could manually long-press to copy, but the tap-to-copy affordance (with the copy icon on line 317) does nothing. Users who can't scan QR codes have a poor fallback experience.
- **Fix:** Implement clipboard copy for the TOTP secret string.

---

### FINDING-004: OTP Input Refs Array Never Actually Stores Refs
- **Severity:** P2 (Broken UX)
- **File:** `apps/mobile/app/(screens)/2fa-setup.tsx`
- **Lines:** 58
- **Code:**
```tsx
const inputRefs = Array(6).fill(null);
```
- **Issue:** `inputRefs` is recreated as a new array of nulls on every render. The `ref={el => inputRefs[idx] = el}` on line 368 does assign refs, but since the array is recreated each render, auto-focus via `inputRefs[index + 1]?.focus()` on line 69 only works within the same render cycle. This is fragile and can fail depending on React's batching. Should be `useRef` with a stable array.
- **Same issue in:** `apps/mobile/app/(screens)/2fa-verify.tsx` line 46 — identical pattern.
- **Fix:** Use `const inputRefs = useRef<(TextInput | null)[]>(Array(6).fill(null))` and access via `inputRefs.current[idx]`.

---

### FINDING-005: 2FA Verify Sends userId in Request Body — Insecure
- **Severity:** P1 (Security vulnerability)
- **File:** `apps/mobile/app/(screens)/2fa-verify.tsx`
- **Lines:** 92-97
- **Code:**
```tsx
if (mode === 'code') {
    const code = verificationCode.join('');
    await twoFactorApi.validate({ userId: user.id, code });
} else {
    await twoFactorApi.backup({ userId: user.id, backupCode });
}
```
- **Issue:** The client sends `userId` as part of the validation payload. This means a malicious user could modify the request to validate 2FA codes against ANY user's account by changing the userId field. The server should derive the userId from the JWT auth token, not accept it from the request body. This is the same pattern documented in `twoFactorApi.ts` lines 16,22 where `validate` and `backup` both accept `userId` in the DTO.
- **Fix:** Remove `userId` from `ValidateTwoFactorDto` and `BackupCodeDto`. The backend should use `@CurrentUser('id')` to determine the authenticated user.

---

### FINDING-006: Duplicate Pressable Import — Compilation Warning
- **Severity:** P3 (Code quality)
- **File:** `apps/mobile/app/(screens)/account-settings.tsx`
- **Lines:** 3-6
- **Code:**
```tsx
import {
  View, Text, StyleSheet, Pressable,
  ScrollView, Alert,
  Pressable,
} from 'react-native';
```
- **Issue:** `Pressable` is imported twice in the same destructured import. While JavaScript/TypeScript won't error on duplicate destructuring, some bundlers emit warnings and it indicates sloppy code in a security-critical screen.
- **Fix:** Remove the duplicate `Pressable` on line 5.

---

### FINDING-007: Duplicate Pressable Import — parental-controls.tsx
- **Severity:** P3 (Code quality)
- **File:** `apps/mobile/app/(screens)/parental-controls.tsx`
- **Lines:** 3-6
- **Code:**
```tsx
import {
  View, Text, StyleSheet, Pressable, FlatList,
  RefreshControl,
  Pressable,
} from 'react-native';
```
- **Issue:** Same duplicate `Pressable` import as FINDING-006.
- **Fix:** Remove the duplicate.

---

### FINDING-008: Duplicate Pressable Import — link-child-account.tsx
- **Severity:** P3 (Code quality)
- **File:** `apps/mobile/app/(screens)/link-child-account.tsx`
- **Lines:** 3-6
- **Code:**
```tsx
import {
  View, Text, StyleSheet, Pressable, FlatList,
  RefreshControl, TextInput, Alert,
  Pressable,
} from 'react-native';
```
- **Issue:** Same duplicate `Pressable` import as FINDING-006.
- **Fix:** Remove the duplicate.

---

### FINDING-009: Duplicate Pressable Import — content-filter-settings.tsx
- **Severity:** P3 (Code quality)
- **File:** `apps/mobile/app/(screens)/content-filter-settings.tsx`
- **Lines:** 7-11
- **Code:**
```tsx
import {
  View, Text, StyleSheet, ScrollView, Switch,
  Pressable, Alert,
  Pressable,
} from 'react-native';
```
- **Issue:** Same duplicate `Pressable` import.
- **Fix:** Remove the duplicate.

---

### FINDING-010: Account Deletion — No Re-Authentication Required
- **Severity:** P1 (Security gap)
- **File:** `apps/mobile/app/(screens)/account-settings.tsx`
- **Lines:** 137-165
- **Code:**
```tsx
const handleDeleteAccount = () => {
    Alert.alert(
      t('accountSettings.deleteAlertTitle'),
      t('accountSettings.deleteAlertMessage'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: () => {
            Alert.alert(
              t('accountSettings.deleteConfirmTitle'),
              t('accountSettings.deleteConfirmMessage'),
              [
                { text: t('common.cancel'), style: 'cancel' },
                {
                  text: t('accountSettings.deleteConfirmButton'),
                  style: 'destructive',
                  onPress: async () => {
                    await requestDeletionMutation.mutateAsync();
                  },
                },
              ],
            );
          },
        },
      ],
    );
};
```
- **Issue:** Account deletion only requires two Alert.alert confirmations (tap "Delete" then tap "Delete Forever"). There is no password re-entry, no biometric check, no email confirmation code. If someone picks up an unlocked phone, they can permanently delete the user's account with two taps. Instagram/WhatsApp/X all require password re-entry or email verification before account deletion.
- **Fix:** Add password re-entry or biometric authentication before the final deletion mutation fires.

---

### FINDING-011: Account Deactivation — No Re-Authentication Required
- **Severity:** P2 (Security gap)
- **File:** `apps/mobile/app/(screens)/account-settings.tsx`
- **Lines:** 122-135
- **Code:**
```tsx
const handleDeactivate = () => {
    Alert.alert(
      t('accountSettings.deactivateAlertTitle'),
      t('accountSettings.deactivateAlertMessage'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('accountSettings.deactivateButton'),
          style: 'destructive',
          onPress: () => deactivateMutation.mutate(),
        },
      ],
    );
};
```
- **Issue:** Account deactivation requires only a single Alert confirmation tap. Same vulnerability as FINDING-010 — no re-authentication.
- **Fix:** Require at minimum a second confirmation or biometric check.

---

### FINDING-012: Data Export Result Not Actually Downloaded
- **Severity:** P2 (Feature stub)
- **File:** `apps/mobile/app/(screens)/account-settings.tsx`
- **Lines:** 113-120
- **Code:**
```tsx
const exportDataMutation = useMutation({
    mutationFn: () => usersApi.exportData(),
    onSuccess: (data) => {
      // In a real app, you would download the data file
      Alert.alert(t('accountSettings.dataReadyTitle'), t('accountSettings.dataReadyMessage'));
    },
    onError: (err: Error) => Alert.alert(t('common.error'), err.message),
});
```
- **Issue:** The comment says "In a real app, you would download the data file" and the `data` response is completely ignored. The user gets an alert saying their data is ready but there is no download URL, no file sharing, no way to actually get their data. This is a GDPR/privacy compliance stub.
- **Fix:** Parse the response URL and use `expo-sharing` or `Linking.openURL` to let the user actually download their data.

---

### FINDING-013: Account Switcher — Duplicate accessibilityRole Prop
- **Severity:** P3 (Code quality / React warning)
- **File:** `apps/mobile/app/(screens)/account-switcher.tsx`
- **Line:** 293
- **Code:**
```tsx
<Pressable accessibilityRole="button" accessibilityRole="button"
```
- **Issue:** `accessibilityRole="button"` is specified twice on the same element. React will use the last one but this generates warnings and indicates sloppy code.
- **Fix:** Remove the duplicate prop.

---

### FINDING-014: Account Switcher — "Manage Accounts" and "Default Account" Rows Are No-Ops
- **Severity:** P2 (Stubbed navigation)
- **File:** `apps/mobile/app/(screens)/account-switcher.tsx`
- **Lines:** 359-379
- **Code:**
```tsx
<Pressable accessibilityRole="button" style={styles.managementRow}>
  <View style={styles.managementRowLeft}>
    <Icon name="users" size="sm" color={colors.text.secondary} />
    <Text style={styles.managementRowText}>{t('screens.accountSwitcher.manageAccounts')}</Text>
  </View>
  <Icon name="chevron-right" size="sm" color={colors.text.tertiary} />
</Pressable>

<Pressable accessibilityRole="button" style={styles.managementRow}>
  <View style={styles.managementRowLeft}>
    <Icon name="user" size="sm" color={colors.text.secondary} />
    <Text style={styles.managementRowText}>{t('screens.accountSwitcher.defaultAccount')}</Text>
  </View>
  ...
</Pressable>
```
- **Issue:** Both "Manage Accounts" and "Default Account" Pressable components have no `onPress` handler. They render as interactive-looking rows (with chevrons) but tapping does nothing. Users expect navigation when they see a chevron.
- **Fix:** Either add `onPress` handlers that navigate to appropriate screens, or remove the interactive styling/chevron if not yet implemented.

---

### FINDING-015: Account Switcher — Auto-Switch Toggle Not Persisted
- **Severity:** P2 (Settings not saved)
- **File:** `apps/mobile/app/(screens)/account-switcher.tsx`
- **Lines:** 65, 387-392
- **Code:**
```tsx
const [autoSwitchOnNotification, setAutoSwitchOnNotification] = useState(false);
...
<Switch
  value={autoSwitchOnNotification}
  onValueChange={setAutoSwitchOnNotification}
  ...
/>
```
- **Issue:** The auto-switch toggle is purely local state. It resets to `false` every time the screen mounts. There is no API call, no AsyncStorage, no Zustand store persistence. Users toggle it and it silently resets on next visit.
- **Fix:** Persist to Zustand store with MMKV backing, or save via settings API.

---

### FINDING-016: Biometric Lock — Custom Switch View Instead of React Native Switch
- **Severity:** P3 (Accessibility gap)
- **File:** `apps/mobile/app/(screens)/biometric-lock.tsx`
- **Lines:** 207-224
- **Code:**
```tsx
<View style={[styles.switchTrack, biometricLockEnabled && styles.switchTrackActive]}>
  <View style={[styles.switchThumb, biometricLockEnabled && styles.switchThumbActive]} />
</View>
...
<View style={StyleSheet.absoluteFill}>
  <View style={styles.touchOverlay} onTouchEnd={handleToggle} />
</View>
```
- **Issue:** Instead of using React Native's `<Switch>` component (which has proper accessibility support including VoiceOver/TalkBack announcements), this uses a custom View that looks like a switch but: (a) has no `accessibilityRole="switch"`, (b) uses `onTouchEnd` on a `<View>` instead of a `<Pressable>`, (c) won't announce state changes to screen readers. The custom switch thumb animation is also not animated — it jumps between positions via `alignSelf`.
- **Fix:** Use `<Switch>` from React Native or add proper accessibility props (`accessibilityRole="switch"`, `accessibilityState={{ checked: biometricLockEnabled }}`).

---

### FINDING-017: Biometric Lock — Test Auth Shows Hardcoded English Strings
- **Severity:** P3 (i18n violation)
- **File:** `apps/mobile/app/(screens)/biometric-lock.tsx`
- **Lines:** 91-95
- **Code:**
```tsx
if (success) {
    Alert.alert(t('biometric.title'), 'Authentication successful!');
} else {
    Alert.alert(t('biometric.title'), 'Authentication failed.');
}
```
- **Issue:** The test authentication result messages are hardcoded English strings instead of using i18n keys. Every other string on this screen uses `t()` properly, but these two messages break the pattern. Arabic, Turkish, Urdu, etc. users will see English.
- **Fix:** Use `t('biometric.testSuccess')` and `t('biometric.testFailed')` with corresponding keys in all 8 language files.

---

### FINDING-018: Parental Controls — setState During Render
- **Severity:** P1 (React anti-pattern, causes infinite re-render)
- **File:** `apps/mobile/app/(screens)/parental-controls.tsx`
- **Lines:** 550-552
- **Code:**
```tsx
if (!pinVerified && !hasControls) {
    setPinVerified(true);
}
```
- **Issue:** This `setPinVerified(true)` call is executed directly during the render phase (not inside useEffect or a callback). This violates React's rules and can cause an infinite re-render loop: render -> setState -> re-render -> setState -> ... React may batch this in some cases, but it's undefined behavior and React 18+ strict mode will warn. This should be in a `useEffect`.
- **Fix:** Move to `useEffect(() => { if (!pinVerified && !hasControls) setPinVerified(true); }, [pinVerified, hasControls])`.

---

### FINDING-019: Parental Controls — PIN Verification Has No Rate Limiting on Client
- **Severity:** P2 (Security gap)
- **File:** `apps/mobile/app/(screens)/parental-controls.tsx`
- **Lines:** 474-493
- **Code:**
```tsx
const handlePinComplete = useCallback(async (pin: string) => {
    if (!hasControls) {
      setPinVerified(true);
      return;
    }
    try {
      const first = ((hasControlsQuery.data ?? []) as ParentalControl[])[0];
      const result = await parentalApi.verifyPin(first.childUserId, pin) as { valid: boolean };
      if (result.valid) {
        haptic.success();
        setPinVerified(true);
      } else {
        haptic.error();
      }
    } catch {
      haptic.error();
    }
}, [hasControls, hasControlsQuery.data, haptic]);
```
- **Issue:** Failed PIN attempts only trigger a haptic error — no lockout counter, no delay, no "too many attempts" message. A child can brute-force all 10,000 possible 4-digit PINs by tapping continuously. The PIN pad resets immediately on failure, enabling rapid retry. Server-side rate limiting may exist, but there is no client-side feedback about remaining attempts.
- **Fix:** Add an attempt counter that disables the PIN pad after 3-5 failures with a cooldown timer, or show "Too many attempts, try again in X minutes."

---

### FINDING-020: Parental Controls — No Feedback on Wrong PIN
- **Severity:** P2 (UX gap)
- **File:** `apps/mobile/app/(screens)/parental-controls.tsx`
- **Lines:** 487-489
- **Code:**
```tsx
} else {
    haptic.error();
}
```
- **Issue:** When the PIN is wrong, only a haptic vibration occurs. No visual error state, no "Wrong PIN" text, no shake animation, no red dots. The user has no visual indication that the PIN was incorrect. Compare to 2fa-verify.tsx which properly has shake animation and red error states.
- **Fix:** Add a visual error indicator — red pin dots, shake animation, and/or an error message below the PIN pad.

---

### FINDING-021: Status Privacy — Error on Settings Load Silently Swallowed
- **Severity:** P2 (Silent failure)
- **File:** `apps/mobile/app/(screens)/status-privacy.tsx`
- **Lines:** 45-47
- **Code:**
```tsx
} catch {
    // Use defaults on error
}
```
- **Issue:** If the settings API fails to load, the error is silently swallowed with no user feedback. The user sees default values (everyone/same_as_last_seen/read_receipts on/typing on) and if they then modify any setting, the save will overwrite their actual server-side preferences with these defaults. This is a data loss scenario.
- **Fix:** Show an error state or toast notification so the user knows settings failed to load and doesn't accidentally overwrite their real preferences.

---

### FINDING-022: Status Privacy — Save Failure Shows Alert But Doesn't Revert State
- **Severity:** P2 (Optimistic update without rollback)
- **File:** `apps/mobile/app/(screens)/status-privacy.tsx`
- **Lines:** 55-67, 69-72
- **Code:**
```tsx
const saveSettings = useCallback(async (updates: Record<string, unknown>) => {
    setSaving(true);
    try {
      await settingsApi.updatePrivacy(updates as ...);
    } catch {
      Alert.alert(
        t('statusPrivacy.errorTitle', 'Error'),
        t('statusPrivacy.errorSave', 'Failed to save privacy settings'),
      );
    } finally {
      setSaving(false);
    }
}, [t]);

const handleLastSeenChange = useCallback((value: LastSeenOption) => {
    setLastSeen(value);  // <-- Optimistic update
    saveSettings({ lastSeenPrivacy: value });
}, [saveSettings]);
```
- **Issue:** Each setting change optimistically updates local state (e.g., `setLastSeen(value)`) BEFORE calling the API. If the API fails, an error alert is shown but the local state is NOT rolled back. The UI shows the new value while the server still has the old one. On next screen mount, it will load the old value, causing confusion.
- **Fix:** Roll back local state in the catch block, e.g., `setLastSeen(previousValue)`.

---

### FINDING-023: Muted Screen — Hardcoded "Error" String in Alert
- **Severity:** P3 (i18n violation)
- **File:** `apps/mobile/app/(screens)/muted.tsx`
- **Line:** 61
- **Code:**
```tsx
onError: (err: Error) => Alert.alert('Error', err.message),
```
- **Issue:** The unmute mutation error handler uses hardcoded `'Error'` instead of `t('common.error')`. All other screens use the i18n key.
- **Fix:** Replace with `Alert.alert(t('common.error'), err.message)`.

---

### FINDING-024: Muted Screen — Unmute Has No Confirmation Dialog
- **Severity:** P3 (UX inconsistency)
- **File:** `apps/mobile/app/(screens)/muted.tsx`
- **Lines:** 131-137
- **Code:**
```tsx
<GradientButton
    label={t('screens.muted.unmute')}
    variant="secondary"
    size="sm"
    onPress={() => unmuteMutation.mutate(u.id)}
    ...
/>
```
- **Issue:** The unmute action directly calls the mutation without any confirmation dialog. Compare with the blocked.tsx (line 64-73) and restricted.tsx (line 66-78) screens which both show Alert.alert confirmation before the action. This is an inconsistency — all three should behave the same way.
- **Fix:** Add an `Alert.alert` confirmation like the blocked/restricted screens.

---

### FINDING-025: Blocked Screen — Unused Type Aliases
- **Severity:** P4 (Dead code)
- **File:** `apps/mobile/app/(screens)/blocked.tsx`
- **Lines:** 32-35
- **Code:**
```tsx
import type { User, PaginatedResponse } from '@/types';
...
type BlockedPage = PaginatedResponse<User>;
```
- **Issue:** `BlockedPage` is declared but never used anywhere in the file. The actual pagination uses `PaginatedResponse<BlockedUser>` on line 46. `User` import is also unused since the `BlockedUser` interface is locally defined.
- **Fix:** Remove the unused type alias and the unused `User` import.

---

### FINDING-026: Muted Screen — Same Unused Type Alias Pattern
- **Severity:** P4 (Dead code)
- **File:** `apps/mobile/app/(screens)/muted.tsx`
- **Lines:** 31-35
- **Code:**
```tsx
import type { User, PaginatedResponse } from '@/types';
...
type MutedPage = PaginatedResponse<User>;
```
- **Issue:** `MutedPage` type alias is declared but never used. Same pattern as FINDING-025.
- **Fix:** Remove unused type alias.

---

### FINDING-027: Account Settings — Hardcoded Version String
- **Severity:** P3 (Maintenance issue)
- **File:** `apps/mobile/app/(screens)/account-settings.tsx`
- **Line:** 299
- **Code:**
```tsx
<Text style={styles.version}>Mizanly v0.1.0</Text>
```
- **Issue:** The version string is hardcoded instead of reading from `expo-constants` or `app.json`. This will not update when the version changes, showing stale information.
- **Fix:** Import version from `expo-constants` (`Constants.expoConfig?.version`) or use `require('../../../app.json').expo.version`.

---

### FINDING-028: Account Settings — "Manage Data" Routes to Non-Existent Screen
- **Severity:** P2 (Dead navigation)
- **File:** `apps/mobile/app/(screens)/account-settings.tsx`
- **Line:** 266
- **Code:**
```tsx
onPress={() => router.push('/(screens)/manage-data')}
```
- **Issue:** Routes to `/(screens)/manage-data` but there is no `manage-data.tsx` file in the screens directory (verified via glob search). This will cause a navigation error at runtime.
- **Fix:** Either create the manage-data screen or remove/disable this navigation row until it's implemented.

---

### FINDING-029: Content Settings — "Hide Reposted Content" Toggle Not Persisted
- **Severity:** P2 (Setting silently discarded)
- **File:** `apps/mobile/app/(screens)/content-settings.tsx`
- **Lines:** 133, 311-317
- **Code:**
```tsx
const [hideRepostedContent, setHideRepostedContent] = useState(false); // local only
...
<Row
    label={t('settings.hideRepostedContent')}
    ...
    value={hideRepostedContent}
    onToggle={setHideRepostedContent}
    ...
/>
```
- **Issue:** The comment explicitly says "local only". The toggle works visually but the setting is never sent to the API (unlike `sensitiveContent` which calls `wellbeingMutation.mutate()`). It resets to `false` on every screen mount. Users toggle it thinking it takes effect, but it never does.
- **Fix:** Either persist via API like the sensitive content toggle, or remove the toggle until backend support is added.

---

### FINDING-030: Content Settings — Daily Reminder Save Failure Silently Ignored
- **Severity:** P2 (Silent failure)
- **File:** `apps/mobile/app/(screens)/content-settings.tsx`
- **Lines:** 156-169
- **Code:**
```tsx
const handleUpdateDailyReminder = async (option: DailyReminderOption) => {
    setDailyReminder(option);
    ...
    try {
      await usersApi.updateDailyReminder(option !== 'off', timeMap[option]);
    } catch {
      // Silently fail — setting is persisted locally regardless
    }
};
```
- **Issue:** The comment says "Silently fail — setting is persisted locally regardless" but the setting is NOT persisted locally — it's in `useState` which resets on mount. So if the API fails AND the user leaves and returns, the setting is lost in both places.
- **Fix:** Either show an error toast on failure, or actually persist to local storage (AsyncStorage/MMKV).

---

### FINDING-031: Content Settings — Daily Reminder State Not Loaded from API
- **Severity:** P2 (Settings not hydrated)
- **File:** `apps/mobile/app/(screens)/content-settings.tsx`
- **Lines:** 132, 135-139
- **Code:**
```tsx
const [dailyReminder, setDailyReminder] = useState<DailyReminderOption>('off');
...
useEffect(() => {
    if (s) {
      setSensitiveContent(s.sensitiveContentFilter ?? false);
      // dailyReminder is NOT loaded from settings
    }
}, [s]);
```
- **Issue:** When settings load from API, `sensitiveContent` is hydrated from server state, but `dailyReminder` is not. It always starts at `'off'` regardless of server value. If a user previously set it to `'1h'`, they will see `'Off'` when they return to this screen.
- **Fix:** Add `setDailyReminder(s.dailyReminder ?? 'off')` in the useEffect.

---

### FINDING-032: Chat Lock — References `colors.emeraldDark` Which May Not Exist in Theme
- **Severity:** P3 (Potential runtime crash)
- **File:** `apps/mobile/app/(screens)/chat-lock.tsx`
- **Line:** 104
- **Code:**
```tsx
colors={locked ? [colors.emerald, colors.emeraldDark] : [colors.dark.surface, colors.dark.bgCard]}
```
- **Issue:** The theme tokens in CLAUDE.md document `colors.emerald` but NOT `colors.emeraldDark`. If this color is undefined, it will be passed as `undefined` to LinearGradient which may cause a runtime error or render incorrectly.
- **Same issue in:** `status-privacy.tsx` line 143, `chat-export.tsx` line 121.
- **Fix:** Verify `colors.emeraldDark` exists in the theme file. If not, either add it or use a hardcoded fallback like `'#057A3F'`.

---

### FINDING-033: Appeal Moderation — Evidence Upload Buttons Are No-Ops
- **Severity:** P2 (Feature stub)
- **File:** `apps/mobile/app/(screens)/appeal-moderation.tsx`
- **Lines:** 276-291
- **Code:**
```tsx
<Pressable style={styles.evidenceButton}>
    <View style={styles.evidenceButtonInner}>
      <Icon name="image" size="md" color={colors.emerald} />
      <Icon name="plus" size="xs" color={colors.gold} style={styles.evidencePlus} />
      <Text style={styles.evidenceButtonText}>{t('appealModeration.uploadImage')}</Text>
    </View>
</Pressable>

<Pressable style={styles.evidenceButton}>
    <View style={styles.evidenceButtonInner}>
      <Icon name="paperclip" size="md" color={colors.emerald} />
      ...
    </View>
</Pressable>
```
- **Issue:** Both evidence upload buttons have no `onPress` handler. Users see "Upload Image" and "Upload Document" buttons but tapping them does nothing. No image picker, no document picker, no feedback. This undermines the moderation appeal process — users who need to provide evidence to support their appeal cannot do so.
- **Fix:** Implement `expo-image-picker` and `expo-document-picker` for these buttons.

---

### FINDING-034: Appeal Moderation — Guidelines Link is a No-Op
- **Severity:** P3 (Dead link)
- **File:** `apps/mobile/app/(screens)/appeal-moderation.tsx`
- **Line:** 175
- **Code:**
```tsx
<Pressable style={styles.guidelinesLink}>
```
- **Issue:** The "Community Guidelines" link has no `onPress` handler. Users see a clickable-looking emerald text with a link icon but tapping does nothing.
- **Fix:** Add `onPress` that either navigates to a guidelines screen or opens a URL via `Linking.openURL()`.

---

### FINDING-035: Appeal Moderation — Uses Non-Standard Font Names
- **Severity:** P3 (Potential runtime issue)
- **File:** `apps/mobile/app/(screens)/appeal-moderation.tsx`
- **Lines:** 470, 477, 507, etc.
- **Code:**
```tsx
fontFamily: fonts.semibold,
fontFamily: fonts.regular,
fontFamily: fonts.medium,
```
- **Issue:** The screen references `fonts.semibold`, `fonts.regular`, and `fonts.medium`. Per CLAUDE.md, the theme exports `fonts.body`, `fonts.bodyMedium`, `fonts.bodyBold`, `fonts.headingBold`, etc. — NOT `fonts.semibold`, `fonts.regular`, or `fonts.medium`. These may be undefined at runtime, causing React Native to fall back to system fonts and break the design consistency.
- **Fix:** Replace with the documented font names: `fonts.bodyBold` for semibold, `fonts.body` for regular, `fonts.bodyMedium` for medium. Or verify these aliases exist in the theme.

---

### FINDING-036: Appeal Moderation — GlassHeader Uses `onBack` Instead of `leftAction`
- **Severity:** P3 (Inconsistent API usage)
- **File:** `apps/mobile/app/(screens)/appeal-moderation.tsx`
- **Line:** 123
- **Code:**
```tsx
<GlassHeader title={t('appealModeration.title')} onBack={() => router.back()} />
```
- **Issue:** Every other screen in this audit uses `leftAction={{ icon: 'arrow-left', onPress: () => router.back() }}` for the GlassHeader back button. This screen uses `onBack` which may or may not be a supported prop on GlassHeader. If it's not, the back button simply won't render.
- **Fix:** Use the standard `leftAction` pattern to ensure consistency.

---

### FINDING-037: 2FA Setup — Auto-Submit Race Condition
- **Severity:** P2 (Double-submit bug)
- **File:** `apps/mobile/app/(screens)/2fa-setup.tsx`
- **Lines:** 73-76
- **Code:**
```tsx
if (newCode.every(digit => digit !== '') && index === 5) {
    handleEnable2FA();
}
```
- **Issue:** The auto-submit triggers `handleEnable2FA()` when the 6th digit is entered. However, the "Enable 2FA" button (line 385-386) is ALSO pressable when all digits are filled. If the user types the 6th digit and also taps the button quickly, `handleEnable2FA` could fire twice. The function does set `isEnabling` to guard against this, but there's a window between the setState and the re-render where both could fire.
- **Same pattern in:** `2fa-verify.tsx` lines 62-65 — auto-submit calls `handleVerify()` which also has a manual verify button.
- **Fix:** Use a ref-based guard (`const submittingRef = useRef(false)`) to prevent double-submit, since setState is asynchronous.

---

### FINDING-038: 2FA Setup — Unused Imports
- **Severity:** P4 (Dead code)
- **File:** `apps/mobile/app/(screens)/2fa-setup.tsx`
- **Lines:** 8-9, 23
- **Code:**
```tsx
import { ..., Dimensions, ... } from 'react-native';
...
const { width: screenWidth } = Dimensions.get('window');
...
import { useUser } from '@/store';
```
- **Issue:** `screenWidth` is computed but never used anywhere in the component. `Dimensions` import is unnecessary. `useUser` is imported and `user` is assigned on line 48 but never used.
- **Same in:** `2fa-verify.tsx` line 31 — `screenWidth` is computed but never used; line 35 `user` is used only for `user?.id` which is fine.
- **Fix:** Remove unused imports and variables.

---

### FINDING-039: 2FA Verify — Unused Imports
- **Severity:** P4 (Dead code)
- **File:** `apps/mobile/app/(screens)/2fa-verify.tsx`
- **Lines:** 15, 28
- **Code:**
```tsx
import { withSpring } from 'react-native-reanimated';
...
import type { ValidateTwoFactorDto, BackupCodeDto } from '@/types/twoFactor';
```
- **Issue:** `withSpring` is imported but never used (the shake uses `withTiming` and `withSequence`). `ValidateTwoFactorDto` and `BackupCodeDto` types are imported but the code uses inline objects when calling `twoFactorApi.validate` and `twoFactorApi.backup`, not typed DTOs.
- **Fix:** Remove unused imports.

---

### FINDING-040: 2FA Setup — Missing useTranslation Dependency in useCallback
- **Severity:** P3 (Stale closure risk)
- **File:** `apps/mobile/app/(screens)/2fa-setup.tsx`
- **Line:** 93
- **Code:**
```tsx
}, []);
```
- **Issue:** The `fetchSetup` callback has an empty dependency array `[]` but uses `t` (from `useTranslation`) on lines 88-89. If the language changes while this screen is open, the error messages will be in the old language. This is a minor stale closure issue.
- **Fix:** Add `t` to the dependency array: `}, [t])`.

---

### FINDING-041: Close Friends — Uses `clerkUser?.id` for Comparison Instead of Backend User ID
- **Severity:** P2 (Potential ID mismatch)
- **File:** `apps/mobile/app/(screens)/close-friends.tsx`
- **Lines:** 92, 334
- **Code:**
```tsx
const currentUserId = clerkUser?.id;
...
isMe={clerkUser?.id === item.id}
```
- **Issue:** Clerk user IDs (from `@clerk/clerk-expo`) are Clerk-format IDs (e.g., `user_2abc...`). The followers returned by `followsApi.getFollowers` return backend user objects with backend IDs (could be CUIDs or UUIDs). If the backend stores Clerk user IDs as the primary ID, this works. But if the backend generates its own IDs (which is the case per CLAUDE.md — models use `@default(cuid())`), then `clerkUser?.id === item.id` will NEVER match, and the "isMe" check will never be true, meaning the user would see a toggle switch next to their own name.
- **Fix:** Verify that `followsApi.getFollowers` never returns the current user (which it shouldn't since you can't follow yourself), or use the backend user ID from `usersApi.getMe()` for comparison.

---

### FINDING-042: Content Filter Settings — Each Toggle Makes Separate API Call
- **Severity:** P3 (Performance/UX)
- **File:** `apps/mobile/app/(screens)/content-filter-settings.tsx`
- **Lines:** 73-103
- **Code:**
```tsx
const handleLevelChange = useCallback((level: StrictnessLevel) => {
    setLocalLevel(level);
    mutation.mutate({ strictnessLevel: level });
}, [mutation]);

const handleToggleBlurHaram = useCallback((val: boolean) => {
    setLocalBlurHaram(val);
    mutation.mutate({ blurHaram: val });
}, [mutation]);
// ... same for hideMusic, hideMixedGender
```
- **Issue:** Each toggle change immediately fires a separate API mutation. If a user changes 3 settings rapidly, 3 separate API calls fire. The mutation also shows a success alert (`Alert.alert(t('contentFilter.saved'))` on line 69) for each — so the user gets 3 alert popups. This is poor UX.
- **Fix:** Debounce the save, or use a "Save" button pattern, or at minimum remove the Alert from the onSuccess handler and use a toast instead.

---

### FINDING-043: Content Filter Settings — Success Alert Has No Message, Just Title
- **Severity:** P3 (UX)
- **File:** `apps/mobile/app/(screens)/content-filter-settings.tsx`
- **Line:** 69
- **Code:**
```tsx
onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ['content-filter-settings'] });
    Alert.alert(t('contentFilter.saved'));
},
```
- **Issue:** `Alert.alert` with a single argument shows a dialog with just a title and no message body. On iOS this looks like a blank popup with just "Saved" and an OK button — awkward UX for a simple setting save.
- **Fix:** Use a toast notification instead of Alert, or add a message body.

---

### FINDING-044: Parental Controls — hasControlsQuery Fetches Children List Twice
- **Severity:** P3 (Unnecessary API call)
- **File:** `apps/mobile/app/(screens)/parental-controls.tsx`
- **Lines:** 428-432, 466-469
- **Code:**
```tsx
const childrenQuery = useQuery({
    queryKey: ['parental-children'],
    queryFn: () => parentalApi.getChildren(),
    enabled: pinVerified,
});
...
const hasControlsQuery = useQuery({
    queryKey: ['parental-has-controls'],
    queryFn: () => parentalApi.getChildren(),
});
```
- **Issue:** `parentalApi.getChildren()` is called in two separate queries with different keys. Both make the same API call. `hasControlsQuery` fires immediately (to check if PIN gate is needed), and `childrenQuery` fires after PIN verification. Since they have different query keys, React Query doesn't deduplicate them. The same endpoint is hit twice.
- **Fix:** Use the same query key for both, or use `hasControlsQuery.data` to populate the children list after PIN verification.

---

### FINDING-045: Account Settings — ScrollView Missing RefreshControl
- **Severity:** P3 (Project rule violation)
- **File:** `apps/mobile/app/(screens)/account-settings.tsx`
- **Line:** 225
- **Code:**
```tsx
<ScrollView style={styles.body} contentContainerStyle={...}>
```
- **Issue:** Per CLAUDE.md absolute rule #7: "ALL FlatLists must have `<RefreshControl>`". While this rule explicitly says FlatList, the spirit applies to all scrollable content. This screen has a data query (`userQuery`) but no pull-to-refresh to reload it if it becomes stale.
- **Fix:** Add `<RefreshControl>` with `onRefresh={() => userQuery.refetch()}`.

---

### FINDING-046: Chat Export — No conversationId Validation
- **Severity:** P3 (Potential crash)
- **File:** `apps/mobile/app/(screens)/chat-export.tsx`
- **Lines:** 20, 29-30
- **Code:**
```tsx
const { conversationId } = useLocalSearchParams<{ conversationId: string }>();
...
useEffect(() => {
    if (!conversationId) return;
```
- **Issue:** If `conversationId` is missing from search params, the useEffect silently returns and the screen stays in loading state forever. The export button is disabled when `!stats` (which will be null if conversationId is missing), but there's no user-facing error message. The user sees a loading skeleton forever.
- **Fix:** Show an error state when conversationId is missing.

---

### FINDING-047: Chat Lock — References `colors.emeraldDark` Potentially Undefined
- **Severity:** P3 (Theme reference issue)
- **File:** `apps/mobile/app/(screens)/chat-lock.tsx`
- **Line:** 104
- **Code:**
```tsx
colors={locked ? [colors.emerald, colors.emeraldDark] : ...}
```
- **Issue:** Same as FINDING-032. `colors.emeraldDark` is not in the documented theme tokens.
- **Fix:** Same as FINDING-032.

---

### FINDING-048: Restricted Screen — Uses `alert-circle` Icon Name Not in Valid Set
- **Severity:** P3 (Invalid icon)
- **File:** `apps/mobile/app/(screens)/restricted.tsx`
- **Line:** 93
- **Code:**
```tsx
<EmptyState
    icon="alert-circle"
    ...
/>
```
- **Issue:** Per CLAUDE.md, the 44 valid Icon names are listed. `alert-circle` is NOT in the list. This would likely render as an empty/missing icon. Other screens correctly use `"flag"` for error states.
- **Fix:** Use `"flag"` or another valid icon name.

---

### FINDING-049: Multiple Screens — Email/Phone Displayed Without Masking
- **Severity:** P2 (Privacy concern)
- **File:** `apps/mobile/app/(screens)/account-settings.tsx`
- **Lines:** 89-90, 233-241
- **Code:**
```tsx
const primaryEmail = clerkUser?.emailAddresses?.find(...)?.emailAddress;
const primaryPhone = clerkUser?.phoneNumbers?.find(...)?.phoneNumber;
...
<Row label={t('auth.email')} value={primaryEmail || ...} />
<Row label={t('auth.phone')} value={primaryPhone || ...} />
```
- **Issue:** The full email address and phone number are displayed unmasked in the account settings. While this is behind auth, if someone shoulder-surfs or takes a screenshot, the full PII is visible. Instagram masks these as `s***@example.com` and `+1 *** *** 1234`.
- **Fix:** Mask the middle portion of emails and phone numbers in the display value.

---

### FINDING-050: Account Switcher — Inactive Session User Info Exposed Without Verification
- **Severity:** P2 (Information disclosure)
- **File:** `apps/mobile/app/(screens)/account-switcher.tsx`
- **Lines:** 89-104
- **Code:**
```tsx
const su = session.user;
return {
    id: su?.id ?? session.id,
    sessionId: session.id,
    displayName: su?.fullName ?? su?.username ?? 'Account',
    username: su?.username ?? '',
    avatarUrl: su?.imageUrl ?? null,
    ...
};
```
- **Issue:** For inactive Clerk sessions, the full user data (username, full name, avatar) is displayed without re-authenticating that session. If a shared device has multiple Clerk sessions, user A can see user B's full name, username, and avatar without user B's consent. This is an information disclosure issue on shared devices.
- **Fix:** Consider masking inactive account details (e.g., show only first name + last initial, or require the session to be activated before showing full details).

---

### FINDING-051: 2FA Setup — Backup Codes Displayed in Plain Text on Screen
- **Severity:** P2 (Security concern)
- **File:** `apps/mobile/app/(screens)/2fa-setup.tsx`
- **Lines:** 428-452
- **Code:**
```tsx
<View style={styles.backupGrid}>
    {backupCodes.map((code, idx) => (
        <Pressable key={idx} onPress={() => copyBackupCode(code)}>
            <Text style={styles.backupCodeText}>{code}</Text>
        </Pressable>
    ))}
</View>
```
- **Issue:** All backup codes are displayed simultaneously in a scrollable grid with monospace font. While this is necessary for the user to save them, there is no screenshot warning, no "This screen cannot be captured" protection, and no auto-dismiss timer. Combined with FINDING-001 and FINDING-002 (copy and download are both stubbed), the only way to save these codes is to take a screenshot — which is insecure.
- **Fix:** At minimum, add a warning banner: "Save these codes securely. Do not screenshot." Also implement the actual copy/download functionality (FINDING-001/002).

---

### FINDING-052: Account Settings — ScreenErrorBoundary Not Wrapping Loading/Error States
- **Severity:** P3 (Inconsistent error handling)
- **File:** `apps/mobile/app/(screens)/account-settings.tsx`
- **Lines:** 181-215
- **Code:**
```tsx
if (userQuery.isLoading) {
    return (
      <View style={styles.container}>...</View>  // No ScreenErrorBoundary
    );
}

if (userQuery.isError) {
    return (
      <View style={styles.container}>...</View>  // No ScreenErrorBoundary
    );
}

return (
    <ScreenErrorBoundary>  // Only wraps the success state
      <View style={styles.container}>...</View>
    </ScreenErrorBoundary>
);
```
- **Issue:** `ScreenErrorBoundary` only wraps the main content return, not the loading or error state returns. If an error occurs during the loading skeleton render (e.g., theme value is undefined), it won't be caught.
- **Fix:** Wrap all return paths with `ScreenErrorBoundary`, or wrap the entire component.

---

---

## SUMMARY

| Severity | Count | Description |
|----------|-------|-------------|
| **P1** | 5 | 2FA backup copy stubbed, 2FA download no-op, userId in 2FA request body, account deletion no re-auth, setState during render |
| **P2** | 16 | Secret copy no-op, OTP refs fragile, data export stub, manage accounts no-op, toggle not persisted, dead navigation, settings not reverted, settings not hydrated, silent failures, ID mismatch, PII exposure |
| **P3** | 16 | Duplicate imports (x4), hardcoded strings, invalid icon, font name mismatches, accessibility gaps, unnecessary API calls, theme references |
| **P4** | 4 | Unused imports, dead type aliases |
| **TOTAL** | **41** | |

### Critical Path Items (P1)
1. **FINDING-001 + FINDING-002:** 2FA backup codes cannot be copied or downloaded. Users WILL be locked out.
2. **FINDING-005:** 2FA validation accepts userId from client body — any user's 2FA can be validated.
3. **FINDING-010:** Account deletion with two taps, no re-authentication.
4. **FINDING-018:** setState during render in parental controls — potential infinite loop.

### Security-Specific Concerns
- 2FA setup flow has 3 stubbed actions (copy single, copy all, download) — codes are essentially un-saveable
- 2FA verify sends userId in request body instead of deriving from JWT
- Account deletion and deactivation require no password re-entry
- Parental controls PIN has no brute-force protection on client
- Full PII (email, phone) displayed without masking
- Inactive session user data visible without re-authentication
