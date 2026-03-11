import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, FlatList, Pressable,
  RefreshControl, Switch, TextInput,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useUser } from '@clerk/clerk-expo';
import { useQuery, useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Avatar } from '@/components/ui/Avatar';
import { Icon } from '@/components/ui/Icon';
import { GlassHeader } from '@/components/ui/GlassHeader';
import { VerifiedBadge } from '@/components/ui/VerifiedBadge';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { Badge } from '@/components/ui/Badge';
import { colors, spacing, fontSize, fonts, radius } from '@/theme';
import { followsApi, circlesApi } from '@/services/api';
import type { User, PaginatedResponse, Circle, CircleMember } from '@/types';

const CLOSE_FRIENDS_CIRCLE_NAME = 'Close Friends';

function UserRow({ user, isMe, isCloseFriend, onToggle, onPress, disabled }: {
  user: User;
  isMe: boolean;
  isCloseFriend: boolean;
  onToggle: (userId: string, newValue: boolean) => void;
  onPress: () => void;
  disabled: boolean;
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
        <View style={styles.actions}>
          {isCloseFriend && (
            <TouchableOpacity
              onPress={() => onToggle(user.id, false)}
              hitSlop={8}
              style={styles.removeBtn}
              disabled={disabled}
            >
              <Icon name="x" size="sm" color={disabled ? colors.text.tertiary : colors.error} />
            </TouchableOpacity>
          )}
          <Switch
            value={isCloseFriend}
            onValueChange={(value) => onToggle(user.id, value)}
            trackColor={{ false: colors.dark.border, true: colors.emerald }}
            thumbColor={isCloseFriend ? '#fff' : colors.text.secondary}
            ios_backgroundColor={colors.dark.border}
            disabled={disabled}
          />
        </View>
      )}
    </TouchableOpacity>
  );
}

export default function CloseFriendsScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user: clerkUser } = useUser();
  const currentUserId = clerkUser?.id;

  const [searchQuery, setSearchQuery] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const creationAttempted = useRef(false);

  // Fetch user's circles
  const circlesQuery = useQuery<Circle[]>({
    queryKey: ['my-circles'],
    queryFn: () => circlesApi.getMyCircles(),
    enabled: !!currentUserId,
  });

  // Find or create Close Friends circle
  const closeFriendsCircle = useMemo(() => {
    if (!circlesQuery.data) return null;
    return circlesQuery.data.find(c => c.name === CLOSE_FRIENDS_CIRCLE_NAME);
  }, [circlesQuery.data]);

  const createCircleMutation = useMutation({
    mutationFn: () => circlesApi.create(CLOSE_FRIENDS_CIRCLE_NAME),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-circles'] });
    },
  });

  // Ensure Close Friends circle exists
  useEffect(() => {
    if (
      circlesQuery.isSuccess &&
      !closeFriendsCircle &&
      !createCircleMutation.isPending &&
      currentUserId &&
      !creationAttempted.current
    ) {
      creationAttempted.current = true;
      createCircleMutation.mutate();
    }
  }, [circlesQuery.isSuccess, closeFriendsCircle, createCircleMutation, currentUserId]);

  // Fetch members of Close Friends circle
  const membersQuery = useQuery<CircleMember[]>({
    queryKey: ['circle-members', closeFriendsCircle?.id],
    queryFn: () => circlesApi.getMembers(closeFriendsCircle!.id),
    enabled: !!closeFriendsCircle,
  });

  const memberIds = useMemo(() =>
    membersQuery.data?.map(m => m.user.id) ?? [],
    [membersQuery.data]
  );

  // Fetch followers of current user
  const followersQuery = useInfiniteQuery<PaginatedResponse<User>>({
    queryKey: ['followers', currentUserId],
    queryFn: ({ pageParam }) => followsApi.getFollowers(currentUserId!, pageParam as string | undefined),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.meta.hasMore ? last.meta.cursor ?? undefined : undefined,
    enabled: !!currentUserId,
  });

  const followers: User[] = followersQuery.data?.pages.flatMap((p: PaginatedResponse<User>) => p.data) ?? [];

  // Toggle close friend status
  const toggleMemberMutation = useMutation({
    mutationFn: ({ userId, add }: { userId: string; add: boolean }) =>
      add
        ? circlesApi.addMembers(closeFriendsCircle!.id, [userId])
        : circlesApi.removeMembers(closeFriendsCircle!.id, [userId]),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['circle-members', closeFriendsCircle?.id] });
    },
  });

  const toggleCloseFriend = useCallback((userId: string, add: boolean) => {
    if (!closeFriendsCircle || toggleMemberMutation.isPending) return;
    toggleMemberMutation.mutate({ userId, add });
  }, [closeFriendsCircle, toggleMemberMutation]);

  // Filter followers based on search query
  const filteredFollowers = useMemo(() => {
    if (!searchQuery.trim()) return followers;
    const query = searchQuery.toLowerCase();
    return followers.filter(user =>
      user.displayName?.toLowerCase().includes(query) ||
      user.username?.toLowerCase().includes(query)
    );
  }, [followers, searchQuery]);

  // Separate close friends from others in filtered list
  const closeFriendsInList = useMemo(() =>
    filteredFollowers.filter(user => memberIds.includes(user.id)),
    [filteredFollowers, memberIds]
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([
      circlesQuery.refetch(),
      membersQuery.refetch(),
      followersQuery.refetch(),
    ]);
    setRefreshing(false);
  };

  const onEndReached = useCallback(() => {
    if (followersQuery.hasNextPage && !followersQuery.isFetchingNextPage) {
      followersQuery.fetchNextPage();
    }
  }, [followersQuery]);

  // Ready state: circle exists and members loaded
  const isReady = closeFriendsCircle && membersQuery.isSuccess;

  // Loading states
  const isLoading =
    circlesQuery.isLoading ||
    (closeFriendsCircle && membersQuery.isLoading) ||
    (followersQuery.isLoading && !followersQuery.data);

  const insets = useSafeAreaInsets();
  const headerHeight = insets.top + 52;

  if (isLoading) {
    return (
      <View style={styles.container}>
        <GlassHeader
          title="Close Friends"
          leftAction={{
            icon: 'arrow-left',
            onPress: () => router.back(),
            accessibilityLabel: 'Go back',
          }}
        />
        <View style={[styles.skeletonList, { paddingTop: headerHeight + spacing.base }]}>
          {Array.from({ length: 8 }).map((_, i) => (
            <View key={i} style={styles.skeletonRow}>
              <Skeleton.Circle size={40} />
              <View style={{ flex: 1, gap: 6 }}>
                <Skeleton.Rect width={130} height={14} />
                <Skeleton.Rect width={90} height={11} />
              </View>
              <Skeleton.Rect width={50} height={30} borderRadius={radius.full} />
            </View>
          ))}
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <GlassHeader
        leftAction={{
          icon: 'arrow-left',
          onPress: () => router.back(),
          accessibilityLabel: 'Go back',
        }}
        titleComponent={
          <View style={styles.headerTitleRow}>
            <Text style={styles.headerTitle}>Close Friends</Text>
            <Badge count={memberIds.length} color={colors.emerald} size="sm" />
          </View>
        }
      />

      {/* Search Bar */}
      <View style={[styles.searchContainer, { marginTop: headerHeight + spacing.md }]}>
        <Icon name="search" size="sm" color={colors.text.secondary} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search followers..."
          placeholderTextColor={colors.text.tertiary}
          value={searchQuery}
          onChangeText={setSearchQuery}
          autoCapitalize="none"
          autoCorrect={false}
        />
        {searchQuery.length > 0 && (
          <Pressable onPress={() => setSearchQuery('')} hitSlop={8}>
            <Icon name="x" size="sm" color={colors.text.secondary} />
          </Pressable>
        )}
      </View>

      {/* Stats bar */}
      <View style={styles.statsBar}>
        <Text style={styles.statsText}>
          {closeFriendsInList.length} of {filteredFollowers.length} shown
        </Text>
        <Text style={styles.statsText}>
          {memberIds.length} total close friends
        </Text>
      </View>

      {/* List */}
      <FlatList
        data={filteredFollowers}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <UserRow
            user={item}
            isMe={clerkUser?.id === item.id}
            isCloseFriend={memberIds.includes(item.id)}
            onToggle={toggleCloseFriend}
            onPress={() => router.push(`/(screens)/profile/${item.username}`)}
            disabled={!isReady || toggleMemberMutation.isPending}
          />
        )}
        onEndReached={onEndReached}
        onEndReachedThreshold={0.4}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.emerald} />
        }
        ListEmptyComponent={() =>
          followersQuery.isLoading ? null : (
            <EmptyState
              icon="users"
              title={searchQuery ? "No one matches your search" : "Your inner circle starts here"}
              subtitle={searchQuery ? "Try searching by name or username" : "Once people follow you, you can add your closest friends to this special list"}
            />
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
                <Skeleton.Rect width={50} height={30} borderRadius={radius.full} />
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
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  headerTitle: {
    color: colors.text.primary,
    fontSize: fontSize.md,
    fontFamily: fonts.bodySemiBold,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.dark.bgElevated,
    borderRadius: radius.md,
    marginHorizontal: spacing.base,
    marginVertical: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
  },
  searchInput: {
    flex: 1,
    color: colors.text.primary,
    fontSize: fontSize.base,
    paddingVertical: 0,
  },
  statsBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.base,
    marginBottom: spacing.sm,
  },
  statsText: {
    color: colors.text.secondary,
    fontSize: fontSize.sm,
  },
  skeletonList: { padding: spacing.base, gap: spacing.lg },
  skeletonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.dark.border,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  removeBtn: {
    padding: spacing.xs,
  },
  info: { flex: 1 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  name: { color: colors.text.primary, fontSize: fontSize.base, fontWeight: '600' },
  handle: { color: colors.text.secondary, fontSize: fontSize.sm, marginTop: 1 },
});