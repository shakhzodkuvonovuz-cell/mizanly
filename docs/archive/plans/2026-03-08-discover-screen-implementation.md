# Discover Screen Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Create a dedicated discovery/explore screen showing trending content across all 5 Mizanly spaces as specified in Batch 17 Step 9.

**Architecture:** Single screen with ScrollView containing multiple sections (Trending Hashtags, Hot Posts, Trending Reels, Suggested People, Rising Channels). Each section uses its own useQuery hook to fetch data from respective APIs. Follows existing patterns from analytics.tsx and content-settings.tsx.

**Tech Stack:** React Native (Expo SDK 52), TypeScript, Expo Router, @tanstack/react-query, Zustand store, custom UI components (Icon, Skeleton, EmptyState, etc.)

---

### Task 1: Create Discover screen file with basic structure

**Files:**
- Create: `apps/mobile/app/(screens)/discover.tsx`

**Step 1: Create file with imports and basic component**

```tsx
import { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, RefreshControl, FlatList,
  TouchableOpacity, Pressable, Dimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Icon } from '@/components/ui/Icon';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { colors, spacing, fontSize, radius } from '@/theme';
import { searchApi } from '@/services/api';
// Local types for APIs that Agent 12 will add
interface SuggestedUser {
  id: string;
  username: string;
  displayName?: string;
  avatarUrl?: string;
  isVerified: boolean;
  bio?: string;
  mutualFollowers?: number;
}

interface Channel {
  id: string;
  handle: string;
  name: string;
  description?: string;
  avatarUrl?: string;
  isVerified: boolean;
  subscribersCount: number;
}

const { width: screenWidth } = Dimensions.get('window');

export default function DiscoverScreen() {
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    // Will refetch all queries
    setRefreshing(false);
  }, []);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <Icon name="arrow-left" size="md" color={colors.text.primary} />
        </Pressable>
        <Text style={styles.headerTitle}>Discover</Text>
        <View style={{ width: 36 }} />
      </View>
      <Text>Discover screen coming soon</Text>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.dark.bg },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.base, paddingVertical: spacing.sm,
    borderBottomWidth: 0.5, borderBottomColor: colors.dark.border,
  },
  headerTitle: { color: colors.text.primary, fontSize: fontSize.base, fontWeight: '700' },
});
```

**Step 2: Verify file compiles**

Run: `cd apps/mobile && npx expo start --clear`
Expected: No TypeScript errors in terminal

**Step 3: Commit**

```bash
git add apps/mobile/app/(screens)/discover.tsx
git commit -m "feat: create discover screen skeleton"
```

---

### Task 2: Implement header and ScrollView with RefreshControl

**Files:**
- Modify: `apps/mobile/app/(screens)/discover.tsx`

**Step 1: Replace placeholder with ScrollView and sections outline**

Replace the `<Text>Discover screen coming soon</Text>` with:

```tsx
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.emerald}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        {/* Trending Hashtags section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Icon name="trending-up" size="sm" color={colors.text.secondary} />
            <Text style={styles.sectionTitle}>Trending Hashtags</Text>
          </View>
          <Text style={styles.placeholder}>Hashtags will appear here</Text>
        </View>

        {/* Hot Posts section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Icon name="bar-chart-2" size="sm" color={colors.text.secondary} />
            <Text style={styles.sectionTitle}>Hot Posts</Text>
          </View>
          <Text style={styles.placeholder}>Hot posts will appear here</Text>
        </View>

        {/* Trending Reels section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Icon name="video" size="sm" color={colors.text.secondary} />
            <Text style={styles.sectionTitle}>Trending Reels</Text>
          </View>
          <Text style={styles.placeholder}>Trending reels will appear here</Text>
        </View>

        {/* Suggested People section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Icon name="users" size="sm" color={colors.text.secondary} />
            <Text style={styles.sectionTitle}>Suggested People</Text>
          </View>
          <Text style={styles.placeholder}>Suggested people will appear here</Text>
        </View>

        {/* Rising Channels section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Icon name="layers" size="sm" color={colors.text.secondary} />
            <Text style={styles.sectionTitle}>Rising Channels</Text>
          </View>
          <Text style={styles.placeholder}>Rising channels will appear here</Text>
        </View>
      </ScrollView>
```

Add to styles:
```tsx
  scroll: { flex: 1 },
  scrollContent: { paddingBottom: 60 },
  section: { marginBottom: spacing.xl },
  sectionHeader: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    marginBottom: spacing.md, paddingHorizontal: spacing.base,
  },
  sectionTitle: {
    fontSize: fontSize.base, color: colors.text.primary,
    fontFamily: 'DMSans-SemiBold',
  },
  placeholder: {
    color: colors.text.tertiary, fontSize: fontSize.sm,
    paddingHorizontal: spacing.base, fontStyle: 'italic',
  },
```

**Step 2: Verify screen renders with sections**

Run: `cd apps/mobile && npx expo start`
Expected: Screen shows 5 sections with placeholders

**Step 3: Commit**

```bash
git add apps/mobile/app/(screens)/discover.tsx
git commit -m "feat: add scrollview and section structure to discover screen"
```

---

### Task 3: Implement Trending Hashtags section

**Files:**
- Modify: `apps/mobile/app/(screens)/discover.tsx`

**Step 1: Add useQuery for trending hashtags**

Add after state declarations:
```tsx
  // Trending hashtags
  const trendingQuery = useQuery({
    queryKey: ['trending-hashtags'],
    queryFn: () => searchApi.trending(),
  });
```

**Step 2: Create HashtagChip component**

Add before main component:
```tsx
function HashtagChip({ name }: { name: string }) {
  const router = useRouter();
  return (
    <TouchableOpacity
      style={styles.chip}
      onPress={() => router.push(`/(screens)/hashtag/${encodeURIComponent(name)}`)}
    >
      <Text style={styles.chipText}>#{name}</Text>
    </TouchableOpacity>
  );
}
```

**Step 3: Replace hashtags placeholder with actual content**

Replace the hashtags placeholder section with:
```tsx
        {/* Trending Hashtags section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Icon name="trending-up" size="sm" color={colors.text.secondary} />
            <Text style={styles.sectionTitle}>Trending Hashtags</Text>
          </View>
          {trendingQuery.isLoading ? (
            <FlatList
              horizontal
              data={Array.from({ length: 5 })}
              renderItem={() => (
                <Skeleton.Rect width={80} height={32} borderRadius={radius.full} />
              )}
              contentContainerStyle={{ paddingHorizontal: spacing.base, gap: spacing.sm }}
              showsHorizontalScrollIndicator={false}
            />
          ) : trendingQuery.data && trendingQuery.data.length > 0 ? (
            <FlatList
              horizontal
              data={trendingQuery.data}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => <HashtagChip name={item.name} />}
              contentContainerStyle={{ paddingHorizontal: spacing.base, gap: spacing.sm }}
              showsHorizontalScrollIndicator={false}
            />
          ) : (
            <EmptyState
              icon="hash"
              title="No trending hashtags"
              subtitle="Popular hashtags will appear here"
              compact
            />
          )}
        </View>
```

Add to styles:
```tsx
  chip: {
    backgroundColor: colors.dark.bgElevated,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
    borderWidth: 0.5,
    borderColor: colors.dark.border,
  },
  chipText: {
    color: colors.text.primary,
    fontSize: fontSize.sm,
    fontFamily: 'DMSans-Medium',
  },
```

**Step 4: Test hashtags section**

Run: `cd apps/mobile && npx expo start`
Expected: Hashtags show or loading skeletons

**Step 5: Commit**

```bash
git add apps/mobile/app/(screens)/discover.tsx
git commit -m "feat: add trending hashtags section to discover screen"
```

---

### Task 4: Implement Hot Posts section

**Files:**
- Modify: `apps/mobile/app/(screens)/discover.tsx`

**Step 1: Add useQuery for suggested posts**

Add after trendingQuery:
```tsx
  // Suggested posts (Agent 12 will add recommendationsApi.posts)
  const postsQuery = useQuery({
    queryKey: ['recommended-posts'],
    queryFn: () => ({ data: [] } as any), // Placeholder
  });
```

**Step 2: Create PostCardMini component**

Add before main component:
```tsx
function PostCardMini({ post }: { post: any }) {
  const router = useRouter();
  const hasMedia = post.mediaUrls && post.mediaUrls.length > 0;
  return (
    <TouchableOpacity
      style={styles.postCard}
      onPress={() => router.push(`/(screens)/post/${post.id}`)}
    >
      {hasMedia ? (
        <View style={styles.postMedia}>
          <Icon name="image" size={40} color={colors.text.tertiary} />
        </View>
      ) : (
        <View style={styles.postTextPreview}>
          <Text style={styles.postText} numberOfLines={3}>
            {post.content || 'Post'}
          </Text>
        </View>
      )}
      <View style={styles.postStats}>
        <View style={styles.postStat}>
          <Icon name="heart" size={12} color={colors.text.tertiary} />
          <Text style={styles.postStatText}>{post.likesCount || 0}</Text>
        </View>
        <View style={styles.postStat}>
          <Icon name="message-circle" size={12} color={colors.text.tertiary} />
          <Text style={styles.postStatText}>{post.commentsCount || 0}</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}
```

**Step 3: Replace hot posts placeholder with actual content**

Replace hot posts section with:
```tsx
        {/* Hot Posts section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Icon name="bar-chart-2" size="sm" color={colors.text.secondary} />
            <Text style={styles.sectionTitle}>Hot Posts</Text>
          </View>
          {postsQuery.isLoading ? (
            <FlatList
              horizontal
              data={Array.from({ length: 3 })}
              renderItem={() => (
                <Skeleton.Rect width={120} height={150} borderRadius={radius.md} />
              )}
              contentContainerStyle={{ paddingHorizontal: spacing.base, gap: spacing.md }}
              showsHorizontalScrollIndicator={false}
            />
          ) : postsQuery.data && postsQuery.data.length > 0 ? (
            <FlatList
              horizontal
              data={postsQuery.data}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => <PostCardMini post={item} />}
              contentContainerStyle={{ paddingHorizontal: spacing.base, gap: spacing.md }}
              showsHorizontalScrollIndicator={false}
            />
          ) : (
            <EmptyState
              icon="image"
              title="No posts to show"
              subtitle="Recommended posts will appear here"
              compact
            />
          )}
        </View>
```

Add to styles:
```tsx
  postCard: {
    width: 120,
    backgroundColor: colors.dark.bgElevated,
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  postMedia: {
    width: 120,
    height: 100,
    backgroundColor: colors.dark.bgCard,
    alignItems: 'center',
    justifyContent: 'center',
  },
  postTextPreview: {
    width: 120,
    height: 100,
    backgroundColor: colors.dark.bgCard,
    padding: spacing.sm,
    justifyContent: 'center',
  },
  postText: {
    color: colors.text.secondary,
    fontSize: fontSize.xs,
    fontFamily: 'DMSans-Regular',
  },
  postStats: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: spacing.sm,
    borderTopWidth: 0.5,
    borderTopColor: colors.dark.border,
  },
  postStat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  postStatText: {
    color: colors.text.tertiary,
    fontSize: fontSize.xs,
  },
```

**Step 4: Test hot posts section**

Run: `cd apps/mobile && npx expo start`
Expected: Posts section shows loading skeletons

**Step 5: Commit**

```bash
git add apps/mobile/app/(screens)/discover.tsx
git commit -m "feat: add hot posts section to discover screen"
```

---

### Task 5: Implement Trending Reels section

**Files:**
- Modify: `apps/mobile/app/(screens)/discover.tsx`

**Step 1: Add useQuery for suggested reels**

Add after postsQuery:
```tsx
  // Suggested reels (Agent 12 will add recommendationsApi.reels)
  const reelsQuery = useQuery({
    queryKey: ['recommended-reels'],
    queryFn: () => ({ data: [] } as any), // Placeholder
  });
```

**Step 2: Create ReelGridItem component**

Add before main component:
```tsx
function ReelGridItem({ reel }: { reel: any }) {
  const router = useRouter();
  return (
    <TouchableOpacity
      style={styles.reelItem}
      onPress={() => router.push(`/(screens)/reel/${reel.id}`)}
    >
      <View style={styles.reelThumbnail}>
        <Icon name="play" size={20} color={colors.text.primary} />
      </View>
      <View style={styles.reelStats}>
        <View style={styles.reelStat}>
          <Icon name="heart" size={10} color={colors.text.tertiary} />
          <Text style={styles.reelStatText}>{reel.likesCount || 0}</Text>
        </View>
        <View style={styles.reelStat}>
          <Icon name="message-circle" size={10} color={colors.text.tertiary} />
          <Text style={styles.reelStatText}>{reel.commentsCount || 0}</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}
```

**Step 3: Replace trending reels placeholder with grid**

Replace trending reels section with:
```tsx
        {/* Trending Reels section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Icon name="video" size="sm" color={colors.text.secondary} />
            <Text style={styles.sectionTitle}>Trending Reels</Text>
          </View>
          {reelsQuery.isLoading ? (
            <View style={styles.reelsGrid}>
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton.Rect key={i} width={styles.reelItem.width} height={styles.reelItem.width} borderRadius={radius.md} />
              ))}
            </View>
          ) : reelsQuery.data && reelsQuery.data.length > 0 ? (
            <View style={styles.reelsGrid}>
              {reelsQuery.data.slice(0, 6).map((reel) => (
                <ReelGridItem key={reel.id} reel={reel} />
              ))}
            </View>
          ) : (
            <EmptyState
              icon="video"
              title="No trending reels"
              subtitle="Popular reels will appear here"
              compact
            />
          )}
        </View>
```

Add to styles:
```tsx
  reelsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: spacing.base,
    gap: spacing.sm,
  },
  reelItem: {
    width: (screenWidth - spacing.base * 2 - spacing.sm * 2) / 3,
    aspectRatio: 9/16,
    backgroundColor: colors.dark.bgElevated,
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  reelThumbnail: {
    flex: 1,
    backgroundColor: colors.dark.bgCard,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reelStats: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: spacing.xs,
    backgroundColor: 'rgba(0,0,0,0.7)',
  },
  reelStat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  reelStatText: {
    color: colors.text.tertiary,
    fontSize: fontSize.xs,
  },
```

**Step 4: Test trending reels section**

Run: `cd apps/mobile && npx expo start`
Expected: Reels grid shows loading skeletons

**Step 5: Commit**

```bash
git add apps/mobile/app/(screens)/discover.tsx
git commit -m "feat: add trending reels section to discover screen"
```

---

### Task 6: Implement Suggested People section

**Files:**
- Modify: `apps/mobile/app/(screens)/discover.tsx`

**Step 1: Add useQuery for suggested people**

Add after reelsQuery:
```tsx
  // Suggested people (Agent 12 will add recommendationsApi.people)
  const peopleQuery = useQuery({
    queryKey: ['recommended-people'],
    queryFn: () => ({ data: [] } as any), // Placeholder
  });
```

**Step 2: Create SuggestedUserRow component**

Add before main component:
```tsx
function SuggestedUserRow({ user }: { user: SuggestedUser }) {
  const [isFollowing, setIsFollowing] = useState(false);
  const router = useRouter();

  return (
    <View style={styles.userRow}>
      <TouchableOpacity
        style={styles.userInfo}
        onPress={() => router.push(`/(screens)/profile/${user.username}`)}
      >
        <View style={styles.avatarPlaceholder} />
        <View style={styles.userDetails}>
          <Text style={styles.userName}>{user.displayName || user.username}</Text>
          <Text style={styles.userHandle}>@{user.username}</Text>
          {user.bio ? (
            <Text style={styles.userBio} numberOfLines={1}>{user.bio}</Text>
          ) : null}
          {user.mutualFollowers ? (
            <Text style={styles.mutualText}>{user.mutualFollowers} mutual followers</Text>
          ) : null}
        </View>
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.followBtn, isFollowing && styles.followingBtn]}
        onPress={() => setIsFollowing(!isFollowing)}
      >
        <Text style={[styles.followBtnText, isFollowing && styles.followingBtnText]}>
          {isFollowing ? 'Following' : 'Follow'}
        </Text>
      </TouchableOpacity>
    </View>
  );
}
```

**Step 3: Replace suggested people placeholder with list**

Replace suggested people section with:
```tsx
        {/* Suggested People section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Icon name="users" size="sm" color={colors.text.secondary} />
            <Text style={styles.sectionTitle}>Suggested People</Text>
          </View>
          {peopleQuery.isLoading ? (
            <View style={{ paddingHorizontal: spacing.base, gap: spacing.md }}>
              {Array.from({ length: 3 }).map((_, i) => (
                <View key={i} style={styles.userRow}>
                  <View style={styles.userInfo}>
                    <Skeleton.Circle size={44} />
                    <View style={{ flex: 1, gap: spacing.xs }}>
                      <Skeleton.Rect width="40%" height={14} />
                      <Skeleton.Rect width="30%" height={12} />
                    </View>
                  </View>
                  <Skeleton.Rect width={80} height={32} borderRadius={radius.md} />
                </View>
              ))}
            </View>
          ) : peopleQuery.data && peopleQuery.data.length > 0 ? (
            <View style={{ paddingHorizontal: spacing.base, gap: spacing.md }}>
              {peopleQuery.data.slice(0, 5).map((user) => (
                <SuggestedUserRow key={user.id} user={user} />
              ))}
            </View>
          ) : (
            <EmptyState
              icon="users"
              title="No suggestions"
              subtitle="People you may know will appear here"
              compact
            />
          )}
        </View>
```

Add to styles:
```tsx
  userRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.dark.bgElevated,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  userInfo: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  avatarPlaceholder: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.dark.bgCard,
  },
  userDetails: {
    flex: 1,
    gap: 2,
  },
  userName: {
    color: colors.text.primary,
    fontSize: fontSize.base,
    fontFamily: 'DMSans-SemiBold',
  },
  userHandle: {
    color: colors.text.secondary,
    fontSize: fontSize.sm,
    fontFamily: 'DMSans-Regular',
  },
  userBio: {
    color: colors.text.tertiary,
    fontSize: fontSize.xs,
    fontFamily: 'DMSans-Regular',
    marginTop: 2,
  },
  mutualText: {
    color: colors.text.secondary,
    fontSize: fontSize.xs,
    fontFamily: 'DMSans-Medium',
    marginTop: 2,
  },
  followBtn: {
    backgroundColor: colors.emerald,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    minWidth: 80,
    alignItems: 'center',
  },
  followingBtn: {
    backgroundColor: colors.dark.bgCard,
    borderWidth: 0.5,
    borderColor: colors.dark.border,
  },
  followBtnText: {
    color: '#FFF',
    fontSize: fontSize.sm,
    fontFamily: 'DMSans-SemiBold',
  },
  followingBtnText: {
    color: colors.text.secondary,
  },
```

**Step 4: Test suggested people section**

Run: `cd apps/mobile && npx expo start`
Expected: People section shows loading skeletons

**Step 5: Commit**

```bash
git add apps/mobile/app/(screens)/discover.tsx
git commit -m "feat: add suggested people section to discover screen"
```

---

### Task 7: Implement Rising Channels section

**Files:**
- Modify: `apps/mobile/app/(screens)/discover.tsx`

**Step 1: Add useQuery for suggested channels**

Add after peopleQuery:
```tsx
  // Suggested channels (Agent 12 will add recommendationsApi.channels)
  const channelsQuery = useQuery({
    queryKey: ['recommended-channels'],
    queryFn: () => ({ data: [] } as any), // Placeholder
  });
```

**Step 2: Create ChannelCard component**

Add before main component:
```tsx
function ChannelCard({ channel }: { channel: Channel }) {
  const router = useRouter();
  return (
    <TouchableOpacity
      style={styles.channelCard}
      onPress={() => router.push(`/(screens)/channel/${channel.handle}`)}
    >
      <View style={styles.channelAvatar} />
      <Text style={styles.channelName} numberOfLines={1}>{channel.name}</Text>
      <Text style={styles.channelHandle}>@{channel.handle}</Text>
      <View style={styles.channelStats}>
        <Icon name="users" size={10} color={colors.text.tertiary} />
        <Text style={styles.channelStatText}>
          {channel.subscribersCount >= 1000
            ? `${(channel.subscribersCount / 1000).toFixed(1)}K`
            : channel.subscribersCount}
        </Text>
      </View>
    </TouchableOpacity>
  );
}
```

**Step 3: Replace rising channels placeholder with horizontal list**

Replace rising channels section with:
```tsx
        {/* Rising Channels section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Icon name="layers" size="sm" color={colors.text.secondary} />
            <Text style={styles.sectionTitle}>Rising Channels</Text>
          </View>
          {channelsQuery.isLoading ? (
            <FlatList
              horizontal
              data={Array.from({ length: 3 })}
              renderItem={() => (
                <Skeleton.Rect width={140} height={180} borderRadius={radius.md} />
              )}
              contentContainerStyle={{ paddingHorizontal: spacing.base, gap: spacing.md }}
              showsHorizontalScrollIndicator={false}
            />
          ) : channelsQuery.data && channelsQuery.data.length > 0 ? (
            <FlatList
              horizontal
              data={channelsQuery.data}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => <ChannelCard channel={item} />}
              contentContainerStyle={{ paddingHorizontal: spacing.base, gap: spacing.md }}
              showsHorizontalScrollIndicator={false}
            />
          ) : (
            <EmptyState
              icon="layers"
              title="No channels to show"
              subtitle="Popular channels will appear here"
              compact
            />
          )}
        </View>
```

Add to styles:
```tsx
  channelCard: {
    width: 140,
    backgroundColor: colors.dark.bgElevated,
    borderRadius: radius.md,
    padding: spacing.md,
    alignItems: 'center',
    gap: spacing.sm,
  },
  channelAvatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: colors.dark.bgCard,
  },
  channelName: {
    color: colors.text.primary,
    fontSize: fontSize.base,
    fontFamily: 'DMSans-SemiBold',
    textAlign: 'center',
  },
  channelHandle: {
    color: colors.text.secondary,
    fontSize: fontSize.sm,
    fontFamily: 'DMSans-Regular',
  },
  channelStats: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  channelStatText: {
    color: colors.text.tertiary,
    fontSize: fontSize.xs,
  },
```

**Step 4: Test rising channels section**

Run: `cd apps/mobile && npx expo start`
Expected: Channels section shows loading skeletons

**Step 5: Commit**

```bash
git add apps/mobile/app/(screens)/discover.tsx
git commit -m "feat: add rising channels section to discover screen"
```

---

### Task 8: Implement RefreshControl functionality

**Files:**
- Modify: `apps/mobile/app/(screens)/discover.tsx`

**Step 1: Update onRefresh to refetch all queries**

Replace the `onRefresh` function with:
```tsx
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.allSettled([
      trendingQuery.refetch(),
      postsQuery.refetch(),
      reelsQuery.refetch(),
      peopleQuery.refetch(),
      channelsQuery.refetch(),
    ]);
    setRefreshing(false);
  }, [trendingQuery, postsQuery, reelsQuery, peopleQuery, channelsQuery]);
```

**Step 2: Test refresh functionality**

Run: `cd apps/mobile && npx expo start`
Expected: Pull-to-refresh triggers all queries to refetch

**Step 3: Commit**

```bash
git add apps/mobile/app/(screens)/discover.tsx
git commit -m "feat: implement refresh control for discover screen"
```

---

### Task 9: Add proper error handling

**Files:**
- Modify: `apps/mobile/app/(screens)/discover.tsx`

**Step 1: Add error states to each section**

Update each section to handle errors. Example for hashtags section (apply similar pattern to all sections):
```tsx
          {trendingQuery.isError ? (
            <EmptyState
              icon="flag"
              title="Failed to load"
              subtitle="Pull to refresh"
              compact
            />
          ) : trendingQuery.isLoading ? ( ... ) : ... }
```

**Step 2: Test error handling**

Run: `cd apps/mobile && npx expo start`
Expected: Error states show when APIs fail

**Step 3: Commit**

```bash
git add apps/mobile/app/(screens)/discover.tsx
git commit -m "feat: add error handling to discover screen sections"
```

---

### Task 10: Final polish and testing

**Files:**
- Modify: `apps/mobile/app/(screens)/discover.tsx`

**Step 1: Check all navigation links work**

Test each navigation:
- Hashtag chips → hashtag screen
- Post cards → post screen
- Reel grid items → reel screen
- Channel cards → channel screen
- User rows → profile screen

**Step 2: Verify all CLAUDE.md rules are followed**
- No RN Modal used ✓
- Icon components used ✓
- Theme tokens used ✓
- RefreshControl on ScrollView ✓
- Skeleton loaders ✓
- EmptyState components ✓

**Step 3: Final test**

Run: `cd apps/mobile && npx expo start`
Expected: Complete discover screen with all sections

**Step 4: Commit**

```bash
git add apps/mobile/app/(screens)/discover.tsx
git commit -m "feat: complete discover screen implementation"
```

---

## Plan complete and saved to `docs/plans/2026-03-08-discover-screen-implementation.md`. Two execution options:

**1. Subagent-Driven (this session)** - I dispatch fresh subagent per task, review between tasks, fast iteration

**2. Parallel Session (separate)** - Open new session with executing-plans, batch execution with checkpoints

**Which approach?**