import { useState, useMemo, useCallback } from 'react';
import { View, Text, StyleSheet, Pressable, FlatList } from 'react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useUser } from '@clerk/clerk-expo';
import { format } from 'date-fns';
import { GlassHeader } from '@/components/ui/GlassHeader';
import { Avatar } from '@/components/ui/Avatar';
import { Icon } from '@/components/ui/Icon';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { BrandedRefreshControl } from '@/components/ui/BrandedRefreshControl';
import { ScreenErrorBoundary } from '@/components/ui/ScreenErrorBoundary';
import { colors, spacing, fontSize, radius } from '@/theme';
import { useTranslation } from '@/hooks/useTranslation';
import { useThemeColors } from '@/hooks/useThemeColors';
import { useContextualHaptic } from '@/hooks/useContextualHaptic';
import { messagesApi } from '@/services/api';
import { navigate } from '@/utils/navigation';
import type { Conversation } from '@/types';

type FilterKey = 'unread' | 'groups' | 'channels' | 'personal';

const FILTER_META: Record<FilterKey, { labelKey: string; icon: string; color: string }> = {
  unread: { labelKey: 'risalah.unread', icon: 'bell', color: colors.extended.blue },
  groups: { labelKey: 'risalah.groups', icon: 'users', color: colors.emerald },
  channels: { labelKey: 'risalah.channels', icon: 'globe', color: colors.gold },
  personal: { labelKey: 'risalah.personal', icon: 'user', color: '#9333EA' },
};

function filterConversation(c: Conversation, filterKey: FilterKey): boolean {
  switch (filterKey) {
    case 'unread': return ((c as Record<string, unknown>).unreadCount as number ?? 0) > 0;
    case 'groups': return c.isGroup === true;
    case 'channels': return (c as Record<string, unknown>).isChannel === true;
    case 'personal': return c.isGroup !== true && (c as Record<string, unknown>).isChannel !== true;
    default: return true;
  }
}

function conversationName(convo: Conversation, myId?: string): string {
  if (convo.isGroup) return convo.groupName ?? 'Group';
  const other = convo.members?.find((m) => m.user?.id !== myId);
  return other?.user?.displayName ?? 'Chat';
}

function conversationAvatar(convo: Conversation, myId?: string): string | undefined {
  if (convo.isGroup) return convo.groupAvatarUrl;
  const other = convo.members?.find((m) => m.user?.id !== myId);
  return other?.user?.avatarUrl;
}

function ChatFolderViewInner() {
  const { filter, folderId } = useLocalSearchParams<{ filter: string; folderId?: string }>();
  const filterKey = (filter as FilterKey) || 'unread';
  const router = useRouter();
  const { user } = useUser();
  const { t } = useTranslation();
  const tc = useThemeColors();
  const haptic = useContextualHaptic();
  const meta = FILTER_META[filterKey] ?? FILTER_META.unread;

  const { data, isLoading, isError, refetch, isRefetching } = useQuery({
    queryKey: ['conversations'],
    queryFn: () => messagesApi.getConversations(),
  });

  // For custom folders, fetch the folder to get its conversationIds
  const folderQuery = useQuery({
    queryKey: ['chat-folder', folderId],
    queryFn: () => import('@/services/api').then(m => m.api.get<Record<string, unknown>>(`/chat-folders/${folderId}`)),
    enabled: !!folderId,
  });

  const filtered = useMemo(() => {
    if (!data) return [];
    const conversations = data as Conversation[];
    // If viewing a custom folder, filter by conversationIds from folder
    if (folderId && folderQuery.data) {
      const ids = (folderQuery.data as Record<string, unknown>).conversationIds as string[] ?? [];
      return conversations.filter((c) => ids.includes(c.id));
    }
    return conversations.filter((c) => filterConversation(c, filterKey));
  }, [data, filterKey, folderId, folderQuery.data]);

  const handlePress = useCallback((convoId: string) => {
    haptic.navigate();
    navigate('/(screens)/conversation/[id]', { id: convoId });
  }, [haptic]);

  const renderItem = useCallback(({ item, index }: { item: Conversation; index: number }) => {
    const name = conversationName(item, user?.id);
    const avatarUri = conversationAvatar(item, user?.id);
    const lastMsg = (item as Record<string, unknown>).lastMessage as Record<string, unknown> | undefined;
    const unread = ((item as Record<string, unknown>).unreadCount as number) ?? 0;

    return (
      <Animated.View entering={FadeInUp.delay(index * 50).duration(300)}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={name}
          style={[styles.conversationItem, { backgroundColor: tc.bgCard, borderColor: tc.border }]}
          onPress={() => handlePress(item.id)}
        >
          <Avatar uri={avatarUri} name={name} size="md" showOnline />
          <View style={styles.convContent}>
            <Text style={[styles.convName, { color: tc.text.primary }]} numberOfLines={1}>{name}</Text>
            {lastMsg?.content && (
              <Text style={[styles.convLastMsg, { color: tc.text.secondary }]} numberOfLines={1}>
                {lastMsg.content as string}
              </Text>
            )}
          </View>
          {unread > 0 && (
            <View style={styles.unreadBadge}>
              <Text style={styles.unreadText}>{unread > 99 ? '99+' : unread}</Text>
            </View>
          )}
        </Pressable>
      </Animated.View>
    );
  }, [user?.id, tc, handlePress]);

  const headerTitle = folderId && folderQuery.data
    ? (folderQuery.data as Record<string, unknown>).name as string ?? t('risalah.folder')
    : t(meta.labelKey);

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
            icon={meta.icon as 'bell' | 'users' | 'globe' | 'user'}
            title={t('risalah.noConversationsInFilter')}
            subtitle={t('risalah.noConversationsInFilterSubtitle')}
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
    paddingTop: spacing.md,
    paddingBottom: spacing['2xl'],
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
    fontWeight: '600',
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
    color: '#FFF',
    fontSize: fontSize.xs,
    fontWeight: '700',
  },
});
