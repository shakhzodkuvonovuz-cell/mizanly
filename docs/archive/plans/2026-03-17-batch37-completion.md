# Batch 37 Completion — i18n + Error Boundaries

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Complete Batch 37 by adding i18n to all remaining screens and wrapping all screens with ScreenErrorBoundary.

**Architecture:** Two parallel agents — Agent 1 handles i18n rollout (import useTranslation, replace hardcoded strings with t() calls, add keys to en.json/ar.json). Agent 2 wraps every screen's JSX return in `<ScreenErrorBoundary>`.

**Tech Stack:** React Native, react-i18next, ScreenErrorBoundary class component

---

## Agent 1: i18n Rollout on Remaining Screens

### Pattern

Every screen needs:
1. Add import: `import { useTranslation } from '@/hooks/useTranslation';`
2. Add hook call inside component: `const { t, isRTL } = useTranslation();`
3. Replace hardcoded English strings with `t('namespace.key')` calls
4. Add all new keys to `apps/mobile/src/i18n/en.json` and `apps/mobile/src/i18n/ar.json`

### Reference — existing i18n screen example

```tsx
// Import
import { useTranslation } from '@/hooks/useTranslation';

// Inside component
const { t, isRTL } = useTranslation();

// Usage
<Text>{t('muted.title')}</Text>
<EmptyState title={t('muted.empty')} subtitle={t('muted.emptySubtitle')} />
```

### Key naming convention
- Use screen filename as namespace: `muted.title`, `saved.tabs.posts`, `themeSettings.dark`
- Use camelCase for multi-word screens: `themeSettings`, `searchResults`, `mutualFollowers`
- Reuse `common.*` keys for generic labels (Save, Cancel, Delete, etc.)
- Arabic translations should be real Arabic, not transliterations

### Screens to i18n (25 files)

1. `apps/mobile/app/(screens)/hashtag/[tag].tsx` → namespace: `hashtag`
2. `apps/mobile/app/(screens)/live/[id].tsx` → namespace: `live`
3. `apps/mobile/app/(screens)/majlis-lists.tsx` → namespace: `majlisLists`
4. `apps/mobile/app/(screens)/manage-broadcast.tsx` → namespace: `manageBroadcast`
5. `apps/mobile/app/(screens)/muted.tsx` → namespace: `muted`
6. `apps/mobile/app/(screens)/mutual-followers.tsx` → namespace: `mutualFollowers`
7. `apps/mobile/app/(screens)/my-reports.tsx` → namespace: `myReports`
8. `apps/mobile/app/(screens)/pinned-messages.tsx` → namespace: `pinnedMessages`
9. `apps/mobile/app/(screens)/playlists/[channelId].tsx` → namespace: `playlists`
10. `apps/mobile/app/(screens)/qr-code.tsx` → namespace: `qrCode`
11. `apps/mobile/app/(screens)/qr-scanner.tsx` → namespace: `qrScanner`
12. `apps/mobile/app/(screens)/reports/[id].tsx` → namespace: `reports`
13. `apps/mobile/app/(screens)/save-to-playlist.tsx` → namespace: `saveToPlaylist`
14. `apps/mobile/app/(screens)/saved.tsx` → namespace: `saved`
15. `apps/mobile/app/(screens)/schedule-live.tsx` → namespace: `scheduleLive`
16. `apps/mobile/app/(screens)/schedule-post.tsx` → namespace: `schedulePost`
17. `apps/mobile/app/(screens)/search-results.tsx` → namespace: `searchResults`
18. `apps/mobile/app/(screens)/share-profile.tsx` → namespace: `shareProfile`
19. `apps/mobile/app/(screens)/sound/[id].tsx` → namespace: `sound`
20. `apps/mobile/app/(screens)/starred-messages.tsx` → namespace: `starredMessages`
21. `apps/mobile/app/(screens)/sticker-browser.tsx` → namespace: `stickerBrowser`
22. `apps/mobile/app/(screens)/theme-settings.tsx` → namespace: `themeSettings`
23. `apps/mobile/app/(screens)/trending-audio.tsx` → namespace: `trendingAudio`
24. `apps/mobile/app/(screens)/watch-history.tsx` → namespace: `watchHistory`
25. `apps/mobile/app/(tabs)/create.tsx` → namespace: `create`

### Translation files

- `apps/mobile/src/i18n/en.json` — Add all new keys under their namespace
- `apps/mobile/src/i18n/ar.json` — Add Arabic translations for all new keys

### Commit
```bash
git add apps/mobile/app apps/mobile/src/i18n/en.json apps/mobile/src/i18n/ar.json
git commit -m "feat: complete i18n rollout — add translations to remaining 25 screens"
```

---

## Agent 2: ScreenErrorBoundary Wrapping

### Pattern

Every screen's default export component needs its JSX return wrapped in `<ScreenErrorBoundary>`:

```tsx
// Add import
import { ScreenErrorBoundary } from '@/components/ui/ScreenErrorBoundary';

// Wrap the return
return (
  <ScreenErrorBoundary>
    {/* existing JSX */}
  </ScreenErrorBoundary>
);
```

### Already wrapped (8 files — DO NOT TOUCH)
- `apps/mobile/app/(tabs)/saf.tsx`
- `apps/mobile/app/(tabs)/majlis.tsx`
- `apps/mobile/app/(tabs)/risalah.tsx`
- `apps/mobile/app/(tabs)/bakra.tsx`
- `apps/mobile/app/(tabs)/minbar.tsx`
- `apps/mobile/app/(screens)/thread/[id].tsx`
- `apps/mobile/app/(screens)/post/[id].tsx`
- `apps/mobile/app/(screens)/profile/[username].tsx`

### DO NOT WRAP (layout files, not screens)
- `apps/mobile/app/(screens)/_layout.tsx`
- `apps/mobile/app/(tabs)/_layout.tsx`

### Screens to wrap (all remaining ~90 screen files)

Every `.tsx` file in `apps/mobile/app/(screens)/` and `apps/mobile/app/(tabs)/` that is NOT in the "already wrapped" or "do not wrap" lists above.

For each file:
1. Add `import { ScreenErrorBoundary } from '@/components/ui/ScreenErrorBoundary';` at the top (with other imports)
2. Find the main `return (` in the default export function
3. Wrap the outermost JSX element with `<ScreenErrorBoundary>...</ScreenErrorBoundary>`
4. Do NOT change any other code

### Special cases
- If a screen returns early (loading states, conditionals), only wrap the main return — NOT early returns
- If a screen already has `<SafeAreaView>` as outermost, wrap OUTSIDE it: `<ScreenErrorBoundary><SafeAreaView>...</SafeAreaView></ScreenErrorBoundary>`

### Commit
```bash
git add apps/mobile/app
git commit -m "feat: wrap all screens with ScreenErrorBoundary for crash resilience"
```

---

## Post-Completion

After both agents complete:
1. Verify no TypeScript errors: `cd apps/mobile && npx tsc --noEmit`
2. Update `docs/PROJECT_HISTORY.md` with Batch 37 completion
3. Update memory with new stats
