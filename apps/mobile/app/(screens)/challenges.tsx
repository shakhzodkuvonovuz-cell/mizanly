import { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
  Pressable,
  Dimensions,
  Pressable,
} from 'react-native';
import { useRouter } from 'expo-router';
import Animated, { FadeInUp, FadeIn } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { useQuery, useMutation, useQueryClient, useInfiniteQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { Icon } from '@/components/ui/Icon';
import { Avatar } from '@/components/ui/Avatar';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { GlassHeader } from '@/components/ui/GlassHeader';
import { GradientButton } from '@/components/ui/GradientButton';
import { ScreenErrorBoundary } from '@/components/ui/ScreenErrorBoundary';
import { colors, spacing, fontSize, radius, fonts, shadow } from '@/theme';
import { gamificationApi } from '@/services/api';
import { useTranslation } from '@/hooks/useTranslation';
import { useHaptic } from '@/hooks/useHaptic';
import { rtlFlexRow, rtlTextAlign } from '@/utils/rtl';
import type { IconName } from '@/components/ui/Icon';

const { width: screenWidth } = Dimensions.get('window');

type ChallengeTab = 'discover' | 'my';

interface Challenge {
  id: string;
  title: string;
  description: string;
  challengeType: string;
  category: string;
  coverImageUrl?: string;
  targetCount: number;
  currentProgress?: number;
  participantsCount: number;
  startDate: string;
  endDate: string;
  isJoined: boolean;
  isCompleted: boolean;
  creatorId: string;
  creatorName: string;
  creatorAvatarUrl: string | null;
}

const CATEGORIES = [
  { key: 'all', label: 'All', icon: 'layers' as IconName },
  { key: 'quran', label: 'Quran', icon: 'globe' as IconName },
  { key: 'dhikr', label: 'Dhikr', icon: 'repeat' as IconName },
  { key: 'photography', label: 'Photography', icon: 'camera' as IconName },
  { key: 'fitness', label: 'Fitness', icon: 'trending-up' as IconName },
  { key: 'cooking', label: 'Cooking', icon: 'heart' as IconName },
  { key: 'learning', label: 'Learning', icon: 'edit' as IconName },
];

function getDaysLeft(endDate: string): number {
  const now = new Date();
  const end = new Date(endDate);
  const diff = end.getTime() - now.getTime();
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}

function ChallengeCard({
  challenge,
  index,
  isRTL,
  onJoin,
  isJoining,
}: {
  challenge: Challenge;
  index: number;
  isRTL: boolean;
  onJoin: (id: string) => void;
  isJoining: boolean;
}) {
  const { t } = useTranslation();
  const daysLeft = getDaysLeft(challenge.endDate);
  const progress =
    challenge.targetCount > 0 && challenge.currentProgress != null
      ? Math.min(challenge.currentProgress / challenge.targetCount, 1)
      : 0;

  return (
    <Animated.View entering={FadeInUp.delay(Math.min(index * 80, 600)).duration(400)}>
      <LinearGradient
        colors={['rgba(45,53,72,0.4)', 'rgba(28,35,51,0.15)']}
        style={styles.challengeCard}
      >
        {/* Cover image */}
        {challenge.coverImageUrl && (
          <View style={styles.coverWrap}>
            <Image
              source={{ uri: challenge.coverImageUrl }}
              style={styles.coverImage}
              contentFit="cover"
            />
            <LinearGradient
              colors={['transparent', 'rgba(13,17,23,0.8)']}
              style={styles.coverOverlay}
            />
          </View>
        )}

        {/* Category badge */}
        <View style={[styles.categoryBadge, { backgroundColor: colors.active.emerald20 }]}>
          <Text style={styles.categoryBadgeText}>{challenge.category}</Text>
        </View>

        {/* Content */}
        <View style={styles.challengeContent}>
          <Text
            style={[styles.challengeTitle, { textAlign: rtlTextAlign(isRTL) }]}
            numberOfLines={2}
          >
            {challenge.title}
          </Text>
          <Text
            style={[styles.challengeDesc, { textAlign: rtlTextAlign(isRTL) }]}
            numberOfLines={2}
          >
            {challenge.description}
          </Text>

          {/* Progress bar (if joined) */}
          {challenge.isJoined && (
            <View style={styles.progressSection}>
              <View style={styles.progressTrack}>
                <LinearGradient
                  colors={[colors.emeraldLight, colors.emerald]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={[styles.progressFill, { width: `${progress * 100}%` }]}
                />
              </View>
              <Text style={styles.progressText}>
                {t('gamification.challenges.progress', {
                  current: challenge.currentProgress ?? 0,
                  target: challenge.targetCount,
                })}
              </Text>
            </View>
          )}

          {/* Footer */}
          <View style={[styles.challengeFooter, { flexDirection: rtlFlexRow(isRTL) }]}>
            <View style={[styles.footerMeta, { flexDirection: rtlFlexRow(isRTL) }]}>
              <View style={[styles.metaItem, { flexDirection: rtlFlexRow(isRTL) }]}>
                <Icon name="users" size="xs" color={colors.text.tertiary} />
                <Text style={styles.metaText}>
                  {t('gamification.challenges.participants', { count: challenge.participantsCount })}
                </Text>
              </View>
              <View style={[styles.metaItem, { flexDirection: rtlFlexRow(isRTL) }]}>
                <Icon name="clock" size="xs" color={colors.text.tertiary} />
                <Text style={styles.metaText}>
                  {daysLeft > 0
                    ? t('gamification.challenges.daysLeft', { count: daysLeft })
                    : t('gamification.challenges.ended')}
                </Text>
              </View>
            </View>

            {/* Join button */}
            {!challenge.isJoined && daysLeft > 0 && (
              <GradientButton
                label={t('gamification.challenges.join')}
                onPress={() => onJoin(challenge.id)}
                size="sm"
                loading={isJoining}
              />
            )}
            {challenge.isJoined && !challenge.isCompleted && (
              <View style={styles.joinedBadge}>
                <Icon name="check-circle" size="xs" color={colors.emerald} />
                <Text style={styles.joinedText}>{t('gamification.challenges.joined')}</Text>
              </View>
            )}
            {challenge.isCompleted && (
              <View style={[styles.joinedBadge, { backgroundColor: colors.active.gold10 }]}>
                <Icon name="check-circle" size="xs" color={colors.gold} />
                <Text style={[styles.joinedText, { color: colors.gold }]}>
                  {t('gamification.challenges.completed')}
                </Text>
              </View>
            )}
          </View>
        </View>
      </LinearGradient>
    </Animated.View>
  );
}

function LoadingSkeleton() {
  return (
    <View style={styles.skeletonWrap}>
      <View style={styles.chipScrollRow}>
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton.Rect key={i} width={80} height={32} borderRadius={radius.full} />
        ))}
      </View>
      {Array.from({ length: 3 }).map((_, i) => (
        <View key={i} style={styles.skeletonCard}>
          <Skeleton.Rect width="100%" height={120} borderRadius={radius.lg} />
          <View style={{ padding: spacing.base, gap: spacing.sm }}>
            <Skeleton.Text width="70%" />
            <Skeleton.Text width="90%" />
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Skeleton.Rect width={100} height={20} borderRadius={radius.sm} />
              <Skeleton.Rect width={80} height={32} borderRadius={radius.full} />
            </View>
          </View>
        </View>
      ))}
    </View>
  );
}

function ChallengesScreen() {
  const { t, isRTL } = useTranslation();
  const router = useRouter();
  const haptic = useHaptic();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<ChallengeTab>('discover');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [joiningId, setJoiningId] = useState<string | null>(null);

  const discoverQuery = useInfiniteQuery({
    queryKey: ['challenges', 'discover', selectedCategory],
    queryFn: async ({ pageParam }) => {
      const params: { cursor?: string; category?: string } = {};
      if (pageParam) params.cursor = pageParam as string;
      if (selectedCategory !== 'all') params.category = selectedCategory;
      const res = await gamificationApi.getChallenges(params) as { data: Challenge[]; meta: { cursor?: string; hasMore: boolean } };
      return res;
    },
    getNextPageParam: (lastPage) => lastPage.meta.cursor,
    initialPageParam: undefined as string | undefined,
    enabled: activeTab === 'discover',
  });

  const myQuery = useQuery({
    queryKey: ['challenges', 'my'],
    queryFn: async () => {
      const res = await gamificationApi.getMyChallenges() as { data: Challenge[] };
      return res;
    },
    enabled: activeTab === 'my',
  });

  const joinMutation = useMutation({
    mutationFn: (id: string) => gamificationApi.joinChallenge(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['challenges'] });
      haptic.success();
      setJoiningId(null);
    },
    onError: () => {
      setJoiningId(null);
    },
  });

  const handleJoin = useCallback(
    (id: string) => {
      setJoiningId(id);
      joinMutation.mutate(id);
    },
    [joinMutation],
  );

  const challenges =
    activeTab === 'discover'
      ? discoverQuery.data?.pages.flatMap((p) => p.data) ?? []
      : myQuery.data?.data ?? [];

  const isLoading = activeTab === 'discover' ? discoverQuery.isLoading : myQuery.isLoading;
  const isRefetching = activeTab === 'discover' ? discoverQuery.isRefetching : myQuery.isRefetching;
  const refetch = activeTab === 'discover' ? discoverQuery.refetch : myQuery.refetch;

  const renderItem = useCallback(
    ({ item, index }: { item: Challenge; index: number }) => (
      <ChallengeCard
        challenge={item}
        index={index}
        isRTL={isRTL}
        onJoin={handleJoin}
        isJoining={joiningId === item.id}
      />
    ),
    [isRTL, handleJoin, joiningId],
  );

  const keyExtractor = useCallback((item: Challenge) => item.id, []);

  const ListHeader = (
    <>
      {/* Tabs */}
      <View style={[styles.tabRow, { flexDirection: rtlFlexRow(isRTL) }]}>
        {[
          { key: 'discover' as ChallengeTab, label: t('gamification.challenges.discover') },
          { key: 'my' as ChallengeTab, label: t('gamification.challenges.myChallenges') },
        ].map((tab) => (
          <Pressable
            key={tab.key}
            onPress={() => {
              haptic.light();
              setActiveTab(tab.key);
            }}
            accessibilityRole="tab"
            accessibilityState={{ selected: activeTab === tab.key }}
          >
            <LinearGradient
              colors={
                activeTab === tab.key
                  ? [colors.emeraldLight, colors.emerald]
                  : ['rgba(45,53,72,0.4)', 'rgba(28,35,51,0.2)']
              }
              style={styles.tabChip}
            >
              <Text style={[styles.tabText, activeTab === tab.key && styles.tabTextActive]}>
                {tab.label}
              </Text>
            </LinearGradient>
          </Pressable>
        ))}
      </View>

      {/* Category filter (only on discover) */}
      {activeTab === 'discover' && (
        <FlatList
          data={CATEGORIES}
          horizontal
          showsHorizontalScrollIndicator={false}
          keyExtractor={(c) => c.key}
          inverted={isRTL}
          contentContainerStyle={styles.chipScrollRow}
          renderItem={({ item: cat }) => (
            <Pressable
              onPress={() => {
                haptic.light();
                setSelectedCategory(cat.key);
              }}
              accessibilityRole="tab"
              accessibilityState={{ selected: selectedCategory === cat.key }}
            >
              <View
                style={[
                  styles.categoryChip,
                  selectedCategory === cat.key && styles.categoryChipActive,
                ]}
              >
                <Icon
                  name={cat.icon}
                  size="xs"
                  color={selectedCategory === cat.key ? colors.emerald : colors.text.tertiary}
                />
                <Text
                  style={[
                    styles.categoryChipText,
                    selectedCategory === cat.key && styles.categoryChipTextActive,
                  ]}
                >
                  {cat.label}
                </Text>
              </View>
            </Pressable>
          )}
        />
      )}
    </>
  );

  return (
    <View style={styles.container}>
      <GlassHeader
        title={t('gamification.challenges.title')}
        leftAction={{
          icon: 'arrow-left',
          onPress: () => router.back(),
          accessibilityLabel: t('common.back'),
        }}
      />

      <View style={styles.content}>
        {isLoading ? (
          <View style={styles.loadingWrap}>
            <LoadingSkeleton />
          </View>
        ) : (
          <FlatList
            data={challenges}
            renderItem={renderItem}
            keyExtractor={keyExtractor}
            ListHeaderComponent={ListHeader}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            onEndReached={() => {
              if (activeTab === 'discover' && discoverQuery.hasNextPage) {
                discoverQuery.fetchNextPage();
              }
            }}
            onEndReachedThreshold={0.5}
            refreshControl={
              <RefreshControl
                refreshing={isRefetching}
                onRefresh={refetch}
                tintColor={colors.emerald}
              />
            }
            ListEmptyComponent={
              <EmptyState
                icon="flag"
                title={t('gamification.challenges.empty')}
                subtitle={t('gamification.challenges.emptySubtitle')}
              />
            }
          />
        )}
      </View>

      {/* FAB */}
      <Pressable
        style={styles.fab}
        onPress={() => {
          haptic.medium();
          // Navigate to create challenge screen when available
        }}
        accessibilityRole="button"
        accessibilityLabel={t('gamification.challenges.create')}
      >
        <LinearGradient
          colors={[colors.emeraldLight, colors.emerald]}
          style={styles.fabGradient}
        >
          <Icon name="circle-plus" size="lg" color="#FFFFFF" />
        </LinearGradient>
      </Pressable>
    </View>
  );
}

export default function ChallengesScreenWrapper() {
  return (
    <ScreenErrorBoundary>
      <ChallengesScreen />
    </ScreenErrorBoundary>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.dark.bg,
  },
  content: {
    flex: 1,
    paddingTop: 100,
  },
  loadingWrap: {
    paddingHorizontal: spacing.base,
    paddingTop: spacing.base,
  },
  listContent: {
    paddingHorizontal: spacing.base,
    paddingBottom: spacing['3xl'],
  },
  // Tabs
  tabRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  tabChip: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
  },
  tabText: {
    fontFamily: fonts.bodyMedium,
    fontSize: fontSize.sm,
    color: colors.text.secondary,
  },
  tabTextActive: {
    color: '#FFFFFF',
    fontFamily: fonts.bodySemiBold,
  },
  // Category chips
  chipScrollRow: {
    gap: spacing.sm,
    paddingBottom: spacing.md,
  },
  categoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
    backgroundColor: colors.dark.bgCard,
    borderWidth: 0.5,
    borderColor: colors.dark.borderLight,
  },
  categoryChipActive: {
    backgroundColor: colors.active.emerald10,
    borderColor: colors.emerald,
  },
  categoryChipText: {
    fontFamily: fonts.bodyMedium,
    fontSize: fontSize.xs,
    color: colors.text.secondary,
  },
  categoryChipTextActive: {
    color: colors.emerald,
    fontFamily: fonts.bodySemiBold,
  },
  // Challenge card
  challengeCard: {
    borderRadius: radius.lg,
    overflow: 'hidden',
    borderWidth: 0.5,
    borderColor: colors.dark.borderLight,
    marginBottom: spacing.md,
  },
  coverWrap: {
    height: 140,
    position: 'relative',
  },
  coverImage: {
    width: '100%',
    height: '100%',
  },
  coverOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 60,
  },
  categoryBadge: {
    position: 'absolute',
    top: spacing.md,
    right: spacing.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.full,
  },
  categoryBadgeText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 10,
    color: colors.emerald,
    textTransform: 'capitalize',
  },
  challengeContent: {
    padding: spacing.base,
    gap: spacing.sm,
  },
  challengeTitle: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSize.md,
    color: colors.text.primary,
  },
  challengeDesc: {
    fontFamily: fonts.body,
    fontSize: fontSize.sm,
    color: colors.text.secondary,
    lineHeight: 20,
  },
  // Progress
  progressSection: {
    gap: spacing.xs,
  },
  progressTrack: {
    height: 6,
    backgroundColor: colors.dark.surface,
    borderRadius: radius.full,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: radius.full,
  },
  progressText: {
    fontFamily: fonts.bodyMedium,
    fontSize: fontSize.xs,
    color: colors.text.secondary,
    textAlign: 'right',
  },
  // Footer
  challengeFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: spacing.xs,
  },
  footerMeta: {
    flex: 1,
    flexDirection: 'row',
    gap: spacing.md,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  metaText: {
    fontFamily: fonts.body,
    fontSize: fontSize.xs,
    color: colors.text.tertiary,
  },
  joinedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.full,
    backgroundColor: colors.active.emerald10,
  },
  joinedText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSize.xs,
    color: colors.emerald,
  },
  // FAB
  fab: {
    position: 'absolute',
    bottom: spacing['2xl'],
    right: spacing.lg,
  },
  fabGradient: {
    width: 56,
    height: 56,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.md,
  },
  // Skeleton
  skeletonWrap: {
    gap: spacing.md,
  },
  skeletonCard: {
    borderRadius: radius.lg,
    backgroundColor: colors.dark.bgCard,
    overflow: 'hidden',
  },
});
