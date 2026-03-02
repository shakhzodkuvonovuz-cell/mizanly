import { View, Text, FlatList, StyleSheet, RefreshControl } from 'react-native';
import { useState, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, spacing, fontSize } from '@/theme';
import { useStore } from '@/store';
import { threadsApi } from '@/services/api';

export default function MajlisScreen() {
  const [refreshing, setRefreshing] = useState(false);
  const feedType = useStore(s => s.majlisFeedType);
  const setFeedType = useStore(s => s.setMajlisFeedType);

  const { data: threads, refetch } = useQuery({
    queryKey: ['majlis-feed', feedType],
    queryFn: () => threadsApi.getFeed(feedType),
  });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.logo}>Majlis</Text>
        <Text style={styles.headerIcon}>🔍</Text>
      </View>

      {/* Feed Tabs */}
      <View style={styles.feedTabs}>
        {(['foryou', 'following', 'trending'] as const).map(t => (
          <Text key={t} style={[styles.feedTab, feedType === t && styles.feedTabActive]}
            onPress={() => setFeedType(t)}>
            {t === 'foryou' ? 'For You' : t === 'following' ? 'Following' : 'Trending'}
          </Text>
        ))}
      </View>

      <FlatList
        data={(threads as any[]) || []}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <View style={styles.threadCard}>
            <View style={styles.threadHeader}>
              <View style={styles.threadAvatar} />
              <View style={{ flex: 1 }}>
                <View style={styles.threadNameRow}>
                  <Text style={styles.threadName}>{item.author?.displayName}</Text>
                  <Text style={styles.threadHandle}>@{item.author?.username}</Text>
                </View>
                <Text style={styles.threadContent}>{item.content}</Text>
                <View style={styles.threadActions}>
                  <Text style={styles.actionBtn}>💬 {item.replyCount}</Text>
                  <Text style={styles.actionBtn}>🔄 {item.repostCount}</Text>
                  <Text style={styles.actionBtn}>❤️ {item.likeCount}</Text>
                  <Text style={styles.actionBtn}>🔖</Text>
                  <Text style={styles.actionBtn}>📤</Text>
                </View>
              </View>
            </View>
          </View>
        )}
        ListEmptyComponent={() => (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>No threads yet</Text>
            <Text style={styles.emptyText}>Start a conversation</Text>
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
  logo: { color: colors.text.primary, fontSize: fontSize.xl, fontWeight: '700' },
  headerIcon: { fontSize: 20 },
  feedTabs: { flexDirection: 'row', justifyContent: 'center', gap: spacing.lg, paddingVertical: spacing.sm, borderBottomWidth: 0.5, borderBottomColor: colors.dark.border },
  feedTab: { color: colors.text.secondary, fontSize: fontSize.base, fontWeight: '600', paddingVertical: spacing.xs, paddingHorizontal: spacing.sm },
  feedTabActive: { color: colors.emerald, borderBottomWidth: 2, borderBottomColor: colors.emerald },
  threadCard: { borderBottomWidth: 0.5, borderBottomColor: colors.dark.border, padding: spacing.base },
  threadHeader: { flexDirection: 'row', gap: spacing.sm },
  threadAvatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.dark.surface },
  threadNameRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginBottom: 4 },
  threadName: { color: colors.text.primary, fontWeight: '700', fontSize: fontSize.base },
  threadHandle: { color: colors.text.secondary, fontSize: fontSize.sm },
  threadContent: { color: colors.text.primary, fontSize: fontSize.base, lineHeight: 22, marginBottom: spacing.sm },
  threadActions: { flexDirection: 'row', justifyContent: 'space-between', paddingTop: spacing.xs },
  actionBtn: { color: colors.text.secondary, fontSize: fontSize.sm },
  empty: { alignItems: 'center', paddingTop: 80 },
  emptyTitle: { color: colors.text.primary, fontSize: fontSize.lg, fontWeight: '600', marginBottom: spacing.sm },
  emptyText: { color: colors.text.secondary, fontSize: fontSize.base },
});
