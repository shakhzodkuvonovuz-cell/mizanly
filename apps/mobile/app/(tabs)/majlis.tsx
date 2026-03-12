import { useCallback, useEffect, useRef, useState, useMemo, memo } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { useScrollToTop } from '@react-navigation/native';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useUser } from '@clerk/clerk-expo';
import { useRouter, useNavigation } from 'expo-router';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withSequence,
  withTiming,
  FadeInUp,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, spacing, fontSize, animation, radius, tabBar } from '@/theme';
import { useStore } from '@/store';
import { threadsApi, hashtagsApi } from '@/services/api';
import { ThreadCard } from '@/components/majlis/ThreadCard';
import { Icon } from '@/components/ui/Icon';
import { TabSelector } from '@/components/ui/TabSelector';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { useHaptic } from '@/hooks/useHaptic';
import { useTranslation } from '@/hooks/useTranslation';
import type { Thread } from '@/types';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);


// Animated thread card with entrance animation and engagement glow
interface AnimatedThreadCardProps {
  thread: Thread;
  viewerId?: string;
  isOwn?: boolean;
  index: number;
}

const AnimatedThreadCard = memo(function AnimatedThreadCard({ thread, viewerId, isOwn, index }: AnimatedThreadCardProps) {
  // Entrance animation
  const translateY = useSharedValue(4);
  const opacity = useSharedValue(0);

  useEffect(() => {
    const delay = Math.min(index * 50, 300); // Stagger animation, max 300ms delay
    const timer = setTimeout(() => {
      translateY.value = withSpring(0, animation.spring.gentle);
      opacity.value = withTiming(1, { duration: 250 });
    }, delay);
    return () => clearTimeout(timer);
  }, [index, translateY, opacity]);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
    opacity: opacity.value,
  }));

  // Engagement glow: high engagement gets gold left border
  const hasHighEngagement = thread.likesCount > 50 || thread.repliesCount > 20;

  return (
    <Animated.View style={[animStyle, hasHighEngagement && styles.highEngagementCard]}>
      <ThreadCard thread={thread} viewerId={viewerId} isOwn={isOwn} />
    </Animated.View>
  );
});

export default function MajlisScreen() {
  const { t } = useTranslation();
  const { user } = useUser();
  const router = useRouter();
  const navigation = useNavigation();
  const haptic = useHaptic();
  const feedType = useStore((s) => s.majlisFeedType);
  const setFeedType = useStore((s) => s.setMajlisFeedType);
  const [refreshing, setRefreshing] = useState(false);

  const TABS = [
    { key: 'foryou', label: t('majlis.forYou') },
    { key: 'following', label: t('majlis.following') },
    { key: 'trending', label: t('majlis.trending') },
  ];

  // Feed transition animation
  const feedOpacity = useSharedValue(1);
  const feedAnimStyle = useAnimatedStyle(() => ({
    opacity: feedOpacity.value,
  }));

  const feedRef = useRef<FlashList<Thread>>(null);
  useScrollToTop(feedRef);

  useEffect(() => {
    const unsubscribe = navigation.addListener('tabPress', (e) => {
      // Only if already on this tab
      feedRef.current?.scrollToOffset({ offset: 0, animated: true });
    });
    return unsubscribe;
  }, [navigation]);

  // Floating compose button
  const fabScale = useSharedValue(1);
  const fabStyle = useAnimatedStyle(() => ({
    transform: [{ scale: fabScale.value }],
  }));

  // Animate feed transition when feedType changes
  useEffect(() => {
    feedOpacity.value = withTiming(0, { duration: 75 });
    const timer = setTimeout(() => {
      feedOpacity.value = withTiming(1, { duration: 75 });
    }, 75);
    return () => clearTimeout(timer);
  }, [feedType, feedOpacity]);

  const feedQuery = useInfiniteQuery({
    queryKey: ['majlis-feed', feedType],
    queryFn: ({ pageParam }) => threadsApi.getFeed(feedType, pageParam as string | undefined),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last?.meta?.hasMore ? last.meta.cursor ?? undefined : undefined,
  });

  const trendingHashtagsQuery = useQuery({
    queryKey: ['trending-hashtags'],
    queryFn: () => hashtagsApi.getTrending(),
  });

  const threads: Thread[] = feedQuery.data?.pages.flatMap((p) => p?.data ?? []) ?? [];

  const listEmpty = useMemo(() => (
    feedQuery.isLoading ? (
      <View>
        <Skeleton.ThreadCard />
        <Skeleton.ThreadCard />
        <Skeleton.ThreadCard />
        <Skeleton.ThreadCard />
      </View>
    ) : (
      <EmptyState
        icon="message-circle"
        title={t('majlis.emptyFeed.title')}
        subtitle={t('majlis.emptyFeed.subtitle')}
        actionLabel={t('majlis.emptyFeed.actionLabel')}
        onAction={() => router.push('/(screens)/create-thread')}
      />
    )
  ), [feedQuery.isLoading, router]);

  const listFooter = useMemo(() => {
    if (feedQuery.isFetchingNextPage) {
      return (
        <View style={styles.footer}>
          <Skeleton.ThreadCard />
        </View>
      );
    }
    if (!feedQuery.hasNextPage && threads.length > 0) {
      return (
        <View style={styles.endOfFeed}>
          <Icon name="check-circle" size="sm" color={colors.emerald} />
          <Text style={styles.endOfFeedText}>{t('majlis.caughtUp')}</Text>
        </View>
      );
    }
    return null;
  }, [feedQuery.isFetchingNextPage, feedQuery.hasNextPage, threads.length]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await feedQuery.refetch();
    setRefreshing(false);
  }, [feedQuery]);

  const keyExtractor = useCallback((item: Thread) => item.id, []);
  const renderItem = useCallback(({ item, index }: { item: Thread; index: number }) => (
    <AnimatedThreadCard
      thread={item}
      viewerId={user?.id}
      isOwn={user?.username === item.user.username}
      index={index}
    />
  ), [user?.id, user?.username]);
  const onEndReached = useCallback(() => {
    if (feedQuery.hasNextPage && !feedQuery.isFetchingNextPage) feedQuery.fetchNextPage();
  }, [feedQuery.hasNextPage, feedQuery.isFetchingNextPage, feedQuery.fetchNextPage]);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.logo}>{t('tabs.majlis')}</Text>
        <Pressable
          hitSlop={8}
          onPress={() => { haptic.light(); router.push('/(screens)/search'); }}
          accessibilityLabel={t('common.search')}
          accessibilityRole="button"
          accessibilityHint={t('accessibility.searchHint')}
        >
          <Icon name="search" size="sm" color={colors.text.primary} />
        </Pressable>
      </View>

      {/* Feed tabs */}
      <TabSelector
        tabs={TABS}
        activeKey={feedType}
        onTabChange={(key) => setFeedType(key as 'foryou' | 'following' | 'trending')}
      />

      {/* Trending hashtags */}
      {trendingHashtagsQuery.isLoading || (trendingHashtagsQuery.data?.data && trendingHashtagsQuery.data.data.length > 0) ? (
        <View style={styles.trendingHeader}>
          <Icon name="trending-up" size="sm" color={colors.gold} />
          <Text style={styles.trendingHeaderText}>{t('tabs.trending')}</Text>
        </View>
      ) : null}
      {trendingHashtagsQuery.isLoading ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.hashtagContainer}>
          {[...Array(5)].map((_, i) => (
            <Skeleton.Rect key={i} width={80} height={32} borderRadius={radius.full} />
          ))}
        </ScrollView>
      ) : trendingHashtagsQuery.data?.data && trendingHashtagsQuery.data.data.length > 0 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.hashtagContainer}>
          {trendingHashtagsQuery.data.data.map((hashtag) => (
            <Pressable
              key={hashtag.name}
              style={styles.hashtagChip}
              onPress={() => {
                haptic.light();
                router.push(`/(screens)/hashtag/${hashtag.name}`);
              }}
              accessibilityLabel={t('accessibility.hashtag', { name: hashtag.name })}
              accessibilityRole="button"
              accessibilityHint={t('accessibility.hashtagHint', { name: hashtag.name })}
            >
              <Text style={styles.hashtagText}>#{hashtag.name}</Text>
            </Pressable>
          ))}
        </ScrollView>
      ) : null}

      <Animated.View style={[{ flex: 1 }, feedAnimStyle]}>
        <FlashList
          ref={feedRef}
          data={threads}
          keyExtractor={keyExtractor}
          estimatedItemSize={120}
          onEndReached={onEndReached}
          onEndReachedThreshold={0.4}
          onRefresh={onRefresh}
          refreshing={refreshing}
          renderItem={renderItem}
          maxToRenderPerBatch={5}
          windowSize={5}
          removeClippedSubviews={true}
          ListEmptyComponent={listEmpty}
          ListFooterComponent={listFooter}
        />
      </Animated.View>

      {/* Floating compose button */}
      <AnimatedPressable
        style={[styles.fab, fabStyle]}
        onPress={() => {
          haptic.medium();
          fabScale.value = withSequence(
            withSpring(0.85, animation.spring.bouncy),
            withSpring(1, animation.spring.bouncy),
          );
          router.push('/(screens)/create-thread');
        }}
        accessibilityLabel={t('accessibility.composeThread')}
        accessibilityRole="button"
        accessibilityHint={t('accessibility.composeThreadHint')}
      >
        <LinearGradient
          colors={[colors.emeraldLight, colors.emerald]}
          style={styles.fabGradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        >
          <Icon name="pencil" size="md" color="#FFF" strokeWidth={2} />
        </LinearGradient>
      </AnimatedPressable>
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
  logo: { color: colors.emerald, fontSize: fontSize.xl, fontFamily: 'PlayfairDisplay-Bold' },
  footer: { paddingVertical: spacing.sm },
  fab: {
    position: 'absolute',
    bottom: tabBar.height + 16,
    right: spacing.lg,
    shadowColor: colors.emerald,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },
  fabGradient: {
    width: 56,
    height: 56,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  trendingHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.base,
    paddingTop: spacing.sm,
  },
  trendingHeaderText: {
    color: colors.text.primary,
    fontSize: fontSize.base,
    fontWeight: '600',
  },
  hashtagContainer: {
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
    flexDirection: 'row',
    gap: spacing.sm,
  },
  hashtagChip: {
    backgroundColor: colors.dark.surface,
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderWidth: 1,
    borderColor: colors.dark.border,
  },
  hashtagText: {
    color: colors.emerald,
    fontSize: fontSize.sm,
    fontWeight: '500',
  },
  endOfFeed: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
    gap: spacing.sm,
  },
  endOfFeedText: {
    color: colors.text.secondary,
    fontSize: fontSize.sm,
  },
  highEngagementCard: {
    borderLeftWidth: 2,
    borderLeftColor: colors.gold,
  },
});
