import { useCallback, useEffect, useRef, useState, memo, useMemo } from 'react';
import { View, Text, StyleSheet, Dimensions, Pressable, type ViewToken, Alert, RefreshControl } from 'react-native';
import { Image } from 'expo-image';
import { FlashList, type FlashListRef } from '@shopify/flash-list';
import { useScrollToTop } from '@react-navigation/native';
import { useInfiniteQuery } from '@tanstack/react-query';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useUser } from '@clerk/clerk-expo';
import { useRouter } from 'expo-router';
import { Video, ResizeMode, AVPlaybackStatus } from 'expo-av';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withRepeat,
  withTiming,
  withSequence,
  Easing,
  runOnJS,
  FadeIn,
  FadeOut,
} from 'react-native-reanimated';
import { Gesture, GestureDetector, type TapGesture } from 'react-native-gesture-handler';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, spacing, fontSize, radius, animation, fontSizeExt, fonts } from '@/theme';
import { useStore } from '@/store';
import { reelsApi, feedApi } from '@/services/api';
import { Avatar } from '@/components/ui/Avatar';
import { Icon } from '@/components/ui/Icon';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { FloatingHearts } from '@/components/ui/FloatingHearts';
import { CommentsSheet } from '@/components/bakra/CommentsSheet';
import { BottomSheet, BottomSheetItem } from '@/components/ui/BottomSheet';
import { useHaptic } from '@/hooks/useHaptic';
import { useAnimatedPress } from '@/hooks/useAnimatedPress';
import { Platform } from 'react-native';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { followsApi } from '@/services/api';
import { useTranslation } from '@/hooks/useTranslation';
import { ScreenErrorBoundary } from '@/components/ui/ScreenErrorBoundary';
import { navigate } from '@/utils/navigation';
import { rtlFlexRow, rtlTextAlign, rtlMargin } from '@/utils/rtl';
import * as Clipboard from 'expo-clipboard';
import { useVideoPreloader } from '@/hooks/useVideoPreloader';
import { useThemeColors } from '@/hooks/useThemeColors';
import { formatCount } from '@/utils/formatCount';
import type { Reel } from '@/types';
import { formatDistanceToNowStrict } from 'date-fns';
import { getDateFnsLocale } from '@/utils/localeFormat';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
const VIDEO_HEIGHT = SCREEN_H;
const VIDEO_WIDTH = SCREEN_W;

// Animated action button wrapper
function ActionButton({
  children,
  onPress,
  accessibilityLabel,
}: {
  children: React.ReactNode;
  onPress: () => void;
  accessibilityLabel: string;
}) {
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePress = () => {
    scale.value = withSequence(
      withSpring(0.75, animation.spring.snappy),
      withSpring(1, animation.spring.bouncy)
    );
    onPress();
  };

  return (
    <Pressable
      style={styles.actionButton}
      onPress={handlePress}
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
    >
      <Animated.View style={animatedStyle}>
        {children}
      </Animated.View>
    </Pressable>
  );
}

interface ReelItemProps {
  item: Reel;
  index: number;
  isActive: boolean;
  currentUserId?: string;
  onLike: (reel: Reel) => void;
  onBookmark: (reel: Reel) => void;
  onShare: (reel: Reel) => void;
  onComment: (reel: Reel) => void;
  onProfilePress: (username: string) => void;
  onReport: (reel: Reel) => void;
  onNotInterested: (reel: Reel) => void;
  onCopyLink: (reel: Reel) => void;
  onFollow: (userId: string) => void;
  onNavigate: (path: string) => void;
  setVideoRef: (id: string, ref: Video) => void;
  doubleTapGesture: TapGesture;
  heartTrigger: number;
}

const ReelItem = memo(function ReelItem({
  item,
  index,
  isActive,
  currentUserId,
  onLike,
  onBookmark,
  onShare,
  onComment,
  onProfilePress,
  onReport,
  onNotInterested,
  onCopyLink,
  onFollow,
  onNavigate,
  setVideoRef,
  doubleTapGesture,
  heartTrigger,
}: ReelItemProps) {
  const { t } = useTranslation();
  const tc = useThemeColors();
  const localVideoRef = useRef<Video | null>(null);
  const [captionExpanded, setCaptionExpanded] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [progress, setProgress] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const haptic = useHaptic();

  const spin = useSharedValue(0);
  const marqueeAnim = useSharedValue(0);

  // Tap-to-pause: toggle video playback
  const togglePause = useCallback(() => {
    if (isPaused) {
      localVideoRef.current?.playAsync();
      setIsPaused(false);
    } else {
      localVideoRef.current?.pauseAsync();
      setIsPaused(true);
    }
  }, [isPaused]);

  // Single-tap gesture for pause/resume
  const singleTapGesture = useMemo(() => Gesture.Tap()
    .onEnd(() => {
      'worklet';
      runOnJS(togglePause)();
    }), [togglePause]);

  // Combine: double-tap takes priority over single-tap
  const combinedGesture = useMemo(
    () => Gesture.Exclusive(doubleTapGesture, singleTapGesture),
    [doubleTapGesture, singleTapGesture],
  );

  useEffect(() => {
    if (isActive) {
      spin.value = withRepeat(
        withTiming(1, { duration: 4000, easing: Easing.linear }),
        -1,
        false
      );
      // Marquee: scroll audio title
      marqueeAnim.value = 0;
      marqueeAnim.value = withRepeat(
        withTiming(-200, { duration: 8000, easing: Easing.linear }),
        -1,
        false,
      );
    } else {
      spin.value = 0;
      marqueeAnim.value = 0;
      // Reset pause state when reel goes off-screen
      if (isPaused) {
        setIsPaused(false);
      }
    }
  }, [isActive, spin, marqueeAnim, isPaused]);

  const spinStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${spin.value * 360}deg` }],
  }));

  const audioMarqueeStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: marqueeAnim.value }],
  }));

  const audioString = `${item.audioTitle || t('bakra.originalAudio')} — ${item.audioArtist || item.user?.displayName || t('bakra.unknown')}`;

  const handleVideoRef = (ref: Video | null) => {
    localVideoRef.current = ref;
    if (ref) {
      setVideoRef(item.id, ref);
    }
  };

  return (
    <GestureDetector gesture={combinedGesture}>
      <View style={styles.videoContainer}>
        <Video
          ref={handleVideoRef}
          source={{ uri: item.hlsUrl || item.videoUrl }}
          style={styles.video}
          resizeMode={ResizeMode.COVER}
          shouldPlay={isActive && !isPaused}
          isLooping={item.isLooping ?? true}
          useNativeControls={false}
          onPlaybackStatusUpdate={(status: AVPlaybackStatus) => {
            if (status.isLoaded) {
              if (status.durationMillis && status.durationMillis > 0) {
                const newProgress = status.positionMillis / status.durationMillis;
                runOnJS(setProgress)(newProgress);
              }
              if (!status.isPlaying && isActive && !isPaused) {
                // Auto-play if paused but should be playing (not user-paused)
                localVideoRef.current?.playAsync();
              }
            }
          }}
        />
        {/* Progress bar at top */}
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
        </View>

        {/* Pause overlay */}
        {isPaused && (
          <Animated.View entering={FadeIn.duration(200)} exiting={FadeOut.duration(200)} style={styles.pauseOverlay}>
            <Icon name="play" size={48} color="rgba(255,255,255,0.7)" />
          </Animated.View>
        )}

        <LinearGradient
          colors={['transparent', 'rgba(0,0,0,0.2)', 'rgba(0,0,0,0.6)', 'rgba(0,0,0,0.85)']}
          locations={[0, 0.4, 0.7, 1]}
          style={styles.bottomGradient}
        />
        <LinearGradient
          colors={['rgba(0,0,0,0.5)', 'rgba(0,0,0,0.2)', 'transparent']}
          locations={[0, 0.5, 1]}
          style={styles.topGradient}
        />

        {/* Audio info bar */}
        <View style={styles.audioInfoBar}>
          <Icon name="volume-x" size="xs" color="#fff" />
          <View style={styles.audioInfoContentClip}>
            <Animated.View style={[styles.audioInfoContentRow, audioMarqueeStyle]}>
              <Text style={styles.audioTitle}>{audioString}</Text>
              <Text style={[styles.audioTitle, { marginLeft: 40 }]}>{audioString}</Text>
            </Animated.View>
          </View>
          <Pressable
            onPress={() => {
              if (item.audioTrackId) {
                onNavigate(`/(screens)/sound/${item.audioTrackId}`);
              }
            }}
            style={styles.audioDisc}
          >
            <Animated.View style={[styles.audioDiscInner, spinStyle]}>
              {item.audioCoverUrl ? (
                <Image source={{ uri: item.audioCoverUrl }} style={styles.audioDiscImage} />
              ) : (
                <Icon name="music" size={18} color="#fff" />
              )}
            </Animated.View>
          </Pressable>
        </View>

        {/* Trending sound indicator */}
        {item.audioTrack?.isTrending && (
          <View style={styles.trendingBadge}>
            <Icon name="trending-up" size={10} color="#fff" />
            <Text style={styles.trendingBadgeText}>{t('bakra.trending')}</Text>
          </View>
        )}

        {/* User info & caption */}
        <View style={styles.infoContainer}>
          <Pressable
            style={styles.userRow}
            onPress={() => onProfilePress(item.user.username)}
            accessibilityLabel={t('accessibility.viewProfile', { username: item.user.username })}
            accessibilityRole="button"
          >
            <View style={styles.avatarContainer}>
              <Avatar
                uri={item.user.avatarUrl}
                name={item.user.username}
                size="sm"
                showRing={false}
              />
              {/* Follow button on creator avatar */}
              {item.user.id !== currentUserId && (
                <Pressable
                  onPress={() => {
                    if (!item.user?.isFollowing) {
                      onFollow(item.user.id);
                      haptic.medium();
                    }
                  }}
                  hitSlop={12}
                  accessibilityLabel={item.user?.isFollowing ? t('common.following') : t('common.follow')}
                  accessibilityRole="button"
                  style={[styles.followButtonOverlay, { borderColor: tc.bg }]}
                >
                  {item.user?.isFollowing ? (
                    <View
                      style={styles.followIconContainerFollowing}
                    >
                      <Icon name="check" size={14} color="#fff" />
                    </View>
                  ) : (
                    <LinearGradient
                      colors={[colors.emerald, colors.extended.greenDark]}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={styles.followIconContainer}
                    >
                      <Icon name="plus" size={16} color="#fff" />
                    </LinearGradient>
                  )}
                </Pressable>
              )}
            </View>
            <View style={styles.userText}>
              <Text style={styles.username}>{item.user.username}</Text>
              <Text style={styles.time}>
                {formatDistanceToNowStrict(new Date(item.createdAt), { addSuffix: true, locale: getDateFnsLocale() })}
              </Text>
            </View>
          </Pressable>
          {item.caption && (
            <>
              <Text style={styles.caption} numberOfLines={captionExpanded ? undefined : 3}>
                {item.caption}
              </Text>
              {!captionExpanded && (
                <Text
                  onPress={() => setCaptionExpanded(true)}
                  style={styles.captionMore}
                >
                  {t('common.more')}
                </Text>
              )}
            </>
          )}
          {item.audioTitle && (
            <View style={styles.soundRow}>
              <Icon name="music" size="sm" color={colors.text.primary} />
              <Text style={styles.soundText}>
                {item.audioTitle}
                {item.audioArtist && ` · ${item.audioArtist}`}
              </Text>
            </View>
          )}
        </View>

        {/* Right action buttons */}
        <View style={styles.actionColumn}>
          <ActionButton
            onPress={() => onLike(item)}
            accessibilityLabel={item.isLiked ? t('accessibility.unlikeReel') : t('accessibility.likeReel')}
          >
            <Icon
              name={item.isLiked ? 'heart-filled' : 'heart'}
              size="lg"
              color={item.isLiked ? colors.error : colors.text.primary}
              style={item.isLiked ? undefined : styles.iconShadow}
            />
            <Text style={styles.actionCount}>{formatCount(item.likesCount)}</Text>
          </ActionButton>
          <ActionButton
            onPress={() => onComment(item)}
            accessibilityLabel={t('accessibility.commentReel')}
          >
            <Icon name="message-circle" size="lg" color={colors.text.primary} style={styles.iconShadow} />
            <Text style={styles.actionCount}>{formatCount(item.commentsCount)}</Text>
          </ActionButton>
          <ActionButton
            onPress={() => onShare(item)}
            accessibilityLabel={t('accessibility.shareReel')}
          >
            <Icon name="share" size="lg" color={colors.text.primary} style={styles.iconShadow} />
            <Text style={styles.actionCount}>{formatCount(item.sharesCount)}</Text>
          </ActionButton>

          {/* Duet button */}
          <Pressable
            onPress={() => {
              haptic.light();
              onNavigate(`/(screens)/create-reel?duetWith=${item.id}`);
            }}
            style={styles.duetStitchButton}
          >
            <View style={styles.duetStitchIcon}>
              <Icon name="layers" size="sm" color="#fff" style={styles.iconShadow} />
            </View>
            <Text style={styles.actionCountDuetStitch}>{t('bakra.duet')}</Text>
          </Pressable>

          {/* Stitch button */}
          <Pressable
            onPress={() => {
              haptic.light();
              onNavigate(`/(screens)/create-reel?stitchFrom=${item.id}`);
            }}
            style={styles.duetStitchButton}
          >
            <View style={styles.duetStitchIcon}>
              <Icon name="slash" size="sm" color="#fff" style={styles.iconShadow} />
            </View>
            <Text style={styles.actionCountDuetStitch}>{t('bakra.stitch')}</Text>
          </Pressable>
          <ActionButton
            onPress={() => onBookmark(item)}
            accessibilityLabel={item.isBookmarked ? t('accessibility.removeBookmark') : t('accessibility.bookmarkReel')}
          >
            <Icon
              name={item.isBookmarked ? 'bookmark-filled' : 'bookmark'}
              size="lg"
              color={item.isBookmarked ? colors.gold : colors.text.primary}
              fill={item.isBookmarked ? colors.gold : undefined}
              style={item.isBookmarked ? undefined : styles.iconShadow}
            />
          </ActionButton>
          <ActionButton
            onPress={() => setShowMoreMenu(true)}
            accessibilityLabel={t('accessibility.moreOptions')}
          >
            <Icon name="more-horizontal" size="lg" color={colors.text.primary} style={styles.iconShadow} />
          </ActionButton>
        </View>

        {/* More menu BottomSheet */}
        <BottomSheet visible={showMoreMenu} onClose={() => setShowMoreMenu(false)}>
          <BottomSheetItem
            label={t('bakra.notInterested')}
            icon={<Icon name="eye-off" size="sm" color={colors.text.primary} />}
            onPress={() => { onNotInterested(item); setShowMoreMenu(false); }}
          />
          <BottomSheetItem
            label={t('common.report')}
            icon={<Icon name="flag" size="sm" color={colors.error} />}
            onPress={() => { onReport(item); setShowMoreMenu(false); }}
            destructive
          />
          <BottomSheetItem
            label={t('common.copyLink')}
            icon={<Icon name="link" size="sm" color={colors.text.primary} />}
            onPress={() => { onCopyLink(item); setShowMoreMenu(false); }}
          />
          <BottomSheetItem
            label={t('bakra.saveToCollection')}
            icon={<Icon name="bookmark" size="sm" color={colors.text.primary} />}
            onPress={() => { onBookmark(item); setShowMoreMenu(false); }}
          />
        </BottomSheet>
        <FloatingHearts trigger={heartTrigger} />
      </View>
    </GestureDetector>
  );
});

export default function BakraScreen() {
  const { t, isRTL } = useTranslation();
  const { user } = useUser();
  const router = useRouter();
  const haptic = useHaptic();
  const tc = useThemeColors();
  const [refreshing, setRefreshing] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const currentIndexRef = useRef(0);
  const reelsRef = useRef(reels);
  useEffect(() => { currentIndexRef.current = currentIndex; }, [currentIndex]);
  useEffect(() => { reelsRef.current = reels; }, [reels]);
  const [commentsReel, setCommentsReel] = useState<Reel | null>(null);
  const [heartTrigger, setHeartTrigger] = useState(0);
  const videoRefs = useRef<{ [key: string]: Video }>({});
  const viewedReelIds = useRef<Set<string>>(new Set());
  const setVideoRef = useCallback((id: string, ref: Video) => {
    videoRefs.current[id] = ref;
  }, []);
  const listRef = useRef<FlashListRef<Reel>>(null);
  useScrollToTop(listRef as React.RefObject<FlashListRef<Reel>>);
  const { onViewableChange, markPlaying, isReady } = useVideoPreloader(3);

  const feedQuery = useInfiniteQuery({
    queryKey: ['reels-feed'],
    queryFn: async ({ pageParam }) => {
      const res = await reelsApi.getFeed(pageParam as string | undefined);
      // If regular feed returns empty on first page, fallback to trending
      if (!pageParam && (!res?.data || res.data.length === 0)) {
        return reelsApi.getTrending(undefined, 20);
      }
      return res;
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last?.meta?.hasMore ? last.meta.cursor ?? undefined : undefined,
  });

  const reels: Reel[] = feedQuery.data?.pages.flatMap((p) => p?.data ?? []) ?? [];

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await feedQuery.refetch();
    setRefreshing(false);
  }, [feedQuery]);

  const onEndReached = useCallback(() => {
    if (feedQuery.hasNextPage && !feedQuery.isFetchingNextPage) {
      feedQuery.fetchNextPage();
    }
  }, [feedQuery.hasNextPage, feedQuery.isFetchingNextPage, feedQuery.fetchNextPage]);

  const handleViewableItemsChanged = useCallback(({ viewableItems }: { viewableItems: ViewToken[]; changed: ViewToken[] }) => {
    if (viewableItems.length > 0) {
      const rawIndex = viewableItems[0].index;
      if (rawIndex != null && rawIndex !== currentIndexRef.current) {
        const idx: number = rawIndex;
        const currentReels = reelsRef.current;
        // Pause previous video
        const prevReel = currentReels[currentIndexRef.current];
        if (prevReel && videoRefs.current[prevReel.id]) {
          videoRefs.current[prevReel.id].pauseAsync();
        }
        // Play new video and track view
        const newReel = currentReels[idx];
        if (newReel && videoRefs.current[newReel.id]) {
          videoRefs.current[newReel.id].playAsync();
          if (!viewedReelIds.current.has(newReel.id)) {
            viewedReelIds.current.add(newReel.id);
            reelsApi.view(newReel.id).catch(() => {});
          }
        }
        setCurrentIndex(idx);
        // Preload next 2 videos
        const videoUrls = currentReels.map(r => r.hlsUrl || r.videoUrl);
        onViewableChange(idx, videoUrls);
        // Mark current video as playing
        const currentUrl = videoUrls[idx];
        if (currentUrl) markPlaying(currentUrl);
      }
    }
  }, [currentIndex, reels, onViewableChange, markPlaying]);

  const queryClient = useQueryClient();
  const likeInFlight = useRef(false);
  const handleLike = useCallback(async (reel: Reel) => {
    if (likeInFlight.current) return;
    likeInFlight.current = true;
    haptic.light();

    // Optimistic update: immediately toggle like state in cache
    queryClient.setQueryData(['reels-feed'], (old: typeof feedQuery.data) => {
      if (!old) return old;
      return {
        ...old,
        pages: old.pages.map((page) => ({
          ...page,
          data: page.data.map((r: Reel) =>
            r.id === reel.id
              ? { ...r, isLiked: !reel.isLiked, likesCount: reel.isLiked ? r.likesCount - 1 : r.likesCount + 1 }
              : r
          ),
        })),
      };
    });

    try {
      if (reel.isLiked) {
        await reelsApi.unlike(reel.id);
      } else {
        await reelsApi.like(reel.id);
      }
    } catch {
      // Revert on error
      feedQuery.refetch();
    } finally {
      likeInFlight.current = false;
    }
  }, [haptic, queryClient, feedQuery]);

  const bookmarkInFlight = useRef(false);
  const handleBookmark = useCallback(async (reel: Reel) => {
    if (bookmarkInFlight.current) return;
    bookmarkInFlight.current = true;
    haptic.light();

    // Optimistic update
    queryClient.setQueryData(['reels-feed'], (old: typeof feedQuery.data) => {
      if (!old) return old;
      return {
        ...old,
        pages: old.pages.map((page) => ({
          ...page,
          data: page.data.map((r: Reel) =>
            r.id === reel.id ? { ...r, isBookmarked: !reel.isBookmarked } : r
          ),
        })),
      };
    });

    try {
      if (reel.isBookmarked) {
        await reelsApi.unbookmark(reel.id);
      } else {
        await reelsApi.bookmark(reel.id);
      }
    } catch {
      feedQuery.refetch();
    } finally {
      bookmarkInFlight.current = false;
    }
  }, [haptic, queryClient, feedQuery]);

  const handleShare = useCallback(async (reel: Reel) => {
    haptic.light();
    await reelsApi.share(reel.id);
    feedQuery.refetch();
  }, [haptic, feedQuery]);

  const handleComment = useCallback((reel: Reel) => {
    haptic.light();
    setCommentsReel(reel);
  }, [haptic]);

  const handleProfilePress = useCallback((username: string) => {
    router.push(`/(screens)/profile/${username}`);
  }, [router]);

  const handleReport = useCallback((reel: Reel) => {
    router.push(`/(screens)/report?type=reel&id=${reel.id}`);
  }, [router]);

  const handleNotInterested = useCallback(async (reel: Reel) => {
    haptic.light();
    try {
      await feedApi.reportNotInterested(reel.id, 'reel');
    } catch { /* best effort */ }
    Alert.alert(t('bakra.notInterestedAlert.title'), t('bakra.notInterestedAlert.message'));
  }, [haptic, t]);

  const handleCopyLink = useCallback(async (reel: Reel) => {
    haptic.light();
    try {
      const { url } = await reelsApi.getShareLink(reel.id);
      await Clipboard.setStringAsync(url);
    } catch {
      // Fallback: copy a constructed URL
      await Clipboard.setStringAsync(`https://mizanly.com/reel/${reel.id}`);
    }
    Alert.alert(t('bakra.linkCopiedAlert.title'), t('bakra.linkCopiedAlert.message'));
  }, [haptic, t]);

  const handleFollow = useCallback((userId: string) => {
    followsApi.follow(userId).then(() => {
      queryClient.invalidateQueries({ queryKey: ['reels-feed'] });
    }).catch(() => {});
  }, [queryClient]);

  const handleNavigate = useCallback((path: string) => {
    navigate(path);
  }, [router]);

  const doubleTapGesture = useMemo(() => Gesture.Tap()
    .numberOfTaps(2)
    .onEnd(() => {
      haptic.medium();
      const reel = reels[currentIndex];
      if (reel && !reel.isLiked) {
        handleLike(reel);
      }
      setHeartTrigger((prev) => prev + 1);
    }), [haptic, reels, currentIndex, handleLike]);

  const renderItem = useCallback(({ item, index }: { item: Reel; index: number }) => (
    <ReelItem
      item={item}
      index={index}
      isActive={index === currentIndex}
      currentUserId={user?.id}
      onLike={handleLike}
      onBookmark={handleBookmark}
      onShare={handleShare}
      onComment={handleComment}
      onProfilePress={handleProfilePress}
      onReport={handleReport}
      onNotInterested={handleNotInterested}
      onCopyLink={handleCopyLink}
      onFollow={handleFollow}
      onNavigate={handleNavigate}
      setVideoRef={setVideoRef}
      doubleTapGesture={doubleTapGesture}
      heartTrigger={heartTrigger}
    />
  ), [currentIndex, user?.id, handleLike, handleBookmark, handleShare, handleComment, handleProfilePress, handleReport, handleNotInterested, handleCopyLink, handleFollow, handleNavigate, setVideoRef, doubleTapGesture, heartTrigger]);

  const keyExtractor = useCallback((item: Reel) => item.id, []);
  // FlashList uses estimatedItemSize instead of getItemLayout
  const _getItemLayout = useCallback((_: ArrayLike<Reel> | null | undefined, index: number) => ({
    length: SCREEN_H,
    offset: SCREEN_H * index,
    index,
  }), []);

  const listEmpty = useMemo(() => feedQuery.isError ? (
    <EmptyState icon="globe" title={t('common.somethingWentWrong')} subtitle={t('common.pullToRetry')} actionLabel={t('common.retry')} onAction={() => feedQuery.refetch()} />
  ) : feedQuery.isLoading ? (
    <View style={styles.skeletonContainer}>
      <Skeleton.Rect width={SCREEN_W} height={SCREEN_H} borderRadius={0} />
    </View>
  ) : (
    <EmptyState
      icon="video"
      title={t('bakra.emptyFeed.title')}
      subtitle={t('bakra.emptyFeed.subtitle')}
      actionLabel={t('bakra.emptyFeed.actionLabel')}
      onAction={() => router.push('/(screens)/create-reel')}
    />
  ), [feedQuery.isError, feedQuery.isLoading, t, router]);

  const listFooter = useMemo(() => feedQuery.isFetchingNextPage ? (
    <View style={styles.footer}>
      <Skeleton.Rect width={SCREEN_W} height={SCREEN_H} borderRadius={0} />
    </View>
  ) : null, [feedQuery.isFetchingNextPage]);

  return (
    <ScreenErrorBoundary>
    <SafeAreaView style={[styles.container, { backgroundColor: tc.bg }]} edges={['top']}>
      {/* Header */}
      <View style={[styles.header, { flexDirection: rtlFlexRow(isRTL) }]}>
        <Text style={[styles.logo, { textAlign: rtlTextAlign(isRTL) }]}>Bakra</Text>
        <View style={[styles.headerRight, { flexDirection: rtlFlexRow(isRTL) }]}>
          <Pressable
            hitSlop={8}
            onPress={() => { haptic.light(); router.push('/(screens)/search'); }}
            accessibilityLabel={t('accessibility.search')}
            accessibilityRole="button"
          >
            <Icon name="search" size="sm" color={colors.text.primary} />
          </Pressable>
          <Pressable
            hitSlop={8}
            onPress={() => { haptic.light(); router.push('/(screens)/trending-audio'); }}
            accessibilityLabel={t('screens.trending-audio.title')}
            accessibilityRole="button"
          >
            <Icon name="trending-up" size="sm" color={colors.text.primary} />
          </Pressable>
          <Pressable
            hitSlop={8}
            onPress={() => { haptic.light(); router.push('/(screens)/create-reel'); }}
            accessibilityLabel={t('accessibility.uploadReel')}
            accessibilityRole="button"
          >
            <Icon name="circle-plus" size="sm" color={colors.text.primary} />
          </Pressable>
        </View>
      </View>

      {/* Side panel shortcuts — TikTok 2026 */}
      <View style={styles.shortcutRow}>
        <Pressable
          style={styles.shortcutPill}
          onPress={() => { haptic.light(); navigate('/(screens)/go-live'); }}
          accessibilityLabel={t('tabs.live')}
          accessibilityRole="button"
        >
          <Icon name="globe" size={14} color={colors.error} />
          <Text style={styles.shortcutText}>{t('tabs.live')}</Text>
        </Pressable>
        <Pressable
          style={styles.shortcutPill}
          onPress={() => { haptic.light(); navigate('/(screens)/series-discover'); }}
          accessibilityLabel={t('series.discoverTitle')}
          accessibilityRole="button"
        >
          <Icon name="layers" size={14} color={colors.gold} />
          <Text style={styles.shortcutText}>{t('series.discoverTitle')}</Text>
        </Pressable>
      </View>

      <FlashList
        ref={listRef}
        data={reels}
        keyExtractor={keyExtractor}
        onEndReached={onEndReached}
        onEndReachedThreshold={0.4}
        renderItem={renderItem}
        showsVerticalScrollIndicator={false}
        viewabilityConfig={{ itemVisiblePercentThreshold: 80 }}
        onViewableItemsChanged={handleViewableItemsChanged}
        ListEmptyComponent={listEmpty}
        ListFooterComponent={listFooter}
        estimatedItemSize={SCREEN_H}
        windowSize={7}
        maxToRenderPerBatch={5}
        snapToInterval={SCREEN_H}
        snapToAlignment="start"
        decelerationRate="fast"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.emerald} />}
      />
      {commentsReel && (
        <CommentsSheet
          reel={commentsReel}
          visible={!!commentsReel}
          onClose={() => setCommentsReel(null)}
        />
      )}
    </SafeAreaView>
    </ScreenErrorBoundary>
  );
}

const styles = StyleSheet.create({
  // TODO: colors.dark.bg overridden by inline style with tc.bg from useThemeColors()
  container: { flex: 1, backgroundColor: colors.dark.bg },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  logo: {
    color: colors.emerald,
    fontSize: fontSize.xl,
    fontFamily: fonts.headingBold,
    letterSpacing: -0.5,
  },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg },
  videoContainer: {
    width: SCREEN_W,
    height: VIDEO_HEIGHT,
    position: 'relative',
  },
  progressTrack: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 3,
    backgroundColor: 'rgba(255,255,255,0.2)',
    zIndex: 20,
  },
  progressFill: {
    height: 3,
    backgroundColor: colors.emerald,
    borderRadius: 1.5,
  },
  pauseOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 5,
  },
  video: {
    width: SCREEN_W,
    height: VIDEO_HEIGHT,
  },
  bottomGradient: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 300,
  },
  topGradient: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 200,
  },
  infoContainer: {
    position: 'absolute',
    bottom: spacing.xl,
    left: spacing.base,
    right: 100,
  },
  userRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  userText: {
    marginLeft: spacing.sm,
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  username: {
    color: colors.text.primary,
    fontSize: fontSize.base,
    fontWeight: '700', // Making it pop more
  },
  time: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: fontSize.sm,
    marginTop: 2,
  },
  caption: {
    color: colors.text.primary,
    fontSize: fontSize.base,
    marginBottom: spacing.sm,
    lineHeight: fontSize.lg,
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  soundRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  soundText: {
    color: colors.text.primary,
    fontSize: fontSize.sm,
    marginLeft: spacing.xs,
  },
  actionColumn: {
    position: 'absolute',
    bottom: spacing.xl,
    right: spacing.base,
    alignItems: 'center',
    gap: spacing.lg,
    zIndex: 20,
  },
  actionButton: {
    alignItems: 'center',
    gap: spacing.xs,
  },
  iconShadow: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.5,
    shadowRadius: 3,
  },
  actionCount: {
    color: colors.text.primary,
    fontSize: fontSize.sm,
    fontWeight: '700',
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  actionCountDuetStitch: {
    color: '#fff',
    fontSize: fontSizeExt.tiny,
    marginTop: 2,
    fontWeight: '600',
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  skeletonContainer: {
    width: SCREEN_W,
    height: VIDEO_HEIGHT,
  },
  footer: {
    width: SCREEN_W,
    height: VIDEO_HEIGHT,
  },
  shortcutRow: {
    position: 'absolute',
    top: 50,
    left: spacing.base,
    zIndex: 10,
    flexDirection: 'row',
    gap: spacing.sm,
  },
  shortcutPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: radius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderWidth: 0.5,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  shortcutText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '600',
  },
  audioInfoBar: {
    position: 'absolute',
    bottom: Platform.OS === 'ios' ? 90 : 70,
    left: 0,
    right: 60,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.base,
  },
  audioInfoContentClip: {
    flex: 1,
    overflow: 'hidden',
    marginHorizontal: spacing.sm,
  },
  audioInfoContentRow: {
    flexDirection: 'row',
  },
  audioTitle: {
    color: '#fff',
    fontSize: fontSize.xs,
  },
  audioDisc: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 2,
    borderColor: '#fff',
    overflow: 'hidden',
    marginLeft: spacing.sm,
    backgroundColor: '#1C1C1E',
    shadowColor: colors.emerald,
    shadowOpacity: 0.3,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 0 },
    elevation: 4,
  },
  audioDiscInner: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  audioDiscImage: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  trendingBadge: {
    position: 'absolute',
    bottom: Platform.OS === 'ios' ? 110 : 90,
    left: spacing.base,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(200,150,62,0.85)',
    borderRadius: radius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  trendingBadgeText: {
    color: '#fff',
    fontSize: fontSizeExt.micro,
    fontWeight: '700',
    marginLeft: 2,
  },
  avatarContainer: {
    position: 'relative',
  },
  followButtonOverlay: {
    position: 'absolute',
    bottom: -6,
    alignSelf: 'center',
    width: 34,
    height: 34,
    borderRadius: radius.full,
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: colors.dark.bg, // TODO: overridden by inline style with tc.bg from useThemeColors()
  },
  followIconContainer: {
    width: 34,
    height: 34,
    justifyContent: 'center',
    alignItems: 'center',
  },
  followIconContainerFollowing: {
    width: 34,
    height: 34,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.emerald,
  },
  captionMore: {
    color: colors.text.secondary,
    fontSize: fontSize.sm,
  },
  duetStitchButton: {
    alignItems: 'center',
    marginTop: spacing.md,
  },
  duetStitchIcon: {
    width: 36,
    height: 36,
    borderRadius: radius.full,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderWidth: 0.5,
    borderColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
});
