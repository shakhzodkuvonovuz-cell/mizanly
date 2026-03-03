import { useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ActivityIndicator, FlatList,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useUser } from '@clerk/clerk-expo';
import { Avatar } from '@/components/ui/Avatar';
import { colors, spacing, fontSize } from '@/theme';
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
          {user.isVerified && <Text style={styles.verified}>✓</Text>}
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

  const onEndReached = useCallback(() => {
    if (followersQuery.hasNextPage && !followersQuery.isFetchingNextPage) {
      followersQuery.fetchNextPage();
    }
  }, [followersQuery]);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={8} style={styles.backBtn}>
          <Text style={styles.backIcon}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Followers</Text>
        <View style={{ width: 36 }} />
      </View>

      {followersQuery.isLoading ? (
        <ActivityIndicator color={colors.emerald} style={styles.loader} />
      ) : (
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
          ListEmptyComponent={() => (
            <View style={styles.empty}>
              <Text style={styles.emptyText}>No followers yet</Text>
            </View>
          )}
          ListFooterComponent={() =>
            followersQuery.isFetchingNextPage ? (
              <ActivityIndicator color={colors.emerald} style={styles.footer} />
            ) : null
          }
        />
      )}
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
  backIcon: { color: colors.text.primary, fontSize: 22 },
  headerTitle: { color: colors.text.primary, fontSize: fontSize.base, fontWeight: '700' },
  loader: { marginTop: 60 },

  row: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    paddingHorizontal: spacing.base, paddingVertical: spacing.md,
    borderBottomWidth: 0.5, borderBottomColor: colors.dark.border,
  },
  info: { flex: 1 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  name: { color: colors.text.primary, fontSize: fontSize.base, fontWeight: '600' },
  verified: { color: colors.emerald, fontSize: fontSize.xs },
  handle: { color: colors.text.secondary, fontSize: fontSize.sm, marginTop: 1 },

  followBtn: {
    borderWidth: 1, borderColor: colors.dark.border, borderRadius: 20,
    paddingHorizontal: spacing.md, paddingVertical: 6,
  },
  followingBtn: { backgroundColor: colors.emerald, borderColor: colors.emerald },
  followBtnText: { color: colors.text.primary, fontSize: fontSize.sm, fontWeight: '600' },
  followingBtnText: { color: '#fff' },

  empty: { alignItems: 'center', paddingTop: 80 },
  emptyText: { color: colors.text.secondary, fontSize: fontSize.base },
  footer: { paddingVertical: spacing.xl },
});
