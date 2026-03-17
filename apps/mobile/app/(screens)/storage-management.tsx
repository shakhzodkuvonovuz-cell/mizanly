import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as FileSystem from 'expo-file-system';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { Icon } from '@/components/ui/Icon';
import type { IconName } from '@/components/ui/Icon';
import { GlassHeader } from '@/components/ui/GlassHeader';
import { Skeleton } from '@/components/ui/Skeleton';
import { ScreenErrorBoundary } from '@/components/ui/ScreenErrorBoundary';
import { colors, fonts, fontSize, spacing, radius } from '@/theme';
import { useHaptic } from '@/hooks/useHaptic';
import { useTranslation } from '@/hooks/useTranslation';
import { rtlFlexRow, rtlTextAlign } from '@/utils/rtl';

const MAX_STORAGE_BYTES = 500 * 1024 * 1024; // 500 MB limit for progress bar

interface StorageSizes {
  images: number;
  videos: number;
  voice: number;
  documents: number;
  cache: number;
}

interface StorageCategory {
  key: keyof StorageSizes;
  labelKey: string;
  icon: IconName;
  dir: string;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + units[i];
}

function getCategories(): StorageCategory[] {
  const cacheDir = FileSystem.cacheDirectory ?? '';
  return [
    { key: 'images', labelKey: 'storage.images', icon: 'image', dir: cacheDir + 'images/' },
    { key: 'videos', labelKey: 'storage.videos', icon: 'video', dir: cacheDir + 'videos/' },
    { key: 'voice', labelKey: 'storage.voiceMessages', icon: 'mic', dir: cacheDir + 'voice/' },
    { key: 'documents', labelKey: 'storage.documents', icon: 'paperclip', dir: cacheDir + 'documents/' },
    { key: 'cache', labelKey: 'storage.cache', icon: 'layers', dir: cacheDir },
  ];
}

async function getDirectorySize(dirUri: string): Promise<number> {
  try {
    const info = await FileSystem.getInfoAsync(dirUri);
    if (!info.exists) return 0;
    if (!info.isDirectory) return info.size ?? 0;

    const children = await FileSystem.readDirectoryAsync(dirUri);
    let total = 0;
    for (const child of children) {
      const childUri = dirUri + child;
      const childInfo = await FileSystem.getInfoAsync(childUri);
      if (childInfo.exists) {
        total += childInfo.size ?? 0;
      }
    }
    return total;
  } catch {
    return 0;
  }
}

function StorageCategoryRow({
  icon,
  label,
  size,
  isClearing,
  onClear,
  index,
  isRTL,
}: {
  icon: IconName;
  label: string;
  size: number;
  isClearing: boolean;
  onClear: () => void;
  index: number;
  isRTL: boolean;
}) {
  const haptic = useHaptic();
  const { t } = useTranslation();

  const handleClear = () => {
    haptic.light();
    onClear();
  };

  return (
    <Animated.View
      entering={FadeInDown.delay(index * 60).duration(300)}
      style={[styles.categoryRow, rtlFlexRow(isRTL)]}
    >
      <View style={[styles.categoryIcon, { backgroundColor: colors.active.emerald10 }]}>
        <Icon name={icon} size="sm" color={colors.emerald} />
      </View>
      <View style={styles.categoryInfo}>
        <Text style={[styles.categoryLabel, { textAlign: rtlTextAlign(isRTL) }]}>
          {label}
        </Text>
        <Text style={[styles.categorySize, { textAlign: rtlTextAlign(isRTL) }]}>
          {formatBytes(size)}
        </Text>
      </View>
      <Pressable
        onPress={handleClear}
        disabled={isClearing || size === 0}
        style={[
          styles.clearButton,
          (isClearing || size === 0) && styles.clearButtonDisabled,
        ]}
        accessibilityRole="button"
        accessibilityLabel={t('storage.clearCategory', { category: label })}
      >
        {isClearing ? (
          <Skeleton.Rect width={40} height={16} borderRadius={radius.sm} />
        ) : (
          <Text style={[styles.clearButtonText, size === 0 && styles.clearButtonTextDisabled]}>
            {t('storage.clear')}
          </Text>
        )}
      </Pressable>
    </Animated.View>
  );
}

function StorageLoadingSkeleton() {
  return (
    <View style={styles.skeletonContainer}>
      <Skeleton.Rect width="100%" height={140} borderRadius={radius.lg} />
      <View style={{ marginTop: spacing.xl }}>
        {Array.from({ length: 5 }).map((_, i) => (
          <View key={`skel-${i}`} style={styles.skeletonRow}>
            <Skeleton.Circle size={40} />
            <View style={{ flex: 1, marginLeft: spacing.md }}>
              <Skeleton.Rect width="60%" height={14} borderRadius={radius.sm} />
              <Skeleton.Rect width="30%" height={12} borderRadius={radius.sm} />
            </View>
            <Skeleton.Rect width={60} height={30} borderRadius={radius.sm} />
          </View>
        ))}
      </View>
    </View>
  );
}

export default function StorageManagementScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const haptic = useHaptic();
  const { t, isRTL } = useTranslation();

  const [sizes, setSizes] = useState<StorageSizes>({
    images: 0,
    videos: 0,
    voice: 0,
    documents: 0,
    cache: 0,
  });
  const [loading, setLoading] = useState(true);
  const [clearing, setClearing] = useState<string | null>(null);

  const categories = getCategories();

  const loadSizes = useCallback(async () => {
    setLoading(true);
    try {
      const results: StorageSizes = {
        images: 0,
        videos: 0,
        voice: 0,
        documents: 0,
        cache: 0,
      };
      for (const cat of categories) {
        results[cat.key] = await getDirectorySize(cat.dir);
      }
      setSizes(results);
    } catch {
      // Sizes stay at 0 on error
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSizes();
  }, [loadSizes]);

  const totalUsed = sizes.images + sizes.videos + sizes.voice + sizes.documents + sizes.cache;
  const progressPercent = Math.min(totalUsed / MAX_STORAGE_BYTES, 1);

  const handleClearCategory = (category: StorageCategory) => {
    Alert.alert(
      t('storage.clearConfirmTitle'),
      t('storage.clearConfirmMessage', { category: t(category.labelKey) }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('storage.clear'),
          style: 'destructive',
          onPress: async () => {
            setClearing(category.key);
            try {
              const info = await FileSystem.getInfoAsync(category.dir);
              if (info.exists) {
                await FileSystem.deleteAsync(category.dir, { idempotent: true });
                await FileSystem.makeDirectoryAsync(category.dir, { intermediates: true });
              }
              setSizes((prev) => ({ ...prev, [category.key]: 0 }));
            } catch {
              Alert.alert(t('common.error'), t('storage.clearError'));
            } finally {
              setClearing(null);
            }
          },
        },
      ],
    );
  };

  const handleClearAll = () => {
    haptic.medium();
    Alert.alert(
      t('storage.clearAllTitle'),
      t('storage.clearAllMessage'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('storage.clearAll'),
          style: 'destructive',
          onPress: async () => {
            setClearing('all');
            try {
              const cacheDir = FileSystem.cacheDirectory;
              if (cacheDir) {
                await FileSystem.deleteAsync(cacheDir, { idempotent: true });
                await FileSystem.makeDirectoryAsync(cacheDir, { intermediates: true });
              }
              setSizes({ images: 0, videos: 0, voice: 0, documents: 0, cache: 0 });
            } catch {
              Alert.alert(t('common.error'), t('storage.clearError'));
            } finally {
              setClearing(null);
            }
          },
        },
      ],
    );
  };

  return (
    <ScreenErrorBoundary>
      <View style={styles.container}>
        <GlassHeader
          title={t('storage.title')}
          leftAction={{
            icon: 'arrow-left',
            onPress: () => router.back(),
            accessibilityLabel: t('common.back'),
          }}
        />

        {loading ? (
          <ScrollView
            style={styles.scrollView}
            contentContainerStyle={[
              styles.content,
              { paddingTop: insets.top + 60, paddingBottom: insets.bottom + spacing.xl },
            ]}
          >
            <StorageLoadingSkeleton />
          </ScrollView>
        ) : (
          <ScrollView
            style={styles.scrollView}
            contentContainerStyle={[
              styles.content,
              { paddingTop: insets.top + 60, paddingBottom: insets.bottom + spacing.xl },
            ]}
            showsVerticalScrollIndicator={false}
          >
            {/* Total Storage Summary Card */}
            <Animated.View entering={FadeInUp.duration(400)} style={styles.summaryCard}>
              <LinearGradient
                colors={[colors.active.emerald20, colors.active.emerald10, 'transparent']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.summaryGradient}
              >
                <Text style={styles.summaryLabel}>{t('storage.totalUsed')}</Text>
                <Text style={styles.summarySize}>{formatBytes(totalUsed)}</Text>
                <Text style={styles.summaryLimit}>
                  {t('storage.ofLimit', { limit: formatBytes(MAX_STORAGE_BYTES) })}
                </Text>

                {/* Progress Bar */}
                <View style={styles.progressContainer}>
                  <View style={styles.progressTrack}>
                    <LinearGradient
                      colors={[colors.emerald, colors.emeraldLight]}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0 }}
                      style={[
                        styles.progressFill,
                        { width: `${Math.max(progressPercent * 100, 2)}%` as `${number}%` },
                      ]}
                    />
                  </View>
                  <Text style={styles.progressText}>
                    {Math.round(progressPercent * 100)}%
                  </Text>
                </View>
              </LinearGradient>
            </Animated.View>

            {/* Breakdown Section */}
            <Text style={[styles.sectionTitle, { textAlign: rtlTextAlign(isRTL) }]}>
              {t('storage.breakdown')}
            </Text>

            <View style={styles.categoriesCard}>
              {categories.map((cat, index) => (
                <StorageCategoryRow
                  key={cat.key}
                  icon={cat.icon}
                  label={t(cat.labelKey)}
                  size={sizes[cat.key]}
                  isClearing={clearing === cat.key || clearing === 'all'}
                  onClear={() => handleClearCategory(cat)}
                  index={index}
                  isRTL={isRTL}
                />
              ))}
            </View>

            {/* Clear All Button */}
            <Pressable
              onPress={handleClearAll}
              disabled={clearing !== null || totalUsed === 0}
              style={[
                styles.clearAllButton,
                (clearing !== null || totalUsed === 0) && styles.clearAllButtonDisabled,
              ]}
              accessibilityRole="button"
              accessibilityLabel={t('storage.clearAllCache')}
            >
              {clearing === 'all' ? (
                <Skeleton.Rect width={24} height={24} borderRadius={radius.full} />
              ) : (
                <>
                  <Icon name="trash" size="sm" color={totalUsed === 0 ? colors.text.tertiary : colors.error} />
                  <Text
                    style={[
                      styles.clearAllText,
                      totalUsed === 0 && styles.clearAllTextDisabled,
                    ]}
                  >
                    {t('storage.clearAllCache')}
                  </Text>
                </>
              )}
            </Pressable>
          </ScrollView>
        )}
      </View>
    </ScreenErrorBoundary>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.dark.bg,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    paddingHorizontal: spacing.base,
  },
  // Summary Card
  summaryCard: {
    borderRadius: radius.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.dark.border,
    marginBottom: spacing.xl,
  },
  summaryGradient: {
    padding: spacing.xl,
    alignItems: 'center',
  },
  summaryLabel: {
    fontFamily: fonts.body,
    fontSize: fontSize.sm,
    color: colors.text.secondary,
    marginBottom: spacing.xs,
  },
  summarySize: {
    fontFamily: fonts.headingBold,
    fontSize: fontSize['3xl'],
    color: colors.text.primary,
    marginBottom: spacing.xs,
  },
  summaryLimit: {
    fontFamily: fonts.body,
    fontSize: fontSize.xs,
    color: colors.text.tertiary,
    marginBottom: spacing.base,
  },
  // Progress Bar
  progressContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    gap: spacing.sm,
  },
  progressTrack: {
    flex: 1,
    height: 8,
    backgroundColor: colors.dark.surface,
    borderRadius: radius.full,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: radius.full,
  },
  progressText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSize.xs,
    color: colors.emerald,
    minWidth: 36,
    textAlign: 'right',
  },
  // Section
  sectionTitle: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSize.base,
    color: colors.text.primary,
    marginBottom: spacing.md,
  },
  // Categories Card
  categoriesCard: {
    backgroundColor: colors.dark.bgCard,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.dark.border,
    overflow: 'hidden',
    marginBottom: spacing.xl,
  },
  categoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.base,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.dark.border,
  },
  categoryIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  categoryInfo: {
    flex: 1,
    marginHorizontal: spacing.md,
  },
  categoryLabel: {
    fontFamily: fonts.bodyMedium,
    fontSize: fontSize.base,
    color: colors.text.primary,
  },
  categorySize: {
    fontFamily: fonts.body,
    fontSize: fontSize.sm,
    color: colors.text.secondary,
    marginTop: 2,
  },
  clearButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.sm,
    backgroundColor: colors.active.emerald10,
    minWidth: 60,
    alignItems: 'center',
  },
  clearButtonDisabled: {
    backgroundColor: colors.active.white5,
  },
  clearButtonText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSize.sm,
    color: colors.emerald,
  },
  clearButtonTextDisabled: {
    color: colors.text.tertiary,
  },
  // Clear All
  clearAllButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.base,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.active.error10,
    backgroundColor: colors.active.error10,
    gap: spacing.sm,
  },
  clearAllButtonDisabled: {
    opacity: 0.5,
  },
  clearAllText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSize.base,
    color: colors.error,
  },
  clearAllTextDisabled: {
    color: colors.text.tertiary,
  },
  // Skeleton
  skeletonContainer: {
    gap: spacing.base,
  },
  skeletonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    gap: spacing.md,
  },
});
