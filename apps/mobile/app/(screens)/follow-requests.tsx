import { useCallback, useState } from 'react';
import {
  View, Text, StyleSheet, Pressable,
  FlatList,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BrandedRefreshControl } from '@/components/ui/BrandedRefreshControl';
import { useRouter } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { GlassHeader } from '@/components/ui/GlassHeader';
import { Avatar } from '@/components/ui/Avatar';
import { Icon } from '@/components/ui/Icon';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import { colors, spacing, fontSize, radius, fonts } from '@/theme';
import { followsApi } from '@/services/api';
import type { FollowRequest } from '@/types';
import { useTranslation } from '@/hooks/useTranslation';
import { useThemeColors } from '@/hooks/useThemeColors';
import { useContextualHaptic } from '@/hooks/useContextualHaptic';
import { ScreenErrorBoundary } from '@/components/ui/ScreenErrorBoundary';
import { showToast } from '@/components/ui/Toast';
import { rtlFlexRow } from '@/utils/rtl';

function RequestRow({
  request,
  onAccept,
  onDecline,
  loading,
  index,
  isRTL,
}: {
  request: FollowRequest;
  onAccept: () => void;
  onDecline: () => void;
  loading: boolean;
  index: number;
  isRTL: boolean;
}) {
  const router = useRouter();
  const { t } = useTranslation();
  const tc = useThemeColors();
  const haptic = useContextualHaptic();
  const { follower } = request;

  return (
    <Animated.View entering={FadeInUp.delay(Math.min(index * 50, 300)).duration(400)}>
      <LinearGradient
        colors={colors.gradient.cardDark}
        style={[styles.row, { flexDirection: rtlFlexRow(isRTL) }]}
      >
        <Pressable accessibilityRole="button" onPress={() => router.push(`/(screens)/profile/${follower.username}`)}>
          <Avatar uri={follower.avatarUrl} name={follower.displayName} size="md" />
        </Pressable>

        <View style={styles.info}>
          <Pressable accessibilityRole="button" onPress={() => router.push(`/(screens)/profile/${follower.username}`)}>
            <Text style={[styles.name, { color: tc.text.primary }]}>{follower.displayName}</Text>
            <Text style={[styles.username, { color: tc.text.secondary }]}>@{follower.username}</Text>
            {follower.bio ? (
              <Text style={[styles.bio, { color: tc.text.secondary }]} numberOfLines={1}>{follower.bio}</Text>
            ) : null}
          </Pressable>
        </View>

        <View style={styles.actions}>
          {loading ? (
            <Skeleton.Circle size={32} />
          ) : (
            <>
              <Pressable accessibilityRole="button" accessibilityLabel={t('screens.followRequests.confirm')} onPress={() => { haptic.tick(); onAccept(); }} style={({ pressed }) => [pressed && { opacity: 0.7 }]}>
                <LinearGradient
                  colors={['rgba(10,123,79,0.4)', 'rgba(10,123,79,0.2)']}
                  style={styles.acceptBtn}
                >
                  <Text style={styles.acceptText}>{t('screens.followRequests.confirm')}</Text>
                </LinearGradient>
              </Pressable>
              <Pressable accessibilityRole="button" accessibilityLabel={t('common.delete')} onPress={() => { haptic.tick(); onDecline(); }} style={({ pressed }) => [pressed && { opacity: 0.7 }]}>
                <LinearGradient
                  colors={['rgba(248,81,73,0.2)', 'rgba(248,81,73,0.1)']}
                  style={styles.declineBtn}
                >
                  <Text style={styles.declineText}>{t('common.delete')}</Text>
                </LinearGradient>
              </Pressable>
            </>
          )}
        </View>
      </LinearGradient>
    </Animated.View>
  );
}

export default function FollowRequestsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();

  const requestsQuery = useQuery({
    queryKey: ['follow-requests'],
    queryFn: () => followsApi.getRequests(),
  });

  const requests: FollowRequest[] = requestsQuery.data?.data ?? [];

  const haptic = useContextualHaptic();

  const acceptMutation = useMutation({
    mutationFn: (id: string) => followsApi.acceptRequest(id),
    onSuccess: () => {
      haptic.success();
      showToast({ message: t('screens.followRequests.accepted'), variant: 'success' });
      queryClient.invalidateQueries({ queryKey: ['follow-requests'] });
    },
    onError: (err: Error) => {
      haptic.error();
      showToast({ message: err.message, variant: 'error' });
    },
  });

  const declineMutation = useMutation({
    mutationFn: (id: string) => followsApi.declineRequest(id),
    onSuccess: () => {
      haptic.success();
      showToast({ message: t('screens.followRequests.declined'), variant: 'success' });
      queryClient.invalidateQueries({ queryKey: ['follow-requests'] });
    },
    onError: (err: Error) => {
      haptic.error();
      showToast({ message: err.message, variant: 'error' });
    },
  });

  const tc = useThemeColors();
  const { t, isRTL } = useTranslation();

  const pendingId = acceptMutation.variables ?? declineMutation.variables;

  if (requestsQuery.isError) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: tc.bg }]} edges={['top']}>
        <GlassHeader title={t('screens.followRequests.title')} leftAction={{ icon: 'arrow-left', onPress: () => router.back(), accessibilityLabel: t('common.back') }} />
        <EmptyState
          icon="flag"
          title={t('screens.followRequests.errorTitle')}
          subtitle={t('screens.followRequests.errorSubtitle')}
          actionLabel={t('common.retry')}
          onAction={() => requestsQuery.refetch()}
        />
      </SafeAreaView>
    );
  }

  return (
    <ScreenErrorBoundary>
      <SafeAreaView style={[styles.container, { backgroundColor: tc.bg }]} edges={['top']}>
        <GlassHeader title={t('screens.followRequests.title')} leftAction={{ icon: 'arrow-left', onPress: () => router.back(), accessibilityLabel: t('common.back') }} />

        {requestsQuery.isLoading ? (
          <View style={[styles.skeletonList, { paddingTop: insets.top + 52 }]}>
            {Array.from({ length: 5 }).map((_, i) => (
              <View key={i} style={[styles.skeletonRow, { flexDirection: rtlFlexRow(isRTL) }]}>
                <Skeleton.Circle size={48} />
                <View style={{ flex: 1, gap: 6 }}>
                  <Skeleton.Rect width={120} height={14} />
                  <Skeleton.Rect width={80} height={11} />
                </View>
              </View>
            ))}
          </View>
        ) : (
          <FlatList
            removeClippedSubviews={true}
            data={requests}
            keyExtractor={(item) => item.id}
            contentContainerStyle={[styles.list, { paddingTop: insets.top + 52 }]}
            refreshControl={
              <BrandedRefreshControl refreshing={requestsQuery.isRefetching} onRefresh={() => requestsQuery.refetch()} />
            }
            renderItem={({ item, index }) => (
              <RequestRow
                request={item}
                index={index}
                isRTL={isRTL}
                loading={
                  (acceptMutation.isPending || declineMutation.isPending) && pendingId === item.id
                }
                onAccept={() => acceptMutation.mutate(item.id)}
                onDecline={() => declineMutation.mutate(item.id)}
              />
            )}
            ListEmptyComponent={() => (
              <EmptyState
                icon="user"
                title={t('screens.followRequests.emptyTitle')}
                subtitle={t('screens.followRequests.emptySubtitle')}
              />
            )}
          />
        )}
      </SafeAreaView>

    </ScreenErrorBoundary>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },

  list: { paddingBottom: 40, paddingHorizontal: spacing.base },
  skeletonList: { padding: spacing.base, gap: spacing.md },
  skeletonRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    paddingHorizontal: spacing.md, paddingVertical: spacing.md,
  },

  row: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: spacing.md, paddingVertical: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.active.white6,
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  info: { flex: 1 },
  name: { fontSize: fontSize.sm, fontFamily: fonts.bold },
  username: { fontSize: fontSize.xs, marginTop: 1 },
  bio: { fontSize: fontSize.xs, marginTop: 3 },

  actions: { alignItems: 'center', gap: spacing.xs },
  acceptBtn: {
    borderRadius: radius.md,
    paddingHorizontal: spacing.md, paddingVertical: spacing.xs + 1,
  },
  acceptText: { color: '#fff', fontSize: fontSize.sm, fontFamily: fonts.bold },
  declineBtn: {
    borderRadius: radius.md,
    paddingHorizontal: spacing.md, paddingVertical: spacing.xs + 1,
  },
  declineText: { color: colors.error, fontSize: fontSize.sm, fontFamily: fonts.semibold },

});
