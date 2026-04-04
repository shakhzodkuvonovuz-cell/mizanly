import { useCallback, useEffect, useRef, useState, useMemo, memo } from 'react';
import { View, Text, FlatList, StyleSheet, Pressable } from 'react-native';
import { useScrollToTop } from '@react-navigation/native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { navigate } from '@/utils/navigation';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Swipeable } from 'react-native-gesture-handler';
import { useUser } from '@clerk/clerk-expo';
import { formatDistanceToNowStrict } from 'date-fns';
import { getDateFnsLocale } from '@/utils/localeFormat';
import { useSocket } from '@/providers/SocketProvider';
import Animated, {
  useAnimatedStyle,
  withSpring,
  withTiming,
  useSharedValue,
  FadeInUp,
} from 'react-native-reanimated';
import { Avatar } from '@/components/ui/Avatar';
import { Icon } from '@/components/ui/Icon';
import { BottomSheet, BottomSheetItem } from '@/components/ui/BottomSheet';
import { Badge } from '@/components/ui/Badge';
import { TabSelector } from '@/components/ui/TabSelector';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { useContextualHaptic } from '@/hooks/useContextualHaptic';
import { colors, spacing, fontSize, radius, animation, fonts, tabBar } from '@/theme';
import { useStore } from '@/store';
import { messagesApi } from '@/services/api';
import { showToast } from '@/components/ui/Toast';
import type { Conversation } from '@/types';
import { useTranslation } from '@/hooks/useTranslation';
import { ScreenErrorBoundary } from '@/components/ui/ScreenErrorBoundary';
import { useThemeColors } from '@/hooks/useThemeColors';
import { useIsOffline } from '@/hooks/useIsOffline';
import { BrandedRefreshControl } from '@/components/ui/BrandedRefreshControl';
import { rtlFlexRow, rtlTextAlign, rtlBorderStart, rtlMargin, rtlAbsoluteEnd, rtlChevron } from '@/utils/rtl';
import { TypingIndicator } from '@/components/risalah/TypingIndicator';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

type TabKey = 'chats' | 'groups';

// TypingDots removed — now using shared <TypingIndicator /> from @/components/risalah



const ConversationRow = memo(function ConversationRow({
  item,
  userId,
  onPress,
  isOnline,
  isTyping,
}: {
  item: Conversation;
  userId?: string;
  onPress: () => void;
  isOnline?: boolean;
  isTyping?: boolean;
}) {
  const { t, isRTL } = useTranslation();
  const tc = useThemeColors();

  function conversationName(convo: Conversation, myId?: string): string {
    if (convo.isGroup) return convo.groupName ?? t('risalah.group');
    const other = convo.members.find((m) => m.user.id !== myId);
    return other?.user.displayName ?? t('risalah.chat');
  }

  function conversationAvatar(convo: Conversation, myId?: string): string | undefined {
    if (convo.isGroup) return convo.groupAvatarUrl;
    const other = convo.members.find((m) => m.user.id !== myId);
    return other?.user.avatarUrl;
  }
  const name = conversationName(item, userId);
  const avi = conversationAvatar(item, userId);
  const time = item.lastMessageAt
    ? formatDistanceToNowStrict(new Date(item.lastMessageAt), { addSuffix: false, locale: getDateFnsLocale() })
    : '';
  const hasUnread = (item.unreadCount ?? 0) > 0;
  const otherMember = item.members.find(m => m.user.id !== userId);
  const lastMessageRead = otherMember && item.lastMessageAt && otherMember.lastReadAt && new Date(otherMember.lastReadAt) >= new Date(item.lastMessageAt);

  const scale = useSharedValue(1);
  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <AnimatedPressable
      style={[styles.chatItem, { flexDirection: rtlFlexRow(isRTL) }, hasUnread && rtlBorderStart(isRTL, 3, colors.emerald), animStyle]}
      onPress={onPress}
      onPressIn={() => { scale.value = withSpring(0.98, animation.spring.snappy); }}
      onPressOut={() => { scale.value = withSpring(1, animation.spring.snappy); }}
      accessibilityLabel={`${item.isGroup ? t('risalah.group') : t('risalah.chat')} with ${name}`}
      accessibilityRole="button"
      accessibilityHint={t('accessibility.openConversation')}
    >
      <Avatar uri={avi} name={name} size="lg" showOnline={!item.isGroup && isOnline} />
      <View style={styles.chatInfo}>
        <View style={[styles.chatTopRow, { flexDirection: rtlFlexRow(isRTL) }]}>
          <Text style={[styles.chatName, { color: tc.text.primary }, hasUnread && styles.chatNameUnread, { textAlign: rtlTextAlign(isRTL) }, rtlMargin(isRTL, 0, spacing.sm)]} numberOfLines={1}>
            {name}
          </Text>
          <Text style={[styles.chatTime, { color: tc.text.tertiary }, hasUnread && styles.chatTimeUnread]}>{time}</Text>
        </View>
        <View style={[styles.chatBottomRow, { flexDirection: rtlFlexRow(isRTL) }]}>
          {isTyping ? (
            <TypingIndicator label={t('risalah.typing')} dotSize={4} variant="inline" />
          ) : (
            <Text
              style={[styles.chatPreview, { color: tc.text.tertiary }, hasUnread && [styles.chatPreviewUnread, { color: tc.text.secondary }]]}
              numberOfLines={1}
            >
              {item.lastMessageText || t('risalah.noMessages')}
            </Text>
          )}
          {!item.isGroup && !isTyping && lastMessageRead && (
            <Icon name="check-check" size={12} color={colors.emerald} />
          )}
          {!item.isGroup && !isTyping && !lastMessageRead && item.lastMessageAt && (
            <Icon name="check" size={12} color={tc.text.tertiary} />
          )}
          {item.isMuted && (
            <Icon name="volume-x" size={14} color={tc.text.tertiary} />
          )}
        </View>
      </View>
      {hasUnread && (
        <Badge count={item.unreadCount ?? 0} color={colors.emerald} size="sm" />
      )}
    </AnimatedPressable>
  );
});

export default function RisalahScreen() {
  const router = useRouter();
  const { user } = useUser();
  const haptic = useContextualHaptic();
  const { t, isRTL } = useTranslation();
  const tc = useThemeColors();
  const isOffline = useIsOffline();
  const queryClient = useQueryClient();

  const TABS = useMemo(() => [
    { key: 'chats', label: t('risalah.chats') },
    { key: 'groups', label: t('risalah.groups') },
  ], [t]);
  const setUnreadMessages = useStore((s) => s.setUnreadMessages);
  const { socket, isConnected: socketConnected } = useSocket();
  const [onlineUsers, setOnlineUsers] = useState<Set<string>>(new Set());
  const [typingUsers, setTypingUsers] = useState<Map<string, Set<string>>>(new Map());
  const [activeTab, setActiveTab] = useState<TabKey>('chats');
  const [filterChip, setFilterChip] = useState<'all' | 'unread' | 'groups'>('all');
  const [openNewConvoSheet, setOpenNewConvoSheet] = useState(false);

  const listRef = useRef<FlatList<Conversation>>(null);
  useScrollToTop(listRef);
  // D42-#20: Prevent duplicate navigation on rapid taps
  const isNavigating = useRef(false);
  const hasAnimatedSkeletons = useRef(false);

  // useScrollToTop handles scroll-to-top on tab press — no need for a separate focus listener
  // which would reset scroll position when returning from sub-screens

  // Register event listeners on the shared socket for conversation list updates
  useEffect(() => {
    if (!socket) return;

    const handleUserOnline = ({ userId }: { userId: string }) => {
      setOnlineUsers(prev => new Set(prev).add(userId));
    };

    const handleUserOffline = ({ userId }: { userId: string }) => {
      setOnlineUsers(prev => {
        const next = new Set(prev);
        next.delete(userId);
        return next;
      });
    };

    const handleUserTyping = ({ conversationId, userId, isTyping }: { conversationId: string; userId: string; isTyping: boolean }) => {
      setTypingUsers(prev => {
        const next = new Map(prev);
        const currentSet = next.get(conversationId) ?? new Set();
        if (isTyping) {
          currentSet.add(userId);
        } else {
          currentSet.delete(userId);
        }
        if (currentSet.size === 0) {
          next.delete(conversationId);
        } else {
          next.set(conversationId, currentSet);
        }
        return next;
      });
    };

    // On reconnect, re-join all conversation rooms (fixes stale presence after network drop)
    const handleConnect = () => {
      const convos = queryClient.getQueryData<Conversation[]>(['conversations']);
      if (convos) {
        for (const convo of convos) {
          socket.emit('join_conversation', { conversationId: convo.id });
        }
      }
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
    };

    // Refetch conversations on new messages so list stays fresh
    const handleNewMessage = () => {
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
    };

    socket.on('user_online', handleUserOnline);
    socket.on('user_offline', handleUserOffline);
    socket.on('user_typing', handleUserTyping);
    socket.on('connect', handleConnect);
    socket.on('new_message', handleNewMessage);

    // If already connected when this effect runs, do initial room joins
    if (socket.connected) {
      handleConnect();
    }

    return () => {
      socket.off('user_online', handleUserOnline);
      socket.off('user_offline', handleUserOffline);
      socket.off('user_typing', handleUserTyping);
      socket.off('connect', handleConnect);
      socket.off('new_message', handleNewMessage);
    };
  }, [socket, queryClient]);

  const { data: conversations, isLoading, isError, isRefetching, refetch } = useQuery({
    queryKey: ['conversations'],
    queryFn: () => messagesApi.getConversations(),
    refetchInterval: 60_000, // Poll every 60s so unread badge updates even when socket is disconnected
  });

  // Join conversation rooms so we receive typing events
  useEffect(() => {
    if (!socket?.connected || !conversations) return;
    const convos = conversations as Conversation[];
    for (const convo of convos) {
      socket.emit('join_conversation', { conversationId: convo.id });
    }
  }, [socket, socketConnected, conversations]);

  const archiveMutation = useMutation({
    mutationFn: (conversationId: string) => messagesApi.archiveConversation(conversationId),
    onMutate: async (conversationId: string) => {
      await queryClient.cancelQueries({ queryKey: ['conversations'] });
      const previous = queryClient.getQueryData<Conversation[]>(['conversations']);
      // Optimistically remove from list
      queryClient.setQueryData<Conversation[]>(['conversations'], (old) =>
        old ? old.filter((c) => c.id !== conversationId) : old
      );
      return { previous };
    },
    onSuccess: () => {
      showToast({ message: t('risalah.archived'), variant: 'success' });
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(['conversations'], context.previous);
      }
      showToast({ message: t('common.somethingWentWrong'), variant: 'error' });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
    },
  });

  const handleRefresh = useCallback(() => { refetch(); }, [refetch]);

  const all: Conversation[] = (conversations as Conversation[]) ?? [];

  useEffect(() => {
    const total = all.reduce((sum, c) => sum + (c.unreadCount ?? 0), 0);
    setUnreadMessages(total);
  }, [all, setUnreadMessages]);

  const filtered = all.filter((c) => {
    if (filterChip === 'groups') return c.isGroup;
    const tabMatch = activeTab === 'groups' ? c.isGroup : !c.isGroup;
    if (!tabMatch) return false;
    if (filterChip === 'unread') return (c.unreadCount ?? 0) > 0;
    return true;
  });

  const archivedCount = useStore((s) => s.archivedConversationsCount);

  const listEmpty = useMemo(() => {
    const shouldAnimate = !hasAnimatedSkeletons.current;
    if (isLoading) hasAnimatedSkeletons.current = true;
    return isError ? (
      <EmptyState icon="globe" title={t('common.somethingWentWrong')} subtitle={t('common.pullToRetry')} actionLabel={t('common.retry')} onAction={() => refetch()} />
    ) : isLoading ? (
      <View>
        <Animated.View entering={shouldAnimate ? FadeInUp.delay(0).duration(300) : undefined}>
          <Skeleton.ConversationItem />
        </Animated.View>
        <Animated.View entering={shouldAnimate ? FadeInUp.delay(80).duration(300) : undefined}>
          <Skeleton.ConversationItem />
        </Animated.View>
        <Animated.View entering={shouldAnimate ? FadeInUp.delay(160).duration(300) : undefined}>
          <Skeleton.ConversationItem />
        </Animated.View>
        <Animated.View entering={shouldAnimate ? FadeInUp.delay(240).duration(300) : undefined}>
          <Skeleton.ConversationItem />
        </Animated.View>
      </View>
    ) : (
      <EmptyState
        icon="mail"
        title={activeTab === 'groups' ? t('risalah.noGroupsYet') : t('risalah.yourConversations')}
        subtitle={
          activeTab === 'groups'
            ? t('risalah.createGroupHint')
            : t('risalah.messagesHint')
        }
        actionLabel={t('risalah.newMessage')}
        onAction={() => router.push('/(screens)/new-conversation')}
      />
    );
  }, [isLoading, isError, activeTab, router, t, refetch]);

  const listHeader = useMemo(() => {
    if (archivedCount === 0) return null;
    return (
      <Pressable
        style={[styles.archivedRow, { flexDirection: rtlFlexRow(isRTL), borderBottomColor: tc.border }]}
        onPress={() => router.push('/(screens)/archive')}
        accessibilityLabel={t('accessibility.archivedConversations')}
        accessibilityRole="button"
      >
        <Icon name="layers" size="sm" color={tc.text.secondary} />
        <Text style={[styles.archivedText, { color: tc.text.secondary }]}>{t('risalah.archived')}</Text>
        <Badge count={archivedCount} color={tc.text.tertiary} size="sm" />
        <View style={{ flex: 1 }} />
        <Icon name={rtlChevron(isRTL, 'forward')} size="sm" color={tc.text.tertiary} />
      </Pressable>
    );
  }, [archivedCount, router, isRTL, t, tc.border, tc.text.secondary, tc.text.tertiary]);

  const keyExtractor = useCallback((item: Conversation) => item.id, []);
  const renderItem = useCallback(({ item }: { item: Conversation }) => {
    const otherUserId = item.isGroup ? undefined : item.members.find(m => m.user.id !== user?.id)?.user.id;
    const isOnline = otherUserId ? onlineUsers.has(otherUserId) : false;
    const isTyping = (typingUsers.get(item.id)?.size ?? 0) > 0;
    const isPinned = !!item.isPinned;
    const renderRightActions = () => (
      <View style={{ flexDirection: 'row' }}>
        <Pressable
          style={[styles.archiveAction, { backgroundColor: colors.emerald }]}
          onPress={async () => {
            haptic.tick();
            try {
              await messagesApi.pinConversation(item.id, !isPinned);
              queryClient.invalidateQueries({ queryKey: ['conversations'] });
              showToast({ message: isPinned ? t('messages.unpinned', 'Unpinned') : t('messages.pinned', 'Pinned'), variant: 'success' });
            } catch {
              showToast({ message: t('common.somethingWentWrong'), variant: 'error' });
            }
          }}
          accessibilityLabel={isPinned ? t('messages.unpin', 'Unpin') : t('messages.pin', 'Pin')}
          accessibilityRole="button"
        >
          <Icon name="map-pin" size="sm" color={colors.text.onColor} />
        </Pressable>
        <Pressable
          style={styles.archiveAction}
          onPress={() => { haptic.tick(); archiveMutation.mutate(item.id); }}
          accessibilityLabel={t('accessibility.archiveConversation')}
          accessibilityRole="button"
        >
          <Icon name="archive" size="sm" color={tc.text.primary} />
        </Pressable>
      </View>
    );

    return (
      <Swipeable
        renderRightActions={renderRightActions}
        overshootRight={false}
        rightThreshold={40}
      >
        <ConversationRow
          item={item}
          userId={user?.id}
          onPress={() => {
            if (isNavigating.current) return;
            isNavigating.current = true;
            router.push(`/(screens)/conversation/${item.id}`);
            setTimeout(() => { isNavigating.current = false; }, 500);
          }}
          isOnline={isOnline}
          isTyping={isTyping}
        />
      </Swipeable>
    );
  }, [user?.id, router, onlineUsers, typingUsers, archiveMutation, t, haptic, queryClient, tc.text.primary, tc.bg]);
  const getItemLayout = useCallback((_: ArrayLike<Conversation> | null | undefined, index: number) => ({
    length: 72,
    offset: 72 * index,
    index,
  }), []);

  // Stable style refs — avoid creating new arrays/objects every render
  const containerStyle = useMemo(() => [styles.container, { backgroundColor: tc.bg }] , [tc.bg]);
  const headerRowStyle = useMemo(() => [styles.header, { flexDirection: rtlFlexRow(isRTL) }], [isRTL]);
  const headerRightStyle = useMemo(() => [styles.headerRight, { flexDirection: rtlFlexRow(isRTL) }], [isRTL]);
  const filterChipRowStyle = useMemo(() => [styles.filterChipRow, { flexDirection: rtlFlexRow(isRTL) }], [isRTL]);

  return (
    <ScreenErrorBoundary>
    <SafeAreaView style={containerStyle} edges={['top']}>
      <View style={headerRowStyle}>
        <Text style={[styles.logo, { textAlign: rtlTextAlign(isRTL) }]}>{t('tabs.risalah')}</Text>
        <View style={headerRightStyle}>
          <Pressable
            hitSlop={8}
            onPress={() => { haptic.navigate(); router.push('/(screens)/search'); }}
            accessibilityLabel={t('common.search')}
            accessibilityRole="button"
            accessibilityHint={t('accessibility.searchHint')}
          >
            <Icon name="search" size="sm" color={tc.text.primary} />
          </Pressable>
          <Pressable
            hitSlop={8}
            onPress={() => { haptic.navigate(); navigate('/(screens)/saved-messages'); }}
            accessibilityLabel={t('risalah.savedMessages')}
            accessibilityRole="button"
          >
            <Icon name="bookmark" size="sm" color={tc.text.primary} />
          </Pressable>
          <Pressable
            hitSlop={8}
            onPress={() => { haptic.navigate(); navigate('/(screens)/call-history'); }}
            accessibilityLabel={t('risalah.call')}
            accessibilityRole="button"
          >
            <Icon name="phone" size="sm" color={tc.text.primary} />
          </Pressable>
          <Pressable
            hitSlop={8}
            onPress={() => { haptic.navigate(); setOpenNewConvoSheet(true); }}
            accessibilityLabel={t('accessibility.newConversation')}
            accessibilityRole="button"
            accessibilityHint={t('accessibility.newConversationHint')}
          >
            <Icon name="pencil" size="sm" color={tc.text.primary} />
          </Pressable>
        </View>
      </View>

      <BottomSheet visible={openNewConvoSheet} onClose={() => setOpenNewConvoSheet(false)}>
        <BottomSheetItem
          label={t('risalah.newMessage')}
          icon={<Icon name="mail" size="sm" color={tc.text.primary} />}
          onPress={() => {
            setOpenNewConvoSheet(false);
            router.push('/(screens)/new-conversation');
          }}
        />
        <BottomSheetItem
          label={t('risalah.newGroup')}
          icon={<Icon name="users" size="sm" color={tc.text.primary} />}
          onPress={() => {
            setOpenNewConvoSheet(false);
            router.push('/(screens)/create-group');
          }}
        />
        <BottomSheetItem
          label={t('risalah.chatFolders')}
          icon={<Icon name="layers" size="sm" color={tc.text.primary} />}
          onPress={() => {
            setOpenNewConvoSheet(false);
            navigate('/(screens)/chat-folders');
          }}
        />
        <BottomSheetItem
          label={t('dmNotes.title')}
          icon={<Icon name="edit" size="sm" color={tc.text.primary} />}
          onPress={() => {
            setOpenNewConvoSheet(false);
            navigate('/(screens)/dm-note-editor');
          }}
        />
        <BottomSheetItem
          label={t('risalah.createBroadcast')}
          icon={<Icon name="globe" size="sm" color={tc.text.primary} />}
          onPress={() => {
            setOpenNewConvoSheet(false);
            navigate('/(screens)/create-broadcast');
          }}
        />
      </BottomSheet>

      {/* Socket disconnect indicator */}
      {!isOffline && !socketConnected && (
        <View style={styles.socketDisconnect}>
          <Icon name="globe" size="xs" color={colors.gold} />
          <Text style={styles.socketDisconnectText}>{t('network.reconnecting', 'Reconnecting...')}</Text>
        </View>
      )}

      {/* Tabs */}
      <TabSelector
        tabs={TABS}
        activeKey={activeTab}
        onTabChange={(key) => setActiveTab(key as TabKey)}
      />

      {/* Filter chips */}
      <View style={filterChipRowStyle}>
        {(['all', 'unread', 'groups'] as const).map((chip) => (
          <Pressable
            key={chip}
            style={[styles.filterChip, { backgroundColor: tc.surface, borderColor: tc.border }, filterChip === chip && styles.filterChipSelected]}
            onPress={() => setFilterChip(chip)}
            accessibilityLabel={chip === 'groups' ? t('risalah.groups') : chip === 'unread' ? t('risalah.unread') : t('risalah.all')}
            accessibilityRole="button"
          >
            <Text style={[styles.filterChipText, { color: tc.text.secondary }, filterChip === chip && styles.filterChipTextSelected]}>
              {chip === 'groups' ? t('risalah.groups') : chip === 'unread' ? t('risalah.unread') : t('risalah.all')}
            </Text>
          </Pressable>
        ))}
      </View>

      <FlatList
        ref={listRef}
        data={filtered}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        getItemLayout={getItemLayout}
        maxToRenderPerBatch={5}
        windowSize={5}
        removeClippedSubviews={true}
        refreshControl={
          <BrandedRefreshControl
            refreshing={isRefetching && !isLoading}
            onRefresh={handleRefresh}
          />
        }
        contentContainerStyle={{ paddingBottom: tabBar.height + spacing.base }}
        ListHeaderComponent={listHeader}
        ListEmptyComponent={listEmpty}
      />
      {/* Channels FAB */}
      <Pressable
        style={[styles.fab]}
        onPress={() => router.push('/(screens)/broadcast-channels')}
        accessibilityLabel={t('accessibility.broadcastChannels')}
        accessibilityRole="button"
      >
        <Icon name="hash" size="lg" color={tc.text.primary} />
      </Pressable>
    </SafeAreaView>
    </ScreenErrorBoundary>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
  },
  logo: { color: colors.emerald, fontSize: fontSize.xl, fontWeight: '700', fontFamily: fonts.headingBold },
  headerRight: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: spacing.lg },
  socketDisconnect: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    paddingVertical: spacing.xs,
    gap: spacing.xs,
    backgroundColor: colors.active.gold10,
  },
  socketDisconnectText: {
    color: colors.gold,
    fontSize: fontSize.xs,
    fontFamily: fonts.bodyMedium,
  },
  chatItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    gap: spacing.md,
  },
  chatItemUnread: {},
  chatInfo: { flex: 1 },
  chatTopRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.xs },
  chatName: {
    color: colors.text.primary,
    fontWeight: '500',
    fontSize: fontSize.base,
    flex: 1,
  },
  chatNameUnread: { fontWeight: '700' },
  chatTime: { color: colors.text.tertiary, fontSize: fontSize.xs },
  chatTimeUnread: { color: colors.emerald },
  chatBottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  chatPreview: { color: colors.text.tertiary, fontSize: fontSize.sm, flex: 1 },
  chatPreviewUnread: { color: colors.text.secondary },
  // Typing styles moved to shared <TypingIndicator /> component
  filterChipRow: {
    flexDirection: 'row',
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
  },
  filterChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.full,
    borderWidth: 1,
  },
  filterChipSelected: {
    backgroundColor: colors.emerald,
    borderColor: colors.emerald,
  },
  filterChipText: {
    color: colors.text.secondary,
    fontSize: fontSize.sm,
    fontWeight: '500',
  },
  filterChipTextSelected: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  archivedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    gap: spacing.sm,
    borderBottomWidth: 1,
  },
  archivedText: {
    color: colors.text.secondary,
    fontSize: fontSize.sm,
    fontWeight: '500',
  },
  archiveAction: {
    backgroundColor: colors.emerald,
    justifyContent: 'center',
    alignItems: 'center',
    width: 80,
    borderRadius: radius.md,
    marginVertical: spacing.xs,
    marginEnd: spacing.base,
  },
  fab: {
    position: 'absolute',
    bottom: tabBar.height + 16,
    end: spacing.base,
    width: 56,
    height: 56,
    borderRadius: radius.full,
    backgroundColor: colors.emerald,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
});
