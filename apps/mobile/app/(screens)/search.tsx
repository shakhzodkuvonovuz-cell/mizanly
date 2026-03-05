import { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, Pressable, TextInput,
  FlatList,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery, useInfiniteQuery } from '@tanstack/react-query';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Avatar } from '@/components/ui/Avatar';
import { Icon } from '@/components/ui/Icon';
import { VerifiedBadge } from '@/components/ui/VerifiedBadge';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { TabSelector } from '@/components/ui/TabSelector';
import { useHaptic } from '@/hooks/useHaptic';
import { colors, spacing, fontSize, radius } from '@/theme';
import { searchApi } from '@/services/api';
import { PostCard } from '@/components/saf/PostCard';
import { ThreadCard } from '@/components/majlis/ThreadCard';
import type { User, TrendingHashtag } from '@/types';

const SEARCH_TABS = [
  { key: 'people', label: 'People' },
  { key: 'hashtags', label: 'Hashtags' },
  { key: 'posts', label: 'Posts' },
  { key: 'threads', label: 'Threads' },
] as const;

type SearchTab = typeof SEARCH_TABS[number]['key'];

function UserRow({ user, onPress }: { user: User; onPress: () => void }) {
  return (
    <Pressable style={styles.userRow} onPress={onPress}>
      <Avatar uri={user.avatarUrl} name={user.displayName} size="md" showOnline />
      <View style={styles.userInfo}>
        <View style={styles.userNameRow}>
          <Text style={styles.userName}>{user.displayName}</Text>
          {user.isVerified && <VerifiedBadge size={13} />}
        </View>
        <Text style={styles.userHandle}>@{user.username}</Text>
        {user._count && (
          <Text style={styles.userFollowers}>{user._count.followers} followers</Text>
        )}
      </View>
      {user.isFollowing ? (
        <Text style={styles.followingLabel}>Following</Text>
      ) : null}
    </Pressable>
  );
}

export default function SearchScreen() {
  const router = useRouter();
  const haptic = useHaptic();
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const [activeTab, setActiveTab] = useState<SearchTab>('people');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, []);

  const handleQueryChange = (text: string) => {
    setQuery(text);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebouncedQuery(text), 400);
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
  const trending: TrendingHashtag[] = trendingQuery.data ?? [];
  const isSearching = debouncedQuery.trim().length >= 2;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={8} style={styles.backBtn}>
          <Icon name="arrow-left" size="md" color={colors.text.primary} />
        </Pressable>
        <View style={[styles.searchBox, isFocused && styles.searchBoxFocused]}>
          <Icon name="search" size="xs" color={colors.text.tertiary} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search people, hashtags…"
            placeholderTextColor={colors.text.tertiary}
            value={query}
            onChangeText={handleQueryChange}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            autoFocus
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
          />
          {query.length > 0 && (
            <Pressable onPress={() => { setQuery(''); setDebouncedQuery(''); }} hitSlop={8}>
              <Icon name="x" size="xs" color={colors.text.secondary} />
            </Pressable>
          )}
        </View>
      </View>

      {isSearching && (
        <TabSelector
          tabs={SEARCH_TABS.map((t) => ({ key: t.key, label: t.label }))}
          activeKey={activeTab}
          onChange={(k) => setActiveTab(k as SearchTab)}
        />
      )}

      {searchQuery.isLoading ? (
        <View style={styles.skeletonList}>
          {Array.from({ length: 6 }).map((_, i) => (
            <View key={i} style={styles.skeletonRow}>
              <Skeleton.Circle size={40} />
              <View style={{ flex: 1, gap: 6 }}>
                <Skeleton.Rect width={120} height={14} />
                <Skeleton.Rect width={80} height={11} />
              </View>
            </View>
          ))}
        </View>
      ) : isSearching ? (
        <>
          {(activeTab === 'posts' || activeTab === 'threads') ? (
            <EmptyState
              icon="search"
              title="Full-text search coming soon"
              subtitle="Search by people and hashtags is available now"
            />
          ) : (
            <FlatList
              data={
                activeTab === 'people'
                  ? people.map((p) => ({ type: 'user' as const, data: p }))
                  : hashtags.map((h) => ({ type: 'hashtag' as const, data: h }))
              }
              keyExtractor={(item, i) => item.type === 'user' ? item.data.id : `ht-${i}`}
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
                  <Pressable
                    style={styles.hashtagRow}
                    onPress={() => router.push(`/(screens)/hashtag/${item.data.name}`)}
                  >
                    <View style={styles.hashtagIconWrap}>
                      <Icon name="hash" size="sm" color={colors.emerald} />
                    </View>
                    <View>
                      <Text style={styles.hashtagName}>#{item.data.name}</Text>
                      <Text style={styles.hashtagCount}>{item.data.postsCount} posts</Text>
                    </View>
                  </Pressable>
                );
              }}
              ListEmptyComponent={() => (
                <EmptyState
                  icon="search"
                  title={`No ${activeTab === 'people' ? 'people' : 'hashtags'} for "${debouncedQuery}"`}
                  subtitle="Try a different search term"
                />
              )}
              contentContainerStyle={{ paddingBottom: 40 }}
            />
          )}
        </>
      ) : (
        <View style={styles.discoverSection}>
          <Text style={styles.discoverTitle}>Trending</Text>
          {trending.length > 0 ? (
            <View style={styles.trendingChips}>
              {trending.map((item, i) => (
                <Pressable
                  key={i}
                  style={styles.trendingChip}
                  onPress={() => {
                    haptic.light();
                    if (item.name) router.push(`/(screens)/hashtag/${item.name}`);
                  }}
                >
                  <Icon name="trending-up" size={14} color={colors.emerald} />
                  <Text style={styles.trendingChipText}>#{item.name}</Text>
                </Pressable>
              ))}
            </View>
          ) : (
            <Text style={styles.discoverSub}>Search for people and topics</Text>
          )}
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
  searchBox: {
    flex: 1, flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.dark.bgElevated, borderRadius: radius.md,
    paddingHorizontal: spacing.sm, gap: spacing.xs,
    borderWidth: 1, borderColor: 'transparent',
  },
  searchBoxFocused: {
    borderColor: colors.emerald,
    backgroundColor: colors.active.emerald10,
  },
  searchInput: {
    flex: 1, color: colors.text.primary, fontSize: fontSize.base,
    paddingVertical: spacing.sm,
  },

  skeletonList: { padding: spacing.base, gap: spacing.md },
  skeletonRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },

  userRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    paddingHorizontal: spacing.base, paddingVertical: spacing.md,
    borderBottomWidth: 0.5, borderBottomColor: colors.dark.border,
  },
  userInfo: { flex: 1 },
  userNameRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  userName: { color: colors.text.primary, fontSize: fontSize.base, fontWeight: '700' },
  userHandle: { color: colors.text.secondary, fontSize: fontSize.sm, marginTop: 1 },
  userFollowers: { color: colors.text.tertiary, fontSize: fontSize.xs, marginTop: 2 },
  followingLabel: { color: colors.text.secondary, fontSize: fontSize.xs, fontWeight: '600' },

  hashtagRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    paddingHorizontal: spacing.base, paddingVertical: spacing.md,
    borderBottomWidth: 0.5, borderBottomColor: colors.dark.border,
  },
  hashtagIconWrap: {
    width: 40, height: 40, borderRadius: radius.full,
    backgroundColor: colors.active.emerald10,
    alignItems: 'center', justifyContent: 'center',
  },
  hashtagName: { color: colors.text.primary, fontSize: fontSize.base, fontWeight: '700' },
  hashtagCount: { color: colors.text.secondary, fontSize: fontSize.sm, marginTop: 2 },

  discoverSection: { paddingHorizontal: spacing.base, paddingTop: spacing['2xl'] },
  discoverTitle: {
    color: colors.text.primary, fontSize: fontSize.lg, fontWeight: '700',
    marginBottom: spacing.md,
  },
  discoverSub: { color: colors.text.secondary, fontSize: fontSize.base },
  trendingChips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  trendingChip: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.xs,
    backgroundColor: colors.dark.bgElevated,
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderWidth: 0.5,
    borderColor: colors.dark.border,
  },
  trendingChipText: { color: colors.text.primary, fontSize: fontSize.sm, fontWeight: '500' },
});
