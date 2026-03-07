import { useCallback, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  FlatList, Pressable, RefreshControl,
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
import { colors, spacing, fontSize, radius } from '@/theme';
import { followsApi } from '@/services/api';
import type { User } from '@/types';

function UserRow({ user, isMe, onPress, onFollow }: {
  user: User;
  isMe: boolean;
  onPress: () => void;
  onFollow: () => void;
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
        <TouchableOpacity
          style={[styles.followBtn, user.isFollowing && styles.followingBtn]}
          onPress={onFollow}
          hitSlop={8}
        >
          <Text style={[styles.followBtnText, user.isFollowing && styles.followingBtnText]}>
            {user.isFollowing ? 'Following' : 'Follow'}
          </Text>
        </TouchableOpacity>
      )}
    </TouchableOpacity>
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
    getNextPageParam: (last: any) => last.meta?.hasMore ? last.meta.cursor ?? undefined : undefined,
  });

  const followers: User[] = followersQuery.data?.pages.flatMap((p: any) => p.data) ?? [];

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

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={8} style={styles.backBtn}>
          <Icon name="arrow-left" size="md" color={colors.text.primary} />
        </Pressable>
        <Text style={styles.headerTitle}>Followers</Text>
        <View style={{ width: 36 }} />
      </View>

      <FlatList
        data={followers}
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
            <EmptyState icon="users" title="No followers yet" />
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
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.base, paddingVertical: spacing.sm,
    borderBottomWidth: 0.5, borderBottomColor: colors.dark.border,
  },
  backBtn: { width: 36 },
  headerTitle: { color: colors.text.primary, fontSize: fontSize.base, fontWeight: '700' },

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

  followBtn: {
    borderWidth: 1, borderColor: colors.dark.border, borderRadius: radius.full,
    paddingHorizontal: spacing.md, paddingVertical: 6,
  },
  followingBtn: { backgroundColor: colors.emerald, borderColor: colors.emerald },
  followBtnText: { color: colors.text.primary, fontSize: fontSize.sm, fontWeight: '600' },
  followingBtnText: { color: '#fff' },
});
