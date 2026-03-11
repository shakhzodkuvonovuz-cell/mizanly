import { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ScrollView, Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useClerk, useUser } from '@clerk/clerk-expo';
import { Icon } from '@/components/ui/Icon';
import { Skeleton } from '@/components/ui/Skeleton';
import { GlassHeader } from '@/components/ui/GlassHeader';
import { colors, spacing, fontSize, radius } from '@/theme';
import { usersApi } from '@/services/api';
import { useHaptic } from '@/hooks/useHaptic';

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
      disabled={!handlePress}
    >
      <View style={styles.rowText}>
        <Text style={[styles.rowLabel, destructive && styles.destructive]}>{label}</Text>
        {hint ? <Text style={styles.rowHint}>{hint}</Text> : null}
        {value ? <Text style={styles.rowValue}>{value}</Text> : null}
      </View>
      {onPress ? (
        <Icon name="chevron-right" size="sm" color={colors.text.tertiary} />
      ) : null}
    </TouchableOpacity>
  );
}

function SectionHeader({ title }: { title: string }) {
  return <Text style={styles.sectionHeader}>{title}</Text>;
}

export default function AccountSettingsScreen() {
  const router = useRouter();
  const { signOut } = useClerk();
  const { user: clerkUser } = useUser();
  const insets = useSafeAreaInsets();

  const userQuery = useQuery({
    queryKey: ['user', 'me'],
    queryFn: () => usersApi.getMe(),
  });

  const primaryEmail = clerkUser?.emailAddresses?.find(addr => addr.id === clerkUser.primaryEmailAddressId)?.emailAddress;
  const primaryPhone = clerkUser?.phoneNumbers?.find(phone => phone.id === clerkUser.primaryPhoneNumberId)?.phoneNumber;
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
    onError: (err: Error) => Alert.alert('Error', err.message),
  });

  const requestDeletionMutation = useMutation({
    mutationFn: () => usersApi.requestAccountDeletion(),
    onSuccess: async () => {
      await signOut();
    },
    onError: (err: Error) => Alert.alert('Error', err.message),
  });

  const exportDataMutation = useMutation({
    mutationFn: () => usersApi.exportData(),
    onSuccess: (data) => {
      // In a real app, you would download the data file
      Alert.alert('Data Ready', 'Your data export has been prepared. Check your email for download link.');
    },
    onError: (err: Error) => Alert.alert('Error', err.message),
  });

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
      'Your account will be scheduled for deletion in 30 days. You can cancel deletion during this period.',
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
                    await requestDeletionMutation.mutateAsync();
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
    Alert.alert(
      'Download Your Data',
      'This will generate a file containing all your data. It may take a few minutes.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Download',
          onPress: () => exportDataMutation.mutate(),
        },
      ],
    );
  };

  if (userQuery.isLoading) {
    return (
      <View style={styles.container}>
        <GlassHeader
          title="Account"
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
        title="Account"
        leftAction={{ icon: 'arrow-left', onPress: () => router.back(), accessibilityLabel: 'Back' }}
      />

      <ScrollView style={styles.body} contentContainerStyle={[styles.bodyContent, { paddingTop: insets.top + 52 }]}>
        {/* Account Info */}
        <SectionHeader title="Account Info" />
        <View style={styles.card}>
          <Row
            label="Email"
            value={primaryEmail || 'Not set'}
          />
          <View style={styles.divider} />
          <Row
            label="Phone"
            value={primaryPhone || 'Not set'}
          />
          <View style={styles.divider} />
          <Row
            label="Joined"
            value={joinedDate}
          />
        </View>

        {/* Data & Privacy */}
        <SectionHeader title="Data & Privacy" />
        <View style={styles.card}>
          <Row
            label="Download My Data"
            hint="Export all your data as a ZIP file"
            onPress={handleExportData}
          />
          <View style={styles.divider} />
          <Row
            label="Manage Data"
            hint="View and manage your stored data"
            onPress={() => router.push('/(screens)/manage-data')}
          />
        </View>

        {/* Account Actions */}
        <SectionHeader title="Account Actions" />
        <View style={styles.card}>
          <Row
            label="Deactivate Account"
            hint="Temporarily hide your account"
            onPress={handleDeactivate}
            destructive
          />
          <View style={styles.divider} />
          <Row
            label="Delete Account"
            hint="Permanently delete after 30 days"
            onPress={handleDeleteAccount}
            destructive
          />
        </View>

        <Text style={styles.version}>Mizanly v0.1.0</Text>
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
  rowText: { flex: 1, marginRight: spacing.md },
  rowLabel: { color: colors.text.primary, fontSize: fontSize.base },
  rowHint: { color: colors.text.tertiary, fontSize: fontSize.xs, marginTop: 2 },
  rowValue: { color: colors.text.secondary, fontSize: fontSize.sm, marginTop: 2 },
  destructive: { color: '#FF453A' },
  divider: { height: 0.5, backgroundColor: colors.dark.border, marginLeft: spacing.base },

  version: {
    color: colors.text.tertiary, fontSize: fontSize.xs, textAlign: 'center', marginTop: spacing.xl,
  },
});