import { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Dimensions, ScrollView } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useUser } from '@clerk/clerk-expo';
import { Video, ResizeMode } from 'expo-av';
import { LinearGradient } from 'expo-linear-gradient';
import { Avatar } from '@/components/ui/Avatar';
import { Icon } from '@/components/ui/Icon';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { CommentsSheet } from '@/components/bakra/CommentsSheet';
import { colors, spacing, fontSize, radius } from '@/theme';
import { reelsApi } from '@/services/api';
import { useHaptic } from '@/hooks/useHaptic';
import type { Reel } from '@/types';
import { formatDistanceToNowStrict } from 'date-fns';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
const VIDEO_HEIGHT = SCREEN_H * 0.7;

export default function ReelDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user } = useUser();
  const haptic = useHaptic();

  const videoRef = useRef<Video>(null);
  const [isPlaying, setIsPlaying] = useState(true);
  const [showComments, setShowComments] = useState(false);

  const { data: reel, isLoading, error, refetch } = useQuery({
    queryKey: ['reel', id],
    queryFn: () => reelsApi.getById(id),
  });

  const hasViewed = useRef(false);
  useEffect(() => {
    if (reel?.id && !hasViewed.current) {
      hasViewed.current = true;
      reelsApi.view(reel.id).catch(() => {
        // ignore error
      });
    }
  }, [reel?.id]);

  const handleLike = async () => {
    if (!reel) return;
    haptic.light();
    if (reel.isLiked) {
      await reelsApi.unlike(reel.id);
    } else {
      await reelsApi.like(reel.id);
    }
    refetch();
  };

  const handleBookmark = async () => {
    if (!reel) return;
    haptic.light();
    if (reel.isBookmarked) {
      await reelsApi.unbookmark(reel.id);
    } else {
      await reelsApi.bookmark(reel.id);
    }
    refetch();
  };

  const handleShare = async () => {
    if (!reel) return;
    haptic.light();
    await reelsApi.share(reel.id);
    refetch();
  };

  const handleComment = () => {
    haptic.light();
    setShowComments(true);
  };

  const handleProfilePress = (username: string) => {
    router.push(`/(screens)/profile/${username}`);
  };

  const togglePlay = () => {
    if (!videoRef.current) return;
    if (isPlaying) {
      videoRef.current.pauseAsync();
    } else {
      videoRef.current.playAsync();
    }
    setIsPlaying(!isPlaying);
  };

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.skeletonHeader}>
          <Skeleton.Circle size={32} />
          <Skeleton.Rect width={120} height={20} />
          <Skeleton.Circle size={32} />
        </View>
        <Skeleton.Rect width={SCREEN_W} height={VIDEO_HEIGHT} borderRadius={0} />
        <View style={styles.skeletonActions}>
          <Skeleton.Rect width={60} height={24} />
          <Skeleton.Rect width={60} height={24} />
          <Skeleton.Rect width={60} height={24} />
        </View>
      </SafeAreaView>
    );
  }

  if (error || !reel) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Icon name="arrow-left" size="sm" color={colors.text.primary} />
        </TouchableOpacity>
        <EmptyState
          icon="video"
          title="Reel not found"
          subtitle="The reel may have been deleted"
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
        <TouchableOpacity onPress={() => router.back()} hitSlop={8}>
          <Icon name="arrow-left" size="sm" color={colors.text.primary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Reel</Text>
        <TouchableOpacity hitSlop={8} onPress={handleShare}>
          <Icon name="share" size="sm" color={colors.text.primary} />
        </TouchableOpacity>
      </View>

      {/* Video */}
      <TouchableOpacity style={styles.videoContainer} onPress={togglePlay} activeOpacity={0.9}>
        <Video
          ref={videoRef}
          source={{ uri: reel.videoUrl }}
          style={styles.video}
          resizeMode={ResizeMode.COVER}
          shouldPlay={isPlaying}
          isLooping
          useNativeControls={false}
        />
        <LinearGradient
          colors={['transparent', 'rgba(0,0,0,0.8)']}
          locations={[0.6, 1]}
          style={styles.bottomGradient}
        />
        {!isPlaying && (
          <View style={styles.playOverlay}>
            <Icon name="play" size="xl" color={colors.text.primary} />
          </View>
        )}
      </TouchableOpacity>

      {/* Info overlay */}
      <View style={styles.infoOverlay}>
        <TouchableOpacity
          style={styles.userRow}
          onPress={() => handleProfilePress(reel.user.username)}
          activeOpacity={0.7}
        >
          <Avatar
            uri={reel.user.avatarUrl}
            name={reel.user.username}
            size="sm"
            showRing={false}
          />
          <View style={styles.userText}>
            <Text style={styles.username}>{reel.user.username}</Text>
            <Text style={styles.time}>
              {formatDistanceToNowStrict(new Date(reel.createdAt), { addSuffix: true })}
            </Text>
          </View>
        </TouchableOpacity>
        {reel.caption && (
          <Text style={styles.caption} numberOfLines={3}>
            {reel.caption}
          </Text>
        )}
        {reel.audioTitle && (
          <View style={styles.soundRow}>
            <Icon name="music" size="sm" color={colors.text.primary} />
            <Text style={styles.soundText}>
              {reel.audioTitle}
              {reel.audioArtist && ` · ${reel.audioArtist}`}
            </Text>
          </View>
        )}
      </View>

      {/* Right action buttons */}
      <View style={styles.actionColumn}>
        <TouchableOpacity style={styles.actionButton} onPress={handleLike} activeOpacity={0.7}>
          <Icon
            name={reel.isLiked ? 'heart-filled' : 'heart'}
            size="lg"
            color={reel.isLiked ? colors.error : colors.text.primary}
          />
          <Text style={styles.actionCount}>{reel.likesCount}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionButton} onPress={handleComment} activeOpacity={0.7}>
          <Icon name="message-circle" size="lg" color={colors.text.primary} />
          <Text style={styles.actionCount}>{reel.commentsCount}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionButton} onPress={handleShare} activeOpacity={0.7}>
          <Icon name="share" size="lg" color={colors.text.primary} />
          <Text style={styles.actionCount}>{reel.sharesCount}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionButton} onPress={handleBookmark} activeOpacity={0.7}>
          <Icon
            name={reel.isBookmarked ? 'bookmark-filled' : 'bookmark'}
            size="lg"
            color={reel.isBookmarked ? colors.gold : colors.text.primary}
          />
        </TouchableOpacity>
      </View>

      {/* Comments sheet */}
      {showComments && (
        <CommentsSheet
          reel={reel}
          visible={showComments}
          onClose={() => setShowComments(false)}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.dark.bg },
  skeletonHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
  },
  skeletonActions: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: spacing.lg,
  },
  backButton: {
    position: 'absolute',
    top: spacing.xl,
    left: spacing.base,
    zIndex: 10,
  },
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
  headerTitle: {
    color: colors.text.primary,
    fontSize: fontSize.lg,
    fontWeight: '700',
  },
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
    height: 200,
  },
  playOverlay: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    marginLeft: -24,
    marginTop: -24,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: radius.full,
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoOverlay: {
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
    lineHeight: 20,
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
});