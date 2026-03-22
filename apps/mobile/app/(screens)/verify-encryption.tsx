import { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Animated, { FadeIn, FadeInUp } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import * as Clipboard from 'expo-clipboard';
import QRCode from 'react-native-qrcode-svg';
import { Icon } from '@/components/ui/Icon';
import { GlassHeader } from '@/components/ui/GlassHeader';
import { GradientButton } from '@/components/ui/GradientButton';
import { Skeleton } from '@/components/ui/Skeleton';
import { ScreenErrorBoundary } from '@/components/ui/ScreenErrorBoundary';
import { showToast } from '@/components/ui/Toast';
import { colors, fonts, spacing, fontSize, radius } from '@/theme';
import { encryptionService } from '@/services/encryption';
import { encryptionApi } from '@/services/encryptionApi';
import { useTranslation } from '@/hooks/useTranslation';
import { useContextualHaptic } from '@/hooks/useContextualHaptic';
import { useThemeColors } from '@/hooks/useThemeColors';
import { navigate } from '@/utils/navigation';

const VERIFIED_KEY_PREFIX = 'verified_';

function formatFingerprint(raw: string): string {
  const clean = raw.replace(/\s/g, '');
  return clean.match(/.{1,4}/g)?.join(' ') ?? clean;
}

/**
 * Compute a safety number from two fingerprints.
 * Sorted by userId for deterministic order, concatenated, hashed to 60 digits.
 */
function computeSafetyNumber(fpA: string, fpB: string, userIdA: string, userIdB: string): string {
  const sorted = [userIdA, userIdB].sort();
  const first = sorted[0] === userIdA ? fpA : fpB;
  const second = sorted[0] === userIdA ? fpB : fpA;
  const combined = first + second;

  // Simple hash to decimal digits (no crypto module needed on mobile)
  let hash = 0;
  for (let i = 0; i < combined.length; i++) {
    hash = ((hash << 5) - hash + combined.charCodeAt(i)) | 0;
  }

  // Generate 60 digits deterministically from hash seed
  let digits = '';
  let seed = Math.abs(hash);
  for (let i = 0; i < 60; i++) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    digits += (seed % 10).toString();
  }

  // Format as groups of 5 digits
  return digits.match(/.{5}/g)!.join(' ');
}

function VerifyEncryptionContent() {
  const tc = useThemeColors();
  const styles = createStyles(tc);
  const { t } = useTranslation();
  const router = useRouter();
  const haptic = useContextualHaptic();
  const { userId, displayName, conversationId } = useLocalSearchParams<{
    userId: string;
    displayName: string;
    conversationId: string;
  }>();

  const [myFingerprint, setMyFingerprint] = useState<string>('');
  const [theirFingerprint, setTheirFingerprint] = useState<string>('');
  const [safetyNumber, setSafetyNumber] = useState<string>('');
  const [isVerified, setIsVerified] = useState(false);
  const [loading, setLoading] = useState(true);
  const [verifying, setVerifying] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const loadData = async () => {
      try {
        // Initialize encryption if needed
        if (!encryptionService.isInitialized()) {
          await encryptionService.initialize();
        }

        // Get own fingerprint
        const ownFp = encryptionService.getFingerprint();
        if (!cancelled) setMyFingerprint(ownFp);

        // Fetch their public key fingerprint
        if (userId) {
          try {
            const response = await encryptionApi.getPublicKey(userId);
            if (!cancelled && response?.fingerprint) {
              setTheirFingerprint(response.fingerprint);
            }
          } catch {
            // Their key not available
          }
        }

        // Compute safety number from both fingerprints
        if (ownFp && userId) {
          try {
            const response = await encryptionApi.getPublicKey(userId);
            if (!cancelled && response?.fingerprint) {
              const safeNum = computeSafetyNumber(
                ownFp,
                response.fingerprint,
                encryptionService.getUserId?.() || 'self',
                userId,
              );
              setSafetyNumber(safeNum);
            }
          } catch {
            // Safety number unavailable
          }
        }

        // Check verification status
        if (conversationId) {
          const stored = await AsyncStorage.getItem(
            `${VERIFIED_KEY_PREFIX}${conversationId}`
          );
          if (!cancelled && stored === 'true') {
            setIsVerified(true);
          }
        }
      } catch {
        // Non-critical — screen still renders
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    loadData();
    return () => {
      cancelled = true;
    };
  }, [userId, conversationId]);

  const handleCopy = useCallback(
    async (text: string) => {
      haptic.save();
      await Clipboard.setStringAsync(text);
      showToast({ message: t('screens.verify-encryption.copiedMessage'), variant: 'success' });
    },
    [haptic, t]
  );

  const handleMarkVerified = useCallback(async () => {
    if (!conversationId) return;
    setVerifying(true);
    haptic.success();
    try {
      await AsyncStorage.setItem(
        `${VERIFIED_KEY_PREFIX}${conversationId}`,
        'true'
      );
      setIsVerified(true);
    } catch {
      showToast({ message: t('screens.verify-encryption.verifyError'), variant: 'error' });
    } finally {
      setVerifying(false);
    }
  }, [conversationId, haptic, t]);

  const handleUnmark = useCallback(async () => {
    if (!conversationId) return;
    haptic.delete();
    try {
      await AsyncStorage.removeItem(
        `${VERIFIED_KEY_PREFIX}${conversationId}`
      );
      setIsVerified(false);
    } catch {
      // silent
    }
  }, [conversationId, haptic]);

  const handleScanQr = useCallback(() => {
    haptic.navigate();
    navigate('/(screens)/qr-scanner');
  }, [haptic, router]);

  const formattedMyFp = formatFingerprint(myFingerprint);
  const formattedTheirFp = formatFingerprint(theirFingerprint);
  const qrValue = myFingerprint
    ? `mizanly://verify/${conversationId}?fp=${myFingerprint.replace(/\s/g, '')}`
    : '';

  if (loading) {
    return (
      <View style={styles.container}>
        <GlassHeader
          title={t('screens.verify-encryption.title')}
          leftAction={{
            icon: 'arrow-left',
            onPress: () => router.back(),
            accessibilityLabel: t('accessibility.goBack'),
          }}
        />
        <View style={styles.loadingContent}>
          <Skeleton.Circle size={80} />
          <View style={{ marginTop: spacing.lg }} />
          <Skeleton.Text width={200} />
          <View style={{ marginTop: spacing.sm }} />
          <Skeleton.Text width={260} />
          <View style={{ marginTop: spacing['2xl'] }} />
          <Skeleton.Rect width="90%" height={100} borderRadius={radius.md} />
          <View style={{ marginTop: spacing.base }} />
          <Skeleton.Rect width="90%" height={100} borderRadius={radius.md} />
          <View style={{ marginTop: spacing['2xl'] }} />
          <Skeleton.Rect width={200} height={200} borderRadius={radius.md} />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <GlassHeader
        title={t('screens.verify-encryption.title')}
        leftAction={{
          icon: 'arrow-left',
          onPress: () => router.back(),
          accessibilityLabel: t('accessibility.goBack'),
        }}
      />

      <SafeAreaView style={styles.safeArea} edges={['bottom']}>
        <Animated.ScrollView
          entering={FadeIn.duration(300)}
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Shield Icon */}
          <Animated.View
            entering={FadeInUp.delay(100).duration(400)}
            style={styles.shieldContainer}
          >
            <LinearGradient
              colors={[colors.active.emerald20, colors.active.emerald10]}
              style={styles.shieldGradient}
            >
              <View style={styles.shieldInner}>
                <Icon name="lock" size="xl" color={colors.emerald} />
              </View>
            </LinearGradient>
          </Animated.View>

          {/* Description */}
          <Animated.Text
            entering={FadeInUp.delay(150).duration(400)}
            style={styles.description}
          >
            {t('screens.verify-encryption.description')}
          </Animated.Text>

          {/* Your Fingerprint Card */}
          <Animated.View
            entering={FadeInUp.delay(200).duration(400)}
            style={styles.cardWrapper}
          >
            <LinearGradient
              colors={['rgba(45,53,72,0.5)', 'rgba(28,35,51,0.3)']}
              style={styles.card}
            >
              <Text style={styles.cardLabel}>
                {t('screens.verify-encryption.yourCode')}
              </Text>
              <Text style={styles.fingerprint} selectable>
                {formattedMyFp || t('screens.verify-encryption.unavailable')}
              </Text>
              {formattedMyFp ? (
                <Pressable
                  style={styles.copyButton}
                  onPress={() => handleCopy(formattedMyFp)}
                  accessibilityRole="button"
                  accessibilityLabel={t('screens.verify-encryption.copyCode')}
                >
                  <Icon name="layers" size="sm" color={colors.emerald} />
                  <Text style={styles.copyText}>
                    {t('screens.verify-encryption.copy')}
                  </Text>
                </Pressable>
              ) : null}
            </LinearGradient>
          </Animated.View>

          {/* Their Fingerprint Card */}
          <Animated.View
            entering={FadeInUp.delay(250).duration(400)}
            style={styles.cardWrapper}
          >
            <LinearGradient
              colors={['rgba(45,53,72,0.5)', 'rgba(28,35,51,0.3)']}
              style={styles.card}
            >
              <Text style={styles.cardLabel}>
                {t('screens.verify-encryption.theirCode', {
                  name: displayName ?? t('screens.verify-encryption.unknown'),
                })}
              </Text>
              <Text style={styles.fingerprint} selectable>
                {formattedTheirFp ||
                  t('screens.verify-encryption.unavailable')}
              </Text>
              {formattedTheirFp ? (
                <Pressable
                  style={styles.copyButton}
                  onPress={() => handleCopy(formattedTheirFp)}
                  accessibilityRole="button"
                  accessibilityLabel={t('screens.verify-encryption.copyCode')}
                >
                  <Icon name="layers" size="sm" color={colors.emerald} />
                  <Text style={styles.copyText}>
                    {t('screens.verify-encryption.copy')}
                  </Text>
                </Pressable>
              ) : null}
            </LinearGradient>
          </Animated.View>

          {/* Safety Number Display */}
          {safetyNumber ? (
            <Animated.View
              entering={FadeInUp.delay(275).duration(400)}
              style={styles.cardWrapper}
            >
              <LinearGradient
                colors={['rgba(10,123,79,0.15)', 'rgba(10,123,79,0.05)']}
                style={styles.card}
              >
                <Text style={styles.cardLabel}>
                  {t('encryption.safetyNumber')}
                </Text>
                <Text style={styles.safetyNumberText} selectable>
                  {safetyNumber}
                </Text>
                <Pressable
                  style={styles.copyButton}
                  onPress={() => handleCopy(safetyNumber)}
                  accessibilityRole="button"
                  accessibilityLabel={t('screens.verify-encryption.copyCode')}
                >
                  <Icon name="layers" size="sm" color={colors.emerald} />
                  <Text style={styles.copyText}>
                    {t('screens.verify-encryption.copy')}
                  </Text>
                </Pressable>
              </LinearGradient>
            </Animated.View>
          ) : null}

          {/* QR Code Section */}
          {qrValue ? (
            <Animated.View
              entering={FadeInUp.delay(300).duration(400)}
              style={styles.qrSection}
            >
              <Text style={styles.qrLabel}>
                {t('screens.verify-encryption.qrTitle')}
              </Text>
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
                    size={180}
                    backgroundColor="transparent"
                    color={tc.text.primary}
                  />
                </LinearGradient>
              </LinearGradient>
              <Pressable
                style={styles.scanButton}
                onPress={handleScanQr}
                accessibilityRole="button"
                accessibilityLabel={t('screens.verify-encryption.scanQr')}
              >
                <Icon name="camera" size="sm" color={colors.emerald} />
                <Text style={styles.scanText}>
                  {t('screens.verify-encryption.scanQr')}
                </Text>
              </Pressable>
            </Animated.View>
          ) : null}

          {/* Verification Status */}
          <Animated.View
            entering={FadeInUp.delay(350).duration(400)}
            style={styles.statusSection}
          >
            {isVerified ? (
              <Pressable onPress={handleUnmark} style={styles.statusPill}>
                <LinearGradient
                  colors={[colors.active.emerald20, colors.active.emerald10]}
                  style={styles.statusPillInner}
                >
                  <Icon name="check-circle" size="sm" color={colors.emerald} />
                  <Text style={styles.statusTextVerified}>
                    {t('screens.verify-encryption.verified')}
                  </Text>
                </LinearGradient>
              </Pressable>
            ) : (
              <View style={styles.statusPill}>
                <LinearGradient
                  colors={['rgba(210,153,34,0.2)', 'rgba(210,153,34,0.1)']}
                  style={styles.statusPillInner}
                >
                  <Icon name="clock" size="sm" color={colors.warning} />
                  <Text style={styles.statusTextUnverified}>
                    {t('screens.verify-encryption.notVerified')}
                  </Text>
                </LinearGradient>
              </View>
            )}
          </Animated.View>

          {/* Mark as Verified Button */}
          {!isVerified ? (
            <Animated.View
              entering={FadeInUp.delay(400).duration(400)}
              style={styles.verifyButtonWrapper}
            >
              <GradientButton
                label={t('screens.verify-encryption.markVerified')}
                onPress={handleMarkVerified}
                loading={verifying}
                icon="check"
                fullWidth
                size="lg"
              />
            </Animated.View>
          ) : null}

          {/* Info Text */}
          <Animated.View
            entering={FadeInUp.delay(450).duration(400)}
            style={styles.infoSection}
          >
            <LinearGradient
              colors={['rgba(45,53,72,0.3)', 'rgba(28,35,51,0.15)']}
              style={styles.infoCard}
            >
              <Icon name="lock" size="sm" color={tc.text.tertiary} />
              <Text style={styles.infoText}>
                {t('screens.verify-encryption.infoText')}
              </Text>
            </LinearGradient>
          </Animated.View>
        </Animated.ScrollView>
      </SafeAreaView>
    </View>
  );
}

export default function VerifyEncryptionScreen() {
  return (
    <ScreenErrorBoundary>
      <VerifyEncryptionContent />
    </ScreenErrorBoundary>
  );
}

const createStyles = (tc: ReturnType<typeof useThemeColors>) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: tc.bg,
  },
  safeArea: {
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingTop: 100,
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing['3xl'],
    alignItems: 'center',
  },
  loadingContent: {
    flex: 1,
    alignItems: 'center',
    paddingTop: 120,
    paddingHorizontal: spacing.xl,
  },

  // Shield
  shieldContainer: {
    marginBottom: spacing.lg,
  },
  shieldGradient: {
    width: 80,
    height: 80,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.emerald,
  },
  shieldInner: {
    width: 56,
    height: 56,
    borderRadius: radius.full,
    backgroundColor: colors.active.emerald10,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Description
  description: {
    fontFamily: fonts.body,
    fontSize: fontSize.base,
    color: colors.text.secondary,
    textAlign: 'center',
    marginBottom: spacing['2xl'],
    maxWidth: 300,
    lineHeight: 22,
  },

  // Fingerprint Cards
  cardWrapper: {
    width: '100%',
    marginBottom: spacing.base,
  },
  card: {
    borderRadius: radius.lg,
    padding: spacing.base,
    borderWidth: 0.5,
    borderColor: colors.glass.border,
  },
  cardLabel: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSize.sm,
    color: colors.text.secondary,
    marginBottom: spacing.sm,
  },
  fingerprint: {
    fontFamily: fonts.mono,
    fontSize: fontSize.md,
    color: colors.text.primary,
    letterSpacing: 1.5,
    marginBottom: spacing.md,
    lineHeight: 26,
  },
  safetyNumberText: {
    fontFamily: fonts.mono,
    fontSize: fontSize.base,
    color: colors.emerald,
    letterSpacing: 2,
    lineHeight: 28,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  copyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.active.emerald10,
    borderRadius: radius.full,
    gap: spacing.xs,
  },
  copyText: {
    fontFamily: fonts.bodyMedium,
    fontSize: fontSize.sm,
    color: colors.emerald,
  },

  // QR Section
  qrSection: {
    alignItems: 'center',
    marginTop: spacing.base,
    marginBottom: spacing.lg,
    width: '100%',
  },
  qrLabel: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSize.base,
    color: colors.text.primary,
    marginBottom: spacing.base,
  },
  qrContainer: {
    borderRadius: radius.lg,
    padding: spacing.base,
    borderWidth: 0.5,
    borderColor: colors.glass.border,
  },
  qrInner: {
    borderRadius: radius.md,
    padding: spacing.lg,
  },
  scanButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.base,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.active.emerald10,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.emerald,
  },
  scanText: {
    fontFamily: fonts.bodyMedium,
    fontSize: fontSize.base,
    color: colors.emerald,
  },

  // Status
  statusSection: {
    marginBottom: spacing.lg,
    width: '100%',
    alignItems: 'center',
  },
  statusPill: {
    borderRadius: radius.full,
    overflow: 'hidden',
  },
  statusPillInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.full,
  },
  statusTextVerified: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSize.base,
    color: colors.emerald,
  },
  statusTextUnverified: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSize.base,
    color: colors.warning,
  },

  // Verify Button
  verifyButtonWrapper: {
    width: '100%',
    marginBottom: spacing.lg,
  },

  // Info
  infoSection: {
    width: '100%',
  },
  infoCard: {
    flexDirection: 'row',
    borderRadius: radius.md,
    padding: spacing.base,
    gap: spacing.md,
    borderWidth: 0.5,
    borderColor: colors.glass.border,
    alignItems: 'flex-start',
  },
  infoText: {
    flex: 1,
    fontFamily: fonts.body,
    fontSize: fontSize.sm,
    color: colors.text.tertiary,
    lineHeight: 20,
  },
});
