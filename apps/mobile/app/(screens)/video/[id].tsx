import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert, Share,
  RefreshControl, TextInput, KeyboardAvoidingView, Platform, AppState, Dimensions,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useUser } from '@clerk/clerk-expo';
import { Video, ResizeMode, AVPlaybackStatus } from 'expo-av';
import { formatDistanceToNowStrict } from 'date-fns';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withSequence,
  withDelay,
  withTiming,
  interpolate,
  FadeIn,
  FadeInUp,
  FadeOut,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { Avatar } from '@/components/ui/Avatar';
import { Icon } from '@/components/ui/Icon';
import { Badge } from '@/components/ui/Badge';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { BottomSheet, BottomSheetItem } from '@/components/ui/BottomSheet';
import { GlassHeader } from '@/components/ui/GlassHeader';
import { ActionButton } from '@/components/ui/ActionButton';
import { useHaptic } from '@/hooks/useHaptic';
import { colors, spacing, fontSize, radius } from '@/theme';
import { videosApi, channelsApi } from '@/services/api';
import { useTranslation } from '@/hooks/useTranslation';
import { VideoControls, type VideoQuality, type PlaybackSpeed } from '@/components/ui/VideoControls';
import { useStore } from '@/store';
import type { Video as VideoType, VideoComment, VideoChapter } from '@/types';
import { ScreenErrorBoundary } from '@/components/ui/ScreenErrorBoundary';

const { width: SCREEN_WIDTH } = Dimensions.get('window');


export default function VideoDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user } = useUser();
  const haptic = useHaptic();
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const videoRef = useRef<Video>(null);
  const progressRef = useRef(0);
  const [refreshing, setRefreshing] = useState(false);
  const [commentSheetOpen, setCommentSheetOpen] = useState(false);
  const [commentText, setCommentText] = useState('');
  const [replyToId, setReplyToId] = useState<string | undefined>();
  const [showMenu, setShowMenu] = useState(false);
  const [showChapters, setShowChapters] = useState(false);
  const [likeBursts, setLikeBursts] = useState<{ id: string; x: number; y: number }[]>([]);

  // Video controls state
  const [quality, setQuality] = useState<VideoQuality>('720p');
  const [speed, setSpeed] = useState<PlaybackSpeed>(1);
  const [volume, setVolume] = useState(1);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);
  const [showVideoControls, setShowVideoControls] = useState(false);

  // Clear mode state
  const [clearMode, setClearMode] = useState(false);
  const clearModeToastShown = useRef(false);
  const overlayOpacity = useSharedValue(1);

  const overlayAnimatedStyle = useAnimatedStyle(() => ({
    opacity: overlayOpacity.value,
  }));

  const handleClearModeToggle = useCallback(() => {
    setClearMode((prev) => {
      const next = !prev;
      overlayOpacity.value = withTiming(next ? 0 : 1, { duration: 300 });
      if (!clearModeToastShown.current) {
        clearModeToastShown.current = true;
        Alert.alert(
          '',
          next ? t('clearMode.hide') : t('clearMode.show'),
          [{ text: 'OK' }],
          { cancelable: true }
        );
      }
      return next;
    });
  }, [t, overlayOpacity]);

  // Store selectors for mini player
  const miniPlayerVideo = useStore(s => s.miniPlayerVideo);
  const miniPlayerProgress = useStore(s => s.miniPlayerProgress);
  const miniPlayerPlaying = useStore(s => s.miniPlayerPlaying);
  const setMiniPlayerVideo = useStore(s => s.setMiniPlayerVideo);
  const setMiniPlayerProgress = useStore(s => s.setMiniPlayerProgress);
  const setMiniPlayerPlaying = useStore(s => s.setMiniPlayerPlaying);
  const closeMiniPlayer = useStore(s => s.closeMiniPlayer);

  // Close mini player if opening the same video that is already in the mini player
  useEffect(() => {
    const currentMiniVideo = useStore.getState().miniPlayerVideo;
    if (currentMiniVideo?.id === id) {
      useStore.getState().closeMiniPlayer();
    }
  }, [id]);

  // Back handler: when user presses back while video is playing, shrink to mini player
  const handleBack = useCallback(() => {
    if (isPlaying && video) {
      const store = useStore.getState();
      store.setMiniPlayerVideo({
        id: video.id,
        title: video.title,
        channelName: video.channel?.name || '',
        thumbnailUri: video.thumbnailUrl || undefined,
        videoUrl: video.hlsUrl || video.videoUrl,
      });
      store.setMiniPlayerPlaying(true);
      store.setMiniPlayerProgress(progressRef.current);
    }
    router.back();
  }, [isPlaying, video, router]);

  // Animated scroll value for parallax effect
  const scrollY = useSharedValue(0);
  const headerOpacity = useSharedValue(1);

  // Like burst animation handler
  const handleVideoDoubleTap = (e: any) => {
    const { locationX, locationY } = e.nativeEvent;
    const id = Date.now().toString();
    setLikeBursts(prev => [...prev, { id, x: locationX, y: locationY }]);
    haptic.light();
    handleLike();
    setTimeout(() => {
      setLikeBursts(prev => prev.filter(b => b.id !== id));
    }, 1000);
  };

  // Fetch video
  const videoQuery = useQuery({
    queryKey: ['video', id],
    queryFn: () => videosApi.getById(id),
    enabled: !!id,
  });

  // Fetch comments
  const commentsQuery = useQuery({
    queryKey: ['video-comments', id],
    queryFn: () => videosApi.getComments(id).then(res => res.data),
    enabled: !!id,
  });

  const video = videoQuery.data;
  const comments = commentsQuery.data ?? [];

  // Set duration when video loads
  useEffect(() => {
    if (video?.duration) {
      setDuration(video.duration);
    }
  }, [video?.duration]);

  // Update mini player progress when video progresses
  useEffect(() => {
    if (video && miniPlayerVideo && video.id === miniPlayerVideo.id) {
      setMiniPlayerProgress(progressRef.current);
      setMiniPlayerPlaying(isPlaying);
    }
  }, [currentTime, isPlaying, video, miniPlayerVideo]);

  const chapters = video?.chapters ?? [];

  // Record view on mount
  useEffect(() => {
    if (video?.id && user?.id) {
       videosApi.view(video.id).catch(() => {});
    }
  }, [video?.id, user?.id]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([videoQuery.refetch(), commentsQuery.refetch()]);
    setRefreshing(false);
  }, [videoQuery, commentsQuery]);

  // Mutations
  const likeMutation = useMutation({
    mutationFn: () => videosApi.like(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['video', id] }),
  });

  const dislikeMutation = useMutation({
    mutationFn: () => videosApi.dislike(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['video', id] }),
  });

  const removeReactionMutation = useMutation({
    mutationFn: () => videosApi.removeReaction(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['video', id] }),
  });

  const bookmarkMutation = useMutation({
    mutationFn: () => video?.isBookmarked ? videosApi.unbookmark(id) : videosApi.bookmark(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['video', id] }),
  });

  const subscribeMutation = useMutation({
    mutationFn: () => video?.channel && (video.isSubscribed ? channelsApi.unsubscribe(video.channel.handle) : channelsApi.subscribe(video.channel.handle)),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['video', id] }),
  });

  const commentMutation = useMutation({
    mutationFn: () => videosApi.comment(id, commentText, replyToId),
    onSuccess: () => {
      setCommentText('');
      setReplyToId(undefined);
      queryClient.invalidateQueries({ queryKey: ['video-comments', id] });
    },
  });

  const handlePlaybackStatusUpdate = useCallback((status: AVPlaybackStatus) => {
    if (status.isLoaded) {
      if (status.durationMillis && status.durationMillis > 0) {
        setDuration(status.durationMillis / 1000);
      }
      if (status.positionMillis !== undefined) {
        setCurrentTime(status.positionMillis / 1000);
        if (status.durationMillis && status.durationMillis > 0) {
          const progress = status.positionMillis / status.durationMillis;
          if (Number.isFinite(progress)) {
            progressRef.current = progress;
          }
        }
      }
      setIsPlaying(status.isPlaying ?? false);
    }
  }, []);

  const handlePlayPause = useCallback(() => {
    if (isPlaying) {
      videoRef.current?.pauseAsync();
    } else {
      videoRef.current?.playAsync();
    }
  }, [isPlaying]);

  const handleSeek = useCallback((time: number) => {
    videoRef.current?.setPositionAsync(time * 1000);
  }, []);

  const handleQualityChange = useCallback((q: VideoQuality) => {
    setQuality(q);
    // TODO: switch video source based on quality
  }, []);

  const handleSpeedChange = useCallback((s: PlaybackSpeed) => {
    setSpeed(s);
    videoRef.current?.setRateAsync(s, true);
  }, []);

  const handleVolumeChange = useCallback((v: number) => {
    setVolume(v);
    videoRef.current?.setVolumeAsync(v);
  }, []);

  const handleMinimize = useCallback(() => {
    if (video) {
      setMiniPlayerVideo({
        id: video.id,
        title: video.title,
        channelName: video.channel.name,
        thumbnailUri: video.thumbnailUrl,
        videoUrl: video.videoUrl,
      });
      setMiniPlayerProgress(progressRef.current);
      setMiniPlayerPlaying(isPlaying);
      // Optionally navigate away? Or just keep video screen open
    }
  }, [video, isPlaying]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const seekToChapter = (startTime: number) => {
    videoRef.current?.setPositionAsync(startTime * 1000);
    setShowChapters(false);
  };

  const saveProgress = useCallback(() => {
    const progress = progressRef.current;
    if (progress > 0) {
      const completed = progress > 0.9;
      videosApi.updateProgress(id, progress, completed).catch(() => {});
    }
  }, [id]);

  // Save progress on unmount
  useEffect(() => {
    return () => {
      saveProgress();
    };
  }, [saveProgress]);

  // Save progress when app backgrounds
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'background' || state === 'inactive') {
        saveProgress();
      }
    });
    return () => sub.remove();
  }, [saveProgress]);

  const handleLike = () => {
    haptic.light();
    if (video?.isLiked) {
      removeReactionMutation.mutate();
    } else {
      likeMutation.mutate();
    }
  };

  const handleDislike = () => {
    haptic.light();
    if (video?.isDisliked) {
      removeReactionMutation.mutate();
    } else {
      dislikeMutation.mutate();
    }
  };

  const handleBookmark = () => {
    haptic.light();
    bookmarkMutation.mutate();
  };

  const handleSubscribe = () => {
    haptic.light();
    subscribeMutation.mutate();
  };

  const handleShare = useCallback(async () => {
    haptic.light();
    if (!video) return;
    try {
      await Share.share({
        message: `${video.title}\n\nWatch on Mizanly`,
        url: `mizanly://video/${video.id}`,
      });
    } catch {
      // User cancelled — no action needed
    }
  }, [video]);

  const handleReport = () => {
    haptic.light();
    router.push(`/(screens)/report?type=video&id=${id}`);
  };

  const handleChannelPress = () => {
    if (video?.channel.handle) {
      router.push(`/(screens)/channel/${video.channel.handle}`);
    }
  };

  const handleCommentSubmit = () => {
    if (commentText.trim()) {
      commentMutation.mutate();
    }
  };

  const durationMinutes = video ? Math.floor(video.duration / 60) : 0;
  const durationSeconds = video ? Math.floor(video.duration % 60) : 0;
  const durationText = `${durationMinutes}:${durationSeconds.toString().padStart(2, '0')}`;

  // Animated like burst component
  function LikeBurst({ x, y }: { x: number; y: number }) {
    const scaleAnim = useSharedValue(0);
    const opacityAnim = useSharedValue(1);
    const translateY = useSharedValue(0);

    useEffect(() => {
      scaleAnim.value = withSequence(
        withSpring(1.5, { damping: 10, stiffness: 200 }),
        withSpring(1, { damping: 15, stiffness: 300 })
      );
      translateY.value = withTiming(-80, { duration: 800 });
      opacityAnim.value = withDelay(400, withTiming(0, { duration: 400 }));
    }, []);

    const animatedStyle = useAnimatedStyle(() => ({
      transform: [
        { translateX: x - 40 },
        { translateY: y + translateY.value - 40 },
        { scale: scaleAnim.value },
      ],
      opacity: opacityAnim.value,
    }));

    return (
      <Animated.View style={[styles.likeBurst, animatedStyle]}>
        <Icon name="heart-filled" size={80} color="rgba(248,81,73,0.9)" />
      </Animated.View>
    );
  }

  // Chapter marker with progress indicator
  function ChapterMarker({ chapter, index, total, currentProgress }: { chapter: VideoChapter; index: number; total: number; currentProgress: number }) {
    const progressPercent = ((chapter.startTime / (video?.duration || 1)) * 100);
    const isPast = currentProgress > (chapter.startTime / (video?.duration || 1));
    const isCurrent = Math.abs(currentProgress - (chapter.startTime / (video?.duration || 1))) < 0.05;

    return (
      <TouchableOpacity
        style={[
          styles.chapterMarker,
          isCurrent && styles.chapterMarkerActive,
          isPast && styles.chapterMarkerPast,
        ]}
        onPress={() => seekToChapter(chapter.startTime)}
      >
        <View style={styles.chapterMarkerLine}>
          <LinearGradient
            colors={isCurrent ? [colors.gold, colors.emerald] : isPast ? [colors.emerald, colors.emerald] : ['rgba(110,119,129,0.5)', 'rgba(110,119,129,0.3)']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[styles.chapterMarkerDot, isCurrent && styles.chapterMarkerDotActive]}
          />
        </View>
        <View style={styles.chapterMarkerInfo}>
          <Text style={[styles.chapterMarkerTitle, isCurrent && styles.chapterMarkerTitleActive]}>
            {chapter.title}
          </Text>
          <Text style={styles.chapterMarkerTime}>{formatTime(chapter.startTime)}</Text>
        </View>
        {isCurrent && (
          <Animated.View entering={FadeIn} style={styles.nowPlayingBadge}>
            <Text style={styles.nowPlayingText}>{t('video.nowPlaying')}</Text>
          </Animated.View>
        )}
      </TouchableOpacity>
    );
  }

  const renderCommentItem = ({ item }: { item: VideoComment }) => (
    <View style={styles.commentItem}>
      <Avatar
        uri={item.user.avatarUrl}
        name={item.user.username}
        size="sm"
        showRing={false}
      />
      <View style={styles.commentContent}>
        <Text style={styles.commentUsername}>{item.user.username}</Text>
        <Text style={styles.commentText}>{item.content}</Text>
        <View style={styles.commentFooter}>
          <Text style={styles.commentTime}>
            {formatDistanceToNowStrict(new Date(item.createdAt), { addSuffix: true })}
          </Text>
          <TouchableOpacity 
            onPress={() => setReplyToId(item.id)}
            accessibilityLabel={t('comments.replyTo', { username: item.user.username })}
            accessibilityRole="button"
          >
            <Text style={styles.commentAction}>{t('common.reply')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );

  if (videoQuery.isLoading) {
    return (
      <View style={styles.container}>
        <GlassHeader
          leftAction={{ icon: 'arrow-left', onPress: () => router.back(), accessibilityLabel: t('common.goBack') }}
        />
        <Skeleton.Rect width="100%" aspectRatio={16/9} borderRadius={0} style={{ marginTop: 88 }} />
        <View style={styles.skeletonContent}>
          <Skeleton.Rect width="80%" height={24} borderRadius={radius.sm} />
          <Skeleton.Rect width="40%" height={16} borderRadius={radius.sm} style={{ marginTop: spacing.sm }} />
          <Skeleton.Rect width="100%" height={60} borderRadius={radius.sm} style={{ marginTop: spacing.lg }} />
          <Skeleton.Rect width="100%" height={80} borderRadius={radius.sm} style={{ marginTop: spacing.lg }} />
        </View>
      </View>
    );
  }

  if (videoQuery.isError) {
    return (
      <View style={styles.container}>
        <GlassHeader
          leftAction={{ icon: 'arrow-left', onPress: () => router.back(), accessibilityLabel: t('common.goBack') }}
        />
        <View style={{ marginTop: 88 }}>
          <EmptyState
            icon="slash"
            title={t('common.error')}
            subtitle={t('errors.loadContentFailed')}
            actionLabel={t('common.goBack')}
            onAction={() => router.back()}
          />
        </View>
      </View>
    );
  }

  if (!video) {
    return (
      <View style={styles.container}>
        <GlassHeader
          leftAction={{ icon: 'arrow-left', onPress: () => router.back(), accessibilityLabel: t('common.goBack') }}
        />
        <View style={{ marginTop: 88 }}>
          <EmptyState
            icon="video"
            title={t('video.notFound')}
            subtitle={t('video.notFoundSubtitle')}
            actionLabel={t('common.goBack')}
            onAction={() => router.back()}
          />
        </View>
      </View>
    );
  }

  return (
    <ScreenErrorBoundary>
      <View style={styles.container}>
        <GlassHeader
          title={t('video.title')}
          leftAction={{ icon: 'arrow-left', onPress: handleBack, accessibilityLabel: t('common.goBack') }}
          rightActions={[
            { icon: 'share', onPress: handleShare, accessibilityLabel: t('common.share') },
            { icon: 'flag', onPress: handleReport, accessibilityLabel: t('common.report') },
            { icon: 'more-horizontal', onPress: () => setShowMenu(true), accessibilityLabel: t('common.moreOptions') },
          ]}
        />

        <ScrollView
          style={{ marginTop: 88 }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.emerald} />
          }
          showsVerticalScrollIndicator={false}
          onScroll={(e) => {
            scrollY.value = e.nativeEvent.contentOffset.y;
          }}
          scrollEventThrottle={16}
        >
          {/* Cinematic Video Player with gradient overlay */}
          <View style={styles.videoContainer}>
            <TouchableOpacity
              activeOpacity={1}
              onPress={handleClearModeToggle}
              style={styles.videoWrapper}
            >
              <Video
                ref={videoRef}
                source={{ uri: video.hlsUrl || video.videoUrl }}
                style={styles.videoPlayer}
                resizeMode={ResizeMode.CONTAIN}
                useNativeControls={false}
                shouldPlay={isPlaying}
                rate={speed}
                volume={volume}
                isMuted={volume === 0}
                isLooping={video.isLooping ?? false}
                onPlaybackStatusUpdate={handlePlaybackStatusUpdate}
              />
              <VideoControls
                isPlaying={isPlaying}
                currentTime={currentTime}
                duration={duration}
                quality={quality}
                speed={speed}
                volume={volume}
                onPlayPause={handlePlayPause}
                onSeek={handleSeek}
                onQualityChange={handleQualityChange}
                onSpeedChange={handleSpeedChange}
                onVolumeChange={handleVolumeChange}
                onMinimize={handleMinimize}
              />

              {/* Cinematic gradient overlays */}
              <LinearGradient
                colors={['rgba(13,17,23,0.8)', 'transparent', 'transparent', 'rgba(13,17,23,0.6)']}
                locations={[0, 0.2, 0.8, 1]}
                style={styles.videoGradientOverlay}
              />

              {/* Like burst animations */}
              {likeBursts.map(burst => (
                <LikeBurst key={burst.id} x={burst.x} y={burst.y} />
              ))}

              {/* Cinematic title overlay (fades on scroll) */}
              <Animated.View style={[styles.videoTitleOverlay, overlayAnimatedStyle]}>
                <LinearGradient
                  colors={['transparent', 'rgba(13,17,23,0.9)']}
                  style={styles.videoTitleGradient}
                >
                  <Text style={styles.videoTitleCinematic} numberOfLines={2}>
                    {video.title}
                  </Text>
                </LinearGradient>
              </Animated.View>
            </TouchableOpacity>
          </View>

          {/* Title & stats with cinematic styling */}
          <Animated.View style={[styles.content, overlayAnimatedStyle]}>
            {/* Gold accent divider */}
            <View style={styles.titleAccentContainer}>
              <LinearGradient
                colors={[colors.gold, colors.emerald, 'transparent']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.titleAccentLine}
              />
              <View style={styles.titleAccentDot} />
            </View>

            <Text style={styles.videoTitle}>{video.title}</Text>

            {/* Enhanced stats row with icons */}
            <View style={styles.videoStatsRow}>
              <View style={styles.statItem}>
                <Icon name="eye" size="xs" color={colors.text.secondary} />
                <Text style={styles.videoStatText}>{video.viewsCount.toLocaleString()}</Text>
              </View>
              <Text style={styles.statDivider}>•</Text>
              <View style={styles.statItem}>
                <Icon name="clock" size="xs" color={colors.text.secondary} />
                <Text style={styles.videoStatText}>
                  {formatDistanceToNowStrict(new Date(video.publishedAt || video.createdAt), { addSuffix: true })}
                </Text>
              </View>
              <Text style={styles.statDivider}>•</Text>
              <View style={styles.statItem}>
                <Icon name="bar-chart-2" size="xs" color={colors.gold} />
                <Text style={styles.videoStatTextGold}>{durationText}</Text>
              </View>
            </View>

            {/* Action row */}
            <View style={styles.actionRow}>
              <ActionButton
                icon={<Icon name="heart" size="md" color={colors.text.primary} />}
                activeIcon={<Icon name="heart-filled" size="md" color={colors.error} />}
                isActive={video.isLiked}
                count={video.likesCount}
                onPress={handleLike}
                activeColor={colors.error}
                accessibilityLabel="Like"
              />
              <ActionButton
                icon={<Icon name="thumbs-down" size="md" color={colors.text.primary} />}
                activeIcon={<Icon name="thumbs-down" size="md" color={colors.error} />}
                isActive={video.isDisliked}
                count={video.dislikesCount}
                onPress={handleDislike}
                activeColor={colors.error}
                accessibilityLabel="Dislike"
              />
              <ActionButton
                icon={<Icon name="message-circle" size="md" color={colors.text.primary} />}
                count={video.commentsCount}
                onPress={() => setCommentSheetOpen(true)}
                accessibilityLabel="Comments"
              />
              <ActionButton
                icon={<Icon name="bookmark" size="md" color={colors.text.primary} />}
                activeIcon={<Icon name="bookmark-filled" size="md" color={colors.gold} />}
                isActive={video.isBookmarked}
                onPress={handleBookmark}
                activeColor={colors.gold}
                accessibilityLabel="Bookmark"
              />
              <ActionButton
                icon={<Icon name="share" size="md" color={colors.text.primary} />}
                onPress={handleShare}
                accessibilityLabel="Share"
              />
            </View>

            {/* Channel row */}
            <TouchableOpacity 
              style={styles.channelRow} 
              onPress={handleChannelPress}
              accessibilityLabel={`Go to ${video.channel.name}'s channel`}
              accessibilityRole="button"
            >
              <Avatar
                uri={video.channel.avatarUrl}
                name={video.channel.name}
                size="lg"
                showRing={false}
              />
              <View style={styles.channelInfo}>
                <Text style={styles.channelName}>{video.channel.name}</Text>
                <Text style={styles.channelSubscribers}>
                  {video.channel.subscribersCount.toLocaleString()} {t('channel.subscribers')}
                </Text>
              </View>
              <TouchableOpacity
                style={[
                  styles.subscribeButton,
                  video.isSubscribed && styles.subscribedButton,
                ]}
                onPress={handleSubscribe}
                accessibilityLabel={video.isSubscribed ? "Unsubscribe" : "Subscribe"}
                accessibilityRole="button"
              >
                <Text style={[
                  styles.subscribeText,
                  video.isSubscribed && styles.subscribedText,
                ]}>
                  {video.isSubscribed ? t('minbar.subscribed') : t('minbar.subscribe')}
                </Text>
              </TouchableOpacity>
            </TouchableOpacity>

            {/* Description */}
            {video.description && (
              <View style={styles.descriptionContainer}>
                <Text style={styles.descriptionText} numberOfLines={3}>
                  {video.description}
                </Text>
                {video.tags.length > 0 && (
                  <View style={styles.tagsContainer}>
                    {video.tags.map(tag => (
                      <Text key={tag} style={styles.tag}>#{tag}</Text>
                    ))}
                  </View>
                )}
              </View>
            )}

            {/* Cinematic Chapters Timeline */}
            {chapters.length > 0 && (
              <View style={styles.chaptersSection}>
                <LinearGradient
                  colors={['rgba(200,150,62,0.1)', 'transparent']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.chaptersGradient}
                >
                  <TouchableOpacity
                    style={styles.chapterHeader}
                    onPress={() => setShowChapters(!showChapters)}
                    accessibilityLabel={showChapters ? "Hide chapters" : "Show chapters"}
                    accessibilityRole="button"
                  >
                    <View style={styles.chapterIconContainer}>
                      <Icon name="layers" size="sm" color={colors.gold} />
                    </View>
                    <Text style={styles.chapterHeaderText}>Chapters ({chapters.length})</Text>
                    <View style={styles.chapterTimelinePreview}>
                      {chapters.slice(0, 4).map((_, i) => (
                        <View key={i} style={[styles.timelineDot, { backgroundColor: i === 0 ? colors.gold : colors.dark.border }]} />
                      ))}
                    </View>
                    <Icon
                      name={showChapters ? 'chevron-down' : 'chevron-right'}
                      size="sm"
                      color={colors.text.tertiary}
                    />
                  </TouchableOpacity>

                  {showChapters && (
                    <View style={styles.chaptersTimeline}>
                      <View style={styles.timelineLine} />
                      {chapters.map((ch, i) => (
                        <ChapterMarker
                          key={i}
                          chapter={ch}
                          index={i}
                          total={chapters.length}
                          currentProgress={progressRef.current}
                        />
                      ))}
                    </View>
                  )}
                </LinearGradient>
              </View>
            )}

            {/* Comments preview */}
            <View style={styles.commentsSection}>
              <View style={styles.commentsHeader}>
                <Text style={styles.commentsTitle}>{t('saf.comments')} ({video.commentsCount})</Text>
                <TouchableOpacity 
                  onPress={() => setCommentSheetOpen(true)}
                  accessibilityLabel={t('comments.viewAll')}
                  accessibilityRole="button"
                >
                  <Text style={styles.viewAll}>{t('common.viewAll')}</Text>
                </TouchableOpacity>
              </View>
              {comments.slice(0, 2).map(comment => (
                <View key={comment.id} style={styles.commentPreview}>
                  <Avatar
                    uri={comment.user.avatarUrl}
                    name={comment.user.username}
                    size="sm"
                    showRing={false}
                  />
                  <View style={styles.commentPreviewContent}>
                    <Text style={styles.commentPreviewUsername}>{comment.user.username}</Text>
                    <Text style={styles.commentPreviewText} numberOfLines={2}>
                      {comment.content}
                    </Text>
                  </View>
                </View>
              ))}
              {comments.length === 0 && (
                <Text style={styles.noComments}>{t('comments.emptyCombined')}</Text>
              )}
            </View>
          </Animated.View>
        </ScrollView>

        {/* Comments bottom sheet */}
        <BottomSheet visible={commentSheetOpen} onClose={() => setCommentSheetOpen(false)} snapPoint={0.7}>
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>Comments ({video.commentsCount})</Text>
          </View>
          <ScrollView style={styles.sheetComments}>
            {comments.map(comment => renderCommentItem({ item: comment }))}
          </ScrollView>
          <View style={styles.sheetInputRow}>
            <TextInput
              style={styles.commentInput}
              placeholder={t('comments.addCommentPlaceholder')}
              placeholderTextColor={colors.text.tertiary}
              value={commentText}
              onChangeText={setCommentText}
              multiline
              accessibilityLabel="Comment input field"
            />
            <TouchableOpacity 
              onPress={handleCommentSubmit} 
              disabled={!commentText.trim()}
              accessibilityLabel="Send comment"
              accessibilityRole="button"
            >
              <Icon name="send" size="sm" color={commentText.trim() ? colors.emerald : colors.text.tertiary} />
            </TouchableOpacity>
          </View>
        </BottomSheet>

        {/* More menu bottom sheet */}
        <BottomSheet visible={showMenu} onClose={() => setShowMenu(false)}>
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>{t('video.options')}</Text>
          </View>
          <BottomSheetItem
            label={t('video.saveToPlaylist')}
            icon={<Icon name="layers" size="sm" color={colors.text.primary} />}
            onPress={() => {
              setShowMenu(false);
              router.push(`/(screens)/save-to-playlist?videoId=${video.id}`);
            }}
            accessibilityLabel={t('video.saveToPlaylist')}
            accessibilityRole="button"
          />
        </BottomSheet>
      </View>
  
    </ScreenErrorBoundary>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.dark.bg },
  videoPlayer: {
    width: '100%',
    aspectRatio: 16 / 9,
    backgroundColor: colors.dark.bgElevated,
  },
  content: {
    paddingHorizontal: spacing.base,
    paddingTop: spacing.base,
  },
  videoTitle: {
    color: colors.text.primary,
    fontSize: fontSize.lg,
    fontWeight: '700',
    marginBottom: spacing.xs,
  },
  videoStats: {
    color: colors.text.secondary,
    fontSize: fontSize.sm,
    marginBottom: spacing.base,
  },
  actionRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginVertical: spacing.lg,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.dark.border,
    paddingVertical: spacing.sm,
  },
  channelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: spacing.lg,
    gap: spacing.sm,
  },
  channelInfo: {
    flex: 1,
  },
  channelName: {
    color: colors.text.primary,
    fontSize: fontSize.base,
    fontWeight: '600',
  },
  channelSubscribers: {
    color: colors.text.secondary,
    fontSize: fontSize.sm,
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
  descriptionContainer: {
    backgroundColor: colors.dark.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  descriptionText: {
    color: colors.text.secondary,
    fontSize: fontSize.base,
    lineHeight: fontSize.lg,
  },
  tagsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: spacing.sm,
    gap: spacing.xs,
  },
  tag: {
    color: colors.emerald,
    fontSize: fontSize.sm,
  },
  commentsSection: {
    marginBottom: spacing.xl,
  },
  commentsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  commentsTitle: {
    color: colors.text.primary,
    fontSize: fontSize.lg,
    fontWeight: '700',
  },
  viewAll: {
    color: colors.emerald,
    fontSize: fontSize.sm,
    fontWeight: '600',
  },
  commentPreview: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  commentPreviewContent: {
    flex: 1,
  },
  commentPreviewUsername: {
    color: colors.text.primary,
    fontSize: fontSize.sm,
    fontWeight: '600',
  },
  commentPreviewText: {
    color: colors.text.secondary,
    fontSize: fontSize.sm,
    marginTop: 2,
  },
  noComments: {
    color: colors.text.tertiary,
    fontSize: fontSize.sm,
    textAlign: 'center',
    paddingVertical: spacing.lg,
  },
  skeletonContent: {
    paddingHorizontal: spacing.base,
    paddingTop: spacing.base,
  },
  // Comments sheet styles
  sheetHeader: {
    alignItems: 'center',
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.dark.border,
  },
  sheetTitle: {
    color: colors.text.primary,
    fontSize: fontSize.lg,
    fontWeight: '700',
  },
  sheetComments: {
    maxHeight: 400,
    paddingHorizontal: spacing.base,
  },
  sheetInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.dark.border,
  },
  commentInput: {
    flex: 1,
    color: colors.text.primary,
    fontSize: fontSize.base,
    backgroundColor: colors.dark.surface,
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginRight: spacing.sm,
    maxHeight: 100,
  },
  commentItem: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  commentContent: {
    flex: 1,
  },
  commentUsername: {
    color: colors.text.primary,
    fontSize: fontSize.sm,
    fontWeight: '600',
  },
  commentText: {
    color: colors.text.secondary,
    fontSize: fontSize.base,
    marginVertical: spacing.xs,
  },
  commentFooter: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  commentTime: {
    color: colors.text.tertiary,
    fontSize: fontSize.xs,
  },
  commentAction: {
    color: colors.text.secondary,
    fontSize: fontSize.xs,
    fontWeight: '600',
  },
  chaptersSection: {
    marginBottom: spacing.lg,
  },
  chapterHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
  },
  chapterHeaderText: {
    flex: 1,
    color: colors.text.primary,
    fontSize: fontSize.base,
    fontWeight: '600',
  },
  chapterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
    paddingLeft: spacing.xl,
  },
  chapterTime: {
    color: colors.text.secondary,
    fontSize: fontSize.sm,
    minWidth: 40,
  },
  chapterTitle: {
    flex: 1,
    color: colors.text.primary,
    fontSize: fontSize.base,
  },

  // Cinematic video player styles
  videoContainer: {
    position: 'relative',
  },
  videoWrapper: {
    position: 'relative',
    overflow: 'hidden',
  },
  videoGradientOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    pointerEvents: 'none',
  },
  videoTitleOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
  },
  videoTitleGradient: {
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.lg,
    paddingTop: spacing.xl,
  },
  videoTitleCinematic: {
    color: colors.text.primary,
    fontSize: fontSize.lg,
    fontWeight: '700',
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },

  // Like burst animation
  likeBurst: {
    position: 'absolute',
    zIndex: 100,
  },

  // Title accent
  titleAccentContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
    gap: spacing.xs,
  },
  titleAccentLine: {
    height: 2,
    flex: 1,
    maxWidth: 60,
    borderRadius: 1,
  },
  titleAccentDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.gold,
  },

  // Enhanced stats row
  videoStatsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.base,
  },
  statItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  videoStatText: {
    color: colors.text.secondary,
    fontSize: fontSize.sm,
  },
  videoStatTextGold: {
    color: colors.gold,
    fontSize: fontSize.sm,
    fontWeight: '600',
  },
  statDivider: {
    color: colors.text.tertiary,
    fontSize: fontSize.sm,
  },

  // Cinematic chapters
  chaptersGradient: {
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: 'rgba(200,150,62,0.2)',
  },
  chapterIconContainer: {
    width: 32,
    height: 32,
    borderRadius: radius.md,
    backgroundColor: 'rgba(200,150,62,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  chapterTimelinePreview: {
    flexDirection: 'row',
    gap: 4,
    flex: 1,
    justifyContent: 'flex-end',
    marginRight: spacing.sm,
  },
  timelineDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  chaptersTimeline: {
    marginTop: spacing.md,
    position: 'relative',
    paddingLeft: spacing.md,
  },
  timelineLine: {
    position: 'absolute',
    left: 4,
    top: 0,
    bottom: 0,
    width: 2,
    backgroundColor: colors.dark.border,
  },
  chapterMarker: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    paddingLeft: spacing.lg,
    position: 'relative',
  },
  chapterMarkerActive: {
    backgroundColor: 'rgba(200,150,62,0.1)',
    borderRadius: radius.md,
    marginLeft: -spacing.md,
    paddingLeft: spacing.lg + spacing.md,
    marginVertical: spacing.xs,
  },
  chapterMarkerPast: {
    opacity: 0.7,
  },
  chapterMarkerLine: {
    position: 'absolute',
    left: -spacing.lg + 2,
    width: 12,
    height: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chapterMarkerDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 2,
    borderColor: colors.dark.bg,
  },
  chapterMarkerDotActive: {
    width: 14,
    height: 14,
    borderRadius: radius.sm,
  },
  chapterMarkerInfo: {
    flex: 1,
  },
  chapterMarkerTitle: {
    color: colors.text.secondary,
    fontSize: fontSize.base,
    fontWeight: '500',
  },
  chapterMarkerTitleActive: {
    color: colors.text.primary,
    fontWeight: '700',
  },
  chapterMarkerTime: {
    color: colors.text.tertiary,
    fontSize: fontSize.xs,
  },
  nowPlayingBadge: {
    backgroundColor: colors.gold,
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
    borderRadius: radius.sm,
  },
  nowPlayingText: {
    color: '#0D1117',
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
});