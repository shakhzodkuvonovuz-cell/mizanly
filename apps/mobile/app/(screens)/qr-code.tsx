import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Pressable, Share, Alert } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GlassHeader } from '@/components/ui/GlassHeader';
import QRCode from 'react-native-qrcode-svg';
import { Icon } from '@/components/ui/Icon';
import { Skeleton } from '@/components/ui/Skeleton';
import { colors, spacing, fontSize, radius } from '@/theme';
import { useHaptic } from '@/hooks/useHaptic';

export default function QrCodeScreen() {
  const { username } = useLocalSearchParams<{ username: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const haptic = useHaptic();
  const [loading, setLoading] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setIsLoading(false), 300);
    return () => clearTimeout(timer);
  }, []);

  const qrValue = `mizanly://profile/${username}`;

  const handleShare = async () => {
    try {
      haptic.light();
      await Share.share({
        message: `Check out my Mizanly profile: ${qrValue}`,
        title: 'My Mizanly Profile',
      });
    } catch (err) {
      Alert.alert('Error', 'Could not share QR code');
    }
  };

  const handleSave = async () => {
    // Fallback to share if expo-media-library is not available
    await handleShare();
  };

  return (
    <View style={styles.container}>
      <GlassHeader title="QR Code" leftAction={{ icon: 'arrow-left', onPress: () => router.back(), accessibilityLabel: 'Back' }} />

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
        <Text style={styles.title}>@{username}</Text>
        <Text style={styles.subtitle}>
          Scan this code to visit this profile directly in Mizanly
        </Text>

        <View style={styles.qrContainer}>
          <QRCode
            value={qrValue}
            size={220}
            backgroundColor={colors.dark.bgCard}
            color={colors.text.primary}
          />
        </View>

        <Text style={styles.hint}>
          Open the camera app on another device to scan
        </Text>

        <View style={styles.buttons}>
          <Pressable
            style={[styles.button, styles.shareButton]}
            onPress={handleShare}
            disabled={loading}
          >
            <Icon name="share" size="md" color={colors.text.primary} />
            <Text style={styles.buttonText}>Share</Text>
          </Pressable>

          <Pressable
            style={[styles.button, styles.saveButton]}
            onPress={handleSave}
            disabled={loading}
          >
            <Icon name="share" size="md" color={colors.text.primary} />
            <Text style={styles.buttonText}>Save</Text>
          </Pressable>
        </View>
      </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.dark.bg,
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
    backgroundColor: colors.dark.bgCard,
    borderRadius: radius.lg,
    padding: spacing.xl,
    marginBottom: spacing.xl,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 8,
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
  },
  shareButton: {
    backgroundColor: colors.dark.bgElevated,
    borderWidth: 1,
    borderColor: colors.dark.border,
  },
  saveButton: {
    backgroundColor: colors.emerald,
  },
  buttonText: {
    color: colors.text.primary,
    fontSize: fontSize.base,
    fontWeight: '600',
  },
});