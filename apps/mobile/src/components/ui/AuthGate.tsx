import { useCallback, useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { useUser, useAuth } from '@clerk/clerk-expo';
import { useRouter } from 'expo-router';
import { colors, spacing, fontSize, radius, fonts } from '@/theme';
import { Icon } from './Icon';
import { GradientButton } from './GradientButton';
import { BottomSheet } from './BottomSheet';
import { useContextualHaptic } from '@/hooks/useContextualHaptic';
import { useTranslation } from '@/hooks/useTranslation';
import { rtlFlexRow, rtlTextAlign } from '@/utils/rtl';

interface AuthGateProps {
  children: React.ReactNode;
  /** Called when user is authenticated and performs the action */
  onAuthenticated?: () => void;
}

/**
 * Wraps interactive elements that require authentication.
 * - If signed in: renders children normally.
 * - If anonymous: wraps in a touchable that opens an auth BottomSheet.
 */
export function AuthGate({ children, onAuthenticated }: AuthGateProps) {
  const { isSignedIn } = useAuth();
  const [showAuth, setShowAuth] = useState(false);
  const haptic = useContextualHaptic();
  const { t, isRTL } = useTranslation();
  const router = useRouter();

  const handlePress = useCallback(() => {
    if (isSignedIn) {
      onAuthenticated?.();
      return;
    }
    haptic.longPress();
    setShowAuth(true);
  }, [isSignedIn, onAuthenticated, haptic]);

  if (isSignedIn) {
    return <>{children}</>;
  }

  return (
    <>
      <Pressable onPress={handlePress}>
        {children}
      </Pressable>
      <BottomSheet visible={showAuth} onClose={() => setShowAuth(false)} snapPoint={0.45}>
        <View style={styles.container}>
          <Text style={[styles.title, { textAlign: rtlTextAlign(isRTL) }]}>
            {t('auth.joinMizanly')}
          </Text>
          <Text style={[styles.subtitle, { textAlign: rtlTextAlign(isRTL) }]}>
            {t('auth.signUpToInteract')}
          </Text>
          <View style={styles.buttons}>
            <GradientButton
              label={t('auth.signUpFree')}
              onPress={() => {
                setShowAuth(false);
                router.push('/(auth)/sign-up');
              }}
            />
            <Pressable
              onPress={() => {
                setShowAuth(false);
                router.push('/(auth)/sign-in');
              }}
              style={styles.signInBtn}
              accessibilityLabel={t('auth.alreadyHaveAccount')}
              accessibilityRole="button"
              hitSlop={8}
            >
              <Text style={[styles.signInText, { textAlign: rtlTextAlign(isRTL) }]}>
                {t('auth.alreadyHaveAccount')}
              </Text>
            </Pressable>
          </View>
        </View>
      </BottomSheet>
    </>
  );
}

/**
 * Hook to get an auth-gated action handler.
 * Returns a function that either executes the action (if signed in) or shows auth prompt.
 */
export function useAuthGate() {
  const { isSignedIn } = useAuth();
  const [showAuth, setShowAuth] = useState(false);
  const haptic = useContextualHaptic();
  const router = useRouter();
  const { t, isRTL } = useTranslation();

  const gateAction = useCallback((action: () => void) => {
    if (isSignedIn) {
      action();
      return;
    }
    haptic.longPress();
    setShowAuth(true);
  }, [isSignedIn, haptic]);

  const AuthSheet = useCallback(() => (
    <BottomSheet visible={showAuth} onClose={() => setShowAuth(false)} snapPoint={0.45}>
      <View style={styles.container}>
        <Text style={[styles.title, { textAlign: rtlTextAlign(isRTL) }]}>
          {t('auth.joinMizanly')}
        </Text>
        <Text style={[styles.subtitle, { textAlign: rtlTextAlign(isRTL) }]}>
          {t('auth.signUpToInteract')}
        </Text>
        <View style={styles.buttons}>
          <GradientButton
            label={t('auth.signUpFree')}
            onPress={() => {
              setShowAuth(false);
              router.push('/(auth)/sign-up');
            }}
          />
          <Pressable
            onPress={() => {
              setShowAuth(false);
              router.push('/(auth)/sign-in');
            }}
            style={styles.signInBtn}
            accessibilityLabel={t('auth.alreadyHaveAccount')}
            accessibilityRole="button"
            hitSlop={8}
          >
            <Text style={[styles.signInText, { textAlign: rtlTextAlign(isRTL) }]}>
              {t('auth.alreadyHaveAccount')}
            </Text>
          </Pressable>
        </View>
      </View>
    </BottomSheet>
  ), [showAuth, isRTL, t, router]);

  return { gateAction, AuthSheet };
}

const styles = StyleSheet.create({
  container: {
    padding: spacing.xl,
    alignItems: 'center',
  },
  title: {
    color: colors.text.primary,
    fontSize: fontSize.lg,
    fontFamily: fonts.bodyBold,
    marginBottom: spacing.sm,
  },
  subtitle: {
    color: colors.text.secondary,
    fontSize: fontSize.base,
    marginBottom: spacing.xl,
  },
  buttons: {
    width: '100%',
    gap: spacing.md,
  },
  signInBtn: {
    alignSelf: 'center',
    paddingVertical: spacing.sm,
  },
  signInText: {
    color: colors.emerald,
    fontSize: fontSize.sm,
    fontFamily: fonts.bodyMedium,
  },
});
