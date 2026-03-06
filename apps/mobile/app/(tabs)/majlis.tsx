import { useCallback, useRef, useState, useMemo } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { useScrollToTop } from '@react-navigation/native';
import { useInfiniteQuery } from '@tanstack/react-query';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useUser } from '@clerk/clerk-expo';
import { useRouter } from 'expo-router';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withSequence,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, spacing, fontSize, animation, radius } from '@/theme';
import { useStore } from '@/store';
import { threadsApi } from '@/services/api';
import { ThreadCard } from '@/components/majlis/ThreadCard';
import { Icon } from '@/components/ui/Icon';
import { TabSelector } from '@/components/ui/TabSelector';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { useHaptic } from '@/hooks/useHaptic';
import type { Thread } from '@/types';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

const TABS = [
  { key: 'foryou', label: 'For You' },
  { key: 'following', label: 'Following' },
  { key: 'trending', label: 'Trending' },
];

export default function MajlisScreen() {
  const { user } = useUser();
  const router = useRouter();
  const haptic = useHaptic();
  const feedType = useStore((s) => s.majlisFeedType);
  const setFeedType = useStore((s) => s.setMajlisFeedType);
  const [refreshing, setRefreshing] = useState(false);

  const feedRef = useRef<FlashList<Thread>>(null);
  useScrollToTop(feedRef);

  // Floating compose button
  const fabScale = useSharedValue(1);
  const fabStyle = useAnimatedStyle(() => ({
    transform: [{ scale: fabScale.value }],
  }));

  const feedQuery = useInfiniteQuery({
    queryKey: ['majlis-feed', feedType],
    queryFn: ({ pageParam }) => threadsApi.getFeed(feedType, pageParam as string | undefined),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.meta.hasMore ? last.meta.cursor ?? undefined : undefined,
  });

  const threads: Thread[] = feedQuery.data?.pages.flatMap((p) => p.data) ?? [];

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
        title="No threads yet"
        subtitle="Start a conversation"
      />
    )
  ), [feedQuery.isLoading]);

  const listFooter = useMemo(() => (
    feedQuery.isFetchingNextPage ? (
      <View style={styles.footer}>
        <Skeleton.ThreadCard />
      </View>
    ) : null
  ), [feedQuery.isFetchingNextPage]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await feedQuery.refetch();
    setRefreshing(false);
  }, [feedQuery]);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.logo}>Majlis</Text>
        <Pressable
          hitSlop={8}
          onPress={() => { haptic.light(); router.push('/(screens)/search'); }}
          accessibilityLabel="Search"
          accessibilityRole="button"
          accessibilityHint="Search for threads and people"
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

      <FlashList
        ref={feedRef}
        data={threads}
        keyExtractor={(item) => item.id}
        estimatedItemSize={120}
        onEndReached={() => {
          if (feedQuery.hasNextPage && !feedQuery.isFetchingNextPage) feedQuery.fetchNextPage();
        }}
        onEndReachedThreshold={0.4}
        onRefresh={onRefresh}
        refreshing={refreshing}
        renderItem={({ item }) => (
          <ThreadCard thread={item} viewerId={user?.id} isOwn={user?.username === item.user.username} />
        )}
        ListEmptyComponent={listEmpty}
        ListFooterComponent={listFooter}
      />

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
        accessibilityLabel="Compose thread"
        accessibilityRole="button"
        accessibilityHint="Create a new thread"
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
  logo: { color: colors.text.primary, fontSize: fontSize.xl, fontWeight: '700' },
  footer: { paddingVertical: spacing.sm },
  fab: {
    position: 'absolute',
    bottom: 100,
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
});
