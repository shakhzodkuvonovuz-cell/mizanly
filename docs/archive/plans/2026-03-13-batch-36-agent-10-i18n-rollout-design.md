# Design: Batch 36 Agent 10 — i18n Rollout Batch 3

**Date:** 2026-03-13
**Agent:** 10 of 10
**Task:** Add i18n `t()` calls to remaining screens (Batch 3)
**Files:** ~30 screen files listed in ARCHITECT_INSTRUCTIONS.md lines 335-365

## Overview
Add internationalization support to the final batch of screen files by:
1. Importing `useTranslation` hook
2. Calling `const { t } = useTranslation()`
3. Replacing hardcoded English strings with `t()` calls
4. Handling pluralization and date formatting via i18next interpolation
5. Adding missing translation keys to `en.json` and `ar.json`

## Files to Modify
1. `apps/mobile/app/(screens)/followers/[userId].tsx`
2. `apps/mobile/app/(screens)/following/[userId].tsx`
3. `apps/mobile/app/(screens)/hashtag-explore.tsx`
4. `apps/mobile/app/(screens)/hashtag/[tag].tsx`
5. `apps/mobile/app/(screens)/live/[id].tsx`
6. `apps/mobile/app/(screens)/majlis-lists.tsx`
7. `apps/mobile/app/(screens)/manage-broadcast.tsx`
8. `apps/mobile/app/(screens)/muted.tsx`
9. `apps/mobile/app/(screens)/mutual-followers.tsx`
10. `apps/mobile/app/(screens)/my-reports.tsx`
11. `apps/mobile/app/(screens)/pinned-messages.tsx`
12. `apps/mobile/app/(screens)/playlist/[id].tsx`
13. `apps/mobile/app/(screens)/playlists/[channelId].tsx`
14. `apps/mobile/app/(screens)/qr-code.tsx`
15. `apps/mobile/app/(screens)/qr-scanner.tsx`
16. `apps/mobile/app/(screens)/report.tsx`
17. `apps/mobile/app/(screens)/reports/[id].tsx`
18. `apps/mobile/app/(screens)/save-to-playlist.tsx`
19. `apps/mobile/app/(screens)/saved.tsx`
20. `apps/mobile/app/(screens)/schedule-live.tsx`
21. `apps/mobile/app/(screens)/schedule-post.tsx`
22. `apps/mobile/app/(screens)/search-results.tsx`
23. `apps/mobile/app/(screens)/share-profile.tsx`
24. `apps/mobile/app/(screens)/sound/[id].tsx`
25. `apps/mobile/app/(screens)/starred-messages.tsx`
26. `apps/mobile/app/(screens)/sticker-browser.tsx`
27. `apps/mobile/app/(screens)/theme-settings.tsx`
28. `apps/mobile/app/(screens)/trending-audio.tsx`
29. `apps/mobile/app/(screens)/watch-history.tsx`
30. `apps/mobile/app/(tabs)/minbar.tsx`

**Note:** Skip any file that already has `useTranslation` import.

## Implementation Pattern

### 1. Import Hook
```tsx
import { useTranslation } from '@/hooks/useTranslation';
```

### 2. Use Hook in Component
```tsx
const { t } = useTranslation();
```

### 3. Replace Static Strings
```tsx
// Before
<Text>Followers</Text>
<Button title="Save" />

// After
<Text>{t('screens.followers.title')}</Text>
<Button title={t('common.save')} />
```

### 4. Handle Dynamic Strings with Interpolation
```tsx
// Before
<Text>{count} followers</Text>
<Text>Posted {daysAgo} days ago</Text>

// After
<Text>{t('screens.followers.count', { count })}</Text>
<Text>{t('screens.posts.daysAgo', { days: daysAgo })}</Text>
```

### 5. Pluralization
Use i18next's pluralization system:
```tsx
// In component
<Text>{t('screens.followers.count', { count })}</Text>

// In en.json
{
  "screens": {
    "followers": {
      "count_one": "{{count}} follower",
      "count_other": "{{count}} followers"
    }
  }
}
```

### 6. Date Formatting
If i18next-date is configured, use:
```tsx
<Text>{t('screens.posts.postedAt', { date: postedDate })}</Text>
// In translation: "Posted on {{date, format}}"
```

Otherwise, format dates before passing to `t()`.

## Key Naming Convention

### Priority Order
1. **Existing common keys**: `common.*` (save, cancel, delete, etc.)
2. **Existing domain keys**: `auth.*`, `profile.*`, `notifications.*`, etc.
3. **Screen-specific keys**: `screens.<screen-name>.<element>`
   - Use kebab-case for screen names: `hashtag-explore`, `majlis-lists`
   - Use camelCase for element names: `title`, `subtitle`, `emptyStateTitle`

### Examples
- `screens.followers.title`: "Followers"
- `screens.hashtag-explore.searchPlaceholder`: "Search hashtags..."
- `screens.playlist.id.emptyState`: "No tracks in this playlist"

## Translation File Updates

### Process for Each New Key
1. Add to `en.json` with English value
2. Copy same key to `ar.json` with English value as placeholder
3. Group under appropriate existing domain or create new screen section

### Example Addition
```json
// en.json
{
  "screens": {
    "followers": {
      "title": "Followers",
      "count_one": "{{count}} follower",
      "count_other": "{{count}} followers",
      "emptyState": "No followers yet"
    }
  }
}

// ar.json (placeholder)
{
  "screens": {
    "followers": {
      "title": "Followers",
      "count_one": "{{count}} follower",
      "count_other": "{{count}} followers",
      "emptyState": "No followers yet"
    }
  }
}
```

## Quality Assurance

### Rules to Follow
1. **No `any` types**: Ensure proper typing for all new code
2. **Skip i18n-ready files**: Check for existing `useTranslation` import
3. **Maintain code style**: Follow existing formatting and patterns
4. **All Text components**: Internationalize all user-facing text
5. **Dynamic content**: Leave user-generated content (names, usernames) as-is
6. **Accessibility**: Preserve `accessibilityLabel` and `accessibilityRole` where present

### Validation Steps
1. Check each file compiles without TypeScript errors
2. Verify no console warnings about missing translation keys
3. Ensure Arabic RTL layout not broken (check `isRTL` usage if present)

## Estimated Output
- **Files modified**: 30+ (excluding already i18n-enabled)
- **Lines changed**: 200-400
- **New translation keys**: 50-100 per language file
- **Time estimate**: 2-3 hours of focused work

## Post-Completion
After implementation:
1. Run `git add -A && git commit -m "feat: batch 36 agent 10 — i18n rollout batch 3"`
2. Verify no merge conflicts with other agents
3. Report completion to batch coordinator

---

*Design approved by user on 2026-03-13*