import { useCallback, useEffect, useRef, useState, useMemo, memo } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, Dimensions } from 'react-native';
import { FlashList, type FlashListRef } from '@shopify/flash-list';
import { ProgressiveImage } from '@/components/ui/ProgressiveImage';
import { useScrollToTop } from '@react-navigation/native';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useUser } from '@clerk/clerk-expo';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, spacing, fontSize, radius, shadow, fonts, tabBar } from '@/theme';
import { useStore } from '@/store';
import { videosApi, usersApi, feedApi } from '@/services/api';
import { Avatar } from '@/components/ui/Avatar';
import { Icon } from '@/components/ui/Icon';
import { TabSelector } from '@/components/ui/TabSelector';
import { Badge } from '@/components/ui/Badge';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { BottomSheet, BottomSheetItem } from '@/components/ui/BottomSheet';
import { useContextualHaptic } from '@/hooks/useContextualHaptic';
import { useAnimatedPress } from '@/hooks/useAnimatedPress';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { formatCount } from '@/utils/formatCount';
import { useScrollLinkedHeader } from '@/hooks/useScrollLinkedHeader';
import type { Video, VideoCategory } from '@/types';
import { formatDistanceToNowStrict } from 'date-fns';
import { getDateFnsLocale } from '@/utils/localeFormat';
import { useTranslation } from '@/hooks/useTranslation';
import { ScreenErrorBoundary } from '@/components/ui/ScreenErrorBoundary';
import { useThemeColors } from '@/hooks/useThemeColors';
import { BrandedRefreshControl } from '@/components/ui/BrandedRefreshControl';
import { rtlFlexRow, rtlTextAlign, rtlAbsoluteEnd } from '@/utils/rtl';
import { showToast } from '@/components/ui/Toast';
import { useFocusEffect } from '@react-navigation/native';

const SCREEN_WIDTH = Dimensions.get('window').width;
const THUMBNAIL_HEIGHT = Math.round(SCREEN_WIDTH * 9 / 16);

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

interface CategoryChipProps {
  cat: { key: VideoCategory | 'all'; label: string };
  isActive: boolean;
  onPress: () => void;
}

const CategoryChip = memo(function CategoryChip({ cat, isActive, onPress }: CategoryChipProps) {
  const chipPress = useAnimatedPress();
  const tc = useThemeColors();
  return (
    <AnimatedPressable
      accessibilityRole="button"
      key={cat.key}
      style={[
        styles.categoryChip,
        { backgroundColor: tc.surface, borderColor: tc.border },
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
          { color: tc.text.secondary },
          isActive && styles.categoryLabelActive,
        ]}
      >
        {cat.label}
      </Text>
    </AnimatedPressable>
  );
});

// Category keys — labels resolved inside component via t()
const CATEGORY_KEYS: (VideoCategory | 'all')[] = ['all', 'QURAN', 'EDUCATION', 'VLOG', 'TECH', 'ENTERTAINMENT'];

interface VideoCardProps {
  item: Video;
  onPress: (video: Video) => void;
  onChannelPress: (handle: string) => void;
  onMorePress: (video: Video) => void;
}

interface VideoWithProgress extends Video {
  progress?: number;
}

const VideoCard = memo(function VideoCard({ item, onPress, onChannelPress, onMorePress }: VideoCardProps) {
  const { t, isRTL: isRTLProp } = useTranslation();
  const tc = useThemeColors();
  const video = item as VideoWithProgress;
  const totalSeconds = Math.floor(video.duration);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const durationText = hours > 0
    ? `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
    : `${minutes}:${seconds.toString().padStart(2, '0')}`;
  const watchProgress = video.progress ?? 0;
  const hasWatchProgress = watchProgress > 0 && watchProgress < 1;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t('accessibility.pickVideo')}
      style={styles.videoCard}
      onPress={() => onPress(video)}
    >
      {/* Thumbnail */}
      <View style={[styles.thumbnailContainer, { backgroundColor: tc.surface }]}>
        {video.thumbnailUrl ? (
          <ProgressiveImage uri={video.thumbnailUrl} width="100%" height={THUMBNAIL_HEIGHT} contentFit="cover" />
        ) : (
          <View style={[styles.thumbnail, styles.thumbnailPlaceholder]}>
            <Icon name="video" size="lg" color={tc.text.secondary} />
          </View>
        )}
        {/* Dark overlay gradient at bottom */}
        <LinearGradient
          colors={['transparent', 'rgba(0,0,0,0.6)']}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={styles.thumbnailOverlay}
        />
        {/* Watch progress bar */}
        {hasWatchProgress && (
          <View style={styles.watchProgressBarBg}>
            <View style={[styles.watchProgressBarFill, { width: `${watchProgress * 100}%` }]} />
          </View>
        )}
        <View style={styles.durationBadge}>
          <Text style={styles.durationText}>{durationText}</Text>
        </View>
      </View>

      {/* Info row */}
      <View style={[styles.infoRow, { flexDirection: rtlFlexRow(isRTLProp) }]}>
        <Pressable
          accessibilityRole="button"
          style={styles.channelAvatar}
          onPress={() => onChannelPress(video.channel.handle)}
          hitSlop={8}
        >
          <Avatar
            uri={video.channel.avatarUrl}
            name={video.channel.name}
            size="sm"
            showRing={false}
          />
        </Pressable>
        <View style={styles.videoDetails}>
          <Text style={[styles.videoTitle, { color: tc.text.primary }]} numberOfLines={2}>
            {video.title}
          </Text>
          <View style={[styles.channelNameRow, { flexDirection: rtlFlexRow(isRTLProp) }]}>
            <Icon name="globe" size={10} color={tc.text.secondary} />
            <Text style={[styles.channelName, { color: tc.text.secondary }]} numberOfLines={1}>
              {video.channel.name}
            </Text>
          </View>
          <Text style={[styles.videoStats, { color: tc.text.tertiary }]} numberOfLines={1}>
            {formatCount(video.viewsCount)} {t('minbar.viewCount')} • {formatDistanceToNowStrict(new Date(video.publishedAt || video.createdAt), { addSuffix: true, locale: getDateFnsLocale() })}
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('accessibility.moreOptions')}
          style={styles.moreButton}
          onPress={() => onMorePress(video)}
          hitSlop={8}
        >
          <Icon name="more-horizontal" size="sm" color={tc.text.secondary} />
        </Pressable>
      </View>
    </Pressable>
  );
});

export default function MinbarScreen() {
  const { user } = useUser();
  const router = useRouter();
  const haptic = useContextualHaptic();
  const { t, isRTL } = useTranslation();
  const tc = useThemeColors();
  const [selectedCategory, setSelectedCategory] = useState<VideoCategory | 'all'>('all');
  const [selectedVideoId, setSelectedVideoId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [feedType, setFeedType] = useState<'home' | 'subscriptions'>('home');
  const { onScroll, headerAnimatedStyle, titleAnimatedStyle } = useScrollLinkedHeader(56);
  const setUnreadNotifications = useStore((s) => s.setUnreadNotifications);
  const unreadNotifications = useStore((s) => s.unreadNotifications);

  const CATEGORIES = useMemo(() => CATEGORY_KEYS.map((key) => ({
    key,
    label: key === 'all' ? t('minbar.categoryAll') : key === 'QURAN' ? t('minbar.categoryIslamic') : key === 'EDUCATION' ? t('minbar.categoryEducation') : key === 'VLOG' ? t('minbar.categoryLifestyle') : key === 'TECH' ? t('minbar.categoryTech') : t('minbar.categoryEntertainment'),
  })), [t]);

  const feedRef = useRef<FlashListRef<Video>>(null);
  useScrollToTop(feedRef);
  const hasAnimatedSkeletons = useRef(false);

  // D41-#49: Scroll position persistence across tab switches
  const lastSavedOffset = useRef(0);
  const handleScrollOffsetSave = useCallback((y: number) => {
    if (Math.abs(y - lastSavedOffset.current) > 50) {
      lastSavedOffset.current = y;
      useStore.getState().setMinbarScrollOffset(y);
    }
  }, []);
  const combinedOnScroll = useCallback((event: { nativeEvent: { contentOffset: { y: number } } }) => {
    onScroll(event);
    handleScrollOffsetSave(event.nativeEvent.contentOffset.y);
  }, [onScroll, handleScrollOffsetSave]);
  useFocusEffect(
    useCallback(() => {
      const offset = useStore.getState().minbarScrollOffset;
      if (offset > 0) {
        const timer = setTimeout(() => {
          feedRef.current?.scrollToOffset({ offset, animated: false });
        }, 100);
        return () => clearTimeout(timer);
      }
    }, [])
  );

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
      // Both home and subscriptions use the videos feed endpoint;
      // subscriptions passes 'subscriptions' as category to let the backend filter.
      const category = feedType === 'subscriptions'
        ? 'subscriptions'
        : selectedCategory === 'all' ? undefined : selectedCategory;
      return videosApi.getFeed(category, pageParam as string | undefined);
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.meta?.hasMore ? last.meta.cursor ?? undefined : undefined,
  });

  const videos: Video[] = feedQuery.data?.pages.flatMap((p) => p.data) ?? [];

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

  const handleVideoPress = useCallback((video: Video) => {
    haptic.navigate();
    router.push(`/(screens)/video/${video.id}`);
  }, [haptic, router]);

  const handleChannelPress = useCallback((handle: string) => {
    haptic.navigate();
    router.push(`/(screens)/channel/${handle}`);
  }, [haptic, router]);

  const handleMorePress = useCallback((video: Video) => {
    haptic.tick();
    setSelectedVideoId(video.id);
  }, [haptic]);

  const handleSaveToWatchLater = async (videoId: string) => {
    haptic.save();
    setSelectedVideoId(null);
    try {
      await usersApi.addWatchLater(videoId);
      showToast({ message: t('minbar.savedToWatchLater', 'Saved to Watch Later'), variant: 'success' });
    } catch {
      showToast({ message: t('common.somethingWentWrong'), variant: 'error' });
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

  const handleCategoryPress = useCallback((key: VideoCategory | 'all') => {
    haptic.tick();
    setSelectedCategory(key);
  }, [haptic]);

  const listHeader = useMemo(() => (
    <View>
      {/* Continue Watching */}
      {continueWatchingQuery.data?.length ? (
        <View style={styles.continueSection}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.continueTitle}>{t('minbar.continueWatching')}</Text>
                        <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('accessibility.seeMore')}
              onPress={() => router.push('/(screens)/watch-history')}
              hitSlop={8}
            >
              <Text style={styles.seeAllText}>{t('common.seeMore')}</Text>
            </Pressable>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.continueScroll}>
            {continueWatchingQuery.data.map((item) => (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('accessibility.viewVideo')}
                key={item.id}
                style={styles.continueCard}
                onPress={() => router.push(`/(screens)/video/${item.id}`)}
              >
                <View style={[styles.continueThumbWrap, { backgroundColor: tc.bgCard }]}>
                  {item.thumbnailUrl ? (
                    <ProgressiveImage uri={item.thumbnailUrl} width={200} height={112} contentFit="cover" />
                  ) : (
                    <View style={[styles.continueThumb, styles.continueThumbPlaceholder, { backgroundColor: tc.surface }]}>
                      <Icon name="video" size="lg" color={tc.text.secondary} />
                    </View>
                  )}
                  <View style={styles.progressBarBg}>
                    <View style={[styles.progressBarFill, { width: `${item.progress * 100}%` }]} />
                  </View>
                </View>
                <Text style={[styles.continueCardTitle, { color: tc.text.primary }]} numberOfLines={1}>{item.title}</Text>
                <Text style={[styles.continueCardMeta, { color: tc.text.secondary }]}>{item.channel?.name}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      ) : null}
      {/* Feed type toggle */}
      <TabSelector
        tabs={[
          { key: 'home', label: t('minbar.home') },
          { key: 'subscriptions', label: t('minbar.subscriptions') },
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
            onPress={() => handleCategoryPress(cat.key)}
          />
        ))}
      </ScrollView>
    </View>
  ), [selectedCategory, handleCategoryPress, continueWatchingQuery.data, router, feedType, t, CATEGORIES]);

  const listEmpty = useMemo(() => {
    if (feedQuery.isError) {
      return <EmptyState icon="globe" title={t('common.somethingWentWrong')} subtitle={t('common.pullToRetry')} actionLabel={t('common.retry')} onAction={() => feedQuery.refetch()} />;
    }
    if (feedType === 'subscriptions' && !feedQuery.isLoading) {
      return (
        <EmptyState
          icon="users"
          title={t('minbar.noSubscribedVideos')}
          subtitle={t('minbar.subscribeToSeeVideos')}
          actionLabel={t('minbar.exploreChannels')}
          onAction={() => router.push('/(screens)/discover')}
        />
      );
    }
    const shouldAnimate = !hasAnimatedSkeletons.current;
    if (feedQuery.isLoading) hasAnimatedSkeletons.current = true;
    return feedQuery.isLoading ? (
      <View>
        {[1, 2, 3].map((i) => (
          <Animated.View key={i} entering={shouldAnimate ? FadeInUp.delay((i - 1) * 80).duration(300) : undefined} style={{ marginBottom: spacing.lg }}>
            <Skeleton.Rect width="100%" height={210} borderRadius={0} />
            <View style={{ flexDirection: 'row', paddingHorizontal: spacing.base, marginTop: spacing.md, gap: spacing.sm }}>
              <Skeleton.Circle size={36} />
              <View style={{ flex: 1, gap: spacing.xs, paddingTop: 4 }}>
                <Skeleton.Rect width="90%" height={16} borderRadius={4} />
                <Skeleton.Rect width="60%" height={14} borderRadius={4} />
              </View>
            </View>
          </Animated.View>
        ))}
      </View>
    ) : (
      <EmptyState
        icon="video"
        title={t('minbar.noVideosYet')}
        subtitle={t('minbar.beFirstToUpload')}
        actionLabel={t('common.upload')}
        onAction={() => router.push('/(screens)/create-video')}
      />
    );
  }, [feedQuery.isLoading, feedQuery.isError, feedType, router, t]);

  const listFooter = useMemo(() => (
    feedQuery.isFetchingNextPage ? (
      <View style={{ paddingBottom: spacing.lg }}>
        <Skeleton.Rect width="100%" height={210} borderRadius={0} />
      </View>
    ) : null
  ), [feedQuery.isFetchingNextPage]);

  return (
    <ScreenErrorBoundary>
    <SafeAreaView style={[styles.container, { backgroundColor: tc.bg }]} edges={['top']}>
      {/* Header — collapses proportionally on scroll */}
      <Animated.View style={[styles.header, { flexDirection: rtlFlexRow(isRTL) }, headerAnimatedStyle]}>
        <Animated.Text style={[styles.logo, { textAlign: rtlTextAlign(isRTL) }, titleAnimatedStyle]}>{t('tabs.minbar')}</Animated.Text>
        <View style={[styles.headerRight, { flexDirection: rtlFlexRow(isRTL) }]}>
          <AnimatedPressable
            hitSlop={8}
            onPress={() => { haptic.navigate(); router.push('/(screens)/search'); }}
            onPressIn={searchPress.onPressIn}
            onPressOut={searchPress.onPressOut}
            style={searchPress.animatedStyle}
            accessibilityLabel={t('common.search')}
            accessibilityRole="button"
            accessibilityHint={t('accessibility.searchHint')}
          >
            <Icon name="search" size="sm" color={tc.text.primary} />
          </AnimatedPressable>
          <AnimatedPressable
            hitSlop={8}
            onPress={() => { haptic.navigate(); router.push('/(screens)/watch-history'); }}
            onPressIn={watchLaterPress.onPressIn}
            onPressOut={watchLaterPress.onPressOut}
            style={watchLaterPress.animatedStyle}
            accessibilityLabel={t('minbar.watchLater')}
            accessibilityRole="button"
            accessibilityHint={t('accessibility.watchLaterHint')}
          >
            <Icon name="clock" size="sm" color={tc.text.primary} />
          </AnimatedPressable>
          <AnimatedPressable
            hitSlop={8}
            onPress={() => {
              haptic.navigate();
              router.push('/(screens)/notifications');
              setUnreadNotifications(0);
            }}
            onPressIn={bellPress.onPressIn}
            onPressOut={bellPress.onPressOut}
            style={bellPress.animatedStyle}
            accessibilityLabel={t('accessibility.notifications')}
            accessibilityRole="button"
            accessibilityHint={t('accessibility.notificationsHint')}
          >
            <View>
              <Icon name="bell" size="sm" color={tc.text.primary} />
              {unreadNotifications > 0 && (
                <Badge
                  count={unreadNotifications}
                  size="sm"
                  style={[styles.notifBadge, rtlAbsoluteEnd(isRTL, -8)]}
                />
              )}
            </View>
          </AnimatedPressable>
        </View>
      </Animated.View>

      <FlashList
        ref={feedRef}
        data={videos}
        keyExtractor={keyExtractor}
        onEndReached={onEndReached}
        onEndReachedThreshold={0.4}
        renderItem={renderVideoItem}
        ListHeaderComponent={listHeader}
        ListEmptyComponent={listEmpty}
        ListFooterComponent={listFooter}
        estimatedItemSize={350}
        windowSize={7}
        maxToRenderPerBatch={5}
        onScroll={combinedOnScroll}
        scrollEventThrottle={16}
        contentContainerStyle={{ paddingBottom: tabBar.height + spacing.base }}
        refreshControl={<BrandedRefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      />
      <BottomSheet
        visible={!!selectedVideoId}
        onClose={() => setSelectedVideoId(null)}
      >
        <BottomSheetItem
          label={t('common.report')}
          icon={<Icon name="flag" size="sm" color={tc.text.primary} />}
          onPress={() => {
            setSelectedVideoId(null);
            router.push(`/(screens)/report?type=video&id=${selectedVideoId}`);
          }}
        />
        <BottomSheetItem
          label={t('minbar.saveToWatchLater')}
          icon={<Icon name="clock" size="sm" color={tc.text.primary} />}
          onPress={() => {
            if (selectedVideoId) handleSaveToWatchLater(selectedVideoId);
          }}
        />
        <BottomSheetItem
          label={t('minbar.notInterested')}
          icon={<Icon name="eye-off" size="sm" color={tc.text.primary} />}
          onPress={() => {
            if (selectedVideoId) {
              feedApi.dismiss('VIDEO', selectedVideoId).catch(() => {});
            }
            setSelectedVideoId(null);
          }}
        />
      </BottomSheet>
    </SafeAreaView>
    </ScreenErrorBoundary>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
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
    fontFamily: fonts.headingBold,
    letterSpacing: -0.5,
  },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg },
  notifBadge: {
    position: 'absolute',
    top: -6,
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
    borderWidth: 1,
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
  },
  thumbnail: {
    width: '100%',
    height: '100%',
  },
  thumbnailPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumbnailOverlay: {
    position: 'absolute',
    start: 0,
    end: 0,
    bottom: 0,
    height: 60,
  },
  watchProgressBarBg: {
    position: 'absolute',
    bottom: 0,
    start: 0,
    end: 0,
    height: 3,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  watchProgressBarFill: {
    height: '100%',
    backgroundColor: colors.emerald,
  },
  durationBadge: {
    position: 'absolute',
    bottom: spacing.sm,
    end: spacing.sm,
    backgroundColor: colors.emerald,
    borderRadius: radius.sm,
    paddingHorizontal: 4,
    paddingVertical: 1,
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
  channelNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 2,
  },
  channelName: {
    color: colors.text.secondary,
    fontSize: fontSize.sm,
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
  },
  continueThumb: {
    width: '100%',
    height: '100%',
  },
  continueThumbPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  progressBarBg: {
    position: 'absolute',
    bottom: 0,
    start: 0,
    end: 0,
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: colors.emerald,
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