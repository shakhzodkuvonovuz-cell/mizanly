import { useCallback, useEffect, useRef, useState, useMemo, memo } from 'react';
import { View, Text, FlatList, StyleSheet, Pressable, RefreshControl } from 'react-native';
import { useScrollToTop } from '@react-navigation/native';
import { useQuery } from '@tanstack/react-query';
import { useRouter, useNavigation } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useUser } from '@clerk/clerk-expo';
import { formatDistanceToNowStrict } from 'date-fns';
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
}: {
  item: Conversation;
  userId?: string;
  onPress: () => void;
}) {
  const name = conversationName(item, userId);
  const avi = conversationAvatar(item, userId);
  const time = item.lastMessageAt
    ? formatDistanceToNowStrict(new Date(item.lastMessageAt), { addSuffix: false })
    : '';
  const hasUnread = (item.unreadCount ?? 0) > 0;

  const scale = useSharedValue(1);
  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <AnimatedPressable
      style={[styles.chatItem, animStyle]}
      onPress={onPress}
      onPressIn={() => { scale.value = withSpring(0.98, animation.spring.snappy); }}
      onPressOut={() => { scale.value = withSpring(1, animation.spring.snappy); }}
      accessibilityLabel={`${item.isGroup ? 'Group' : 'Chat'} with ${name}`}
      accessibilityRole="button"
      accessibilityHint="Open conversation"
    >
      <Avatar uri={avi} name={name} size="lg" showOnline={!item.isGroup} />
      <View style={styles.chatInfo}>
        <View style={styles.chatTopRow}>
          <Text style={[styles.chatName, hasUnread && styles.chatNameUnread]} numberOfLines={1}>
            {name}
          </Text>
          <Text style={[styles.chatTime, hasUnread && styles.chatTimeUnread]}>{time}</Text>
        </View>
        <View style={styles.chatBottomRow}>
          <Text
            style={[styles.chatPreview, hasUnread && styles.chatPreviewUnread]}
            numberOfLines={1}
          >
            {item.lastMessageText || 'No messages yet'}
          </Text>
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
  const [activeTab, setActiveTab] = useState<TabKey>('chats');
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

  const { data: conversations, isLoading, isRefetching, refetch } = useQuery({
    queryKey: ['conversations'],
    queryFn: () => messagesApi.getConversations(),
  });

  const handleRefresh = useCallback(() => { refetch(); }, [refetch]);

  const all: Conversation[] = (conversations as Conversation[]) ?? [];

  useEffect(() => {
    const total = all.reduce((sum, c) => sum + (c.unreadCount ?? 0), 0);
    setUnreadMessages(total);
  }, [all, setUnreadMessages]);

  const filtered = all.filter((c) =>
    activeTab === 'groups' ? c.isGroup : !c.isGroup,
  );

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
        title={activeTab === 'groups' ? 'No groups yet' : 'No conversations'}
        subtitle={
          activeTab === 'groups'
            ? 'Create a group to chat with multiple people'
            : 'Message someone to get started'
        }
      />
    )
  ), [isLoading, activeTab]);

  const keyExtractor = useCallback((item: Conversation) => item.id, []);
  const renderItem = useCallback(({ item }: { item: Conversation }) => (
    <ConversationRow
      item={item}
      userId={user?.id}
      onPress={() => router.push(`/(screens)/conversation/${item.id}`)}
    />
  ), [user?.id, router]);
  const getItemLayout = useCallback((_: any, index: number) => ({
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
        ListEmptyComponent={listEmpty}
      />
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
  logo: { color: colors.text.primary, fontSize: fontSize.xl, fontWeight: '700' },
  chatItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    gap: spacing.md,
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
});
