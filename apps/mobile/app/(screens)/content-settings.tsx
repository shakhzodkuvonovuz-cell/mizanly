import { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Pressable,
  ScrollView, Switch, Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery, useMutation } from '@tanstack/react-query';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Icon } from '@/components/ui/Icon';
import { Skeleton } from '@/components/ui/Skeleton';
import { BottomSheet, BottomSheetItem } from '@/components/ui/BottomSheet';
import { GlassHeader } from '@/components/ui/GlassHeader';
import { colors, spacing, fontSize, radius } from '@/theme';
import { usersApi, settingsApi } from '@/services/api';
import type { Settings } from '@/types';
import { useStore, useSafFeedType, useMajlisFeedType } from '@/store';

type WellbeingSettings = Parameters<typeof settingsApi.updateWellbeing>[0];

// Reuse Row and SectionHeader from settings.tsx (copied inline)
function Row({
  label,
  hint,
  value,
  onToggle,
  onPress,
  destructive,
}: {
  label: string;
  hint?: string;
  value?: boolean;
  onToggle?: (v: boolean) => void;
  onPress?: () => void;
  destructive?: boolean;
}) {
  return (
    <TouchableOpacity
      style={styles.row}
      onPress={onPress}
      activeOpacity={onPress ? 0.7 : 1}
      disabled={!onPress && !onToggle}
      accessibilityLabel={label}
      accessibilityRole={onToggle !== undefined ? 'switch' : 'button'}
    >
      <View style={styles.rowText}>
        <Text style={[styles.rowLabel, destructive && styles.destructive]}>{label}</Text>
        {hint ? <Text style={styles.rowHint}>{hint}</Text> : null}
      </View>
      {onToggle !== undefined && value !== undefined ? (
        <Switch
          value={value}
          onValueChange={onToggle}
          trackColor={{ false: colors.dark.border, true: colors.emerald }}
          thumbColor="#fff"
          accessibilityLabel={label}
          accessibilityRole="switch"
        />
      ) : onPress ? (
        <Icon name="chevron-right" size="sm" color={colors.text.tertiary} />
      ) : null}
    </TouchableOpacity>
  );
}

function SectionHeader({ title }: { title: string }) {
  return <Text style={styles.sectionHeader}>{title}</Text>;
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
        <SectionHeader title="Feed Preferences" />
        <View style={styles.card}>
          <TouchableOpacity
            style={styles.row}
            onPress={() => setSafPickerVisible(true)}
            accessibilityLabel="Saf default feed"
            accessibilityRole="button"
          >
            <View style={styles.rowText}>
              <Text style={styles.rowLabel}>Saf default</Text>
              <Text style={styles.rowHint}>Choose default feed for Saf</Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
              <Text style={styles.valueText}>
                {safFeedType === 'following' ? 'Following' : 'For You'}
              </Text>
              <Icon name="chevron-right" size="sm" color={colors.text.tertiary} />
            </View>
          </TouchableOpacity>
          <View style={styles.divider} />
          <TouchableOpacity
            style={styles.row}
            onPress={() => setMajlisPickerVisible(true)}
            accessibilityLabel="Majlis default feed"
            accessibilityRole="button"
          >
            <View style={styles.rowText}>
              <Text style={styles.rowLabel}>Majlis default</Text>
              <Text style={styles.rowHint}>Choose default feed for Majlis</Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
              <Text style={styles.valueText}>
                {majlisFeedType === 'foryou' ? 'For You' : majlisFeedType === 'following' ? 'Following' : 'Trending'}
              </Text>
              <Icon name="chevron-right" size="sm" color={colors.text.tertiary} />
            </View>
          </TouchableOpacity>
        </View>

        {/* Content Filters */}
        <SectionHeader title="Content Filters" />
        <View style={styles.card}>
          <Row
            label="Filter sensitive content"
            hint="Hide posts marked as sensitive"
            value={sensitiveContent}
            onToggle={handleUpdateSensitiveContent}
          />
          <View style={styles.divider} />
          <Row
            label="Hide reposted content"
            hint="Don't show reposted posts in feeds"
            value={hideRepostedContent}
            onToggle={setHideRepostedContent}
          />
        </View>

        {/* Blocked Keywords */}
        <SectionHeader title="Blocked Keywords" />
        <View style={styles.card}>
          <Row
            label="Manage Blocked Keywords"
            hint="Add or remove filtered keywords"
            onPress={() => router.push('/(screens)/blocked-keywords')}
          />
        </View>

        {/* Digital Wellbeing */}
        <SectionHeader title="Digital Wellbeing" />
        <View style={styles.card}>
          <TouchableOpacity
            style={styles.row}
            onPress={() => setDailyReminderPickerVisible(true)}
            accessibilityLabel="Daily reminder"
            accessibilityRole="button"
          >
            <View style={styles.rowText}>
              <Text style={styles.rowLabel}>Daily reminder</Text>
              <Text style={styles.rowHint}>Get a reminder after using app for a while</Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
              <Text style={styles.valueText}>
                {dailyReminder === 'off' ? 'Off' : dailyReminder === '30min' ? '30 min' : dailyReminder === '1h' ? '1 hour' : '2 hours'}
              </Text>
              <Icon name="chevron-right" size="sm" color={colors.text.tertiary} />
            </View>
          </TouchableOpacity>
        </View>
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

  sectionHeader: {
    color: colors.text.secondary, fontSize: fontSize.xs, fontWeight: '600',
    textTransform: 'uppercase', letterSpacing: 0.8,
    paddingHorizontal: spacing.base, paddingTop: spacing.xl, paddingBottom: spacing.sm,
  },
  card: {
    backgroundColor: colors.dark.bgCard,
    borderRadius: radius.lg,
    borderWidth: 0.5,
    borderColor: colors.dark.border,
    overflow: 'hidden',
    marginHorizontal: spacing.base,
    marginBottom: spacing.md,
  },

  row: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.base, paddingVertical: spacing.md,
  },
  rowText: { flex: 1, marginRight: spacing.md },
  rowLabel: { color: colors.text.primary, fontSize: fontSize.base },
  rowHint: { color: colors.text.tertiary, fontSize: fontSize.xs, marginTop: 2 },
  destructive: { color: '#FF453A' },
  valueText: { color: colors.text.primary, fontSize: fontSize.base },
  divider: { height: 0.5, backgroundColor: colors.dark.border, marginLeft: spacing.base },
});