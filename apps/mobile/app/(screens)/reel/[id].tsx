import { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput, Pressable,
  KeyboardAvoidingView, Platform, FlatList, RefreshControl, Alert,
  Dimensions,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery, useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useUser } from '@clerk/clerk-expo';
import { formatDistanceToNowStrict } from 'date-fns';
import { Video, ResizeMode } from 'expo-av';
import { LinearGradient } from 'expo-linear-gradient';
import { Avatar } from '@/components/ui/Avatar';
import { Icon } from '@/components/ui/Icon';
import { RichText } from '@/components/ui/RichText';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { useHaptic } from '@/hooks/useHaptic';
import { useAnimatedPress } from '@/hooks/useAnimatedPress';
import { colors, spacing, fontSize, radius } from '@/theme';
import { reelsApi } from '@/services/api';
import type { Comment, Reel } from '@/types';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
const VIDEO_HEIGHT = SCREEN_H * 0.7;
const VIDEO_WIDTH = SCREEN_W;

function CommentRow({
  comment,
  reelId,
  viewerId,
  onReply,
  onDeleted,
}: {
  comment: Comment;
  reelId: string;
  viewerId?: string;
  onReply: (id: string, username: string) => void;
  onDeleted: () => void;
}) {
  const haptic = useHaptic();
  const [localLiked, setLocalLiked] = useState(comment.isLiked ?? false);
  const [localLikes, setLocalLikes] = useState(comment.likesCount);
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState(comment.content);
  const timeAgo = formatDistanceToNowStrict(new Date(comment.createdAt), { addSuffix: true });
  const isOwn = !!viewerId && comment.user.id === viewerId;

  // Note: Reel comment liking not implemented in API yet
  const handleLikeComment = () => {
    // TODO: Implement when API supports liking reel comments
    haptic.medium();
    setLocalLiked((p) => !p);
    setLocalLikes((p) => (localLiked ? p - 1 : p + 1));
  };

  const deleteMutation = useMutation({
    mutationFn: () => reelsApi.delete(reelId),
    onSuccess: onDeleted,
    onError: (err: Error) => Alert.alert('Error', err.message),
  });

  const handleDelete = () => {
    Alert.alert('Delete Comment', 'Delete this comment?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deleteMutation.mutate() },
    ]);
  };

  return (
    <View style={styles.commentRow}>
      <Avatar uri={comment.user.avatarUrl} name={comment.user.displayName} size="sm" />
      <View style={styles.commentBody}>
        <View style={styles.commentBubble}>
          <Text style={styles.commentUser}>{comment.user.displayName}</Text>
          {editing ? (
            <TextInput
              style={[styles.commentText, styles.commentEditInput]}
              value={editText}
              onChangeText={setEditText}
              multiline
              autoFocus
              maxLength={500}
            />
          ) : (
            <RichText content={comment.content} />
          )}
        </View>
        {editing ? (
          <View style={styles.commentMeta}>
            <TouchableOpacity onPress={() => setEditing(false)}>
              <Text style={styles.commentAction}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => {}}
              disabled={!editText.trim()}
            >
              <Text style={[styles.commentAction, { color: colors.emerald }]}>Save</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.commentMeta}>
            <Text style={styles.commentTime}>{timeAgo}</Text>
            {localLikes > 0 && (
              <Text style={styles.commentLikesLabel}>{localLikes} likes</Text>
            )}
            <TouchableOpacity onPress={() => onReply(comment.id, comment.user.username)}>
              <Text style={styles.commentAction}>Reply</Text>
            </TouchableOpacity>
            {isOwn && (
              <>
                <TouchableOpacity onPress={() => setEditing(true)}>
                  <Text style={styles.commentAction}>Edit</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={handleDelete} disabled={deleteMutation.isPending}>
                  <Text style={styles.commentActionDestructive}>Delete</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        )}
      </View>
      {!editing && (
        <TouchableOpacity
          onPress={() => { viewerId && handleLikeComment(); }}
          disabled={!viewerId}
          hitSlop={8}
          style={styles.commentLike}
        >
          <Icon
            name={localLiked ? 'heart-filled' : 'heart'}
            size={16}
            color={localLiked ? colors.like : colors.text.tertiary}
            fill={localLiked ? colors.like : undefined}
          />
        </TouchableOpacity>
      )}
    </View>
  );
}

export default function ReelDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user } = useUser();
  const queryClient = useQueryClient();
  const haptic = useHaptic();
  const inputRef = useRef<TextInput>(null);
  const videoRef = useRef<Video>(null);
  const [commentText, setCommentText] = useState('');
  const [replyTo, setReplyTo] = useState<{ id: string; username: string } | null>(null);
  const [isPlaying, setIsPlaying] = useState(true);
  const { animatedStyle, handlePressIn, handlePressOut } = useAnimatedPress();

  // Record view when component mounts
  useEffect(() => {
    if (id) {
      reelsApi.view(id).catch(() => {
        // Silently fail if view recording fails
      });
    }
  }, [id]);

  const reelQuery = useQuery({
    queryKey: ['reel', id],
    queryFn: () => reelsApi.getById(id),
  });

  const commentsQuery = useInfiniteQuery({
    queryKey: ['reel-comments', id],
    queryFn: ({ pageParam }) =>
      reelsApi.getComments(id, pageParam as string | undefined),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) =>
      last.meta.hasMore ? last.meta.cursor ?? undefined : undefined,
  });

  const comments: Comment[] = commentsQuery.data?.pages.flatMap((p) => p.data) ?? [];

  const sendMutation = useMutation({
    mutationFn: () =>
      reelsApi.comment(id, commentText.trim()),
    onSuccess: () => {
      setCommentText('');
      setReplyTo(null);
      queryClient.invalidateQueries({ queryKey: ['reel-comments', id] });
      queryClient.invalidateQueries({ queryKey: ['reel', id] });
    },
  });

  const likeMutation = useMutation({
    mutationFn: () =>
      reelQuery.data?.isLiked
        ? reelsApi.unlike(id)
        : reelsApi.like(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reel', id] });
    },
  });

  const bookmarkMutation = useMutation({
    mutationFn: () =>
      reelQuery.data?.isBookmarked
        ? reelsApi.unbookmark(id)
        : reelsApi.bookmark(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reel', id] });
    },
  });

  const shareMutation = useMutation({
    mutationFn: () => reelsApi.share(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reel', id] });
    },
  });

  const handleReply = useCallback((commentId: string, username: string) => {
    setReplyTo({ id: commentId, username });
    inputRef.current?.focus();
  }, []);

  const handleRefresh = useCallback(() => {
    reelQuery.refetch();
    commentsQuery.refetch();
  }, [reelQuery, commentsQuery]);

  const handlePlayPause = () => {
    if (isPlaying) {
      videoRef.current?.pauseAsync();
    } else {
      videoRef.current?.playAsync();
    }
    setIsPlaying(!isPlaying);
  };


  const handleLike = () => {
    haptic.light();
    likeMutation.mutate();
  };

  const handleBookmark = () => {
    haptic.light();
    bookmarkMutation.mutate();
  };

  const handleShare = () => {
    haptic.light();
    shareMutation.mutate();
  };

  const canSend = commentText.trim().length > 0 && !sendMutation.isPending;

  const listHeader = useMemo(() => (
    reelQuery.data ? (
      <View style={styles.reelContainer}>
        {/* Video Player */}
        <View style={styles.videoContainer}>
          <Video
            ref={videoRef}
            source={{ uri: reelQuery.data.videoUrl }}
            style={styles.video}
            resizeMode={ResizeMode.COVER}
            shouldPlay={isPlaying}
            isLooping
            useNativeControls={false}
          />

          {/* Video Controls Overlay - Show play button when paused */}
          {!isPlaying && (
            <View style={styles.videoControls}>
              <TouchableOpacity onPress={handlePlayPause} style={styles.controlButton}>
                <Icon
                  name="play"
                  size={44}
                  color={colors.text.primary}
                />
              </TouchableOpacity>
            </View>
          )}

          {/* Gradient Overlay */}
          <LinearGradient
            colors={['transparent', 'rgba(0,0,0,0.8)']}
            style={styles.bottomGradient}
            locations={[0.6, 1]}
          />

          {/* Reel Info Overlay */}
          <View style={styles.reelInfoOverlay}>
            <View style={styles.reelHeader}>
              <Avatar
                uri={reelQuery.data.user.avatarUrl}
                name={reelQuery.data.user.displayName}
                size="md"
                showStoryRing
              />
              <View style={styles.reelUserInfo}>
                <Text style={styles.reelUsername}>@{reelQuery.data.user.username}</Text>
                <Text style={styles.reelDisplayName}>{reelQuery.data.user.displayName}</Text>
              </View>
              <TouchableOpacity style={styles.followButton}>
                <Text style={styles.followButtonText}>Follow</Text>
              </TouchableOpacity>
            </View>

            {reelQuery.data.caption && (
              <Text style={styles.reelCaption}>
                <RichText content={reelQuery.data.caption} />
              </Text>
            )}

            {reelQuery.data.audioTitle && (
              <View style={styles.audioInfo}>
                <Icon name="music" size={16} color={colors.text.secondary} />
                <Text style={styles.audioText}>
                  {reelQuery.data.audioTitle} • {reelQuery.data.audioArtist}
                </Text>
              </View>
            )}

            {/* Action Buttons */}
            <View style={styles.actionButtons}>
              <TouchableOpacity
                onPress={handleLike}
                style={styles.actionButton}
                disabled={likeMutation.isPending}
              >
                <Animated.View style={animatedStyle}>
                  <Icon
                    name={reelQuery.data.isLiked ? 'heart-filled' : 'heart'}
                    size={28}
                    color={reelQuery.data.isLiked ? colors.like : colors.text.primary}
                    fill={reelQuery.data.isLiked ? colors.like : undefined}
                  />
                </Animated.View>
                <Text style={styles.actionCount}>{reelQuery.data.likesCount}</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => {}}
                style={styles.actionButton}
              >
                <Icon name="message-circle" size={28} color={colors.text.primary} />
                <Text style={styles.actionCount}>{reelQuery.data.commentsCount}</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={handleShare}
                style={styles.actionButton}
                disabled={shareMutation.isPending}
              >
                <Icon name="share" size={28} color={colors.text.primary} />
                <Text style={styles.actionCount}>{reelQuery.data.sharesCount}</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={handleBookmark}
                style={styles.actionButton}
                disabled={bookmarkMutation.isPending}
              >
                <Icon
                  name={reelQuery.data.isBookmarked ? 'bookmark-filled' : 'bookmark'}
                  size={28}
                  color={reelQuery.data.isBookmarked ? colors.gold : colors.text.primary}
                  fill={reelQuery.data.isBookmarked ? colors.gold : undefined}
                />
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* Comments Header */}
        <View style={styles.commentsHeader}>
          <Text style={styles.commentsTitle}>
            {reelQuery.data.commentsCount} Comments
          </Text>
        </View>
      </View>
    ) : reelQuery.isLoading ? (
      <View style={{ padding: spacing.base }}>
        <Skeleton.Rect width="100%" height={VIDEO_HEIGHT} borderRadius={0} />
        <View style={{ padding: spacing.base }}>
          <Skeleton.Rect width="60%" height={20} />
          <Skeleton.Rect width="40%" height={16} style={{ marginTop: spacing.sm }} />
        </View>
      </View>
    ) : null
  ), [reelQuery.data, reelQuery.isLoading, isPlaying, animatedStyle]);

  const listEmpty = useMemo(() => (
    !commentsQuery.isLoading && reelQuery.data ? (
      <EmptyState
        icon="message-circle"
        title="No comments yet"
        subtitle="Be the first to comment!"
      />
    ) : null
  ), [commentsQuery.isLoading, reelQuery.data]);

  const listFooter = useMemo(() => (
    commentsQuery.isFetchingNextPage ? (
      <Skeleton.Rect width="100%" height={60} />
    ) : null
  ), [commentsQuery.isFetchingNextPage]);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={8} style={styles.backBtn}>
          <Icon name="arrow-left" size="md" color={colors.text.primary} />
        </Pressable>
        <Text style={styles.headerTitle}>Reel</Text>
        <View style={{ width: 40 }} />
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={0}
      >
        <FlatList
          data={comments}
          keyExtractor={(item) => item.id}
          onEndReached={() => {
            if (commentsQuery.hasNextPage && !commentsQuery.isFetchingNextPage) {
              commentsQuery.fetchNextPage();
            }
          }}
          onEndReachedThreshold={0.4}
          refreshControl={
            <RefreshControl
              refreshing={reelQuery.isRefetching || commentsQuery.isRefetching}
              onRefresh={handleRefresh}
              tintColor={colors.emerald}
            />
          }
          ListHeaderComponent={listHeader}
          renderItem={({ item }) => (
            <CommentRow
              comment={item}
              reelId={id}
              viewerId={user?.id}
              onReply={handleReply}
              onDeleted={() => {
                queryClient.invalidateQueries({ queryKey: ['reel-comments', id] });
                queryClient.invalidateQueries({ queryKey: ['reel', id] });
              }}
            />
          )}
          ListEmptyComponent={listEmpty}
          ListFooterComponent={listFooter}
          contentContainerStyle={{ paddingBottom: 100 }}
        />

        {/* Comment Input */}
        {user && (
          <View style={styles.inputWrap}>
            {replyTo && (
              <View style={styles.replyBanner}>
                <Text style={styles.replyBannerText}>
                  Replying to @{replyTo.username}
                </Text>
                <Pressable onPress={() => setReplyTo(null)} hitSlop={8}>
                  <Icon name="x" size="xs" color={colors.text.secondary} />
                </Pressable>
              </View>
            )}
            <View style={styles.inputRow}>
              <Avatar uri={user.imageUrl} name={user.fullName ?? 'Me'} size="sm" />
              <TextInput
                ref={inputRef}
                style={styles.input}
                placeholder={replyTo ? `Reply to @${replyTo.username}…` : 'Add a comment…'}
                placeholderTextColor={colors.text.tertiary}
                value={commentText}
                onChangeText={setCommentText}
                multiline
                maxLength={500}
              />
              <TouchableOpacity
                onPress={() => canSend && sendMutation.mutate()}
                disabled={!canSend}
              >
                {sendMutation.isPending ? (
                  <Icon name="loader" size="sm" color={colors.emerald} />
                ) : (
                  <Text style={[styles.sendBtn, !canSend && styles.sendBtnDisabled]}>
                    Send
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.dark.bg },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.base, paddingVertical: spacing.sm,
    borderBottomWidth: 0.5, borderBottomColor: colors.dark.border,
    backgroundColor: 'rgba(13, 17, 23, 0.95)',
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
  },
  backBtn: { width: 40, alignItems: 'flex-start' },
  headerTitle: { color: colors.text.primary, fontSize: fontSize.base, fontWeight: '700' },
  reelContainer: {
    backgroundColor: colors.dark.bg,
  },
  videoContainer: {
    width: VIDEO_WIDTH,
    height: VIDEO_HEIGHT,
    backgroundColor: colors.dark.bg,
  },
  video: {
    width: '100%',
    height: '100%',
  },
  videoControls: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },
  controlButton: {
    padding: spacing.md,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: radius.full,
    margin: spacing.sm,
  },
  bottomGradient: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 200,
  },
  reelInfoOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    padding: spacing.base,
  },
  reelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  reelUserInfo: {
    flex: 1,
    marginLeft: spacing.sm,
  },
  reelUsername: {
    color: colors.text.primary,
    fontSize: fontSize.sm,
    fontWeight: '700',
  },
  reelDisplayName: {
    color: colors.text.secondary,
    fontSize: fontSize.xs,
  },
  followButton: {
    backgroundColor: colors.emerald,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.full,
  },
  followButtonText: {
    color: colors.text.primary,
    fontSize: fontSize.sm,
    fontWeight: '700',
  },
  reelCaption: {
    color: colors.text.primary,
    fontSize: fontSize.base,
    marginBottom: spacing.md,
    lineHeight: 22,
  },
  audioInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  audioText: {
    color: colors.text.secondary,
    fontSize: fontSize.sm,
    marginLeft: spacing.xs,
  },
  actionButtons: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    marginTop: spacing.base,
  },
  actionButton: {
    alignItems: 'center',
  },
  actionCount: {
    color: colors.text.primary,
    fontSize: fontSize.xs,
    marginTop: 2,
    fontWeight: '600',
  },
  commentsHeader: {
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    borderTopWidth: 0.5,
    borderTopColor: colors.dark.border,
  },
  commentsTitle: {
    color: colors.text.primary,
    fontSize: fontSize.base,
    fontWeight: '700',
  },
  commentRow: {
    flexDirection: 'row',
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
  },
  commentBody: { flex: 1 },
  commentBubble: {
    backgroundColor: colors.dark.bgElevated,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  commentUser: {
    color: colors.text.primary,
    fontSize: fontSize.sm,
    fontWeight: '700',
    marginBottom: 2,
  },
  commentText: {
    color: colors.text.primary,
    fontSize: fontSize.sm,
    lineHeight: 19,
  },
  commentEditInput: {
    borderBottomWidth: 0.5,
    borderBottomColor: colors.emerald,
    paddingBottom: 2,
  },
  commentMeta: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.xs,
    paddingHorizontal: spacing.xs,
  },
  commentTime: {
    color: colors.text.tertiary,
    fontSize: fontSize.xs,
  },
  commentLikesLabel: {
    color: colors.text.secondary,
    fontSize: fontSize.xs,
    fontWeight: '600',
  },
  commentAction: {
    color: colors.text.secondary,
    fontSize: fontSize.xs,
    fontWeight: '700',
  },
  commentActionDestructive: {
    color: colors.error,
    fontSize: fontSize.xs,
    fontWeight: '700',
  },
  commentLike: { paddingTop: spacing.xs },
  inputWrap: {
    borderTopWidth: 0.5,
    borderTopColor: colors.dark.border,
    backgroundColor: colors.dark.bg,
    paddingBottom: Platform.OS === 'ios' ? spacing.base : spacing.sm,
  },
  replyBanner: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.xs,
    backgroundColor: colors.dark.bgElevated,
  },
  replyBannerText: {
    color: colors.text.secondary,
    fontSize: fontSize.xs,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: spacing.base,
    paddingTop: spacing.sm,
    gap: spacing.sm,
  },
  input: {
    flex: 1,
    color: colors.text.primary,
    fontSize: fontSize.base,
    maxHeight: 100,
    paddingVertical: 6,
  },
  sendBtn: {
    color: colors.emerald,
    fontSize: fontSize.base,
    fontWeight: '700',
  },
  sendBtnDisabled: {
    color: colors.text.tertiary,
  },
});