import { useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, RefreshControl, Pressable,
, Pressable } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { Icon } from '@/components/ui/Icon';
import { Avatar } from '@/components/ui/Avatar';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import { GlassHeader } from '@/components/ui/GlassHeader';
import { colors, spacing, fontSize, radius } from '@/theme';
import { messagesApi } from '@/services/api';
import type { Message } from '@/types';
import { useTranslation } from '@/hooks/useTranslation';
import { ScreenErrorBoundary } from '@/components/ui/ScreenErrorBoundary';

export default function StarredMessagesScreen() {
  const { t, isRTL } = useTranslation();
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
    queryKey: ['messages', conversationId, 'starred'],
    queryFn: async ({ pageParam }) => {
      const response = await messagesApi.getMessages(conversationId, pageParam);
      // Filter messages that have a star reaction
      const filtered = response.data.filter((msg) =>
        msg.reactions?.some((r) => r.emoji === '\u2B50')
      );
      return { ...response, data: filtered };
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.meta.cursor,
  });

  const { data: conversation } = useQuery({
    queryKey: ['conversation', conversationId],
    queryFn: () => messagesApi.getConversation(conversationId!),
    enabled: !!conversationId,
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

  const handleUnstar = async (messageId: string) => {
    try {
      await messagesApi.removeReaction(conversationId, messageId, '\u2B50');
      refetch();
    } catch (err) {
      console.error('Failed to unstar message', err);
    }
  };

  const renderMessage = ({ item, index }: { item: Message; index: number }) => (
    <Animated.View entering={FadeInUp.delay(index * 80).duration(400)}>
      <LinearGradient
        colors={['rgba(45,53,72,0.4)', 'rgba(28,35,51,0.2)']}
        style={styles.messageCard}
      >
        <Pressable
          style={styles.messageInner}
          accessibilityLabel={`${t('screens.starred-messages.starred')} ${item.sender.displayName}: ${item.content || t('screens.starred-messages.media')}`}
          accessibilityRole="none"
        >
          <Avatar
            uri={item.sender.avatarUrl}
            name={item.sender.displayName}
            size="sm"
            showOnline={false}
          />
          <View style={styles.messageContent}>
            <View style={styles.messageHeader}>
              <Text style={styles.senderName}>{item.sender.displayName}</Text>
              <Text style={styles.timestamp}>
                {new Date(item.createdAt).toLocaleDateString()} {new Date(item.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </Text>
            </View>
            {item.content && <Text style={styles.content}>{item.content}</Text>}
            {item.mediaUrl && (
              <View style={styles.mediaPlaceholder}>
                <Icon name="image" size={20} color={colors.text.secondary} />
                <Text style={styles.mediaText}>{t('screens.starred-messages.media')}</Text>
              </View>
            )}
            <View style={styles.reactions}>
              {item.reactions?.map((reaction) => (
                reaction.emoji === '\u2B50' ? (
                  <Pressable
                    key={reaction.id}
                    style={styles.reactionChip}
                    onPress={() => handleUnstar(item.id)}
                    accessibilityLabel={t('screens.starred-messages.starred')}
                    accessibilityRole="button"
                  >
                    <LinearGradient
                      colors={['rgba(200,150,62,0.2)', 'rgba(200,150,62,0.1)']}
                      style={styles.starIconBg}
                    >
                      <Text style={styles.reactionEmoji}>{reaction.emoji}</Text>
                    </LinearGradient>
                    <Text style={styles.reactionCountGold}>{t('screens.starred-messages.starred')}</Text>
                  </Pressable>
                ) : (
                  <View key={reaction.id} style={styles.reactionChip}>
                    <Text style={styles.reactionEmoji}>{reaction.emoji}</Text>
                    <Text style={styles.reactionCount}>{reaction.emoji}</Text>
                  </View>
                )
              ))}
            </View>
          </View>
        </Pressable>
      </LinearGradient>
    </Animated.View>
  );

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
        <GlassHeader
          title={t('screens.starred-messages.title')}
          leftAction={{ 
            icon: 'arrow-left', 
            onPress: () => router.back(),
            accessibilityLabel: t('accessibility.goBack')
          }}
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
          title={t('screens.starred-messages.title')}
          leftAction={{ 
            icon: 'arrow-left', 
            onPress: () => router.back(),
            accessibilityLabel: t('accessibility.goBack')
          }}
        />
        <EmptyState
          icon="slash"
          title={t('screens.starred-messages.errorTitle')}
          subtitle={t('screens.starred-messages.errorSubtitle')}
          actionLabel={t('common.retry')}
          onAction={() => refetch()}
        />
      </SafeAreaView>
    );
  }

  return (
    <ScreenErrorBoundary>
      <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
        <GlassHeader
          title={t('screens.starred-messages.title')}
          leftAction={{ 
            icon: 'arrow-left', 
            onPress: () => router.back(),
            accessibilityLabel: t('accessibility.goBack')
          }}
        />

        {conversation && (
          <Animated.View entering={FadeInUp.delay(0).duration(400)} style={styles.conversationHeader}>
            <LinearGradient
              colors={['rgba(45,53,72,0.4)', 'rgba(28,35,51,0.2)']}
              style={styles.conversationHeaderGradient}
            >
              <Text style={styles.conversationName}>
                {conversation.isGroup
                  ? conversation.groupName
                  : conversation.otherUser?.displayName || conversation.otherUser?.username}
              </Text>
              <Text style={styles.starredCount}>★ {messages.length} {t('screens.starred-messages.starred')}</Text>
            </LinearGradient>
          </Animated.View>
        )}

        <FlatList
          removeClippedSubviews={true}
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
              icon="bookmark-filled"
              title={t('screens.starred-messages.emptyTitle')}
              subtitle={t('screens.starred-messages.emptySubtitle')}
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
  
    </ScreenErrorBoundary>
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
    borderRadius: radius.md,
    marginBottom: spacing.md,
    borderLeftWidth: 3,
    borderLeftColor: colors.gold,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  messageInner: {
    flexDirection: 'row',
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
  reactions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: spacing.xs,
    gap: spacing.xs,
  },
  reactionChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.dark.surface,
    borderRadius: radius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  reactionEmoji: {
    fontSize: fontSize.sm,
    marginRight: spacing.xs,
  },
  reactionCount: {
    fontSize: fontSize.xs,
    color: colors.text.secondary,
  },
  conversationHeader: {
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
  },
  conversationHeaderGradient: {
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  conversationName: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.text.primary,
  },
  starredCount: {
    fontSize: fontSize.xs,
    color: colors.gold,
    marginTop: spacing.xs,
  },
  starIconBg: {
    width: 28,
    height: 28,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reactionCountGold: {
    fontSize: fontSize.xs,
    color: colors.gold,
    marginLeft: spacing.xs,
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