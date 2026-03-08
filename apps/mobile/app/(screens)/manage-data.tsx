import { useState } from 'react';
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
import { Icon } from '@/components/ui/Icon';
import { colors, spacing, fontSize, radius } from '@/theme';
import { usersApi } from '@/services/api';


function InfoRow({
  label,
  description,
  children,
}: {
  label: string;
  description?: string;
  children?: React.ReactNode;
}) {
  return (
    <View style={styles.infoRow}>
      <View style={styles.infoText}>
        <Text style={styles.infoLabel}>{label}</Text>
        {description && <Text style={styles.infoDescription}>{description}</Text>}
      </View>
      {children}
    </View>
  );
}

function ActionRow({
  label,
  description,
  buttonLabel,
  buttonColor,
  onPress,
  loading,
}: {
  label: string;
  description?: string;
  buttonLabel: string;
  buttonColor?: string;
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
        style={[styles.actionButton, buttonColor && { backgroundColor: buttonColor }]}
        onPress={onPress}
        disabled={loading}
      >
        {loading ? (
          <Icon name="loader" size="sm" color="#fff" />
        ) : (
          <Text style={styles.actionButtonText}>{buttonLabel}</Text>
        )}
      </Pressable>
    </View>
  );
}

export default function ManageDataScreen() {
  const router = useRouter();
  const { signOut } = useClerk();
  const [refreshing, setRefreshing] = useState(false);

  const clearWatchHistoryMutation = useMutation({
    mutationFn: () => usersApi.clearWatchHistory(),
    onSuccess: () => {
      Alert.alert('Cleared', 'Watch history cleared successfully.');
    },
    onError: (err: Error) => {
      Alert.alert('Error', err.message);
    },
  });

  const deleteAccountMutation = useMutation({
    mutationFn: () => usersApi.deleteAccount(),
    onSuccess: async () => {
      await signOut();
    },
    onError: (err: Error) => Alert.alert('Error', err.message),
  });

  const handleRequestDownload = () => {
    Alert.alert(
      'Request Data Download',
      'We will prepare a copy of your data and notify you when it’s ready. This may take up to 48 hours.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Request',
          onPress: () => {
            // Hypothetical endpoint — show coming soon
            Alert.alert('Coming Soon', 'Data export functionality is under development.');
          },
        },
      ],
    );
  };

  const handleClearSearchHistory = () => {
    Alert.alert(
      'Clear Search History',
      'This will remove all your recent searches from this device. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: async () => {
            await AsyncStorage.removeItem('search-history');
            Alert.alert('Cleared', 'Search history cleared.');
          },
        },
      ],
    );
  };

  const handleClearWatchHistory = () => {
    Alert.alert(
      'Clear Watch History',
      'This will remove all videos from your watch history. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: () => clearWatchHistoryMutation.mutate(),
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

  const onRefresh = async () => {
    setRefreshing(true);
    // Could refresh any data, but nothing yet.
    setTimeout(() => setRefreshing(false), 1000);
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <Icon name="arrow-left" size="md" color={colors.text.primary} />
        </Pressable>
        <Text style={styles.headerTitle}>Manage Your Data</Text>
        <View style={{ width: 36 }} />
      </View>

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
        <View style={styles.card}>
          {/* Download Your Data */}
          <ActionRow
            label="Download Your Data"
            description="Request a copy of all your data. We'll notify you when it's ready."
            buttonLabel="Request Download"
            onPress={handleRequestDownload}
          />
          <View style={styles.divider} />
          {/* Connected Apps */}
          <InfoRow label="Connected Apps" description="No connected apps">
            <Icon name="layers" size="md" color={colors.text.tertiary} />
          </InfoRow>
          <View style={styles.divider} />
          {/* Clear Search History */}
          <ActionRow
            label="Clear Search History"
            description="Remove all recent searches from this device."
            buttonLabel="Clear"
            onPress={handleClearSearchHistory}
          />
          <View style={styles.divider} />
          {/* Clear Watch History */}
          <ActionRow
            label="Clear Watch History"
            description="Remove all videos from your watch history."
            buttonLabel="Clear"
            onPress={handleClearWatchHistory}
            loading={clearWatchHistoryMutation.isPending}
          />
          <View style={styles.divider} />
          {/* Delete Account */}
          <ActionRow
            label="Delete Account"
            description="Permanently delete your account and all your data."
            buttonLabel="Delete Account"
            buttonColor={colors.error}
            onPress={handleDeleteAccount}
            loading={deleteAccountMutation.isPending}
          />
        </View>

        <Text style={styles.footerNote}>
          For more privacy settings, visit the{' '}
          <Text style={styles.link} onPress={() => router.push('/(screens)/settings')}>
            Settings
          </Text>{' '}
          page.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.dark.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.dark.border,
  },
  headerTitle: {
    color: colors.text.primary,
    fontSize: fontSize.base,
    fontWeight: '700',
  },
  body: { flex: 1 },
  bodyContent: { paddingBottom: 60 },
  card: {
    backgroundColor: colors.dark.bgElevated,
    marginHorizontal: spacing.base,
    borderRadius: radius.lg,
    overflow: 'hidden',
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.base,
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
    backgroundColor: colors.emerald,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.sm,
    minWidth: 80,
    alignItems: 'center',
  },
  actionButtonText: {
    color: '#fff',
    fontSize: fontSize.sm,
    fontWeight: '600',
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.base,
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
  divider: {
    height: 0.5,
    backgroundColor: colors.dark.border,
    marginLeft: spacing.base,
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