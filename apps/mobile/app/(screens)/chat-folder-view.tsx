import { useMemo, useCallback } from 'react';
import { View, Text, StyleSheet, Pressable, FlatList } from 'react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useUser } from '@clerk/clerk-expo';
import { GlassHeader } from '@/components/ui/GlassHeader';
import { Avatar } from '@/components/ui/Avatar';
import { Icon } from '@/components/ui/Icon';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { BrandedRefreshControl } from '@/components/ui/BrandedRefreshControl';
import { ScreenErrorBoundary } from '@/components/ui/ScreenErrorBoundary';
import { colors, spacing, fontSize, radius, fonts } from '@/theme';
import { useTranslation } from '@/hooks/useTranslation';
import { useThemeColors } from '@/hooks/useThemeColors';
import { useContextualHaptic } from '@/hooks/useContextualHaptic';
import { messagesApi } from '@/services/api';
import { formatCount } from '@/utils/formatCount';
import { navigate } from '@/utils/navigation';
import type { Conversation } from '@/types';

type FilterKey = 'unread' | 'groups' | 'channels' | 'personal' | 'archived';

const FILTER_META: Record<FilterKey, { labelKey: string; icon: string; color: string }> = {
  unread: { labelKey: 'chatFolders.unread', icon: 'bell', color: colors.extended.blue },
  groups: { labelKey: 'chatFolders.groups', icon: 'users', color: colors.emerald },
  channels: { labelKey: 'risalah.channels', icon: 'globe', color: colors.gold },
  personal: { labelKey: 'risalah.personal', icon: 'user', color: colors.extended.violet },
  archived: { labelKey: 'chatFolders.archived', icon: 'layers', color: colors.text.secondary },
};

function filterConversation(c: Conversation, filterKey: FilterKey): boolean {
  const convo = c as unknown as Record<string, unknown>;
  switch (filterKey) {
    case 'unread': return ((convo.unreadCount as number) ?? 0) > 0;
    case 'groups': return c.isGroup === true;
    case 'channels': return convo.isChannel === true;
    case 'personal': return c.isGroup !== true && convo.isChannel !== true;
    case 'archived': return c.isArchived === true;
    default: return true;
  }
}

function conversationName(convo: Conversation, myId?: string): string {
  if (convo.isGroup) return convo.groupName ?? 'Group';
  if (convo.otherUser) return convo.otherUser.displayName ?? convo.otherUser.username ?? 'Chat';
  const other = convo.members?.find((m) => m.user?.id !== myId);
  return other?.user?.displayName ?? 'Chat';
}

function conversationAvatar(convo: Conversation, myId?: string): string | undefined {
  if (convo.isGroup) return convo.groupAvatarUrl;
  if (convo.otherUser) return convo.otherUser.avatarUrl;
  const other = convo.members?.find((m) => m.user?.id !== myId);
  return other?.user?.avatarUrl;
}

function ChatFolderViewInner() {
  const { filter, folderId } = useLocalSearchParams<{ filter: string; folderId?: string }>();
  const filterKey = (filter as FilterKey) || 'unread';
  const isArchived = filterKey === 'archived';
  const router = useRouter();
  const { user } = useUser();
  const { t } = useTranslation();
  const tc = useThemeColors();
  const haptic = useContextualHaptic();
  const meta = FILTER_META[filterKey] ?? FILTER_META.unread;

  // For archived filter, use the dedicated archived endpoint
  const archivedQuery = useQuery({
    queryKey: ['archived-conversations'],
    queryFn: () => messagesApi.getArchivedConversations(),
    enabled: isArchived && !folderId,
  });

  // For non-archived filters, fetch all conversations
  const conversationsQuery = useQuery({
    queryKey: ['conversations'],
    queryFn: () => messagesApi.getConversations(),
    enabled: !isArchived || !!folderId,
  });

  // For custom folders, fetch the folder to get its conversationIds
  const folderQuery = useQuery({
    queryKey: ['chat-folder', folderId],
    queryFn: () => import('@/services/api').then(m => m.api.get<Record<string, unknown>>(`/chat-folders/${folderId}`)),
    enabled: !!folderId,
  });

  const data = isArchived && !folderId ? archivedQuery.data?.data : conversationsQuery.data;
  const isLoading = isArchived && !folderId ? archivedQuery.isLoading : conversationsQuery.isLoading;
  const isRefetching = isArchived && !folderId ? archivedQuery.isRefetching : conversationsQuery.isRefetching;
  const refetch = isArchived && !folderId ? archivedQuery.refetch : conversationsQuery.refetch;

  const filtered = useMemo(() => {
    if (!data) return [];
    const conversations = data as Conversation[];
    // If viewing a custom folder, filter by conversationIds from folder
    if (folderId && folderQuery.data) {
      const folderData = folderQuery.data as Record<string, unknown>;
      const ids = (folderData.conversationIds as string[]) ?? [];
      // Also apply folder's filterType if present
      const folderFilterType = folderData.filterType as FilterKey | undefined;
      const byId = conversations.filter((c) => ids.includes(c.id));
      if (folderFilterType && FILTER_META[folderFilterType]) {
        return byId.filter((c) => filterConversation(c, folderFilterType));
      }
      return byId;
    }
    // For archived, the API already returns only archived conversations
    if (isArchived) return conversations;
    return conversations.filter((c) => filterConversation(c, filterKey));
  }, [data, filterKey, folderId, folderQuery.data, isArchived]);

  const handlePress = useCallback((convoId: string) => {
    haptic.navigate();
    navigate('/(screens)/conversation/[id]', { id: convoId });
  }, [haptic]);

  const renderItem = useCallback(({ item, index }: { item: Conversation; index: number }) => {
    const name = conversationName(item, user?.id);
    const avatarUri = conversationAvatar(item, user?.id);
    const unread = item.unreadCount ?? 0;
    const lastText = item.lastMessageText;

    return (
      <Animated.View entering={FadeInUp.delay(Math.min(index, 10) * 50).duration(300)}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={name}
          style={({ pressed }) => [styles.conversationItem, { backgroundColor: tc.bgCard, borderColor: tc.border }, pressed && { opacity: 0.7 }]}
          onPress={() => handlePress(item.id)}
          android_ripple={{ color: tc.surface }}
        >
          <Avatar uri={avatarUri} name={name} size="md" showOnline={!isArchived} />
          <View style={styles.convContent}>
            <Text style={[styles.convName, { color: tc.text.primary }]} numberOfLines={1}>{name}</Text>
            {lastText ? (
              <Text style={[styles.convLastMsg, { color: tc.text.secondary }]} numberOfLines={1}>
                {lastText}
              </Text>
            ) : null}
          </View>
          {isArchived && (
            <View style={[styles.archivedBadge, { backgroundColor: tc.surface }]}>
              <Icon name="layers" size="xs" color={tc.text.tertiary} />
            </View>
          )}
          {unread > 0 && (
            <View style={styles.unreadBadge}>
              <Text style={styles.unreadText}>{formatCount(unread)}</Text>
            </View>
          )}
        </Pressable>
      </Animated.View>
    );
  }, [user?.id, tc, handlePress, isArchived]);

  const headerTitle = folderId && folderQuery.data
    ? (folderQuery.data as Record<string, unknown>).name as string ?? t('risalah.folder')
    : t(meta.labelKey);

  const emptyIcon = meta.icon as 'bell' | 'users' | 'globe' | 'user' | 'layers';

  const emptyTitle = isArchived
    ? t('chatFolders.noArchivedChats')
    : t('risalah.noConversationsInFilter');

  const emptySubtitle = isArchived
    ? t('chatFolders.noArchivedChatsSubtitle')
    : t('risalah.noConversationsInFilterSubtitle');

  if (isLoading) {
    return (
      <View style={[styles.container, { backgroundColor: tc.bg }]}>
        <GlassHeader
          title={headerTitle}
          leftAction={{ icon: 'arrow-left', onPress: () => router.back(), accessibilityLabel: t('common.back') }}
        />
        <View style={styles.skeletons}>
          {[1, 2, 3, 4, 5].map(i => <Skeleton.ConversationItem key={i} />)}
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: tc.bg }]}>
      <GlassHeader
        title={headerTitle}
        leftAction={{ icon: 'arrow-left', onPress: () => router.back(), accessibilityLabel: t('common.back') }}
      />

      {/* Filter summary count */}
      {filtered.length > 0 && (
        <View style={styles.filterSummary}>
          <Text style={[styles.filterCount, { color: tc.text.secondary }]}>
            {t('chatFolders.allChats', { count: filtered.length })}
          </Text>
        </View>
      )}

      <FlatList
        data={filtered}
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        removeClippedSubviews
        refreshControl={
          <BrandedRefreshControl refreshing={isRefetching} onRefresh={() => refetch()} />
        }
        ListEmptyComponent={
          <EmptyState
            icon={emptyIcon}
            title={emptyTitle}
            subtitle={emptySubtitle}
          />
        }
      />
    </View>
  );
}

export default function ChatFolderViewScreen() {
  return (
    <ScreenErrorBoundary>
      <ChatFolderViewInner />
    </ScreenErrorBoundary>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  list: {
    paddingHorizontal: spacing.base,
    paddingTop: spacing.sm,
    paddingBottom: spacing['2xl'],
  },
  filterSummary: {
    paddingHorizontal: spacing.base + spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.xs,
  },
  filterCount: {
    fontSize: fontSize.sm,
    fontFamily: fonts.bodyMedium,
  },
  skeletons: {
    paddingHorizontal: spacing.base,
    paddingTop: spacing.md,
    gap: spacing.sm,
  },
  conversationItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    marginBottom: spacing.sm,
  },
  convContent: {
    flex: 1,
    justifyContent: 'center',
    gap: 2,
  },
  convName: {
    fontSize: fontSize.base,
    fontFamily: fonts.bodySemiBold,
  },
  convLastMsg: {
    fontSize: fontSize.sm,
  },
  unreadBadge: {
    backgroundColor: colors.emerald,
    borderRadius: radius.full,
    minWidth: 22,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  unreadText: {
    color: colors.extended.white,
    fontSize: fontSize.xs,
    fontFamily: fonts.bodyBold,
  },
  archivedBadge: {
    width: 28,
    height: 28,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
