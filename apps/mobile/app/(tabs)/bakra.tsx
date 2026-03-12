import { useCallback, useEffect, useRef, useState, memo } from 'react';
import { View, Text, StyleSheet, Dimensions, TouchableOpacity, Pressable, Image, type ViewToken, Alert } from 'react-native';
import { FlashList } from '@shopify/flash-list';
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
} from 'react-native-reanimated';
import { Gesture, GestureDetector, type TapGesture } from 'react-native-gesture-handler';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, spacing, fontSize, radius, animation } from '@/theme';
import { useStore } from '@/store';
import { reelsApi } from '@/services/api';
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
import type { Reel } from '@/types';
import { formatDistanceToNowStrict } from 'date-fns';

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
    <TouchableOpacity
      style={styles.actionButton}
      onPress={handlePress}
      activeOpacity={0.7}
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
    >
      <Animated.View style={animatedStyle}>
        {children}
      </Animated.View>
    </TouchableOpacity>
  );
}

interface ReelItemProps {
  item: Reel;
  index: number;
  isActive: boolean;
  onLike: (reel: Reel) => void;
  onBookmark: (reel: Reel) => void;
  onShare: (reel: Reel) => void;
  onComment: (reel: Reel) => void;
  onProfilePress: (username: string) => void;
  onReport: (reel: Reel) => void;
  onNotInterested: (reel: Reel) => void;
  onCopyLink: (reel: Reel) => void;
  setVideoRef: (id: string, ref: Video) => void;
  doubleTapGesture: TapGesture;
  heartTrigger: number;
}

const ReelItem = memo(function ReelItem({
  item,
  index,
  isActive,
  onLike,
  onBookmark,
  onShare,
  onComment,
  onProfilePress,
  onReport,
  onNotInterested,
  onCopyLink,
  setVideoRef,
  doubleTapGesture,
  heartTrigger,
}: ReelItemProps) {
  const localVideoRef = useRef<Video | null>(null);
  const { user } = useUser();
  const [captionExpanded, setCaptionExpanded] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [progress, setProgress] = useState(0);
  const queryClient = useQueryClient();
  const haptic = useHaptic();
  const router = useRouter();
  const followMutation = useMutation({
    mutationFn: (userId: string) => followsApi.follow(userId),
    onSuccess: (_, userId) => {
      queryClient.invalidateQueries({ queryKey: ['reels'] });
    },
  });

  const spin = useSharedValue(0);

  useEffect(() => {
    if (isActive) {
      spin.value = withRepeat(
        withTiming(1, { duration: 4000, easing: Easing.linear }),
        -1,
        false
      );
    } else {
      spin.value = 0;
    }
  }, [isActive, spin]);

  const spinStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${spin.value * 360}deg` }],
  }));

  const handleVideoRef = (ref: Video | null) => {
    localVideoRef.current = ref;
    if (ref) {
      setVideoRef(item.id, ref);
    }
  };

  return (
    <GestureDetector gesture={doubleTapGesture}>
      <View style={styles.videoContainer}>
        <Video
          ref={handleVideoRef}
          source={{ uri: item.videoUrl }}
          style={styles.video}
          resizeMode={ResizeMode.COVER}
          shouldPlay={isActive}
          isLooping
          useNativeControls={false}
          onPlaybackStatusUpdate={(status: AVPlaybackStatus) => {
            if (status.isLoaded) {
              if (status.durationMillis && status.durationMillis > 0) {
                const newProgress = status.positionMillis / status.durationMillis;
                runOnJS(setProgress)(newProgress);
              }
              if (!status.isPlaying && isActive) {
                // Auto-play if paused but should be playing
                localVideoRef.current?.playAsync();
              }
            }
          }}
        />
        {/* Progress bar at top */}
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
        </View>

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
        <View style={{
          position: 'absolute', bottom: Platform.OS === 'ios' ? 90 : 70, left: 0, right: 60,
          flexDirection: 'row', alignItems: 'center',
          paddingHorizontal: spacing.base,
        }}>
          <Icon name="volume-x" size="xs" color="#fff" />
          <Animated.View style={{ flex: 1, marginLeft: spacing.xs, overflow: 'hidden' }}>
            <Text numberOfLines={1} style={{ color: '#fff', fontSize: fontSize.xs }}>
              {item.audioTitle || 'Original Audio'} — {item.audioArtist || item.user?.displayName || 'Unknown'}
            </Text>
          </Animated.View>
          <Pressable
            onPress={() => {
              if (item.audioTrackId) {
                router.push(`/(screens)/sound/${item.audioTrackId}`);
              }
            }}
            style={{
              width: 32, height: 32, borderRadius: radius.full,
              borderWidth: 2, borderColor: '#fff',
              overflow: 'hidden', marginLeft: spacing.sm,
              backgroundColor: '#1C1C1E', // Vinyl color
              shadowColor: colors.emerald,
              shadowOpacity: 0.3,
              shadowRadius: 6,
              shadowOffset: { width: 0, height: 0 },
              elevation: 4,
            }}
          >
            <Animated.View style={[{ width: '100%', height: '100%', justifyContent: 'center', alignItems: 'center' }, spinStyle]}>
              {item.audioCoverUrl ? (
                <Image source={{ uri: item.audioCoverUrl }} style={{ width: 14, height: 14, borderRadius: radius.full }} />
              ) : (
                <Icon name="music" size={12} color="#fff" />
              )}
            </Animated.View>
          </Pressable>
        </View>

        {/* Trending sound indicator */}
        {item.audioTrack?.isTrending && (
          <View style={{
            position: 'absolute', bottom: Platform.OS === 'ios' ? 110 : 90, left: spacing.base,
            flexDirection: 'row', alignItems: 'center',
            backgroundColor: 'rgba(200,150,62,0.85)', borderRadius: radius.full,
            paddingHorizontal: spacing.sm, paddingVertical: 2,
          }}>
            <Icon name="trending-up" size={10} color="#fff" />
            <Text style={{ color: '#fff', fontSize: 9, fontWeight: '700', marginLeft: 2 }}>Trending</Text>
          </View>
        )}

        {/* User info & caption */}
        <View style={styles.infoContainer}>
          <TouchableOpacity
            style={styles.userRow}
            onPress={() => onProfilePress(item.user.username)}
            activeOpacity={0.7}
            accessibilityLabel={`View ${item.user.username}'s profile`}
            accessibilityRole="button"
          >
            <View style={{ position: 'relative' }}>
              <Avatar
                uri={item.user.avatarUrl}
                name={item.user.username}
                size="sm"
                showRing={false}
              />
              {/* Follow button on creator avatar */}
              {item.user.id !== user?.id && (
                <Pressable
                  onPress={() => {
                    if (!item.user?.isFollowing) {
                      followMutation.mutate(item.user.id);
                      haptic('medium');
                    }
                  }}
                  style={{
                    position: 'absolute',
                    bottom: -6, alignSelf: 'center',
                    width: 26, height: 26, borderRadius: radius.full,
                    overflow: 'hidden',
                    borderWidth: 1.5, borderColor: colors.dark.bg,
                  }}
                >
                  {item.user?.isFollowing ? (
                    <View
                      style={{
                        width: 26, height: 26,
                        justifyContent: 'center', alignItems: 'center',
                        backgroundColor: colors.emerald,
                      }}
                    >
                      <Icon name="check" size={14} color="#fff" />
                    </View>
                  ) : (
                    <LinearGradient
                      colors={[colors.emerald, '#05593A']}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={{
                        width: 26, height: 26,
                        justifyContent: 'center', alignItems: 'center',
                      }}
                    >
                      <Icon name="plus" size={14} color="#fff" />
                    </LinearGradient>
                  )}
                </Pressable>
              )}
            </View>
            <View style={styles.userText}>
              <Text style={styles.username}>{item.user.username}</Text>
              <Text style={styles.time}>
                {formatDistanceToNowStrict(new Date(item.createdAt), { addSuffix: true })}
              </Text>
            </View>
          </TouchableOpacity>
          {item.caption && (
            <>
              <Text style={styles.caption} numberOfLines={captionExpanded ? undefined : 3}>
                {item.caption}
              </Text>
              {!captionExpanded && (
                <Text
                  onPress={() => setCaptionExpanded(true)}
                  style={{ color: colors.text.secondary, fontSize: fontSize.sm }}
                >
                  more
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
            accessibilityLabel={item.isLiked ? "Unlike reel" : "Like reel"}
          >
            <Icon
              name={item.isLiked ? 'heart-filled' : 'heart'}
              size="lg"
              color={item.isLiked ? colors.error : colors.text.primary}
              style={item.isLiked ? undefined : styles.iconShadow}
            />
            <Text style={styles.actionCount}>{item.likesCount}</Text>
          </ActionButton>
          <ActionButton
            onPress={() => onComment(item)}
            accessibilityLabel="Comment on reel"
          >
            <Icon name="message-circle" size="lg" color={colors.text.primary} style={styles.iconShadow} />
            <Text style={styles.actionCount}>{item.commentsCount}</Text>
          </ActionButton>
          <ActionButton
            onPress={() => onShare(item)}
            accessibilityLabel="Share reel"
          >
            <Icon name="share" size="lg" color={colors.text.primary} style={styles.iconShadow} />
            <Text style={styles.actionCount}>{item.sharesCount}</Text>
          </ActionButton>

          {/* Duet button */}
          <Pressable
            onPress={() => {
              haptic('light');
              router.push(`/(screens)/create-reel?duetWith=${item.id}`);
            }}
            style={{ alignItems: 'center', marginTop: spacing.md }}
          >
            <View style={{
              width: 36, height: 36, borderRadius: radius.full,
              backgroundColor: 'rgba(255,255,255,0.15)',
              borderWidth: 0.5, borderColor: 'rgba(255,255,255,0.2)',
              justifyContent: 'center', alignItems: 'center',
            }}>
              <Icon name="layers" size="sm" color="#fff" style={styles.iconShadow} />
            </View>
            <Text style={styles.actionCountDuetStitch}>Duet</Text>
          </Pressable>

          {/* Stitch button */}
          <Pressable
            onPress={() => {
              haptic('light');
              router.push(`/(screens)/create-reel?stitchFrom=${item.id}`);
            }}
            style={{ alignItems: 'center', marginTop: spacing.md }}
          >
            <View style={{
              width: 36, height: 36, borderRadius: radius.full,
              backgroundColor: 'rgba(255,255,255,0.15)',
              borderWidth: 0.5, borderColor: 'rgba(255,255,255,0.2)',
              justifyContent: 'center', alignItems: 'center',
            }}>
              <Icon name="slash" size="sm" color="#fff" style={styles.iconShadow} />
            </View>
            <Text style={styles.actionCountDuetStitch}>Stitch</Text>
          </Pressable>
          <ActionButton
            onPress={() => onBookmark(item)}
            accessibilityLabel={item.isSaved ? "Remove bookmark" : "Bookmark reel"}
          >
            <Icon
              name={item.isSaved ? 'bookmark-filled' : 'bookmark'}
              size="lg"
              color={item.isSaved ? colors.gold : colors.text.primary}
              fill={item.isSaved ? colors.gold : undefined}
              style={item.isSaved ? undefined : styles.iconShadow}
            />
            {item.savesCount > 0 && <Text style={styles.actionCount}>{item.savesCount}</Text>}
          </ActionButton>
          <ActionButton
            onPress={() => setShowMoreMenu(true)}
            accessibilityLabel="More options"
          >
            <Icon name="more-horizontal" size="lg" color={colors.text.primary} style={styles.iconShadow} />
          </ActionButton>
        </View>

        {/* More menu BottomSheet */}
        <BottomSheet visible={showMoreMenu} onClose={() => setShowMoreMenu(false)}>
          <BottomSheetItem
            label="Not interested"
            icon={<Icon name="eye-off" size="sm" color={colors.text.primary} />}
            onPress={() => { onNotInterested(item); setShowMoreMenu(false); }}
          />
          <BottomSheetItem
            label="Report"
            icon={<Icon name="flag" size="sm" color={colors.error} />}
            onPress={() => { onReport(item); setShowMoreMenu(false); }}
            destructive
          />
          <BottomSheetItem
            label="Copy link"
            icon={<Icon name="link" size="sm" color={colors.text.primary} />}
            onPress={() => { onCopyLink(item); setShowMoreMenu(false); }}
          />
          <BottomSheetItem
            label="Save to collection"
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
  const { user } = useUser();
  const router = useRouter();
  const haptic = useHaptic();
  const [refreshing, setRefreshing] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [commentsReel, setCommentsReel] = useState<Reel | null>(null);
  const [heartTrigger, setHeartTrigger] = useState(0);
  const videoRefs = useRef<{ [key: string]: Video }>({});
  const setVideoRef = useCallback((id: string, ref: Video) => {
    videoRefs.current[id] = ref;
  }, []);
  const listRef = useRef<FlashList<Reel>>(null);
  useScrollToTop(listRef);

  const feedQuery = useInfiniteQuery({
    queryKey: ['reels-feed'],
    queryFn: ({ pageParam }) => reelsApi.getFeed(pageParam as string | undefined),
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
      const index = viewableItems[0].index;
      if (index !== undefined && index !== currentIndex) {
        // Pause previous video
        const prevReel = reels[currentIndex];
        if (prevReel && videoRefs.current[prevReel.id]) {
          videoRefs.current[prevReel.id].pauseAsync();
        }
        // Play new video
        const newReel = reels[index];
        if (newReel && videoRefs.current[newReel.id]) {
          videoRefs.current[newReel.id].playAsync();
        }
        setCurrentIndex(index);
      }
    }
  }, [currentIndex, reels]);

  const likeInFlight = useRef(false);
  const handleLike = async (reel: Reel) => {
    if (likeInFlight.current) return;
    likeInFlight.current = true;
    haptic.light();
    try {
      if (reel.isLiked) {
        await reelsApi.unlike(reel.id);
      } else {
        await reelsApi.like(reel.id);
      }
      feedQuery.refetch();
    } finally {
      likeInFlight.current = false;
    }
  };

  const bookmarkInFlight = useRef(false);
  const handleBookmark = async (reel: Reel) => {
    if (bookmarkInFlight.current) return;
    bookmarkInFlight.current = true;
    haptic.light();
    try {
      if (reel.isBookmarked) {
        await reelsApi.unbookmark(reel.id);
      } else {
        await reelsApi.bookmark(reel.id);
      }
      feedQuery.refetch();
    } finally {
      bookmarkInFlight.current = false;
    }
  };

  const handleShare = async (reel: Reel) => {
    haptic.light();
    await reelsApi.share(reel.id);
    feedQuery.refetch();
  };

  const handleComment = (reel: Reel) => {
    haptic.light();
    setCommentsReel(reel);
  };

  const handleProfilePress = (username: string) => {
    router.push(`/(screens)/profile/${username}`);
  };

  const handleReport = (reel: Reel) => {
    router.push(`/(screens)/report?type=reel&id=${reel.id}`);
  };

  const handleNotInterested = (reel: Reel) => {
    haptic.light();
    Alert.alert('Not Interested', 'We\'ll show you fewer reels like this.');
  };

  const handleCopyLink = (reel: Reel) => {
    haptic.light();
    Alert.alert('Link Copied', 'Reel link copied to clipboard.');
  };

  const doubleTapGesture = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd(() => {
      haptic.medium();
      const reel = reels[currentIndex];
      if (reel && !reel.isLiked) {
        handleLike(reel);
      }
      setHeartTrigger((prev) => prev + 1);
    });

  const renderItem = useCallback(({ item, index }: { item: Reel; index: number }) => (
    <ReelItem
      item={item}
      index={index}
      isActive={index === currentIndex}
      onLike={handleLike}
      onBookmark={handleBookmark}
      onShare={handleShare}
      onComment={handleComment}
      onProfilePress={handleProfilePress}
      onReport={handleReport}
      onNotInterested={handleNotInterested}
      onCopyLink={handleCopyLink}
      setVideoRef={setVideoRef}
      doubleTapGesture={doubleTapGesture}
      heartTrigger={heartTrigger}
    />
  ), [currentIndex, handleLike, handleBookmark, handleShare, handleComment, handleProfilePress, handleReport, handleNotInterested, handleCopyLink, setVideoRef, doubleTapGesture, heartTrigger]);

  const keyExtractor = useCallback((item: Reel) => item.id, []);
  const getItemLayout = useCallback((_: ArrayLike<Reel> | null | undefined, index: number) => ({
    length: SCREEN_H,
    offset: SCREEN_H * index,
    index,
  }), []);

  const listEmpty = feedQuery.isLoading ? (
    <View style={styles.skeletonContainer}>
      <Skeleton.Rect width={SCREEN_W} height={SCREEN_H} borderRadius={0} />
    </View>
  ) : (
    <EmptyState
      icon="video"
      title="No reels yet"
      subtitle="Be the first to upload a short video"
      actionLabel="Upload"
      onAction={() => router.push('/(screens)/create-reel')}
    />
  );

  const listFooter = feedQuery.isFetchingNextPage ? (
    <View style={styles.footer}>
      <Skeleton.Rect width={SCREEN_W} height={SCREEN_H} borderRadius={0} />
    </View>
  ) : null;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.logo}>Bakra</Text>
        <View style={styles.headerRight}>
          <TouchableOpacity
            hitSlop={8}
            onPress={() => { haptic.light(); router.push('/(screens)/search'); }}
            accessibilityLabel="Search"
            accessibilityRole="button"
          >
            <Icon name="search" size="sm" color={colors.text.primary} />
          </TouchableOpacity>
          <TouchableOpacity
            hitSlop={8}
            onPress={() => { haptic.light(); router.push('/(screens)/create-reel'); }}
            accessibilityLabel="Upload reel"
            accessibilityRole="button"
          >
            <Icon name="circle-plus" size="sm" color={colors.text.primary} />
          </TouchableOpacity>
        </View>
      </View>

      <FlashList
        ref={listRef}
        data={reels}
        keyExtractor={keyExtractor}
        getItemLayout={getItemLayout}
        estimatedItemSize={VIDEO_HEIGHT}
        onEndReached={onEndReached}
        onEndReachedThreshold={0.4}
        onRefresh={onRefresh}
        refreshing={refreshing}
        renderItem={renderItem}
        pagingEnabled
        snapToInterval={VIDEO_HEIGHT}
        decelerationRate="fast"
        showsVerticalScrollIndicator={false}
        maxToRenderPerBatch={5}
        windowSize={5}
        removeClippedSubviews={true}
        viewabilityConfig={{ itemVisiblePercentThreshold: 80 }}
        onViewableItemsChanged={handleViewableItemsChanged}
        ListEmptyComponent={listEmpty}
        ListFooterComponent={listFooter}
      />
      {commentsReel && (
        <CommentsSheet
          reel={commentsReel}
          visible={!!commentsReel}
          onClose={() => setCommentsReel(null)}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
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
  },
  logo: {
    color: colors.emerald,
    fontSize: fontSize.xl,
    fontWeight: '700',
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
    height: 2,
    backgroundColor: 'rgba(255,255,255,0.15)',
    zIndex: 20,
  },
  progressFill: {
    height: '100%',
    backgroundColor: colors.emerald,
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
    fontSize: 10,
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
});