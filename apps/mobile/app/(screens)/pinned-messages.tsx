import { useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, Pressable,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { Icon } from '@/components/ui/Icon';
import { Avatar } from '@/components/ui/Avatar';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import { GlassHeader } from '@/components/ui/GlassHeader';
import { BrandedRefreshControl } from '@/components/ui/BrandedRefreshControl';
import { showToast } from '@/components/ui/Toast';
import { Alert } from 'react-native';
import { colors, spacing, fontSize, radius, fonts } from '@/theme';
import { messagesApi } from '@/services/api';
import type { Message } from '@/types';
import { useTranslation } from '@/hooks/useTranslation';
import { useContextualHaptic } from '@/hooks/useContextualHaptic';
import { useThemeColors } from '@/hooks/useThemeColors';
import { rtlFlexRow } from '@/utils/rtl';
import { ScreenErrorBoundary } from '@/components/ui/ScreenErrorBoundary';

export default function PinnedMessagesScreen() {
  const tc = useThemeColors();
  const styles = createStyles(tc);
  const { t, isRTL } = useTranslation();
  const router = useRouter();
  const haptic = useContextualHaptic();
  const { conversationId } = useLocalSearchParams<{ conversationId: string }>();
  const [refreshing, setRefreshing] = useState(false);
  const [unpinning, setUnpinning] = useState<string | null>(null);
  const queryClient = useQueryClient();

  // Use the proper server-side pinned messages endpoint (isPinned field)
  const {
    data,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ['pinned-messages', conversationId],
    queryFn: () => messagesApi.getPinned(conversationId),
    enabled: !!conversationId,
  });

  const messages: Message[] = (data as Message[]) ?? [];

  const onRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };

  const handleUnpin = (messageId: string) => {
    if (unpinning) return; // Prevent double-tap
    haptic.tick();
    Alert.alert(
      t('screens.pinned-messages.confirmUnpinTitle', 'Unpin Message'),
      t('screens.pinned-messages.confirmUnpinMessage', 'This will unpin the message for all members.'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('screens.pinned-messages.unpin'),
          style: 'destructive',
          onPress: async () => {
            setUnpinning(messageId);
            try {
              await messagesApi.unpin(conversationId, messageId);
              queryClient.invalidateQueries({ queryKey: ['pinned-messages', conversationId] });
              showToast({ message: t('screens.pinned-messages.unpinned'), variant: 'success' });
            } catch (err) {
              showToast({ message: t('common.somethingWentWrong'), variant: 'error' });
              if (__DEV__) console.error('Failed to unpin message', err);
            } finally {
              setUnpinning(null);
            }
          },
        },
      ],
    );
  };

  const renderMessage = ({ item, index }: { item: Message; index: number }) => (
    <Animated.View entering={FadeInUp.delay(Math.min(index, 10) * 80).duration(400)}>
      <LinearGradient
        colors={colors.gradient.cardDark}
        style={styles.messageCard}
      >
        <Pressable
          style={styles.messageInner}
          accessibilityLabel={`${t('screens.pinned-messages.title')}: ${item.sender.displayName}`}
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
              <View style={styles.messageHeaderRight}>
                <Text style={styles.timestamp}>
                  {new Date(item.createdAt).toLocaleDateString()}
                </Text>
                <Pressable
                  onPress={() => handleUnpin(item.id)}
                  hitSlop={8}
                  style={styles.unpinButton}
                  accessibilityLabel={t('screens.pinned-messages.unpin')}
                  accessibilityRole="button"
                >
                  <Icon name="x" size="xs" color={tc.text.tertiary} />
                </Pressable>
              </View>
            </View>
            {item.content && <Text style={styles.content}>{item.content}</Text>}
            {item.mediaUrl && (
              <View style={styles.mediaPlaceholder}>
                <Icon name="image" size={20} color={tc.text.secondary} />
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
          leftAction={{ icon: <Icon name="arrow-left" size="md" color={tc.text.primary} />, onPress: () => router.back() }}
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
          leftAction={{ icon: <Icon name="arrow-left" size="md" color={tc.text.primary} />, onPress: () => router.back() }}
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
          leftAction={{ icon: <Icon name="arrow-left" size="md" color={tc.text.primary} />, onPress: () => router.back() }}
        />

        <FlatList
              removeClippedSubviews={true}
          data={messages}
          renderItem={renderMessage}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <BrandedRefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
            />
          }
          ListEmptyComponent={
            <EmptyState
              icon="map-pin"
              title={t('screens.pinned-messages.emptyTitle')}
              subtitle={t('screens.pinned-messages.emptySubtitle')}
            />
          }
        />
      </SafeAreaView>
  
    </ScreenErrorBoundary>
  );
}

const createStyles = (tc: ReturnType<typeof useThemeColors>) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: tc.bg,
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
    borderColor: colors.active.white6,
  },
  messageInner: {
    flexDirection: 'row' as const,
  },
  pinIconBg: {
    width: 36,
    height: 36,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    marginEnd: spacing.md,
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
    marginStart: spacing.xs,
  },
  senderName: {
    fontSize: fontSize.sm,
    fontFamily: fonts.bodySemiBold,
    color: tc.text.primary,
  },
  timestamp: {
    fontSize: fontSize.xs,
    fontFamily: fonts.body,
    color: tc.text.tertiary,
  },
  content: {
    fontSize: fontSize.base,
    fontFamily: fonts.body,
    color: tc.text.secondary,
    lineHeight: 20,
  },
  mediaPlaceholder: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.xs,
    padding: spacing.sm,
    backgroundColor: tc.surface,
    borderRadius: radius.sm,
  },
  mediaText: {
    marginStart: spacing.xs,
    fontSize: fontSize.sm,
    color: tc.text.secondary,
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