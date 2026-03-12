import { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ScrollView, Switch, Alert, Linking, Pressable,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useClerk } from '@clerk/clerk-expo';
import Animated, { FadeInUp, useSharedValue, useAnimatedStyle, withSpring } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { Icon } from '@/components/ui/Icon';
import { Skeleton } from '@/components/ui/Skeleton';
import { GlassHeader } from '@/components/ui/GlassHeader';
import { colors, spacing, fontSize, radius } from '@/theme';
import { settingsApi, usersApi } from '@/services/api';
import { useStore } from "@/store";
import { useHaptic } from '@/hooks/useHaptic';
import { useTranslation } from '@/hooks/useTranslation';

// Premium Toggle Switch Component
function PremiumToggle({ value, onValueChange }: { value: boolean; onValueChange: (v: boolean) => void }) {
  const haptic = useHaptic();
  const translateX = useSharedValue(value ? 20 : 0);
  const scale = useSharedValue(1);

  useEffect(() => {
    translateX.value = withSpring(value ? 20 : 0, { damping: 15, stiffness: 200 });
  }, [value]);

  const handlePress = () => {
    haptic.light();
    scale.value = withSequence(
      withSpring(0.95, { damping: 10 }),
      withSpring(1, { damping: 10 })
    );
    onValueChange(!value);
  };

  const thumbStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }, { scale: scale.value }],
  }));

  return (
    <Pressable onPress={handlePress}>
      <LinearGradient
        colors={value ? [colors.emerald, '#05593A'] : [colors.dark.border, colors.dark.surface]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.toggleTrack}
      >
        <Animated.View style={[styles.toggleThumb, thumbStyle]}>
          {value && (
            <LinearGradient
              colors={['#fff', '#f0f0f0']}
              style={styles.toggleThumbGradient}
            />
          )}
        </Animated.View>
      </LinearGradient>
    </Pressable>
  );
}

function Row({
  label,
  hint,
  icon,
  rightText,
  value,
  onToggle,
  onPress,
  destructive,
  isLast,
}: {
  label: string;
  hint?: string;
  icon?: React.ReactNode;
  rightText?: string;
  value?: boolean;
  onToggle?: (v: boolean) => void;
  onPress?: () => void;
  destructive?: boolean;
  isLast?: boolean;
}) {
  const haptic = useHaptic();
  const handlePress = onPress ? () => {
    haptic.selection();
    onPress();
  } : undefined;

  return (
    <TouchableOpacity
      style={[styles.row, isLast && styles.rowLast]}
      onPress={handlePress}
      activeOpacity={handlePress ? 0.7 : 1}
      disabled={!handlePress && !onToggle}
    >
      {icon ? (
        <LinearGradient
          colors={destructive ? ['rgba(248,81,73,0.2)', 'rgba(248,81,73,0.1)'] : ['rgba(10,123,79,0.15)', 'rgba(10,123,79,0.05)']}
          style={styles.rowIconContainer}
        >
          {icon}
        </LinearGradient>
      ) : (
        <View style={styles.rowIconSpacer} />
      )}
      <View style={styles.rowText}>
        <Text style={[styles.rowLabel, destructive && styles.destructive]}>{label}</Text>
        {hint ? <Text style={styles.rowHint}>{hint}</Text> : null}
      </View>
      {onToggle !== undefined && value !== undefined ? (
        <PremiumToggle value={value} onValueChange={onToggle} />
      ) : rightText ? (
        <Text style={styles.rowRightText}>{rightText}</Text>
      ) : onPress ? (
        <View style={styles.rowChevron}>
          <Icon name="chevron-right" size="sm" color={colors.text.tertiary} />
        </View>
      ) : null}
    </TouchableOpacity>
  );
}

function SectionHeader({ title, icon }: { title: string; icon?: React.ComponentProps<typeof Icon>['name'] }) {
  return (
    <View style={styles.sectionHeaderContainer}>
      {icon && (
        <LinearGradient
          colors={[colors.gold, '#A67C00']}
          style={styles.sectionHeaderIcon}
        >
          <Icon name={icon} size={12} color="#0D1117" />
        </LinearGradient>
      )}
      <LinearGradient
        colors={[colors.gold, colors.emerald, 'transparent']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={styles.sectionHeaderAccent}
      />
      <Text style={styles.sectionHeader}>{title}</Text>
    </View>
  );
}

export default function SettingsScreen() {
  const router = useRouter();
  const { signOut } = useClerk();
  const { theme, setTheme } = useStore();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();

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
    onError: (err: Error) => Alert.alert(t('common.error'), err.message),
  });

  const deleteAccountMutation = useMutation({
    mutationFn: () => usersApi.deleteAccount(),
    onSuccess: async () => {
      await signOut();
    },
    onError: (err: Error) => Alert.alert(t('common.error'), err.message),
  });

  const handleSignOut = () => {
    Alert.alert(t('settings.signOut'), t('settings.confirmSignOut'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('settings.signOut'), onPress: () => signOut() },
    ]);
  };

  const handleDeactivate = () => {
    Alert.alert(
      t('settings.deactivateAccount'),
      t('settings.deactivateMessage'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('settings.deactivate'),
          style: 'destructive',
          onPress: () => deactivateMutation.mutate(),
        },
      ],
    );
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      t('settings.deleteAccount'),
      t('settings.deleteMessage'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('settings.delete'),
          style: 'destructive',
          onPress: () => {
            Alert.alert(
              t('settings.deleteConfirmTitle'),
              t('settings.deleteConfirmMessage'),
              [
                { text: t('common.cancel'), style: 'cancel' },
                {
                  text: t('settings.confirmDelete'),
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
          title={t('settings.title')}
          leftAction={{ icon: 'arrow-left', onPress: () => router.back(), accessibilityLabel: t('common.back') }}
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
        title={t('settings.title')}
        leftAction={{ icon: 'arrow-left', onPress: () => router.back(), accessibilityLabel: t('common.back') }}
      />

      <ScrollView style={styles.body} contentContainerStyle={[styles.bodyContent, { paddingTop: insets.top + 52 }]}>
        {/* Content Section */}
        <SectionHeader title={t('settings.sections.content')} icon="layers" />
        <LinearGradient
          colors={['rgba(45,53,72,0.4)', 'rgba(28,35,51,0.2)']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.card}
        >
          <Row
            label={t('settings.contentPreferences')}
            icon={<Icon name="settings" size="sm" color={colors.emerald} />}
            onPress={() => router.push('/(screens)/content-settings')}
          />
          <View style={styles.divider} />
          <Row
            label={t('settings.drafts')}
            icon={<Icon name="clock" size="sm" color={colors.gold} />}
            onPress={() => router.push('/(screens)/drafts')}
          />
          <View style={styles.divider} />
          <Row
            label={t('settings.archive')}
            icon={<Icon name="bookmark" size="sm" color={colors.emerald} />}
            onPress={() => router.push('/(screens)/archive')}
          />
          <View style={styles.divider} />
          <Row
            label={t('settings.watchHistory')}
            icon={<Icon name="play" size="sm" color={colors.gold} />}
            onPress={() => router.push('/(screens)/watch-history')}
            isLast
          />
        </LinearGradient>

        {/* Appearance Section */}
        <SectionHeader title={t('settings.appearance')} icon="eye" />
        <LinearGradient
          colors={['rgba(45,53,72,0.4)', 'rgba(28,35,51,0.2)']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.card}
        >
          <Row
            label={t('settings.appearance')}
            icon={<Icon name="eye" size="sm" color={colors.emerald} />}
            hint={t('settings.hints.themeDarkMode')}
            onPress={() => router.push('/(screens)/theme-settings')}
          />
          <View style={styles.divider} />
          <Row
            label={t('settings.saved')}
            icon={<Icon name="bookmark-filled" size="sm" color={colors.gold} />}
            hint={t('settings.hints.savedPosts')}
            onPress={() => router.push('/(screens)/saved')}
            isLast
          />
        </LinearGradient>

        {/* Profile Section */}
        <SectionHeader title={t('settings.sections.profile')} icon="user" />
        <LinearGradient
          colors={['rgba(45,53,72,0.4)', 'rgba(28,35,51,0.2)']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.card}
        >
          <Row
            label={t('profile.shareProfile')}
            icon={<Icon name="share" size="sm" color={colors.emerald} />}
            hint={t('settings.hints.shareProfile')}
            onPress={() => router.push('/(screens)/share-profile')}
            isLast
          />
        </LinearGradient>

        {/* Privacy Section */}
        <SectionHeader title={t('settings.privacy')} icon="lock" />
        <LinearGradient
          colors={['rgba(45,53,72,0.4)', 'rgba(28,35,51,0.2)']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.card}
        >
          <Row
            label={t('settings.privateAccount')}
            icon={<Icon name="lock" size="sm" color={colors.emerald} />}
            hint={t('settings.hints.privateAccount')}
            value={isPrivate}
            onToggle={(v) => { setIsPrivate(v); privacyMutation.mutate({ isPrivate: v }); }}
          />
          <View style={styles.divider} />
          <Row
            label={t('settings.followRequests')}
            icon={<Icon name="users" size="sm" color={colors.gold} />}
            hint={t('settings.hints.followRequests')}
            onPress={() => router.push('/(screens)/follow-requests')}
          />
          <View style={styles.divider} />
          <Row
            label={t('settings.blockedKeywords')}
            icon={<Icon name="slash" size="sm" color={colors.error} />}
            hint={t('settings.hints.blockedKeywords')}
            onPress={() => router.push('/(screens)/blocked-keywords')}
            isLast
          />
        </LinearGradient>

        {/* Notifications Section */}
        <SectionHeader title={t('settings.notifications')} icon="bell" />
        <LinearGradient
          colors={['rgba(45,53,72,0.4)', 'rgba(28,35,51,0.2)']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.card}
        >
          <Row
            label={t('settings.likes')}
            icon={<Icon name="heart" size="sm" color={colors.error} />}
            value={notifyLikes}
            onToggle={(v) => { setNotifyLikes(v); notifMutation.mutate({ notifyLikes: v }); }}
          />
          <View style={styles.divider} />
          <Row
            label={t('settings.comments')}
            icon={<Icon name="message-circle" size="sm" color={colors.emerald} />}
            value={notifyComments}
            onToggle={(v) => { setNotifyComments(v); notifMutation.mutate({ notifyComments: v }); }}
          />
          <View style={styles.divider} />
          <Row
            label={t('settings.newFollowers')}
            icon={<Icon name="user-plus" size="sm" color={colors.gold} />}
            value={notifyFollows}
            onToggle={(v) => { setNotifyFollows(v); notifMutation.mutate({ notifyFollows: v }); }}
          />
          <View style={styles.divider} />
          <Row
            label={t('settings.mentions')}
            icon={<Icon name="at-sign" size="sm" color={colors.emerald} />}
            value={notifyMentions}
            onToggle={(v) => { setNotifyMentions(v); notifMutation.mutate({ notifyMentions: v }); }}
          />
          <View style={styles.divider} />
          <Row
            label={t('settings.messages')}
            icon={<Icon name="mail" size="sm" color={colors.gold} />}
            value={notifyMessages}
            onToggle={(v) => { setNotifyMessages(v); notifMutation.mutate({ notifyMessages: v }); }}
            isLast
          />
        </LinearGradient>

        {/* Wellbeing Section */}
        <SectionHeader title={t('settings.sections.wellbeing')} icon="smile" />
        <LinearGradient
          colors={['rgba(45,53,72,0.4)', 'rgba(28,35,51,0.2)']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.card}
        >
          <Row
            label={t('settings.filterSensitiveContent')}
            icon={<Icon name="eye-off" size="sm" color={colors.emerald} />}
            hint={t('settings.hints.filterSensitiveContent')}
            value={sensitiveContent}
            onToggle={(v) => { setSensitiveContent(v); wellbeingMutation.mutate({ sensitiveContentFilter: v }); }}
            isLast
          />
        </LinearGradient>

        {/* Accessibility Section */}
        <SectionHeader title={t('settings.accessibility')} icon="volume-x" />
        <LinearGradient
          colors={['rgba(45,53,72,0.4)', 'rgba(28,35,51,0.2)']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.card}
        >
          <Row
            label={t('settings.reduceMotion')}
            icon={<Icon name="clock" size="sm" color={colors.gold} />}
            hint={t('settings.hints.reduceMotion')}
            value={reducedMotion}
            onToggle={(v) => { setReducedMotion(v); accessibilityMutation.mutate({ reducedMotion: v }); }}
            isLast
          />
        </LinearGradient>

        {/* Blocked & Muted Section */}
        <SectionHeader title={t('settings.sections.blockedMuted')} icon="slash" />
        <LinearGradient
          colors={['rgba(45,53,72,0.4)', 'rgba(28,35,51,0.2)']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.card}
        >
          <Row
            label={t('settings.blockedAccounts')}
            icon={<Icon name="x" size="sm" color={colors.error} />}
            onPress={() => router.push('/(screens)/blocked')}
          />
          <View style={styles.divider} />
          <Row
            label={t('settings.mutedAccounts')}
            icon={<Icon name="volume-x" size="sm" color={colors.text.tertiary} />}
            onPress={() => router.push('/(screens)/muted')}
            isLast
          />
        </LinearGradient>

        {/* Circles Section */}
        <SectionHeader title={t('settings.sections.closeFriends')} icon="users" />
        <LinearGradient
          colors={['rgba(45,53,72,0.4)', 'rgba(28,35,51,0.2)']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.card}
        >
          <Row
            label={t('settings.circles')}
            icon={<Icon name="users" size="sm" color={colors.emerald} />}
            hint={t('settings.hints.circles')}
            onPress={() => router.push('/(screens)/circles')}
            isLast
          />
        </LinearGradient>

        {/* Creator Section */}
        <SectionHeader title={t('settings.sections.creator')} icon="bar-chart-2" />
        <LinearGradient
          colors={['rgba(45,53,72,0.4)', 'rgba(28,35,51,0.2)']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.card}
        >
          <Row
            label={t('settings.analytics')}
            icon={<Icon name="bar-chart-2" size="sm" color={colors.gold} />}
            onPress={() => router.push('/(screens)/analytics')}
          />
          <View style={styles.divider} />
          <Row
            label={t('settings.broadcastChannels')}
            icon={<Icon name="radio" size="sm" color={colors.emerald} />}
            onPress={() => router.push('/(screens)/broadcast-channels')}
          />
          <View style={styles.divider} />
          <Row
            label={t('settings.myReports')}
            icon={<Icon name="flag" size="sm" color={colors.error} />}
            onPress={() => router.push('/(screens)/my-reports')}
            isLast
          />
        </LinearGradient>

        {/* Account Section */}
        <SectionHeader title={t('settings.account')} icon="user" />
        <LinearGradient
          colors={['rgba(45,53,72,0.4)', 'rgba(28,35,51,0.2)']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.card}
        >
          <Row
            label={t('settings.account')}
            icon={<Icon name="user" size="sm" color={colors.emerald} />}
            hint={t('settings.hints.account')}
            onPress={() => router.push('/(screens)/account-settings')}
          />
          <View style={styles.divider} />
          <Row
            label={t('settings.deactivateAccount')}
            icon={<Icon name="x" size="sm" color={colors.error} />}
            destructive
            onPress={handleDeactivate}
          />
          <View style={styles.divider} />
          <Row
            label={t('settings.deleteAccount')}
            icon={<Icon name="trash" size="sm" color={colors.error} />}
            destructive
            onPress={handleDeleteAccount}
            isLast
          />
        </LinearGradient>

        {/* Premium Sign Out Button */}
        <TouchableOpacity style={styles.signOutButton} onPress={handleSignOut} activeOpacity={0.7}>
          <LinearGradient
            colors={['rgba(248,81,73,0.2)', 'rgba(248,81,73,0.1)']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.signOutGradient}
          >
            <Icon name="log-out" size="sm" color={colors.error} />
            <Text style={styles.signOutLabel}>{t('settings.signOut')}</Text>
          </LinearGradient>
        </TouchableOpacity>

        {/* About Section */}
        <SectionHeader title={t('settings.about')} icon="info" />
        <LinearGradient
          colors={['rgba(45,53,72,0.4)', 'rgba(28,35,51,0.2)']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.card}
        >
          <Row label={t('settings.version')} rightText="1.0.0" />
          <View style={styles.divider} />
          <Row
            label={t('settings.termsOfService')}
            icon={<Icon name="file-text" size="sm" color={colors.text.secondary} />}
            onPress={() => Linking.openURL('https://mizanly.app/terms')}
          />
          <View style={styles.divider} />
          <Row
            label={t('settings.privacyPolicy')}
            icon={<Icon name="shield" size="sm" color={colors.text.secondary} />}
            onPress={() => Linking.openURL('https://mizanly.app/privacy')}
          />
          <View style={styles.divider} />
          <Row
            label={t('settings.licenses')}
            icon={<Icon name="layers" size="sm" color={colors.text.secondary} />}
            onPress={() => Linking.openURL('https://mizanly.app/licenses')}
            isLast
          />
        </LinearGradient>

        <Text style={styles.version}>{t('settings.versionLabel')}</Text>
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

  // Premium Section Header
  sectionHeaderContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.base,
    paddingTop: spacing.xl,
    paddingBottom: spacing.sm,
  },
  sectionHeaderIcon: {
    width: 24,
    height: 24,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionHeaderAccent: {
    width: 4,
    height: 16,
    borderRadius: 2,
  },
  sectionHeader: {
    color: colors.text.secondary,
    fontSize: fontSize.xs,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },

  // Premium Toggle Switch
  toggleTrack: {
    width: 50,
    height: 28,
    borderRadius: 14,
    padding: 4,
    justifyContent: 'center',
  },
  toggleThumb: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 3,
  },
  toggleThumbGradient: {
    width: '100%',
    height: '100%',
    borderRadius: 10,
  },

  // Premium Card
  card: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(45,53,72,0.3)',
    overflow: 'hidden',
    marginHorizontal: spacing.base,
    marginBottom: spacing.md,
  },

  // Premium Row
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
  },
  rowLast: {
    borderBottomWidth: 0,
  },
  rowIconContainer: {
    width: 32,
    height: 32,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.sm,
  },
  rowIconSpacer: {
    width: 32,
    marginRight: spacing.sm,
  },
  rowChevron: {
    width: 28,
    height: 28,
    borderRadius: radius.sm,
    backgroundColor: 'rgba(45,53,72,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Divider
  divider: {
    height: 1,
    backgroundColor: 'rgba(45,53,72,0.5)',
    marginLeft: spacing.base + 40,
  },

  // Premium Sign Out
  signOutGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(248,81,73,0.3)',
  },
});
