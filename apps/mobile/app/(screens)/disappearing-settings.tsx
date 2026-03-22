import { useState, useCallback } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useMutation } from '@tanstack/react-query';
import Animated, { FadeIn, FadeInUp } from 'react-native-reanimated';
import { Icon } from '@/components/ui/Icon';
import { GlassHeader } from '@/components/ui/GlassHeader';
import { ScreenErrorBoundary } from '@/components/ui/ScreenErrorBoundary';
import { colors, spacing, fontSize, radius, fonts } from '@/theme';
import { messagesApi } from '@/services/api';
import { useTranslation } from '@/hooks/useTranslation';
import { useContextualHaptic } from '@/hooks/useContextualHaptic';
import { useThemeColors } from '@/hooks/useThemeColors';
import { showToast } from '@/components/ui/Toast';

interface TimerOption {
  value: number;
  labelKey: string;
  descriptionKey: string;
}

const TIMER_OPTIONS: TimerOption[] = [
  {
    value: 0,
    labelKey: 'disappearing.off',
    descriptionKey: 'disappearing.offDescription',
  },
  {
    value: 86400,
    labelKey: 'disappearing.24hours',
    descriptionKey: 'disappearing.24hoursDescription',
  },
  {
    value: 604800,
    labelKey: 'disappearing.7days',
    descriptionKey: 'disappearing.7daysDescription',
  },
  {
    value: 7776000,
    labelKey: 'disappearing.90days',
    descriptionKey: 'disappearing.90daysDescription',
  },
];

function DisappearingSettingsContent() {
  const router = useRouter();
  const { t } = useTranslation();
  const haptic = useContextualHaptic();
  const params = useLocalSearchParams<{
    conversationId: string;
    currentDuration: string;
  }>();

  const conversationId = params.conversationId ?? '';
  const initialDuration = params.currentDuration
    ? parseInt(params.currentDuration, 10)
    : 0;

  const [selectedDuration, setSelectedDuration] = useState(initialDuration);
  const tc = useThemeColors();

  const mutation = useMutation({
    mutationFn: (duration: number) =>
      messagesApi.setDisappearingTimer(conversationId, duration),
    onSuccess: () => {
      haptic.success();
      router.back();
    },
    onError: (error: Error) => {
      haptic.error();
      showToast({ message: error.message, variant: 'error' });
    },
  });

  const handleSelect = useCallback(
    (value: number) => {
      haptic.tick();
      setSelectedDuration(value);
    },
    [haptic],
  );

  const handleSave = useCallback(() => {
    if (selectedDuration === initialDuration) {
      router.back();
      return;
    }
    mutation.mutate(selectedDuration);
  }, [selectedDuration, initialDuration, mutation, router]);

  return (
    <View style={[styles.container, { backgroundColor: tc.bg }]}>
      <GlassHeader
        title={t('disappearing.title')}
        leftAction={{
          icon: 'arrow-left',
          onPress: () => router.back(),
          accessibilityLabel: t('common.back'),
        }}
        rightActions={[
          {
            icon: 'check',
            onPress: handleSave,
            accessibilityLabel: t('common.save'),
          },
        ]}
      />

      <SafeAreaView style={styles.safeArea} edges={['bottom']}>
        <Animated.View entering={FadeIn.duration(300)} style={styles.content}>
          {/* Icon illustration */}
          <Animated.View
            entering={FadeInUp.delay(100).duration(400)}
            style={styles.illustrationContainer}
          >
            <View style={styles.illustrationCircle}>
              <View style={styles.illustrationInner}>
                <Icon name="clock" size="xl" color={colors.emerald} />
              </View>
            </View>
            <View style={[styles.lockBadge, { borderColor: tc.bg }]}>
              <Icon name="lock" size="xs" color={tc.text.primary} />
            </View>
          </Animated.View>

          {/* Description */}
          <Animated.View
            entering={FadeInUp.delay(200).duration(400)}
            style={styles.descriptionContainer}
          >
            <Text style={[styles.descriptionTitle, { color: tc.text.primary }]}>
              {t('disappearing.title')}
            </Text>
            <Text style={[styles.descriptionText, { color: tc.text.secondary }]}>
              {t('disappearing.description')}
            </Text>
          </Animated.View>

          {/* Timer options */}
          <Animated.View
            entering={FadeInUp.delay(300).duration(400)}
            style={[styles.optionsContainer, { backgroundColor: tc.bgCard, borderColor: tc.border }]}
          >
            {TIMER_OPTIONS.map((option, index) => {
              const isSelected = selectedDuration === option.value;
              return (
                <Pressable
                  key={option.value}
                  onPress={() => handleSelect(option.value)}
                  style={[
                    styles.optionRow,
                    isSelected && styles.optionRowSelected,
                    index < TIMER_OPTIONS.length - 1 && styles.optionBorder,
                  ]}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: isSelected }}
                  accessibilityLabel={t(option.labelKey)}
                >
                  {/* Radio indicator */}
                  <View
                    style={[
                      styles.radio, { borderColor: tc.borderLight },
                      isSelected && styles.radioSelected,
                    ]}
                  >
                    {isSelected && <View style={styles.radioFill} />}
                  </View>

                  {/* Label + description */}
                  <View style={styles.optionTextContainer}>
                    <Text
                      style={[
                        styles.optionLabel,
                        { color: tc.text.primary },
                        isSelected && styles.optionLabelSelected,
                      ]}
                    >
                      {t(option.labelKey)}
                    </Text>
                    <Text style={[styles.optionDescription, { color: tc.text.tertiary }]}>
                      {t(option.descriptionKey)}
                    </Text>
                  </View>

                  {/* Check icon for selected */}
                  {isSelected && (
                    <Icon name="check" size="sm" color={colors.emerald} />
                  )}
                </Pressable>
              );
            })}
          </Animated.View>

          {/* Footer info */}
          <Animated.View
            entering={FadeInUp.delay(400).duration(400)}
            style={styles.footerContainer}
          >
            <Icon name="lock" size="xs" color={tc.text.tertiary} />
            <Text style={[styles.footerText, { color: tc.text.tertiary }]}>
              {t('disappearing.footerInfo')}
            </Text>
          </Animated.View>
        </Animated.View>
      </SafeAreaView>
    </View>
  );
}

export default function DisappearingSettingsScreen() {
  return (
    <ScreenErrorBoundary>
      <DisappearingSettingsContent />
    </ScreenErrorBoundary>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.dark.bg,
  },
  safeArea: {
    flex: 1,
  },
  content: {
    flex: 1,
    paddingTop: 100, // account for GlassHeader
    paddingHorizontal: spacing.base,
  },

  // Illustration
  illustrationContainer: {
    alignItems: 'center',
    marginTop: spacing.xl,
    marginBottom: spacing['2xl'],
  },
  illustrationCircle: {
    width: 80,
    height: 80,
    borderRadius: radius.full,
    backgroundColor: colors.active.emerald10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  illustrationInner: {
    width: 56,
    height: 56,
    borderRadius: radius.full,
    backgroundColor: colors.active.emerald20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lockBadge: {
    position: 'absolute',
    bottom: 0,
    right: '50%',
    marginRight: -32,
    width: 24,
    height: 24,
    borderRadius: radius.full,
    backgroundColor: colors.emerald,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.dark.bg,
  },

  // Description
  descriptionContainer: {
    alignItems: 'center',
    marginBottom: spacing['2xl'],
    paddingHorizontal: spacing.lg,
  },
  descriptionTitle: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSize.lg,
    color: colors.text.primary,
    marginBottom: spacing.sm,
    textAlign: 'center',
  },
  descriptionText: {
    fontFamily: fonts.body,
    fontSize: fontSize.base,
    color: colors.text.secondary,
    textAlign: 'center',
    lineHeight: 22,
  },

  // Options
  optionsContainer: {
    backgroundColor: colors.dark.bgCard,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.dark.border,
    overflow: 'hidden',
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md + 2,
    gap: spacing.md,
  },
  optionRowSelected: {
    backgroundColor: colors.active.emerald10,
  },
  optionBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.dark.border,
  },

  // Radio
  radio: {
    width: 22,
    height: 22,
    borderRadius: radius.full,
    borderWidth: 2,
    borderColor: colors.dark.borderLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioSelected: {
    borderColor: colors.emerald,
  },
  radioFill: {
    width: 12,
    height: 12,
    borderRadius: radius.full,
    backgroundColor: colors.emerald,
  },

  // Option text
  optionTextContainer: {
    flex: 1,
  },
  optionLabel: {
    fontFamily: fonts.bodyMedium,
    fontSize: fontSize.base,
    color: colors.text.primary,
  },
  optionLabelSelected: {
    color: colors.emerald,
    fontFamily: fonts.bodySemiBold,
  },
  optionDescription: {
    fontFamily: fonts.body,
    fontSize: fontSize.xs,
    color: colors.text.tertiary,
    marginTop: 2,
  },

  // Footer
  footerContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    marginTop: spacing.lg,
    paddingHorizontal: spacing.xs,
  },
  footerText: {
    fontFamily: fonts.body,
    fontSize: fontSize.xs,
    color: colors.text.tertiary,
    flex: 1,
    lineHeight: 18,
  },
});
