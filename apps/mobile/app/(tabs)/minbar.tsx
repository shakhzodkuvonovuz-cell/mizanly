import { useCallback, useEffect, useRef, useState, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Image } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { useScrollToTop } from '@react-navigation/native';
import { useInfiniteQuery } from '@tanstack/react-query';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useUser } from '@clerk/clerk-expo';
import { useRouter } from 'expo-router';
import { colors, spacing, fontSize, radius } from '@/theme';
import { useStore } from '@/store';
import { videosApi } from '@/services/api';
import { Avatar } from '@/components/ui/Avatar';
import { Icon } from '@/components/ui/Icon';
import { Badge } from '@/components/ui/Badge';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { useHaptic } from '@/hooks/useHaptic';
import { useAnimatedPress } from '@/hooks/useAnimatedPress';
import Animated from 'react-native-reanimated';
import { Pressable } from 'react-native';
import type { Video, VideoCategory } from '@/types';
import { formatDistanceToNowStrict } from 'date-fns';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

const CATEGORIES: { key: VideoCategory | 'all'; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'EDUCATION', label: 'Education' },
  { key: 'QURAN', label: 'Quran' },
  { key: 'LECTURE', label: 'Lecture' },
  { key: 'VLOG', label: 'Vlog' },
  { key: 'NEWS', label: 'News' },
  { key: 'DOCUMENTARY', label: 'Documentary' },
  { key: 'ENTERTAINMENT', label: 'Entertainment' },
  { key: 'SPORTS', label: 'Sports' },
  { key: 'COOKING', label: 'Cooking' },
  { key: 'TECH', label: 'Tech' },
  { key: 'OTHER', label: 'Other' },
];

export default function MinbarScreen() {
  const { user } = useUser();
  const router = useRouter();
  const haptic = useHaptic();
  const [selectedCategory, setSelectedCategory] = useState<VideoCategory | 'all'>('all');
  const [refreshing, setRefreshing] = useState(false);
  const setUnreadNotifications = useStore((s) => s.setUnreadNotifications);
  const unreadNotifications = useStore((s) => s.unreadNotifications);

  const feedRef = useRef<FlashList<Video>>(null);
  useScrollToTop(feedRef);

  useEffect(() => {
    const unsubscribe = router.addListener('focus', () => {
      feedRef.current?.scrollToOffset({ offset: 0, animated: true });
    });
    return unsubscribe;
  }, [router]);

  const searchPress = useAnimatedPress();
  const bellPress = useAnimatedPress();

  const feedQuery = useInfiniteQuery({
    queryKey: ['videos-feed', selectedCategory],
    queryFn: ({ pageParam }) => videosApi.getFeed(
      selectedCategory === 'all' ? undefined : selectedCategory,
      pageParam as string | undefined
    ),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.meta.hasMore ? last.meta.cursor ?? undefined : undefined,
  });

  const videos: Video[] = feedQuery.data?.pages.flatMap((p) => p.data) ?? [];

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await feedQuery.refetch();
    setRefreshing(false);
  }, [feedQuery]);

  const onEndReached = () => {
    if (feedQuery.hasNextPage && !feedQuery.isFetchingNextPage) {
      feedQuery.fetchNextPage();
    }
  };

  const handleVideoPress = (video: Video) => {
    haptic.light();
    router.push(`/(screens)/video/${video.id}`);
  };

  const handleChannelPress = (handle: string) => {
    haptic.light();
    router.push(`/(screens)/channel/${handle}`);
  };

  const handleMorePress = (video: Video) => {
    haptic.light();
    // TODO: open bottom sheet with options (save, report, etc.)
  };

  const renderVideoItem = ({ item }: { item: Video }) => {
    const durationMinutes = Math.floor(item.duration / 60);
    const durationSeconds = Math.floor(item.duration % 60);
    const durationText = `${durationMinutes}:${durationSeconds.toString().padStart(2, '0')}`;

    return (
      <TouchableOpacity
        style={styles.videoCard}
        activeOpacity={0.8}
        onPress={() => handleVideoPress(item)}
      >
        {/* Thumbnail */}
        <View style={styles.thumbnailContainer}>
          {item.thumbnailUrl ? (
            <Image source={{ uri: item.thumbnailUrl }} style={styles.thumbnail} />
          ) : (
            <View style={[styles.thumbnail, styles.thumbnailPlaceholder]}>
              <Icon name="video" size="lg" color={colors.text.secondary} />
            </View>
          )}
          <View style={styles.durationBadge}>
            <Text style={styles.durationText}>{durationText}</Text>
          </View>
        </View>

        {/* Info row */}
        <View style={styles.infoRow}>
          <TouchableOpacity
            style={styles.channelAvatar}
            onPress={() => handleChannelPress(item.channel.handle)}
            hitSlop={8}
          >
            <Avatar
              uri={item.channel.avatarUrl}
              name={item.channel.name}
              size="sm"
              showRing={false}
            />
          </TouchableOpacity>
          <View style={styles.videoDetails}>
            <Text style={styles.videoTitle} numberOfLines={2}>
              {item.title}
            </Text>
            <Text style={styles.channelName} numberOfLines={1}>
              {item.channel.name}
            </Text>
            <Text style={styles.videoStats} numberOfLines={1}>
              {item.viewsCount.toLocaleString()} views • {formatDistanceToNowStrict(new Date(item.publishedAt || item.createdAt), { addSuffix: true })}
            </Text>
          </View>
          <TouchableOpacity
            style={styles.moreButton}
            onPress={() => handleMorePress(item)}
            hitSlop={8}
          >
            <Icon name="more-horizontal" size="sm" color={colors.text.secondary} />
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    );
  };

  const listHeader = useMemo(() => (
    <View>
      {/* Category chips */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.categoriesContainer}
      >
        {CATEGORIES.map((cat) => (
          <TouchableOpacity
            key={cat.key}
            style={[
              styles.categoryChip,
              selectedCategory === cat.key && styles.categoryChipActive,
            ]}
            onPress={() => {
              haptic.light();
              setSelectedCategory(cat.key);
            }}
            activeOpacity={0.7}
          >
            <Text
              style={[
                styles.categoryLabel,
                selectedCategory === cat.key && styles.categoryLabelActive,
              ]}
            >
              {cat.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  ), [selectedCategory, haptic]);

  const listEmpty = useMemo(() => (
    feedQuery.isLoading ? (
      <View style={styles.skeletonContainer}>
        <Skeleton.Rect width="100%" height={200} borderRadius={radius.sm} />
        <Skeleton.Rect width="100%" height={60} borderRadius={radius.sm} style={{ marginTop: spacing.sm }} />
        <Skeleton.Rect width="100%" height={200} borderRadius={radius.sm} style={{ marginTop: spacing.sm }} />
      </View>
    ) : (
      <EmptyState
        icon="video"
        title="No videos yet"
        subtitle="Be the first to upload a long video"
        actionLabel="Upload"
        onAction={() => router.push('/(screens)/create-video')}
      />
    )
  ), [feedQuery.isLoading, router]);

  const listFooter = useMemo(() => (
    feedQuery.isFetchingNextPage ? (
      <View style={styles.footer}>
        <Skeleton.Rect width="100%" height={200} borderRadius={radius.sm} />
      </View>
    ) : null
  ), [feedQuery.isFetchingNextPage]);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.logo}>Minbar</Text>
        <View style={styles.headerRight}>
          <AnimatedPressable
            hitSlop={8}
            onPress={() => { haptic.light(); router.push('/(screens)/search'); }}
            onPressIn={searchPress.onPressIn}
            onPressOut={searchPress.onPressOut}
            style={searchPress.animatedStyle}
            accessibilityLabel="Search"
            accessibilityRole="button"
            accessibilityHint="Search for videos and channels"
          >
            <Icon name="search" size="sm" color={colors.text.primary} />
          </AnimatedPressable>
          <AnimatedPressable
            hitSlop={8}
            onPress={() => {
              haptic.light();
              router.push('/(screens)/notifications');
              setUnreadNotifications(0);
            }}
            onPressIn={bellPress.onPressIn}
            onPressOut={bellPress.onPressOut}
            style={bellPress.animatedStyle}
            accessibilityLabel="Notifications"
            accessibilityRole="button"
            accessibilityHint="View your notifications"
          >
            <View>
              <Icon name="bell" size="sm" color={colors.text.primary} />
              {unreadNotifications > 0 && (
                <Badge
                  count={unreadNotifications}
                  size="sm"
                  style={styles.notifBadge}
                />
              )}
            </View>
          </AnimatedPressable>
        </View>
      </View>

      <FlashList
        ref={feedRef}
        data={videos}
        keyExtractor={(item) => item.id}
        estimatedItemSize={260}
        onEndReached={onEndReached}
        onEndReachedThreshold={0.4}
        onRefresh={onRefresh}
        refreshing={refreshing}
        renderItem={renderVideoItem}
        ListHeaderComponent={listHeader}
        ListEmptyComponent={listEmpty}
        ListFooterComponent={listFooter}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.dark.bg },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
  },
  logo: {
    color: colors.emerald,
    fontSize: fontSize.xl,
    fontWeight: '700',
    letterSpacing: -0.5,
  },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg },
  notifBadge: {
    position: 'absolute',
    top: -6,
    right: -8,
  },
  categoriesContainer: {
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
  },
  categoryChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.full,
    backgroundColor: colors.dark.surface,
    borderWidth: 1,
    borderColor: colors.dark.border,
  },
  categoryChipActive: {
    backgroundColor: colors.emerald,
    borderColor: colors.emerald,
  },
  categoryLabel: {
    color: colors.text.secondary,
    fontSize: fontSize.sm,
    fontWeight: '500',
  },
  categoryLabelActive: {
    color: colors.text.primary,
    fontWeight: '600',
  },
  videoCard: {
    marginHorizontal: spacing.base,
    marginBottom: spacing.lg,
  },
  thumbnailContainer: {
    position: 'relative',
    borderRadius: radius.md,
    overflow: 'hidden',
    backgroundColor: colors.dark.surface,
    aspectRatio: 16 / 9,
  },
  thumbnail: {
    width: '100%',
    height: '100%',
  },
  thumbnailPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  durationBadge: {
    position: 'absolute',
    bottom: spacing.sm,
    right: spacing.sm,
    backgroundColor: 'rgba(0,0,0,0.8)',
    borderRadius: radius.sm,
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
  },
  durationText: {
    color: colors.text.primary,
    fontSize: fontSize.xs,
    fontWeight: '600',
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginTop: spacing.sm,
    gap: spacing.sm,
  },
  channelAvatar: {
    marginTop: 2,
  },
  videoDetails: {
    flex: 1,
  },
  videoTitle: {
    color: colors.text.primary,
    fontSize: fontSize.base,
    fontWeight: '600',
    marginBottom: 2,
  },
  channelName: {
    color: colors.text.secondary,
    fontSize: fontSize.sm,
    marginBottom: 2,
  },
  videoStats: {
    color: colors.text.tertiary,
    fontSize: fontSize.sm,
  },
  moreButton: {
    padding: spacing.xs,
  },
  skeletonContainer: {
    paddingHorizontal: spacing.base,
    paddingTop: spacing.sm,
  },
  footer: {
    paddingHorizontal: spacing.base,
    paddingBottom: spacing.lg,
  },
});