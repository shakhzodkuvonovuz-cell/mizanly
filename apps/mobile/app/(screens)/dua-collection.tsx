import { useState, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, FlatList, Pressable, Share,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Icon, type IconName } from '@/components/ui/Icon';
import { GlassHeader } from '@/components/ui/GlassHeader';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { colors, spacing, radius, fontSize, fonts } from '@/theme';
import { useContextualHaptic } from '@/hooks/useContextualHaptic';
import { useTranslation } from '@/hooks/useTranslation';
import { useThemeColors } from '@/hooks/useThemeColors';
import { BrandedRefreshControl } from '@/components/ui/BrandedRefreshControl';
import { ScreenErrorBoundary } from '@/components/ui/ScreenErrorBoundary';
import { islamicApi } from '@/services/islamicApi';
import { rtlFlexRow, rtlTextAlign } from '@/utils/rtl';

interface Dua {
  id: string;
  category: string;
  arabicText: string;
  transliteration: string;
  translation: Record<string, string>;
  source: string;
  sourceRef: string;
}

const CATEGORY_ICONS: Record<string, IconName> = {
  morning: 'clock',
  evening: 'clock',
  sleep: 'eye-off',
  waking: 'eye',
  eating: 'heart',
  travel: 'map-pin',
  anxiety: 'heart',
  illness: 'heart',
  gratitude: 'heart-filled',
  forgiveness: 'heart',
  protection: 'lock',
  rain: 'globe',
  mosque: 'globe',
  parents: 'users',
  ramadan: 'clock',
  general: 'heart',
};

function DuaCard({ dua, language, onBookmark, onShare }: {
  dua: Dua;
  language: string;
  onBookmark: () => void;
  onShare: () => void;
}) {
  const { t, isRTL } = useTranslation();
  const tc = useThemeColors();
  const translation = dua.translation[language] || dua.translation.en || '';

  return (
    <Animated.View entering={FadeInUp.delay(50).duration(350).springify()} style={[styles.duaCard, { backgroundColor: tc.bgCard, borderColor: tc.border }]}>
      {/* Arabic text */}
      <Text style={styles.arabicText}>{dua.arabicText}</Text>

      {/* Transliteration */}
      <Text style={styles.transliteration}>{dua.transliteration}</Text>

      {/* Translation */}
      <Text style={[styles.translationText, { textAlign: rtlTextAlign(isRTL) }]}>
        {translation}
      </Text>

      {/* Source */}
      <Text style={styles.sourceText}>
        {t('duas.source')}: {dua.source} {dua.sourceRef}
      </Text>

      {/* Actions */}
      <View style={[styles.duaActions, { borderTopColor: tc.border }, { flexDirection: rtlFlexRow(isRTL) }]}>
        <Pressable
          onPress={onBookmark}
          style={styles.actionBtn}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityLabel={t('duas.bookmark')}
          accessibilityRole="button"
        >
          <Icon name="bookmark" size={18} color={colors.text.secondary} />
          <Text style={styles.actionText}>{t('duas.bookmark')}</Text>
        </Pressable>
        <Pressable
          onPress={onShare}
          style={styles.actionBtn}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityLabel={t('duas.shareDua')}
          accessibilityRole="button"
        >
          <Icon name="share" size={18} color={colors.text.secondary} />
          <Text style={styles.actionText}>{t('duas.shareDua')}</Text>
        </Pressable>
      </View>
    </Animated.View>
  );
}

export default function DuaCollectionScreen() {
  const router = useRouter();
  const haptic = useContextualHaptic();
  const queryClient = useQueryClient();
  const { t, isRTL, locale } = useTranslation();
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [showBookmarked, setShowBookmarked] = useState(false);
  const tc = useThemeColors();

  const categoriesQuery = useQuery({
    queryKey: ['dua-categories'],
    queryFn: () => islamicApi.getDuaCategories().then(r => r.data),
  });

  const duasQuery = useQuery({
    queryKey: ['duas', selectedCategory],
    queryFn: () => islamicApi.getDuas(selectedCategory ?? undefined).then(r => r.data),
  });

  const dailyDuaQuery = useQuery({
    queryKey: ['dua-daily'],
    queryFn: () => islamicApi.getDuaOfTheDay().then(r => r.data),
  });

  const bookmarkedQuery = useQuery({
    queryKey: ['duas-bookmarked'],
    queryFn: () => islamicApi.getBookmarkedDuas().then(r => r.data),
    enabled: showBookmarked,
  });

  const bookmarkMutation = useMutation({
    mutationFn: (duaId: string) => islamicApi.bookmarkDua(duaId),
    onSuccess: () => {
      haptic.success();
      queryClient.invalidateQueries({ queryKey: ['duas-bookmarked'] });
    },
  });

  const duas: Dua[] = showBookmarked
    ? (bookmarkedQuery.data ?? [])
    : (duasQuery.data ?? []);

  const categories: string[] = categoriesQuery.data ?? [];

  const handleRefresh = useCallback(() => {
    duasQuery.refetch();
    dailyDuaQuery.refetch();
    if (showBookmarked) bookmarkedQuery.refetch();
  }, [duasQuery, dailyDuaQuery, showBookmarked, bookmarkedQuery]);

  const handleShare = useCallback((dua: Dua) => {
    const translation = dua.translation[locale] || dua.translation.en || '';
    const text = `${dua.arabicText}\n\n${dua.transliteration}\n\n${translation}\n\n— ${dua.source} ${dua.sourceRef}\n\nShared from Mizanly`;
    Share.share({ message: text }).catch(() => {});
  }, [locale]);

  const getCategoryLabel = useCallback((cat: string) => {
    const key = `duas.${cat}` as const;
    return t(key) || cat.charAt(0).toUpperCase() + cat.slice(1);
  }, [t]);

  const listHeader = useMemo(() => (
    <View>
      {/* Daily Dua Card */}
      {dailyDuaQuery.data && (
        <View style={[styles.dailyCard, { backgroundColor: tc.bgCard }]}>
          <Text style={styles.dailyLabel}>{t('duas.duaOfTheDay')}</Text>
          <Text style={styles.dailyArabic}>{dailyDuaQuery.data.arabicText}</Text>
          <Text style={styles.dailyTransliteration}>{dailyDuaQuery.data.transliteration}</Text>
          <Text style={styles.dailyTranslation}>
            {dailyDuaQuery.data.translation[locale] || dailyDuaQuery.data.translation.en}
          </Text>
        </View>
      )}

      {/* Tabs: Categories / Bookmarked */}
      <View style={[styles.tabRow, { flexDirection: rtlFlexRow(isRTL) }]}>
        <Pressable
          style={[styles.tab, { backgroundColor: tc.bgElevated }, !showBookmarked && styles.tabActive]}
          onPress={() => { setShowBookmarked(false); haptic.tick(); }}
          accessibilityRole="tab"
        >
          <Text style={[styles.tabText, !showBookmarked && styles.tabTextActive]}>
            {t('duas.categories')}
          </Text>
        </Pressable>
        <Pressable
          style={[styles.tab, { backgroundColor: tc.bgElevated }, showBookmarked && styles.tabActive]}
          onPress={() => { setShowBookmarked(true); haptic.tick(); }}
          accessibilityRole="tab"
        >
          <Text style={[styles.tabText, showBookmarked && styles.tabTextActive]}>
            {t('duas.bookmarked')}
          </Text>
        </Pressable>
      </View>

      {/* Category chips (only when not in bookmarked view) */}
      {!showBookmarked && categories.length > 0 && (
        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          data={[null, ...categories]}
          keyExtractor={(item) => item ?? 'all'}
          contentContainerStyle={styles.chipsRow}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => { setSelectedCategory(item); haptic.tick(); }}
              style={[styles.chip, { backgroundColor: tc.bgElevated, borderColor: tc.border }, selectedCategory === item && styles.chipActive]}
              accessibilityRole="button"
            >
              {item && CATEGORY_ICONS[item] && (
                <Icon
                  name={CATEGORY_ICONS[item]}
                  size={14}
                  color={selectedCategory === item ? '#fff' : colors.text.secondary}
                />
              )}
              <Text style={[styles.chipText, selectedCategory === item && styles.chipTextActive]}>
                {item ? getCategoryLabel(item) : t('common.viewAll')}
              </Text>
            </Pressable>
          )}
        />
      )}
    </View>
  ), [dailyDuaQuery.data, categories, selectedCategory, showBookmarked, isRTL, locale, t, haptic, getCategoryLabel]);

  const listEmpty = useMemo(() => (
    !duasQuery.isLoading ? (
      <EmptyState
        icon="heart"
        title={showBookmarked ? t('duas.bookmarked') : t('duas.title')}
        subtitle={showBookmarked ? t('duas.noBookmarkedDuas') : t('duas.noDuasForCategory')}
      />
    ) : null
  ), [duasQuery.isLoading, showBookmarked, t]);

  return (
    <ScreenErrorBoundary>
      <SafeAreaView style={[styles.container, { backgroundColor: tc.bg }]} edges={['top']}>
        <GlassHeader
          title={t('duas.title')}
          leftAction={{
            icon: 'arrow-left',
            onPress: () => router.back(),
            accessibilityLabel: t('common.goBack'),
          }}
        />

        <FlatList
          data={duas}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <DuaCard
              dua={item}
              language={locale}
              onBookmark={() => bookmarkMutation.mutate(item.id)}
              onShare={() => handleShare(item)}
            />
          )}
          ListHeaderComponent={listHeader}
          ListEmptyComponent={listEmpty}
          refreshControl={
            <BrandedRefreshControl refreshing={duasQuery.isRefetching} onRefresh={handleRefresh} />
          }
          contentContainerStyle={styles.listContent}
          ListFooterComponent={
            duasQuery.isLoading ? (
              <View style={{ gap: spacing.md, padding: spacing.base }}>
                <Skeleton.Rect width="100%" height={180} borderRadius={radius.lg} />
                <Skeleton.Rect width="100%" height={180} borderRadius={radius.lg} />
              </View>
            ) : null
          }
        />
      </SafeAreaView>
    </ScreenErrorBoundary>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.dark.bg },
  listContent: { paddingBottom: spacing['2xl'] },
  dailyCard: {
    margin: spacing.base,
    padding: spacing.lg,
    backgroundColor: colors.dark.bgCard,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.gold,
  },
  dailyLabel: {
    color: colors.gold,
    fontSize: fontSize.xs,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: spacing.sm,
  },
  dailyArabic: {
    color: colors.text.primary,
    fontSize: fontSize.xl,
    fontFamily: fonts.arabic,
    textAlign: 'right',
    lineHeight: 36,
    marginBottom: spacing.sm,
  },
  dailyTransliteration: {
    color: colors.text.secondary,
    fontSize: fontSize.sm,
    fontStyle: 'italic',
    marginBottom: spacing.xs,
  },
  dailyTranslation: {
    color: colors.text.primary,
    fontSize: fontSize.base,
    lineHeight: 22,
  },
  tabRow: {
    flexDirection: 'row',
    paddingHorizontal: spacing.base,
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  tab: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.base,
    borderRadius: radius.full,
    backgroundColor: colors.dark.bgElevated,
  },
  tabActive: { backgroundColor: colors.emerald },
  tabText: { color: colors.text.secondary, fontSize: fontSize.sm, fontWeight: '600' },
  tabTextActive: { color: '#fff' },
  chipsRow: {
    paddingHorizontal: spacing.base,
    paddingBottom: spacing.md,
    gap: spacing.sm,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.full,
    backgroundColor: colors.dark.bgElevated,
    borderWidth: 1,
    borderColor: colors.dark.border,
    marginRight: spacing.sm,
  },
  chipActive: { backgroundColor: colors.emerald, borderColor: colors.emerald },
  chipText: { color: colors.text.secondary, fontSize: fontSize.xs },
  chipTextActive: { color: '#fff', fontWeight: '600' },
  duaCard: {
    marginHorizontal: spacing.base,
    marginBottom: spacing.md,
    padding: spacing.base,
    backgroundColor: colors.dark.bgCard,
    borderRadius: radius.lg,
    borderWidth: 0.5,
    borderColor: colors.dark.border,
  },
  arabicText: {
    color: colors.text.primary,
    fontSize: fontSize.lg,
    fontFamily: fonts.arabic,
    textAlign: 'right',
    lineHeight: 32,
    marginBottom: spacing.sm,
  },
  transliteration: {
    color: colors.emerald,
    fontSize: fontSize.sm,
    fontStyle: 'italic',
    marginBottom: spacing.sm,
  },
  translationText: {
    color: colors.text.primary,
    fontSize: fontSize.base,
    lineHeight: 22,
    marginBottom: spacing.sm,
  },
  sourceText: {
    color: colors.text.tertiary,
    fontSize: fontSize.xs,
    marginBottom: spacing.sm,
  },
  duaActions: {
    flexDirection: 'row',
    gap: spacing.lg,
    borderTopWidth: 0.5,
    borderTopColor: colors.dark.border,
    paddingTop: spacing.sm,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  actionText: {
    color: colors.text.secondary,
    fontSize: fontSize.xs,
  },
});
