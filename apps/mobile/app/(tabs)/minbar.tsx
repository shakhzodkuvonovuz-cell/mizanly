import { useCallback, useEffect, useRef, useState, useMemo, memo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Image } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { useScrollToTop } from '@react-navigation/native';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useUser } from '@clerk/clerk-expo';
import { useRouter, useNavigation } from 'expo-router';
import { colors, spacing, fontSize, radius, shadow } from '@/theme';
import { useStore } from '@/store';
import { videosApi, usersApi } from '@/services/api';
import { Avatar } from '@/components/ui/Avatar';
import { Icon } from '@/components/ui/Icon';
import { TabSelector } from '@/components/ui/TabSelector';
import { Badge } from '@/components/ui/Badge';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { BottomSheet, BottomSheetItem } from '@/components/ui/BottomSheet';
import { useHaptic } from '@/hooks/useHaptic';
import { useAnimatedPress } from '@/hooks/useAnimatedPress';
import Animated from 'react-native-reanimated';
import { Pressable } from 'react-native';
import type { Video, VideoCategory } from '@/types';
import { formatDistanceToNowStrict } from 'date-fns';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

interface CategoryChipProps {
  cat: { key: VideoCategory | 'all'; label: string };
  isActive: boolean;
  onPress: () => void;
}

const CategoryChip = memo(function CategoryChip({ cat, isActive, onPress }: CategoryChipProps) {
  const chipPress = useAnimatedPress();
  return (
    <AnimatedPressable
      key={cat.key}
      style={[
        styles.categoryChip,
        isActive && styles.categoryChipActive,
        chipPress.animatedStyle,
      ]}
      onPress={onPress}
      onPressIn={chipPress.onPressIn}
      onPressOut={chipPress.onPressOut}
    >
      <Text
        style={[
          styles.categoryLabel,
          isActive && styles.categoryLabelActive,
        ]}
      >
        {cat.label}
      </Text>
    </AnimatedPressable>
  );
});

const CATEGORIES: { key: VideoCategory | 'all'; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'QURAN', label: 'Islamic' },
  { key: 'EDUCATION', label: 'Education' },
  { key: 'VLOG', label: 'Lifestyle' },
  { key: 'TECH', label: 'Tech' },
  { key: 'ENTERTAINMENT', label: 'Entertainment' },
];

interface VideoCardProps {
  item: Video;
  onPress: (video: Video) => void;
  onChannelPress: (handle: string) => void;
  onMorePress: (video: Video) => void;
}

const VideoCard = memo(function VideoCard({ item, onPress, onChannelPress, onMorePress }: VideoCardProps) {
  const durationMinutes = Math.floor(item.duration / 60);
  const durationSeconds = Math.floor(item.duration % 60);
  const durationText = `${durationMinutes}:${durationSeconds.toString().padStart(2, '0')}`;

  return (
    <TouchableOpacity
      style={styles.videoCard}
      activeOpacity={0.8}
      onPress={() => onPress(item)}
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
          onPress={() => onChannelPress(item.channel.handle)}
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
          onPress={() => onMorePress(item)}
          hitSlop={8}
        >
          <Icon name="more-horizontal" size="sm" color={colors.text.secondary} />
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );
});

export default function MinbarScreen() {
  const { user } = useUser();
  const router = useRouter();
  const navigation = useNavigation();
  const haptic = useHaptic();
  const [selectedCategory, setSelectedCategory] = useState<VideoCategory | 'all'>('all');
  const [selectedVideoId, setSelectedVideoId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [feedType, setFeedType] = useState<'home' | 'subscriptions'>('home');
  const setUnreadNotifications = useStore((s) => s.setUnreadNotifications);
  const unreadNotifications = useStore((s) => s.unreadNotifications);

  const feedRef = useRef<any>(null);
  useScrollToTop(feedRef);

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      feedRef.current?.scrollToOffset({ offset: 0, animated: true });
    });
    return unsubscribe;
  }, [navigation]);

  const continueWatchingQuery = useQuery({
    queryKey: ['watch-history'],
    queryFn: () => usersApi.getWatchHistory(),
    select: (data) => data.data?.filter((v) => v.progress > 0 && !v.completed).slice(0, 10) ?? [],
  });

  const searchPress = useAnimatedPress();
  const bellPress = useAnimatedPress();
  const watchLaterPress = useAnimatedPress();

  const feedQuery = useInfiniteQuery({
    queryKey: ['videos-feed', selectedCategory, feedType],
    queryFn: async ({ pageParam }) => {
      if (feedType === 'subscriptions') {
        return [];
      }
      return videosApi.getFeed(
        selectedCategory === 'all' ? undefined : selectedCategory,
        pageParam as string | undefined
      );
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.length > 0 ? last[last.length - 1].id : undefined,
    enabled: feedType === 'home',
  });

  const videos: Video[] = feedQuery.data?.pages.flat() ?? [];

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await feedQuery.refetch();
    setRefreshing(false);
  }, [feedQuery]);

  const onEndReached = useCallback(() => {
    if (feedQuery.hasNextPage && !feedQuery.isFetchingNextPage) {
      feedQuery.fetchNextPage();
    }
  }, [feedQuery.hasNextPage, feedQuery.isFetchingNextPage, feedQuery.fetchNextPage]);

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
    setSelectedVideoId(video.id);
  };

  const handleSaveToWatchLater = async (videoId: string) => {
    haptic.light();
    setSelectedVideoId(null);
    try {
      await usersApi.addWatchLater(videoId);
    } catch {
      // silently fail — user can retry
    }
  };

  const renderVideoItem = useCallback(({ item }: { item: Video }) => (
    <VideoCard
      item={item}
      onPress={handleVideoPress}
      onChannelPress={handleChannelPress}
      onMorePress={handleMorePress}
    />
  ), [handleVideoPress, handleChannelPress, handleMorePress]);

  const keyExtractor = useCallback((item: Video) => item.id, []);

  const listHeader = useMemo(() => (
    <View>
      {/* Continue Watching */}
      {continueWatchingQuery.data?.length ? (
        <View style={styles.continueSection}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.continueTitle}>Continue Watching</Text>
            <Pressable onPress={() => router.push('/(screens)/watch-history')} hitSlop={8}>
              <Text style={styles.seeAllText}>See all</Text>
            </Pressable>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.continueScroll}>
            {continueWatchingQuery.data.map((item) => (
              <Pressable
                key={item.id}
                style={styles.continueCard}
                onPress={() => router.push(`/(screens)/video/${item.id}`)}
              >
                <View style={styles.continueThumbWrap}>
                  {item.thumbnailUrl ? (
                    <Image source={{ uri: item.thumbnailUrl }} style={styles.continueThumb} />
                  ) : (
                    <View style={[styles.continueThumb, styles.continueThumbPlaceholder]}>
                      <Icon name="video" size="lg" color={colors.text.secondary} />
                    </View>
                  )}
                  <View style={styles.progressBarBg}>
                    <View style={[styles.progressBarFill, { width: `${item.progress * 100}%` }]} />
                  </View>
                </View>
                <Text style={styles.continueCardTitle} numberOfLines={1}>{item.title}</Text>
                <Text style={styles.continueCardMeta}>{item.channel?.name}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      ) : null}
      {/* Feed type toggle */}
      <TabSelector
        tabs={[
          { key: 'home', label: 'Home' },
          { key: 'subscriptions', label: 'Subscriptions' },
        ]}
        activeKey={feedType}
        onTabChange={(key) => setFeedType(key as 'home' | 'subscriptions')}
        variant="pill"
        style={{ marginHorizontal: spacing.base, marginVertical: spacing.sm }}
      />
      {/* Category chips */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.categoriesContainer}
      >
        {CATEGORIES.map((cat) => (
          <CategoryChip
            key={cat.key}
            cat={cat}
            isActive={selectedCategory === cat.key}
            onPress={() => {
              haptic.light();
              setSelectedCategory(cat.key);
            }}
          />
        ))}
      </ScrollView>
    </View>
  ), [selectedCategory, haptic, continueWatchingQuery.data, router, feedType]);

  const listEmpty = useMemo(() => {
    if (feedType === 'subscriptions') {
      return (
        <EmptyState
          icon="users"
          title="No subscribed videos"
          subtitle="Subscribe to channels to see their videos here"
          actionLabel="Explore Channels"
          onAction={() => router.push('/(screens)/channels' as any)}
        />
      );
    }
    return feedQuery.isLoading ? (
      <View>
        {[1, 2, 3].map((i) => (
          <View key={i} style={{ marginBottom: spacing.lg }}>
            <Skeleton.Rect width="100%" height={210} borderRadius={0} />
            <View style={{ flexDirection: 'row', paddingHorizontal: spacing.base, marginTop: spacing.md, gap: spacing.sm }}>
              <Skeleton.Circle size={36} />
              <View style={{ flex: 1, gap: spacing.xs, paddingTop: 4 }}>
                <Skeleton.Rect width="90%" height={16} borderRadius={4} />
                <Skeleton.Rect width="60%" height={14} borderRadius={4} />
              </View>
            </View>
          </View>
        ))}
      </View>
    ) : (
      <EmptyState
        icon="video"
        title="No videos yet"
        subtitle="Be the first to upload a long video"
        actionLabel="Upload"
        onAction={() => router.push('/(screens)/create-video')}
      />
    );
  }, [feedQuery.isLoading, feedType, router]);

  const listFooter = useMemo(() => (
    feedQuery.isFetchingNextPage ? (
      <View style={{ paddingBottom: spacing.lg }}>
        <Skeleton.Rect width="100%" height={210} borderRadius={0} />
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
            onPress={() => { haptic.light(); router.push('/(screens)/watch-history'); }}
            onPressIn={watchLaterPress.onPressIn}
            onPressOut={watchLaterPress.onPressOut}
            style={watchLaterPress.animatedStyle}
            accessibilityLabel="Watch Later"
            accessibilityRole="button"
            accessibilityHint="View your watch later list"
          >
            <Icon name="clock" size="sm" color={colors.text.primary} />
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
        keyExtractor={keyExtractor}
        estimatedItemSize={260}
        onEndReached={onEndReached}
        onEndReachedThreshold={0.4}
        onRefresh={onRefresh}
        refreshing={refreshing}
        renderItem={renderVideoItem}
        maxToRenderPerBatch={5}
        windowSize={5}
        removeClippedSubviews={true}
        ListHeaderComponent={listHeader}
        ListEmptyComponent={listEmpty}
        ListFooterComponent={listFooter}
      />
      <BottomSheet
        visible={!!selectedVideoId}
        onClose={() => setSelectedVideoId(null)}
      >
        <BottomSheetItem
          label="Report"
          icon={<Icon name="flag" size="sm" color={colors.text.primary} />}
          onPress={() => {
            setSelectedVideoId(null);
            router.push(`/(screens)/report?type=video&id=${selectedVideoId}`);
          }}
        />
        <BottomSheetItem
          label="Save to Watch Later"
          icon={<Icon name="clock" size="sm" color={colors.text.primary} />}
          onPress={() => {
            if (selectedVideoId) handleSaveToWatchLater(selectedVideoId);
          }}
        />
        <BottomSheetItem
          label="Not interested"
          icon={<Icon name="eye-off" size="sm" color={colors.text.primary} />}
          onPress={() => setSelectedVideoId(null)}
        />
      </BottomSheet>
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
    fontFamily: 'PlayfairDisplay-Bold',
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
    color: '#FFFFFF',
    fontWeight: '600',
  },
  videoCard: {
    marginBottom: spacing.lg,
  },
  thumbnailContainer: {
    position: 'relative',
    width: '100%',
    aspectRatio: 16 / 9,
    backgroundColor: colors.dark.surface,
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
    backgroundColor: 'rgba(0,0,0,0.7)',
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
    paddingHorizontal: spacing.base,
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginTop: spacing.md,
    gap: spacing.sm,
  },
  channelAvatar: {
    marginTop: spacing.xs,
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
  footer: {
    paddingBottom: spacing.lg,
  },
  continueSection: {
    paddingVertical: spacing.md,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.base,
    marginBottom: spacing.sm,
  },
  seeAllText: {
    color: colors.emerald,
    fontSize: fontSize.sm,
    fontWeight: '600',
  },
  continueTitle: {
    color: colors.emerald,
    fontSize: fontSize.md,
    fontWeight: '700',
  },
  continueScroll: {
    paddingHorizontal: spacing.base,
    gap: spacing.md,
  },
  continueCard: {
    width: 200,
  },
  continueThumbWrap: {
    width: 200,
    height: 112,
    borderRadius: radius.sm,
    overflow: 'hidden',
    backgroundColor: colors.dark.bgCard,
  },
  continueThumb: {
    width: '100%',
    height: '100%',
  },
  continueThumbPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.dark.surface,
  },
  progressBarBg: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: colors.error, // Signature "YouTube" red for progress
  },
  continueCardTitle: {
    color: colors.text.primary,
    fontSize: fontSize.sm,
    fontWeight: '500',
    marginTop: spacing.xs,
  },
  continueCardMeta: {
    color: colors.text.secondary,
    fontSize: fontSize.xs,
    marginTop: 2,
  },
});