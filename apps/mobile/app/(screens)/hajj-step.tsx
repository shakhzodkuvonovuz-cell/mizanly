import { useState, useCallback, useMemo, useEffect } from 'react';
import {
  View, Text, StyleSheet, Pressable, ScrollView, RefreshControl,
, Pressable } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeInUp, FadeInDown } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Icon } from '@/components/ui/Icon';
import { Skeleton } from '@/components/ui/Skeleton';
import { GlassHeader } from '@/components/ui/GlassHeader';
import { colors, spacing, radius, fontSize } from '@/theme';
import { islamicApi } from '@/services/islamicApi';
import type { HajjStep, HajjProgress } from '@/types/islamic';
import { useTranslation } from '@/hooks/useTranslation';
import { ScreenErrorBoundary } from '@/components/ui/ScreenErrorBoundary';

interface ChecklistState {
  [stepIndex: string]: boolean[];
}

function HajjStepContent() {
  const { t } = useTranslation();
  const router = useRouter();
  const queryClient = useQueryClient();
  const params = useLocalSearchParams<{ step: string }>();
  const stepIndex = parseInt(params.step ?? '0', 10);

  const [expandedDua, setExpandedDua] = useState<number | null>(null);
  const [checklistState, setChecklistState] = useState<boolean[]>([]);

  const guideQuery = useQuery({
    queryKey: ['hajj-guide'],
    queryFn: () => islamicApi.getHajjGuide(),
  });

  const progressQuery = useQuery({
    queryKey: ['hajj-progress'],
    queryFn: () => islamicApi.getHajjProgress(),
  });

  const guide: HajjStep[] = useMemo(() => {
    const raw = guideQuery.data;
    if (!raw) return [];
    return (Array.isArray(raw) ? raw : (raw as Record<string, unknown>).data as HajjStep[] | undefined) ?? [];
  }, [guideQuery.data]);

  const progress: HajjProgress | null = useMemo(() => {
    const raw = progressQuery.data;
    if (!raw) return null;
    return raw as HajjProgress;
  }, [progressQuery.data]);

  const step = guide[stepIndex] ?? null;

  // Initialize checklist from saved progress
  useEffect(() => {
    if (!step || !progress) return;
    try {
      const saved: ChecklistState = JSON.parse(progress.checklistJson || '{}');
      const stepKey = String(stepIndex);
      if (saved[stepKey]) {
        setChecklistState(saved[stepKey]);
      } else {
        setChecklistState(step.checklist.map(() => false));
      }
    } catch {
      setChecklistState(step.checklist.map(() => false));
    }
  }, [step, progress, stepIndex]);

  const updateMutation = useMutation({
    mutationFn: (data: { currentStep?: number; checklistJson?: string }) => {
      if (!progress) return Promise.resolve(null);
      return islamicApi.updateHajjProgress(progress.id, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hajj-progress'] });
    },
  });

  const toggleCheckItem = useCallback(
    (index: number) => {
      setChecklistState((prev) => {
        const next = [...prev];
        next[index] = !next[index];

        // Save to backend
        if (progress) {
          try {
            const saved: ChecklistState = JSON.parse(progress.checklistJson || '{}');
            saved[String(stepIndex)] = next;
            updateMutation.mutate({ checklistJson: JSON.stringify(saved) });
          } catch {
            // ignore
          }
        }

        return next;
      });
    },
    [progress, stepIndex, updateMutation],
  );

  const handleMarkComplete = useCallback(() => {
    if (!progress) return;
    const nextStep = Math.min(stepIndex + 1, 6);
    updateMutation.mutate({ currentStep: nextStep });
    if (nextStep > stepIndex) {
      router.back();
    }
  }, [progress, stepIndex, updateMutation, router]);

  const onRefresh = useCallback(() => {
    guideQuery.refetch();
    progressQuery.refetch();
  }, [guideQuery, progressQuery]);

  const isLoading = guideQuery.isLoading || progressQuery.isLoading;
  const isRefreshing = guideQuery.isRefetching || progressQuery.isRefetching;
  const isCurrentOrPast = progress ? stepIndex <= progress.currentStep : false;
  const isCompleted = progress ? stepIndex < progress.currentStep : false;
  const isCurrent = progress ? stepIndex === progress.currentStep : false;

  if (isLoading || !step) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <GlassHeader title={t('hajj.title')} showBack />
        <View style={styles.skeletonContainer}>
          <Skeleton.Rect width="100%" height={80} borderRadius={radius.lg} />
          <View style={{ height: spacing.lg }} />
          <Skeleton.Text width="80%" />
          <View style={{ height: spacing.sm }} />
          <Skeleton.Text width="100%" />
          <Skeleton.Text width="100%" />
          <View style={{ height: spacing.xl }} />
          <Skeleton.Rect width="100%" height={120} borderRadius={radius.md} />
          <View style={{ height: spacing.lg }} />
          {[0, 1, 2].map((i) => (
            <View key={i} style={{ marginBottom: spacing.sm }}>
              <Skeleton.Rect width="100%" height={44} borderRadius={radius.md} />
            </View>
          ))}
        </View>
      </SafeAreaView>
    );
  }

  const headerTitle = t('hajj.stepTitle', { step: stepIndex + 1, name: step.name });

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <GlassHeader title={headerTitle} showBack />
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={onRefresh}
            tintColor={colors.emerald}
          />
        }
      >
        {/* Step header */}
        <Animated.View entering={FadeInDown.duration(400)}>
          <LinearGradient
            colors={['rgba(10,123,79,0.15)', 'rgba(200,150,62,0.10)']}
            style={styles.headerCard}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
          >
            <View style={styles.headerRow}>
              <View
                style={[
                  styles.headerCircle,
                  isCompleted && styles.headerCircleCompleted,
                  isCurrent && styles.headerCircleCurrent,
                ]}
              >
                {isCompleted ? (
                  <Icon name="check" size="md" color="#fff" />
                ) : (
                  <Text style={styles.headerCircleText}>{stepIndex + 1}</Text>
                )}
              </View>
              <View style={styles.headerText}>
                <Text style={styles.stepNameAr}>{step.nameAr}</Text>
                <Text style={styles.stepNameEn}>{step.name}</Text>
              </View>
            </View>
            <Text style={styles.descriptionAr}>{step.descriptionAr}</Text>
            <Text style={styles.description}>{step.description}</Text>
          </LinearGradient>
        </Animated.View>

        {/* Duas section */}
        <Animated.View entering={FadeInUp.delay(100).duration(300)}>
          <Text style={styles.sectionTitle}>{t('hajj.duas')}</Text>
          {step.duas.map((dua, duaIndex) => (
            <Pressable
              accessibilityRole="button"
              key={duaIndex}
              style={styles.duaCard}
              onPress={() =>
                setExpandedDua(expandedDua === duaIndex ? null : duaIndex)
              }

            >
              <Text style={styles.duaArabic}>{dua.arabic}</Text>
              {expandedDua === duaIndex && (
                <Animated.View entering={FadeInDown.duration(200)}>
                  <View style={styles.duaDivider} />
                  <Text style={styles.duaTranslit}>{dua.transliteration}</Text>
                  <Text style={styles.duaEnglish}>{dua.english}</Text>
                </Animated.View>
              )}
              <View style={styles.duaExpandHint}>
                <Icon
                  name={expandedDua === duaIndex ? 'chevron-down' : 'chevron-right'}
                  size="xs"
                  color={colors.text.tertiary}
                />
              </View>
            </Pressable>
          ))}
        </Animated.View>

        {/* Checklist */}
        <Animated.View entering={FadeInUp.delay(200).duration(300)}>
          <Text style={styles.sectionTitle}>{t('hajj.checklist')}</Text>
          {step.checklist.map((item, idx) => (
            <Pressable
              accessibilityRole="button"
              key={idx}
              style={styles.checkItem}
              onPress={() => toggleCheckItem(idx)}

            >
              <View
                style={[
                  styles.checkbox,
                  checklistState[idx] && styles.checkboxChecked,
                ]}
              >
                {checklistState[idx] && (
                  <Icon name="check" size="xs" color="#fff" />
                )}
              </View>
              <Text
                style={[
                  styles.checkText,
                  checklistState[idx] && styles.checkTextDone,
                ]}
              >
                {item}
              </Text>
            </Pressable>
          ))}
        </Animated.View>

        {/* Mark complete button */}
        {isCurrent && (
          <Animated.View entering={FadeInUp.delay(300).duration(300)}>
            <Pressable
              accessibilityRole="button"
              style={styles.completeButton}
              onPress={handleMarkComplete}

            >
              <LinearGradient
                colors={[colors.emerald, '#0A6B42']}
                style={styles.completeButtonGradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
              >
                <Icon name="check-circle" size="sm" color="#fff" />
                <Text style={styles.completeButtonText}>
                  {t('hajj.markComplete')}
                </Text>
              </LinearGradient>
            </Pressable>
          </Animated.View>
        )}

        <View style={{ height: spacing['2xl'] }} />
      </ScrollView>
    </SafeAreaView>
  );
}

export default function HajjStepScreen() {
  return (
    <ScreenErrorBoundary>
      <HajjStepContent />
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
  scrollContent: {
    padding: spacing.base,
  },
  headerCard: {
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.lg,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.md,
    gap: spacing.md,
  },
  headerCircle: {
    width: 56,
    height: 56,
    borderRadius: radius.full,
    backgroundColor: colors.dark.surface,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: colors.dark.border,
  },
  headerCircleCompleted: {
    backgroundColor: colors.emerald,
    borderColor: colors.emerald,
  },
  headerCircleCurrent: {
    borderColor: colors.gold,
    borderWidth: 3,
  },
  headerCircleText: {
    fontSize: fontSize.lg,
    fontWeight: '700',
    color: colors.text.primary,
  },
  headerText: {
    flex: 1,
  },
  stepNameAr: {
    fontSize: fontSize.xl,
    fontWeight: '700',
    color: colors.text.primary,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  stepNameEn: {
    fontSize: fontSize.base,
    fontWeight: '600',
    color: colors.emerald,
  },
  descriptionAr: {
    fontSize: fontSize.base,
    color: colors.text.secondary,
    lineHeight: 24,
    textAlign: 'right',
    writingDirection: 'rtl',
    marginBottom: spacing.sm,
  },
  description: {
    fontSize: fontSize.sm,
    color: colors.text.tertiary,
    lineHeight: 20,
  },
  sectionTitle: {
    fontSize: fontSize.md,
    fontWeight: '700',
    color: colors.text.primary,
    marginBottom: spacing.md,
    marginTop: spacing.sm,
  },
  duaCard: {
    backgroundColor: colors.dark.bgCard,
    borderRadius: radius.lg,
    padding: spacing.base,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.dark.border,
  },
  duaArabic: {
    fontSize: fontSize.lg,
    color: colors.gold,
    textAlign: 'right',
    writingDirection: 'rtl',
    lineHeight: 32,
    fontWeight: '500',
  },
  duaDivider: {
    height: 1,
    backgroundColor: colors.dark.border,
    marginVertical: spacing.md,
  },
  duaTranslit: {
    fontSize: fontSize.sm,
    color: colors.emerald,
    fontStyle: 'italic',
    lineHeight: 22,
    marginBottom: spacing.sm,
  },
  duaEnglish: {
    fontSize: fontSize.sm,
    color: colors.text.secondary,
    lineHeight: 20,
  },
  duaExpandHint: {
    alignItems: 'center',
    marginTop: spacing.xs,
  },
  checkItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    gap: spacing.md,
  },
  checkbox: {
    width: 28,
    height: 28,
    borderRadius: radius.sm,
    borderWidth: 2,
    borderColor: colors.dark.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxChecked: {
    backgroundColor: colors.emerald,
    borderColor: colors.emerald,
  },
  checkText: {
    flex: 1,
    fontSize: fontSize.base,
    color: colors.text.primary,
  },
  checkTextDone: {
    color: colors.text.tertiary,
    textDecorationLine: 'line-through',
  },
  completeButton: {
    marginTop: spacing.xl,
    borderRadius: radius.full,
    overflow: 'hidden',
  },
  completeButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.base,
    borderRadius: radius.full,
  },
  completeButtonText: {
    fontSize: fontSize.base,
    fontWeight: '700',
    color: '#fff',
  },
});
