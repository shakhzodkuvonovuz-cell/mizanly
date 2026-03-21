import { useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, RefreshControl, Pressable,
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useInfiniteQuery } from '@tanstack/react-query';
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

export default function PinnedMessagesScreen() {
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
      if (__DEV__) console.error('Failed to unpin message', err);
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
          accessibilityLabel={`Pinned message from ${item.sender.displayName}`}
          accessibilityRole="button"
        >
          <LinearGradient
            colors={['rgba(10,123,79,0.2)', 'rgba(200,150,62,0.1)']}
            style={styles.pinIconBg}
          >
            <Icon name="map-pin" size="xs" color={colors.emerald} />
          </LinearGradient>
          <View style={styles.messageContent}>
            <View style={styles.messageHeader}>
              <Text style={styles.senderName}>{item.sender.displayName}</Text>
              <Text style={styles.timestamp}>
                {new Date(item.createdAt).toLocaleDateString()}
              </Text>
            </View>
            {item.content && <Text style={styles.content}>{item.content}</Text>}
            {item.mediaUrl && (
              <View style={styles.mediaPlaceholder}>
                <Icon name="image" size={20} color={colors.text.secondary} />
                <Text style={styles.mediaText}>{t('screens.pinned-messages.media')}</Text>
              </View>
            )}
          </View>
        </Pressable>
      </LinearGradient>
    </Animated.View>
  );

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
        <GlassHeader
          title={t('screens.pinned-messages.title')}
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
          title={t('screens.pinned-messages.title')}
          leftAction={{ icon: <Icon name="arrow-left" size="md" color={colors.text.primary} />, onPress: () => router.back() }}
        />
        <EmptyState
          icon="slash"
          title={t('screens.pinned-messages.errorTitle')}
          subtitle={t('screens.pinned-messages.errorSubtitle')}
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
          title={t('screens.pinned-messages.title')}
          leftAction={{ icon: <Icon name="arrow-left" size="md" color={colors.text.primary} />, onPress: () => router.back() }}
        />

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
              icon="map-pin"
              title={t('screens.pinned-messages.emptyTitle')}
              subtitle={t('screens.pinned-messages.emptySubtitle')}
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
    borderLeftColor: colors.emerald,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  messageInner: {
    flexDirection: 'row',
  },
  pinIconBg: {
    width: 36,
    height: 36,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  messageContent: {
    flex: 1,
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