import { useCallback, useState } from 'react';
import {
  View, Text, StyleSheet, Pressable,
  FlatList, Alert, RefreshControl,
} from 'react-native';
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
import { colors, spacing, fontSize, radius } from '@/theme';
import { followsApi } from '@/services/api';
import type { FollowRequest } from '@/types';
import { useTranslation } from '@/hooks/useTranslation';
import { ScreenErrorBoundary } from '@/components/ui/ScreenErrorBoundary';

function RequestRow({
  request,
  onAccept,
  onDecline,
  loading,
  index,
}: {
  request: FollowRequest;
  onAccept: () => void;
  onDecline: () => void;
  loading: boolean;
  index: number;
}) {
  const router = useRouter();
  const { t } = useTranslation();
  const { follower } = request;

  return (
    <Animated.View entering={FadeInUp.delay(index * 50).duration(400)}>
      <LinearGradient
        colors={['rgba(45,53,72,0.4)', 'rgba(28,35,51,0.2)']}
        style={styles.row}
      >
        <Pressable onPress={() => router.push(`/(screens)/profile/${follower.username}`)}>
          <Avatar uri={follower.avatarUrl} name={follower.displayName} size="md" />
        </Pressable>

        <View style={styles.info}>
          <Pressable onPress={() => router.push(`/(screens)/profile/${follower.username}`)}>
            <Text style={styles.name}>{follower.displayName}</Text>
            <Text style={styles.username}>@{follower.username}</Text>
            {follower.bio ? (
              <Text style={styles.bio} numberOfLines={1}>{follower.bio}</Text>
            ) : null}
          </Pressable>
        </View>

        <View style={styles.actions}>
          {loading ? (
            <Skeleton.Circle size={32} />
          ) : (
            <>
              <Pressable onPress={onAccept}>
                <LinearGradient
                  colors={['rgba(10,123,79,0.4)', 'rgba(10,123,79,0.2)']}
                  style={styles.acceptBtn}
                >
                  <Text style={styles.acceptText}>{t('screens.followRequests.confirm')}</Text>
                </LinearGradient>
              </Pressable>
              <Pressable onPress={onDecline}>
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
  const { t } = useTranslation();

  const requestsQuery = useQuery({
    queryKey: ['follow-requests'],
    queryFn: () => followsApi.getRequests(),
  });

  const requests: FollowRequest[] = requestsQuery.data?.data ?? [];

  const acceptMutation = useMutation({
    mutationFn: (id: string) => followsApi.acceptRequest(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['follow-requests'] }),
    onError: (err: Error) => Alert.alert(t('common.error'), err.message),
  });

  const declineMutation = useMutation({
    mutationFn: (id: string) => followsApi.declineRequest(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['follow-requests'] }),
    onError: (err: Error) => Alert.alert(t('common.error'), err.message),
  });

  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = async () => {
    setRefreshing(true);
    await requestsQuery.refetch();
    setRefreshing(false);
  };

  const pendingId = acceptMutation.variables ?? declineMutation.variables;

  if (requestsQuery.isError) {
    return (
      <View style={styles.container}>
        <GlassHeader title={t('screens.followRequests.title')} leftAction={{ icon: 'arrow-left', onPress: () => router.back(), accessibilityLabel: t('common.back') }} />
        <EmptyState
          icon="flag"
          title={t('screens.followRequests.errorTitle')}
          subtitle={t('screens.followRequests.errorSubtitle')}
          actionLabel={t('common.retry')}
          onAction={() => requestsQuery.refetch()}
        />
      </View>
    );
  }

  return (
    <ScreenErrorBoundary>
      <View style={styles.container}>
        <GlassHeader title={t('screens.followRequests.title')} leftAction={{ icon: 'arrow-left', onPress: () => router.back(), accessibilityLabel: t('common.back') }} />

        {requestsQuery.isLoading ? (
          <View style={[styles.skeletonList, { paddingTop: insets.top + 52 }]}>
            {Array.from({ length: 5 }).map((_, i) => (
              <View key={i} style={styles.skeletonRow}>
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
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.emerald} />
            }
            renderItem={({ item, index }) => (
              <RequestRow
                request={item}
                index={index}
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
      </View>
  
    </ScreenErrorBoundary>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.dark.bg },

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
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  info: { flex: 1 },
  name: { color: colors.text.primary, fontSize: fontSize.sm, fontWeight: '700' },
  username: { color: colors.text.secondary, fontSize: fontSize.xs, marginTop: 1 },
  bio: { color: colors.text.secondary, fontSize: fontSize.xs, marginTop: 3 },

  actions: { alignItems: 'center', gap: spacing.xs },
  acceptBtn: {
    borderRadius: radius.md,
    paddingHorizontal: spacing.md, paddingVertical: spacing.xs + 1,
  },
  acceptText: { color: '#fff', fontSize: fontSize.sm, fontWeight: '700' },
  declineBtn: {
    borderRadius: radius.md,
    paddingHorizontal: spacing.md, paddingVertical: spacing.xs + 1,
  },
  declineText: { color: colors.error, fontSize: fontSize.sm, fontWeight: '600' },

});
