import { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, Pressable,
  ScrollView, Alert,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { useQuery, useMutation } from '@tanstack/react-query';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { Icon, type IconName } from '@/components/ui/Icon';
import { Skeleton } from '@/components/ui/Skeleton';
import { BottomSheet, BottomSheetItem } from '@/components/ui/BottomSheet';
import { GlassHeader } from '@/components/ui/GlassHeader';
import { colors, spacing, fontSize, radius } from '@/theme';
import { settingsApi } from '@/services/api';
import type { Settings } from '@/types';
import { useStore, useSafFeedType, useMajlisFeedType } from '@/store';
import { useTranslation } from '@/hooks/useTranslation';
import { useThemeColors } from '@/hooks/useThemeColors';
import { ScreenErrorBoundary } from '@/components/ui/ScreenErrorBoundary';

type WellbeingSettings = Parameters<typeof settingsApi.updateWellbeing>[0];

// Section icons mapping
const sectionIcons: Record<string, IconName> = {
  'feedPreferences': 'trending-up',
  'contentFilters': 'filter',
  'blockedKeywords': 'slash',
  'digitalWellbeing': 'clock',
};

// Reuse Row and SectionHeader with premium styling
function Row({
  label,
  hint,
  value,
  onToggle,
  onPress,
  destructive,
  icon,
}: {
  label: string;
  hint?: string;
  value?: boolean;
  onToggle?: (v: boolean) => void;
  onPress?: () => void;
  destructive?: boolean;
  icon?: IconName;
}) {
  const tc = useThemeColors();
  const tc = useThemeColors();
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress && !onToggle}
      accessibilityLabel={label}
      accessibilityRole={onToggle !== undefined ? 'switch' : 'button'}
    >
      <LinearGradient
        colors={onToggle && value ? ['rgba(10,123,79,0.1)', 'transparent'] : ['transparent', 'transparent']}
        style={styles.row}
      >
        <View style={styles.rowContent}>
          {icon && (
            <LinearGradient
              colors={destructive ? ['rgba(248,81,73,0.2)', 'rgba(248,81,73,0.1)'] : ['rgba(10,123,79,0.2)', 'rgba(200,150,62,0.1)']}
              style={styles.rowIconBg}
            >
              <Icon name={icon} size="xs" color={destructive ? colors.error : colors.emerald} />
            </LinearGradient>
          )}
          <View style={styles.rowText}>
            <Text style={[styles.rowLabel, { color: tc.text.primary }, destructive && styles.destructive]}>{label}</Text>
            {hint ? <Text style={[styles.rowHint, { color: tc.text.tertiary }]}>{hint}</Text> : null}
          </View>
        </View>
        {onToggle !== undefined && value !== undefined ? (
          <Pressable
            style={[styles.toggleTrack, { backgroundColor: tc.border }, value && styles.toggleTrackActive]}
            onPress={() => onToggle(!value)}
          >
            <View style={[styles.toggleThumb, value && styles.toggleThumbActive]}>
              <LinearGradient
                colors={value ? [colors.emerald, colors.emerald] : ['#fff', '#f0f0f0']}
                style={styles.toggleThumbGradient}
              />
            </View>
          </Pressable>
        ) : onPress ? (
          <Icon name="chevron-right" size="sm" color={tc.text.tertiary} />
        ) : null}
      </LinearGradient>
    </Pressable>
  );
}

function SectionHeader({ title }: { title: string }) {
  const { t } = useTranslation();
  const tc = useThemeColors();
  const icon = sectionIcons[title] || 'settings';
  return (
    <View style={styles.sectionHeader}>
      <LinearGradient
        colors={['rgba(10,123,79,0.2)', 'rgba(200,150,62,0.1)']}
        style={styles.sectionIconBg}
      >
        <Icon name={icon} size="xs" color={colors.emerald} />
      </LinearGradient>
      <Text style={[styles.sectionHeaderText, { color: tc.text.secondary }]}>{t(`settings.sections.${title}`)}</Text>
    </View>
  );
}

type SafFeedType = 'following' | 'foryou';
type MajlisFeedType = 'foryou' | 'following' | 'trending';
type DailyReminderOption = 'off' | '30min' | '1h' | '2h';

export default function ContentSettingsScreen() {
  const router = useRouter();
  const safFeedType = useSafFeedType();
  const majlisFeedType = useMajlisFeedType();
  const setSafFeedType = useStore((s) => s.setSafFeedType);
  const setMajlisFeedType = useStore((s) => s.setMajlisFeedType);
  const { t } = useTranslation();
  const tc = useThemeColors();

  // Settings from API
  const settingsQuery = useQuery({
    queryKey: ['settings'],
    queryFn: () => settingsApi.get(),
  });
  const s = settingsQuery.data;

  // Local state mirrors fetched settings
  const [sensitiveContent, setSensitiveContent] = useState(false);
  const [dailyReminder, setDailyReminder] = useState<DailyReminderOption>('off');
  const [hideRepostedContent, setHideRepostedContent] = useState(false); // local only

  useEffect(() => {
    if (s) {
      setSensitiveContent(s.sensitiveContent ?? false);
    }
    // Hydrate daily reminder from AsyncStorage (local-only setting)
    AsyncStorage.getItem('daily-reminder-option').then((stored) => {
      if (stored && ['off', '30min', '1h', '2h'].includes(stored)) {
        setDailyReminder(stored as DailyReminderOption);
      }
    });
  }, [s]);

  // BottomSheet states
  const [safPickerVisible, setSafPickerVisible] = useState(false);
  const [majlisPickerVisible, setMajlisPickerVisible] = useState(false);
  const [dailyReminderPickerVisible, setDailyReminderPickerVisible] = useState(false);

  const wellbeingMutation = useMutation<Settings, Error, WellbeingSettings>({
    mutationFn: settingsApi.updateWellbeing,
    onError: (err: Error) => Alert.alert(t('common.error'), err.message),
  });

  const handleUpdateSensitiveContent = (v: boolean) => {
    setSensitiveContent(v);
    wellbeingMutation.mutate({ sensitiveContent: v });
  };

  // Daily reminder is local-only (no backend endpoint exists).
  // Persisted via AsyncStorage so it survives app restarts.
  const handleUpdateDailyReminder = async (option: DailyReminderOption) => {
    const prev = dailyReminder;
    setDailyReminder(option);
    try {
      await AsyncStorage.setItem('daily-reminder-option', option);
    } catch {
      Alert.alert(t('common.error'), t('contentSettings.saveError', 'Failed to save setting'));
      setDailyReminder(prev);
    }
  };

  const safOptions: { label: string; value: SafFeedType }[] = [
    { label: 'feed.following', value: 'following' },
    { label: 'feed.forYou', value: 'foryou' },
  ];

  const majlisOptions: { label: string; value: MajlisFeedType }[] = [
    { label: 'feed.forYou', value: 'foryou' },
    { label: 'feed.following', value: 'following' },
    { label: 'feed.trending', value: 'trending' },
  ];

  const dailyReminderOptions: { label: string; value: DailyReminderOption }[] = [
    { label: 'settings.dailyReminder.off', value: 'off' },
    { label: 'settings.dailyReminder.30min', value: '30min' },
    { label: 'settings.dailyReminder.1h', value: '1h' },
    { label: 'settings.dailyReminder.2h', value: '2h' },
  ];

  if (settingsQuery.isError) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: tc.bg }]} edges={['top']}>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: spacing.base }}>
          <Text style={{ color: colors.error, fontSize: fontSize.base, marginBottom: spacing.md }}>
            {t('settings.loadError')}
          </Text>
          <Pressable onPress={() => settingsQuery.refetch()}>
            <Text style={{ color: colors.emerald, fontSize: fontSize.base }}>{t('common.tryAgain')}</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  if (settingsQuery.isLoading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: tc.bg }]} edges={['top']}>
        <View style={{ flex: 1, padding: spacing.base, gap: spacing.lg }}>
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton.Rect key={i} width="100%" height={48} />
          ))}
        </View>
      </SafeAreaView>
    );
  }

  return (
    <ScreenErrorBoundary>
      <SafeAreaView style={[styles.container, { backgroundColor: tc.bg }]} edges={['top']}>
        <GlassHeader
          title={t('settings.contentPreferences')}
          leftAction={{ icon: 'arrow-left', onPress: () => router.back(), accessibilityLabel: t('common.back') }}
        />

        <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
          {/* Feed Preferences */}
          <Animated.View entering={FadeInUp.duration(400)}>
            <SectionHeader title="feedPreferences" />
            <LinearGradient
              colors={colors.gradient.cardDark}
              style={styles.card}
            >
              <Pressable
                style={styles.rowPressable}
                onPress={() => setSafPickerVisible(true)}
                accessibilityLabel={t('settings.safDefaultFeed')}
                accessibilityRole="button"
              >
                <View style={styles.rowContent}>
                  <LinearGradient
                    colors={['rgba(10,123,79,0.2)', 'rgba(200,150,62,0.1)']}
                    style={styles.rowIconBg}
                  >
                    <Icon name="trending-up" size="xs" color={colors.emerald} />
                  </LinearGradient>
                  <View style={styles.rowText}>
                    <Text style={[styles.rowLabel, { color: tc.text.primary }]}>{t('settings.safDefault')}</Text>
                    <Text style={[styles.rowHint, { color: tc.text.tertiary }]}>{t('settings.hints.safDefault')}</Text>
                  </View>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
                  <LinearGradient
                    colors={['rgba(10,123,79,0.15)', 'rgba(10,123,79,0.05)']}
                    style={styles.valueBadge}
                  >
                    <Text style={[styles.valueText, { color: tc.text.primary }]}>
                      {safFeedType === 'following' ? t('feed.following') : t('feed.forYou')}
                    </Text>
                  </LinearGradient>
                  <Icon name="chevron-right" size="sm" color={tc.text.tertiary} />
                </View>
              </Pressable>
              <View style={styles.divider} />
              <Pressable
                style={styles.rowPressable}
                onPress={() => setMajlisPickerVisible(true)}
                accessibilityLabel={t('settings.majlisDefaultFeed')}
                accessibilityRole="button"
              >
                <View style={styles.rowContent}>
                  <LinearGradient
                    colors={['rgba(200,150,62,0.2)', 'rgba(200,150,62,0.1)']}
                    style={styles.rowIconBg}
                  >
                    <Icon name="hash" size="xs" color={colors.gold} />
                  </LinearGradient>
                  <View style={styles.rowText}>
                    <Text style={[styles.rowLabel, { color: tc.text.primary }]}>{t('settings.majlisDefault')}</Text>
                    <Text style={[styles.rowHint, { color: tc.text.tertiary }]}>{t('settings.hints.majlisDefault')}</Text>
                  </View>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
                  <LinearGradient
                    colors={['rgba(200,150,62,0.15)', 'rgba(200,150,62,0.05)']}
                    style={styles.valueBadge}
                  >
                    <Text style={[styles.valueText, { color: tc.text.primary }]}>
                      {majlisFeedType === 'foryou' ? t('feed.forYou') : majlisFeedType === 'following' ? t('feed.following') : t('feed.trending')}
                    </Text>
                  </LinearGradient>
                  <Icon name="chevron-right" size="sm" color={tc.text.tertiary} />
                </View>
              </Pressable>
            </LinearGradient>
          </Animated.View>

          {/* Content Filters */}
          <Animated.View entering={FadeInUp.delay(100).duration(400)}>
            <SectionHeader title="contentFilters" />
            <LinearGradient
              colors={colors.gradient.cardDark}
              style={styles.card}
            >
              <Row
                label={t('settings.filterSensitiveContent')}
                hint={t('settings.hints.filterSensitiveContent')}
                value={sensitiveContent}
                onToggle={handleUpdateSensitiveContent}
                icon="eye"
              />
              <View style={styles.divider} />
              {/* Not yet persisted — requires backend support */}
              <View style={{ opacity: 0.5 }}>
                <Row
                  label={`${t('settings.hideRepostedContent')} (${t('common.comingSoon', 'Coming soon')})`}
                  hint={t('settings.hints.hideRepostedContent')}
                  value={hideRepostedContent}
                  icon="repeat"
                />
              </View>
            </LinearGradient>
          </Animated.View>

          {/* Blocked Keywords */}
          <Animated.View entering={FadeInUp.delay(200).duration(400)}>
            <SectionHeader title="blockedKeywords" />
            <LinearGradient
              colors={colors.gradient.cardDark}
              style={styles.card}
            >
              <Row
                label={t('settings.manageBlockedKeywords')}
                hint={t('settings.hints.manageBlockedKeywords')}
                onPress={() => router.push('/(screens)/blocked-keywords')}
                icon="slash"
              />
            </LinearGradient>
          </Animated.View>

          {/* Digital Wellbeing */}
          <Animated.View entering={FadeInUp.delay(300).duration(400)}>
            <SectionHeader title="digitalWellbeing" />
            <LinearGradient
              colors={colors.gradient.cardDark}
              style={styles.card}
            >
              <Pressable
                style={styles.rowPressable}
                onPress={() => setDailyReminderPickerVisible(true)}
                accessibilityLabel={t('settings.dailyReminder.label')}
                accessibilityRole="button"
              >
                <View style={styles.rowContent}>
                  <LinearGradient
                    colors={['rgba(10,123,79,0.2)', 'rgba(200,150,62,0.1)']}
                    style={styles.rowIconBg}
                  >
                    <Icon name="clock" size="xs" color={colors.emerald} />
                  </LinearGradient>
                  <View style={styles.rowText}>
                    <Text style={[styles.rowLabel, { color: tc.text.primary }]}>{t('settings.dailyReminder.label')}</Text>
                    <Text style={[styles.rowHint, { color: tc.text.tertiary }]}>{t('settings.hints.dailyReminder')}</Text>
                  </View>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
                  <LinearGradient
                    colors={['rgba(10,123,79,0.15)', 'rgba(10,123,79,0.05)']}
                    style={styles.valueBadge}
                  >
                    <Text style={[styles.valueText, { color: tc.text.primary }]}>
                      {dailyReminder === 'off' ? t('settings.dailyReminder.off') : dailyReminder === '30min' ? t('settings.dailyReminder.30min') : dailyReminder === '1h' ? t('settings.dailyReminder.1h') : t('settings.dailyReminder.2h')}
                    </Text>
                  </LinearGradient>
                  <Icon name="chevron-right" size="sm" color={tc.text.tertiary} />
                </View>
              </Pressable>
            </LinearGradient>
          </Animated.View>
        </ScrollView>

        {/* BottomSheet for Saf feed picker */}
        <BottomSheet visible={safPickerVisible} onClose={() => setSafPickerVisible(false)}>
          {safOptions.map((opt) => (
            <BottomSheetItem
              key={opt.value}
              label={t(opt.label)}
              onPress={() => {
                setSafFeedType(opt.value);
                setSafPickerVisible(false);
              }}
              icon={safFeedType === opt.value ? <Icon name="check" size="sm" color={colors.emerald} /> : undefined}
            />
          ))}
        </BottomSheet>

        {/* BottomSheet for Majlis feed picker */}
        <BottomSheet visible={majlisPickerVisible} onClose={() => setMajlisPickerVisible(false)}>
          {majlisOptions.map((opt) => (
            <BottomSheetItem
              key={opt.value}
              label={t(opt.label)}
              onPress={() => {
                setMajlisFeedType(opt.value);
                setMajlisPickerVisible(false);
              }}
              icon={majlisFeedType === opt.value ? <Icon name="check" size="sm" color={colors.emerald} /> : undefined}
            />
          ))}
        </BottomSheet>

        {/* BottomSheet for daily reminder picker */}
        <BottomSheet visible={dailyReminderPickerVisible} onClose={() => setDailyReminderPickerVisible(false)}>
          {dailyReminderOptions.map((opt) => (
            <BottomSheetItem
              key={opt.value}
              label={t(opt.label)}
              onPress={() => {
                handleUpdateDailyReminder(opt.value);
                setDailyReminderPickerVisible(false);
              }}
              icon={dailyReminder === opt.value ? <Icon name="check" size="sm" color={colors.emerald} /> : undefined}
            />
          ))}
        </BottomSheet>
      </SafeAreaView>
  
    </ScreenErrorBoundary>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.dark.bg },

  body: { flex: 1 },
  bodyContent: { paddingBottom: 60, paddingTop: 100 },

  // Section header with icon
  sectionHeader: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingHorizontal: spacing.base, paddingTop: spacing.xl, paddingBottom: spacing.sm,
  },
  sectionIconBg: {
    width: 28, height: 28, borderRadius: radius.sm,
    alignItems: 'center', justifyContent: 'center',
  },
  sectionHeaderText: {
    color: colors.text.secondary, fontSize: fontSize.xs, fontWeight: '600',
    textTransform: 'uppercase', letterSpacing: 0.8,
  },

  // Glassmorphism cards
  card: {
    borderRadius: radius.lg,
    borderWidth: 1, borderColor: colors.active.white6,
    overflow: 'hidden',
    marginHorizontal: spacing.base,
    marginBottom: spacing.md,
    padding: spacing.sm,
  },

  // Premium toggle switch
  toggleTrack: {
    width: 52, height: 28, borderRadius: radius.full,
    backgroundColor: colors.dark.border,
    padding: 2,
    justifyContent: 'center',
  },
  toggleTrackActive: {
    backgroundColor: colors.active.emerald30,
  },
  toggleThumb: {
    width: 24, height: 24, borderRadius: radius.full,
    backgroundColor: '#fff',
    transform: [{ translateX: 0 }],
  },
  toggleThumbActive: {
    transform: [{ translateX: 24 }],
  },
  toggleThumbGradient: {
    width: '100%', height: '100%', borderRadius: radius.full,
  },

  // Row styles with glassmorphism
  row: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.sm, paddingVertical: spacing.sm,
    borderRadius: radius.md,
  },
  rowPressable: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.sm, paddingVertical: spacing.sm,
    borderRadius: radius.md,
  },
  rowContent: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
  },
  rowIconBg: {
    width: 36, height: 36, borderRadius: radius.sm,
    alignItems: 'center', justifyContent: 'center',
  },
  rowText: { flex: 1 },
  rowLabel: { color: colors.text.primary, fontSize: fontSize.base, fontWeight: '500' },
  rowHint: { color: colors.text.tertiary, fontSize: fontSize.xs, marginTop: 2 },
  destructive: { color: colors.error },
  valueBadge: {
    paddingHorizontal: spacing.sm, paddingVertical: spacing.xs,
    borderRadius: radius.sm,
  },
  valueText: { color: colors.text.primary, fontSize: fontSize.sm },
  divider: { height: 0.5, backgroundColor: colors.active.white6, marginVertical: spacing.xs },
});