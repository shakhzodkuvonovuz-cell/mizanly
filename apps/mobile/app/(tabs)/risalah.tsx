import { useCallback, useEffect, useRef, useState, useMemo, memo } from 'react';
import { View, Text, FlatList, StyleSheet, Pressable } from 'react-native';
import { useScrollToTop } from '@react-navigation/native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { navigate } from '@/utils/navigation';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Swipeable } from 'react-native-gesture-handler';
import { useUser, useAuth } from '@clerk/clerk-expo';
import { formatDistanceToNowStrict } from 'date-fns';
import { getDateFnsLocale } from '@/utils/localeFormat';
import { io, Socket } from 'socket.io-client';
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
import { messagesApi, SOCKET_URL } from '@/services/api';
import type { Conversation } from '@/types';
import { useTranslation } from '@/hooks/useTranslation';
import { ScreenErrorBoundary } from '@/components/ui/ScreenErrorBoundary';
import { useThemeColors } from '@/hooks/useThemeColors';
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
          <Text style={[styles.chatName, hasUnread && styles.chatNameUnread, { textAlign: rtlTextAlign(isRTL) }, rtlMargin(isRTL, 0, spacing.sm)]} numberOfLines={1}>
            {name}
          </Text>
          <Text style={[styles.chatTime, hasUnread && styles.chatTimeUnread]}>{time}</Text>
        </View>
        <View style={[styles.chatBottomRow, { flexDirection: rtlFlexRow(isRTL) }]}>
          {isTyping ? (
            <TypingIndicator label={t('risalah.typing')} dotSize={4} variant="inline" />
          ) : (
            <Text
              style={[styles.chatPreview, hasUnread && styles.chatPreviewUnread]}
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
  const queryClient = useQueryClient();

  const TABS = useMemo(() => [
    { key: 'chats', label: t('risalah.chats') },
    { key: 'groups', label: t('risalah.groups') },
  ], [t]);
  const setUnreadMessages = useStore((s) => s.setUnreadMessages);
  const { getToken } = useAuth();
  const [onlineUsers, setOnlineUsers] = useState<Set<string>>(new Set());
  const [typingUsers, setTypingUsers] = useState<Map<string, Set<string>>>(new Map());
  const socketRef = useRef<Socket | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>('chats');
  const [filterChip, setFilterChip] = useState<'all' | 'unread' | 'groups'>('all');
  const [openNewConvoSheet, setOpenNewConvoSheet] = useState(false);

  const listRef = useRef<FlatList<Conversation>>(null);
  useScrollToTop(listRef);

  // useScrollToTop handles scroll-to-top on tab press — no need for a separate focus listener
  // which would reset scroll position when returning from sub-screens

  useEffect(() => {
    let mounted = true;
    let socket: Socket | null = null;
    // SOCKET_URL imported from @/services/api

    const connect = async () => {
      const token = await getToken();
      if (!token || !mounted) return;

      socket = io(SOCKET_URL, {
        auth: { token },
        transports: ['websocket'],
        reconnection: true,
        reconnectionAttempts: 10,
        reconnectionDelay: 1000,
      });

      // Refresh token on reconnect attempt (handles expired tokens)
      socket.on('connect_error', async () => {
        if (!mounted || !socket) return;
        const freshToken = await getToken({ skipCache: true });
        if (freshToken && socket) {
          socket.auth = { token: freshToken };
        }
      });

      socket.on('user_online', ({ userId }: { userId: string }) => {
        if (!mounted) return;
        setOnlineUsers(prev => new Set(prev).add(userId));
      });

      socket.on('user_offline', ({ userId }: { userId: string }) => {
        if (!mounted) return;
        setOnlineUsers(prev => {
          const next = new Set(prev);
          next.delete(userId);
          return next;
        });
      });

      socket.on('user_typing', ({ conversationId, userId, isTyping }: { conversationId: string; userId: string; isTyping: boolean }) => {
        if (!mounted) return;
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
      });

      // Refetch conversations on new messages so list stays fresh
      socket.on('new_message', () => {
        if (!mounted) return;
        queryClient.invalidateQueries({ queryKey: ['conversations'] });
      });

      socketRef.current = socket;
    };

    connect();
    return () => {
      mounted = false;
      socket?.disconnect();
      socketRef.current = null;
    };
  }, [getToken, queryClient]);

  const { data: conversations, isLoading, isError, isRefetching, refetch } = useQuery({
    queryKey: ['conversations'],
    queryFn: () => messagesApi.getConversations(),
  });

  // Join conversation rooms so we receive typing events
  useEffect(() => {
    const socket = socketRef.current;
    if (!socket?.connected || !conversations) return;
    const convos = conversations as Conversation[];
    for (const convo of convos) {
      socket.emit('join_conversation', { conversationId: convo.id });
    }
  }, [conversations]);

  const archiveMutation = useMutation({
    mutationFn: (conversationId: string) => messagesApi.archiveConversation(conversationId),
    onSuccess: () => {
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

  const listEmpty = useMemo(() => (
    isError ? (
      <EmptyState icon="globe" title={t('common.somethingWentWrong')} subtitle={t('common.pullToRetry')} actionLabel={t('common.retry')} onAction={() => refetch()} />
    ) : isLoading ? (
      <View>
        <Animated.View entering={FadeInUp.delay(0).duration(300)}>
          <Skeleton.ConversationItem />
        </Animated.View>
        <Animated.View entering={FadeInUp.delay(80).duration(300)}>
          <Skeleton.ConversationItem />
        </Animated.View>
        <Animated.View entering={FadeInUp.delay(160).duration(300)}>
          <Skeleton.ConversationItem />
        </Animated.View>
        <Animated.View entering={FadeInUp.delay(240).duration(300)}>
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
    )
  ), [isLoading, isError, activeTab, router, t]);

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
  }, [archivedCount, router, isRTL, t, tc.border]);

  const keyExtractor = useCallback((item: Conversation) => item.id, []);
  const renderItem = useCallback(({ item }: { item: Conversation }) => {
    const otherUserId = item.isGroup ? undefined : item.members.find(m => m.user.id !== user?.id)?.user.id;
    const isOnline = otherUserId ? onlineUsers.has(otherUserId) : false;
    const isTyping = (typingUsers.get(item.id)?.size ?? 0) > 0;
    const renderRightActions = () => (
      <Pressable
        style={styles.archiveAction}
        onPress={() => archiveMutation.mutate(item.id)}
        accessibilityLabel={t('accessibility.archiveConversation')}
        accessibilityRole="button"
      >
        <Icon name="archive" size="sm" color={tc.text.primary} />
      </Pressable>
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
          onPress={() => router.push(`/(screens)/conversation/${item.id}`)}
          isOnline={isOnline}
          isTyping={isTyping}
        />
      </Swipeable>
    );
  }, [user?.id, router, onlineUsers, typingUsers, archiveMutation, t]);
  const getItemLayout = useCallback((_: ArrayLike<Conversation> | null | undefined, index: number) => ({
    length: 72,
    offset: 72 * index,
    index,
  }), []);

  return (
    <ScreenErrorBoundary>
    <SafeAreaView style={[styles.container, { backgroundColor: tc.bg }]} edges={['top']}>
      <View style={[styles.header, { flexDirection: rtlFlexRow(isRTL) }]}>
        <Text style={[styles.logo, { textAlign: rtlTextAlign(isRTL) }]}>{t('tabs.risalah')}</Text>
        <View style={[styles.headerRight, { flexDirection: rtlFlexRow(isRTL) }]}>
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

      {/* Tabs */}
      <TabSelector
        tabs={TABS}
        activeKey={activeTab}
        onTabChange={(key) => setActiveTab(key as TabKey)}
      />

      {/* Filter chips */}
      <View style={[styles.filterChipRow, { flexDirection: rtlFlexRow(isRTL) }]}>
        {(['all', 'unread', 'groups'] as const).map((chip) => (
          <Pressable
            key={chip}
            style={[styles.filterChip, { backgroundColor: tc.surface, borderColor: tc.border }, filterChip === chip && styles.filterChipSelected]}
            onPress={() => setFilterChip(chip)}
            accessibilityLabel={chip === 'groups' ? t('risalah.groups') : chip === 'unread' ? t('risalah.unread') : t('risalah.all')}
            accessibilityRole="button"
          >
            <Text style={[styles.filterChipText, filterChip === chip && styles.filterChipTextSelected]}>
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
  // TODO: colors.dark.bg overridden by inline style with tc.bg from useThemeColors()
  container: { flex: 1, backgroundColor: colors.dark.bg },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
  },
  logo: { color: colors.emerald, fontSize: fontSize.xl, fontWeight: '700', fontFamily: fonts.headingBold },
  headerRight: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: spacing.lg },
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
  // TODO: colors.dark.surface/border overridden by inline style with tc.surface/tc.border from useThemeColors()
  filterChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.full,
    backgroundColor: colors.dark.surface,
    borderWidth: 1,
    borderColor: colors.dark.border,
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
  // TODO: colors.dark.border overridden by inline style with tc.border from useThemeColors()
  archivedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    gap: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.dark.border,
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
