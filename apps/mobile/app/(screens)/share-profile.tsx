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
import { useHaptic } from '@/hooks/useHaptic';
import { ScreenErrorBoundary } from '@/components/ui/ScreenErrorBoundary';

export default function ShareProfileScreen() {
  const router = useRouter();
  const haptic = useHaptic();
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
    haptic.light();
    await Clipboard.setStringAsync(profileUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleShare = async () => {
    if (!profileUrl) return;
    haptic.light();
    try {
      await Share.share({
        url: profileUrl,
        message: profileUrl,
        title: `Check out ${user?.displayName || user?.username}'s profile on Mizanly`,
      });
    } catch (err) {
      // Sharing cancelled, ignore
    }
  };

  const handleScanQR = () => {
    haptic.light();
    router.push('/(screens)/qr-scanner');
  };

  if (isLoading || !isReady) {
    return (
      <View style={styles.container}>
        <GlassHeader
          title="Share Profile"
          leftAction={{ icon: 'arrow-left', onPress: () => router.back() }}
        />
        <View style={styles.headerSpacer} />
        <View style={styles.skeletonWrap}>
          {/* Glassmorphism QR skeleton */}
          <LinearGradient
            colors={['rgba(45,53,72,0.4)', 'rgba(28,35,51,0.2)']}
            style={styles.qrCardSkeleton}
          >
            <Skeleton.Rect width={180} height={180} borderRadius={radius.md} />
            <View style={styles.avatarOverlaySkeleton}>
              <Skeleton.Circle size={48} />
            </View>
          </LinearGradient>
          <Skeleton.Text width="50%" height={24} style={{ marginTop: spacing.xl }} />
          <Skeleton.Text width="30%" height={18} style={{ marginTop: spacing.sm }} />
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
          title="Share Profile"
          leftAction={{ icon: 'arrow-left', onPress: () => router.back() }}
        />
        <EmptyState
          icon="flag"
          title="Couldn't load profile"
          subtitle="Check your connection and try again"
          actionLabel="Retry"
          onAction={() => refetch()}
        />
      </View>
    );
  }

  if (!user) {
    return (
      <View style={styles.container}>
        <GlassHeader
          title="Share Profile"
          leftAction={{ icon: 'arrow-left', onPress: () => router.back() }}
        />
        <View style={styles.headerSpacer} />
        <EmptyState
          icon="user"
          title="Profile unavailable"
          subtitle="Unable to load your profile"
          actionLabel="Go back"
          onAction={() => router.back()}
        />
      </View>
    );
  }

  return (
    <ScreenErrorBoundary>
      <View style={styles.container}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} hitSlop={8} accessibilityLabel="Go back" accessibilityRole="button">
            <Icon name="arrow-left" size="md" color={colors.text.primary} />
          </Pressable>
          <Text style={styles.headerTitle}>Share Profile</Text>
          <View style={{ width: 24 }} />
        </View>

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
                  color={colors.text.primary}
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
                <Icon name="at-sign" size={12} color={colors.text.tertiary} />
                <Text style={styles.profileUsername}>{user.username}</Text>
              </View>
            </View>
          </Animated.View>

          {/* Share Hint */}
          <Animated.View entering={FadeInUp.delay(150).duration(400).springify()}>
            <Text style={styles.shareHint}>Scan this QR code to visit your profile</Text>
          </Animated.View>

          {/* Glassmorphism Action Buttons */}
          <Animated.View entering={FadeInUp.delay(200).duration(400).springify()} style={styles.buttonRow}>
            {/* Copy Link Button */}
            <Pressable
              style={styles.buttonWrapper}
              onPress={handleCopyLink}
              accessibilityLabel={copied ? "Link copied" : "Copy profile link"}
              accessibilityRole="button"
            >
              <LinearGradient
                colors={copied ? [colors.emerald, 'rgba(10,123,79,0.8)'] : ['rgba(45,53,72,0.6)', 'rgba(28,35,51,0.4)']}
                style={[styles.button, copied && styles.copyButtonActive]}
              >
                <Icon name={copied ? 'check' : 'link'} size="md" color={copied ? '#fff' : colors.text.primary} />
                <Text style={[styles.buttonLabel, copied && styles.buttonLabelActive]}>
                  {copied ? 'Copied!' : 'Copy Link'}
                </Text>
              </LinearGradient>
            </Pressable>

            {/* Share Button */}
            <Pressable
              style={styles.buttonWrapper}
              onPress={handleShare}
              accessibilityLabel="Share profile"
              accessibilityRole="button"
            >
              <LinearGradient
                colors={[colors.emerald, colors.gold]}
                style={[styles.button, styles.shareButton]}
              >
                <Icon name="share" size="md" color="#fff" />
                <Text style={[styles.buttonLabel, styles.shareButtonLabel]}>Share</Text>
              </LinearGradient>
            </Pressable>

            {/* Scan QR Button */}
            <Pressable
              style={styles.buttonWrapper}
              onPress={handleScanQR}
              accessibilityLabel="Scan QR code"
              accessibilityRole="button"
            >
              <LinearGradient
                colors={['rgba(45,53,72,0.6)', 'rgba(28,35,51,0.4)']}
                style={styles.button}
              >
                <Icon name="camera" size="md" color={colors.text.primary} />
                <Text style={styles.buttonLabel}>Scan QR</Text>
              </LinearGradient>
            </Pressable>
          </Animated.View>
        </View>
      </View>
  
    </ScreenErrorBoundary>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.dark.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
    borderBottomWidth: 0.5,
    borderBottomColor: 'rgba(255,255,255,0.06)',
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
    borderColor: 'rgba(255,255,255,0.06)',
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
    backgroundColor: colors.dark.bg,
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
