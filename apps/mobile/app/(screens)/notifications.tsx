import { useCallback, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, FlatList,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { SafeAreaView } from 'react-native-safe-area-context';
import { formatDistanceToNowStrict } from 'date-fns';
import { Avatar } from '@/components/ui/Avatar';
import { colors, spacing, fontSize } from '@/theme';
import { notificationsApi, followsApi } from '@/services/api';
import { useStore } from '@/store';
import type { Notification } from '@/types';

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

function notificationTarget(n: Notification): string | null {
  if (n.postId) return `/(screens)/post/${n.postId}`;
  if (n.threadId) return `/(screens)/thread/${n.threadId}`;
  if (n.actor?.username) return `/(screens)/profile/${n.actor.username}`;
  return null;
}

function FollowRequestActions({
  requestId,
  onDone,
}: {
  requestId?: string;
  onDone: () => void;
}) {
  const [done, setDone] = useState<'accepted' | 'declined' | null>(null);

  const acceptMutation = useMutation({
    mutationFn: () => followsApi.acceptRequest(requestId!),
    onSuccess: () => { setDone('accepted'); onDone(); },
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
      <TouchableOpacity
        style={[styles.acceptBtn, acceptMutation.isPending && { opacity: 0.6 }]}
        onPress={() => acceptMutation.mutate()}
        disabled={acceptMutation.isPending || declineMutation.isPending}
      >
        <Text style={styles.acceptBtnText}>Accept</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.declineBtn, declineMutation.isPending && { opacity: 0.6 }]}
        onPress={() => declineMutation.mutate()}
        disabled={acceptMutation.isPending || declineMutation.isPending}
      >
        <Text style={styles.declineBtnText}>Decline</Text>
      </TouchableOpacity>
    </View>
  );
}

function NotificationRow({ notification }: { notification: Notification }) {
  const router = useRouter();
  const queryClient = useQueryClient();

  const readMutation = useMutation({
    mutationFn: () => notificationsApi.markRead(notification.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });

  const handlePress = () => {
    if (!notification.isRead) readMutation.mutate();
    const target = notificationTarget(notification);
    if (target) router.push(target as any);
  };

  const timeAgo = formatDistanceToNowStrict(new Date(notification.createdAt), { addSuffix: true });

  return (
    <TouchableOpacity
      style={[styles.row, !notification.isRead && styles.rowUnread]}
      onPress={handlePress}
      activeOpacity={0.7}
    >
      {/* Unread dot */}
      {!notification.isRead && <View style={styles.unreadDot} />}

      {/* Actor avatar */}
      <Avatar
        uri={notification.actor?.avatarUrl}
        name={notification.actor?.displayName ?? '?'}
        size="md"
      />

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

      {/* Follow request actions */}
      {notification.type === 'FOLLOW_REQUEST' && !notification.isRead && (
        <FollowRequestActions
          requestId={notification.followRequestId}
          onDone={() => {
            readMutation.mutate();
            queryClient.invalidateQueries({ queryKey: ['notifications'] });
          }}
        />
      )}
    </TouchableOpacity>
  );
}

export default function NotificationsScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const setUnread = useStore((s) => s.setUnreadNotifications);

  const query = useInfiniteQuery({
    queryKey: ['notifications'],
    queryFn: ({ pageParam }) =>
      notificationsApi.get(undefined, pageParam as string | undefined),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) =>
      last.meta.hasMore ? last.meta.cursor ?? undefined : undefined,
  });

  const notifications: Notification[] = query.data?.pages.flatMap((p) => p.data) ?? [];

  const markAllMutation = useMutation({
    mutationFn: () => notificationsApi.markAllRead(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      setUnread(0);
    },
  });

  const onRefresh = useCallback(async () => {
    await query.refetch();
  }, [query]);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={8} style={styles.backBtn}>
          <Text style={styles.backIcon}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Notifications</Text>
        <TouchableOpacity
          onPress={() => markAllMutation.mutate()}
          disabled={markAllMutation.isPending}
          hitSlop={8}
        >
          <Text style={styles.markAllText}>Mark all read</Text>
        </TouchableOpacity>
      </View>

      <FlatList
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
          !query.isLoading ? (
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>No notifications yet</Text>
              <Text style={styles.emptyText}>When people interact with your content, you'll see it here</Text>
            </View>
          ) : (
            <ActivityIndicator color={colors.emerald} style={styles.loader} />
          )
        }
        ListFooterComponent={() =>
          query.isFetchingNextPage ? (
            <ActivityIndicator color={colors.emerald} style={{ paddingVertical: spacing.lg }} />
          ) : null
        }
        contentContainerStyle={{ paddingBottom: 40 }}
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
  backBtn: { width: 40 },
  backIcon: { color: colors.text.primary, fontSize: 22 },
  headerTitle: { color: colors.text.primary, fontSize: fontSize.base, fontWeight: '700' },
  markAllText: { color: colors.emerald, fontSize: fontSize.sm, fontWeight: '600' },
  loader: { marginTop: 60 },

  row: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: spacing.base, paddingVertical: spacing.md,
    gap: spacing.sm, borderBottomWidth: 0.5, borderBottomColor: colors.dark.border,
  },
  rowUnread: { backgroundColor: 'rgba(10, 123, 79, 0.06)' },
  unreadDot: {
    position: 'absolute', left: 5, top: '50%',
    width: 6, height: 6, borderRadius: 3, backgroundColor: colors.emerald,
  },
  rowContent: { flex: 1 },
  rowText: { color: colors.text.primary, fontSize: fontSize.sm, lineHeight: 20 },
  rowActor: { fontWeight: '700' },
  rowBody: { color: colors.text.secondary, fontSize: fontSize.xs, marginTop: 2 },
  rowTime: { color: colors.text.tertiary, fontSize: fontSize.xs, marginTop: 4 },

  requestDone: { color: colors.text.secondary, fontSize: fontSize.xs, fontWeight: '600' },
  requestActions: { flexDirection: 'row', gap: spacing.xs },
  acceptBtn: {
    backgroundColor: colors.emerald, borderRadius: 8,
    paddingHorizontal: spacing.md, paddingVertical: spacing.xs,
  },
  acceptBtnText: { color: '#fff', fontSize: fontSize.xs, fontWeight: '700' },
  declineBtn: {
    borderWidth: 1, borderColor: colors.dark.border, borderRadius: 8,
    paddingHorizontal: spacing.md, paddingVertical: spacing.xs,
  },
  declineBtnText: { color: colors.text.primary, fontSize: fontSize.xs, fontWeight: '600' },

  empty: { alignItems: 'center', paddingTop: 80, paddingHorizontal: spacing.xl, gap: spacing.sm },
  emptyTitle: { color: colors.text.primary, fontSize: fontSize.lg, fontWeight: '600' },
  emptyText: { color: colors.text.secondary, fontSize: fontSize.base, textAlign: 'center' },
});
