import { useState, useEffect, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, Pressable, Switch } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import Animated, { FadeIn, FadeInUp } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { Icon } from '@/components/ui/Icon';
import { GlassHeader } from '@/components/ui/GlassHeader';
import { ScreenErrorBoundary } from '@/components/ui/ScreenErrorBoundary';
import { Skeleton } from '@/components/ui/Skeleton';
import { showToast } from '@/components/ui/Toast';
import { colors, spacing, fontSize, radius, fonts } from '@/theme';
import { useTranslation } from '@/hooks/useTranslation';
import { useThemeColors } from '@/hooks/useThemeColors';
import { settingsApi } from '@/services/api';

type LastSeenOption = 'everyone' | 'contacts' | 'nobody';
type OnlineStatusOption = 'same_as_last_seen' | 'nobody';

function StatusPrivacyContent() {
  const tc = useThemeColors();
  const styles = useMemo(() => createStyles(tc), [tc]);
  const router = useRouter();
  const { t } = useTranslation();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [lastSeen, setLastSeen] = useState<LastSeenOption>('everyone');
  const [onlineStatus, setOnlineStatus] = useState<OnlineStatusOption>('same_as_last_seen');
  const [readReceipts, setReadReceipts] = useState(true);
  const [typingIndicators, setTypingIndicators] = useState(true);

  // NOTE: Backend UpdatePrivacyDto only supports activityStatus (boolean).
  // The granular fields (lastSeenPrivacy, onlineStatusPrivacy, readReceipts,
  // typingIndicators) are persisted locally via AsyncStorage until the backend
  // schema supports them. activityStatus is synced to the backend.
  useEffect(() => {
    let cancelled = false;
    async function loadSettings() {
      try {
        const [settings, localPrefs] = await Promise.all([
          settingsApi.get(),
          AsyncStorage.getItem('status-privacy-settings'),
        ]);
        if (!cancelled) {
          // Sync activityStatus from backend (maps to online visibility)
          const data = settings as { activityStatus?: boolean };
          if (typeof data.activityStatus === 'boolean' && !data.activityStatus) {
            setOnlineStatus('nobody');
          }

          // Load granular settings from local storage
          if (localPrefs) {
            try {
              const parsed = JSON.parse(localPrefs) as {
                lastSeenPrivacy?: LastSeenOption;
                onlineStatusPrivacy?: OnlineStatusOption;
                readReceipts?: boolean;
                typingIndicators?: boolean;
              };
              if (parsed.lastSeenPrivacy) setLastSeen(parsed.lastSeenPrivacy);
              if (parsed.onlineStatusPrivacy) setOnlineStatus(parsed.onlineStatusPrivacy);
              if (typeof parsed.readReceipts === 'boolean') setReadReceipts(parsed.readReceipts);
              if (typeof parsed.typingIndicators === 'boolean') setTypingIndicators(parsed.typingIndicators);
            } catch {
              // Invalid stored data, use defaults
            }
          }
        }
      } catch {
        showToast({ message: t('statusPrivacy.loadError'), variant: 'error' });
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    loadSettings();
    return () => { cancelled = true; };
  }, []);

  const saveSettings = useCallback(async (updates: Record<string, unknown>, rollback?: () => void) => {
    setSaving(true);
    try {
      // Persist all granular settings to AsyncStorage
      const currentRaw = await AsyncStorage.getItem('status-privacy-settings');
      const current = currentRaw ? JSON.parse(currentRaw) : {};
      await AsyncStorage.setItem('status-privacy-settings', JSON.stringify({ ...current, ...updates }));

      // Sync activityStatus to backend when onlineStatus changes
      if ('onlineStatusPrivacy' in updates) {
        const isActive = updates.onlineStatusPrivacy !== 'nobody';
        await settingsApi.updatePrivacy({ activityStatus: isActive });
      }
    } catch {
      rollback?.();
      showToast({ message: t('statusPrivacy.errorSave', 'Failed to save privacy settings'), variant: 'error' });
    } finally {
      setSaving(false);
    }
  }, [t]);

  const handleLastSeenChange = useCallback((value: LastSeenOption) => {
    const prev = lastSeen;
    setLastSeen(value);
    saveSettings({ lastSeenPrivacy: value }, () => setLastSeen(prev));
  }, [saveSettings, lastSeen]);

  const handleOnlineStatusChange = useCallback((value: OnlineStatusOption) => {
    const prev = onlineStatus;
    setOnlineStatus(value);
    saveSettings({ onlineStatusPrivacy: value }, () => setOnlineStatus(prev));
  }, [saveSettings, onlineStatus]);

  const handleReadReceiptsChange = useCallback((value: boolean) => {
    const prev = readReceipts;
    setReadReceipts(value);
    saveSettings({ readReceipts: value }, () => setReadReceipts(prev));
  }, [saveSettings, readReceipts]);

  const handleTypingIndicatorsChange = useCallback((value: boolean) => {
    const prev = typingIndicators;
    setTypingIndicators(value);
    saveSettings({ typingIndicators: value }, () => setTypingIndicators(prev));
  }, [saveSettings, typingIndicators]);

  const lastSeenOptions: { key: LastSeenOption; label: string }[] = [
    { key: 'everyone', label: t('statusPrivacy.everyone', 'Everyone') },
    { key: 'contacts', label: t('statusPrivacy.myContacts', 'My Contacts') },
    { key: 'nobody', label: t('statusPrivacy.nobody', 'Nobody') },
  ];

  const onlineStatusOptions: { key: OnlineStatusOption; label: string }[] = [
    { key: 'same_as_last_seen', label: t('statusPrivacy.sameAsLastSeen', 'Same as Last Seen') },
    { key: 'nobody', label: t('statusPrivacy.nobody', 'Nobody') },
  ];

  if (loading) {
    return (
      <View style={styles.container}>
        <GlassHeader
          title={t('statusPrivacy.title', 'Privacy')}
          leftAction={{
            icon: 'arrow-left',
            onPress: () => router.back(),
            accessibilityLabel: t('common.back', 'Go back'),
          }}
        />
        <View style={[styles.scrollContent, { paddingTop: 100 }]}>
          <Skeleton.Rect width="40%" height={16} borderRadius={radius.sm} />
          <View style={{ height: spacing.base }} />
          <Skeleton.Rect width="100%" height={52} borderRadius={radius.lg} />
          <View style={{ height: spacing.sm }} />
          <Skeleton.Rect width="100%" height={52} borderRadius={radius.lg} />
          <View style={{ height: spacing.sm }} />
          <Skeleton.Rect width="100%" height={52} borderRadius={radius.lg} />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <GlassHeader
        title={t('statusPrivacy.title', 'Privacy')}
        leftAction={{
          icon: 'arrow-left',
          onPress: () => router.back(),
          accessibilityLabel: t('common.back', 'Go back'),
        }}
      />

      <Animated.ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Lock Icon */}
        <Animated.View entering={FadeIn.duration(400)} style={styles.iconContainer}>
          <LinearGradient
            colors={[colors.emerald, colors.emeraldDark]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.iconCircle}
          >
            <Icon name="eye-off" size={40} color={tc.text.primary} />
          </LinearGradient>
        </Animated.View>

        {/* Last Seen Section */}
        <Animated.View entering={FadeInUp.delay(100).duration(400)}>
          <Text style={styles.sectionTitle}>
            {t('statusPrivacy.lastSeen', 'Last Seen')}
          </Text>
          <View style={styles.card}>
            {lastSeenOptions.map((option, index) => (
              <RadioRow
                key={option.key}
                label={option.label}
                selected={lastSeen === option.key}
                onPress={() => handleLastSeenChange(option.key)}
                disabled={saving}
                showDivider={index < lastSeenOptions.length - 1}
              />
            ))}
          </View>
        </Animated.View>

        {/* Online Status Section */}
        <Animated.View entering={FadeInUp.delay(200).duration(400)}>
          <Text style={styles.sectionTitle}>
            {t('statusPrivacy.onlineStatus', 'Online Status')}
          </Text>
          <View style={styles.card}>
            {onlineStatusOptions.map((option, index) => (
              <RadioRow
                key={option.key}
                label={option.label}
                selected={onlineStatus === option.key}
                onPress={() => handleOnlineStatusChange(option.key)}
                disabled={saving}
                showDivider={index < onlineStatusOptions.length - 1}
              />
            ))}
          </View>
        </Animated.View>

        {/* Read Receipts Section */}
        <Animated.View entering={FadeInUp.delay(300).duration(400)}>
          <Text style={styles.sectionTitle}>
            {t('statusPrivacy.readReceipts', 'Read Receipts')}
          </Text>
          <View style={styles.card}>
            <View style={styles.toggleRow}>
              <View style={styles.toggleTextContainer}>
                <Text style={styles.toggleLabel}>
                  {t('statusPrivacy.showReadReceipts', 'Show read receipts')}
                </Text>
                <Text style={styles.toggleDescription}>
                  {t('statusPrivacy.readReceiptsDesc', 'Others will see blue double checks when you read their messages')}
                </Text>
              </View>
              <Switch
                value={readReceipts}
                onValueChange={handleReadReceiptsChange}
                disabled={saving}
                trackColor={{ false: tc.surface, true: colors.emerald }}
                thumbColor={colors.text.primary}
                accessibilityRole="switch"
                accessibilityLabel={t('statusPrivacy.showReadReceipts', 'Show read receipts')}
                accessibilityState={{ checked: readReceipts }}
              />
            </View>
          </View>
        </Animated.View>

        {/* Typing Indicators Section */}
        <Animated.View entering={FadeInUp.delay(400).duration(400)}>
          <Text style={styles.sectionTitle}>
            {t('statusPrivacy.typingIndicators', 'Typing Indicators')}
          </Text>
          <View style={styles.card}>
            <View style={styles.toggleRow}>
              <View style={styles.toggleTextContainer}>
                <Text style={styles.toggleLabel}>
                  {t('statusPrivacy.showTyping', 'Show when typing')}
                </Text>
                <Text style={styles.toggleDescription}>
                  {t('statusPrivacy.typingDesc', 'Others will see when you are typing a message')}
                </Text>
              </View>
              <Switch
                value={typingIndicators}
                onValueChange={handleTypingIndicatorsChange}
                disabled={saving}
                trackColor={{ false: tc.surface, true: colors.emerald }}
                thumbColor={colors.text.primary}
                accessibilityRole="switch"
                accessibilityLabel={t('statusPrivacy.showTyping', 'Show when typing')}
                accessibilityState={{ checked: typingIndicators }}
              />
            </View>
          </View>
        </Animated.View>

        {/* Info Footer */}
        <Animated.View entering={FadeInUp.delay(500).duration(400)} style={styles.infoFooter}>
          <Icon name="clock" size={16} color={tc.text.tertiary} />
          <Text style={styles.infoFooterText}>
            {t('statusPrivacy.applyNote', 'Changes apply to future interactions')}
          </Text>
        </Animated.View>
      </Animated.ScrollView>
    </View>
  );
}

function RadioRow({
  label,
  selected,
  onPress,
  disabled,
  showDivider,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  disabled: boolean;
  showDivider: boolean;
}) {
  const tc = useThemeColors();
  const styles = useMemo(() => createStyles(tc), [tc]);
  return (
    <>
      <Pressable
        onPress={onPress}
        disabled={disabled}
        style={({ pressed }) => [styles.radioRow, pressed && styles.radioRowPressed]}
        accessibilityRole="radio"
        accessibilityState={{ selected }}
      >
        <Text style={[styles.radioLabel, selected && styles.radioLabelSelected]}>
          {label}
        </Text>
        <View style={[styles.radioOuter, selected && styles.radioOuterSelected]}>
          {selected && <View style={styles.radioInner} />}
        </View>
      </Pressable>
      {showDivider && <View style={styles.divider} />}
    </>
  );
}

export default function StatusPrivacyScreen() {
  return (
    <ScreenErrorBoundary>
      <StatusPrivacyContent />
    </ScreenErrorBoundary>
  );
}

const createStyles = (tc: ReturnType<typeof useThemeColors>) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: tc.bg,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingTop: 100,
    paddingHorizontal: spacing.base,
    paddingBottom: spacing['2xl'],
  },
  iconContainer: {
    alignItems: 'center',
    marginTop: spacing.lg,
    marginBottom: spacing.xl,
  },
  iconCircle: {
    width: 80,
    height: 80,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionTitle: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSize.base,
    color: tc.text.primary,
    marginTop: spacing.lg,
    marginBottom: spacing.md,
  },
  card: {
    backgroundColor: tc.bgCard,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: tc.border,
    overflow: 'hidden',
  },
  radioRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.base,
  },
  radioRowPressed: {
    backgroundColor: colors.active.white5,
  },
  radioLabel: {
    fontFamily: fonts.body,
    fontSize: fontSize.base,
    color: tc.text.primary,
  },
  radioLabelSelected: {
    fontFamily: fonts.bodySemiBold,
    color: colors.emerald,
  },
  radioOuter: {
    width: 22,
    height: 22,
    borderRadius: radius.full,
    borderWidth: 2,
    borderColor: tc.borderLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioOuterSelected: {
    borderColor: colors.emerald,
  },
  radioInner: {
    width: 12,
    height: 12,
    borderRadius: radius.full,
    backgroundColor: colors.emerald,
  },
  divider: {
    height: 1,
    backgroundColor: tc.border,
    marginHorizontal: spacing.base,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.base,
  },
  toggleTextContainer: {
    flex: 1,
    marginEnd: spacing.md,
  },
  toggleLabel: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSize.base,
    color: tc.text.primary,
    marginBottom: spacing.xs,
  },
  toggleDescription: {
    fontFamily: fonts.body,
    fontSize: fontSize.sm,
    color: tc.text.secondary,
    lineHeight: 18,
  },
  infoFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.xl,
    paddingHorizontal: spacing.xs,
  },
  infoFooterText: {
    flex: 1,
    fontFamily: fonts.body,
    fontSize: fontSize.xs,
    color: tc.text.tertiary,
    lineHeight: 16,
  },
});
