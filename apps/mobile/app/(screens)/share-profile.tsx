import { useState } from 'react';
import { View, Text, StyleSheet, Pressable, Alert, Share } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import QRCode from 'react-native-qrcode-svg';
import * as Clipboard from 'expo-clipboard';
import { Icon } from '@/components/ui/Icon';
import { GlassHeader } from '@/components/ui/GlassHeader';
import { Avatar } from '@/components/ui/Avatar';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import { colors, spacing, fontSize, radius } from '@/theme';
import { usersApi } from '@/services/api';

export default function ShareProfileScreen() {
  const router = useRouter();
  const [copied, setCopied] = useState(false);

  const { data: user, isLoading, isError, refetch } = useQuery({
    queryKey: ['profile', 'me'],
    queryFn: () => usersApi.getMe(),
  });

  const profileUrl = user?.username ? `https://mizanly.app/@${user.username}` : '';

  const handleCopyLink = async () => {
    if (!profileUrl) return;
    await Clipboard.setStringAsync(profileUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleShare = async () => {
    if (!profileUrl) return;
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
    router.push('/(screens)/qr-scanner');
  };

  if (isLoading) {
    return (
      <View style={styles.container}>
        <GlassHeader
          title="Share Profile"
          leftAction={{ icon: 'arrow-left', onPress: () => router.back() }}
        />
        <View style={styles.headerSpacer} />
        <View style={styles.skeletonWrap}>
          <Skeleton.Rect width={200} height={200} borderRadius={radius.lg} style={styles.qrSkeleton} />
          <Skeleton.Rect width="60%" height={24} borderRadius={radius.sm} style={{ marginTop: spacing.xl }} />
          <Skeleton.Rect width="80%" height={20} borderRadius={radius.sm} style={{ marginTop: spacing.sm }} />
          <View style={styles.buttonRow}>
            <Skeleton.Rect width={100} height={48} borderRadius={radius.md} />
            <Skeleton.Rect width={100} height={48} borderRadius={radius.md} />
            <Skeleton.Rect width={100} height={48} borderRadius={radius.md} />
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
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <Icon name="arrow-left" size="md" color={colors.text.primary} />
        </Pressable>
        <Text style={styles.headerTitle}>Share Profile</Text>
        <View style={{ width: 24 }} />
      </View>

      <View style={styles.content}>
        <View style={styles.qrCard}>
          <QRCode
            value={profileUrl}
            size={200}
            color={colors.text.primary}
            backgroundColor={colors.dark.bgCard}
            logoBackgroundColor="transparent"
          />
          <View style={styles.avatarOverlay}>
            <Avatar uri={user.avatarUrl} name={user.displayName || user.username} size="lg" />
          </View>
        </View>

        <View style={styles.profileInfo}>
          <Text style={styles.profileName}>{user.displayName || user.username}</Text>
          <Text style={styles.profileUsername}>@{user.username}</Text>
        </View>

        <Text style={styles.shareHint}>Scan this QR code to visit your profile</Text>

        <View style={styles.buttonRow}>
          <Pressable style={[styles.button, styles.copyButton]} onPress={handleCopyLink}>
            <Icon name={copied ? 'check' : 'link'} size="md" color={colors.text.primary} />
            <Text style={styles.buttonLabel}>{copied ? 'Copied!' : 'Copy Link'}</Text>
          </Pressable>

          <Pressable style={[styles.button, styles.shareButton]} onPress={handleShare}>
            <Icon name="share" size="md" color={colors.text.primary} />
            <Text style={styles.buttonLabel}>Share</Text>
          </Pressable>

          <Pressable style={[styles.button, styles.scanButton]} onPress={handleScanQR}>
            <Icon name="camera" size="md" color={colors.text.primary} />
            <Text style={styles.buttonLabel}>Scan QR</Text>
          </Pressable>
        </View>
      </View>
    </View>
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
    borderBottomColor: colors.dark.border,
  },
  headerTitle: { color: colors.text.primary, fontSize: fontSize.md, fontWeight: '700' },
  content: { flex: 1, alignItems: 'center', padding: spacing.xl },
  qrCard: {
    width: 260,
    height: 260,
    backgroundColor: colors.dark.bgCard,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    shadowColor: colors.emerald,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 10,
  },
  avatarOverlay: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: [{ translateX: -24 }, { translateY: -24 }],
    width: 48,
    height: 48,
    borderRadius: radius.full,
    backgroundColor: colors.dark.bg,
    padding: 2,
  },
  profileInfo: {
    alignItems: 'center',
    marginTop: spacing.lg,
  },
  profileName: {
    color: colors.text.primary,
    fontSize: fontSize.lg,
    fontWeight: '700',
  },
  profileUsername: {
    color: colors.text.secondary,
    fontSize: fontSize.base,
    marginTop: 2,
  },
  shareHint: {
    color: colors.text.secondary,
    fontSize: fontSize.sm,
    textAlign: 'center',
    marginTop: spacing.xl,
    maxWidth: 300,
  },
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: spacing.xl,
    gap: spacing.base,
  },
  button: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
    minWidth: 100,
  },
  copyButton: { backgroundColor: colors.emerald },
  shareButton: { backgroundColor: colors.dark.surface },
  scanButton: { backgroundColor: colors.dark.surface },
  buttonLabel: {
    color: colors.text.primary,
    fontSize: fontSize.sm,
    fontWeight: '600',
    marginTop: spacing.xs,
  },
  skeletonWrap: {
    flex: 1,
    alignItems: 'center',
    paddingTop: spacing.xl * 2,
  },
  qrSkeleton: {
    marginBottom: spacing.xl,
  },
});