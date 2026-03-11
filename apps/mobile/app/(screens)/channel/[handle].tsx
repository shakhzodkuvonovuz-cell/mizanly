import { useState, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, Image,
  RefreshControl, FlatList, Dimensions, Pressable, Alert, Share,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery, useMutation, useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Clipboard from 'expo-clipboard';
import { useUser } from '@clerk/clerk-expo';
import { Avatar } from '@/components/ui/Avatar';
import { Icon } from '@/components/ui/Icon';
import { VerifiedBadge } from '@/components/ui/VerifiedBadge';
import { TabSelector } from '@/components/ui/TabSelector';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { BottomSheet, BottomSheetItem } from '@/components/ui/BottomSheet';
import { GlassHeader } from '@/components/ui/GlassHeader';
import { GradientButton } from '@/components/ui/GradientButton';
import { useHaptic } from '@/hooks/useHaptic';
import { colors, spacing, fontSize, radius } from '@/theme';
import { channelsApi, videosApi, playlistsApi } from '@/services/api';
import type { Video, Playlist } from '@/types';
import { formatDistanceToNowStrict } from 'date-fns';

const BANNER_HEIGHT = Dimensions.get('window').width / 3; // 3:1 ratio

type Tab = 'videos' | 'playlists' | 'about';

const CHANNEL_TABS = [
  { key: 'videos', label: 'Videos' },
  { key: 'playlists', label: 'Playlists' },
  { key: 'about', label: 'About' },
];

function VideoCard({ video }: { video: Video }) {
  const router = useRouter();
  const haptic = useHaptic();
  const durationMinutes = Math.floor(video.duration / 60);
  const durationSeconds = Math.floor(video.duration % 60);
  const durationText = `${durationMinutes}:${durationSeconds.toString().padStart(2, '0')}`;

  const handlePress = () => {
    haptic.light();
    router.push(`/(screens)/video/${video.id}`);
  };

  const handleChannelPress = () => {
    haptic.light();
    router.push(`/(screens)/channel/${video.channel.handle}`);
  };

  return (
    <TouchableOpacity style={styles.videoCard} activeOpacity={0.8} onPress={handlePress}>
      {/* Thumbnail */}
      <View style={styles.thumbnailContainer}>
        {video.thumbnailUrl ? (
          <Image source={{ uri: video.thumbnailUrl }} style={styles.thumbnail} />
        ) : (
          <View style={[styles.thumbnail, styles.thumbnailPlaceholder]}>
            <Icon name="video" size="lg" color={colors.text.secondary} />
          </View>
        )}
        <View style={styles.durationBadge}>
          <Text style={styles.durationText}>{durationText}</Text>
        </View>
      </View>

      {/* Info row */}
      <View style={styles.infoRow}>
        <TouchableOpacity style={styles.channelAvatar} onPress={handleChannelPress} hitSlop={8}>
          <Avatar
            uri={video.channel.avatarUrl}
            name={video.channel.name}
            size="sm"
            showRing={false}
          />
        </TouchableOpacity>
        <View style={styles.videoDetails}>
          <Text style={styles.videoTitle} numberOfLines={2}>{video.title}</Text>
          <Text style={styles.channelName} numberOfLines={1}>{video.channel.name}</Text>
          <Text style={styles.videoStats} numberOfLines={1}>
            {video.viewsCount.toLocaleString()} views • {formatDistanceToNowStrict(new Date(video.publishedAt || video.createdAt), { addSuffix: true })}
          </Text>
        </View>
        <TouchableOpacity style={styles.moreButton} hitSlop={8}>
          <Icon name="more-horizontal" size="sm" color={colors.text.secondary} />
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );
}

function PlaylistCard({ playlist }: { playlist: Playlist }) {
  const router = useRouter();
  const haptic = useHaptic();

  const handlePress = () => {
    haptic.light();
    router.push(`/(screens)/playlist/${playlist.id}`);
  };

  return (
    <TouchableOpacity style={styles.playlistCard} onPress={handlePress}>
      {playlist.thumbnailUrl ? (
        <Image source={{ uri: playlist.thumbnailUrl }} style={styles.playlistThumbnail} />
      ) : (
        <View style={[styles.playlistThumbnail, styles.playlistThumbnailPlaceholder]}>
          <Icon name="layers" size="lg" color={colors.text.tertiary} />
        </View>
      )}
      <View style={styles.playlistInfo}>
        <Text style={styles.playlistTitle} numberOfLines={2}>{playlist.title}</Text>
        <Text style={styles.playlistMeta}>{playlist.videosCount} videos</Text>
      </View>
    </TouchableOpacity>
  );
}

export default function ChannelScreen() {
  const { handle } = useLocalSearchParams<{ handle: string }>();
  const router = useRouter();
  const { user } = useUser();
  const haptic = useHaptic();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<Tab>('videos');
  const [refreshing, setRefreshing] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [showShareSheet, setShowShareSheet] = useState(false);

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
  queryFn: ({ pageParam }) => playlistsApi.getByChannel(channel!.id, pageParam),
  initialPageParam: undefined as string | undefined,
  getNextPageParam: (last) => last.meta?.hasMore ? last.meta.cursor ?? undefined : undefined,
  enabled: activeTab === 'playlists' && !!channel,
});

const playlists: Playlist[] = playlistsQuery.data?.pages.flatMap((p) => p.data) ?? [];

  const subscribeMutation = useMutation({
    mutationFn: () => channel?.isSubscribed ? channelsApi.unsubscribe(handle) : channelsApi.subscribe(handle),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['channel', handle] }),
  });

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
    haptic.light();
    subscribeMutation.mutate();
  };

  const handleShare = () => {
    haptic.light();
    setShowShareSheet(true);
  };

  const handleReport = () => {
    haptic.light();
    router.push(`/(screens)/report?type=channel&id=${channel?.id}`);
  };

  const handleCopyLink = async () => {
    haptic.light();
    await Clipboard.setStringAsync(`mizanly://channel/${channel.handle}`);
    Alert.alert('Copied', 'Channel link copied to clipboard');
  };

  const handleNativeShare = async () => {
    haptic.light();
    await Share.share({
      message: `Check out ${channel.name} on Mizanly`,
      url: `mizanly://channel/${channel.handle}`,
    });
  };

  const renderVideoItem = ({ item }: { item: Video }) => <VideoCard video={item} />;

  const ListHeader = useMemo(() => (
    <View>
      {/* Banner */}
      {channel?.bannerUrl ? (
        <Image source={{ uri: channel.bannerUrl }} style={styles.banner} />
      ) : (
        <View style={[styles.banner, styles.bannerPlaceholder]} />
      )}

      {/* Avatar row */}
      <View style={styles.avatarRow}>
        <Avatar uri={channel?.avatarUrl} name={channel?.name || ''} size="2xl" />
        <View style={styles.subscribeContainer}>
          <GradientButton
            label={channel?.isSubscribed ? 'Subscribed' : 'Subscribe'}
            variant={channel?.isSubscribed ? 'secondary' : 'primary'}
            size="sm"
            onPress={handleSubscribe}
            disabled={subscribeMutation.isPending}
            loading={subscribeMutation.isPending}
          />
        </View>
      </View>

      {/* Name + handle */}
      <View style={styles.nameSection}>
        <View style={styles.nameRow}>
          <Text style={styles.channelName}>{channel?.name}</Text>
          {channel?.isVerified && <VerifiedBadge size={18} />}
        </View>
        <Text style={styles.handle}>@{handle}</Text>
      </View>

      {/* Stats */}
      <View style={styles.stats}>
        <View style={styles.statItem}>
          <Text style={styles.statNum}>{channel?.subscribersCount.toLocaleString() || '0'}</Text>
          <Text style={styles.statLabel}>subscribers</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Text style={styles.statNum}>{channel?.videosCount.toLocaleString() || '0'}</Text>
          <Text style={styles.statLabel}>videos</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Text style={styles.statNum}>{channel?.totalViews.toLocaleString() || '0'}</Text>
          <Text style={styles.statLabel}>views</Text>
        </View>
      </View>

      {/* Description */}
      {channel?.description && (
        <View style={styles.descriptionContainer}>
          <Text style={styles.descriptionText}>{channel.description}</Text>
        </View>
      )}

      {/* Tabs */}
      <TabSelector
        tabs={CHANNEL_TABS}
        activeKey={activeTab}
        onTabChange={(key) => setActiveTab(key as Tab)}
      />
    </View>
  ), [channel, handle, subscribeMutation.isPending]);

  if (channelQuery.isLoading) {
    return (
      <View style={styles.container}>
        <GlassHeader
          leftAction={{ icon: 'arrow-left', onPress: () => router.back(), accessibilityLabel: 'Go back' }}
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
      <View style={styles.container}>
        <GlassHeader
          leftAction={{ icon: 'arrow-left', onPress: () => router.back(), accessibilityLabel: 'Back' }}
        />
        <EmptyState
          icon="slash"
          title="Something went wrong"
          subtitle="Could not load this content. Please try again."
          actionLabel="Go back"
          onAction={() => router.back()}
        />
      </View>
    );
  }

  if (!channel) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} hitSlop={8}>
            <Icon name="arrow-left" size="md" color={colors.text.primary} />
          </Pressable>
        </View>
        <EmptyState
          icon="video"
          title="Channel not found"
          subtitle="This channel may have been removed or is unavailable"
          actionLabel="Go back"
          onAction={() => router.back()}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={8} style={styles.backBtn}>
          <Icon name="arrow-left" size="md" color={colors.text.primary} />
        </Pressable>
        <Text style={styles.headerTitle}>@{handle}</Text>
        <View style={styles.headerRight}>
          <Pressable hitSlop={8} onPress={handleShare} style={styles.headerAction}>
            <Icon name="share" size="sm" color={colors.text.primary} />
          </Pressable>
          <Pressable hitSlop={8} onPress={() => setShowMenu(true)} style={styles.headerAction}>
            <Icon name="more-horizontal" size="sm" color={colors.text.primary} />
          </Pressable>
        </View>
      </View>

      <FlatList
        data={activeTab === 'videos' ? videos : activeTab === 'playlists' ? playlists : []}
        keyExtractor={(item) => item.id}
        renderItem={activeTab === 'videos' ? renderVideoItem : activeTab === 'playlists' ? ({ item }) => <PlaylistCard playlist={item} /> : undefined}
        ListHeaderComponent={ListHeader}
        removeClippedSubviews={true}
        ListEmptyComponent={
          activeTab === 'videos' ? (
            videosQuery.isLoading ? (
              <View style={styles.skeletonVideos}>
                <Skeleton.Rect width="100%" height={200} borderRadius={radius.sm} />
                <Skeleton.Rect width="100%" height={60} borderRadius={radius.sm} style={{ marginTop: spacing.sm }} />
              </View>
            ) : (
              <EmptyState
                icon="video"
                title="No videos yet"
                subtitle="This channel hasn't uploaded any videos"
                style={styles.emptyState}
              />
            )
          ) : activeTab === 'playlists' ? (
            playlistsQuery.isLoading ? (
              <View style={styles.skeletonVideos}>
                <Skeleton.Rect width="100%" height={200} borderRadius={radius.sm} />
                <Skeleton.Rect width="100%" height={60} borderRadius={radius.sm} style={{ marginTop: spacing.sm }} />
              </View>
            ) : (
              <EmptyState
                icon="layers"
                title="No playlists yet"
                subtitle="This channel hasn't created any playlists"
                style={styles.emptyState}
              />
            )
          ) : (
            <View style={styles.aboutTab}>
              <Text style={styles.aboutDescription}>{channel.description || 'No description provided.'}</Text>
              <View style={styles.aboutMeta}>
                <Text style={styles.aboutMetaLabel}>Joined</Text>
                <Text style={styles.aboutMetaValue}>
                  {formatDistanceToNowStrict(new Date(channel.createdAt), { addSuffix: true })}
                </Text>
              </View>
              <View style={styles.aboutMeta}>
                <Text style={styles.aboutMetaLabel}>Total views</Text>
                <Text style={styles.aboutMetaValue}>{channel.totalViews.toLocaleString()}</Text>
              </View>
            </View>
          )
        }
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.emerald} />
        }
        onEndReached={activeTab === 'videos' || activeTab === 'playlists' ? onEndReached : undefined}
        onEndReachedThreshold={0.4}
        showsVerticalScrollIndicator={false}
      />

      {/* More menu bottom sheet */}
      <BottomSheet visible={showMenu} onClose={() => setShowMenu(false)}>
        <View style={styles.sheetHeader}>
          <Text style={styles.sheetTitle}>Channel options</Text>
        </View>
        <BottomSheetItem
          label="Report channel"
          icon={<Icon name="flag" size="sm" color={colors.text.primary} />}
          onPress={() => {
            setShowMenu(false);
            handleReport();
          }}
        />
        <BottomSheetItem
          label="Share channel"
          icon={<Icon name="share" size="sm" color={colors.text.primary} />}
          onPress={() => {
            setShowMenu(false);
            handleShare();
          }}
        />
        <BottomSheetItem
          label="Copy link"
          icon={<Icon name="link" size="sm" color={colors.text.primary} />}
          onPress={() => {
            setShowMenu(false);
            handleCopyLink();
          }}
        />
      </BottomSheet>

      {/* Share bottom sheet */}
      <BottomSheet visible={showShareSheet} onClose={() => setShowShareSheet(false)}>
        <View style={styles.sheetHeader}>
          <Text style={styles.sheetTitle}>Share channel</Text>
        </View>
        <BottomSheetItem
          label="Share via..."
          icon={<Icon name="share" size="sm" color={colors.text.primary} />}
          onPress={() => {
            setShowShareSheet(false);
            handleNativeShare();
          }}
        />
        <BottomSheetItem
          label="Copy link"
          icon={<Icon name="link" size="sm" color={colors.text.primary} />}
          onPress={() => {
            setShowShareSheet(false);
            handleCopyLink();
          }}
        />
      </BottomSheet>
    </SafeAreaView>
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
    backgroundColor: colors.dark.bgElevated,
  },
  bannerPlaceholder: {
    backgroundColor: colors.dark.surface,
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
    borderColor: colors.dark.border,
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
    borderBottomColor: colors.dark.border,
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
    backgroundColor: colors.dark.surface,
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
    right: spacing.sm,
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
  channelName: {
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
    backgroundColor: colors.dark.surface,
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
    marginLeft: spacing.sm,
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
    borderBottomColor: colors.dark.border,
  },
  sheetTitle: {
    color: colors.text.secondary,
    fontSize: fontSize.sm,
    fontWeight: '700',
  },
});