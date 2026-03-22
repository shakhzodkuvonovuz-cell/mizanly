# Search & Discovery Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement Step 3 from ARCHITECT_INSTRUCTIONS.md: content search (posts+threads), search history, explore grid.

**Architecture:** Extend existing search backend with pagination, add AsyncStorage search history, reuse posts feed for explore grid.

**Tech Stack:** NestJS (backend), React Native Expo (frontend), AsyncStorage, TypeScript, Prisma.

---

## Backend Changes

### Task 1: Add Pagination to Search Endpoint

**Files:**
- Modify: `apps/api/src/modules/search/search.service.ts:55-112`
- Modify: `apps/api/src/modules/search/search.controller.ts:12-15`

**Step 1: Update SearchService search method to accept cursor parameter**

Current signature (line 55):
```typescript
async search(
  query: string,
  type?: 'people' | 'threads' | 'posts' | 'tags',
  limit = 20,
)
```

Change to:
```typescript
async search(
  query: string,
  type?: 'people' | 'threads' | 'posts' | 'tags',
  cursor?: string,
  limit = 20,
)
```

**Step 2: Add cursor pagination for posts (lines 90-101)**

Replace existing posts search block with:
```typescript
if (\!type || type === 'posts') {
  const posts = await this.prisma.post.findMany({
    where: {
      content: { contains: query, mode: 'insensitive' },
      visibility: 'PUBLIC',
      isRemoved: false,
    },
    select: POST_SEARCH_SELECT,
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    orderBy: { likesCount: 'desc' },
  });
  const hasMore = posts.length > limit;
  const items = hasMore ? posts.slice(0, limit) : posts;
  results.posts = items;
  results.postsMeta = { cursor: hasMore ? items[items.length - 1]?.id : null, hasMore };
}
```

**Step 3: Add cursor pagination for threads (lines 76-88)**

Similar pattern for threads using THREAD_SEARCH_SELECT.

**Step 4: Update controller to accept cursor parameter**

In `search.controller.ts`, line 13:
```typescript
search(@Query('q') query: string, @Query('type') type?: string, @Query('cursor') cursor?: string) {
  return this.searchService.search(query, type as any, cursor);
}
```

**Step 5: Test backend changes**

Run: `cd apps/api && npm run test:watch -- search`
Expected: Existing tests pass.

**Step 6: Commit backend changes**

```bash
git add apps/api/src/modules/search/
git commit -m "feat: add pagination to search endpoint for posts and threads"
```

## Frontend: Search History Utilities

### Task 2: Create AsyncStorage Search History

**Files:**
- Create: `apps/mobile/src/utils/searchHistory.ts`

**Step 1: Create file with imports and constants**

```typescript
import AsyncStorage from '@react-native-async-storage/async-storage';

const SEARCH_HISTORY_KEY = '@mizanly/search-history';
const MAX_HISTORY_ITEMS = 20;

export async function getSearchHistory(): Promise<string[]> {
  try {
    const json = await AsyncStorage.getItem(SEARCH_HISTORY_KEY);
    if (!json) return [];
    const items: { term: string; timestamp: number }[] = JSON.parse(json);
    return items.map(item => item.term);
  } catch {
    return [];
  }
}
```

**Step 2: Add addSearchTerm function**

```typescript
export async function addSearchTerm(term: string): Promise<void> {
  if (term.trim().length < 2) return;
  try {
    const json = await AsyncStorage.getItem(SEARCH_HISTORY_KEY);
    const items: { term: string; timestamp: number }[] = json ? JSON.parse(json) : [];
    
    // Remove existing (case-insensitive)
    const normalizedTerm = term.toLowerCase();
    const filtered = items.filter(item => 
      item.term.toLowerCase() !== normalizedTerm
    );
    
    // Add to front with timestamp
    filtered.unshift({ term, timestamp: Date.now() });
    
    // Keep only MAX_HISTORY_ITEMS
    const trimmed = filtered.slice(0, MAX_HISTORY_ITEMS);
    
    await AsyncStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(trimmed));
  } catch (error) {
    console.error('Failed to save search term:', error);
  }
}
```

**Step 3: Add removeSearchTerm and clearSearchHistory functions**

```typescript
export async function removeSearchTerm(term: string): Promise<void> {
  try {
    const json = await AsyncStorage.getItem(SEARCH_HISTORY_KEY);
    if (!json) return;
    const items: { term: string; timestamp: number }[] = JSON.parse(json);
    const filtered = items.filter(item => item.term !== term);
    await AsyncStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(filtered));
  } catch (error) {
    console.error('Failed to remove search term:', error);
  }
}

export async function clearSearchHistory(): Promise<void> {
  await AsyncStorage.removeItem(SEARCH_HISTORY_KEY);
}
```

**Step 4: Test utilities manually**

Create simple test by importing in search.tsx and logging.

**Step 5: Commit search history utilities**

```bash
git add apps/mobile/src/utils/searchHistory.ts
git commit -m "feat: add AsyncStorage search history utilities"
```

## Frontend: Explore Grid Component

### Task 3: Create ExploreGridItem Component

**Files:**
- Create: `apps/mobile/src/components/search/ExploreGridItem.tsx`

**Step 1: Create component file with imports**

```typescript
import { Pressable, StyleSheet, View, Text } from 'react-native';
import { Image } from 'expo-image';
import { Icon } from '@/components/ui/Icon';
import { colors, spacing, radius } from '@/theme';
import type { Post } from '@/types';
```

**Step 2: Implement ExploreGridItem component**

```typescript
interface ExploreGridItemProps {
  post: Post;
  onPress: () => void;
}

export function ExploreGridItem({ post, onPress }: ExploreGridItemProps) {
  const hasMedia = post.mediaUrls && post.mediaUrls.length > 0;
  const isVideo = post.postType === 'VIDEO';
  
  return (
    <Pressable
      style={styles.container}
      onPress={onPress}
      accessibilityLabel={`Post by ${post.user?.username}`}
      accessibilityRole="button"
    >
      {hasMedia ? (
        <>
          <Image
            source={{ uri: post.mediaUrls[0] }}
            style={styles.image}
            contentFit="cover"
            placeholder={post.blurhash}
          />
          {isVideo && (
            <View style={styles.videoOverlay}>
              <Icon name="play" size={16} color="#fff" />
            </View>
          )}
          {post.likesCount > 0 && (
            <View style={styles.likesBadge}>
              <Icon name="heart-filled" size={12} color="#fff" />
              <Text style={styles.likesText}>{post.likesCount}</Text>
            </View>
          )}
        </>
      ) : (
        <View style={styles.textContainer}>
          <Text style={styles.textPreview} numberOfLines={3}>
            {post.content}
          </Text>
        </View>
      )}
    </Pressable>
  );
}
```

**Step 3: Add styles**

```typescript
const styles = StyleSheet.create({
  container: {
    aspectRatio: 1,
    backgroundColor: colors.dark.bgElevated,
    borderRadius: radius.sm,
    overflow: 'hidden',
  },
  image: { width: '100%', height: '100%' },
  videoOverlay: {
    position: 'absolute',
    top: spacing.xs,
    right: spacing.xs,
    backgroundColor: 'rgba(0,0,0,0.7)',
    borderRadius: radius.full,
    padding: spacing.xs,
  },
  likesBadge: {
    position: 'absolute',
    bottom: spacing.xs,
    left: spacing.xs,
    backgroundColor: 'rgba(0,0,0,0.7)',
    borderRadius: radius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  likesText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '600',
  },
  textContainer: {
    flex: 1,
    padding: spacing.md,
    justifyContent: 'center',
  },
  textPreview: {
    color: colors.text.primary,
    fontSize: 13,
    lineHeight: 16,
  },
});
```

**Step 4: Commit component**

```bash
git add apps/mobile/src/components/search/ExploreGridItem.tsx
git commit -m "feat: add ExploreGridItem component for explore grid"
```

## Frontend: Main Search Screen Updates

### Task 4: Update Search Screen

**Files:**
- Modify: `apps/mobile/app/(screens)/search.tsx`

**Key Changes:**
1. Add imports for searchHistory utilities, ExploreGridItem, useInfiniteQuery
2. Add state for searchHistory and showHistory
3. Replace single searchQuery with tab-specific infinite queries for posts/threads
4. Add exploreQuery using postsApi.getFeed("foryou")
5. Update render logic:
   - Show search history when input focused & empty
   - Show posts/threads results with pagination instead of EmptyState
   - Replace trending chips with explore grid
6. Add handler functions for history management
7. Update TextInput onFocus/onBlur to show/hide history
8. Add new styles for history section and explore grid

**Step 1: Update imports**
Add: searchHistory utilities, ExploreGridItem, useInfiniteQuery

**Step 2: Add state variables**
```typescript
const [searchHistory, setSearchHistory] = useState<string[]>([]);
const [showHistory, setShowHistory] = useState(false);
```

**Step 3: Implement tab-specific queries**
Replace current searchQuery with postsQuery and threadsQuery using useInfiniteQuery.
Add exploreQuery using postsApi.getFeed("foryou").

**Step 4: Update render logic for posts/threads tabs**
Replace EmptyState with FlatList showing PostCard/ThreadCard.
Add onEndReached for pagination.

**Step 5: Add search history UI**
Conditionally render history section below search input.

**Step 6: Add explore grid section**
Replace trending chips with 3-column grid of ExploreGridItem components.

**Step 7: Add handler functions**
handleHistorySelect, handleRemoveHistory, handleClearHistory.

**Step 8: Update TextInput handlers**
Add onFocus/onBlur to control showHistory.
Add onSubmitEditing to save search term.

**Step 9: Add styles**
Add historySection, historyHeader, historyItem, exploreSection, etc.

**Step 10: Commit changes**
```bash
git add apps/mobile/app/(screens)/search.tsx
git commit -m "feat: update search screen with posts/threads tabs, history, explore grid"
```

## Testing & Polish

### Task 5: Verify All Features Work

**Step 1: Test search history persistence**
- Add search terms, close app, reopen - history should persist
- Clear history - should empty AsyncStorage

**Step 2: Test explore grid navigation**
- Tap grid items - navigate to post detail
- Video posts show play icon

**Step 3: Test RTL support**
- Switch to Arabic - layout should mirror correctly

**Step 4: Test accessibility**
- All Pressables have accessibilityLabel
- Screen reader can navigate all sections

**Step 5: Final commit**
```bash
git add -A
git commit -m "feat: complete Step 3 Search & Discovery implementation"
```

---

## Plan Execution Options

**Plan complete and saved to `docs/plans/2026-03-06-search-discovery-implementation.md`. Two execution options:**

**1. Subagent-Driven (this session)** - I dispatch fresh subagent per task, review between tasks, fast iteration

**2. Parallel Session (separate)** - Open new session with executing-plans, batch execution with checkpoints

**Which approach?**
