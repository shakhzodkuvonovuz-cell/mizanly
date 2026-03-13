# i18n Implementation — Agent 14 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add i18n t() calls to 12 Islamic + Monetization + Utility screens as Agent 14 of Batch 35.

**Architecture:** Import useTranslation hook, add const { t } = useTranslation() inside each component, replace ALL user-visible hardcoded English strings with t() calls. Use existing keys from en.json where available, descriptive placeholder keys for missing translations.

**Tech Stack:** React Native, Expo SDK 52, TypeScript, react-i18next, i18next, @/hooks/useTranslation

**Files to Modify:**
1. ✅ `apps/mobile/app/(screens)/prayer-times.tsx` — COMPLETED
2. ✅ `apps/mobile/app/(screens)/hadith.tsx` — COMPLETED
3. ✅ `apps/mobile/app/(screens)/mosque-finder.tsx` — COMPLETED
4. ✅ `apps/mobile/app/(screens)/send-tip.tsx` — COMPLETED
5. ✅ `apps/mobile/app/(screens)/membership-tiers.tsx` — COMPLETED
6. 🔄 `apps/mobile/app/(screens)/2fa-setup.tsx` — IN PROGRESS
7. `apps/mobile/app/(screens)/audio-room.tsx`
8. `apps/mobile/app/(screens)/create-event.tsx`
9. `apps/mobile/app/(screens)/event-detail.tsx`
10. `apps/mobile/app/(screens)/search.tsx`
11. `apps/mobile/app/(screens)/notifications.tsx`
12. `apps/mobile/app/(screens)/discover.tsx`

**Rules:**
- ZERO file conflicts with other agents
- ONLY string replacements, NO component structure/styling/logic changes
- ALL user-visible strings replaced with t() calls
- String interpolation preserved: `${count} followers` → `t('key', { count })`
- Non-visible strings (console.log, API errors) NOT replaced
- 0 `as any` in code

---

### Task 1: Complete 2fa-setup.tsx i18n

**Files:**
- Modify: `apps/mobile/app/(screens)/2fa-setup.tsx`

**Step 1: Verify current status**
The file already has useTranslation import and hook. Check for remaining hardcoded strings:
- Alert.alert messages
- "Download Backup Codes" title
- "This would download a text file..." message
- "Cancel", "Download" button texts
- "Download" action button text
- "Done" button text
- App picker bottom sheet labels (authenticator app names are data, not UI strings)

**Step 2: Replace Alert.alert strings**
```typescript
// Line 86: Replace
Alert.alert('Setup Failed', 'Could not generate 2FA setup data. Please try again.');
// With
Alert.alert(t('common.error'), t('auth.setupFailedMessage'));

// Line 106-108: Replace
Alert.alert(
  '2FA Enabled',
  'Two-factor authentication is now enabled for your account. Save your backup codes!',
  [{ text: 'OK' }]
);
// With
Alert.alert(
  t('auth.twoFactorEnabled'),
  t('auth.twoFactorEnabledMessage'),
  [{ text: t('common.ok') }]
);

// Line 112: Replace
Alert.alert('Verification Failed', 'Invalid code. Please try again.');
// With
Alert.alert(t('common.error'), t('auth.verificationFailedMessage'));

// Line 122: Replace
Alert.alert('Copied', `Backup code ${code} copied to clipboard.`);
// With
Alert.alert(t('common.copied'), t('auth.backupCodeCopied', { code }));

// Line 128: Replace
Alert.alert('Copied', 'All backup codes copied to clipboard.');
// With
Alert.alert(t('common.copied'), t('auth.allBackupCodesCopied'));
```

**Step 3: Replace download backup codes strings**
```typescript
// Line 133-139: Replace
Alert.alert(
  'Download Backup Codes',
  'This would download a text file with your backup codes. Save it in a secure location.',
  [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Download', onPress: () => {} },
  ]
);
// With
Alert.alert(
  t('auth.downloadBackupCodes'),
  t('auth.downloadBackupCodesMessage'),
  [
    { text: t('common.cancel'), style: 'cancel' },
    { text: t('common.download'), onPress: () => {} },
  ]
);
```

**Step 4: Replace "Download" button text**
```typescript
// Line 469: Replace
<Text style={styles.backupActionText}>Download</Text>
// With
<Text style={styles.backupActionText}>{t('common.download')}</Text>
```

**Step 5: Replace "Done" button text**
```typescript
// Line 482: Replace
<Text style={styles.nextButtonText}>Done</Text>
// With
<Text style={styles.nextButtonText}>{t('common.done')}</Text>
```

**Step 6: Verify all strings replaced**
Run grep to check for remaining hardcoded strings:
```bash
cd apps/mobile && grep -n '"' app/\(screens\)/2fa-setup.tsx | grep -v "import\|'\|//\|style=\|test-id="
```
Expected: No user-facing English strings except import statements and style names.

**Step 7: Commit**
```bash
cd "C:\Users\shakh\OneDrive\Desktop\mizanly" && git add apps/mobile/app/\(screens\)/2fa-setup.tsx && git commit -m "feat: complete 2fa-setup.tsx i18n"
```

---

### Task 2: audio-room.tsx i18n

**Files:**
- Modify: `apps/mobile/app/(screens)/audio-room.tsx`

**Step 1: Read file to understand structure**
```bash
cd "C:\Users\shakh\OneDrive\Desktop\mizanly" && head -100 apps/mobile/app/\(screens\)/audio-room.tsx
```

**Step 2: Add useTranslation import**
```typescript
// Add after other imports
import { useTranslation } from '@/hooks/useTranslation';
```

**Step 3: Add useTranslation hook**
```typescript
// Inside component function, after other hooks
const { t } = useTranslation();
```

**Step 4: Replace GlassHeader title**
Find GlassHeader component and replace title prop with t() call. Look for:
```typescript
<GlassHeader title="Audio Room" ... />
// Replace with
<GlassHeader title={t('tabs.audioRooms')} ... />
```

**Step 5: Replace other user-facing strings**
Systematically replace all Text components, placeholders, button labels, Alert.alert messages with t() calls. Use descriptive keys:
- "Join Room" → `t('audioRoom.joinRoom')`
- "Leave Room" → `t('audioRoom.leaveRoom')`
- "Raise Hand" → `t('audioRoom.raiseHand')`
- "Mute" → `t('audioRoom.mute')`
- "Unmute" → `t('audioRoom.unmute')`
- "Host", "Speaker", "Listener" → `t('audioRoom.role.host')`, etc.
- "Participants" → `t('audioRoom.participants')`
- "No active audio rooms" → `t('audioRoom.noActiveRooms')`

**Step 6: Verify all strings replaced**
```bash
cd apps/mobile && grep -n '"' app/\(screens\)/audio-room.tsx | grep -v "import\|'\|//\|style=\|test-id=\|{t(\|colors\.\|spacing\.\|radius\.\|fontSize\."
```

**Step 7: Commit**
```bash
cd "C:\Users\shakh\OneDrive\Desktop\mizanly" && git add apps/mobile/app/\(screens\)/audio-room.tsx && git commit -m "feat: add i18n to audio-room.tsx"
```

---

### Task 3: create-event.tsx i18n

**Files:**
- Modify: `apps/mobile/app/(screens)/create-event.tsx`

**Step 1: Read file structure**
```bash
cd "C:\Users\shakh\OneDrive\Desktop\mizanly" && head -100 apps/mobile/app/\(screens\)/create-event.tsx
```

**Step 2: Add useTranslation import**
```typescript
import { useTranslation } from '@/hooks/useTranslation';
```

**Step 3: Add useTranslation hook**
```typescript
const { t } = useTranslation();
```

**Step 4: Replace GlassHeader title**
```typescript
// Find and replace
<GlassHeader title="Create Event" ... />
// With
<GlassHeader title={t('events.createEvent')} ... />
```

**Step 5: Replace form labels and placeholders**
- "Event Title" → `t('events.eventTitle')`
- "Description" → `t('events.description')`
- "Location" → `t('events.location')`
- "Date & Time" → `t('events.dateTime')`
- "Private Event" → `t('events.privateEvent')`
- "Create" → `t('common.create')`
- "Cancel" → `t('common.cancel')`

**Step 6: Replace validation/error messages**
- "Title is required" → `t('events.titleRequired')`
- "Please select a date and time" → `t('events.dateRequired')`

**Step 7: Verify all strings replaced**
```bash
cd apps/mobile && grep -n '"' app/\(screens\)/create-event.tsx | grep -v "import\|'\|//\|style=\|test-id=\|{t(\|colors\.\|spacing\.\|radius\.\|fontSize\."
```

**Step 8: Commit**
```bash
cd "C:\Users\shakh\OneDrive\Desktop\mizanly" && git add apps/mobile/app/\(screens\)/create-event.tsx && git commit -m "feat: add i18n to create-event.tsx"
```

---

### Task 4: event-detail.tsx i18n

**Files:**
- Modify: `apps/mobile/app/(screens)/event-detail.tsx`

**Step 1: Read file structure**
```bash
cd "C:\Users\shakh\OneDrive\Desktop\mizanly" && head -100 apps/mobile/app/\(screens\)/event-detail.tsx
```

**Step 2: Add useTranslation import and hook**
```typescript
import { useTranslation } from '@/hooks/useTranslation';
// Inside component
const { t } = useTranslation();
```

**Step 3: Replace GlassHeader title**
Use dynamic title based on event name, but check for any static fallback.

**Step 4: Replace action buttons**
- "RSVP" → `t('events.rsvp')`
- "Going" → `t('events.going')`
- "Maybe" → `t('events.maybe')`
- "Can't Go" → `t('events.cantGo')`
- "Share" → `t('common.share')`
- "Edit" → `t('common.edit')` (if user is owner)
- "Delete" → `t('common.delete')` (if user is owner)

**Step 5: Replace section headers**
- "Details" → `t('events.details')`
- "Attendees" → `t('events.attendees')`
- "Going (X)" → `t('events.goingCount', { count: goingCount })`
- "Maybe (X)" → `t('events.maybeCount', { count: maybeCount })`

**Step 6: Replace status messages**
- "Event has ended" → `t('events.eventEnded')`
- "Event starts in X hours" → `t('events.startsIn', { hours: remainingHours })`

**Step 7: Verify all strings replaced**
```bash
cd apps/mobile && grep -n '"' app/\(screens\)/event-detail.tsx | grep -v "import\|'\|//\|style=\|test-id=\|{t(\|colors\.\|spacing\.\|radius\.\|fontSize\."
```

**Step 8: Commit**
```bash
cd "C:\Users\shakh\OneDrive\Desktop\mizanly" && git add apps/mobile/app/\(screens\)/event-detail.tsx && git commit -m "feat: add i18n to event-detail.tsx"
```

---

### Task 5: search.tsx i18n

**Files:**
- Modify: `apps/mobile/app/(screens)/search.tsx`

**Step 1: Read file structure**
```bash
cd "C:\Users\shakh\OneDrive\Desktop\mizanly" && head -100 apps/mobile/app/\(screens\)/search.tsx
```

**Step 2: Add useTranslation import and hook**
```typescript
import { useTranslation } from '@/hooks/useTranslation';
const { t } = useTranslation();
```

**Step 3: Replace search bar placeholder**
```typescript
// Find and replace
placeholder="Search..."
// With
placeholder={t('common.search')}
```

**Step 4: Replace tab labels**
- "All" → `t('search.all')`
- "Posts" → `t('search.posts')`
- "People" → `t('search.people')`
- "Hashtags" → `t('search.hashtags')`
- "Spaces" → `t('search.spaces')`

**Step 5: Replace empty state messages**
- "No results found" → `t('common.noResults')`
- "Try different keywords" → `t('search.tryDifferentKeywords')`

**Step 6: Replace result labels**
- "Recent Searches" → `t('search.recentSearches')`
- "Trending Now" → `t('search.trendingNow')`
- "Clear All" → `t('search.clearAll')`

**Step 7: Verify all strings replaced**
```bash
cd apps/mobile && grep -n '"' app/\(screens\)/search.tsx | grep -v "import\|'\|//\|style=\|test-id=\|{t(\|colors\.\|spacing\.\|radius\.\|fontSize\."
```

**Step 8: Commit**
```bash
cd "C:\Users\shakh\OneDrive\Desktop\mizanly" && git add apps/mobile/app/\(screens\)/search.tsx && git commit -m "feat: add i18n to search.tsx"
```

---

### Task 6: notifications.tsx i18n

**Files:**
- Modify: `apps/mobile/app/(screens)/notifications.tsx`

**Step 1: Read file structure**
```bash
cd "C:\Users\shakh\OneDrive\Desktop\mizanly" && head -100 apps/mobile/app/\(screens\)/notifications.tsx
```

**Step 2: Add useTranslation import and hook**
```typescript
import { useTranslation } from '@/hooks/useTranslation';
const { t } = useTranslation();
```

**Step 3: Replace GlassHeader title**
```typescript
<GlassHeader title={t('common.notifications')} ... />
```

**Step 4: Replace tab/filter labels**
- "All" → `t('notifications.all')`
- "Mentions" → `t('notifications.mentions')`
- "Follows" → `t('notifications.follows')`
- "Likes" → `t('notifications.likes')`
- "Comments" → `t('notifications.comments')`

**Step 5: Replace empty state**
- "No notifications yet" → `t('notifications.empty')`
- "When you get notifications, they'll appear here" → `t('notifications.emptySubtitle')`

**Step 6: Replace action buttons**
- "Mark all as read" → `t('notifications.markAllRead')`
- "Settings" → `t('notifications.settings')`
- "Clear all" → `t('notifications.clearAll')`

**Step 7: Replace notification type labels**
Check for any hardcoded notification type display names.

**Step 8: Verify all strings replaced**
```bash
cd apps/mobile && grep -n '"' app/\(screens\)/notifications.tsx | grep -v "import\|'\|//\|style=\|test-id=\|{t(\|colors\.\|spacing\.\|radius\.\|fontSize\."
```

**Step 9: Commit**
```bash
cd "C:\Users\shakh\OneDrive\Desktop\mizanly" && git add apps/mobile/app/\(screens\)/notifications.tsx && git commit -m "feat: add i18n to notifications.tsx"
```

---

### Task 7: discover.tsx i18n

**Files:**
- Modify: `apps/mobile/app/(screens)/discover.tsx`

**Step 1: Read file structure**
```bash
cd "C:\Users\shakh\OneDrive\Desktop\mizanly" && head -100 apps/mobile/app/\(screens\)/discover.tsx
```

**Step 2: Add useTranslation import and hook**
```typescript
import { useTranslation } from '@/hooks/useTranslation';
const { t } = useTranslation();
```

**Step 3: Replace GlassHeader title**
```typescript
<GlassHeader title={t('tabs.discover')} ... />
```

**Step 4: Replace section headers**
- "Trending Now" → `t('discover.trendingNow')`
- "Popular Creators" → `t('discover.popularCreators')`
- "Recommended for You" → `t('discover.recommendedForYou')`
- "Explore Spaces" → `t('discover.exploreSpaces')`

**Step 5: Replace category labels**
- "Music" → `t('discover.categories.music')`
- "Comedy" → `t('discover.categories.comedy')`
- "Education" → `t('discover.categories.education')`
- "Gaming" → `t('discover.categories.gaming')`
- "Islamic" → `t('discover.categories.islamic')`

**Step 6: Replace action buttons**
- "Follow" → `t('common.follow')`
- "Following" → `t('common.following')`
- "See All" → `t('common.viewAll')`
- "Refresh" → `t('common.refresh')`

**Step 7: Replace empty/error states**
- "Failed to load discover content" → `t('discover.loadFailed')`
- "Try again" → `t('common.retry')`
- "No content to show" → `t('discover.noContent')`

**Step 8: Verify all strings replaced**
```bash
cd apps/mobile && grep -n '"' app/\(screens\)/discover.tsx | grep -v "import\|'\|//\|style=\|test-id=\|{t(\|colors\.\|spacing\.\|radius\.\|fontSize\."
```

**Step 9: Commit**
```bash
cd "C:\Users\shakh\OneDrive\Desktop\mizanly" && git add apps/mobile/app/\(screens\)/discover.tsx && git commit -m "feat: add i18n to discover.tsx"
```

---

### Task 8: Final Verification and Commit

**Step 1: Verify all 12 files modified**
```bash
cd "C:\Users\shakh\OneDrive\Desktop\mizanly" && git status | grep "modified:" | grep -c "(screens)"
```
Expected: 12 files

**Step 2: Check for remaining hardcoded strings**
```bash
cd apps/mobile && for file in app/\(screens\)/{prayer-times,hadith,mosque-finder,send-tip,membership-tiers,2fa-setup,audio-room,create-event,event-detail,search,notifications,discover}.tsx; do echo "=== $file ==="; grep -n '"' "$file" | grep -v "import\|'\|//\|style=\|test-id=\|{t(\|colors\.\|spacing\.\|radius\.\|fontSize\.\|animation\.\|twoFactorApi\|useUser\|useTranslation" | head -5; done
```

**Step 3: Check for as any violations**
```bash
cd apps/mobile && grep -r "as any" app/\(screens\)/{prayer-times,hadith,mosque-finder,send-tip,membership-tiers,2fa-setup,audio-room,create-event,event-detail,search,notifications,discover}.tsx
```
Expected: No output

**Step 4: Final commit**
```bash
cd "C:\Users\shakh\OneDrive\Desktop\mizanly" && git add -A && git commit -m "$(cat <<'EOF'
feat: batch 35 agent 14 — i18n rollout for Islamic + Monetization + Utility screens

Added useTranslation hooks and t() calls to 12 screens:
 - prayer-times.tsx
 - hadith.tsx
 - mosque-finder.tsx
 - send-tip.tsx
 - membership-tiers.tsx
 - 2fa-setup.tsx
 - audio-room.tsx
 - create-event.tsx
 - event-detail.tsx
 - search.tsx
 - notifications.tsx
 - discover.tsx

All user-visible strings replaced with translation keys.
Zero file conflicts with other Batch 35 agents.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

**Step 5: Verify commit**
```bash
cd "C:\Users\shakh\OneDrive\Desktop\mizanly" && git log --oneline -1
```

---

## Execution Options

**Plan complete and saved to `docs/plans/2026-03-13-i18n-agent14-implementation.md`. Two execution options:**

**1. Subagent-Driven (this session)** - I dispatch fresh subagent per task, review between tasks, fast iteration

**2. Parallel Session (separate)** - Open new session with executing-plans, batch execution with checkpoints

**Which approach?**