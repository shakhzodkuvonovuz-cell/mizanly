import { useState, useCallback, useEffect, useMemo } from 'react';
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
import Animated, { FadeInUp, useSharedValue, useAnimatedStyle, withSpring } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { Icon } from '@/components/ui/Icon';
import { GlassHeader } from '@/components/ui/GlassHeader';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { colors, spacing, radius, fontSize, fonts } from '@/theme';
import { useHaptic } from '@/hooks/useHaptic';

const { width } = Dimensions.get('window');

interface DailyGoal {
  id: string;
  icon: string;
  label: string;
  completed: boolean;
}

interface PrayerTime {
  name: string;
  time: string;
  isCurrent?: boolean;
  isHighlighted?: boolean;
}

const RAMADAN_SCHEDULE: PrayerTime[] = [
  { name: 'Suhoor ends (Fajr)', time: '5:23 AM', isHighlighted: true },
  { name: 'Sunrise', time: '6:45 AM' },
  { name: 'Dhuhr', time: '12:30 PM' },
  { name: 'Asr', time: '3:45 PM' },
  { name: 'Iftar (Maghrib)', time: '6:12 PM', isHighlighted: true },
  { name: 'Isha', time: '7:35 PM' },
  { name: 'Taraweeh', time: '8:00 PM', isHighlighted: true },
];

const INITIAL_GOALS: DailyGoal[] = [
  { id: 'quran', icon: 'book-open', label: 'Read 1 Juz of Quran', completed: false },
  { id: 'dhikr', icon: 'circle', label: 'Make Dhikr 100x', completed: true },
  { id: 'sadaqah', icon: 'gift', label: 'Give Sadaqah', completed: false },
  { id: 'taraweeh', icon: 'moon', label: 'Pray Taraweeh', completed: false },
];

function CountdownDisplay({
  label,
  time,
  icon,
  iconColor,
  isUrgent,
}: {
  label: string;
  time: string;
  icon: string;
  iconColor: string;
  isUrgent?: boolean;
}) {
  const pulseAnim = useSharedValue(1);

  useEffect(() => {
    if (isUrgent) {
      pulseAnim.value = withSpring(1.02, { damping: 10, stiffness: 100 });
    }
  }, [isUrgent, pulseAnim]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulseAnim.value }],
  }));

  return (
    <Animated.View style={[styles.countdownCard, isUrgent && styles.countdownCardUrgent, animatedStyle]}>
      <LinearGradient
        colors={['rgba(45,53,72,0.4)', 'rgba(28,35,51,0.2)']}
        style={styles.countdownGradient}
      >
        <LinearGradient
          colors={[
            isUrgent ? 'rgba(200,150,62,0.2)' : 'rgba(10,123,79,0.2)',
            isUrgent ? 'rgba(200,150,62,0.05)' : 'rgba(10,123,79,0.05)',
          ]}
          style={styles.countdownIconBg}
        >
          <Icon name={icon as any} size="sm" color={iconColor} />
        </LinearGradient>

        <Text style={styles.countdownLabel}>{label}</Text>
        <Text style={[styles.countdownTime, isUrgent && styles.countdownTimeUrgent]}>{time}</Text>

        {/* Glow effect for urgent */}
        {isUrgent && (
          <View style={styles.urgentGlow}>
            <LinearGradient
              colors={['rgba(200,150,62,0.3)', 'transparent']}
              style={styles.glowGradient}
            />
          </View>
        )}
      </LinearGradient>
    </Animated.View>
  );
}

function ScheduleItem({ prayer, index }: { prayer: PrayerTime; index: number }) {
  return (
    <Animated.View entering={FadeInUp.delay(index * 50).duration(300)} style={styles.scheduleItem}>
      <View style={styles.scheduleIconContainer}>
        <Icon name="clock" size="xs" color={prayer.isCurrent ? colors.emerald : colors.text.tertiary} />
      </View>
      <View style={styles.scheduleContent}>
        <Text
          style={[
            styles.scheduleName,
            prayer.isHighlighted && styles.scheduleNameHighlighted,
            prayer.isCurrent && styles.scheduleNameCurrent,
          ]}
        >
          {prayer.name}
        </Text>
        <Text style={[styles.scheduleTime, prayer.isCurrent && styles.scheduleTimeCurrent]}>
          {prayer.time}
        </Text>
      </View>
      {prayer.isCurrent && (
        <LinearGradient colors={[colors.emerald, colors.emeraldLight]} style={styles.currentBadge}>
          <Text style={styles.currentBadgeText}>Now</Text>
        </LinearGradient>
      )}
    </Animated.View>
  );
}

function GoalItem({
  goal,
  onToggle,
  index,
}: {
  goal: DailyGoal;
  onToggle: () => void;
  index: number;
}) {
  const haptic = useHaptic();

  return (
    <Animated.View entering={FadeInUp.delay(200 + index * 60).duration(300)}>
      <TouchableOpacity
        onPress={() => {
          haptic.light();
          onToggle();
        }}
        activeOpacity={0.8}
        style={styles.goalItem}
      >
        <LinearGradient
          colors={[
            goal.completed ? 'rgba(10,123,79,0.15)' : 'rgba(45,53,72,0.4)',
            goal.completed ? 'rgba(10,123,79,0.05)' : 'rgba(28,35,51,0.2)',
          ]}
          style={styles.goalGradient}
        >
          <LinearGradient
            colors={[
              goal.completed ? 'rgba(10,123,79,0.3)' : 'rgba(10,123,79,0.2)',
              goal.completed ? 'rgba(200,150,62,0.1)' : 'rgba(10,123,79,0.05)',
            ]}
            style={styles.goalIconBg}
          >
            <Icon name={goal.icon as any} size="sm" color={goal.completed ? colors.emerald : colors.text.secondary} />
          </LinearGradient>

          <Text
            style={[
              styles.goalLabel,
              goal.completed && styles.goalLabelCompleted,
            ]}
          >
            {goal.label}
          </Text>

          <View style={styles.checkContainer}>
            {goal.completed ? (
              <LinearGradient colors={[colors.emerald, colors.emeraldLight]} style={styles.checkCircle}>
                <Icon name="check" size="xs" color={colors.text.primary} />
              </LinearGradient>
            ) : (
              <View style={styles.uncheckCircle} />
            )}
          </View>
        </LinearGradient>
      </TouchableOpacity>
    </Animated.View>
  );
}

export default function RamadanModeScreen() {
  const router = useRouter();
  const haptic = useHaptic();
  const [refreshing, setRefreshing] = useState(false);
  const [currentDay, setCurrentDay] = useState(15);
  const [goals, setGoals] = useState<DailyGoal[]>(INITIAL_GOALS);

  // Mock countdown times
  const [iftarCountdown, setIftarCountdown] = useState('02:34:15');
  const [suhoorCountdown, setSuhoorCountdown] = useState('08:12:44');

  const progress = (currentDay / 30) * 100;
  const isIftarUrgent = true; // Mock: less than 30 minutes

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 1500);
  }, []);

  const toggleGoal = useCallback((id: string) => {
    setGoals(prev =>
      prev.map(g => (g.id === id ? { ...g, completed: !g.completed } : g))
    );
  }, []);

  const handleDhikrPress = useCallback(() => {
    haptic.light();
    // Navigate to dhikr counter
  }, [haptic]);

  // Generate 30-day grid
  const fastingGrid = useMemo(() => {
    return Array.from({ length: 30 }, (_, i) => ({
      day: i + 1,
      completed: i < 22,
      isToday: i + 1 === currentDay,
    }));
  }, [currentDay]);

  return (
    <SafeAreaView style={styles.container}>
      <GlassHeader
        title="Ramadan"
        leftAction={{ icon: 'arrow-left', onPress: () => router.back() }}
        rightActions={[{ icon: 'moon', onPress: () => {}, accessibilityLabel: 'Ramadan' }]}
      />

      <ScrollView
        refreshControl={<RefreshControl tintColor={colors.emerald} refreshing={refreshing} onRefresh={onRefresh} />}
        contentContainerStyle={styles.scrollContent}
      >
        {/* Hero Card */}
        <Animated.View entering={FadeInUp.duration(400)}>
          <LinearGradient
            colors={['rgba(45,53,72,0.6)', 'rgba(28,35,51,0.3)']}
            style={styles.heroCard}
          >
            {/* Moon Icon */}
            <LinearGradient
              colors={['rgba(200,150,62,0.2)', 'rgba(200,150,62,0.1)']}
              style={styles.heroIconBg}
            >
              <Icon name="moon" size="md" color={colors.gold} />
            </LinearGradient>

            {/* Title */}
            <Text style={styles.heroTitle}>Ramadan 1446 AH</Text>

            {/* Day Counter */}
            <View style={styles.dayCounter}>
              <Text style={styles.dayText}>Day {currentDay} of 30</Text>
              <View style={styles.progressContainer}>
                <View style={styles.progressTrack}>
                  <View style={[styles.progressFill, { width: `${progress}%` }]} />
                </View>
              </View>
            </View>

            {/* Hijri Date */}
            <Text style={styles.hijriDate}>١٥ رمضان ١٤٤٦</Text>
          </LinearGradient>
        </Animated.View>

        {/* Dual Countdown Timers */}
        <View style={styles.countdownRow}>
          <CountdownDisplay
            label="Iftar in"
            time={iftarCountdown}
            icon="sun"
            iconColor={colors.gold}
            isUrgent={isIftarUrgent}
          />
          <CountdownDisplay
            label="Suhoor ends in"
            time={suhoorCountdown}
            icon="moon"
            iconColor={colors.emerald}
          />
        </View>

        {/* Today's Schedule */}
        <Animated.View entering={FadeInUp.delay(150).duration(400)}>
          <Text style={styles.sectionTitle}>Today's Schedule</Text>
          <LinearGradient
            colors={['rgba(45,53,72,0.4)', 'rgba(28,35,51,0.2)']}
            style={styles.scheduleCard}
          >
            {RAMADAN_SCHEDULE.map((prayer, index) => (
              <ScheduleItem key={prayer.name} prayer={prayer} index={index} />
            ))}
          </LinearGradient>
        </Animated.View>

        {/* Fasting Tracker */}
        <Animated.View entering={FadeInUp.delay(250).duration(400)}>
          <Text style={styles.sectionTitle}>Fasting Tracker</Text>
          <LinearGradient
            colors={['rgba(45,53,72,0.4)', 'rgba(28,35,51,0.2)']}
            style={styles.trackerCard}
          >
            {/* Day Grid */}
            <View style={styles.dayGrid}>
              {fastingGrid.map((day, index) => (
                <View key={day.day} style={styles.dayCell}>
                  <LinearGradient
                    colors={
                      day.completed
                        ? [colors.emerald, colors.emeraldDark]
                        : day.isToday
                        ? ['rgba(200,150,62,0.3)', 'rgba(200,150,62,0.1)']
                        : ['rgba(45,53,72,0.6)', 'rgba(28,35,51,0.3)']
                    }
                    style={[
                      styles.dayCircle,
                      day.isToday && styles.dayCircleToday,
                    ]}
                  >
                    <Text
                      style={[
                        styles.dayNumber,
                        day.completed && styles.dayNumberCompleted,
                        day.isToday && styles.dayNumberToday,
                      ]}
                    >
                      {day.day}
                    </Text>
                  </LinearGradient>
                </View>
              ))}
            </View>

            {/* Summary */}
            <View style={styles.trackerSummary}>
              <Text style={styles.trackerSummaryText}>22 days fasted</Text>
              <Text style={styles.trackerRemaining}>8 days remaining</Text>
            </View>
          </LinearGradient>
        </Animated.View>

        {/* Daily Goals */}
        <Animated.View entering={FadeInUp.delay(350).duration(400)}>
          <Text style={styles.sectionTitle}>Daily Goals</Text>
          <LinearGradient
            colors={['rgba(45,53,72,0.4)', 'rgba(28,35,51,0.2)']}
            style={styles.goalsCard}
          >
            {goals.map((goal, index) => (
              <GoalItem
                key={goal.id}
                goal={goal}
                onToggle={() => toggleGoal(goal.id)}
                index={index}
              />
            ))}
          </LinearGradient>
        </Animated.View>

        {/* Bottom spacing */}
        <View style={{ height: spacing.xxl }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const DAY_CELL_SIZE = (width - 64 - 50) / 6; // 6 columns with gaps

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.dark.bg,
  },
  scrollContent: {
    padding: spacing.base,
    paddingTop: 100,
  },
  heroCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    padding: spacing.lg,
    marginBottom: spacing.lg,
    alignItems: 'center',
  },
  heroIconBg: {
    width: 56,
    height: 56,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  heroTitle: {
    fontFamily: fonts.heading,
    fontSize: fontSize.xl,
    color: colors.text.primary,
    marginBottom: spacing.md,
  },
  dayCounter: {
    width: '100%',
    marginBottom: spacing.sm,
  },
  dayText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSize.base,
    color: colors.text.secondary,
    marginBottom: spacing.sm,
    textAlign: 'center',
  },
  progressContainer: {
    marginBottom: spacing.sm,
  },
  progressTrack: {
    height: 8,
    backgroundColor: colors.dark.surface,
    borderRadius: radius.full,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: colors.gold,
    borderRadius: radius.full,
  },
  hijriDate: {
    fontFamily: fonts.body,
    fontSize: fontSize.md,
    color: colors.gold,
    writingDirection: 'rtl',
  },
  countdownRow: {
    flexDirection: 'row',
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  countdownCard: {
    flex: 1,
    borderRadius: radius.lg,
    overflow: 'hidden',
  },
  countdownCardUrgent: {
    shadowColor: colors.gold,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
  },
  countdownGradient: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    padding: spacing.md,
    alignItems: 'center',
    position: 'relative',
    overflow: 'hidden',
  },
  countdownIconBg: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  countdownLabel: {
    fontFamily: fonts.body,
    fontSize: fontSize.sm,
    color: colors.text.secondary,
    marginBottom: spacing.xs,
  },
  countdownTime: {
    fontFamily: fonts.heading,
    fontSize: fontSize.lg,
    color: colors.text.primary,
  },
  countdownTimeUrgent: {
    color: colors.gold,
  },
  urgentGlow: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    pointerEvents: 'none',
  },
  glowGradient: {
    width: '100%',
    height: '100%',
  },
  sectionTitle: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSize.md,
    color: colors.text.primary,
    marginBottom: spacing.md,
    marginTop: spacing.sm,
  },
  scheduleCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  scheduleItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.03)',
  },
  scheduleIconContainer: {
    width: 28,
    height: 28,
    borderRadius: radius.sm,
    backgroundColor: 'rgba(45,53,72,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  scheduleContent: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  scheduleName: {
    fontFamily: fonts.body,
    fontSize: fontSize.base,
    color: colors.text.secondary,
  },
  scheduleNameHighlighted: {
    fontFamily: fonts.bodySemiBold,
    color: colors.text.primary,
  },
  scheduleNameCurrent: {
    color: colors.emerald,
  },
  scheduleTime: {
    fontFamily: fonts.body,
    fontSize: fontSize.sm,
    color: colors.text.tertiary,
  },
  scheduleTimeCurrent: {
    fontFamily: fonts.bodySemiBold,
    color: colors.emerald,
  },
  currentBadge: {
    borderRadius: radius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    marginLeft: spacing.sm,
  },
  currentBadgeText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSize.xs,
    color: colors.text.primary,
  },
  trackerCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    padding: spacing.lg,
    marginBottom: spacing.lg,
  },
  dayGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginBottom: spacing.md,
  },
  dayCell: {
    width: DAY_CELL_SIZE,
    height: DAY_CELL_SIZE,
  },
  dayCircle: {
    width: '100%',
    height: '100%',
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayCircleToday: {
    borderWidth: 2,
    borderColor: colors.gold,
  },
  dayNumber: {
    fontFamily: fonts.body,
    fontSize: fontSize.xs,
    color: colors.text.secondary,
  },
  dayNumberCompleted: {
    color: colors.text.primary,
    fontFamily: fonts.bodySemiBold,
  },
  dayNumberToday: {
    color: colors.gold,
    fontFamily: fonts.bodySemiBold,
  },
  trackerSummary: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  trackerSummaryText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSize.base,
    color: colors.emerald,
  },
  trackerRemaining: {
    fontFamily: fonts.body,
    fontSize: fontSize.sm,
    color: colors.text.tertiary,
  },
  goalsCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  goalItem: {
    marginBottom: spacing.sm,
  },
  goalGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.md,
    padding: spacing.sm,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  goalIconBg: {
    width: 36,
    height: 36,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  goalLabel: {
    fontFamily: fonts.body,
    fontSize: fontSize.base,
    color: colors.text.primary,
    flex: 1,
  },
  goalLabelCompleted: {
    textDecorationLine: 'line-through',
    color: colors.text.tertiary,
  },
  checkContainer: {
    marginLeft: spacing.sm,
  },
  checkCircle: {
    width: 24,
    height: 24,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  uncheckCircle: {
    width: 24,
    height: 24,
    borderRadius: radius.full,
    borderWidth: 2,
    borderColor: colors.dark.border,
  },
});
