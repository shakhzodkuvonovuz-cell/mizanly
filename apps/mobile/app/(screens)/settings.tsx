import { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ScrollView, Switch, Alert, Linking,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useClerk } from '@clerk/clerk-expo';
import { Icon } from '@/components/ui/Icon';
import { Skeleton } from '@/components/ui/Skeleton';
import { GlassHeader } from '@/components/ui/GlassHeader';
import { colors, spacing, fontSize, radius } from '@/theme';
import { settingsApi, usersApi } from '@/services/api';
import { useStore } from "@/store";
import { useHaptic } from '@/hooks/useHaptic';

function Row({
  label,
  hint,
  icon,
  rightText,
  value,
  onToggle,
  onPress,
  destructive,
}: {
  label: string;
  hint?: string;
  icon?: React.ReactNode;
  rightText?: string;
  value?: boolean;
  onToggle?: (v: boolean) => void;
  onPress?: () => void;
  destructive?: boolean;
}) {
  const haptic = useHaptic();
  const handlePress = onPress ? () => {
    haptic.selection();
    onPress();
  } : undefined;
  return (
    <TouchableOpacity
      style={styles.row}
      onPress={handlePress}
      activeOpacity={handlePress ? 0.7 : 1}
      disabled={!handlePress && !onToggle}
    >
      {icon ? <View style={styles.rowIcon}>{icon}</View> : null}
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
      ) : rightText ? (
        <Text style={styles.rowRightText}>{rightText}</Text>
      ) : onPress ? (
        <Icon name="chevron-right" size="sm" color={colors.text.tertiary} />
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
  const { theme, setTheme } = useStore();
  const insets = useSafeAreaInsets();

  const settingsQuery = useQuery({
    queryKey: ['settings'],
    queryFn: () => settingsApi.get(),
  });
  const s = settingsQuery.data;

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
  }, [s]);

  const privacyMutation = useMutation({ mutationFn: settingsApi.updatePrivacy });
  const notifMutation = useMutation({ mutationFn: settingsApi.updateNotifications });
  const accessibilityMutation = useMutation({ mutationFn: settingsApi.updateAccessibility });
  const wellbeingMutation = useMutation({ mutationFn: settingsApi.updateWellbeing });

  const deactivateMutation = useMutation({
    mutationFn: () => usersApi.deactivate(),
    onSuccess: async () => {
      await signOut();
    },
    onError: (err: Error) => Alert.alert('Error', err.message),
  });

  const deleteAccountMutation = useMutation({
    mutationFn: () => usersApi.deleteAccount(),
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

  const handleDeleteAccount = () => {
    Alert.alert(
      'Delete Account',
      'This will permanently delete your account and all your data. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            Alert.alert(
              'Are you absolutely sure?',
              'Type DELETE to confirm.',
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Confirm Delete',
                  style: 'destructive',
                  onPress: async () => {
                    await deleteAccountMutation.mutateAsync();
                  },
                },
              ],
            );
          },
        },
      ],
    );
  };

  if (settingsQuery.isLoading) {
    return (
      <View style={styles.container}>
        <GlassHeader
          title="Settings"
          leftAction={{ icon: 'arrow-left', onPress: () => router.back(), accessibilityLabel: 'Back' }}
        />
        <View style={{ flex: 1, padding: spacing.base, paddingTop: insets.top + 60, gap: spacing.lg }}>
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton.Rect key={i} width="100%" height={48} />
          ))}
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <GlassHeader
        title="Settings"
        leftAction={{ icon: 'arrow-left', onPress: () => router.back(), accessibilityLabel: 'Back' }}
      />

      <ScrollView style={styles.body} contentContainerStyle={[styles.bodyContent, { paddingTop: insets.top + 52 }]}>
        {/* Content */}
        <SectionHeader title="Content" />
        <View style={styles.card}>
          <Row
            label="Content Preferences"
            onPress={() => router.push('/(screens)/content-settings')}
          />
        </View>
        {/* Appearance */}
        <SectionHeader title="Appearance" />
        <View style={styles.card}>
          <Row
            label="Appearance"
            icon={<Icon name="eye" size="sm" color={colors.text.secondary} />}
            hint="Theme, dark mode, and visual settings"
            onPress={() => router.push('/(screens)/theme-settings')}
          />
          <View style={styles.divider} />
          <Row
            label="Saved"
            hint="Your saved posts and threads"
            onPress={() => router.push('/(screens)/saved')}
          />
        </View>

        {/* Profile */}
        <SectionHeader title="Profile" />
        <View style={styles.card}>
          <Row
            label="Share Profile"
            icon={<Icon name="share" size="sm" color={colors.text.secondary} />}
            hint="Share your profile via QR code or link"
            onPress={() => router.push('/(screens)/share-profile')}
          />
        </View>

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
            onPress={() => router.push('/(screens)/blocked-keywords')}
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

        {/* Creator */}
        <SectionHeader title="Creator" />
        <View style={styles.card}>
          <Row
            label="Analytics"
            onPress={() => router.push('/(screens)/analytics')}
          />
        </View>

        {/* Account */}
        <SectionHeader title="Account" />
        <View style={styles.card}>
          <Row
            label="Account"
            icon={<Icon name="user" size="sm" color={colors.text.secondary} />}
            hint="Manage account settings"
            onPress={() => router.push('/(screens)/account-settings')}
          />
          <View style={styles.divider} />
          <Row
            label="Deactivate Account"
            destructive
            onPress={handleDeactivate}
          />
          <View style={styles.divider} />
          <Row
            label="Delete Account"
            destructive
            onPress={handleDeleteAccount}
          />
        </View>

        {/* Sign Out */}
        <TouchableOpacity style={styles.signOutButton} onPress={handleSignOut} activeOpacity={0.7}>
          <Icon name="log-out" size="sm" color={colors.error} />
          <Text style={styles.signOutLabel}>Sign Out</Text>
        </TouchableOpacity>

        {/* About */}
        <SectionHeader title="About" />
        <View style={styles.card}>
          <Row label="Version" rightText="1.0.0" />
          <View style={styles.divider} />
          <Row
            label="Terms of Service"
            onPress={() => Linking.openURL('https://mizanly.app/terms')}
          />
          <View style={styles.divider} />
          <Row
            label="Privacy Policy"
            onPress={() => Linking.openURL('https://mizanly.app/privacy')}
          />
          <View style={styles.divider} />
          <Row
            label="Licenses"
            onPress={() => Linking.openURL('https://mizanly.app/licenses')}
          />
        </View>

        <Text style={styles.version}>Mizanly v1.0.0</Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.dark.bg },
  body: { flex: 1 },
  bodyContent: { paddingBottom: 60 },

  sectionHeader: {
    color: colors.text.secondary, fontSize: fontSize.xs, fontWeight: '600',
    textTransform: 'uppercase', letterSpacing: 0.8,
    paddingHorizontal: spacing.base, paddingTop: spacing.xl, paddingBottom: spacing.sm,
    borderLeftWidth: 3, borderLeftColor: colors.emerald, paddingLeft: spacing.sm,
    marginLeft: spacing.base,
  },
  card: {
    backgroundColor: colors.dark.bgCard, borderRadius: radius.lg,
    borderWidth: 0.5, borderColor: colors.dark.border,
    overflow: 'hidden', marginHorizontal: spacing.base, marginBottom: spacing.md,
  },

  row: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.base, paddingVertical: spacing.md,
  },
  rowIcon: { marginRight: spacing.sm },
  rowText: { flex: 1, marginRight: spacing.md },
  rowLabel: { color: colors.text.primary, fontSize: fontSize.base },
  rowHint: { color: colors.text.tertiary, fontSize: fontSize.xs, marginTop: 2 },
  rowRightText: { color: colors.text.tertiary, fontSize: fontSize.sm },
  destructive: { color: '#FF453A' },
  divider: { height: 0.5, backgroundColor: colors.dark.border, marginLeft: spacing.base },

  signOutButton: {
    borderWidth: 1.5, borderColor: colors.error, borderRadius: radius.md,
    padding: spacing.md, flexDirection: 'row', alignItems: 'center',
    justifyContent: 'center', gap: spacing.sm,
    marginHorizontal: spacing.base, marginTop: spacing.xl,
  },
  signOutLabel: {
    color: colors.error, fontSize: fontSize.base, fontWeight: '600',
  },

  version: {
    color: colors.text.tertiary, fontSize: fontSize.xs, textAlign: 'center', marginTop: spacing.xl,
  },
});
