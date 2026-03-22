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
import { useTranslation } from '@/hooks/useTranslation';
import { useThemeColors } from '@/hooks/useThemeColors';
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
  return (
    <Animated.View entering={FadeInUp.delay(index * 30).duration(300)}>
      <Pressable onPress={onPress}>
        <LinearGradient
          colors={isCloseFriend ? ['rgba(10,123,79,0.12)', 'rgba(10,123,79,0.04)'] : ['rgba(45,53,72,0.2)', 'rgba(28,35,51,0.1)']}
          style={styles.row}
        >
          <Avatar uri={user.avatarUrl} name={user.displayName} size="md" showRing={isCloseFriend} ringColor={colors.emerald} />
          <View style={styles.info}>
            <View style={styles.nameRow}>
              <Text style={[styles.name, isCloseFriend && styles.nameActive]}>{user.displayName}</Text>
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

  // Toggle close friend status
  const toggleMemberMutation = useMutation({
    mutationFn: ({ userId, add }: { userId: string; add: boolean }) => {
      if (!closeFriendsCircle) return Promise.reject(new Error('Circle not ready'));
      return add
        ? circlesApi.addMembers(closeFriendsCircle.id, [userId])
        : circlesApi.removeMembers(closeFriendsCircle.id, [userId]);
    },
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
              <Pressable onPress={() => setSearchQuery('')} hitSlop={8}>
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
            <Text style={[styles.statsText, styles.statsTextAccent]}>
              {t('screens.closeFriends.statsCloseFriends', { count: memberIds.length })}
            </Text>
          </View>
        </LinearGradient>

        {/* List */}
        <FlatList
            removeClippedSubviews={true}
          data={filteredFollowers}
          keyExtractor={(item) => item.id}
          renderItem={({ item, index }) => (
            <UserRow
              user={item}
              isMe={currentUserId === item.id}
              isCloseFriend={memberIds.includes(item.id)}
              onToggle={toggleCloseFriend}
              onPress={() => router.push(`/(screens)/profile/${item.username}`)}
              disabled={!isReady || toggleMemberMutation.isPending}
              index={index}
            />
          )}
          onEndReached={onEndReached}
          onEndReachedThreshold={0.4}
          refreshControl={
            <BrandedRefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
          ListEmptyComponent={() =>
            followersQuery.isLoading ? null : (
              <EmptyState
                icon="users"
                title={searchQuery ? t('screens.closeFriends.emptySearchTitle') : t('screens.closeFriends.emptyDefaultTitle')}
                subtitle={searchQuery ? t('screens.closeFriends.emptySearchSubtitle') : t('screens.closeFriends.emptyDefaultSubtitle')}
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
  
    </ScreenErrorBoundary>
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
    color: colors.text.primary,
    fontSize: fontSize.base,
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
    color: colors.text.secondary,
    fontSize: fontSize.sm,
  },
  statsTextAccent: {
    color: colors.gold,
    fontWeight: '600',
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
    color: colors.emerald,
  },
  closeFriendBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.full,
    marginLeft: spacing.xs,
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
  name: { color: colors.text.primary, fontSize: fontSize.base, fontWeight: '600' },
  handle: { color: colors.text.secondary, fontSize: fontSize.sm, marginTop: 1 },
});