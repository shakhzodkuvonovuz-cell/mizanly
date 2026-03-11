import { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, FlatList, RefreshControl,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useInfiniteQuery, useMutation, useQueryClient, InfiniteData } from '@tanstack/react-query';
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

function UserRow({ user, isMe, isFollowing, onToggleFollow, onPress }: {
  user: User;
  isMe: boolean;
  isFollowing: boolean;
  onToggleFollow: (userId: string, follow: boolean) => void;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity style={styles.row} onPress={onPress} activeOpacity={0.7}>
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
          label={isFollowing ? 'Following' : 'Follow'}
          onPress={() => onToggleFollow(user.id, !isFollowing)}
          variant={isFollowing ? 'secondary' : 'primary'}
          size="sm"
        />
      )}
    </TouchableOpacity>
  );
}

export default function MutualFollowersScreen() {
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
  const headerHeight = insets.top + 52;

  if (mutualFollowersQuery.isLoading && !mutualFollowersQuery.data) {
    return (
      <View style={styles.container}>
        <GlassHeader
          title="Followers you know"
          leftAction={{
            icon: 'arrow-left',
            onPress: () => router.back(),
            accessibilityLabel: 'Go back',
          }}
        />
        <View style={{ paddingTop: headerHeight }}>
          {renderSkeleton()}
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <GlassHeader
        title="Followers you know"
        leftAction={{
          icon: 'arrow-left',
          onPress: () => router.back(),
          accessibilityLabel: 'Go back',
        }}
      />

      {/* List */}
      <FlatList
        contentContainerStyle={{ paddingTop: headerHeight }}
        data={mutualFollowers}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <UserRow
            user={item}
            isMe={currentUserId === item.id}
            isFollowing={item.isFollowing ?? false}
            onToggleFollow={handleToggleFollow}
            onPress={() => router.push(`/(screens)/profile/${item.username}`)}
          />
        )}
        onEndReached={handleEndReached}
        onEndReachedThreshold={0.4}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.emerald} />
        }
        ListEmptyComponent={() =>
          mutualFollowersQuery.isLoading ? null : (
            <EmptyState
              icon="users"
              title="No shared connections yet"
              subtitle="When you and this person follow the same people, they will show up here"
              style={styles.emptyState}
            />
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
    borderBottomWidth: 0.5,
    borderBottomColor: colors.dark.border,
  },
  info: { flex: 1 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  name: { color: colors.text.primary, fontSize: fontSize.base, fontWeight: '600' },
  handle: { color: colors.text.secondary, fontSize: fontSize.sm, marginTop: 1 },
  skeletonList: { padding: spacing.base, gap: spacing.lg },
  skeletonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  emptyState: {
    marginTop: spacing['2xl'],
  },
});