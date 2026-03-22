import { useState, useCallback, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Dimensions,
  Share,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, {
  FadeInUp,
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Audio } from 'expo-av';
import { Icon, type IconName } from '@/components/ui/Icon';
import { GlassHeader } from '@/components/ui/GlassHeader';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { colors, spacing, radius, fontSize, fonts, fontSizeExt } from '@/theme';
import { useContextualHaptic } from '@/hooks/useContextualHaptic';
import { formatCount } from '@/utils/formatCount';
import { useTranslation } from '@/hooks/useTranslation';
import { useThemeColors } from '@/hooks/useThemeColors';
import { BrandedRefreshControl } from '@/components/ui/BrandedRefreshControl';
import { showToast } from '@/components/ui/Toast';
import { ScreenErrorBoundary } from '@/components/ui/ScreenErrorBoundary';
import { islamicApi } from '@/services/islamicApi';
import { navigate } from '@/utils/navigation';

const { width } = Dimensions.get('window');

const PRESET_PHRASES = [
  { id: 'subhanallah', latin: 'SubhanAllah', arabic: 'سبحان الله', meaning: 'Glory be to Allah' },
  { id: 'alhamdulillah', latin: 'Alhamdulillah', arabic: 'الحمد لله', meaning: 'Praise be to Allah' },
  { id: 'allahuakbar', latin: 'Allahu Akbar', arabic: 'الله أكبر', meaning: 'Allah is Greatest' },
  { id: 'lailaha', latin: 'La ilaha illAllah', arabic: 'لا إله إلا الله', meaning: 'There is no god but Allah' },
  { id: 'astaghfirullah', latin: 'Astaghfirullah', arabic: 'أستغفر الله', meaning: 'I seek forgiveness from Allah' },
];

const DAILY_GOAL = 33;

/**
 * Generate a short WAV buffer for a sine-wave tick at the given frequency.
 * Returns a base64-encoded WAV data URI playable by expo-av.
 */
function generateBeadClickWav(hz = 800, durationMs = 50, sampleRate = 22050): string {
  const numSamples = Math.floor(sampleRate * (durationMs / 1000));
  const numChannels = 1;
  const bitsPerSample = 16;
  const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
  const blockAlign = numChannels * (bitsPerSample / 8);
  const dataSize = numSamples * blockAlign;
  const headerSize = 44;
  const buffer = new ArrayBuffer(headerSize + dataSize);
  const view = new DataView(buffer);

  const writeStr = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
  };
  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);
  writeStr(36, 'data');
  view.setUint32(40, dataSize, true);

  // Generate sine wave with quick fade-in/out envelope for a clean click
  const fadeLen = Math.floor(numSamples * 0.2);
  for (let i = 0; i < numSamples; i++) {
    let amplitude = 0.25;
    if (i < fadeLen) amplitude *= i / fadeLen;
    else if (i > numSamples - fadeLen) amplitude *= (numSamples - i) / fadeLen;
    const sample = Math.sin(2 * Math.PI * hz * (i / sampleRate)) * amplitude;
    const val = Math.max(-1, Math.min(1, sample));
    view.setInt16(headerSize + i * 2, val * 0x7fff, true);
  }

  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  const b64 = btoa(binary);
  return `data:audio/wav;base64,${b64}`;
}

// Pre-generate the bead click WAV URI once (avoids regenerating on every tap)
let _beadClickUri: string | null = null;
function getBeadClickUri(): string {
  if (!_beadClickUri) {
    _beadClickUri = generateBeadClickWav(800, 50);
  }
  return _beadClickUri;
}

function PhraseButton({
  phrase,
  isSelected,
  onPress,
}: {
  phrase: typeof PRESET_PHRASES[0];
  isSelected: boolean;
  onPress: () => void;
}) {
  const { t } = useTranslation();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`${phrase.latin} - ${phrase.meaning}`}>
      <LinearGradient
        colors={
          isSelected
            ? ['rgba(10,123,79,0.3)', 'rgba(200,150,62,0.15)']
            : colors.gradient.cardDark
        }
        style={[
          styles.phraseButton,
          isSelected && styles.phraseButtonSelected,
        ]}
      >
        <Text style={[styles.phraseLatin, isSelected && styles.phraseLatinSelected, { color: tc.text.secondary }]}>
          {phrase.latin}
        </Text>
        <Text style={[styles.phraseArabic, { color: tc.text.primary }]}>{phrase.arabic}</Text>
        <Text style={[styles.phraseMeaning, { color: tc.text.tertiary }]}>{t(`screens.dhikrCounter.phraseMeaning.${phrase.id}`)}</Text>
      </LinearGradient>
    </Pressable>
  );
}

function StatCard({
  icon,
  label,
  value,
  delay,
}: {
  icon: IconName;
  label: string;
  value: string | number;
  delay: number;
}) {
  return (
    <Animated.View entering={FadeInUp.delay(delay).duration(400)} style={styles.statCardWrapper}>
      <LinearGradient
        colors={colors.gradient.cardDark}
        style={styles.statCard}
      >
        <LinearGradient
          colors={['rgba(10,123,79,0.2)', 'rgba(10,123,79,0.05)']}
          style={styles.statIconBg}
        >
          <Icon name={icon} size="sm" color={colors.emerald} />
        </LinearGradient>
        <Text style={[styles.statValue, { color: tc.text.primary }]}>{value}</Text>
        <Text style={[styles.statLabel, { color: tc.text.secondary }]}>{label}</Text>
      </LinearGradient>
    </Animated.View>
  );
}

export default function DhikrCounterScreen() {
  const router = useRouter();
  const haptic = useContextualHaptic();
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  const [selectedPhrase, setSelectedPhrase] = useState(PRESET_PHRASES[0]);
  const [count, setCount] = useState(0);
  const [hasStarted, setHasStarted] = useState(false);
  const sessionSavedRef = useRef(false);

  const counterScale = useSharedValue(1);
  const progressWidth = useSharedValue(0);
  const shimmerOpacity = useSharedValue(0);
  const tc = useThemeColors();

  // Bead click sound on each dhikr tap
  const playBeadClick = useCallback(async () => {
    try {
      const uri = getBeadClickUri();
      const { sound } = await Audio.Sound.createAsync(
        { uri },
        { shouldPlay: true },
      );
      sound.setOnPlaybackStatusUpdate((status) => {
        if (status.isLoaded && status.didJustFinish) {
          sound.unloadAsync();
        }
      });
    } catch {
      // Silent fallback — haptic only
    }
  }, []);

  // Fetch stats from API
  const { data: statsData, refetch: refetchStats } = useQuery({
    queryKey: ['dhikr-stats'],
    queryFn: () => islamicApi.getDhikrStats(),
  });

  const stats = {
    totalCount: statsData?.todayCount ?? 0,
    setsCompleted: statsData?.setsCompleted ?? 0,
    streak: statsData?.streak ?? 0,
  };

  // Save session mutation
  const saveSessionMutation = useMutation({
    mutationFn: (data: { phrase: string; count: number; target?: number }) =>
      islamicApi.saveDhikrSession(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dhikr-stats'] });
      showToast({ message: t('screens.dhikrCounter.sessionSaved', { defaultValue: 'Session saved' }), variant: 'success' });
    },
  });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetchStats();
    setRefreshing(false);
  }, [refetchStats]);

  const handleTap = useCallback(() => {
    haptic.tick();
    playBeadClick();
    setCount(prev => prev + 1);
    setHasStarted(true);

    // Pulse animation
    counterScale.value = withSequence(
      withSpring(1.05, { damping: 10, stiffness: 400 }),
      withSpring(1, { damping: 15, stiffness: 300 })
    );
  }, [haptic, counterScale, playBeadClick]);

  const handleReset = useCallback(() => {
    // Save session before resetting if count > 0
    if (count > 0 && !sessionSavedRef.current) {
      saveSessionMutation.mutate({
        phrase: selectedPhrase.id,
        count,
        target: DAILY_GOAL,
      });
    }
    haptic.delete();
    setCount(0);
    setHasStarted(false);
    sessionSavedRef.current = false;
  }, [haptic, count, selectedPhrase.id, saveSessionMutation]);

  const selectPhrase = useCallback((phrase: typeof PRESET_PHRASES[0]) => {
    // Save session before switching phrase if count > 0
    if (count > 0 && !sessionSavedRef.current) {
      saveSessionMutation.mutate({
        phrase: selectedPhrase.id,
        count,
        target: DAILY_GOAL,
      });
    }
    haptic.tick();
    setSelectedPhrase(phrase);
    setCount(0);
    setHasStarted(false);
    sessionSavedRef.current = false;
  }, [haptic, count, selectedPhrase.id, saveSessionMutation]);

  const handleShareProgress = useCallback(async () => {
    haptic.send();
    try {
      await Share.share({
        message: `${selectedPhrase.arabic} - ${count}/${DAILY_GOAL}\n${t('dhikr.streak', { count: stats.streak })}\nMizanly - Dhikr Counter`,
      });
    } catch (_e) {
      // User cancelled share
    }
  }, [haptic, selectedPhrase.arabic, count, stats.streak, t]);

  // Calculate progress
  const progress = Math.min(count / DAILY_GOAL, 1);
  const isComplete = count >= DAILY_GOAL;

  useEffect(() => {
    progressWidth.value = withSpring(progress * 100, { damping: 15, stiffness: 100 });
  }, [progress, progressWidth]);

  useEffect(() => {
    if (isComplete && !sessionSavedRef.current) {
      haptic.success();
      sessionSavedRef.current = true;
      saveSessionMutation.mutate({
        phrase: selectedPhrase.id,
        count,
        target: DAILY_GOAL,
      });
      shimmerOpacity.value = withSequence(
        withTiming(1, { duration: 300 }),
        withTiming(0, { duration: 300 }),
        withTiming(1, { duration: 300 }),
        withTiming(0, { duration: 500 })
      );
    }
  }, [isComplete, haptic, shimmerOpacity, count, selectedPhrase.id, saveSessionMutation]);

  const counterAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: counterScale.value }],
  }));

  const progressAnimatedStyle = useAnimatedStyle(() => ({
    width: `${progressWidth.value}%`,
  }));

  const shimmerAnimatedStyle = useAnimatedStyle(() => ({
    opacity: shimmerOpacity.value,
  }));

  return (
    <ScreenErrorBoundary>
      <SafeAreaView style={[styles.container, { backgroundColor: tc.bg }]}>
        <GlassHeader
          title={t('screens.dhikrCounter.title')}
          leftAction={{ icon: 'arrow-left', onPress: () => router.back() }}
        />

        <ScrollView
          refreshControl={<BrandedRefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          contentContainerStyle={styles.scrollContent}
        >
          {/* Phrase Selector */}
          <Animated.View entering={FadeInUp.duration(400)}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.phraseSelector}
            >
              {PRESET_PHRASES.map((phrase) => (
                <PhraseButton
                  key={phrase.id}
                  phrase={phrase}
                  isSelected={selectedPhrase.id === phrase.id}
                  onPress={() => selectPhrase(phrase)}
                />
              ))}
            </ScrollView>
          </Animated.View>

          {/* Daily Stats Bar */}
          <Animated.View entering={FadeInUp.delay(50).duration(400)}>
            <View style={styles.dailyStatsBar}>
              <View style={styles.dailyStatItem}>
                <Icon name="trending-up" size="xs" color={colors.gold} />
                <Text style={[styles.dailyStatText, { color: tc.text.secondary }]}>
                  {t('dhikr.streak', { count: stats.streak })}
                </Text>
              </View>
              <View style={styles.dailyStatItem}>
                <Icon name="bar-chart-2" size="xs" color={colors.emerald} />
                <Text style={[styles.dailyStatText, { color: tc.text.secondary }]}>
                  {t('dhikr.todayCount', { count: (statsData?.todayCount ?? 0) + count })}
                </Text>
              </View>
            </View>
          </Animated.View>

          {/* Counter Circle */}
          <Animated.View entering={FadeInUp.delay(100).duration(500)} style={styles.counterContainer}>
            <Pressable onPress={handleTap} accessibilityRole="button" accessibilityLabel={t('screens.dhikrCounter.tapHint')}>
              <Animated.View style={counterAnimatedStyle}>
                {/* Outer Ring Gradient */}
                <LinearGradient
                  colors={[colors.emerald, colors.goldLight]}
                  style={styles.counterOuterRing}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                >
                  {/* Inner Circle */}
                  <View style={[styles.counterInnerCircle, { backgroundColor: tc.bgCard }]}>
                    {/* Count Number */}
                    <Text style={[styles.countNumber, { color: tc.text.primary }]}>{count}</Text>

                    {/* Arabic Phrase */}
                    <Text style={styles.countArabic}>{selectedPhrase.arabic}</Text>

                    {/* Hint Text */}
                    {!hasStarted && (
                      <Text style={[styles.tapHint, { color: tc.text.tertiary }]}>{t('screens.dhikrCounter.tapHint')}</Text>
                    )}
                  </View>
                </LinearGradient>

                {/* Gold shimmer on completion */}
                {isComplete && (
                  <Animated.View style={[styles.shimmerOverlay, shimmerAnimatedStyle]}>
                    <LinearGradient
                      colors={['rgba(200,150,62,0)', 'rgba(200,150,62,0.3)', 'rgba(200,150,62,0)']}
                      style={styles.shimmerGradient}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                    />
                  </Animated.View>
                )}
              </Animated.View>
            </Pressable>

            {/* Reset Button */}
            <Pressable onPress={handleReset} style={styles.resetButton} accessibilityRole="button" accessibilityLabel="Reset counter">
              <LinearGradient
                colors={['rgba(45,53,72,0.6)', 'rgba(28,35,51,0.3)']}
                style={styles.resetButtonGradient}
              >
                <Icon name="circle" size="xs" color={tc.text.tertiary} />
              </LinearGradient>
            </Pressable>
          </Animated.View>

          {/* Progress Card */}
          <Animated.View entering={FadeInUp.delay(200).duration(400)}>
            <LinearGradient
              colors={colors.gradient.cardDark}
              style={styles.progressCard}
            >
              <View style={styles.progressHeader}>
                <Text style={[styles.progressTitle, { color: tc.text.primary }]}>
                  {isComplete ? t('screens.dhikrCounter.setComplete') : t('screens.dhikrCounter.progressTitle', { count, goal: DAILY_GOAL })}
                </Text>
                {isComplete && <Icon name="check-circle" size="sm" color={colors.gold} />}
              </View>

              {/* Progress Bar */}
              <View style={styles.progressBarContainer}>
                <View style={[styles.progressBarTrack, { backgroundColor: tc.surface }]}>
                  <Animated.View
                    style={[
                      styles.progressBarFill,
                      isComplete && styles.progressBarFillComplete,
                      progressAnimatedStyle,
                    ]}
                  />
                </View>
              </View>

              <Text style={[styles.progressSubtitle, { color: tc.text.tertiary }]}>
                {t('screens.dhikrCounter.progressSubtitle')}
              </Text>
            </LinearGradient>
          </Animated.View>

          {/* Action Buttons Row */}
          <Animated.View entering={FadeInUp.delay(250).duration(400)}>
            <View style={styles.actionRow}>
              <Pressable onPress={handleShareProgress} style={styles.actionButtonWrapper} accessibilityRole="button" accessibilityLabel={t('dhikr.shareProgress')}>
                <LinearGradient
                  colors={colors.gradient.cardDark}
                  style={styles.actionButton}
                >
                  <Icon name="share" size="sm" color={colors.emerald} />
                  <Text style={[styles.actionButtonText, { color: tc.text.primary }]}>{t('dhikr.shareProgress')}</Text>
                </LinearGradient>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                onPress={() => navigate('/(screens)/dhikr-challenges')}

                style={styles.actionButtonWrapper}
              >
                <LinearGradient
                  colors={['rgba(10,123,79,0.2)', 'rgba(200,150,62,0.1)']}
                  style={styles.actionButton}
                >
                  <Icon name="users" size="sm" color={colors.gold} />
                  <Text style={[styles.actionButtonText, { color: tc.text.primary }]}>{t('dhikr.challenges')}</Text>
                </LinearGradient>
              </Pressable>
            </View>
          </Animated.View>

          {/* Daily Summary */}
          <Animated.View entering={FadeInUp.delay(300).duration(400)}>
            <Text style={[styles.summaryTitle, { color: tc.text.primary }]}>{t('dhikr.stats')}</Text>
            <View style={styles.statsRow}>
              <StatCard icon="bar-chart-2" label={t('screens.dhikrCounter.stats.totalCounts')} value={formatCount(statsData?.totalCount ?? stats.totalCount)} delay={350} />
              <StatCard icon="check-circle" label={t('screens.dhikrCounter.stats.setsDone')} value={formatCount(stats.setsCompleted)} delay={400} />
              <StatCard icon="trending-up" label={t('screens.dhikrCounter.stats.dayStreak')} value={stats.streak} delay={450} />
            </View>
          </Animated.View>

          {/* Bottom spacing */}
          <View style={{ height: spacing.xxl }} />
        </ScrollView>
      </SafeAreaView>

    </ScreenErrorBoundary>
  );
}

const COUNTER_SIZE = 200;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.dark.bg,
  },
  scrollContent: {
    paddingTop: 100,
    paddingBottom: spacing.xxl,
  },
  phraseSelector: {
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    gap: spacing.sm,
  },
  phraseButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.active.white6,
    alignItems: 'center',
    minWidth: 100,
  },
  phraseButtonSelected: {
    borderColor: colors.emerald,
    borderWidth: 1.5,
  },
  phraseLatin: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSize.sm,
    color: colors.text.secondary,
    marginBottom: spacing.xs,
  },
  phraseLatinSelected: {
    color: colors.emerald,
  },
  phraseArabic: {
    fontFamily: fonts.arabic,
    fontSize: fontSize.md,
    color: colors.text.primary,
    marginBottom: spacing.xs,
    writingDirection: 'rtl',
  },
  phraseMeaning: {
    fontFamily: fonts.body,
    fontSize: fontSize.xs,
    color: colors.text.tertiary,
  },
  dailyStatsBar: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.lg,
    paddingHorizontal: spacing.base,
    marginBottom: spacing.sm,
  },
  dailyStatItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  dailyStatText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSize.sm,
    color: colors.text.secondary,
  },
  counterContainer: {
    alignItems: 'center',
    marginVertical: spacing.lg,
    position: 'relative',
  },
  counterOuterRing: {
    width: COUNTER_SIZE,
    height: COUNTER_SIZE,
    borderRadius: radius.full,
    padding: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  counterInnerCircle: {
    width: COUNTER_SIZE - 12,
    height: COUNTER_SIZE - 12,
    borderRadius: radius.full,
    backgroundColor: colors.dark.bgCard,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countNumber: {
    fontFamily: fonts.heading,
    fontSize: fontSizeExt.jumbo,
    color: colors.text.primary,
    marginBottom: spacing.sm,
  },
  countArabic: {
    fontFamily: fonts.arabic,
    fontSize: fontSize.lg,
    color: colors.emerald,
    writingDirection: 'rtl',
  },
  tapHint: {
    fontFamily: fonts.body,
    fontSize: fontSize.sm,
    color: colors.text.tertiary,
    marginTop: spacing.sm,
  },
  shimmerOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: radius.full,
    overflow: 'hidden',
  },
  shimmerGradient: {
    width: '100%',
    height: '100%',
  },
  resetButton: {
    position: 'absolute',
    top: 0,
    right: width / 2 - COUNTER_SIZE / 2 - 20,
  },
  resetButtonGradient: {
    width: 36,
    height: 36,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.active.white6,
  },
  progressCard: {
    marginHorizontal: spacing.base,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.active.white6,
    padding: spacing.lg,
    marginBottom: spacing.lg,
  },
  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  progressTitle: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSize.base,
    color: colors.text.primary,
  },
  progressBarContainer: {
    marginBottom: spacing.sm,
  },
  progressBarTrack: {
    height: 8,
    backgroundColor: colors.dark.surface,
    borderRadius: radius.full,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: colors.emerald,
    borderRadius: radius.full,
  },
  progressBarFillComplete: {
    backgroundColor: colors.gold,
  },
  progressSubtitle: {
    fontFamily: fonts.body,
    fontSize: fontSize.sm,
    color: colors.text.tertiary,
  },
  actionRow: {
    flexDirection: 'row',
    paddingHorizontal: spacing.base,
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  actionButtonWrapper: {
    flex: 1,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.active.white6,
  },
  actionButtonText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSize.sm,
    color: colors.text.primary,
  },
  summaryTitle: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSize.md,
    color: colors.text.primary,
    marginHorizontal: spacing.base,
    marginBottom: spacing.md,
    marginTop: spacing.sm,
  },
  statsRow: {
    flexDirection: 'row',
    paddingHorizontal: spacing.base,
    gap: spacing.sm,
  },
  statCardWrapper: {
    flex: 1,
  },
  statCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.active.white6,
    padding: spacing.md,
    alignItems: 'center',
  },
  statIconBg: {
    width: 32,
    height: 32,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  statValue: {
    fontFamily: fonts.heading,
    fontSize: fontSize.xl,
    color: colors.text.primary,
    marginBottom: spacing.xs,
  },
  statLabel: {
    fontFamily: fonts.body,
    fontSize: fontSize.xs,
    color: colors.text.secondary,
  },
});
