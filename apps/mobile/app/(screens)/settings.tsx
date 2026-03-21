import { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet,
  ScrollView, Switch, Alert, Linking, Pressable,
import { useRouter } from 'expo-router';
import { navigate } from '@/utils/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useClerk } from '@clerk/clerk-expo';
import Animated, { FadeInUp, useSharedValue, useAnimatedStyle, withSpring, withSequence } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { Icon } from '@/components/ui/Icon';
import { Skeleton } from '@/components/ui/Skeleton';
import { GlassHeader } from '@/components/ui/GlassHeader';
import { colors, spacing, fontSize, radius } from '@/theme';
import { settingsApi, usersApi } from '@/services/api';
import { useStore } from "@/store";
import { useHaptic } from '@/hooks/useHaptic';
import { useTranslation } from '@/hooks/useTranslation';
import { rtlFlexRow, rtlTextAlign, rtlChevron, rtlMargin } from '@/utils/rtl';
import { ScreenErrorBoundary } from '@/components/ui/ScreenErrorBoundary';

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
  const { isRTL } = useTranslation();
  const handlePress = onPress ? () => {
    haptic.selection();
    onPress();
  } : undefined;

  return (
    <Pressable
      accessibilityRole="button"
      style={[styles.row, { flexDirection: rtlFlexRow(isRTL) }, isLast && styles.rowLast]}
      onPress={handlePress}
      disabled={!handlePress && !onToggle}
    >
      {icon ? (
        <LinearGradient
          colors={destructive ? ['rgba(248,81,73,0.2)', 'rgba(248,81,73,0.1)'] : ['rgba(10,123,79,0.15)', 'rgba(10,123,79,0.05)']}
          style={[styles.rowIconContainer, rtlMargin(isRTL, 0, spacing.sm)]}
        >
          {icon}
        </LinearGradient>
      ) : (
        <View style={[styles.rowIconSpacer, rtlMargin(isRTL, 0, spacing.sm)]} />
      )}
      <View style={[styles.rowText, rtlMargin(isRTL, 0, spacing.md)]}>
        <Text style={[styles.rowLabel, { textAlign: rtlTextAlign(isRTL) }, destructive && styles.destructive]}>{label}</Text>
        {hint ? <Text style={[styles.rowHint, { textAlign: rtlTextAlign(isRTL) }]}>{hint}</Text> : null}
      </View>
      {onToggle !== undefined && value !== undefined ? (
        <PremiumToggle value={value} onValueChange={onToggle} />
      ) : rightText ? (
        <Text style={styles.rowRightText}>{rightText}</Text>
      ) : onPress ? (
        <View style={styles.rowChevron}>
          <Icon name={rtlChevron(isRTL, 'forward')} size="sm" color={colors.text.tertiary} />
        </View>
      ) : null}
    </Pressable>
  );
}

function SectionHeader({ title, icon }: { title: string; icon?: React.ComponentProps<typeof Icon>['name'] }) {
  const { isRTL } = useTranslation();
  return (
    <View style={[styles.sectionHeaderContainer, { flexDirection: rtlFlexRow(isRTL) }]}>
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
        start={isRTL ? { x: 1, y: 0 } : { x: 0, y: 0 }}
        end={isRTL ? { x: 0, y: 0 } : { x: 1, y: 0 }}
        style={styles.sectionHeaderAccent}
      />
      <Text style={[styles.sectionHeader, { textAlign: rtlTextAlign(isRTL) }]}>{title}</Text>
    </View>
  );
}

export default function SettingsScreen() {
  const router = useRouter();
  const { signOut } = useClerk();
  const queryClient = useQueryClient();
  const { theme, setTheme, logout: storeLogout } = useStore();
  const insets = useSafeAreaInsets();
  const { t, isRTL } = useTranslation();

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
      { text: t('settings.signOut'), onPress: () => { storeLogout(); queryClient.clear(); signOut(); } },
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
    <ScreenErrorBoundary>
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
            />
            <View style={styles.divider} />
            <Row
              label={t('downloads.title')}
              icon={<Icon name="layers" size="sm" color={colors.emerald} />}
              onPress={() => navigate('/(screens)/downloads')}
            />
            <View style={styles.divider} />
            <Row
              label={t('nasheed.settingsLabel')}
              icon={<Icon name="mic" size="sm" color={colors.gold} />}
              onPress={() => navigate('/(screens)/nasheed-mode')}
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
            />
            <View style={styles.divider} />
            <Row
              label={t('biometric.settingsLabel')}
              icon={<Icon name="lock" size="sm" color={colors.emerald} />}
              onPress={() => navigate('/(screens)/biometric-lock')}
            />
            <View style={styles.divider} />
            <Row
              label={t('parentalControls.settingsLabel')}
              icon={<Icon name="users" size="sm" color={colors.gold} />}
              hint={t('parentalControls.settingsHint')}
              onPress={() => navigate('/(screens)/parental-controls')}
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
            />
            <View style={styles.divider} />
            <Row
              label={t('settings.notificationTones')}
              icon={<Icon name="bell" size="sm" color={colors.emerald} />}
              onPress={() => navigate('/(screens)/notification-tones')}
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
            />
            <View style={styles.divider} />
            <Row
              label={t('quietMode.settingsLabel')}
              icon={<Icon name="volume-x" size="sm" color={colors.emerald} />}
              hint={t('quietMode.settingsHint')}
              onPress={() => navigate('/(screens)/quiet-mode')}
            />
            <View style={styles.divider} />
            <Row
              label={t('screenTime.settingsLabel')}
              icon={<Icon name="clock" size="sm" color={colors.gold} />}
              hint={t('screenTime.settingsHint')}
              onPress={() => navigate('/(screens)/screen-time')}
            />
            <View style={styles.divider} />
            <Row
              label={t('nasheed.settingsLabel')}
              icon={<Icon name="volume-x" size="sm" color={colors.gold} />}
              onPress={() => navigate('/(screens)/nasheed-mode')}
            />
            <View style={styles.divider} />
            <Row
              label={t('contentFilter.title')}
              icon={<Icon name="filter" size="sm" color={colors.emerald} />}
              onPress={() => navigate('/(screens)/content-filter-settings')}
            />
            <View style={styles.divider} />
            <Row
              label={t('autoPlaySettings.title')}
              icon={<Icon name="play" size="sm" color={colors.emerald} />}
              hint={t('autoPlaySettings.hint')}
              onPress={() => navigate('/(screens)/media-settings')}
              isLast
            />
          </LinearGradient>

          {/* Islamic Section */}
          <SectionHeader title={t('islamic.prayerTimes')} icon="globe" />
          <LinearGradient
            colors={['rgba(45,53,72,0.4)', 'rgba(28,35,51,0.2)']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.card}
          >
            <Row
              label={t('islamic.prayerTimes')}
              icon={<Icon name="clock" size="sm" color={colors.emerald} />}
              onPress={() => navigate('/(screens)/prayer-times')}
            />
            <View style={styles.divider} />
            <Row
              label={t('islamic.qibla')}
              icon={<Icon name="map-pin" size="sm" color={colors.gold} />}
              onPress={() => navigate('/(screens)/qibla-compass')}
            />
            <View style={styles.divider} />
            <Row
              label={t('hijri.title')}
              icon={<Icon name="calendar" size="sm" color={colors.emerald} />}
              onPress={() => navigate('/(screens)/islamic-calendar')}
            />
            <View style={styles.divider} />
            <Row
              label={t('islamic.dhikr')}
              icon={<Icon name="heart" size="sm" color={colors.gold} />}
              onPress={() => navigate('/(screens)/dhikr-counter')}
            />
            <View style={styles.divider} />
            <Row
              label={t('quranPlan.title')}
              icon={<Icon name="bookmark" size="sm" color={colors.emerald} />}
              onPress={() => navigate('/(screens)/quran-reading-plan')}
            />
            <View style={styles.divider} />
            <Row
              label={t('islamic.hadith')}
              icon={<Icon name="bookmark" size="sm" color={colors.gold} />}
              onPress={() => navigate('/(screens)/hadith')}
            />
            <View style={styles.divider} />
            <Row
              label={t('islamic.mosque')}
              icon={<Icon name="map-pin" size="sm" color={colors.emerald} />}
              onPress={() => navigate('/(screens)/mosque-finder')}
            />
            <View style={styles.divider} />
            <Row
              label={t('hajj.title')}
              icon={<Icon name="globe" size="sm" color={colors.gold} />}
              onPress={() => navigate('/(screens)/hajj-companion')}
            />
            <View style={styles.divider} />
            <Row
              label={t('islamic.zakat')}
              icon={<Icon name="heart" size="sm" color={colors.emerald} />}
              onPress={() => navigate('/(screens)/zakat-calculator')}
            />
            <View style={styles.divider} />
            <Row
              label={t('eidCards.title')}
              icon={<Icon name="smile" size="sm" color={colors.gold} />}
              onPress={() => navigate('/(screens)/eid-cards')}
            />
            <View style={styles.divider} />
            <Row
              label={t('scholar.title')}
              icon={<Icon name="check-circle" size="sm" color={colors.emerald} />}
              onPress={() => navigate('/(screens)/scholar-verification')}
            />
            <View style={styles.divider} />
            <Row
              label={t('quranRoom.title')}
              icon={<Icon name="bookmark" size="sm" color={colors.gold} />}
              onPress={() => navigate('/(screens)/quran-room')}
            />
            <View style={styles.divider} />
            <Row
              label={t('charity.title')}
              icon={<Icon name="heart" size="sm" color={colors.emerald} />}
              onPress={() => navigate('/(screens)/charity-campaign')}
            />
            <View style={styles.divider} />
            <Row
              label={t('settings.ramadanMode')}
              icon={<Icon name="globe" size="sm" color={colors.gold} />}
              onPress={() => navigate('/(screens)/ramadan-mode')}
            />
            <View style={styles.divider} />
            <Row
              label={t('islamic.duaCollection')}
              icon={<Icon name="heart" size="sm" color={colors.emerald} />}
              onPress={() => navigate('/(screens)/dua-collection')}
            />
            <View style={styles.divider} />
            <Row
              label={t('islamic.fastingTracker')}
              icon={<Icon name="clock" size="sm" color={colors.gold} />}
              onPress={() => navigate('/(screens)/fasting-tracker')}
            />
            <View style={styles.divider} />
            <Row
              label={t('islamic.halalFinder')}
              icon={<Icon name="map-pin" size="sm" color={colors.emerald} />}
              onPress={() => navigate('/(screens)/halal-finder')}
            />
            <View style={styles.divider} />
            <Row
              label={t('islamic.hifzTracker')}
              icon={<Icon name="layers" size="sm" color={colors.gold} />}
              onPress={() => navigate('/(screens)/hifz-tracker')}
            />
            <View style={styles.divider} />
            <Row
              label={t('islamic.morningBriefing')}
              icon={<Icon name="bell" size="sm" color={colors.emerald} />}
              onPress={() => navigate('/(screens)/morning-briefing')}
            />
            <View style={styles.divider} />
            <Row
              label={t('islamic.namesOfAllah')}
              icon={<Icon name="globe" size="sm" color={colors.gold} />}
              onPress={() => navigate('/(screens)/names-of-allah')}
            />
            <View style={styles.divider} />
            <Row
              label={t('wellbeing.windDown')}
              icon={<Icon name="volume-x" size="sm" color={colors.emerald} />}
              onPress={() => navigate('/(screens)/wind-down')}
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
            />
            <View style={styles.divider} />
            <Row
              label={t('settings.restrictedAccounts')}
              icon={<Icon name="eye-off" size="sm" color={colors.text.tertiary} />}
              onPress={() => navigate('/(screens)/restricted')}
            />
            <View style={styles.divider} />
            <Row
              label={t('settings.collabRequests')}
              icon={<Icon name="users" size="sm" color={colors.gold} />}
              onPress={() => navigate('/(screens)/collab-requests')}
            />
            <View style={styles.divider} />
            <Row
              label={t('settings.appealModeration')}
              icon={<Icon name="flag" size="sm" color={colors.text.secondary} />}
              onPress={() => navigate('/(screens)/appeal-moderation')}
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

          {/* AI Section */}
          <SectionHeader title={t('settings.sections.ai')} icon="loader" />
          <LinearGradient
            colors={['rgba(45,53,72,0.4)', 'rgba(28,35,51,0.2)']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.card}
          >
            <Row
              label={t('ai.title')}
              icon={<Icon name="loader" size="sm" color={colors.emerald} />}
              onPress={() => navigate('/(screens)/ai-assistant')}
            />
            <View style={styles.divider} />
            <Row
              label={t('ai.avatar.title')}
              icon={<Icon name="user" size="sm" color={colors.gold} />}
              onPress={() => navigate('/(screens)/ai-avatar')}
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
            />
            <View style={styles.divider} />
            <Row
              label={t('settings.creatorDashboard')}
              icon={<Icon name="bar-chart-2" size="sm" color={colors.emerald} />}
              onPress={() => navigate('/(screens)/creator-dashboard')}
            />
            <View style={styles.divider} />
            <Row
              label={t('settings.revenue')}
              icon={<Icon name="trending-up" size="sm" color={colors.gold} />}
              onPress={() => navigate('/(screens)/revenue')}
            />
            <View style={styles.divider} />
            <Row
              label={t('settings.creatorStorefront')}
              icon={<Icon name="shopping-bag" size="sm" color={colors.emerald} />}
              onPress={() => navigate('/(screens)/creator-storefront')}
            />
            <View style={styles.divider} />
            <Row
              label={t('settings.enableTips')}
              icon={<Icon name="heart" size="sm" color={colors.gold} />}
              onPress={() => navigate('/(screens)/enable-tips')}
            />
            <View style={styles.divider} />
            <Row
              label={t('settings.membershipTiers')}
              icon={<Icon name="users" size="sm" color={colors.emerald} />}
              onPress={() => navigate('/(screens)/membership-tiers')}
              isLast
            />
          </LinearGradient>

          {/* Community Section */}
          <SectionHeader title={t('settings.sections.community')} icon="users" />
          <LinearGradient
            colors={['rgba(45,53,72,0.4)', 'rgba(28,35,51,0.2)']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.card}
          >
            <Row
              label={t('community.localBoards')}
              icon={<Icon name="map-pin" size="sm" color={colors.emerald} />}
              onPress={() => navigate('/(screens)/local-boards')}
            />
            <View style={styles.divider} />
            <Row
              label={t('community.mentorship')}
              icon={<Icon name="users" size="sm" color={colors.gold} />}
              onPress={() => navigate('/(screens)/mentorship')}
            />
            <View style={styles.divider} />
            <Row
              label={t('community.fatwaQA')}
              icon={<Icon name="help-circle" size="sm" color={colors.emerald} />}
              onPress={() => navigate('/(screens)/fatwa-qa')}
            />
            <View style={styles.divider} />
            <Row
              label={t('community.waqfEndowments')}
              icon={<Icon name="heart" size="sm" color={colors.gold} />}
              onPress={() => navigate('/(screens)/waqf')}
            />
            <View style={styles.divider} />
            <Row
              label={t('community.watchParties')}
              icon={<Icon name="play" size="sm" color={colors.emerald} />}
              onPress={() => navigate('/(screens)/watch-party')}
            />
            <View style={styles.divider} />
            <Row
              label={t('community.voicePost')}
              icon={<Icon name="mic" size="sm" color={colors.gold} />}
              onPress={() => navigate('/(screens)/voice-post-create')}
            />
            <View style={styles.divider} />
            <Row
              label={t('settings.volunteerBoard')}
              icon={<Icon name="heart" size="sm" color={colors.emerald} />}
              onPress={() => navigate('/(screens)/volunteer-board')}
            />
            <View style={styles.divider} />
            <Row
              label={t('settings.events')}
              icon={<Icon name="calendar" size="sm" color={colors.gold} />}
              onPress={() => navigate('/(screens)/create-event')}
            />
            <View style={styles.divider} />
            <Row
              label={t('settings.giftShop')}
              icon={<Icon name="heart" size="sm" color={colors.emerald} />}
              onPress={() => navigate('/(screens)/gift-shop')}
            />
            <View style={styles.divider} />
            <Row
              label={t('settings.followedTopics')}
              icon={<Icon name="hash" size="sm" color={colors.gold} />}
              onPress={() => navigate('/(screens)/followed-topics')}
              isLast
            />
          </LinearGradient>

          {/* Gamification Section */}
          <SectionHeader title={t('gamification.settingsSection')} icon="trending-up" />
          <LinearGradient
            colors={['rgba(45,53,72,0.4)', 'rgba(28,35,51,0.2)']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.card}
          >
            <Row
              label={t('gamification.settingsStreaks')}
              icon={<Icon name="trending-up" size="sm" color={colors.emerald} />}
              onPress={() => navigate('/(screens)/streaks')}
            />
            <View style={styles.divider} />
            <Row
              label={t('gamification.settingsAchievements')}
              icon={<Icon name="check-circle" size="sm" color={colors.gold} />}
              onPress={() => navigate('/(screens)/achievements')}
            />
            <View style={styles.divider} />
            <Row
              label={t('gamification.settingsLeaderboard')}
              icon={<Icon name="bar-chart-2" size="sm" color={colors.emerald} />}
              onPress={() => navigate('/(screens)/leaderboard')}
            />
            <View style={styles.divider} />
            <Row
              label={t('gamification.settingsChallenges')}
              icon={<Icon name="flag" size="sm" color={colors.gold} />}
              onPress={() => navigate('/(screens)/challenges')}
            />
            <View style={styles.divider} />
            <Row
              label={t('gamification.settingsXPHistory')}
              icon={<Icon name="star" size="sm" color={colors.emerald} />}
              onPress={() => navigate('/(screens)/xp-history')}
            />
            <View style={styles.divider} />
            <Row
              label={t('gamification.settingsProfile')}
              icon={<Icon name="user" size="sm" color={colors.gold} />}
              onPress={() => navigate('/(screens)/profile-customization')}
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
              label={t('settings.twoFactor')}
              icon={<Icon name="lock" size="sm" color={colors.gold} />}
              onPress={() => navigate('/(screens)/2fa-setup')}
            />
            <View style={styles.divider} />
            <Row
              label={t('settings.accountSwitcher')}
              icon={<Icon name="users" size="sm" color={colors.emerald} />}
              onPress={() => navigate('/(screens)/account-switcher')}
            />
            <View style={styles.divider} />
            <Row
              label={t('settings.contactSync')}
              icon={<Icon name="phone" size="sm" color={colors.gold} />}
              onPress={() => navigate('/(screens)/contact-sync')}
            />
            <View style={styles.divider} />
            <Row
              label={t('settings.closeFriends')}
              icon={<Icon name="heart" size="sm" color={colors.emerald} />}
              onPress={() => navigate('/(screens)/close-friends')}
            />
            <View style={styles.divider} />
            <Row
              label={t('settings.statusPrivacy')}
              icon={<Icon name="eye-off" size="sm" color={colors.gold} />}
              onPress={() => navigate('/(screens)/status-privacy')}
            />
            <View style={styles.divider} />
            <Row
              label={t('settings.disappearingDefault')}
              icon={<Icon name="clock" size="sm" color={colors.emerald} />}
              onPress={() => navigate('/(screens)/disappearing-default')}
            />
            <View style={styles.divider} />
            <Row
              label={t('settings.storageManagement')}
              icon={<Icon name="settings" size="sm" color={colors.emerald} />}
              onPress={() => navigate('/(screens)/storage-management')}
            />
            <View style={styles.divider} />
            <Row
              label={t('settings.manageData')}
              icon={<Icon name="layers" size="sm" color={colors.gold} />}
              onPress={() => navigate('/(screens)/manage-data')}
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
          <Pressable style={styles.signOutButton} onPress={handleSignOut}>
            <LinearGradient
              colors={['rgba(248,81,73,0.2)', 'rgba(248,81,73,0.1)']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.signOutGradient}
            >
              <Icon name="log-out" size="sm" color={colors.error} />
              <Text style={styles.signOutLabel}>{t('settings.signOut')}</Text>
            </LinearGradient>
          </Pressable>

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
  
    </ScreenErrorBoundary>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.dark.bg },
  body: { flex: 1 },
  bodyContent: { paddingBottom: 60 },

  // Section Header
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

  // Card
  card: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(45,53,72,0.3)',
    overflow: 'hidden',
    marginHorizontal: spacing.base,
    marginBottom: spacing.md,
  },

  // Row
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
  },
  rowIconSpacer: {
    width: 32,
  },
  rowText: { flex: 1, marginRight: spacing.md },
  rowLabel: { color: colors.text.primary, fontSize: fontSize.base },
  rowHint: { color: colors.text.tertiary, fontSize: fontSize.xs, marginTop: 2 },
  rowRightText: { color: colors.text.tertiary, fontSize: fontSize.sm },
  rowChevron: {
    width: 28,
    height: 28,
    borderRadius: radius.sm,
    backgroundColor: 'rgba(45,53,72,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  destructive: { color: '#FF453A' },

  // Divider
  divider: {
    height: 1,
    backgroundColor: 'rgba(45,53,72,0.5)',
    marginLeft: spacing.base + 40,
  },

  // Toggle Switch
  toggleTrack: {
    width: 50,
    height: 28,
    borderRadius: radius.lg,
    padding: 4,
    justifyContent: 'center',
  },
  toggleThumb: {
    width: 20,
    height: 20,
    borderRadius: radius.md,
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
    borderRadius: radius.md,
  },

  // Sign Out
  signOutButton: {
    borderWidth: 1.5, borderColor: colors.error, borderRadius: radius.md,
    padding: spacing.md, flexDirection: 'row', alignItems: 'center',
    justifyContent: 'center', gap: spacing.sm,
    marginHorizontal: spacing.base, marginTop: spacing.xl,
  },
  signOutLabel: {
    color: colors.error, fontSize: fontSize.base, fontWeight: '600',
  },
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

  version: {
    color: colors.text.tertiary, fontSize: fontSize.xs, textAlign: 'center', marginTop: spacing.xl,
  },
});
