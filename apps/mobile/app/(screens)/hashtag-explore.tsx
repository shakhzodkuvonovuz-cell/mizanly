import { useState, useCallback, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, RefreshControl, TextInput, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GlassHeader } from '@/components/ui/GlassHeader';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { Icon } from '@/components/ui/Icon';
import { colors, spacing, fontSize, radius } from '@/theme';
import { hashtagsApi } from '@/services/api';
import type { HashtagInfo } from '@/types';
import { useHaptic } from '@/hooks/useHaptic';

export default function HashtagExploreScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const haptic = useHaptic();
  
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(searchQuery);
    }, 500);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const { data: trending, isLoading: isTrendingLoading, isError: isTrendingError, refetch: refetchTrending } = useQuery({
    queryKey: ['hashtags-trending'],
    queryFn: () => hashtagsApi.getTrending(),
    enabled: debouncedQuery.length === 0,
  });

  const { data: searchResults, isLoading: isSearchLoading } = useQuery({
    queryKey: ['hashtags-search', debouncedQuery],
    queryFn: () => hashtagsApi.search(debouncedQuery),
    enabled: debouncedQuery.length > 0,
  });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    haptic.light();
    if (debouncedQuery.length === 0) {
      await refetchTrending();
    }
    setRefreshing(false);
  }, [refetchTrending, debouncedQuery, haptic]);

  const hashtags = debouncedQuery.length > 0 ? (searchResults || []) : (trending || []);
  const isLoading = debouncedQuery.length > 0 ? isSearchLoading : isTrendingLoading;
  const isError = debouncedQuery.length === 0 && isTrendingError;

  const renderItem = ({ item }: { item: HashtagInfo }) => (
    <Pressable 
      style={styles.row}
      onPress={() => router.push(`/(screens)/search-results?q=${encodeURIComponent('#' + item.name)}` as never)}
    >
      <View style={styles.iconWrap}>
        <Icon name="hash" size={20} color={colors.text.primary} />
      </View>
      <View style={styles.info}>
        <Text style={styles.name} numberOfLines={1}>#{item.name}</Text>
        <Text style={styles.count}>
          {item.postsCount?.toLocaleString() || 0} posts
        </Text>
      </View>
      <Icon name="chevron-right" size={20} color={colors.text.tertiary} />
    </Pressable>
  );

  if (isError) {
    return (
      <View style={styles.container}>
        <GlassHeader 
          title="Explore Hashtags" 
          leftAction={{ icon: 'arrow-left', onPress: () => router.back(), accessibilityLabel: 'Go back' }} 
        />
        <View style={{ height: insets.top + 52 }} />
        <EmptyState 
          icon="hash" 
          title="Couldn't load hashtags" 
          subtitle="Check your connection and try again" 
          actionLabel="Retry" 
          onAction={() => refetchTrending()} 
        />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <GlassHeader 
        title="Explore Hashtags" 
        leftAction={{ icon: 'arrow-left', onPress: () => router.back(), accessibilityLabel: 'Go back' }} 
      />
      
      <View style={[styles.searchWrap, { marginTop: insets.top + 52 }]}>
        <View style={styles.searchInputWrap}>
          <Icon name="search" size={16} color={colors.text.secondary} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search hashtags..."
            placeholderTextColor={colors.text.secondary}
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoCapitalize="none"
            autoCorrect={false}
          />
          {searchQuery.length > 0 && (
            <Pressable hitSlop={8} onPress={() => setSearchQuery('')}>
              <Icon name="x" size={16} color={colors.text.secondary} />
            </Pressable>
          )}
        </View>
      </View>

      {isLoading ? (
        <View style={{ padding: spacing.base, gap: spacing.md }}>
          <Skeleton.Rect width="100%" height={60} borderRadius={radius.md} />
          <Skeleton.Rect width="100%" height={60} borderRadius={radius.md} />
          <Skeleton.Rect width="100%" height={60} borderRadius={radius.md} />
        </View>
      ) : (
        <FlatList
          data={hashtags}
          renderItem={renderItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          keyboardShouldPersistTaps="handled"
          removeClippedSubviews={true}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.emerald} />
          }
          ListEmptyComponent={
            <View style={styles.emptyWrap}>
              <EmptyState 
                icon="hash" 
                title={debouncedQuery.length > 0 ? "No hashtags found" : "No trending hashtags"} 
                subtitle={debouncedQuery.length > 0 ? "Try searching for something else" : "Check back later"} 
              />
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { 
    flex: 1, 
    backgroundColor: colors.dark.bg 
  },
  searchWrap: {
    paddingHorizontal: spacing.base,
    paddingBottom: spacing.md,
    backgroundColor: colors.dark.bg,
    zIndex: 1,
  },
  searchInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.dark.surface,
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    height: 40,
    gap: spacing.sm,
  },
  searchInput: {
    flex: 1,
    color: colors.text.primary,
    fontSize: fontSize.base,
    height: '100%',
  },
  listContent: {
    paddingBottom: spacing.2xl,
  },
  emptyWrap: {
    marginTop: spacing.2xl,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
  },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: radius.full,
    backgroundColor: colors.dark.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  info: {
    flex: 1,
    justifyContent: 'center',
    gap: 2,
  },
  name: {
    fontSize: fontSize.base,
    fontWeight: '600',
    color: colors.text.primary,
  },
  count: {
    fontSize: fontSize.sm,
    color: colors.text.secondary,
  },
});
