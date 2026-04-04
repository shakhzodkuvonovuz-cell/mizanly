import { useCallback, useState, useMemo } from 'react';
import {
  View, Text, StyleSheet, Pressable,
  FlatList,
} from 'react-native';
import { BrandedRefreshControl } from '@/components/ui/BrandedRefreshControl';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useUser } from '@clerk/clerk-expo';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { Avatar } from '@/components/ui/Avatar';
import { VerifiedBadge } from '@/components/ui/VerifiedBadge';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { GlassHeader } from '@/components/ui/GlassHeader';
import { GradientButton } from '@/components/ui/GradientButton';
import { colors, spacing, fontSize, radius, fonts } from '@/theme';
import { followsApi } from '@/services/api';
import { useTranslation } from '@/hooks/useTranslation';
import { useThemeColors } from '@/hooks/useThemeColors';
import { useContextualHaptic } from '@/hooks/useContextualHaptic';
import { showToast } from '@/components/ui/Toast';
import type { User, PaginatedResponse } from '@/types';
import { ScreenErrorBoundary } from '@/components/ui/ScreenErrorBoundary';

function UserRow({ user, isMe, onPress, onFollow, index = 0 }: {
  user: User;
  isMe: boolean;
  onPress: () => void;
  onFollow: () => void;
  index?: number;
}) {
  const { t } = useTranslation();
  const tc = useThemeColors();

  return (
    <Animated.View entering={FadeInUp.delay(Math.min(index, 15) * 20).duration(300)}>
      <Pressable onPress={onPress} accessibilityLabel={t('screens.following.viewProfile', { name: user.displayName })} accessibilityRole="link">
        <LinearGradient
          colors={user.isFollowing ? ['rgba(10,123,79,0.08)', 'rgba(10,123,79,0.02)'] : ['rgba(45,53,72,0.3)', 'rgba(28,35,51,0.15)']}
          style={styles.row}
        >
          <Avatar uri={user.avatarUrl} name={user.displayName} size="md" showRing={user.isFollowing} ringColor={colors.emerald} />
          <View style={styles.info}>
            <View style={styles.nameRow}>
              <Text style={[styles.name, { color: tc.text.primary }, user.isFollowing && styles.nameFollowing]}>{user.displayName}</Text>
              {user.isVerified && <VerifiedBadge size={13} />}
            </View>
            <Text style={[styles.handle, { color: tc.text.secondary }]}>@{user.username}</Text>
          </View>
          {!isMe && (
            <GradientButton
              label={user.isFollowing ? t('profile.following') : t('common.follow')}
              variant={user.isFollowing ? 'secondary' : 'primary'}
              size="sm"
              onPress={onFollow}
            />
          )}
        </LinearGradient>
      </Pressable>
    </Animated.View>
  );
}

export default function FollowingScreen() {
  const { userId } = useLocalSearchParams<{ userId: string }>();
  const router = useRouter();
  const { user: clerkUser } = useUser();
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  const tc = useThemeColors();
  const haptic = useContextualHaptic();

  const followingQuery = useInfiniteQuery({
    queryKey: ['following', userId],
    queryFn: ({ pageParam }) => followsApi.getFollowing(userId, pageParam as string | undefined),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last: PaginatedResponse<User>) => last.meta?.hasMore ? last.meta.cursor ?? undefined : undefined,
  });

  const following: User[] = followingQuery.data?.pages.flatMap((p: PaginatedResponse<User>) => p.data) ?? [];

  const followMutation = useMutation({
    mutationFn: (user: User) =>
      user.isFollowing ? followsApi.unfollow(user.id) : followsApi.follow(user.id),
    onSuccess: () => {
      haptic.success();
      queryClient.invalidateQueries({ queryKey: ['following', userId] });
      queryClient.invalidateQueries({ queryKey: ['profile', userId] });
    },
    onError: () => {
      haptic.error();
      showToast({ message: t('common.somethingWentWrong'), variant: 'error' });
    },
  });

  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = async () => {
    setRefreshing(true);
    await followingQuery.refetch();
    setRefreshing(false);
  };

  const onEndReached = useCallback(() => {
    if (followingQuery.hasNextPage && !followingQuery.isFetchingNextPage) {
      followingQuery.fetchNextPage();
    }
  }, [followingQuery]);

  return (
    <ScreenErrorBoundary>
      {followingQuery.isError ? (
        <SafeAreaView style={[styles.container, { backgroundColor: tc.bg }]} edges={['top']}>
          <GlassHeader
            title={t('profile.following')}
            leftAction={{ icon: 'arrow-left', onPress: () => router.back(), accessibilityLabel: t('saf.goBack') }}
          />
          <EmptyState
            icon="flag"
            title={t('saf.couldNotLoadContent')}
            subtitle={t('common.networkError')}
            actionLabel={t('common.retry')}
            onAction={() => followingQuery.refetch()}
          />
        </SafeAreaView>
      ) :
      <SafeAreaView style={[styles.container, { backgroundColor: tc.bg }]} edges={['top', 'bottom']}>
        <GlassHeader
          title={t('profile.following')}
          leftAction={{ icon: 'arrow-left', onPress: () => router.back(), accessibilityLabel: t('saf.goBack') }}
        />

        <FlatList
          removeClippedSubviews={true}
          data={following}
          keyExtractor={(item) => item.id}
          renderItem={useCallback(({ item, index }) => (
            <UserRow
              user={item}
              isMe={clerkUser?.id === item.id}
              onPress={() => router.push(`/(screens)/profile/${item.username}`)}
              onFollow={() => !followMutation.isPending && followMutation.mutate(item)}
              index={index}
            />
          ), [])}
          onEndReached={onEndReached}
          onEndReachedThreshold={0.4}
          refreshControl={
            <BrandedRefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
          ListEmptyComponent={useMemo(() =>
            followingQuery.isLoading ? (
              <View style={styles.skeletonList}>
                {Array.from({ length: 8 }).map((_, i) => (
                  <View key={i} style={[styles.skeletonRow, { backgroundColor: tc.bgCard, borderColor: tc.border }]}>
                    <Skeleton.Circle size={40} />
                    <View style={{ flex: 1, gap: 6 }}>
                      <Skeleton.Rect width={130} height={14} />
                      <Skeleton.Rect width={90} height={11} />
                    </View>
                  </View>
                ))}
              </View>
            ) : (
              <EmptyState icon="users" title={t('screens.following.emptyState')} subtitle={t('screens.following.emptySubtitle')} />
            )
          , [])}
          ListFooterComponent={useMemo(() =>
            followingQuery.isFetchingNextPage ? (
              <View style={styles.skeletonList}>
                <View style={[styles.skeletonRow, { backgroundColor: tc.bgCard, borderColor: tc.border }]}>
                  <Skeleton.Circle size={40} />
                  <View style={{ flex: 1, gap: 6 }}>
                    <Skeleton.Rect width={130} height={14} />
                    <Skeleton.Rect width={90} height={11} />
                  </View>
                </View>
              </View>
            ) : null
          , [])}
        />
      </SafeAreaView>}
    </ScreenErrorBoundary>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  skeletonList: { padding: spacing.base, gap: spacing.md },
  skeletonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 0.5,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    marginHorizontal: spacing.base,
    marginBottom: spacing.sm,
    borderRadius: radius.lg,
    borderWidth: 0.5,
  },
  info: { flex: 1 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  name: { fontSize: fontSize.base, fontFamily: fonts.bodySemiBold },
  nameFollowing: { color: colors.emerald },
  handle: { fontSize: fontSize.sm, marginTop: 1 },
});
