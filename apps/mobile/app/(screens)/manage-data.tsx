import { useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  RefreshControl,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useMutation } from '@tanstack/react-query';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useClerk } from '@clerk/clerk-expo';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { Icon } from '@/components/ui/Icon';
import type { IconName } from '@/components/ui/Icon';
import { Skeleton } from '@/components/ui/Skeleton';
import { GlassHeader } from '@/components/ui/GlassHeader';
import { colors, spacing, fontSize, radius } from '@/theme';
import { usersApi, accountApi } from '@/services/api';
import { useTranslation } from '@/hooks/useTranslation';
import { ScreenErrorBoundary } from '@/components/ui/ScreenErrorBoundary';


function InfoRow({
  label,
  description,
  icon,
}: {
  label: string;
  description?: string;
  icon?: IconName;
}) {
  return (
    <View style={styles.infoRow}>
      <View style={styles.infoText}>
        <Text style={styles.infoLabel}>{label}</Text>
        {description && <Text style={styles.infoDescription}>{description}</Text>}
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
  return (
    <View style={styles.actionRow}>
      <View style={styles.actionText}>
        <Text style={styles.actionLabel}>{label}</Text>
        {description && <Text style={styles.actionDescription}>{description}</Text>}
      </View>
      <Pressable
        onPress={onPress}
        disabled={loading}
        accessibilityLabel={buttonLabel}
        accessibilityRole="button"
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
  const [refreshing, setRefreshing] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const { t } = useTranslation();

  useEffect(() => {
    const timer = setTimeout(() => setIsLoading(false), 300);
    return () => clearTimeout(timer);
  }, []);

  const clearWatchHistoryMutation = useMutation({
    mutationFn: () => usersApi.clearWatchHistory(),
    onSuccess: () => {
      Alert.alert(t('settings.cleared'), t('settings.watchHistoryClearedSuccess'));
    },
    onError: (err: Error) => {
      Alert.alert(t('common.error'), err.message);
    },
  });

  const deleteAccountMutation = useMutation({
    mutationFn: () => usersApi.deleteAccount(),
    onSuccess: async () => {
      await signOut();
    },
    onError: (err: Error) => Alert.alert(t('common.error'), err.message),
  });

  const handleRequestDownload = () => {
    Alert.alert(
      t('settings.requestDataDownload'),
      t('settings.requestDataDownloadMessage'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('settings.requestButton'),
          onPress: async () => {
            try {
              await accountApi.requestDataExport();
              Alert.alert(t('settings.requestSent'), t('settings.requestSentMessage'));
            } catch {
              Alert.alert(t('common.error'), t('settings.requestDataExportFailed'));
            }
          },
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
            await AsyncStorage.removeItem('search-history');
            Alert.alert(t('settings.cleared'), t('settings.searchHistoryCleared'));
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

  const onRefresh = async () => {
    setRefreshing(true);
    // Could refresh any data, but nothing yet.
    setTimeout(() => setRefreshing(false), 1000);
  };

  return (
    <ScreenErrorBoundary>
      <SafeAreaView style={styles.container} edges={['top']}>
        <GlassHeader
          title={t('settings.manageData')}
          leftAction={{ icon: 'arrow-left', onPress: () => router.back(), accessibilityLabel: t('common.back') }}
        />

        {isLoading ? (
          <View style={{ padding: spacing.base, paddingTop: 100, gap: spacing.lg }}>
            {Array.from({ length: 5 }).map((_, i) => (
              <View key={i} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <View style={{ flex: 1, gap: spacing.xs }}>
                  <Skeleton.Rect width={140} height={14} />
                  <Skeleton.Rect width={200} height={11} />
                </View>
                <Skeleton.Rect width={80} height={32} borderRadius={radius.sm} />
              </View>
            ))}
          </View>
        ) : (
        <ScrollView
          style={styles.body}
          contentContainerStyle={styles.bodyContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={colors.emerald}
            />
          }
        >
          <Animated.View entering={FadeInUp.delay(0).duration(400)}>
            <LinearGradient
              colors={['rgba(45,53,72,0.4)', 'rgba(28,35,51,0.2)']}
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

          <Text style={styles.footerNote}>
            {t('settings.morePrivacySettingsPrefix')}{' '}
            <Text style={styles.link} onPress={() => router.push('/(screens)/settings' as never)} accessibilityLabel={t('settings.goToSettings')} accessibilityRole="link">
              {t('common.settings')}
            </Text>{' '}
            {t('settings.morePrivacySettingsSuffix')}
          </Text>
        </ScrollView>
        )}
      </SafeAreaView>
  
    </ScreenErrorBoundary>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.dark.bg },
  body: { flex: 1 },
  bodyContent: { paddingBottom: 60, paddingTop: 100 },
  card: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
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
  actionText: { flex: 1, marginRight: spacing.md },
  actionLabel: {
    color: colors.text.primary,
    fontSize: fontSize.base,
    fontWeight: '500',
  },
  actionDescription: {
    color: colors.text.tertiary,
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
  infoText: { flex: 1, marginRight: spacing.md },
  infoLabel: {
    color: colors.text.primary,
    fontSize: fontSize.base,
    fontWeight: '500',
  },
  infoDescription: {
    color: colors.text.tertiary,
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
    backgroundColor: 'rgba(255,255,255,0.06)',
    marginLeft: spacing.md,
  },
  footerNote: {
    color: colors.text.tertiary,
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