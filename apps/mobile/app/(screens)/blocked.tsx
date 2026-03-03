import {
  View, Text, StyleSheet, TouchableOpacity,
  FlatList, ActivityIndicator, Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { colors, spacing, fontSize } from '@/theme';
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
        <TouchableOpacity onPress={() => router.back()} hitSlop={8} style={styles.backBtn}>
          <Text style={styles.backIcon}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Blocked Accounts</Text>
        <View style={{ width: 36 }} />
      </View>

      {query.isLoading ? (
        <ActivityIndicator color={colors.emerald} style={styles.loader} />
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
                {u.avatarUrl ? (
                  <Image source={{ uri: u.avatarUrl }} style={styles.avatar} contentFit="cover" />
                ) : (
                  <View style={[styles.avatar, styles.avatarFallback]}>
                    <Text style={styles.avatarLetter}>{u.displayName[0]?.toUpperCase()}</Text>
                  </View>
                )}
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
              <ActivityIndicator color={colors.emerald} style={{ paddingVertical: spacing.xl }} />
            ) : null
          }
          ListEmptyComponent={() => (
            <View style={styles.empty}>
              <Text style={styles.emptyIcon}>🚫</Text>
              <Text style={styles.emptyTitle}>No blocked accounts</Text>
              <Text style={styles.emptyText}>
                Accounts you block will appear here.
              </Text>
            </View>
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
  backIcon: { color: colors.text.primary, fontSize: 22 },
  headerTitle: { color: colors.text.primary, fontSize: fontSize.base, fontWeight: '700' },

  loader: { marginTop: 60 },
  list: { paddingBottom: 40 },

  row: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingHorizontal: spacing.base, paddingVertical: spacing.md,
    borderBottomWidth: 0.5, borderBottomColor: colors.dark.border,
  },
  avatar: { width: 46, height: 46, borderRadius: 23 },
  avatarFallback: { backgroundColor: colors.dark.surface, alignItems: 'center', justifyContent: 'center' },
  avatarLetter: { color: colors.text.primary, fontSize: fontSize.lg, fontWeight: '700' },
  info: { flex: 1 },
  name: { color: colors.text.primary, fontSize: fontSize.sm, fontWeight: '700' },
  username: { color: colors.text.secondary, fontSize: fontSize.xs, marginTop: 1 },
  unblockBtn: {
    backgroundColor: colors.dark.bgElevated, borderRadius: 8,
    paddingHorizontal: spacing.md, paddingVertical: spacing.xs + 1,
    minWidth: 80, alignItems: 'center',
  },
  unblockText: { color: colors.text.primary, fontSize: fontSize.sm, fontWeight: '600' },

  empty: { alignItems: 'center', paddingTop: 80, gap: spacing.md, paddingHorizontal: spacing.xl },
  emptyIcon: { fontSize: 48 },
  emptyTitle: { color: colors.text.primary, fontSize: fontSize.lg, fontWeight: '700' },
  emptyText: { color: colors.text.secondary, fontSize: fontSize.base, textAlign: 'center' },
});
