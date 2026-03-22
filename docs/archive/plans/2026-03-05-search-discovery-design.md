# Step 3 Search & Discovery Design

**Date:** 2026-03-05
**Project:** Mizanly (ميزانلي)
**Status:** Approved for Implementation
**Phase:** Batch 2, Step 3 of ARCHITECT_INSTRUCTIONS.md

## Overview
Implement three missing search & discovery features:
1. **3.1 Content Search** - Posts + Threads search tabs
2. **3.2 Search History** - AsyncStorage-based recent searches
3. **3.3 Explore Grid** - 3-column trending content grid

## Current State
- Search screen has People/Hashtags tabs working
- Posts/Threads tabs show "Full-text search coming soon"
- No search history persistence
- No explore grid, only trending hashtag chips

## Implementation Approach
### 3.1 Content Search
- Backend: Extend search endpoint with type parameter
- Use ILIKE queries for MVP (Meilisearch integration later)
- Frontend: Add PostCard/ThreadCard results with pagination

### 3.2 Search History
- AsyncStorage with 20-item limit
- Show when search input focused & empty
- Add on search submission, remove with × button

### 3.3 Explore Grid
- 3-column grid when search empty & not focused
- Use existing getDiscover() or getFeed("foryou") endpoint
- Square thumbnails with video play indicators

## Technical Decisions
- MVP: ILIKE search (simple, works for small datasets)
- AsyncStorage over Zustand for history persistence
- Cursor-based pagination matching existing patterns
- Reuse existing components (PostCard, ThreadCard, Skeleton)

## Success Criteria
- Posts/Threads tabs show real search results
- Search history persists across app restarts
- Explore grid shows trending content
- All features work in RTL (Arabic) mode
- Follows CLAUDE.md design rules

## Approved By
- User approval on 2026-03-05
