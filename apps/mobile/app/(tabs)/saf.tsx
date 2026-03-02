import { View, Text, FlatList, StyleSheet, RefreshControl } from 'react-native';
import { useState, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, spacing, fontSize } from '@/theme';
import { useStore } from '@/store';
import { postsApi, storiesApi } from '@/services/api';

export default function SafScreen() {
  const [refreshing, setRefreshing] = useState(false);
  const feedType = useStore(s => s.safFeedType);
  const setFeedType = useStore(s => s.setSafFeedType);

  const { data: posts, refetch } = useQuery({
    queryKey: ['saf-feed', feedType],
    queryFn: () => postsApi.getFeed(feedType),
  });

  const { data: stories } = useQuery({
    queryKey: ['stories-feed'],
    queryFn: () => storiesApi.getFeed(),
  });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.logo}>Mizanly</Text>
        <View style={styles.headerRight}>
          <Text style={styles.headerIcon}>🔍</Text>
          <Text style={styles.headerIcon}>🔔</Text>
          <View style={styles.profileDot} />
        </View>
      </View>

      <FlatList
        data={(posts as any[]) || []}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <View style={styles.postCard}>
            <View style={styles.postHeader}>
              <View style={styles.postAvatar} />
              <View>
                <Text style={styles.postUsername}>{item.author?.username}</Text>
                <Text style={styles.postTime}>{item.createdAt}</Text>
              </View>
            </View>
            {item.caption && <Text style={styles.postCaption}>{item.caption}</Text>}
            <View style={styles.postActions}>
              <Text style={styles.actionBtn}>❤️ {item.likeCount}</Text>
              <Text style={styles.actionBtn}>💬 {item.commentCount}</Text>
              <Text style={styles.actionBtn}>📤</Text>
              <Text style={styles.actionBtn}>🔖</Text>
            </View>
          </View>
        )}
        ListHeaderComponent={() => (
          <View>
            {/* Stories Row placeholder */}
            <View style={styles.storiesRow}>
              <Text style={styles.storiesPlaceholder}>Stories</Text>
            </View>
            {/* Feed Tabs */}
            <View style={styles.feedTabs}>
              <Text style={[styles.feedTab, feedType === 'following' && styles.feedTabActive]}
                onPress={() => setFeedType('following')}>Following</Text>
              <Text style={[styles.feedTab, feedType === 'foryou' && styles.feedTabActive]}
                onPress={() => setFeedType('foryou')}>For You</Text>
            </View>
          </View>
        )}
        ListEmptyComponent={() => (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>No posts yet</Text>
            <Text style={styles.emptyText}>Follow people to fill your feed</Text>
          </View>
        )}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.emerald} />}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.dark.bg },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: spacing.base, paddingVertical: spacing.sm },
  logo: { color: colors.emerald, fontSize: fontSize.xl, fontWeight: '700' },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  headerIcon: { fontSize: 20 },
  profileDot: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.dark.surface },
  storiesRow: { height: 90, borderBottomWidth: 0.5, borderBottomColor: colors.dark.border, justifyContent: 'center', paddingHorizontal: spacing.base },
  storiesPlaceholder: { color: colors.text.secondary, fontSize: fontSize.sm },
  feedTabs: { flexDirection: 'row', justifyContent: 'center', gap: spacing.xl, paddingVertical: spacing.md, borderBottomWidth: 0.5, borderBottomColor: colors.dark.border },
  feedTab: { color: colors.text.secondary, fontSize: fontSize.base, fontWeight: '600', paddingVertical: spacing.xs, paddingHorizontal: spacing.md },
  feedTabActive: { color: colors.emerald, borderBottomWidth: 2, borderBottomColor: colors.emerald },
  postCard: { borderBottomWidth: 0.5, borderBottomColor: colors.dark.border, padding: spacing.base },
  postHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm },
  postAvatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.dark.surface },
  postUsername: { color: colors.text.primary, fontWeight: '600', fontSize: fontSize.base },
  postTime: { color: colors.text.secondary, fontSize: fontSize.xs },
  postCaption: { color: colors.text.primary, fontSize: fontSize.base, lineHeight: 22, marginBottom: spacing.sm },
  postActions: { flexDirection: 'row', justifyContent: 'space-between', paddingTop: spacing.sm },
  actionBtn: { color: colors.text.secondary, fontSize: fontSize.base },
  empty: { alignItems: 'center', paddingTop: 80 },
  emptyTitle: { color: colors.text.primary, fontSize: fontSize.lg, fontWeight: '600', marginBottom: spacing.sm },
  emptyText: { color: colors.text.secondary, fontSize: fontSize.base },
});
