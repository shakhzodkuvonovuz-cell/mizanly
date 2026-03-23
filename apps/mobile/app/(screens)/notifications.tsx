import { useCallback, useState } from 'react';
import {
  View, Text, StyleSheet, Pressable, SectionList,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { formatDistanceToNowStrict } from 'date-fns';
import { getDateFnsLocale } from '@/utils/localeFormat';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { useScrollLinkedHeader } from '@/hooks/useScrollLinkedHeader';
import { BrandedRefreshControl } from '@/components/ui/BrandedRefreshControl';
import { Avatar } from '@/components/ui/Avatar';
import { Icon } from '@/components/ui/Icon';
import { GlassHeader } from '@/components/ui/GlassHeader';
import { GradientButton } from '@/components/ui/GradientButton';
import { TabSelector } from '@/components/ui/TabSelector';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { ProgressiveImage } from '@/components/ui/ProgressiveImage';
import { showToast } from '@/components/ui/Toast';
import { useContextualHaptic } from '@/hooks/useContextualHaptic';
import { colors, spacing, fontSize, radius, lineHeight, letterSpacing, fonts } from '@/theme';
import { notificationsApi, followsApi } from '@/services/api';
import { useStore } from '@/store';
import type { Notification } from '@/types';
import { useTranslation } from '@/hooks/useTranslation';
import { useThemeColors } from '@/hooks/useThemeColors';
import { rtlFlexRow, rtlTextAlign, rtlMargin, rtlBorderStart, rtlAbsoluteStart } from '@/utils/rtl';
import { ScreenErrorBoundary } from '@/components/ui/ScreenErrorBoundary';
import { navigate } from '@/utils/navigation';

type NotifIconName = React.ComponentProps<typeof Icon>['name'];

function notificationLabel(n: Notification, t: (key: string) => string): string {
  switch (n.type) {
    case 'LIKE':            return t('notifications.likedYourPost');
    case 'COMMENT':         return t('notifications.commentedOnPost');
    case 'FOLLOW':          return t('notifications.startedFollowing');
    case 'FOLLOW_REQUEST':  return t('notifications.requestedToFollow');
    case 'FOLLOW_REQUEST_ACCEPTED': return t('notifications.acceptedFollowRequest');
    case 'MENTION':         return t('notifications.mentionedYou');
    case 'REPLY':           return t('notifications.repliedToComment');
    case 'REPOST':          return t('notifications.repostedThread');
    case 'QUOTE_POST':      return t('notifications.quotedThread');
    case 'THREAD_REPLY':    return t('notifications.repliedToThread');
    case 'CIRCLE_INVITE':   return t('notifications.invitedToCircle');
    case 'CIRCLE_JOIN':     return t('notifications.joinedCircle');
    case 'MESSAGE':         return t('notifications.sentMessage');
    case 'CHANNEL_POST':    return t('notifications.postedInChannel');
    case 'LIVE_STARTED':    return t('notifications.wentLive');
    default:                return t('notifications.interactedWithYou');
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
    default:                return { name: 'bell', color: colors.text.secondary};
  }
}

function notificationTarget(n: Notification): string | null {
  if (n.postId) return `/(screens)/post/${n.postId}`;
  if (n.threadId) return `/(screens)/thread/${n.threadId}`;
  if (n.reelId) return `/(screens)/reel/${n.reelId}`;
  if (n.videoId) return `/(screens)/video/${n.videoId}`;
  if (n.commentId && n.postId) return `/(screens)/post/${n.postId}`;
  if (n.conversationId) return `/(screens)/conversation/${n.conversationId}`;
  if (n.actor?.username) return `/(screens)/profile/${n.actor.username}`;
  return null;
}

/** Extract a thumbnail URL from nested content relations */
function getContentThumbnail(n: Notification): string | null {
  if (n.post?.thumbnailUrl) return n.post.thumbnailUrl;
  if (n.post?.mediaUrls?.[0]) return n.post.mediaUrls[0];
  if (n.reel?.thumbnailUrl) return n.reel.thumbnailUrl;
  if (n.video?.thumbnailUrl) return n.video.thumbnailUrl;
  if (n.thread?.mediaUrls?.[0]) return n.thread.mediaUrls[0];
  return null;
}

// Group notifications by date
function groupByDate(items: Notification[], labels: { today: string; yesterday: string; thisWeek: string; earlier: string }): { title: string; data: Notification[] }[] {
  const today: Notification[] = [];
  const yesterday: Notification[] = [];
  const thisWeek: Notification[] = [];
  const earlier: Notification[] = [];
  const now = new Date();

  items.forEach((n) => {
    const d = new Date(n.createdAt);
    const diffDays = Math.floor((now.getTime() - d.getTime()) / 86400000);
    if (diffDays === 0) today.push(n);
    else if (diffDays === 1) yesterday.push(n);
    else if (diffDays < 7) thisWeek.push(n);
    else earlier.push(n);
  });

  return [
    today.length > 0 && { title: labels.today, data: today },
    yesterday.length > 0 && { title: labels.yesterday, data: yesterday },
    thisWeek.length > 0 && { title: labels.thisWeek, data: thisWeek },
    earlier.length > 0 && { title: labels.earlier, data: earlier },
  ].filter(Boolean) as { title: string; data: Notification[] }[];
}

// Aggregate consecutive LIKE notifications for same postId
interface AggregatedNotification extends Notification {
  _aggregatedActors?: { displayName: string; username: string; avatarUrl?: string }[];
  _aggregatedCount?: number;
}

function aggregateLikes(items: Notification[]): AggregatedNotification[] {
  const result: AggregatedNotification[] = [];
  let i = 0;
  while (i < items.length) {
    if (items[i].type === 'LIKE' && items[i].postId) {
      const postId = items[i].postId;
      const group: Notification[] = [items[i]];
      while (i + 1 < items.length && items[i + 1].type === 'LIKE' && items[i + 1].postId === postId) {
        group.push(items[++i]);
      }
      if (group.length > 1) {
        result.push({
          ...group[0],
          _aggregatedActors: group.map((g) => ({
            displayName: g.actor?.displayName ?? '',
            username: g.actor?.username ?? '',
            avatarUrl: g.actor?.avatarUrl,
          })),
          _aggregatedCount: group.length,
        });
      } else {
        result.push(group[0]);
      }
    } else {
      result.push(items[i]);
    }
    i++;
  }
  return result;
}

function FollowRequestActions({ requestId, onDone }: { requestId?: string; onDone: () => void }) {
  const tc = useThemeColors();
  const styles = createStyles(tc);
  const [done, setDone] = useState<'accepted' | 'declined' | null>(null);
  const haptic = useContextualHaptic();
  const { t, isRTL } = useTranslation();

  const acceptMutation = useMutation({
    mutationFn: () => followsApi.acceptRequest(requestId!),
    onSuccess: () => { haptic.follow(); setDone('accepted'); onDone(); },
  });
  const declineMutation = useMutation({
    mutationFn: () => followsApi.declineRequest(requestId!),
    onSuccess: () => { setDone('declined'); onDone(); },
  });

  if (!requestId) return null;
  if (done) {
    return (
      <Text style={styles.requestDone}>
        {done === 'accepted' ? t('notifications.accepted') : t('notifications.declined')}
      </Text>
    );
  }

  return (
    <View style={[styles.requestActions, { flexDirection: rtlFlexRow(isRTL) }]}>
      <GradientButton
        label={t('notifications.accept')}
        size="sm"
        onPress={() => acceptMutation.mutate()}
        loading={acceptMutation.isPending}
        disabled={declineMutation.isPending}
      />
      <GradientButton
        label={t('notifications.decline')}
        variant="ghost"
        size="sm"
        onPress={() => declineMutation.mutate()}
        loading={declineMutation.isPending}
        disabled={acceptMutation.isPending}
      />
    </View>
  );
}

function NotificationRow({ notification, index }: { notification: AggregatedNotification; index: number }) {
  const tc = useThemeColors();
  const styles = createStyles(tc);
  const router = useRouter();
  const queryClient = useQueryClient();
  const haptic = useContextualHaptic();
  const { t, isRTL } = useTranslation();
  const iconInfo = notificationIcon(notification.type);

  // Entrance animation — staggered fade-in per item (capped at 10 to avoid long waits)
  const entranceAnimation = FadeInUp.delay(Math.min(index, 10) * 30).duration(300).springify();

  const readMutation = useMutation({
    mutationFn: () => notificationsApi.markRead(notification.id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  });

  const followMutation = useMutation({
    mutationFn: (userId: string) => followsApi.follow(userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      showToast({ message: t('notifications.followed'), variant: 'success' });
    },
  });

  const handlePress = () => {
    haptic.navigate();
    if (!notification.isRead) readMutation.mutate();
    const target = notificationTarget(notification);
    if (target) navigate(target);
  };

  const timeAgo = formatDistanceToNowStrict(new Date(notification.createdAt), { addSuffix: true, locale: getDateFnsLocale() });

  // Check if this is an aggregated like notification
  const isAggregated = notification._aggregatedCount && notification._aggregatedCount > 1;
  const aggregatedActors = notification._aggregatedActors ?? [];

  // Content thumbnail for likes/comments/mentions on posts/reels/videos/threads
  const thumbnailUrl = getContentThumbnail(notification);

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
      accessibilityLabel={`View notification from ${notification.actor?.displayName ?? t('notifications.someone')}`}
    >
      <Animated.View entering={entranceAnimation} style={[styles.rowInner, { flexDirection: rtlFlexRow(isRTL) }]}>
        {/* Unread accent bar */}
        {!notification.isRead && <View style={[styles.unreadBar, rtlAbsoluteStart(isRTL, 0)]} />}

        {/* Actor avatar(s) with icon overlay */}
        <View style={styles.avatarContainer}>
          {isAggregated ? (
            <View style={styles.stackedAvatars}>
              {aggregatedActors.slice(0, 3).map((actor, idx) => (
                <View key={idx} style={[styles.stackedAvatar, { marginLeft: idx > 0 ? -8 : 0, zIndex: 3 - idx }]}>
                  <Avatar uri={actor.avatarUrl} name={actor.displayName} size="sm" />
                </View>
              ))}
            </View>
          ) : (
            <Avatar
              uri={notification.actor?.avatarUrl}
              name={notification.actor?.displayName ?? '?'}
              size="md"
            />
          )}
          <View style={[styles.iconOverlay, { backgroundColor: iconInfo.color }, isRTL ? { left: -2, right: undefined } : undefined]}>
            <Icon name={iconInfo.name} size={12} color="#FFF" fill={iconInfo.name === 'heart-filled' ? '#FFF' : undefined} />
          </View>
        </View>

        {/* Text */}
        <View style={styles.rowContent}>
          <Text style={[styles.rowText, { textAlign: rtlTextAlign(isRTL) }]} numberOfLines={2}>
            {isAggregated ? (
              <>
                <Text style={styles.rowActor}>{aggregatedActors[0]?.displayName}</Text>
                {aggregatedActors.length > 1 && (
                  <>
                    {', '}
                    <Text style={styles.rowActor}>{aggregatedActors[1]?.displayName}</Text>
                  </>
                )}
                {' and '}
                <Text style={styles.rowActor}>{notification._aggregatedCount! - (aggregatedActors.length > 1 ? 2 : 1)} {t('notifications.others')}</Text>
                {' '}{t('notifications.likedYourPost')}
              </>
            ) : (
              <>
                <Text style={styles.rowActor}>{notification.actor?.displayName ?? t('notifications.someone')}</Text>
                {' '}
                <Text>{notificationLabel(notification, t)}</Text>
              </>
            )}
          </Text>
          {notification.body && (
            <Text style={styles.rowBody} numberOfLines={1}>{notification.body}</Text>
          )}
          <Text style={styles.rowTime}>{timeAgo}</Text>
        </View>

        {/* Follow-back button for FOLLOW notifications */}
        {notification.type === 'FOLLOW' && !notification.actor?.isFollowing && notification.actor?.id && (
          <Pressable
            onPress={() => {
              followMutation.mutate(notification.actor!.id);
              haptic.follow();
            }}
            style={[styles.followBackBtn, { backgroundColor: colors.emerald }]}
            accessibilityRole="button"
            accessibilityLabel={t('notifications.followBack')}
          >
            <Text style={styles.followBackText}>{t('common.follow')}</Text>
          </Pressable>
        )}
        {notification.type === 'FOLLOW' && notification.actor?.isFollowing && (
          <View style={[styles.followingBadge, { backgroundColor: tc.surface }]}>
            <Text style={[styles.followingText, { color: tc.text.secondary }]}>{t('common.following')}</Text>
          </View>
        )}

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

        {/* Content thumbnail on the right */}
        {thumbnailUrl && notification.type !== 'FOLLOW' && notification.type !== 'FOLLOW_REQUEST' && (
          <Pressable
            onPress={handlePress}
            style={styles.notifThumb}
            accessibilityRole="button"
            accessibilityLabel={t('notifications.viewContent')}
          >
            <ProgressiveImage
              uri={thumbnailUrl}
              width={44}
              height={44}
              borderRadius={radius.sm}
            />
          </Pressable>
        )}
      </Animated.View>
    </Pressable>
  );
}

type NotifFilter = 'all' | 'mentions' | 'verified';

export default function NotificationsScreen() {
  const tc = useThemeColors();
  const styles = createStyles(tc);
  const router = useRouter();
  const queryClient = useQueryClient();
  const haptic = useContextualHaptic();
  const { t, isRTL } = useTranslation();
  const insets = useSafeAreaInsets();
  const headerHeight = insets.top + 44 + spacing.sm;

  const { onScroll: onScrollElastic, headerAnimatedStyle } = useScrollLinkedHeader(headerHeight);

  const NOTIF_TABS = [
    { key: 'all', label: t('notifications.all') },
    { key: 'mentions', label: t('notifications.mentions') },
    { key: 'verified', label: t('notifications.verified') },
  ];
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

  // Aggregate likes and group by date
  const aggregatedNotifications = aggregateLikes(notifications);
  const sections = groupByDate(aggregatedNotifications, {
    today: t('notifications.today'),
    yesterday: t('notifications.yesterday'),
    thisWeek: t('notifications.thisWeek'),
    earlier: t('notifications.earlier'),
  });

  const markAllMutation = useMutation({
    mutationFn: () => notificationsApi.markAllRead(),
    onSuccess: () => {
      haptic.tick();
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      setUnread(0);
    },
  });

  const onRefresh = useCallback(async () => {
    await query.refetch();
  }, [query]);

  if (query.isError) {
    return (
      <View style={styles.container}>
        <GlassHeader
          title={t('notifications.title')}
          leftAction={{ icon: 'arrow-left', onPress: () => router.back(), accessibilityLabel: t('common.goBack') }}
        />
        <View style={{ paddingTop: headerHeight, flex: 1, justifyContent: 'center' }}>
          <EmptyState
            icon="flag"
            title={t('notifications.loadFailed')}
            subtitle={t('notifications.checkConnection')}
            actionLabel={t('common.retry')}
            onAction={() => query.refetch()}
          />
        </View>
      </View>
    );
  }

  return (
    <ScreenErrorBoundary>
      <View style={styles.container}>
        <Animated.View style={headerAnimatedStyle}>
          <GlassHeader
            title={t('notifications.title')}
            leftAction={{ icon: 'arrow-left', onPress: () => router.back(), accessibilityLabel: t('common.goBack') }}
            rightActions={[{
              icon: (
                <GradientButton
                  label={t('notifications.markAllRead')}
                  size="sm"
                  variant="ghost"
                  onPress={() => markAllMutation.mutate()}
                />
              ),
              onPress: () => markAllMutation.mutate(),
              accessibilityLabel: t('notifications.markAllReadAccessibility'),
            }]}
          />
        </Animated.View>

        <View style={{ paddingTop: headerHeight }}>
          <TabSelector
            tabs={NOTIF_TABS}
            activeKey={filter}
            onTabChange={(key) => setFilter(key as NotifFilter)}
          />
        </View>

        <SectionList
          sections={sections}
          keyExtractor={(item) => item.id}
          renderItem={({ item, index }) => <NotificationRow notification={item} index={index} />}
          renderSectionHeader={({ section }) => (
            <Text style={[styles.sectionHeader, { textAlign: rtlTextAlign(isRTL) }]}>{section.title}</Text>
          )}
          onEndReached={() => {
            if (query.hasNextPage && !query.isFetchingNextPage) query.fetchNextPage();
          }}
          onEndReachedThreshold={0.4}
          onScroll={onScrollElastic}
          scrollEventThrottle={16}
          refreshControl={<BrandedRefreshControl refreshing={query.isRefetching && !query.isFetchingNextPage} onRefresh={onRefresh} />}
          ListEmptyComponent={() =>
            query.isLoading ? (
              <View style={styles.skeletonList}>
                {Array.from({ length: 8 }).map((_, i) => (
                  <View key={i} style={[styles.skeletonRow, { flexDirection: rtlFlexRow(isRTL) }]}>
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
                title={t('notifications.noNotifications')}
                subtitle={t('notifications.noNotificationsSubtitle')}
              />
            )
          }
          ListFooterComponent={() =>
            query.isFetchingNextPage ? <Skeleton.Rect width="100%" height={60} /> : null
          }
          contentContainerStyle={{ paddingBottom: 40 }}
          stickySectionHeadersEnabled={true}
        />
      </View>
  
    </ScreenErrorBoundary>
  );
}

const createStyles = (tc: ReturnType<typeof useThemeColors>) => StyleSheet.create({
  container: { flex: 1, backgroundColor: tc.bg },

  skeletonList: { padding: spacing.base, gap: spacing.lg },
  skeletonRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },

  sectionHeader: {
    color: colors.text.secondary,
    fontSize: fontSize.sm,
    lineHeight: lineHeight.sm,
    fontWeight: '700',
    paddingHorizontal: spacing.base,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xs,
    backgroundColor: tc.bg,
  },

  row: {
    borderBottomWidth: 0.5,
    borderBottomColor: tc.border,
    position: 'relative',
  },
  rowInner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    gap: spacing.sm,
  },
  rowUnread: { backgroundColor: colors.active.emerald10 },
  rowPressed: { opacity: 0.7 },
  unreadBar: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 4,
    backgroundColor: colors.emerald,
    borderTopRightRadius: 2,
    borderBottomRightRadius: 2,
    shadowColor: colors.emerald,
    shadowOpacity: 0.4,
    shadowRadius: 4,
    shadowOffset: { width: 2, height: 0 },
  },
  avatarContainer: { position: 'relative' },
  stackedAvatars: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  stackedAvatar: {
    borderRadius: radius.full,
    borderWidth: 2,
    borderColor: tc.bg,
  },
  iconOverlay: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 22,
    height: 22,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: tc.bg,
  },
  rowContent: { flex: 1 },
  rowText: { color: colors.text.primary, fontSize: fontSize.sm, lineHeight: 20 },
  rowActor: { fontWeight: '700' },
  rowBody: { color: colors.text.secondary, fontSize: fontSize.xs, lineHeight: lineHeight.xs, marginTop: 2 },
  rowTime: { color: colors.text.tertiary, fontSize: fontSize.xs, lineHeight: lineHeight.xs, marginTop: spacing.xs },

  requestDone: { color: colors.text.secondary, fontSize: fontSize.xs, fontWeight: '600' },
  requestActions: { flexDirection: 'row', gap: spacing.xs, alignItems: 'center' },

  notifThumb: {
    marginStart: spacing.sm,
  },
  followBackBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: radius.sm,
    marginStart: spacing.sm,
  },
  followBackText: {
    color: '#fff',
    fontSize: fontSize.sm,
    fontFamily: fonts.bodyBold,
  },
  followingBadge: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: radius.sm,
    marginStart: spacing.sm,
  },
  followingText: {
    fontSize: fontSize.sm,
    fontFamily: fonts.bodyMedium,
  },
});
