import { View, Text, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useClerk } from '@clerk/clerk-expo';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { EmptyState } from '@/components/ui/EmptyState';
import { GradientButton } from '@/components/ui/GradientButton';
import { colors, spacing, fontSize } from '@/theme';
import { useTranslation } from '@/hooks/useTranslation';
import { useThemeColors } from '@/hooks/useThemeColors';
import { useContextualHaptic } from '@/hooks/useContextualHaptic';
import { ScreenErrorBoundary } from '@/components/ui/ScreenErrorBoundary';
import { showToast } from '@/components/ui/Toast';

function BannedScreenContent() {
  const router = useRouter();
  const tc = useThemeColors();
  const { t } = useTranslation();
  const { signOut } = useClerk();
  const haptic = useContextualHaptic();

  const handleAppeal = () => {
    haptic.tick();
    router.push('/(screens)/appeal-moderation');
  };

  const handleSignOut = async () => {
    haptic.tick();
    try {
      await signOut();
      showToast({ message: t('screens.banned.signedOut'), variant: 'success' });
    } catch {
      showToast({ message: t('common.somethingWentWrong'), variant: 'error' });
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: tc.bg }]} edges={['top', 'bottom']}>
      <Animated.View entering={FadeInUp.duration(400)} style={styles.content}>
        <EmptyState
          icon="slash"
          title={t('screens.banned.title')}
          subtitle={t('screens.banned.subtitle')}
        />

        <Text style={[styles.contactText, { color: tc.text.secondary }]}>
          {t('screens.banned.contactSupport')}
        </Text>

        <View style={styles.actions}>
          <GradientButton
            label={t('screens.banned.appealButton')}
            variant="primary"
            size="lg"
            onPress={handleAppeal}
            accessibilityLabel={t('screens.banned.appealButton')}
            accessibilityRole="button"
          />

          <GradientButton
            label={t('screens.banned.signOut')}
            variant="secondary"
            size="md"
            onPress={handleSignOut}
            accessibilityLabel={t('screens.banned.signOut')}
            accessibilityRole="button"
          />
        </View>
      </Animated.View>
    </SafeAreaView>
  );
}

export default function BannedScreen() {
  return (
    <ScreenErrorBoundary>
      <BannedScreenContent />
    </ScreenErrorBoundary>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
  },
  contactText: {
    fontSize: fontSize.sm,
    textAlign: 'center',
    marginTop: spacing.lg,
    lineHeight: 20,
  },
  actions: {
    width: '100%',
    gap: spacing.md,
    marginTop: spacing.xl,
  },
});
