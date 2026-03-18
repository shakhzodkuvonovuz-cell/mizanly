import { useState, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, Pressable, ScrollView, Share, RefreshControl,
, Pressable } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { useQuery } from '@tanstack/react-query';
import { Icon } from '@/components/ui/Icon';
import { GlassHeader } from '@/components/ui/GlassHeader';
import { BottomSheet, BottomSheetItem } from '@/components/ui/BottomSheet';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { islamicApi } from '@/services/islamicApi';
import { colors, spacing, radius, fontSize } from '@/theme';
import { useTranslation } from '@/hooks/useTranslation';
import type { TafsirEntry } from '@/types/islamic';
import { ScreenErrorBoundary } from '@/components/ui/ScreenErrorBoundary';

export default function TafsirViewerScreen() {
  const router = useRouter();
  const { t, language } = useTranslation();
  const { surah, verse } = useLocalSearchParams<{ surah: string; verse: string }>();
  const [showSourceFilter, setShowSourceFilter] = useState(false);
  const [selectedSources, setSelectedSources] = useState<Set<string>>(new Set());

  const surahNumber = parseInt(surah || '1', 10);
  const verseNumber = parseInt(verse || '1', 10);

  // Fetch tafsir data
  const {
    data: tafsirData,
    isLoading,
    isRefetching,
    refetch,
    isError,
  } = useQuery({
    queryKey: ['tafsir', surahNumber, verseNumber],
    queryFn: async () => {
      const res = await islamicApi.getTafsir(surahNumber, verseNumber);
      return res as TafsirEntry;
    },
    enabled: !!surah && !!verse,
  });

  // Fetch available sources
  const { data: allSources } = useQuery({
    queryKey: ['tafsir-sources'],
    queryFn: async () => {
      const res = await islamicApi.getTafsirSources();
      return res as Array<{ name: string }>;
    },
  });

  const filteredSources = useMemo(() => {
    if (!tafsirData?.tafsirSources) return [];
    if (selectedSources.size === 0) return tafsirData.tafsirSources;
    return tafsirData.tafsirSources.filter((s) => selectedSources.has(s.name));
  }, [tafsirData, selectedSources]);

  const toggleSource = useCallback((name: string) => {
    setSelectedSources((prev) => {
      const next = new Set(prev);
      if (next.has(name)) {
        next.delete(name);
      } else {
        next.add(name);
      }
      return next;
    });
  }, []);

  const handleShare = useCallback(async () => {
    if (!tafsirData) return;
    const sourceTexts = filteredSources
      .map((s) => {
        const text = language === 'ar' ? s.textAr : s.textEn;
        return `[${s.name}]\n${text}`;
      })
      .join('\n\n');

    const message = `${tafsirData.verse}\n\n${sourceTexts}\n\n— Surah ${surahNumber}:${verseNumber}`;
    try {
      await Share.share({ message });
    } catch {
      // user cancelled
    }
  }, [tafsirData, filteredSources, language, surahNumber, verseNumber]);

  const handleRefresh = useCallback(() => {
    refetch();
  }, [refetch]);

  // Loading state
  if (isLoading) {
    return (
      <View style={styles.container}>
        <GlassHeader
          title={t('tafsir.title')}
          leftAction={{ icon: 'arrow-left', onPress: () => router.back() }}
        />
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <Skeleton.Rect width="100%" height={120} borderRadius={radius.lg} />
          <View style={{ marginTop: spacing.md }}>
            <Skeleton.Rect width="40%" height={16} borderRadius={radius.sm} />
          </View>
          <View style={{ marginTop: spacing.lg }}>
            <Skeleton.Rect width="100%" height={180} borderRadius={radius.lg} />
          </View>
          <View style={{ marginTop: spacing.md }}>
            <Skeleton.Rect width="100%" height={180} borderRadius={radius.lg} />
          </View>
        </ScrollView>
      </View>
    );
  }

  // Error / not found
  if (isError || !tafsirData) {
    return (
      <View style={styles.container}>
        <GlassHeader
          title={t('tafsir.title')}
          leftAction={{ icon: 'arrow-left', onPress: () => router.back() }}
        />
        <EmptyState
          icon="book-open"
          title={t('tafsir.noTafsir')}
          actionLabel={t('common.back')}
          onAction={() => router.back()}
        />
      </View>
    );
  }

  return (
    <ScreenErrorBoundary>
      <View style={styles.container}>
        <GlassHeader
          title={t('tafsir.title')}
          leftAction={{ icon: 'arrow-left', onPress: () => router.back() }}
          rightAction={{ icon: 'share', onPress: handleShare }}
        />

        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              tintColor={colors.emerald}
              refreshing={isRefetching}
              onRefresh={handleRefresh}
            />
          }
        >
          {/* Verse Display Card */}
          <Animated.View entering={FadeInUp.duration(500)}>
            <LinearGradient
              colors={['rgba(45,53,72,0.5)', 'rgba(28,35,51,0.3)']}
              style={styles.verseCard}
            >
              <LinearGradient
                colors={['rgba(22,27,34,0.95)', 'rgba(13,17,23,0.98)']}
                style={styles.verseCardInner}
              >
                <Text style={styles.verseArabic}>{tafsirData.verse}</Text>
                <LinearGradient
                  colors={['transparent', colors.gold, 'transparent']}
                  style={styles.decorativeLine}
                />
                <View style={styles.verseReference}>
                  <LinearGradient
                    colors={['rgba(10,123,79,0.2)', 'rgba(200,150,62,0.1)']}
                    style={styles.referenceBadge}
                  >
                    <Text style={styles.referenceText}>
                      {surahNumber}:{verseNumber}
                    </Text>
                  </LinearGradient>
                </View>
              </LinearGradient>
            </LinearGradient>
          </Animated.View>

          {/* Filter Bar */}
          <Animated.View entering={FadeInUp.delay(100).duration(500)} style={styles.filterBar}>
            <Text style={styles.sourcesTitle}>
              {t('tafsir.source')} ({filteredSources.length})
            </Text>
            <Pressable
              accessibilityRole="button"
              style={styles.filterButton}
              onPress={() => setShowSourceFilter(true)}
            >
              <Icon name="filter" size="sm" color={colors.emerald} />
              <Text style={styles.filterButtonText}>{t('tafsir.filterSources')}</Text>
            </Pressable>
          </Animated.View>

          {/* Tafsir Cards */}
          {filteredSources.map((source, index) => (
            <Animated.View
              key={`${source.name}-${index}`}
              entering={FadeInUp.delay(200 + index * 80).duration(500)}
            >
              <LinearGradient
                colors={['rgba(45,53,72,0.4)', 'rgba(28,35,51,0.2)']}
                style={styles.tafsirCard}
              >
                {/* Source Header */}
                <View style={styles.tafsirCardHeader}>
                  <LinearGradient
                    colors={[colors.emerald, 'rgba(10,123,79,0.7)']}
                    style={styles.sourceBadge}
                  >
                    <Text style={styles.sourceBadgeText}>{source.name}</Text>
                  </LinearGradient>
                  {source.madhab !== 'general' && (
                    <LinearGradient
                      colors={['rgba(200,150,62,0.3)', 'rgba(200,150,62,0.1)']}
                      style={styles.madhabBadge}
                    >
                      <Text style={styles.madhabBadgeText}>{source.madhab}</Text>
                    </LinearGradient>
                  )}
                </View>

                {/* Tafsir Text */}
                <Text style={styles.tafsirText}>
                  {language === 'ar' ? source.textAr : source.textEn}
                </Text>
              </LinearGradient>
            </Animated.View>
          ))}

          {filteredSources.length === 0 && (
            <EmptyState
              icon="book-open"
              title={t('tafsir.noTafsir')}
            />
          )}

          {/* Share Button */}
          <Animated.View entering={FadeInUp.delay(400).duration(500)} style={styles.shareSection}>
            <Pressable style={styles.shareButton} onPress={handleShare}>
              <LinearGradient
                colors={[colors.emerald, colors.gold]}
                style={styles.shareButtonGradient}
              >
                <Icon name="share" size="sm" color="#fff" />
                <Text style={styles.shareButtonText}>{t('tafsir.share')}</Text>
              </LinearGradient>
            </Pressable>
          </Animated.View>
        </ScrollView>

        {/* Source Filter BottomSheet */}
        <BottomSheet visible={showSourceFilter} onClose={() => setShowSourceFilter(false)}>
          <Text style={styles.filterSheetTitle}>{t('tafsir.filterSources')}</Text>
          {(allSources ?? []).map((src) => (
            <BottomSheetItem
              key={src.name}
              label={src.name}
              icon={
                selectedSources.has(src.name) || selectedSources.size === 0 ? (
                  <Icon name="check" size="sm" color={colors.emerald} />
                ) : undefined
              }
              onPress={() => toggleSource(src.name)}
            />
          ))}
        </BottomSheet>
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
  scrollContent: {
    paddingTop: 100,
    paddingHorizontal: spacing.base,
    paddingBottom: spacing['3xl'],
  },

  // Verse Card
  verseCard: {
    borderRadius: radius.lg,
    padding: spacing.sm,
    overflow: 'hidden',
  },
  verseCardInner: {
    borderRadius: radius.md,
    padding: spacing.lg,
    alignItems: 'center',
  },
  verseArabic: {
    color: colors.gold,
    fontSize: fontSize.xl,
    textAlign: 'center',
    lineHeight: 44,
    writingDirection: 'rtl',
    marginBottom: spacing.md,
  },
  decorativeLine: {
    height: 1,
    width: '60%',
    marginBottom: spacing.md,
  },
  verseReference: {
    alignItems: 'center',
  },
  referenceBadge: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.full,
  },
  referenceText: {
    color: colors.text.primary,
    fontSize: fontSize.sm,
    fontWeight: '500',
  },

  // Filter Bar
  filterBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.lg,
    marginBottom: spacing.md,
  },
  sourcesTitle: {
    color: colors.text.primary,
    fontSize: fontSize.md,
    fontWeight: '600',
  },
  filterButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: 'rgba(10,123,79,0.3)',
  },
  filterButtonText: {
    color: colors.emerald,
    fontSize: fontSize.sm,
    fontWeight: '500',
  },

  // Tafsir Card
  tafsirCard: {
    borderRadius: radius.lg,
    padding: spacing.base,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  tafsirCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  sourceBadge: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.full,
  },
  sourceBadgeText: {
    color: '#fff',
    fontSize: fontSize.sm,
    fontWeight: '600',
  },
  madhabBadge: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.full,
  },
  madhabBadgeText: {
    color: colors.gold,
    fontSize: fontSize.xs,
    fontWeight: '500',
    textTransform: 'capitalize',
  },
  tafsirText: {
    color: colors.text.primary,
    fontSize: fontSize.base,
    lineHeight: 24,
  },

  // Share
  shareSection: {
    marginTop: spacing.md,
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
    fontWeight: '600',
  },

  // Filter Sheet
  filterSheetTitle: {
    color: colors.text.primary,
    fontSize: fontSize.md,
    fontWeight: '600',
    textAlign: 'center',
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
});
