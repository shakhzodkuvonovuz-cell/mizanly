import {
  View, Text, StyleSheet, TouchableOpacity, Pressable,
  FlatList, ActivityIndicator, Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Avatar } from '@/components/ui/Avatar';
import { Icon } from '@/components/ui/Icon';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import { colors, spacing, fontSize, radius } from '@/theme';
import { blocksApi } from '@/services/api';

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

export default function BlockedScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();

  const query = useInfiniteQuery({
    queryKey: ['blocked'],
    queryFn: ({ pageParam }) => blocksApi.getBlocked(pageParam as string | undefined),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last: any) => last.meta?.hasMore ? last.meta.cursor : undefined,
  });

  const blocked: BlockedUser[] = query.data?.pages.flatMap((p: any) => p.blocks ?? p.items ?? []) ?? [];

  const unblockMutation = useMutation({
    mutationFn: (userId: string) => blocksApi.unblock(userId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['blocked'] }),
    onError: (err: Error) => Alert.alert('Error', err.message),
  });

  const confirmUnblock = (item: BlockedUser) => {
    Alert.alert(
      `Unblock @${item.blocked.username}?`,
      'They will be able to see your posts and follow you again.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Unblock', onPress: () => unblockMutation.mutate(item.blocked.id) },
      ],
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={8} style={styles.backBtn}>
          <Icon name="arrow-left" size="md" color={colors.text.primary} />
        </Pressable>
        <Text style={styles.headerTitle}>Blocked Accounts</Text>
        <View style={{ width: 36 }} />
      </View>

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
          data={blocked}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          onEndReached={() => {
            if (query.hasNextPage && !query.isFetchingNextPage) query.fetchNextPage();
          }}
          onEndReachedThreshold={0.4}
          renderItem={({ item }) => {
            const u = item.blocked;
            return (
              <View style={styles.row}>
                <Avatar uri={u.avatarUrl} name={u.displayName} size="md" />
                <View style={styles.info}>
                  <Text style={styles.name}>{u.displayName}</Text>
                  <Text style={styles.username}>@{u.username}</Text>
                </View>
                <TouchableOpacity
                  style={styles.unblockBtn}
                  onPress={() => confirmUnblock(item)}
                  disabled={unblockMutation.isPending && unblockMutation.variables === u.id}
                >
                  {unblockMutation.isPending && unblockMutation.variables === u.id ? (
                    <ActivityIndicator color={colors.text.primary} size="small" />
                  ) : (
                    <Text style={styles.unblockText}>Unblock</Text>
                  )}
                </TouchableOpacity>
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
              icon="slash"
              title="No blocked accounts"
              subtitle="Accounts you block will appear here."
            />
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.dark.bg },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.base, paddingVertical: spacing.sm,
    borderBottomWidth: 0.5, borderBottomColor: colors.dark.border,
  },
  backBtn: { width: 36 },
  headerTitle: { color: colors.text.primary, fontSize: fontSize.base, fontWeight: '700' },

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
  unblockBtn: {
    backgroundColor: colors.dark.bgElevated, borderRadius: radius.sm,
    paddingHorizontal: spacing.md, paddingVertical: spacing.xs + 1,
    minWidth: 80, alignItems: 'center',
  },
  unblockText: { color: colors.text.primary, fontSize: fontSize.sm, fontWeight: '600' },

});
