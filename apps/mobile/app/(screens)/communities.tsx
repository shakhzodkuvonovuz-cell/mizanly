import { useState, useCallback, useEffect, useRef } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { formatCompactNumber } from '@/utils/localeFormat';
import {
  View, Text, StyleSheet, Pressable, ScrollView,
  FlatList, TextInput,
} from 'react-native';
import { BrandedRefreshControl } from '@/components/ui/BrandedRefreshControl';
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
import { BottomSheet, BottomSheetItem } from '@/components/ui/BottomSheet';
import { colors, spacing, radius, fontSize, fontSizeExt, fonts } from '@/theme';
import { showToast } from '@/components/ui/Toast';
import { communitiesApi } from '@/services/communitiesApi';
import type { Community } from '@/types/communities';
import { useTranslation } from '@/hooks/useTranslation';
import { useThemeColors } from '@/hooks/useThemeColors';
import { useContextualHaptic } from '@/hooks/useContextualHaptic';
import { ScreenErrorBoundary } from '@/components/ui/ScreenErrorBoundary';
import { navigate } from '@/utils/navigation';

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
  const { t } = useTranslation();
  const tc = useThemeColors();
  const scaleAnim = useSharedValue(1);

  const handlePress = () => {
    scaleAnim.value = withSpring(0.98, { damping: 15 });
    scaleAnim.value = withSpring(1, { damping: 15 });
    onPress(community);
  };

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scaleAnim.value }],
  }));

  const formatCount = formatCompactNumber;

  const emoji = community.emoji || '👥';
  const description = community.description || '';
  const category = community.category;

  return (
    <Animated.View entering={FadeInUp.delay(index * 80).duration(500)} style={animatedStyle}>
      <Pressable onPress={handlePress} accessibilityRole="button" accessibilityLabel={community.name}>
        <LinearGradient
          colors={colors.gradient.cardDark}
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
              style={[styles.iconBg, { borderColor: tc.bg }]}
            >
              <Text style={styles.iconEmoji}>{emoji}</Text>
            </LinearGradient>
          </View>

          {/* Content */}
          <View style={styles.cardContent}>
            <Text style={[styles.communityName, { color: tc.text.primary }]}>{community.name}</Text>
            <Text style={[styles.communityDescription, { color: tc.text.secondary }]} numberOfLines={2}>
              {description}
            </Text>

            <View style={styles.communityMeta}>
              <View style={styles.memberCount}>
                <Icon name="users" size="xs" color={tc.text.tertiary} />
                <Text style={[styles.memberCountText, { color: tc.text.tertiary }]}>{formatCount(community.memberCount)}</Text>
              </View>
              {category && (
                <View style={styles.categoryBadge}>
                  <Text style={styles.cardCategoryText}>{t(`screens.communities.category.${category.toLowerCase()}`)}</Text>
                </View>
              )}
            </View>

            {/* Join Button */}
            <Pressable
              accessibilityRole="button"
              style={[styles.joinButton, community.isJoined && styles.joinButtonJoined]}
              onPress={() => onJoin(community.id)}
            >
              <LinearGradient
                colors={community.isJoined ? ['transparent', 'transparent'] : [colors.emerald, colors.gold]}
                style={styles.joinButtonGradient}
              >
                <Text style={[styles.joinButtonText, community.isJoined && { color: tc.text.secondary }]}>
                  {community.isJoined ? t('screens.communities.joinButtonJoined') : t('screens.communities.joinButtonJoin')}
                </Text>
              </LinearGradient>
            </Pressable>
          </View>
        </LinearGradient>
      </Pressable>
    </Animated.View>
  );
}

function FAB({ onPress }: { onPress: () => void }) {
  const { t } = useTranslation();
  const scaleAnim = useSharedValue(1);

  const handlePress = () => {
    scaleAnim.value = withSpring(0.9, { damping: 10 });
    scaleAnim.value = withSpring(1, { damping: 10 });
    onPress();
  };

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scaleAnim.value }],
  }));

  return (
    <Animated.View style={[styles.fab, animatedStyle]}>
      <Pressable onPress={handlePress} accessibilityRole="button" accessibilityLabel={t('accessibility.createCommunity')}>
        <LinearGradient
          colors={[colors.emerald, colors.gold]}
          style={styles.fabGradient}
        >
          <Icon name="plus" size="md" color="#fff" />
        </LinearGradient>
      </Pressable>
    </Animated.View>
  );
}

export default function CommunitiesScreen() {
  const router = useRouter();
  const tc = useThemeColors();
  const haptic = useContextualHaptic();
  const insets = useSafeAreaInsets();
  const joinPendingRef = useRef(false);
  const [activeTab, setActiveTab] = useState<'discover' | 'joined'>('discover');
  const [activeCategory, setActiveCategory] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [communities, setCommunities] = useState<Community[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const { t } = useTranslation();

  const fetchCommunities = useCallback(async (cursor?: string) => {
    setLoading(true);
    setError(null);
    try {
      const response = await communitiesApi.list(cursor);
      setCommunities(prev => cursor ? [...prev, ...response.data] : response.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('screens.communities.errorLoadFailed'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [t]);

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
                         (community.description ?? '').toLowerCase().includes(searchQuery.toLowerCase());
    return matchesTab && matchesCategory && matchesSearch;
  });

  const joinedCount = communities.filter(c => c.isJoined).length;

  const handleJoin = useCallback(async (id: string) => {
    if (joinPendingRef.current) return;
    const community = communities.find(c => c.id === id);
    if (!community) return;
    joinPendingRef.current = true;
    haptic.tick();
    const wasJoined = community.isJoined;
    // Optimistic update (including memberCount)
    setCommunities(prev => prev.map(c =>
      c.id === id ? {
        ...c,
        isJoined: !c.isJoined,
        memberCount: c.memberCount + (wasJoined ? -1 : 1),
      } : c
    ));
    try {
      if (wasJoined) {
        await communitiesApi.leave(id);
      } else {
        await communitiesApi.join(id);
      }
      showToast({
        message: wasJoined ? t('screens.communities.leftToast') : t('screens.communities.joinedToast'),
        variant: 'success',
      });
    } catch (err) {
      // Revert on error
      setCommunities(prev => prev.map(c =>
        c.id === id ? { ...c, isJoined: wasJoined, memberCount: community.memberCount } : c
      ));
      showToast({
        message: err instanceof Error ? err.message : t('screens.communities.errorJoinFailed'),
        variant: 'error',
      });
    } finally {
      joinPendingRef.current = false;
    }
  }, [communities, haptic, t]);

  const handleCommunityPress = useCallback((community: Community) => {
    haptic.navigate();
    navigate('/(screens)/community-posts', { communityId: community.id });
  }, [haptic]);

  const handleCreateCommunity = useCallback(() => {
    setShowCreateModal(true);
  }, []);

  return (
    <ScreenErrorBoundary>
      <View style={[styles.container, { backgroundColor: tc.bg }]}>
        <GlassHeader
          title={t('screens.communities.title')}
          leftAction={{ icon: 'arrow-left', onPress: () => router.back() }}
        />

        {/* Search Bar */}
        <View style={styles.searchContainer}>
          <LinearGradient
            colors={colors.gradient.cardDark}
            style={[styles.searchBar, { borderColor: tc.border }]}
          >
            <Icon name="search" size="sm" color={tc.text.tertiary} />
            <TextInput
              style={[styles.searchInput, { color: tc.text.primary }]}
              placeholder={t('screens.communities.searchPlaceholder')}
              placeholderTextColor={tc.text.tertiary}
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
            {searchQuery.length > 0 && (
              <Pressable onPress={() => setSearchQuery('')} accessibilityRole="button" accessibilityLabel={t('common.clear')}>
                <Icon name="x" size="sm" color={tc.text.tertiary} />
              </Pressable>
            )}
          </LinearGradient>
        </View>

        {/* Tabs */}
        <View style={styles.tabsContainer}>
          <Pressable
            accessibilityRole="button"
            style={[styles.tab, activeTab === 'discover' && styles.tabActive]}
            onPress={() => setActiveTab('discover')}
          >
            <LinearGradient
              colors={activeTab === 'discover' ? ['rgba(10,123,79,0.3)', 'rgba(10,123,79,0.1)'] : ['transparent', 'transparent']}
              style={styles.tabGradient}
            >
              <Icon name="search" size="xs" color={activeTab === 'discover' ? colors.emerald : tc.text.tertiary} />
              <Text style={[styles.tabText, { color: tc.text.tertiary }, activeTab === 'discover' && { color: colors.emerald, fontFamily: fonts.bodySemiBold }]}>{t('screens.communities.tabDiscover')}</Text>
            </LinearGradient>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            style={[styles.tab, activeTab === 'joined' && styles.tabActive]}
            onPress={() => setActiveTab('joined')}
          >
            <LinearGradient
              colors={activeTab === 'joined' ? ['rgba(10,123,79,0.3)', 'rgba(10,123,79,0.1)'] : ['transparent', 'transparent']}
              style={styles.tabGradient}
            >
              <Icon name="users" size="xs" color={activeTab === 'joined' ? colors.emerald : tc.text.tertiary} />
              <Text style={[styles.tabText, { color: tc.text.tertiary }, activeTab === 'joined' && { color: colors.emerald, fontFamily: fonts.bodySemiBold }]}>
                {t('screens.communities.tabJoined')} {joinedCount > 0 && `(${joinedCount})`}
              </Text>
            </LinearGradient>
          </Pressable>
        </View>

        {/* Categories (only show on Discover) */}
        {activeTab === 'discover' && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.categoriesContainer}
          >
            {CATEGORIES.map((category) => (
              <Pressable
                accessibilityRole="button"
                key={category}
                style={[styles.categoryPill, { backgroundColor: tc.surface }, activeCategory === category && styles.categoryPillActive]}
                onPress={() => {
                  haptic.tick();
                  setActiveCategory(category);
                }}
              >
                <Text style={[styles.categoryText, { color: tc.text.secondary }, activeCategory === category && { color: '#fff', fontFamily: fonts.bodySemiBold }]}>
                  {t(`screens.communities.category.${category.toLowerCase()}`)}
                </Text>
              </Pressable>
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
          ) : error ? (
            <EmptyState
              icon="alert-circle"
              title={t('screens.communities.errorTitle')}
              subtitle={error}
              actionLabel={t('common.retry')}
              onAction={onRefresh}
            />
          ) : (
            <EmptyState
              icon="users"
              title={activeTab === 'joined' ? t('screens.communities.emptyJoinedTitle') : t('screens.communities.emptyDiscoverTitle')}
              subtitle={activeTab === 'joined'
                ? t('screens.communities.emptyJoinedSubtitle')
                : t('screens.communities.emptyDiscoverSubtitle')
              }
              actionLabel={activeTab === 'joined' ? t('screens.communities.tabDiscover') : undefined}
              onAction={activeTab === 'joined' ? () => setActiveTab('discover') : undefined}
            />
          )}
          refreshControl={<BrandedRefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          showsVerticalScrollIndicator={false}
        />

        {/* Create Community FAB */}
        <FAB onPress={handleCreateCommunity} />

        {/* Create Community Modal */}
        <BottomSheet visible={showCreateModal} onClose={() => setShowCreateModal(false)}>
          <BottomSheetItem
            label={t('screens.communities.createCommunity') || 'Create Community'}
            icon={<Icon name="users" size="sm" color={tc.text.primary} />}
            onPress={() => { setShowCreateModal(false); router.push('/(screens)/create-group'); }}
          />
          <BottomSheetItem
            label={t('screens.communities.browseCommunities') || 'Browse Communities'}
            icon={<Icon name="search" size="sm" color={tc.text.primary} />}
            onPress={() => { setShowCreateModal(false); router.push('/(screens)/discover'); }}
          />
        </BottomSheet>
      </View>

    </ScreenErrorBoundary>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
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
    gap: spacing.sm,
  },
  searchInput: {
    flex: 1,
    fontSize: fontSize.base,
    fontFamily: fonts.body,
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
    backgroundColor: colors.active.emerald10,
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
    fontSize: fontSize.base,
    fontFamily: fonts.bodyMedium,
  },
  tabTextActive: {
    fontFamily: fonts.bodySemiBold,
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
    borderWidth: 1,
    borderColor: colors.active.white6,
  },
  categoryPillActive: {
    backgroundColor: colors.emerald,
    borderColor: colors.emerald,
  },
  categoryText: {
    fontSize: fontSize.sm,
    fontFamily: fonts.bodyMedium,
  },
  categoryTextActive: {
    fontFamily: fonts.bodySemiBold,
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
    borderColor: colors.active.white6,
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
    end: spacing.sm,
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
    fontFamily: fonts.bodyBold,
  },
  iconContainer: {
    marginTop: -28,
    marginStart: spacing.md,
    zIndex: 10,
  },
  iconBg: {
    width: 56,
    height: 56,
    borderRadius: radius.lg,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
  },
  iconEmoji: {
    fontSize: fontSizeExt.heading,
  },
  cardContent: {
    padding: spacing.md,
    paddingTop: spacing.sm,
  },
  communityName: {
    fontSize: fontSize.md,
    fontFamily: fonts.bodySemiBold,
    marginBottom: spacing.xs,
  },
  communityDescription: {
    fontSize: fontSize.sm,
    fontFamily: fonts.body,
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
    fontSize: fontSize.xs,
    fontFamily: fonts.body,
  },
  categoryBadge: {
    backgroundColor: colors.active.emerald10,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.sm,
  },
  cardCategoryText: {
    color: colors.emerald,
    fontSize: fontSize.xs,
    fontFamily: fonts.bodyMedium,
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
    fontFamily: fonts.bodySemiBold,
  },
  joinButtonTextJoined: {
    // color now applied via inline tc override
  },

  // FAB
  fab: {
    position: 'absolute',
    bottom: spacing.xl + 34, // 34 = safe area fallback for home indicator
    end: spacing.base,
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
