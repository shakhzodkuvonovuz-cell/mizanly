import { useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BrandedRefreshControl } from '@/components/ui/BrandedRefreshControl';
import { useRouter } from 'expo-router';
import Animated, { FadeInUp, FadeIn } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { useQuery } from '@tanstack/react-query';
import { Icon } from '@/components/ui/Icon';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { GlassHeader } from '@/components/ui/GlassHeader';
import { ScreenErrorBoundary } from '@/components/ui/ScreenErrorBoundary';
import { colors, spacing, fontSize, radius, fonts, shadow } from '@/theme';
import { gamificationApi } from '@/services/api';
import { useTranslation } from '@/hooks/useTranslation';
import { useThemeColors } from '@/hooks/useThemeColors';
import { rtlFlexRow, rtlTextAlign } from '@/utils/rtl';
import type { IconName } from '@/components/ui/Icon';

interface Streak {
  type: string;
  currentDays: number;
  longestDays: number;
  isActive: boolean;
  lastActivityDate: string;
}

interface StreakDay {
  date: string;
  active: boolean;
}

const STREAK_META: Record<string, { icon: IconName; color: string }> = {
  posting: { icon: 'edit', color: colors.emerald },
  engagement: { icon: 'heart', color: '#F85149' },
  quran: { icon: 'globe', color: colors.gold },
  dhikr: { icon: 'repeat', color: colors.extended.purple },
  learning: { icon: 'trending-up', color: colors.extended.blue },
};

const MILESTONES = [7, 30, 100];

function StreakCard({
  streak,
  index,
  isRTL,
}: {
  streak: Streak;
  index: number;
  isRTL: boolean;
}) {
  const tc = useThemeColors();
  const styles = useMemo(() => createStyles(tc), [tc]);
  const { t } = useTranslation();
  const meta = STREAK_META[streak.type] ?? { icon: 'trending-up' as IconName, color: colors.emerald };
  const translationKey = `gamification.streaks.${streak.type}` as const;

  return (
    <Animated.View entering={FadeInUp.delay(index * 100).duration(500)}>
      <LinearGradient
        colors={
          streak.isActive
            ? [`${meta.color}20`, `${meta.color}08`]
            : ['rgba(248,81,73,0.08)', 'rgba(248,81,73,0.02)']
        }
        style={[
          styles.streakCard,
          streak.isActive
            ? { borderColor: meta.color, ...shadow.glow, shadowColor: meta.color }
            : { borderColor: colors.error },
        ]}
      >
        <View style={[styles.streakHeader, { flexDirection: rtlFlexRow(isRTL) }]}>
          <LinearGradient
            colors={[`${meta.color}30`, `${meta.color}10`]}
            style={styles.streakIconBg}
          >
            <Icon name={meta.icon} size="md" color={meta.color} />
          </LinearGradient>
          <View style={styles.streakInfo}>
            <Text style={[styles.streakType, { textAlign: rtlTextAlign(isRTL) }]}>
              {t(translationKey)}
            </Text>
            <Text style={[styles.streakLongest, { textAlign: rtlTextAlign(isRTL) }]}>
              {t('gamification.streaks.longest', { count: streak.longestDays })}
            </Text>
          </View>
          <View style={styles.streakCountWrap}>
            <Text style={[styles.streakCount, { color: streak.isActive ? meta.color : colors.error }]}>
              {streak.currentDays}
            </Text>
            <Text style={styles.streakUnit}>
              {t('gamification.streaks.days', { count: streak.currentDays }).replace(String(streak.currentDays), '').trim()}
            </Text>
          </View>
        </View>

        {!streak.isActive && (
          <View style={[styles.brokenRow, { flexDirection: rtlFlexRow(isRTL) }]}>
            <Icon name="x" size="xs" color={colors.error} />
            <Text style={styles.brokenText}>
              {t('gamification.streaks.broken')}
            </Text>
          </View>
        )}

        {streak.isActive && (
          <View style={[styles.keepGoingRow, { flexDirection: rtlFlexRow(isRTL) }]}>
            <Icon name="check-circle" size="xs" color={meta.color} />
            <Text style={[styles.keepGoingText, { color: meta.color }]}>
              {t('gamification.streaks.keepGoing')}
            </Text>
          </View>
        )}
      </LinearGradient>
    </Animated.View>
  );
}

function HeatmapCalendar({ days, isRTL }: { days: StreakDay[]; isRTL: boolean }) {
  const tc = useThemeColors();
  const styles = useMemo(() => createStyles(tc), [tc]);
  const { t } = useTranslation();
  const { width: windowWidth } = useWindowDimensions();
  const last30 = days.slice(-30);
  const cellSize = Math.floor((windowWidth - spacing.base * 2 - spacing.xs * 6) / 7) - 2;

  return (
    <Animated.View entering={FadeInUp.delay(500).duration(500)}>
      <LinearGradient
        colors={colors.gradient.cardDark}
        style={styles.heatmapCard}
      >
        <Text style={[styles.sectionTitle, { textAlign: rtlTextAlign(isRTL) }]}>
          {t('gamification.streaks.last30Days')}
        </Text>
        <View style={styles.heatmapGrid}>
          {last30.map((day, i) => (
            <View
              key={day.date}
              style={[
                styles.heatmapCell,
                {
                  width: cellSize,
                  height: cellSize,
                  backgroundColor: day.active
                    ? colors.emerald
                    : tc.surface,
                },
              ]}
              accessibilityLabel={`${day.date}: ${day.active ? t('gamification.streaks.active') : t('gamification.streaks.inactive')}`}
            />
          ))}
        </View>
        <View style={[styles.heatmapLegend, { flexDirection: rtlFlexRow(isRTL) }]}>
          <Text style={styles.legendText}>{t('gamification.streaks.inactive')}</Text>
          <View style={[styles.legendCell, { backgroundColor: tc.surface }]} />
          <View style={[styles.legendCell, { backgroundColor: colors.emerald, opacity: 0.4 }]} />
          <View style={[styles.legendCell, { backgroundColor: colors.emerald }]} />
          <Text style={styles.legendText}>{t('gamification.streaks.active')}</Text>
        </View>
      </LinearGradient>
    </Animated.View>
  );
}

function MilestoneBadges({
  streaks,
  isRTL,
}: {
  streaks: Streak[];
  isRTL: boolean;
}) {
  const tc = useThemeColors();
  const styles = useMemo(() => createStyles(tc), [tc]);
  const { t } = useTranslation();
  const maxStreak = Math.max(...streaks.map((s) => s.longestDays), 0);

  return (
    <Animated.View entering={FadeInUp.delay(600).duration(500)}>
      <LinearGradient
        colors={colors.gradient.cardDark}
        style={styles.milestonesCard}
      >
        <Text style={[styles.sectionTitle, { textAlign: rtlTextAlign(isRTL) }]}>
          {t('gamification.streaks.milestones')}
        </Text>
        <View style={[styles.milestonesRow, { flexDirection: rtlFlexRow(isRTL) }]}>
          {MILESTONES.map((m) => {
            const achieved = maxStreak >= m;
            return (
              <View key={m} style={styles.milestoneItem}>
                <LinearGradient
                  colors={
                    achieved
                      ? ['rgba(200,150,62,0.3)', 'rgba(200,150,62,0.1)']
                      : ['rgba(45,53,72,0.5)', 'rgba(28,35,51,0.3)']
                  }
                  style={[
                    styles.milestoneBadge,
                    achieved && styles.milestoneBadgeAchieved,
                  ]}
                >
                  <Icon
                    name={achieved ? 'check-circle' : 'lock'}
                    size="md"
                    color={achieved ? colors.gold : tc.text.tertiary}
                  />
                </LinearGradient>
                <Text
                  style={[
                    styles.milestoneLabel,
                    achieved && styles.milestoneLabelAchieved,
                  ]}
                >
                  {t('gamification.streaks.milestoneDays', { count: m })}
                </Text>
              </View>
            );
          })}
        </View>
      </LinearGradient>
    </Animated.View>
  );
}

function LoadingSkeleton() {
  const tc = useThemeColors();
  const styles = useMemo(() => createStyles(tc), [tc]);
  return (
    <View style={styles.skeletonContainer}>
      {Array.from({ length: 3 }).map((_, i) => (
        <View key={i} style={styles.skeletonCard}>
          <View style={styles.skeletonRow}>
            <Skeleton.Circle size={48} />
            <View style={{ flex: 1, gap: spacing.xs }}>
              <Skeleton.Text width="60%" />
              <Skeleton.Text width="40%" />
            </View>
            <Skeleton.Rect width={48} height={40} borderRadius={radius.sm} />
          </View>
        </View>
      ))}
      <Skeleton.Rect width="100%" height={160} borderRadius={radius.lg} />
      <Skeleton.Rect width="100%" height={100} borderRadius={radius.lg} />
    </View>
  );
}

function StreaksScreen() {
  const tc = useThemeColors();
  const styles = useMemo(() => createStyles(tc), [tc]);
  const { t, isRTL } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const { data, isLoading, isError, refetch, isRefetching } = useQuery({
    queryKey: ['streaks'],
    queryFn: async () => {
      const res = await gamificationApi.getStreaks() as { streaks: Streak[]; calendar: StreakDay[] };
      return res;
    },
    staleTime: 1000 * 60 * 2,
  });

  const streaks = data?.streaks ?? [];
  const calendar = data?.calendar ?? [];

  return (
    <View style={styles.container}>
      <GlassHeader
        title={t('gamification.streaks.title')}
        leftAction={{
          icon: 'arrow-left',
          onPress: () => router.back(),
          accessibilityLabel: t('common.back'),
        }}
      />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingTop: insets.top + 60, paddingBottom: insets.bottom + spacing['2xl'] }]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <BrandedRefreshControl
            refreshing={isRefetching}
            onRefresh={refetch}
          />
        }
      >
        {isLoading ? (
          <LoadingSkeleton />
        ) : isError ? (
          <EmptyState
            icon="alert-circle"
            title={t('common.error')}
            subtitle={t('common.tryAgain')}
            actionLabel={t('common.retry')}
            onAction={() => refetch()}
          />
        ) : streaks.length === 0 ? (
          <EmptyState
            icon="trending-up"
            title={t('gamification.streaks.title')}
            subtitle={t('gamification.streaks.startHint')}
            actionLabel={t('common.retry')}
            onAction={() => refetch()}
          />
        ) : (
          <>
            {/* Streak cards */}
            {streaks.map((streak, i) => (
              <StreakCard
                key={streak.type}
                streak={streak}
                index={i}
                isRTL={isRTL}
              />
            ))}

            {/* Calendar heatmap */}
            {calendar.length > 0 && (
              <HeatmapCalendar days={calendar} isRTL={isRTL} />
            )}

            {/* Milestones */}
            <MilestoneBadges streaks={streaks} isRTL={isRTL} />
          </>
        )}
      </ScrollView>
    </View>
  );
}

export default function StreaksScreenWrapper() {
  return (
    <ScreenErrorBoundary>
      <StreaksScreen />
    </ScreenErrorBoundary>
  );
}

const createStyles = (tc: ReturnType<typeof useThemeColors>) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: tc.bg,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: spacing.base,
    gap: spacing.md,
  },
  // Streak card
  streakCard: {
    borderRadius: radius.lg,
    padding: spacing.base,
    borderWidth: 1,
    gap: spacing.sm,
  },
  streakHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  streakIconBg: {
    width: 48,
    height: 48,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  streakInfo: {
    flex: 1,
    gap: 2,
  },
  streakType: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSize.base,
    color: tc.text.primary,
  },
  streakLongest: {
    fontFamily: fonts.body,
    fontSize: fontSize.xs,
    color: tc.text.secondary,
  },
  streakCountWrap: {
    alignItems: 'center',
  },
  streakCount: {
    fontFamily: fonts.headingBold,
    fontSize: fontSize['2xl'],
    color: colors.emerald,
  },
  streakUnit: {
    fontFamily: fonts.body,
    fontSize: fontSize.xs,
    color: tc.text.tertiary,
  },
  brokenRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingTop: spacing.xs,
  },
  brokenText: {
    fontFamily: fonts.bodyMedium,
    fontSize: fontSize.xs,
    color: colors.error,
  },
  keepGoingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingTop: spacing.xs,
  },
  keepGoingText: {
    fontFamily: fonts.bodyMedium,
    fontSize: fontSize.xs,
  },
  // Heatmap
  heatmapCard: {
    borderRadius: radius.lg,
    padding: spacing.base,
    borderWidth: 0.5,
    borderColor: tc.borderLight,
    gap: spacing.md,
  },
  sectionTitle: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSize.md,
    color: tc.text.primary,
  },
  heatmapGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  heatmapCell: {
    borderRadius: radius.sm,
  },
  heatmapLegend: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  legendText: {
    fontFamily: fonts.body,
    fontSize: fontSize.xs,
    color: tc.text.tertiary,
  },
  legendCell: {
    width: 14,
    height: 14,
    borderRadius: 3,
  },
  // Milestones
  milestonesCard: {
    borderRadius: radius.lg,
    padding: spacing.base,
    borderWidth: 0.5,
    borderColor: tc.borderLight,
    gap: spacing.md,
  },
  milestonesRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  milestoneItem: {
    alignItems: 'center',
    gap: spacing.sm,
  },
  milestoneBadge: {
    width: 56,
    height: 56,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 0.5,
    borderColor: tc.borderLight,
  },
  milestoneBadgeAchieved: {
    borderColor: colors.gold,
    borderWidth: 1.5,
  },
  milestoneLabel: {
    fontFamily: fonts.bodyMedium,
    fontSize: fontSize.xs,
    color: tc.text.tertiary,
  },
  milestoneLabelAchieved: {
    color: colors.gold,
    fontFamily: fonts.bodySemiBold,
  },
  // Skeleton
  skeletonContainer: {
    gap: spacing.md,
  },
  skeletonCard: {
    padding: spacing.base,
    borderRadius: radius.lg,
    backgroundColor: tc.bgCard,
  },
  skeletonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
});
