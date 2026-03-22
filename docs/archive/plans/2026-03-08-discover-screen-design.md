# Discover Screen Design

**Date:** 2026-03-08
**Author:** Claude Opus 4.6
**Status:** Approved

## Overview
A dedicated discovery/explore screen showing trending content across all 5 Mizanly spaces. Part of Batch 17 (Platform Intelligence + Creator Tools), Step 9.

## Purpose
- Provide users with a single destination to discover trending content
- Surface trending hashtags, hot posts, trending reels, suggested people, and rising channels
- Help users find new content and creators beyond their immediate network

## Screen Layout
```
┌─────────────────────────────┐
│ ← Discover                  │
├─────────────────────────────┤
│ 🔥 Trending Hashtags        │
│ ┌────┐ ┌────┐ ┌────┐ ←→   │  ← Horizontal scroll chips
│ │#eid│ │#day│ │#dua│       │
│ └────┘ └────┘ └────┘       │
│                             │
│ 📈 Hot Posts                │
│ ┌──┐ ┌──┐ ┌──┐ ←→        │  ← Horizontal card carousel
│ │  │ │  │ │  │             │
│ └──┘ └──┘ └──┘             │
│                             │
│ 🎬 Trending Reels           │
│ ┌──┬──┬──┐                 │  ← 3-column grid (2 rows)
│ │  │ │  │                 │
│ └──┴──┴──┘                 │
│                             │
│ 👥 Suggested People         │
│ ┌────────────────────────┐ │
│ │ @user1  [Follow]       │ │
│ │ @user2  [Follow]       │ │
│ └────────────────────────┘ │
│                             │
│ 📺 Rising Channels          │
│ ┌────┐ ┌────┐ ←→          │
│ │    │ │    │              │
│ └────┘ └────┘              │
└─────────────────────────────┘
```

## Technical Implementation

### File Location
`apps/mobile/app/(screens)/discover.tsx` (NEW)

### Data Fetching
- 5 separate `useQuery` hooks:
  - Trending hashtags: `searchApi.trending()`
  - Suggested people: `recommendationsApi.people()`
  - Suggested posts: `recommendationsApi.posts()`
  - Suggested reels: `recommendationsApi.reels()`
  - Suggested channels: `recommendationsApi.channels()`

### UI Structure
- `ScrollView` with `RefreshControl` (mixed content sections, not FlatList)
- Each section handles its own loading/empty states
- Horizontal `FlatList` for hashtag chips and hot posts
- 3-column grid for trending reels (2 rows max)
- Vertical list for suggested people with follow buttons
- Horizontal cards for rising channels

### Navigation
- Hashtag chips → `/(screens)/hashtag/${tag}`
- Post cards → `/(screens)/post/${id}`
- Reel grid items → `/(screens)/reel/${id}`
- Channel cards → `/(screens)/channel/${handle}`

### Quality Requirements
- All CLAUDE.md rules apply:
  - Theme tokens (`colors`, `spacing`, `fontSize`, `radius`)
  - Icon components (`<Icon name="..." />`)
  - No hardcoded border radius ≥ 6
  - Skeleton loaders during loading
  - EmptyState for empty sections
  - RefreshControl on the ScrollView
  - No RN Modal, use BottomSheet if needed

## Dependencies
1. Agent 12 must add API methods to `api.ts`:
   - `recommendationsApi.people()`, `.posts()`, `.reels()`, `.channels()`
2. Agent 12 must add types to `types/index.ts`:
   - `SuggestedUser`, etc.
3. Recommendations module must be implemented (Agent 2)

## Verification Criteria
- Screen renders with trending content sections
- All navigation links work correctly
- Follows CLAUDE.md quality rules
- Handles loading and empty states gracefully
- RefreshControl works to refresh all sections

## Notes
- Part of Batch 17 parallel execution (Agent 9)
- Must not conflict with other agents' files
- Follows existing code patterns in the codebase