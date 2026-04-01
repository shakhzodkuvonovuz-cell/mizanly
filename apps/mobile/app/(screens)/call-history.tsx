import { useState, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable, StatusBar } from 'react-native';
import { useRouter } from 'expo-router';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
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
import { livekitApi } from '@/services/livekit';
import { useTranslation } from '@/hooks/useTranslation';
import { useThemeColors } from '@/hooks/useThemeColors';
import type { CallSession } from '@/types';
import { useContextualHaptic } from '@/hooks/useContextualHaptic';
import { BrandedRefreshControl } from '@/components/ui/BrandedRefreshControl';
import { ScreenErrorBoundary } from '@/components/ui/ScreenErrorBoundary';
import { navigate } from '@/utils/navigation';

export default function CallHistoryScreen() {
  const router = useRouter();
  const tc = useThemeColors();
  const insets = useSafeAreaInsets();
  const haptic = useContextualHaptic();
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
    queryFn: ({ pageParam }) => livekitApi.getHistory(pageParam as string | undefined),
    getNextPageParam: (lastPage: { meta: { hasMore: boolean; cursor: string | null } }) => lastPage.meta.hasMore ? lastPage.meta.cursor : undefined,
    initialPageParam: undefined as string | undefined,
  });

  // Refresh list when returning from a call
  useFocusEffect(
    useCallback(() => {
      refetch();
    }, [refetch])
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    haptic.navigate();
    await refetch();
    setRefreshing(false);
  }, [refetch, haptic]);

  const calls = data?.pages.flatMap((page: { data: CallSession[] }) => page.data) ?? [];

  const renderItem = ({ item, index }: { item: CallSession; index: number }) => {
    const myParticipant = item.participants?.find((p: { userId: string }) => p.userId === myUserId);
    const isCaller = myParticipant?.role === 'caller';
    const otherParticipant = item.participants?.find((p: { userId: string }) => p.userId !== myUserId);
    const otherUser = otherParticipant?.user;

    const fallbackName = t('common.deletedUser');
    const displayName = otherUser?.displayName || otherUser?.username || fallbackName;

    const isMissed = item.status === 'MISSED' && !isCaller;
    const isVideo = item.callType === 'VIDEO';

    let durationText = '';
    if (item.status === 'ENDED' && item.duration) {
      const minutes = Math.floor(item.duration / 60);
      const seconds = item.duration % 60;
      durationText = `${minutes}:${seconds.toString().padStart(2, '0')}`;
    }

    const statusMap: Record<string, string> = {
      MISSED: t('calls.missed'),
      DECLINED: t('calls.declined'),
      RINGING: t('calls.ringing'),
      ACTIVE: t('calls.ringing'),
      ENDED: durationText,
    };
    const statusText = statusMap[item.status] || item.status;

    return (
      <Animated.View entering={FadeInUp.delay(index * 50).duration(400)}>
        <LinearGradient
          colors={colors.gradient.cardDark}
          style={styles.row}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={displayName}
            style={({ pressed }) => [styles.rowInner, pressed && { opacity: 0.7 }]}
            onPress={() => otherUser?.username ? navigate(`/(screens)/profile/${otherUser.username}`) : undefined}
          >
            <Avatar uri={otherUser?.avatarUrl} name={displayName} size="md" />
            <View style={styles.info}>
              <Text style={[styles.name, { color: tc.text.primary }, isMissed && styles.missedName]} numberOfLines={1}>
                {displayName}
              </Text>
              <View style={styles.subInfo}>
                <LinearGradient
                  colors={isMissed ? ['rgba(248,81,73,0.2)', 'rgba(248,81,73,0.1)'] : ['rgba(10,123,79,0.2)', 'rgba(200,150,62,0.1)']}
                  style={styles.callTypeIconBg}
                >
                  <Icon
                    name={isVideo ? 'video' : 'phone'}
                    size="xs"
                    color={isMissed ? colors.error : colors.emerald}
                  />
                </LinearGradient>
                <Text style={[styles.statusText, { color: tc.text.secondary }, isMissed && styles.missedText]}>{statusText}</Text>
                <Text style={[styles.dot, { color: tc.text.tertiary }]}>•</Text>
                <Text style={[styles.time, { color: tc.text.secondary }]} numberOfLines={1}>
                  {formatDistanceToNowStrict(new Date(item.createdAt), { addSuffix: true, locale: getDateFnsLocale() })}
                </Text>
              </View>
            </View>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('calls.callBack')}
            hitSlop={8}
            onPress={() => navigate(`/(screens)/call/${item.id}`)}
          >
            <LinearGradient
              colors={['rgba(10,123,79,0.2)', 'rgba(10,123,79,0.1)']}
              style={styles.actionButton}
            >
              <Icon name={isVideo ? 'video' : 'phone'} size="sm" color={colors.emerald} />
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
        <StatusBar barStyle="light-content" />
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
            <BrandedRefreshControl refreshing={refreshing} onRefresh={onRefresh} />
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
    borderColor: colors.active.white6,
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
    gap: spacing.xs,
  },
  name: {
    fontSize: fontSize.base,
    fontWeight: '600',
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
  },
  time: {
    fontSize: fontSize.sm,
  },
  actionButton: {
    width: 36,
    height: 36,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
