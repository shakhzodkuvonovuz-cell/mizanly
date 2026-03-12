import { useCallback, useEffect, useRef, useState, useMemo, memo } from 'react';
import { View, Text, FlatList, StyleSheet, Pressable, RefreshControl } from 'react-native';
import { useScrollToTop } from '@react-navigation/native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter, useNavigation } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Swipeable } from 'react-native-gesture-handler';
import { useUser, useAuth } from '@clerk/clerk-expo';
import { formatDistanceToNowStrict } from 'date-fns';
import { io, Socket } from 'socket.io-client';
import Animated, {
  useAnimatedStyle,
  withSpring,
  useSharedValue,
} from 'react-native-reanimated';
import { Avatar } from '@/components/ui/Avatar';
import { Icon } from '@/components/ui/Icon';
import { BottomSheet, BottomSheetItem } from '@/components/ui/BottomSheet';
import { Badge } from '@/components/ui/Badge';
import { TabSelector } from '@/components/ui/TabSelector';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { useHaptic } from '@/hooks/useHaptic';
import { colors, spacing, fontSize, radius, animation } from '@/theme';
import { useStore } from '@/store';
import { messagesApi } from '@/services/api';
import type { Conversation } from '@/types';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

type TabKey = 'chats' | 'groups';

const TABS = [
  { key: 'chats', label: 'Chats' },
  { key: 'groups', label: 'Groups' },
];

function conversationName(convo: Conversation, myId?: string): string {
  if (convo.isGroup) return convo.groupName ?? 'Group';
  const other = convo.members.find((m) => m.user.id !== myId);
  return other?.user.displayName ?? 'Chat';
}

function conversationAvatar(convo: Conversation, myId?: string): string | undefined {
  if (convo.isGroup) return convo.groupAvatarUrl;
  const other = convo.members.find((m) => m.user.id !== myId);
  return other?.user.avatarUrl;
}

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
  const name = conversationName(item, userId);
  const avi = conversationAvatar(item, userId);
  const time = item.lastMessageAt
    ? formatDistanceToNowStrict(new Date(item.lastMessageAt), { addSuffix: false })
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
      style={[styles.chatItem, hasUnread && styles.chatItemUnread, animStyle]}
      onPress={onPress}
      onPressIn={() => { scale.value = withSpring(0.98, animation.spring.snappy); }}
      onPressOut={() => { scale.value = withSpring(1, animation.spring.snappy); }}
      accessibilityLabel={`${item.isGroup ? 'Group' : 'Chat'} with ${name}`}
      accessibilityRole="button"
      accessibilityHint="Open conversation"
    >
      <Avatar uri={avi} name={name} size="lg" showOnline={!item.isGroup && isOnline} />
      <View style={styles.chatInfo}>
        <View style={styles.chatTopRow}>
          <Text style={[styles.chatName, hasUnread && styles.chatNameUnread]} numberOfLines={1}>
            {name}
          </Text>
          <Text style={[styles.chatTime, hasUnread && styles.chatTimeUnread]}>{time}</Text>
        </View>
        <View style={styles.chatBottomRow}>
          {isTyping ? (
            <Text style={styles.typingText} numberOfLines={1}>
              typing...
            </Text>
          ) : (
            <Text
              style={[styles.chatPreview, hasUnread && styles.chatPreviewUnread]}
              numberOfLines={1}
            >
              {item.lastMessageText || 'No messages yet'}
            </Text>
          )}
          {!item.isGroup && !isTyping && lastMessageRead && (
            <Icon name="check-check" size={12} color={colors.emerald} />
          )}
          {!item.isGroup && !isTyping && !lastMessageRead && item.lastMessageAt && (
            <Icon name="check" size={12} color={colors.text.tertiary} />
          )}
          {item.isMuted && (
            <Icon name="volume-x" size={14} color={colors.text.tertiary} />
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
  const navigation = useNavigation();
  const { user } = useUser();
  const haptic = useHaptic();
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

  useEffect(() => {
    const unsubscribe = navigation.addListener('tabPress', (e) => {
      // Only if already on this tab
      listRef.current?.scrollToOffset({ offset: 0, animated: true });
    });
    return unsubscribe;
  }, [navigation]);

  useEffect(() => {
    let socket: Socket;
    const connect = async () => {
      const token = await getToken();
      if (!token) return;

      const SOCKET_URL = `${(process.env.EXPO_PUBLIC_API_URL?.replace('/api/v1', '') || 'http://localhost:3000')}/chat`;
      socket = io(SOCKET_URL, {
        auth: { token },
        transports: ['websocket'],
      });

      socket.on('user_online', ({ userId }: { userId: string }) => {
        setOnlineUsers(prev => new Set(prev).add(userId));
      });

      socket.on('user_offline', ({ userId }: { userId: string }) => {
        setOnlineUsers(prev => {
          const next = new Set(prev);
          next.delete(userId);
          return next;
        });
      });

      socket.on('user_typing', ({ conversationId, userId, isTyping }: { conversationId: string; userId: string; isTyping: boolean }) => {
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

      socketRef.current = socket;
    };

    connect();
    return () => { socket?.disconnect(); };
  }, [getToken]);

  const { data: conversations, isLoading, isRefetching, refetch } = useQuery({
    queryKey: ['conversations'],
    queryFn: () => messagesApi.getConversations(),
  });

  const queryClient = useQueryClient();
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
    isLoading ? (
      <View>
        <Skeleton.ConversationItem />
        <Skeleton.ConversationItem />
        <Skeleton.ConversationItem />
        <Skeleton.ConversationItem />
      </View>
    ) : (
      <EmptyState
        icon="mail"
        title={activeTab === 'groups' ? 'No groups yet' : 'Your conversations'}
        subtitle={
          activeTab === 'groups'
            ? 'Create a group to chat with multiple people'
            : 'Messages with friends and groups will appear here'
        }
        actionLabel="New Message"
        onAction={() => router.push('/(screens)/new-conversation')}
      />
    )
  ), [isLoading, activeTab, router]);

  const listHeader = useMemo(() => {
    if (archivedCount === 0) return null;
    return (
      <Pressable
        style={styles.archivedRow}
        onPress={() => router.push('/(screens)/archive')}
        accessibilityLabel="Archived conversations"
        accessibilityRole="button"
      >
        <Icon name="layers" size="sm" color={colors.text.secondary} />
        <Text style={styles.archivedText}>Archived</Text>
        <Badge count={archivedCount} color={colors.text.tertiary} size="xs" />
        <View style={{ flex: 1 }} />
        <Icon name="chevron-right" size="sm" color={colors.text.tertiary} />
      </Pressable>
    );
  }, [archivedCount, router]);

  const keyExtractor = useCallback((item: Conversation) => item.id, []);
  const renderItem = useCallback(({ item }: { item: Conversation }) => {
    const otherUserId = item.isGroup ? undefined : item.members.find(m => m.user.id !== user?.id)?.user.id;
    const isOnline = otherUserId ? onlineUsers.has(otherUserId) : false;
    const isTyping = typingUsers.get(item.id)?.size > 0;
    const renderRightActions = () => (
      <Pressable
        style={styles.archiveAction}
        onPress={() => archiveMutation.mutate(item.id)}
        accessibilityLabel="Archive conversation"
        accessibilityRole="button"
      >
        <Icon name="archive" size="sm" color={colors.text.primary} />
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
  }, [user?.id, router, onlineUsers, typingUsers]);
  const getItemLayout = useCallback((_: ArrayLike<Conversation> | null | undefined, index: number) => ({
    length: 72,
    offset: 72 * index,
    index,
  }), []);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.logo}>Risalah</Text>
        <Pressable
          hitSlop={8}
          onPress={() => { haptic.light(); setOpenNewConvoSheet(true); }}
          accessibilityLabel="New conversation"
          accessibilityRole="button"
          accessibilityHint="Start a new chat or group"
        >
          <Icon name="pencil" size="sm" color={colors.text.primary} />
        </Pressable>
      </View>

      <BottomSheet visible={openNewConvoSheet} onClose={() => setOpenNewConvoSheet(false)}>
        <BottomSheetItem
          label="New Message"
          icon={<Icon name="mail" size="sm" color={colors.text.primary} />}
          onPress={() => {
            setOpenNewConvoSheet(false);
            router.push('/(screens)/new-conversation');
          }}
        />
        <BottomSheetItem
          label="New Group"
          icon={<Icon name="users" size="sm" color={colors.text.primary} />}
          onPress={() => {
            setOpenNewConvoSheet(false);
            router.push('/(screens)/create-group');
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
      <View style={styles.filterChipRow}>
        {(['all', 'unread', 'groups'] as const).map((chip) => (
          <Pressable
            key={chip}
            style={[styles.filterChip, filterChip === chip && styles.filterChipSelected]}
            onPress={() => setFilterChip(chip)}
            accessibilityLabel={chip === 'groups' ? 'Groups' : chip === 'unread' ? 'Unread' : 'All'}
            accessibilityRole="button"
          >
            <Text style={[styles.filterChipText, filterChip === chip && styles.filterChipTextSelected]}>
              {chip === 'groups' ? 'Groups' : chip === 'unread' ? 'Unread' : 'All'}
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
          <RefreshControl
            refreshing={isRefetching && !isLoading}
            onRefresh={handleRefresh}
            tintColor={colors.emerald}
          />
        }
        ListHeaderComponent={listHeader}
        ListEmptyComponent={listEmpty}
      />
      {/* Channels FAB */}
      <Pressable
        style={styles.fab}
        onPress={() => router.push('/(screens)/broadcast-channels')}
        accessibilityLabel="Broadcast channels"
        accessibilityRole="button"
      >
        <Icon name="hash" size="lg" color={colors.text.primary} />
      </Pressable>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.dark.bg },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
  },
  logo: { color: colors.emerald, fontSize: fontSize.xl, fontWeight: '700', fontFamily: 'PlayfairDisplay-Bold' },
  chatItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    gap: spacing.md,
  },
  chatItemUnread: {
    borderLeftWidth: 3,
    borderLeftColor: colors.emerald,
  },
  chatInfo: { flex: 1 },
  chatTopRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.xs },
  chatName: {
    color: colors.text.primary,
    fontWeight: '500',
    fontSize: fontSize.base,
    flex: 1,
    marginRight: spacing.sm,
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
  typingText: {
    color: colors.emerald,
    fontSize: fontSize.sm,
    flex: 1,
    fontStyle: 'italic',
  },
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
    marginRight: spacing.base,
  },
  fab: {
    position: 'absolute',
    bottom: spacing['2xl'],
    right: spacing.base,
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
