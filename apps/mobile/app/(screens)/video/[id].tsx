import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert,
  RefreshControl, TextInput, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useUser } from '@clerk/clerk-expo';
import { Video, ResizeMode, AVPlaybackStatus } from 'expo-av';
import { formatDistanceToNowStrict } from 'date-fns';
import { Avatar } from '@/components/ui/Avatar';
import { Icon } from '@/components/ui/Icon';
import { Badge } from '@/components/ui/Badge';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { BottomSheet, BottomSheetItem } from '@/components/ui/BottomSheet';
import { useHaptic } from '@/hooks/useHaptic';
import { colors, spacing, fontSize, radius } from '@/theme';
import { videosApi, channelsApi } from '@/services/api';
import type { Video as VideoType, VideoComment } from '@/types';

export default function VideoDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user } = useUser();
  const haptic = useHaptic();
  const queryClient = useQueryClient();
  const videoRef = useRef<Video>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [commentSheetOpen, setCommentSheetOpen] = useState(false);
  const [commentText, setCommentText] = useState('');
  const [replyToId, setReplyToId] = useState<string | undefined>();

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

  // Record view on mount
  useEffect(() => {
    if (video?.id && user?.id) {
      videosApi.view(video.id).catch(console.error);
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

  const handleShare = () => {
    haptic.light();
    // TODO: implement share
    Alert.alert('Share', 'Sharing video...');
  };

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
          <TouchableOpacity onPress={() => setReplyToId(item.id)}>
            <Text style={styles.commentAction}>Reply</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );

  if (videoQuery.isLoading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Icon name="arrow-left" size="md" color={colors.text.primary} />
          </TouchableOpacity>
        </View>
        <Skeleton.Rect width="100%" aspectRatio={16/9} borderRadius={0} />
        <View style={styles.skeletonContent}>
          <Skeleton.Rect width="80%" height={24} borderRadius={radius.sm} />
          <Skeleton.Rect width="40%" height={16} borderRadius={radius.sm} style={{ marginTop: spacing.sm }} />
          <Skeleton.Rect width="100%" height={60} borderRadius={radius.sm} style={{ marginTop: spacing.lg }} />
          <Skeleton.Rect width="100%" height={80} borderRadius={radius.sm} style={{ marginTop: spacing.lg }} />
        </View>
      </SafeAreaView>
    );
  }

  if (!video) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Icon name="arrow-left" size="md" color={colors.text.primary} />
          </TouchableOpacity>
        </View>
        <EmptyState
          icon="video"
          title="Video not found"
          subtitle="This video may have been removed or is unavailable"
          actionLabel="Go back"
          onAction={() => router.back()}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header with back button */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Icon name="arrow-left" size="md" color={colors.text.primary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Video</Text>
        <View style={styles.headerRight}>
          <TouchableOpacity onPress={handleShare} style={styles.headerAction}>
            <Icon name="share" size="sm" color={colors.text.primary} />
          </TouchableOpacity>
          <TouchableOpacity onPress={handleReport} style={styles.headerAction}>
            <Icon name="flag" size="sm" color={colors.text.primary} />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.emerald} />
        }
        showsVerticalScrollIndicator={false}
      >
        {/* Video player */}
        <Video
          ref={videoRef}
          source={{ uri: video.videoUrl }}
          style={styles.videoPlayer}
          resizeMode={ResizeMode.CONTAIN}
          useNativeControls
          shouldPlay
          isLooping={false}
        />

        {/* Title & stats */}
        <View style={styles.content}>
          <Text style={styles.videoTitle}>{video.title}</Text>
          <Text style={styles.videoStats}>
            {video.viewsCount.toLocaleString()} views • {formatDistanceToNowStrict(new Date(video.publishedAt || video.createdAt), { addSuffix: true })}
          </Text>

          {/* Action row */}
          <View style={styles.actionRow}>
            <TouchableOpacity style={styles.actionButton} onPress={handleLike}>
              <Icon
                name={video.isLiked ? 'heart-filled' : 'heart'}
                size="md"
                color={video.isLiked ? colors.error : colors.text.primary}
              />
              <Text style={styles.actionCount}>{video.likesCount}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionButton} onPress={handleDislike}>
              <Icon
                name={video.isDisliked ? 'thumbs-down' : 'thumbs-down'}
                size="md"
                color={video.isDisliked ? colors.error : colors.text.primary}
              />
              <Text style={styles.actionCount}>{video.dislikesCount}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionButton} onPress={() => setCommentSheetOpen(true)}>
              <Icon name="message-circle" size="md" color={colors.text.primary} />
              <Text style={styles.actionCount}>{video.commentsCount}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionButton} onPress={handleBookmark}>
              <Icon
                name={video.isBookmarked ? 'bookmark-filled' : 'bookmark'}
                size="md"
                color={video.isBookmarked ? colors.gold : colors.text.primary}
              />
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionButton} onPress={handleShare}>
              <Icon name="share" size="md" color={colors.text.primary} />
            </TouchableOpacity>
          </View>

          {/* Channel row */}
          <TouchableOpacity style={styles.channelRow} onPress={handleChannelPress}>
            <Avatar
              uri={video.channel.avatarUrl}
              name={video.channel.name}
              size="lg"
              showRing={false}
            />
            <View style={styles.channelInfo}>
              <Text style={styles.channelName}>{video.channel.name}</Text>
              <Text style={styles.channelSubscribers}>
                {video.channel.subscribersCount.toLocaleString()} subscribers
              </Text>
            </View>
            <TouchableOpacity
              style={[
                styles.subscribeButton,
                video.isSubscribed && styles.subscribedButton,
              ]}
              onPress={handleSubscribe}
            >
              <Text style={[
                styles.subscribeText,
                video.isSubscribed && styles.subscribedText,
              ]}>
                {video.isSubscribed ? 'Subscribed' : 'Subscribe'}
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

          {/* Comments preview */}
          <View style={styles.commentsSection}>
            <View style={styles.commentsHeader}>
              <Text style={styles.commentsTitle}>Comments ({video.commentsCount})</Text>
              <TouchableOpacity onPress={() => setCommentSheetOpen(true)}>
                <Text style={styles.viewAll}>View all</Text>
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
              <Text style={styles.noComments}>No comments yet. Be the first!</Text>
            )}
          </View>
        </View>
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
            placeholder="Add a comment..."
            placeholderTextColor={colors.text.tertiary}
            value={commentText}
            onChangeText={setCommentText}
            multiline
          />
          <TouchableOpacity onPress={handleCommentSubmit} disabled={!commentText.trim()}>
            <Icon name="send" size="sm" color={commentText.trim() ? colors.emerald : colors.text.tertiary} />
          </TouchableOpacity>
        </View>
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
  backButton: {
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
  actionButton: {
    alignItems: 'center',
    gap: spacing.xs,
  },
  actionCount: {
    color: colors.text.secondary,
    fontSize: fontSize.sm,
    fontWeight: '500',
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
});