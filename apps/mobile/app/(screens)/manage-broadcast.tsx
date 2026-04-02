import { useState, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable, Alert } from 'react-native';
import { showToast } from '@/components/ui/Toast';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';

import { BrandedRefreshControl } from '@/components/ui/BrandedRefreshControl';
import { GlassHeader } from '@/components/ui/GlassHeader';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { Avatar } from '@/components/ui/Avatar';
import { TabSelector } from '@/components/ui/TabSelector';
import { Icon } from '@/components/ui/Icon';
import { colors, spacing, fontSize, radius, fonts } from '@/theme';
import { broadcastApi, followsApi } from '@/services/api';
import type { User } from '@/types';
import { useContextualHaptic } from '@/hooks/useContextualHaptic';
import { ScreenErrorBoundary } from '@/components/ui/ScreenErrorBoundary';
import { useTranslation } from '@/hooks/useTranslation';
import { useThemeColors } from '@/hooks/useThemeColors';

export default function ManageBroadcastScreen() {
  const { t, isRTL } = useTranslation();
  const router = useRouter();
  const params = useLocalSearchParams<{ channelId: string }>();
  const insets = useSafeAreaInsets();
  const haptic = useContextualHaptic();
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState<'subscribers' | 'admins'>('subscribers');
  const [refreshing, setRefreshing] = useState(false);
  const tc = useThemeColors();

  const { data: channel, isLoading: isChannelLoading, isError: isChannelError } = useQuery({
    queryKey: ['broadcast-channel', params.channelId],
    queryFn: () => broadcastApi.getById(params.channelId!),
    enabled: !!params.channelId,
  });

  // Since there is no `broadcastApi.getSubscribers` currently in api.ts,
  // we simulate the list by fetching followers for demonstration of the UI and mutations.
  // In a real app, this would use the explicit endpoint.
  const { data: usersData, isLoading: isUsersLoading, refetch } = useQuery({
    queryKey: ['simulated-subscribers', channel?.userId],
    queryFn: () => followsApi.getFollowers(channel?.userId || ''),
    enabled: !!channel?.userId,
  });

  const users = usersData?.data || [];

  const promoteMutation = useMutation({
    mutationFn: (userId: string) => broadcastApi.promoteToAdmin(params.channelId!, userId),
    onSuccess: () => {
      haptic.success();
      showToast({ message: t('screens.manage-broadcast.promotedSuccess'), variant: 'success' });
      queryClient.invalidateQueries({ queryKey: ['simulated-subscribers'] });
      queryClient.invalidateQueries({ queryKey: ['broadcast-channel', params.channelId] });
    },
    onError: () => {
      haptic.error();
      showToast({ message: t('common.somethingWentWrong'), variant: 'error' });
    },
  });

  const demoteMutation = useMutation({
    mutationFn: (userId: string) => broadcastApi.demoteFromAdmin(params.channelId!, userId),
    onSuccess: () => {
      haptic.success();
      showToast({ message: t('screens.manage-broadcast.demotedSuccess'), variant: 'success' });
      queryClient.invalidateQueries({ queryKey: ['simulated-subscribers'] });
      queryClient.invalidateQueries({ queryKey: ['broadcast-channel', params.channelId] });
    },
    onError: () => {
      haptic.error();
      showToast({ message: t('common.somethingWentWrong'), variant: 'error' });
    },
  });

  const removeMutation = useMutation({
    mutationFn: (userId: string) => broadcastApi.removeSubscriber(params.channelId!, userId),
    onSuccess: () => {
      haptic.success();
      showToast({ message: t('screens.manage-broadcast.removedSuccess'), variant: 'success' });
      queryClient.invalidateQueries({ queryKey: ['simulated-subscribers'] });
      queryClient.invalidateQueries({ queryKey: ['broadcast-channel', params.channelId] });
    },
    onError: () => {
      haptic.error();
      showToast({ message: t('common.somethingWentWrong'), variant: 'error' });
    },
  });

  const handleAction = (user: User) => {
    if (promoteMutation.isPending || demoteMutation.isPending || removeMutation.isPending) return;
    haptic.tick();
    if (activeTab === 'subscribers') {
      Alert.alert(
        t('screens.manage-broadcast.manageSubscriber'),
        t('screens.manage-broadcast.manage', { name: user.displayName || user.username }),
        [
          { text: t('common.cancel'), style: 'cancel' },
          { text: t('screens.manage-broadcast.makeAdmin'), onPress: () => promoteMutation.mutate(user.id) },
          { text: t('common.remove'), style: 'destructive', onPress: () => removeMutation.mutate(user.id) },
        ]
      );
    } else {
      Alert.alert(
        t('screens.manage-broadcast.manageAdmin'),
        t('screens.manage-broadcast.manage', { name: user.displayName || user.username }),
        [
          { text: t('common.cancel'), style: 'cancel' },
          { text: t('screens.manage-broadcast.demoteToSubscriber'), onPress: () => demoteMutation.mutate(user.id) },
        ]
      );
    }
  };

  if (isChannelError || !params.channelId) {
    return (
      <View style={[styles.container, { backgroundColor: tc.bg }]}>
        <GlassHeader
          title={t('screens.manage-broadcast.title')}
          leftAction={{ icon: 'arrow-left', onPress: () => router.back(), accessibilityLabel: t('common.back') }}
        />
        <View style={{ height: insets.top + 52 }} />
        <EmptyState
          icon="flag"
          title={t('screens.manage-broadcast.errorTitle')}
          subtitle={t('screens.manage-broadcast.errorSubtitle')}
          actionLabel={t('common.back')}
          onAction={() => router.back()}
        />
      </View>
    );
  }

  if (isChannelLoading && !channel) {
    return (
      <View style={[styles.container, { backgroundColor: tc.bg }]}>
        <GlassHeader
          title={t('screens.manage-broadcast.title')}
          leftAction={{ icon: 'arrow-left', onPress: () => router.back(), accessibilityLabel: t('common.back') }}
        />
        <View style={{ height: insets.top + 52 }} />
        <View style={{ padding: spacing.base, gap: spacing.md }}>
          <Skeleton.Rect width="100%" height={60} borderRadius={radius.md} />
          <Skeleton.Rect width="100%" height={60} borderRadius={radius.md} />
        </View>
      </View>
    );
  }

  const renderItem = ({ item, index }: { item: User; index: number }) => (
    <Animated.View entering={FadeInUp.delay(Math.min(index * 50, 300)).duration(400)}>
      <LinearGradient
        colors={colors.gradient.cardDark}
        style={styles.row}
      >
        <Avatar uri={item.avatarUrl ?? null} name={item.displayName || item.username || ''} size="md" />
        <View style={styles.info}>
          <Text style={[styles.name, { color: tc.text.primary }]} numberOfLines={1}>{item.displayName || item.username}</Text>
          <Text style={[styles.username, { color: tc.text.secondary }]} numberOfLines={1}>@{item.username}</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('screens.manage-broadcast.manageSubscriber')}
          onPress={() => handleAction(item)}
        >
          <LinearGradient
            colors={colors.gradient.cardDark}
            style={styles.actionButton}
          >
            <Icon name="more-horizontal" size={20} color={tc.text.secondary} />
          </LinearGradient>
        </Pressable>
      </LinearGradient>
    </Animated.View>
  );

  return (
    <ScreenErrorBoundary>
      <View style={[styles.container, { backgroundColor: tc.bg }]}>
        <GlassHeader
          title={channel ? t('screens.manage-broadcast.manageChannel', { name: channel.name }) : t('screens.manage-broadcast.title')}
          leftAction={{ icon: 'arrow-left', onPress: () => router.back(), accessibilityLabel: t('common.back') }}
        />
      
        <View style={[styles.tabsWrap, { backgroundColor: tc.bg }, { marginTop: insets.top + 52 }]}>
          <TabSelector 
            tabs={[
              { key: 'subscribers', label: `${t('screens.manage-broadcast.subscribers')} (${channel?.subscribersCount || 0})` },
              { key: 'admins', label: t('screens.manage-broadcast.admins') },
            ]}
            activeKey={activeTab}
            onTabChange={(key) => setActiveTab(key as 'subscribers' | 'admins')}
          />
        </View>

        <FlatList
          data={users}
          renderItem={renderItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          removeClippedSubviews={true}
          refreshControl={
            <BrandedRefreshControl
              refreshing={refreshing}
              onRefresh={async () => { setRefreshing(true); haptic.navigate(); await refetch(); setRefreshing(false); }}
            />
          }
          ListEmptyComponent={
            isUsersLoading ? (
              <View style={{ padding: spacing.base, gap: spacing.md }}>
                <Skeleton.Rect width="100%" height={60} borderRadius={radius.md} />
                <Skeleton.Rect width="100%" height={60} borderRadius={radius.md} />
              </View>
            ) : (
              <View style={styles.emptyWrap}>
                <EmptyState
                  icon="users"
                  title={activeTab === 'subscribers' ? t('screens.manage-broadcast.emptySubscribers') : t('screens.manage-broadcast.emptyAdmins')}
                  subtitle={activeTab === 'subscribers' ? t('screens.manage-broadcast.emptySubscribersSubtitle') : t('screens.manage-broadcast.emptyAdminsSubtitle')}
                />
              </View>
            )
          }
        />
      </View>
  
    </ScreenErrorBoundary>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.dark.bg
  },
  tabsWrap: {
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    backgroundColor: colors.dark.bg,
    zIndex: 1,
  },
  listContent: {
    paddingBottom: spacing['2xl'],
    paddingHorizontal: spacing.base,
    gap: spacing.sm,
    paddingTop: spacing.md,
  },
  emptyWrap: {
    marginTop: spacing['2xl'],
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.active.white6,
    gap: spacing.md,
  },
  iconBg: {
    width: 40,
    height: 40,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  info: {
    flex: 1,
    justifyContent: 'center',
    gap: 2,
  },
  name: {
    fontSize: fontSize.base,
    fontFamily: fonts.semibold,
    color: colors.text.primary,
  },
  username: {
    fontSize: fontSize.sm,
    color: colors.text.secondary,
  },
  actionButton: {
    padding: spacing.xs,
    borderRadius: radius.md,
  },
});
