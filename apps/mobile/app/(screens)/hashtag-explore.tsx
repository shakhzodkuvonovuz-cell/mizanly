import { useState, useCallback, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, RefreshControl, TextInput, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';

import { GlassHeader } from '@/components/ui/GlassHeader';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { Icon } from '@/components/ui/Icon';
import { colors, spacing, fontSize, radius } from '@/theme';
import { hashtagsApi } from '@/services/api';
import type { HashtagInfo } from '@/types';
import { useHaptic } from '@/hooks/useHaptic';
import { useTranslation } from '@/hooks/useTranslation';
import { ScreenErrorBoundary } from '@/components/ui/ScreenErrorBoundary';

export default function HashtagExploreScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const haptic = useHaptic();
  const { t } = useTranslation();
  
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

  const renderItem = ({ item, index }: { item: HashtagInfo; index: number }) => (
    <Animated.View entering={FadeInUp.delay(index * 80).duration(400)}>
      <LinearGradient
        colors={['rgba(45,53,72,0.4)', 'rgba(28,35,51,0.2)']}
        style={styles.row}
      >
        <Pressable
          style={styles.rowInner}
          onPress={() => router.push(`/(screens)/search-results?q=${encodeURIComponent('#' + item.name)}` as never)}
        >
          <LinearGradient
            colors={['rgba(10,123,79,0.2)', 'rgba(200,150,62,0.1)']}
            style={styles.iconWrap}
          >
            <Icon name="hash" size="sm" color={colors.emerald} />
          </LinearGradient>
          <View style={styles.info}>
            <Text style={styles.name} numberOfLines={1}>#{item.name}</Text>
            <Text style={styles.count}>
              {item.postsCount?.toLocaleString() || 0} <Text style={styles.countGold}>{t('common.posts')}</Text>
            </Text>
          </View>
          <Icon name="chevron-right" size="sm" color={colors.text.tertiary} />
        </Pressable>
      </LinearGradient>
    </Animated.View>
  );

  if (isError) {
    return (
      <View style={styles.container}>
        <GlassHeader
          title={t('screens.hashtag-explore.title')}
          leftAction={{ icon: 'arrow-left', onPress: () => router.back(), accessibilityLabel: t('saf.goBack') }}
        />
        <View style={{ height: insets.top + 52 }} />
        <EmptyState
          icon="hash"
          title={t('screens.hashtag-explore.errorTitle')}
          subtitle={t('screens.hashtag-explore.errorSubtitle')}
          actionLabel={t('common.retry')}
          onAction={() => refetchTrending()}
        />
      </View>
    );
  }

  return (
    <ScreenErrorBoundary>
      <View style={styles.container}>
        <GlassHeader
          title={t('screens.hashtag-explore.title')}
          leftAction={{ icon: 'arrow-left', onPress: () => router.back(), accessibilityLabel: t('saf.goBack') }}
        />
      
        <Animated.View entering={FadeInUp.delay(0).duration(400)} style={[styles.searchWrap, { marginTop: insets.top + 52 }]}>
          <LinearGradient
            colors={['rgba(45,53,72,0.4)', 'rgba(28,35,51,0.2)']}
            style={styles.searchInputWrap}
          >
            <LinearGradient
              colors={['rgba(10,123,79,0.2)', 'rgba(200,150,62,0.1)']}
              style={styles.searchIconBg}
            >
              <Icon name="search" size="xs" color={colors.emerald} />
            </LinearGradient>
            <TextInput
              style={styles.searchInput}
              placeholder={t('screens.hashtag-explore.searchPlaceholder')}
              placeholderTextColor={colors.text.tertiary}
              value={searchQuery}
              onChangeText={setSearchQuery}
              autoCapitalize="none"
              autoCorrect={false}
            />
            {searchQuery.length > 0 && (
              <Pressable hitSlop={8} onPress={() => setSearchQuery('')}>
                <Icon name="x" size="xs" color={colors.text.secondary} />
              </Pressable>
            )}
          </LinearGradient>
        </Animated.View>

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
                  title={debouncedQuery.length > 0 ? t('screens.hashtag-explore.emptyState') : t('screens.hashtag-explore.noTrending')}
                  subtitle={debouncedQuery.length > 0 ? t('screens.hashtag-explore.trySearching') : t('screens.hashtag-explore.checkBackLater')}
                />
              </View>
            }
          />
        )}
      </View>
  
    </ScreenErrorBoundary>
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
    zIndex: 1,
  },
  searchInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  searchIconBg: {
    width: 32, height: 32, borderRadius: radius.sm,
    alignItems: 'center', justifyContent: 'center',
  },
  searchInput: {
    flex: 1,
    color: colors.text.primary,
    fontSize: fontSize.base,
    height: 40,
  },
  listContent: {
    paddingBottom: spacing['2xl'],
    paddingHorizontal: spacing.base,
  },
  emptyWrap: {
    marginTop: spacing['2xl'],
  },
  row: {
    borderRadius: radius.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  rowInner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: radius.sm,
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
  countGold: {
    color: colors.gold,
  },
});
