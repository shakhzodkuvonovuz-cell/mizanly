import { useState, useRef, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput, Pressable,
  KeyboardAvoidingView, Platform, FlatList, RefreshControl, Alert,
} from 'react-native';
import Animated from 'react-native-reanimated';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery, useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useUser } from '@clerk/clerk-expo';
import { formatDistanceToNowStrict } from 'date-fns';
import { Avatar } from '@/components/ui/Avatar';
import { Icon } from '@/components/ui/Icon';
import { GlassHeader } from '@/components/ui/GlassHeader';
import { RichText } from '@/components/ui/RichText';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { PostCard } from '@/components/saf/PostCard';
import { useHaptic } from '@/hooks/useHaptic';
import { useAnimatedPress } from '@/hooks/useAnimatedPress';
import { colors, spacing, fontSize, radius } from '@/theme';
import { postsApi } from '@/services/api';
import type { Comment } from '@/types';
import { useTranslation } from '@/hooks/useTranslation';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

function CommentRow({
  comment,
  postId,
  viewerId,
  postAuthorId,
  onReply,
  onDeleted,
}: {
  comment: Comment;
  postId: string;
  viewerId?: string;
  postAuthorId?: string;
  onReply: (id: string, username: string) => void;
  onDeleted: () => void;
}) {
  const haptic = useHaptic();
  const { t } = useTranslation();
  const [localLiked, setLocalLiked] = useState(comment.isLiked ?? false);
  const [localLikes, setLocalLikes] = useState(comment.likesCount);
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState(comment.content);
  const timeAgo = formatDistanceToNowStrict(new Date(comment.createdAt), { addSuffix: true });
  const isOwn = !!viewerId && comment.user.id === viewerId;
  const isPostAuthor = !!viewerId && !!postAuthorId && postAuthorId === viewerId;
  const canDelete = isOwn || isPostAuthor;
  const canEdit = isOwn; // only comment author can edit their own text

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

  const deleteMutation = useMutation({
    mutationFn: () => postsApi.deleteComment(postId, comment.id),
    onSuccess: onDeleted,
    onError: (err: Error) => Alert.alert(t('common.error'), err.message),
  });

  const editMutation = useMutation({
    mutationFn: (content: string) => postsApi.editComment(postId, comment.id, content),
    onSuccess: () => setEditing(false),
    onError: (err: Error) => Alert.alert(t('common.error'), err.message),
  });

  const handleDelete = () => {
    Alert.alert(t('saf.deleteCommentTitle'), t('saf.deleteCommentMessage'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('common.delete'), style: 'destructive', onPress: () => deleteMutation.mutate() },
    ]);
  };

  return (
    <View style={styles.commentRow}>
      <Avatar uri={comment.user.avatarUrl} name={comment.user.displayName} size="sm" />
      <View style={styles.commentBody}>
        <View style={[
          styles.commentBubble,
          !!postAuthorId && comment.user.id === postAuthorId
            ? styles.commentBubbleOP
            : styles.commentBubbleDefault,
        ]}>
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
            <TouchableOpacity onPress={() => setEditing(false)} accessibilityLabel={t('accessibility.cancelEditing')} accessibilityRole="button">
              <Text style={styles.commentAction}>{t('common.cancel')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => editMutation.mutate(editText.trim())}
              disabled={!editText.trim() || editMutation.isPending}
              accessibilityLabel={t('accessibility.saveComment')}
              accessibilityRole="button"
            >
              <Text style={[styles.commentAction, { color: colors.emerald }]}>{t('common.save')}</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.commentMeta}>
            <Text style={styles.commentTime}>{timeAgo}</Text>
            {localLikes > 0 && (
              <Text style={styles.commentLikesLabel}>{t('saf.likes', { count: localLikes })}</Text>
            )}
            <TouchableOpacity onPress={() => onReply(comment.id, comment.user.username)} accessibilityLabel={t('accessibility.replyToComment')} accessibilityRole="button">
              <Text style={styles.commentAction}>{t('common.reply')}</Text>
            </TouchableOpacity>
            {canEdit && (
              <TouchableOpacity onPress={() => setEditing(true)} accessibilityLabel={t('accessibility.editComment')} accessibilityRole="button">
                <Text style={styles.commentAction}>{t('common.edit')}</Text>
              </TouchableOpacity>
            )}
            {canDelete && (
              <TouchableOpacity onPress={handleDelete} disabled={deleteMutation.isPending} accessibilityLabel={t('accessibility.deleteComment')} accessibilityRole="button">
                <Text style={styles.commentActionDestructive}>{t('common.delete')}</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </View>
      {!editing && (
        <TouchableOpacity
          onPress={() => { viewerId && likeMutation.mutate(); haptic.medium(); }}
          disabled={!viewerId}
          hitSlop={8}
          style={styles.commentLike}
          accessibilityLabel={localLiked ? t('accessibility.unlikeComment') : t('accessibility.likeComment')}
          accessibilityRole="button"
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

export default function PostDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user } = useUser();
  const queryClient = useQueryClient();
  const inputRef = useRef<TextInput>(null);
  const [commentText, setCommentText] = useState('');
  const [replyTo, setReplyTo] = useState<{ id: string; username: string } | null>(null);
  const sendPress = useAnimatedPress({ scaleTo: 0.85 });
  const { t } = useTranslation();

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

  const handleRefresh = useCallback(() => {
    postQuery.refetch();
    commentsQuery.refetch();
  }, [postQuery, commentsQuery]);

  const canSend = commentText.trim().length > 0 && !sendMutation.isPending;

  if (postQuery.isError) {
    return (
      <View style={styles.container}>
        <GlassHeader
          title={t('common.error')}
          leftAction={{ icon: 'arrow-left', onPress: () => router.back() }}
        />
        <View style={styles.headerSpacer} />
        <EmptyState
          icon="slash"
          title={t('common.error')}
          subtitle={t('saf.couldNotLoadContent')}
          actionLabel={t('saf.goBack')}
          onAction={() => router.back()}
        />
      </View>
    );
  }

  const listHeader = useMemo(() => (
    postQuery.data ? (
      <View>
        <PostCard post={postQuery.data} viewerId={user?.id} />
        <View style={styles.commentsHeader}>
          <Text style={styles.commentsTitle}>
            {t('saf.comments', { count: postQuery.data.commentsCount })}
          </Text>
        </View>
      </View>
    ) : postQuery.isLoading ? (
      <View style={{ padding: spacing.base }}>
        <Skeleton.PostCard />
      </View>
    ) : null
  ), [postQuery.data, postQuery.isLoading, user?.id]);

  const listEmpty = useMemo(() => (
    !commentsQuery.isLoading && postQuery.data ? (
      <EmptyState
        icon="message-circle"
        title={t('saf.startConversation')}
        subtitle={t('saf.firstToShare')}
      />
    ) : null
  ), [commentsQuery.isLoading, postQuery.data]);

  const listFooter = useMemo(() => (
    commentsQuery.isFetchingNextPage ? (
      <Skeleton.Rect width="100%" height={60} />
    ) : null
  ), [commentsQuery.isFetchingNextPage]);

  return (
    <View style={styles.container}>
      <GlassHeader
        title={t('saf.post')}
        leftAction={{ icon: 'arrow-left', onPress: () => router.back() }}
      />
      <View style={styles.headerSpacer} />

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={0}
      >
        <FlatList
          removeClippedSubviews={true}
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
              refreshing={postQuery.isRefetching || commentsQuery.isRefetching}
              onRefresh={handleRefresh}
              tintColor={colors.emerald}
            />
          }
          ListHeaderComponent={listHeader}
          renderItem={({ item }) => (
            <CommentRow
              comment={item}
              postId={id}
              viewerId={user?.id}
              postAuthorId={postQuery.data?.userId}
              onReply={handleReply}
              onDeleted={() => {
                queryClient.invalidateQueries({ queryKey: ['post-comments', id] });
                queryClient.invalidateQueries({ queryKey: ['post', id] });
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
                  {t('saf.replyingTo', { username: replyTo.username })}
                </Text>
                <Pressable onPress={() => setReplyTo(null)} hitSlop={8} accessibilityLabel={t('accessibility.cancelReply')} accessibilityRole="button">
                  <Icon name="x" size="xs" color={colors.text.secondary} />
                </Pressable>
              </View>
            )}
            <View style={styles.inputRow}>
              <Avatar uri={user.imageUrl} name={user.fullName ?? t('common.me')} size="sm" />
              <TextInput
                ref={inputRef}
                style={styles.input}
                placeholder={replyTo ? t('saf.replyToUser', { username: replyTo.username }) : t('saf.addComment')}
                placeholderTextColor={colors.text.tertiary}
                value={commentText}
                onChangeText={setCommentText}
                multiline
                maxLength={500}
                accessibilityLabel={t('accessibility.commentTextInput')}
              />
              <AnimatedPressable
                onPress={() => canSend && sendMutation.mutate()}
                onPressIn={sendPress.onPressIn}
                onPressOut={sendPress.onPressOut}
                disabled={!canSend}
                style={[styles.sendButton, sendPress.animatedStyle]}
                hitSlop={8}
                accessibilityLabel={t('accessibility.sendComment')}
                accessibilityRole="button"
              >
                <Icon
                  name={sendMutation.isPending ? 'loader' : 'send'}
                  size="sm"
                  color={canSend ? colors.emerald : colors.text.tertiary}
                />
              </AnimatedPressable>
            </View>
          </View>
        )}
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.dark.bg },
  headerSpacer: { height: 100 },
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
    backgroundColor: colors.dark.bgElevated, borderRadius: radius.md,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
  },
  commentBubbleOP: {
    borderLeftWidth: 2, borderLeftColor: colors.emerald,
  },
  commentBubbleDefault: {
    borderLeftWidth: 2, borderLeftColor: 'transparent',
  },
  commentUser: { color: colors.text.primary, fontSize: fontSize.sm, fontWeight: '700', marginBottom: 2 },
  commentText: { color: colors.text.primary, fontSize: fontSize.sm, lineHeight: 19 },
  commentEditInput: { borderBottomWidth: 0.5, borderBottomColor: colors.emerald, paddingBottom: 2 },
  commentMeta: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.xs, paddingHorizontal: spacing.xs },
  commentTime: { color: colors.text.tertiary, fontSize: fontSize.xs },
  commentLikesLabel: { color: colors.text.secondary, fontSize: fontSize.xs, fontWeight: '600' },
  commentAction: { color: colors.text.secondary, fontSize: fontSize.xs, fontWeight: '700' },
  commentActionDestructive: { color: colors.error, fontSize: fontSize.xs, fontWeight: '700' },
  commentLike: { paddingTop: spacing.xs },
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
  sendButton: {
    width: 36, height: 36, borderRadius: radius.full,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.active.emerald10,
  },
});
