import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Pressable, Share } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { GlassHeader } from '@/components/ui/GlassHeader';
import QRCode from 'react-native-qrcode-svg';
import { Icon } from '@/components/ui/Icon';
import { Skeleton } from '@/components/ui/Skeleton';
import { colors, spacing, fontSize, radius } from '@/theme';
import { useContextualHaptic } from '@/hooks/useContextualHaptic';
import { showToast } from '@/components/ui/Toast';
import { useTranslation } from '@/hooks/useTranslation';
import { useThemeColors } from '@/hooks/useThemeColors';
import { ScreenErrorBoundary } from '@/components/ui/ScreenErrorBoundary';

export default function QrCodeScreen() {
  const tc = useThemeColors();
  const styles = createStyles(tc);
  const { t, isRTL } = useTranslation();
  const { username } = useLocalSearchParams<{ username: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const haptic = useContextualHaptic();
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setIsLoading(false), 300);
    return () => clearTimeout(timer);
  }, []);

  const qrValue = `https://mizanly.app/@${username}`;

  const handleShare = async () => {
    try {
      haptic.navigate();
      await Share.share({
        message: t('screens.qr-code.shareMessage', { url: qrValue }),
        title: t('screens.qr-code.shareTitle'),
      });
    } catch (err) {
      showToast({ message: t('screens.qr-code.errorTitle'), variant: 'error' });
    }
  };

  const handleSave = async () => {
    // Fallback to share if expo-media-library is not available
    await handleShare();
  };

  return (
    <ScreenErrorBoundary>
      <View style={styles.container}>
        <GlassHeader title={t('screens.qr-code.title')} leftAction={{ icon: 'arrow-left', onPress: () => router.back(), accessibilityLabel: t('accessibility.goBack') }} />

        {isLoading ? (
          <View style={[styles.content, { gap: spacing.lg, paddingTop: insets.top + 52 }]}>
            <Skeleton.Text width={120} />
            <Skeleton.Text width={200} />
            <Skeleton.Rect width={220 + spacing.xl * 2} height={220 + spacing.xl * 2} borderRadius={radius.lg} />
            <Skeleton.Text width={240} />
            <View style={{ flexDirection: 'row', gap: spacing.base, width: '100%' }}>
              <Skeleton.Rect width="48%" height={48} borderRadius={radius.md} />
              <Skeleton.Rect width="48%" height={48} borderRadius={radius.md} />
            </View>
          </View>
        ) : (
        <View style={[styles.content, { paddingTop: insets.top + 52 }]}>
          <Animated.Text entering={FadeInUp.delay(100).duration(400)} style={styles.title}>@{username}</Animated.Text>
          <Animated.Text entering={FadeInUp.delay(150).duration(400)} style={styles.subtitle}>
            {t('screens.qr-code.shareHint')}
          </Animated.Text>

          <Animated.View entering={FadeInUp.delay(200).duration(400)}>
            <LinearGradient
              colors={['rgba(45,53,72,0.5)', 'rgba(28,35,51,0.3)']}
              style={styles.qrContainer}
            >
              <LinearGradient
                colors={['rgba(10,123,79,0.1)', 'rgba(200,150,62,0.05)']}
                style={styles.qrInner}
              >
                <QRCode
                  value={qrValue}
                  size={220}
                  backgroundColor="transparent"
                  color={tc.text.primary}
                />
              </LinearGradient>
            </LinearGradient>
          </Animated.View>

          <Animated.Text entering={FadeInUp.delay(250).duration(400)} style={styles.hint}>
            {t('screens.qr-code.saveHint')}
          </Animated.Text>

          <Animated.View entering={FadeInUp.delay(300).duration(400)} style={styles.buttons}>
            <Pressable
              accessibilityRole="button"
              style={styles.button}
              onPress={handleShare}
            >
              <LinearGradient
                colors={['rgba(45,53,72,0.6)', 'rgba(28,35,51,0.4)']}
                style={styles.shareGradient}
              >
                <Icon name="share" size="md" color={tc.text.primary} />
                <Text style={styles.buttonText}>{t('common.share')}</Text>
              </LinearGradient>
            </Pressable>

            <Pressable
              accessibilityRole="button"
              style={styles.button}
              onPress={handleSave}
            >
              <LinearGradient
                colors={[colors.emerald, colors.gold]}
                style={styles.saveGradient}
              >
                <Icon name="download" size="md" color="#fff" />
                <Text style={[styles.buttonText, styles.saveButtonText]}>{t('common.save')}</Text>
              </LinearGradient>
            </Pressable>
          </Animated.View>
        </View>
        )}
      </View>
  
    </ScreenErrorBoundary>
  );
}

const createStyles = (tc: ReturnType<typeof useThemeColors>) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: tc.bg,
  },
  content: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
  },
  title: {
    color: colors.text.primary,
    fontSize: fontSize.xl,
    fontWeight: '700',
    marginBottom: spacing.xs,
  },
  subtitle: {
    color: colors.text.secondary,
    fontSize: fontSize.base,
    textAlign: 'center',
    marginBottom: spacing['2xl'],
    maxWidth: 300,
  },
  qrContainer: {
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.xl,
    borderWidth: 0.5,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  qrInner: {
    borderRadius: radius.md,
    padding: spacing.xl,
  },
  hint: {
    color: colors.text.tertiary,
    fontSize: fontSize.sm,
    textAlign: 'center',
    marginBottom: spacing['2xl'],
  },
  buttons: {
    flexDirection: 'row',
    gap: spacing.base,
    width: '100%',
  },
  button: {
    flex: 1,
    borderRadius: radius.lg,
    overflow: 'hidden',
  },
  shareGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.active.white6,
  },
  saveGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    borderRadius: radius.lg,
    shadowColor: colors.emerald,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  buttonText: {
    color: colors.text.primary,
    fontSize: fontSize.base,
    fontWeight: '600',
  },
  saveButtonText: {
    color: '#fff',
  },
});