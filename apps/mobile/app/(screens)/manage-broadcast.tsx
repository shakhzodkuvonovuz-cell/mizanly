import { useState, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable, Alert, RefreshControl } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';

import { GlassHeader } from '@/components/ui/GlassHeader';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { Avatar } from '@/components/ui/Avatar';
import { TabSelector } from '@/components/ui/TabSelector';
import { Icon } from '@/components/ui/Icon';
import { colors, spacing, fontSize, radius } from '@/theme';
import { broadcastApi, followsApi } from '@/services/api';
import type { User } from '@/types';
import { useHaptic } from '@/hooks/useHaptic';
import { ScreenErrorBoundary } from '@/components/ui/ScreenErrorBoundary';
import { useTranslation } from '@/hooks/useTranslation';
import { useThemeColors } from '@/hooks/useThemeColors';

export default function ManageBroadcastScreen() {
  const { t, isRTL } = useTranslation();
  const router = useRouter();
  const params = useLocalSearchParams<{ channelId: string }>();
  const insets = useSafeAreaInsets();
  const haptic = useHaptic();
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
      Alert.alert(t('screens.manage-broadcast.successTitle'), t('screens.manage-broadcast.promotedSuccess'));
    },
    onError: () => haptic.error(),
  });

  const demoteMutation = useMutation({
    mutationFn: (userId: string) => broadcastApi.demoteFromAdmin(params.channelId!, userId),
    onSuccess: () => {
      haptic.success();
      Alert.alert(t('screens.manage-broadcast.successTitle'), t('screens.manage-broadcast.demotedSuccess'));
    },
    onError: () => haptic.error(),
  });

  const removeMutation = useMutation({
    mutationFn: (userId: string) => broadcastApi.removeSubscriber(params.channelId!, userId),
    onSuccess: () => {
      haptic.success();
      Alert.alert(t('screens.manage-broadcast.successTitle'), t('screens.manage-broadcast.removedSuccess'));
    },
    onError: () => haptic.error(),
  });

  const handleAction = (user: User) => {
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
    <Animated.View entering={FadeInUp.delay(index * 50).duration(400)}>
      <LinearGradient
        colors={colors.gradient.cardDark}
        style={styles.row}
      >
        <LinearGradient
          colors={['rgba(10,123,79,0.2)', 'rgba(200,150,62,0.1)']}
          style={styles.iconBg}
        >
          <Icon name="user" size="sm" color={colors.emerald} />
        </LinearGradient>
        <View style={styles.info}>
          <Text style={styles.name} numberOfLines={1}>{item.displayName || item.username}</Text>
          <Text style={styles.username} numberOfLines={1}>@{item.username}</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          onPress={() => handleAction(item)}
        >
          <LinearGradient
            colors={colors.gradient.cardDark}
            style={styles.actionButton}
          >
            <Icon name="more-horizontal" size={20} color={colors.text.secondary} />
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
            <RefreshControl
              refreshing={refreshing}
              onRefresh={async () => { setRefreshing(true); await refetch(); setRefreshing(false); }}
              tintColor={colors.emerald}
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
    fontWeight: '600',
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
