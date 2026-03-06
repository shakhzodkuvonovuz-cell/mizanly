import { useState } from 'react';
import { View, Text, StyleSheet, Pressable, Share, Alert } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import QRCode from 'react-native-qrcode-svg';
import { Icon } from '@/components/ui/Icon';
import { colors, spacing, fontSize, radius } from '@/theme';
import { useHaptic } from '@/hooks/useHaptic';

export default function QrCodeScreen() {
  const { username } = useLocalSearchParams<{ username: string }>();
  const router = useRouter();
  const haptic = useHaptic();
  const [loading, setLoading] = useState(false);

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

  const handleSave = () => {
    // TODO: Implement with expo-media-library if needed
    Alert.alert('Coming soon', 'Save to gallery feature will be added later.');
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={8} style={styles.backBtn}>
          <Icon name="arrow-left" size="md" color={colors.text.primary} />
        </Pressable>
        <Text style={styles.headerTitle}>QR Code</Text>
        <View style={styles.headerRight} />
      </View>

      <View style={styles.content}>
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
            <Icon name="download" size="md" color={colors.text.primary} />
            <Text style={styles.buttonText}>Save</Text>
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.dark.bg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.dark.border,
  },
  backBtn: {
    width: 36,
    alignItems: 'flex-start',
  },
  headerTitle: {
    color: colors.text.primary,
    fontSize: fontSize.md,
    fontWeight: '700',
  },
  headerRight: {
    width: 36,
  },
  content: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    paddingTop: spacing['2xl'],
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