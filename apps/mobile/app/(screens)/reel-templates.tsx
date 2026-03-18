import { useState, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, Pressable, FlatList,
  RefreshControl, Dimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeIn, FadeInUp } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { Image } from 'expo-image';
import { GlassHeader } from '@/components/ui/GlassHeader';
import { TabSelector } from '@/components/ui/TabSelector';
import { Icon } from '@/components/ui/Icon';
import { Avatar } from '@/components/ui/Avatar';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { GradientButton } from '@/components/ui/GradientButton';
import { ScreenErrorBoundary } from '@/components/ui/ScreenErrorBoundary';
import { colors, spacing, fontSize, radius, fonts } from '@/theme';
import { useHaptic } from '@/hooks/useHaptic';
import { useTranslation } from '@/hooks/useTranslation';
import { reelTemplatesApi } from '@/services/reelTemplatesApi';
import type { ReelTemplate } from '@/types/reelTemplates';

const { width: SCREEN_W } = Dimensions.get('window');
const CARD_GAP = spacing.sm;
const CARD_WIDTH = (SCREEN_W - spacing.base * 2 - CARD_GAP) / 2;
const CARD_IMAGE_HEIGHT = CARD_WIDTH * (16 / 9);

type TabKey = 'trending' | 'recent' | 'mine';

const TABS = [
  { key: 'trending', label: 'Trending' },
  { key: 'recent', label: 'Recent' },
  { key: 'mine', label: 'My Templates' },
] as const;

function formatMs(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const mins = Math.floor(totalSec / 60);
  const secs = totalSec % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function TemplateCardSkeleton() {
  return (
    <View style={styles.cardContainer}>
      <Skeleton.Rect width={CARD_WIDTH} height={CARD_IMAGE_HEIGHT} borderRadius={radius.md} />
      <View style={{ marginTop: spacing.sm, gap: spacing.xs }}>
        <Skeleton.Rect width={CARD_WIDTH * 0.7} height={14} borderRadius={radius.sm} />
        <Skeleton.Rect width={CARD_WIDTH * 0.4} height={12} borderRadius={radius.sm} />
      </View>
    </View>
  );
}

function SegmentTimeline({ segments, totalDurationMs }: { segments: ReelTemplate['segments']; totalDurationMs: number }) {
  const maxMs = totalDurationMs > 0 ? totalDurationMs : (segments.length > 0 ? segments[segments.length - 1].endMs : 1000);

  return (
    <View style={styles.timelineTrack}>
      {segments.map((seg, i) => {
        const left = (seg.startMs / maxMs) * 100;
        const width = ((seg.endMs - seg.startMs) / maxMs) * 100;
        return (
          <LinearGradient
            key={`seg-${i}`}
            colors={[colors.emerald, colors.gold]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={[
              styles.timelineSegment,
              { left: `${left}%`, width: `${Math.max(width, 2)}%` },
            ]}
          />
        );
      })}
    </View>
  );
}

export default function ReelTemplatesScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const haptic = useHaptic();
  const { t } = useTranslation();

  const [activeTab, setActiveTab] = useState<TabKey>('trending');
  const [selectedTemplate, setSelectedTemplate] = useState<ReelTemplate | null>(null);

  const isTrending = activeTab === 'trending';
  const queryKey = ['reel-templates', activeTab];

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
    isError,
    refetch,
    isRefetching,
  } = useInfiniteQuery({
    queryKey,
    queryFn: ({ pageParam }: { pageParam: string | undefined }) =>
      reelTemplatesApi.browse(pageParam, isTrending),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) =>
      lastPage.meta.hasMore ? (lastPage.meta.cursor ?? undefined) : undefined,
  });

  const templates = useMemo(() => {
    if (!data?.pages) return [];
    return data.pages.flatMap((page) => page.data);
  }, [data]);

  const handleRefresh = useCallback(() => {
    refetch();
  }, [refetch]);

  const handleEndReached = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const handleCardPress = useCallback((template: ReelTemplate) => {
    haptic.light();
    setSelectedTemplate((prev) => (prev?.id === template.id ? null : template));
  }, [haptic]);

  const handleUseTemplate = useCallback((template: ReelTemplate) => {
    haptic.light();
    reelTemplatesApi.use(template.id).catch(() => {
      // silently increment use count
    });
    router.push({
      pathname: '/(screens)/create-reel',
      params: { templateId: template.id },
    });
  }, [haptic, router]);

  const handleBack = useCallback(() => {
    router.back();
  }, [router]);

  const handleTabChange = useCallback((key: string) => {
    setActiveTab(key as TabKey);
    setSelectedTemplate(null);
  }, []);

  const renderCard = useCallback(({ item, index }: { item: ReelTemplate; index: number }) => {
    const isSelected = selectedTemplate?.id === item.id;

    return (
      <Animated.View entering={FadeInUp.delay(index * 50).duration(300)}>
        <Pressable
          accessibilityRole="button"
          style={[styles.cardContainer, isSelected && styles.cardContainerSelected]}
          onPress={() => handleCardPress(item)}
        >
          {/* Thumbnail */}
          <View style={styles.cardImageWrap}>
            {item.sourceReel?.thumbnailUrl ? (
              <Image
                source={{ uri: item.sourceReel.thumbnailUrl }}
                style={styles.cardImage}
                contentFit="cover"
              />
            ) : (
              <View style={[styles.cardImage, styles.cardImagePlaceholder]}>
                <Icon name="video" size="lg" color={colors.text.tertiary} />
              </View>
            )}

            {/* Segment count badge */}
            <View style={styles.segmentBadge}>
              <LinearGradient
                colors={['rgba(0,0,0,0.7)', 'rgba(0,0,0,0.5)']}
                style={styles.segmentBadgeGradient}
              >
                <Icon name="layers" size={10} color="#fff" />
                <Text style={styles.segmentBadgeText}>{item.segments.length}</Text>
              </LinearGradient>
            </View>
          </View>

          {/* Card info */}
          <View style={styles.cardInfo}>
            <Text style={styles.cardName} numberOfLines={1}>{item.name}</Text>
            <View style={styles.cardMeta}>
              <Icon name="trending-up" size={12} color={colors.gold} />
              <Text style={styles.cardUseCount}>
                {item.useCount >= 1000
                  ? `${(item.useCount / 1000).toFixed(1)}k`
                  : item.useCount}
              </Text>
              {item.sourceReel?.user && (
                <Avatar
                  uri={item.sourceReel.user.avatarUrl}
                  name={item.sourceReel.user.username}
                  size="xs"
                />
              )}
            </View>
          </View>

          {/* Expanded preview */}
          {isSelected && (
            <Animated.View entering={FadeIn.duration(200)} style={styles.expandedSection}>
              {/* Segment timeline */}
              <View style={styles.timelineContainer}>
                <Text style={styles.timelineLabel}>{t('reelTemplates.timeline')}</Text>
                <SegmentTimeline
                  segments={item.segments}
                  totalDurationMs={item.segments.length > 0 ? item.segments[item.segments.length - 1].endMs : 0}
                />
              </View>

              {/* Segment list */}
              <View style={styles.segmentList}>
                {item.segments.map((seg, i) => (
                  <View key={`detail-${i}`} style={styles.segmentRow}>
                    <View style={styles.segmentDot} />
                    <Text style={styles.segmentTime}>
                      {formatMs(seg.startMs)} - {formatMs(seg.endMs)}
                    </Text>
                    {seg.text && (
                      <Text style={styles.segmentText} numberOfLines={1}>{seg.text}</Text>
                    )}
                  </View>
                ))}
              </View>

              {/* Use button */}
              <View style={styles.useButtonContainer}>
                <GradientButton
                  label={t('reelTemplates.useTemplate')}
                  onPress={() => handleUseTemplate(item)}
                  icon="play"
                  fullWidth
                  size="sm"
                />
              </View>
            </Animated.View>
          )}
        </Pressable>
      </Animated.View>
    );
  }, [selectedTemplate, handleCardPress, handleUseTemplate, t]);

  const renderFooter = useCallback(() => {
    if (!isFetchingNextPage) return null;
    return (
      <View style={styles.footerLoader}>
        <View style={styles.footerRow}>
          <TemplateCardSkeleton />
          <TemplateCardSkeleton />
        </View>
      </View>
    );
  }, [isFetchingNextPage]);

  const renderEmpty = useCallback(() => {
    if (isLoading) {
      return (
        <View style={styles.skeletonGrid}>
          {Array.from({ length: 6 }).map((_, i) => (
            <TemplateCardSkeleton key={`skel-${i}`} />
          ))}
        </View>
      );
    }
    if (isError) {
      return (
        <EmptyState
          icon="video"
          title={t('reelTemplates.errorTitle')}
          subtitle={t('reelTemplates.errorSubtitle')}
          actionLabel={t('common.retry')}
          onAction={() => refetch()}
        />
      );
    }
    return (
      <EmptyState
        icon="layers"
        title={activeTab === 'mine'
          ? t('reelTemplates.noMyTemplates')
          : t('reelTemplates.noTemplates')}
        subtitle={activeTab === 'mine'
          ? t('reelTemplates.noMyTemplatesSubtitle')
          : t('reelTemplates.noTemplatesSubtitle')}
      />
    );
  }, [isLoading, isError, activeTab, t, refetch]);

  const keyExtractor = useCallback((item: ReelTemplate) => item.id, []);

  return (
    <ScreenErrorBoundary>
      <View style={styles.container}>
        <GlassHeader
          title={t('reelTemplates.title')}
          leftAction={{
            icon: 'arrow-left',
            onPress: handleBack,
            accessibilityLabel: t('common.back'),
          }}
        />

        <View style={{ paddingTop: insets.top + 52 }}>
          <TabSelector
            tabs={TABS}
            activeKey={activeTab}
            onTabChange={handleTabChange}
            variant="pill"
          />
        </View>

        <FlatList
          data={templates}
          renderItem={renderCard}
          keyExtractor={keyExtractor}
          numColumns={2}
          columnWrapperStyle={styles.columnWrapper}
          contentContainerStyle={[
            styles.listContent,
            templates.length === 0 && styles.listContentEmpty,
          ]}
          refreshControl={
            <RefreshControl
              tintColor={colors.emerald}
              refreshing={isRefetching && !isLoading}
              onRefresh={handleRefresh}
            />
          }
          onEndReached={handleEndReached}
          onEndReachedThreshold={0.5}
          ListFooterComponent={renderFooter}
          ListEmptyComponent={renderEmpty}
          showsVerticalScrollIndicator={false}
        />
      </View>
    </ScreenErrorBoundary>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.dark.bg,
  },
  listContent: {
    padding: spacing.base,
    paddingBottom: spacing['2xl'],
  },
  listContentEmpty: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  columnWrapper: {
    gap: CARD_GAP,
    marginBottom: CARD_GAP,
  },

  // Card
  cardContainer: {
    width: CARD_WIDTH,
    backgroundColor: colors.dark.bgCard,
    borderRadius: radius.md,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  cardContainerSelected: {
    borderColor: colors.emerald,
  },
  cardImageWrap: {
    width: CARD_WIDTH,
    height: CARD_IMAGE_HEIGHT,
    position: 'relative',
  },
  cardImage: {
    width: '100%',
    height: '100%',
    borderTopLeftRadius: radius.md,
    borderTopRightRadius: radius.md,
  },
  cardImagePlaceholder: {
    backgroundColor: colors.dark.surface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  segmentBadge: {
    position: 'absolute',
    top: spacing.xs,
    right: spacing.xs,
  },
  segmentBadgeGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.sm,
  },
  segmentBadgeText: {
    color: '#fff',
    fontSize: fontSize.xs,
    fontWeight: '600',
  },
  cardInfo: {
    padding: spacing.sm,
  },
  cardName: {
    color: colors.text.primary,
    fontSize: fontSize.sm,
    fontWeight: '700',
    marginBottom: spacing.xs,
  },
  cardMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  cardUseCount: {
    color: colors.text.secondary,
    fontSize: fontSize.xs,
    flex: 1,
  },

  // Expanded
  expandedSection: {
    paddingHorizontal: spacing.sm,
    paddingBottom: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.dark.border,
  },

  // Timeline
  timelineContainer: {
    marginTop: spacing.sm,
    marginBottom: spacing.sm,
  },
  timelineLabel: {
    color: colors.text.tertiary,
    fontSize: fontSize.xs,
    marginBottom: spacing.xs,
  },
  timelineTrack: {
    height: 8,
    backgroundColor: colors.dark.surface,
    borderRadius: radius.sm,
    overflow: 'hidden',
    position: 'relative',
  },
  timelineSegment: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    borderRadius: radius.sm,
  },

  // Segment list
  segmentList: {
    gap: spacing.xs,
    marginBottom: spacing.sm,
  },
  segmentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  segmentDot: {
    width: 6,
    height: 6,
    borderRadius: radius.full,
    backgroundColor: colors.emerald,
  },
  segmentTime: {
    color: colors.text.secondary,
    fontSize: fontSize.xs,
    fontFamily: fonts.mono,
  },
  segmentText: {
    color: colors.text.tertiary,
    fontSize: fontSize.xs,
    flex: 1,
  },

  // Use button
  useButtonContainer: {
    marginTop: spacing.xs,
  },

  // Skeleton
  skeletonGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: CARD_GAP,
    padding: spacing.base,
  },

  // Footer
  footerLoader: {
    paddingVertical: spacing.md,
  },
  footerRow: {
    flexDirection: 'row',
    gap: CARD_GAP,
  },
});
