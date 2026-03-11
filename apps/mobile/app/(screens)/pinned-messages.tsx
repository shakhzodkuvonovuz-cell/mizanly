import { useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, RefreshControl, Pressable,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useInfiniteQuery } from '@tanstack/react-query';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Icon } from '@/components/ui/Icon';
import { Avatar } from '@/components/ui/Avatar';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import { GlassHeader } from '@/components/ui/GlassHeader';
import { colors, spacing, fontSize, radius } from '@/theme';
import { messagesApi } from '@/services/api';
import type { Message } from '@/types';

export default function PinnedMessagesScreen() {
  const router = useRouter();
  const { conversationId } = useLocalSearchParams<{ conversationId: string }>();
  const [refreshing, setRefreshing] = useState(false);

  const {
    data,
    isLoading,
    isError,
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage,
    refetch,
  } = useInfiniteQuery({
    queryKey: ['messages', conversationId, 'pinned'],
    queryFn: async ({ pageParam }) => {
      const response = await messagesApi.getMessages(conversationId, pageParam);
      // Filter messages with pushpin reaction
      const filtered = response.data.filter((msg) =>
        msg.reactions?.some((r) => r.emoji === '\u{1F4CC}')
      );
      return { ...response, data: filtered };
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.meta.cursor,
  });

  const messages = data?.pages.flatMap((page) => page.data) ?? [];

  const onRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };

  const loadMore = () => {
    if (hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  };

  const handleUnpin = async (messageId: string) => {
    try {
      await messagesApi.removeReaction(conversationId, messageId, '\u{1F4CC}');
      refetch();
    } catch (err) {
      console.error('Failed to unpin message', err);
    }
  };

  const renderMessage = ({ item }: { item: Message }) => (
    <Pressable style={styles.messageCard}>
      <Avatar
        uri={item.sender.avatarUrl}
        name={item.sender.displayName}
        size="sm"
        showOnline={false}
      />
      <View style={styles.messageContent}>
        <View style={styles.messageHeader}>
          <Text style={styles.senderName}>{item.sender.displayName}</Text>
          <View style={styles.messageHeaderRight}>
            <Text style={styles.timestamp}>
              {new Date(item.createdAt).toLocaleDateString()} {new Date(item.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </Text>
            <Pressable
              onPress={() => handleUnpin(item.id)}
              style={styles.unpinButton}
              hitSlop={8}
            >
              <Icon name="x" size={16} color={colors.text.tertiary} />
            </Pressable>
          </View>
        </View>
        {item.content && <Text style={styles.content}>{item.content}</Text>}
        {item.mediaUrl && (
          <View style={styles.mediaPlaceholder}>
            <Icon name="image" size={20} color={colors.text.secondary} />
            <Text style={styles.mediaText}>Media</Text>
          </View>
        )}
      </View>
    </Pressable>
  );

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
        <GlassHeader
          title="Pinned Messages"
          leftAction={{ icon: <Icon name="arrow-left" size="md" color={colors.text.primary} />, onPress: () => router.back() }}
        />
        <View style={styles.skeletonContainer}>
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton.Rect key={i} width="100%" height={80} borderRadius={radius.md} />
          ))}
        </View>
      </SafeAreaView>
    );
  }

  if (isError) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
        <GlassHeader
          title="Pinned Messages"
          leftAction={{ icon: <Icon name="arrow-left" size="md" color={colors.text.primary} />, onPress: () => router.back() }}
        />
        <EmptyState
          icon="slash"
          title="Unable to load pinned messages"
          subtitle="Please try again later"
          actionLabel="Retry"
          onAction={() => refetch()}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <GlassHeader
        title="Pinned Messages"
        leftAction={{ icon: <Icon name="arrow-left" size="md" color={colors.text.primary} />, onPress: () => router.back() }}
      />

      <FlatList
        data={messages}
        renderItem={renderMessage}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.emerald}
          />
        }
        onEndReached={loadMore}
        onEndReachedThreshold={0.5}
        ListEmptyComponent={
          <EmptyState
            icon="map-pin"
            title="No pinned messages"
            subtitle="Pin important messages to find them here later"
          />
        }
        ListFooterComponent={
          isFetchingNextPage ? (
            <View style={styles.footerLoader}>
              <Skeleton.Rect width="100%" height={60} borderRadius={radius.md} />
            </View>
          ) : null
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.dark.bg,
  },
  listContent: {
    paddingHorizontal: spacing.base,
    paddingTop: spacing.md,
    paddingBottom: spacing.xl,
  },
  messageCard: {
    flexDirection: 'row',
    backgroundColor: colors.dark.bgCard,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
    borderLeftWidth: 2,
    borderLeftColor: colors.emerald,
  },
  messageContent: {
    flex: 1,
    marginLeft: spacing.md,
  },
  messageHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  messageHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  unpinButton: {
    marginLeft: spacing.xs,
  },
  senderName: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.text.primary,
  },
  timestamp: {
    fontSize: fontSize.xs,
    color: colors.text.tertiary,
  },
  content: {
    fontSize: fontSize.base,
    color: colors.text.secondary,
    lineHeight: 20,
  },
  mediaPlaceholder: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.xs,
    padding: spacing.sm,
    backgroundColor: colors.dark.surface,
    borderRadius: radius.sm,
  },
  mediaText: {
    marginLeft: spacing.xs,
    fontSize: fontSize.sm,
    color: colors.text.secondary,
  },
  skeletonContainer: {
    paddingHorizontal: spacing.base,
    paddingTop: spacing.md,
    gap: spacing.md,
  },
  footerLoader: {
    marginTop: spacing.md,
  },
});