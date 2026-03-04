import { useState, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput, Pressable,
  KeyboardAvoidingView, Platform, FlatList,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery, useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useUser } from '@clerk/clerk-expo';
import { formatDistanceToNowStrict } from 'date-fns';
import { Avatar } from '@/components/ui/Avatar';
import { Icon } from '@/components/ui/Icon';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { PostCard } from '@/components/saf/PostCard';
import { useHaptic } from '@/hooks/useHaptic';
import { colors, spacing, fontSize } from '@/theme';
import { postsApi } from '@/services/api';
import type { Comment } from '@/types';

function CommentRow({
  comment,
  postId,
  viewerId,
  onReply,
}: {
  comment: Comment;
  postId: string;
  viewerId?: string;
  onReply: (id: string, username: string) => void;
}) {
  const haptic = useHaptic();
  const [localLiked, setLocalLiked] = useState(false);
  const [localLikes, setLocalLikes] = useState(comment.likesCount);
  const timeAgo = formatDistanceToNowStrict(new Date(comment.createdAt), { addSuffix: true });

  const likeMutation = useMutation({
    mutationFn: () =>
      localLiked
        ? postsApi.unlikeComment(postId, comment.id)
        : postsApi.likeComment(postId, comment.id),
    onMutate: () => {
      setLocalLiked((p) => !p);
      setLocalLikes((p) => (localLiked ? p - 1 : p + 1));
    },
    onError: () => {
      setLocalLiked((p) => !p);
      setLocalLikes((p) => (localLiked ? p + 1 : p - 1));
    },
  });

  return (
    <View style={styles.commentRow}>
      <Avatar uri={comment.user.avatarUrl} name={comment.user.displayName} size="sm" />
      <View style={styles.commentBody}>
        <View style={styles.commentBubble}>
          <Text style={styles.commentUser}>{comment.user.displayName}</Text>
          <Text style={styles.commentText}>{comment.content}</Text>
        </View>
        <View style={styles.commentMeta}>
          <Text style={styles.commentTime}>{timeAgo}</Text>
          {localLikes > 0 && (
            <Text style={styles.commentLikesLabel}>{localLikes} likes</Text>
          )}
          <TouchableOpacity onPress={() => onReply(comment.id, comment.user.username)}>
            <Text style={styles.commentAction}>Reply</Text>
          </TouchableOpacity>
        </View>
      </View>
      <TouchableOpacity
        onPress={() => { viewerId && likeMutation.mutate(); haptic.medium(); }}
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
    </View>
  );
}

export default function PostDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user } = useUser();
  const queryClient = useQueryClient();
  const inputRef = useRef<TextInput>(null);
  const [commentText, setCommentText] = useState('');
  const [replyTo, setReplyTo] = useState<{ id: string; username: string } | null>(null);

  const postQuery = useQuery({
    queryKey: ['post', id],
    queryFn: () => postsApi.getById(id),
  });

  const commentsQuery = useInfiniteQuery({
    queryKey: ['post-comments', id],
    queryFn: ({ pageParam }) =>
      postsApi.getComments(id, pageParam as string | undefined),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) =>
      last.meta.hasMore ? last.meta.cursor ?? undefined : undefined,
  });

  const comments: Comment[] = commentsQuery.data?.pages.flatMap((p) => p.data) ?? [];

  const sendMutation = useMutation({
    mutationFn: () =>
      postsApi.addComment(id, commentText.trim(), replyTo?.id),
    onSuccess: () => {
      setCommentText('');
      setReplyTo(null);
      queryClient.invalidateQueries({ queryKey: ['post-comments', id] });
      queryClient.invalidateQueries({ queryKey: ['post', id] });
    },
  });

  const handleReply = useCallback((commentId: string, username: string) => {
    setReplyTo({ id: commentId, username });
    inputRef.current?.focus();
  }, []);

  const canSend = commentText.trim().length > 0 && !sendMutation.isPending;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={8} style={styles.backBtn}>
          <Icon name="arrow-left" size="md" color={colors.text.primary} />
        </Pressable>
        <Text style={styles.headerTitle}>Post</Text>
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
          ListHeaderComponent={() =>
            postQuery.data ? (
              <View>
                <PostCard post={postQuery.data} viewerId={user?.id} />
                <View style={styles.commentsHeader}>
                  <Text style={styles.commentsTitle}>
                    {postQuery.data.commentsCount} Comments
                  </Text>
                </View>
              </View>
            ) : postQuery.isLoading ? (
              <View style={{ padding: spacing.base }}>
                <Skeleton.PostCard />
              </View>
            ) : null
          }
          renderItem={({ item }) => (
            <CommentRow
              comment={item}
              postId={id}
              viewerId={user?.id}
              onReply={handleReply}
            />
          )}
          ListEmptyComponent={() =>
            !commentsQuery.isLoading && postQuery.data ? (
              <EmptyState
                icon="message-circle"
                title="No comments yet"
                subtitle="Be the first to comment!"
              />
            ) : null
          }
          ListFooterComponent={() =>
            commentsQuery.isFetchingNextPage ? (
              <Skeleton.Rect width="100%" height={60} />
            ) : null
          }
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
  },
  backBtn: { width: 40, alignItems: 'flex-start' },
  headerTitle: { color: colors.text.primary, fontSize: fontSize.base, fontWeight: '700' },
  loader: { marginTop: 60 },
  commentsHeader: {
    paddingHorizontal: spacing.base, paddingVertical: spacing.md,
    borderTopWidth: 0.5, borderTopColor: colors.dark.border,
  },
  commentsTitle: { color: colors.text.primary, fontSize: fontSize.base, fontWeight: '700' },
  commentRow: {
    flexDirection: 'row', paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm, gap: spacing.sm,
  },
  commentBody: { flex: 1 },
  commentBubble: {
    backgroundColor: colors.dark.bgElevated, borderRadius: 14,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
  },
  commentUser: { color: colors.text.primary, fontSize: fontSize.sm, fontWeight: '700', marginBottom: 2 },
  commentText: { color: colors.text.primary, fontSize: fontSize.sm, lineHeight: 19 },
  commentMeta: { flexDirection: 'row', gap: spacing.md, marginTop: 4, paddingHorizontal: 4 },
  commentTime: { color: colors.text.tertiary, fontSize: fontSize.xs },
  commentLikesLabel: { color: colors.text.secondary, fontSize: fontSize.xs, fontWeight: '600' },
  commentAction: { color: colors.text.secondary, fontSize: fontSize.xs, fontWeight: '700' },
  commentLike: { paddingTop: 4 },
  inputWrap: {
    borderTopWidth: 0.5, borderTopColor: colors.dark.border,
    backgroundColor: colors.dark.bg,
    paddingBottom: Platform.OS === 'ios' ? spacing.base : spacing.sm,
  },
  replyBanner: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: spacing.base, paddingVertical: spacing.xs,
    backgroundColor: colors.dark.bgElevated,
  },
  replyBannerText: { color: colors.text.secondary, fontSize: fontSize.xs },
  replyClose: { color: colors.text.secondary, fontSize: fontSize.sm },
  inputRow: {
    flexDirection: 'row', alignItems: 'flex-end',
    paddingHorizontal: spacing.base, paddingTop: spacing.sm, gap: spacing.sm,
  },
  input: {
    flex: 1, color: colors.text.primary, fontSize: fontSize.base,
    maxHeight: 100, paddingVertical: 6,
  },
  sendBtn: { color: colors.emerald, fontSize: fontSize.base, fontWeight: '700' },
  sendBtnDisabled: { color: colors.text.tertiary },
});
