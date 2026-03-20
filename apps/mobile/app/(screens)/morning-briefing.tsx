import { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, Pressable, ScrollView, RefreshControl, TextInput,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as Location from 'expo-location';
import { Icon } from '@/components/ui/Icon';
import { GlassHeader } from '@/components/ui/GlassHeader';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { ScreenErrorBoundary } from '@/components/ui/ScreenErrorBoundary';
import { useTranslation } from '@/hooks/useTranslation';
import { useHaptic } from '@/hooks/useHaptic';
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

function DhikrCounter({ target, initialCount, onComplete }: { target: number; initialCount: number; onComplete: () => void }) {
  const [count, setCount] = useState(initialCount);
  const haptic = useHaptic();
  const { t } = useTranslation();
  const isComplete = count >= target;

  const handlePress = useCallback(() => {
    if (isComplete) return;
    haptic.light();
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
        <Text style={styles.dhikrCount}>{count}</Text>
        <Text style={styles.dhikrTarget}>/ {target}</Text>
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
  const haptic = useHaptic();
  const queryClient = useQueryClient();
  const [reflectionText, setReflectionText] = useState('');

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
      return res.data as DailyBriefing;
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
      <SafeAreaView style={styles.container} edges={['top']}>
        <GlassHeader
          title={t('dailyBriefing.title')}
          leftAction={{
            icon: <Icon name="arrow-left" size="md" color={colors.text.primary} />,
            onPress: () => router.back(),
            accessibilityLabel: t('common.goBack'),
          }}
        />

        <ScrollView
          contentContainerStyle={styles.scrollContent}
          refreshControl={
            <RefreshControl
              refreshing={briefingQuery.isRefetching}
              onRefresh={handleRefresh}
              tintColor={colors.emerald}
            />
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
                <Text style={styles.greeting}>{greeting}</Text>
                <Text style={styles.hijriDate}>{briefing.hijriDate}</Text>
              </Animated.View>

              {/* Progress overview */}
              <Animated.View entering={FadeInUp.delay(100).duration(400)}>
                <LinearGradient
                  colors={['rgba(10,123,79,0.15)', 'rgba(10,123,79,0.05)']}
                  style={styles.progressCard}
                >
                  <View style={styles.progressHeader}>
                    <Text style={styles.progressTitle}>
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
                    colors={['rgba(45,53,72,0.4)', 'rgba(28,35,51,0.2)']}
                    style={styles.card}
                  >
                    <View style={styles.cardHeader}>
                      <Icon name="clock" size="sm" color={colors.gold} />
                      <Text style={styles.cardTitle}>{t('islamic.prayerTimes')}</Text>
                    </View>
                    <View style={styles.prayerTimesGrid}>
                      {Object.entries(briefing.prayerTimes).map(([name, time]) => (
                        <View key={name} style={styles.prayerTimeItem}>
                          <Text style={styles.prayerName}>{name}</Text>
                          <Text style={styles.prayerTime}>{time}</Text>
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
                    <Text style={styles.cardTitle}>{t('dailyBriefing.hadithOfTheDay')}</Text>
                  </View>
                  {briefing.hadithOfTheDay.arabic ? (
                    <Text style={styles.arabicText}>{briefing.hadithOfTheDay.arabic}</Text>
                  ) : null}
                  <Text style={styles.contentText}>{briefing.hadithOfTheDay.text}</Text>
                  <Text style={styles.sourceText}>
                    — {briefing.hadithOfTheDay.source} ({briefing.hadithOfTheDay.narrator})
                  </Text>
                </LinearGradient>
              </Animated.View>

              {/* Dua of the Day */}
              <Animated.View entering={FadeInUp.delay(400).duration(400)}>
                <LinearGradient
                  colors={['rgba(45,53,72,0.4)', 'rgba(28,35,51,0.2)']}
                  style={styles.card}
                >
                  <View style={styles.cardHeader}>
                    <Icon name="heart" size="sm" color={colors.emerald} />
                    <Text style={styles.cardTitle}>{t('dailyBriefing.duaOfTheDay')}</Text>
                  </View>
                  <Text style={styles.arabicText}>{briefing.duaOfTheDay.arabic}</Text>
                  <Text style={styles.transliterationText}>{briefing.duaOfTheDay.transliteration}</Text>
                  <Text style={styles.contentText}>{briefing.duaOfTheDay.translation}</Text>
                  <Text style={styles.sourceText}>— {briefing.duaOfTheDay.source}</Text>
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
                    <Text style={styles.cardTitle}>{t('dailyBriefing.dhikrChallenge')}</Text>
                    {completedTasks.includes('dhikr') && (
                      <View style={styles.completeBadge}>
                        <Icon name="check" size="xs" color={colors.emerald} />
                      </View>
                    )}
                  </View>
                  <Text style={styles.dhikrPhrase}>
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
                    colors={['rgba(45,53,72,0.4)', 'rgba(28,35,51,0.2)']}
                    style={styles.card}
                  >
                    <View style={styles.cardHeader}>
                      <Icon name="layers" size="sm" color={colors.gold} />
                      <Text style={styles.cardTitle}>{t('dailyBriefing.ayahOfTheDay')}</Text>
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
                    <Text style={styles.contentText}>{briefing.ayahOfTheDay.translation}</Text>
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
                    <Text style={styles.cardTitle}>{t('dailyBriefing.dailyReflection')}</Text>
                    {completedTasks.includes('reflection') && (
                      <View style={styles.completeBadge}>
                        <Icon name="check" size="xs" color={colors.emerald} />
                      </View>
                    )}
                  </View>
                  {!completedTasks.includes('reflection') ? (
                    <>
                      <Text style={styles.reflectionPrompt}>
                        {t('dailyBriefing.gratefulPrompt')}
                      </Text>
                      <TextInput
                        style={styles.reflectionInput}
                        value={reflectionText}
                        onChangeText={setReflectionText}
                        placeholder={t('dailyBriefing.gratefulPrompt')}
                        placeholderTextColor={colors.text.tertiary}
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
    borderColor: 'rgba(10,123,79,0.2)',
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
    borderColor: 'rgba(255,255,255,0.06)',
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
    backgroundColor: 'rgba(10,123,79,0.15)',
    borderWidth: 3,
    borderColor: colors.emerald,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  dhikrButtonComplete: {
    backgroundColor: 'rgba(10,123,79,0.3)',
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
    backgroundColor: 'rgba(10,123,79,0.2)',
    borderRadius: radius.full,
    padding: 4,
  },
  tapBadge: {
    backgroundColor: 'rgba(200,150,62,0.15)',
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
