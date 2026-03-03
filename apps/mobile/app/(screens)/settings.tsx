import { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ScrollView, Switch, Alert, ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery, useMutation } from '@tanstack/react-query';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useClerk } from '@clerk/clerk-expo';
import { colors, spacing, fontSize } from '@/theme';
import { settingsApi, usersApi } from '@/services/api';

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
        />
      ) : onPress ? (
        <Text style={styles.chevron}>›</Text>
      ) : null}
    </TouchableOpacity>
  );
}

function SectionHeader({ title }: { title: string }) {
  return <Text style={styles.sectionHeader}>{title}</Text>;
}

export default function SettingsScreen() {
  const router = useRouter();
  const { signOut } = useClerk();

  const settingsQuery = useQuery({
    queryKey: ['settings'],
    queryFn: () => settingsApi.get(),
  });
  const s: any = settingsQuery.data ?? {};

  // Local state mirrors the fetched settings
  const [isPrivate, setIsPrivate] = useState(false);
  const [notifyLikes, setNotifyLikes] = useState(true);
  const [notifyComments, setNotifyComments] = useState(true);
  const [notifyFollows, setNotifyFollows] = useState(true);
  const [notifyMentions, setNotifyMentions] = useState(true);
  const [notifyMessages, setNotifyMessages] = useState(true);
  const [sensitiveContent, setSensitiveContent] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    if (s) {
      setIsPrivate(s.isPrivate ?? false);
      setNotifyLikes(s.notifyLikes ?? true);
      setNotifyComments(s.notifyComments ?? true);
      setNotifyFollows(s.notifyFollows ?? true);
      setNotifyMentions(s.notifyMentions ?? true);
      setNotifyMessages(s.notifyMessages ?? true);
      setSensitiveContent(s.sensitiveContentFilter ?? false);
      setReducedMotion(s.reducedMotion ?? false);
    }
  }, [settingsQuery.data]);

  const privacyMutation = useMutation({
    mutationFn: (data: any) => settingsApi.updatePrivacy(data),
  });

  const notifMutation = useMutation({
    mutationFn: (data: any) => settingsApi.updateNotifications(data),
  });

  const accessibilityMutation = useMutation({
    mutationFn: (data: any) => settingsApi.updateAccessibility(data),
  });

  const wellbeingMutation = useMutation({
    mutationFn: (data: any) => settingsApi.updateWellbeing(data),
  });

  const deactivateMutation = useMutation({
    mutationFn: () => usersApi.deactivate(),
    onSuccess: async () => {
      await signOut();
    },
    onError: (err: Error) => Alert.alert('Error', err.message),
  });

  const handleSignOut = () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', onPress: () => signOut() },
    ]);
  };

  const handleDeactivate = () => {
    Alert.alert(
      'Deactivate Account',
      'Your account will be hidden. You can reactivate by signing back in. Continue?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Deactivate',
          style: 'destructive',
          onPress: () => deactivateMutation.mutate(),
        },
      ],
    );
  };

  if (settingsQuery.isLoading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <ActivityIndicator color={colors.emerald} style={{ flex: 1 }} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={8}>
          <Text style={styles.backIcon}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Settings</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
        {/* Privacy */}
        <SectionHeader title="Privacy" />
        <View style={styles.card}>
          <Row
            label="Private Account"
            hint="Only approved followers see your posts"
            value={isPrivate}
            onToggle={(v) => { setIsPrivate(v); privacyMutation.mutate({ isPrivate: v }); }}
          />
          <View style={styles.divider} />
          <View style={styles.divider} />
          <Row
            label="Follow Requests"
            hint="Approve or deny pending requests"
            onPress={() => router.push('/(screens)/follow-requests')}
          />
          <View style={styles.divider} />
          <Row
            label="Blocked Keywords"
            hint="Filter comments with specific words"
            onPress={() => {}}
          />
        </View>

        {/* Notifications */}
        <SectionHeader title="Notifications" />
        <View style={styles.card}>
          <Row
            label="Likes"
            value={notifyLikes}
            onToggle={(v) => { setNotifyLikes(v); notifMutation.mutate({ notifyLikes: v }); }}
          />
          <View style={styles.divider} />
          <Row
            label="Comments"
            value={notifyComments}
            onToggle={(v) => { setNotifyComments(v); notifMutation.mutate({ notifyComments: v }); }}
          />
          <View style={styles.divider} />
          <Row
            label="New Followers"
            value={notifyFollows}
            onToggle={(v) => { setNotifyFollows(v); notifMutation.mutate({ notifyFollows: v }); }}
          />
          <View style={styles.divider} />
          <Row
            label="Mentions"
            value={notifyMentions}
            onToggle={(v) => { setNotifyMentions(v); notifMutation.mutate({ notifyMentions: v }); }}
          />
          <View style={styles.divider} />
          <Row
            label="Messages"
            value={notifyMessages}
            onToggle={(v) => { setNotifyMessages(v); notifMutation.mutate({ notifyMessages: v }); }}
          />
        </View>

        {/* Wellbeing */}
        <SectionHeader title="Wellbeing" />
        <View style={styles.card}>
          <Row
            label="Filter Sensitive Content"
            hint="Hide posts marked as sensitive"
            value={sensitiveContent}
            onToggle={(v) => { setSensitiveContent(v); wellbeingMutation.mutate({ sensitiveContentFilter: v }); }}
          />
        </View>

        {/* Accessibility */}
        <SectionHeader title="Accessibility" />
        <View style={styles.card}>
          <Row
            label="Reduce Motion"
            hint="Minimize animations throughout the app"
            value={reducedMotion}
            onToggle={(v) => { setReducedMotion(v); accessibilityMutation.mutate({ reducedMotion: v }); }}
          />
        </View>

        {/* Blocked & Muted */}
        <SectionHeader title="Blocked & Muted" />
        <View style={styles.card}>
          <Row
            label="Blocked Accounts"
            onPress={() => router.push('/(screens)/blocked')}
          />
          <View style={styles.divider} />
          <Row
            label="Muted Accounts"
            onPress={() => router.push('/(screens)/muted')}
          />
        </View>

        {/* Circles */}
        <SectionHeader title="Close Friends" />
        <View style={styles.card}>
          <Row
            label="Circles"
            hint="Manage your close friends groups"
            onPress={() => router.push('/(screens)/circles')}
          />
        </View>

        {/* Account */}
        <SectionHeader title="Account" />
        <View style={styles.card}>
          <Row label="Sign Out" onPress={handleSignOut} />
          <View style={styles.divider} />
          <Row
            label="Deactivate Account"
            destructive
            onPress={handleDeactivate}
          />
        </View>

        <Text style={styles.version}>Mizanly v0.1.0</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.dark.bg },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.base, paddingVertical: spacing.sm,
    borderBottomWidth: 0.5, borderBottomColor: colors.dark.border,
  },
  backIcon: { color: colors.text.primary, fontSize: 22, width: 36 },
  headerTitle: { color: colors.text.primary, fontSize: fontSize.base, fontWeight: '700' },

  body: { flex: 1 },
  bodyContent: { paddingBottom: 60 },

  sectionHeader: {
    color: colors.text.secondary, fontSize: fontSize.xs, fontWeight: '600',
    textTransform: 'uppercase', letterSpacing: 0.8,
    paddingHorizontal: spacing.base, paddingTop: spacing.xl, paddingBottom: spacing.sm,
  },
  card: {
    backgroundColor: colors.dark.bgElevated,
    marginHorizontal: spacing.base, borderRadius: 14, overflow: 'hidden',
  },

  row: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.base, paddingVertical: spacing.md,
  },
  rowText: { flex: 1, marginRight: spacing.md },
  rowLabel: { color: colors.text.primary, fontSize: fontSize.base },
  rowHint: { color: colors.text.tertiary, fontSize: fontSize.xs, marginTop: 2 },
  destructive: { color: '#FF453A' },
  chevron: { color: colors.text.tertiary, fontSize: 20 },
  divider: { height: 0.5, backgroundColor: colors.dark.border, marginLeft: spacing.base },

  version: {
    color: colors.text.tertiary, fontSize: fontSize.xs, textAlign: 'center', marginTop: spacing.xl,
  },
});
