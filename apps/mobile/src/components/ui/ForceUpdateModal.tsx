import React from 'react';
import { View, Text, StyleSheet, Platform, Linking } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useThemeColors } from '@/hooks/useThemeColors';
import { useTranslation } from '@/hooks/useTranslation';
import { GradientButton } from '@/components/ui/GradientButton';
import { Icon } from '@/components/ui/Icon';
import { colors, spacing, fontSize, fonts, radius } from '@/theme';

const IOS_APP_STORE_URL = 'https://apps.apple.com/app/mizanly/id0000000000';
const ANDROID_PLAY_STORE_URL = 'https://play.google.com/store/apps/details?id=app.mizanly.mobile';

interface ForceUpdateModalProps {
  visible: boolean;
  currentVersion: string;
  requiredVersion: string;
}

export function ForceUpdateModal({ visible, currentVersion, requiredVersion }: ForceUpdateModalProps) {
  const tc = useThemeColors();
  const { t } = useTranslation();

  if (!visible) return null;

  const handleUpdate = () => {
    const url = Platform.OS === 'ios' ? IOS_APP_STORE_URL : ANDROID_PLAY_STORE_URL;
    Linking.openURL(url);
  };

  return (
    <View style={styles.overlay}>
      <LinearGradient
        colors={[colors.emeraldDark, colors.emerald, colors.emeraldLight]}
        style={styles.gradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      >
        <View style={styles.content}>
          <View style={styles.iconContainer}>
            <Icon name="trending-up" size="xl" color={colors.cream} />
          </View>

          <Text style={styles.title}>
            {t('forceUpdate.title')}
          </Text>

          <Text style={styles.subtitle}>
            {t('forceUpdate.subtitle')}
          </Text>

          <View style={styles.versionInfo}>
            <View style={styles.versionRow}>
              <Text style={styles.versionLabel}>
                {t('forceUpdate.currentVersion')}
              </Text>
              <Text style={styles.versionValue}>{currentVersion}</Text>
            </View>
            <View style={styles.versionRow}>
              <Text style={styles.versionLabel}>
                {t('forceUpdate.requiredVersion')}
              </Text>
              <Text style={styles.versionValue}>{requiredVersion}</Text>
            </View>
          </View>

          <View style={styles.buttonContainer}>
            <GradientButton
              label={t('forceUpdate.updateButton')}
              onPress={handleUpdate}
              variant="secondary"
              size="lg"
              fullWidth
            />
          </View>
        </View>
      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 99999,
  },
  gradient: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    maxWidth: 340,
  },
  iconContainer: {
    width: 80,
    height: 80,
    borderRadius: radius.full,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing['2xl'],
  },
  title: {
    fontFamily: fonts.headingBold,
    fontSize: fontSize.xl,
    color: colors.cream,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  subtitle: {
    fontFamily: fonts.body,
    fontSize: fontSize.base,
    color: 'rgba(255, 255, 255, 0.85)',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: spacing['2xl'],
  },
  versionInfo: {
    backgroundColor: 'rgba(0, 0, 0, 0.15)',
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.base,
    width: '100%',
    marginBottom: spacing['2xl'],
  },
  versionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.xs,
  },
  versionLabel: {
    fontFamily: fonts.bodyMedium,
    fontSize: fontSize.sm,
    color: 'rgba(255, 255, 255, 0.7)',
  },
  versionValue: {
    fontFamily: fonts.bodyBold,
    fontSize: fontSize.sm,
    color: colors.cream,
  },
  buttonContainer: {
    width: '100%',
  },
});
