import { useCallback } from 'react';
import {
  View, Text, StyleSheet, Pressable,
  FlatList, Dimensions, RefreshControl,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useInfiniteQuery } from '@tanstack/react-query';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { Icon } from '@/components/ui/Icon';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { colors, spacing, fontSize, radius, animation } from '@/theme';
import Animated, { useSharedValue, useAnimatedStyle, withSequence, withSpring } from 'react-native-reanimated';
import { searchApi } from '@/services/api';
import type { Post } from '@/types';
import { useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useHaptic } from '@/hooks/useHaptic';

type HashtagPostsPage = {
  hashtag?: { postsCount: number };
  data: Post[];
  meta: { cursor: string | null; hasMore: boolean };
};

const SCREEN_W = Dimensions.get('window').width;
const GRID_ITEM = (SCREEN_W - 2) / 3;

function GridItem({ post, onPress }: { post: Post; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.gridItem, pressed && { opacity: 0.85 }]}
    >
      {post.mediaUrls.length > 0 ? (
        <Image
          source={{ uri: post.thumbnailUrl ?? post.mediaUrls[0] }}
          style={styles.gridImage}
          contentFit="cover"
        />
      ) : (
        <View style={styles.gridTextPost}>
          <Text style={styles.gridText} numberOfLines={4}>{post.content}</Text>
        </View>
      )}
      {post.mediaUrls.length > 1 && (
        <View style={styles.carouselBadge}>
          <Icon name="layers" size={12} color="#fff" />
        </View>
      )}
    </Pressable>
  );
}

export default function HashtagScreen() {
  const { tag } = useLocalSearchParams<{ tag: string }>();
  const router = useRouter();

  const postsQuery = useInfiniteQuery({
    queryKey: ['hashtag-posts', tag],
    queryFn: ({ pageParam }) =>
      searchApi.hashtagPosts(tag, pageParam as string | undefined),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last: HashtagPostsPage) => last.meta?.hasMore ? last.meta.cursor ?? undefined : undefined,
  });

  const posts: Post[] = postsQuery.data?.pages.flatMap((p: HashtagPostsPage) => p.data ?? []) ?? [];
  const totalCount = (postsQuery.data?.pages[0] as HashtagPostsPage)?.hashtag?.postsCount ?? posts.length;

  const [followedHashtags, setFollowedHashtags] = useState<string[]>([]);
  const haptic = useHaptic();
  const isFollowing = followedHashtags.includes(tag);

  useEffect(() => {
    AsyncStorage.getItem('followed-hashtags').then((data) => {
      if (data) {
        try {
          setFollowedHashtags(JSON.parse(data));
        } catch {
          setFollowedHashtags([]);
        }
      }
    });
  }, []);

  const toggleFollow = useCallback(() => {
    haptic.medium();
    const newFollowed = isFollowing
      ? followedHashtags.filter(t => t !== tag)
      : [...followedHashtags, tag];
    setFollowedHashtags(newFollowed);
    AsyncStorage.setItem('followed-hashtags', JSON.stringify(newFollowed));
  }, [isFollowing, followedHashtags, tag, haptic]);

  const onEndReached = useCallback(() => {
    if (postsQuery.hasNextPage && !postsQuery.isFetchingNextPage) postsQuery.fetchNextPage();
  }, [postsQuery]);

  const HashtagFollowButton = () => {
    const btnScale = useSharedValue(1);
    const btnStyle = useAnimatedStyle(() => ({ transform: [{ scale: btnScale.value }] }));

    return (
      <Animated.View style={btnStyle}>
        <Pressable
          style={[styles.followBtn, isFollowing && styles.followingBtn]}
          onPress={() => {
            btnScale.value = withSequence(
              withSpring(0.9, animation.spring.bouncy),
              withSpring(1, animation.spring.bouncy),
            );
            toggleFollow();
          }}
          accessibilityLabel={isFollowing ? 'Unfollow hashtag' : 'Follow hashtag'}
          accessibilityRole="button"
        >
          <Text style={[styles.followBtnText, isFollowing && styles.followingBtnText]}>
            {isFollowing ? 'Following' : 'Follow'}
          </Text>
        </Pressable>
      </Animated.View>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={8} style={styles.backBtn}>
          <Icon name="arrow-left" size="md" color={colors.text.primary} />
        </Pressable>
        <View style={styles.headerInfo}>
          <Text style={styles.tagName}>#{tag}</Text>
          <Text style={styles.postCount}>{totalCount.toLocaleString()} posts</Text>
        </View>
        <HashtagFollowButton />
      </View>

      <FlatList
        data={posts}
        keyExtractor={(item) => item.id}
        numColumns={3}
        columnWrapperStyle={styles.gridRow}
        onEndReached={onEndReached}
        onEndReachedThreshold={0.4}
        refreshControl={
          <RefreshControl
            refreshing={postsQuery.isRefetching && !postsQuery.isFetchingNextPage}
            onRefresh={() => postsQuery.refetch()}
            tintColor={colors.emerald}
          />
        }
        renderItem={({ item }) => (
          <GridItem
            post={item}
            onPress={() => router.push(`/(screens)/post/${item.id}`)}
          />
        )}
        ListEmptyComponent={() =>
          postsQuery.isLoading ? (
            <View style={styles.skeletonGrid}>
              {Array.from({ length: 9 }).map((_, i) => (
                <Skeleton.Rect key={i} width={GRID_ITEM} height={GRID_ITEM} borderRadius={0} />
              ))}
            </View>
          ) : (
            <EmptyState
              icon="hash"
              title={`No posts with #${tag} yet`}
              subtitle="Be the first to post with this hashtag"
            />
          )
        }
        ListFooterComponent={() =>
          postsQuery.isFetchingNextPage ? (
            <View style={styles.skeletonGrid}>
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton.Rect key={i} width={GRID_ITEM} height={GRID_ITEM} borderRadius={0} />
              ))}
            </View>
          ) : null
        }
        contentContainerStyle={{ paddingBottom: 40 }}
      />
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
  backBtn: { width: 36 },
  headerInfo: { alignItems: 'center' },
  tagName: { color: colors.text.primary, fontSize: fontSize.base, fontWeight: '700' },
  postCount: { color: colors.text.secondary, fontSize: fontSize.xs, marginTop: 1 },

  skeletonGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 1 },
  gridRow: { gap: 1 },
  gridItem: {
    width: GRID_ITEM, height: GRID_ITEM,
    backgroundColor: colors.dark.bgElevated, position: 'relative',
  },
  gridImage: { width: '100%', height: '100%' },
  gridTextPost: {
    flex: 1, padding: spacing.sm, backgroundColor: colors.dark.bgElevated,
    justifyContent: 'center',
  },
  gridText: { color: colors.text.primary, fontSize: fontSize.xs },
  carouselBadge: {
    position: 'absolute', top: 6, right: 6,
    backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: radius.sm, padding: 3,
  },
  followBtn: {
    backgroundColor: colors.emerald, borderRadius: radius.md,
    paddingHorizontal: spacing.lg, paddingVertical: spacing.xs + 2,
    minWidth: 90, alignItems: 'center',
  },
  followingBtn: {
    backgroundColor: 'transparent', borderWidth: 1.5, borderColor: colors.dark.border,
  },
  followBtnText: { color: '#fff', fontSize: fontSize.sm, fontWeight: '700' },
  followingBtnText: { color: colors.text.primary },
});
