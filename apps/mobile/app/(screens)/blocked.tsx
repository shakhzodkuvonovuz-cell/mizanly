import { useState } from 'react';
import {
  View, Text, StyleSheet,
  FlatList, Alert, RefreshControl,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { Avatar } from '@/components/ui/Avatar';
import { Icon } from '@/components/ui/Icon';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import { GlassHeader } from '@/components/ui/GlassHeader';
import { GradientButton } from '@/components/ui/GradientButton';
import { colors, spacing, fontSize, radius } from '@/theme';
import { blocksApi } from '@/services/api';
import { useTranslation } from '@/hooks/useTranslation';
import { useThemeColors } from '@/hooks/useThemeColors';

interface BlockedUser {
  id: string;
  blockedId: string;
  blocked: {
    id: string;
    username: string;
    displayName: string;
    avatarUrl?: string;
  };
}

import type { PaginatedResponse } from '@/types';
import { ScreenErrorBoundary } from '@/components/ui/ScreenErrorBoundary';
import { showToast } from '@/components/ui/Toast';

export default function BlockedScreen() {
  const router = useRouter();
  const tc = useThemeColors();
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  const query = useInfiniteQuery({
    queryKey: ['blocked'],
    queryFn: ({ pageParam }) => blocksApi.getBlocked(pageParam as string | undefined),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last: PaginatedResponse<BlockedUser>) => last.meta?.hasMore ? (last.meta.cursor ?? undefined) : undefined,
  });

  const blocked = query.data?.pages.flatMap((p) => p.data) ?? [];

  const unblockMutation = useMutation({
    mutationFn: (userId: string) => blocksApi.unblock(userId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['blocked'] }),
    onError: (err: Error) => showToast({ message: err.message, variant: 'error' }),
  });

  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = async () => {
    setRefreshing(true);
    await query.refetch();
    setRefreshing(false);
  };

  const confirmUnblock = (item: BlockedUser) => {
    Alert.alert(
      t('screens.blocked.unblockAlertTitle', { username: item.blocked.username }),
      t('screens.blocked.unblockAlertMessage'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('screens.blocked.unblockButton'), onPress: () => unblockMutation.mutate(item.blocked.id) },
      ],
    );
  };

  if (query.isError) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: tc.bg }]} edges={['top']}>
        <GlassHeader
          title={t('screens.blocked.title')}
          leftAction={{ icon: 'arrow-left', onPress: () => router.back(), accessibilityLabel: t('common.back') }}
        />
        <EmptyState
          icon="flag"
          title={t('screens.blocked.errorTitle')}
          subtitle={t('screens.blocked.errorSubtitle')}
          actionLabel={t('common.retry')}
          onAction={() => query.refetch()}
        />
      </SafeAreaView>
    );
  }

  return (
    <ScreenErrorBoundary>
    <SafeAreaView style={[styles.container, { backgroundColor: tc.bg }]} edges={['top']}>
      <GlassHeader
        title={t('screens.blocked.title')}
        leftAction={{ icon: 'arrow-left', onPress: () => router.back(), accessibilityLabel: t('common.back') }}
      />

      {query.isLoading ? (
        <View style={styles.skeletonList}>
          {Array.from({ length: 6 }).map((_, i) => (
            <View key={i} style={[styles.skeletonRow, { backgroundColor: tc.bgCard }]}>
              <Skeleton.Circle size={46} />
              <View style={{ flex: 1, gap: spacing.sm }}>
                <Skeleton.Rect width={120} height={14} />
                <Skeleton.Rect width={80} height={11} />
              </View>
            </View>
          ))}
        </View>
      ) : (
        <FlatList
          removeClippedSubviews={true}
          data={blocked}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          onEndReached={() => {
            if (query.hasNextPage && !query.isFetchingNextPage) query.fetchNextPage();
          }}
          onEndReachedThreshold={0.4}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.emerald} />
          }
          renderItem={({ item, index }) => {
            const u = item.blocked;
            return (
                <Animated.View entering={FadeInUp.delay(index * 30).duration(300)}>
                  <LinearGradient
                    colors={['rgba(248,81,73,0.08)', 'rgba(248,81,73,0.02)']}
                    style={styles.row}
                  >
                    <Avatar uri={u.avatarUrl} name={u.displayName} size="md" showRing ringColor={colors.error} />
                    <View style={styles.info}>
                      <Text style={[styles.name, { color: tc.text.primary }]}>{u.displayName}</Text>
                      <View style={styles.blockedBadge}>
                        <Icon name="slash" size={10} color={colors.error} />
                        <Text style={[styles.username, { color: tc.text.secondary }]}>@{u.username}</Text>
                      </View>
                    </View>
                    <GradientButton
                      label={t('screens.blocked.unblockButton')}
                      variant="primary"
                      size="sm"
                      onPress={() => confirmUnblock(item)}
                      loading={unblockMutation.isPending && unblockMutation.variables === u.id}
                      disabled={unblockMutation.isPending && unblockMutation.variables === u.id}
                      accessibilityLabel={t('screens.blocked.unblockUser', { name: u.displayName })}
                      accessibilityRole="button"
                    />
                  </LinearGradient>
                </Animated.View>
            
            );
          }}
          ListFooterComponent={() =>
            query.isFetchingNextPage ? (
              <View style={[styles.skeletonRow, { backgroundColor: tc.bgCard }]}>
                <Skeleton.Circle size={46} />
                <View style={{ flex: 1, gap: spacing.sm }}>
                  <Skeleton.Rect width={120} height={14} />
                  <Skeleton.Rect width={80} height={11} />
                </View>
              </View>
            ) : null
          }
          ListEmptyComponent={() => (
            <EmptyState
              icon="slash"
              title={t('screens.blocked.emptyTitle')}
              subtitle={t('screens.blocked.emptySubtitle')}
            />
          )}
        />
      )}
    </SafeAreaView>
    </ScreenErrorBoundary>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.dark.bg },
  list: { padding: spacing.base, gap: spacing.sm, paddingBottom: 40 },
  skeletonList: { padding: spacing.base, gap: spacing.md },
  skeletonRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    padding: spacing.md,
    backgroundColor: colors.dark.bgCard,
    borderRadius: radius.lg,
    borderWidth: 0.5,
    borderColor: colors.active.white6,
  },

  row: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 0.5,
    borderColor: 'rgba(248,81,73,0.2)',
    marginBottom: spacing.sm,
  },
  info: { flex: 1 },
  name: { color: colors.text.primary, fontSize: fontSize.base, fontWeight: '600' },
  blockedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: 2,
  },
  username: { color: colors.text.secondary, fontSize: fontSize.sm },
});
