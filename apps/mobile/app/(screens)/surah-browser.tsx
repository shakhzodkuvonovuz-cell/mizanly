import { useState, useCallback, useMemo, useRef } from 'react';
import { View, Text, StyleSheet, TextInput, Pressable } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { GlassHeader } from '@/components/ui/GlassHeader';
import { Icon } from '@/components/ui/Icon';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { BrandedRefreshControl } from '@/components/ui/BrandedRefreshControl';
import { ScreenErrorBoundary } from '@/components/ui/ScreenErrorBoundary';
import { useTranslation } from '@/hooks/useTranslation';
import { useThemeColors } from '@/hooks/useThemeColors';
import { useContextualHaptic } from '@/hooks/useContextualHaptic';
import { islamicApi } from '@/services/islamicApi';
import { colors, spacing, fontSize, radius, fonts } from '@/theme';
import { toArabicNumerals } from '@/utils/formatCount';
import { rtlFlexRow } from '@/utils/rtl';

interface Surah {
  id: number;
  number: number;
  name: string;
  nameArabic: string;
  englishName: string;
  versesCount: number;
  revelationType: string;
}

function SurahRow({ surah, index, onPress, isRTL }: { surah: Surah; index: number; onPress: () => void; isRTL: boolean }) {
  const tc = useThemeColors();
  const { t } = useTranslation();
  return (
    <Animated.View entering={FadeInUp.delay(Math.min(index * 30, 300)).duration(250)}>
      <Pressable
        style={({ pressed }) => [styles.surahRow, { borderBottomColor: tc.border, flexDirection: rtlFlexRow(isRTL) }, pressed && { opacity: 0.7 }]}
        android_ripple={{ color: 'rgba(255,255,255,0.1)' }}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`${surah.englishName} - ${surah.nameArabic}`}
      >
        <View style={[styles.surahNumber, { backgroundColor: `${colors.emerald}15` }]}>
          <Text style={[styles.surahNumberText, { color: colors.emerald }]}>
            {isRTL ? toArabicNumerals(surah.number) : surah.number}
          </Text>
        </View>
        <View style={styles.surahInfo}>
          <Text style={[styles.surahName, { color: tc.text.primary }]}>{surah.englishName}</Text>
          <Text style={[styles.surahMeta, { color: tc.text.secondary }]}>
            {surah.revelationType === 'Meccan' ? t('quran.meccan') : t('quran.medinan')} • {surah.versesCount} {t('quran.verses')}
          </Text>
        </View>
        <Text style={[styles.surahArabic, { color: tc.text.primary }]}>{surah.nameArabic}</Text>
      </Pressable>
    </Animated.View>
  );
}

function SurahBrowserContent() {
  const router = useRouter();
  const { t, isRTL } = useTranslation();
  const tc = useThemeColors();
  const haptic = useContextualHaptic();
  const [search, setSearch] = useState('');
  const isNavigatingRef = useRef(false);

  const surahsQuery = useQuery({
    queryKey: ['surahs'],
    queryFn: () => islamicApi.listSurahs(),
  });

  const filtered = useMemo(() => {
    const surahs = (surahsQuery.data ?? []) as unknown as Surah[];
    if (!search.trim()) return surahs;
    const q = search.toLowerCase();
    return surahs.filter(s =>
      s.englishName.toLowerCase().includes(q) ||
      s.nameArabic.includes(q) ||
      String(s.number).includes(q)
    );
  }, [surahsQuery.data, search]);

  const renderItem = useCallback(({ item, index }: { item: Surah; index: number }) => (
    <SurahRow
      surah={item}
      index={index}
      isRTL={isRTL}
      onPress={() => {
        if (isNavigatingRef.current) return;
        isNavigatingRef.current = true;
        haptic.navigate();
        router.push(`/(screens)/tafsir-viewer?surah=${item.number}` as never);
        setTimeout(() => { isNavigatingRef.current = false; }, 500);
      }}
    />
  ), [router, haptic, isRTL]);

  if (surahsQuery.isLoading) {
    return (
      <View style={{ padding: spacing.base, gap: spacing.sm }}>
        {Array.from({ length: 10 }).map((_, i) => (
          <Skeleton.Rect key={i} width="100%" height={64} />
        ))}
      </View>
    );
  }

  if (surahsQuery.isError) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: tc.bg }]} edges={['top']}>
        <GlassHeader
          title={t('quran.surahBrowser', 'Quran')}
          leftAction={{ icon: 'arrow-left', onPress: () => router.back(), accessibilityLabel: t('common.goBack') }}
        />
        <EmptyState
          icon="alert-circle"
          title={t('common.error')}
          subtitle={t('common.tryAgain')}
          actionLabel={t('common.retry')}
          onAction={() => surahsQuery.refetch()}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: tc.bg }]} edges={['top']}>
      <GlassHeader
        title={t('quran.surahBrowser', 'Quran')}
        leftAction={{ icon: 'arrow-left', onPress: () => router.back(), accessibilityLabel: t('common.goBack') }}
      />

      {/* Search */}
      <View style={[styles.searchContainer, { backgroundColor: tc.bgElevated, borderColor: tc.border, flexDirection: rtlFlexRow(isRTL) }]}>
        <Icon name="search" size="sm" color={tc.text.tertiary} />
        <TextInput
          style={[styles.searchInput, { color: tc.text.primary }]}
          placeholder={t('quran.searchSurahs', 'Search surahs...')}
          placeholderTextColor={tc.text.tertiary}
          value={search}
          onChangeText={setSearch}
          accessibilityLabel={t('quran.searchSurahs', 'Search surahs')}
        />
        {search.length > 0 && (
                    <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('accessibility.clearSearchInput')}
            onPress={() => setSearch('')}
            hitSlop={8}
          >
            <Icon name="x" size="xs" color={tc.text.tertiary} />
          </Pressable>
        )}
      </View>

      {/* Gentle wudu reminder */}
      <View style={{ flexDirection: rtlFlexRow(isRTL), alignItems: 'center', gap: spacing.sm, margin: spacing.sm, padding: spacing.sm, backgroundColor: `${colors.gold}10`, borderRadius: radius.sm }}>
        <Icon name="heart" size="sm" color={colors.gold} />
        <Text style={{ color: tc.text.secondary, fontSize: fontSize.xs, flex: 1, fontFamily: fonts.body }}>
          {t('quran.wuduReminder', 'It is recommended to be in a state of wudu (ablution) when reading the Quran.')}
        </Text>
      </View>

      {/* Bismillah header */}
      <View style={{ alignItems: 'center', paddingVertical: spacing.base }}>
        <Text style={{ fontFamily: fonts.arabicBold, fontSize: 22, color: tc.text.primary }}>
          بِسْمِ اللَّهِ الرَّحْمَنِ الرَّحِيمِ
        </Text>
        <Text style={{ fontFamily: fonts.body, fontSize: fontSize.xs, color: tc.text.tertiary, marginTop: 4 }}>
          {t('quran.bismillah', 'In the name of Allah, the Most Gracious, the Most Merciful')}
        </Text>
      </View>

      <FlashList
        data={filtered}
        renderItem={renderItem}
        keyExtractor={(item) => String(item.number)}
        estimatedItemSize={72}
        contentContainerStyle={{ paddingBottom: spacing['2xl'] }}
        refreshControl={
          <BrandedRefreshControl refreshing={surahsQuery.isRefetching} onRefresh={() => surahsQuery.refetch()} />
        }
        ListEmptyComponent={
          <EmptyState
            icon="search"
            title={t('quran.noResults', 'No surahs found')}
            subtitle={t('quran.tryDifferentSearch', 'Try a different search term')}
          />
        }
      />
    </SafeAreaView>
  );
}

export default function SurahBrowserScreen() {
  return (
    <ScreenErrorBoundary>
      <SurahBrowserContent />
    </ScreenErrorBoundary>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    margin: spacing.sm,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  searchInput: {
    flex: 1,
    fontFamily: fonts.body,
    fontSize: fontSize.base,
    paddingVertical: 4,
  },
  surahRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: spacing.md,
  },
  surahNumber: {
    width: 40,
    height: 40,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  surahNumberText: {
    fontFamily: fonts.bodyBold,
    fontSize: fontSize.sm,
  },
  surahInfo: {
    flex: 1,
    gap: 2,
  },
  surahName: {
    fontFamily: fonts.bodyMedium,
    fontSize: fontSize.base,
  },
  surahMeta: {
    fontFamily: fonts.body,
    fontSize: fontSize.xs,
  },
  surahArabic: {
    fontFamily: fonts.arabic,
    fontSize: fontSize.lg,
  },
});
