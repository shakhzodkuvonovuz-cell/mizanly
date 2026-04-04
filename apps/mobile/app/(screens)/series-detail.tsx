import { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  ScrollView,
  Share,
} from 'react-native';
import { BrandedRefreshControl } from '@/components/ui/BrandedRefreshControl';
import Animated, { FadeInUp, FadeIn } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { ProgressiveImage } from '@/components/ui/ProgressiveImage';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { navigate } from '@/utils/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GlassHeader } from '@/components/ui/GlassHeader';
import { GradientButton } from '@/components/ui/GradientButton';
import { Icon } from '@/components/ui/Icon';
import { Avatar } from '@/components/ui/Avatar';
import { VerifiedBadge } from '@/components/ui/VerifiedBadge';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { BottomSheet, BottomSheetItem } from '@/components/ui/BottomSheet';
import { ScreenErrorBoundary } from '@/components/ui/ScreenErrorBoundary';
import { useTranslation } from '@/hooks/useTranslation';
import { useContextualHaptic } from '@/hooks/useContextualHaptic';
import { useThemeColors } from '@/hooks/useThemeColors';
import { showToast } from '@/components/ui/Toast';
import { rtlFlexRow, rtlChevron } from '@/utils/rtl';
import { colors, spacing, fontSize, radius, fonts } from '@/theme';
import { formatCount } from '@/utils/formatCount';
import { gamificationApi } from '@/services/api';

interface Episode {
  id: string;
  title: string;
  number: number;
  postId?: string;
  reelId?: string;
  videoId?: string;
  createdAt: string;
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
  isCreator: boolean;
  episodes: Episode[];
  creator: {
    id: string;
    username: string;
    displayName: string;
    avatarUrl?: string;
    isVerified: boolean;
  };
  createdAt: string;
}

function SeriesDetailContent() {
  const tc = useThemeColors();
  const styles = useMemo(() => createStyles(tc), [tc]);
  const { t, isRTL } = useTranslation();
  const router = useRouter();
  const haptic = useContextualHaptic();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ id: string }>();
  const queryClient = useQueryClient();

  const [addEpisodeSheet, setAddEpisodeSheet] = useState(false);

  const seriesQuery = useQuery({
    queryKey: ['series', params.id],
    queryFn: () => gamificationApi.getSeries(params.id!) as Promise<SeriesDetail>,
    enabled: !!params.id,
  });

  const followMutation = useMutation({
    mutationFn: () => gamificationApi.followSeries(params.id!),
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: ['series', params.id] });
      const previous = queryClient.getQueryData<SeriesDetail>(['series', params.id]);
      queryClient.setQueryData<SeriesDetail>(['series', params.id], (old) =>
        old ? { ...old, isFollowing: true, followersCount: old.followersCount + 1 } : old
      );
      return { previous };
    },
    onSuccess: () => {
      haptic.success();
      showToast({ message: t('series.followedToast', 'Followed!'), variant: 'success' });
    },
    onError: (err: Error, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(['series', params.id], context.previous);
      }
      showToast({ message: err.message, variant: 'error' });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['series', params.id] });
    },
  });

  const unfollowMutation = useMutation({
    mutationFn: () => gamificationApi.unfollowSeries(params.id!),
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: ['series', params.id] });
      const previous = queryClient.getQueryData<SeriesDetail>(['series', params.id]);
      queryClient.setQueryData<SeriesDetail>(['series', params.id], (old) =>
        old ? { ...old, isFollowing: false, followersCount: Math.max(0, old.followersCount - 1) } : old
      );
      return { previous };
    },
    onError: (err: Error, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(['series', params.id], context.previous);
      }
      showToast({ message: err.message, variant: 'error' });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['series', params.id] });
    },
  });

  const handleRefresh = useCallback(() => {
    seriesQuery.refetch();
  }, [seriesQuery]);

  const series = seriesQuery.data;

  const handleFollowToggle = () => {
    if (followMutation.isPending || unfollowMutation.isPending) return;
    haptic.follow();
    if (series?.isFollowing) {
      unfollowMutation.mutate();
    } else {
      followMutation.mutate();
    }
  };

  const handleEpisodePress = (episode: Episode) => {
    haptic.navigate();
    if (episode.videoId) {
      navigate(`/(screens)/video/${episode.videoId}`);
    } else if (episode.reelId) {
      navigate(`/(screens)/reel/${episode.reelId}`);
    } else if (episode.postId) {
      navigate(`/(screens)/post/${episode.postId}`);
    }
  };

  const handleAddEpisode = () => {
    haptic.navigate();
    setAddEpisodeSheet(true);
  };

  if (seriesQuery.isLoading) {
    return (
      <View style={styles.container}>
        <GlassHeader
          title={t('series.detail', 'Series')}
          leftAction={{
            icon: 'arrow-left',
            onPress: () => router.back(),
            accessibilityLabel: t('common.back', 'Back'),
          }}
        />
        <View style={[styles.skeletonWrap, { paddingTop: insets.top + 52 }]}>
          <Skeleton.Rect width="100%" height={220} borderRadius={0} />
          <View style={styles.skeletonContent}>
            <Skeleton.Text width="60%" />
            <Skeleton.Text width="90%" />
            <View style={{ flexDirection: 'row', gap: spacing.sm }}>
              <Skeleton.Circle size={40} />
              <View style={{ flex: 1 }}>
                <Skeleton.Text width="40%" />
                <Skeleton.Text width="25%" />
              </View>
            </View>
            <Skeleton.Rect width="100%" height={48} borderRadius={radius.md} />
            <Skeleton.Rect width="100%" height={48} borderRadius={radius.md} />
            <Skeleton.Rect width="100%" height={48} borderRadius={radius.md} />
          </View>
        </View>
      </View>
    );
  }

  if (!series) {
    return (
      <View style={styles.container}>
        <GlassHeader
          title={t('series.detail', 'Series')}
          leftAction={{
            icon: 'arrow-left',
            onPress: () => router.back(),
            accessibilityLabel: t('common.back', 'Back'),
          }}
        />
        <EmptyState
          icon="layers"
          title={t('series.notFound', 'Series not found')}
        />
      </View>
    );
  }

  const renderEpisode = ({ item, index }: { item: Episode; index: number }) => (
    <Animated.View entering={FadeInUp.delay(index * 50).duration(250)}>
      <Pressable
        style={({ pressed }) => [styles.episodeRow, pressed && { opacity: 0.7 }]}
        onPress={() => handleEpisodePress(item)}
        android_ripple={{ color: 'rgba(10,123,79,0.1)' }}
        accessibilityRole="button"
        accessibilityLabel={t('accessibility.episodeLabel', { num: item.number, title: item.title })}
      >
        <View style={styles.episodeNumber}>
          <Text style={styles.episodeNumberText}>{item.number}</Text>
        </View>
        <View style={styles.episodeInfo}>
          <Text style={styles.episodeTitle} numberOfLines={1}>{item.title}</Text>
          <Text style={styles.episodeDate}>
            {new Date(item.createdAt).toLocaleDateString()}
          </Text>
        </View>
        <Icon name={rtlChevron(isRTL, 'forward')} size="sm" color={tc.text.tertiary} />
      </Pressable>
    </Animated.View>
  );

  const ListHeader = useCallback(() => (
    <View>
      {/* Cover Hero */}
      <View style={styles.heroWrap}>
        {series.coverUrl ? (
          <ProgressiveImage
            uri={series.coverUrl}
            width="100%"
            height={220}
          />
        ) : (
          <View style={[styles.heroImage, styles.heroPlaceholder]}>
            <Icon name="layers" size="xl" color={tc.text.tertiary} />
          </View>
        )}
        <LinearGradient
          colors={['transparent', tc.bg]}
          style={styles.heroGradient}
        />
      </View>

      {/* Title + Description */}
      <Animated.View entering={FadeIn.duration(300)} style={styles.infoSection}>
        <Text style={styles.seriesTitle}>{series.title}</Text>
        {series.description ? (
          <Text style={styles.seriesDescription}>{series.description}</Text>
        ) : null}

        {/* Stats */}
        <View style={styles.statsRow}>
          <View style={styles.statItem}>
            <Icon name="layers" size="sm" color={colors.emerald} />
            <Text style={styles.statValue}>{series.episodeCount}</Text>
            <Text style={styles.statLabel}>{t('series.episodes', 'episodes')}</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Icon name="users" size="sm" color={colors.gold} />
            <Text style={styles.statValue}>{formatCount(series.followersCount)}</Text>
            <Text style={styles.statLabel}>{t('series.followers', 'followers')}</Text>
          </View>
        </View>

        {/* Creator Card */}
        <Pressable
          style={[styles.creatorCard, { flexDirection: rtlFlexRow(isRTL) }]}
          onPress={() => navigate(`/(screens)/profile/${series.creator.username}`)}
          accessibilityRole="button"
        >
          <Avatar
            uri={series.creator.avatarUrl}
            name={series.creator.displayName}
            size="md"
          />
          <View style={styles.creatorInfo}>
            <View style={styles.creatorNameRow}>
              <Text style={styles.creatorName}>{series.creator.displayName}</Text>
              {series.creator.isVerified && <VerifiedBadge size={13} />}
            </View>
            <Text style={styles.creatorUsername}>@{series.creator.username}</Text>
          </View>
          <Icon name={rtlChevron(isRTL, 'forward')} size="sm" color={tc.text.tertiary} />
        </Pressable>

        {/* Follow / Add Episode Buttons */}
        <View style={styles.actionRow}>
          <View style={styles.actionBtnWrap}>
            <GradientButton
              label={
                series.isFollowing
                  ? t('series.following', 'Following')
                  : t('series.follow', 'Follow')
              }
              onPress={handleFollowToggle}
              variant={series.isFollowing ? 'secondary' : 'primary'}
              loading={followMutation.isPending || unfollowMutation.isPending}
              fullWidth
            />
          </View>
          {series.isCreator && (
            <Pressable
              style={styles.addEpisodeBtn}
              onPress={handleAddEpisode}
              accessibilityRole="button"
              accessibilityLabel={t('series.addEpisode', 'Add Episode')}
            >
              <Icon name="plus" size="md" color={colors.emerald} />
            </Pressable>
          )}
        </View>

        {/* Episode List Header */}
        <Text style={styles.sectionTitle}>
          {t('series.episodeList', 'Episodes')} ({series.episodes.length})
        </Text>
      </Animated.View>
    </View>
  ), [series, styles, tc, t, handleFollowToggle, handleAddEpisode, followMutation.isPending, unfollowMutation.isPending]);

  return (
    <View style={styles.container}>
      <GlassHeader
        title={series.title}
        leftAction={{
          icon: 'arrow-left',
          onPress: () => router.back(),
          accessibilityLabel: t('common.back', 'Back'),
        }}
        rightActions={[
          {
            icon: 'share',
            onPress: async () => {
              haptic.navigate();
              try {
                await Share.share({
                  message: `${series.title} - ${t('series.detail', 'Series')} on Mizanly`,
                  url: `mizanly://series/${params.id}`,
                });
              } catch (_) {
                // User cancelled share
              }
            },
            accessibilityLabel: t('common.share', 'Share'),
          },
        ]}
      />

      <FlatList
        data={series.episodes}
        renderItem={renderEpisode}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={ListHeader}
        ListEmptyComponent={
          <EmptyState
            icon="layers"
            title={t('series.noEpisodes', 'No episodes yet')}
            subtitle={t('series.noEpisodesSub', 'Episodes will appear here when added')}
          />
        }
        contentContainerStyle={[
          styles.listContent,
          { paddingTop: insets.top + 52 },
        ]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <BrandedRefreshControl
            refreshing={seriesQuery.isFetching && !seriesQuery.isLoading}
            onRefresh={handleRefresh}
          />
        }
      />

      {/* Add Episode Sheet */}
      <BottomSheet
        visible={addEpisodeSheet}
        onClose={() => setAddEpisodeSheet(false)}
      >
        <Text style={styles.sheetTitle}>
          {t('series.addEpisodeTitle', 'Add Episode')}
        </Text>
        <BottomSheetItem
          label={t('series.linkPost', 'Link a Post')}
          icon={<Icon name="image" size="md" color={tc.text.primary} />}
          onPress={() => {
            setAddEpisodeSheet(false);
            navigate('/(screens)/content-picker', { type: 'post', seriesId: params.id! });
          }}
        />
        <BottomSheetItem
          label={t('series.linkReel', 'Link a Reel')}
          icon={<Icon name="video" size="md" color={tc.text.primary} />}
          onPress={() => {
            setAddEpisodeSheet(false);
            navigate('/(screens)/content-picker', { type: 'reel', seriesId: params.id! });
          }}
        />
        <BottomSheetItem
          label={t('series.linkVideo', 'Link a Video')}
          icon={<Icon name="play" size="md" color={tc.text.primary} />}
          onPress={() => {
            setAddEpisodeSheet(false);
            navigate('/(screens)/content-picker', { type: 'video', seriesId: params.id! });
          }}
        />
        <BottomSheetItem
          label={t('common.cancel', 'Cancel')}
          icon={<Icon name="x" size="md" color={tc.text.secondary} />}
          onPress={() => setAddEpisodeSheet(false)}
        />
      </BottomSheet>
    </View>
  );
}

export default function SeriesDetailScreen() {
  return (
    <ScreenErrorBoundary>
      <SeriesDetailContent />
    </ScreenErrorBoundary>
  );
}

const createStyles = (tc: ReturnType<typeof useThemeColors>) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: tc.bg,
  },
  listContent: {
    paddingBottom: spacing['3xl'],
  },
  skeletonWrap: {
    flex: 1,
  },
  skeletonContent: {
    padding: spacing.base,
    gap: spacing.md,
  },
  // Hero
  heroWrap: {
    width: '100%',
    height: 220,
    position: 'relative',
  },
  heroImage: {
    width: '100%',
    height: '100%',
  },
  heroPlaceholder: {
    backgroundColor: tc.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroGradient: {
    position: 'absolute',
    bottom: 0,
    start: 0,
    end: 0,
    height: 120,
  },
  // Info
  infoSection: {
    paddingHorizontal: spacing.base,
    gap: spacing.md,
  },
  seriesTitle: {
    color: tc.text.primary,
    fontSize: fontSize.xl,
    fontFamily: fonts.bodySemiBold,
  },
  seriesDescription: {
    color: tc.text.secondary,
    fontSize: fontSize.base,
    fontFamily: fonts.body,
    lineHeight: 22,
  },
  // Stats
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: tc.bgCard,
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: tc.border,
  },
  statItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  statValue: {
    color: tc.text.primary,
    fontSize: fontSize.base,
    fontFamily: fonts.bodySemiBold,
  },
  statLabel: {
    color: tc.text.secondary,
    fontSize: fontSize.sm,
    fontFamily: fonts.body,
  },
  statDivider: {
    width: 1,
    height: 20,
    backgroundColor: tc.border,
    marginHorizontal: spacing.lg,
  },
  // Creator
  creatorCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: tc.bgCard,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.md,
    borderWidth: 1,
    borderColor: tc.border,
  },
  creatorInfo: {
    flex: 1,
  },
  creatorNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  creatorName: {
    color: tc.text.primary,
    fontSize: fontSize.base,
    fontFamily: fonts.bodySemiBold,
  },
  creatorUsername: {
    color: tc.text.tertiary,
    fontSize: fontSize.sm,
    fontFamily: fonts.body,
    marginTop: 2,
  },
  // Actions
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  actionBtnWrap: {
    flex: 1,
  },
  addEpisodeBtn: {
    width: 48,
    height: 48,
    borderRadius: radius.full,
    backgroundColor: colors.active.emerald10,
    borderWidth: 1,
    borderColor: colors.emerald,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Section
  sectionTitle: {
    color: tc.text.primary,
    fontSize: fontSize.md,
    fontFamily: fonts.bodySemiBold,
    marginTop: spacing.sm,
  },
  // Episode
  episodeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.base,
    gap: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: tc.border,
  },
  episodeNumber: {
    width: 36,
    height: 36,
    borderRadius: radius.full,
    backgroundColor: tc.bgCard,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: tc.border,
  },
  episodeNumberText: {
    color: colors.emerald,
    fontSize: fontSize.sm,
    fontFamily: fonts.bodySemiBold,
  },
  episodeInfo: {
    flex: 1,
  },
  episodeTitle: {
    color: tc.text.primary,
    fontSize: fontSize.base,
    fontFamily: fonts.bodySemiBold,
  },
  episodeDate: {
    color: tc.text.tertiary,
    fontSize: fontSize.xs,
    fontFamily: fonts.body,
    marginTop: 2,
  },
  // Sheet
  sheetTitle: {
    color: tc.text.primary,
    fontSize: fontSize.lg,
    fontFamily: fonts.bodySemiBold,
    textAlign: 'center',
    marginBottom: spacing.base,
  },
});
