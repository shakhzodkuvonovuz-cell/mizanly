import { useState, useCallback, useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  TextInput,
  RefreshControl,
  Alert,
  NativeSyntheticEvent,
  TextInputSubmitEditingEventData,
} from 'react-native';
import { useMutation } from '@tanstack/react-query';
import { Stack, useNavigation, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from '@/components/ui/Icon';
import { Avatar } from '@/components/ui/Avatar';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { TabSelector } from '@/components/ui/TabSelector';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { ActionButton } from '@/components/ui/ActionButton';
import { GlassHeader } from '@/components/ui/GlassHeader';
import { GradientButton } from '@/components/ui/GradientButton';
import { colors, spacing, fontSize, radius } from '@/theme';
import { broadcastApi } from '@/services/api';
import type { BroadcastChannel as BroadcastChannelType } from '@/types';

type BroadcastChannelWithSubscription = BroadcastChannelType & { isSubscribed?: boolean; isMuted?: boolean };

type TabKey = 'discover' | 'my';

export default function BroadcastChannelsScreen() {
  const navigation = useNavigation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [activeTab, setActiveTab] = useState<TabKey>('discover');
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [showCreateSheet, setShowCreateSheet] = useState(false);
  const [newChannelName, setNewChannelName] = useState('');
  const [newChannelDesc, setNewChannelDesc] = useState('');

  const createMutation = useMutation({
    mutationFn: () => broadcastApi.create({ name: newChannelName, slug: newChannelName.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, ''), description: newChannelDesc }),
    onSuccess: (data) => {
      setShowCreateSheet(false);
      setNewChannelName('');
      setNewChannelDesc('');
      loadMyChannels(true);
      router.push(`/(screens)/broadcast/${data.id}` as never);
    },
    onError: () => Alert.alert('Error', 'Failed to create channel'),
  });
  const [discoverChannels, setDiscoverChannels] = useState<BroadcastChannelWithSubscription[]>([]);
  const [myChannels, setMyChannels] = useState<BroadcastChannelWithSubscription[]>([]);
  const [discoverCursor, setDiscoverCursor] = useState<string | null>(null);
  const [discoverHasMore, setDiscoverHasMore] = useState(true);
  const [discoverLoading, setDiscoverLoading] = useState(false);
  const [discoverError, setDiscoverError] = useState(false);
  const [myChannelsLoading, setMyChannelsLoading] = useState(false);
  const [myChannelsError, setMyChannelsError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const searchInputRef = useRef<TextInput>(null);

  const loadDiscoverChannels = useCallback(async (refresh = false) => {
    if (discoverLoading && !refresh) return;
    setDiscoverLoading(true);
    setDiscoverError(false);
    try {
      const cursor = refresh ? undefined : discoverCursor ?? undefined;
      const response = await broadcastApi.discover(cursor);
      setDiscoverChannels(prev => refresh ? response.data : [...prev, ...response.data]);
      setDiscoverCursor(response.meta.cursor);
      setDiscoverHasMore(response.meta.hasMore);
    } catch (error) {
      console.error('Failed to load discover channels', error);
      setDiscoverError(true);
    } finally {
      setDiscoverLoading(false);
      if (refresh) setRefreshing(false);
    }
  }, [discoverCursor, discoverLoading]);

  const loadMyChannels = useCallback(async (refresh = false) => {
    if (myChannelsLoading && !refresh) return;
    setMyChannelsLoading(true);
    setMyChannelsError(false);
    try {
      const channels = await broadcastApi.getMyChannels();
      setMyChannels(channels);
    } catch (error) {
      console.error('Failed to load my channels', error);
      setMyChannelsError(true);
    } finally {
      setMyChannelsLoading(false);
      if (refresh) setRefreshing(false);
    }
  }, [myChannelsLoading]);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    if (activeTab === 'discover') {
      loadDiscoverChannels(true);
    } else {
      loadMyChannels(true);
    }
  }, [activeTab, loadDiscoverChannels, loadMyChannels]);

  const handleLoadMore = useCallback(() => {
    if (activeTab === 'discover' && discoverHasMore && !discoverLoading) {
      loadDiscoverChannels();
    }
  }, [activeTab, discoverHasMore, discoverLoading, loadDiscoverChannels]);

  const handleSearchSubmit = useCallback((e: NativeSyntheticEvent<TextInputSubmitEditingEventData>) => {
    // Client-side search is handled by the filteredData memo
    setIsSearching(!!searchQuery.trim());
  }, [searchQuery]);

  const handleChannelPress = useCallback((channel: BroadcastChannelWithSubscription) => {
    navigation.navigate('broadcast/[id]', { id: channel.id });
  }, [navigation]);

  const handleSubscribe = useCallback(async (channel: BroadcastChannelWithSubscription) => {
    try {
      if (channel.isSubscribed) {
        await broadcastApi.unsubscribe(channel.id);
        // Update local state
        setDiscoverChannels(prev => prev.map(c => c.id === channel.id ? { ...c, isSubscribed: false, subscribersCount: c.subscribersCount - 1 } : c));
        setMyChannels(prev => prev.filter(c => c.id !== channel.id));
      } else {
        await broadcastApi.subscribe(channel.id);
        setDiscoverChannels(prev => prev.map(c => c.id === channel.id ? { ...c, isSubscribed: true, subscribersCount: c.subscribersCount + 1 } : c));
        setMyChannels(prev => [...prev, { ...channel, isSubscribed: true }]);
      }
    } catch (error) {
      console.error('Failed to toggle subscription', error);
    }
  }, []);

  const renderChannelItem = useCallback(({ item }: { item: BroadcastChannelWithSubscription }) => (
    <Pressable style={styles.channelCard} onPress={() => handleChannelPress(item)}>
      <Avatar uri={item.avatarUrl} name={item.name} size="lg" />
      <View style={styles.channelInfo}>
        <Text style={styles.channelName}>{item.name}</Text>
        <Text style={styles.channelDescription} numberOfLines={2}>{item.description}</Text>
        <Text style={styles.channelSubscribers}>
          {item.subscribersCount.toLocaleString()} subscribers
        </Text>
      </View>
      <ActionButton
        label={item.isSubscribed ? 'Subscribed' : 'Subscribe'}
        variant={item.isSubscribed ? 'outline' : 'primary'}
        size="sm"
        onPress={(e) => {
          e.stopPropagation();
          handleSubscribe(item);
        }}
      />
    </Pressable>
  ), [handleChannelPress, handleSubscribe]);

  const renderEmptyState = useCallback(() => {
    if (activeTab === 'discover') {
      if (discoverError) {
        return (
          <EmptyState
            icon="flag"
            title="Couldn't load content"
            subtitle="Check your connection and try again"
            actionLabel="Retry"
            onAction={() => loadDiscoverChannels(true)}
          />
        );
      }
      return (
        <EmptyState
          icon="users"
          title="No channels found"
          subtitle="Try again later or search for something else"
          actionLabel="Refresh"
          onAction={() => handleRefresh()}
        />
      );
    }
    if (myChannelsError) {
      return (
        <EmptyState
          icon="flag"
          title="Couldn't load content"
          subtitle="Check your connection and try again"
          actionLabel="Retry"
          onAction={() => loadMyChannels(true)}
        />
      );
    }
    return (
      <EmptyState
        icon="bell"
        title="You haven't joined any channels"
        subtitle="Discover channels and subscribe to get updates"
        actionLabel="Discover channels"
        onAction={() => setActiveTab('discover')}
      />
    );
  }, [activeTab, handleRefresh, discoverError, myChannelsError, loadDiscoverChannels, loadMyChannels]);

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
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <GlassHeader
        title="Channels"
        leftAction={{ icon: 'arrow-left', onPress: () => router.back(), accessibilityLabel: 'Back' }}
        rightAction={{ icon: 'plus', onPress: () => setShowCreateSheet(true), accessibilityLabel: 'Create channel' }}
      />
      <View style={styles.container}>
        <View style={[styles.searchContainer, { marginTop: insets.top + 52 + spacing.base }]}>
          <Icon name="search" size="sm" color={colors.text.secondary} style={styles.searchIcon} />
          <TextInput
            ref={searchInputRef}
            style={styles.searchInput}
            placeholder="Search channels"
            placeholderTextColor={colors.text.tertiary}
            value={searchQuery}
            onChangeText={setSearchQuery}
            onSubmitEditing={handleSearchSubmit}
            returnKeyType="search"
          />
          {searchQuery.length > 0 && (
            <Pressable onPress={() => setSearchQuery('')} style={styles.clearButton}>
              <Icon name="x" size="sm" color={colors.text.secondary} />
            </Pressable>
          )}
        </View>

        <TabSelector
          tabs={[
            { key: 'discover', label: 'Discover' },
            { key: 'my', label: 'My Channels' },
          ]}
          activeKey={activeTab}
          onTabChange={setActiveTab}
          variant="underline"
          style={styles.tabSelector}
        />

        <FlatList
          removeClippedSubviews={true}
          data={filteredData}
          renderItem={renderChannelItem}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={loading ? null : renderEmptyState}
          ListFooterComponent={loading && filteredData.length > 0 ? renderSkeleton : null}
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
      </View>
      <BottomSheet visible={showCreateSheet} onClose={() => setShowCreateSheet(false)} snapPoint={0.5}>
        <View style={{ padding: spacing.base, gap: spacing.md }}>
          <Text style={{ fontSize: fontSize.lg, fontWeight: '600', color: colors.text.primary }}>Create Channel</Text>
          <TextInput
            style={{ backgroundColor: colors.dark.surface, borderRadius: radius.md, padding: spacing.md, color: colors.text.primary, fontSize: fontSize.base }}
            placeholder="Channel name"
            placeholderTextColor={colors.text.tertiary}
            value={newChannelName}
            onChangeText={setNewChannelName}
            maxLength={50}
          />
          <TextInput
            style={{ backgroundColor: colors.dark.surface, borderRadius: radius.md, padding: spacing.md, color: colors.text.primary, fontSize: fontSize.base, minHeight: 80 }}
            placeholder="Description (optional)"
            placeholderTextColor={colors.text.tertiary}
            value={newChannelDesc}
            onChangeText={setNewChannelDesc}
            maxLength={200}
            multiline
          />
          <GradientButton
            label="Create"
            onPress={() => createMutation.mutate()}
            loading={createMutation.isPending}
            disabled={!newChannelName.trim()}
          />
        </View>
      </BottomSheet>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.dark.bg,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.dark.bgElevated,
    marginHorizontal: spacing.base,
    marginBottom: spacing.base,
    paddingHorizontal: spacing.md,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.dark.border,
  },
  searchIcon: {
    marginRight: spacing.sm,
  },
  searchInput: {
    flex: 1,
    color: colors.text.primary,
    fontSize: fontSize.base,
    paddingVertical: spacing.sm,
    paddingRight: spacing.sm,
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
  },
  channelCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.dark.bgCard,
    padding: spacing.base,
    borderRadius: radius.lg,
    marginBottom: spacing.sm,
    gap: spacing.md,
  },
  channelInfo: {
    flex: 1,
  },
  channelName: {
    color: colors.text.primary,
    fontSize: fontSize.md,
    fontWeight: '600',
    marginBottom: spacing.xs,
  },
  channelDescription: {
    color: colors.text.secondary,
    fontSize: fontSize.sm,
    marginBottom: spacing.xs,
  },
  channelSubscribers: {
    color: colors.text.tertiary,
    fontSize: fontSize.xs,
  },
});