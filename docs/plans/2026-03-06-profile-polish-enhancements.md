# Profile Polish Enhancements Design
**Date:** 2026-03-06
**Status:** Approved
**Related to:** ARCHITECT_INSTRUCTIONS.md Step 4 (partial completion)
**Git commit:** a953a48 (Step 4 Profile Polish)

## Overview
Step 4 of ARCHITECT_INSTRUCTIONS.md has been partially implemented. This design covers the remaining enhancements to complete the profile polish features:

1. **QR Code screen** – missing from the “Share profile + QR code” task
2. **RichText URL parsing improvement** – protocol‑less URLs not recognized
3. **Settings UI cleanup** – duplicate divider, stray section header

## Current State
- ✅ **4.1 Profile links clickable** – implemented (profileLinks rendered with icon + tappable Pressable)
- ✅ **4.2 Bio URL parsing** – works for `http(s)://` URLs via RichText component
- ✅ **4.3 Share profile button** – direct share via `Share.share()`; QR screen missing
- ✅ **4.4 Theme selector UI** – implemented (Dark/Light/System radio options)

## 1. QR Code Screen

### Flow
1. User taps share button in profile header
2. Show `<BottomSheet>` with two options:
   - **Share Profile** – calls existing `handleShareProfile()` (Share.share)
   - **Show QR Code** – navigates to `/(screens)/qr-profile`
3. QR screen displays QR code for deep‑link `mizanly://profile/username` with save/share options

### Screen Design (`apps/mobile/app/(screens)/qr-profile.tsx`)
```
┌─────────────────────────┐
│ ← Share Profile         │
├─────────────────────────┤
│      [QR CODE]          │
│      [Avatar]           │
│      Display Name       │
│      @username          │
├─────────────────────────┤
│ [Save QR Code] button   │
│ [Share QR Code] button  │
└─────────────────────────┘
```

#### Components
- **Back button** – `<Icon name="arrow-left">`
- **QR Code** – `react‑native‑qrcode‑svg` encoding `mizanly://profile/${username}`
- **Profile info** – Avatar, display name, username (from route params)
- **Save button** – captures view with `react‑native‑view‑shot`, saves via `expo‑media‑library`
- **Share button** – shares captured image with `Share.share`

#### Dependencies
```bash
cd apps/mobile && npx expo install react-native-qrcode-svg react-native-view-shot expo-media-library
```

#### Route
- Path: `/(screens)/qr-profile`
- Params: `{ username: string, displayName?: string, avatarUrl?: string }`
- Navigation: from profile screen via `router.push('/(screens)/qr-profile', { username, displayName: profile.displayName, avatarUrl: profile.avatarUrl })`

## 2. RichText URL Parsing Enhancement

### Problem
Current regex (`https?:\/\/[^\s]+`) only matches URLs with explicit `http://` or `https://` protocol. Protocol‑less URLs like `example.com`, `www.example.com/path` are not recognized.

### Solution
Update `TOKEN_RE` in `apps/mobile/src/components/ui/RichText.tsx` to:
```ts
const TOKEN_RE = /(https?:\/\/[^\s]+|www\.[^\s]+|\b[\w.-]+\.[a-z]{2,}(?:\/[^\s]*)?)/gi;
```

#### Token handling
- If token starts with `http` → treat as URL (existing logic)
- Else prepend `https://` before passing to `Linking.openURL()`

#### Edge cases
- Exclude trailing punctuation (`.` or `,`) from match
- Support IDN/punycode? Not required for MVP
- Keep existing hashtag (`#...`) and mention (`@...`) patterns unchanged

## 3. Settings UI Cleanup

### Issues in `apps/mobile/app/(screens)/settings.tsx`
1. **Duplicate divider** (lines 207‑208) – two consecutive `View style={styles.divider}` elements after “Private Account” row
2. **Stray “Content” section header** (line 154) – appears above “Appearance” with no content below it

### Fix
- Remove the extra divider (keep one)
- Remove the stray “Content” section header (or add content beneath it; but “Saved” is already under “Appearance”)

### Result
Section order:
1. Appearance (theme selector + Saved row)
2. Privacy
3. Notifications
4. Wellbeing
5. Accessibility
6. Blocked & Muted
7. Close Friends
8. Account

## Implementation Order

1. **Install dependencies** for QR screen
2. **Create QR screen** (`qr-profile.tsx`)
3. **Update profile screen** to show BottomSheet with share/QR options
4. **Enhance RichText** URL regex
5. **Clean up settings** UI

## Success Criteria
- [ ] QR screen accessible via share button BottomSheet
- [ ] QR code encodes correct deep‑link and can be scanned
- [ ] Save QR button saves image to device gallery
- [ ] Share QR button shares image
- [ ] RichText recognizes `example.com`, `www.example.com/path` as tappable URLs
- [ ] Settings UI has no duplicate dividers or stray headers
- [ ] No regressions in existing functionality

## Notes
- QR deep‑link `mizanly://profile/username` will need proper app‑scheme registration in `app.json`
- Light theme colors are not fully defined; theme toggle UI works but light mode may look incomplete
- Profile links already implemented in commit a953a48

---

**Next Step:** Invoke writing‑plans skill to create detailed implementation plan.
