import { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Dimensions, TouchableOpacity } from 'react-native';
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
  runOnJS,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, spacing, fontSize, radius } from '@/theme';
import { useStore } from '@/store';
import { reelsApi } from '@/services/api';
import { Avatar } from '@/components/ui/Avatar';
import { Icon } from '@/components/ui/Icon';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { CommentsSheet } from '@/components/bakra/CommentsSheet';
import { useHaptic } from '@/hooks/useHaptic';
import { useAnimatedPress } from '@/hooks/useAnimatedPress';
import type { Reel } from '@/types';
import { formatDistanceToNowStrict } from 'date-fns';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
const VIDEO_HEIGHT = SCREEN_H;
const VIDEO_WIDTH = SCREEN_W;

export default function BakraScreen() {
  const { user } = useUser();
  const router = useRouter();
  const haptic = useHaptic();
  const [refreshing, setRefreshing] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [commentsReel, setCommentsReel] = useState<Reel | null>(null);
  const videoRefs = useRef<{ [key: string]: Video }>({});
  const listRef = useRef<FlashList<Reel>>(null);
  useScrollToTop(listRef);

  const feedQuery = useInfiniteQuery({
    queryKey: ['reels-feed'],
    queryFn: ({ pageParam }) => reelsApi.getFeed(pageParam as string | undefined),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.meta.hasMore ? last.meta.cursor ?? undefined : undefined,
  });

  const reels: Reel[] = feedQuery.data?.pages.flatMap((p) => p.data) ?? [];

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await feedQuery.refetch();
    setRefreshing(false);
  }, [feedQuery]);

  const onEndReached = () => {
    if (feedQuery.hasNextPage && !feedQuery.isFetchingNextPage) {
      feedQuery.fetchNextPage();
    }
  };

  const handleViewableItemsChanged = useCallback(({ viewableItems }: any) => {
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

  const handleLike = async (reel: Reel) => {
    haptic.light();
    if (reel.isLiked) {
      await reelsApi.unlike(reel.id);
    } else {
      await reelsApi.like(reel.id);
    }
    feedQuery.refetch();
  };

  const handleBookmark = async (reel: Reel) => {
    haptic.light();
    if (reel.isBookmarked) {
      await reelsApi.unbookmark(reel.id);
    } else {
      await reelsApi.bookmark(reel.id);
    }
    feedQuery.refetch();
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

  const doubleTapGesture = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd(() => {
      haptic.medium();
      const reel = reels[currentIndex];
      if (reel && !reel.isLiked) {
        handleLike(reel);
      }
    });

  const renderItem = ({ item, index }: { item: Reel; index: number }) => {
    const isActive = index === currentIndex;

    return (
      <GestureDetector gesture={doubleTapGesture}>
        <View style={styles.videoContainer}>
          <Video
            ref={(ref) => { if (ref) videoRefs.current[item.id] = ref; }}
            source={{ uri: item.videoUrl }}
            style={styles.video}
            resizeMode={ResizeMode.COVER}
            shouldPlay={isActive}
            isLooping
            useNativeControls={false}
            onPlaybackStatusUpdate={(status: AVPlaybackStatus) => {
              if (status.isLoaded && !status.isPlaying && isActive) {
                // Auto-play if paused but should be playing
                videoRefs.current[item.id]?.playAsync();
              }
            }}
          />
          <LinearGradient
            colors={['transparent', 'rgba(0,0,0,0.8)']}
            locations={[0.6, 1]}
            style={styles.bottomGradient}
          />
          <LinearGradient
            colors={['rgba(0,0,0,0.4)', 'transparent']}
            locations={[0, 0.4]}
            style={styles.topGradient}
          />

          {/* User info & caption */}
          <View style={styles.infoContainer}>
            <TouchableOpacity
              style={styles.userRow}
              onPress={() => handleProfilePress(item.user.username)}
              activeOpacity={0.7}
            >
              <Avatar
                uri={item.user.avatarUrl}
                name={item.user.username}
                size="sm"
                showRing={false}
              />
              <View style={styles.userText}>
                <Text style={styles.username}>{item.user.username}</Text>
                <Text style={styles.time}>
                  {formatDistanceToNowStrict(new Date(item.createdAt), { addSuffix: true })}
                </Text>
              </View>
            </TouchableOpacity>
            {item.caption && (
              <Text style={styles.caption} numberOfLines={3}>
                {item.caption}
              </Text>
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
            <TouchableOpacity
              style={styles.actionButton}
              onPress={() => handleLike(item)}
              activeOpacity={0.7}
            >
              <Icon
                name={item.isLiked ? 'heart-filled' : 'heart'}
                size="lg"
                color={item.isLiked ? colors.error : colors.text.primary}
              />
              <Text style={styles.actionCount}>{item.likesCount}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.actionButton}
              onPress={() => handleComment(item)}
              activeOpacity={0.7}
            >
              <Icon name="message-circle" size="lg" color={colors.text.primary} />
              <Text style={styles.actionCount}>{item.commentsCount}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.actionButton}
              onPress={() => handleShare(item)}
              activeOpacity={0.7}
            >
              <Icon name="share" size="lg" color={colors.text.primary} />
              <Text style={styles.actionCount}>{item.sharesCount}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.actionButton}
              onPress={() => handleBookmark(item)}
              activeOpacity={0.7}
            >
              <Icon
                name={item.isBookmarked ? 'bookmark-filled' : 'bookmark'}
                size="lg"
                color={item.isBookmarked ? colors.gold : colors.text.primary}
              />
            </TouchableOpacity>
          </View>
        </View>
      </GestureDetector>
    );
  };

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
          >
            <Icon name="search" size="sm" color={colors.text.primary} />
          </TouchableOpacity>
          <TouchableOpacity
            hitSlop={8}
            onPress={() => { haptic.light(); router.push('/(screens)/create-reel'); }}
            accessibilityLabel="Upload reel"
          >
            <Icon name="circle-plus" size="sm" color={colors.text.primary} />
          </TouchableOpacity>
        </View>
      </View>

      <FlashList
        ref={listRef}
        data={reels}
        keyExtractor={(item) => item.id}
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
  },
  username: {
    color: colors.text.primary,
    fontSize: fontSize.base,
    fontWeight: '600',
  },
  time: {
    color: colors.text.secondary,
    fontSize: fontSize.sm,
    marginTop: 2,
  },
  caption: {
    color: colors.text.primary,
    fontSize: fontSize.base,
    marginBottom: spacing.sm,
    lineHeight: fontSize.lg,
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
  },
  actionButton: {
    alignItems: 'center',
    gap: spacing.xs,
  },
  actionCount: {
    color: colors.text.primary,
    fontSize: fontSize.sm,
    fontWeight: '600',
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