import React from 'react';
import { View, Text, StyleSheet, FlatList, RefreshControl, Pressable } from 'react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useInfiniteQuery } from '@tanstack/react-query';
import { GlassHeader } from '@/components/ui/GlassHeader';
import { Icon } from '@/components/ui/Icon';
import { Avatar } from '@/components/ui/Avatar';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { ScreenErrorBoundary } from '@/components/ui/ScreenErrorBoundary';
import { useTranslation } from '@/hooks/useTranslation';
import { colors, spacing, fontSize, radius } from '@/theme';
import { useHaptic } from '@/hooks/useHaptic';
import { api } from '@/services/api';

export default function WaqfScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const haptic = useHaptic();

  const fundsQuery = useInfiniteQuery({
    queryKey: ['waqf-funds'],
    queryFn: async ({ pageParam }) => {
      const params = new URLSearchParams();
      if (pageParam) params.set('cursor', pageParam);
      return api.get<{ data: Array<Record<string, unknown>>; meta?: { cursor: string | null; hasMore: boolean } }>(`/waqf?${params}`);
    },
    getNextPageParam: (lastPage: { meta?: { cursor: string | null; hasMore: boolean } }) =>
      lastPage?.meta?.hasMore ? lastPage.meta.cursor : undefined,
    initialPageParam: undefined as string | undefined,
  });

  const funds = fundsQuery.data?.pages.flatMap((p) => ((p as Record<string, unknown>).data as Array<Record<string, unknown>>) || []) || [];

  const renderFund = ({ item, index }: { item: Record<string, unknown>; index: number }) => {
    const goal = item.goalAmount as number;
    const raised = item.raisedAmount as number;
    const progress = goal > 0 ? Math.min(raised / goal, 1) : 0;
    const creator = item.creator as Record<string, unknown> | undefined;

    return (
      <Animated.View entering={FadeInUp.delay(index * 60).duration(300)}>
        <View style={styles.fundCard}>
          <View style={styles.fundHeader}>
            <View style={styles.fundIconWrap}>
              <Icon name="heart" size="md" color={colors.gold} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.fundTitle}>{item.title as string}</Text>
              {creator && (
                <View style={styles.creatorRow}>
                  <Avatar uri={creator.avatarUrl as string | null} name={creator.displayName as string || ''} size="xs" />
                  <Text style={styles.creatorName}>{creator.displayName as string}</Text>
                </View>
              )}
            </View>
          </View>

          <Text style={styles.fundDesc} numberOfLines={2}>{item.description as string}</Text>

          {/* Progress bar */}
          <View style={styles.progressTrack}>
            <LinearGradient
              colors={[colors.gold, '#D4A94F']}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
              style={[styles.progressFill, { width: `${progress * 100}%` }]}
            />
          </View>
          <View style={styles.amountRow}>
            <Text style={styles.raisedAmount}>${raised.toLocaleString()}</Text>
            <Text style={styles.goalAmount}>of ${goal.toLocaleString()}</Text>
            <Text style={styles.percentText}>{Math.round(progress * 100)}%</Text>
          </View>

          <Pressable accessibilityRole="button" style={styles.contributeBtn} onPress={() => haptic.light()}>
            <LinearGradient colors={[colors.gold, '#D4A94F']} style={styles.contributeBtnGradient}>
              <Icon name="heart" size="sm" color="#FFF" />
              <Text style={styles.contributeBtnText}>Contribute</Text>
            </LinearGradient>
          </Pressable>
        </View>
      </Animated.View>
    );
  };

  return (
    <ScreenErrorBoundary>
      <View style={styles.container}>
        <GlassHeader
          title={t('community.waqfEndowments')}
          leftAction={{ icon: 'arrow-left', onPress: () => router.back() }}
        />

        {/* Info card */}
        <Animated.View entering={FadeInUp.duration(300)} style={styles.infoCard}>
          <LinearGradient colors={[colors.gold + '15', 'transparent']} style={styles.infoGradient}>
            <Icon name="heart" size="md" color={colors.gold} />
            <Text style={styles.infoText}>
              Waqf is an Islamic endowment — a permanent charitable fund where the principal is preserved and only the returns are used for good causes.
            </Text>
          </LinearGradient>
        </Animated.View>

        <FlatList
          data={funds}
          renderItem={renderFund}
          keyExtractor={(item) => item.id as string}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl refreshing={fundsQuery.isRefetching} onRefresh={() => fundsQuery.refetch()} tintColor={colors.emerald} />
          }
          onEndReached={() => fundsQuery.hasNextPage && fundsQuery.fetchNextPage()}
          ListEmptyComponent={
            fundsQuery.isLoading ? (
              <View style={styles.skeletons}>
                {[1, 2, 3].map(i => <Skeleton.Rect key={i} width="100%" height={180} borderRadius={radius.lg} />)}
              </View>
            ) : (
              <EmptyState icon="heart" title={t('community.noWaqfFunds')} subtitle={t('community.waqfHint')} />
            )
          }
        />
      </View>
    </ScreenErrorBoundary>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.dark.bg },
  infoCard: { marginHorizontal: spacing.base, marginBottom: spacing.md, borderRadius: radius.lg, overflow: 'hidden', borderWidth: 1, borderColor: colors.gold + '20' },
  infoGradient: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md, padding: spacing.base, borderRadius: radius.lg },
  infoText: { color: colors.text.secondary, fontSize: fontSize.sm, flex: 1, lineHeight: 20 },
  list: { paddingHorizontal: spacing.base, paddingBottom: spacing['2xl'] },
  skeletons: { gap: spacing.md },
  fundCard: { backgroundColor: colors.dark.bgCard, borderRadius: radius.lg, padding: spacing.base, borderWidth: 1, borderColor: colors.dark.border, marginBottom: spacing.md },
  fundHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.sm },
  fundIconWrap: { width: 44, height: 44, borderRadius: radius.full, backgroundColor: colors.gold + '15', justifyContent: 'center', alignItems: 'center' },
  fundTitle: { color: colors.text.primary, fontSize: fontSize.md, fontWeight: '600' },
  creatorRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: 2 },
  creatorName: { color: colors.text.secondary, fontSize: fontSize.xs },
  fundDesc: { color: colors.text.secondary, fontSize: fontSize.sm, marginBottom: spacing.md, lineHeight: 20 },
  progressTrack: { height: 6, backgroundColor: colors.dark.surface, borderRadius: 3, marginBottom: spacing.sm, overflow: 'hidden' },
  progressFill: { height: 6, borderRadius: 3 },
  amountRow: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.xs, marginBottom: spacing.md },
  raisedAmount: { color: colors.gold, fontSize: fontSize.md, fontWeight: '700' },
  goalAmount: { color: colors.text.tertiary, fontSize: fontSize.sm },
  percentText: { color: colors.text.secondary, fontSize: fontSize.xs, marginLeft: 'auto' },
  contributeBtn: { borderRadius: radius.md, overflow: 'hidden' },
  contributeBtnGradient: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, paddingVertical: spacing.md, borderRadius: radius.md },
  contributeBtnText: { color: '#FFF', fontSize: fontSize.base, fontWeight: '700' },
});
