# Batch 36 Agent 10 i18n Rollout Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add i18n t() calls to remaining 30+ screen files (Batch 3) with proper key naming, pluralization handling, and translation file updates.

**Architecture:** Use existing i18n framework (react-i18next + expo-localization). Add useTranslation hook imports, replace hardcoded English strings with t() calls, handle pluralization via i18next interpolation, add missing keys to en.json and ar.json.

**Tech Stack:** React Native Expo SDK 52, TypeScript, react-i18next, expo-localization

---

## Prerequisite: Verify Files

### Task 1: Check for existing i18n usage

**Files:**
- Check: `apps/mobile/app/(screens)/followers/[userId].tsx`
- Check: `apps/mobile/app/(screens)/following/[userId].tsx`
- Check: `apps/mobile/app/(screens)/hashtag-explore.tsx`
- Check: `apps/mobile/app/(screens)/hashtag/[tag].tsx`
- Check: `apps/mobile/app/(screens)/live/[id].tsx`
- Check: `apps/mobile/app/(screens)/majlis-lists.tsx`
- Check: `apps/mobile/app/(screens)/manage-broadcast.tsx`
- Check: `apps/mobile/app/(screens)/muted.tsx`
- Check: `apps/mobile/app/(screens)/mutual-followers.tsx`
- Check: `apps/mobile/app/(screens)/my-reports.tsx`
- Check: `apps/mobile/app/(screens)/pinned-messages.tsx`
- Check: `apps/mobile/app/(screens)/playlist/[id].tsx`
- Check: `apps/mobile/app/(screens)/playlists/[channelId].tsx`
- Check: `apps/mobile/app/(screens)/qr-code.tsx`
- Check: `apps/mobile/app/(screens)/qr-scanner.tsx`
- Check: `apps/mobile/app/(screens)/report.tsx`
- Check: `apps/mobile/app/(screens)/reports/[id].tsx`
- Check: `apps/mobile/app/(screens)/save-to-playlist.tsx`
- Check: `apps/mobile/app/(screens)/saved.tsx`
- Check: `apps/mobile/app/(screens)/schedule-live.tsx`
- Check: `apps/mobile/app/(screens)/schedule-post.tsx`
- Check: `apps/mobile/app/(screens)/search-results.tsx`
- Check: `apps/mobile/app/(screens)/share-profile.tsx`
- Check: `apps/mobile/app/(screens)/sound/[id].tsx`
- Check: `apps/mobile/app/(screens)/starred-messages.tsx`
- Check: `apps/mobile/app/(screens)/sticker-browser.tsx`
- Check: `apps/mobile/app/(screens)/theme-settings.tsx`
- Check: `apps/mobile/app/(screens)/trending-audio.tsx`
- Check: `apps/mobile/app/(screens)/watch-history.tsx`
- Check: `apps/mobile/app/(tabs)/minbar.tsx`

**Step 1: Create skip list**

```bash
cd apps/mobile
grep -l "useTranslation" app/\(screens\)/followers/\[userId\].tsx 2>/dev/null || echo "No useTranslation in followers"
grep -l "useTranslation" app/\(screens\)/following/\[userId\].tsx 2>/dev/null || echo "No useTranslation in following"
grep -l "useTranslation" app/\(screens\)/hashtag-explore.tsx 2>/dev/null || echo "No useTranslation in hashtag-explore"
grep -l "useTranslation" app/\(screens\)/hashtag/\[tag\].tsx 2>/dev/null || echo "No useTranslation in hashtag/[tag]"
grep -l "useTranslation" app/\(screens\)/live/\[id\].tsx 2>/dev/null || echo "No useTranslation in live/[id]"
grep -l "useTranslation" app/\(screens\)/majlis-lists.tsx 2>/dev/null || echo "No useTranslation in majlis-lists"
grep -l "useTranslation" app/\(screens\)/manage-broadcast.tsx 2>/dev/null || echo "No useTranslation in manage-broadcast"
grep -l "useTranslation" app/\(screens\)/muted.tsx 2>/dev/null || echo "No useTranslation in muted"
grep -l "useTranslation" app/\(screens\)/mutual-followers.tsx 2>/dev/null || echo "No useTranslation in mutual-followers"
grep -l "useTranslation" app/\(screens\)/my-reports.tsx 2>/dev/null || echo "No useTranslation in my-reports"
grep -l "useTranslation" app/\(screens\)/pinned-messages.tsx 2>/dev/null || echo "No useTranslation in pinned-messages"
grep -l "useTranslation" app/\(screens\)/playlist/\[id\].tsx 2>/dev/null || echo "No useTranslation in playlist/[id]"
grep -l "useTranslation" app/\(screens\)/playlists/\[channelId\].tsx 2>/dev/null || echo "No useTranslation in playlists/[channelId]"
grep -l "useTranslation" app/\(screens\)/qr-code.tsx 2>/dev/null || echo "No useTranslation in qr-code"
grep -l "useTranslation" app/\(screens\)/qr-scanner.tsx 2>/dev/null || echo "No useTranslation in qr-scanner"
grep -l "useTranslation" app/\(screens\)/report.tsx 2>/dev/null || echo "No useTranslation in report"
grep -l "useTranslation" app/\(screens\)/reports/\[id\].tsx 2>/dev/null || echo "No useTranslation in reports/[id]"
grep -l "useTranslation" app/\(screens\)/save-to-playlist.tsx 2>/dev/null || echo "No useTranslation in save-to-playlist"
grep -l "useTranslation" app/\(screens\)/saved.tsx 2>/dev/null || echo "No useTranslation in saved"
grep -l "useTranslation" app/\(screens\)/schedule-live.tsx 2>/dev/null || echo "No useTranslation in schedule-live"
grep -l "useTranslation" app/\(screens\)/schedule-post.tsx 2>/dev/null || echo "No useTranslation in schedule-post"
grep -l "useTranslation" app/\(screens\)/search-results.tsx 2>/dev/null || echo "No useTranslation in search-results"
grep -l "useTranslation" app/\(screens\)/share-profile.tsx 2>/dev/null || echo "No useTranslation in share-profile"
grep -l "useTranslation" app/\(screens\)/sound/\[id\].tsx 2>/dev/null || echo "No useTranslation in sound/[id]"
grep -l "useTranslation" app/\(screens\)/starred-messages.tsx 2>/dev/null || echo "No useTranslation in starred-messages"
grep -l "useTranslation" app/\(screens\)/sticker-browser.tsx 2>/dev/null || echo "No useTranslation in sticker-browser"
grep -l "useTranslation" app/\(screens\)/theme-settings.tsx 2>/dev/null || echo "No useTranslation in theme-settings"
grep -l "useTranslation" app/\(screens\)/trending-audio.tsx 2>/dev/null || echo "No useTranslation in trending-audio"
grep -l "useTranslation" app/\(screens\)/watch-history.tsx 2>/dev/null || echo "No useTranslation in watch-history"
grep -l "useTranslation" app/\(tabs\)/minbar.tsx 2>/dev/null || echo "No useTranslation in minbar"
```

**Step 2: Create file list to process**

Create file `i18n-files-to-process.txt` with files that don't have useTranslation.

**Step 3: Commit skip list**

```bash
git add i18n-files-to-process.txt
git commit -m "chore: batch 36 agent 10 — i18n file skip list"
```

---

## Group 1: Followers & Following Screens

### Task 2: Process followers/[userId].tsx

**Files:**
- Modify: `apps/mobile/app/(screens)/followers/[userId].tsx`
- Modify: `apps/mobile/src/i18n/en.json`
- Modify: `apps/mobile/src/i18n/ar.json`

**Step 1: Add useTranslation import**

Add after existing imports:
```tsx
import { useTranslation } from '@/hooks/useTranslation';
```

**Step 2: Add t() call in component**

Add inside component function:
```tsx
const { t } = useTranslation();
```

**Step 3: Replace static strings**

Find and replace:
- `"Followers"` → `{t('screens.followers.title')}`
- `"Following"` → `{t('common.following')}` (check if exists)
- `"Follow"` → `{t('common.follow')}`
- `"No followers yet"` → `{t('screens.followers.emptyState')}`

**Step 4: Handle pluralization**

Replace:
```tsx
<Text>{count} followers</Text>
```
with:
```tsx
<Text>{t('screens.followers.count', { count })}</Text>
```

**Step 5: Add keys to translation files**

Add to `en.json`:
```json
"screens": {
  "followers": {
    "title": "Followers",
    "count_one": "{{count}} follower",
    "count_other": "{{count}} followers",
    "emptyState": "No followers yet"
  }
}
```

Copy same structure to `ar.json` with English placeholders.

**Step 6: Test TypeScript compilation**

```bash
cd apps/mobile
npx tsc --noEmit app/\(screens\)/followers/\[userId\].tsx
```

**Step 7: Commit changes**

```bash
git add apps/mobile/app/\(screens\)/followers/\[userId\].tsx apps/mobile/src/i18n/en.json apps/mobile/src/i18n/ar.json
git commit -m "feat: batch 36 agent 10 — i18n followers screen"
```

---

### Task 3: Process following/[userId].tsx

**Files:**
- Modify: `apps/mobile/app/(screens)/following/[userId].tsx`
- Modify: `apps/mobile/src/i18n/en.json`
- Modify: `apps/mobile/src/i18n/ar.json`

**Step 1: Add useTranslation import and t() call**

Same pattern as Task 2.

**Step 2: Replace static strings**

- `"Following"` → `{t('screens.following.title')}`
- `"No following yet"` → `{t('screens.following.emptyState')}`

**Step 3: Add keys to translation files**

Add to `en.json`:
```json
"screens": {
  "following": {
    "title": "Following",
    "emptyState": "No following yet"
  }
}
```

**Step 4: Test and commit**

```bash
cd apps/mobile
npx tsc --noEmit app/\(screens\)/following/\[userId\].tsx
git add apps/mobile/app/\(screens\)/following/\[userId\].tsx apps/mobile/src/i18n/en.json apps/mobile/src/i18n/ar.json
git commit -m "feat: batch 36 agent 10 — i18n following screen"
```

---

## Group 2: Hashtag Screens

### Task 4: Process hashtag-explore.tsx

**Files:**
- Modify: `apps/mobile/app/(screens)/hashtag-explore.tsx`
- Modify: `apps/mobile/src/i18n/en.json`
- Modify: `apps/mobile/src/i18n/ar.json`

**Step 1: Add useTranslation import and t() call**

**Step 2: Replace static strings**

Look for:
- `"Explore Hashtags"`
- `"Search hashtags..."`
- `"Trending"`
- `"Popular"`
- `"Recent"`
- `"No hashtags found"`

Replace with `t('screens.hashtag-explore.*')` keys.

**Step 3: Add keys**

```json
"screens": {
  "hashtag-explore": {
    "title": "Explore Hashtags",
    "searchPlaceholder": "Search hashtags...",
    "trending": "Trending",
    "popular": "Popular",
    "recent": "Recent",
    "emptyState": "No hashtags found"
  }
}
```

**Step 4: Test and commit**

---

### Task 5: Process hashtag/[tag].tsx

**Files:**
- Modify: `apps/mobile/app/(screens)/hashtag/[tag].tsx`
- Modify: `apps/mobile/src/i18n/en.json`
- Modify: `apps/mobile/src/i18n/ar.json`

**Step 1: Add useTranslation import and t() call**

**Step 2: Replace static strings**

Look for:
- `"Posts"`
- `"Top"`
- `"Latest"`
- `"No posts with this hashtag"`

**Step 3: Add keys**

```json
"screens": {
  "hashtag": {
    "posts": "Posts",
    "top": "Top",
    "latest": "Latest",
    "emptyState": "No posts with this hashtag"
  }
}
```

**Step 4: Test and commit**

---

## Group 3: Live & Broadcast Screens

### Task 6: Process live/[id].tsx

**Files:**
- Modify: `apps/mobile/app/(screens)/live/[id].tsx`
- Modify: `apps/mobile/src/i18n/en.json`
- Modify: `apps/mobile/src/i18n/ar.json`

**Step 1: Add useTranslation import and t() call**

**Step 2: Replace static strings**

Look for:
- `"Live"`
- `"viewers"`
- `"Comments"`
- `"Say something..."`
- `"Share"`
- `"Gift"`

**Step 3: Handle pluralization for viewers**

Replace `{viewerCount} viewers` with `{t('screens.live.viewers', { count: viewerCount })}`

Add to `en.json`:
```json
"screens": {
  "live": {
    "title": "Live",
    "viewers_one": "{{count}} viewer",
    "viewers_other": "{{count}} viewers",
    "comments": "Comments",
    "commentPlaceholder": "Say something...",
    "share": "Share",
    "gift": "Gift"
  }
}
```

**Step 4: Test and commit**

---

### Task 7: Process manage-broadcast.tsx

**Files:**
- Modify: `apps/mobile/app/(screens)/manage-broadcast.tsx`
- Modify: `apps/mobile/src/i18n/en.json`
- Modify: `apps/mobile/src/i18n/ar.json`

**Step 1: Add useTranslation import and t() call**

**Step 2: Replace static strings**

Look for:
- `"Manage Broadcast"`
- `"Title"`
- `"Description"`
- `"Privacy"`
- `"Public"`
- `"Private"`
- `"Schedule"`
- `"Save Changes"`

**Step 3: Add keys**

```json
"screens": {
  "manage-broadcast": {
    "title": "Manage Broadcast",
    "fields": {
      "title": "Title",
      "description": "Description",
      "privacy": "Privacy",
      "public": "Public",
      "private": "Private",
      "schedule": "Schedule"
    },
    "save": "Save Changes"
  }
}
```

**Step 4: Test and commit**

---

## Group 4: Moderation & Report Screens

### Task 8: Process muted.tsx

**Files:**
- Modify: `apps/mobile/app/(screens)/muted.tsx`
- Modify: `apps/mobile/src/i18n/en.json`
- Modify: `apps/mobile/src/i18n/ar.json`

**Step 1: Add useTranslation import and t() call**

**Step 2: Replace static strings**

Look for:
- `"Muted Accounts"`
- `"No muted accounts"`
- `"Unmute"`

**Step 3: Add keys**

```json
"screens": {
  "muted": {
    "title": "Muted Accounts",
    "emptyState": "No muted accounts",
    "unmute": "Unmute"
  }
}
```

**Step 4: Test and commit**

---

### Task 9: Process my-reports.tsx

**Files:**
- Modify: `apps/mobile/app/(screens)/my-reports.tsx`
- Modify: `apps/mobile/src/i18n/en.json`
- Modify: `apps/mobile/src/i18n/ar.json`

**Step 1: Add useTranslation import and t() call**

**Step 2: Replace static strings**

Look for:
- `"My Reports"`
- `"No reports submitted"`
- `"Pending"`
- `"Resolved"`
- `"Rejected"`

**Step 3: Add keys**

```json
"screens": {
  "my-reports": {
    "title": "My Reports",
    "emptyState": "No reports submitted",
    "status": {
      "pending": "Pending",
      "resolved": "Resolved",
      "rejected": "Rejected"
    }
  }
}
```

**Step 4: Test and commit**

---

### Task 10: Process report.tsx and reports/[id].tsx

**Files:**
- Modify: `apps/mobile/app/(screens)/report.tsx`
- Modify: `apps/mobile/app/(screens)/reports/[id].tsx`
- Modify: `apps/mobile/src/i18n/en.json`
- Modify: `apps/mobile/src/i18n/ar.json`

**Step 1: Add useTranslation import and t() call to both files**

**Step 2: Replace static strings in report.tsx**

Look for:
- `"Report"`
- `"Select a reason"`
- `"Spam"`
- `"Harassment"`
- `"Hate speech"`
- `"Violence"`
- `"Submit Report"`

**Step 3: Replace static strings in reports/[id].tsx**

Look for:
- `"Report Details"`
- `"Reported by"`
- `"Status"`
- `"Resolution"`
- `"Comments"`

**Step 4: Add keys**

```json
"screens": {
  "report": {
    "title": "Report",
    "selectReason": "Select a reason",
    "reasons": {
      "spam": "Spam",
      "harassment": "Harassment",
      "hateSpeech": "Hate speech",
      "violence": "Violence"
    },
    "submit": "Submit Report"
  },
  "report-details": {
    "title": "Report Details",
    "reportedBy": "Reported by",
    "status": "Status",
    "resolution": "Resolution",
    "comments": "Comments"
  }
}
```

**Step 5: Test and commit**

---

## Group 5: Playlist & Media Screens

### Task 11: Process playlist/[id].tsx and playlists/[channelId].tsx

**Files:**
- Modify: `apps/mobile/app/(screens)/playlist/[id].tsx`
- Modify: `apps/mobile/app/(screens)/playlists/[channelId].tsx`
- Modify: `apps/mobile/src/i18n/en.json`
- Modify: `apps/mobile/src/i18n/ar.json`

**Step 1: Add useTranslation import and t() call to both files**

**Step 2: Replace static strings in playlist/[id].tsx**

Look for:
- `"Playlist"`
- `"tracks"`
- `"No tracks in this playlist"`
- `"Play All"`
- `"Shuffle"`

**Step 3: Replace static strings in playlists/[channelId].tsx**

Look for:
- `"Playlists"`
- `"No playlists found"`
- `"Created playlists"`
- `"Saved playlists"`

**Step 4: Handle pluralization for tracks**

Replace `{trackCount} tracks` with `{t('screens.playlist.tracks', { count: trackCount })}`

**Step 5: Add keys**

```json
"screens": {
  "playlist": {
    "title": "Playlist",
    "tracks_one": "{{count}} track",
    "tracks_other": "{{count}} tracks",
    "emptyState": "No tracks in this playlist",
    "playAll": "Play All",
    "shuffle": "Shuffle"
  },
  "playlists": {
    "title": "Playlists",
    "emptyState": "No playlists found",
    "created": "Created playlists",
    "saved": "Saved playlists"
  }
}
```

**Step 6: Test and commit**

---

### Task 12: Process save-to-playlist.tsx

**Files:**
- Modify: `apps/mobile/app/(screens)/save-to-playlist.tsx`
- Modify: `apps/mobile/src/i18n/en.json`
- Modify: `apps/mobile/src/i18n/ar.json`

**Step 1: Add useTranslation import and t() call**

**Step 2: Replace static strings**

Look for:
- `"Save to Playlist"`
- `"Create New Playlist"`
- `"Playlist name"`
- `"Create"`
- `"Select a playlist"`

**Step 3: Add keys**

```json
"screens": {
  "save-to-playlist": {
    "title": "Save to Playlist",
    "createNew": "Create New Playlist",
    "playlistName": "Playlist name",
    "create": "Create",
    "select": "Select a playlist"
  }
}
```

**Step 4: Test and commit**

---

## Group 6: QR & Sharing Screens

### Task 13: Process qr-code.tsx and qr-scanner.tsx

**Files:**
- Modify: `apps/mobile/app/(screens)/qr-code.tsx`
- Modify: `apps/mobile/app/(screens)/qr-scanner.tsx`
- Modify: `apps/mobile/src/i18n/en.json`
- Modify: `apps/mobile/src/i18n/ar.json`

**Step 1: Add useTranslation import and t() call to both files**

**Step 2: Replace static strings in qr-code.tsx**

Look for:
- `"QR Code"`
- `"Scan to follow"`
- `"Download"`
- `"Share"`

**Step 3: Replace static strings in qr-scanner.tsx**

Look for:
- `"Scan QR Code"`
- `"Position QR code within frame"`
- `"Scanning..."`
- `"Invalid QR code"`

**Step 4: Add keys**

```json
"screens": {
  "qr-code": {
    "title": "QR Code",
    "scanToFollow": "Scan to follow",
    "download": "Download",
    "share": "Share"
  },
  "qr-scanner": {
    "title": "Scan QR Code",
    "instructions": "Position QR code within frame",
    "scanning": "Scanning...",
    "invalid": "Invalid QR code"
  }
}
```

**Step 5: Test and commit**

---

### Task 14: Process share-profile.tsx

**Files:**
- Modify: `apps/mobile/app/(screens)/share-profile.tsx`
- Modify: `apps/mobile/src/i18n/en.json`
- Modify: `apps/mobile/src/i18n/ar.json`

**Step 1: Add useTranslation import and t() call**

**Step 2: Replace static strings**

Look for:
- `"Share Profile"`
- `"Share via"`
- `"Copy Link"`
- `"Share to"`
- `"Close Friends"`

**Step 3: Add keys**

```json
"screens": {
  "share-profile": {
    "title": "Share Profile",
    "shareVia": "Share via",
    "copyLink": "Copy Link",
    "shareTo": "Share to",
    "closeFriends": "Close Friends"
  }
}
```

**Step 4: Test and commit**

---

## Group 7: Schedule Screens

### Task 15: Process schedule-live.tsx and schedule-post.tsx

**Files:**
- Modify: `apps/mobile/app/(screens)/schedule-live.tsx`
- Modify: `apps/mobile/app/(screens)/schedule-post.tsx`
- Modify: `apps/mobile/src/i18n/en.json`
- Modify: `apps/mobile/src/i18n/ar.json`

**Step 1: Add useTranslation import and t() call to both files**

**Step 2: Replace static strings in schedule-live.tsx**

Look for:
- `"Schedule Live"`
- `"Date & Time"`
- `"Title"`
- `"Description"`
- `"Schedule"`

**Step 3: Replace static strings in schedule-post.tsx**

Look for:
- `"Schedule Post"`
- `"Schedule for"`
- `"Time"`
- `"Schedule"`

**Step 4: Add keys**

```json
"screens": {
  "schedule-live": {
    "title": "Schedule Live",
    "dateTime": "Date & Time",
    "titleField": "Title",
    "description": "Description",
    "schedule": "Schedule"
  },
  "schedule-post": {
    "title": "Schedule Post",
    "scheduleFor": "Schedule for",
    "time": "Time",
    "schedule": "Schedule"
  }
}
```

**Step 5: Test and commit**

---

## Group 8: Search & Discovery Screens

### Task 16: Process search-results.tsx

**Files:**
- Modify: `apps/mobile/app/(screens)/search-results.tsx`
- Modify: `apps/mobile/src/i18n/en.json`
- Modify: `apps/mobile/src/i18n/ar.json`

**Step 1: Add useTranslation import and t() call**

**Step 2: Replace static strings**

Look for:
- `"Search Results"`
- `"All"`
- `"People"`
- `"Posts"`
- `"Hashtags"`
- `"No results found"`

**Step 3: Add keys**

```json
"screens": {
  "search-results": {
    "title": "Search Results",
    "filters": {
      "all": "All",
      "people": "People",
      "posts": "Posts",
      "hashtags": "Hashtags"
    },
    "emptyState": "No results found"
  }
}
```

**Step 4: Test and commit**

---

### Task 17: Process trending-audio.tsx

**Files:**
- Modify: `apps/mobile/app/(screens)/trending-audio.tsx`
- Modify: `apps/mobile/src/i18n/en.json`
- Modify: `apps/mobile/src/i18n/ar.json`

**Step 1: Add useTranslation import and t() call**

**Step 2: Replace static strings**

Look for:
- `"Trending Audio"`
- `"Top sounds this week"`
- `"Use this sound"`

**Step 3: Add keys**

```json
"screens": {
  "trending-audio": {
    "title": "Trending Audio",
    "subtitle": "Top sounds this week",
    "useSound": "Use this sound"
  }
}
```

**Step 4: Test and commit**

---

## Group 9: Saved & History Screens

### Task 18: Process saved.tsx

**Files:**
- Modify: `apps/mobile/app/(screens)/saved.tsx`
- Modify: `apps/mobile/src/i18n/en.json`
- Modify: `apps/mobile/src/i18n/ar.json`

**Step 1: Add useTranslation import and t() call**

**Step 2: Replace static strings**

Look for:
- `"Saved"`
- `"All"`
- `"Posts"`
- `"Videos"`
- `"Links"`
- `"No saved items"`

**Step 3: Add keys**

```json
"screens": {
  "saved": {
    "title": "Saved",
    "filters": {
      "all": "All",
      "posts": "Posts",
      "videos": "Videos",
      "links": "Links"
    },
    "emptyState": "No saved items"
  }
}
```

**Step 4: Test and commit**

---

### Task 19: Process watch-history.tsx

**Files:**
- Modify: `apps/mobile/app/(screens)/watch-history.tsx`
- Modify: `apps/mobile/src/i18n/en.json`
- Modify: `apps/mobile/src/i18n/ar.json`

**Step 1: Add useTranslation import and t() call**

**Step 2: Replace static strings**

Look for:
- `"Watch History"`
- `"Today"`
- `"Yesterday"`
- `"This week"`
- `"Clear All History"`
- `"No watch history"`

**Step 3: Add keys**

```json
"screens": {
  "watch-history": {
    "title": "Watch History",
    "periods": {
      "today": "Today",
      "yesterday": "Yesterday",
      "thisWeek": "This week"
    },
    "clearAll": "Clear All History",
    "emptyState": "No watch history"
  }
}
```

**Step 4: Test and commit**

---

## Group 10: Settings & Miscellaneous

### Task 20: Process theme-settings.tsx

**Files:**
- Modify: `apps/mobile/app/(screens)/theme-settings.tsx`
- Modify: `apps/mobile/src/i18n/en.json`
- Modify: `apps/mobile/src/i18n/ar.json`

**Step 1: Add useTranslation import and t() call**

**Step 2: Replace static strings**

Look for:
- `"Theme"`
- `"Dark"`
- `"Light"`
- `"System"`
- `"App Icon"`
- `"Accent Color"`

**Step 3: Add keys**

```json
"screens": {
  "theme-settings": {
    "title": "Theme",
    "dark": "Dark",
    "light": "Light",
    "system": "System",
    "appIcon": "App Icon",
    "accentColor": "Accent Color"
  }
}
```

**Step 4: Test and commit**

---

### Task 21: Process sticker-browser.tsx

**Files:**
- Modify: `apps/mobile/app/(screens)/sticker-browser.tsx`
- Modify: `apps/mobile/src/i18n/en.json`
- Modify: `apps/mobile/src/i18n/ar.json`

**Step 1: Add useTranslation import and t() call**

**Step 2: Replace static strings**

Look for:
- `"Stickers"`
- `"Recent"`
- `"Favorites"`
- `"Categories"`
- `"Search stickers..."`

**Step 3: Add keys**

```json
"screens": {
  "sticker-browser": {
    "title": "Stickers",
    "recent": "Recent",
    "favorites": "Favorites",
    "categories": "Categories",
    "searchPlaceholder": "Search stickers..."
  }
}
```

**Step 4: Test and commit**

---

### Task 22: Process sound/[id].tsx

**Files:**
- Modify: `apps/mobile/app/(screens)/sound/[id].tsx`
- Modify: `apps/mobile/src/i18n/en.json`
- Modify: `apps/mobile/src/i18n/ar.json`

**Step 1: Add useTranslation import and t() call**

**Step 2: Replace static strings**

Look for:
- `"Sound"`
- `"Used in"`
- `"videos"`
- `"Use this sound"`
- `"Save"`

**Step 3: Handle pluralization for videos**

Replace `{videoCount} videos` with `{t('screens.sound.videos', { count: videoCount })}`

**Step 4: Add keys**

```json
"screens": {
  "sound": {
    "title": "Sound",
    "usedIn": "Used in",
    "videos_one": "{{count}} video",
    "videos_other": "{{count}} videos",
    "useSound": "Use this sound",
    "save": "Save"
  }
}
```

**Step 5: Test and commit**

---

### Task 23: Process starred-messages.tsx and pinned-messages.tsx

**Files:**
- Modify: `apps/mobile/app/(screens)/starred-messages.tsx`
- Modify: `apps/mobile/app/(screens)/pinned-messages.tsx`
- Modify: `apps/mobile/src/i18n/en.json`
- Modify: `apps/mobile/src/i18n/ar.json`

**Step 1: Add useTranslation import and t() call to both files**

**Step 2: Replace static strings in starred-messages.tsx**

Look for:
- `"Starred Messages"`
- `"No starred messages"`

**Step 3: Replace static strings in pinned-messages.tsx**

Look for:
- `"Pinned Messages"`
- `"No pinned messages"`

**Step 4: Add keys**

```json
"screens": {
  "starred-messages": {
    "title": "Starred Messages",
    "emptyState": "No starred messages"
  },
  "pinned-messages": {
    "title": "Pinned Messages",
    "emptyState": "No pinned messages"
  }
}
```

**Step 5: Test and commit**

---

### Task 24: Process mutual-followers.tsx and majlis-lists.tsx

**Files:**
- Modify: `apps/mobile/app/(screens)/mutual-followers.tsx`
- Modify: `apps/mobile/app/(screens)/majlis-lists.tsx`
- Modify: `apps/mobile/src/i18n/en.json`
- Modify: `apps/mobile/src/i18n/ar.json`

**Step 1: Add useTranslation import and t() call to both files**

**Step 2: Replace static strings in mutual-followers.tsx**

Look for:
- `"Mutual Followers"`
- `"No mutual followers"`

**Step 3: Replace static strings in majlis-lists.tsx**

Look for:
- `"Majlis Lists"`
- `"Create List"`
- `"No lists created"`

**Step 4: Add keys**

```json
"screens": {
  "mutual-followers": {
    "title": "Mutual Followers",
    "emptyState": "No mutual followers"
  },
  "majlis-lists": {
    "title": "Majlis Lists",
    "createList": "Create List",
    "emptyState": "No lists created"
  }
}
```

**Step 5: Test and commit**

---

### Task 25: Process minbar.tsx (tab)

**Files:**
- Modify: `apps/mobile/app/(tabs)/minbar.tsx`
- Modify: `apps/mobile/src/i18n/en.json`
- Modify: `apps/mobile/src/i18n/ar.json`

**Step 1: Add useTranslation import and t() call**

**Step 2: Replace static strings**

Look for:
- `"Minbar"`
- `"For You"`
- `"Following"`
- `"Trending"`
- `"Subscriptions"`
- `"Library"`

**Step 3: Add keys**

```json
"tabs": {
  "minbar": {
    "title": "Minbar",
    "forYou": "For You",
    "following": "Following",
    "trending": "Trending",
    "subscriptions": "Subscriptions",
    "library": "Library"
  }
}
```

**Step 4: Test and commit**

---

## Final Task

### Task 26: Verify all changes

**Step 1: Run TypeScript check on all modified files**

```bash
cd apps/mobile
npx tsc --noEmit
```

**Step 2: Check for missing translation keys warnings**

Start app in development mode and check console for warnings.

**Step 3: Final commit**

```bash
git add -A
git commit -m "feat: batch 36 agent 10 — i18n rollout batch 3 complete"
```

**Step 4: Report completion**

All 30+ screen files now have i18n support with proper key naming and pluralization handling.

---

**Plan complete and saved to `docs/plans/2026-03-13-batch-36-agent-10-i18n-implementation.md`. Two execution options:**

**1. Subagent-Driven (this session)** - I dispatch fresh subagent per task, review between tasks, fast iteration

**2. Parallel Session (separate)** - Open new session with executing-plans, batch execution with checkpoints

**Which approach?**