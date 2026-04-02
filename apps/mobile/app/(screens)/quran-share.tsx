import { useState, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, Pressable, ScrollView, Dimensions, TextInput, Share,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeInUp, FadeIn } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { useQuery } from '@tanstack/react-query';
import { Icon } from '@/components/ui/Icon';
import { GlassHeader } from '@/components/ui/GlassHeader';
import { BottomSheet, BottomSheetItem } from '@/components/ui/BottomSheet';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { islamicApi } from '@/services/islamicApi';
import { colors, spacing, radius, fontSize, fonts } from '@/theme';
import { useTranslation } from '@/hooks/useTranslation';
import { useThemeColors } from '@/hooks/useThemeColors';
import { useContextualHaptic } from '@/hooks/useContextualHaptic';
import { showToast } from '@/components/ui/Toast';
import type { QuranSurah, QuranVerse } from '@/types/islamic';
import { BrandedRefreshControl } from '@/components/ui/BrandedRefreshControl';
import { ScreenErrorBoundary } from '@/components/ui/ScreenErrorBoundary';
import { navigate } from '@/utils/navigation';
import { rtlFlexRow } from '@/utils/rtl';

const { width: screenWidth } = Dimensions.get('window');

// Decorative pattern for border
function GeometricPattern() {
  const tc = useThemeColors();
  const styles = createStyles(tc);
  return (
    <View style={styles.patternContainer}>
      {[...Array(8)].map((_, i) => (
        <View key={i} style={styles.patternRow}>
          {[...Array(4)].map((_, j) => (
            <View key={j} style={styles.patternDiamond}>
              <LinearGradient
                colors={['rgba(200,150,62,0.3)', 'rgba(200,150,62,0.1)']}
                style={styles.diamondGradient}
              />
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

export default function QuranShareScreen() {
  const tc = useThemeColors();
  const styles = createStyles(tc);
  const router = useRouter();
  const { t, isRTL } = useTranslation();
  const haptic = useContextualHaptic();
  const [selectedSurahNumber, setSelectedSurahNumber] = useState(1);
  const [currentVerse, setCurrentVerse] = useState(1);
  const [showSurahPicker, setShowSurahPicker] = useState(false);
  const [showShareOptions, setShowShareOptions] = useState(false);
  const [surahSearch, setSurahSearch] = useState('');

  // Fetch list of surahs
  const {
    data: surahs,
    isLoading: surahsLoading,
    isRefetching: surahsRefetching,
    refetch: refetchSurahs,
  } = useQuery({
    queryKey: ['quran-surahs'],
    queryFn: async () => {
      const res = await islamicApi.listSurahs();
      return Array.isArray(res) ? res as QuranSurah[] : [];
    },
  });

  const currentSurah = surahs?.find(s => s.number === selectedSurahNumber) ?? {
    number: selectedSurahNumber,
    name: 'Loading...',
    arabicName: '...',
    verses: 1,
    revelationType: 'meccan' as const,
  };

  // Fetch current verse
  const {
    data: verseData,
    isLoading: verseLoading,
    isRefetching: verseRefetching,
    refetch: refetchVerse,
  } = useQuery({
    queryKey: ['quran-verse', selectedSurahNumber, currentVerse],
    queryFn: async () => {
      const res = await islamicApi.getVerse(selectedSurahNumber, currentVerse);
      return res as QuranVerse;
    },
    enabled: !!selectedSurahNumber,
  });

  const verseText = verseData?.arabic ?? '';
  const translationText = verseData?.translation ?? '';

  const handleRefresh = useCallback(async () => {
    await Promise.all([refetchSurahs(), refetchVerse()]);
  }, [refetchSurahs, refetchVerse]);

  const handlePrevVerse = useCallback(() => {
    setCurrentVerse(v => Math.max(1, v - 1));
  }, []);

  const handleNextVerse = useCallback(() => {
    setCurrentVerse(v => Math.min(currentSurah.verses, v + 1));
  }, [currentSurah.verses]);

  const isNavigatingRef = useRef(false);

  const handleShareAsPost = useCallback(() => {
    if (isNavigatingRef.current) return;
    isNavigatingRef.current = true;
    setShowShareOptions(false);
    const content = `${verseText}\n\n${translationText}\n\n— ${currentSurah.name} ${currentVerse}`;
    router.push({ pathname: '/(screens)/create-post', params: { content } });
    setTimeout(() => { isNavigatingRef.current = false; }, 500);
  }, [router, verseText, translationText, currentSurah.name, currentVerse]);

  const handleShareAsStory = useCallback(() => {
    if (isNavigatingRef.current) return;
    isNavigatingRef.current = true;
    setShowShareOptions(false);
    const content = `${verseText}\n\n${translationText}\n\n— ${currentSurah.name} ${currentVerse}`;
    router.push({ pathname: '/(screens)/create-story', params: { content } });
    setTimeout(() => { isNavigatingRef.current = false; }, 500);
  }, [router, verseText, translationText, currentSurah.name, currentVerse]);

  const handleCopyText = useCallback(async () => {
    const text = `${verseText}\n\n${translationText}\n\n— ${currentSurah.name} ${currentVerse}`;
    await Clipboard.setStringAsync(text);
    setShowShareOptions(false);
    showToast({ message: t('common.copied', { defaultValue: 'Copied to clipboard' }), variant: 'success' });
  }, [verseText, translationText, currentSurah.name, currentVerse, t]);

  const isRefreshing = surahsRefetching || verseRefetching;

  // Loading state
  if (surahsLoading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <GlassHeader
          title={t('screens.quranShare.title')}
          leftAction={{ icon: 'arrow-left', onPress: () => router.back() }}
        />
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={[styles.scrollContent, { alignItems: 'center' }]}
          showsVerticalScrollIndicator={false}
        >
          <Skeleton.Rect width="100%" height={72} borderRadius={radius.lg} />
          <View style={{ marginTop: spacing.md, width: '100%' }}>
            <Skeleton.Rect width="100%" height={40} borderRadius={radius.full} />
          </View>
          <View style={{ marginTop: spacing.md, width: '100%' }}>
            <Skeleton.Rect width="100%" height={400} borderRadius={radius.lg} />
          </View>
          <View style={{ marginTop: spacing.lg, width: '100%', gap: spacing.md }}>
            <Skeleton.Rect width="100%" height={48} borderRadius={radius.lg} />
            <Skeleton.Rect width="100%" height={48} borderRadius={radius.lg} />
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // Empty state if no surahs loaded
  if (!surahs || surahs.length === 0) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <GlassHeader
          title={t('screens.quranShare.title')}
          leftAction={{ icon: 'arrow-left', onPress: () => router.back() }}
        />
        <EmptyState
          icon="book-open"
          title={t('screens.quranShare.loadFailed')}
          subtitle={t('screens.quranShare.tryAgain')}
          actionLabel={t('common.retry')}
          onAction={() => refetchSurahs()}
        />
      </SafeAreaView>
    );
  }

  return (
    <ScreenErrorBoundary>
      <SafeAreaView style={styles.container} edges={['top']}>
        <GlassHeader
          title={t('screens.quranShare.title')}
          leftAction={{ icon: 'arrow-left', onPress: () => router.back() }}
          rightAction={{ icon: 'share', onPress: () => setShowShareOptions(true) }}
        />

        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          refreshControl={<BrandedRefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} />}
        >
          {/* Surah Selector */}
          <Animated.View entering={FadeInUp.duration(500)}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('screens.quranShare.selectSurah', { defaultValue: 'Select surah' })}
              style={styles.surahSelector}
              onPress={() => setShowSurahPicker(true)}
            >
              <LinearGradient
                colors={colors.gradient.cardDark}
                style={styles.surahSelectorGradient}
              >
                <LinearGradient
                  colors={['rgba(200,150,62,0.3)', 'rgba(200,150,62,0.1)']}
                  style={styles.surahIconBg}
                >
                  <Icon name="book-open" size="sm" color={colors.gold} />
                </LinearGradient>
                <View style={styles.surahInfo}>
                  <Text style={styles.surahNameArabic}>{currentSurah.arabicName}</Text>
                  <Text style={styles.surahName}>{currentSurah.name}</Text>
                </View>
                <View style={styles.surahMeta}>
                  <Text style={styles.surahNumber}>{t('screens.quranShare.surahNumber', { number: currentSurah.number })}</Text>
                  <Text style={styles.verseCount}>{t('screens.quranShare.versesCount', { count: currentSurah.verses })}</Text>
                </View>
                <Icon name="chevron-down" size="sm" color={tc.text.tertiary} />
              </LinearGradient>
            </Pressable>
          </Animated.View>

          {/* Verse Navigation */}
          <Animated.View entering={FadeInUp.delay(100).duration(500)} style={styles.verseNav}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('accessibility.previousVerse', { defaultValue: 'Previous verse' })}
              style={styles.navButton}
              onPress={handlePrevVerse}
              disabled={currentVerse === 1}
            >
              <LinearGradient
                colors={['rgba(10,123,79,0.3)', 'rgba(10,123,79,0.1)']}
                style={[styles.navButtonGradient, currentVerse === 1 && styles.navButtonDisabled]}
              >
                <Icon name="chevron-left" size="sm" color={currentVerse === 1 ? tc.text.tertiary : colors.emerald} />
              </LinearGradient>
            </Pressable>

            <LinearGradient
              colors={['rgba(45,53,72,0.3)', 'rgba(28,35,51,0.15)']}
              style={styles.verseIndicator}
            >
              <Text style={styles.verseNumberText}>{t('screens.quranShare.verseNumber', { number: currentVerse })}</Text>
            </LinearGradient>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('accessibility.nextVerse', { defaultValue: 'Next verse' })}
              style={styles.navButton}
              onPress={handleNextVerse}
              disabled={currentVerse === currentSurah.verses}
            >
              <LinearGradient
                colors={['rgba(10,123,79,0.3)', 'rgba(10,123,79,0.1)']}
                style={[styles.navButtonGradient, currentVerse === currentSurah.verses && styles.navButtonDisabled]}
              >
                <Icon name="chevron-right" size="sm" color={currentVerse === currentSurah.verses ? tc.text.tertiary : colors.emerald} />
              </LinearGradient>
            </Pressable>
          </Animated.View>

          {/* Verse Card */}
          <Animated.View entering={FadeInUp.delay(200).duration(500)}>
            <LinearGradient
              colors={['rgba(45,53,72,0.5)', 'rgba(28,35,51,0.3)']}
              style={styles.verseCard}
            >
              {/* Decorative Border */}
              <GeometricPattern />

              {/* Inner Card */}
              <LinearGradient
                colors={['rgba(22,27,34,0.95)', 'rgba(13,17,23,0.98)']}
                style={styles.verseCardInner}
              >
                {verseLoading ? (
                  <View style={{ alignItems: 'center', gap: spacing.md, padding: spacing.lg }}>
                    <Skeleton.Text width="80%" />
                    <Skeleton.Rect width="60%" height={1} borderRadius={1} />
                    <Skeleton.Text width="90%" />
                    <Skeleton.Text width="70%" />
                    <Skeleton.Rect width="60%" height={1} borderRadius={1} />
                    <Skeleton.Text width="85%" />
                    <Skeleton.Text width="75%" />
                  </View>
                ) : verseText ? (
                  <>
                    {/* Bismillah — Surah 9 (At-Tawbah) does NOT have Bismillah */}
                    {selectedSurahNumber !== 9 && (
                      <Text style={styles.bismillah}>{'\u0628\u0650\u0633\u0652\u0645\u0650 \u0627\u0644\u0644\u0651\u064E\u0647\u0650 \u0627\u0644\u0631\u0651\u064E\u062D\u0652\u0645\u064E\u0670\u0646\u0650 \u0627\u0644\u0631\u0651\u064E\u062D\u0650\u064A\u0645\u0650'}</Text>
                    )}

                    {/* Decorative line */}
                    <LinearGradient
                      colors={['transparent', colors.gold, 'transparent']}
                      style={styles.decorativeLine}
                    />

                    {/* Arabic Text */}
                    <Text style={[styles.verseArabic, { color: tc.text.primary }]}>{verseText}</Text>

                    {/* Decorative separator */}
                    <View style={styles.verseSeparator}>
                      <View style={styles.separatorDot} />
                      <LinearGradient
                        colors={['transparent', colors.emerald, 'transparent']}
                        style={styles.separatorLine}
                      />
                      <View style={styles.separatorDot} />
                    </View>

                    {/* Translation */}
                    <Text style={styles.verseTranslation}>{translationText}</Text>

                    {/* Reference */}
                    <View style={styles.verseReference}>
                      <LinearGradient
                        colors={['rgba(10,123,79,0.2)', 'rgba(200,150,62,0.1)']}
                        style={styles.referenceBadge}
                      >
                        <Text style={styles.referenceText}>
                          {currentSurah.name} {currentVerse}
                        </Text>
                      </LinearGradient>
                    </View>

                    {/* Tafsir Button */}
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={t('tafsir.viewTafsir')}
                      onPress={() => navigate('/(screens)/tafsir-viewer', { surah: selectedSurahNumber, verse: currentVerse })}
                      style={styles.tafsirButton}
                    >
                      <Icon name="book-open" size="sm" color={colors.gold} />
                      <Text style={styles.tafsirButtonText}>{t('tafsir.viewTafsir')}</Text>
                    </Pressable>
                  </>
                ) : (
                  <EmptyState
                    icon="book-open"
                    title={t('screens.quranShare.verseNotFound')}
                    subtitle={t('screens.quranShare.tryAnotherVerse')}
                  />
                )}
              </LinearGradient>
            </LinearGradient>
          </Animated.View>

          {/* Share Options */}
          <Animated.View entering={FadeInUp.delay(300).duration(500)} style={styles.shareOptions}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('screens.quranShare.shareThisVerse')}
              style={styles.shareButton}
              onPress={() => setShowShareOptions(true)}
            >
              <LinearGradient
                colors={[colors.emerald, colors.gold]}
                style={styles.shareButtonGradient}
              >
                <Icon name="share" size="sm" color="#fff" />
                <Text style={styles.shareButtonText}>{t('screens.quranShare.shareThisVerse')}</Text>
              </LinearGradient>
            </Pressable>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('screens.quranShare.copyText')}
              style={styles.copyButton}
              onPress={handleCopyText}
            >
              <LinearGradient
                colors={colors.gradient.cardDark}
                style={styles.copyButtonGradient}
              >
                <Icon name="link" size="sm" color={tc.text.secondary} />
                <Text style={styles.copyButtonText}>{t('screens.quranShare.copyText')}</Text>
              </LinearGradient>
            </Pressable>
          </Animated.View>
        </ScrollView>

        {/* Surah Picker Bottom Sheet */}
        <BottomSheet visible={showSurahPicker} onClose={() => { setShowSurahPicker(false); setSurahSearch(''); }}>
          <View style={styles.surahSearchBar}>
            <Icon name="search" size="sm" color={tc.text.tertiary} />
            <TextInput
              style={styles.surahSearchInput}
              value={surahSearch}
              onChangeText={setSurahSearch}
              placeholder={t('screens.quranShare.searchSurahs')}
              placeholderTextColor={tc.text.tertiary}
            />
          </View>
          {(surahs ?? []).filter(s => !surahSearch.trim() || s.name.toLowerCase().includes(surahSearch.toLowerCase()) || s.arabicName.includes(surahSearch)).map((surah) => (
            <BottomSheetItem
              key={surah.number}
              label={`${surah.number}. ${surah.name}`}
              onPress={() => {
                setSelectedSurahNumber(surah.number);
                setCurrentVerse(1);
                setShowSurahPicker(false);
              }}
              icon={selectedSurahNumber === surah.number ? (
                <Icon name="check" size="sm" color={colors.emerald} />
              ) : (
                <Text style={[styles.surahArabicList, { color: tc.text.tertiary }]}>{surah.arabicName}</Text>
              )}
            />
          ))}
        </BottomSheet>

        {/* Share Options Bottom Sheet */}
        <BottomSheet visible={showShareOptions} onClose={() => setShowShareOptions(false)}>
          <Text style={styles.shareSheetTitle}>{t('screens.quranShare.shareQuranVerse')}</Text>
          <BottomSheetItem
            label={t('screens.quranShare.shareAsPost')}
            icon={<Icon name="image" size="sm" color={colors.emerald} />}
            onPress={handleShareAsPost}
          />
          <BottomSheetItem
            label={t('screens.quranShare.shareAsStory')}
            icon={<Icon name="play" size="sm" color={colors.gold} />}
            onPress={handleShareAsStory}
          />
          <BottomSheetItem
            label={t('screens.quranShare.copyText')}
            icon={<Icon name="link" size="sm" color={tc.text.secondary} />}
            onPress={handleCopyText}
          />
          <BottomSheetItem
            label={t('screens.quranShare.shareImage')}
            icon={<Icon name="share" size="sm" color={colors.emerald} />}
            onPress={async () => {
              setShowShareOptions(false);
              // TODO: Capture verse card as image with react-native-view-shot when installed
              // For now, share as text via system share sheet
              const text = `${verseText}\n\n${translationText}\n\n— ${currentSurah.name} ${currentVerse}`;
              try { await Share.share({ message: text }); } catch { /* user cancelled */ }
            }}
          />
        </BottomSheet>
      </SafeAreaView>

    </ScreenErrorBoundary>
  );
}

const createStyles = (tc: ReturnType<typeof useThemeColors>) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: tc.bg,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingTop: 100,
    paddingHorizontal: spacing.base,
    paddingBottom: spacing['3xl'],
  },

  // Surah Selector
  surahSelector: {
    marginBottom: spacing.md,
    borderRadius: radius.lg,
    overflow: 'hidden',
  },
  surahSelectorGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.active.white6,
  },
  surahIconBg: {
    width: 44,
    height: 44,
    borderRadius: radius.full,
    justifyContent: 'center',
    alignItems: 'center',
    marginEnd: spacing.md,
  },
  surahInfo: {
    flex: 1,
  },
  surahNameArabic: {
    color: colors.gold,
    fontSize: fontSize.lg,
    fontFamily: fonts.arabicBold,
    marginBottom: 2,
  },
  surahName: {
    color: tc.text.secondary,
    fontSize: fontSize.sm,
  },
  surahMeta: {
    alignItems: 'flex-end',
    marginEnd: spacing.sm,
  },
  surahNumber: {
    color: tc.text.primary,
    fontSize: fontSize.sm,
    fontWeight: '500',
  },
  verseCount: {
    color: tc.text.tertiary,
    fontSize: fontSize.xs,
  },

  // Verse Navigation
  verseNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  navButton: {
    borderRadius: radius.full,
    overflow: 'hidden',
  },
  navButtonGradient: {
    width: 40,
    height: 40,
    borderRadius: radius.full,
    justifyContent: 'center',
    alignItems: 'center',
  },
  navButtonDisabled: {
    opacity: 0.5,
  },
  verseIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.active.white6,
  },
  verseNumberText: {
    color: tc.text.primary,
    fontSize: fontSize.base,
    fontFamily: fonts.bodySemiBold,
  },

  // Verse Card
  verseCard: {
    borderRadius: radius.lg,
    padding: spacing.sm,
    position: 'relative',
    overflow: 'hidden',
  },
  verseCardInner: {
    borderRadius: radius.md,
    padding: spacing.lg,
    position: 'relative',
    zIndex: 1,
  },

  // Decorative Pattern
  patternContainer: {
    ...StyleSheet.absoluteFillObject,
    padding: 4,
    opacity: 0.4,
  },
  patternRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginVertical: spacing.xs,
  },
  patternDiamond: {
    width: 16,
    height: 16,
    transform: [{ rotate: '45deg' }],
  },
  diamondGradient: {
    flex: 1,
    borderRadius: 2,
  },

  // Bismillah
  bismillah: {
    color: colors.gold,
    fontSize: fontSize.lg,
    fontFamily: fonts.arabic,
    textAlign: 'center',
    marginBottom: spacing.md,
    lineHeight: 30,
  },
  decorativeLine: {
    height: 1,
    marginHorizontal: spacing['2xl'],
    marginBottom: spacing.md,
  },

  // Arabic Text
  verseArabic: {
    color: colors.text.primary,
    fontSize: fontSize['2xl'],
    fontFamily: fonts.arabicBold,
    textAlign: 'center',
    lineHeight: 48,
    marginBottom: spacing.lg,
    writingDirection: 'rtl',
  },

  // Separator
  verseSeparator: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  separatorDot: {
    width: 6,
    height: 6,
    borderRadius: radius.full,
    backgroundColor: colors.emerald,
  },
  separatorLine: {
    height: 1,
    flex: 1,
    maxWidth: 80,
    marginHorizontal: spacing.sm,
  },

  // Translation
  verseTranslation: {
    color: tc.text.secondary,
    fontSize: fontSize.base,
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: spacing.lg,
    fontStyle: 'italic',
  },

  // Reference
  verseReference: {
    alignItems: 'center',
  },
  referenceBadge: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.full,
  },
  referenceText: {
    color: tc.text.primary,
    fontSize: fontSize.sm,
    fontWeight: '500',
  },

  // Tafsir Button
  tafsirButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    marginTop: spacing.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.base,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.active.gold30,
  },
  tafsirButtonText: {
    color: colors.gold,
    fontSize: fontSize.sm,
    fontWeight: '500',
  },

  // Share Options
  shareOptions: {
    marginTop: spacing.lg,
    gap: spacing.md,
  },
  shareButton: {
    borderRadius: radius.lg,
    overflow: 'hidden',
  },
  shareButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    borderRadius: radius.lg,
  },
  shareButtonText: {
    color: '#fff',
    fontSize: fontSize.base,
    fontFamily: fonts.bodySemiBold,
  },
  copyButton: {
    borderRadius: radius.lg,
    overflow: 'hidden',
  },
  copyButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.active.white6,
  },
  copyButtonText: {
    color: tc.text.secondary,
    fontSize: fontSize.base,
    fontWeight: '500',
  },

  // Surah Search in Bottom Sheet
  surahSearchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.active.white6,
  },
  surahSearchInput: {
    flex: 1,
    color: tc.text.primary,
    fontSize: fontSize.base,
    padding: 0,
  },
  surahArabicList: {
    color: colors.text.tertiary,
    fontSize: fontSize.sm,
    fontFamily: fonts.arabic,
  },

  // Share Sheet
  shareSheetTitle: {
    color: tc.text.primary,
    fontSize: fontSize.md,
    fontFamily: fonts.bodySemiBold,
    textAlign: 'center',
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.active.white6,
  },
});
