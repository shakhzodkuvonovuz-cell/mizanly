import { useState, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, RefreshControl, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { formatDistanceToNowStrict } from 'date-fns';
import { useUser } from '@clerk/clerk-expo';

import { GlassHeader } from '@/components/ui/GlassHeader';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { Avatar } from '@/components/ui/Avatar';
import { Icon } from '@/components/ui/Icon';
import { colors, spacing, fontSize, radius } from '@/theme';
import { callsApi } from '@/services/api';
import type { CallSession } from '@/types';
import { useHaptic } from '@/hooks/useHaptic';

export default function CallHistoryScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const haptic = useHaptic();
  const { user: clerkUser } = useUser();
  const [refreshing, setRefreshing] = useState(false);

  // Clerk user ID matches callerId/receiverId
  const myUserId = clerkUser?.id;

  const {
    data,
    isLoading,
    isError,
    refetch,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: ['call-history'],
    queryFn: ({ pageParam }) => callsApi.getHistory(pageParam as string | undefined),
    getNextPageParam: (lastPage) => lastPage.meta.hasMore ? lastPage.meta.cursor : undefined,
    initialPageParam: undefined,
  });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    haptic.light();
    await refetch();
    setRefreshing(false);
  }, [refetch, haptic]);

  const calls = data?.pages.flatMap((page) => page.data) ?? [];

  const renderItem = ({ item }: { item: CallSession }) => {
    const isCaller = item.callerId === myUserId;
    const otherUser = isCaller ? item.receiver : item.caller;

    if (!otherUser) return null;

    const isMissed = item.status === 'missed' && !isCaller;
    const isVideo = item.callType === 'video';

    let durationText = '';
    if (item.status === 'ended' && item.duration) {
      const minutes = Math.floor(item.duration / 60);
      const seconds = item.duration % 60;
      durationText = `${minutes}:${seconds.toString().padStart(2, '0')}`;
    }

    let statusText = '';
    if (item.status === 'missed') statusText = 'Missed';
    else if (item.status === 'declined') statusText = 'Declined';
    else if (item.status === 'ended') statusText = durationText;
    else statusText = item.status;

    return (
      <Pressable 
        style={styles.row}
        onPress={() => router.push(`/(screens)/profile/${otherUser.username}` as never)}
      >
        <Avatar uri={otherUser.avatarUrl} name={otherUser.displayName || otherUser.username} size="md" />
        <View style={styles.info}>
          <Text style={[styles.name, isMissed && styles.missedName]} numberOfLines={1}>
            {otherUser.displayName || otherUser.username}
          </Text>
          <View style={styles.subInfo}>
            <Icon 
              name={isVideo ? 'video' : 'phone'} 
              size={12} 
              color={isMissed ? colors.error : colors.text.secondary} 
            />
            <Text style={styles.statusText}>{statusText}</Text>
            <Text style={styles.dot}>•</Text>
            <Text style={styles.time} numberOfLines={1}>
              {formatDistanceToNowStrict(new Date(item.createdAt), { addSuffix: true })}
            </Text>
          </View>
        </View>
        <Pressable
          style={styles.actionButton}
          hitSlop={8}
          onPress={() => router.push(`/(screens)/call/${item.id}` as never)}
        >
          <Icon name={isVideo ? 'video' : 'phone'} size={20} color={colors.emerald} />
        </Pressable>
      </Pressable>
    );
  };

  if (isError) {
    return (
      <View style={styles.container}>
        <GlassHeader 
          title="Calls" 
          leftAction={{ icon: 'arrow-left', onPress: () => router.back(), accessibilityLabel: 'Go back' }} 
        />
        <View style={{ height: insets.top + 52 }} />
        <EmptyState 
          icon="phone" 
          title="Couldn't load calls" 
          subtitle="Check your connection and try again" 
          actionLabel="Retry" 
          onAction={() => refetch()} 
        />
      </View>
    );
  }

  if (isLoading) {
    return (
      <View style={styles.container}>
        <GlassHeader 
          title="Calls" 
          leftAction={{ icon: 'arrow-left', onPress: () => router.back(), accessibilityLabel: 'Go back' }} 
        />
        <View style={{ height: insets.top + 52 }} />
        <View style={{ padding: spacing.base, gap: spacing.md }}>
          <Skeleton.Rect width="100%" height={60} borderRadius={radius.md} />
          <Skeleton.Rect width="100%" height={60} borderRadius={radius.md} />
          <Skeleton.Rect width="100%" height={60} borderRadius={radius.md} />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <GlassHeader 
        title="Calls" 
        leftAction={{ icon: 'arrow-left', onPress: () => router.back(), accessibilityLabel: 'Go back' }} 
      />
      <FlatList
        data={calls}
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
        contentContainerStyle={[styles.listContent, { paddingTop: insets.top + 52 + spacing.base }]}
        removeClippedSubviews={true}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.emerald} />
        }
        onEndReached={() => {
          if (hasNextPage && !isFetchingNextPage) {
            fetchNextPage();
          }
        }}
        onEndReachedThreshold={0.5}
        ListEmptyComponent={
          <View style={styles.emptyWrap}>
            <EmptyState 
              icon="phone" 
              title="No calls yet" 
              subtitle="Your call history will appear here" 
            />
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { 
    flex: 1, 
    backgroundColor: colors.dark.bg 
  },
  listContent: {
    paddingBottom: spacing.2xl,
  },
  emptyWrap: {
    marginTop: spacing.2xl,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    gap: spacing.md,
  },
  info: {
    flex: 1,
    justifyContent: 'center',
    gap: 2,
  },
  name: {
    fontSize: fontSize.base,
    fontWeight: '600',
    color: colors.text.primary,
  },
  missedName: {
    color: colors.error,
  },
  subInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  statusText: {
    fontSize: fontSize.sm,
    color: colors.text.secondary,
    textTransform: 'capitalize',
  },
  dot: {
    fontSize: fontSize.sm,
    color: colors.text.tertiary,
  },
  time: {
    fontSize: fontSize.sm,
    color: colors.text.secondary,
  },
  actionButton: {
    padding: spacing.xs,
  },
});
