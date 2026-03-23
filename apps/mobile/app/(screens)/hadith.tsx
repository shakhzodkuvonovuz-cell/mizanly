import { useState, useCallback, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  ScrollView,
  Dimensions,
  Share,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeInUp, useSharedValue, useAnimatedStyle, withSpring } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { Icon, type IconName } from '@/components/ui/Icon';
import { GlassHeader } from '@/components/ui/GlassHeader';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { colors, spacing, radius, fontSize, fonts } from '@/theme';
import { useContextualHaptic } from '@/hooks/useContextualHaptic';

import { islamicApi } from '@/services/islamicApi';
import type { Hadith as ApiHadith } from '@/types/islamic';
import type { PaginatedResponse } from '@/types';
import { Audio } from 'expo-av';
import { useTranslation } from '@/hooks/useTranslation';
import { useThemeColors } from '@/hooks/useThemeColors';
import { BrandedRefreshControl } from '@/components/ui/BrandedRefreshControl';
import { showToast } from '@/components/ui/Toast';
import { ScreenErrorBoundary } from '@/components/ui/ScreenErrorBoundary';

const { width } = Dimensions.get('window');

interface Hadith {
  id: string;
  arabic: string;
  english: string;
  source: string;
  narrator: string;
  date: string;
  isBookmarked: boolean;
}


function ActionButton({
  icon,
  label,
  onPress,
  isActive,
  activeColor = colors.emerald,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
  isActive?: boolean;
  activeColor?: string;
}) {
  const haptic = useContextualHaptic();
  const tc = useThemeColors();

  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => {
        haptic.navigate();
        onPress();
      }}
      style={styles.actionButton}
    >
      <LinearGradient
        colors={isActive ? [activeColor, colors.goldLight] : ['rgba(45,53,72,0.6)', 'rgba(28,35,51,0.3)']}
        style={styles.actionButtonGradient}
      >
        <Icon
          name={icon}
          size="sm"
          color={isActive ? tc.text.primary : tc.text.secondary}
        />
      </LinearGradient>
      <Text style={[styles.actionLabel, { color: tc.text.secondary }]}>{label}</Text>
    </Pressable>
  );
}

function PreviousHadithCard({
  hadith,
  index,
  onPress,
}: {
  hadith: Hadith;
  index: number;
  onPress: () => void;
}) {
  const tc = useThemeColors();
  return (
    <Animated.View entering={FadeInUp.delay(index * 80).duration(400)}>
      <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={hadith.source}>
        <LinearGradient
          colors={colors.gradient.cardDark}
          style={styles.previousCard}
        >
          <View style={styles.previousCardContent}>
            <Text style={[styles.previousEnglish, { color: tc.text.primary }]} numberOfLines={2}>
              {hadith.english}
            </Text>
            <View style={styles.previousMeta}>
              <Text style={[styles.previousSource, { color: tc.text.tertiary }]}>{hadith.source}</Text>
              {hadith.date ? <Text style={[styles.previousDate, { color: tc.text.secondary }]}>{hadith.date}</Text> : null}
            </View>
          </View>
          {hadith.isBookmarked && (
            <View style={styles.bookmarkIndicator}>
              <Icon name="bookmark-filled" size="xs" color={colors.gold} />
            </View>
          )}
        </LinearGradient>
      </Pressable>
    </Animated.View>
  );
}

export default function HadithScreen() {
  const router = useRouter();
  const haptic = useContextualHaptic();
  const { t } = useTranslation();
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hadiths, setHadiths] = useState<Hadith[]>([]);
  const [currentHadith, setCurrentHadith] = useState<Hadith | null>(null);
  const [bookmarkedIds, setBookmarkedIds] = useState<Set<string>>(new Set());
  const scaleAnim = useSharedValue(1);
  const tc = useThemeColors();

  // Audio playback (hadith recitation not yet available from API)
  const soundRef = useRef<Audio.Sound | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  const handlePlayAudio = useCallback(() => {
    haptic.navigate();
    showToast({ message: t('islamic.audioRecitationComingSoon', { defaultValue: 'Audio recitation coming soon' }), variant: 'info' });
  }, [haptic, t]);

  useEffect(() => {
    return () => { soundRef.current?.unloadAsync(); };
  }, []);

  const fetchData = useCallback(async () => {
    try {
      setError(null);
      const [dailyResp, listResp] = await Promise.all([
        islamicApi.getDailyHadith(),
        islamicApi.listHadiths(),
      ]);
      const dailyHadith: Hadith = {
        id: dailyResp.id.toString(),
        arabic: dailyResp.arabic,
        english: dailyResp.english,
        source: dailyResp.source,
        narrator: dailyResp.narrator,
        date: '',
        isBookmarked: false,
      };
      const listHadiths: Hadith[] = (Array.isArray(listResp) ? listResp : []).map((h: ApiHadith) => ({
        id: h.id.toString(),
        arabic: h.arabic,
        english: h.english,
        source: h.source,
        narrator: h.narrator,
        date: '',
        isBookmarked: false,
      }));
      setCurrentHadith(dailyHadith);
      setHadiths([dailyHadith, ...listHadiths]);
    } catch (err) {
      setError(t('islamic.errors.failedToLoadHadiths'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [t]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchData();
  }, [fetchData]);

  const handleBookmark = useCallback(() => {
    if (!currentHadith) return;
    haptic.save();
    const hadithId = currentHadith.id;
    // Optimistic UI update
    setCurrentHadith(prev => prev ? { ...prev, isBookmarked: !prev.isBookmarked } : prev);
    setHadiths(prev => prev.map(h => h.id === hadithId ? { ...h, isBookmarked: !h.isBookmarked } : h));
    setBookmarkedIds(prev => {
      const next = new Set(prev);
      if (next.has(hadithId)) {
        next.delete(hadithId);
      } else {
        next.add(hadithId);
      }
      return next;
    });
    // Persist bookmark to API
    islamicApi.bookmarkHadith(hadithId).catch(() => {
      // Revert on failure
      setCurrentHadith(prev => prev ? { ...prev, isBookmarked: !prev.isBookmarked } : prev);
      setHadiths(prev => prev.map(h => h.id === hadithId ? { ...h, isBookmarked: !h.isBookmarked } : h));
    });
    scaleAnim.value = withSpring(1.1, { damping: 10, stiffness: 400 }, () => {
      scaleAnim.value = withSpring(1);
    });
  }, [haptic, scaleAnim, currentHadith]);

  const handleShare = useCallback(async () => {
    if (!currentHadith) return;
    haptic.send();
    try {
      await Share.share({
        message: `${currentHadith.arabic}\n\n${currentHadith.english}\n\n— ${currentHadith.source} (${currentHadith.narrator})\n\nShared from Mizanly`,
      });
    } catch {
      // User cancelled share
    }
  }, [haptic, currentHadith]);

  const handleCopy = useCallback(async () => {
    if (!currentHadith) return;
    haptic.save();
    await Clipboard.setStringAsync(`${currentHadith.arabic}\n\n${currentHadith.english}\n\n— ${currentHadith.source} (${currentHadith.narrator})`);
    showToast({ message: t('common.copied', { defaultValue: 'Copied to clipboard' }), variant: 'success' });
  }, [haptic, currentHadith, t]);

  const selectHadith = useCallback((hadith: Hadith) => {
    setCurrentHadith(hadith);
  }, []);

  const animatedBookmarkStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scaleAnim.value }],
  }));

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: tc.bg }]}>
        <GlassHeader
          title={t('islamic.hadith')}
          leftAction={{ icon: 'arrow-left', onPress: () => router.back() }}
        />
        <View style={styles.loadingContainer}>
          <Skeleton.Rect width={width - 32} height={200} borderRadius={radius.lg} />
          <Skeleton.Rect width={200} height={20} borderRadius={radius.sm} style={{ marginTop: spacing.lg }} />
          <Skeleton.Rect width={150} height={16} borderRadius={radius.sm} style={{ marginTop: spacing.md }} />
        </View>
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: tc.bg }]}>
        <GlassHeader
          title={t('islamic.hadith')}
          leftAction={{ icon: 'arrow-left', onPress: () => router.back() }}
        />
        <View style={styles.loadingContainer}>
          <EmptyState
            icon="book-open"
            title={t('islamic.errors.failedToLoadHadiths')}
            subtitle={error}
            actionLabel={t('common.retry')}
            onAction={fetchData}
          />
        </View>
      </SafeAreaView>
    );
  }

  if (!currentHadith) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: tc.bg }]}>
        <GlassHeader
          title={t('islamic.hadith')}
          leftAction={{ icon: 'arrow-left', onPress: () => router.back() }}
        />
        <View style={styles.loadingContainer}>
          <EmptyState
            icon="book-open"
            title={t('islamic.errors.noHadithAvailable')}
            subtitle={t('islamic.errors.checkConnection')}
            actionLabel={t('common.retry')}
            onAction={fetchData}
          />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <ScreenErrorBoundary>
      <SafeAreaView style={[styles.container, { backgroundColor: tc.bg }]}>
        <GlassHeader
          title={t('islamic.dailyHadith')}
          leftAction={{ icon: 'arrow-left', onPress: () => router.back() }}
        />

        <FlatList
          data={hadiths.slice(1)}
          keyExtractor={item => item.id}
          refreshControl={<BrandedRefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          contentContainerStyle={styles.scrollContent}
          ListHeaderComponent={
            <>
              {/* Hero Card - Today's Hadith */}
              <Animated.View entering={FadeInUp.duration(500)}>
                <LinearGradient
                  colors={['rgba(45,53,72,0.6)', 'rgba(28,35,51,0.3)']}
                  style={[styles.heroCard, { borderLeftWidth: 3, borderLeftColor: colors.gold }]}
                >
                  {/* Book Icon */}
                  <LinearGradient
                    colors={['rgba(10,123,79,0.2)', 'rgba(200,150,62,0.1)']}
                    style={styles.iconBackground}
                  >
                    <Icon name="book-open" size="sm" color={colors.emerald} />
                  </LinearGradient>

                  {/* Arabic Text */}
                  <Text style={[styles.arabicText, { color: tc.text.primary }]}>{currentHadith.arabic}</Text>

                  {/* English Translation */}
                  <Text style={[styles.englishText, { color: tc.text.primary }]}>{currentHadith.english}</Text>

                  {/* Source & Narrator */}
                  <View style={styles.attributionContainer}>
                    <Text style={[styles.sourceText, { color: tc.text.tertiary }]}>{currentHadith.source}</Text>
                    <Text style={[styles.narratorText, { color: tc.text.secondary }]}>{currentHadith.narrator}</Text>
                  </View>

                  {/* Action Row */}
                  <View style={styles.actionRow}>
                    <ActionButton icon="play" label={t('common.listen', { defaultValue: 'Listen' })} onPress={handlePlayAudio} />
                    <Animated.View style={animatedBookmarkStyle}>
                      <ActionButton
                        icon={currentHadith.isBookmarked ? 'bookmark-filled' : 'bookmark'}
                        label={t('common.save')}
                        onPress={handleBookmark}
                        isActive={currentHadith.isBookmarked}
                        activeColor={colors.gold}
                      />
                    </Animated.View>
                    <ActionButton icon="share" label={t('common.share')} onPress={handleShare} />
                    <ActionButton icon="check-check" label={t('common.copy')} onPress={handleCopy} />
                  </View>
                </LinearGradient>
              </Animated.View>

              {/* Section Title */}
              <View style={styles.sectionHeader}>
                <Text style={[styles.sectionTitle, { color: tc.text.primary }]}>{t('islamic.previousHadith')}</Text>
              </View>
            </>
          }
          renderItem={({ item, index }) => (
            <PreviousHadithCard
              hadith={item}
              index={index}
              onPress={() => selectHadith(item)}
            />
          )}
          ListEmptyComponent={
            <EmptyState
              icon="book-open"
              title={t('islamic.noPreviousHadith')}
              subtitle={t('islamic.checkBackTomorrow')}
            />
          }
          ListFooterComponent={
            <>
              {/* Bottom Info Card */}
              <Animated.View entering={FadeInUp.delay(400).duration(500)}>
                <LinearGradient
                  colors={['rgba(10,123,79,0.15)', 'rgba(28,35,51,0.2)']}
                  style={styles.infoCard}
                >
                  <View style={styles.infoRow}>
                    <Icon name="check-circle" size="sm" color={colors.emerald} />
                    <Text style={[styles.infoText, { color: tc.text.secondary }]}>
                      {t('islamic.hadithSourceInfo')}
                    </Text>
                  </View>
                </LinearGradient>
              </Animated.View>

              {/* Bottom padding */}
              <View style={{ height: spacing.xxl }} />
            </>
          }
        />
      </SafeAreaView>
  
    </ScreenErrorBoundary>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.dark.bg,
  },
  loadingContainer: {
    flex: 1,
    padding: spacing.base,
    paddingTop: 100,
  },
  scrollContent: {
    padding: spacing.base,
    paddingTop: 100,
  },
  heroCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.active.white6,
    padding: spacing.lg,
    marginBottom: spacing.lg,
  },
  iconBackground: {
    width: 32,
    height: 32,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  arabicText: {
    fontFamily: fonts.arabic,
    fontSize: fontSize.lg,
    color: colors.text.primary,
    textAlign: 'right',
    lineHeight: 36,
    marginBottom: spacing.md,
    writingDirection: 'rtl',
  },
  englishText: {
    fontFamily: fonts.body,
    fontSize: fontSize.base,
    color: colors.text.primary,
    lineHeight: 24,
    marginBottom: spacing.md,
  },
  attributionContainer: {
    marginBottom: spacing.lg,
  },
  sourceText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSize.sm,
    color: colors.text.tertiary,
    marginBottom: spacing.xs,
  },
  narratorText: {
    fontFamily: fonts.body,
    fontSize: fontSize.sm,
    color: colors.text.secondary,
  },
  actionRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  actionButton: {
    alignItems: 'center',
    gap: spacing.xs,
  },
  actionButtonGradient: {
    width: 44,
    height: 44,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.active.white6,
  },
  actionLabel: {
    fontFamily: fonts.body,
    fontSize: fontSize.xs,
    color: colors.text.secondary,
  },
  sectionHeader: {
    marginBottom: spacing.md,
    marginTop: spacing.sm,
  },
  sectionTitle: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSize.md,
    color: colors.text.primary,
  },
  previousCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.active.white6,
    padding: spacing.base,
    marginBottom: spacing.md,
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  previousCardContent: {
    flex: 1,
  },
  previousEnglish: {
    fontFamily: fonts.body,
    fontSize: fontSize.base,
    color: colors.text.primary,
    lineHeight: 22,
    marginBottom: spacing.sm,
  },
  previousMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  previousSource: {
    fontFamily: fonts.body,
    fontSize: fontSize.xs,
    color: colors.text.tertiary,
  },
  previousDate: {
    fontFamily: fonts.body,
    fontSize: fontSize.xs,
    color: colors.text.secondary,
  },
  bookmarkIndicator: {
    marginStart: spacing.sm,
    padding: spacing.xs,
  },
  infoCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.active.white6,
    padding: spacing.base,
    marginTop: spacing.lg,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  infoText: {
    fontFamily: fonts.body,
    fontSize: fontSize.sm,
    color: colors.text.secondary,
    flex: 1,
    lineHeight: 20,
  },
});
