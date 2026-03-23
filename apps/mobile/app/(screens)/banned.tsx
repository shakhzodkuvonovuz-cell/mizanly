import { View, Text, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useClerk } from '@clerk/clerk-expo';
import { EmptyState } from '@/components/ui/EmptyState';
import { GradientButton } from '@/components/ui/GradientButton';
import { colors, spacing, fontSize } from '@/theme';
import { useTranslation } from '@/hooks/useTranslation';
import { useThemeColors } from '@/hooks/useThemeColors';
import { ScreenErrorBoundary } from '@/components/ui/ScreenErrorBoundary';

function BannedScreenContent() {
  const router = useRouter();
  const tc = useThemeColors();
  const { t } = useTranslation();
  const { signOut } = useClerk();

  const handleAppeal = () => {
    router.push('/(screens)/appeal-moderation');
  };

  const handleSignOut = async () => {
    await signOut();
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: tc.bg }]} edges={['top', 'bottom']}>
      <View style={styles.content}>
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
      </View>
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
    backgroundColor: colors.dark.bg,
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
    color: colors.text.secondary,
  },
  actions: {
    width: '100%',
    gap: spacing.md,
    marginTop: spacing.xl,
  },
});
