import { useState, useCallback, useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  NativeSyntheticEvent,
  TextInputSubmitEditingEventData,
} from 'react-native';
import { useMutation, useQuery, useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { showToast } from '@/components/ui/Toast';
import { Stack, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { Icon } from '@/components/ui/Icon';
import { Avatar } from '@/components/ui/Avatar';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { TabSelector } from '@/components/ui/TabSelector';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { GlassHeader } from '@/components/ui/GlassHeader';
import { GradientButton } from '@/components/ui/GradientButton';
import { colors, spacing, fontSize, radius } from '@/theme';
import { broadcastApi } from '@/services/api';
import type { BroadcastChannel as BroadcastChannelType } from '@/types';
import { useTranslation } from '@/hooks/useTranslation';
import { useThemeColors } from '@/hooks/useThemeColors';
import { useContextualHaptic } from '@/hooks/useContextualHaptic';
import { ScreenErrorBoundary } from '@/components/ui/ScreenErrorBoundary';
import { BrandedRefreshControl } from '@/components/ui/BrandedRefreshControl';
import { navigate } from '@/utils/navigation';

type BroadcastChannelWithSubscription = BroadcastChannelType & { isSubscribed?: boolean; isMuted?: boolean };

type TabKey = 'discover' | 'my';

export default function BroadcastChannelsScreen() {
  const tc = useThemeColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const haptic = useContextualHaptic();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<TabKey>('discover');
  const [searchQuery, setSearchQuery] = useState('');
  const [showCreateSheet, setShowCreateSheet] = useState(false);
  const [newChannelName, setNewChannelName] = useState('');
  const [newChannelDesc, setNewChannelDesc] = useState('');

  // Discover channels via useInfiniteQuery
  const {
    data: discoverData,
    fetchNextPage: fetchNextDiscover,
    hasNextPage: discoverHasMore,
    isFetchingNextPage: isFetchingNextDiscover,
    isLoading: discoverLoading,
    isError: discoverError,
    refetch: refetchDiscover,
  } = useInfiniteQuery({
    queryKey: ['broadcast-discover'],
    queryFn: ({ pageParam }) => broadcastApi.discover(pageParam),
    getNextPageParam: (lastPage) => lastPage.meta.hasMore ? lastPage.meta.cursor ?? undefined : undefined,
    initialPageParam: undefined as string | undefined,
    staleTime: 60_000,
  });

  const discoverChannels: BroadcastChannelWithSubscription[] = useMemo(
    () => (discoverData?.pages.flatMap((page) => page.data) ?? []) as BroadcastChannelWithSubscription[],
    [discoverData],
  );

  // My channels via useQuery
  const {
    data: myChannelsRaw,
    isLoading: myChannelsLoading,
    isError: myChannelsError,
    refetch: refetchMyChannels,
  } = useQuery({
    queryKey: ['broadcast-my-channels'],
    queryFn: () => broadcastApi.getMyChannels(),
    enabled: activeTab === 'my',
    staleTime: 30_000,
  });

  const myChannels: BroadcastChannelWithSubscription[] = useMemo(
    () => (myChannelsRaw ?? []) as BroadcastChannelWithSubscription[],
    [myChannelsRaw],
  );

  const createMutation = useMutation({
    mutationFn: () => broadcastApi.create({ name: newChannelName, slug: newChannelName.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, ''), description: newChannelDesc }),
    onSuccess: (data) => {
      setShowCreateSheet(false);
      setNewChannelName('');
      setNewChannelDesc('');
      queryClient.invalidateQueries({ queryKey: ['broadcast-my-channels'] });
      navigate(`/(screens)/broadcast/${data.id}`);
    },
    onError: () => showToast({ message: t('broadcastChannels.createError'), variant: 'error' }),
  });

  const searchInputRef = useRef<TextInput>(null);

  const handleRefresh = useCallback(() => {
    if (activeTab === 'discover') {
      refetchDiscover();
    } else {
      refetchMyChannels();
    }
  }, [activeTab, refetchDiscover, refetchMyChannels]);

  const handleLoadMore = useCallback(() => {
    if (activeTab === 'discover' && discoverHasMore && !isFetchingNextDiscover) {
      fetchNextDiscover();
    }
  }, [activeTab, discoverHasMore, isFetchingNextDiscover, fetchNextDiscover]);

  const handleSearchSubmit = useCallback((_e: NativeSyntheticEvent<TextInputSubmitEditingEventData>) => {
    // Client-side search is handled by the filteredData memo
  }, []);

  const handleChannelPress = useCallback((channel: BroadcastChannelWithSubscription) => {
    navigate(`/(screens)/broadcast/${channel.id}`);
  }, []);

  const handleSubscribe = useCallback(async (channel: BroadcastChannelWithSubscription) => {
    haptic.tick();
    const wasSubscribed = channel.isSubscribed;
    try {
      if (wasSubscribed) {
        await broadcastApi.unsubscribe(channel.id);
      } else {
        await broadcastApi.subscribe(channel.id);
      }
      queryClient.invalidateQueries({ queryKey: ['broadcast-discover'] });
      queryClient.invalidateQueries({ queryKey: ['broadcast-my-channels'] });
    } catch {
      showToast({ message: t('broadcastChannels.subscribeError'), variant: 'error' });
    }
  }, [haptic, t, queryClient]);

  const renderChannelItem = useCallback(({ item, index }: { item: BroadcastChannelWithSubscription; index: number }) => (
    <Animated.View entering={FadeInUp.delay(Math.min(index, 15) * 50).duration(400)}>
      <Pressable accessibilityRole="button" onPress={() => handleChannelPress(item)}>
        <LinearGradient
          colors={colors.gradient.cardDark}
          style={styles.channelCard}
        >
          <LinearGradient
            colors={['rgba(10,123,79,0.2)', 'rgba(200,150,62,0.1)']}
            style={styles.avatarBg}
          >
            <Avatar uri={item.avatarUrl} name={item.name} size="lg" />
          </LinearGradient>
          <View style={styles.channelInfo}>
            <Text style={[styles.channelName, { color: tc.text.primary }]}>{item.name}</Text>
            <Text style={[styles.channelDescription, { color: tc.text.secondary }]} numberOfLines={2}>{item.description}</Text>
            <LinearGradient
              colors={['rgba(10,123,79,0.15)', 'rgba(200,150,62,0.1)']}
              style={styles.subscribersBadge}
            >
              <Icon name="users" size="xs" color={colors.gold} />
              <Text style={styles.subscribersText}>
                {item.subscribersCount.toLocaleString()} {t('broadcastChannels.subscribers')}
              </Text>
            </LinearGradient>
          </View>
          <Pressable accessibilityRole="button" onPress={() => handleSubscribe(item)} hitSlop={8}>
            <LinearGradient
              colors={item.isSubscribed ? colors.gradient.cardDark : ['rgba(10,123,79,0.4)', 'rgba(10,123,79,0.2)']}
              style={styles.subscribeBtn}
            >
              <Text style={[styles.subscribeText, { color: tc.text.primary }, item.isSubscribed && { color: tc.text.secondary }]}>
                {item.isSubscribed ? t('broadcastChannels.subscribed') : t('broadcastChannels.subscribe')}
              </Text>
            </LinearGradient>
          </Pressable>
        </LinearGradient>
      </Pressable>
    </Animated.View>
  ), [handleChannelPress, handleSubscribe]);

  const renderEmptyState = useCallback(() => {
    if (activeTab === 'discover') {
      if (discoverError) {
        return (
          <EmptyState
            icon="flag"
            title={t('common.error.loadContent')}
            subtitle={t('common.error.checkConnection')}
            actionLabel={t('common.retry')}
            onAction={() => refetchDiscover()}
          />
        );
      }
      return (
        <EmptyState
          icon="users"
          title={t('broadcastChannels.emptyState.noChannels')}
          subtitle={t('broadcastChannels.emptyState.tryLater')}
          actionLabel={t('common.refresh')}
          onAction={() => handleRefresh()}
        />
      );
    }
    if (myChannelsError) {
      return (
        <EmptyState
          icon="flag"
          title={t('common.error.loadContent')}
          subtitle={t('common.error.checkConnection')}
          actionLabel={t('common.retry')}
          onAction={() => refetchMyChannels()}
        />
      );
    }
    return (
      <EmptyState
        icon="bell"
        title={t('broadcastChannels.emptyState.noJoinedChannels')}
        subtitle={t('broadcastChannels.emptyState.discoverChannels')}
        actionLabel={t('broadcastChannels.discoverChannels')}
        onAction={() => setActiveTab('discover')}
      />
    );
  }, [activeTab, handleRefresh, discoverError, myChannelsError, refetchDiscover, refetchMyChannels]);

  const renderSkeleton = useCallback(() => (
    Array.from({ length: 5 }).map((_, i) => (
      <View key={i} style={styles.channelCard}>
        <Skeleton.Circle size={52} />
        <View style={styles.channelInfo}>
          <Skeleton.Rect width={120} height={16} />
          <Skeleton.Rect width="80%" height={12} style={{ marginTop: spacing.xs }} />
          <Skeleton.Rect width={60} height={12} style={{ marginTop: spacing.xs }} />
        </View>
        <Skeleton.Rect width={80} height={32} borderRadius={radius.md} />
      </View>
    ))
  ), []);

  const filteredData = useMemo(() => {
    const source = activeTab === 'discover' ? discoverChannels : myChannels;
    if (!searchQuery.trim()) return source;
    const lowerQuery = searchQuery.trim().toLowerCase();
    return source.filter(
      c =>
        c.name.toLowerCase().includes(lowerQuery) ||
        c.description?.toLowerCase().includes(lowerQuery)
    );
  }, [activeTab, discoverChannels, myChannels, searchQuery]);

  const loading = activeTab === 'discover' ? discoverLoading : myChannelsLoading;

  return (
    <ScreenErrorBoundary>
      <>
        <Stack.Screen options={{ headerShown: false }} />
        <GlassHeader
          title={t('broadcastChannels.title')}
          leftAction={{ icon: 'arrow-left', onPress: () => router.back(), accessibilityLabel: t('common.back') }}
          rightActions={[{ icon: 'plus', onPress: () => setShowCreateSheet(true), accessibilityLabel: t('broadcastChannels.createChannel') }]}
        />
        <View style={[styles.container, { backgroundColor: tc.bg }]}>
          <View style={[styles.searchContainer, { marginTop: insets.top + 52 + spacing.base, backgroundColor: tc.bgElevated, borderColor: tc.border }]}>
            <Icon name="search" size="sm" color={tc.text.secondary} style={styles.searchIcon} />
            <TextInput
              ref={searchInputRef}
              style={[styles.searchInput, { color: tc.text.primary }]}
              placeholder={t('broadcastChannels.searchPlaceholder')}
              placeholderTextColor={tc.text.tertiary}
              value={searchQuery}
              onChangeText={setSearchQuery}
              onSubmitEditing={handleSearchSubmit}
              returnKeyType="search"
            />
            {searchQuery.length > 0 && (
              <Pressable accessibilityRole="button" onPress={() => setSearchQuery('')} style={styles.clearButton}>
                <Icon name="x" size="sm" color={tc.text.secondary} />
              </Pressable>
            )}
          </View>

          <TabSelector
            tabs={[
              { key: 'discover', label: t('broadcastChannels.tab.discover') },
              { key: 'my', label: t('broadcastChannels.tab.myChannels') },
            ]}
            activeKey={activeTab}
            onTabChange={(key: string) => { haptic.navigate(); setActiveTab(key as TabKey); }}
            variant="underline"
            style={styles.tabSelector}
          />

          <FlatList
            removeClippedSubviews={true}
            data={filteredData}
            renderItem={renderChannelItem}
            keyExtractor={item => item.id}
            contentContainerStyle={styles.listContent}
            ListEmptyComponent={loading ? renderSkeleton : renderEmptyState}
            ListFooterComponent={isFetchingNextDiscover && activeTab === 'discover' ? renderSkeleton : null}
            refreshControl={
              <BrandedRefreshControl
                refreshing={false}
                onRefresh={handleRefresh}
              />
            }
            onEndReached={handleLoadMore}
            onEndReachedThreshold={0.5}
            showsVerticalScrollIndicator={false}
          />
        </View>
        <BottomSheet visible={showCreateSheet} onClose={() => setShowCreateSheet(false)} snapPoint={0.5}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <View style={{ padding: spacing.base, gap: spacing.md }}>
              <Text style={{ fontSize: fontSize.lg, fontWeight: '600', color: tc.text.primary}}>{t('broadcastChannels.createChannel')}</Text>
              <TextInput
                style={{ backgroundColor: tc.surface, borderRadius: radius.md, padding: spacing.md, color: tc.text.primary, fontSize: fontSize.base }}
                placeholder={t('broadcastChannels.channelNamePlaceholder')}
                placeholderTextColor={tc.text.tertiary}
                value={newChannelName}
                onChangeText={setNewChannelName}
                maxLength={50}
              />
              <TextInput
                style={{ backgroundColor: tc.surface, borderRadius: radius.md, padding: spacing.md, color: tc.text.primary, fontSize: fontSize.base, minHeight: 80 }}
                placeholder={t('broadcastChannels.descriptionPlaceholder')}
                placeholderTextColor={tc.text.tertiary}
                value={newChannelDesc}
                onChangeText={setNewChannelDesc}
                maxLength={200}
                multiline
              />
              <GradientButton
                label={t('broadcastChannels.createButton')}
                onPress={() => { haptic.success(); createMutation.mutate(); }}
                loading={createMutation.isPending}
                disabled={!newChannelName.trim()}
              />
            </View>
          </KeyboardAvoidingView>
        </BottomSheet>
      </>
  
    </ScreenErrorBoundary>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: spacing.base,
    marginBottom: spacing.base,
    paddingHorizontal: spacing.md,
    borderRadius: radius.full,
    borderWidth: 1,
  },
  searchIcon: {
    marginEnd: spacing.sm,
  },
  searchInput: {
    flex: 1,
    fontSize: fontSize.base,
    paddingVertical: spacing.sm,
    paddingEnd: spacing.sm,
  },
  clearButton: {
    padding: spacing.xs,
  },
  tabSelector: {
    marginHorizontal: spacing.base,
    marginBottom: spacing.base,
  },
  listContent: {
    paddingHorizontal: spacing.base,
    paddingBottom: spacing.base,
    gap: spacing.sm,
  },
  channelCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.base,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.active.white6,
    gap: spacing.md,
  },
  avatarBg: {
    padding: spacing.xs,
    borderRadius: radius.full,
  },
  channelInfo: {
    flex: 1,
  },
  channelName: {
    fontSize: fontSize.md,
    fontWeight: '600',
    marginBottom: spacing.xs,
  },
  channelDescription: {
    fontSize: fontSize.sm,
    marginBottom: spacing.xs,
  },
  subscribersBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.sm,
  },
  subscribersText: {
    color: colors.gold,
    fontSize: fontSize.xs,
    fontWeight: '600',
  },
  subscribeBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.md,
  },
  subscribeText: {
    fontSize: fontSize.sm,
    fontWeight: '600',
  },
});