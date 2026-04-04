import { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  Dimensions,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Icon } from '@/components/ui/Icon';
import { GlassHeader } from '@/components/ui/GlassHeader';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { BottomSheet, BottomSheetItem } from '@/components/ui/BottomSheet';
import { BrandedRefreshControl } from '@/components/ui/BrandedRefreshControl';
import { ScreenErrorBoundary } from '@/components/ui/ScreenErrorBoundary';
import { colors, spacing, radius, fontSize, fonts } from '@/theme';
import { useContextualHaptic } from '@/hooks/useContextualHaptic';
import { useTranslation } from '@/hooks/useTranslation';
import { useThemeColors } from '@/hooks/useThemeColors';
import { showToast } from '@/components/ui/Toast';
import { islamicApi } from '@/services/islamicApi';
import type { QuranReadingPlan } from '@/types/islamic';

const { width } = Dimensions.get('window');
const RING_SIZE = 180;
const RING_STROKE = 10;

interface PlanOption {
  type: '30day' | '60day' | '90day';
  days: number;
  pagesPerDay: number;
}

const PLAN_OPTIONS: PlanOption[] = [
  { type: '30day', days: 30, pagesPerDay: 20 },
  { type: '60day', days: 60, pagesPerDay: 10 },
  { type: '90day', days: 90, pagesPerDay: 7 },
];

function PlanCard({
  option,
  onSelect,
  t,
}: {
  option: PlanOption;
  onSelect: (type: string) => void;
  t: (key: string, params?: Record<string, string | number>) => string;
}) {
  const tc = useThemeColors();
  const styles = useMemo(() => createStyles(tc), [tc]);
  return (
    <Pressable accessibilityRole="button" onPress={() => onSelect(option.type)}>
      <LinearGradient
        colors={['rgba(10,123,79,0.25)', 'rgba(200,150,62,0.1)']}
        style={styles.planCard}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      >
        <Text style={styles.planDays}>{t(`quranPlan.${option.type}`)}</Text>
        <Text style={styles.planPages}>
          {t('quranPlan.pagesPerDay', { count: option.pagesPerDay })}
        </Text>
        <View style={styles.planStartRow}>
          <Text style={styles.planStartText}>{t('quranPlan.startPlan')}</Text>
          <Icon name="chevron-right" size="xs" color={colors.emerald} />
        </View>
      </LinearGradient>
    </Pressable>
  );
}

function ProgressRing({
  current,
  total,
  size,
  strokeWidth,
}: {
  current: number;
  total: number;
  size: number;
  strokeWidth: number;
}) {
  const tc = useThemeColors();
  const styles = useMemo(() => createStyles(tc), [tc]);
  const progress = Math.min(current / total, 1);
  const percent = Math.round(progress * 100);
  const circumference = (size - strokeWidth) * Math.PI;
  const strokeDashoffset = circumference * (1 - progress);

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      {/* Background ring */}
      <View
        style={[
          styles.ringBg,
          {
            width: size,
            height: size,
            borderRadius: radius.full,
            borderWidth: strokeWidth,
          },
        ]}
      />
      {/* Progress arc via a gradient overlay trick */}
      <LinearGradient
        colors={[colors.emerald, colors.goldLight]}
        style={[
          styles.ringProgress,
          {
            width: size,
            height: size,
            borderRadius: radius.full,
            borderWidth: strokeWidth,
            borderColor: 'transparent',
          },
        ]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      />
      {/* Center content */}
      <View style={[styles.ringCenter, { width: size - strokeWidth * 2, height: size - strokeWidth * 2, borderRadius: (size - strokeWidth * 2) / 2 }]}>
        <Text style={styles.ringPercent}>{percent}%</Text>
      </View>
    </View>
  );
}

function HeatMapRow({ days }: { days: number[] }) {
  const tc = useThemeColors();
  const styles = useMemo(() => createStyles(tc), [tc]);
  return (
    <View style={styles.heatMapRow}>
      {days.map((value, index) => (
        <View
          key={index}
          style={[
            styles.heatMapDot,
            {
              backgroundColor:
                value === 0
                  ? tc.surface
                  : value === 1
                    ? 'rgba(10,123,79,0.4)'
                    : colors.emerald,
            },
          ]}
        />
      ))}
    </View>
  );
}

function HistoryItem({ plan, t }: { plan: QuranReadingPlan; t: (key: string, params?: Record<string, string | number>) => string }) {
  const tc = useThemeColors();
  const styles = useMemo(() => createStyles(tc), [tc]);
  const startDate = new Date(plan.startDate).toLocaleDateString();
  const endDate = new Date(plan.endDate).toLocaleDateString();

  return (
    <LinearGradient
      colors={colors.gradient.cardDark}
      style={styles.historyItem}
    >
      <View style={styles.historyRow}>
        <Icon name="check-circle" size="sm" color={colors.gold} />
        <View style={styles.historyInfo}>
          <Text style={styles.historyPlanType}>{t(`quranPlan.${plan.planType}`)}</Text>
          <Text style={styles.historyDates}>{startDate} - {endDate}</Text>
        </View>
      </View>
    </LinearGradient>
  );
}

function LoadingSkeleton() {
  const tc = useThemeColors();
  const styles = useMemo(() => createStyles(tc), [tc]);
  return (
    <View style={styles.skeletonContainer}>
      <Skeleton.Rect width={width - spacing.base * 2} height={200} borderRadius={radius.lg} />
      <View style={{ height: spacing.lg }} />
      <Skeleton.Rect width={width - spacing.base * 2} height={120} borderRadius={radius.lg} />
      <View style={{ height: spacing.lg }} />
      <Skeleton.Rect width={width - spacing.base * 2} height={80} borderRadius={radius.lg} />
    </View>
  );
}

function QuranReadingPlanContent() {
  const tc = useThemeColors();
  const styles = useMemo(() => createStyles(tc), [tc]);
  const router = useRouter();
  const haptic = useContextualHaptic();
  const { t, isRTL } = useTranslation();
  const queryClient = useQueryClient();
  const [markSheetVisible, setMarkSheetVisible] = useState(false);
  const [deleteSheetVisible, setDeleteSheetVisible] = useState(false);

  const {
    data: activePlan,
    isLoading: loadingActive,
    refetch: refetchActive,
  } = useQuery({
    queryKey: ['quran-plan', 'active'],
    queryFn: () => islamicApi.getActiveReadingPlan(),
  });

  const {
    data: historyData,
    isLoading: loadingHistory,
    refetch: refetchHistory,
  } = useQuery({
    queryKey: ['quran-plan', 'history'],
    queryFn: () => islamicApi.getReadingPlanHistory(),
  });

  const [refreshing, setRefreshing] = useState(false);

  const createMutation = useMutation({
    mutationFn: (planType: string) => islamicApi.createReadingPlan(planType),
    onSuccess: () => {
      haptic.success();
      queryClient.invalidateQueries({ queryKey: ['quran-plan'] });
    },
    onError: () => {
      showToast({ message: t('common.error'), variant: 'error' });
      haptic.error();
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ planId, data }: { planId: string; data: { currentJuz?: number; currentPage?: number; isComplete?: boolean } }) =>
      islamicApi.updateReadingPlan(planId, data),
    onSuccess: () => {
      haptic.tick();
      queryClient.invalidateQueries({ queryKey: ['quran-plan'] });
    },
    onError: () => {
      showToast({ message: t('common.error'), variant: 'error' });
      haptic.error();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (planId: string) => islamicApi.deleteReadingPlan(planId),
    onSuccess: () => {
      haptic.navigate();
      queryClient.invalidateQueries({ queryKey: ['quran-plan'] });
    },
    onError: () => {
      showToast({ message: t('common.error'), variant: 'error' });
      haptic.error();
    },
  });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([refetchActive(), refetchHistory()]);
    setRefreshing(false);
  }, [refetchActive, refetchHistory]);

  const handleCreatePlan = useCallback(
    (planType: string) => {
      if (createMutation.isPending) return;
      haptic.navigate();
      createMutation.mutate(planType);
    },
    [haptic, createMutation],
  );

  const handleMarkJuz = useCallback(() => {
    const plan = activePlan as QuranReadingPlan | null | undefined;
    if (!plan) return;
    const nextJuz = Math.min((plan.currentJuz || 0) + 1, 30);
    const nextPage = Math.min(nextJuz * 20, 604);
    const isComplete = nextJuz >= 30;
    updateMutation.mutate({
      planId: plan.id,
      data: { currentJuz: nextJuz, currentPage: nextPage, isComplete },
    });
    setMarkSheetVisible(false);
  }, [activePlan, updateMutation]);

  const handleMarkPage = useCallback(() => {
    const plan = activePlan as QuranReadingPlan | null | undefined;
    if (!plan) return;
    const dailyTarget = PLAN_OPTIONS.find(o => o.type === plan.planType)?.pagesPerDay ?? 7;
    const nextPage = Math.min((plan.currentPage || 0) + dailyTarget, 604);
    const nextJuz = Math.ceil(nextPage / 20);
    const isComplete = nextPage >= 604;
    updateMutation.mutate({
      planId: plan.id,
      data: { currentJuz: nextJuz, currentPage: nextPage, isComplete },
    });
    setMarkSheetVisible(false);
  }, [activePlan, updateMutation]);

  const handleDeletePlan = useCallback(() => {
    const plan = activePlan as QuranReadingPlan | null | undefined;
    if (!plan) return;
    setDeleteSheetVisible(false);
    Alert.alert(
      t('quranPlan.deletePlan'),
      t('quranPlan.deleteConfirm'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('quranPlan.deletePlan'), style: 'destructive', onPress: () => deleteMutation.mutate(plan.id) },
      ],
    );
  }, [activePlan, deleteMutation, t]);

  const renderPlanOptionItem = useCallback(
    ({ item, index }: { item: PlanOption; index: number }) => (
      <Animated.View entering={FadeInUp.delay(index * 100).duration(400)}>
        <PlanCard option={item} onSelect={handleCreatePlan} t={t} />
      </Animated.View>
    ),
    [handleCreatePlan, t],
  );

  const renderHistoryPlanItem = useCallback(
    ({ item }: { item: QuranReadingPlan }) => <HistoryItem plan={item} t={t} />,
    [t],
  );

  const historyPlans = (historyData as { data?: QuranReadingPlan[] } | undefined)?.data ?? [];
  const plan = activePlan as QuranReadingPlan | null | undefined;

  // Heat map data derived from plan progress — shows reading consistency
  // TODO: Fetch actual daily reading history from API when endpoint is available
  const heatMapDays = useMemo(() => {
    if (!plan) return Array.from({ length: 30 }, () => 0);
    const startDate = new Date(plan.startDate);
    const now = new Date();
    const daysSinceStart = Math.floor((now.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
    const currentPage = plan.currentPage || 0;
    const planOption = PLAN_OPTIONS.find(o => o.type === plan.planType);
    const pagesPerDay = planOption?.pagesPerDay ?? 7;
    // Estimate which days had reading based on progress
    return Array.from({ length: 30 }, (_, i) => {
      const dayIndex = 29 - i; // 0 = today, 29 = 30 days ago
      if (dayIndex > daysSinceStart) return 0; // Before plan started
      const expectedPages = (daysSinceStart - dayIndex) * pagesPerDay;
      if (currentPage >= expectedPages) return 2; // On track
      if (currentPage >= expectedPages * 0.5) return 1; // Partial
      return 0;
    });
  }, [plan]);

  if (loadingActive) {
    return (
      <SafeAreaView style={styles.container}>
        <GlassHeader
          title={t('quranPlan.title')}
          leftAction={{ icon: 'arrow-left', onPress: () => router.back() }}
        />
        <LoadingSkeleton />
      </SafeAreaView>
    );
  }

  // No active plan — show picker
  if (!plan) {
    return (
      <SafeAreaView style={styles.container}>
        <GlassHeader
          title={t('quranPlan.title')}
          leftAction={{ icon: 'arrow-left', onPress: () => router.back() }}
        />
        <FlatList
          data={PLAN_OPTIONS}
          keyExtractor={(item) => item.type}
          refreshControl={
            <BrandedRefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
          contentContainerStyle={styles.listContent}
          ListHeaderComponent={
            <Animated.View entering={FadeInUp.duration(400)}>
              <Text style={styles.sectionTitle}>{t('quranPlan.choosePlan')}</Text>
            </Animated.View>
          }
          renderItem={renderPlanOptionItem}
          ListFooterComponent={
            <>
              <View style={{ height: spacing.xl }} />
              <Text style={styles.sectionTitle}>{t('quranPlan.history')}</Text>
              {loadingHistory ? (
                <Skeleton.Rect width={width - spacing.base * 2} height={60} borderRadius={radius.lg} />
              ) : historyPlans.length === 0 ? (
                <EmptyState
                  icon="layers"
                  title={t('quranPlan.noHistory')}
                />
              ) : (
                historyPlans.map((p) => (
                  <HistoryItem key={p.id} plan={p} t={t} />
                ))
              )}
              <View style={{ height: spacing.xxl }} />
            </>
          }
        />
      </SafeAreaView>
    );
  }

  // Active plan — show dashboard
  const juzProgress = plan.currentJuz || 0;
  const pageProgress = plan.currentPage || 0;
  const percentComplete = Math.round((pageProgress / 604) * 100);
  const dailyTarget = PLAN_OPTIONS.find(o => o.type === plan.planType)?.pagesPerDay ?? 7;

  return (
    <SafeAreaView style={styles.container}>
      <GlassHeader
        title={t('quranPlan.title')}
        leftAction={{ icon: 'arrow-left', onPress: () => router.back() }}
        rightAction={{ icon: 'trash', onPress: () => setDeleteSheetVisible(true) }}
      />

      <FlatList
        data={historyPlans}
        keyExtractor={(item) => item.id}
        refreshControl={
          <BrandedRefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={
          <>
            {/* Progress Ring */}
            <Animated.View entering={FadeInUp.duration(500)} style={styles.ringContainer}>
              <ProgressRing
                current={pageProgress}
                total={604}
                size={RING_SIZE}
                strokeWidth={RING_STROKE}
              />
            </Animated.View>

            {/* Progress Info */}
            <Animated.View entering={FadeInUp.delay(100).duration(400)}>
              <Text style={styles.progressText}>
                {t('quranPlan.progress', { percent: percentComplete })}
              </Text>
            </Animated.View>

            {/* Juz + Page Display */}
            <Animated.View entering={FadeInUp.delay(150).duration(400)} style={styles.statsRow}>
              <LinearGradient
                colors={colors.gradient.cardDark}
                style={styles.statCard}
              >
                <Icon name="layers" size="sm" color={colors.emerald} />
                <Text style={styles.statValue}>
                  {t('quranPlan.currentJuz', { juz: juzProgress })}
                </Text>
              </LinearGradient>
              <LinearGradient
                colors={colors.gradient.cardDark}
                style={styles.statCard}
              >
                <Icon name="layers" size="sm" color={colors.gold} />
                <Text style={styles.statValue}>
                  {t('quranPlan.currentPage', { page: pageProgress })}
                </Text>
              </LinearGradient>
            </Animated.View>

            {/* Daily Target */}
            <Animated.View entering={FadeInUp.delay(200).duration(400)}>
              <LinearGradient
                colors={['rgba(10,123,79,0.15)', 'rgba(10,123,79,0.05)']}
                style={styles.dailyTarget}
              >
                <Icon name="clock" size="sm" color={colors.emerald} />
                <Text style={styles.dailyTargetText}>
                  {t('quranPlan.pagesPerDay', { count: dailyTarget })}
                </Text>
              </LinearGradient>
            </Animated.View>

            {/* Mark Reading Button */}
            <Animated.View entering={FadeInUp.delay(250).duration(400)}>
              <Pressable
                accessibilityLabel={t('accessibility.confirm')}
                accessibilityRole="button"
                onPress={() => setMarkSheetVisible(true)}
               
              >
                <LinearGradient
                  colors={[colors.emerald, colors.emeraldDark]}
                  style={styles.markButton}
                >
                  <Icon name="check" size="sm" color="#FFF" />
                  <Text style={styles.markButtonText}>
                    {t('quranPlan.markReading')}
                  </Text>
                </LinearGradient>
              </Pressable>
            </Animated.View>

            {/* Heat Map */}
            <Animated.View entering={FadeInUp.delay(300).duration(400)}>
              <LinearGradient
                colors={colors.gradient.cardDark}
                style={styles.heatMapCard}
              >
                <HeatMapRow days={heatMapDays} />
              </LinearGradient>
            </Animated.View>

            {/* History Header */}
            <Text style={styles.sectionTitle}>{t('quranPlan.history')}</Text>
          </>
        }
        renderItem={renderHistoryPlanItem}
        ListEmptyComponent={
          loadingHistory ? (
            <Skeleton.Rect width={width - spacing.base * 2} height={60} borderRadius={radius.lg} />
          ) : (
            <EmptyState icon="layers" title={t('quranPlan.noHistory')} />
          )
        }
        ListFooterComponent={<View style={{ height: spacing.xxl }} />}
      />

      {/* Mark Reading Bottom Sheet */}
      <BottomSheet visible={markSheetVisible} onClose={() => setMarkSheetVisible(false)}>
        <BottomSheetItem
          label={t('quranPlan.currentJuz', { juz: (juzProgress || 0) + 1 })}
          icon={<Icon name="check" size="sm" color={colors.emerald} />}
          onPress={handleMarkJuz}
        />
        <BottomSheetItem
          label={t('quranPlan.pagesPerDay', { count: dailyTarget })}
          icon={<Icon name="layers" size="sm" color={colors.gold} />}
          onPress={handleMarkPage}
        />
      </BottomSheet>

      {/* Delete Confirmation Bottom Sheet */}
      <BottomSheet visible={deleteSheetVisible} onClose={() => setDeleteSheetVisible(false)}>
        <BottomSheetItem
          label={t('quranPlan.deletePlan')}
          icon={<Icon name="trash" size="sm" color={colors.error} />}
          onPress={handleDeletePlan}
          destructive
        />
      </BottomSheet>
    </SafeAreaView>
  );
}

export default function QuranReadingPlanScreen() {
  return (
    <ScreenErrorBoundary>
      <QuranReadingPlanContent />
    </ScreenErrorBoundary>
  );
}

const createStyles = (tc: ReturnType<typeof useThemeColors>) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: tc.bg,
  },
  listContent: {
    paddingTop: 100,
    paddingHorizontal: spacing.base,
    paddingBottom: spacing.xxl,
  },
  skeletonContainer: {
    paddingTop: 100,
    paddingHorizontal: spacing.base,
  },
  sectionTitle: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSize.lg,
    color: tc.text.primary,
    marginBottom: spacing.md,
    marginTop: spacing.sm,
  },
  // Plan Cards
  planCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.active.white6,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  planDays: {
    fontFamily: fonts.heading,
    fontSize: fontSize.xl,
    color: tc.text.primary,
    marginBottom: spacing.xs,
  },
  planPages: {
    fontFamily: fonts.body,
    fontSize: fontSize.base,
    color: tc.text.secondary,
    marginBottom: spacing.md,
  },
  planStartRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  planStartText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSize.sm,
    color: colors.emerald,
  },
  // Progress Ring
  ringContainer: {
    alignItems: 'center',
    marginVertical: spacing.lg,
  },
  ringBg: {
    position: 'absolute',
    borderColor: tc.surface,
  },
  ringProgress: {
    position: 'absolute',
  },
  ringCenter: {
    position: 'absolute',
    backgroundColor: tc.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringPercent: {
    fontFamily: fonts.heading,
    fontSize: 36,
    color: tc.text.primary,
  },
  progressText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSize.md,
    color: colors.emerald,
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  // Stats
  statsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  statCard: {
    flex: 1,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.active.white6,
    padding: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  statValue: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSize.base,
    color: tc.text.primary,
  },
  // Daily Target
  dailyTarget: {
    borderRadius: radius.lg,
    padding: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  dailyTargetText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSize.base,
    color: colors.emerald,
  },
  // Mark Button
  markButton: {
    borderRadius: radius.lg,
    paddingVertical: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  markButtonText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSize.base,
    color: '#FFFFFF',
  },
  // Heat Map
  heatMapCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.active.white6,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  heatMapRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    justifyContent: 'center',
  },
  heatMapDot: {
    width: 14,
    height: 14,
    borderRadius: radius.sm,
  },
  // History
  historyItem: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.active.white6,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  historyInfo: {
    flex: 1,
  },
  historyPlanType: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSize.base,
    color: tc.text.primary,
  },
  historyDates: {
    fontFamily: fonts.body,
    fontSize: fontSize.sm,
    color: tc.text.tertiary,
    marginTop: spacing.xs,
  },
});
