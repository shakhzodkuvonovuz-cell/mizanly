import { useState, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Switch, Alert } from 'react-native';
import { BrandedRefreshControl } from '@/components/ui/BrandedRefreshControl';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useClerk, useAuth, useUser } from '@clerk/clerk-expo';
import { Icon } from '@/components/ui/Icon';
import { GlassHeader } from '@/components/ui/GlassHeader';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { VerifiedBadge } from '@/components/ui/VerifiedBadge';
import { Avatar } from '@/components/ui/Avatar';
import { colors, spacing, radius, fontSize, fonts, fontSizeExt } from '@/theme';
import { useContextualHaptic } from '@/hooks/useContextualHaptic';
import { useTranslation } from '@/hooks/useTranslation';
import { useThemeColors } from '@/hooks/useThemeColors';
import { usersApi } from '@/services/api';
import type { User } from '@/types';
import { ScreenErrorBoundary } from '@/components/ui/ScreenErrorBoundary';
import { showToast } from '@/components/ui/Toast';

interface Account {
  id: string;
  sessionId: string;
  displayName: string;
  username: string;
  avatarUrl: string | null;
  accountType: 'Personal' | 'Creator';
  followers: string;
  following: string;
  posts: string;
  isActive: boolean;
  unreadCount: number;
  lastActive: string;
  isVerified: boolean;
}

import { formatCompactNumber } from '@/utils/localeFormat';

function formatCount(n: number | undefined): string {
  if (!n) return '0';
  return formatCompactNumber(n);
}

function mapUserToAccount(user: User, sessionId: string, isActive: boolean): Account {
  return {
    id: user.id,
    sessionId,
    displayName: user.displayName || user.username,
    username: user.username,
    avatarUrl: user.avatarUrl || null,
    accountType: user.isCreator ? 'Creator' : 'Personal',
    followers: formatCount(user.followersCount),
    following: formatCount(user.followingCount),
    posts: formatCount(user.postsCount),
    isActive,
    unreadCount: 0,
    lastActive: isActive ? 'active_now' : 'tap_to_switch',
    isVerified: user.isVerified ?? false,
  };
}

export default function AccountSwitcherScreen() {
  const router = useRouter();
  const tc = useThemeColors();
  const { t } = useTranslation();
  const haptic = useContextualHaptic();
  const [autoSwitchOnNotification, setAutoSwitchOnNotification] = useState(false);
  const [switching, setSwitching] = useState(false);
  const queryClient = useQueryClient();
  const { setActive, signOut, client } = useClerk();
  const { sessionId: activeSessionId } = useAuth();
  const { user: clerkUser } = useUser();

  // Fetch current user profile from our API
  const { data: currentUser, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => usersApi.getMe(),
  });

  // Build account list from Clerk sessions
  const clerkSessions = client?.sessions ?? [];
  const accounts: Account[] = useMemo(() => {
    if (!currentUser) return [];
    // Active session shows our API user data; other sessions show Clerk data
    return clerkSessions.map((session) => {
      const isActive = session.id === activeSessionId;
      if (isActive) {
        return mapUserToAccount(currentUser, session.id, true);
      }
      // For inactive sessions, use Clerk session user data.
      // Known limitation: Clerk sessions expose basic user info (name, avatar, username)
      // for all sessions. Scoping this further would require Clerk's session management
      // API which is outside our current scope.
      const su = session.user;
      return {
        id: su?.id ?? session.id,
        sessionId: session.id,
        displayName: su?.fullName ?? su?.username ?? t('screens.accountSwitcher.account', { defaultValue: 'Account' }),
        username: su?.username ?? '',
        avatarUrl: su?.imageUrl ?? null,
        accountType: 'Personal' as const,
        followers: '-',
        following: '-',
        posts: '-',
        isActive: false,
        unreadCount: 0,
        lastActive: 'tap_to_switch',
        isVerified: false,
      };
    });
  }, [clerkSessions, activeSessionId, currentUser]);

  const onRefresh = useCallback(() => {
    refetch();
  }, [refetch]);

  const activeAccount = accounts.find(a => a.isActive);
  const otherAccounts = accounts.filter(a => !a.isActive);

  const handleSwitchAccount = useCallback(async (account: Account) => {
    if (switching) return;
    haptic.navigate();
    setSwitching(true);
    try {
      await setActive({ session: account.sessionId });
      // Clear all cached data since we switched user context
      queryClient.clear();
      router.replace('/(tabs)/saf');
    } catch {
      showToast({ message: t('screens.accountSwitcher.switchErrorMessage') || 'Could not switch accounts. Please try again.', variant: 'error' });
    } finally {
      setSwitching(false);
    }
  }, [switching, setActive, queryClient, router, t]);

  const handleAddAccount = useCallback(() => {
    haptic.navigate();
    router.push('/(auth)/sign-in');
  }, [router, haptic]);

  const handleSignOutAll = useCallback(() => {
    Alert.alert(
      t('screens.accountSwitcher.signOutAllTitle') || 'Sign Out All',
      t('screens.accountSwitcher.signOutAllMessage') || 'Are you sure you want to sign out of all accounts?',
      [
        { text: t('common.cancel') || 'Cancel', style: 'cancel' },
        {
          text: t('screens.accountSwitcher.signOutAll') || 'Sign Out All',
          style: 'destructive',
          onPress: async () => {
            try {
              await signOut();
              queryClient.clear();
            } catch {
              // Sign out failure is non-critical — Clerk will clear session
            }
          },
        },
      ],
    );
  }, [signOut, queryClient, t]);

  return (
    <ScreenErrorBoundary>
      <SafeAreaView style={[styles.container, { backgroundColor: tc.bg }]} edges={['top']}>
        <GlassHeader title={t('screens.accountSwitcher.title')} showBackButton />

        <ScrollView
          showsVerticalScrollIndicator={false}
          refreshControl={<BrandedRefreshControl refreshing={isRefetching} onRefresh={onRefresh} />}
        >
          {/* Loading State */}
          {isLoading && (
            <View style={{ padding: spacing.base, gap: spacing.md }}>
              <Skeleton.Rect width="100%" height={140} borderRadius={radius.lg} />
              <Skeleton.Rect width="100%" height={80} borderRadius={radius.lg} />
              <Skeleton.Rect width="100%" height={80} borderRadius={radius.lg} />
            </View>
          )}

          {/* Current Account Hero Card */}
          {!isLoading && activeAccount && (
            <Animated.View entering={FadeInUp.delay(50).duration(400)}>
              <View style={styles.heroCard}>
                <LinearGradient
                  colors={['rgba(200,150,62,0.15)', 'rgba(200,150,62,0.05)']}
                  style={styles.heroGradient}
                >
                  {/* Gold Border Accent */}
                  <View style={styles.heroBorder} />

                  <View style={styles.heroContent}>
                    {/* Avatar with Online Ring */}
                    <View style={styles.heroAvatarContainer}>
                      <Avatar
                        uri={activeAccount.avatarUrl}
                        name={activeAccount.displayName}
                        size="xl"
                        showOnline
                      />
                    </View>

                    {/* Account Info */}
                    <View style={styles.heroInfo}>
                      <View style={styles.heroNameRow}>
                        <Text style={[styles.heroName, { color: tc.text.primary }]}>{activeAccount.displayName}</Text>
                        {activeAccount.isVerified && <VerifiedBadge size={15} />}
                      </View>
                      <Text style={[styles.heroUsername, { color: tc.text.secondary }]}>@{activeAccount.username}</Text>

                      {/* Stats */}
                      <Text style={[styles.heroStats, { color: tc.text.tertiary }]}>
                        {`${activeAccount.followers} ${t('screens.accountSwitcher.followers')} · ${activeAccount.following} ${t('screens.accountSwitcher.following')} · ${activeAccount.posts} ${t('screens.accountSwitcher.posts')}`}
                      </Text>
                    </View>

                    {/* Active Badge */}
                    <View style={styles.activeBadge}>
                      <LinearGradient
                        colors={['rgba(10,123,79,0.8)', 'rgba(10,123,79,0.6)']}
                        style={styles.activeBadgeGradient}
                      >
                        <Icon name="check-circle" size="xs" color="#FFF" />
                        <Text style={styles.activeBadgeText}>{t('screens.accountSwitcher.activeBadge')}</Text>
                      </LinearGradient>
                    </View>
                  </View>

                  {/* Account Type */}
                  <View style={styles.accountTypeContainer}>
                    <LinearGradient
                      colors={['rgba(45,53,72,0.6)', 'rgba(28,35,51,0.4)']}
                      style={styles.accountTypeGradient}
                    >
                      <Text style={[styles.accountTypeText, { color: tc.text.secondary }]}>{activeAccount.accountType}</Text>
                    </LinearGradient>
                  </View>
                </LinearGradient>
              </View>
            </Animated.View>
          )}

          {/* Other Accounts Section */}
          {!isLoading && <Animated.View entering={FadeInUp.delay(100).duration(400)}>
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionTitle, { color: tc.text.primary }]}>{t('screens.accountSwitcher.otherAccounts')}</Text>
              <Text style={[styles.sectionCount, { backgroundColor: tc.surface, color: tc.text.tertiary }]}>{otherAccounts.length}</Text>
            </View>

            <View style={styles.accountsList}>
              {otherAccounts.map((account, index) => (
                <Animated.View
                  key={account.id}
                  entering={FadeInUp.delay(index * 100).duration(400)}
                  style={styles.accountCard}
                >
                  <LinearGradient
                    colors={colors.gradient.cardDark}
                    style={styles.accountGradient}
                  >
                    {/* Avatar and Info */}
                    <View style={styles.accountRow}>
                      <Avatar
                        uri={account.avatarUrl}
                        name={account.displayName}
                        size="lg"
                      />

                      <View style={styles.accountInfo}>
                        <View style={styles.accountNameRow}>
                          <Text style={[styles.accountName, { color: tc.text.primary }]}>{account.displayName}</Text>
                          {account.isVerified && <VerifiedBadge size={13} />}
                        </View>
                        <Text style={[styles.accountUsername, { color: tc.text.secondary }]}>@{account.username}</Text>

                        {/* Account Type Badge */}
                        <View style={styles.accountTypeBadge}>
                          <LinearGradient
                            colors={['rgba(45,53,72,0.6)', 'rgba(28,35,51,0.4)']}
                            style={styles.accountTypeBadgeGradient}
                          >
                            <Text style={[styles.accountTypeBadgeText, { color: tc.text.secondary }]}>{account.accountType}</Text>
                          </LinearGradient>
                        </View>

                        <Text style={[styles.lastActive, { color: tc.text.tertiary }]}>
                          {account.lastActive === 'active_now' ? t('screens.accountSwitcher.activeNow', { defaultValue: 'Active now' })
                            : t('screens.accountSwitcher.tapToSwitch', { defaultValue: 'Tap to switch' })}
                        </Text>
                      </View>

                      {/* Unread Badge + Switch Button */}
                      <View style={styles.accountActions}>
                        {account.unreadCount > 0 && (
                          <View style={styles.unreadBadge}>
                            <Text style={styles.unreadBadgeText}>{account.unreadCount}</Text>
                          </View>
                        )}
                        <Pressable accessibilityRole="button"
                          accessibilityLabel={t('screens.accountSwitcher.switchButton')}
                          style={styles.switchButton}
                          onPress={() => handleSwitchAccount(account)}
                          disabled={switching}
                        >
                          <LinearGradient
                            colors={['rgba(10,123,79,0.2)', 'rgba(10,123,79,0.1)']}
                            style={styles.switchButtonGradient}
                          >
                            <Text style={styles.switchButtonText}>{t('screens.accountSwitcher.switchButton')}</Text>
                          </LinearGradient>
                        </Pressable>
                      </View>
                    </View>
                  </LinearGradient>
                </Animated.View>
              ))}
            </View>
          </Animated.View>}

          {/* Empty State when no accounts loaded */}
          {!isLoading && accounts.length === 0 && (
            <EmptyState
              icon="user"
              title={t('screens.accountSwitcher.noAccounts') || 'No accounts found'}
              subtitle={t('screens.accountSwitcher.noAccountsSubtitle') || 'Sign in to get started'}
            />
          )}

          {/* Add Account Section */}
          <Animated.View entering={FadeInUp.delay(200).duration(400)}>
            <Pressable accessibilityRole="button" accessibilityLabel={t('screens.accountSwitcher.addAccount')} style={styles.addAccountCard} onPress={handleAddAccount}>
              <LinearGradient
                colors={['rgba(45,53,72,0.2)', 'rgba(28,35,51,0.1)']}
                style={[styles.addAccountGradient, styles.addAccountDashed]}
              >
                <View style={styles.addAccountIcon}>
                  <Icon name="circle-plus" size="xl" color={colors.emerald} />
                </View>
                <Text style={[styles.addAccountText, { color: tc.text.primary }]}>{t('screens.accountSwitcher.addAccount')}</Text>
                <Text style={[styles.addAccountSubtext, { color: tc.text.tertiary }]}>{t('screens.accountSwitcher.addAccountSubtext')}</Text>
              </LinearGradient>
            </Pressable>
          </Animated.View>

          {/* Account Management Section */}
          <Animated.View entering={FadeInUp.delay(250).duration(400)}>
            <View style={styles.managementCard}>
              <LinearGradient
                colors={colors.gradient.cardDark}
                style={styles.managementGradient}
              >
                {/* Header */}
                <View style={styles.managementHeader}>
                  <View style={styles.managementIconContainer}>
                    <LinearGradient
                      colors={['rgba(10,123,79,0.2)', 'rgba(200,150,62,0.1)']}
                      style={styles.managementIconGradient}
                    >
                      <Icon name="settings" size="sm" color={colors.emerald} />
                    </LinearGradient>
                  </View>
                  <Text style={[styles.managementTitle, { color: tc.text.primary }]}>{t('screens.accountSwitcher.managementTitle')}</Text>
                </View>

                {/* Manage Accounts Row */}
                <Pressable accessibilityRole="button" accessibilityLabel={t('screens.accountSwitcher.manageAccounts')} style={[styles.managementRow, { opacity: 0.5 }]} onPress={() => showToast({ message: t('common.comingSoon', { defaultValue: 'Coming soon' }), variant: 'info' })}>
                  <View style={styles.managementRowLeft}>
                    <Icon name="users" size="sm" color={tc.text.secondary} />
                    <Text style={[styles.managementRowText, { color: tc.text.primary }]}>{t('screens.accountSwitcher.manageAccounts')}</Text>
                  </View>
                  <Icon name="chevron-right" size="sm" color={tc.text.tertiary} />
                </Pressable>

                {/* Default Account Row */}
                <Pressable accessibilityRole="button" accessibilityLabel={t('screens.accountSwitcher.defaultAccount')} style={[styles.managementRow, { opacity: 0.5 }]} onPress={() => showToast({ message: t('common.comingSoon', { defaultValue: 'Coming soon' }), variant: 'info' })}>
                  <View style={styles.managementRowLeft}>
                    <Icon name="user" size="sm" color={tc.text.secondary} />
                    <Text style={[styles.managementRowText, { color: tc.text.primary }]}>{t('screens.accountSwitcher.defaultAccount')}</Text>
                  </View>
                  <View style={styles.managementRowRight}>
                    <Text style={[styles.managementRowValue, {color: tc.text.tertiary}]}>
                      @{activeAccount?.username}
                    </Text>
                    <Icon name="chevron-right" size="sm" color={tc.text.tertiary} />
                  </View>
                </Pressable>

                {/* Auto-switch Toggle */}
                {/* TODO: Persist to settings API */}
                <View style={styles.toggleRow}>
                  <View style={styles.toggleRowLeft}>
                    <Icon name="bell" size="sm" color={tc.text.secondary} />
                    <Text style={[styles.toggleRowText, { color: tc.text.primary }]}>{t('screens.accountSwitcher.autoSwitchToggle')}</Text>
                  </View>
                  <Switch
                    value={autoSwitchOnNotification}
                    onValueChange={setAutoSwitchOnNotification}
                    trackColor={{ false: tc.surface, true: colors.emerald }}
                    thumbColor="#FFF"
                    accessibilityRole="switch"
                    accessibilityLabel={t('screens.accountSwitcher.autoSwitchToggle')}
                    accessibilityState={{ checked: autoSwitchOnNotification }}
                  />
                </View>
              </LinearGradient>
            </View>
          </Animated.View>

          {/* Security Note */}
          <Animated.View entering={FadeInUp.delay(300).duration(400)}>
            <View style={styles.securityCard}>
              <LinearGradient
                colors={colors.gradient.cardDark}
                style={styles.securityGradient}
              >
                <View style={styles.securityIconContainer}>
                  <LinearGradient
                    colors={['rgba(10,123,79,0.2)', 'rgba(200,150,62,0.1)']}
                    style={styles.securityIconGradient}
                  >
                    <Icon name="lock" size="sm" color={colors.emerald} />
                  </LinearGradient>
                </View>
                <View style={styles.securityContent}>
                  <Text style={[styles.securityText, { color: tc.text.secondary }]}>
                    {t('screens.accountSwitcher.securityText')}
                  </Text>
                  <Pressable accessibilityRole="button" accessibilityLabel={t('screens.accountSwitcher.signOutAll')} onPress={handleSignOutAll}>
                    <Text style={styles.signOutAllText}>{t('screens.accountSwitcher.signOutAll')}</Text>
                  </Pressable>
                </View>
              </LinearGradient>
            </View>
          </Animated.View>

          {/* Bottom Spacing */}
          <View style={styles.bottomSpacing} />
        </ScrollView>
      </SafeAreaView>
  
    </ScreenErrorBoundary>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  heroCard: {
    marginHorizontal: spacing.base,
    marginTop: spacing.md,
  },
  heroGradient: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.active.gold30,
    position: 'relative',
    overflow: 'hidden',
  },
  heroBorder: {
    position: 'absolute',
    start: 0,
    top: 0,
    bottom: 0,
    width: 4,
    backgroundColor: colors.gold,
  },
  heroContent: {
    padding: spacing.lg,
    flexDirection: 'row',
    gap: spacing.md,
    alignItems: 'flex-start',
  },
  heroAvatarContainer: {
    position: 'relative',
  },
  heroAvatar: {
    width: 64,
    height: 64,
    borderRadius: radius.full,
    backgroundColor: colors.dark.surface,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: colors.active.gold30,
  },
  onlineRing: {
    position: 'absolute',
    bottom: 0,
    end: 0,
    width: 18,
    height: 18,
    borderRadius: radius.full,
    backgroundColor: colors.emerald,
    borderWidth: 3,
    borderColor: colors.dark.bg,
  },
  heroInfo: {
    flex: 1,
  },
  heroNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  heroName: {
    fontSize: fontSize.lg,
    fontWeight: '700',
    color: colors.text.primary,
  },
  heroUsername: {
    fontSize: fontSize.base,
    color: colors.text.secondary,
    marginTop: spacing.xs,
  },
  heroStats: {
    fontSize: fontSize.sm,
    color: colors.text.tertiary,
    marginTop: spacing.sm,
  },
  activeBadge: {
    borderRadius: radius.full,
    overflow: 'hidden',
  },
  activeBadgeGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  activeBadgeText: {
    fontSize: fontSize.xs,
    color: '#FFF',
    fontWeight: '500',
  },
  accountTypeContainer: {
    position: 'absolute',
    top: spacing.lg,
    end: spacing.lg,
    borderRadius: radius.full,
    overflow: 'hidden',
  },
  accountTypeGradient: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  accountTypeText: {
    fontSize: fontSize.xs,
    color: colors.text.secondary,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginHorizontal: spacing.base,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  sectionTitle: {
    fontSize: fontSize.base,
    fontWeight: '600',
    color: colors.text.primary,
  },
  sectionCount: {
    fontSize: fontSize.sm,
    color: colors.text.tertiary,
    backgroundColor: colors.dark.surface,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.full,
  },
  accountsList: {
    paddingHorizontal: spacing.base,
    gap: spacing.md,
  },
  accountCard: {
    borderRadius: radius.lg,
    overflow: 'hidden',
  },
  accountGradient: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.active.white6,
    padding: spacing.base,
  },
  accountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  accountAvatar: {
    width: 48,
    height: 48,
    borderRadius: radius.full,
    backgroundColor: colors.dark.surface,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: colors.active.gold20,
  },
  accountInfo: {
    flex: 1,
  },
  accountNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  accountName: {
    fontSize: fontSize.base,
    fontWeight: '600',
    color: colors.text.primary,
  },
  accountUsername: {
    fontSize: fontSize.sm,
    color: colors.text.secondary,
  },
  accountTypeBadge: {
    alignSelf: 'flex-start',
    marginTop: spacing.xs,
    borderRadius: radius.full,
    overflow: 'hidden',
  },
  accountTypeBadgeGradient: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  accountTypeBadgeText: {
    fontSize: fontSizeExt.tiny,
    color: colors.text.secondary,
  },
  lastActive: {
    fontSize: fontSize.xs,
    color: colors.text.tertiary,
    marginTop: spacing.xs,
  },
  accountActions: {
    alignItems: 'flex-end',
    gap: spacing.sm,
  },
  unreadBadge: {
    width: 24,
    height: 24,
    borderRadius: radius.full,
    backgroundColor: colors.error,
    justifyContent: 'center',
    alignItems: 'center',
  },
  unreadBadgeText: {
    fontSize: fontSize.xs,
    color: '#FFF',
    fontWeight: '600',
  },
  switchButton: {
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  switchButtonGradient: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
  },
  switchButtonText: {
    fontSize: fontSize.sm,
    color: colors.emerald,
    fontWeight: '600',
  },
  addAccountCard: {
    marginHorizontal: spacing.base,
    marginTop: spacing.lg,
    borderRadius: radius.lg,
    overflow: 'hidden',
  },
  addAccountGradient: {
    padding: spacing.lg,
    alignItems: 'center',
    gap: spacing.xs,
    borderRadius: radius.lg,
  },
  addAccountDashed: {
    borderWidth: 2,
    borderColor: colors.emerald,
    borderStyle: 'dashed',
  },
  addAccountIcon: {
    marginBottom: spacing.xs,
  },
  addAccountText: {
    fontSize: fontSize.base,
    color: colors.text.primary,
    fontWeight: '500',
  },
  addAccountSubtext: {
    fontSize: fontSize.sm,
    color: colors.text.tertiary,
  },
  managementCard: {
    marginHorizontal: spacing.base,
    marginTop: spacing.lg,
  },
  managementGradient: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.active.white6,
    padding: spacing.base,
  },
  managementHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  managementIconContainer: {
    borderRadius: radius.sm,
    overflow: 'hidden',
  },
  managementIconGradient: {
    width: 32,
    height: 32,
    borderRadius: radius.sm,
    justifyContent: 'center',
    alignItems: 'center',
  },
  managementTitle: {
    fontSize: fontSize.base,
    fontWeight: '600',
    color: colors.text.primary,
  },
  managementRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.active.white6,
  },
  managementRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  managementRowText: {
    fontSize: fontSize.base,
    color: colors.text.primary,
  },
  managementRowRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  managementRowValue: {
    fontSize: fontSize.sm,
    color: colors.text.tertiary,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
  },
  toggleRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  toggleRowText: {
    fontSize: fontSize.base,
    color: colors.text.primary,
  },
  securityCard: {
    marginHorizontal: spacing.base,
    marginTop: spacing.lg,
  },
  securityGradient: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.active.white6,
    padding: spacing.base,
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'flex-start',
  },
  securityIconContainer: {
    borderRadius: radius.sm,
    overflow: 'hidden',
  },
  securityIconGradient: {
    width: 32,
    height: 32,
    borderRadius: radius.sm,
    justifyContent: 'center',
    alignItems: 'center',
  },
  securityContent: {
    flex: 1,
  },
  securityText: {
    fontSize: fontSize.sm,
    color: colors.text.secondary,
    lineHeight: 20,
    marginBottom: spacing.xs,
  },
  signOutAllText: {
    fontSize: fontSize.sm,
    color: colors.error,
  },
  bottomSpacing: {
    height: spacing.xxl,
  },
});
