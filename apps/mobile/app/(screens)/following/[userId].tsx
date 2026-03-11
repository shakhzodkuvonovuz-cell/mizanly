import { useCallback, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  FlatList, RefreshControl,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useUser } from '@clerk/clerk-expo';
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

function UserRow({ user, isMe, onPress, onFollow }: {
  user: User;
  isMe: boolean;
  onPress: () => void;
  onFollow: () => void;
}) {
  return (
    <TouchableOpacity style={styles.row} onPress={onPress} activeOpacity={0.7} accessibilityLabel={`View ${user.displayName}'s profile`} accessibilityRole="link">
      <Avatar uri={user.avatarUrl} name={user.displayName} size="md" />
      <View style={styles.info}>
        <View style={styles.nameRow}>
          <Text style={styles.name}>{user.displayName}</Text>
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
    </TouchableOpacity>
  );
}

export default function FollowingScreen() {
  const { userId } = useLocalSearchParams<{ userId: string }>();
  const router = useRouter();
  const { user: clerkUser } = useUser();
  const queryClient = useQueryClient();

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
      queryClient.invalidateQueries({ queryKey: ['following', userId] });
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

  if (followingQuery.isError) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <GlassHeader
          title="Following"
          leftAction={{ icon: 'arrow-left', onPress: () => router.back(), accessibilityLabel: 'Go back' }}
        />
        <EmptyState
          icon="flag"
          title="Couldn't load content"
          subtitle="Check your connection and try again"
          actionLabel="Retry"
          onAction={() => followingQuery.refetch()}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <GlassHeader
        title="Following"
        leftAction={{ icon: 'arrow-left', onPress: () => router.back(), accessibilityLabel: 'Go back' }}
      />

      <FlatList
        removeClippedSubviews={true}
        data={following}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <UserRow
            user={item}
            isMe={clerkUser?.id === item.id}
            onPress={() => router.push(`/(screens)/profile/${item.username}`)}
            onFollow={() => followMutation.mutate(item)}
          />
        )}
        onEndReached={onEndReached}
        onEndReachedThreshold={0.4}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.emerald} />
        }
        ListEmptyComponent={() =>
          followingQuery.isLoading ? (
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
            <EmptyState icon="users" title="Not following anyone yet" subtitle="Explore and follow people who inspire you" />
          )
        }
        ListFooterComponent={() =>
          followingQuery.isFetchingNextPage ? (
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
  skeletonList: { padding: spacing.base, gap: spacing.lg },
  skeletonRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },

  row: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    paddingHorizontal: spacing.base, paddingVertical: spacing.md,
    borderBottomWidth: 0.5, borderBottomColor: colors.dark.border,
  },
  info: { flex: 1 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  name: { color: colors.text.primary, fontSize: fontSize.base, fontWeight: '600' },
  handle: { color: colors.text.secondary, fontSize: fontSize.sm, marginTop: 1 },

});
