import { useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl, TouchableOpacity, Switch } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { Icon } from '@/components/ui/Icon';
import { GlassHeader } from '@/components/ui/GlassHeader';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { VerifiedBadge } from '@/components/ui/VerifiedBadge';
import { colors, spacing, radius, fontSize, fonts } from '@/theme';
import { useTranslation } from '@/hooks/useTranslation';

interface Account {
  id: string;
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

const MOCK_ACCOUNTS: Account[] = [
  {
    id: '1',
    displayName: 'Khalid Al-Rashid',
    username: 'khalid_dev',
    avatarUrl: null,
    accountType: 'Personal',
    followers: '1.2K',
    following: '342',
    posts: '89',
    isActive: true,
    unreadCount: 0,
    lastActive: 'Active now',
    isVerified: false,
  },
  {
    id: '2',
    displayName: 'Mizanly Official',
    username: 'mizanly',
    avatarUrl: null,
    accountType: 'Creator',
    followers: '45.2K',
    following: '128',
    posts: '456',
    isActive: false,
    unreadCount: 3,
    lastActive: 'Active 2h ago',
    isVerified: true,
  },
  {
    id: '3',
    displayName: 'Design Studio',
    username: 'khalid_designs',
    avatarUrl: null,
    accountType: 'Creator',
    followers: '890',
    following: '234',
    posts: '67',
    isActive: false,
    unreadCount: 0,
    lastActive: 'Active 5h ago',
    isVerified: false,
  },
];

export default function AccountSwitcherScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const [refreshing, setRefreshing] = useState(false);
  const [accounts, setAccounts] = useState<Account[]>(MOCK_ACCOUNTS);
  const [autoSwitchOnNotification, setAutoSwitchOnNotification] = useState(false);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 1000);
  }, []);

  const activeAccount = accounts.find(a => a.isActive);
  const otherAccounts = accounts.filter(a => !a.isActive);

  const handleSwitchAccount = (accountId: string) => {
    setAccounts(accounts.map(a => ({
      ...a,
      isActive: a.id === accountId,
    })));
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <GlassHeader title={t('screens.accountSwitcher.title')} showBackButton />

      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl tintColor={colors.emerald} refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {/* Current Account Hero Card */}
        {activeAccount && (
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
                    <View style={styles.heroAvatar}>
                      <Icon name="user" size="xl" color={colors.text.tertiary} />
                    </View>
                    <View style={styles.onlineRing} />
                  </View>

                  {/* Account Info */}
                  <View style={styles.heroInfo}>
                    <View style={styles.heroNameRow}>
                      <Text style={styles.heroName}>{activeAccount.displayName}</Text>
                      {activeAccount.isVerified && <VerifiedBadge size={15} />}
                    </View>
                    <Text style={styles.heroUsername}>@{activeAccount.username}</Text>

                    {/* Stats */}
                    <Text style={styles.heroStats}>
                      {activeAccount.followers} followers · {activeAccount.following} following · {activeAccount.posts} posts
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
                    <Text style={styles.accountTypeText}>{activeAccount.accountType}</Text>
                  </LinearGradient>
                </View>
              </LinearGradient>
            </View>
          </Animated.View>
        )}

        {/* Other Accounts Section */}
        <Animated.View entering={FadeInUp.delay(100).duration(400)}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>{t('screens.accountSwitcher.otherAccounts')}</Text>
            <Text style={styles.sectionCount}>{otherAccounts.length}</Text>
          </View>

          <View style={styles.accountsList}>
            {otherAccounts.map((account, index) => (
              <Animated.View
                key={account.id}
                entering={FadeInUp.delay(index * 100).duration(400)}
                style={styles.accountCard}
              >
                <LinearGradient
                  colors={['rgba(45,53,72,0.4)', 'rgba(28,35,51,0.2)']}
                  style={styles.accountGradient}
                >
                  {/* Avatar and Info */}
                  <View style={styles.accountRow}>
                    <View style={styles.accountAvatar}>
                      <Icon name="user" size="md" color={colors.text.tertiary} />
                    </View>

                    <View style={styles.accountInfo}>
                      <View style={styles.accountNameRow}>
                        <Text style={styles.accountName}>{account.displayName}</Text>
                        {account.isVerified && <VerifiedBadge size={13} />}
                      </View>
                      <Text style={styles.accountUsername}>@{account.username}</Text>

                      {/* Account Type Badge */}
                      <View style={styles.accountTypeBadge}>
                        <LinearGradient
                          colors={['rgba(45,53,72,0.6)', 'rgba(28,35,51,0.4)']}
                          style={styles.accountTypeBadgeGradient}
                        >
                          <Text style={styles.accountTypeBadgeText}>{account.accountType}</Text>
                        </LinearGradient>
                      </View>

                      <Text style={styles.lastActive}>{account.lastActive}</Text>
                    </View>

                    {/* Unread Badge + Switch Button */}
                    <View style={styles.accountActions}>
                      {account.unreadCount > 0 && (
                        <View style={styles.unreadBadge}>
                          <Text style={styles.unreadBadgeText}>{account.unreadCount}</Text>
                        </View>
                      )}
                      <TouchableOpacity
                        style={styles.switchButton}
                        onPress={() => handleSwitchAccount(account.id)}
                      >
                        <LinearGradient
                          colors={['rgba(10,123,79,0.2)', 'rgba(10,123,79,0.1)']}
                          style={styles.switchButtonGradient}
                        >
                          <Text style={styles.switchButtonText}>Switch</Text>
                        </LinearGradient>
                      </TouchableOpacity>
                    </View>
                  </View>
                </LinearGradient>
              </Animated.View>
            ))}
          </View>
        </Animated.View>

        {/* Add Account Section */}
        <Animated.View entering={FadeInUp.delay(200).duration(400)}>
          <TouchableOpacity style={styles.addAccountCard}>
            <LinearGradient
              colors={['rgba(45,53,72,0.2)', 'rgba(28,35,51,0.1)']}
              style={[styles.addAccountGradient, styles.addAccountDashed]}
            >
              <View style={styles.addAccountIcon}>
                <Icon name="circle-plus" size="xl" color={colors.emerald} />
              </View>
              <Text style={styles.addAccountText}>Add Account</Text>
              <Text style={styles.addAccountSubtext}>Sign in to another account</Text>
            </LinearGradient>
          </TouchableOpacity>
        </Animated.View>

        {/* Account Management Section */}
        <Animated.View entering={FadeInUp.delay(250).duration(400)}>
          <View style={styles.managementCard}>
            <LinearGradient
              colors={['rgba(45,53,72,0.4)', 'rgba(28,35,51,0.2)']}
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
                <Text style={styles.managementTitle}>Account Management</Text>
              </View>

              {/* Manage Accounts Row */}
              <TouchableOpacity style={styles.managementRow}>
                <View style={styles.managementRowLeft}>
                  <Icon name="users" size="sm" color={colors.text.secondary} />
                  <Text style={styles.managementRowText}>Manage Accounts</Text>
                </View>
                <Icon name="chevron-right" size="sm" color={colors.text.tertiary} />
              </TouchableOpacity>

              {/* Default Account Row */}
              <TouchableOpacity style={styles.managementRow}>
                <View style={styles.managementRowLeft}>
                  <Icon name="user" size="sm" color={colors.text.secondary} />
                  <Text style={styles.managementRowText}>Default Account</Text>
                </View>
                <View style={styles.managementRowRight}>
                  <Text style={[styles.managementRowValue, {color: colors.text.tertiary}]}>
                    @{activeAccount?.username}
                  </Text>
                  <Icon name="chevron-right" size="sm" color={colors.text.tertiary} />
                </View>
              </TouchableOpacity>

              {/* Auto-switch Toggle */}
              <View style={styles.toggleRow}>
                <View style={styles.toggleRowLeft}>
                  <Icon name="bell" size="sm" color={colors.text.secondary} />
                  <Text style={styles.toggleRowText}>Auto-switch on notification</Text>
                </View>
                <Switch
                  value={autoSwitchOnNotification}
                  onValueChange={setAutoSwitchOnNotification}
                  trackColor={{ false: colors.dark.surface, true: colors.emerald }}
                  thumbColor="#FFF"
                />
              </View>
            </LinearGradient>
          </View>
        </Animated.View>

        {/* Security Note */}
        <Animated.View entering={FadeInUp.delay(300).duration(400)}>
          <View style={styles.securityCard}>
            <LinearGradient
              colors={['rgba(45,53,72,0.4)', 'rgba(28,35,51,0.2)']}
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
                <Text style={styles.securityText}>
                  Each account has its own login and security settings
                </Text>
                <TouchableOpacity>
                  <Text style={styles.signOutAllText}>Sign out of all accounts</Text>
                </TouchableOpacity>
              </View>
            </LinearGradient>
          </View>
        </Animated.View>

        {/* Bottom Spacing */}
        <View style={styles.bottomSpacing} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.dark.bg,
  },
  heroCard: {
    marginHorizontal: spacing.base,
    marginTop: spacing.md,
  },
  heroGradient: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(200,150,62,0.3)',
    position: 'relative',
    overflow: 'hidden',
  },
  heroBorder: {
    position: 'absolute',
    left: 0,
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
    borderColor: 'rgba(200,150,62,0.3)',
  },
  onlineRing: {
    position: 'absolute',
    bottom: 0,
    right: 0,
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
    right: spacing.lg,
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
    borderColor: 'rgba(255,255,255,0.06)',
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
    borderColor: 'rgba(200,150,62,0.2)',
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
    fontSize: 10,
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
    fontSize: 12,
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
    borderColor: 'rgba(255,255,255,0.06)',
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
    borderBottomColor: 'rgba(255,255,255,0.06)',
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
    borderColor: 'rgba(255,255,255,0.06)',
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
