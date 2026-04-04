import { useCallback, useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  Dimensions,
} from 'react-native';
import { BrandedRefreshControl } from '@/components/ui/BrandedRefreshControl';
import { useRouter, useLocalSearchParams } from 'expo-router';
import Animated, { FadeInUp, FadeIn } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Icon } from '@/components/ui/Icon';
import { ProgressiveImage } from '@/components/ui/ProgressiveImage';
import { Avatar } from '@/components/ui/Avatar';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { GlassHeader } from '@/components/ui/GlassHeader';
import { GradientButton } from '@/components/ui/GradientButton';
import { ScreenErrorBoundary } from '@/components/ui/ScreenErrorBoundary';
import { colors, spacing, fontSize, radius, fonts, shadow } from '@/theme';
import { gamificationApi } from '@/services/api';
import { useTranslation } from '@/hooks/useTranslation';
import { useContextualHaptic } from '@/hooks/useContextualHaptic';
import { useThemeColors } from '@/hooks/useThemeColors';
import { rtlFlexRow, rtlTextAlign } from '@/utils/rtl';
import { navigate } from '@/utils/navigation';

const { width: screenWidth } = Dimensions.get('window');
const HERO_HEIGHT = 240;

interface Episode {
  id: string;
  title: string;
  number: number;
  createdAt: string;
  postId?: string;
  reelId?: string;
  videoId?: string;
}

interface SeriesDetail {
  id: string;
  title: string;
  description?: string;
  category: string;
  coverUrl?: string;
  episodeCount: number;
  followersCount: number;
  isFollowing: boolean;
  isComplete: boolean;
  episodes: Episode[];
  creator: {
    id: string;
    displayName: string;
    username: string;
    avatarUrl: string | null;
    isVerified: boolean;
    bio?: string;
  };
  createdAt: string;
}

function EpisodeRow({
  episode,
  index,
  isRTL,
}: {
  episode: Episode;
  index: number;
  isRTL: boolean;
}) {
  const tc = useThemeColors();
  const styles = useMemo(() => createStyles(tc), [tc]);
  const router = useRouter();

  const haptic = useContextualHaptic();
  const handlePress = () => {
    haptic.navigate();
    if (episode.videoId) {
      router.push({ pathname: '/(screens)/video/[id]', params: { id: episode.videoId } });
    } else if (episode.reelId) {
      router.push({ pathname: '/(screens)/reel/[id]', params: { id: episode.reelId } });
    } else if (episode.postId) {
      router.push({ pathname: '/(screens)/post/[id]', params: { id: episode.postId } });
    }
  };

  return (
    <Animated.View entering={FadeInUp.delay(Math.min(index * 60, 500)).duration(400)}>
      <Pressable
        onPress={handlePress}
        accessibilityLabel={`Episode ${episode.number}: ${episode.title}`}
        accessibilityRole="button"
      >
        <View style={[styles.episodeRow, { flexDirection: rtlFlexRow(isRTL) }]}>
          <View style={styles.episodeNumberWrap}>
            <Text style={styles.episodeNumber}>{episode.number}</Text>
          </View>
          <View style={styles.episodeInfo}>
            <Text
              style={[styles.episodeTitle, { textAlign: rtlTextAlign(isRTL) }]}
              numberOfLines={1}
            >
              {episode.title}
            </Text>
            <Text style={[styles.episodeDate, { textAlign: rtlTextAlign(isRTL) }]}>
              {new Date(episode.createdAt).toLocaleDateString()}
            </Text>
          </View>
          <Icon name={isRTL ? 'chevron-left' : 'chevron-right'} size="sm" color={tc.text.tertiary} />
        </View>
      </Pressable>
    </Animated.View>
  );
}

function LoadingSkeleton() {
  const tc = useThemeColors();
  const styles = useMemo(() => createStyles(tc), [tc]);
  return (
    <View style={styles.skeletonWrap}>
      <Skeleton.Rect width="100%" height={HERO_HEIGHT} borderRadius={0} />
      <View style={{ padding: spacing.base, gap: spacing.md }}>
        <Skeleton.Text width="70%" />
        <View style={{ flexDirection: 'row', gap: spacing.sm, alignItems: 'center' }}>
          <Skeleton.Circle size={40} />
          <View style={{ gap: spacing.xs }}>
            <Skeleton.Text width={120} />
            <Skeleton.Text width={80} />
          </View>
        </View>
        <Skeleton.Rect width="100%" height={36} borderRadius={radius.full} />
        {Array.from({ length: 5 }).map((_, i) => (
          <View key={i} style={{ flexDirection: 'row', gap: spacing.md, alignItems: 'center' }}>
            <Skeleton.Rect width={36} height={36} borderRadius={radius.sm} />
            <View style={{ flex: 1, gap: spacing.xs }}>
              <Skeleton.Text width="60%" />
              <Skeleton.Text width="30%" />
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

function SeriesDetailScreen() {
  const tc = useThemeColors();
  const styles = useMemo(() => createStyles(tc), [tc]);
  const { t, isRTL } = useTranslation();
  const router = useRouter();
  const haptic = useContextualHaptic();
  const queryClient = useQueryClient();
  const { id } = useLocalSearchParams<{ id: string }>();

  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['series', id],
    queryFn: async () => {
      const res = await gamificationApi.getSeries(id) as { data?: SeriesDetail } & SeriesDetail;
      return (res.data ?? res) as SeriesDetail;
    },
    enabled: !!id,
  });

  const followLockRef = useRef(false);
  const followMutation = useMutation({
    mutationFn: () => {
      if (data?.isFollowing) {
        return gamificationApi.unfollowSeries(id);
      }
      return gamificationApi.followSeries(id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['series', id] });
      haptic.success();
    },
    onSettled: () => { followLockRef.current = false; },
  });

  const renderItem = useCallback(
    ({ item, index }: { item: Episode; index: number }) => (
      <EpisodeRow episode={item} index={index} isRTL={isRTL} />
    ),
    [isRTL],
  );

  const keyExtractor = useCallback((item: Episode) => item.id, []);

  const ListHeader = data ? (
    <>
      {/* Hero */}
      <View style={styles.hero}>
        {data.coverUrl ? (
          <ProgressiveImage
            uri={data.coverUrl}
            width="100%"
            height={HERO_HEIGHT}
          />
        ) : (
          <LinearGradient
            colors={[colors.emerald + '40', colors.gold + '20']}
            style={styles.heroImage}
          />
        )}
        <LinearGradient
          colors={['transparent', tc.bg]}
          style={styles.heroOverlay}
        />
        <View style={styles.heroContent}>
          <Text style={styles.heroTitle}>{data.title}</Text>
          {data.isComplete && (
            <View style={styles.completeBadge}>
              <Icon name="check-circle" size="xs" color={colors.gold} />
              <Text style={styles.completeBadgeText}>{t('series.completeSeries', 'Complete Series')}</Text>
            </View>
          )}
        </View>
      </View>

      {/* Creator info */}
      <Animated.View entering={FadeIn.duration(400)} style={styles.creatorCard}>
        <Pressable
          onPress={() => navigate(`/(screens)/profile/${data.creator.username}`)}
          style={[styles.creatorRow, { flexDirection: rtlFlexRow(isRTL) }]}
          accessibilityLabel={`View ${data.creator.displayName}'s profile`}
          accessibilityRole="button"
        >
          <Avatar uri={data.creator.avatarUrl} name={data.creator.displayName} size="md" />
          <View style={styles.creatorInfo}>
            <Text style={[styles.creatorName, { textAlign: rtlTextAlign(isRTL) }]}>
              {data.creator.displayName}
            </Text>
            <Text style={[styles.creatorUsername, { textAlign: rtlTextAlign(isRTL) }]}>
              @{data.creator.username}
            </Text>
          </View>
        </Pressable>
      </Animated.View>

      {/* Description */}
      {data.description && (
        <Text style={[styles.description, { textAlign: rtlTextAlign(isRTL) }]}>
          {data.description}
        </Text>
      )}

      {/* Stats + Follow */}
      <View style={[styles.statsRow, { flexDirection: rtlFlexRow(isRTL) }]}>
        <View style={[styles.statItem, { flexDirection: rtlFlexRow(isRTL) }]}>
          <Icon name="video" size="sm" color={tc.text.secondary} />
          <Text style={styles.statText}>
            {t('gamification.series.episodes', { count: data.episodeCount })}
          </Text>
        </View>
        <View style={[styles.statItem, { flexDirection: rtlFlexRow(isRTL) }]}>
          <Icon name="users" size="sm" color={tc.text.secondary} />
          <Text style={styles.statText}>
            {t('gamification.series.followers', { count: data.followersCount })}
          </Text>
        </View>
        <View style={styles.followBtnWrap}>
          <GradientButton
            label={data.isFollowing ? t('gamification.series.following') : t('gamification.series.follow')}
            onPress={() => { if (followLockRef.current) return; followLockRef.current = true; followMutation.mutate(); }}
            variant={data.isFollowing ? 'secondary' : 'primary'}
            size="sm"
            loading={followMutation.isPending}
          />
        </View>
      </View>

      {/* Episodes header */}
      <View style={[styles.episodesHeader, { flexDirection: rtlFlexRow(isRTL) }]}>
        <Icon name="layers" size="sm" color={tc.text.primary} />
        <Text style={styles.episodesHeaderText}>
          {t('series.episodeList', 'Episodes')} ({data.episodes?.length ?? 0})
        </Text>
      </View>
    </>
  ) : null;

  return (
    <View style={styles.container}>
      <GlassHeader
        title={data?.title ?? t('gamification.series.title')}
        leftAction={{
          icon: 'arrow-left',
          onPress: () => router.back(),
          accessibilityLabel: t('common.back'),
        }}
        borderless
      />

      {isLoading ? (
        <LoadingSkeleton />
      ) : !data ? (
        <View style={styles.emptyWrap}>
          <EmptyState
            icon="video"
            title={t('gamification.series.empty')}
            actionLabel={t('common.retry')}
            onAction={() => refetch()}
          />
        </View>
      ) : (
        <FlatList
          data={data.episodes ?? []}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          ListHeaderComponent={ListHeader}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <BrandedRefreshControl
              refreshing={isRefetching}
              onRefresh={refetch}
            />
          }
          ListEmptyComponent={
            <EmptyState
              icon="video"
              title={t('series.noEpisodes')}
              subtitle={t('series.episodesHint')}
            />
          }
        />
      )}
    </View>
  );
}

export default function SeriesDetailScreenWrapper() {
  return (
    <ScreenErrorBoundary>
      <SeriesDetailScreen />
    </ScreenErrorBoundary>
  );
}

const createStyles = (tc: ReturnType<typeof useThemeColors>) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: tc.bg,
  },
  listContent: {
    paddingBottom: spacing['2xl'],
  },
  emptyWrap: {
    flex: 1,
    paddingTop: 120,
  },
  // Hero
  hero: {
    height: HERO_HEIGHT,
    position: 'relative',
  },
  heroImage: {
    width: '100%',
    height: '100%',
  },
  heroOverlay: {
    position: 'absolute',
    bottom: 0,
    start: 0,
    end: 0,
    height: HERO_HEIGHT * 0.6,
  },
  heroContent: {
    position: 'absolute',
    bottom: spacing.base,
    start: spacing.base,
    end: spacing.base,
    gap: spacing.sm,
  },
  heroTitle: {
    fontFamily: fonts.headingBold,
    fontSize: fontSize.xl,
    color: tc.text.primary,
  },
  completeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.full,
    backgroundColor: colors.active.gold20,
    alignSelf: 'flex-start',
  },
  completeBadgeText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSize.xs,
    color: colors.gold,
  },
  // Creator
  creatorCard: {
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
  },
  creatorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  creatorInfo: {
    flex: 1,
    gap: 2,
  },
  creatorName: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSize.base,
    color: tc.text.primary,
  },
  creatorUsername: {
    fontFamily: fonts.body,
    fontSize: fontSize.sm,
    color: tc.text.secondary,
  },
  // Description
  description: {
    fontFamily: fonts.body,
    fontSize: fontSize.sm,
    color: tc.text.secondary,
    lineHeight: 22,
    paddingHorizontal: spacing.base,
    marginBottom: spacing.md,
  },
  // Stats
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.base,
    gap: spacing.lg,
    marginBottom: spacing.lg,
  },
  statItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  statText: {
    fontFamily: fonts.bodyMedium,
    fontSize: fontSize.sm,
    color: tc.text.secondary,
  },
  followBtnWrap: {
    marginStart: 'auto',
  },
  // Episodes
  episodesHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.base,
    paddingBottom: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: tc.border,
    marginBottom: spacing.sm,
  },
  episodesHeaderText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSize.md,
    color: tc.text.primary,
  },
  episodeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.base,
    gap: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: tc.border,
  },
  episodeNumberWrap: {
    width: 36,
    height: 36,
    borderRadius: radius.sm,
    backgroundColor: tc.bgCard,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 0.5,
    borderColor: tc.borderLight,
  },
  episodeNumber: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSize.sm,
    color: colors.emerald,
  },
  episodeInfo: {
    flex: 1,
    gap: 2,
  },
  episodeTitle: {
    fontFamily: fonts.bodyMedium,
    fontSize: fontSize.base,
    color: tc.text.primary,
  },
  episodeDate: {
    fontFamily: fonts.body,
    fontSize: fontSize.xs,
    color: tc.text.tertiary,
  },
  // Skeleton
  skeletonWrap: {
    flex: 1,
  },
});
