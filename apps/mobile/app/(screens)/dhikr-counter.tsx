import { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  Dimensions,
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
import { Icon, type IconName } from '@/components/ui/Icon';
import { GlassHeader } from '@/components/ui/GlassHeader';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { colors, spacing, radius, fontSize, fonts } from '@/theme';
import { useHaptic } from '@/hooks/useHaptic';

const { width } = Dimensions.get('window');

const PRESET_PHRASES = [
  { id: 'subhanallah', latin: 'SubhanAllah', arabic: 'سبحان الله', meaning: 'Glory be to Allah' },
  { id: 'alhamdulillah', latin: 'Alhamdulillah', arabic: 'الحمد لله', meaning: 'Praise be to Allah' },
  { id: 'allahuakbar', latin: 'Allahu Akbar', arabic: 'الله أكبر', meaning: 'Allah is Greatest' },
  { id: 'lailaha', latin: 'La ilaha illAllah', arabic: 'لا إله إلا الله', meaning: 'There is no god but Allah' },
  { id: 'astaghfirullah', latin: 'Astaghfirullah', arabic: 'أستغفر الله', meaning: 'I seek forgiveness from Allah' },
];

const DAILY_GOAL = 33;

interface DailyStats {
  totalCount: number;
  setsCompleted: number;
  streak: number;
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
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.8}>
      <LinearGradient
        colors={
          isSelected
            ? ['rgba(10,123,79,0.3)', 'rgba(200,150,62,0.15)']
            : ['rgba(45,53,72,0.4)', 'rgba(28,35,51,0.2)']
        }
        style={[
          styles.phraseButton,
          isSelected && styles.phraseButtonSelected,
        ]}
      >
        <Text style={[styles.phraseLatin, isSelected && styles.phraseLatinSelected]}>
          {phrase.latin}
        </Text>
        <Text style={styles.phraseArabic}>{phrase.arabic}</Text>
        <Text style={styles.phraseMeaning}>{phrase.meaning}</Text>
      </LinearGradient>
    </TouchableOpacity>
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
        colors={['rgba(45,53,72,0.4)', 'rgba(28,35,51,0.2)']}
        style={styles.statCard}
      >
        <LinearGradient
          colors={['rgba(10,123,79,0.2)', 'rgba(10,123,79,0.05)']}
          style={styles.statIconBg}
        >
          <Icon name={icon} size="sm" color={colors.emerald} />
        </LinearGradient>
        <Text style={styles.statValue}>{value}</Text>
        <Text style={styles.statLabel}>{label}</Text>
      </LinearGradient>
    </Animated.View>
  );
}

export default function DhikrCounterScreen() {
  const router = useRouter();
  const haptic = useHaptic();
  const [refreshing, setRefreshing] = useState(false);
  const [selectedPhrase, setSelectedPhrase] = useState(PRESET_PHRASES[0]);
  const [count, setCount] = useState(0);
  const [hasStarted, setHasStarted] = useState(false);
  const [stats, setStats] = useState<DailyStats>({
    totalCount: 247,
    setsCompleted: 7,
    streak: 12,
  });

  const counterScale = useSharedValue(1);
  const progressWidth = useSharedValue(0);
  const shimmerOpacity = useSharedValue(0);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 1000);
  }, []);

  const handleTap = useCallback(() => {
    haptic.light();
    setCount(prev => prev + 1);
    setStats(prev => ({ ...prev, totalCount: prev.totalCount + 1 }));
    setHasStarted(true);

    // Pulse animation
    counterScale.value = withSequence(
      withSpring(1.05, { damping: 10, stiffness: 400 }),
      withSpring(1, { damping: 15, stiffness: 300 })
    );
  }, [haptic, counterScale]);

  const handleReset = useCallback(() => {
    haptic.medium();
    setCount(0);
    setHasStarted(false);
  }, [haptic]);

  const selectPhrase = useCallback((phrase: typeof PRESET_PHRASES[0]) => {
    haptic.light();
    setSelectedPhrase(phrase);
    setCount(0);
    setHasStarted(false);
  }, [haptic]);

  // Calculate progress
  const progress = Math.min(count / DAILY_GOAL, 1);
  const isComplete = count >= DAILY_GOAL;

  useEffect(() => {
    progressWidth.value = withSpring(progress * 100, { damping: 15, stiffness: 100 });
  }, [progress, progressWidth]);

  useEffect(() => {
    if (isComplete) {
      haptic.success();
      shimmerOpacity.value = withSequence(
        withTiming(1, { duration: 300 }),
        withTiming(0, { duration: 300 }),
        withTiming(1, { duration: 300 }),
        withTiming(0, { duration: 500 })
      );
    }
  }, [isComplete, haptic, shimmerOpacity]);

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
    <SafeAreaView style={styles.container}>
      <GlassHeader
        title="Dhikr Counter"
        leftAction={{ icon: 'arrow-left', onPress: () => router.back() }}
      />

      <ScrollView
        refreshControl={<RefreshControl tintColor={colors.emerald} refreshing={refreshing} onRefresh={onRefresh} />}
        contentContainerStyle={styles.scrollContent}
      >
        {/* Phrase Selector */}
        <Animated.View entering={FadeInUp.duration(400)}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.phraseSelector}
          >
            {PRESET_PHRASES.map((phrase, index) => (
              <PhraseButton
                key={phrase.id}
                phrase={phrase}
                isSelected={selectedPhrase.id === phrase.id}
                onPress={() => selectPhrase(phrase)}
              />
            ))}
          </ScrollView>
        </Animated.View>

        {/* Counter Circle */}
        <Animated.View entering={FadeInUp.delay(100).duration(500)} style={styles.counterContainer}>
          <TouchableOpacity onPress={handleTap} activeOpacity={0.9}>
            <Animated.View style={counterAnimatedStyle}>
              {/* Outer Ring Gradient */}
              <LinearGradient
                colors={[colors.emerald, colors.goldLight]}
                style={styles.counterOuterRing}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
              >
                {/* Inner Circle */}
                <View style={styles.counterInnerCircle}>
                  {/* Count Number */}
                  <Text style={styles.countNumber}>{count}</Text>

                  {/* Arabic Phrase */}
                  <Text style={styles.countArabic}>{selectedPhrase.arabic}</Text>

                  {/* Hint Text */}
                  {!hasStarted && (
                    <Text style={styles.tapHint}>Tap to count</Text>
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
          </TouchableOpacity>

          {/* Reset Button */}
          <TouchableOpacity onPress={handleReset} style={styles.resetButton} activeOpacity={0.8}>
            <LinearGradient
              colors={['rgba(45,53,72,0.6)', 'rgba(28,35,51,0.3)']}
              style={styles.resetButtonGradient}
            >
              <Icon name="circle" size="xs" color={colors.text.tertiary} />
            </LinearGradient>
          </TouchableOpacity>
        </Animated.View>

        {/* Progress Card */}
        <Animated.View entering={FadeInUp.delay(200).duration(400)}>
          <LinearGradient
            colors={['rgba(45,53,72,0.4)', 'rgba(28,35,51,0.2)']}
            style={styles.progressCard}
          >
            <View style={styles.progressHeader}>
              <Text style={styles.progressTitle}>
                {isComplete ? 'Set complete!' : `${count}/${DAILY_GOAL} — Keep going`}
              </Text>
              {isComplete && <Icon name="check-circle" size="sm" color={colors.gold} />}
            </View>

            {/* Progress Bar */}
            <View style={styles.progressBarContainer}>
              <View style={styles.progressBarTrack}>
                <Animated.View
                  style={[
                    styles.progressBarFill,
                    isComplete && styles.progressBarFillComplete,
                    progressAnimatedStyle,
                  ]}
                />
              </View>
            </View>

            <Text style={styles.progressSubtitle}>
              Standard dhikr sets are 33 repetitions
            </Text>
          </LinearGradient>
        </Animated.View>

        {/* Daily Summary */}
        <Animated.View entering={FadeInUp.delay(300).duration(400)}>
          <Text style={styles.summaryTitle}>Daily Summary</Text>
          <View style={styles.statsRow}>
            <StatCard icon="bar-chart-2" label="Total Counts" value={stats.totalCount} delay={350} />
            <StatCard icon="check-circle" label="Sets Done" value={stats.setsCompleted} delay={400} />
            <StatCard icon="trending-up" label="Day Streak" value={stats.streak} delay={450} />
          </View>
        </Animated.View>

        {/* Bottom spacing */}
        <View style={{ height: spacing.xxl }} />
      </ScrollView>
    </SafeAreaView>
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
    borderColor: 'rgba(255,255,255,0.06)',
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
    fontFamily: fonts.body,
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
    fontSize: 48,
    color: colors.text.primary,
    marginBottom: spacing.sm,
  },
  countArabic: {
    fontFamily: fonts.body,
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
    borderColor: 'rgba(255,255,255,0.06)',
  },
  progressCard: {
    marginHorizontal: spacing.base,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
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
    borderColor: 'rgba(255,255,255,0.06)',
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
