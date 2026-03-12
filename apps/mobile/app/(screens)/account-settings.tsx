import { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ScrollView, Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useClerk, useUser } from '@clerk/clerk-expo';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { Icon } from '@/components/ui/Icon';
import { Switch } from 'react-native-gesture-handler';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
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

  if (userQuery.isError) {
    return (
      <View style={styles.container}>
        <GlassHeader
          title="Account"
          leftAction={{ icon: 'arrow-left', onPress: () => router.back(), accessibilityLabel: 'Back' }}
        />
        <View style={{ flex: 1, justifyContent: 'center', paddingTop: insets.top + 60 }}>
          <EmptyState
            icon="flag"
            title="Couldn't load account"
            subtitle="Check your connection and try again"
            actionLabel="Retry"
            onAction={() => userQuery.refetch()}
          />
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
        <SectionHeader title="Account Info" index={0} />
        <Animated.View entering={FadeInUp.delay(50).duration(400)}>
          <LinearGradient
            colors={['rgba(45,53,72,0.4)', 'rgba(28,35,51,0.2)']}
            style={styles.card}
          >
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
          </LinearGradient>
        </Animated.View>

        {/* Data & Privacy */}
        <SectionHeader title="Data & Privacy" index={1} />
        <Animated.View entering={FadeInUp.delay(150).duration(400)}>
          <LinearGradient
            colors={['rgba(45,53,72,0.4)', 'rgba(28,35,51,0.2)']}
            style={styles.card}
          >
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
          </LinearGradient>
        </Animated.View>

        {/* Account Actions */}
        <SectionHeader title="Account Actions" index={2} />
        <Animated.View entering={FadeInUp.delay(250).duration(400)}>
          <LinearGradient
            colors={['rgba(45,53,72,0.4)', 'rgba(28,35,51,0.2)']}
            style={styles.card}
          >
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
          </LinearGradient>
        </Animated.View>

        <Animated.View entering={FadeInUp.delay(350).duration(400)}>
          <LinearGradient
            colors={['rgba(10,123,79,0.1)', 'rgba(200,150,62,0.05)']}
            style={styles.versionCard}
          >
            <Text style={styles.version}>Mizanly v0.1.0</Text>
          </LinearGradient>
        </Animated.View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.dark.bg },
  body: { flex: 1 },
  bodyContent: { paddingBottom: 60 },

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
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
    overflow: 'hidden', marginHorizontal: spacing.base, marginBottom: spacing.md,
  },

  row: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.md, paddingVertical: spacing.md,
  },
  rowText: { flex: 1, marginRight: spacing.md },
  rowLabel: { color: colors.text.primary, fontSize: fontSize.base },
  rowHint: { color: colors.text.tertiary, fontSize: fontSize.xs, marginTop: 2 },
  rowValue: { color: colors.text.secondary, fontSize: fontSize.sm, marginTop: 2 },
  destructive: { color: colors.error },
  divider: { height: 0.5, backgroundColor: 'rgba(255,255,255,0.06)', marginLeft: spacing.md },

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