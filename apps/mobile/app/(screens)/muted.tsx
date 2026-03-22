import { useState } from 'react';
import {
  View, Text, StyleSheet,
  FlatList, Alert, RefreshControl,
} from 'react-native';
import { showToast } from '@/components/ui/Toast';
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
import { mutesApi } from '@/services/api';

interface MutedUser {
  id: string;
  mutedId: string;
  muted: {
    id: string;
    username: string;
    displayName: string;
    avatarUrl?: string;
  };
}

import type { PaginatedResponse } from '@/types';
import { useTranslation } from '@/hooks/useTranslation';
import { useThemeColors } from '@/hooks/useThemeColors';
import { ScreenErrorBoundary } from '@/components/ui/ScreenErrorBoundary';

export default function MutedScreen() {
  const { t, isRTL } = useTranslation();
  const router = useRouter();
  const queryClient = useQueryClient();

  const query = useInfiniteQuery({
    queryKey: ['muted'],
    queryFn: ({ pageParam }) => mutesApi.getMuted(pageParam as string | undefined),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last: PaginatedResponse<MutedUser>) => last.meta?.hasMore ? (last.meta.cursor ?? undefined) : undefined,
  });

  const muted = query.data?.pages.flatMap((p) => p.data) ?? [];

  const [refreshing, setRefreshing] = useState(false);
  const tc = useThemeColors();
  const onRefresh = async () => {
    setRefreshing(true);
    await query.refetch();
    setRefreshing(false);
  };

  const unmuteMutation = useMutation({
    mutationFn: (userId: string) => mutesApi.unmute(userId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['muted'] }),
    onError: (err: Error) => showToast(err.message, 'error'),
  });

  if (query.isError) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: tc.bg }]} edges={['top']}>
        <GlassHeader
          title={t('screens.muted.title')}
          leftAction={{ icon: 'arrow-left', onPress: () => router.back(), accessibilityLabel: t('accessibility.goBack') }}
        />
        <EmptyState
          icon="flag"
          title={t('screens.muted.errorTitle')}
          subtitle={t('screens.muted.errorSubtitle')}
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
        title={t('screens.muted.title')}
        leftAction={{ icon: 'arrow-left', onPress: () => router.back(), accessibilityLabel: t('accessibility.goBack') }}
      />

      {query.isLoading ? (
        <View style={styles.skeletonList}>
          {Array.from({ length: 6 }).map((_, i) => (
            <View key={i} style={[styles.skeletonRow, { backgroundColor: tc.bgCard }]}>
              <Skeleton.Circle size={46} />
              <View style={{ flex: 1, gap: 6 }}>
                <Skeleton.Rect width={120} height={14} />
                <Skeleton.Rect width={80} height={11} />
              </View>
            </View>
          ))}
        </View>
      ) : (
        <FlatList
          removeClippedSubviews={true}
          data={muted}
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
            const u = item.muted;
            return (
                <Animated.View entering={FadeInUp.delay(index * 30).duration(300)}>
                  <LinearGradient
                    colors={colors.gradient.cardDark}
                    style={styles.row}
                  >
                    <Avatar uri={u.avatarUrl} name={u.displayName} size="md" />
                    <View style={styles.info}>
                      <Text style={[styles.name, { color: tc.text.primary }]}>{u.displayName}</Text>
                      <View style={styles.mutedBadge}>
                        <Icon name="volume-x" size={10} color={tc.text.tertiary} />
                        <Text style={[styles.username, { color: tc.text.secondary }]}>@{u.username}</Text>
                      </View>
                    </View>
                    <GradientButton
                      label={t('screens.muted.unmute')}
                      variant="secondary"
                      size="sm"
                      onPress={() => {
                        Alert.alert(
                          t('screens.muted.unmuteConfirmTitle', 'Unmute'),
                          t('screens.muted.unmuteConfirmMessage', `Are you sure you want to unmute @${u.username}?`),
                          [
                            { text: t('common.cancel'), style: 'cancel' },
                            { text: t('screens.muted.unmute'), style: 'destructive', onPress: () => unmuteMutation.mutate(u.id) },
                          ],
                        );
                      }}
                      loading={unmuteMutation.isPending && unmuteMutation.variables === u.id}
                      disabled={unmuteMutation.isPending && unmuteMutation.variables === u.id}
                    />
                  </LinearGradient>
                </Animated.View>
            
            );
          }}
          ListFooterComponent={() =>
            query.isFetchingNextPage ? (
              <View style={[styles.skeletonRow, { backgroundColor: tc.bgCard }]}>
                <Skeleton.Circle size={46} />
                <View style={{ flex: 1, gap: 6 }}>
                  <Skeleton.Rect width={120} height={14} />
                  <Skeleton.Rect width={80} height={11} />
                </View>
              </View>
            ) : null
          }
          ListEmptyComponent={() => (
            <EmptyState
              icon="volume-x"
              title={t('screens.muted.emptyTitle')}
              subtitle={t('screens.muted.emptySubtitle')}
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
    borderColor: colors.active.white6,
    marginBottom: spacing.sm,
  },
  info: { flex: 1 },
  name: { color: colors.text.primary, fontSize: fontSize.base, fontWeight: '600' },
  mutedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: 2,
  },
  username: { color: colors.text.secondary, fontSize: fontSize.sm },
});
