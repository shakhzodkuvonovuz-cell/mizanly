import React, { useState } from 'react';
import { View, Text, StyleSheet, FlatList, RefreshControl, TextInput, Pressable } from 'react-native';
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
import { colors, spacing, fontSize, radius } from '@/theme';
import { useTranslation } from '@/hooks/useTranslation';
import { useHaptic } from '@/hooks/useHaptic';

// Using fetch directly since communityApi may not have boards in the client yet
const API_BASE = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000/api/v1';

export default function LocalBoardsScreen() {
  const router = useRouter();
  const { t, isRTL } = useTranslation();
  const haptic = useHaptic();
  const [search, setSearch] = useState('');

  const boardsQuery = useInfiniteQuery({
    queryKey: ['local-boards', search],
    queryFn: async ({ pageParam }) => {
      const params = new URLSearchParams();
      if (pageParam) params.set('cursor', pageParam);
      if (search) params.set('city', search);
      const res = await fetch(`${API_BASE}/boards?${params}`);
      return res.json();
    },
    getNextPageParam: (lastPage: { meta?: { cursor: string | null; hasMore: boolean } }) =>
      lastPage?.meta?.hasMore ? lastPage.meta.cursor : undefined,
    initialPageParam: undefined as string | undefined,
  });

  const boards = boardsQuery.data?.pages.flatMap((p) => ((p as Record<string, unknown>).data as Array<Record<string, unknown>>) || []) || [];

  const renderBoard = ({ item, index }: { item: Record<string, unknown>; index: number }) => (
    <Animated.View entering={FadeInUp.delay(index * 60).duration(300)}>
      <Pressable style={styles.boardCard} onPress={() => haptic.light()}>
        <LinearGradient
          colors={['rgba(10,123,79,0.08)', 'transparent']}
          style={styles.boardGradient}
        >
          <View style={styles.boardHeader}>
            <View style={styles.boardIconWrap}>
              <Icon name="map-pin" size="md" color={colors.emerald} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.boardName}>{item.name as string}</Text>
              <Text style={styles.boardLocation}>{item.city as string}, {item.country as string}</Text>
            </View>
          </View>
          {Boolean(item.description) && (
            <Text style={styles.boardDesc} numberOfLines={2}>{item.description as string}</Text>
          )}
          <View style={styles.boardStats}>
            <View style={styles.stat}>
              <Icon name="users" size="xs" color={colors.text.tertiary} />
              <Text style={styles.statText}>{item.membersCount as number} members</Text>
            </View>
            <View style={styles.stat}>
              <Icon name="layers" size="xs" color={colors.text.tertiary} />
              <Text style={styles.statText}>{item.postsCount as number} posts</Text>
            </View>
          </View>
        </LinearGradient>
      </Pressable>
    </Animated.View>
  );

  return (
    <ScreenErrorBoundary>
      <View style={styles.container}>
        <GlassHeader
          title="Local Boards"
          leftAction={{ icon: 'arrow-left', onPress: () => router.back() }}
        />

        <View style={styles.searchWrap}>
          <Icon name="search" size="sm" color={colors.text.tertiary} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search by city..."
            placeholderTextColor={colors.text.tertiary}
            value={search}
            onChangeText={setSearch}
          />
        </View>

        <FlatList
          data={boards}
          renderItem={renderBoard}
          keyExtractor={(item) => item.id as string}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl
              refreshing={boardsQuery.isRefetching}
              onRefresh={() => boardsQuery.refetch()}
              tintColor={colors.emerald}
            />
          }
          onEndReached={() => boardsQuery.hasNextPage && boardsQuery.fetchNextPage()}
          onEndReachedThreshold={0.3}
          ListEmptyComponent={
            boardsQuery.isLoading ? (
              <View style={styles.skeletons}>
                {[1, 2, 3].map(i => <Skeleton.Rect key={i} width="100%" height={120} borderRadius={radius.lg} />)}
              </View>
            ) : (
              <EmptyState icon="map-pin" title="No local boards" subtitle="Be the first to create a board for your community" />
            )
          }
        />
      </View>
    </ScreenErrorBoundary>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.dark.bg },
  searchWrap: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    marginHorizontal: spacing.base, marginBottom: spacing.md,
    backgroundColor: colors.dark.bgCard, borderRadius: radius.md,
    paddingHorizontal: spacing.md, borderWidth: 1, borderColor: colors.dark.border,
  },
  searchInput: { flex: 1, color: colors.text.primary, fontSize: fontSize.base, paddingVertical: spacing.md },
  list: { paddingHorizontal: spacing.base, paddingBottom: spacing['2xl'] },
  skeletons: { gap: spacing.md },
  boardCard: { marginBottom: spacing.md, borderRadius: radius.lg, overflow: 'hidden', borderWidth: 1, borderColor: colors.dark.border },
  boardGradient: { padding: spacing.base, borderRadius: radius.lg },
  boardHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.sm },
  boardIconWrap: { width: 44, height: 44, borderRadius: radius.full, backgroundColor: colors.emerald + '15', justifyContent: 'center', alignItems: 'center' },
  boardName: { color: colors.text.primary, fontSize: fontSize.md, fontWeight: '600' },
  boardLocation: { color: colors.text.secondary, fontSize: fontSize.sm },
  boardDesc: { color: colors.text.secondary, fontSize: fontSize.sm, marginBottom: spacing.md, lineHeight: 20 },
  boardStats: { flexDirection: 'row', gap: spacing.xl },
  stat: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  statText: { color: colors.text.tertiary, fontSize: fontSize.xs },
});
