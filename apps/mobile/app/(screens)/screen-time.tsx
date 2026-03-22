import { useState, useCallback, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Pressable, RefreshControl,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Icon } from '@/components/ui/Icon';
import { Skeleton } from '@/components/ui/Skeleton';
import { GlassHeader } from '@/components/ui/GlassHeader';
import { BottomSheet, BottomSheetItem } from '@/components/ui/BottomSheet';
import { ScreenErrorBoundary } from '@/components/ui/ScreenErrorBoundary';
import { colors, spacing, fontSize, radius, fontSizeExt } from '@/theme';
import { settingsApi } from '@/services/api';
import { useStore } from '@/store';
import { useHaptic } from '@/hooks/useHaptic';
import { useTranslation } from '@/hooks/useTranslation';
import { useThemeColors } from '@/hooks/useThemeColors';
import { rtlFlexRow, rtlTextAlign, rtlMargin } from '@/utils/rtl';

type DailyLog = { date: string; totalSeconds: number; sessions: number };

type ScreenTimeStats = {
  daily: DailyLog[];
  totalSeconds: number;
  totalSessions: number;
  avgDailySeconds: number;
  limitMinutes: number | null;
};

const LIMIT_VALUES: Array<number | null> = [null, 15, 30, 60, 120, 180, 240, 360, 480];

function getLimitLabel(value: number | null, t: (key: string, opts?: Record<string, unknown>) => string): string {
  if (value === null) return t('screenTime.noLimit');
  if (value >= 60) {
    const h = Math.floor(value / 60);
    return t('screenTime.hours', { count: h });
  }
  return t('screenTime.minutes', { count: value });
}

const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function formatLimitLabel(limitMinutes: number | null, t: (key: string) => string): string {
  if (limitMinutes === null) return t('screenTime.noLimit');
  if (limitMinutes >= 60) {
    const h = Math.floor(limitMinutes / 60);
    const m = limitMinutes % 60;
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  }
  return `${limitMinutes}m`;
}

function getWeekDays(): string[] {
  const days: string[] = [];
  const today = new Date();
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    days.push(d.toISOString().split('T')[0]);
  }
  return days;
}

function BarChart({ daily, isRTL }: { daily: DailyLog[]; isRTL: boolean }) {
  const tc = useThemeColors();
  const styles = createStyles(tc);
  const { t } = useTranslation();
  const weekDays = getWeekDays();
  const todayStr = weekDays[weekDays.length - 1];
  const dataMap = new Map(daily.map(d => [d.date, d.totalSeconds]));
  const maxSeconds = Math.max(...weekDays.map(d => dataMap.get(d) ?? 0), 1);
  const BAR_MAX_HEIGHT = 120;

  return (
    <View style={[styles.chartContainer, { flexDirection: rtlFlexRow(isRTL) }]}>
      {weekDays.map((dateStr) => {
        const secs = dataMap.get(dateStr) ?? 0;
        const height = Math.max((secs / maxSeconds) * BAR_MAX_HEIGHT, 4);
        const isToday = dateStr === todayStr;
        const dayOfWeek = new Date(dateStr + 'T12:00:00').getDay();
        const label = t(`screenTime.days.${DAY_KEYS[dayOfWeek]}`);

        return (
          <View key={dateStr} style={styles.barColumn}>
            <Text style={[styles.barValue, isToday && styles.barValueToday]}>
              {secs > 0 ? formatDuration(secs) : ''}
            </Text>
            <View style={styles.barTrack}>
              <LinearGradient
                colors={isToday ? [colors.emerald, colors.extended.greenDark] : [tc.surface, tc.border]}
                start={{ x: 0, y: 0 }}
                end={{ x: 0, y: 1 }}
                style={[styles.bar, { height }]}
              />
            </View>
            <Text style={[styles.barLabel, isToday && styles.barLabelToday]}>{label}</Text>
          </View>
        );
      })}
    </View>
  );
}

function StatCard({ label, value, icon, isRTL }: { label: string; value: string; icon: React.ReactNode; isRTL: boolean }) {
  const tc = useThemeColors();
  const styles = createStyles(tc);
  return (
    <LinearGradient
      colors={colors.gradient.cardDark}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.statCard}
    >
      <View style={[styles.statIconRow, { flexDirection: rtlFlexRow(isRTL) }]}>
        {icon}
        <Text style={[styles.statLabel, { textAlign: rtlTextAlign(isRTL) }]}>{label}</Text>
      </View>
      <Text style={[styles.statValue, { textAlign: rtlTextAlign(isRTL) }]}>{value}</Text>
    </LinearGradient>
  );
}

export default function ScreenTimeScreen() {
  const tc = useThemeColors();
  const styles = createStyles(tc);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const haptic = useHaptic();
  const { t, isRTL } = useTranslation();
  const queryClient = useQueryClient();
  const { screenTimeLimitMinutes, setScreenTimeLimitMinutes } = useStore();

  const [limitSheetVisible, setLimitSheetVisible] = useState(false);
  const [takeBreakEnabled, setTakeBreakEnabled] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Restore persisted take-a-break setting
  useEffect(() => {
    AsyncStorage.getItem('screen-time-take-break').then((v) => {
      if (v === 'true') setTakeBreakEnabled(true);
    });
  }, []);

  const statsQuery = useQuery({
    queryKey: ['screen-time-stats'],
    queryFn: () => settingsApi.getScreenTimeStats(),
  });

  const limitMutation = useMutation({
    mutationFn: (limitMinutes: number | null) => settingsApi.setScreenTimeLimit(limitMinutes),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['screen-time-stats'] });
    },
  });

  const stats: ScreenTimeStats | undefined = statsQuery.data as ScreenTimeStats | undefined;

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await queryClient.invalidateQueries({ queryKey: ['screen-time-stats'] });
    setRefreshing(false);
  }, [queryClient]);

  const handleSetLimit = (value: number | null) => {
    haptic.selection();
    setScreenTimeLimitMinutes(value);
    limitMutation.mutate(value);
    setLimitSheetVisible(false);
  };

  // Today's data
  const todayStr = new Date().toISOString().split('T')[0];
  const todayLog = stats?.daily.find(d => d.date === todayStr);
  const todaySeconds = todayLog?.totalSeconds ?? 0;
  const todaySessions = todayLog?.sessions ?? 0;
  const currentLimit = stats?.limitMinutes ?? screenTimeLimitMinutes;

  if (statsQuery.isLoading) {
    return (
      <ScreenErrorBoundary>
        <View style={styles.container}>
          <GlassHeader
            title={t('screenTime.title')}
            leftAction={{ icon: 'arrow-left', onPress: () => router.back(), accessibilityLabel: t('common.back') }}
          />
          <View style={{ flex: 1, padding: spacing.base, paddingTop: insets.top + 60, gap: spacing.lg }}>
            <Skeleton.Rect width="100%" height={100} />
            <Skeleton.Rect width="100%" height={180} />
            <View style={{ flexDirection: 'row', gap: spacing.md }}>
              <Skeleton.Rect width="48%" height={80} />
              <Skeleton.Rect width="48%" height={80} />
            </View>
            <Skeleton.Rect width="100%" height={60} />
            <Skeleton.Rect width="100%" height={60} />
          </View>
        </View>
      </ScreenErrorBoundary>
    );
  }

  return (
    <ScreenErrorBoundary>
      <View style={styles.container}>
        <GlassHeader
          title={t('screenTime.title')}
          leftAction={{ icon: 'arrow-left', onPress: () => router.back(), accessibilityLabel: t('common.back') }}
        />

        <ScrollView
          style={styles.body}
          contentContainerStyle={[styles.bodyContent, { paddingTop: insets.top + 52 }]}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={colors.emerald}
            />
          }
        >
          {/* Today's Usage */}
          <LinearGradient
            colors={['rgba(10,123,79,0.15)', 'rgba(10,123,79,0.05)']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.todayCard}
          >
            <Text style={[styles.todayLabel, { textAlign: rtlTextAlign(isRTL) }]}>
              {t('screenTime.today')}
            </Text>
            <Text style={[styles.todayTime, { textAlign: rtlTextAlign(isRTL) }]}>
              {formatDuration(todaySeconds)}
            </Text>
            {currentLimit !== null && (
              <View style={[styles.limitBar]}>
                <View style={styles.limitBarTrack}>
                  <LinearGradient
                    colors={
                      todaySeconds >= currentLimit * 60
                        ? [colors.error, '#C53030']
                        : [colors.emerald, colors.extended.greenDark]
                    }
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={[
                      styles.limitBarFill,
                      { width: `${Math.min((todaySeconds / (currentLimit * 60)) * 100, 100)}%` },
                    ]}
                  />
                </View>
                <Text style={styles.limitBarLabel}>
                  {formatLimitLabel(currentLimit, t)} {t('screenTime.dailyLimit').toLowerCase()}
                </Text>
              </View>
            )}
          </LinearGradient>

          {/* Weekly Chart */}
          <Text style={[styles.sectionTitle, { textAlign: rtlTextAlign(isRTL) }]}>
            {t('screenTime.thisWeek')}
          </Text>
          <LinearGradient
            colors={colors.gradient.cardDark}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.chartCard}
          >
            <BarChart daily={stats?.daily ?? []} isRTL={isRTL} />
          </LinearGradient>

          {/* Stats Row */}
          <View style={[styles.statsRow, { flexDirection: rtlFlexRow(isRTL) }]}>
            <StatCard
              label={t('screenTime.avgDaily')}
              value={formatDuration(stats?.avgDailySeconds ?? 0)}
              icon={<Icon name="clock" size="sm" color={colors.emerald} />}
              isRTL={isRTL}
            />
            <StatCard
              label={t('screenTime.sessions')}
              value={String(todaySessions)}
              icon={<Icon name="layers" size="sm" color={colors.gold} />}
              isRTL={isRTL}
            />
          </View>

          {/* Daily Limit */}
          <Text style={[styles.sectionTitle, { textAlign: rtlTextAlign(isRTL) }]}>
            {t('screenTime.dailyLimit')}
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              haptic.light();
              setLimitSheetVisible(true);
            }}
          >
            <LinearGradient
              colors={colors.gradient.cardDark}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.settingRow}
            >
              <View style={[styles.settingRowInner, { flexDirection: rtlFlexRow(isRTL) }]}>
                <LinearGradient
                  colors={['rgba(10,123,79,0.15)', 'rgba(10,123,79,0.05)']}
                  style={styles.settingIcon}
                >
                  <Icon name="clock" size="sm" color={colors.emerald} />
                </LinearGradient>
                <View style={[styles.settingTextWrap, rtlMargin(isRTL, 0, spacing.md)]}>
                  <Text style={[styles.settingLabel, { textAlign: rtlTextAlign(isRTL) }]}>
                    {t('screenTime.setLimit')}
                  </Text>
                  <Text style={[styles.settingHint, { textAlign: rtlTextAlign(isRTL) }]}>
                    {formatLimitLabel(currentLimit, t)}
                  </Text>
                </View>
                <View style={styles.chevronWrap}>
                  <Icon name="chevron-right" size="sm" color={colors.text.tertiary} />
                </View>
              </View>
            </LinearGradient>
          </Pressable>

          {/* Take a Break Reminder */}
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              haptic.light();
              const next = !takeBreakEnabled;
              setTakeBreakEnabled(next);
              AsyncStorage.setItem('screen-time-take-break', String(next));
            }}
          >
            <LinearGradient
              colors={colors.gradient.cardDark}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.settingRow}
            >
              <View style={[styles.settingRowInner, { flexDirection: rtlFlexRow(isRTL) }]}>
                <LinearGradient
                  colors={['rgba(200,150,62,0.15)', 'rgba(200,150,62,0.05)']}
                  style={styles.settingIcon}
                >
                  <Icon name="bell" size="sm" color={colors.gold} />
                </LinearGradient>
                <View style={[styles.settingTextWrap, rtlMargin(isRTL, 0, spacing.md)]}>
                  <Text style={[styles.settingLabel, { textAlign: rtlTextAlign(isRTL) }]}>
                    {t('screenTime.takeBreak')}
                  </Text>
                  <Text style={[styles.settingHint, { textAlign: rtlTextAlign(isRTL) }]}>
                    {t('screenTime.takeBreakHint')}
                  </Text>
                </View>
                <View style={[
                  styles.toggleDot,
                  takeBreakEnabled && styles.toggleDotActive,
                ]} />
              </View>
            </LinearGradient>
          </Pressable>
        </ScrollView>

        {/* Limit Picker BottomSheet */}
        <BottomSheet visible={limitSheetVisible} onClose={() => setLimitSheetVisible(false)}>
          {LIMIT_VALUES.map((value) => (
            <BottomSheetItem
              key={String(value)}
              label={getLimitLabel(value, t)}
              icon={
                <Icon
                  name={currentLimit === value ? 'check-circle' : 'clock'}
                  size="sm"
                  color={currentLimit === value ? colors.emerald : colors.text.secondary}
                />
              }
              onPress={() => handleSetLimit(value)}
            />
          ))}
        </BottomSheet>
      </View>
    </ScreenErrorBoundary>
  );
}

const createStyles = (tc: ReturnType<typeof useThemeColors>) => StyleSheet.create({
  container: { flex: 1, backgroundColor: tc.bg },
  body: { flex: 1 },
  bodyContent: { paddingBottom: 60, paddingHorizontal: spacing.base },

  // Today card
  todayCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.active.emerald20,
    padding: spacing.xl,
    marginBottom: spacing.lg,
    alignItems: 'center',
  },
  todayLabel: {
    color: colors.text.secondary,
    fontSize: fontSize.sm,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: spacing.xs,
  },
  todayTime: {
    color: colors.emerald,
    fontSize: fontSizeExt.jumbo,
    fontWeight: '700',
    letterSpacing: -1,
  },

  // Limit progress bar
  limitBar: {
    width: '100%',
    marginTop: spacing.md,
  },
  limitBarTrack: {
    width: '100%',
    height: 6,
    backgroundColor: tc.surface,
    borderRadius: radius.full,
    overflow: 'hidden',
  },
  limitBarFill: {
    height: '100%',
    borderRadius: radius.full,
  },
  limitBarLabel: {
    color: colors.text.tertiary,
    fontSize: fontSize.xs,
    marginTop: spacing.xs,
    textAlign: 'center',
  },

  // Section title
  sectionTitle: {
    color: colors.text.secondary,
    fontSize: fontSize.xs,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: spacing.sm,
    marginTop: spacing.sm,
  },

  // Chart card
  chartCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(45,53,72,0.3)',
    padding: spacing.base,
    marginBottom: spacing.lg,
  },
  chartContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    height: 170,
    paddingTop: spacing.lg,
  },
  barColumn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
    height: '100%',
  },
  barValue: {
    color: colors.text.tertiary,
    fontSize: fontSizeExt.micro,
    marginBottom: spacing.xs,
    height: 14,
  },
  barValueToday: {
    color: colors.emerald,
    fontWeight: '600',
  },
  barTrack: {
    flex: 1,
    justifyContent: 'flex-end',
    width: '60%',
    maxWidth: 32,
  },
  bar: {
    width: '100%',
    borderRadius: radius.sm,
    minHeight: 4,
  },
  barLabel: {
    color: colors.text.tertiary,
    fontSize: fontSize.xs,
    marginTop: spacing.xs,
  },
  barLabelToday: {
    color: colors.emerald,
    fontWeight: '600',
  },

  // Stats row
  statsRow: {
    flexDirection: 'row',
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  statCard: {
    flex: 1,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(45,53,72,0.3)',
    padding: spacing.base,
  },
  statIconRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  statLabel: {
    color: colors.text.secondary,
    fontSize: fontSize.xs,
    fontWeight: '600',
  },
  statValue: {
    color: colors.text.primary,
    fontSize: fontSize.xl,
    fontWeight: '700',
  },

  // Setting rows
  settingRow: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(45,53,72,0.3)',
    marginBottom: spacing.md,
    overflow: 'hidden',
  },
  settingRowInner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.base,
  },
  settingIcon: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  settingTextWrap: {
    flex: 1,
  },
  settingLabel: {
    color: colors.text.primary,
    fontSize: fontSize.base,
    fontWeight: '500',
  },
  settingHint: {
    color: colors.text.tertiary,
    fontSize: fontSize.xs,
    marginTop: 2,
  },
  chevronWrap: {
    width: 28,
    height: 28,
    borderRadius: radius.sm,
    backgroundColor: 'rgba(45,53,72,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Toggle dot
  toggleDot: {
    width: 24,
    height: 24,
    borderRadius: radius.full,
    borderWidth: 2,
    borderColor: tc.border,
    backgroundColor: 'transparent',
  },
  toggleDotActive: {
    borderColor: colors.emerald,
    backgroundColor: colors.emerald,
  },
});
