import { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, Pressable, Switch, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import Animated, { FadeIn, FadeInUp } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { Icon } from '@/components/ui/Icon';
import { GlassHeader } from '@/components/ui/GlassHeader';
import { ScreenErrorBoundary } from '@/components/ui/ScreenErrorBoundary';
import { Skeleton } from '@/components/ui/Skeleton';
import { colors, spacing, fontSize, radius, fonts } from '@/theme';
import { useTranslation } from '@/hooks/useTranslation';
import { settingsApi } from '@/services/api';

type LastSeenOption = 'everyone' | 'contacts' | 'nobody';
type OnlineStatusOption = 'same_as_last_seen' | 'nobody';

function StatusPrivacyContent() {
  const router = useRouter();
  const { t } = useTranslation();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [lastSeen, setLastSeen] = useState<LastSeenOption>('everyone');
  const [onlineStatus, setOnlineStatus] = useState<OnlineStatusOption>('same_as_last_seen');
  const [readReceipts, setReadReceipts] = useState(true);
  const [typingIndicators, setTypingIndicators] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function loadSettings() {
      try {
        const settings = await settingsApi.get();
        if (!cancelled) {
          const data = settings as {
            lastSeenPrivacy?: LastSeenOption;
            onlineStatusPrivacy?: OnlineStatusOption;
            readReceipts?: boolean;
            typingIndicators?: boolean;
          };
          if (data.lastSeenPrivacy) setLastSeen(data.lastSeenPrivacy);
          if (data.onlineStatusPrivacy) setOnlineStatus(data.onlineStatusPrivacy);
          if (typeof data.readReceipts === 'boolean') setReadReceipts(data.readReceipts);
          if (typeof data.typingIndicators === 'boolean') setTypingIndicators(data.typingIndicators);
        }
      } catch {
        // Use defaults on error
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    loadSettings();
    return () => { cancelled = true; };
  }, []);

  const saveSettings = useCallback(async (updates: Record<string, unknown>) => {
    setSaving(true);
    try {
      await settingsApi.updatePrivacy(updates as Parameters<typeof settingsApi.updatePrivacy>[0]);
    } catch {
      Alert.alert(
        t('statusPrivacy.errorTitle', 'Error'),
        t('statusPrivacy.errorSave', 'Failed to save privacy settings'),
      );
    } finally {
      setSaving(false);
    }
  }, [t]);

  const handleLastSeenChange = useCallback((value: LastSeenOption) => {
    setLastSeen(value);
    saveSettings({ lastSeenPrivacy: value });
  }, [saveSettings]);

  const handleOnlineStatusChange = useCallback((value: OnlineStatusOption) => {
    setOnlineStatus(value);
    saveSettings({ onlineStatusPrivacy: value });
  }, [saveSettings]);

  const handleReadReceiptsChange = useCallback((value: boolean) => {
    setReadReceipts(value);
    saveSettings({ readReceipts: value });
  }, [saveSettings]);

  const handleTypingIndicatorsChange = useCallback((value: boolean) => {
    setTypingIndicators(value);
    saveSettings({ typingIndicators: value });
  }, [saveSettings]);

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
            <Icon name="eye-off" size={40} color={colors.text.primary} />
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
                trackColor={{ false: colors.dark.surface, true: colors.emerald }}
                thumbColor={colors.text.primary}
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
                trackColor={{ false: colors.dark.surface, true: colors.emerald }}
                thumbColor={colors.text.primary}
              />
            </View>
          </View>
        </Animated.View>

        {/* Info Footer */}
        <Animated.View entering={FadeInUp.delay(500).duration(400)} style={styles.infoFooter}>
          <Icon name="clock" size={16} color={colors.text.tertiary} />
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

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.dark.bg,
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
    color: colors.text.primary,
    marginTop: spacing.lg,
    marginBottom: spacing.md,
  },
  card: {
    backgroundColor: colors.dark.bgCard,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.dark.border,
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
    color: colors.text.primary,
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
    borderColor: colors.dark.borderLight,
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
    backgroundColor: colors.dark.border,
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
    marginRight: spacing.md,
  },
  toggleLabel: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSize.base,
    color: colors.text.primary,
    marginBottom: spacing.xs,
  },
  toggleDescription: {
    fontFamily: fonts.body,
    fontSize: fontSize.sm,
    color: colors.text.secondary,
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
    color: colors.text.tertiary,
    lineHeight: 16,
  },
});
