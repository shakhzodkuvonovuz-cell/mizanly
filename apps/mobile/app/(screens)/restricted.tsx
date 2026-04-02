import { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { Avatar } from '@/components/ui/Avatar';
import { Icon } from '@/components/ui/Icon';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import { GlassHeader } from '@/components/ui/GlassHeader';
import { GradientButton } from '@/components/ui/GradientButton';
import { ScreenErrorBoundary } from '@/components/ui/ScreenErrorBoundary';
import { colors, spacing, fontSize, radius, fonts } from '@/theme';
import { restrictsApi } from '@/services/api';
import { showToast } from '@/components/ui/Toast';
import { useTranslation } from '@/hooks/useTranslation';
import { useThemeColors } from '@/hooks/useThemeColors';
import { useContextualHaptic } from '@/hooks/useContextualHaptic';
import { BrandedRefreshControl } from '@/components/ui/BrandedRefreshControl';

interface RestrictedUser {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
}

interface RestrictedPage {
  data: RestrictedUser[];
  meta: { hasMore: boolean; cursor?: string };
}

export default function RestrictedScreen() {
  const tc = useThemeColors();
  const styles = createStyles(tc);
  const router = useRouter();
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  const haptic = useContextualHaptic();

  const query = useInfiniteQuery({
    queryKey: ['restricted'],
    queryFn: ({ pageParam }) =>
      restrictsApi.getRestricted(pageParam as string | undefined),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last: RestrictedPage) =>
      last.meta?.hasMore ? (last.meta.cursor ?? undefined) : undefined,
    staleTime: 30_000,
  });

  const restricted = query.data?.pages.flatMap((p) => p.data) ?? [];

  const unrestrictMutation = useMutation({
    mutationFn: (userId: string) => restrictsApi.unrestrict(userId),
    onSuccess: () => {
      haptic.success();
      showToast({ message: t('screens.restricted.unrestrictSuccess', 'User unrestricted'), variant: 'success' });
      queryClient.invalidateQueries({ queryKey: ['restricted'] });
    },
    onError: (err: Error) => {
      haptic.error();
      showToast({ message: t('common.somethingWentWrong'), variant: 'error' });
    },
  });

  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = async () => {
    setRefreshing(true);
    await query.refetch();
    setRefreshing(false);
  };

  const confirmUnrestrict = (user: RestrictedUser) => {
    haptic.tick();
    Alert.alert(
      t('screens.restricted.unrestrict'),
      t('screens.restricted.unrestrictConfirm', `Are you sure you want to unrestrict @${user.username}?`),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('screens.restricted.unrestrict'),
          onPress: () => unrestrictMutation.mutate(user.id),
        },
      ],
    );
  };

  if (query.isError) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <GlassHeader
          title={t('screens.restricted.title')}
          leftAction={{
            icon: 'arrow-left',
            onPress: () => router.back(),
            accessibilityLabel: t('common.back'),
          }}
        />
        <EmptyState
          icon="flag"
          title={t('screens.restricted.errorTitle')}
          subtitle={t('screens.restricted.errorSubtitle')}
          actionLabel={t('common.retry')}
          onAction={() => query.refetch()}
        />
      </SafeAreaView>
    );
  }

  return (
    <ScreenErrorBoundary>
      <SafeAreaView style={styles.container} edges={['top']}>
        <GlassHeader
          title={t('screens.restricted.title')}
          leftAction={{
            icon: 'arrow-left',
            onPress: () => router.back(),
            accessibilityLabel: t('common.back'),
          }}
        />

        <Text style={[styles.infoText, { color: tc.text.secondary }]}>{t('screens.restricted.info')}</Text>

        {query.isLoading ? (
          <View style={styles.skeletonList}>
            {Array.from({ length: 6 }).map((_, i) => (
              <View key={i} style={styles.skeletonRow}>
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
            removeClippedSubviews
            data={restricted}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.list}
            onEndReached={() => {
              if (query.hasNextPage && !query.isFetchingNextPage) {
                query.fetchNextPage();
              }
            }}
            onEndReachedThreshold={0.4}
            refreshControl={
              <BrandedRefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
              />
            }
            renderItem={({ item, index }) => (
              <Animated.View entering={FadeInUp.delay(Math.min(index, 10) * 30).duration(300)}>
                <View style={styles.row}>
                  <Avatar
                    uri={item.avatarUrl}
                    name={item.displayName}
                    size="md"
                  />
                  <View style={styles.info}>
                    <Text style={[styles.name, { color: tc.text.primary }]}>{item.displayName}</Text>
                    <View style={styles.usernameBadge}>
                      <Icon name="eye-off" size={10} color={colors.gold} />
                      <Text style={[styles.username, { color: tc.text.secondary }]}>@{item.username}</Text>
                    </View>
                  </View>
                  <GradientButton
                    label={t('screens.restricted.unrestrict')}
                    variant="ghost"
                    size="sm"
                    onPress={() => confirmUnrestrict(item)}
                    loading={
                      unrestrictMutation.isPending &&
                      unrestrictMutation.variables === item.id
                    }
                    disabled={
                      unrestrictMutation.isPending &&
                      unrestrictMutation.variables === item.id
                    }
                    accessibilityLabel={t('screens.restricted.unrestrict')}
                    accessibilityRole="button"
                  />
                </View>
              </Animated.View>
            )}
            ListFooterComponent={() =>
              query.isFetchingNextPage ? (
                <View style={styles.skeletonRow}>
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
                icon="eye-off"
                title={t('screens.restricted.emptyTitle')}
                subtitle={t('screens.restricted.emptySubtitle')}
              />
            )}
          />
        )}
      </SafeAreaView>
    </ScreenErrorBoundary>
  );
}

const createStyles = (tc: ReturnType<typeof useThemeColors>) => StyleSheet.create({
  container: { flex: 1, backgroundColor: tc.bg },
  infoText: {
    fontSize: fontSize.sm,
    fontFamily: fonts.body,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
    lineHeight: 18,
  },
  list: { padding: spacing.base, gap: spacing.sm, paddingBottom: 40 },
  skeletonList: { padding: spacing.base, gap: spacing.md },
  skeletonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    backgroundColor: tc.bgCard,
    borderRadius: radius.lg,
    borderWidth: 0.5,
    borderColor: colors.active.white6,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    backgroundColor: tc.bgCard,
    borderRadius: radius.lg,
    borderWidth: 0.5,
    borderColor: colors.active.gold15,
    marginBottom: spacing.sm,
  },
  info: { flex: 1 },
  name: {
    fontSize: fontSize.base,
    fontFamily: fonts.bodySemiBold,
  },
  usernameBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: 2,
  },
  username: {
    fontSize: fontSize.sm,
    fontFamily: fonts.body,
  },
});
