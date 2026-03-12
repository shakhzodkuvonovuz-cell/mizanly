import { useCallback, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  FlatList, RefreshControl,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useUser } from '@clerk/clerk-expo';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { Avatar } from '@/components/ui/Avatar';
import { Icon } from '@/components/ui/Icon';
import { VerifiedBadge } from '@/components/ui/VerifiedBadge';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { GlassHeader } from '@/components/ui/GlassHeader';
import { GradientButton } from '@/components/ui/GradientButton';
import { colors, spacing, fontSize, radius } from '@/theme';
import { followsApi } from '@/services/api';
import type { User, PaginatedResponse } from '@/types';

function UserRow({ user, isMe, onPress, onFollow, index = 0 }: {
  user: User;
  isMe: boolean;
  onPress: () => void;
  onFollow: () => void;
  index?: number;
}) {
  return (
    <Animated.View entering={FadeInUp.delay(index * 20).duration(300)}>
      <TouchableOpacity onPress={onPress} activeOpacity={0.8} accessibilityLabel={`View ${user.displayName}'s profile`} accessibilityRole="link">
        <LinearGradient
          colors={user.isFollowing ? ['rgba(10,123,79,0.08)', 'rgba(10,123,79,0.02)'] : ['rgba(45,53,72,0.3)', 'rgba(28,35,51,0.15)']}
          style={styles.row}
        >
          <Avatar uri={user.avatarUrl} name={user.displayName} size="md" showRing={user.isFollowing} ringColor={colors.emerald} />
          <View style={styles.info}>
            <View style={styles.nameRow}>
              <Text style={[styles.name, user.isFollowing && styles.nameFollowing]}>{user.displayName}</Text>
              {user.isVerified && <VerifiedBadge size={13} />}
            </View>
            <Text style={styles.handle}>@{user.username}</Text>
          </View>
          {!isMe && (
            <GradientButton
              label={user.isFollowing ? 'Following' : 'Follow'}
              variant={user.isFollowing ? 'secondary' : 'primary'}
              size="sm"
              onPress={onFollow}
            />
          )}
        </LinearGradient>
      </TouchableOpacity>
    </Animated.View>
  );
}

export default function FollowersScreen() {
  const { userId } = useLocalSearchParams<{ userId: string }>();
  const router = useRouter();
  const { user: clerkUser } = useUser();
  const queryClient = useQueryClient();

  const followersQuery = useInfiniteQuery({
    queryKey: ['followers', userId],
    queryFn: ({ pageParam }) => followsApi.getFollowers(userId, pageParam as string | undefined),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last: PaginatedResponse<User>) => last.meta?.hasMore ? last.meta.cursor ?? undefined : undefined,
  });

  const followers: User[] = followersQuery.data?.pages.flatMap((p: PaginatedResponse<User>) => p.data) ?? [];

  const followMutation = useMutation({
    mutationFn: (user: User) =>
      user.isFollowing ? followsApi.unfollow(user.id) : followsApi.follow(user.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['followers', userId] });
    },
  });

  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = async () => {
    setRefreshing(true);
    await followersQuery.refetch();
    setRefreshing(false);
  };

  const onEndReached = useCallback(() => {
    if (followersQuery.hasNextPage && !followersQuery.isFetchingNextPage) {
      followersQuery.fetchNextPage();
    }
  }, [followersQuery]);

  if (followersQuery.isError) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <GlassHeader
          title="Followers"
          leftAction={{ icon: 'arrow-left', onPress: () => router.back() }}
        />
        <EmptyState
          icon="flag"
          title="Couldn't load content"
          subtitle="Check your connection and try again"
          actionLabel="Retry"
          onAction={() => followersQuery.refetch()}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <GlassHeader
        title="Followers"
        leftAction={{ icon: 'arrow-left', onPress: () => router.back() }}
      />

      <FlatList
        removeClippedSubviews={true}
        data={followers}
        keyExtractor={(item) => item.id}
        renderItem={({ item, index }) => (
          <UserRow
            user={item}
            isMe={clerkUser?.id === item.id}
            onPress={() => router.push(`/(screens)/profile/${item.username}`)}
            onFollow={() => followMutation.mutate(item)}
            index={index}
          />
        )}
        onEndReached={onEndReached}
        onEndReachedThreshold={0.4}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.emerald} />
        }
        ListEmptyComponent={() =>
          followersQuery.isLoading ? (
            <View style={styles.skeletonList}>
              {Array.from({ length: 8 }).map((_, i) => (
                <View key={i} style={styles.skeletonRow}>
                  <Skeleton.Circle size={40} />
                  <View style={{ flex: 1, gap: 6 }}>
                    <Skeleton.Rect width={130} height={14} />
                    <Skeleton.Rect width={90} height={11} />
                  </View>
                </View>
              ))}
            </View>
          ) : (
            <EmptyState icon="users" title="No followers yet" subtitle="Share your profile to grow your community" />
          )
        }
        ListFooterComponent={() =>
          followersQuery.isFetchingNextPage ? (
            <View style={styles.skeletonList}>
              <View style={styles.skeletonRow}>
                <Skeleton.Circle size={40} />
                <View style={{ flex: 1, gap: 6 }}>
                  <Skeleton.Rect width={130} height={14} />
                  <Skeleton.Rect width={90} height={11} />
                </View>
              </View>
            </View>
          ) : null
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.dark.bg },
  skeletonList: { padding: spacing.base, gap: spacing.md },
  skeletonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.dark.bgCard,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 0.5,
    borderColor: 'rgba(255,255,255,0.06)',
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
    borderColor: 'rgba(255,255,255,0.06)',
  },
  info: { flex: 1 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  name: { color: colors.text.primary, fontSize: fontSize.base, fontWeight: '600' },
  nameFollowing: { color: colors.emerald },
  handle: { color: colors.text.secondary, fontSize: fontSize.sm, marginTop: 1 },

});
