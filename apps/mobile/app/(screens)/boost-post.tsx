import { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  TextInput,
} from 'react-native';
import { showToast } from '@/components/ui/Toast';
import { useRouter, useLocalSearchParams } from 'expo-router';
import Animated, { FadeIn, FadeInUp } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from '@/components/ui/Icon';
import { GlassHeader } from '@/components/ui/GlassHeader';
import { GradientButton } from '@/components/ui/GradientButton';
import { ScreenErrorBoundary } from '@/components/ui/ScreenErrorBoundary';
import { EmptyState } from '@/components/ui/EmptyState';
import { colors, spacing, fontSize, radius, fonts, shadow } from '@/theme';
import { useTranslation } from '@/hooks/useTranslation';
import { useThemeColors } from '@/hooks/useThemeColors';
import { useContextualHaptic } from '@/hooks/useContextualHaptic';
import { useIsOffline } from '@/hooks/useIsOffline';
import { promotionsApi } from '@/services/promotionsApi';

const BUDGET_OPTIONS = [5, 10, 25, 50];

const DURATION_OPTIONS: { days: number; labelKey: string }[] = [
  { days: 1, labelKey: 'boost.duration1Day' },
  { days: 3, labelKey: 'boost.duration3Days' },
  { days: 7, labelKey: 'boost.duration7Days' },
  { days: 14, labelKey: 'boost.duration14Days' },
];

function BoostPostContent() {
  const router = useRouter();
  const tc = useThemeColors();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const haptic = useContextualHaptic();
  const isOffline = useIsOffline();
  const { postId } = useLocalSearchParams<{ postId: string }>();

  const [selectedBudget, setSelectedBudget] = useState<number>(10);
  const [customBudget, setCustomBudget] = useState('');
  const [isCustom, setIsCustom] = useState(false);
  const [selectedDuration, setSelectedDuration] = useState(3);
  const [boosting, setBoosting] = useState(false);

  const activeBudget = isCustom
    ? parseInt(customBudget, 10) || 0
    : selectedBudget;

  const handleSelectBudget = useCallback((amount: number) => {
    haptic.tick();
    setIsCustom(false);
    setSelectedBudget(amount);
    setCustomBudget('');
  }, [haptic]);

  const handleCustomBudget = useCallback(() => {
    setIsCustom(true);
  }, []);

  const handleBoost = useCallback(async () => {
    if (!postId || activeBudget <= 0 || boosting || isOffline) {
      if (isOffline) {
        showToast({ message: t('network.offline'), variant: 'error' });
      }
      return;
    }
    haptic.tick();
    setBoosting(true);
    try {
      await promotionsApi.boostPost({
        postId,
        budget: activeBudget,
        duration: selectedDuration,
      });
      haptic.success();
      showToast({ message: t('boost.successMessage'), variant: 'success' });
      router.back();
    } catch {
      haptic.error();
      showToast({ message: t('boost.errorMessage'), variant: 'error' });
    } finally {
      setBoosting(false);
    }
  }, [postId, activeBudget, selectedDuration, router, t, boosting, haptic]);

  if (!postId) {
    return (
      <View style={[styles.container, { backgroundColor: tc.bg }]}>
        <EmptyState
          icon="slash"
          title={t('boost.noPost')}
          subtitle={t('boost.noPostSub')}
        />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: tc.bg }]}>
      <GlassHeader
        title={t('boost.title')}
        leftAction={{
          icon: 'arrow-left',
          onPress: () => router.back(),
          accessibilityLabel: t('common.back'),
        }}
      />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + 60, paddingBottom: insets.bottom + spacing.xl },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Post Preview */}
        <Animated.View entering={FadeInUp.delay(100).duration(400)} style={[styles.previewCard, { backgroundColor: tc.bgCard, borderColor: tc.border }]}>
          <View style={styles.previewHeader}>
            <Icon name="image" size="md" color={tc.text.secondary} />
            <Text style={[styles.previewLabel, { color: tc.text.secondary }]}>{t('boost.postPreview')}</Text>
          </View>
          <View style={styles.previewBody}>
            <View style={[styles.previewThumb, { backgroundColor: tc.surface }]} />
            <View style={styles.previewMeta}>
              <Text style={[styles.previewId, { color: tc.text.primary }]} numberOfLines={1}>
                {t('boost.postIdLabel')}: {postId.slice(0, 12)}...
              </Text>
              <Text style={[styles.previewHint, { color: tc.text.tertiary }]}>{t('boost.boostHint')}</Text>
            </View>
          </View>
        </Animated.View>

        {/* Budget Selector */}
        <Animated.View entering={FadeInUp.delay(200).duration(400)}>
          <Text style={[styles.sectionTitle, { color: tc.text.primary }]}>{t('boost.budget')}</Text>
          <View style={styles.pillRow}>
            {BUDGET_OPTIONS.map((amount) => {
              const active = !isCustom && selectedBudget === amount;
              return (
                <Pressable
                  key={amount}
                  onPress={() => handleSelectBudget(amount)}
                  style={({ pressed }) => [styles.pill, { backgroundColor: tc.surface, borderColor: tc.border }, active && styles.pillActive, pressed && { opacity: 0.7 }]}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                >
                  <Text style={[styles.pillText, { color: tc.text.secondary }, active && styles.pillTextActive]}>
                    ${amount}
                  </Text>
                </Pressable>
              );
            })}
            <Pressable
              onPress={() => { haptic.tick(); handleCustomBudget(); }}
              style={({ pressed }) => [styles.pill, { backgroundColor: tc.surface, borderColor: tc.border }, isCustom && styles.pillActive, pressed && { opacity: 0.7 }]}
              accessibilityRole="button"
              accessibilityState={{ selected: isCustom }}
            >
              <Text style={[styles.pillText, isCustom && styles.pillTextActive]}>
                {t('boost.custom')}
              </Text>
            </Pressable>
          </View>

          {isCustom && (
            <Animated.View entering={FadeIn.duration(300)} style={[styles.customInputRow, { backgroundColor: tc.bgCard, borderColor: tc.border }]}>
              <Text style={styles.currencySign}>$</Text>
              <TextInput
                style={[styles.customInput, { color: tc.text.primary }]}
                value={customBudget}
                onChangeText={setCustomBudget}
                keyboardType="number-pad"
                placeholder={t('boost.enterAmount')}
                placeholderTextColor={tc.text.tertiary}
                maxLength={5}
                accessibilityLabel={t('boost.customAmountLabel')}
              />
            </Animated.View>
          )}
        </Animated.View>

        {/* Duration Selector */}
        <Animated.View entering={FadeInUp.delay(300).duration(400)}>
          <Text style={[styles.sectionTitle, { color: tc.text.primary }]}>{t('boost.duration')}</Text>
          <View style={styles.pillRow}>
            {DURATION_OPTIONS.map(({ days, labelKey }) => {
              const active = selectedDuration === days;
              return (
                <Pressable
                  key={days}
                  onPress={() => { haptic.tick(); setSelectedDuration(days); }}
                  style={({ pressed }) => [styles.pill, { backgroundColor: tc.surface, borderColor: tc.border }, active && styles.pillActive, pressed && { opacity: 0.7 }]}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                >
                  <Text style={[styles.pillText, { color: tc.text.secondary }, active && styles.pillTextActive]}>
                    {t(labelKey)}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </Animated.View>

        {/* Reach Estimate Info */}
        <Animated.View entering={FadeInUp.delay(400).duration(400)} style={[styles.reachCard, { borderColor: tc.border }]}>
          <LinearGradient
            colors={[colors.active.emerald10, 'transparent']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.reachGradient}
          >
            <Icon name="trending-up" size="lg" color={colors.emerald} />
            <View style={styles.reachInfo}>
              <Text style={[styles.reachTitle, { color: tc.text.secondary }]}>{t('boost.estimatedReach')}</Text>
              <Text style={[styles.reachHonestText, { color: tc.text.secondary }]}>
                {t('boost.reachHonestMessage', { defaultValue: 'Estimated reach will be calculated based on your audience and budget after the boost starts' })}
              </Text>
            </View>
          </LinearGradient>
        </Animated.View>

        {/* Info Text */}
        <Animated.View entering={FadeInUp.delay(500).duration(400)} style={styles.infoRow}>
          <Icon name="clock" size="sm" color={tc.text.tertiary} />
          <Text style={[styles.infoText, { color: tc.text.tertiary }]}>
            {t('boost.infoText')}
          </Text>
        </Animated.View>

        {/* Boost Button */}
        <Animated.View entering={FadeInUp.delay(600).duration(400)} style={styles.buttonWrapper}>
          <GradientButton
            label={isOffline ? t('network.offline') : t('boost.boostNow')}
            onPress={handleBoost}
            loading={boosting}
            disabled={activeBudget <= 0 || boosting || isOffline}
            fullWidth
            size="lg"
            icon="trending-up"
          />
        </Animated.View>

        {/* Summary */}
        <Animated.View entering={FadeIn.delay(700).duration(400)} style={[styles.summary, { backgroundColor: tc.bgCard, borderColor: tc.border }]}>
          <View style={[styles.summaryRow, { borderBottomColor: tc.border }]}>
            <Text style={[styles.summaryLabel, { color: tc.text.secondary }]}>{t('boost.budget')}</Text>
            <Text style={[styles.summaryValue, { color: tc.text.primary }]}>${activeBudget}</Text>
          </View>
          <View style={[styles.summaryRow, { borderBottomColor: tc.border }]}>
            <Text style={[styles.summaryLabel, { color: tc.text.secondary }]}>{t('boost.duration')}</Text>
            <Text style={[styles.summaryValue, { color: tc.text.primary }]}>
              {selectedDuration} {selectedDuration === 1 ? t('boost.day') : t('boost.days')}
            </Text>
          </View>
          <View style={[styles.summaryRow, styles.summaryRowLast]}>
            <Text style={[styles.summaryLabel, { color: tc.text.secondary }]}>{t('boost.totalCost')}</Text>
            <Text style={[styles.summaryValue, styles.summaryTotal]}>${activeBudget}</Text>
          </View>
        </Animated.View>
      </ScrollView>
    </View>
  );
}

export default function BoostPostScreen() {
  return (
    <ScreenErrorBoundary>
      <BoostPostContent />
    </ScreenErrorBoundary>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  content: {
    paddingHorizontal: spacing.base,
    paddingTop: spacing.base,
    gap: spacing.xl,
  },
  previewCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.base,
  },
  previewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  previewLabel: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSize.sm,
  },
  previewBody: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  previewThumb: {
    width: 56,
    height: 56,
    borderRadius: radius.md,
  },
  previewMeta: {
    flex: 1,
    gap: spacing.xs,
  },
  previewId: {
    fontFamily: fonts.bodyMedium,
    fontSize: fontSize.sm,
  },
  previewHint: {
    fontFamily: fonts.body,
    fontSize: fontSize.xs,
  },
  sectionTitle: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSize.base,
    marginBottom: spacing.md,
  },
  pillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  pill: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
    borderWidth: 1,
  },
  pillActive: {
    backgroundColor: colors.active.emerald20,
    borderColor: colors.emerald,
  },
  pillText: {
    fontFamily: fonts.bodyMedium,
    fontSize: fontSize.sm,
  },
  pillTextActive: {
    color: colors.emerald,
    fontFamily: fonts.bodySemiBold,
  },
  customInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.md,
    borderWidth: 1,
    paddingHorizontal: spacing.base,
    marginTop: spacing.md,
  },
  currencySign: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSize.lg,
    color: colors.emerald,
    marginEnd: spacing.sm,
  },
  customInput: {
    flex: 1,
    fontFamily: fonts.bodyMedium,
    fontSize: fontSize.base,
    paddingVertical: spacing.md,
  },
  reachCard: {
    borderRadius: radius.lg,
    overflow: 'hidden',
    borderWidth: 1,
  },
  reachGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.base,
    padding: spacing.lg,
  },
  reachInfo: {
    flex: 1,
    gap: spacing.xs,
  },
  reachTitle: {
    fontFamily: fonts.body,
    fontSize: fontSize.sm,
  },
  reachHonestText: {
    fontFamily: fonts.body,
    fontSize: fontSize.xs,
    lineHeight: 16,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  infoText: {
    flex: 1,
    fontFamily: fonts.body,
    fontSize: fontSize.xs,
    lineHeight: 16,
  },
  buttonWrapper: {
    marginTop: spacing.sm,
  },
  summary: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.base,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  summaryRowLast: {
    borderBottomWidth: 0,
  },
  summaryLabel: {
    fontFamily: fonts.body,
    fontSize: fontSize.sm,
  },
  summaryValue: {
    fontFamily: fonts.bodyMedium,
    fontSize: fontSize.sm,
  },
  summaryTotal: {
    fontFamily: fonts.bodySemiBold,
    color: colors.emerald,
    fontSize: fontSize.base,
  },
});
