import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, RefreshControl, Pressable,
  TextInput, Keyboard,
  Pressable,
} from 'react-native';
import Animated, { FadeInUp, FadeIn, FadeOut, SlideOutRight } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { formatDistanceToNowStrict } from 'date-fns';
import { GlassHeader } from '@/components/ui/GlassHeader';
import { Icon } from '@/components/ui/Icon';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { BottomSheet, BottomSheetItem } from '@/components/ui/BottomSheet';
import { ScreenErrorBoundary } from '@/components/ui/ScreenErrorBoundary';
import { colors, spacing, fontSize, radius } from '@/theme';
import { useStore } from '@/store';
import { useHaptic } from '@/hooks/useHaptic';
import { useTranslation } from '@/hooks/useTranslation';

const API_BASE = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000/api/v1';

async function fetchSavedMessages(cursor?: string) {
  const params = new URLSearchParams();
  if (cursor) params.set('cursor', cursor);
  const res = await fetch(`${API_BASE}/saved-messages?${params}`);
  return res.json();
}

export default function SavedMessagesScreen() {
  const router = useRouter();
  const haptic = useHaptic();
  const { t, isRTL } = useTranslation();
  const queryClient = useQueryClient();
  const user = useStore(s => s.user);

  const [newMessage, setNewMessage] = useState('');
  const [searchMode, setSearchMode] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [menuItem, setMenuItem] = useState<Record<string, unknown> | null>(null);

  const messagesQuery = useInfiniteQuery({
    queryKey: ['saved-messages'],
    queryFn: ({ pageParam }) => fetchSavedMessages(pageParam as string | undefined),
    getNextPageParam: (lastPage: { meta?: { cursor: string | null; hasMore: boolean } }) =>
      lastPage?.meta?.hasMore ? lastPage.meta.cursor : undefined,
    initialPageParam: undefined as string | undefined,
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${API_BASE}/saved-messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: newMessage }),
      });
      return res.json();
    },
    onSuccess: () => {
      setNewMessage('');
      Keyboard.dismiss();
      queryClient.invalidateQueries({ queryKey: ['saved-messages'] });
      haptic.success();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await fetch(`${API_BASE}/saved-messages/${id}`, { method: 'DELETE' });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['saved-messages'] });
      setMenuItem(null);
      haptic.light();
    },
  });

  const pinMutation = useMutation({
    mutationFn: async (id: string) => {
      await fetch(`${API_BASE}/saved-messages/${id}/pin`, { method: 'PATCH' });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['saved-messages'] });
      setMenuItem(null);
      haptic.light();
    },
  });

  const messages = messagesQuery.data?.pages.flatMap((p) => ((p as Record<string, unknown>).data as Array<Record<string, unknown>>) || []) || [];

  const renderMessage = useCallback(({ item, index }: { item: Record<string, unknown>; index: number }) => {
    const isPinned = item.isPinned as boolean;
    const hasMedia = !!(item.mediaUrl as string);
    const isForwarded = !!(item.forwardedFromType as string);
    const timeAgo = formatDistanceToNowStrict(new Date(item.createdAt as string), { addSuffix: true });

    return (
      <Animated.View entering={FadeInUp.delay(index * 40).duration(250)} exiting={SlideOutRight.duration(200)}>
        <Pressable
          accessibilityRole="button"
          style={[styles.messageCard, isPinned && styles.messageCardPinned]}
          onLongPress={() => { setMenuItem(item); haptic.light(); }}
        >
          {isPinned && (
            <View style={styles.pinBadge}>
              <Icon name="bookmark" size="xs" color={colors.gold} />
              <Text style={styles.pinText}>Pinned</Text>
            </View>
          )}

          {isForwarded && (
            <View style={styles.forwardBadge}>
              <Icon name="share" size="xs" color={colors.text.tertiary} />
              <Text style={styles.forwardText}>Forwarded from {item.forwardedFromType as string}</Text>
            </View>
          )}

          {hasMedia && (
            <View style={styles.mediaPreview}>
              <Image source={{ uri: item.mediaUrl as string }} style={styles.mediaImage} contentFit="cover" />
              {(item.mediaType as string)?.startsWith('video') && (
                <View style={styles.playOverlay}>
                  <Icon name="play" size="md" color="#FFF" />
                </View>
              )}
            </View>
          )}

          {Boolean(item.content) && (
            <Text style={styles.messageText}>{item.content as string}</Text>
          )}

          <Text style={styles.timeText}>{timeAgo}</Text>
        </Pressable>
      </Animated.View>
    );
  }, []);

  return (
    <ScreenErrorBoundary>
      <View style={styles.container}>
        <GlassHeader
          title={t('risalah.savedMessages')}
          leftAction={{ icon: 'arrow-left', onPress: () => router.back() }}
          rightAction={{ icon: 'search', onPress: () => setSearchMode(!searchMode) }}
        />

        {/* Cloud notepad info */}
        <Animated.View entering={FadeIn.duration(300)} style={styles.infoBar}>
          <LinearGradient colors={[colors.emerald + '10', 'transparent']} style={styles.infoGradient}>
            <Icon name="bookmark" size="sm" color={colors.emerald} />
            <Text style={styles.infoText}>
              Your personal cloud notepad. Save messages, links, and files — accessible on all devices.
            </Text>
          </LinearGradient>
        </Animated.View>

        {/* Search bar */}
        {searchMode && (
          <Animated.View entering={FadeIn.duration(200)} style={styles.searchWrap}>
            <Icon name="search" size="sm" color={colors.text.tertiary} />
            <TextInput
              style={styles.searchInput}
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder={t('risalah.searchSavedMessages')}
              placeholderTextColor={colors.text.tertiary}
              autoFocus
            />
            <Pressable onPress={() => { setSearchMode(false); setSearchQuery(''); }}>
              <Icon name="x" size="sm" color={colors.text.tertiary} />
            </Pressable>
          </Animated.View>
        )}

        {/* Messages list */}
        <FlatList
          data={messages}
          renderItem={renderMessage}
          keyExtractor={(item) => item.id as string}
          contentContainerStyle={styles.list}
          inverted={false}
          refreshControl={
            <RefreshControl refreshing={messagesQuery.isRefetching} onRefresh={() => messagesQuery.refetch()} tintColor={colors.emerald} />
          }
          onEndReached={() => messagesQuery.hasNextPage && messagesQuery.fetchNextPage()}
          onEndReachedThreshold={0.3}
          ListEmptyComponent={
            messagesQuery.isLoading ? (
              <View style={styles.skeletons}>
                {[1, 2, 3, 4].map(i => <Skeleton.Rect key={i} width="100%" height={80} borderRadius={radius.lg} />)}
              </View>
            ) : (
              <EmptyState
                icon="bookmark"
                title={t('risalah.noSavedMessages')}
                subtitle={t('risalah.savedMessagesHint')}
              />
            )
          }
        />

        {/* Compose bar */}
        <View style={styles.composeBar}>
          <TextInput
            style={[styles.composeInput, isRTL && { textAlign: 'right' }]}
            value={newMessage}
            onChangeText={setNewMessage}
            placeholder={t('risalah.typeNote')}
            placeholderTextColor={colors.text.tertiary}
            multiline
            maxLength={5000}
          />
          <Pressable
            accessibilityRole="button"
            style={[styles.sendBtn, !newMessage.trim() && { opacity: 0.3 }]}
            onPress={() => newMessage.trim() && saveMutation.mutate()}
            disabled={!newMessage.trim() || saveMutation.isPending}
          >
            <LinearGradient colors={[colors.emerald, '#0D9B63']} style={styles.sendGradient}>
              <Icon name="send" size="sm" color="#FFF" />
            </LinearGradient>
          </Pressable>
        </View>

        {/* Context menu */}
        <BottomSheet visible={!!menuItem} onClose={() => setMenuItem(null)}>
          <BottomSheetItem
            label={menuItem?.isPinned ? 'Unpin' : 'Pin'}
            icon={<Icon name="bookmark" size="sm" color={colors.gold} />}
            onPress={() => menuItem && pinMutation.mutate(menuItem.id as string)}
          />
          <BottomSheetItem
            label={t('common.delete')}
            icon={<Icon name="trash" size="sm" color={colors.error} />}
            destructive
            onPress={() => menuItem && deleteMutation.mutate(menuItem.id as string)}
          />
        </BottomSheet>
      </View>
    </ScreenErrorBoundary>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.dark.bg },
  infoBar: { marginHorizontal: spacing.base, marginBottom: spacing.sm, borderRadius: radius.md, overflow: 'hidden' },
  infoGradient: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.md, borderRadius: radius.md },
  infoText: { color: colors.text.secondary, fontSize: fontSize.xs, flex: 1, lineHeight: 18 },
  searchWrap: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginHorizontal: spacing.base, marginBottom: spacing.sm, backgroundColor: colors.dark.bgCard, borderRadius: radius.md, paddingHorizontal: spacing.md, borderWidth: 1, borderColor: colors.dark.border },
  searchInput: { flex: 1, color: colors.text.primary, fontSize: fontSize.base, paddingVertical: spacing.sm },
  list: { paddingHorizontal: spacing.base, paddingBottom: spacing.sm },
  skeletons: { gap: spacing.sm },
  messageCard: { backgroundColor: colors.dark.bgCard, borderRadius: radius.lg, padding: spacing.md, borderWidth: 1, borderColor: colors.dark.border, marginBottom: spacing.sm },
  messageCardPinned: { borderColor: colors.gold + '40', backgroundColor: colors.gold + '05' },
  pinBadge: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginBottom: spacing.xs },
  pinText: { color: colors.gold, fontSize: fontSize.xs, fontWeight: '600' },
  forwardBadge: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginBottom: spacing.xs },
  forwardText: { color: colors.text.tertiary, fontSize: fontSize.xs },
  mediaPreview: { borderRadius: radius.md, overflow: 'hidden', marginBottom: spacing.sm, position: 'relative' },
  mediaImage: { width: '100%', height: 160, borderRadius: radius.md },
  playOverlay: { ...StyleSheet.absoluteFillObject, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.3)' },
  messageText: { color: colors.text.primary, fontSize: fontSize.base, lineHeight: 22 },
  timeText: { color: colors.text.tertiary, fontSize: fontSize.xs, marginTop: spacing.xs, alignSelf: 'flex-end' },
  composeBar: { flexDirection: 'row', alignItems: 'flex-end', paddingHorizontal: spacing.base, paddingVertical: spacing.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.dark.border, backgroundColor: colors.dark.bgElevated, gap: spacing.sm },
  composeInput: { flex: 1, backgroundColor: colors.dark.bgCard, borderRadius: radius.lg, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, color: colors.text.primary, fontSize: fontSize.base, maxHeight: 100, borderWidth: 1, borderColor: colors.dark.border },
  sendBtn: { borderRadius: radius.full, overflow: 'hidden' },
  sendGradient: { width: 40, height: 40, justifyContent: 'center', alignItems: 'center', borderRadius: radius.full },
});
