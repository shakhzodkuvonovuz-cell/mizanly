import { useState, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, Pressable, ScrollView,
  FlatList, Dimensions, Share,
} from 'react-native';
import { showToast } from '@/components/ui/Toast';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ProgressiveImage } from '@/components/ui/ProgressiveImage';
import { useQuery, useMutation, useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Clipboard from 'expo-clipboard';
import { useUser } from '@clerk/clerk-expo';
import Animated, { FadeIn, FadeInUp } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { Avatar } from '@/components/ui/Avatar';
import { Icon } from '@/components/ui/Icon';
import { VerifiedBadge } from '@/components/ui/VerifiedBadge';
import { TabSelector } from '@/components/ui/TabSelector';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { BottomSheet, BottomSheetItem } from '@/components/ui/BottomSheet';
import { GlassHeader } from '@/components/ui/GlassHeader';
import { GradientButton } from '@/components/ui/GradientButton';
import { useContextualHaptic } from '@/hooks/useContextualHaptic';
import { BrandedRefreshControl } from '@/components/ui/BrandedRefreshControl';
import { useTranslation } from '@/hooks/useTranslation';
import { useThemeColors } from '@/hooks/useThemeColors';
import { colors, spacing, fontSize, radius, fontSizeExt } from '@/theme';
import { formatCount } from '@/utils/formatCount';
import { channelsApi, videosApi, playlistsApi } from '@/services/api';
import type { Video, Playlist } from '@/types';
import { formatDistanceToNowStrict } from 'date-fns';
import { getDateFnsLocale } from '@/utils/localeFormat';
import { ScreenErrorBoundary } from '@/components/ui/ScreenErrorBoundary';
import { navigate } from '@/utils/navigation';

const SCREEN_W = Dimensions.get('window').width;
const BANNER_HEIGHT = SCREEN_W / 2.5; // 2.5:1 ratio for cinematic look
const FEATURED_HEIGHT = SCREEN_W * 0.56; // 16:9 ratio
const THUMB_16_9 = Math.round(SCREEN_W * 9 / 16);

type Tab = 'videos' | 'playlists' | 'about';

// i18n: moved inside component
// const CHANNEL_TABS = [
//   { key: 'videos', label: 'Videos' },
//   { key: 'playlists', label: 'Playlists' },
//   { key: 'about', label: 'About' },
// ];

function VideoCard({ video }: { video: Video }) {
  const router = useRouter();
  const haptic = useContextualHaptic();
  const { t } = useTranslation();
  const tc = useThemeColors();
  const durationMinutes = Math.floor(video.duration / 60);
  const durationSeconds = Math.floor(video.duration % 60);
  const durationText = `${durationMinutes}:${durationSeconds.toString().padStart(2, '0')}`;

  const handlePress = () => {
    haptic.navigate();
    router.push(`/(screens)/video/${video.id}`);
  };

  const handleChannelPress = () => {
    haptic.navigate();
    router.push(`/(screens)/channel/${video.channel.handle}`);
  };

  return (
    <Pressable style={({ pressed }) => [styles.videoCard, pressed && { opacity: 0.8 }]} onPress={handlePress}>
      {/* Thumbnail */}
      <View style={[styles.thumbnailContainer, { backgroundColor: tc.surface }]}>
        {video.thumbnailUrl ? (
          <ProgressiveImage uri={video.thumbnailUrl} width="100%" height={THUMB_16_9} contentFit="cover" />
        ) : (
          <View style={[styles.thumbnail, styles.thumbnailPlaceholder]}>
            <Icon name="video" size="lg" color={tc.text.secondary} />
          </View>
        )}
        <View style={styles.durationBadge}>
          <Text style={[styles.durationText, { color: tc.text.primary }]}>{durationText}</Text>
        </View>
      </View>

      {/* Info row */}
      <View style={styles.infoRow}>
        <Pressable style={styles.channelAvatar} onPress={handleChannelPress} hitSlop={8}>
          <Avatar
            uri={video.channel.avatarUrl}
            name={video.channel.name}
            size="sm"
            showRing={false}
          />
        </Pressable>
        <View style={styles.videoDetails}>
          <Text style={[styles.videoTitle, { color: tc.text.primary }]} numberOfLines={2}>{video.title}</Text>
          <Text style={[styles.videoCardChannelName, { color: tc.text.secondary }]} numberOfLines={1}>{video.channel.name}</Text>
          <Text style={[styles.videoStats, { color: tc.text.tertiary }]} numberOfLines={1}>
            {formatCount(video.viewsCount)} {t('minbar.viewCount')} • {formatDistanceToNowStrict(new Date(video.publishedAt || video.createdAt), { addSuffix: true, locale: getDateFnsLocale() })}
          </Text>
        </View>
        <Pressable
          style={({ pressed }) => [styles.moreButton, pressed && { opacity: 0.6 }]}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={t('common.moreOptions', 'More options')}
          onPress={() => showToast({ message: t('common.comingSoon', 'Coming soon'), variant: 'info' })}
        >
          <Icon name="more-horizontal" size="sm" color={tc.text.secondary} />
        </Pressable>
      </View>
    </Pressable>
  );
}

// Featured Video Card Component
  function FeaturedVideoCard({ video, onPress }: { video: Video; onPress: () => void }) {
    const { t } = useTranslation();
    const tc = useThemeColors();
    const durationMinutes = Math.floor(video.duration / 60);
    const durationSeconds = Math.floor(video.duration % 60);
    const durationText = `${durationMinutes}:${durationSeconds.toString().padStart(2, '0')}`;

    return (
      <Animated.View entering={FadeInUp.delay(100)} style={styles.featuredContainer}>
        <Pressable style={({ pressed }) => [styles.featuredCard, { backgroundColor: tc.surface }, pressed && { opacity: 0.8 }]} onPress={onPress}>
          <ProgressiveImage uri={video.thumbnailUrl || ''} width="100%" height={FEATURED_HEIGHT} contentFit="cover" />
          <LinearGradient
            colors={['transparent', 'rgba(13,17,23,0.8)', 'rgba(13,17,23,0.98)']}
            locations={[0.3, 0.7, 1]}
            style={styles.featuredGradient}
          >
            <View style={styles.featuredContent}>
              <View style={styles.featuredBadge}>
                <Icon name="check" size={10} color="#fff" />
                <Text style={styles.featuredBadgeText}>FEATURED</Text>
              </View>
              <Text style={[styles.featuredTitle, { color: tc.text.primary }]} numberOfLines={2}>{video.title}</Text>
              <View style={styles.featuredStats}>
                <Text style={[styles.featuredStatText, { color: tc.text.secondary }]}>{formatCount(video.viewsCount)} {t('minbar.viewCount')}</Text>
                <Text style={[styles.featuredStatDot, { color: tc.text.tertiary }]}>•</Text>
                <Text style={[styles.featuredStatText, { color: tc.text.secondary }]}>{durationText}</Text>
              </View>
            </View>
          </LinearGradient>
          <View style={styles.featuredDurationBadge}>
            <Text style={[styles.durationText, { color: tc.text.primary }]}>{durationText}</Text>
          </View>
        </Pressable>
      </Animated.View>
    );
  }

  function PlaylistCard({ playlist }: { playlist: Playlist }) {
  const router = useRouter();
  const tc = useThemeColors();
  const { t } = useTranslation();
  const haptic = useContextualHaptic();

  const handlePress = () => {
    haptic.navigate();
    router.push(`/(screens)/playlist/${playlist.id}`);
  };

  return (
    <Pressable style={({ pressed }) => [styles.playlistCard, { backgroundColor: tc.surface }, pressed && { opacity: 0.8 }]} onPress={handlePress}>
      {playlist.thumbnailUrl ? (
        <ProgressiveImage uri={playlist.thumbnailUrl} width={120} height={68} borderRadius={radius.sm} contentFit="cover" />
      ) : (
        <View style={[styles.playlistThumbnail, { backgroundColor: tc.bgCard }, styles.playlistThumbnailPlaceholder]}>
          <Icon name="layers" size="lg" color={tc.text.tertiary} />
        </View>
      )}
      <View style={styles.playlistInfo}>
        <Text style={[styles.playlistTitle, { color: tc.text.primary }]} numberOfLines={2}>{playlist.title}</Text>
        <Text style={[styles.playlistMeta, { color: tc.text.tertiary }]}>{playlist.videosCount} {t('minbar.videos')}</Text>
      </View>
    </Pressable>
  );
}

export default function ChannelScreen() {
  const { handle } = useLocalSearchParams<{ handle: string }>();
  const router = useRouter();
  const { user } = useUser();
  const haptic = useContextualHaptic();
  const { t } = useTranslation();
  const CHANNEL_TABS = useMemo(() => [
    { key: 'videos', label: t('minbar.videos') },
    { key: 'playlists', label: t('minbar.playlists') },
    { key: 'about', label: t('common.about') },
  ], [t]);
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<Tab>('videos');
  const [refreshing, setRefreshing] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [showShareSheet, setShowShareSheet] = useState(false);
  const [showTrailerPicker, setShowTrailerPicker] = useState(false);
  const tc = useThemeColors();

  // Fetch channel
  const channelQuery = useQuery({
    queryKey: ['channel', handle],
    queryFn: () => channelsApi.getByHandle(handle),
  });

  const channel = channelQuery.data;

  // Fetch videos (only when videos tab active)
  const videosQuery = useInfiniteQuery({
    queryKey: ['channel-videos', handle],
    queryFn: ({ pageParam }) => channelsApi.getVideos(handle, pageParam as string | undefined),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.meta.hasMore ? last.meta.cursor ?? undefined : undefined,
    enabled: activeTab === 'videos' && !!channel,
  });

  const videos: Video[] = videosQuery.data?.pages.flatMap((p) => p.data) ?? [];

// Fetch playlists (only when playlists tab active)
const playlistsQuery = useInfiniteQuery({
  queryKey: ['channel-playlists', channel?.id],
  queryFn: ({ pageParam }) => playlistsApi.getByChannel(channel?.id ?? '', pageParam),
  initialPageParam: undefined as string | undefined,
  getNextPageParam: (last) => last.meta?.hasMore ? last.meta.cursor ?? undefined : undefined,
  enabled: activeTab === 'playlists' && !!channel,
});

const playlists: Playlist[] = playlistsQuery.data?.pages.flatMap((p) => p.data) ?? [];

  const subscribeMutation = useMutation({
    mutationFn: () => channel?.isSubscribed ? channelsApi.unsubscribe(handle) : channelsApi.subscribe(handle),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['channel', handle] }),
    onError: () => showToast({ message: t('channel.subscribeError', 'Could not update subscription'), variant: 'error' }),
  });

  const setTrailerMutation = useMutation({
    mutationFn: (videoId: string) => channelsApi.setTrailer(handle, videoId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['channel', handle] });
      setShowTrailerPicker(false);
    },
    onError: () => showToast({ message: t('channelTrailer.setError', 'Could not set trailer'), variant: 'error' }),
  });

  const removeTrailerMutation = useMutation({
    mutationFn: () => channelsApi.removeTrailer(handle),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['channel', handle] }),
    onError: () => showToast({ message: t('channelTrailer.removeError', 'Could not remove trailer'), variant: 'error' }),
  });

  const isOwner = !!user && !!channel && user.id === channel.userId;
  const showTrailerSection = !!channel?.trailerVideo && !channel.isSubscribed && !isOwner;

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([channelQuery.refetch(), videosQuery.refetch(), playlistsQuery.refetch()]);
    setRefreshing(false);
  }, [channelQuery, videosQuery, playlistsQuery]);

  const onEndReached = () => {
    if (activeTab === 'videos' && videosQuery.hasNextPage && !videosQuery.isFetchingNextPage) {
      videosQuery.fetchNextPage();
    } else if (activeTab === 'playlists' && playlistsQuery.hasNextPage && !playlistsQuery.isFetchingNextPage) {
      playlistsQuery.fetchNextPage();
    }
  };

  const handleSubscribe = () => {
    if (subscribeMutation.isPending) return;
    haptic.follow();
    subscribeMutation.mutate();
  };

  const handleShare = () => {
    haptic.navigate();
    setShowShareSheet(true);
  };

  const handleReport = () => {
    if (!channel?.id) return;
    haptic.delete();
    router.push(`/(screens)/report?type=channel&id=${channel.id}`);
  };

  const handleCopyLink = async () => {
    haptic.save();
    await Clipboard.setStringAsync(`mizanly://channel/${channel?.handle ?? handle}`);
    showToast({ message: t('common.linkCopied'), variant: 'success' });
  };

  const handleNativeShare = async () => {
    haptic.navigate();
    await Share.share({
      message: `Check out ${channel?.name ?? handle} on Mizanly`,
      url: `mizanly://channel/${channel?.handle ?? handle}`,
    });
  };

  const renderVideoItem = ({ item }: { item: Video }) => <VideoCard video={item} />;

  const featuredVideo = videos.length > 0 ? videos[0] : null;
  const regularVideos = videos.slice(1);

  const ListHeader = useMemo(() => (
    <View>
      {/* Cinematic Banner with gradient overlay */}
      <View style={styles.bannerContainer}>
        {channel?.bannerUrl ? (
          <>
            <ProgressiveImage uri={channel.bannerUrl} width="100%" height={BANNER_HEIGHT} contentFit="cover" accessibilityLabel="Channel banner" />
            <LinearGradient
              colors={['rgba(13,17,23,0.3)', 'transparent', 'rgba(13,17,23,0.6)']}
              locations={[0, 0.5, 1]}
              style={styles.bannerGradient}
            />
          </>
        ) : (
          <LinearGradient
            colors={[tc.bgElevated, tc.surface, tc.bgElevated]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[styles.banner, { backgroundColor: tc.bgElevated }, styles.bannerPlaceholder]}
          >
            <View style={styles.bannerPattern}>
              {[...Array(6)].map((_, i) => (
                <View key={i} style={[styles.bannerPatternLine, { opacity: 0.03 + i * 0.01 }]} />
              ))}
            </View>
          </LinearGradient>
        )}
      </View>

      {/* Avatar row with floating effect */}
      <View style={styles.avatarRow}>
        <View style={styles.avatarContainer}>
          <Avatar uri={channel?.avatarUrl} name={channel?.name || ''} size="2xl" />
          {channel?.isVerified && (
            <View style={[styles.verifiedBadgeFloating, { backgroundColor: tc.bg }]}>
              <VerifiedBadge size={16} />
            </View>
          )}
        </View>
        <View style={styles.subscribeContainer}>
          <GradientButton
            label={channel?.isSubscribed ? t('minbar.subscribed') : t('minbar.subscribe')}
            variant={channel?.isSubscribed ? 'secondary' : 'primary'}
            size="sm"
            onPress={handleSubscribe}
            disabled={subscribeMutation.isPending}
            loading={subscribeMutation.isPending}
          />
        </View>
      </View>

      {/* Name + handle with gold accent */}
      <View style={styles.nameSection}>
        <View style={styles.nameAccent}>
          <LinearGradient
            colors={[colors.gold, colors.emerald]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.nameAccentLine}
          />
        </View>
        <View style={styles.nameRow}>
          <Text style={[styles.channelName, { color: tc.text.primary }]}>{channel?.name}</Text>
          {channel?.isVerified && <VerifiedBadge size={18} />}
        </View>
        <Text style={[styles.handle, { color: tc.text.secondary }]}>@{handle}</Text>
      </View>

      {/* Enhanced Stats with icons */}
      <View style={[styles.statsEnhanced, { backgroundColor: tc.surface }]}>
        <View style={styles.statItemEnhanced}>
          <Icon name="users" size="sm" color={colors.emerald} />
          <Text style={[styles.statNumEnhanced, { color: tc.text.primary }]}>{formatCount(channel?.subscribersCount ?? 0)}</Text>
          <Text style={[styles.statLabelEnhanced, { color: tc.text.secondary }]}>{t('channel.subscribers')}</Text>
        </View>
        <View style={[styles.statDividerEnhanced, { backgroundColor: tc.border }]} />
        <View style={styles.statItemEnhanced}>
          <Icon name="video" size="sm" color={colors.gold} />
          <Text style={[styles.statNumEnhanced, { color: tc.text.primary }]}>{formatCount(channel?.videosCount ?? 0)}</Text>
          <Text style={[styles.statLabelEnhanced, { color: tc.text.secondary }]}>{t('minbar.videos')}</Text>
        </View>
        <View style={[styles.statDividerEnhanced, { backgroundColor: tc.border }]} />
        <View style={styles.statItemEnhanced}>
          <Icon name="eye" size="sm" color={tc.text.secondary} />
          <Text style={[styles.statNumEnhanced, { color: tc.text.primary }]}>{formatCount(channel?.totalViews ?? 0)}</Text>
          <Text style={[styles.statLabelEnhanced, { color: tc.text.secondary }]}>{t('minbar.viewCount')}</Text>
        </View>
      </View>

      {/* Description with card styling */}
      {channel?.description && (
        <View style={styles.descriptionCard}>
          <LinearGradient
            colors={['rgba(45,53,72,0.5)', 'rgba(28,35,51,0.3)']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.descriptionGradient}
          >
            <Text style={[styles.descriptionText, { color: tc.text.secondary }]}>{channel.description}</Text>
          </LinearGradient>
        </View>
      )}

      {/* Channel Trailer Section (non-subscribers only) */}
      {showTrailerSection && channel.trailerVideo && (
        <Animated.View entering={FadeInUp.delay(150)} style={styles.trailerContainer}>
          <Text style={[styles.trailerSectionTitle, { color: tc.text.primary }]}>{t('channelTrailer.title')}</Text>
          <Pressable
            accessibilityRole="button"
            style={[styles.trailerCard, { backgroundColor: tc.surface }]}
           
            onPress={() => channel.trailerVideo && router.push(`/(screens)/video/${channel.trailerVideo.id}`)}
          >
            {channel.trailerVideo.thumbnailUrl ? (
              <ProgressiveImage uri={channel.trailerVideo.thumbnailUrl} width="100%" height={FEATURED_HEIGHT} contentFit="cover" />
            ) : (
              <View style={[styles.trailerThumbnail, styles.trailerThumbnailPlaceholder, { backgroundColor: tc.bgCard }]}>
                <Icon name="video" size="xl" color={tc.text.secondary} />
              </View>
            )}
            <LinearGradient
              colors={['transparent', 'rgba(13,17,23,0.7)', 'rgba(13,17,23,0.95)']}
              locations={[0.2, 0.6, 1]}
              style={styles.trailerGradient}
            >
              <View style={styles.trailerOverlay}>
                <View style={styles.trailerPlayButton}>
                  <Icon name="play" size="lg" color="#fff" />
                </View>
                <Text style={[styles.trailerTitle, { color: tc.text.primary }]} numberOfLines={2}>{channel.trailerVideo.title}</Text>
                <Text style={styles.trailerCta}>{t('channelTrailer.subscribeToUnlock')}</Text>
              </View>
            </LinearGradient>
            {channel.trailerVideo.duration > 0 && (
              <View style={styles.trailerDurationBadge}>
                <Text style={[styles.durationText, { color: tc.text.primary }]}>
                  {Math.floor(channel.trailerVideo.duration / 60)}:{Math.floor(channel.trailerVideo.duration % 60).toString().padStart(2, '0')}
                </Text>
              </View>
            )}
          </Pressable>
        </Animated.View>
      )}

      {/* Featured Video Section */}
      {featuredVideo && activeTab === 'videos' && (
        <FeaturedVideoCard
          video={featuredVideo}
          onPress={() => router.push(`/(screens)/video/${featuredVideo.id}`)}
        />
      )}

      {/* Tabs with enhanced styling */}
      <View style={styles.tabsContainer}>
        <TabSelector
          tabs={CHANNEL_TABS}
          activeKey={activeTab}
          onTabChange={(key) => setActiveTab(key as Tab)}
        />
      </View>
    </View>
  ), [channel, handle, subscribeMutation.isPending, featuredVideo, activeTab, CHANNEL_TABS, showTrailerSection, t, handleSubscribe, handleShare, tc, router]);

  if (channelQuery.isLoading) {
    return (
      <View style={[styles.container, { backgroundColor: tc.bg }]}>
        <GlassHeader
          leftAction={{ icon: 'arrow-left', onPress: () => router.back(), accessibilityLabel: t('common.goBack') }}
        />
        <Skeleton.Rect width="100%" height={BANNER_HEIGHT} borderRadius={0} style={{ marginTop: 88 }} />
        <View style={styles.skeletonContent}>
          <Skeleton.Rect width={96} height={96} borderRadius={radius.full} style={{ marginTop: -48 }} />
          <Skeleton.Rect width="60%" height={24} borderRadius={radius.sm} style={{ marginTop: spacing.sm }} />
          <Skeleton.Rect width="40%" height={16} borderRadius={radius.sm} style={{ marginTop: spacing.xs }} />
          <Skeleton.Rect width="100%" height={60} borderRadius={radius.sm} style={{ marginTop: spacing.lg }} />
        </View>
      </View>
    );
  }

  if (channelQuery.isError) {
    return (
      <View style={[styles.container, { backgroundColor: tc.bg }]}>
        <GlassHeader
          leftAction={{ icon: 'arrow-left', onPress: () => router.back(), accessibilityLabel: t('common.back') }}
        />
        <EmptyState
          icon="slash"
          title={t('common.error')}
          subtitle={t('errors.loadContentFailed')}
          actionLabel={t('common.back', 'Go back')}
          onAction={() => router.back()}
        />
      </View>
    );
  }

  if (!channel) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: tc.bg }]} edges={['top']}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} hitSlop={8}>
            <Icon name="arrow-left" size="md" color={tc.text.primary} />
          </Pressable>
        </View>
        <EmptyState
          icon="video"
          title={t('channel.notFound')}
          subtitle={t('channel.notFoundSubtitle')}
          actionLabel={t('common.back', 'Go back')}
          onAction={() => router.back()}
        />
      </SafeAreaView>
    );
  }

  return (
    <ScreenErrorBoundary>
      <SafeAreaView style={[styles.container, { backgroundColor: tc.bg }]} edges={['top']}>
        {/* Header */}
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} hitSlop={8} style={styles.backBtn} accessibilityRole="button" accessibilityLabel={t('common.back')}>
            <Icon name="arrow-left" size="md" color={tc.text.primary} />
          </Pressable>
          <Text style={[styles.headerTitle, { color: tc.text.primary }]}>@{handle}</Text>
          <View style={styles.headerRight}>
            <Pressable hitSlop={8} onPress={handleShare} style={styles.headerAction} accessibilityRole="button" accessibilityLabel={t('channel.shareChannel')}>
              <Icon name="share" size="sm" color={tc.text.primary} />
            </Pressable>
            <Pressable hitSlop={8} onPress={() => setShowMenu(true)} style={styles.headerAction} accessibilityRole="button" accessibilityLabel={t('channel.options', 'Channel options')}>
              <Icon name="more-horizontal" size="sm" color={tc.text.primary} />
            </Pressable>
          </View>
        </View>

        <FlatList<Video | Playlist>
          data={activeTab === 'videos' ? regularVideos : activeTab === 'playlists' ? playlists : []}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingBottom: spacing['3xl'] }}
          renderItem={({ item }) => {
            if (activeTab === 'videos') return <VideoCard video={item as Video} />;
            if (activeTab === 'playlists') return <PlaylistCard playlist={item as Playlist} />;
            return null;
          }}
          ListHeaderComponent={
            <>
              {ListHeader}
              {/* About tab content rendered as part of header (Finding 29: was incorrectly in ListEmptyComponent) */}
              {activeTab === 'about' && (
                <View style={styles.aboutTab}>
                  <Text style={[styles.aboutDescription, { color: tc.text.secondary }]}>{channel.description || t('channel.noDescription', 'No description provided.')}</Text>
                  <View style={[styles.aboutMeta, { borderBottomColor: tc.border }]}>
                    <Text style={[styles.aboutMetaLabel, { color: tc.text.secondary }]}>{t('channel.joined')}</Text>
                    <Text style={[styles.aboutMetaValue, { color: tc.text.primary }]}>
                      {formatDistanceToNowStrict(new Date(channel.createdAt), { addSuffix: true, locale: getDateFnsLocale() })}
                    </Text>
                  </View>
                  <View style={[styles.aboutMeta, { borderBottomColor: tc.border }]}>
                    <Text style={[styles.aboutMetaLabel, { color: tc.text.secondary }]}>{t('channel.totalViews')}</Text>
                    <Text style={[styles.aboutMetaValue, { color: tc.text.primary }]}>{formatCount(channel.totalViews ?? 0)}</Text>
                  </View>
                </View>
              )}
            </>
          }
          removeClippedSubviews={true}
          ListEmptyComponent={
            activeTab === 'videos' ? (
              videosQuery.isLoading ? (
                <View style={styles.skeletonVideos}>
                  <Skeleton.Rect width="100%" height={200} borderRadius={radius.sm} />
                  <Skeleton.Rect width="100%" height={60} borderRadius={radius.sm} style={{ marginTop: spacing.sm }} />
                </View>
              ) : (
                <View style={styles.emptyState}>
                  <EmptyState
                    icon="video"
                    title={t('channel.noVideosYet')}
                    subtitle={t('channel.noVideosSubtitle')}
                  />
                </View>
              )
            ) : activeTab === 'playlists' ? (
              playlistsQuery.isLoading ? (
                <View style={styles.skeletonVideos}>
                  <Skeleton.Rect width="100%" height={200} borderRadius={radius.sm} />
                  <Skeleton.Rect width="100%" height={60} borderRadius={radius.sm} style={{ marginTop: spacing.sm }} />
                </View>
              ) : (
                <View style={styles.emptyState}>
                  <EmptyState
                    icon="layers"
                    title={t('channel.noPlaylistsYet')}
                    subtitle={t('channel.noPlaylistsSubtitle')}
                  />
                </View>
              )
            ) : null
          }
          refreshControl={
            <BrandedRefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
          onEndReached={activeTab === 'videos' || activeTab === 'playlists' ? onEndReached : undefined}
          onEndReachedThreshold={0.4}
          showsVerticalScrollIndicator={false}
        />

        {/* More menu bottom sheet */}
        <BottomSheet visible={showMenu} onClose={() => setShowMenu(false)}>
          <View style={[styles.sheetHeader, { borderBottomColor: tc.border }]}>
            <Text style={[styles.sheetTitle, { color: tc.text.secondary }]}>{t('channel.options', 'Channel options')}</Text>
          </View>
          {isOwner && (
            <BottomSheetItem
              label={t('channelTrailer.setTrailer')}
              icon={<Icon name="video" size="sm" color={tc.text.primary} />}
              onPress={() => {
                setShowMenu(false);
                setShowTrailerPicker(true);
              }}
            />
          )}
          {isOwner && !!channel?.trailerVideoId && (
            <BottomSheetItem
              label={t('channelTrailer.removeTrailer')}
              icon={<Icon name="trash" size="sm" color={colors.error} />}
              onPress={() => {
                setShowMenu(false);
                removeTrailerMutation.mutate();
              }}
              destructive
            />
          )}
          <BottomSheetItem
            label={t('channel.reportChannel')}
            icon={<Icon name="flag" size="sm" color={tc.text.primary} />}
            onPress={() => {
              setShowMenu(false);
              handleReport();
            }}
          />
          <BottomSheetItem
            label={t('channel.shareChannel')}
            icon={<Icon name="share" size="sm" color={tc.text.primary} />}
            onPress={() => {
              setShowMenu(false);
              handleShare();
            }}
          />
          <BottomSheetItem
            label={t('common.copyLink')}
            icon={<Icon name="link" size="sm" color={tc.text.primary} />}
            onPress={() => {
              setShowMenu(false);
              handleCopyLink();
            }}
          />
          {isOwner && (
            <>
              <BottomSheetItem
                label={t('settings.edit')}
                icon={<Icon name="pencil" size="sm" color={tc.text.primary} />}
                onPress={() => {
                  setShowMenu(false);
                  navigate('/(screens)/edit-channel', { handle });
                }}
              />
              <BottomSheetItem
                label={t('settings.manage')}
                icon={<Icon name="settings" size="sm" color={tc.text.primary} />}
                onPress={() => {
                  setShowMenu(false);
                  navigate('/(screens)/manage-broadcast', { channelId: channel?.id ?? '' });
                }}
              />
              <BottomSheetItem
                label={t('settings.scheduleLive')}
                icon={<Icon name="globe" size="sm" color={colors.emerald} />}
                onPress={() => {
                  setShowMenu(false);
                  navigate('/(screens)/schedule-live');
                }}
              />
            </>
          )}
        </BottomSheet>

        {/* Share bottom sheet */}
        <BottomSheet visible={showShareSheet} onClose={() => setShowShareSheet(false)}>
          <View style={[styles.sheetHeader, { borderBottomColor: tc.border }]}>
            <Text style={[styles.sheetTitle, { color: tc.text.secondary }]}>{t('channel.shareChannel')}</Text>
          </View>
          <BottomSheetItem
            label={t('common.shareVia')}
            icon={<Icon name="share" size="sm" color={tc.text.primary} />}
            onPress={() => {
              setShowShareSheet(false);
              handleNativeShare();
            }}
          />
          <BottomSheetItem
            label={t('common.copyLink')}
            icon={<Icon name="link" size="sm" color={tc.text.primary} />}
            onPress={() => {
              setShowShareSheet(false);
              handleCopyLink();
            }}
          />
        </BottomSheet>

        {/* Trailer picker bottom sheet (owner only) */}
        <BottomSheet visible={showTrailerPicker} onClose={() => setShowTrailerPicker(false)} snapPoint={0.7}>
          <View style={[styles.sheetHeader, { borderBottomColor: tc.border }]}>
            <Text style={[styles.sheetTitle, { color: tc.text.secondary }]}>{t('channelTrailer.setTrailer')}</Text>
          </View>
          <Text style={[styles.trailerPickerHint, { color: tc.text.secondary }]}>{t('channelTrailer.selectVideo')}</Text>
          {channel?.trailerVideoId && (
            <View style={styles.trailerPickerCurrent}>
              <Icon name="check-circle" size="sm" color={colors.emerald} />
              <Text style={styles.trailerPickerCurrentText}>{t('channelTrailer.currentTrailer')}</Text>
            </View>
          )}
          <FlatList
            data={videos}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => {
              const isCurrentTrailer = channel?.trailerVideoId === item.id;
              const mins = Math.floor(item.duration / 60);
              const secs = Math.floor(item.duration % 60);
              return (
                <Pressable
                  accessibilityRole="button"
                  style={[styles.trailerPickerItem, isCurrentTrailer && styles.trailerPickerItemActive]}
                 
                  onPress={() => {
                    haptic.tick();
                    setTrailerMutation.mutate(item.id);
                  }}
                  disabled={setTrailerMutation.isPending}
                >
                  <View style={[styles.trailerPickerThumbWrap, { backgroundColor: tc.bgCard }]}>
                    {item.thumbnailUrl ? (
                      <ProgressiveImage uri={item.thumbnailUrl} width={100} height={56} contentFit="cover" />
                    ) : (
                      <View style={[styles.trailerPickerThumb, styles.trailerThumbnailPlaceholder, { backgroundColor: tc.bgCard }]}>
                        <Icon name="video" size="sm" color={tc.text.tertiary} />
                      </View>
                    )}
                  </View>
                  <View style={styles.trailerPickerInfo}>
                    <Text style={[styles.trailerPickerTitle, { color: tc.text.primary }]} numberOfLines={2}>{item.title}</Text>
                    <Text style={[styles.trailerPickerMeta, { color: tc.text.tertiary }]}>
                      {mins}:{secs.toString().padStart(2, '0')}
                    </Text>
                  </View>
                  {isCurrentTrailer && (
                    <Icon name="check-circle" size="sm" color={colors.emerald} />
                  )}
                </Pressable>
              );
            }}
            ListEmptyComponent={
              <EmptyState
                icon="video"
                title={t('channel.noVideosYet')}
                subtitle={t('channel.noVideosSubtitle')}
              />
            }
            refreshControl={
              <BrandedRefreshControl refreshing={false} onRefresh={() => videosQuery.refetch()} />
            }
            showsVerticalScrollIndicator={false}
          />
        </BottomSheet>
      </SafeAreaView>

    </ScreenErrorBoundary>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.dark.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
  },
  backBtn: {
    padding: spacing.xs,
  },
  headerTitle: {
    color: colors.text.primary,
    fontSize: fontSize.md,
    fontWeight: '600',
  },
  headerRight: {
    flexDirection: 'row',
    gap: spacing.lg,
  },
  headerAction: {
    padding: spacing.xs,
  },
  banner: {
    width: '100%',
    height: BANNER_HEIGHT,
  },
  bannerPlaceholder: {
  },
  avatarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.base,
    marginTop: -48,
    marginBottom: spacing.md,
  },
  subscribeContainer: {
    marginTop: 48,
  },
  subscribeButton: {
    backgroundColor: colors.emerald,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.full,
  },
  subscribedButton: {
    backgroundColor: colors.dark.surface,
  },
  subscribeText: {
    color: colors.text.primary,
    fontSize: fontSize.sm,
    fontWeight: '600',
  },
  subscribedText: {
    color: colors.text.secondary,
  },
  nameSection: {
    paddingHorizontal: spacing.base,
    marginBottom: spacing.md,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginBottom: 2,
  },
  channelName: {
    color: colors.text.primary,
    fontSize: fontSize.lg,
    fontWeight: '700',
  },
  handle: {
    color: colors.text.secondary,
    fontSize: fontSize.base,
  },
  stats: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    marginBottom: spacing.md,
  },
  statItem: {
    alignItems: 'center',
  },
  statNum: {
    color: colors.text.primary,
    fontSize: fontSize.lg,
    fontWeight: '700',
  },
  statLabel: {
    color: colors.text.secondary,
    fontSize: fontSize.sm,
    marginTop: 2,
  },
  statDivider: {
    width: 1,
    backgroundColor: colors.dark.border,
  },
  descriptionContainer: {
    paddingHorizontal: spacing.base,
    marginBottom: spacing.md,
  },
  descriptionText: {
    color: colors.text.secondary,
    fontSize: fontSize.base,
    lineHeight: fontSize.lg,
  },
  skeletonContent: {
    paddingHorizontal: spacing.base,
  },
  skeletonVideos: {
    paddingHorizontal: spacing.base,
    paddingTop: spacing.sm,
  },
  emptyState: {
    marginTop: spacing.xl,
  },
  aboutTab: {
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.xl,
  },
  aboutDescription: {
    color: colors.text.secondary,
    fontSize: fontSize.base,
    lineHeight: fontSize.lg,
    marginBottom: spacing.lg,
  },
  aboutMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
  },
  aboutMetaLabel: {
    color: colors.text.secondary,
    fontSize: fontSize.base,
  },
  aboutMetaValue: {
    color: colors.text.primary,
    fontSize: fontSize.base,
    fontWeight: '600',
  },
  // Video card styles (copied from minbar.tsx with adjustments)
  videoCard: {
    marginHorizontal: spacing.base,
    marginBottom: spacing.lg,
  },
  thumbnailContainer: {
    position: 'relative',
    borderRadius: radius.md,
    overflow: 'hidden',
    aspectRatio: 16 / 9,
  },
  thumbnail: {
    width: '100%',
    height: '100%',
  },
  thumbnailPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  durationBadge: {
    position: 'absolute',
    bottom: spacing.sm,
    end: spacing.sm,
    backgroundColor: 'rgba(0,0,0,0.8)',
    borderRadius: radius.sm,
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
  },
  durationText: {
    color: colors.text.primary,
    fontSize: fontSize.xs,
    fontWeight: '600',
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginTop: spacing.sm,
    gap: spacing.sm,
  },
  channelAvatar: {
    marginTop: 2,
  },
  videoDetails: {
    flex: 1,
  },
  videoTitle: {
    color: colors.text.primary,
    fontSize: fontSize.base,
    fontWeight: '600',
    marginBottom: 2,
  },
  videoCardChannelName: {
    color: colors.text.secondary,
    fontSize: fontSize.sm,
    marginBottom: 2,
  },
  videoStats: {
    color: colors.text.tertiary,
    fontSize: fontSize.sm,
  },
  moreButton: {
    padding: spacing.xs,
  },
  playlistCard: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: spacing.base,
    marginBottom: spacing.lg,
    padding: spacing.sm,
    borderRadius: radius.md,
  },
  playlistThumbnail: {
    width: 120,
    height: 68,
    borderRadius: radius.sm,
    backgroundColor: colors.dark.bgCard,
  },
  playlistThumbnailPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  playlistInfo: {
    flex: 1,
    marginStart: spacing.sm,
  },
  playlistTitle: {
    color: colors.text.primary,
    fontSize: fontSize.base,
    fontWeight: '600',
    marginBottom: 2,
  },
  playlistMeta: {
    color: colors.text.tertiary,
    fontSize: fontSize.sm,
  },
  sheetHeader: {
    alignItems: 'center',
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
  },
  sheetTitle: {
    color: colors.text.secondary,
    fontSize: fontSize.sm,
    fontWeight: '700',
  },

  // Cinematic banner styles
  bannerContainer: {
    position: 'relative',
  },
  bannerGradient: {
    position: 'absolute',
    top: 0,
    start: 0,
    end: 0,
    bottom: 0,
  },
  bannerPattern: {
    position: 'absolute',
    top: 0,
    start: 0,
    end: 0,
    bottom: 0,
    justifyContent: 'space-evenly',
  },
  bannerPatternLine: {
    height: 1,
    backgroundColor: colors.text.primary,
    marginHorizontal: spacing.lg,
  },

  // Avatar with floating verified badge
  avatarContainer: {
    position: 'relative',
  },
  verifiedBadgeFloating: {
    position: 'absolute',
    bottom: 0,
    end: -4,
    borderRadius: radius.full,
    padding: 2,
  },

  // Name section with gold accent
  nameAccent: {
    marginBottom: spacing.sm,
  },
  nameAccentLine: {
    width: 40,
    height: 3,
    borderRadius: radius.sm,
  },

  // Enhanced stats
  statsEnhanced: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    borderRadius: radius.lg,
    marginHorizontal: spacing.base,
    marginBottom: spacing.md,
  },
  statItemEnhanced: {
    alignItems: 'center',
    gap: spacing.xs,
  },
  statNumEnhanced: {
    color: colors.text.primary,
    fontSize: fontSize.lg,
    fontWeight: '700',
  },
  statLabelEnhanced: {
    color: colors.text.secondary,
    fontSize: fontSize.xs,
    fontWeight: '500',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  statDividerEnhanced: {
    width: 1,
  },

  // Description card
  descriptionCard: {
    marginHorizontal: spacing.base,
    marginBottom: spacing.md,
    borderRadius: radius.lg,
    overflow: 'hidden',
  },
  descriptionGradient: {
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(45,53,72,0.5)',
  },

  // Tabs container
  tabsContainer: {
    marginTop: spacing.sm,
  },

  // Featured video section
  featuredContainer: {
    marginHorizontal: spacing.base,
    marginVertical: spacing.md,
  },
  featuredCard: {
    borderRadius: radius.lg,
    overflow: 'hidden',
  },
  featuredThumbnail: {
    width: '100%',
    height: FEATURED_HEIGHT,
  },
  featuredGradient: {
    position: 'absolute',
    bottom: 0,
    start: 0,
    end: 0,
    height: FEATURED_HEIGHT * 0.6,
    justifyContent: 'flex-end',
    padding: spacing.md,
  },
  featuredContent: {
    gap: spacing.xs,
  },
  featuredBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: spacing.xs,
    backgroundColor: colors.gold,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.sm,
  },
  featuredBadgeText: {
    color: '#0D1117',
    fontSize: fontSizeExt.tiny,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  featuredTitle: {
    color: colors.text.primary,
    fontSize: fontSize.md,
    fontWeight: '700',
  },
  featuredStats: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  featuredStatText: {
    color: colors.text.secondary,
    fontSize: fontSize.sm,
  },
  featuredStatDot: {
    color: colors.text.tertiary,
    fontSize: fontSize.sm,
  },
  featuredDurationBadge: {
    position: 'absolute',
    top: spacing.sm,
    end: spacing.sm,
    backgroundColor: 'rgba(0,0,0,0.8)',
    borderRadius: radius.sm,
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
  },

  // Channel Trailer styles
  trailerContainer: {
    marginHorizontal: spacing.base,
    marginVertical: spacing.md,
  },
  trailerSectionTitle: {
    color: colors.text.primary,
    fontSize: fontSize.md,
    fontWeight: '700',
    marginBottom: spacing.sm,
  },
  trailerCard: {
    borderRadius: radius.lg,
    overflow: 'hidden',
    position: 'relative',
  },
  trailerThumbnail: {
    width: '100%',
    height: FEATURED_HEIGHT,
  },
  trailerThumbnailPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.dark.bgCard,
  },
  trailerGradient: {
    position: 'absolute',
    bottom: 0,
    start: 0,
    end: 0,
    height: FEATURED_HEIGHT * 0.7,
    justifyContent: 'flex-end',
    padding: spacing.md,
  },
  trailerOverlay: {
    alignItems: 'center',
    gap: spacing.sm,
  },
  trailerPlayButton: {
    width: 56,
    height: 56,
    borderRadius: radius.full,
    backgroundColor: 'rgba(10,123,79,0.9)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  trailerTitle: {
    color: colors.text.primary,
    fontSize: fontSize.base,
    fontWeight: '600',
    textAlign: 'center',
  },
  trailerCta: {
    color: colors.gold,
    fontSize: fontSize.sm,
    fontWeight: '600',
    textAlign: 'center',
  },
  trailerDurationBadge: {
    position: 'absolute',
    top: spacing.sm,
    end: spacing.sm,
    backgroundColor: 'rgba(0,0,0,0.8)',
    borderRadius: radius.sm,
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
  },

  // Trailer picker styles
  trailerPickerHint: {
    color: colors.text.secondary,
    fontSize: fontSize.sm,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
  },
  trailerPickerCurrent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.base,
    paddingBottom: spacing.sm,
  },
  trailerPickerCurrentText: {
    color: colors.emerald,
    fontSize: fontSize.sm,
    fontWeight: '600',
  },
  trailerPickerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
  },
  trailerPickerItemActive: {
    backgroundColor: colors.active.emerald10,
  },
  trailerPickerThumbWrap: {
    width: 100,
    height: 56,
    borderRadius: radius.sm,
    overflow: 'hidden',
    backgroundColor: colors.dark.bgCard,
  },
  trailerPickerThumb: {
    width: 100,
    height: 56,
  },
  trailerPickerInfo: {
    flex: 1,
  },
  trailerPickerTitle: {
    color: colors.text.primary,
    fontSize: fontSize.sm,
    fontWeight: '600',
    marginBottom: 2,
  },
  trailerPickerMeta: {
    color: colors.text.tertiary,
    fontSize: fontSize.xs,
  },
});