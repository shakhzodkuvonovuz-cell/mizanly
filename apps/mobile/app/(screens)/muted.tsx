import { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  FlatList, Alert, RefreshControl,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { SafeAreaView } from 'react-native-safe-area-context';
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

interface MutedPage {
  mutes?: MutedUser[];
  items?: MutedUser[];
  meta?: { cursor?: string; hasMore: boolean };
}

export default function MutedScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();

  const query = useInfiniteQuery({
    queryKey: ['muted'],
    queryFn: ({ pageParam }) => mutesApi.getMuted(pageParam as string | undefined),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last: MutedPage) => last.meta?.hasMore ? (last.meta.cursor ?? undefined) : undefined,
  });

  const muted: MutedUser[] = query.data?.pages.flatMap((p: MutedPage) => p.mutes ?? p.items ?? []) ?? [];

  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = async () => {
    setRefreshing(true);
    await query.refetch();
    setRefreshing(false);
  };

  const unmuteMutation = useMutation({
    mutationFn: (userId: string) => mutesApi.unmute(userId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['muted'] }),
    onError: (err: Error) => Alert.alert('Error', err.message),
  });

  if (query.isError) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <GlassHeader
          title="Muted Accounts"
          leftAction={{ icon: 'arrow-left', onPress: () => router.back() }}
        />
        <EmptyState
          icon="flag"
          title="Couldn't load content"
          subtitle="Check your connection and try again"
          actionLabel="Retry"
          onAction={() => query.refetch()}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <GlassHeader
        title="Muted Accounts"
        leftAction={{ icon: 'arrow-left', onPress: () => router.back() }}
      />

      {query.isLoading ? (
        <View style={styles.skeletonList}>
          {Array.from({ length: 6 }).map((_, i) => (
            <View key={i} style={styles.skeletonRow}>
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
          renderItem={({ item }) => {
            const u = item.muted;
            return (
              <View style={styles.row}>
                <Avatar uri={u.avatarUrl} name={u.displayName} size="md" />
                <View style={styles.info}>
                  <Text style={styles.name}>{u.displayName}</Text>
                  <Text style={styles.username}>@{u.username}</Text>
                </View>
                <GradientButton
                  label="Unmute"
                  variant="secondary"
                  size="sm"
                  onPress={() => unmuteMutation.mutate(u.id)}
                  loading={unmuteMutation.isPending && unmuteMutation.variables === u.id}
                  disabled={unmuteMutation.isPending && unmuteMutation.variables === u.id}
                />
              </View>
            );
          }}
          ListFooterComponent={() =>
            query.isFetchingNextPage ? (
              <View style={styles.skeletonRow}>
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
              title="No muted accounts"
              subtitle="Muted accounts won't know they've been muted and you can unmute anytime"
            />
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.dark.bg },
  list: { paddingBottom: 40 },
  skeletonList: { padding: spacing.base, gap: spacing.md },
  skeletonRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    paddingHorizontal: spacing.base, paddingVertical: spacing.md,
  },

  row: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingHorizontal: spacing.base, paddingVertical: spacing.md,
    borderBottomWidth: 0.5, borderBottomColor: colors.dark.border,
  },
  info: { flex: 1 },
  name: { color: colors.text.primary, fontSize: fontSize.sm, fontWeight: '700' },
  username: { color: colors.text.secondary, fontSize: fontSize.xs, marginTop: 1 },
  unmuteBtn: {
    backgroundColor: colors.dark.bgElevated, borderRadius: radius.sm,
    paddingHorizontal: spacing.md, paddingVertical: spacing.xs + 1,
    minWidth: 80, alignItems: 'center',
  },
  unmuteText: { color: colors.text.primary, fontSize: fontSize.sm, fontWeight: '600' },

});
