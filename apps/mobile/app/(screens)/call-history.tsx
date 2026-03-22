import { useState, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, RefreshControl, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { formatDistanceToNowStrict } from 'date-fns';
import { getDateFnsLocale } from '@/utils/localeFormat';
import { useUser } from '@clerk/clerk-expo';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';

import { GlassHeader } from '@/components/ui/GlassHeader';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { Avatar } from '@/components/ui/Avatar';
import { Icon } from '@/components/ui/Icon';
import { colors, spacing, fontSize, radius } from '@/theme';
import { callsApi } from '@/services/api';
import { useTranslation } from '@/hooks/useTranslation';
import { useThemeColors } from '@/hooks/useThemeColors';
import type { CallSession } from '@/types';
import { useHaptic } from '@/hooks/useHaptic';
import { ScreenErrorBoundary } from '@/components/ui/ScreenErrorBoundary';
import { navigate } from '@/utils/navigation';

export default function CallHistoryScreen() {
  const router = useRouter();
  const tc = useThemeColors();
  const insets = useSafeAreaInsets();
  const haptic = useHaptic();
  const { t } = useTranslation();
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
    getNextPageParam: (lastPage: { meta: { hasMore: boolean; cursor: string | null } }) => lastPage.meta.hasMore ? lastPage.meta.cursor : undefined,
    initialPageParam: undefined as string | undefined,
  });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    haptic.light();
    await refetch();
    setRefreshing(false);
  }, [refetch, haptic]);

  const calls = data?.pages.flatMap((page: { data: CallSession[] }) => page.data) ?? [];

  const renderItem = ({ item, index }: { item: CallSession; index: number }) => {
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

    const statusMap: Record<string, string> = {
      missed: t('calls.missed'),
      declined: t('calls.declined'),
      ringing: t('calls.ringing'),
      active: t('calls.ringing'),
      connected: t('calls.connected'),
      ended: durationText,
    };
    const statusText = statusMap[item.status] || item.status;

    return (
      <Animated.View entering={FadeInUp.delay(index * 50).duration(400)}>
        <LinearGradient
          colors={['rgba(45,53,72,0.4)', 'rgba(28,35,51,0.2)']}
          style={styles.row}
        >
          <Pressable
            accessibilityRole="button"
            style={styles.rowInner}
            onPress={() => navigate(`/(screens)/profile/${otherUser.username}`)}
          >
            <Avatar uri={otherUser.avatarUrl} name={otherUser.displayName || otherUser.username} size="md" />
            <View style={styles.info}>
              <Text style={[styles.name, isMissed && styles.missedName]} numberOfLines={1}>
                {otherUser.displayName || otherUser.username}
              </Text>
              <View style={styles.subInfo}>
                <LinearGradient
                  colors={isMissed ? ['rgba(248,81,73,0.2)', 'rgba(248,81,73,0.1)'] : ['rgba(10,123,79,0.2)', 'rgba(200,150,62,0.1)']}
                  style={styles.callTypeIconBg}
                >
                  <Icon
                    name={isVideo ? 'video' : 'phone'}
                    size={12}
                    color={isMissed ? colors.error : colors.emerald}
                  />
                </LinearGradient>
                <Text style={[styles.statusText, isMissed && styles.missedText]}>{statusText}</Text>
                <Text style={styles.dot}>•</Text>
                <Text style={styles.time} numberOfLines={1}>
                  {formatDistanceToNowStrict(new Date(item.createdAt), { addSuffix: true, locale: getDateFnsLocale() })}
                </Text>
              </View>
            </View>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            hitSlop={8}
            onPress={() => navigate(`/(screens)/call/${item.id}`)}
          >
            <LinearGradient
              colors={['rgba(10,123,79,0.2)', 'rgba(10,123,79,0.1)']}
              style={styles.actionButton}
            >
              <Icon name={isVideo ? 'video' : 'phone'} size={18} color={colors.emerald} />
            </LinearGradient>
          </Pressable>
        </LinearGradient>
      </Animated.View>
    );
  };

  if (isError) {
    return (
      <View style={[styles.container, { backgroundColor: tc.bg }]}>
        <GlassHeader 
          title={t('calls.title')} 
          leftAction={{ icon: 'arrow-left', onPress: () => router.back(), accessibilityLabel: t('accessibility.goBack') }} 
        />
        <View style={{ height: insets.top + 52 }} />
        <EmptyState 
          icon="phone" 
          title={t('calls.couldNotLoad')} 
          subtitle={t('common.checkConnection')} 
          actionLabel={t('common.retry')} 
          onAction={() => refetch()} 
        />
      </View>
    );
  }

  if (isLoading) {
    return (
      <View style={[styles.container, { backgroundColor: tc.bg }]}>
        <GlassHeader 
          title={t('calls.title')} 
          leftAction={{ icon: 'arrow-left', onPress: () => router.back(), accessibilityLabel: t('accessibility.goBack') }} 
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
    <ScreenErrorBoundary>
      <View style={[styles.container, { backgroundColor: tc.bg }]}>
        <GlassHeader 
          title={t('calls.title')} 
          leftAction={{ icon: 'arrow-left', onPress: () => router.back(), accessibilityLabel: t('accessibility.goBack') }} 
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
                title={t('calls.noCallsYet')} 
                subtitle={t('calls.callHistoryWillAppear')} 
              />
            </View>
          }
        />
      </View>
  
    </ScreenErrorBoundary>
  );
}

const styles = StyleSheet.create({
  container: { 
    flex: 1, 
    backgroundColor: colors.dark.bg 
  },
  listContent: {
    paddingBottom: spacing['2xl'],
  },
  emptyWrap: {
    marginTop: spacing['2xl'],
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    gap: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    marginHorizontal: spacing.base,
    marginVertical: spacing.xs,
  },
  rowInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    flex: 1,
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
  missedText: {
    color: colors.error,
  },
  callTypeIconBg: {
    width: 20,
    height: 20,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
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
    width: 36,
    height: 36,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
