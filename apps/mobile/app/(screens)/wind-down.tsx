import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Pressable, BackHandler, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  withDelay,
  Easing,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { Icon } from '@/components/ui/Icon';
import { GradientButton } from '@/components/ui/GradientButton';
import { colors, spacing, fontSize, radius, fonts } from '@/theme';
import { useTranslation } from '@/hooks/useTranslation';
import { useHaptic } from '@/hooks/useHaptic';
import { useThemeColors } from '@/hooks/useThemeColors';
import { ScreenErrorBoundary } from '@/components/ui/ScreenErrorBoundary';

const BREATHING_CYCLE_MS = 8000; // 4s in, 4s out

export default function WindDownScreen() {
  const tc = useThemeColors();
  const styles = createStyles(tc);
  const { t } = useTranslation();
  const router = useRouter();
  const haptic = useHaptic();
  const insets = useSafeAreaInsets();
  const [phase, setPhase] = useState<'breatheIn' | 'breatheOut'>('breatheIn');

  // Breathing circle animation
  const breathScale = useSharedValue(0.6);
  const breathOpacity = useSharedValue(0.4);
  const outerRingScale = useSharedValue(0.8);

  useEffect(() => {
    // Breathing animation: scale up (inhale) then scale down (exhale)
    breathScale.value = withRepeat(
      withSequence(
        withTiming(1.2, { duration: BREATHING_CYCLE_MS / 2, easing: Easing.inOut(Easing.ease) }),
        withTiming(0.6, { duration: BREATHING_CYCLE_MS / 2, easing: Easing.inOut(Easing.ease) }),
      ),
      -1,
      false,
    );
    breathOpacity.value = withRepeat(
      withSequence(
        withTiming(0.8, { duration: BREATHING_CYCLE_MS / 2 }),
        withTiming(0.3, { duration: BREATHING_CYCLE_MS / 2 }),
      ),
      -1,
      false,
    );
    outerRingScale.value = withRepeat(
      withSequence(
        withDelay(200, withTiming(1.3, { duration: BREATHING_CYCLE_MS / 2, easing: Easing.inOut(Easing.ease) })),
        withTiming(0.8, { duration: BREATHING_CYCLE_MS / 2, easing: Easing.inOut(Easing.ease) }),
      ),
      -1,
      false,
    );

    // Toggle phase text
    const interval = setInterval(() => {
      setPhase((prev) => (prev === 'breatheIn' ? 'breatheOut' : 'breatheIn'));
    }, BREATHING_CYCLE_MS / 2);

    return () => clearInterval(interval);
  }, [breathScale, breathOpacity, outerRingScale]);

  const breathStyle = useAnimatedStyle(() => ({
    transform: [{ scale: breathScale.value }],
    opacity: breathOpacity.value,
  }));

  const outerRingStyle = useAnimatedStyle(() => ({
    transform: [{ scale: outerRingScale.value }],
    opacity: breathOpacity.value * 0.5,
  }));

  return (
    <ScreenErrorBoundary>
      <LinearGradient
        colors={[tc.bg, '#0A1628', '#061118']}
        style={styles.container}
        accessibilityLabel={t('windDown.title')}
      >
        <View style={[styles.safeArea, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title}>{t('windDown.title')}</Text>
            <Text style={styles.subtitle}>{t('windDown.subtitle')}</Text>
          </View>

          {/* Breathing circle */}
          <View style={styles.breathContainer}>
            <Animated.View style={[styles.outerRing, outerRingStyle]} />
            <Animated.View style={[styles.breathCircle, breathStyle]}>
              <LinearGradient
                colors={[colors.emerald + '40', colors.emerald + '10']}
                style={styles.breathGradient}
              >
                <Text style={styles.breathText}>
                  {phase === 'breatheIn' ? t('windDown.breatheIn') : t('windDown.breatheOut')}
                </Text>
              </LinearGradient>
            </Animated.View>
          </View>

          {/* Message */}
          <View style={styles.messageContainer}>
            <Icon name="clock" size="sm" color={colors.gold} />
            <Text style={styles.message}>{t('windDown.message')}</Text>
          </View>

          {/* Actions */}
          <View style={styles.actions}>
            <GradientButton
              label={t('windDown.closeApp')}
              onPress={() => {
                haptic.light();
                if (Platform.OS === 'android') {
                  BackHandler.exitApp();
                } else {
                  router.back();
                }
              }}
              fullWidth
            />
            <Pressable
              accessibilityRole="button"
              style={styles.closeBtn}
              onPress={() => {
                haptic.light();
                router.back();
              }}
            >
              <Text style={styles.closeBtnText}>{t('windDown.continueScrolling')}</Text>
            </Pressable>
          </View>
        </View>
      </LinearGradient>
    </ScreenErrorBoundary>
  );
}

const createStyles = (tc: ReturnType<typeof useThemeColors>) => StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1, justifyContent: 'space-between', paddingHorizontal: spacing.xl },
  header: { alignItems: 'center', marginTop: spacing['2xl'] },
  title: {
    color: colors.text.primary,
    fontSize: fontSize.xl,
    fontWeight: '700',
    fontFamily: fonts.headingBold,
    marginBottom: spacing.sm,
  },
  subtitle: {
    color: colors.text.secondary,
    fontSize: fontSize.sm,
    textAlign: 'center',
    lineHeight: 22,
  },
  breathContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  outerRing: {
    position: 'absolute',
    width: 220,
    height: 220,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.emerald + '30',
  },
  breathCircle: {
    width: 180,
    height: 180,
    borderRadius: radius.full,
    overflow: 'hidden',
  },
  breathGradient: {
    width: '100%',
    height: '100%',
    borderRadius: radius.full,
    justifyContent: 'center',
    alignItems: 'center',
  },
  breathText: {
    color: colors.emerald,
    fontSize: fontSize.lg,
    fontWeight: '600',
  },
  messageContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    marginBottom: spacing.xl,
  },
  message: {
    color: colors.text.secondary,
    fontSize: fontSize.sm,
    textAlign: 'center',
  },
  actions: {
    gap: spacing.md,
    marginBottom: spacing['2xl'],
  },
  closeBtn: {
    alignItems: 'center',
    paddingVertical: spacing.md,
  },
  closeBtnText: {
    color: colors.text.tertiary,
    fontSize: fontSize.sm,
    fontWeight: '500',
  },
});
