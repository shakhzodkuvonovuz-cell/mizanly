import { useState, useCallback, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  RefreshControl,
  TextInput,
  NativeSyntheticEvent,
  TextInputSubmitEditingEventData,
  Pressable,
} from 'react-native';
import { Stack, useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { BottomSheet, BottomSheetItem } from '@/components/ui/BottomSheet';
import { Icon } from '@/components/ui/Icon';
import { Avatar } from '@/components/ui/Avatar';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { GlassHeader } from '@/components/ui/GlassHeader';
import { GradientButton } from '@/components/ui/GradientButton';
import { colors, spacing, fontSize, radius } from '@/theme';
import { broadcastApi } from '@/services/api';
import type { BroadcastChannel as BroadcastChannelType, BroadcastMessage } from '@/types';
import { useTranslation } from '@/hooks/useTranslation';
import { useThemeColors } from '@/hooks/useThemeColors';
import { ScreenErrorBoundary } from '@/components/ui/ScreenErrorBoundary';

type BroadcastChannelWithSubscription = BroadcastChannelType & { isSubscribed?: boolean; isMuted?: boolean };

export default function BroadcastChannelScreen() {
  const tc = useThemeColors();
  const styles = createStyles(tc);
  const { id } = useLocalSearchParams<{ id: string }>();
  const navigation = useNavigation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const [channel, setChannel] = useState<BroadcastChannelWithSubscription | null>(null);
  const [messages, setMessages] = useState<BroadcastMessage[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [sending, setSending] = useState(false);
  const [newMessage, setNewMessage] = useState('');
  const [messageSheetVisible, setMessageSheetVisible] = useState(false);
  const [selectedMessage, setSelectedMessage] = useState<BroadcastMessage | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);

  const flatListRef = useRef<FlatList>(null);

  const loadChannel = useCallback(async () => {
    try {
      const data = await broadcastApi.getById(id);
      setChannel(data);
      setIsAdmin(data.role === 'owner' || data.role === 'admin');
    } catch (error) {
      if (__DEV__) console.error('Failed to load channel', error);
    }
  }, [id]);

  const loadMessages = useCallback(async (refresh = false) => {
    if (loading && !refresh) return;
    setLoading(true);
    try {
      const currentCursor = refresh ? undefined : cursor ?? undefined;
      const response = await broadcastApi.getMessages(id, currentCursor);
      setMessages(prev => refresh ? response.data : [...prev, ...response.data]);
      setCursor(response.meta.cursor);
      setHasMore(response.meta.hasMore);
    } catch (error) {
      if (__DEV__) console.error('Failed to load messages', error);
    } finally {
      setLoading(false);
      if (refresh) setRefreshing(false);
    }
  }, [id, cursor, loading]);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    loadChannel();
    loadMessages(true);
  }, [loadChannel, loadMessages]);

  const handleLoadMore = useCallback(() => {
    if (hasMore && !loading) {
      loadMessages();
    }
  }, [hasMore, loading, loadMessages]);

  const handleSendMessage = useCallback(async () => {
    if (!newMessage.trim() || sending) return;
    setSending(true);
    try {
      const sent = await broadcastApi.sendMessage(id, { content: newMessage.trim() });
      setMessages(prev => [sent, ...prev]);
      setNewMessage('');
    } catch (error) {
      if (__DEV__) console.error('Failed to send message', error);
    } finally {
      setSending(false);
    }
  }, [id, newMessage, sending]);

  const handleToggleMute = useCallback(async () => {
    if (!channel) return;
    try {
      if (channel.isMuted) {
        await broadcastApi.unmute(channel.id);
        setChannel({ ...channel, isMuted: false });
      } else {
        await broadcastApi.mute(channel.id);
        setChannel({ ...channel, isMuted: true });
      }
    } catch (error) {
      if (__DEV__) console.error('Failed to toggle mute', error);
    }
  }, [channel]);

  const handleSubscribe = useCallback(async () => {
    if (!channel) return;
    try {
      if (channel.isSubscribed) {
        await broadcastApi.unsubscribe(channel.id);
        setChannel({ ...channel, isSubscribed: false, subscribersCount: channel.subscribersCount - 1 });
      } else {
        await broadcastApi.subscribe(channel.id);
        setChannel({ ...channel, isSubscribed: true, subscribersCount: channel.subscribersCount + 1 });
      }
    } catch (error) {
      if (__DEV__) console.error('Failed to toggle subscription', error);
    }
  }, [channel]);

  const handleMessageLongPress = useCallback((message: BroadcastMessage) => {
    setSelectedMessage(message);
    setMessageSheetVisible(true);
  }, []);

  const handlePinMessage = useCallback(async () => {
    if (!selectedMessage || !channel) return;
    try {
      if (selectedMessage.isPinned) {
        await broadcastApi.unpinMessage(channel.id, selectedMessage.id);
        setMessages(prev => prev.map(m => m.id === selectedMessage.id ? { ...m, isPinned: false } : m));
      } else {
        await broadcastApi.pinMessage(channel.id, selectedMessage.id);
        setMessages(prev => prev.map(m => m.id === selectedMessage.id ? { ...m, isPinned: true } : m));
      }
      setMessageSheetVisible(false);
    } catch (error) {
      if (__DEV__) console.error('Failed to pin/unpin message', error);
    }
  }, [selectedMessage, channel]);

  const handleDeleteMessage = useCallback(async () => {
    if (!selectedMessage || !channel) return;
    try {
      await broadcastApi.deleteMessage(channel.id, selectedMessage.id);
      setMessages(prev => prev.filter(m => m.id !== selectedMessage.id));
      setMessageSheetVisible(false);
    } catch (error) {
      if (__DEV__) console.error('Failed to delete message', error);
    }
  }, [selectedMessage, channel]);

  useEffect(() => {
    loadChannel();
    loadMessages();
  }, []);

  const renderMessageItem = useCallback(({ item, index }: { item: BroadcastMessage; index: number }) => (
    <Animated.View entering={FadeInUp.delay(index * 80).duration(400)}>
      <LinearGradient
        colors={colors.gradient.cardDark}
        style={styles.messageCard}
      >
        <Pressable
          accessibilityRole="button"
          style={styles.messageInner}
          onLongPress={() => handleMessageLongPress(item)}
          delayLongPress={400}
        >
          <Avatar uri={item.user?.avatarUrl} name={item.user?.displayName} size="md" />
          <View style={styles.messageContent}>
            <View style={styles.messageHeader}>
              <Text style={styles.messageSender}>{item.user?.displayName}</Text>
              <Text style={styles.messageTime}>
                {new Date(item.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </Text>
            </View>
            <Text style={styles.messageText}>{item.content}</Text>
            {item.isPinned && (
              <LinearGradient
                colors={['rgba(10,123,79,0.2)', 'rgba(200,150,62,0.1)']}
                style={styles.pinBadge}
              >
                <Icon name="map-pin" size="xs" color={colors.emerald} />
                <Text style={styles.pinTextEmerald}>{t('broadcast.pinned')}</Text>
              </LinearGradient>
            )}
          </View>
        </Pressable>
      </LinearGradient>
    </Animated.View>
  ), [handleMessageLongPress]);

  const renderEmptyState = useCallback(() => (
    <EmptyState
      icon="message-circle"
      title={t('broadcast.emptyState.noMessages')}
      subtitle={t('broadcast.emptyState.beFirst')}
      actionLabel={t('common.refresh')}
      onAction={handleRefresh}
    />
  ), [handleRefresh]);

  const renderSkeleton = useCallback(() => (
    Array.from({ length: 5 }).map((_, i) => (
      <View key={i} style={styles.messageCard}>
        <Skeleton.Circle size={40} />
        <View style={styles.messageContent}>
          <View style={styles.messageHeader}>
            <Skeleton.Rect width={100} height={14} />
            <Skeleton.Rect width={40} height={11} />
          </View>
          <Skeleton.Rect width="90%" height={14} style={{ marginTop: spacing.xs }} />
          <Skeleton.Rect width="60%" height={14} style={{ marginTop: spacing.xs }} />
        </View>
      </View>
    ))
  ), []);

  const headerTitle = channel ? channel.name : t('broadcast.channel');

  return (
    <ScreenErrorBoundary>
      <>
        <Stack.Screen options={{ headerShown: false }} />
        <GlassHeader
          title={headerTitle}
          leftAction={{ icon: 'arrow-left', onPress: () => router.back(), accessibilityLabel: t('common.back') }}
          rightAction={{
            icon: channel?.isMuted ? 'volume-x' : 'bell',
            onPress: handleToggleMute,
            accessibilityLabel: channel?.isMuted ? t('broadcast.unmute') : t('broadcast.mute'),
          }}
        />
        <View style={styles.container}>
          {channel && (
            <Animated.View entering={FadeInUp.delay(0).duration(400)}>
              <LinearGradient
                colors={colors.gradient.cardDark}
                style={[styles.channelHeader, { paddingTop: insets.top + 52 + spacing.xl }]}
              >
                <Avatar uri={channel.avatarUrl} name={channel.name} size="xl" />
                <Text style={styles.channelName}>{channel.name}</Text>
                <LinearGradient
                  colors={['rgba(200,150,62,0.2)', 'rgba(200,150,62,0.1)']}
                  style={styles.subscriberBadge}
                >
                  <Icon name="users" size="xs" color={colors.gold} />
                  <Text style={styles.channelSubscribers}>
                    {channel.subscribersCount.toLocaleString()} {t('broadcast.subscribers')}
                  </Text>
                </LinearGradient>
                <View style={styles.channelActions}>
                  <GradientButton
                    label={channel.isSubscribed ? t('broadcast.subscribed') : t('broadcast.subscribe')}
                    variant={channel.isSubscribed ? 'secondary' : 'primary'}
                    onPress={handleSubscribe}
                  />
                  {channel.isMuted && (
                    <Pressable style={styles.muteBadge}>
                      <Icon name="volume-x" size="xs" color={colors.text.tertiary} />
                      <Text style={styles.muteText}>{t('broadcast.muted')}</Text>
                    </Pressable>
                  )}
                </View>
              </LinearGradient>
            </Animated.View>
          )}

          <FlatList
            ref={flatListRef}
            data={messages}
            renderItem={renderMessageItem}
            keyExtractor={item => item.id}
            contentContainerStyle={styles.listContent}
            inverted
            removeClippedSubviews={true}
            ListEmptyComponent={loading ? null : renderEmptyState}
            ListFooterComponent={loading && messages.length > 0 ? renderSkeleton : null}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={handleRefresh}
                tintColor={colors.emerald}
              />
            }
            onEndReached={handleLoadMore}
            onEndReachedThreshold={0.5}
            showsVerticalScrollIndicator={false}
          />

          {isAdmin && (
            <View style={styles.composeContainer}>
              <TextInput
                style={styles.composeInput}
                placeholder={t('broadcast.sendMessagePlaceholder')}
                placeholderTextColor={colors.text.tertiary}
                value={newMessage}
                onChangeText={setNewMessage}
                onSubmitEditing={handleSendMessage}
                returnKeyType="send"
                editable={!sending}
              />
              <Pressable
                accessibilityRole="button"
                style={[styles.sendButton, (!newMessage.trim() || sending) && styles.sendButtonDisabled]}
                onPress={handleSendMessage}
                disabled={!newMessage.trim() || sending}
              >
                <Icon name="send" size="md" color={colors.text.primary} />
              </Pressable>
            </View>
          )}

          <BottomSheet
            visible={messageSheetVisible}
            onClose={() => setMessageSheetVisible(false)}
            snapPoint={selectedMessage?.user?.id === channel?.userId ? 180 : 120}
          >
            {selectedMessage?.user?.id === channel?.userId && (
              <BottomSheetItem
                label={selectedMessage?.isPinned ? t('broadcast.unpinMessage') : t('broadcast.pinMessage')}
                icon={<Icon name="map-pin" size="md" color={colors.text.primary} />}
                onPress={handlePinMessage}
              />
            )}
            <BottomSheetItem
              label={t('broadcast.deleteMessage')}
              icon={<Icon name="trash" size="md" color={colors.error} />}
              onPress={handleDeleteMessage}
              destructive
            />
          </BottomSheet>
        </View>
      </>
  
    </ScreenErrorBoundary>
  );
}

const createStyles = (tc: ReturnType<typeof useThemeColors>) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: tc.bg,
  },
  channelHeader: {
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.xl,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.active.white6,
    marginHorizontal: spacing.base,
    marginBottom: spacing.md,
  },
  channelName: {
    color: colors.text.primary,
    fontSize: fontSize.xl,
    fontWeight: '700',
    marginTop: spacing.md,
  },
  subscriberBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.full,
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
  channelSubscribers: {
    color: colors.gold,
    fontSize: fontSize.sm,
  },
  channelActions: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.md,
    gap: spacing.md,
  },
  muteBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: tc.bgElevated,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.full,
    gap: spacing.xs,
  },
  muteText: {
    color: colors.text.tertiary,
    fontSize: fontSize.xs,
  },
  listContent: {
    paddingHorizontal: spacing.base,
    paddingBottom: spacing.base,
    flexGrow: 1,
  },
  messageCard: {
    borderRadius: radius.md,
    marginBottom: spacing.sm,
    padding: spacing.base,
    borderWidth: 1,
    borderColor: colors.active.white6,
  },
  messageInner: {
    flexDirection: 'row',
    gap: spacing.md,
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
  messageSender: {
    color: colors.text.primary,
    fontSize: fontSize.md,
    fontWeight: '600',
  },
  messageTime: {
    color: colors.text.tertiary,
    fontSize: fontSize.xs,
  },
  messageText: {
    color: colors.text.primary,
    fontSize: fontSize.base,
    lineHeight: 20,
  },
  pinBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.sm,
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  pinTextEmerald: {
    color: colors.emerald,
    fontSize: fontSize.xs,
  },
  composeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.base,
    borderTopWidth: 1,
    borderTopColor: tc.border,
    backgroundColor: tc.bgCard,
  },
  composeInput: {
    flex: 1,
    backgroundColor: tc.bgElevated,
    color: colors.text.primary,
    fontSize: fontSize.base,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
    marginRight: spacing.sm,
  },
  sendButton: {
    backgroundColor: colors.emerald,
    width: 44,
    height: 44,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonDisabled: {
    backgroundColor: tc.surface,
  },
});