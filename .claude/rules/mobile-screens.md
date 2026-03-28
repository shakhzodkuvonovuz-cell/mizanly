---
description: React Native / Expo mobile patterns
globs: apps/mobile/**
---

# Mobile Screen Rules

## Components — ALWAYS use these, never raw equivalents
- `<BottomSheet>` — NEVER RN `Modal`
- `<Icon name="..." />` — NEVER text emoji for icons
- `<EmptyState>` — NEVER bare "No items" text
- `<BrandedRefreshControl>` — NEVER raw `<RefreshControl>`
- `<ProgressiveImage>` — NEVER raw `<Image>` from expo-image for content
- `<Skeleton>` — for content loading, NOT `<ActivityIndicator>` (buttons OK)
- `showToast()` — for mutation feedback, NEVER bare `Alert.alert` for non-destructive

## Hooks — use the branded versions
- `useContextualHaptic()` — NEVER `useHaptic()`
- `useThemeColors()` → `tc.*` — NEVER `colors.dark.*` in JSX directly
- `formatCount()` — for engagement numbers

## Code quality
- `radius.*` from theme — NEVER hardcode border radius >= 6
- NEVER `Math.random()` for crypto — use CSPRNG
- NEVER `setTimeout` for fake loading
- EVERY new feature needs cleanup on unmount (useEffect return)
- NEVER `any` in non-test code. Test files MAY use `as any` for mocks.
- NEVER `@ts-ignore` or `@ts-expect-error`

## Theme tokens
```
colors.emerald = #0A7B4F    colors.gold = #C8963E
spacing: xs=4 sm=8 md=12 base=16 lg=20 xl=24 2xl=32
fontSize: xs=11 sm=13 base=15 md=17 lg=20 xl=24
radius: sm=6 md=10 lg=16 full=9999
```

## i18n
- 8 languages: en, ar, tr, ur, bn, fr, id, ms
- ALL new screens MUST have i18n keys in ALL 8 files
- NEVER use `sed` for i18n key injection — use Node JSON parse/write
