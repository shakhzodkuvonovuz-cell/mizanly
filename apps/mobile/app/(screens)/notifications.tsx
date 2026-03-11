import { useCallback, useState } from 'react';
import {
  View, Text, StyleSheet, Pressable, FlatList,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { formatDistanceToNowStrict } from 'date-fns';
import { Avatar } from '@/components/ui/Avatar';
import { Icon } from '@/components/ui/Icon';
import { GlassHeader } from '@/components/ui/GlassHeader';
import { GradientButton } from '@/components/ui/GradientButton';
import { TabSelector } from '@/components/ui/TabSelector';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { useHaptic } from '@/hooks/useHaptic';
import { colors, spacing, fontSize, radius } from '@/theme';
import { notificationsApi, followsApi } from '@/services/api';
import { useStore } from '@/store';
import type { Notification } from '@/types';

type NotifIconName = React.ComponentProps<typeof Icon>['name'];

function notificationLabel(n: Notification): string {
  switch (n.type) {
    case 'LIKE':            return 'liked your post';
    case 'COMMENT':         return 'commented on your post';
    case 'FOLLOW':          return 'started following you';
    case 'FOLLOW_REQUEST':  return 'requested to follow you';
    case 'FOLLOW_REQUEST_ACCEPTED': return 'accepted your follow request';
    case 'MENTION':         return 'mentioned you';
    case 'REPLY':           return 'replied to your comment';
    case 'REPOST':          return 'reposted your thread';
    case 'QUOTE_POST':      return 'quoted your thread';
    case 'THREAD_REPLY':    return 'replied to your thread';
    case 'CIRCLE_INVITE':   return 'invited you to a circle';
    case 'CIRCLE_JOIN':     return 'joined your circle';
    case 'MESSAGE':         return 'sent you a message';
    case 'CHANNEL_POST':    return 'posted in a channel';
    case 'LIVE_STARTED':    return 'went live';
    default:                return 'interacted with you';
  }
}

function notificationIcon(type: string): { name: NotifIconName; color: string } {
  switch (type) {
    case 'LIKE':            return { name: 'heart-filled', color: colors.like };
    case 'COMMENT':
    case 'REPLY':
    case 'THREAD_REPLY':    return { name: 'message-circle', color: colors.info };
    case 'FOLLOW':
    case 'FOLLOW_REQUEST':
    case 'FOLLOW_REQUEST_ACCEPTED': return { name: 'user', color: colors.emerald };
    case 'MENTION':         return { name: 'at-sign', color: colors.gold };
    case 'REPOST':
    case 'QUOTE_POST':      return { name: 'repeat', color: colors.emerald };
    default:                return { name: 'bell', color: colors.text.secondary };
  }
}

function notificationTarget(n: Notification): string | null {
  if (n.postId) return `/(screens)/post/${n.postId}`;
  if (n.threadId) return `/(screens)/thread/${n.threadId}`;
  if (n.actor?.username) return `/(screens)/profile/${n.actor.username}`;
  return null;
}

function FollowRequestActions({ requestId, onDone }: { requestId?: string; onDone: () => void }) {
  const [done, setDone] = useState<'accepted' | 'declined' | null>(null);
  const haptic = useHaptic();

  const acceptMutation = useMutation({
    mutationFn: () => followsApi.acceptRequest(requestId!),
    onSuccess: () => { haptic.success(); setDone('accepted'); onDone(); },
  });
  const declineMutation = useMutation({
    mutationFn: () => followsApi.declineRequest(requestId!),
    onSuccess: () => { setDone('declined'); onDone(); },
  });

  if (!requestId) return null;
  if (done) {
    return (
      <Text style={styles.requestDone}>
        {done === 'accepted' ? 'Accepted' : 'Declined'}
      </Text>
    );
  }

  return (
    <View style={styles.requestActions}>
      <GradientButton
        label="Accept"
        size="sm"
        onPress={() => acceptMutation.mutate()}
        loading={acceptMutation.isPending}
        disabled={declineMutation.isPending}
      />
      <GradientButton
        label="Decline"
        variant="ghost"
        size="sm"
        onPress={() => declineMutation.mutate()}
        loading={declineMutation.isPending}
        disabled={acceptMutation.isPending}
      />
    </View>
  );
}

function NotificationRow({ notification }: { notification: Notification }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const haptic = useHaptic();
  const iconInfo = notificationIcon(notification.type);

  const readMutation = useMutation({
    mutationFn: () => notificationsApi.markRead(notification.id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  });

  const handlePress = () => {
    haptic.light();
    if (!notification.isRead) readMutation.mutate();
    const target = notificationTarget(notification);
    if (target) router.push(target as `/${string}`);
  };

  const timeAgo = formatDistanceToNowStrict(new Date(notification.createdAt), { addSuffix: true });

  return (
    <Pressable
      style={({ pressed }) => [
        styles.row,
        !notification.isRead && styles.rowUnread,
        pressed && styles.rowPressed,
      ]}
      onPress={handlePress}
      android_ripple={{ color: colors.active.emerald10 }}
      accessibilityRole="button"
      accessibilityLabel={`View notification from ${notification.actor?.displayName ?? 'Someone'}`}
    >
      {/* Unread accent bar */}
      {!notification.isRead && <View style={styles.unreadBar} />}

      {/* Actor avatar with icon overlay */}
      <View style={styles.avatarContainer}>
        <Avatar
          uri={notification.actor?.avatarUrl}
          name={notification.actor?.displayName ?? '?'}
          size="md"
        />
        <View style={[styles.iconOverlay, { backgroundColor: iconInfo.color }]}>
          <Icon name={iconInfo.name} size={10} color="#FFF" fill={iconInfo.name === 'heart-filled' ? '#FFF' : undefined} />
        </View>
      </View>

      {/* Text */}
      <View style={styles.rowContent}>
        <Text style={styles.rowText} numberOfLines={2}>
          <Text style={styles.rowActor}>{notification.actor?.displayName ?? 'Someone'}</Text>
          {' '}
          <Text>{notificationLabel(notification)}</Text>
        </Text>
        {notification.body && (
          <Text style={styles.rowBody} numberOfLines={1}>{notification.body}</Text>
        )}
        <Text style={styles.rowTime}>{timeAgo}</Text>
      </View>

      {notification.type === 'FOLLOW_REQUEST' && !notification.isRead && (
        <FollowRequestActions
          requestId={notification.followRequestId}
          onDone={() => {
            readMutation.mutate();
            queryClient.invalidateQueries({ queryKey: ['notifications'] });
          }}
        />
      )}
    </Pressable>
  );
}

type NotifFilter = 'all' | 'mentions' | 'verified';

const NOTIF_TABS = [
  { key: 'all', label: 'All' },
  { key: 'mentions', label: 'Mentions' },
  { key: 'verified', label: 'Verified' },
];

export default function NotificationsScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const haptic = useHaptic();
  const setUnread = useStore((s) => s.setUnreadNotifications);
  const [filter, setFilter] = useState<NotifFilter>('all');

  const query = useInfiniteQuery({
    queryKey: ['notifications', filter],
    queryFn: ({ pageParam }) =>
      notificationsApi.get(filter === 'all' ? undefined : filter, pageParam as string | undefined),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) =>
      last.meta.hasMore ? last.meta.cursor ?? undefined : undefined,
  });

  const notifications: Notification[] = query.data?.pages.flatMap((p) => p.data) ?? [];

  const markAllMutation = useMutation({
    mutationFn: () => notificationsApi.markAllRead(),
    onSuccess: () => {
      haptic.success();
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      setUnread(0);
    },
  });

  const onRefresh = useCallback(async () => {
    await query.refetch();
  }, [query]);

  const insets = useSafeAreaInsets();
  const headerHeight = insets.top + 44 + spacing.sm;

  if (query.isError) {
    return (
      <View style={styles.container}>
        <GlassHeader
          title="Notifications"
          leftAction={{ icon: 'arrow-left', onPress: () => router.back() }}
        />
        <View style={{ paddingTop: headerHeight, flex: 1, justifyContent: 'center' }}>
          <EmptyState
            icon="flag"
            title="Couldn't load content"
            subtitle="Check your connection and try again"
            actionLabel="Retry"
            onAction={() => query.refetch()}
          />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <GlassHeader
        title="Notifications"
        leftAction={{ icon: 'arrow-left', onPress: () => router.back() }}
        rightActions={[{
          icon: <Text style={{ color: colors.emerald, fontSize: 13, fontWeight: '600' }}>Mark all read</Text>,
          onPress: () => markAllMutation.mutate(),
          accessibilityLabel: 'Mark all read',
        }]}
      />

      <View style={{ paddingTop: headerHeight }}>
        <TabSelector
          tabs={NOTIF_TABS}
          activeKey={filter}
          onTabChange={(key) => setFilter(key as NotifFilter)}
        />
      </View>

      <FlatList
          removeClippedSubviews={true}
        data={notifications}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <NotificationRow notification={item} />}
        onEndReached={() => {
          if (query.hasNextPage && !query.isFetchingNextPage) query.fetchNextPage();
        }}
        onEndReachedThreshold={0.4}
        onRefresh={onRefresh}
        refreshing={query.isRefetching && !query.isFetchingNextPage}
        ListEmptyComponent={() =>
          query.isLoading ? (
            <View style={styles.skeletonList}>
              {Array.from({ length: 8 }).map((_, i) => (
                <View key={i} style={styles.skeletonRow}>
                  <Skeleton.Circle size={40} />
                  <View style={{ flex: 1, gap: 6 }}>
                    <Skeleton.Rect width="80%" height={14} />
                    <Skeleton.Rect width="40%" height={11} />
                  </View>
                </View>
              ))}
            </View>
          ) : (
            <EmptyState
              icon="bell"
              title="No notifications yet"
              subtitle="When people interact with your content, you'll see it here"
            />
          )
        }
        ListFooterComponent={() =>
          query.isFetchingNextPage ? <Skeleton.Rect width="100%" height={60} /> : null
        }
        contentContainerStyle={{ paddingBottom: 40 }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.dark.bg },

  skeletonList: { padding: spacing.base, gap: spacing.lg },
  skeletonRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },

  row: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: spacing.base, paddingVertical: spacing.md,
    gap: spacing.sm, borderBottomWidth: 0.5, borderBottomColor: colors.dark.border,
    position: 'relative',
  },
  rowUnread: { backgroundColor: colors.active.emerald10 },
  rowPressed: { opacity: 0.7 },
  unreadBar: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 3,
    backgroundColor: colors.emerald,
    borderTopRightRadius: 2,
    borderBottomRightRadius: 2,
  },
  avatarContainer: { position: 'relative' },
  iconOverlay: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 18,
    height: 18,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.dark.bg,
  },
  rowContent: { flex: 1 },
  rowText: { color: colors.text.primary, fontSize: fontSize.sm, lineHeight: 20 },
  rowActor: { fontWeight: '700' },
  rowBody: { color: colors.text.secondary, fontSize: fontSize.xs, marginTop: 2 },
  rowTime: { color: colors.text.tertiary, fontSize: fontSize.xs, marginTop: spacing.xs },

  requestDone: { color: colors.text.secondary, fontSize: fontSize.xs, fontWeight: '600' },
  requestActions: { flexDirection: 'row', gap: spacing.xs, alignItems: 'center' },
});
