import { useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  Alert,
  Share,
} from 'react-native';
import { showToast } from '@/components/ui/Toast';
import { useRouter } from 'expo-router';
import { useMutation } from '@tanstack/react-query';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useClerk } from '@clerk/clerk-expo';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { Icon } from '@/components/ui/Icon';
import type { IconName } from '@/components/ui/Icon';
import { GlassHeader } from '@/components/ui/GlassHeader';
import { colors, spacing, fontSize, radius } from '@/theme';
import { usersApi, accountApi } from '@/services/api';
import { useTranslation } from '@/hooks/useTranslation';
import { useThemeColors } from '@/hooks/useThemeColors';
import { formatDate } from '@/utils/localeFormat';
import { useContextualHaptic } from '@/hooks/useContextualHaptic';
import { rtlFlexRow, rtlTextAlign } from '@/utils/rtl';
import { ScreenErrorBoundary } from '@/components/ui/ScreenErrorBoundary';
import { navigate } from '@/utils/navigation';


function InfoRow({
  label,
  description,
  icon,
}: {
  label: string;
  description?: string;
  icon?: IconName;
}) {
  const tc = useThemeColors();
  const { isRTL } = useTranslation();
  return (
    <View style={[styles.infoRow, { flexDirection: rtlFlexRow(isRTL) }]}>
      <View style={styles.infoText}>
        <Text style={[styles.infoLabel, { color: tc.text.primary, textAlign: rtlTextAlign(isRTL) }]}>{label}</Text>
        {description && <Text style={[styles.infoDescription, { color: tc.text.tertiary, textAlign: rtlTextAlign(isRTL) }]}>{description}</Text>}
      </View>
      {icon && (
        <LinearGradient
          colors={['rgba(10,123,79,0.2)', 'rgba(200,150,62,0.1)']}
          style={styles.iconBg}
        >
          <Icon name={icon} size="md" color={colors.emerald} />
        </LinearGradient>
      )}
    </View>
  );
}

function ActionRow({
  label,
  description,
  buttonLabel,
  destructive,
  onPress,
  loading,
}: {
  label: string;
  description?: string;
  buttonLabel: string;
  destructive?: boolean;
  onPress: () => void;
  loading?: boolean;
}) {
  const tc = useThemeColors();
  const { isRTL } = useTranslation();
  return (
    <View style={[styles.actionRow, { flexDirection: rtlFlexRow(isRTL) }]}>
      <View style={styles.actionText}>
        <Text style={[styles.actionLabel, { color: tc.text.primary, textAlign: rtlTextAlign(isRTL) }]}>{label}</Text>
        {description && <Text style={[styles.actionDescription, { color: tc.text.tertiary, textAlign: rtlTextAlign(isRTL) }]}>{description}</Text>}
      </View>
      <Pressable
        onPress={onPress}
        disabled={loading}
        accessibilityLabel={buttonLabel}
        accessibilityRole="button"
        accessibilityState={{ disabled: !!loading }}
      >
        <LinearGradient
          colors={destructive ? ['rgba(248,81,73,0.3)', 'rgba(248,81,73,0.1)'] : ['rgba(10,123,79,0.3)', 'rgba(200,150,62,0.1)']}
          style={styles.actionButton}
        >
          {loading ? (
            <Icon name="loader" size="sm" color={destructive ? colors.error : colors.emerald} />
          ) : (
            <Text style={[styles.actionButtonText, destructive && styles.actionButtonTextDestructive]}>
              {buttonLabel}
            </Text>
          )}
        </LinearGradient>
      </Pressable>
    </View>
  );
}

export default function ManageDataScreen() {
  const router = useRouter();
  const { signOut } = useClerk();
  const { t, isRTL } = useTranslation();
  const tc = useThemeColors();
  const haptic = useContextualHaptic();

  // No async data to load — content is rendered immediately

  const formatExportAsText = (data: Record<string, unknown>): string => {
    let text = `=== ${t('accountSettings.dataExportTitle')} ===\n`;
    text += `${t('accountSettings.exported', 'Exported')}: ${formatDate(new Date(), 'long')}\n\n`;

    if (data.profile && typeof data.profile === 'object') {
      const profile = data.profile as Record<string, unknown>;
      text += `--- ${t('profile.title', 'Profile')} ---\n`;
      if (profile.username) text += `${t('profile.username', 'Username')}: ${profile.username}\n`;
      if (profile.displayName) text += `${t('profile.displayName', 'Display Name')}: ${profile.displayName}\n`;
      if (profile.email) text += `${t('profile.email', 'Email')}: ${profile.email}\n`;
      if (profile.bio) text += `${t('profile.bio', 'Bio')}: ${profile.bio}\n`;
      if (profile.language) text += `${t('settings.language', 'Language')}: ${profile.language}\n`;
      if (profile.createdAt) text += `${t('profile.joined', 'Joined')}: ${formatDate(profile.createdAt as string, 'medium')}\n`;
      text += '\n';
    }

    const appendItems = (label: string, items: unknown[]) => {
      text += `--- ${label} (${items.length}) ---\n`;
      items.slice(0, 50).forEach((item) => {
        const record = item as Record<string, unknown>;
        const date = record.createdAt ? formatDate(record.createdAt as string, 'short') : '';
        const content = (record.content || record.caption || record.title || '') as string;
        text += `  ${date}: ${content.slice(0, 120)}${content.length > 120 ? '...' : ''}\n`;
      });
      if (items.length > 50) text += `  ${t('accountSettings.andMore', { count: items.length - 50 })}\n`;
      text += '\n';
    };

    if (Array.isArray(data.posts)) appendItems(t('accountSettings.dataLabelPosts'), data.posts);
    if (Array.isArray(data.threads)) appendItems(t('accountSettings.dataLabelThreads'), data.threads);
    if (Array.isArray(data.threadReplies)) appendItems(t('accountSettings.dataLabelThreadReplies'), data.threadReplies);
    if (Array.isArray(data.comments)) appendItems(t('accountSettings.dataLabelComments'), data.comments);
    if (Array.isArray(data.reels)) appendItems(t('accountSettings.dataLabelReels'), data.reels);
    if (Array.isArray(data.videos)) appendItems(t('accountSettings.dataLabelVideos'), data.videos);
    if (Array.isArray(data.stories)) text += `--- ${t('accountSettings.dataLabelStories')} (${data.stories.length}) ---\n\n`;

    if (data.messages && typeof data.messages === 'object') {
      const msgs = data.messages as { count?: number };
      text += `--- ${t('accountSettings.dataLabelMessages')} (${msgs.count ?? 0}) ---\n`;
      text += `  ${t('accountSettings.dataLabelMessagesPrivacy')}\n\n`;
    }

    if (Array.isArray(data.following)) {
      text += `--- ${t('accountSettings.dataLabelFollowing')} (${data.following.length}) ---\n\n`;
    }

    if (Array.isArray(data.bookmarks)) {
      text += `--- ${t('accountSettings.dataLabelBookmarks')} (${data.bookmarks.length}) ---\n\n`;
    }

    return text;
  };

  const exportDataMutation = useMutation({
    mutationFn: () => accountApi.requestDataExport() as Promise<Record<string, unknown>>,
    onSuccess: (data: Record<string, unknown>) => {
      Alert.alert(
        t('manageData.exportTitle'),
        t('manageData.exportDescription'),
        [
          { text: t('common.cancel'), style: 'cancel' },
          {
            text: t('manageData.exportAsText'),
            onPress: async () => {
              try {
                const formatted = formatExportAsText(data);
                await Share.share({ message: formatted, title: t('accountSettings.dataExportTitle') });
              } catch {
                showToast({ message: t('manageData.exportReady'), variant: 'success' });
              }
            },
          },
          {
            text: t('manageData.exportAsJson'),
            onPress: async () => {
              try {
                await Share.share({ message: JSON.stringify(data, null, 2), title: t('accountSettings.dataExportJsonTitle') });
              } catch {
                showToast({ message: t('manageData.exportReady'), variant: 'success' });
              }
            },
          },
        ],
      );
    },
    onError: (err: Error) => {
      showToast({ message: err.message, variant: 'error' });
    },
  });

  const clearWatchHistoryMutation = useMutation({
    mutationFn: () => usersApi.clearWatchHistory(),
    onSuccess: () => {
      showToast({ message: t('settings.watchHistoryClearedSuccess'), variant: 'success' });
    },
    onError: (err: Error) => {
      showToast({ message: err.message, variant: 'error' });
    },
  });

  const deleteAccountMutation = useMutation({
    mutationFn: () => usersApi.deleteAccount(),
    onSuccess: async () => {
      await signOut();
      router.replace('/');
    },
    onError: (err: Error) => showToast({ message: err.message, variant: 'error' }),
  });

  const handleRequestDownload = () => {
    Alert.alert(
      t('settings.requestDataDownload'),
      t('settings.requestDataDownloadMessage'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('settings.requestButton'),
          onPress: () => exportDataMutation.mutate(),
        },
      ],
    );
  };

  const handleClearSearchHistory = () => {
    Alert.alert(
      t('settings.clearSearchHistory'),
      t('settings.clearSearchHistoryMessage'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('settings.clearButton'),
          style: 'destructive',
          onPress: async () => {
            try {
              await AsyncStorage.removeItem('search-history');
              showToast({ message: t('settings.searchHistoryCleared'), variant: 'success' });
            } catch {
              showToast({ message: t('common.somethingWentWrong'), variant: 'error' });
            }
          },
        },
      ],
    );
  };

  const handleClearWatchHistory = () => {
    Alert.alert(
      t('settings.clearWatchHistory'),
      t('settings.clearWatchHistoryMessage'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('settings.clearButton'),
          style: 'destructive',
          onPress: () => clearWatchHistoryMutation.mutate(),
        },
      ],
    );
  };

  const handleDeleteAccount = () => {
    haptic.error();
    Alert.alert(
      t('settings.deleteAccount'),
      t('settings.deleteAccountMessage'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: () => {
            Alert.alert(
              t('settings.deleteAccountConfirmTitle'),
              t('settings.deleteAccountConfirmMessage'),
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

  // No data to refresh on this static screen — RefreshControl removed

  return (
    <ScreenErrorBoundary>
      <SafeAreaView style={[styles.container, { backgroundColor: tc.bg }]} edges={['top']}>
        <GlassHeader
          title={t('settings.manageData')}
          leftAction={{ icon: 'arrow-left', onPress: () => router.back(), accessibilityLabel: t('common.back') }}
        />

        <ScrollView
          style={styles.body}
          contentContainerStyle={styles.bodyContent}
        >
          <Animated.View entering={FadeInUp.delay(0).duration(400).springify()}>
            <LinearGradient
              colors={colors.gradient.cardDark}
              style={styles.card}
            >
              {/* Download Your Data */}
              <ActionRow
                label={t('settings.downloadYourData')}
                description={t('settings.downloadYourDataDescription')}
                buttonLabel={t('settings.requestDownload')}
                onPress={handleRequestDownload}
              />
              <View style={styles.divider} />
              {/* Connected Apps */}
              <InfoRow label={t('settings.connectedApps')} description={t('settings.noConnectedApps')} icon="layers" />
              <View style={styles.divider} />
              {/* Clear Search History */}
              <ActionRow
                label={t('settings.clearSearchHistory')}
                description={t('settings.clearSearchHistoryDescription')}
                buttonLabel={t('settings.clearButton')}
                onPress={handleClearSearchHistory}
              />
              <View style={styles.divider} />
              {/* Clear Watch History */}
              <ActionRow
                label={t('settings.clearWatchHistory')}
                description={t('settings.clearWatchHistoryDescription')}
                buttonLabel={t('settings.clearButton')}
                onPress={handleClearWatchHistory}
                loading={clearWatchHistoryMutation.isPending}
              />
              <View style={styles.divider} />
              {/* Delete Account */}
              <ActionRow
                label={t('settings.deleteAccount')}
                description={t('settings.deleteAccountDescription')}
                buttonLabel={t('settings.deleteAccount')}
                destructive
                onPress={handleDeleteAccount}
                loading={deleteAccountMutation.isPending}
              />
            </LinearGradient>
          </Animated.View>

          <Text style={[styles.footerNote, { color: tc.text.tertiary }]}>
            {t('settings.morePrivacySettingsPrefix')}{' '}
            <Text style={styles.link} onPress={() => navigate('/(screens)/settings')} accessibilityLabel={t('settings.goToSettings')} accessibilityRole="link">
              {t('common.settings')}
            </Text>{' '}
            {t('settings.morePrivacySettingsSuffix')}
          </Text>
        </ScrollView>
      </SafeAreaView>
  
    </ScreenErrorBoundary>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  body: { flex: 1 },
  bodyContent: { paddingBottom: 60, paddingTop: 100 },
  card: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.active.white6,
    overflow: 'hidden',
    marginHorizontal: spacing.base,
    marginBottom: spacing.md,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  actionText: { flex: 1, marginEnd: spacing.md },
  actionLabel: {
    fontSize: fontSize.base,
    fontWeight: '500',
  },
  actionDescription: {
    fontSize: fontSize.sm,
    marginTop: 2,
    lineHeight: 16,
  },
  actionButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    minWidth: 80,
    alignItems: 'center',
  },
  actionButtonText: {
    color: colors.emerald,
    fontSize: fontSize.sm,
    fontWeight: '600',
  },
  actionButtonTextDestructive: {
    color: colors.error,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  infoText: { flex: 1, marginEnd: spacing.md },
  infoLabel: {
    fontSize: fontSize.base,
    fontWeight: '500',
  },
  infoDescription: {
    fontSize: fontSize.sm,
    marginTop: 2,
    lineHeight: 16,
  },
  iconBg: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  divider: {
    height: 0.5,
    backgroundColor: colors.active.white6,
    marginStart: spacing.md,
  },
  footerNote: {
    fontSize: fontSize.xs,
    textAlign: 'center',
    marginTop: spacing.xl,
    marginHorizontal: spacing.base,
    lineHeight: 16,
  },
  link: {
    color: colors.emerald,
    fontWeight: '600',
  },
});