import { useState, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, RefreshControl } from 'react-native';
import { useRouter } from 'expo-router';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { formatDistanceToNowStrict, format } from 'date-fns';

import { GlassHeader } from '@/components/ui/GlassHeader';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { colors, spacing, fontSize, radius } from '@/theme';
import { reportsApi } from '@/services/api';
import type { Report, ReportStatus } from '@/types';
import { useHaptic } from '@/hooks/useHaptic';

export default function MyReportsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const haptic = useHaptic();
  const [refreshing, setRefreshing] = useState(false);

  const {
    data,
    isLoading,
    isError,
    refetch,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage
  } = useInfiniteQuery({
    queryKey: ['my-reports'],
    queryFn: ({ pageParam }) => reportsApi.getMine(pageParam as string | undefined),
    getNextPageParam: (lastPage) => lastPage.meta.hasMore ? lastPage.meta.cursor : undefined,
    initialPageParam: undefined,
  });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    haptic.light();
    await refetch();
    setRefreshing(false);
  }, [refetch, haptic]);

  const reports = data?.pages.flatMap((page) => page.data) ?? [];

  const getStatusColor = (status: ReportStatus) => {
    switch (status) {
      case 'PENDING': return colors.gold;
      case 'REVIEWING': return colors.brand;
      case 'RESOLVED': return colors.emerald;
      case 'DISMISSED': return colors.text.tertiary;
      default: return colors.text.tertiary;
    }
  };

  const getTargetText = (item: Report) => {
    if (item.reportedUserId && item.reportedUser) return `User: @${item.reportedUser.username}`;
    if (item.reportedPostId) return 'Post';
    if (item.reportedCommentId) return 'Comment';
    if (item.reportedMessageId) return 'Message';
    return 'Content';
  };

  const renderItem = ({ item }: { item: Report }) => {
    const statusColor = getStatusColor(item.status);
    
    return (
      <View style={styles.card}>
        <View style={styles.headerRow}>
          <Text style={styles.reason} numberOfLines={1}>
            {item.reason.replace(/_/g, ' ')}
          </Text>
          <View style={[styles.badge, { backgroundColor: statusColor + '20' }]}>
            <Text style={[styles.badgeText, { color: statusColor }]}>{item.status}</Text>
          </View>
        </View>
        <Text style={styles.target} numberOfLines={1}>{getTargetText(item)}</Text>
        <Text style={styles.date}>
          {format(new Date(item.createdAt), 'MMM d, yyyy')} • {formatDistanceToNowStrict(new Date(item.createdAt))} ago
        </Text>
      </View>
    );
  };

  if (isError) {
    return (
      <View style={styles.container}>
        <GlassHeader 
          title="My Reports" 
          leftAction={{ icon: 'arrow-left', onPress: () => router.back(), accessibilityLabel: 'Go back' }} 
        />
        <View style={{ height: insets.top + 52 }} />
        <EmptyState 
          icon="flag" 
          title="Couldn't load reports" 
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
          title="My Reports" 
          leftAction={{ icon: 'arrow-left', onPress: () => router.back(), accessibilityLabel: 'Go back' }} 
        />
        <View style={{ height: insets.top + 52 }} />
        <View style={{ padding: spacing.base, gap: spacing.md }}>
          <Skeleton.Rect width="100%" height={90} borderRadius={radius.md} />
          <Skeleton.Rect width="100%" height={90} borderRadius={radius.md} />
          <Skeleton.Rect width="100%" height={90} borderRadius={radius.md} />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <GlassHeader 
        title="My Reports" 
        leftAction={{ icon: 'arrow-left', onPress: () => router.back(), accessibilityLabel: 'Go back' }} 
      />
      
      <FlatList
        data={reports}
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
        contentContainerStyle={[styles.listContent, { paddingTop: insets.top + 52 + spacing.md }]}
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
              icon="flag" 
              title="No reports" 
              subtitle="Thank you for keeping Mizanly safe" 
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
    paddingHorizontal: spacing.base,
    paddingBottom: spacing.2xl,
    gap: spacing.md,
  },
  emptyWrap: {
    marginTop: spacing.2xl,
  },
  card: {
    backgroundColor: colors.dark.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.xs,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  reason: {
    flex: 1,
    fontSize: fontSize.base,
    fontWeight: '600',
    color: colors.text.primary,
    textTransform: 'capitalize',
  },
  badge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.full,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  target: {
    fontSize: fontSize.sm,
    color: colors.text.secondary,
  },
  date: {
    fontSize: fontSize.xs,
    color: colors.text.tertiary,
    marginTop: 4,
  },
});
