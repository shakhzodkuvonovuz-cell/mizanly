import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, Pressable,
  ScrollView, Alert, Share,
} from 'react-native';
import * as FileSystem from 'expo-file-system';
import { BrandedRefreshControl } from '@/components/ui/BrandedRefreshControl';
import { useRouter } from 'expo-router';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useClerk, useUser } from '@clerk/clerk-expo';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { Icon } from '@/components/ui/Icon';
// Switch import removed — not used on this screen
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { GlassHeader } from '@/components/ui/GlassHeader';
import { colors, spacing, fontSize, radius } from '@/theme';
import { usersApi } from '@/services/api';
import { useContextualHaptic } from '@/hooks/useContextualHaptic';
import { useTranslation } from '@/hooks/useTranslation';
import { useThemeColors } from '@/hooks/useThemeColors';
import { ScreenErrorBoundary } from '@/components/ui/ScreenErrorBoundary';
import { showToast } from '@/components/ui/Toast';

function Row({
  label,
  hint,
  value,
  onPress,
  destructive,
}: {
  label: string;
  hint?: string;
  value?: string;
  onPress?: () => void;
  destructive?: boolean;
}) {
  const haptic = useContextualHaptic();
  const tc = useThemeColors();
  const handlePress = onPress ? () => {
    haptic.tick();
    onPress();
  } : undefined;
  return (
    <Pressable
      accessibilityRole="button"
      style={styles.row}
      onPress={handlePress}

      disabled={!handlePress}
    >
      <View style={styles.rowText}>
        <Text style={[styles.rowLabel, { color: tc.text.primary }, destructive && styles.destructive]}>{label}</Text>
        {hint ? <Text style={[styles.rowHint, { color: tc.text.tertiary }]}>{hint}</Text> : null}
        {value ? <Text style={[styles.rowValue, { color: tc.text.secondary }]}>{value}</Text> : null}
      </View>
      {onPress ? (
        <Icon name="chevron-right" size="sm" color={tc.text.tertiary} />
      ) : null}
    </Pressable>
  );
}

function SectionHeader({ title, index }: { title: string; index: number }) {
  return (
    <Animated.View entering={FadeInUp.delay(index * 100).duration(400)}>
      <LinearGradient
        colors={['rgba(10,123,79,0.2)', 'rgba(200,150,62,0.1)']}
        style={styles.sectionHeaderGradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
      >
        <Text style={styles.sectionHeader}>{title}</Text>
      </LinearGradient>
    </Animated.View>
  );
}

export default function AccountSettingsScreen() {
  const router = useRouter();
  const { signOut } = useClerk();
  const { user: clerkUser } = useUser();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const tc = useThemeColors();

  const [cacheSize, setCacheSize] = useState<string>('');

  const loadCacheSize = useCallback(async () => {
    try {
      if (FileSystem.cacheDirectory) {
        const info = await FileSystem.getInfoAsync(FileSystem.cacheDirectory);
        if (info.exists && 'size' in info && typeof info.size === 'number') {
          const mb = (info.size / (1024 * 1024)).toFixed(1);
          setCacheSize(`${mb} MB`);
        } else {
          setCacheSize('0 MB');
        }
      }
    } catch {
      setCacheSize('--');
    }
  }, []);

  useEffect(() => {
    loadCacheSize();
  }, [loadCacheSize]);

  const handleClearCache = () => {
    Alert.alert(
      t('manageData.clearCache'),
      t('accountSettings.cacheSize'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('settings.clearButton'),
          style: 'destructive',
          onPress: async () => {
            try {
              if (FileSystem.cacheDirectory) {
                await FileSystem.deleteAsync(FileSystem.cacheDirectory, { idempotent: true });
              }
              setCacheSize('0 MB');
              showToast({ message: t('manageData.cacheCleared'), variant: 'success' });
            } catch {
              showToast({ message: t('common.error'), variant: 'error' });
            }
          },
        },
      ],
    );
  };

  const userQuery = useQuery({
    queryKey: ['user', 'me'],
    queryFn: () => usersApi.getMe(),
  });

  const primaryEmail = clerkUser?.emailAddresses?.find(addr => addr.id === clerkUser.primaryEmailAddressId)?.emailAddress;
  const primaryPhone = clerkUser?.phoneNumbers?.find(phone => phone.id === clerkUser.primaryPhoneNumberId)?.phoneNumber;
  const maskedEmail = primaryEmail ? primaryEmail.replace(/(.{2})(.*)(@.*)/, '$1***$3') : '';
  const maskedPhone = primaryPhone ? primaryPhone.replace(/(.{4})(.*)(.{4})/, '$1****$3') : '';
  const joinedDate = userQuery.data?.createdAt ? new Date(userQuery.data.createdAt).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }) : '';

  const deactivateMutation = useMutation({
    mutationFn: () => usersApi.deactivate(),
    onSuccess: async () => {
      await signOut();
    },
    onError: (err: Error) => showToast({ message: err.message, variant: 'error' }),
  });

  const requestDeletionMutation = useMutation({
    mutationFn: () => usersApi.requestAccountDeletion(),
    onSuccess: async () => {
      await signOut();
    },
    onError: (err: Error) => showToast({ message: err.message, variant: 'error' }),
  });

  const formatExportAsText = useCallback((data: Record<string, unknown>): string => {
    let text = '=== Your Mizanly Data Export ===\n';
    text += `Exported: ${new Date().toLocaleString()}\n\n`;

    if (data.profile && typeof data.profile === 'object') {
      const profile = data.profile as Record<string, unknown>;
      text += '--- Profile ---\n';
      if (profile.username) text += `Username: ${profile.username}\n`;
      if (profile.displayName) text += `Display Name: ${profile.displayName}\n`;
      if (profile.email) text += `Email: ${profile.email}\n`;
      if (profile.bio) text += `Bio: ${profile.bio}\n`;
      if (profile.language) text += `Language: ${profile.language}\n`;
      if (profile.createdAt) text += `Joined: ${new Date(profile.createdAt as string).toLocaleDateString()}\n`;
      text += '\n';
    }

    const appendItems = (label: string, items: unknown[]) => {
      text += `--- ${label} (${items.length}) ---\n`;
      items.slice(0, 50).forEach((item) => {
        const record = item as Record<string, unknown>;
        const date = record.createdAt ? new Date(record.createdAt as string).toLocaleDateString() : '';
        const content = (record.content || record.caption || record.title || '') as string;
        text += `  ${date}: ${content.slice(0, 120)}${content.length > 120 ? '...' : ''}\n`;
      });
      if (items.length > 50) text += `  ... and ${items.length - 50} more\n`;
      text += '\n';
    };

    if (Array.isArray(data.posts)) appendItems('Posts', data.posts);
    if (Array.isArray(data.threads)) appendItems('Threads', data.threads);
    if (Array.isArray(data.threadReplies)) appendItems('Thread Replies', data.threadReplies);
    if (Array.isArray(data.comments)) appendItems('Comments', data.comments);
    if (Array.isArray(data.reels)) appendItems('Reels', data.reels);
    if (Array.isArray(data.videos)) appendItems('Videos', data.videos);
    if (Array.isArray(data.stories)) text += `--- Stories (${data.stories.length}) ---\n\n`;

    if (data.messages && typeof data.messages === 'object') {
      const msgs = data.messages as { count?: number };
      text += `--- Messages (${msgs.count ?? 0}) ---\n`;
      text += '  [Message content omitted for privacy]\n\n';
    }

    if (Array.isArray(data.following)) text += `--- Following (${data.following.length}) ---\n\n`;
    if (Array.isArray(data.bookmarks)) text += `--- Bookmarks (${data.bookmarks.length}) ---\n\n`;

    return text;
  }, []);

  const exportDataMutation = useMutation({
    mutationFn: () => usersApi.exportData(),
    onSuccess: async (data) => {
      try {
        const formatted = formatExportAsText(data as Record<string, unknown>);
        await Share.share({ message: formatted, title: 'Mizanly Data Export' });
      } catch {
        showToast({ message: t('accountSettings.dataReadyMessage'), variant: 'success' });
      }
    },
    onError: (err: Error) => showToast({ message: err.message, variant: 'error' }),
  });

  const handleDeactivate = () => {
    Alert.alert(
      t('accountSettings.deactivateAlertTitle'),
      t('accountSettings.deactivateAlertMessage'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('accountSettings.deactivateButton'),
          style: 'destructive',
          onPress: () => {
            Alert.alert(
              t('accountSettings.deactivateConfirmTitle'),
              t('accountSettings.deactivateConfirmMessage'),
              [
                { text: t('common.cancel'), style: 'cancel' },
                {
                  text: t('accountSettings.deactivateConfirmButton'),
                  style: 'destructive',
                  onPress: () => deactivateMutation.mutate(),
                },
              ],
            );
          },
        },
      ],
    );
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      t('accountSettings.deleteAlertTitle'),
      t('accountSettings.deleteAlertMessage'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: () => {
            Alert.alert(
              t('accountSettings.deleteConfirmTitle'),
              t('accountSettings.deleteConfirmMessage'),
              [
                { text: t('common.cancel'), style: 'cancel' },
                {
                  text: t('accountSettings.deleteConfirmButton'),
                  style: 'destructive',
                  onPress: async () => {
                    try {
                      const LocalAuth = await import('expo-local-authentication');
                      const hasHardware = await LocalAuth.hasHardwareAsync();
                      if (hasHardware) {
                        const result = await LocalAuth.authenticateAsync({ promptMessage: t('accountSettings.confirmIdentity') });
                        if (!result.success) return;
                      }
                      await requestDeletionMutation.mutateAsync();
                    } catch {
                      // Biometric error — do NOT proceed with deletion
                      showToast({ message: t('common.error', { defaultValue: 'Authentication failed' }), variant: 'error' });
                    }
                  },
                },
              ],
            );
          },
        },
      ],
    );
  };

  const handleExportData = () => {
    exportDataMutation.mutate();
  };

  if (userQuery.isLoading) {
    return (
      <ScreenErrorBoundary>
        <View style={[styles.container, { backgroundColor: tc.bg }]}>
          <GlassHeader
            title={t('accountSettings.title')}
            leftAction={{ icon: 'arrow-left', onPress: () => router.back(), accessibilityLabel: t('common.back') }}
          />
          <View style={{ flex: 1, padding: spacing.base, paddingTop: insets.top + 60, gap: spacing.lg }}>
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton.Rect key={i} width="100%" height={48} />
            ))}
          </View>
        </View>
      </ScreenErrorBoundary>
    );
  }

  if (userQuery.isError) {
    return (
      <ScreenErrorBoundary>
        <View style={[styles.container, { backgroundColor: tc.bg }]}>
          <GlassHeader
            title={t('accountSettings.title')}
            leftAction={{ icon: 'arrow-left', onPress: () => router.back(), accessibilityLabel: t('common.back') }}
          />
          <View style={{ flex: 1, justifyContent: 'center', paddingTop: insets.top + 60 }}>
            <EmptyState
              icon="flag"
              title={t('accountSettings.error.loadAccount')}
              subtitle={t('accountSettings.error.checkConnection')}
              actionLabel={t('common.retry')}
              onAction={() => userQuery.refetch()}
            />
          </View>
        </View>
      </ScreenErrorBoundary>
    );
  }

  return (
    <ScreenErrorBoundary>
      <View style={[styles.container, { backgroundColor: tc.bg }]}>
        <GlassHeader
          title={t('accountSettings.title')}
          leftAction={{ icon: 'arrow-left', onPress: () => router.back(), accessibilityLabel: t('common.back') }}
        />

        <ScrollView
          style={styles.body}
          contentContainerStyle={[styles.bodyContent, { paddingTop: insets.top + 52 }]}
          refreshControl={<BrandedRefreshControl refreshing={userQuery.isRefetching} onRefresh={() => userQuery.refetch()} />}
        >
          {/* Account Info */}
          <SectionHeader title={t('accountSettings.sections.accountInfo')} index={0} />
          <Animated.View entering={FadeInUp.delay(50).duration(400)}>
            <LinearGradient
              colors={colors.gradient.cardDark}
              style={[styles.card, { borderColor: tc.border }]}
            >
              <Row
                label={t('auth.email')}
                value={maskedEmail || t('accountSettings.notSet')}
              />
              <View style={[styles.divider, { backgroundColor: tc.border }]} />
              <Row
                label={t('auth.phone')}
                value={maskedPhone || t('accountSettings.notSet')}
              />
              <View style={[styles.divider, { backgroundColor: tc.border }]} />
              <Row
                label={t('accountSettings.joined')}
                value={joinedDate}
              />
            </LinearGradient>
          </Animated.View>

          {/* Data & Privacy */}
          <SectionHeader title={t('accountSettings.sections.dataPrivacy')} index={1} />
          <Animated.View entering={FadeInUp.delay(150).duration(400)}>
            <LinearGradient
              colors={colors.gradient.cardDark}
              style={[styles.card, { borderColor: tc.border }]}
            >
              <Row
                label={t('accountSettings.downloadMyData')}
                hint={t('accountSettings.exportDataHint')}
                onPress={handleExportData}
              />
              <View style={[styles.divider, { backgroundColor: tc.border }]} />
              <Row
                label={t('accountSettings.storage')}
                hint={cacheSize ? `${t('accountSettings.cacheSize')}: ${cacheSize}` : t('accountSettings.manageDataHint')}
                onPress={handleClearCache}
              />
            </LinearGradient>
          </Animated.View>

          {/* Account Actions */}
          <SectionHeader title={t('accountSettings.sections.accountActions')} index={2} />
          <Animated.View entering={FadeInUp.delay(250).duration(400)}>
            <LinearGradient
              colors={colors.gradient.cardDark}
              style={[styles.card, { borderColor: tc.border }]}
            >
              <Row
                label={t('accountSettings.deactivateAccount')}
                hint={t('accountSettings.deactivateHint')}
                onPress={deactivateMutation.isPending ? undefined : handleDeactivate}
                destructive
              />
              <View style={[styles.divider, { backgroundColor: tc.border }]} />
              <Row
                label={t('accountSettings.deleteAccount')}
                hint={t('accountSettings.deleteHint')}
                onPress={requestDeletionMutation.isPending ? undefined : handleDeleteAccount}
                destructive
              />
            </LinearGradient>
          </Animated.View>

          <Animated.View entering={FadeInUp.delay(350).duration(400)}>
            <LinearGradient
              colors={['rgba(10,123,79,0.1)', 'rgba(200,150,62,0.05)']}
              style={styles.versionCard}
            >
              <Text style={styles.version}>Mizanly v{require('../../../app.json').expo?.version ?? '0.1.0'}</Text>
            </LinearGradient>
          </Animated.View>
        </ScrollView>
      </View>
  
    </ScreenErrorBoundary>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  body: { flex: 1 },
  bodyContent: { paddingBottom: spacing['3xl'] },

  sectionHeaderGradient: {
    marginHorizontal: spacing.base,
    marginTop: spacing.xl,
    marginBottom: spacing.sm,
    borderRadius: radius.md,
    padding: spacing.sm,
  },
  sectionHeader: {
    color: colors.gold, fontSize: fontSize.xs, fontWeight: '700',
    textTransform: 'uppercase', letterSpacing: 0.8,
  },
  card: {
    borderRadius: radius.lg,
    borderWidth: 1, borderColor: colors.active.white6,
    overflow: 'hidden', marginHorizontal: spacing.base, marginBottom: spacing.md,
  },

  row: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.md, paddingVertical: spacing.md,
  },
  rowText: { flex: 1, marginEnd: spacing.md },
  rowLabel: { color: colors.text.primary, fontSize: fontSize.base },
  rowHint: { color: colors.text.tertiary, fontSize: fontSize.xs, marginTop: 2 },
  rowValue: { color: colors.text.secondary, fontSize: fontSize.sm, marginTop: 2 },
  destructive: { color: colors.error },
  divider: { height: 0.5, backgroundColor: colors.active.white6, marginStart: spacing.md },

  versionCard: {
    marginHorizontal: spacing.base,
    marginTop: spacing.xl,
    borderRadius: radius.md,
    padding: spacing.md,
    alignItems: 'center',
  },
  version: {
    color: colors.emerald, fontSize: fontSize.xs, textAlign: 'center', fontWeight: '600',
  },
});