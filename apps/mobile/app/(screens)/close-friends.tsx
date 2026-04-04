import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  View, Text, StyleSheet, FlatList, Pressable,
  Switch, TextInput,
} from 'react-native';
import { BrandedRefreshControl } from '@/components/ui/BrandedRefreshControl';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useUser } from '@clerk/clerk-expo';
import { useQuery, useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { Avatar } from '@/components/ui/Avatar';
import { Icon } from '@/components/ui/Icon';
import { GlassHeader } from '@/components/ui/GlassHeader';
import { VerifiedBadge } from '@/components/ui/VerifiedBadge';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { Badge } from '@/components/ui/Badge';
import { colors, spacing, fontSize, fonts, radius } from '@/theme';
import { followsApi, circlesApi, usersApi } from '@/services/api';
import type { User, PaginatedResponse, Circle, CircleMember } from '@/types';
import { showToast } from '@/components/ui/Toast';
import { useTranslation } from '@/hooks/useTranslation';
import { useThemeColors } from '@/hooks/useThemeColors';
import { useContextualHaptic } from '@/hooks/useContextualHaptic';
import { ScreenErrorBoundary } from '@/components/ui/ScreenErrorBoundary';

const CLOSE_FRIENDS_CIRCLE_NAME = 'Close Friends';

function UserRow({ user, isMe, isCloseFriend, onToggle, onPress, disabled, index = 0 }: {
  user: User;
  isMe: boolean;
  isCloseFriend: boolean;
  onToggle: (userId: string, newValue: boolean) => void;
  onPress: () => void;
  disabled: boolean;
  index?: number;
}) {
  const tc = useThemeColors();
  const { t } = useTranslation();
  return (
    <Animated.View entering={FadeInUp.delay(Math.min(index, 15) * 30).duration(300)}>
            <Pressable
        accessibilityRole="button"
        onPress={onPress}
        style={({ pressed }) => [pressed && { opacity: 0.7 }]}
      >
        <LinearGradient
          colors={isCloseFriend ? ['rgba(10,123,79,0.12)', 'rgba(10,123,79,0.04)'] : ['rgba(45,53,72,0.2)', 'rgba(28,35,51,0.1)']}
          style={styles.row}
        >
          <Avatar uri={user.avatarUrl} name={user.displayName} size="md" showRing={isCloseFriend} ringColor={colors.emerald} />
          <View style={styles.info}>
            <View style={styles.nameRow}>
              <Text style={[styles.name, { color: tc.text.primary }, isCloseFriend && { color: colors.emerald }]}>{user.displayName}</Text>
              {user.isVerified && <VerifiedBadge size={13} />}
              {isCloseFriend && (
                <LinearGradient
                  colors={[colors.emerald, colors.gold]}
                  style={styles.closeFriendBadge}
                >
                  <Icon name="heart" size={10} color="#fff" />
                </LinearGradient>
              )}
            </View>
            <Text style={[styles.handle, { color: tc.text.secondary }]}>@{user.username}</Text>
          </View>
          {!isMe && (
            <View style={styles.actions}>
              {isCloseFriend && (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t('common.remove')}
                  onPress={() => onToggle(user.id, false)}
                  hitSlop={8}
                  style={styles.removeBtn}
                  disabled={disabled}
                >
                  <Icon name="x" size="sm" color={disabled ? colors.text.tertiary : colors.error} />
                </Pressable>
              )}
              <Switch
                value={isCloseFriend}
                onValueChange={(value) => onToggle(user.id, value)}
                trackColor={{ false: tc.border, true: colors.emerald }}
                thumbColor={isCloseFriend ? '#fff' : tc.text.secondary}
                ios_backgroundColor={tc.border}
                disabled={disabled}
              />
            </View>
          )}
        </LinearGradient>
      </Pressable>
    </Animated.View>
  );
}

export default function CloseFriendsScreen() {
  const router = useRouter();
  const tc = useThemeColors();
  const queryClient = useQueryClient();
  const { user: clerkUser } = useUser();
  const { t } = useTranslation();

  // Use backend user ID for comparisons instead of Clerk ID
  const { data: meData } = useQuery({ queryKey: ['user', 'me'], queryFn: () => usersApi.getMe() });
  const currentUserId = meData?.id ?? clerkUser?.id;

  const [searchQuery, setSearchQuery] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const creationAttempted = useRef(false);

  // Fetch user's circles
  const circlesQuery = useQuery<Circle[]>({
    queryKey: ['my-circles'],
    queryFn: () => circlesApi.getMyCircles(),
    enabled: !!currentUserId,
    staleTime: 30_000,
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
    // Prevent duplicate circle creation -- if backend returns conflict, refetch circles
    onError: () => {
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
    queryFn: () => circlesApi.getMembers(closeFriendsCircle?.id ?? ''),
    enabled: !!closeFriendsCircle,
    staleTime: 30_000,
  });

  const memberIds = useMemo(() =>
    membersQuery.data?.map(m => m.user.id) ?? [],
    [membersQuery.data]
  );

  // Fetch followers of current user
  const followersQuery = useInfiniteQuery<PaginatedResponse<User>>({
    queryKey: ['followers', currentUserId],
    queryFn: ({ pageParam }) => followsApi.getFollowers(currentUserId ?? '', pageParam as string | undefined),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.meta.hasMore ? last.meta.cursor ?? undefined : undefined,
    enabled: !!currentUserId,
  });

  const followers: User[] = followersQuery.data?.pages.flatMap((p: PaginatedResponse<User>) => p.data) ?? [];

  const haptic = useContextualHaptic();

  // Per-user in-flight tracking for concurrent toggles
  const [pendingUserIds, setPendingUserIds] = useState<Set<string>>(new Set());

  // Toggle close friend status
  const toggleMemberMutation = useMutation({
    mutationFn: ({ userId, add }: { userId: string; add: boolean }) => {
      if (!closeFriendsCircle) return Promise.reject(new Error('Circle not ready'));
      return add
        ? circlesApi.addMembers(closeFriendsCircle.id, [userId])
        : circlesApi.removeMembers(closeFriendsCircle.id, [userId]);
    },
    onMutate: async ({ userId, add }) => {
      await queryClient.cancelQueries({ queryKey: ['circle-members', closeFriendsCircle?.id] });
      const previous = queryClient.getQueryData<CircleMember[]>(['circle-members', closeFriendsCircle?.id]);
      // Optimistic update: add or remove from members list
      queryClient.setQueryData<CircleMember[]>(['circle-members', closeFriendsCircle?.id], (old) => {
        if (!old) return old;
        if (add) {
          // Check if already present to avoid duplicates
          if (old.some((m) => m.user.id === userId)) return old;
          // Create a placeholder member entry from followers data
          const follower = followers.find((f) => f.id === userId);
          if (!follower) return old;
          return [...old, { user: follower } as CircleMember];
        }
        return old.filter((m) => m.user.id !== userId);
      });
      setPendingUserIds((prev) => new Set(prev).add(userId));
      return { previous };
    },
    onSuccess: (_data, variables) => {
      haptic.success();
      showToast({
        message: variables.add ? t('screens.closeFriends.addedToast') : t('screens.closeFriends.removedToast'),
        variant: 'success',
      });
    },
    onError: (err: Error, variables, context) => {
      // Rollback on error
      if (context?.previous) {
        queryClient.setQueryData(['circle-members', closeFriendsCircle?.id], context.previous);
      }
      showToast({ message: err.message, variant: 'error' });
    },
    onSettled: (_data, _err, variables) => {
      queryClient.invalidateQueries({ queryKey: ['circle-members', closeFriendsCircle?.id] });
      setPendingUserIds((prev) => {
        const next = new Set(prev);
        next.delete(variables.userId);
        return next;
      });
    },
  });

  const toggleCloseFriend = useCallback((userId: string, add: boolean) => {
    if (!closeFriendsCircle || pendingUserIds.has(userId)) return;
    haptic.tick();
    toggleMemberMutation.mutate({ userId, add });
  }, [closeFriendsCircle, pendingUserIds, toggleMemberMutation, haptic]);

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

  const listEmpty = useMemo(() =>
    followersQuery.isLoading ? null : (
      <EmptyState
        icon="users"
        title={searchQuery ? t('screens.closeFriends.emptySearchTitle') : t('screens.closeFriends.emptyDefaultTitle')}
        subtitle={searchQuery ? t('screens.closeFriends.emptySearchSubtitle') : t('screens.closeFriends.emptyDefaultSubtitle')}
      />
    )
  , [followersQuery.isLoading, searchQuery, t]);

  const listFooter = useMemo(() =>
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
  , [followersQuery.isFetchingNextPage]);

  const renderFollowerItem = useCallback(
    ({ item, index }: { item: User; index: number }) => (
      <UserRow
        user={item}
        isMe={currentUserId === item.id}
        isCloseFriend={memberIds.includes(item.id)}
        onToggle={toggleCloseFriend}
        onPress={() => router.push(`/(screens)/profile/${item.username}`)}
        disabled={!isReady || pendingUserIds.has(item.id)}
        index={index}
      />
    ),
    [currentUserId, memberIds, toggleCloseFriend, router, isReady, pendingUserIds],
  );

  if (followersQuery.isError) {
    return (
      <View style={[styles.container, { backgroundColor: tc.bg }]}>
        <GlassHeader
          title={t('screens.closeFriends.title')}
          leftAction={{
            icon: 'arrow-left',
            onPress: () => router.back(),
            accessibilityLabel: t('common.back'),
          }}
        />
        <EmptyState
          icon="flag"
          title={t('screens.closeFriends.errorTitle')}
          subtitle={t('screens.closeFriends.errorSubtitle')}
          actionLabel={t('common.retry')}
          onAction={() => followersQuery.refetch()}
        />
      </View>
    );
  }

  if (isLoading) {
    return (
      <View style={[styles.container, { backgroundColor: tc.bg }]}>
        <GlassHeader
          title={t('screens.closeFriends.title')}
          leftAction={{
            icon: 'arrow-left',
            onPress: () => router.back(),
            accessibilityLabel: t('common.back'),
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
    <ScreenErrorBoundary>
      <View style={[styles.container, { backgroundColor: tc.bg }]}>
        <GlassHeader
          leftAction={{
            icon: 'arrow-left',
            onPress: () => router.back(),
            accessibilityLabel: t('common.back'),
          }}
          titleComponent={
            <View style={styles.headerTitleRow}>
              <Text style={[styles.headerTitle, { color: tc.text.primary }]}>{t('screens.closeFriends.title')}</Text>
              <Badge count={memberIds.length} color={colors.emerald} size="sm" />
            </View>
          }
        />

        {/* Search Bar with Glassmorphism */}
        <View style={[styles.searchContainer, { marginTop: headerHeight + spacing.md }]}>
          <LinearGradient
            colors={colors.gradient.cardDark}
            style={styles.searchGradient}
          >
            <Icon name="search" size="sm" color={tc.text.secondary} />
            <TextInput
              style={[styles.searchInput, { color: tc.text.primary }]}
              placeholder={t('screens.closeFriends.searchPlaceholder')}
              placeholderTextColor={tc.text.tertiary}
              value={searchQuery}
              onChangeText={setSearchQuery}
              autoCapitalize="none"
              autoCorrect={false}
            />
            {searchQuery.length > 0 && (
                            <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('accessibility.clearSearchInput')}
                onPress={() => setSearchQuery('')}
                hitSlop={8}
              >
                <Icon name="x" size="sm" color={tc.text.secondary} />
              </Pressable>
            )}
          </LinearGradient>
        </View>

        {/* Stats bar with Glassmorphism */}
        <LinearGradient
          colors={['rgba(10,123,79,0.15)', 'rgba(10,123,79,0.05)']}
          style={styles.statsBar}
        >
          <View style={styles.statItem}>
            <Icon name="users" size="xs" color={colors.emerald} />
            <Text style={[styles.statsText, { color: tc.text.secondary }]}>
              {t('screens.closeFriends.statsShown', { shown: closeFriendsInList.length, total: filteredFollowers.length })}
            </Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Icon name="heart" size="xs" color={colors.gold} />
            <Text style={[styles.statsText, { color: colors.gold, fontFamily: fonts.bodySemiBold }]}>
              {t('screens.closeFriends.statsCloseFriends', { count: memberIds.length })}
            </Text>
          </View>
        </LinearGradient>

        {/* List */}
        <FlatList
            removeClippedSubviews={true}
          data={filteredFollowers}
          keyExtractor={(item) => item.id}
          renderItem={renderFollowerItem}
          onEndReached={onEndReached}
          onEndReachedThreshold={0.4}
          refreshControl={
            <BrandedRefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
          ListEmptyComponent={listEmpty}
          ListFooterComponent={listFooter}
        />
      </View>
  
    </ScreenErrorBoundary>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  headerTitle: {
    fontSize: fontSize.md,
    fontFamily: fonts.bodySemiBold,
  },
  searchContainer: {
    marginHorizontal: spacing.base,
    marginVertical: spacing.md,
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  searchGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.active.white6,
  },
  searchInput: {
    flex: 1,
    fontSize: fontSize.base,
    fontFamily: fonts.body,
    paddingVertical: 0,
  },
  statsBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginHorizontal: spacing.base,
    marginBottom: spacing.md,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.active.emerald20,
  },
  statItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  statDivider: {
    width: 1,
    height: 20,
    backgroundColor: colors.active.emerald30,
  },
  statsText: {
    fontSize: fontSize.sm,
    fontFamily: fonts.body,
  },
  statsTextAccent: {
    color: colors.gold,
    fontFamily: fonts.bodySemiBold,
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
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    marginHorizontal: spacing.base,
    marginBottom: spacing.sm,
    borderRadius: radius.lg,
    borderWidth: 0.5,
    borderColor: colors.active.white6,
  },
  nameActive: {
    // Active color now applied via inline tc override
  },
  closeFriendBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.full,
    marginStart: spacing.xs,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  removeBtn: {
    padding: spacing.xs,
    backgroundColor: 'rgba(248,81,73,0.1)',
    borderRadius: radius.full,
  },
  info: { flex: 1 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  name: { fontSize: fontSize.base, fontFamily: fonts.bodySemiBold },
  handle: { fontSize: fontSize.sm, fontFamily: fonts.body, marginTop: 1 },
});