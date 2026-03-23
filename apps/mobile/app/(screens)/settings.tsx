import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TextInput,
  ScrollView, Alert, Linking, Pressable,
} from 'react-native';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { navigate } from '@/utils/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useClerk } from '@clerk/clerk-expo';
import Animated, { FadeInUp, useSharedValue, useAnimatedStyle, withSpring, withSequence } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { Icon } from '@/components/ui/Icon';
import { Skeleton } from '@/components/ui/Skeleton';
import { GlassHeader } from '@/components/ui/GlassHeader';
import { showToast } from '@/components/ui/Toast';
import { colors, spacing, fontSize, radius, lineHeight, letterSpacing, fonts } from '@/theme';
import { settingsApi, usersApi } from '@/services/api';
import { useStore } from "@/store";
import { useContextualHaptic } from '@/hooks/useContextualHaptic';
import { useTranslation } from '@/hooks/useTranslation';
import { useThemeColors } from '@/hooks/useThemeColors';
import { rtlFlexRow, rtlTextAlign, rtlChevron, rtlMargin } from '@/utils/rtl';
import { ScreenErrorBoundary } from '@/components/ui/ScreenErrorBoundary';

// Premium Toggle Switch Component
function PremiumToggle({ value, onValueChange }: { value: boolean; onValueChange: (v: boolean) => void }) {
  const tc = useThemeColors();
  const styles = createStyles(tc);
  const haptic = useContextualHaptic();
  const translateX = useSharedValue(value ? 20 : 0);
  const scale = useSharedValue(1);

  useEffect(() => {
    translateX.value = withSpring(value ? 20 : 0, { damping: 15, stiffness: 200 });
  }, [value]);

  const handlePress = () => {
    haptic.tick();
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
        colors={value ? [colors.emerald, colors.extended.greenDark] : [tc.border, tc.surface]}
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
  const tc = useThemeColors();
  const styles = createStyles(tc);
  const haptic = useContextualHaptic();
  const { isRTL } = useTranslation();
  const handlePress = onPress ? () => {
    haptic.navigate();
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
          <Icon name={rtlChevron(isRTL, 'forward')} size="sm" color={tc.text.tertiary} />
        </View>
      ) : null}
    </Pressable>
  );
}

function SectionHeader({ title, icon }: { title: string; icon?: React.ComponentProps<typeof Icon>['name'] }) {
  const tc = useThemeColors();
  const styles = createStyles(tc);
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
  const tc = useThemeColors();
  const styles = createStyles(tc);
  const router = useRouter();
  const { signOut } = useClerk();
  const queryClient = useQueryClient();
  const { theme, setTheme, logout: storeLogout } = useStore();
  const insets = useSafeAreaInsets();
  const { t, isRTL } = useTranslation();

  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const matchesSearch = useCallback((label: string) =>
    !searchQuery || label.toLowerCase().includes(searchQuery.toLowerCase()),
  [searchQuery]);

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
  const [readReceipts, setReadReceipts] = useState(true);

  // Load read receipts from AsyncStorage (same key as status-privacy screen)
  useEffect(() => {
    AsyncStorage.getItem('status-privacy-settings').then((val) => {
      if (val) {
        try {
          const parsed = JSON.parse(val) as { readReceipts?: boolean };
          if (typeof parsed.readReceipts === 'boolean') setReadReceipts(parsed.readReceipts);
        } catch { /* use default */ }
      }
    });
  }, []);

  useEffect(() => {
    if (s) {
      setIsPrivate(s.isPrivate ?? false);
      setNotifyLikes(s.notifyLikes ?? true);
      setNotifyComments(s.notifyComments ?? true);
      setNotifyFollows(s.notifyFollows ?? true);
      setNotifyMentions(s.notifyMentions ?? true);
      setNotifyMessages(s.notifyMessages ?? true);
      setSensitiveContent(s.sensitiveContent ?? false);
      setReducedMotion(s.reducedMotion ?? false);
    }
  }, [s]);

  const privacyMutation = useMutation({ mutationFn: settingsApi.updatePrivacy });
  const notifMutation = useMutation({ mutationFn: settingsApi.updateNotifications });
  const accessibilityMutation = useMutation({ mutationFn: settingsApi.updateAccessibility });
  const wellbeingMutation = useMutation({ mutationFn: settingsApi.updateWellbeing });

  const toggleReadReceipts = useCallback(async (v: boolean) => {
    setReadReceipts(v);
    try {
      const existing = await AsyncStorage.getItem('status-privacy-settings');
      const parsed = existing ? JSON.parse(existing) : {};
      parsed.readReceipts = v;
      await AsyncStorage.setItem('status-privacy-settings', JSON.stringify(parsed));
    } catch {
      showToast({ message: t('statusPrivacy.errorSave'), variant: 'error' });
      setReadReceipts(!v); // rollback on failure
    }
  }, [t]);

  const deactivateMutation = useMutation({
    mutationFn: () => usersApi.deactivate(),
    onSuccess: async () => {
      await signOut();
    },
    onError: (err: Error) => showToast({ message: err.message, variant: 'error' }),
  });

  const deleteAccountMutation = useMutation({
    mutationFn: () => usersApi.deleteAccount(),
    onSuccess: async () => {
      await signOut();
    },
    onError: (err: Error) => showToast({ message: err.message, variant: 'error' }),
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
          {/* Search bar */}
          <View style={[styles.searchContainer, { backgroundColor: tc.bgElevated, borderColor: tc.border }]}>
            <Icon name="search" size="sm" color={tc.text.tertiary} />
            <TextInput
              style={[styles.searchInput, { color: tc.text.primary }]}
              placeholder={t('settings.searchSettings')}
              placeholderTextColor={tc.text.tertiary}
              value={searchQuery}
              onChangeText={setSearchQuery}
              returnKeyType="search"
              accessibilityLabel={t('settings.searchSettings')}
            />
            {searchQuery.length > 0 && (
              <Pressable onPress={() => setSearchQuery('')} hitSlop={8} accessibilityLabel={t('common.close')} accessibilityRole="button">
                <Icon name="x" size="xs" color={tc.text.tertiary} />
              </Pressable>
            )}
          </View>

          {/* Content Section */}
          {(matchesSearch(t('settings.contentPreferences')) || matchesSearch(t('settings.drafts')) || matchesSearch(t('settings.archive')) || matchesSearch(t('settings.watchHistory')) || matchesSearch(t('downloads.title')) || matchesSearch(t('nasheed.settingsLabel'))) && (
          <Animated.View entering={FadeInUp.delay(0).duration(400).springify()}>
            <SectionHeader title={t('settings.sections.content')} icon="layers" />
            <LinearGradient
              colors={colors.gradient.cardDark}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.card}
            >
              {matchesSearch(t('settings.contentPreferences')) && (<>
              <Row
                label={t('settings.contentPreferences')}
                icon={<Icon name="settings" size="sm" color={colors.emerald} />}
                onPress={() => router.push('/(screens)/content-settings')}
              />
              <View style={styles.divider} />
              </>)}
              {matchesSearch(t('settings.drafts')) && (<>
              <Row
                label={t('settings.drafts')}
                icon={<Icon name="clock" size="sm" color={colors.gold} />}
                onPress={() => router.push('/(screens)/drafts')}
              />
              <View style={styles.divider} />
              </>)}
              {matchesSearch(t('settings.archive')) && (<>
              <Row
                label={t('settings.archive')}
                icon={<Icon name="bookmark" size="sm" color={colors.emerald} />}
                onPress={() => router.push('/(screens)/archive')}
              />
              <View style={styles.divider} />
              </>)}
              {matchesSearch(t('settings.watchHistory')) && (<>
              <Row
                label={t('settings.watchHistory')}
                icon={<Icon name="play" size="sm" color={colors.gold} />}
                onPress={() => router.push('/(screens)/watch-history')}
              />
              <View style={styles.divider} />
              </>)}
              {matchesSearch(t('downloads.title')) && (<>
              <Row
                label={t('downloads.title')}
                icon={<Icon name="layers" size="sm" color={colors.emerald} />}
                onPress={() => navigate('/(screens)/downloads')}
              />
              <View style={styles.divider} />
              </>)}
              {matchesSearch(t('nasheed.settingsLabel')) && (
              <Row
                label={t('nasheed.settingsLabel')}
                icon={<Icon name="mic" size="sm" color={colors.gold} />}
                onPress={() => navigate('/(screens)/nasheed-mode')}
                isLast
              />
              )}
            </LinearGradient>
          </Animated.View>
          )}

          {/* Appearance Section */}
          {(matchesSearch(t('settings.appearance')) || matchesSearch(t('settings.saved'))) && (
          <Animated.View entering={FadeInUp.delay(60).duration(400).springify()}>
            <SectionHeader title={t('settings.appearance')} icon="eye" />
            <LinearGradient
              colors={colors.gradient.cardDark}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.card}
            >
              {matchesSearch(t('settings.appearance')) && (<>
              <Row
                label={t('settings.appearance')}
                icon={<Icon name="eye" size="sm" color={colors.emerald} />}
                hint={t('settings.hints.themeDarkMode')}
                onPress={() => router.push('/(screens)/theme-settings')}
              />
              <View style={styles.divider} />
              </>)}
              {matchesSearch(t('settings.saved')) && (
              <Row
                label={t('settings.saved')}
                icon={<Icon name="bookmark-filled" size="sm" color={colors.gold} />}
                hint={t('settings.hints.savedPosts')}
                onPress={() => router.push('/(screens)/saved')}
                isLast
              />
              )}
            </LinearGradient>
          </Animated.View>
          )}

          {/* Profile Section */}
          {matchesSearch(t('profile.shareProfile')) && (
          <Animated.View entering={FadeInUp.delay(120).duration(400).springify()}>
            <SectionHeader title={t('settings.sections.profile')} icon="user" />
            <LinearGradient
              colors={colors.gradient.cardDark}
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
          </Animated.View>
          )}

          {/* Privacy Section */}
          {(matchesSearch(t('settings.privateAccount')) || matchesSearch(t('settings.followRequests')) || matchesSearch(t('settings.blockedKeywords')) || matchesSearch(t('biometric.settingsLabel')) || matchesSearch(t('parentalControls.settingsLabel')) || matchesSearch(t('settings.readReceipts'))) && (
          <Animated.View entering={FadeInUp.delay(180).duration(400).springify()}>
          <SectionHeader title={t('settings.privacy')} icon="lock" />
          <LinearGradient
            colors={colors.gradient.cardDark}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.card}
          >
            {matchesSearch(t('settings.privateAccount')) && (<>
            <Row
              label={t('settings.privateAccount')}
              icon={<Icon name="lock" size="sm" color={colors.emerald} />}
              hint={t('settings.hints.privateAccount')}
              value={isPrivate}
              onToggle={(v) => { setIsPrivate(v); privacyMutation.mutate({ isPrivate: v }); }}
            />
            <View style={styles.divider} />
            </>)}
            {matchesSearch(t('settings.followRequests')) && (<>
            <Row
              label={t('settings.followRequests')}
              icon={<Icon name="users" size="sm" color={colors.gold} />}
              hint={t('settings.hints.followRequests')}
              onPress={() => router.push('/(screens)/follow-requests')}
            />
            <View style={styles.divider} />
            </>)}
            {matchesSearch(t('settings.blockedKeywords')) && (<>
            <Row
              label={t('settings.blockedKeywords')}
              icon={<Icon name="slash" size="sm" color={colors.error} />}
              hint={t('settings.hints.blockedKeywords')}
              onPress={() => router.push('/(screens)/blocked-keywords')}
            />
            <View style={styles.divider} />
            </>)}
            {matchesSearch(t('biometric.settingsLabel')) && (<>
            <Row
              label={t('biometric.settingsLabel')}
              icon={<Icon name="lock" size="sm" color={colors.emerald} />}
              onPress={() => navigate('/(screens)/biometric-lock')}
            />
            <View style={styles.divider} />
            </>)}
            {matchesSearch(t('parentalControls.settingsLabel')) && (<>
            <Row
              label={t('parentalControls.settingsLabel')}
              icon={<Icon name="users" size="sm" color={colors.gold} />}
              hint={t('parentalControls.settingsHint')}
              onPress={() => navigate('/(screens)/parental-controls')}
            />
            <View style={styles.divider} />
            </>)}
            {matchesSearch(t('settings.readReceipts')) && (
            <Row
              label={t('settings.readReceipts')}
              icon={<Icon name="check-check" size="sm" color={colors.emerald} />}
              hint={t('settings.readReceiptsDescription')}
              value={readReceipts}
              onToggle={toggleReadReceipts}
              isLast
            />
            )}
          </LinearGradient>
          </Animated.View>
          )}

          {/* Notifications Section */}
          {(matchesSearch(t('settings.likes')) || matchesSearch(t('settings.comments')) || matchesSearch(t('settings.newFollowers')) || matchesSearch(t('settings.mentions')) || matchesSearch(t('settings.messages')) || matchesSearch(t('settings.notificationTones')) || matchesSearch(t('settings.notifications'))) && (
          <Animated.View entering={FadeInUp.delay(240).duration(400).springify()}>
          <SectionHeader title={t('settings.notifications')} icon="bell" />
          <LinearGradient
            colors={colors.gradient.cardDark}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.card}
          >
            {matchesSearch(t('settings.likes')) && (<>
            <Row
              label={t('settings.likes')}
              icon={<Icon name="heart" size="sm" color={colors.error} />}
              value={notifyLikes}
              onToggle={(v) => { setNotifyLikes(v); notifMutation.mutate({ notifyLikes: v }); }}
            />
            <View style={styles.divider} />
            </>)}
            {matchesSearch(t('settings.comments')) && (<>
            <Row
              label={t('settings.comments')}
              icon={<Icon name="message-circle" size="sm" color={colors.emerald} />}
              value={notifyComments}
              onToggle={(v) => { setNotifyComments(v); notifMutation.mutate({ notifyComments: v }); }}
            />
            <View style={styles.divider} />
            </>)}
            {matchesSearch(t('settings.newFollowers')) && (<>
            <Row
              label={t('settings.newFollowers')}
              icon={<Icon name="user-plus" size="sm" color={colors.gold} />}
              value={notifyFollows}
              onToggle={(v) => { setNotifyFollows(v); notifMutation.mutate({ notifyFollows: v }); }}
            />
            <View style={styles.divider} />
            </>)}
            {matchesSearch(t('settings.mentions')) && (<>
            <Row
              label={t('settings.mentions')}
              icon={<Icon name="at-sign" size="sm" color={colors.emerald} />}
              value={notifyMentions}
              onToggle={(v) => { setNotifyMentions(v); notifMutation.mutate({ notifyMentions: v }); }}
            />
            <View style={styles.divider} />
            </>)}
            {matchesSearch(t('settings.messages')) && (<>
            <Row
              label={t('settings.messages')}
              icon={<Icon name="mail" size="sm" color={colors.gold} />}
              value={notifyMessages}
              onToggle={(v) => { setNotifyMessages(v); notifMutation.mutate({ notifyMessages: v }); }}
            />
            <View style={styles.divider} />
            </>)}
            {matchesSearch(t('settings.notificationTones')) && (
            <Row
              label={t('settings.notificationTones')}
              icon={<Icon name="bell" size="sm" color={colors.emerald} />}
              onPress={() => navigate('/(screens)/notification-tones')}
              isLast
            />
            )}
          </LinearGradient>
          </Animated.View>
          )}

          {/* Wellbeing Section */}
          {(matchesSearch(t('settings.filterSensitiveContent')) || matchesSearch(t('quietMode.settingsLabel')) || matchesSearch(t('screenTime.settingsLabel')) || matchesSearch(t('nasheed.settingsLabel')) || matchesSearch(t('contentFilter.title')) || matchesSearch(t('autoPlaySettings.title'))) && (
          <Animated.View entering={FadeInUp.delay(300).duration(400).springify()}>
          <SectionHeader title={t('settings.sections.wellbeing')} icon="smile" />
          <LinearGradient
            colors={colors.gradient.cardDark}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.card}
          >
            {matchesSearch(t('settings.filterSensitiveContent')) && (<>
            <Row
              label={t('settings.filterSensitiveContent')}
              icon={<Icon name="eye-off" size="sm" color={colors.emerald} />}
              hint={t('settings.hints.filterSensitiveContent')}
              value={sensitiveContent}
              onToggle={(v) => { setSensitiveContent(v); wellbeingMutation.mutate({ sensitiveContent: v }); }}
            />
            <View style={styles.divider} />
            </>)}
            {matchesSearch(t('quietMode.settingsLabel')) && (<>
            <Row
              label={t('quietMode.settingsLabel')}
              icon={<Icon name="volume-x" size="sm" color={colors.emerald} />}
              hint={t('quietMode.settingsHint')}
              onPress={() => navigate('/(screens)/quiet-mode')}
            />
            <View style={styles.divider} />
            </>)}
            {matchesSearch(t('screenTime.settingsLabel')) && (<>
            <Row
              label={t('screenTime.settingsLabel')}
              icon={<Icon name="clock" size="sm" color={colors.gold} />}
              hint={t('screenTime.settingsHint')}
              onPress={() => navigate('/(screens)/screen-time')}
            />
            <View style={styles.divider} />
            </>)}
            {matchesSearch(t('nasheed.settingsLabel')) && (<>
            <Row
              label={t('nasheed.settingsLabel')}
              icon={<Icon name="volume-x" size="sm" color={colors.gold} />}
              onPress={() => navigate('/(screens)/nasheed-mode')}
            />
            <View style={styles.divider} />
            </>)}
            {matchesSearch(t('contentFilter.title')) && (<>
            <Row
              label={t('contentFilter.title')}
              icon={<Icon name="filter" size="sm" color={colors.emerald} />}
              onPress={() => navigate('/(screens)/content-filter-settings')}
            />
            <View style={styles.divider} />
            </>)}
            {matchesSearch(t('autoPlaySettings.title')) && (
            <Row
              label={t('autoPlaySettings.title')}
              icon={<Icon name="play" size="sm" color={colors.emerald} />}
              hint={t('autoPlaySettings.hint')}
              onPress={() => navigate('/(screens)/media-settings')}
              isLast
            />
            )}
          </LinearGradient>
          </Animated.View>
          )}

          {/* Islamic Section */}
          {(matchesSearch(t('islamic.prayerTimes')) || matchesSearch(t('islamic.qibla')) || matchesSearch(t('hijri.title')) || matchesSearch(t('islamic.dhikr')) || matchesSearch(t('quranPlan.title')) || matchesSearch(t('islamic.hadith')) || matchesSearch(t('islamic.mosque')) || matchesSearch(t('hajj.title')) || matchesSearch(t('islamic.zakat')) || matchesSearch(t('eidCards.title')) || matchesSearch(t('scholar.title')) || matchesSearch(t('quranRoom.title')) || matchesSearch(t('charity.title')) || matchesSearch(t('settings.ramadanMode')) || matchesSearch(t('islamic.duaCollection')) || matchesSearch(t('islamic.fastingTracker')) || matchesSearch(t('islamic.halalFinder')) || matchesSearch(t('islamic.hifzTracker')) || matchesSearch(t('islamic.morningBriefing')) || matchesSearch(t('islamic.namesOfAllah')) || matchesSearch(t('wellbeing.windDown'))) && (
          <Animated.View entering={FadeInUp.delay(360).duration(400).springify()}>
          <SectionHeader title={t('islamic.prayerTimes')} icon="globe" />
          <LinearGradient
            colors={colors.gradient.cardDark}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.card}
          >
            {matchesSearch(t('islamic.prayerTimes')) && (<>
            <Row
              label={t('islamic.prayerTimes')}
              icon={<Icon name="clock" size="sm" color={colors.emerald} />}
              onPress={() => navigate('/(screens)/prayer-times')}
            />
            <View style={styles.divider} />
            </>)}
            {matchesSearch(t('islamic.qibla')) && (<>
            <Row
              label={t('islamic.qibla')}
              icon={<Icon name="map-pin" size="sm" color={colors.gold} />}
              onPress={() => navigate('/(screens)/qibla-compass')}
            />
            <View style={styles.divider} />
            </>)}
            {matchesSearch(t('hijri.title')) && (<>
            <Row
              label={t('hijri.title')}
              icon={<Icon name="calendar" size="sm" color={colors.emerald} />}
              onPress={() => navigate('/(screens)/islamic-calendar')}
            />
            <View style={styles.divider} />
            </>)}
            {matchesSearch(t('islamic.dhikr')) && (<>
            <Row
              label={t('islamic.dhikr')}
              icon={<Icon name="heart" size="sm" color={colors.gold} />}
              onPress={() => navigate('/(screens)/dhikr-counter')}
            />
            <View style={styles.divider} />
            </>)}
            {matchesSearch(t('quranPlan.title')) && (<>
            <Row
              label={t('quranPlan.title')}
              icon={<Icon name="bookmark" size="sm" color={colors.emerald} />}
              onPress={() => navigate('/(screens)/quran-reading-plan')}
            />
            <View style={styles.divider} />
            </>)}
            {matchesSearch(t('islamic.hadith')) && (<>
            <Row
              label={t('islamic.hadith')}
              icon={<Icon name="bookmark" size="sm" color={colors.gold} />}
              onPress={() => navigate('/(screens)/hadith')}
            />
            <View style={styles.divider} />
            </>)}
            {matchesSearch(t('islamic.mosque')) && (<>
            <Row
              label={t('islamic.mosque')}
              icon={<Icon name="map-pin" size="sm" color={colors.emerald} />}
              onPress={() => navigate('/(screens)/mosque-finder')}
            />
            <View style={styles.divider} />
            </>)}
            {matchesSearch(t('hajj.title')) && (<>
            <Row
              label={t('hajj.title')}
              icon={<Icon name="globe" size="sm" color={colors.gold} />}
              onPress={() => navigate('/(screens)/hajj-companion')}
            />
            <View style={styles.divider} />
            </>)}
            {matchesSearch(t('islamic.zakat')) && (<>
            <Row
              label={t('islamic.zakat')}
              icon={<Icon name="heart" size="sm" color={colors.emerald} />}
              onPress={() => navigate('/(screens)/zakat-calculator')}
            />
            <View style={styles.divider} />
            </>)}
            {matchesSearch(t('eidCards.title')) && (<>
            <Row
              label={t('eidCards.title')}
              icon={<Icon name="smile" size="sm" color={colors.gold} />}
              onPress={() => navigate('/(screens)/eid-cards')}
            />
            <View style={styles.divider} />
            </>)}
            {matchesSearch(t('scholar.title')) && (<>
            <Row
              label={t('scholar.title')}
              icon={<Icon name="check-circle" size="sm" color={colors.emerald} />}
              onPress={() => navigate('/(screens)/scholar-verification')}
            />
            <View style={styles.divider} />
            </>)}
            {matchesSearch(t('quranRoom.title')) && (<>
            <Row
              label={t('quranRoom.title')}
              icon={<Icon name="bookmark" size="sm" color={colors.gold} />}
              onPress={() => navigate('/(screens)/quran-room')}
            />
            <View style={styles.divider} />
            </>)}
            {matchesSearch(t('charity.title')) && (<>
            <Row
              label={t('charity.title')}
              icon={<Icon name="heart" size="sm" color={colors.emerald} />}
              onPress={() => navigate('/(screens)/charity-campaign')}
            />
            <View style={styles.divider} />
            </>)}
            {matchesSearch(t('settings.ramadanMode')) && (<>
            <Row
              label={t('settings.ramadanMode')}
              icon={<Icon name="globe" size="sm" color={colors.gold} />}
              onPress={() => navigate('/(screens)/ramadan-mode')}
            />
            <View style={styles.divider} />
            </>)}
            {matchesSearch(t('islamic.duaCollection')) && (<>
            <Row
              label={t('islamic.duaCollection')}
              icon={<Icon name="heart" size="sm" color={colors.emerald} />}
              onPress={() => navigate('/(screens)/dua-collection')}
            />
            <View style={styles.divider} />
            </>)}
            {matchesSearch(t('islamic.fastingTracker')) && (<>
            <Row
              label={t('islamic.fastingTracker')}
              icon={<Icon name="clock" size="sm" color={colors.gold} />}
              onPress={() => navigate('/(screens)/fasting-tracker')}
            />
            <View style={styles.divider} />
            </>)}
            {matchesSearch(t('islamic.halalFinder')) && (<>
            <Row
              label={t('islamic.halalFinder')}
              icon={<Icon name="map-pin" size="sm" color={colors.emerald} />}
              onPress={() => navigate('/(screens)/halal-finder')}
            />
            <View style={styles.divider} />
            </>)}
            {matchesSearch(t('islamic.hifzTracker')) && (<>
            <Row
              label={t('islamic.hifzTracker')}
              icon={<Icon name="layers" size="sm" color={colors.gold} />}
              onPress={() => navigate('/(screens)/hifz-tracker')}
            />
            <View style={styles.divider} />
            </>)}
            {matchesSearch(t('islamic.morningBriefing')) && (<>
            <Row
              label={t('islamic.morningBriefing')}
              icon={<Icon name="bell" size="sm" color={colors.emerald} />}
              onPress={() => navigate('/(screens)/morning-briefing')}
            />
            <View style={styles.divider} />
            </>)}
            {matchesSearch(t('islamic.namesOfAllah')) && (<>
            <Row
              label={t('islamic.namesOfAllah')}
              icon={<Icon name="globe" size="sm" color={colors.gold} />}
              onPress={() => navigate('/(screens)/names-of-allah')}
            />
            <View style={styles.divider} />
            </>)}
            {matchesSearch(t('wellbeing.windDown')) && (
            <Row
              label={t('wellbeing.windDown')}
              icon={<Icon name="volume-x" size="sm" color={colors.emerald} />}
              onPress={() => navigate('/(screens)/wind-down')}
              isLast
            />
            )}
          </LinearGradient>
          </Animated.View>
          )}

          {/* Accessibility Section */}
          {matchesSearch(t('settings.reduceMotion')) && (
          <Animated.View entering={FadeInUp.delay(420).duration(400).springify()}>
          <SectionHeader title={t('settings.accessibility')} icon="volume-x" />
          <LinearGradient
            colors={colors.gradient.cardDark}
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
          </Animated.View>
          )}

          {/* Blocked & Muted Section */}
          {(matchesSearch(t('settings.blockedAccounts')) || matchesSearch(t('settings.mutedAccounts')) || matchesSearch(t('settings.restrictedAccounts')) || matchesSearch(t('settings.collabRequests')) || matchesSearch(t('settings.appealModeration'))) && (
          <Animated.View entering={FadeInUp.delay(480).duration(400).springify()}>
          <SectionHeader title={t('settings.sections.blockedMuted')} icon="slash" />
          <LinearGradient
            colors={colors.gradient.cardDark}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.card}
          >
            {matchesSearch(t('settings.blockedAccounts')) && (<>
            <Row
              label={t('settings.blockedAccounts')}
              icon={<Icon name="x" size="sm" color={colors.error} />}
              onPress={() => router.push('/(screens)/blocked')}
            />
            <View style={styles.divider} />
            </>)}
            {matchesSearch(t('settings.mutedAccounts')) && (<>
            <Row
              label={t('settings.mutedAccounts')}
              icon={<Icon name="volume-x" size="sm" color={tc.text.tertiary} />}
              onPress={() => router.push('/(screens)/muted')}
            />
            <View style={styles.divider} />
            </>)}
            {matchesSearch(t('settings.restrictedAccounts')) && (<>
            <Row
              label={t('settings.restrictedAccounts')}
              icon={<Icon name="eye-off" size="sm" color={tc.text.tertiary} />}
              onPress={() => navigate('/(screens)/restricted')}
            />
            <View style={styles.divider} />
            </>)}
            {matchesSearch(t('settings.collabRequests')) && (<>
            <Row
              label={t('settings.collabRequests')}
              icon={<Icon name="users" size="sm" color={colors.gold} />}
              onPress={() => navigate('/(screens)/collab-requests')}
            />
            <View style={styles.divider} />
            </>)}
            {matchesSearch(t('settings.appealModeration')) && (
            <Row
              label={t('settings.appealModeration')}
              icon={<Icon name="flag" size="sm" color={tc.text.secondary} />}
              onPress={() => navigate('/(screens)/appeal-moderation')}
              isLast
            />
            )}
          </LinearGradient>
          </Animated.View>
          )}

          {/* Circles Section */}
          {matchesSearch(t('settings.circles')) && (
          <Animated.View entering={FadeInUp.delay(540).duration(400).springify()}>
          <SectionHeader title={t('settings.sections.closeFriends')} icon="users" />
          <LinearGradient
            colors={colors.gradient.cardDark}
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
          </Animated.View>
          )}

          {/* AI Section */}
          {(matchesSearch(t('ai.title')) || matchesSearch(t('ai.avatar.title'))) && (
          <Animated.View entering={FadeInUp.delay(600).duration(400).springify()}>
          <SectionHeader title={t('settings.sections.ai')} icon="loader" />
          <LinearGradient
            colors={colors.gradient.cardDark}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.card}
          >
            {matchesSearch(t('ai.title')) && (<>
            <Row
              label={t('ai.title')}
              icon={<Icon name="loader" size="sm" color={colors.emerald} />}
              onPress={() => navigate('/(screens)/ai-assistant')}
            />
            <View style={styles.divider} />
            </>)}
            {matchesSearch(t('ai.avatar.title')) && (
            <Row
              label={t('ai.avatar.title')}
              icon={<Icon name="user" size="sm" color={colors.gold} />}
              onPress={() => navigate('/(screens)/ai-avatar')}
            />
            )}
          </LinearGradient>
          </Animated.View>
          )}

          {/* Creator Section */}
          {(matchesSearch(t('settings.analytics')) || matchesSearch(t('settings.broadcastChannels')) || matchesSearch(t('settings.myReports')) || matchesSearch(t('settings.creatorDashboard')) || matchesSearch(t('settings.revenue')) || matchesSearch(t('settings.creatorStorefront')) || matchesSearch(t('settings.enableTips')) || matchesSearch(t('settings.membershipTiers'))) && (
          <Animated.View entering={FadeInUp.delay(660).duration(400).springify()}>
          <SectionHeader title={t('settings.sections.creator')} icon="bar-chart-2" />
          <LinearGradient
            colors={colors.gradient.cardDark}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.card}
          >
            {matchesSearch(t('settings.analytics')) && (<>
            <Row
              label={t('settings.analytics')}
              icon={<Icon name="bar-chart-2" size="sm" color={colors.gold} />}
              onPress={() => router.push('/(screens)/analytics')}
            />
            <View style={styles.divider} />
            </>)}
            {matchesSearch(t('settings.broadcastChannels')) && (<>
            <Row
              label={t('settings.broadcastChannels')}
              icon={<Icon name="radio" size="sm" color={colors.emerald} />}
              onPress={() => router.push('/(screens)/broadcast-channels')}
            />
            <View style={styles.divider} />
            </>)}
            {matchesSearch(t('settings.myReports')) && (<>
            <Row
              label={t('settings.myReports')}
              icon={<Icon name="flag" size="sm" color={colors.error} />}
              onPress={() => router.push('/(screens)/my-reports')}
            />
            <View style={styles.divider} />
            </>)}
            {matchesSearch(t('settings.creatorDashboard')) && (<>
            <Row
              label={t('settings.creatorDashboard')}
              icon={<Icon name="bar-chart-2" size="sm" color={colors.emerald} />}
              onPress={() => navigate('/(screens)/creator-dashboard')}
            />
            <View style={styles.divider} />
            </>)}
            {matchesSearch(t('settings.revenue')) && (<>
            <Row
              label={t('settings.revenue')}
              icon={<Icon name="trending-up" size="sm" color={colors.gold} />}
              onPress={() => navigate('/(screens)/revenue')}
            />
            <View style={styles.divider} />
            </>)}
            {matchesSearch(t('settings.creatorStorefront')) && (<>
            <Row
              label={t('settings.creatorStorefront')}
              icon={<Icon name="briefcase" size="sm" color={colors.emerald} />}
              onPress={() => navigate('/(screens)/creator-storefront')}
            />
            <View style={styles.divider} />
            </>)}
            {matchesSearch(t('settings.enableTips')) && (<>
            <Row
              label={t('settings.enableTips')}
              icon={<Icon name="heart" size="sm" color={colors.gold} />}
              onPress={() => navigate('/(screens)/enable-tips')}
            />
            <View style={styles.divider} />
            </>)}
            {matchesSearch(t('settings.membershipTiers')) && (
            <Row
              label={t('settings.membershipTiers')}
              icon={<Icon name="users" size="sm" color={colors.emerald} />}
              onPress={() => navigate('/(screens)/membership-tiers')}
              isLast
            />
            )}
          </LinearGradient>
          </Animated.View>
          )}

          {/* Community Section */}
          {(matchesSearch(t('community.localBoards')) || matchesSearch(t('community.mentorship')) || matchesSearch(t('community.fatwaQA')) || matchesSearch(t('community.waqfEndowments')) || matchesSearch(t('community.watchParties')) || matchesSearch(t('community.voicePost')) || matchesSearch(t('settings.volunteerBoard')) || matchesSearch(t('settings.events')) || matchesSearch(t('settings.giftShop')) || matchesSearch(t('settings.followedTopics'))) && (
          <Animated.View entering={FadeInUp.delay(720).duration(400).springify()}>
          <SectionHeader title={t('settings.sections.community')} icon="users" />
          <LinearGradient
            colors={colors.gradient.cardDark}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.card}
          >
            {matchesSearch(t('community.localBoards')) && (<>
            <Row
              label={t('community.localBoards')}
              icon={<Icon name="map-pin" size="sm" color={colors.emerald} />}
              onPress={() => navigate('/(screens)/local-boards')}
            />
            <View style={styles.divider} />
            </>)}
            {matchesSearch(t('community.mentorship')) && (<>
            <Row
              label={t('community.mentorship')}
              icon={<Icon name="users" size="sm" color={colors.gold} />}
              onPress={() => navigate('/(screens)/mentorship')}
            />
            <View style={styles.divider} />
            </>)}
            {matchesSearch(t('community.fatwaQA')) && (<>
            <Row
              label={t('community.fatwaQA')}
              icon={<Icon name="alert-circle" size="sm" color={colors.emerald} />}
              onPress={() => navigate('/(screens)/fatwa-qa')}
            />
            <View style={styles.divider} />
            </>)}
            {matchesSearch(t('community.waqfEndowments')) && (<>
            <Row
              label={t('community.waqfEndowments')}
              icon={<Icon name="heart" size="sm" color={colors.gold} />}
              onPress={() => navigate('/(screens)/waqf')}
            />
            <View style={styles.divider} />
            </>)}
            {matchesSearch(t('community.watchParties')) && (<>
            <Row
              label={t('community.watchParties')}
              icon={<Icon name="play" size="sm" color={colors.emerald} />}
              onPress={() => navigate('/(screens)/watch-party')}
            />
            <View style={styles.divider} />
            </>)}
            {matchesSearch(t('community.voicePost')) && (<>
            <Row
              label={t('community.voicePost')}
              icon={<Icon name="mic" size="sm" color={colors.gold} />}
              onPress={() => navigate('/(screens)/voice-post-create')}
            />
            <View style={styles.divider} />
            </>)}
            {matchesSearch(t('settings.volunteerBoard')) && (<>
            <Row
              label={t('settings.volunteerBoard')}
              icon={<Icon name="heart" size="sm" color={colors.emerald} />}
              onPress={() => navigate('/(screens)/volunteer-board')}
            />
            <View style={styles.divider} />
            </>)}
            {matchesSearch(t('settings.events')) && (<>
            <Row
              label={t('settings.events')}
              icon={<Icon name="calendar" size="sm" color={colors.gold} />}
              onPress={() => navigate('/(screens)/create-event')}
            />
            <View style={styles.divider} />
            </>)}
            {matchesSearch(t('settings.giftShop')) && (<>
            <Row
              label={t('settings.giftShop')}
              icon={<Icon name="heart" size="sm" color={colors.emerald} />}
              onPress={() => navigate('/(screens)/gift-shop')}
            />
            <View style={styles.divider} />
            </>)}
            {matchesSearch(t('settings.followedTopics')) && (
            <Row
              label={t('settings.followedTopics')}
              icon={<Icon name="hash" size="sm" color={colors.gold} />}
              onPress={() => navigate('/(screens)/followed-topics')}
              isLast
            />
            )}
          </LinearGradient>
          </Animated.View>
          )}

          {/* Gamification Section */}
          {(matchesSearch(t('gamification.settingsStreaks')) || matchesSearch(t('gamification.settingsAchievements')) || matchesSearch(t('gamification.settingsLeaderboard')) || matchesSearch(t('gamification.settingsChallenges')) || matchesSearch(t('gamification.settingsXPHistory')) || matchesSearch(t('gamification.settingsProfile'))) && (
          <Animated.View entering={FadeInUp.delay(780).duration(400).springify()}>
          <SectionHeader title={t('gamification.settingsSection')} icon="trending-up" />
          <LinearGradient
            colors={colors.gradient.cardDark}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.card}
          >
            {matchesSearch(t('gamification.settingsStreaks')) && (<>
            <Row
              label={t('gamification.settingsStreaks')}
              icon={<Icon name="trending-up" size="sm" color={colors.emerald} />}
              onPress={() => navigate('/(screens)/streaks')}
            />
            <View style={styles.divider} />
            </>)}
            {matchesSearch(t('gamification.settingsAchievements')) && (<>
            <Row
              label={t('gamification.settingsAchievements')}
              icon={<Icon name="check-circle" size="sm" color={colors.gold} />}
              onPress={() => navigate('/(screens)/achievements')}
            />
            <View style={styles.divider} />
            </>)}
            {matchesSearch(t('gamification.settingsLeaderboard')) && (<>
            <Row
              label={t('gamification.settingsLeaderboard')}
              icon={<Icon name="bar-chart-2" size="sm" color={colors.emerald} />}
              onPress={() => navigate('/(screens)/leaderboard')}
            />
            <View style={styles.divider} />
            </>)}
            {matchesSearch(t('gamification.settingsChallenges')) && (<>
            <Row
              label={t('gamification.settingsChallenges')}
              icon={<Icon name="flag" size="sm" color={colors.gold} />}
              onPress={() => navigate('/(screens)/challenges')}
            />
            <View style={styles.divider} />
            </>)}
            {matchesSearch(t('gamification.settingsXPHistory')) && (<>
            <Row
              label={t('gamification.settingsXPHistory')}
              icon={<Icon name="star" size="sm" color={colors.emerald} />}
              onPress={() => navigate('/(screens)/xp-history')}
            />
            <View style={styles.divider} />
            </>)}
            {matchesSearch(t('gamification.settingsProfile')) && (
            <Row
              label={t('gamification.settingsProfile')}
              icon={<Icon name="user" size="sm" color={colors.gold} />}
              onPress={() => navigate('/(screens)/profile-customization')}
              isLast
            />
            )}
          </LinearGradient>
          </Animated.View>
          )}

          {/* Account Section */}
          {(matchesSearch(t('settings.account')) || matchesSearch(t('settings.twoFactor')) || matchesSearch(t('settings.accountSwitcher')) || matchesSearch(t('settings.contactSync')) || matchesSearch(t('settings.closeFriends')) || matchesSearch(t('settings.statusPrivacy')) || matchesSearch(t('settings.disappearingDefault')) || matchesSearch(t('settings.storageManagement')) || matchesSearch(t('settings.manageData')) || matchesSearch(t('settings.deactivateAccount')) || matchesSearch(t('settings.deleteAccount'))) && (
          <Animated.View entering={FadeInUp.delay(840).duration(400).springify()}>
          <SectionHeader title={t('settings.account')} icon="user" />
          <LinearGradient
            colors={colors.gradient.cardDark}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.card}
          >
            {matchesSearch(t('settings.account')) && (<>
            <Row
              label={t('settings.account')}
              icon={<Icon name="user" size="sm" color={colors.emerald} />}
              hint={t('settings.hints.account')}
              onPress={() => router.push('/(screens)/account-settings')}
            />
            <View style={styles.divider} />
            </>)}
            {matchesSearch(t('settings.twoFactor')) && (<>
            <Row
              label={t('settings.twoFactor')}
              icon={<Icon name="lock" size="sm" color={colors.gold} />}
              onPress={() => navigate('/(screens)/2fa-setup')}
            />
            <View style={styles.divider} />
            </>)}
            {matchesSearch(t('settings.accountSwitcher')) && (<>
            <Row
              label={t('settings.accountSwitcher')}
              icon={<Icon name="users" size="sm" color={colors.emerald} />}
              onPress={() => navigate('/(screens)/account-switcher')}
            />
            <View style={styles.divider} />
            </>)}
            {matchesSearch(t('settings.contactSync')) && (<>
            <Row
              label={t('settings.contactSync')}
              icon={<Icon name="phone" size="sm" color={colors.gold} />}
              onPress={() => navigate('/(screens)/contact-sync')}
            />
            <View style={styles.divider} />
            </>)}
            {matchesSearch(t('settings.closeFriends')) && (<>
            <Row
              label={t('settings.closeFriends')}
              icon={<Icon name="heart" size="sm" color={colors.emerald} />}
              onPress={() => navigate('/(screens)/close-friends')}
            />
            <View style={styles.divider} />
            </>)}
            {matchesSearch(t('settings.statusPrivacy')) && (<>
            <Row
              label={t('settings.statusPrivacy')}
              icon={<Icon name="eye-off" size="sm" color={colors.gold} />}
              onPress={() => navigate('/(screens)/status-privacy')}
            />
            <View style={styles.divider} />
            </>)}
            {matchesSearch(t('settings.disappearingDefault')) && (<>
            <Row
              label={t('settings.disappearingDefault')}
              icon={<Icon name="clock" size="sm" color={colors.emerald} />}
              onPress={() => navigate('/(screens)/disappearing-default')}
            />
            <View style={styles.divider} />
            </>)}
            {matchesSearch(t('settings.storageManagement')) && (<>
            <Row
              label={t('settings.storageManagement')}
              icon={<Icon name="settings" size="sm" color={colors.emerald} />}
              onPress={() => navigate('/(screens)/storage-management')}
            />
            <View style={styles.divider} />
            </>)}
            {matchesSearch(t('settings.manageData')) && (<>
            <Row
              label={t('settings.manageData')}
              icon={<Icon name="layers" size="sm" color={colors.gold} />}
              onPress={() => navigate('/(screens)/manage-data')}
            />
            <View style={styles.divider} />
            </>)}
            {matchesSearch(t('settings.deactivateAccount')) && (<>
            <Row
              label={t('settings.deactivateAccount')}
              icon={<Icon name="x" size="sm" color={colors.error} />}
              destructive
              onPress={handleDeactivate}
            />
            <View style={styles.divider} />
            </>)}
            {matchesSearch(t('settings.deleteAccount')) && (
            <Row
              label={t('settings.deleteAccount')}
              icon={<Icon name="trash" size="sm" color={colors.error} />}
              destructive
              onPress={handleDeleteAccount}
              isLast
            />
            )}
          </LinearGradient>
          </Animated.View>
          )}

          {/* Premium Sign Out Button + About — always visible */}
          <Animated.View entering={FadeInUp.delay(900).duration(400).springify()}>
          {matchesSearch(t('settings.signOut')) && (
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
          )}

          {/* About Section */}
          {(matchesSearch(t('settings.version')) || matchesSearch(t('settings.termsOfService')) || matchesSearch(t('settings.privacyPolicy')) || matchesSearch(t('settings.licenses')) || matchesSearch(t('settings.about'))) && (<>
          <SectionHeader title={t('settings.about')} icon="info" />
          <LinearGradient
            colors={colors.gradient.cardDark}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.card}
          >
            {matchesSearch(t('settings.version')) && (<>
            <Row label={t('settings.version')} rightText="1.0.0" />
            <View style={styles.divider} />
            </>)}
            {matchesSearch(t('settings.termsOfService')) && (<>
            <Row
              label={t('settings.termsOfService')}
              icon={<Icon name="file-text" size="sm" color={tc.text.secondary} />}
              onPress={() => Linking.openURL('https://mizanly.app/terms')}
            />
            <View style={styles.divider} />
            </>)}
            {matchesSearch(t('settings.privacyPolicy')) && (<>
            <Row
              label={t('settings.privacyPolicy')}
              icon={<Icon name="shield" size="sm" color={tc.text.secondary} />}
              onPress={() => Linking.openURL('https://mizanly.app/privacy')}
            />
            <View style={styles.divider} />
            </>)}
            {matchesSearch(t('settings.licenses')) && (
            <Row
              label={t('settings.licenses')}
              icon={<Icon name="layers" size="sm" color={tc.text.secondary} />}
              onPress={() => Linking.openURL('https://mizanly.app/licenses')}
              isLast
            />
            )}
          </LinearGradient>
          </>)}

          <Text style={styles.version}>{t('settings.versionLabel')}</Text>
          </Animated.View>
        </ScrollView>
      </View>
  
    </ScreenErrorBoundary>
  );
}

const createStyles = (tc: ReturnType<typeof useThemeColors>) => StyleSheet.create({
  container: { flex: 1, backgroundColor: tc.bg },
  body: { flex: 1 },
  bodyContent: { paddingBottom: 60 },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: spacing.base,
    marginBottom: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    gap: spacing.sm,
  },
  searchInput: {
    flex: 1,
    fontSize: fontSize.base,
    fontFamily: fonts.body,
    padding: 0,
  },

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
  rowLabel: { color: colors.text.primary, fontSize: fontSize.base, lineHeight: lineHeight.base },
  rowHint: { color: colors.text.tertiary, fontSize: fontSize.xs, lineHeight: lineHeight.xs, marginTop: 2 },
  rowRightText: { color: colors.text.tertiary, fontSize: fontSize.sm, lineHeight: lineHeight.sm },
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
    color: colors.error, fontSize: fontSize.base, lineHeight: lineHeight.base, fontWeight: '600',
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
    color: colors.text.tertiary, fontSize: fontSize.xs, lineHeight: lineHeight.xs, textAlign: 'center', marginTop: spacing.xl,
  },
});
