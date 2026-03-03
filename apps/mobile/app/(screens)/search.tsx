import { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  FlatList, ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Avatar } from '@/components/ui/Avatar';
import { colors, spacing, fontSize } from '@/theme';
import { searchApi } from '@/services/api';
import type { User } from '@/types';

function useDebounce<T>(value: T, delay: number): T {
  const [d, setD] = useState(value);
  const [timer, setTimer] = useState<ReturnType<typeof setTimeout> | null>(null);
  const set = useCallback((v: T) => {
    if (timer) clearTimeout(timer);
    setTimer(setTimeout(() => setD(v), delay));
  }, [delay]);
  // synchronize
  if (d !== value) set(value);
  return d;
}

function UserRow({ user, onPress }: { user: User; onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.userRow} onPress={onPress} activeOpacity={0.7}>
      <Avatar uri={user.avatarUrl} name={user.displayName} size="md" />
      <View style={styles.userInfo}>
        <View style={styles.userNameRow}>
          <Text style={styles.userName}>{user.displayName}</Text>
          {user.isVerified && <Text style={styles.verified}>✓</Text>}
        </View>
        <Text style={styles.userHandle}>@{user.username}</Text>
        {user._count && (
          <Text style={styles.userFollowers}>{user._count.followers} followers</Text>
        )}
      </View>
      {user.isFollowing ? (
        <Text style={styles.followingLabel}>Following</Text>
      ) : null}
    </TouchableOpacity>
  );
}

export default function SearchScreen() {
  const router = useRouter();
  const [query, setQuery] = useState('');

  // Simple debounce via useMemo pattern
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [debounceTimer, setDebounceTimer] = useState<ReturnType<typeof setTimeout> | null>(null);

  const handleQueryChange = (text: string) => {
    setQuery(text);
    if (debounceTimer) clearTimeout(debounceTimer);
    const t = setTimeout(() => setDebouncedQuery(text), 400);
    setDebounceTimer(t);
  };

  const searchQuery = useQuery({
    queryKey: ['search', debouncedQuery],
    queryFn: () => searchApi.search(debouncedQuery),
    enabled: debouncedQuery.trim().length >= 2,
  });

  const trendingQuery = useQuery({
    queryKey: ['trending'],
    queryFn: () => searchApi.trending(),
    enabled: debouncedQuery.trim().length < 2,
  });

  const people: User[] = searchQuery.data?.people ?? [];
  const hashtags = searchQuery.data?.hashtags ?? [];

  const isSearching = debouncedQuery.trim().length >= 2;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={8} style={styles.backBtn}>
          <Text style={styles.backIcon}>←</Text>
        </TouchableOpacity>
        <View style={styles.searchBox}>
          <Text style={styles.searchIcon}>🔍</Text>
          <TextInput
            style={styles.searchInput}
            placeholder="Search people, hashtags…"
            placeholderTextColor={colors.text.tertiary}
            value={query}
            onChangeText={handleQueryChange}
            autoFocus
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
          />
          {query.length > 0 && (
            <TouchableOpacity onPress={() => { setQuery(''); setDebouncedQuery(''); }} hitSlop={8}>
              <Text style={styles.clearIcon}>✕</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {searchQuery.isLoading ? (
        <ActivityIndicator color={colors.emerald} style={styles.loader} />
      ) : isSearching ? (
        <FlatList
          data={[...people.map((p) => ({ type: 'user' as const, data: p })),
                 ...hashtags.map((h) => ({ type: 'hashtag' as const, data: h }))]}
          keyExtractor={(item, i) =>
            item.type === 'user' ? item.data.id : `ht-${i}`
          }
          renderItem={({ item }) => {
            if (item.type === 'user') {
              return (
                <UserRow
                  user={item.data}
                  onPress={() => router.push(`/(screens)/profile/${item.data.username}`)}
                />
              );
            }
            return (
              <TouchableOpacity
                style={styles.hashtagRow}
                onPress={() => router.push(`/(screens)/hashtag/${item.data.name}`)}
                activeOpacity={0.7}
              >
                <Text style={styles.hashtagName}>#{item.data.name}</Text>
                <Text style={styles.hashtagCount}>{item.data.postsCount} posts</Text>
              </TouchableOpacity>
            );
          }}
          ListEmptyComponent={() => (
            <View style={styles.empty}>
              <Text style={styles.emptyText}>No results for "{debouncedQuery}"</Text>
            </View>
          )}
          contentContainerStyle={{ paddingBottom: 40 }}
        />
      ) : (
        <View style={styles.discoverHint}>
          <Text style={styles.discoverTitle}>Discover</Text>
          <Text style={styles.discoverSub}>Search for people and topics</Text>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.dark.bg },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: spacing.base, paddingVertical: spacing.sm, gap: spacing.sm,
    borderBottomWidth: 0.5, borderBottomColor: colors.dark.border,
  },
  backBtn: { width: 36 },
  backIcon: { color: colors.text.primary, fontSize: 22 },
  searchBox: {
    flex: 1, flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.dark.bgElevated, borderRadius: 12,
    paddingHorizontal: spacing.sm, gap: spacing.xs,
  },
  searchIcon: { fontSize: 16 },
  searchInput: {
    flex: 1, color: colors.text.primary, fontSize: fontSize.base,
    paddingVertical: spacing.sm,
  },
  clearIcon: { color: colors.text.secondary, fontSize: fontSize.sm, padding: 4 },
  loader: { marginTop: 60 },

  // User row
  userRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    paddingHorizontal: spacing.base, paddingVertical: spacing.md,
    borderBottomWidth: 0.5, borderBottomColor: colors.dark.border,
  },
  userInfo: { flex: 1 },
  userNameRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  userName: { color: colors.text.primary, fontSize: fontSize.base, fontWeight: '700' },
  verified: { color: colors.emerald, fontSize: fontSize.xs },
  userHandle: { color: colors.text.secondary, fontSize: fontSize.sm, marginTop: 1 },
  userFollowers: { color: colors.text.tertiary, fontSize: fontSize.xs, marginTop: 2 },
  followingLabel: { color: colors.text.secondary, fontSize: fontSize.xs, fontWeight: '600' },

  // Hashtag row
  hashtagRow: {
    paddingHorizontal: spacing.base, paddingVertical: spacing.md,
    borderBottomWidth: 0.5, borderBottomColor: colors.dark.border,
  },
  hashtagName: { color: colors.text.primary, fontSize: fontSize.base, fontWeight: '700' },
  hashtagCount: { color: colors.text.secondary, fontSize: fontSize.sm, marginTop: 2 },

  // Empty + discover
  empty: { alignItems: 'center', paddingTop: 60 },
  emptyText: { color: colors.text.secondary, fontSize: fontSize.base },
  discoverHint: { alignItems: 'center', paddingTop: 80 },
  discoverTitle: { color: colors.text.primary, fontSize: fontSize.lg, fontWeight: '700', marginBottom: spacing.sm },
  discoverSub: { color: colors.text.secondary, fontSize: fontSize.base },
});
