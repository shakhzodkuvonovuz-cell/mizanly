import { useState, useCallback, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  FlatList, TextInput, RefreshControl,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeInUp, useSharedValue, useAnimatedStyle, withSpring } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { Icon } from '@/components/ui/Icon';
import { GlassHeader } from '@/components/ui/GlassHeader';
import { TabSelector } from '@/components/ui/TabSelector';
import { GradientButton } from '@/components/ui/GradientButton';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { Avatar } from '@/components/ui/Avatar';
import { Badge } from '@/components/ui/Badge';
import { colors, spacing, radius, fontSize } from '@/theme';
import { communitiesApi } from '@/services/communitiesApi';
import type { Community } from '@/types/communities';

const CATEGORIES = [
  'All', 'Islamic', 'Tech', 'Sports', 'Art', 'Food', 'Local', 'Education', 'Health'
];



function CommunityCard({
  community,
  index,
  onJoin,
  onPress,
}: {
  community: Community;
  index: number;
  onJoin: (id: string) => void;
  onPress: (community: Community) => void;
}) {
  const scaleAnim = useSharedValue(1);

  const handlePress = () => {
    scaleAnim.value = withSpring(0.98, { damping: 15 });
    setTimeout(() => {
      scaleAnim.value = withSpring(1, { damping: 15 });
      onPress(community);
    }, 100);
  };

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scaleAnim.value }],
  }));

  const formatCount = (count: number): string => {
    if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M`;
    if (count >= 1000) return `${(count / 1000).toFixed(1)}K`;
    return count.toString();
  };

  const emoji = community.emoji || '👥';
  const description = community.description || '';
  const category = community.category;

  return (
    <Animated.View entering={FadeInUp.delay(index * 80).duration(500)} style={animatedStyle}>
      <TouchableOpacity onPress={handlePress} activeOpacity={0.9}>
        <LinearGradient
          colors={['rgba(45,53,72,0.4)', 'rgba(28,35,51,0.2)']}
          style={styles.communityCard}
        >
          {/* Banner */}
          <LinearGradient
            colors={['rgba(10,123,79,0.3)', 'rgba(200,150,62,0.2)']}
            style={styles.banner}
          >
            <Text style={styles.bannerEmoji}>{emoji}</Text>
            {community.isJoined && community.unreadCount && (
              <View style={styles.unreadBadge}>
                <LinearGradient
                  colors={[colors.emerald, colors.gold]}
                  style={styles.unreadBadgeGradient}
                >
                  <Text style={styles.unreadBadgeText}>{community.unreadCount}</Text>
                </LinearGradient>
              </View>
            )}
          </LinearGradient>

          {/* Icon (overlapping) */}
          <View style={styles.iconContainer}>
            <LinearGradient
              colors={['rgba(10,123,79,0.9)', 'rgba(8,95,39,0.95)']}
              style={styles.iconBg}
            >
              <Text style={styles.iconEmoji}>{emoji}</Text>
            </LinearGradient>
          </View>

          {/* Content */}
          <View style={styles.cardContent}>
            <Text style={styles.communityName}>{community.name}</Text>
            <Text style={styles.communityDescription} numberOfLines={2}>
              {description}
            </Text>

            <View style={styles.communityMeta}>
              <View style={styles.memberCount}>
                <Icon name="users" size="xs" color={colors.text.tertiary} />
                <Text style={styles.memberCountText}>{formatCount(community.memberCount)}</Text>
              </View>
              {category && (
                <View style={styles.categoryBadge}>
                  <Text style={styles.categoryText}>{category}</Text>
                </View>
              )}
            </View>

            {/* Join Button */}
            <TouchableOpacity
              style={[styles.joinButton, community.isJoined && styles.joinButtonJoined]}
              onPress={() => onJoin(community.id)}
            >
              <LinearGradient
                colors={community.isJoined ? ['transparent', 'transparent'] : [colors.emerald, colors.gold]}
                style={styles.joinButtonGradient}
              >
                <Text style={[styles.joinButtonText, community.isJoined && styles.joinButtonTextJoined]}>
                  {community.isJoined ? 'Joined' : 'Join'}
                </Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </LinearGradient>
      </TouchableOpacity>
    </Animated.View>
  );
}

function FAB({ onPress }: { onPress: () => void }) {
  const scaleAnim = useSharedValue(1);

  const handlePress = () => {
    scaleAnim.value = withSpring(0.9, { damping: 10 });
    setTimeout(() => {
      scaleAnim.value = withSpring(1, { damping: 10 });
      onPress();
    }, 100);
  };

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scaleAnim.value }],
  }));

  return (
    <Animated.View style={[styles.fab, animatedStyle]}>
      <TouchableOpacity onPress={handlePress} activeOpacity={0.9}>
        <LinearGradient
          colors={[colors.emerald, colors.gold]}
          style={styles.fabGradient}
        >
          <Icon name="plus" size="md" color="#fff" />
        </LinearGradient>
      </TouchableOpacity>
    </Animated.View>
  );
}

export default function CommunitiesScreen() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'discover' | 'joined'>('discover');
  const [activeCategory, setActiveCategory] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [communities, setCommunities] = useState<Community[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);

  const fetchCommunities = useCallback(async (cursor?: string) => {
    setLoading(true);
    setError(null);
    try {
      const response = await communitiesApi.list(cursor);
      setCommunities(prev => cursor ? [...prev, ...response.data] : response.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load communities');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchCommunities();
  }, [fetchCommunities]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchCommunities();
  }, [fetchCommunities]);

  const filteredCommunities = communities.filter(community => {
    const matchesTab = activeTab === 'discover' || community.isJoined;
    const matchesCategory = activeCategory === 'All' || community.category === activeCategory;
    const matchesSearch = community.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         community.description.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesTab && matchesCategory && matchesSearch;
  });

  const joinedCount = communities.filter(c => c.isJoined).length;

  const handleJoin = useCallback(async (id: string) => {
    const community = communities.find(c => c.id === id);
    if (!community) return;
    // Optimistic update
    setCommunities(prev => prev.map(c =>
      c.id === id ? { ...c, isJoined: !c.isJoined } : c
    ));
    try {
      if (community.isJoined) {
        await communitiesApi.leave(id);
      } else {
        await communitiesApi.join(id);
      }
    } catch (err) {
      // Revert on error
      setCommunities(prev => prev.map(c =>
        c.id === id ? { ...c, isJoined: community.isJoined } : c
      ));
      // Show error toast maybe
    }
  }, [communities]);

  const handleCommunityPress = useCallback((community: Community) => {
    // Navigate to community detail
    // router.push(`/(screens)/community/${community.id}`);
  }, [router]);

  const handleCreateCommunity = useCallback(() => {
    setShowCreateModal(true);
  }, []);

  return (
    <View style={styles.container}>
      <GlassHeader
        title="Communities"
        subtitle={activeTab === 'joined' ? `${joinedCount} joined` : undefined}
        leftAction={{ icon: 'arrow-left', onPress: () => router.back() }}
      />

      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <LinearGradient
          colors={['rgba(45,53,72,0.4)', 'rgba(28,35,51,0.2)']}
          style={styles.searchBar}
        >
          <Icon name="search" size="sm" color={colors.text.tertiary} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search communities..."
            placeholderTextColor={colors.text.tertiary}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <Icon name="x" size="sm" color={colors.text.tertiary} />
            </TouchableOpacity>
          )}
        </LinearGradient>
      </View>

      {/* Tabs */}
      <View style={styles.tabsContainer}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'discover' && styles.tabActive]}
          onPress={() => setActiveTab('discover')}
        >
          <LinearGradient
            colors={activeTab === 'discover' ? ['rgba(10,123,79,0.3)', 'rgba(10,123,79,0.1)'] : ['transparent', 'transparent']}
            style={styles.tabGradient}
          >
            <Icon name="search" size="xs" color={activeTab === 'discover' ? colors.emerald : colors.text.tertiary} />
            <Text style={[styles.tabText, activeTab === 'discover' && styles.tabTextActive]}>Discover</Text>
          </LinearGradient>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tab, activeTab === 'joined' && styles.tabActive]}
          onPress={() => setActiveTab('joined')}
        >
          <LinearGradient
            colors={activeTab === 'joined' ? ['rgba(10,123,79,0.3)', 'rgba(10,123,79,0.1)'] : ['transparent', 'transparent']}
            style={styles.tabGradient}
          >
            <Icon name="users" size="xs" color={activeTab === 'joined' ? colors.emerald : colors.text.tertiary} />
            <Text style={[styles.tabText, activeTab === 'joined' && styles.tabTextActive]}>
              Joined {joinedCount > 0 && `(${joinedCount})`}
            </Text>
          </LinearGradient>
        </TouchableOpacity>
      </View>

      {/* Categories (only show on Discover) */}
      {activeTab === 'discover' && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.categoriesContainer}
        >
          {CATEGORIES.map((category) => (
            <TouchableOpacity
              key={category}
              style={[styles.categoryPill, activeCategory === category && styles.categoryPillActive]}
              onPress={() => setActiveCategory(category)}
            >
              <Text style={[styles.categoryText, activeCategory === category && styles.categoryTextActive]}>
                {category}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      {/* Community List */}
      <FlatList
        data={filteredCommunities}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        renderItem={({ item, index }) => (
          <CommunityCard
            community={item}
            index={index}
            onJoin={handleJoin}
            onPress={handleCommunityPress}
          />
        )}
        ListEmptyComponent={loading ? (
          <View style={styles.skeletonContainer}>
            {[...Array(3)].map((_, i) => (
              <Skeleton.PostCard key={i} />
            ))}
          </View>
        ) : (
          <EmptyState
            icon="users"
            title={activeTab === 'joined' ? 'No joined communities' : 'No communities found'}
            subtitle={activeTab === 'joined'
              ? 'Discover and join communities to connect with others'
              : 'Try a different search or category'
            }
            actionLabel={activeTab === 'joined' ? 'Discover' : undefined}
            onAction={activeTab === 'joined' ? () => setActiveTab('discover') : undefined}
          />
        )}
        refreshControl={<RefreshControl tintColor={colors.emerald} refreshing={refreshing} onRefresh={onRefresh} />}
        showsVerticalScrollIndicator={false}
      />

      {/* Create Community FAB */}
      <FAB onPress={handleCreateCommunity} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.dark.bg,
  },

  // Search
  searchContainer: {
    paddingHorizontal: spacing.base,
    paddingTop: 100,
    paddingBottom: spacing.sm,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    gap: spacing.sm,
  },
  searchInput: {
    flex: 1,
    color: colors.text.primary,
    fontSize: fontSize.base,
    paddingVertical: 0,
  },

  // Tabs
  tabsContainer: {
    flexDirection: 'row',
    paddingHorizontal: spacing.base,
    paddingBottom: spacing.sm,
    gap: spacing.md,
  },
  tab: {
    flex: 1,
    borderRadius: radius.lg,
    overflow: 'hidden',
  },
  tabActive: {
    backgroundColor: 'rgba(10,123,79,0.1)',
  },
  tabGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    borderRadius: radius.lg,
  },
  tabText: {
    color: colors.text.tertiary,
    fontSize: fontSize.base,
    fontWeight: '500',
  },
  tabTextActive: {
    color: colors.emerald,
    fontWeight: '600',
  },

  // Categories
  categoriesContainer: {
    flexDirection: 'row',
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
  },
  categoryPill: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: radius.full,
    backgroundColor: 'rgba(45,53,72,0.4)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  categoryPillActive: {
    backgroundColor: colors.emerald,
    borderColor: colors.emerald,
  },
  categoryText: {
    color: colors.text.secondary,
    fontSize: fontSize.sm,
    fontWeight: '500',
  },
  categoryTextActive: {
    color: '#fff',
    fontWeight: '600',
  },

  // List
  listContent: {
    padding: spacing.base,
    paddingBottom: spacing['3xl'],
    gap: spacing.md,
  },

  skeletonContainer: {
    padding: spacing.base,
    gap: spacing.md,
  },

  // Community Card
  communityCard: {
    borderRadius: radius.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  banner: {
    height: 80,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  bannerEmoji: {
    fontSize: 40,
    opacity: 0.3,
  },
  unreadBadge: {
    position: 'absolute',
    top: spacing.sm,
    right: spacing.sm,
  },
  unreadBadgeGradient: {
    minWidth: 24,
    height: 24,
    borderRadius: radius.full,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.xs,
  },
  unreadBadgeText: {
    color: '#fff',
    fontSize: fontSize.xs,
    fontWeight: '700',
  },
  iconContainer: {
    marginTop: -28,
    marginLeft: spacing.md,
    zIndex: 10,
  },
  iconBg: {
    width: 56,
    height: 56,
    borderRadius: radius.lg,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: colors.dark.bg,
  },
  iconEmoji: {
    fontSize: 28,
  },
  cardContent: {
    padding: spacing.md,
    paddingTop: spacing.sm,
  },
  communityName: {
    color: colors.text.primary,
    fontSize: fontSize.md,
    fontWeight: '600',
    marginBottom: spacing.xs,
  },
  communityDescription: {
    color: colors.text.secondary,
    fontSize: fontSize.sm,
    lineHeight: 20,
    marginBottom: spacing.sm,
  },
  communityMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  memberCount: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  memberCountText: {
    color: colors.text.tertiary,
    fontSize: fontSize.xs,
  },
  categoryBadge: {
    backgroundColor: 'rgba(10,123,79,0.1)',
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.sm,
  },
  categoryText: {
    color: colors.emerald,
    fontSize: fontSize.xs,
    fontWeight: '500',
  },
  joinButton: {
    borderRadius: radius.lg,
    overflow: 'hidden',
    alignSelf: 'flex-start',
  },
  joinButtonGradient: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  joinButtonJoined: {
    borderColor: colors.dark.border,
  },
  joinButtonText: {
    color: '#fff',
    fontSize: fontSize.sm,
    fontWeight: '600',
  },
  joinButtonTextJoined: {
    color: colors.text.secondary,
  },

  // FAB
  fab: {
    position: 'absolute',
    bottom: spacing.xl,
    right: spacing.base,
    zIndex: 100,
  },
  fabGradient: {
    width: 56,
    height: 56,
    borderRadius: radius.full,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: colors.emerald,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
});
