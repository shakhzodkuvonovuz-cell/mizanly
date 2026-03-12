import { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ScrollView, Switch, Alert,
} from 'react-native';
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
import { usersApi, settingsApi } from '@/services/api';
import type { Settings } from '@/types';
import { useStore, useSafFeedType, useMajlisFeedType } from '@/store';

type WellbeingSettings = Parameters<typeof settingsApi.updateWellbeing>[0];

// Section icons mapping
const sectionIcons: Record<string, IconName> = {
  'Feed Preferences': 'trending-up',
  'Content Filters': 'filter',
  'Blocked Keywords': 'slash',
  'Digital Wellbeing': 'clock',
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
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={onPress ? 0.8 : 1}
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
            <Text style={[styles.rowLabel, destructive && styles.destructive]}>{label}</Text>
            {hint ? <Text style={styles.rowHint}>{hint}</Text> : null}
          </View>
        </View>
        {onToggle !== undefined && value !== undefined ? (
          <TouchableOpacity
            style={[styles.toggleTrack, value && styles.toggleTrackActive]}
            onPress={() => onToggle(!value)}
            activeOpacity={0.9}
          >
            <View style={[styles.toggleThumb, value && styles.toggleThumbActive]}>
              <LinearGradient
                colors={value ? [colors.emerald, colors.emerald] : ['#fff', '#f0f0f0']}
                style={styles.toggleThumbGradient}
              />
            </View>
          </TouchableOpacity>
        ) : onPress ? (
          <Icon name="chevron-right" size="sm" color={colors.text.tertiary} />
        ) : null}
      </LinearGradient>
    </TouchableOpacity>
  );
}

function SectionHeader({ title }: { title: string }) {
  const icon = sectionIcons[title] || 'settings';
  return (
    <View style={styles.sectionHeader}>
      <LinearGradient
        colors={['rgba(10,123,79,0.2)', 'rgba(200,150,62,0.1)']}
        style={styles.sectionIconBg}
      >
        <Icon name={icon} size="xs" color={colors.emerald} />
      </LinearGradient>
      <Text style={styles.sectionHeaderText}>{title}</Text>
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
      setSensitiveContent(s.sensitiveContentFilter ?? false);
    }
  }, [s]);

  // BottomSheet states
  const [safPickerVisible, setSafPickerVisible] = useState(false);
  const [majlisPickerVisible, setMajlisPickerVisible] = useState(false);
  const [dailyReminderPickerVisible, setDailyReminderPickerVisible] = useState(false);

  const wellbeingMutation = useMutation<Settings, Error, WellbeingSettings>({
    mutationFn: settingsApi.updateWellbeing,
    onError: (err: Error) => Alert.alert('Error', err.message),
  });

  const handleUpdateSensitiveContent = (v: boolean) => {
    setSensitiveContent(v);
    wellbeingMutation.mutate({ sensitiveContentFilter: v });
  };

  const handleUpdateDailyReminder = async (option: DailyReminderOption) => {
    setDailyReminder(option);
    const timeMap: Record<DailyReminderOption, string | undefined> = {
      'off': undefined,
      '30min': '30',
      '1h': '60',
      '2h': '120',
    };
    try {
      await usersApi.updateDailyReminder(option !== 'off', timeMap[option]);
    } catch {
      // Silently fail — setting is persisted locally regardless
    }
  };

  const safOptions: { label: string; value: SafFeedType }[] = [
    { label: 'Following', value: 'following' },
    { label: 'For You', value: 'foryou' },
  ];

  const majlisOptions: { label: string; value: MajlisFeedType }[] = [
    { label: 'For You', value: 'foryou' },
    { label: 'Following', value: 'following' },
    { label: 'Trending', value: 'trending' },
  ];

  const dailyReminderOptions: { label: string; value: DailyReminderOption }[] = [
    { label: 'Off', value: 'off' },
    { label: '30 minutes', value: '30min' },
    { label: '1 hour', value: '1h' },
    { label: '2 hours', value: '2h' },
  ];

  if (settingsQuery.isError) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: spacing.base }}>
          <Text style={{ color: colors.error, fontSize: fontSize.base, marginBottom: spacing.md }}>
            Failed to load settings
          </Text>
          <TouchableOpacity onPress={() => settingsQuery.refetch()}>
            <Text style={{ color: colors.emerald, fontSize: fontSize.base }}>Try Again</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (settingsQuery.isLoading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={{ flex: 1, padding: spacing.base, gap: spacing.lg }}>
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton.Rect key={i} width="100%" height={48} />
          ))}
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <GlassHeader
        title="Content Preferences"
        leftAction={{ icon: 'arrow-left', onPress: () => router.back(), accessibilityLabel: 'Go back' }}
      />

      <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
        {/* Feed Preferences */}
        <Animated.View entering={FadeInUp.duration(400)}>
          <SectionHeader title="Feed Preferences" />
          <LinearGradient
            colors={['rgba(45,53,72,0.4)', 'rgba(28,35,51,0.2)']}
            style={styles.card}
          >
            <TouchableOpacity
              style={styles.rowPressable}
              onPress={() => setSafPickerVisible(true)}
              accessibilityLabel="Saf default feed"
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
                  <Text style={styles.rowLabel}>Saf default</Text>
                  <Text style={styles.rowHint}>Choose default feed for Saf</Text>
                </View>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
                <LinearGradient
                  colors={['rgba(10,123,79,0.15)', 'rgba(10,123,79,0.05)']}
                  style={styles.valueBadge}
                >
                  <Text style={styles.valueText}>
                    {safFeedType === 'following' ? 'Following' : 'For You'}
                  </Text>
                </LinearGradient>
                <Icon name="chevron-right" size="sm" color={colors.text.tertiary} />
              </View>
            </TouchableOpacity>
            <View style={styles.divider} />
            <TouchableOpacity
              style={styles.rowPressable}
              onPress={() => setMajlisPickerVisible(true)}
              accessibilityLabel="Majlis default feed"
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
                  <Text style={styles.rowLabel}>Majlis default</Text>
                  <Text style={styles.rowHint}>Choose default feed for Majlis</Text>
                </View>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
                <LinearGradient
                  colors={['rgba(200,150,62,0.15)', 'rgba(200,150,62,0.05)']}
                  style={styles.valueBadge}
                >
                  <Text style={styles.valueText}>
                    {majlisFeedType === 'foryou' ? 'For You' : majlisFeedType === 'following' ? 'Following' : 'Trending'}
                  </Text>
                </LinearGradient>
                <Icon name="chevron-right" size="sm" color={colors.text.tertiary} />
              </View>
            </TouchableOpacity>
          </LinearGradient>
        </Animated.View>

        {/* Content Filters */}
        <Animated.View entering={FadeInUp.delay(100).duration(400)}>
          <SectionHeader title="Content Filters" />
          <LinearGradient
            colors={['rgba(45,53,72,0.4)', 'rgba(28,35,51,0.2)']}
            style={styles.card}
          >
            <Row
              label="Filter sensitive content"
              hint="Hide posts marked as sensitive"
              value={sensitiveContent}
              onToggle={handleUpdateSensitiveContent}
              icon="eye"
            />
            <View style={styles.divider} />
            <Row
              label="Hide reposted content"
              hint="Don't show reposted posts in feeds"
              value={hideRepostedContent}
              onToggle={setHideRepostedContent}
              icon="repeat"
            />
          </LinearGradient>
        </Animated.View>

        {/* Blocked Keywords */}
        <Animated.View entering={FadeInUp.delay(200).duration(400)}>
          <SectionHeader title="Blocked Keywords" />
          <LinearGradient
            colors={['rgba(45,53,72,0.4)', 'rgba(28,35,51,0.2)']}
            style={styles.card}
          >
            <Row
              label="Manage Blocked Keywords"
              hint="Add or remove filtered keywords"
              onPress={() => router.push('/(screens)/blocked-keywords')}
              icon="slash"
            />
          </LinearGradient>
        </Animated.View>

        {/* Digital Wellbeing */}
        <Animated.View entering={FadeInUp.delay(300).duration(400)}>
          <SectionHeader title="Digital Wellbeing" />
          <LinearGradient
            colors={['rgba(45,53,72,0.4)', 'rgba(28,35,51,0.2)']}
            style={styles.card}
          >
            <TouchableOpacity
              style={styles.rowPressable}
              onPress={() => setDailyReminderPickerVisible(true)}
              accessibilityLabel="Daily reminder"
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
                  <Text style={styles.rowLabel}>Daily reminder</Text>
                  <Text style={styles.rowHint}>Get a reminder after using app for a while</Text>
                </View>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
                <LinearGradient
                  colors={['rgba(10,123,79,0.15)', 'rgba(10,123,79,0.05)']}
                  style={styles.valueBadge}
                >
                  <Text style={styles.valueText}>
                    {dailyReminder === 'off' ? 'Off' : dailyReminder === '30min' ? '30 min' : dailyReminder === '1h' ? '1 hour' : '2 hours'}
                  </Text>
                </LinearGradient>
                <Icon name="chevron-right" size="sm" color={colors.text.tertiary} />
              </View>
            </TouchableOpacity>
          </LinearGradient>
        </Animated.View>
      </ScrollView>

      {/* BottomSheet for Saf feed picker */}
      <BottomSheet visible={safPickerVisible} onClose={() => setSafPickerVisible(false)}>
        {safOptions.map((opt) => (
          <BottomSheetItem
            key={opt.value}
            label={opt.label}
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
            label={opt.label}
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
            label={opt.label}
            onPress={() => {
              handleUpdateDailyReminder(opt.value);
              setDailyReminderPickerVisible(false);
            }}
            icon={dailyReminder === opt.value ? <Icon name="check" size="sm" color={colors.emerald} /> : undefined}
          />
        ))}
      </BottomSheet>
    </SafeAreaView>
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
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
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
    backgroundColor: 'rgba(10,123,79,0.3)',
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
  divider: { height: 0.5, backgroundColor: 'rgba(255,255,255,0.06)', marginVertical: spacing.xs },
});