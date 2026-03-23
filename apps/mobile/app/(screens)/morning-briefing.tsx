import { useState, useCallback, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, Pressable, ScrollView, TextInput,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as Location from 'expo-location';
import { Audio } from 'expo-av';
import { Icon } from '@/components/ui/Icon';
import { GlassHeader } from '@/components/ui/GlassHeader';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { BrandedRefreshControl } from '@/components/ui/BrandedRefreshControl';
import { ScreenErrorBoundary } from '@/components/ui/ScreenErrorBoundary';
import { showToast } from '@/components/ui/Toast';
import { useTranslation } from '@/hooks/useTranslation';
import { useContextualHaptic } from '@/hooks/useContextualHaptic';
import { useThemeColors } from '@/hooks/useThemeColors';
import { colors, spacing, radius, fontSize, fonts } from '@/theme';
import { islamicApi } from '@/services/islamicApi';

interface DailyBriefing {
  hijriDate: string;
  prayerTimes: Record<string, string> | null;
  hadithOfTheDay: { text: string; arabic: string; source: string; narrator: string };
  ayahOfTheDay: { surah: string; ayahNumber: number; arabic: string; translation: string };
  duaOfTheDay: { arabic: string; translation: string; transliteration: string; category: string; source: string };
  dhikrChallenge: { text: string; target: number; completed: number; streakDays: number };
  tasksCompleted: number;
  totalTasks: number;
  completedTasks: string[];
}

/**
 * Construct Quran verse audio URL from cdn.islamic.network (Mishary Alafasy).
 */
const SURAH_OFFSETS = [
  0, 7, 293, 493, 669, 789, 954, 1160, 1235, 1364, 1473, 1596, 1707, 1750,
  1802, 1901, 2029, 2140, 2250, 2348, 2483, 2595, 2673, 2791, 2855, 2932,
  3159, 3252, 3340, 3409, 3469, 3503, 3533, 3606, 3660, 3705, 3788, 3970,
  4058, 4133, 4218, 4272, 4325, 4414, 4473, 4510, 4545, 4583, 4612, 4630,
  4675, 4735, 4784, 4846, 4901, 4979, 5075, 5104, 5126, 5150, 5163, 5177,
  5188, 5199, 5217, 5229, 5241, 5271, 5323, 5367, 5395, 5423, 5451, 5507,
  5542, 5573, 5623, 5663, 5709, 5755, 5784, 5813, 5849, 5874, 5896, 5913,
  5932, 5958, 5988, 6008, 6023, 6044, 6058, 6066, 6074, 6093, 6098, 6106,
  6117, 6125, 6130, 6138, 6146, 6154, 6162, 6170, 6176, 6179, 6182, 6185,
  6188, 6193, 6197, 6204,
];

/**
 * Parse surah number from a surah name/reference string like "Al-Baqarah" or "2".
 * Returns 0 if not parseable (we then just show a toast).
 */
function parseSurahNumber(surahRef: string): number {
  // Try direct numeric parse first
  const num = parseInt(surahRef, 10);
  if (!isNaN(num) && num >= 1 && num <= 114) return num;
  return 0;
}

function getQuranAudioUrl(surah: number, ayah: number): string {
  const offset = SURAH_OFFSETS[surah - 1] ?? 0;
  const audioNumber = offset + ayah;
  return `https://cdn.islamic.network/quran/audio/128/ar.alafasy/${audioNumber}.mp3`;
}

function DhikrCounter({ target, initialCount, onComplete }: { target: number; initialCount: number; onComplete: () => void }) {
  const [count, setCount] = useState(initialCount);
  const haptic = useContextualHaptic();
  const { t } = useTranslation();
  const tc = useThemeColors();
  const isComplete = count >= target;

  const handlePress = useCallback(() => {
    if (isComplete) return;
    haptic.tick();
    const next = count + 1;
    setCount(next);
    if (next >= target) {
      haptic.success();
      onComplete();
    }
  }, [count, target, isComplete, haptic, onComplete]);

  const progress = Math.min(count / target, 1);

  return (
    <View style={styles.dhikrContainer}>
      <Pressable
        onPress={handlePress}
        style={[styles.dhikrButton, isComplete && styles.dhikrButtonComplete]}
        accessibilityLabel={`Dhikr counter ${count} of ${target}`}
        accessibilityRole="button"
      >
        <Text style={[styles.dhikrCount, { color: tc.text.primary }]}>{count}</Text>
        <Text style={[styles.dhikrTarget, { color: tc.text.secondary }]}>/ {target}</Text>
      </Pressable>
      <View style={styles.dhikrProgressBg}>
        <View style={[styles.dhikrProgressFill, { width: `${progress * 100}%` }]} />
      </View>
      {isComplete && (
        <Text style={styles.dhikrCompleteText}>{t('dailyBriefing.completed')}</Text>
      )}
    </View>
  );
}

export default function MorningBriefingScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const haptic = useContextualHaptic();
  const queryClient = useQueryClient();
  const [reflectionText, setReflectionText] = useState('');
  const tc = useThemeColors();

  // Audio playback
  const soundRef = useRef<Audio.Sound | null>(null);
  const [isPlayingAyah, setIsPlayingAyah] = useState(false);

  const playAyahAudio = useCallback(async (surahRef: string, ayahNumber: number) => {
    try {
      // Stop if already playing (toggle)
      if (soundRef.current) {
        await soundRef.current.stopAsync();
        await soundRef.current.unloadAsync();
        soundRef.current = null;
        if (isPlayingAyah) { setIsPlayingAyah(false); return; }
      }

      const surahNum = parseSurahNumber(surahRef);
      if (surahNum === 0) {
        showToast({ message: t('islamic.audioPlaybackUnavailable', { defaultValue: 'Audio playback unavailable' }), variant: 'info' });
        return;
      }

      const audioUrl = getQuranAudioUrl(surahNum, ayahNumber);
      const { sound } = await Audio.Sound.createAsync(
        { uri: audioUrl },
        { shouldPlay: true },
      );
      soundRef.current = sound;
      setIsPlayingAyah(true);

      sound.setOnPlaybackStatusUpdate((status) => {
        if (status.isLoaded && status.didJustFinish) {
          setIsPlayingAyah(false);
          sound.unloadAsync();
          soundRef.current = null;
        }
      });
    } catch {
      showToast({ message: t('islamic.audioPlaybackUnavailable', { defaultValue: 'Audio playback unavailable' }), variant: 'info' });
      setIsPlayingAyah(false);
    }
  }, [isPlayingAyah, t]);

  const handlePlayHadith = useCallback(() => {
    haptic.navigate();
    showToast({ message: t('islamic.audioRecitationComingSoon', { defaultValue: 'Audio recitation coming soon' }), variant: 'info' });
  }, [haptic, t]);

  const handlePlayDua = useCallback(() => {
    haptic.navigate();
    showToast({ message: t('islamic.audioRecitationComingSoon', { defaultValue: 'Audio recitation coming soon' }), variant: 'info' });
  }, [haptic, t]);

  useEffect(() => {
    return () => { soundRef.current?.unloadAsync(); };
  }, []);

  const locationQuery = useQuery({
    queryKey: ['briefing-location'],
    queryFn: async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return null;
      const loc = await Location.getCurrentPositionAsync({});
      return { lat: loc.coords.latitude, lng: loc.coords.longitude };
    },
    staleTime: 10 * 60 * 1000,
  });

  const briefingQuery = useQuery({
    queryKey: ['daily-briefing', locationQuery.data?.lat, locationQuery.data?.lng],
    queryFn: async () => {
      const loc = locationQuery.data;
      const res = await islamicApi.getDailyBriefing(loc?.lat, loc?.lng);
      return res as unknown as DailyBriefing;
    },
    enabled: !locationQuery.isLoading,
  });

  const completeMutation = useMutation({
    mutationFn: (taskType: string) => islamicApi.completeDailyTask(taskType),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['daily-briefing'] });
    },
  });

  const handleCompleteTask = useCallback((taskType: string) => {
    haptic.success();
    completeMutation.mutate(taskType);
  }, [haptic, completeMutation]);

  const handleRefresh = useCallback(() => {
    briefingQuery.refetch();
  }, [briefingQuery]);

  const briefing = briefingQuery.data;
  const completedTasks = briefing?.completedTasks || [];

  // Get greeting based on time of day
  const hour = new Date().getHours();
  const greeting = hour < 12 ? t('dailyBriefing.greeting') : hour < 17 ? t('dailyBriefing.greetingAfternoon') : t('dailyBriefing.greetingEvening');

  return (
    <ScreenErrorBoundary>
      <SafeAreaView style={[styles.container, { backgroundColor: tc.bg }]} edges={['top']}>
        <GlassHeader
          title={t('dailyBriefing.title')}
          leftAction={{
            icon: <Icon name="arrow-left" size="md" color={tc.text.primary} />,
            onPress: () => router.back(),
            accessibilityLabel: t('common.goBack'),
          }}
        />

        <ScrollView
          contentContainerStyle={styles.scrollContent}
          refreshControl={
            <BrandedRefreshControl refreshing={briefingQuery.isRefetching} onRefresh={handleRefresh} />
          }
        >
          {briefingQuery.isLoading ? (
            <View style={styles.skeletonContainer}>
              <Skeleton.Rect width="60%" height={24} borderRadius={radius.sm} />
              <Skeleton.Rect width="40%" height={16} borderRadius={radius.sm} />
              <Skeleton.Rect width="100%" height={120} borderRadius={radius.lg} />
              <Skeleton.Rect width="100%" height={160} borderRadius={radius.lg} />
              <Skeleton.Rect width="100%" height={140} borderRadius={radius.lg} />
              <Skeleton.Rect width="100%" height={100} borderRadius={radius.lg} />
            </View>
          ) : !briefing ? (
            <EmptyState
              icon="clock"
              title={t('dailyBriefing.title')}
              subtitle={t('dailyBriefing.loadError')}
              actionLabel={t('common.retry')}
              onAction={handleRefresh}
            />
          ) : (
            <>
              {/* Header: Greeting + Hijri Date */}
              <Animated.View entering={FadeInUp.duration(400)}>
                <Text style={[styles.greeting, { color: tc.text.primary }]}>{greeting}</Text>
                <Text style={styles.hijriDate}>{briefing.hijriDate}</Text>
              </Animated.View>

              {/* Progress overview */}
              <Animated.View entering={FadeInUp.delay(100).duration(400)}>
                <LinearGradient
                  colors={['rgba(10,123,79,0.15)', 'rgba(10,123,79,0.05)']}
                  style={styles.progressCard}
                >
                  <View style={styles.progressHeader}>
                    <Text style={[styles.progressTitle, { color: tc.text.primary }]}>
                      {t('dailyBriefing.tasksComplete', {
                        completed: String(briefing.tasksCompleted),
                        total: String(briefing.totalTasks),
                      })}
                    </Text>
                    {briefing.tasksCompleted < briefing.totalTasks && (
                      <Text style={styles.bonusXPText}>
                        {t('dailyBriefing.bonusXP', { xp: '50' })}
                      </Text>
                    )}
                  </View>
                  <View style={styles.progressBarBg}>
                    <View style={[styles.progressBarFill, { width: `${(briefing.tasksCompleted / briefing.totalTasks) * 100}%` }]} />
                  </View>
                </LinearGradient>
              </Animated.View>

              {/* Prayer Times (compact) */}
              {briefing.prayerTimes && (
                <Animated.View entering={FadeInUp.delay(200).duration(400)}>
                  <LinearGradient
                    colors={colors.gradient.cardDark}
                    style={styles.card}
                  >
                    <View style={styles.cardHeader}>
                      <Icon name="clock" size="sm" color={colors.gold} />
                      <Text style={[styles.cardTitle, { color: tc.text.primary }]}>{t('islamic.prayerTimes')}</Text>
                    </View>
                    <View style={styles.prayerTimesGrid}>
                      {Object.entries(briefing.prayerTimes).map(([name, time]) => (
                        <View key={name} style={styles.prayerTimeItem}>
                          <Text style={[styles.prayerName, { color: tc.text.secondary }]}>{name}</Text>
                          <Text style={[styles.prayerTime, { color: tc.text.primary }]}>{time}</Text>
                        </View>
                      ))}
                    </View>
                  </LinearGradient>
                </Animated.View>
              )}

              {/* Hadith of the Day */}
              <Animated.View entering={FadeInUp.delay(300).duration(400)}>
                <LinearGradient
                  colors={['rgba(200,150,62,0.12)', 'rgba(200,150,62,0.04)']}
                  style={styles.card}
                >
                  <View style={styles.cardHeader}>
                    <Icon name="layers" size="sm" color={colors.gold} />
                    <Text style={[styles.cardTitle, { color: tc.text.primary }]}>{t('dailyBriefing.hadithOfTheDay')}</Text>
                    <Pressable
                      onPress={handlePlayHadith}
                      hitSlop={8}
                      accessibilityLabel={t('common.listen', { defaultValue: 'Listen' })}
                      accessibilityRole="button"
                      style={styles.cardPlayBtn}
                    >
                      <Icon name="play" size="sm" color={colors.gold} />
                    </Pressable>
                  </View>
                  {briefing.hadithOfTheDay.arabic ? (
                    <Text style={[styles.arabicText, { color: tc.text.primary }]}>{briefing.hadithOfTheDay.arabic}</Text>
                  ) : null}
                  <Text style={[styles.contentText, { color: tc.text.secondary }]}>{briefing.hadithOfTheDay.text}</Text>
                  <Text style={[styles.sourceText, { color: tc.text.tertiary }]}>
                    — {briefing.hadithOfTheDay.source} ({briefing.hadithOfTheDay.narrator})
                  </Text>
                </LinearGradient>
              </Animated.View>

              {/* Dua of the Day */}
              <Animated.View entering={FadeInUp.delay(400).duration(400)}>
                <LinearGradient
                  colors={colors.gradient.cardDark}
                  style={styles.card}
                >
                  <View style={styles.cardHeader}>
                    <Icon name="heart" size="sm" color={colors.emerald} />
                    <Text style={[styles.cardTitle, { color: tc.text.primary }]}>{t('dailyBriefing.duaOfTheDay')}</Text>
                    <Pressable
                      onPress={handlePlayDua}
                      hitSlop={8}
                      accessibilityLabel={t('common.listen', { defaultValue: 'Listen' })}
                      accessibilityRole="button"
                      style={styles.cardPlayBtn}
                    >
                      <Icon name="play" size="sm" color={colors.emerald} />
                    </Pressable>
                  </View>
                  <Text style={[styles.arabicText, { color: tc.text.primary }]}>{briefing.duaOfTheDay.arabic}</Text>
                  <Text style={[styles.transliterationText, { color: tc.text.secondary }]}>{briefing.duaOfTheDay.transliteration}</Text>
                  <Text style={[styles.contentText, { color: tc.text.secondary }]}>{briefing.duaOfTheDay.translation}</Text>
                  <Text style={[styles.sourceText, { color: tc.text.tertiary }]}>— {briefing.duaOfTheDay.source}</Text>
                </LinearGradient>
              </Animated.View>

              {/* Dhikr Challenge */}
              <Animated.View entering={FadeInUp.delay(500).duration(400)}>
                <LinearGradient
                  colors={['rgba(10,123,79,0.12)', 'rgba(10,123,79,0.04)']}
                  style={styles.card}
                >
                  <View style={styles.cardHeader}>
                    <Icon name="check-circle" size="sm" color={colors.emerald} />
                    <Text style={[styles.cardTitle, { color: tc.text.primary }]}>{t('dailyBriefing.dhikrChallenge')}</Text>
                    {completedTasks.includes('dhikr') && (
                      <View style={styles.completeBadge}>
                        <Icon name="check" size="xs" color={colors.emerald} />
                      </View>
                    )}
                  </View>
                  <Text style={[styles.dhikrPhrase, { color: tc.text.primary }]}>
                    "{briefing.dhikrChallenge.text}" × {briefing.dhikrChallenge.target}
                  </Text>
                  <DhikrCounter
                    target={briefing.dhikrChallenge.target}
                    initialCount={briefing.dhikrChallenge.completed}
                    onComplete={() => handleCompleteTask('dhikr')}
                  />
                </LinearGradient>
              </Animated.View>

              {/* Quran Task */}
              <Animated.View entering={FadeInUp.delay(600).duration(400)}>
                <Pressable
                  onPress={() => {
                    if (!completedTasks.includes('quran')) {
                      handleCompleteTask('quran');
                    }
                  }}
                  accessibilityLabel={t('dailyBriefing.ayahOfTheDay')}
                  accessibilityRole="button"
                >
                  <LinearGradient
                    colors={colors.gradient.cardDark}
                    style={styles.card}
                  >
                    <View style={styles.cardHeader}>
                      <Icon name="layers" size="sm" color={colors.gold} />
                      <Text style={[styles.cardTitle, { color: tc.text.primary }]}>{t('dailyBriefing.ayahOfTheDay')}</Text>
                      <Pressable
                        onPress={(e) => {
                          e.stopPropagation?.();
                          haptic.navigate();
                          playAyahAudio(briefing.ayahOfTheDay.surah, briefing.ayahOfTheDay.ayahNumber);
                        }}
                        hitSlop={8}
                        accessibilityLabel={isPlayingAyah ? t('common.stop', { defaultValue: 'Stop' }) : t('common.listen', { defaultValue: 'Listen' })}
                        accessibilityRole="button"
                        style={styles.cardPlayBtn}
                      >
                        <Icon name={isPlayingAyah ? 'loader' : 'play'} size="sm" color={isPlayingAyah ? colors.gold : colors.gold} />
                      </Pressable>
                      {completedTasks.includes('quran') ? (
                        <View style={styles.completeBadge}>
                          <Icon name="check" size="xs" color={colors.emerald} />
                        </View>
                      ) : (
                        <View style={styles.tapBadge}>
                          <Text style={styles.tapBadgeText}>{t('dailyBriefing.tapToComplete')}</Text>
                        </View>
                      )}
                    </View>
                    <Text style={styles.surahRef}>
                      {briefing.ayahOfTheDay.surah}:{briefing.ayahOfTheDay.ayahNumber}
                    </Text>
                    <Text style={[styles.contentText, { color: tc.text.secondary }]}>{briefing.ayahOfTheDay.translation}</Text>
                  </LinearGradient>
                </Pressable>
              </Animated.View>

              {/* Reflection Task */}
              <Animated.View entering={FadeInUp.delay(700).duration(400)}>
                <LinearGradient
                  colors={['rgba(200,150,62,0.08)', 'rgba(200,150,62,0.02)']}
                  style={styles.card}
                >
                  <View style={styles.cardHeader}>
                    <Icon name="edit" size="sm" color={colors.gold} />
                    <Text style={[styles.cardTitle, { color: tc.text.primary }]}>{t('dailyBriefing.dailyReflection')}</Text>
                    {completedTasks.includes('reflection') && (
                      <View style={styles.completeBadge}>
                        <Icon name="check" size="xs" color={colors.emerald} />
                      </View>
                    )}
                  </View>
                  {!completedTasks.includes('reflection') ? (
                    <>
                      <Text style={[styles.reflectionPrompt, { color: tc.text.secondary }]}>
                        {t('dailyBriefing.gratefulPrompt')}
                      </Text>
                      <TextInput
                        style={[styles.reflectionInput, { borderColor: tc.border }, { color: tc.text.primary, borderColor: tc.border }]}
                        value={reflectionText}
                        onChangeText={setReflectionText}
                        placeholder={t('dailyBriefing.gratefulPrompt')}
                        placeholderTextColor={tc.text.tertiary}
                        multiline
                        numberOfLines={3}
                        accessibilityLabel={t('dailyBriefing.dailyReflection')}
                      />
                      <Pressable
                        style={[styles.reflectionSubmit, !reflectionText.trim() && styles.reflectionSubmitDisabled]}
                        onPress={() => {
                          if (reflectionText.trim()) {
                            handleCompleteTask('reflection');
                          }
                        }}
                        disabled={!reflectionText.trim()}
                        accessibilityLabel={t('dailyBriefing.submitReflection')}
                        accessibilityRole="button"
                      >
                        <Text style={styles.reflectionSubmitText}>{t('dailyBriefing.submitReflection')}</Text>
                      </Pressable>
                    </>
                  ) : (
                    <Text style={styles.reflectionComplete}>{t('dailyBriefing.completed')}</Text>
                  )}
                </LinearGradient>
              </Animated.View>

              {/* All tasks complete celebration */}
              {briefing.tasksCompleted >= briefing.totalTasks && (
                <Animated.View entering={FadeInUp.delay(800).duration(400)}>
                  <LinearGradient
                    colors={[colors.emerald, colors.emeraldDark]}
                    style={styles.celebrationCard}
                  >
                    <Icon name="check-circle" size="lg" color="#fff" />
                    <Text style={styles.celebrationTitle}>{t('dailyBriefing.allComplete')}</Text>
                    <Text style={styles.celebrationSubtitle}>+50 XP</Text>
                  </LinearGradient>
                </Animated.View>
              )}

              <View style={{ height: spacing['2xl'] }} />
            </>
          )}
        </ScrollView>
      </SafeAreaView>
    </ScreenErrorBoundary>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.dark.bg },
  scrollContent: { padding: spacing.base, paddingTop: 100 },
  skeletonContainer: { gap: spacing.md },
  greeting: {
    fontFamily: fonts.headingBold,
    fontSize: fontSize.xl,
    color: colors.text.primary,
    marginBottom: spacing.xs,
  },
  hijriDate: {
    fontFamily: fonts.body,
    fontSize: fontSize.sm,
    color: colors.gold,
    marginBottom: spacing.lg,
  },
  progressCard: {
    borderRadius: radius.lg,
    padding: spacing.base,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.active.emerald20,
  },
  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  progressTitle: {
    fontFamily: fonts.bodyBold,
    fontSize: fontSize.base,
    color: colors.text.primary,
  },
  bonusXPText: {
    fontFamily: fonts.body,
    fontSize: fontSize.xs,
    color: colors.gold,
  },
  progressBarBg: {
    height: 6,
    borderRadius: radius.full,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  progressBarFill: {
    height: 6,
    borderRadius: radius.full,
    backgroundColor: colors.emerald,
  },
  card: {
    borderRadius: radius.lg,
    padding: spacing.base,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.active.white6,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  cardTitle: {
    flex: 1,
    fontFamily: fonts.bodyBold,
    fontSize: fontSize.base,
    color: colors.text.primary,
  },
  cardPlayBtn: {
    width: 32,
    height: 32,
    borderRadius: radius.full,
    backgroundColor: colors.active.white5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  prayerTimesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  prayerTimeItem: {
    width: '30%',
    alignItems: 'center',
    paddingVertical: spacing.xs,
  },
  prayerName: {
    fontFamily: fonts.body,
    fontSize: fontSize.xs,
    color: colors.text.secondary,
    textTransform: 'capitalize',
    marginBottom: 2,
  },
  prayerTime: {
    fontFamily: fonts.bodyBold,
    fontSize: fontSize.sm,
    color: colors.text.primary,
  },
  arabicText: {
    fontFamily: fonts.arabic,
    fontSize: fontSize.lg,
    color: colors.text.primary,
    textAlign: 'right',
    lineHeight: 36,
    marginBottom: spacing.sm,
  },
  transliterationText: {
    fontFamily: fonts.body,
    fontSize: fontSize.sm,
    color: colors.text.secondary,
    fontStyle: 'italic',
    marginBottom: spacing.xs,
  },
  contentText: {
    fontFamily: fonts.body,
    fontSize: fontSize.sm,
    color: colors.text.secondary,
    lineHeight: 22,
    marginBottom: spacing.sm,
  },
  sourceText: {
    fontFamily: fonts.body,
    fontSize: fontSize.xs,
    color: colors.text.tertiary,
  },
  surahRef: {
    fontFamily: fonts.bodyBold,
    fontSize: fontSize.sm,
    color: colors.gold,
    marginBottom: spacing.xs,
  },
  dhikrContainer: { alignItems: 'center', marginTop: spacing.sm },
  dhikrButton: {
    width: 120,
    height: 120,
    borderRadius: radius.full,
    backgroundColor: colors.active.emerald15,
    borderWidth: 3,
    borderColor: colors.emerald,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  dhikrButtonComplete: {
    backgroundColor: colors.active.emerald30,
    borderColor: colors.gold,
  },
  dhikrCount: {
    fontFamily: fonts.headingBold,
    fontSize: 36,
    color: colors.text.primary,
  },
  dhikrTarget: {
    fontFamily: fonts.body,
    fontSize: fontSize.sm,
    color: colors.text.secondary,
  },
  dhikrProgressBg: {
    width: '100%',
    height: 4,
    borderRadius: radius.full,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  dhikrProgressFill: {
    height: 4,
    borderRadius: radius.full,
    backgroundColor: colors.emerald,
  },
  dhikrCompleteText: {
    fontFamily: fonts.bodyBold,
    fontSize: fontSize.sm,
    color: colors.emerald,
    marginTop: spacing.xs,
  },
  dhikrPhrase: {
    fontFamily: fonts.body,
    fontSize: fontSize.base,
    color: colors.text.primary,
    textAlign: 'center',
    marginBottom: spacing.xs,
  },
  completeBadge: {
    backgroundColor: colors.active.emerald20,
    borderRadius: radius.full,
    padding: 4,
  },
  tapBadge: {
    backgroundColor: colors.active.gold15,
    borderRadius: radius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  tapBadgeText: {
    fontFamily: fonts.body,
    fontSize: fontSize.xs,
    color: colors.gold,
  },
  reflectionPrompt: {
    fontFamily: fonts.body,
    fontSize: fontSize.sm,
    color: colors.text.secondary,
    marginBottom: spacing.sm,
  },
  reflectionInput: {
    fontFamily: fonts.body,
    fontSize: fontSize.base,
    color: colors.text.primary,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: radius.md,
    padding: spacing.md,
    minHeight: 80,
    textAlignVertical: 'top',
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.dark.border,
  },
  reflectionSubmit: {
    backgroundColor: colors.emerald,
    borderRadius: radius.full,
    paddingVertical: spacing.sm,
    alignItems: 'center',
  },
  reflectionSubmitDisabled: { opacity: 0.4 },
  reflectionSubmitText: {
    fontFamily: fonts.bodyBold,
    fontSize: fontSize.sm,
    color: '#fff',
  },
  reflectionComplete: {
    fontFamily: fonts.bodyBold,
    fontSize: fontSize.base,
    color: colors.emerald,
    textAlign: 'center',
    paddingVertical: spacing.md,
  },
  celebrationCard: {
    borderRadius: radius.lg,
    padding: spacing.xl,
    alignItems: 'center',
    gap: spacing.sm,
  },
  celebrationTitle: {
    fontFamily: fonts.headingBold,
    fontSize: fontSize.lg,
    color: '#fff',
  },
  celebrationSubtitle: {
    fontFamily: fonts.bodyBold,
    fontSize: fontSize.md,
    color: 'rgba(255,255,255,0.8)',
  },
});
