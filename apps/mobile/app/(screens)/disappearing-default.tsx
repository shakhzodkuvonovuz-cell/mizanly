import { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import Animated, { FadeIn, FadeInUp } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { Icon } from '@/components/ui/Icon';
import { GlassHeader } from '@/components/ui/GlassHeader';
import { ScreenErrorBoundary } from '@/components/ui/ScreenErrorBoundary';
import { Skeleton } from '@/components/ui/Skeleton';
import { colors, spacing, fontSize, radius, fonts } from '@/theme';
import { useTranslation } from '@/hooks/useTranslation';
import { useThemeColors } from '@/hooks/useThemeColors';
import { showToast } from '@/components/ui/Toast';
// settingsApi not used — disappearingMessageTimer is local-only (no backend field)

type TimerOption = 'off' | '24h' | '7d' | '90d';

const TIMER_VALUES: { key: TimerOption; seconds: number }[] = [
  { key: 'off', seconds: 0 },
  { key: '24h', seconds: 86400 },
  { key: '7d', seconds: 604800 },
  { key: '90d', seconds: 7776000 },
];

function DisappearingDefaultContent() {
  const router = useRouter();
  const { t } = useTranslation();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selected, setSelected] = useState<TimerOption>('off');
  const tc = useThemeColors();

  // NOTE: disappearingMessageTimer is not in the backend schema/DTO.
  // Persisted locally via AsyncStorage until backend supports it.
  useEffect(() => {
    let cancelled = false;
    async function loadSettings() {
      try {
        const stored = await AsyncStorage.getItem('disappearing-message-timer');
        if (!cancelled && stored) {
          const seconds = parseInt(stored, 10);
          if (!isNaN(seconds)) {
            const match = TIMER_VALUES.find((v) => v.seconds === seconds);
            if (match) setSelected(match.key);
          }
        }
      } catch {
        // Use default on error
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    loadSettings();
    return () => { cancelled = true; };
  }, []);

  const handleSelect = useCallback(async (option: TimerOption) => {
    if (saving) return;
    const prev = selected;
    setSelected(option);
    setSaving(true);
    try {
      const timer = TIMER_VALUES.find((v) => v.key === option);
      // Persisted locally — backend schema does not have disappearingMessageTimer field
      await AsyncStorage.setItem('disappearing-message-timer', String(timer?.seconds ?? 0));
    } catch {
      setSelected(prev);
      showToast({ message: t('disappearingDefault.errorSave', 'Failed to save timer setting'), variant: 'error' });
    } finally {
      setSaving(false);
    }
  }, [saving, selected, t]);

  const timerOptions: { key: TimerOption; label: string; subtitle: string }[] = [
    {
      key: 'off',
      label: t('disappearingDefault.off', 'Off'),
      subtitle: t('disappearingDefault.offDesc', 'Messages will not disappear'),
    },
    {
      key: '24h',
      label: t('disappearingDefault.24h', '24 hours'),
      subtitle: t('disappearingDefault.24hDesc', 'Messages disappear after 1 day'),
    },
    {
      key: '7d',
      label: t('disappearingDefault.7d', '7 days'),
      subtitle: t('disappearingDefault.7dDesc', 'Messages disappear after 1 week'),
    },
    {
      key: '90d',
      label: t('disappearingDefault.90d', '90 days'),
      subtitle: t('disappearingDefault.90dDesc', 'Messages disappear after 3 months'),
    },
  ];

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: tc.bg }]}>
        <GlassHeader
          title={t('disappearingDefault.title', 'Default Message Timer')}
          leftAction={{
            icon: 'arrow-left',
            onPress: () => router.back(),
            accessibilityLabel: t('common.back', 'Go back'),
          }}
        />
        <View style={[styles.scrollContent, { paddingTop: 100 }]}>
          <View style={styles.iconContainer}>
            <Skeleton.Circle size={80} />
          </View>
          <Skeleton.Rect width="80%" height={16} borderRadius={radius.sm} />
          <View style={{ height: spacing.lg }} />
          <Skeleton.Rect width="100%" height={64} borderRadius={radius.lg} />
          <View style={{ height: spacing.sm }} />
          <Skeleton.Rect width="100%" height={64} borderRadius={radius.lg} />
          <View style={{ height: spacing.sm }} />
          <Skeleton.Rect width="100%" height={64} borderRadius={radius.lg} />
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: tc.bg }]}>
      <GlassHeader
        title={t('disappearingDefault.title', 'Default Message Timer')}
        leftAction={{
          icon: 'arrow-left',
          onPress: () => router.back(),
          accessibilityLabel: t('common.back', 'Go back'),
        }}
      />

      <Animated.ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Clock Illustration */}
        <Animated.View entering={FadeIn.duration(400)} style={styles.iconContainer}>
          <LinearGradient
            colors={[colors.emerald, colors.emeraldDark]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.iconCircle}
          >
            <Icon name="clock" size={40} color={tc.text.primary} />
          </LinearGradient>
        </Animated.View>

        {/* Description */}
        <Animated.View entering={FadeInUp.delay(100).duration(400)} style={styles.descriptionContainer}>
          <Text style={[styles.description, { color: tc.text.secondary }]}>
            {t(
              'disappearingDefault.description',
              'Set a default timer for all new conversations. When enabled, new messages will automatically disappear after the selected duration.',
            )}
          </Text>
        </Animated.View>

        {/* Timer Options */}
        <Animated.View entering={FadeInUp.delay(200).duration(400)} style={[styles.optionsCard, { backgroundColor: tc.bgCard, borderColor: tc.border }]}>
          {timerOptions.map((option, index) => {
            const isSelected = selected === option.key;
            return (
              <View key={option.key}>
                <Pressable
                  onPress={() => handleSelect(option.key)}
                  disabled={saving}
                  style={({ pressed }) => [
                    styles.optionRow,
                    pressed && styles.optionRowPressed,
                  ]}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: isSelected }}
                  accessibilityLabel={option.label}
                >
                  <View style={styles.optionTextContainer}>
                    <Text style={[styles.optionLabel, { color: tc.text.primary }, isSelected && styles.optionLabelSelected]}>
                      {option.label}
                    </Text>
                    <Text style={[styles.optionSubtitle, { color: tc.text.secondary }]}>
                      {option.subtitle}
                    </Text>
                  </View>
                  <View style={[styles.radioOuter, { borderColor: tc.borderLight }, isSelected && styles.radioOuterSelected]}>
                    {isSelected && <View style={styles.radioInner} />}
                  </View>
                </Pressable>
                {index < timerOptions.length - 1 && <View style={[styles.divider, { backgroundColor: tc.border }]} />}
              </View>
            );
          })}
        </Animated.View>

        {/* Info Note */}
        <Animated.View entering={FadeInUp.delay(300).duration(400)} style={[styles.infoCard, { backgroundColor: tc.bgCard, borderColor: tc.border }]}>
          <View style={styles.infoRow}>
            <View style={styles.infoIconWrapper}>
              <Icon name="clock" size={18} color={colors.emerald} />
            </View>
            <Text style={[styles.infoText, { color: tc.text.secondary }]}>
              {t(
                'disappearingDefault.existingNote',
                'Existing conversations will not be affected. You can change the timer for individual conversations in their settings.',
              )}
            </Text>
          </View>
        </Animated.View>
      </Animated.ScrollView>
    </View>
  );
}

export default function DisappearingDefaultScreen() {
  return (
    <ScreenErrorBoundary>
      <DisappearingDefaultContent />
    </ScreenErrorBoundary>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.dark.bg,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingTop: 100,
    paddingHorizontal: spacing.base,
    paddingBottom: spacing['2xl'],
  },
  iconContainer: {
    alignItems: 'center',
    marginTop: spacing.xl,
    marginBottom: spacing['2xl'],
  },
  iconCircle: {
    width: 80,
    height: 80,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  descriptionContainer: {
    marginBottom: spacing.xl,
    paddingHorizontal: spacing.xs,
  },
  description: {
    fontFamily: fonts.body,
    fontSize: fontSize.base,
    color: colors.text.secondary,
    lineHeight: 22,
    textAlign: 'center',
  },
  optionsCard: {
    backgroundColor: colors.dark.bgCard,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.dark.border,
    overflow: 'hidden',
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.base,
  },
  optionRowPressed: {
    backgroundColor: colors.active.white5,
  },
  optionTextContainer: {
    flex: 1,
    marginRight: spacing.md,
  },
  optionLabel: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSize.base,
    color: colors.text.primary,
  },
  optionLabelSelected: {
    color: colors.emerald,
  },
  optionSubtitle: {
    fontFamily: fonts.body,
    fontSize: fontSize.sm,
    color: colors.text.secondary,
    marginTop: 2,
  },
  radioOuter: {
    width: 22,
    height: 22,
    borderRadius: radius.full,
    borderWidth: 2,
    borderColor: colors.dark.borderLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioOuterSelected: {
    borderColor: colors.emerald,
  },
  radioInner: {
    width: 12,
    height: 12,
    borderRadius: radius.full,
    backgroundColor: colors.emerald,
  },
  divider: {
    height: 1,
    backgroundColor: colors.dark.border,
    marginHorizontal: spacing.base,
  },
  infoCard: {
    backgroundColor: colors.dark.bgCard,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.dark.border,
    padding: spacing.base,
    marginTop: spacing.xl,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  infoIconWrapper: {
    width: 36,
    height: 36,
    borderRadius: radius.full,
    backgroundColor: colors.active.emerald10,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  infoText: {
    flex: 1,
    fontFamily: fonts.body,
    fontSize: fontSize.sm,
    color: colors.text.secondary,
    lineHeight: 20,
  },
});
