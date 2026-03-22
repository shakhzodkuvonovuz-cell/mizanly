import { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, Pressable,
  FlatList, Alert,
} from 'react-native';
import { BrandedRefreshControl } from '@/components/ui/BrandedRefreshControl';
import { useRouter } from 'expo-router';
import { useInfiniteQuery, useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { Icon } from '@/components/ui/Icon';
import { GlassHeader } from '@/components/ui/GlassHeader';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { BottomSheet, BottomSheetItem } from '@/components/ui/BottomSheet';
import { colors, spacing, fontSize, radius, fontSizeExt } from '@/theme';
import { downloadsApi } from '@/services/api';
import { useTranslation } from '@/hooks/useTranslation';
import { useContextualHaptic } from '@/hooks/useContextualHaptic';
import { useThemeColors } from '@/hooks/useThemeColors';
import { ScreenErrorBoundary } from '@/components/ui/ScreenErrorBoundary';
import type { OfflineDownload } from '@/types';
import { navigate } from '@/utils/navigation';

// ── Helpers ──

const formatBytes = (bytes: number): string => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
};

const FILTER_TABS = ['all', 'downloading', 'complete'] as const;
type FilterTab = typeof FILTER_TABS[number];

// ── Storage Bar ──

function StorageBar({ usedBytes, totalBytes }: { usedBytes: number; totalBytes: number }) {
  const { t } = useTranslation();
  const tc = useThemeColors();
  const pct = totalBytes > 0 ? Math.min((usedBytes / totalBytes) * 100, 100) : 0;

  return (
    <LinearGradient
      colors={colors.gradient.cardDark}
      style={styles.storageCard}
    >
      <View style={styles.storageHeader}>
        <View style={styles.storageIconRow}>
          <LinearGradient
            colors={['rgba(10,123,79,0.2)', 'rgba(200,150,62,0.1)']}
            style={styles.storageIconBg}
          >
            <Icon name="layers" size="sm" color={colors.emerald} />
          </LinearGradient>
          <Text style={[styles.storageTitle, { color: tc.text.primary }]}>{t('downloads.storage')}</Text>
        </View>
        <Text style={[styles.storageLabel, { color: tc.text.tertiary }]}>
          {t('downloads.storageUsed', { used: formatBytes(usedBytes), total: formatBytes(totalBytes) })}
        </Text>
      </View>
      <View style={[styles.storageBarBg, { backgroundColor: tc.surface }]}>
        <LinearGradient
          colors={[colors.emerald, colors.gold]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={[styles.storageBarFill, { width: `${Math.max(pct, 1)}%` }]}
        />
      </View>
    </LinearGradient>
  );
}

// ── Filter Chips ──

function FilterChips({
  active,
  onChange,
}: {
  active: FilterTab;
  onChange: (tab: FilterTab) => void;
}) {
  const { t } = useTranslation();
  const haptic = useContextualHaptic();
  const tc = useThemeColors();

  const labels: Record<FilterTab, string> = {
    all: t('downloads.all'),
    downloading: t('downloads.downloading'),
    complete: t('downloads.complete'),
  };

  return (
    <View style={styles.chipRow}>
      {FILTER_TABS.map((tab) => {
        const isActive = tab === active;
        return (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={labels[tab]}
            key={tab}
            onPress={() => { haptic.tick(); onChange(tab); }}
            style={[styles.chip, { backgroundColor: tc.surface, borderColor: tc.border }, isActive && styles.chipActive]}
          >
            <Text style={[styles.chipText, { color: tc.text.secondary }, isActive && styles.chipTextActive]}>
              {labels[tab]}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// ── Download Item ──

function DownloadItem({
  item,
  index,
  onLongPress,
  onAction,
}: {
  item: OfflineDownload;
  index: number;
  onLongPress: (item: OfflineDownload) => void;
  onAction: (item: OfflineDownload, action: 'pause' | 'resume' | 'retry' | 'delete') => void;
}) {
  const { t } = useTranslation();
  const tc = useThemeColors();

  const typeBadgeColors: Record<string, string> = {
    post: colors.emerald,
    video: colors.gold,
    reel: '#9B5DE5',
  };

  const badgeColor = typeBadgeColors[item.contentType] ?? colors.emerald;

  return (
    <Animated.View entering={FadeInUp.delay(index * 40).duration(350)}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={(item as Record<string, unknown>).title as string || `${item.contentType} ${item.contentId.slice(0, 8)}`}
        style={styles.downloadItem}
        onLongPress={() => onLongPress(item)}
        delayLongPress={400}
      >
        {/* Thumbnail placeholder */}
        <LinearGradient
          colors={['rgba(45,53,72,0.5)', 'rgba(28,35,51,0.3)']}
          style={styles.itemThumb}
        >
          <Icon
            name={item.contentType === 'post' ? 'image' : 'video'}
            size="md"
            color={tc.text.tertiary}
          />
          {/* Type badge */}
          <View style={[styles.typeBadge, { backgroundColor: badgeColor }]}>
            <Text style={styles.typeBadgeText}>{item.contentType.toUpperCase()}</Text>
          </View>
        </LinearGradient>

        {/* Info */}
        <View style={styles.itemInfo}>
          <Text style={[styles.itemTitle, { color: tc.text.primary }]} numberOfLines={1}>
            {(item as Record<string, unknown>).title as string || `${item.contentType} ${item.contentId.slice(0, 8)}...`}
          </Text>
          <View style={styles.itemMeta}>
            <Text style={[styles.itemSize, { color: tc.text.tertiary }]}>{formatBytes(item.fileSize)}</Text>
            <Text style={[styles.itemStatus, { color: tc.text.secondary }]}>
              {item.status === 'complete' ? t('downloads.complete')
               : item.status === 'downloading' ? `${Math.round(item.progress * 100)}%`
               : item.status === 'paused' ? t('downloads.paused')
               : item.status === 'failed' ? t('downloads.failed')
               : '...'}
            </Text>
          </View>

          {/* Progress bar for active downloads */}
          {(item.status === 'downloading' || item.status === 'paused') && (
            <View style={[styles.progressBarBg, { backgroundColor: tc.surface }]}>
              <LinearGradient
                colors={[colors.emerald, colors.extended.greenDark]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={[styles.progressBarFill, { width: `${Math.max(item.progress * 100, 2)}%` }]}
              />
            </View>
          )}
        </View>

        {/* Action button */}
        <View style={styles.itemAction}>
          {item.status === 'downloading' && (
            <Pressable accessibilityRole="button" accessibilityLabel={t('downloads.paused')} onPress={() => onAction(item, 'pause')} style={styles.actionBtn}>
              <Icon name="clock" size="sm" color={tc.text.secondary} />
            </Pressable>
          )}
          {item.status === 'paused' && (
            <Pressable accessibilityRole="button" accessibilityLabel={t('downloads.resume')} onPress={() => onAction(item, 'resume')} style={styles.actionBtn}>
              <Icon name="play" size="sm" color={colors.emerald} />
            </Pressable>
          )}
          {item.status === 'failed' && (
            <Pressable accessibilityRole="button" accessibilityLabel={t('common.retry')} onPress={() => onAction(item, 'retry')} style={styles.actionBtn}>
              <Icon name="loader" size="sm" color={colors.gold} />
            </Pressable>
          )}
          {item.status === 'complete' && (
            <Pressable accessibilityRole="button" accessibilityLabel={t('downloads.delete')} onPress={() => onAction(item, 'delete')} style={styles.actionBtn}>
              <Icon name="trash" size="sm" color={colors.error} />
            </Pressable>
          )}
        </View>
      </Pressable>
    </Animated.View>
  );
}

// ── Main Screen ──

export default function DownloadsScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const haptic = useContextualHaptic();
  const queryClient = useQueryClient();

  const [filter, setFilter] = useState<FilterTab>('all');
  const [refreshing, setRefreshing] = useState(false);
  const [sheetItem, setSheetItem] = useState<OfflineDownload | null>(null);
  const tc = useThemeColors();

  // Storage stats
  const storageQuery = useQuery({
    queryKey: ['downloads-storage'],
    queryFn: () => downloadsApi.getStorage() as Promise<{ usedBytes: number; count: number }>,
  });
  const storageData = storageQuery.data;

  // Downloads list
  const statusParam = filter === 'all' ? undefined : filter;
  const downloadsQuery = useInfiniteQuery({
    queryKey: ['downloads', filter],
    queryFn: ({ pageParam }) =>
      downloadsApi.getAll({ status: statusParam, cursor: pageParam as string | undefined }) as Promise<{
        data: OfflineDownload[];
        meta: { cursor: string | null; hasMore: boolean };
      }>,
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => (last.meta?.hasMore ? last.meta.cursor ?? undefined : undefined),
  });

  const items: OfflineDownload[] = downloadsQuery.data?.pages.flatMap((p) => p.data) ?? [];

  const deleteMutation = useMutation({
    mutationFn: (id: string) => downloadsApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['downloads'] });
      queryClient.invalidateQueries({ queryKey: ['downloads-storage'] });
    },
  });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([downloadsQuery.refetch(), storageQuery.refetch()]);
    setRefreshing(false);
  }, [downloadsQuery, storageQuery]);

  const onEndReached = useCallback(() => {
    if (downloadsQuery.hasNextPage && !downloadsQuery.isFetchingNextPage) {
      downloadsQuery.fetchNextPage();
    }
  }, [downloadsQuery.hasNextPage, downloadsQuery.isFetchingNextPage, downloadsQuery.fetchNextPage]);

  const handleAction = useCallback(
    (item: OfflineDownload, action: 'pause' | 'resume' | 'retry' | 'delete') => {
      haptic.tick();
      if (action === 'delete') {
        Alert.alert(t('downloads.deleteConfirm'), '', [
          { text: t('common.cancel'), style: 'cancel' },
          {
            text: t('downloads.delete'),
            style: 'destructive',
            onPress: () => deleteMutation.mutate(item.id),
          },
        ]);
      }
      // Pause/resume requires a native download manager module
    },
    [haptic, t, deleteMutation],
  );

  const handleLongPress = useCallback(
    (item: OfflineDownload) => {
      haptic.longPress();
      setSheetItem(item);
    },
    [haptic],
  );

  const handleSheetClose = useCallback(() => setSheetItem(null), []);

  // Error state
  if (downloadsQuery.isError) {
    return (
      <View style={[styles.container, { backgroundColor: tc.bg }]}>
        <GlassHeader
          title={t('downloads.title')}
          leftAction={{ icon: 'arrow-left', onPress: () => router.back(), accessibilityLabel: t('common.back') }}
        />
        <View style={styles.headerSpacer} />
        <EmptyState
          icon="flag"
          title={t('common.error')}
          subtitle={t('common.retry')}
          actionLabel={t('common.retry')}
          onAction={() => downloadsQuery.refetch()}
        />
      </View>
    );
  }

  return (
    <ScreenErrorBoundary>
      <View style={[styles.container, { backgroundColor: tc.bg }]}>
        <GlassHeader
          title={t('downloads.title')}
          leftAction={{ icon: 'arrow-left', onPress: () => router.back(), accessibilityLabel: t('common.back') }}
        />
        <View style={styles.headerSpacer} />

        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          onEndReached={onEndReached}
          onEndReachedThreshold={0.4}
          refreshControl={
            <BrandedRefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
          ListHeaderComponent={() => (
            <View>
              {/* Storage bar */}
              <StorageBar
                usedBytes={storageData?.usedBytes ?? 0}
                totalBytes={1_073_741_824} // 1 GB default cap
              />
              {/* Filter chips */}
              <FilterChips active={filter} onChange={setFilter} />
            </View>
          )}
          renderItem={({ item, index }) => (
            <DownloadItem
              item={item}
              index={index}
              onLongPress={handleLongPress}
              onAction={handleAction}
            />
          )}
          ListEmptyComponent={() =>
            !downloadsQuery.isLoading ? (
              <EmptyState
                icon="layers"
                title={t('downloads.empty')}
                subtitle={t('downloads.emptySubtitle')}
              />
            ) : (
              <View style={styles.skeletonContainer}>
                {Array.from({ length: 4 }).map((_, i) => (
                  <View key={i} style={styles.skeletonItem}>
                    <Skeleton.Rect width={72} height={72} borderRadius={radius.md} />
                    <View style={{ flex: 1, gap: spacing.xs }}>
                      <Skeleton.Rect width="70%" height={14} borderRadius={radius.sm} />
                      <Skeleton.Rect width="40%" height={12} borderRadius={radius.sm} />
                    </View>
                  </View>
                ))}
              </View>
            )
          }
          ListFooterComponent={() =>
            downloadsQuery.isFetchingNextPage ? (
              <View style={styles.footer}>
                <Skeleton.Rect width="100%" height={72} borderRadius={radius.md} />
              </View>
            ) : null
          }
          contentContainerStyle={styles.listContent}
        />

        {/* Long-press bottom sheet */}
        <BottomSheet visible={!!sheetItem} onClose={handleSheetClose}>
          <BottomSheetItem
            label={t('downloads.playOffline')}
            icon={<Icon name="play" size="sm" color={colors.emerald} />}
            onPress={() => {
              handleSheetClose();
              if (sheetItem) {
                const route = sheetItem.contentType === 'post'
                  ? `/(screens)/post/${sheetItem.contentId}`
                  : sheetItem.contentType === 'video'
                  ? `/(screens)/video/${sheetItem.contentId}`
                  : `/(screens)/reel/${sheetItem.contentId}`;
                navigate(route);
              }
            }}
          />
          <BottomSheetItem
            label={t('downloads.viewOriginal')}
            icon={<Icon name="eye" size="sm" color={tc.text.secondary} />}
            onPress={() => {
              handleSheetClose();
              if (sheetItem) {
                const route = sheetItem.contentType === 'post'
                  ? `/(screens)/post/${sheetItem.contentId}`
                  : sheetItem.contentType === 'video'
                  ? `/(screens)/video/${sheetItem.contentId}`
                  : `/(screens)/reel/${sheetItem.contentId}`;
                navigate(route);
              }
            }}
          />
          <BottomSheetItem
            label={t('downloads.delete')}
            icon={<Icon name="trash" size="sm" color={colors.error} />}
            destructive
            onPress={() => {
              handleSheetClose();
              if (sheetItem) {
                Alert.alert(t('downloads.deleteConfirm'), '', [
                  { text: t('common.cancel'), style: 'cancel' },
                  {
                    text: t('downloads.delete'),
                    style: 'destructive',
                    onPress: () => deleteMutation.mutate(sheetItem.id),
                  },
                ]);
              }
            }}
          />
        </BottomSheet>
      </View>
    </ScreenErrorBoundary>
  );
}

// ── Styles ──

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.dark.bg },
  headerSpacer: { height: 100 },
  listContent: { paddingBottom: 100 },

  // Storage bar
  storageCard: {
    marginHorizontal: spacing.base,
    marginBottom: spacing.md,
    borderRadius: radius.lg,
    padding: spacing.base,
    borderWidth: 1,
    borderColor: 'rgba(45,53,72,0.3)',
  },
  storageHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  storageIconRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  storageIconBg: {
    width: 28,
    height: 28,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  storageTitle: { color: colors.text.primary, fontSize: fontSize.base, fontWeight: '600' },
  storageLabel: { color: colors.text.tertiary, fontSize: fontSize.xs },
  storageBarBg: {
    height: 6,
    backgroundColor: colors.dark.surface,
    borderRadius: 3,
    overflow: 'hidden',
  },
  storageBarFill: { height: '100%', borderRadius: 3 },

  // Filter chips
  chipRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.base,
    marginBottom: spacing.md,
  },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.full,
    backgroundColor: colors.dark.surface,
    borderWidth: 1,
    borderColor: colors.dark.border,
  },
  chipActive: {
    backgroundColor: colors.active.emerald15,
    borderColor: colors.emerald,
  },
  chipText: { color: colors.text.secondary, fontSize: fontSize.sm, fontWeight: '500' },
  chipTextActive: { color: colors.emerald },

  // Download item
  downloadItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
    gap: spacing.md,
  },
  itemThumb: {
    width: 72,
    height: 72,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.active.white6,
  },
  typeBadge: {
    position: 'absolute',
    bottom: spacing.xs,
    left: spacing.xs,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.xs,
    paddingVertical: 1,
  },
  typeBadgeText: {
    color: '#fff',
    fontSize: fontSizeExt.micro,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  itemInfo: { flex: 1 },
  itemTitle: { color: colors.text.primary, fontSize: fontSize.base, fontWeight: '600' },
  itemMeta: { flexDirection: 'row', gap: spacing.sm, marginTop: 2 },
  itemSize: { color: colors.text.tertiary, fontSize: fontSize.xs },
  itemStatus: { color: colors.text.secondary, fontSize: fontSize.xs },

  // Progress bar
  progressBarBg: {
    height: 4,
    backgroundColor: colors.dark.surface,
    borderRadius: 2,
    marginTop: spacing.xs,
    overflow: 'hidden',
  },
  progressBarFill: { height: '100%', borderRadius: 2 },

  // Action button
  itemAction: { width: 36, alignItems: 'center', justifyContent: 'center' },
  actionBtn: {
    width: 36,
    height: 36,
    borderRadius: radius.full,
    backgroundColor: 'rgba(45,53,72,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Skeleton
  skeletonContainer: {
    paddingHorizontal: spacing.base,
    paddingTop: spacing.sm,
    gap: spacing.md,
  },
  skeletonItem: {
    flexDirection: 'row',
    gap: spacing.md,
    alignItems: 'center',
  },
  footer: {
    paddingHorizontal: spacing.base,
    paddingBottom: spacing.lg,
  },
});
