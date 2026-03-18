import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Switch,
  Pressable,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { Icon } from '@/components/ui/Icon';
import type { IconName } from '@/components/ui/Icon';
import { GlassHeader } from '@/components/ui/GlassHeader';
import { Skeleton } from '@/components/ui/Skeleton';
import { ScreenErrorBoundary } from '@/components/ui/ScreenErrorBoundary';
import { colors, fonts, fontSize, spacing, radius } from '@/theme';
import { useHaptic } from '@/hooks/useHaptic';
import { useTranslation } from '@/hooks/useTranslation';
import { rtlFlexRow, rtlTextAlign } from '@/utils/rtl';
import { settingsApi } from '@/services/api';
import { useStore } from '@/store';

const STORAGE_KEY = 'mizanly_media_settings';

interface MediaTypeSettings {
  photos: boolean;
  audio: boolean;
  video: boolean;
  documents: boolean;
}

interface MediaSettings {
  dataSaver: boolean;
  mobile: MediaTypeSettings;
  wifi: MediaTypeSettings;
  roaming: MediaTypeSettings;
}

const DEFAULT_SETTINGS: MediaSettings = {
  dataSaver: false,
  mobile: { photos: false, audio: false, video: false, documents: false },
  wifi: { photos: true, audio: true, video: true, documents: true },
  roaming: { photos: false, audio: false, video: false, documents: false },
};

interface MediaToggleItem {
  key: keyof MediaTypeSettings;
  labelKey: string;
  icon: IconName;
}

const MEDIA_ITEMS: MediaToggleItem[] = [
  { key: 'photos', labelKey: 'mediaSettings.photos', icon: 'image' },
  { key: 'audio', labelKey: 'mediaSettings.audio', icon: 'mic' },
  { key: 'video', labelKey: 'mediaSettings.video', icon: 'video' },
  { key: 'documents', labelKey: 'mediaSettings.documents', icon: 'paperclip' },
];

function SettingRow({
  icon,
  label,
  value,
  onToggle,
  disabled,
  isRTL,
}: {
  icon: IconName;
  label: string;
  value: boolean;
  onToggle: (val: boolean) => void;
  disabled?: boolean;
  isRTL: boolean;
}) {
  const haptic = useHaptic();

  const handleToggle = (val: boolean) => {
    haptic.light();
    onToggle(val);
  };

  return (
    <View style={[styles.settingRow, { flexDirection: rtlFlexRow(isRTL) }]}>
      <View style={styles.settingIcon}>
        <Icon name={icon} size="sm" color={disabled ? colors.text.tertiary : colors.text.secondary} />
      </View>
      <Text
        style={[
          styles.settingLabel,
          { textAlign: rtlTextAlign(isRTL) },
          disabled && styles.settingLabelDisabled,
        ]}
      >
        {label}
      </Text>
      <Switch
        value={value && !disabled}
        onValueChange={handleToggle}
        disabled={disabled}
        trackColor={{ false: colors.dark.surface, true: colors.emerald }}
        thumbColor={value && !disabled ? '#FFFFFF' : colors.text.tertiary}
        ios_backgroundColor={colors.dark.surface}
      />
    </View>
  );
}

function SectionHeader({ title, index, isRTL }: { title: string; index: number; isRTL: boolean }) {
  return (
    <Animated.View entering={FadeInDown.delay(index * 80).duration(300)}>
      <Text style={[styles.sectionTitle, { textAlign: rtlTextAlign(isRTL) }]}>{title}</Text>
    </Animated.View>
  );
}

function LoadingSkeleton() {
  return (
    <View style={styles.skeletonContainer}>
      <Skeleton.Rect width="100%" height={56} borderRadius={radius.lg} />
      <View style={{ marginTop: spacing.xl }}>
        <Skeleton.Rect width={180} height={16} borderRadius={radius.sm} />
        {Array.from({ length: 4 }).map((_, i) => (
          <View key={`skel-${i}`} style={styles.skeletonRow}>
            <Skeleton.Circle size={20} />
            <Skeleton.Rect width="50%" height={14} borderRadius={radius.sm} />
            <Skeleton.Rect width={50} height={28} borderRadius={radius.full} />
          </View>
        ))}
      </View>
    </View>
  );
}

export default function MediaSettingsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const haptic = useHaptic();
  const { t, isRTL } = useTranslation();

  const [settings, setSettings] = useState<MediaSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [autoPlay, setAutoPlay] = useState<'wifi' | 'always' | 'never'>('wifi');
  const [ambientMode, setAmbientMode] = useState(useStore.getState().ambientModeEnabled);

  // Load auto-play setting
  useEffect(() => {
    settingsApi.getAutoPlay().then(res => {
      if (res?.autoPlaySetting) setAutoPlay(res.autoPlaySetting as 'wifi' | 'always' | 'never');
    }).catch(() => {});
  }, []);

  const loadSettings = useCallback(async () => {
    try {
      const stored = await AsyncStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed: unknown = JSON.parse(stored);
        if (parsed && typeof parsed === 'object' && 'dataSaver' in parsed) {
          setSettings(parsed as MediaSettings);
        }
      }
    } catch {
      // Use defaults on error
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  const saveSettings = useCallback(async (updated: MediaSettings) => {
    setSettings(updated);
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    } catch {
      // Silently fail on save error
    }
  }, []);

  const handleDataSaverToggle = (val: boolean) => {
    haptic.medium();
    const updated: MediaSettings = {
      ...settings,
      dataSaver: val,
    };
    if (val) {
      // Data saver ON: disable all mobile and roaming
      updated.mobile = { photos: false, audio: false, video: false, documents: false };
      updated.roaming = { photos: false, audio: false, video: false, documents: false };
    }
    saveSettings(updated);
  };

  const handleToggle = (
    section: 'mobile' | 'wifi' | 'roaming',
    key: keyof MediaTypeSettings,
    val: boolean,
  ) => {
    const updated: MediaSettings = {
      ...settings,
      [section]: {
        ...settings[section],
        [key]: val,
      },
    };
    saveSettings(updated);
  };

  return (
    <ScreenErrorBoundary>
      <View style={styles.container}>
        <GlassHeader
          title={t('mediaSettings.title')}
          leftAction={{
            icon: 'arrow-left',
            onPress: () => router.back(),
            accessibilityLabel: t('common.back'),
          }}
        />

        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={[
            styles.content,
            { paddingTop: insets.top + 60, paddingBottom: insets.bottom + spacing.xl },
          ]}
          showsVerticalScrollIndicator={false}
        >
          {loading ? (
            <LoadingSkeleton />
          ) : (
            <>
              {/* Data Saver Toggle */}
              <Animated.View entering={FadeInDown.duration(300)} style={styles.dataSaverCard}>
                <LinearGradient
                  colors={[
                    settings.dataSaver ? colors.active.emerald20 : colors.dark.bgCard,
                    colors.dark.bgCard,
                  ]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={[styles.dataSaverGradient, { flexDirection: rtlFlexRow(isRTL) }]}
                >
                  <View style={styles.dataSaverInfo}>
                    <Text style={[styles.dataSaverTitle, { textAlign: rtlTextAlign(isRTL) }]}>
                      {t('mediaSettings.dataSaver')}
                    </Text>
                    <Text style={[styles.dataSaverHint, { textAlign: rtlTextAlign(isRTL) }]}>
                      {t('mediaSettings.dataSaverHint')}
                    </Text>
                  </View>
                  <Switch
                    value={settings.dataSaver}
                    onValueChange={handleDataSaverToggle}
                    trackColor={{ false: colors.dark.surface, true: colors.emerald }}
                    thumbColor={settings.dataSaver ? '#FFFFFF' : colors.text.tertiary}
                    ios_backgroundColor={colors.dark.surface}
                  />
                </LinearGradient>
              </Animated.View>

              {/* Mobile Data Section */}
              <SectionHeader
                title={t('mediaSettings.mobileData')}
                index={1}
                isRTL={isRTL}
              />
              <View style={styles.sectionCard}>
                {MEDIA_ITEMS.map((item) => (
                  <SettingRow
                    key={`mobile-${item.key}`}
                    icon={item.icon}
                    label={t(item.labelKey)}
                    value={settings.mobile[item.key]}
                    onToggle={(val) => handleToggle('mobile', item.key, val)}
                    disabled={settings.dataSaver}
                    isRTL={isRTL}
                  />
                ))}
              </View>

              {/* Wi-Fi Section */}
              <SectionHeader
                title={t('mediaSettings.wifi')}
                index={2}
                isRTL={isRTL}
              />
              <View style={styles.sectionCard}>
                {MEDIA_ITEMS.map((item) => (
                  <SettingRow
                    key={`wifi-${item.key}`}
                    icon={item.icon}
                    label={t(item.labelKey)}
                    value={settings.wifi[item.key]}
                    onToggle={(val) => handleToggle('wifi', item.key, val)}
                    isRTL={isRTL}
                  />
                ))}
              </View>

              {/* Roaming Section */}
              <SectionHeader
                title={t('mediaSettings.roaming')}
                index={3}
                isRTL={isRTL}
              />
              <View style={styles.sectionCard}>
                {MEDIA_ITEMS.map((item) => (
                  <SettingRow
                    key={`roaming-${item.key}`}
                    icon={item.icon}
                    label={t(item.labelKey)}
                    value={settings.roaming[item.key]}
                    onToggle={(val) => handleToggle('roaming', item.key, val)}
                    disabled={settings.dataSaver}
                    isRTL={isRTL}
                  />
                ))}
              </View>

              {/* Auto-play Section */}
              <SectionHeader
                title={t('autoPlaySettings.title')}
                index={4}
                isRTL={isRTL}
              />
              <View style={styles.sectionCard}>
                {(['wifi', 'always', 'never'] as const).map((option) => (
                  <Pressable
                    key={option}
                    style={[styles.settingRow, { flexDirection: rtlFlexRow(isRTL) }]}
                    onPress={() => {
                      haptic.light();
                      setAutoPlay(option);
                      settingsApi.updateAutoPlay(option).catch(() => {});
                      useStore.getState().setAutoPlaySetting(option);
                    }}
                  >
                    <View style={styles.settingIcon}>
                      <Icon
                        name={option === 'wifi' ? 'globe' : option === 'always' ? 'play' : 'slash'}
                        size="sm"
                        color={autoPlay === option ? colors.emerald : colors.text.secondary}
                      />
                    </View>
                    <Text
                      style={[
                        styles.settingLabel,
                        { textAlign: rtlTextAlign(isRTL) },
                        autoPlay === option && { color: colors.emerald },
                      ]}
                    >
                      {t(`autoPlaySettings.${option}`)}
                    </Text>
                    <View style={[styles.radioOuter, autoPlay === option && styles.radioOuterActive]}>
                      {autoPlay === option && <View style={styles.radioInner} />}
                    </View>
                  </Pressable>
                ))}
              </View>

              {/* Ambient Mode */}
              <Animated.View entering={FadeInDown.delay(300).duration(300)} style={styles.ambientSection}>
                <SettingRow
                  icon="eye"
                  label={t('ambient.toggle')}
                  value={ambientMode}
                  onToggle={(v: boolean) => {
                    useStore.getState().setAmbientModeEnabled(v);
                    setAmbientMode(v);
                    haptic.light();
                  }}
                  isRTL={isRTL}
                />
                <Text style={[styles.ambientHint, { textAlign: rtlTextAlign(isRTL) }]}>
                  {t('ambient.hint')}
                </Text>
              </Animated.View>

              {/* Footer */}
              <Animated.View entering={FadeInDown.delay(320).duration(300)}>
                <Text style={[styles.footerText, { textAlign: rtlTextAlign(isRTL) }]}>
                  {t('mediaSettings.footerNote')}
                </Text>
              </Animated.View>
            </>
          )}
        </ScrollView>
      </View>
    </ScreenErrorBoundary>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.dark.bg,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    paddingHorizontal: spacing.base,
  },
  // Data Saver
  dataSaverCard: {
    borderRadius: radius.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.dark.border,
    marginBottom: spacing.xl,
  },
  dataSaverGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.base,
  },
  dataSaverInfo: {
    flex: 1,
    marginRight: spacing.md,
  },
  dataSaverTitle: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSize.base,
    color: colors.text.primary,
  },
  dataSaverHint: {
    fontFamily: fonts.body,
    fontSize: fontSize.sm,
    color: colors.text.secondary,
    marginTop: 2,
  },
  // Section
  sectionTitle: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSize.sm,
    color: colors.text.secondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.sm,
    marginTop: spacing.sm,
  },
  sectionCard: {
    backgroundColor: colors.dark.bgCard,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.dark.border,
    overflow: 'hidden',
    marginBottom: spacing.base,
  },
  // Setting Row
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.dark.border,
  },
  settingIcon: {
    marginRight: spacing.md,
  },
  settingLabel: {
    flex: 1,
    fontFamily: fonts.bodyMedium,
    fontSize: fontSize.base,
    color: colors.text.primary,
  },
  settingLabelDisabled: {
    color: colors.text.tertiary,
  },
  // Radio buttons
  radioOuter: {
    width: 22,
    height: 22,
    borderRadius: radius.full,
    borderWidth: 2,
    borderColor: colors.dark.border,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  radioOuterActive: {
    borderColor: colors.emerald,
  },
  radioInner: {
    width: 12,
    height: 12,
    borderRadius: radius.full,
    backgroundColor: colors.emerald,
  },
  // Footer
  ambientSection: {
    marginTop: spacing.xl,
  },
  ambientHint: {
    fontFamily: fonts.body,
    fontSize: fontSize.xs,
    color: colors.text.tertiary,
    marginTop: spacing.xs,
    paddingHorizontal: spacing.xs,
  },
  footerText: {
    fontFamily: fonts.body,
    fontSize: fontSize.sm,
    color: colors.text.tertiary,
    marginTop: spacing.md,
    paddingHorizontal: spacing.xs,
    lineHeight: 20,
  },
  // Skeleton
  skeletonContainer: {
    gap: spacing.base,
  },
  skeletonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    gap: spacing.md,
  },
});
