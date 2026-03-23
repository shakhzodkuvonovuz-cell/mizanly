import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Pressable, Alert, Share } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import QRCode from 'react-native-qrcode-svg';
import * as Clipboard from 'expo-clipboard';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { Icon } from '@/components/ui/Icon';
import { GlassHeader } from '@/components/ui/GlassHeader';
import { Avatar } from '@/components/ui/Avatar';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import { GradientButton } from '@/components/ui/GradientButton';
import { colors, spacing, fontSize, radius } from '@/theme';
import { usersApi } from '@/services/api';
import { useContextualHaptic } from '@/hooks/useContextualHaptic';
import { ScreenErrorBoundary } from '@/components/ui/ScreenErrorBoundary';
import { useTranslation } from '@/hooks/useTranslation';
import { useThemeColors } from '@/hooks/useThemeColors';

export default function ShareProfileScreen() {
  const tc = useThemeColors();
  const styles = createStyles(tc);
  const { t, isRTL } = useTranslation();
  const router = useRouter();
  const haptic = useContextualHaptic();
  const [copied, setCopied] = useState(false);
  const [isReady, setIsReady] = useState(false);

  const { data: user, isLoading, isError, refetch } = useQuery({
    queryKey: ['profile', 'me'],
    queryFn: () => usersApi.getMe(),
  });

  useEffect(() => {
    const timer = setTimeout(() => setIsReady(true), 300);
    return () => clearTimeout(timer);
  }, []);

  const profileUrl = user?.username ? `https://mizanly.app/@${user.username}` : '';

  const handleCopyLink = async () => {
    if (!profileUrl) return;
    haptic.save();
    await Clipboard.setStringAsync(profileUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleShare = async () => {
    if (!profileUrl) return;
    haptic.navigate();
    try {
      await Share.share({
        url: profileUrl,
        message: profileUrl,
        title: t('screens.share-profile.shareTitle', { name: user?.displayName || user?.username }),
      });
    } catch (err) {
      // Sharing cancelled, ignore
    }
  };

  const handleScanQR = () => {
    haptic.navigate();
    router.push('/(screens)/qr-scanner');
  };

  if (isLoading || !isReady) {
    return (
      <View style={styles.container}>
        <GlassHeader
          title={t('screens.share-profile.title')}
          leftAction={{ icon: 'arrow-left', onPress: () => router.back(), accessibilityLabel: t('accessibility.goBack') }}
        />
        <View style={styles.headerSpacer} />
        <View style={styles.skeletonWrap}>
          {/* Glassmorphism QR skeleton */}
          <LinearGradient
            colors={colors.gradient.cardDark}
            style={styles.qrCardSkeleton}
          >
            <Skeleton.Rect width={180} height={180} borderRadius={radius.md} />
            <View style={styles.avatarOverlaySkeleton}>
              <Skeleton.Circle size={48} />
            </View>
          </LinearGradient>
          <Skeleton.Rect width="50%" height={24} borderRadius={4} style={{ marginTop: spacing.xl }} />
          <Skeleton.Rect width="30%" height={18} borderRadius={4} style={{ marginTop: spacing.sm }} />
          <View style={styles.buttonRow}>
            <Skeleton.Rect width={100} height={48} borderRadius={radius.lg} />
            <Skeleton.Rect width={100} height={48} borderRadius={radius.lg} />
            <Skeleton.Rect width={100} height={48} borderRadius={radius.lg} />
          </View>
        </View>
      </View>
    );
  }

  if (isError) {
    return (
      <View style={styles.container}>
        <GlassHeader
          title={t('screens.share-profile.title')}
          leftAction={{ icon: 'arrow-left', onPress: () => router.back(), accessibilityLabel: t('accessibility.goBack') }}
        />
        <EmptyState
          icon="flag"
          title={t('screens.share-profile.errorTitle')}
          subtitle={t('screens.share-profile.errorSubtitle')}
          actionLabel={t('common.retry')}
          onAction={() => refetch()}
        />
      </View>
    );
  }

  if (!user) {
    return (
      <View style={styles.container}>
        <GlassHeader
          title={t('screens.share-profile.title')}
          leftAction={{ icon: 'arrow-left', onPress: () => router.back(), accessibilityLabel: t('accessibility.goBack') }}
        />
        <View style={styles.headerSpacer} />
        <EmptyState
          icon="user"
          title={t('screens.share-profile.profileUnavailable')}
          subtitle={t('screens.share-profile.profileUnavailableDesc')}
          actionLabel={t('common.back')}
          onAction={() => router.back()}
        />
      </View>
    );
  }

  return (
    <ScreenErrorBoundary>
      <View style={styles.container}>
        <GlassHeader
          title={t('screens.share-profile.title')}
          leftAction={{ icon: 'arrow-left', onPress: () => router.back(), accessibilityLabel: t('accessibility.goBack') }}
        />

        <View style={styles.content}>
          {/* Glassmorphism QR Card */}
          <Animated.View entering={FadeInUp.duration(400).springify()}>
            <LinearGradient
              colors={['rgba(45,53,72,0.5)', 'rgba(28,35,51,0.3)']}
              style={styles.qrCard}
            >
              <LinearGradient
                colors={['rgba(10,123,79,0.08)', 'rgba(200,150,62,0.05)']}
                style={styles.qrInner}
              >
                <QRCode
                  value={profileUrl}
                  size={180}
                  color={tc.text.primary}
                  backgroundColor="transparent"
                  logoBackgroundColor="transparent"
                />
              </LinearGradient>
              <View style={styles.avatarOverlay}>
                <LinearGradient
                  colors={[colors.emerald, colors.gold]}
                  style={styles.avatarRing}
                >
                  <View style={styles.avatarInner}>
                    <Avatar uri={user.avatarUrl} name={user.displayName || user.username} size="lg" />
                  </View>
                </LinearGradient>
              </View>
            </LinearGradient>
          </Animated.View>

          {/* Profile Info */}
          <Animated.View entering={FadeInUp.delay(100).duration(400).springify()}>
            <View style={styles.profileInfo}>
              <Text style={styles.profileName}>{user.displayName || user.username}</Text>
              <View style={styles.usernameBadge}>
                <Icon name="at-sign" size={12} color={tc.text.tertiary} />
                <Text style={styles.profileUsername}>{user.username}</Text>
              </View>
            </View>
          </Animated.View>

          {/* Share Hint */}
          <Animated.View entering={FadeInUp.delay(150).duration(400).springify()}>
            <Text style={styles.shareHint}>{t('screens.share-profile.hint')}</Text>
          </Animated.View>

          {/* Glassmorphism Action Buttons */}
          <Animated.View entering={FadeInUp.delay(200).duration(400).springify()} style={styles.buttonRow}>
            {/* Copy Link Button */}
            <Pressable
              style={styles.buttonWrapper}
              onPress={handleCopyLink}
              accessibilityLabel={copied ? t('screens.share-profile.copied') : t('screens.share-profile.copyLink')}
              accessibilityRole="button"
            >
              <LinearGradient
                colors={copied ? [colors.emerald, 'rgba(10,123,79,0.8)'] : ['rgba(45,53,72,0.6)', 'rgba(28,35,51,0.4)']}
                style={[styles.button, copied && styles.copyButtonActive]}
              >
                <Icon name={copied ? 'check' : 'link'} size="md" color={copied ? '#fff' : tc.text.primary} />
                <Text style={[styles.buttonLabel, copied && styles.buttonLabelActive]}>
                  {copied ? t('screens.share-profile.copied') : t('screens.share-profile.copyLink')}
                </Text>
              </LinearGradient>
            </Pressable>

            {/* Share Button */}
            <Pressable
              style={styles.buttonWrapper}
              onPress={handleShare}
              accessibilityLabel={t('screens.share-profile.title')}
              accessibilityRole="button"
            >
              <LinearGradient
                colors={[colors.emerald, colors.gold]}
                style={[styles.button, styles.shareButton]}
              >
                <Icon name="share" size="md" color="#fff" />
                <Text style={[styles.buttonLabel, styles.shareButtonLabel]}>{t('common.share')}</Text>
              </LinearGradient>
            </Pressable>

            {/* Scan QR Button */}
            <Pressable
              style={styles.buttonWrapper}
              onPress={handleScanQR}
              accessibilityLabel={t('screens.share-profile.scanQR')}
              accessibilityRole="button"
            >
              <LinearGradient
                colors={['rgba(45,53,72,0.6)', 'rgba(28,35,51,0.4)']}
                style={styles.button}
              >
                <Icon name="camera" size="md" color={tc.text.primary} />
                <Text style={styles.buttonLabel}>{t('screens.share-profile.scanQR')}</Text>
              </LinearGradient>
            </Pressable>
          </Animated.View>
        </View>
      </View>
  
    </ScreenErrorBoundary>
  );
}

const createStyles = (tc: ReturnType<typeof useThemeColors>) => StyleSheet.create({
  container: { flex: 1, backgroundColor: tc.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.active.white6,
  },
  headerSpacer: {
    height: 100,
  },
  headerTitle: { color: colors.text.primary, fontSize: fontSize.md, fontWeight: '700' },
  content: { flex: 1, alignItems: 'center', padding: spacing.xl },

  // QR Card with glassmorphism
  qrCard: {
    width: 280,
    height: 280,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    borderWidth: 0.5,
    borderColor: 'rgba(255,255,255,0.08)',
    shadowColor: colors.emerald,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 24,
    elevation: 12,
  },
  qrCardSkeleton: {
    width: 280,
    height: 280,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    borderWidth: 0.5,
    borderColor: colors.active.white6,
  },
  qrInner: {
    width: 220,
    height: 220,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 0.5,
    borderColor: 'rgba(255,255,255,0.04)',
  },
  avatarOverlay: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: [{ translateX: -32 }, { translateY: -32 }],
    width: 64,
    height: 64,
    borderRadius: radius.full,
    padding: 3,
  },
  avatarOverlaySkeleton: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: [{ translateX: -32 }, { translateY: -32 }],
  },
  avatarRing: {
    width: 64,
    height: 64,
    borderRadius: radius.full,
    padding: 3,
    shadowColor: colors.emerald,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  avatarInner: {
    width: 58,
    height: 58,
    borderRadius: radius.full,
    backgroundColor: tc.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Profile Info
  profileInfo: {
    alignItems: 'center',
    marginTop: spacing.lg,
  },
  profileName: {
    color: colors.text.primary,
    fontSize: fontSize.lg,
    fontWeight: '700',
  },
  usernameBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  profileUsername: {
    color: colors.text.secondary,
    fontSize: fontSize.base,
  },
  shareHint: {
    color: colors.text.tertiary,
    fontSize: fontSize.sm,
    textAlign: 'center',
    marginTop: spacing.lg,
    maxWidth: 300,
  },

  // Glassmorphism Buttons
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: spacing.xl,
    gap: spacing.base,
  },
  buttonWrapper: {
    borderRadius: radius.lg,
    overflow: 'hidden',
  },
  button: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.lg,
    minWidth: 100,
    borderWidth: 0.5,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  copyButtonActive: {
    shadowColor: colors.emerald,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  shareButton: {
    shadowColor: colors.emerald,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },
  buttonLabel: {
    color: colors.text.primary,
    fontSize: fontSize.sm,
    fontWeight: '600',
    marginTop: spacing.xs,
  },
  buttonLabelActive: {
    color: '#fff',
  },
  shareButtonLabel: {
    color: '#fff',
  },

  // Skeleton Loading
  skeletonWrap: {
    flex: 1,
    alignItems: 'center',
    paddingTop: spacing.xl * 2,
  },
});
