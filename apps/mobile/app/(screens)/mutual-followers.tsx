import { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, Pressable, FlatList, RefreshControl,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useInfiniteQuery, useMutation, useQueryClient, InfiniteData } from '@tanstack/react-query';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { Avatar } from '@/components/ui/Avatar';
import { Icon } from '@/components/ui/Icon';
import { GlassHeader } from '@/components/ui/GlassHeader';
import { GradientButton } from '@/components/ui/GradientButton';
import { VerifiedBadge } from '@/components/ui/VerifiedBadge';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { colors, spacing, fontSize, radius } from '@/theme';
import { usersApi, followsApi } from '@/services/api';
import type { User, PaginatedResponse } from '@/types';
import { useStore } from '@/store';
import { useTranslation } from '@/hooks/useTranslation';
import { useThemeColors } from '@/hooks/useThemeColors';
import { ScreenErrorBoundary } from '@/components/ui/ScreenErrorBoundary';

function UserRow({ user, isMe, isFollowing, onToggleFollow, onPress, index }: {
  user: User;
  isMe: boolean;
  isFollowing: boolean;
  onToggleFollow: (userId: string, follow: boolean) => void;
  onPress: () => void;
  index: number;
}) {
  const { t } = useTranslation();
  return (
    <Animated.View entering={FadeInUp.delay(index * 50).duration(400)}>
      <Pressable accessibilityRole="button" onPress={onPress}>
        <LinearGradient
          colors={['rgba(45,53,72,0.4)', 'rgba(28,35,51,0.2)']}
          style={styles.row}
        >
          <LinearGradient
            colors={['rgba(10,123,79,0.2)', 'rgba(200,150,62,0.1)']}
            style={styles.iconBg}
          >
            <Icon name="user" size="sm" color={colors.emerald} />
          </LinearGradient>
          <View style={styles.info}>
            <View style={styles.nameRow}>
              <Text style={styles.name}>{user.displayName}</Text>
              {user.isVerified && <VerifiedBadge size={13} />}
            </View>
            <Text style={styles.handle}>@{user.username}</Text>
          </View>
          {!isMe && (
            <GradientButton
              label={isFollowing ? t('common.following') : t('common.follow')}
              onPress={() => onToggleFollow(user.id, !isFollowing)}
              variant={isFollowing ? 'secondary' : 'primary'}
              size="sm"
            />
          )}
        </LinearGradient>
      </Pressable>
    </Animated.View>
  );
}

export default function MutualFollowersScreen() {
  const { t, isRTL } = useTranslation();
  const router = useRouter();
  const { username } = useLocalSearchParams<{ username: string }>();
  const queryClient = useQueryClient();
  const user = useStore((s) => s.user);
  const currentUserId = user?.id;

  const targetUsername = Array.isArray(username) ? username[0] : username;
  const [refreshing, setRefreshing] = useState(false);

  // Fetch mutual followers
  const mutualFollowersQuery = useInfiniteQuery<PaginatedResponse<User>>({
    queryKey: ['mutual-followers', targetUsername],
    queryFn: ({ pageParam }) =>
      usersApi.getMutualFollowers(targetUsername, pageParam as string | undefined),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.meta.hasMore ? last.meta.cursor ?? undefined : undefined,
    enabled: !!targetUsername,
  });

  const mutualFollowers: User[] =
    mutualFollowersQuery.data?.pages.flatMap((p: PaginatedResponse<User>) => p.data) ?? [];

  // Follow/unfollow mutation
  const followMutation = useMutation({
    mutationFn: (targetUserId: string) => followsApi.follow(targetUserId),
    onSuccess: (_, targetUserId) => {
      // Update cached mutual followers list optimistically
      queryClient.setQueryData<InfiniteData<PaginatedResponse<User>>>(
        ['mutual-followers', targetUsername],
        (old) => {
          if (!old) return old;
          return {
            ...old,
            pages: old.pages.map(page => ({
              ...page,
              data: page.data.map(user =>
                user.id === targetUserId ? { ...user, isFollowing: true } : user
              ),
            })),
          };
        }
      );
    },
  });

  const unfollowMutation = useMutation({
    mutationFn: (targetUserId: string) => followsApi.unfollow(targetUserId),
    onSuccess: (_, targetUserId) => {
      queryClient.setQueryData<InfiniteData<PaginatedResponse<User>>>(
        ['mutual-followers', targetUsername],
        (old) => {
          if (!old) return old;
          return {
            ...old,
            pages: old.pages.map(page => ({
              ...page,
              data: page.data.map(user =>
                user.id === targetUserId ? { ...user, isFollowing: false } : user
              ),
            })),
          };
        }
      );
    },
  });

  const handleToggleFollow = useCallback((userId: string, follow: boolean) => {
    if (follow) {
      followMutation.mutate(userId);
    } else {
      unfollowMutation.mutate(userId);
    }
  }, [followMutation, unfollowMutation]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await mutualFollowersQuery.refetch();
    setRefreshing(false);
  }, [mutualFollowersQuery]);

  const handleEndReached = useCallback(() => {
    if (mutualFollowersQuery.hasNextPage && !mutualFollowersQuery.isFetchingNextPage) {
      mutualFollowersQuery.fetchNextPage();
    }
  }, [mutualFollowersQuery]);

  const renderSkeleton = useCallback(() => (
    <View style={styles.skeletonList}>
      {Array.from({ length: 8 }).map((_, i) => (
        <View key={i} style={styles.skeletonRow}>
          <Skeleton.Circle size={40} />
          <View style={{ flex: 1, gap: 6 }}>
            <Skeleton.Rect width={130} height={14} />
            <Skeleton.Rect width={90} height={11} />
          </View>
          <Skeleton.Rect width={70} height={30} borderRadius={radius.full} />
        </View>
      ))}
    </View>
  ), []);

  const insets = useSafeAreaInsets();
  const tc = useThemeColors();
  const headerHeight = insets.top + 52;

  if (mutualFollowersQuery.isError) {
    return (
      <View style={[styles.container, { backgroundColor: tc.bg }]}>
        <GlassHeader
          title={t('screens.mutual-followers.title')}
          leftAction={{
            icon: 'arrow-left',
            onPress: () => router.back(),
            accessibilityLabel: t('accessibility.goBack'),
          }}
        />
        <View style={{ paddingTop: headerHeight, flex: 1, justifyContent: 'center' }}>
          <EmptyState
            icon="flag"
            title={t('screens.mutual-followers.errorTitle')}
            subtitle={t('screens.mutual-followers.errorSubtitle')}
            actionLabel={t('common.retry')}
            onAction={() => mutualFollowersQuery.refetch()}
          />
        </View>
      </View>
    );
  }

  if (mutualFollowersQuery.isLoading && !mutualFollowersQuery.data) {
    return (
      <View style={[styles.container, { backgroundColor: tc.bg }]}>
        <GlassHeader
          title={t('screens.mutual-followers.title')}
          leftAction={{
            icon: 'arrow-left',
            onPress: () => router.back(),
            accessibilityLabel: t('accessibility.goBack'),
          }}
        />
        <View style={{ paddingTop: headerHeight }}>
          {renderSkeleton()}
        </View>
      </View>
    );
  }

  return (
    <ScreenErrorBoundary>
      <View style={[styles.container, { backgroundColor: tc.bg }]}>
        <GlassHeader
          title={t('screens.mutual-followers.title')}
          leftAction={{
            icon: 'arrow-left',
            onPress: () => router.back(),
            accessibilityLabel: t('accessibility.goBack'),
          }}
        />

        {/* List */}
        <FlatList
            removeClippedSubviews={true}
          contentContainerStyle={{ paddingTop: headerHeight }}
          data={mutualFollowers}
          keyExtractor={(item) => item.id}
          renderItem={({ item, index }) => (
            <UserRow
              user={item}
              isMe={currentUserId === item.id}
              isFollowing={item.isFollowing ?? false}
              onToggleFollow={handleToggleFollow}
              onPress={() => router.push(`/(screens)/profile/${item.username}`)}
              index={index}
            />
          )}
          onEndReached={handleEndReached}
          onEndReachedThreshold={0.4}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.emerald} />
          }
          ListEmptyComponent={() =>
            mutualFollowersQuery.isLoading ? null : (
              <View style={styles.emptyState}>
                <EmptyState
                  icon="users"
                  title={t('screens.mutual-followers.emptyTitle')}
                  subtitle={t('screens.mutual-followers.emptySubtitle')}
                />
              </View>
            )
          }
          ListFooterComponent={() =>
            mutualFollowersQuery.isFetchingNextPage ? (
              <View style={styles.skeletonList}>
                <View style={styles.skeletonRow}>
                  <Skeleton.Circle size={40} />
                  <View style={{ flex: 1, gap: 6 }}>
                    <Skeleton.Rect width={130} height={14} />
                    <Skeleton.Rect width={90} height={11} />
                  </View>
                  <Skeleton.Rect width={70} height={30} borderRadius={radius.full} />
                </View>
              </View>
            ) : null
          }
        />
      </View>
  
    </ScreenErrorBoundary>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.dark.bg },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    marginBottom: spacing.sm,
  },
  iconBg: {
    width: 40,
    height: 40,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  info: { flex: 1 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  name: { color: colors.text.primary, fontSize: fontSize.base, fontWeight: '600' },
  handle: { color: colors.text.secondary, fontSize: fontSize.sm, marginTop: 1 },
  skeletonList: { padding: spacing.base, gap: spacing.lg, paddingTop: spacing.lg },
  skeletonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  emptyState: {
    marginTop: spacing['2xl'],
  },
});