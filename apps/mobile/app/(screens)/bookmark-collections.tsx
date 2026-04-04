import { useState, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable, useWindowDimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { ProgressiveImage } from '@/components/ui/ProgressiveImage';
import { LinearGradient } from 'expo-linear-gradient';

import { BrandedRefreshControl } from '@/components/ui/BrandedRefreshControl';
import { GlassHeader } from '@/components/ui/GlassHeader';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { Icon } from '@/components/ui/Icon';
import { colors, spacing, fontSize, radius } from '@/theme';
import { bookmarksApi } from '@/services/api';
import type { BookmarkCollection } from '@/types';
import { useContextualHaptic } from '@/hooks/useContextualHaptic';
import { useTranslation } from '@/hooks/useTranslation';
import { useThemeColors } from '@/hooks/useThemeColors';
import { ScreenErrorBoundary } from '@/components/ui/ScreenErrorBoundary';
import { navigate } from '@/utils/navigation';

export default function BookmarkCollectionsScreen() {
  const router = useRouter();
  const tc = useThemeColors();
  const insets = useSafeAreaInsets();
  const haptic = useContextualHaptic();
  const { t } = useTranslation();
  const { width: SCREEN_WIDTH } = useWindowDimensions();
  const [refreshing, setRefreshing] = useState(false);

  const { data: collections, isLoading, isError, refetch } = useQuery({
    queryKey: ['bookmark-collections'],
    queryFn: () => bookmarksApi.getCollections(),
    staleTime: 30_000,
  });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    haptic.navigate();
    await refetch();
    setRefreshing(false);
  }, [refetch, haptic]);

  const renderItem = useCallback(({ item, index }: { item: BookmarkCollection; index: number }) => (
    <Animated.View entering={FadeInUp.delay(Math.min(index, 15) * 50).duration(400)}>
      <Pressable
        accessibilityRole="button"
        style={({ pressed }) => [styles.card, { maxWidth: (SCREEN_WIDTH - spacing.base * 2 - spacing.md) / 2 }, pressed && { opacity: 0.7 }]}
        android_ripple={{ color: 'rgba(255,255,255,0.1)' }}
        onPress={() => {
          haptic.navigate();
          navigate('/(screens)/saved', { collection: item.name });
        }}
      >
        <LinearGradient
          colors={['rgba(45,53,72,0.5)', 'rgba(28,35,51,0.3)']}
          style={styles.cardGradient}
        >
          <View style={styles.coverWrap}>
            {item.thumbnailUrl ? (
              <ProgressiveImage uri={item.thumbnailUrl} width="100%" height={200} />
            ) : (
              <View style={[styles.cover, styles.placeholderCover, { backgroundColor: tc.bgElevated }]}>
                <LinearGradient
                  colors={['rgba(10,123,79,0.15)', 'rgba(200,150,62,0.1)']}
                  style={styles.placeholderGradient}
                >
                  <Icon name="bookmark" size={32} color={colors.emerald} />
                </LinearGradient>
              </View>
            )}
          </View>
          <View style={styles.info}>
            <Text style={[styles.name, { color: tc.text.primary }]} numberOfLines={1}>{item.name}</Text>
            <View style={styles.countBadge}>
              <Icon name="bookmark" size={10} color={tc.text.tertiary} />
              <Text style={[styles.count, { color: tc.text.secondary }]}>{t('screens.bookmarkCollections.savedCount', { count: item.count })}</Text>
            </View>
          </View>
        </LinearGradient>
      </Pressable>
    </Animated.View>
  ), [haptic, tc.text.primary, tc.text.secondary, tc.text.tertiary, tc.bgElevated, t, SCREEN_WIDTH]);

  if (isError) {
    return (
      <View style={[styles.container, { backgroundColor: tc.bg }]}>
        <GlassHeader 
          title={t('screens.bookmarkCollections.title')} 
          leftAction={{ icon: 'arrow-left', onPress: () => router.back(), accessibilityLabel: t('common.back') }} 
        />
        <View style={{ height: insets.top + 52 }} />
        <EmptyState 
          icon="bookmark" 
          title={t('screens.bookmarkCollections.errorTitle')} 
          subtitle={t('screens.bookmarkCollections.errorSubtitle')} 
          actionLabel={t('common.retry')} 
          onAction={() => refetch()} 
        />
      </View>
    );
  }

  if (isLoading && !collections) {
    const itemWidth = (SCREEN_WIDTH - spacing.base * 2 - spacing.md) / 2;
    return (
      <View style={[styles.container, { backgroundColor: tc.bg }]}>
        <GlassHeader
          title={t('screens.bookmarkCollections.title')}
          leftAction={{ icon: 'arrow-left', onPress: () => router.back(), accessibilityLabel: t('common.back') }}
        />
        <View style={{ height: insets.top + 52 }} />
        <View style={{ padding: spacing.base, flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md }}>
          {[1, 2].map((_, i) => (
            <View key={i} style={[styles.skeletonCard, { width: itemWidth, backgroundColor: tc.bgCard, borderColor: tc.border }]}>
              <Skeleton.Rect width="100%" height={itemWidth} borderRadius={radius.md} />
              <View style={{ padding: spacing.sm, gap: spacing.xs, marginTop: spacing.xs }}>
                <Skeleton.Rect width="70%" height={14} borderRadius={radius.sm} />
                <Skeleton.Rect width="40%" height={12} borderRadius={radius.sm} />
              </View>
            </View>
          ))}
        </View>
      </View>
    );
  }

  return (
    <ScreenErrorBoundary>
      <View style={[styles.container, { backgroundColor: tc.bg }]}>
        <GlassHeader 
          title={t('screens.bookmarkCollections.title')} 
          leftAction={{ icon: 'arrow-left', onPress: () => router.back(), accessibilityLabel: t('common.back') }} 
        />
      
        <FlatList
          data={collections || []}
          renderItem={renderItem}
          keyExtractor={(item) => item.name}
          numColumns={2}
          columnWrapperStyle={styles.columnWrapper}
          contentContainerStyle={[styles.listContent, { paddingTop: insets.top + 52 + spacing.md }]}
          removeClippedSubviews={true}
          refreshControl={
            <BrandedRefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
          ListEmptyComponent={
            <View style={styles.emptyWrap}>
              <EmptyState 
                icon="bookmark" 
                title={t('screens.bookmarkCollections.emptyTitle')} 
                subtitle={t('screens.bookmarkCollections.emptySubtitle')} 
              />
            </View>
          }
        />
      </View>
  
    </ScreenErrorBoundary>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: spacing.base,
    paddingBottom: spacing['2xl'],
  },
  columnWrapper: {
    justifyContent: 'space-between',
    marginBottom: spacing.md,
    gap: spacing.md,
  },
  emptyWrap: {
    marginTop: spacing['2xl'],
  },
  skeletonCard: {
    borderRadius: radius.lg,
    padding: spacing.sm,
    borderWidth: 0.5,
  },
  card: {
    flex: 1,
    borderRadius: radius.lg,
    overflow: 'hidden',
  },
  cardGradient: {
    flex: 1,
    borderRadius: radius.lg,
    borderWidth: 0.5,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  coverWrap: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: radius.md,
    overflow: 'hidden',
    margin: spacing.sm,
  },
  cover: {
    width: '100%',
    height: '100%',
  },
  placeholderCover: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholderGradient: {
    flex: 1,
    width: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  info: {
    padding: spacing.sm,
    gap: spacing.xs,
  },
  name: {
    fontSize: fontSize.base,
    fontWeight: '600',
  },
  countBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  count: {
    fontSize: fontSize.sm,
  },
});
