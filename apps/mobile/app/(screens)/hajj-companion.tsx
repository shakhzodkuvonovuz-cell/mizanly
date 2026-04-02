import { useState, useCallback, useMemo, useEffect } from 'react';
import {
  View, Text, StyleSheet, Pressable, ScrollView, Share,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, {
  FadeInUp, FadeInDown, useSharedValue, useAnimatedStyle,
  withRepeat, withTiming, withSequence,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Icon } from '@/components/ui/Icon';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { GlassHeader } from '@/components/ui/GlassHeader';
import { BottomSheet, BottomSheetItem } from '@/components/ui/BottomSheet';
import { colors, spacing, radius, fontSize, fonts } from '@/theme';
import { islamicApi } from '@/services/islamicApi';
import type { HajjStep, HajjProgress } from '@/types/islamic';
import { useTranslation } from '@/hooks/useTranslation';
import { useThemeColors } from '@/hooks/useThemeColors';
import { BrandedRefreshControl } from '@/components/ui/BrandedRefreshControl';
import { ScreenErrorBoundary } from '@/components/ui/ScreenErrorBoundary';
import { navigate } from '@/utils/navigation';
import { useContextualHaptic } from '@/hooks/useContextualHaptic';
import { showToast } from '@/components/ui/Toast';

const TOTAL_STEPS = 7;

function PulseCircle({ children, active }: { children: React.ReactNode; active: boolean }) {
  const pulseScale = useSharedValue(1);

  useEffect(() => {
    if (active) {
      pulseScale.value = withRepeat(
        withSequence(
          withTiming(1.15, { duration: 800 }),
          withTiming(1, { duration: 800 }),
        ),
        -1,
        true,
      );
    } else {
      pulseScale.value = withTiming(1, { duration: 200 });
    }
  }, [active, pulseScale]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulseScale.value }],
  }));

  return <Animated.View style={animatedStyle}>{children}</Animated.View>;
}

function HajjCompanionContent() {
  const { t } = useTranslation();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [showResetSheet, setShowResetSheet] = useState(false);
  const [showYearPicker, setShowYearPicker] = useState(false);
  const tc = useThemeColors();
  const haptic = useContextualHaptic();
  const currentYear = new Date().getFullYear();

  const guideQuery = useQuery({
    queryKey: ['hajj-guide'],
    queryFn: () => islamicApi.getHajjGuide(),
  });

  const progressQuery = useQuery({
    queryKey: ['hajj-progress'],
    queryFn: () => islamicApi.getHajjProgress(),
  });

  const createMutation = useMutation({
    mutationFn: (year: number) => islamicApi.createHajjProgress(year),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hajj-progress'] });
      setShowYearPicker(false);
      haptic.success();
    },
    onError: () => {
      showToast({ message: t('common.error'), variant: 'error' });
      haptic.error();
    },
  });

  const resetMutation = useMutation({
    mutationFn: () => {
      const progress = progressQuery.data;
      if (!progress) return Promise.resolve(null);
      return islamicApi.updateHajjProgress(progress.id, {
        currentStep: 0,
        checklistJson: '{}',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hajj-progress'] });
      setShowResetSheet(false);
      haptic.success();
    },
    onError: () => {
      setShowResetSheet(false);
      showToast({ message: t('common.error'), variant: 'error' });
      haptic.error();
    },
  });

  const guide: HajjStep[] = useMemo(() => {
    const raw = guideQuery.data;
    if (!raw) return [];
    return (Array.isArray(raw) ? raw : (raw as Record<string, unknown>).data as HajjStep[] | undefined) ?? [];
  }, [guideQuery.data]);

  const progress: HajjProgress | null = useMemo(() => {
    return (progressQuery.data as HajjProgress | null) ?? null;
  }, [progressQuery.data]);

  const currentStep = progress?.currentStep ?? 0;
  const progressPercent = Math.round((currentStep / TOTAL_STEPS) * 100);

  const onRefresh = useCallback(() => {
    guideQuery.refetch();
    progressQuery.refetch();
  }, [guideQuery, progressQuery]);

  const handleShare = useCallback(async () => {
    try {
      await Share.share({
        message: `${t('hajj.title')}: ${t('hajj.progress', { percent: progressPercent })}`,
      });
    } catch {
      // ignore
    }
  }, [t, progressPercent]);

  const isLoading = guideQuery.isLoading || progressQuery.isLoading;
  const isRefreshing = guideQuery.isRefetching || progressQuery.isRefetching;

  if (isLoading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: tc.bg }]} edges={['top']}>
        <GlassHeader title={t('hajj.title')} showBack />
        <View style={styles.skeletonContainer}>
          <Skeleton.Rect width="100%" height={120} borderRadius={radius.lg} />
          <View style={{ height: spacing.lg }} />
          {[0, 1, 2, 3, 4].map((i) => (
            <View key={i} style={styles.skeletonStep}>
              <Skeleton.Circle size={48} />
              <View style={{ marginStart: spacing.base, flex: 1 }}>
                <Skeleton.Text width="60%" />
                <View style={{ height: spacing.xs }} />
                <Skeleton.Text width="40%" />
              </View>
            </View>
          ))}
        </View>
      </SafeAreaView>
    );
  }

  if (!progress) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: tc.bg }]} edges={['top']}>
        <GlassHeader title={t('hajj.title')} showBack />
        <ScrollView
          contentContainerStyle={styles.centeredContent}
          refreshControl={
            <BrandedRefreshControl refreshing={isRefreshing} onRefresh={onRefresh} />
          }
        >
          <Animated.View entering={FadeInUp.duration(400)}>
            <LinearGradient
              colors={['rgba(10,123,79,0.15)', 'rgba(200,150,62,0.10)']}
              style={styles.startCard}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
            >
              <Icon name="map-pin" size="xl" color={colors.emerald} />
              <Text style={[styles.startTitle, { color: tc.text.primary }]}>{t('hajj.title')}</Text>
              <Text style={[styles.startSubtitle, { color: tc.text.secondary }]}>
                {t('hajj.year')}: {currentYear}
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('hajj.startTracker')}
                style={[styles.startButton, createMutation.isPending && { opacity: 0.6 }]}
                onPress={() => { haptic.tick(); setShowYearPicker(true); }}
                disabled={createMutation.isPending}
              >
                <LinearGradient
                  colors={[colors.emerald, '#0A6B42']}
                  style={styles.startButtonGradient}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                >
                  <Text style={styles.startButtonText}>{t('hajj.startTracker')}</Text>
                </LinearGradient>
              </Pressable>
            </LinearGradient>
          </Animated.View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: tc.bg }]} edges={['top']}>
      <GlassHeader title={t('hajj.title')} showBack />
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <BrandedRefreshControl refreshing={isRefreshing} onRefresh={onRefresh} />
        }
      >
        {/* Progress card */}
        <Animated.View entering={FadeInDown.duration(400)}>
          <LinearGradient
            colors={['rgba(10,123,79,0.15)', 'rgba(200,150,62,0.10)']}
            style={styles.progressCard}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
          >
            <View style={styles.progressHeader}>
              <Text style={[styles.progressDay, { color: tc.text.primary }]}>
                {t('hajj.day', { day: currentStep + 1 })}
              </Text>
              <Text style={[styles.progressYear, { color: tc.text.secondary }]}>
                {t('hajj.year')}: {progress.year}
              </Text>
            </View>
            <View style={styles.progressBarContainer}>
              <View style={[styles.progressBarBg, { backgroundColor: tc.surface }]}>
                <LinearGradient
                  colors={[colors.emerald, colors.gold]}
                  style={[styles.progressBarFill, { width: `${progressPercent}%` }]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                />
              </View>
              <Text style={styles.progressPercent}>
                {t('hajj.progress', { percent: progressPercent })}
              </Text>
            </View>
          </LinearGradient>
        </Animated.View>

        {/* Step timeline */}
        <View style={styles.timeline}>
          {guide.map((step, index) => {
            const isCompleted = index < currentStep;
            const isCurrent = index === currentStep;
            const isLast = index === guide.length - 1;

            return (
              <Animated.View
                key={step.step}
                entering={FadeInUp.delay(index * 80).duration(300)}
              >
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={step.name}
                  style={styles.stepRow}

                  onPress={() =>
                    navigate('/(screens)/hajj-step', { step: step.step })
                  }
                >
                  {/* Timeline line */}
                  {!isLast && (
                    <View
                      style={[
                        styles.timelineLine,
                        {
                          backgroundColor: isCompleted
                            ? colors.emerald
                            : tc.border,
                        },
                      ]}
                    />
                  )}

                  {/* Step circle */}
                  <PulseCircle active={isCurrent}>
                    <View
                      style={[
                        styles.stepCircle, { backgroundColor: tc.surface, borderColor: tc.border },
                        isCompleted && styles.stepCircleCompleted,
                        isCurrent && styles.stepCircleCurrent,
                      ]}
                    >
                      {isCompleted ? (
                        <Icon name="check" size="sm" color="#fff" />
                      ) : (
                        <Text
                          style={[
                            styles.stepNumber,
                            { color: tc.text.secondary },
                            isCurrent && styles.stepNumberCurrent,
                          ]}
                        >
                          {index + 1}
                        </Text>
                      )}
                    </View>
                  </PulseCircle>

                  {/* Step info */}
                  <View style={styles.stepInfo}>
                    <Text style={[styles.stepNameAr, { color: tc.text.primary }]}>{step.nameAr}</Text>
                    <Text style={styles.stepName}>{step.name}</Text>
                    <Text style={[styles.stepDesc, { color: tc.text.tertiary }]} numberOfLines={2}>
                      {step.description}
                    </Text>
                  </View>

                  <Icon
                    name="chevron-right"
                    size="sm"
                    color={tc.text.tertiary}
                  />
                </Pressable>
              </Animated.View>
            );
          })}
        </View>

        {/* Action buttons */}
        <View style={styles.actions}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('hajj.shareProgress')}
            style={styles.shareButton}
            onPress={() => { haptic.send(); handleShare(); }}
          >
            <Icon name="share" size="sm" color={colors.emerald} />
            <Text style={styles.shareButtonText}>
              {t('hajj.shareProgress')}
            </Text>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('hajj.reset')}
            style={styles.resetButton}
            onPress={() => setShowResetSheet(true)}
          >
            <Text style={[styles.resetButtonText, { color: tc.text.tertiary }]}>{t('hajj.reset')}</Text>
          </Pressable>
        </View>

        <View style={{ height: spacing['2xl'] }} />
      </ScrollView>

      <BottomSheet visible={showResetSheet} onClose={() => setShowResetSheet(false)}>
        <BottomSheetItem
          label={t('hajj.reset')}
          icon={<Icon name="trash" size="sm" color={colors.error} />}
          onPress={() => resetMutation.mutate()}
          destructive
        />
        <BottomSheetItem
          label={t('common.cancel')}
          icon={<Icon name="x" size="sm" color={tc.text.secondary} />}
          onPress={() => setShowResetSheet(false)}
        />
      </BottomSheet>

      <BottomSheet visible={showYearPicker} onClose={() => setShowYearPicker(false)}>
        {[currentYear - 1, currentYear, currentYear + 1].map((yr) => (
          <BottomSheetItem
            key={yr}
            label={`${yr}`}
            onPress={() => createMutation.mutate(yr)}
          />
        ))}
      </BottomSheet>
    </SafeAreaView>
  );
}

export default function HajjCompanionScreen() {
  return (
    <ScreenErrorBoundary>
      <HajjCompanionContent />
    </ScreenErrorBoundary>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.dark.bg,
  },
  skeletonContainer: {
    padding: spacing.base,
  },
  skeletonStep: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.base,
  },
  centeredContent: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: spacing.base,
  },
  scrollContent: {
    padding: spacing.base,
  },
  startCard: {
    borderRadius: radius.lg,
    padding: spacing['2xl'],
    alignItems: 'center',
    gap: spacing.md,
  },
  startTitle: {
    fontSize: fontSize.xl,
    fontWeight: '700',
    color: colors.text.primary,
    marginTop: spacing.sm,
  },
  startSubtitle: {
    fontSize: fontSize.base,
    color: colors.text.secondary,
  },
  startButton: {
    marginTop: spacing.base,
    borderRadius: radius.full,
    overflow: 'hidden',
  },
  startButtonGradient: {
    paddingHorizontal: spacing['2xl'],
    paddingVertical: spacing.md,
    borderRadius: radius.full,
  },
  startButtonText: {
    fontSize: fontSize.base,
    fontWeight: '600',
    color: '#fff',
  },
  progressCard: {
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.lg,
  },
  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  progressDay: {
    fontSize: fontSize.lg,
    fontWeight: '700',
    color: colors.text.primary,
  },
  progressYear: {
    fontSize: fontSize.sm,
    color: colors.text.secondary,
  },
  progressBarContainer: {
    gap: spacing.xs,
  },
  progressBarBg: {
    height: 8,
    backgroundColor: colors.dark.surface,
    borderRadius: radius.full,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: radius.full,
  },
  progressPercent: {
    fontSize: fontSize.xs,
    color: colors.gold,
    fontWeight: '600',
    textAlign: 'right',
  },
  timeline: {
    marginTop: spacing.sm,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    gap: spacing.md,
  },
  timelineLine: {
    position: 'absolute',
    start: 23,
    top: 56,
    width: 2,
    height: 48,
  },
  stepCircle: {
    width: 48,
    height: 48,
    borderRadius: radius.full,
    backgroundColor: colors.dark.surface,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: colors.dark.border,
  },
  stepCircleCompleted: {
    backgroundColor: colors.emerald,
    borderColor: colors.emerald,
  },
  stepCircleCurrent: {
    borderColor: colors.gold,
    borderWidth: 3,
  },
  stepNumber: {
    fontSize: fontSize.base,
    fontWeight: '700',
    color: colors.text.secondary,
  },
  stepNumberCurrent: {
    color: colors.gold,
  },
  stepInfo: {
    flex: 1,
    gap: 2,
  },
  stepNameAr: {
    fontSize: fontSize.md,
    fontFamily: fonts.arabicBold,
    color: colors.text.primary,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  stepName: {
    fontSize: fontSize.sm,
    color: colors.emerald,
    fontWeight: '600',
  },
  stepDesc: {
    fontSize: fontSize.xs,
    color: colors.text.tertiary,
    lineHeight: 16,
  },
  actions: {
    marginTop: spacing.xl,
    gap: spacing.md,
  },
  shareButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.emerald,
  },
  shareButtonText: {
    fontSize: fontSize.base,
    fontWeight: '600',
    color: colors.emerald,
  },
  resetButton: {
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  resetButtonText: {
    fontSize: fontSize.sm,
    color: colors.text.tertiary,
  },
});
