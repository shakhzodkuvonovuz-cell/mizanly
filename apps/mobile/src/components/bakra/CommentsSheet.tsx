import { useState, useCallback, useRef, memo } from 'react';
import { useTranslation } from '@/hooks/useTranslation';
import { View, Text, StyleSheet, TextInput, FlatList, KeyboardAvoidingView, Platform, Pressable } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withSequence,
  FadeInUp,
} from 'react-native-reanimated';
import { useMutation, useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { Avatar } from '@/components/ui/Avatar';
import { Icon } from '@/components/ui/Icon';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Skeleton } from '@/components/ui/Skeleton';
import { showToast } from '@/components/ui/Toast';
import { EmptyState } from '@/components/ui/EmptyState';
import { colors, spacing, fontSize, radius, fontSizeExt } from '@/theme';
import { useThemeColors } from '@/hooks/useThemeColors';
import { reelsApi, api } from '@/services/api';
import type { Reel, Comment } from '@/types';
import { formatDistanceToNowStrict } from 'date-fns';
import { getDateFnsLocale } from '@/utils/localeFormat';
import { useContextualHaptic } from '@/hooks/useContextualHaptic';
import { useAnimatedPress } from '@/hooks/useAnimatedPress';
import { formatCount } from '@/utils/formatCount';

interface ReelComment extends Comment {
  parentId?: string;
}

interface CommentItemProps {
  item: ReelComment;
  reelUserId: string | undefined;
  reelId: string;
  onReply: (comment: ReelComment) => void;
}

const CommentItem = memo(function CommentItem({ item, reelUserId, reelId, onReply }: CommentItemProps) {
  const { t } = useTranslation();
  const haptic = useContextualHaptic();
  const likeScale = useSharedValue(1);

  const likeAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scale: likeScale.value }],
  }));

  const handleLikeComment = async () => {
    haptic.like();
    likeScale.value = withSequence(
      withSpring(1.3, { damping: 12, stiffness: 350 }),
      withSpring(1, { damping: 10, stiffness: 400 })
    );
    try {
      await api.post(`/reels/${reelId}/comments/${item.id}/like`);
    } catch (err) {
      if (__DEV__) console.warn('[CommentsSheet] Like failed:', err);
      showToast({ message: t('common.actionFailed'), variant: 'error' });
    }
  };

  const isCreator = item.user.id === reelUserId;
  const isPinned = item.isPinned;

  return (
    <View style={[
      styles.commentItem,
      isCreator && styles.opComment,
      item.parentId && styles.replyComment,
    ]}>
      {isPinned && (
        <View style={styles.pinnedIndicator}>
          <Icon name="bookmark" size={10} color={colors.gold} />
          <Text style={styles.pinnedText}>{t('saf.pinned')}</Text>
        </View>
      )}
      <Avatar
        uri={item.user.avatarUrl}
        name={item.user.username}
        size="sm"
        showRing={false}
      />
      <View style={styles.commentContent}>
        <View style={styles.commentHeader}>
          <View style={styles.commentHeaderLeft}>
            <Text style={styles.commentUsername}>{item.user.username}</Text>
            {isCreator && (
              <View style={styles.creatorBadge}>
                <Text style={styles.creatorBadgeText}>{t('saf.creator')}</Text>
              </View>
            )}
          </View>
          <Text style={styles.commentTime}>
            {formatDistanceToNowStrict(new Date(item.createdAt), { addSuffix: true, locale: getDateFnsLocale() })}
          </Text>
        </View>
        <Text style={styles.commentText}>{item.content}</Text>
        <View style={styles.commentActions}>
          <Pressable
            accessibilityRole="button"
            style={styles.commentAction}
            onPress={handleLikeComment}
            hitSlop={8}
          >
            <Animated.View style={likeAnimStyle}>
              <Icon name="heart" size="xs" color={colors.text.secondary} />
            </Animated.View>
            <Text style={styles.commentActionText}>
              {item.likesCount > 0 ? formatCount(item.likesCount) : ''}
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            style={styles.commentAction}
            onPress={() => onReply(item)}
            hitSlop={8}
          >
            <Icon name="message-circle" size="xs" color={colors.text.secondary} />
            <Text style={styles.commentActionText}>
              {item._count?.replies ? formatCount(item._count.replies) : ''}
            </Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
});

interface CommentsSheetProps {
  reel: Reel;
  visible: boolean;
  onClose: () => void;
}

export const CommentsSheet = memo(function CommentsSheet({ reel, visible, onClose }: CommentsSheetProps) {
  const { t } = useTranslation();
  const haptic = useContextualHaptic();
  const tc = useThemeColors();
  const queryClient = useQueryClient();
  const sendPress = useAnimatedPress({ scaleTo: 0.85 });
  const [newComment, setNewComment] = useState('');
  const [replyTo, setReplyTo] = useState<ReelComment | null>(null);
  const inputRef = useRef<TextInput>(null);

  const commentsQuery = useInfiniteQuery({
    queryKey: ['reel-comments', reel.id],
    queryFn: ({ pageParam }) => reelsApi.getComments(reel.id, pageParam as string | undefined),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.meta.hasMore ? last.meta.cursor ?? undefined : undefined,
  });

  const addCommentMutation = useMutation({
    mutationFn: (content: string) => api.post(`/reels/${reel.id}/comment`, { content, parentId: replyTo?.id }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reel-comments', reel.id] });
      queryClient.invalidateQueries({ queryKey: ['reels-feed'] });
      queryClient.invalidateQueries({ queryKey: ['reel', reel.id] });
      setNewComment('');
      setReplyTo(null);
      inputRef.current?.blur();
      haptic.send();
    },
  });

  const comments: ReelComment[] = commentsQuery.data?.pages.flatMap((p) => p.data) ?? [];

  const handleSubmit = () => {
    const trimmed = newComment.trim();
    if (trimmed.length === 0) return;
    addCommentMutation.mutate(trimmed);
  };

  const handleReply = useCallback((comment: ReelComment) => {
    setReplyTo(comment);
    inputRef.current?.focus();
  }, []);

  const renderComment = useCallback(({ item, index }: { item: ReelComment; index: number }) => (
    <Animated.View entering={FadeInUp.delay(Math.min(index, 10) * 30).duration(300)}>
      <CommentItem
        item={item}
        reelUserId={reel.user?.id}
        reelId={reel.id}
        onReply={handleReply}
      />
    </Animated.View>
  ), [reel.user?.id, reel.id, handleReply]);

  const listEmpty = commentsQuery.isLoading ? (
    <View style={styles.skeletonContainer}>
      <Skeleton.Rect width="100%" height={60} borderRadius={radius.md} />
      <Skeleton.Rect width="100%" height={60} borderRadius={radius.md} />
      <Skeleton.Rect width="100%" height={60} borderRadius={radius.md} />
    </View>
  ) : (
    <EmptyState
      icon="message-circle"
      title={t('saf.noComments')}
      subtitle={t('saf.beFirstToComment')}
    />
  );

  const listFooter = commentsQuery.isFetchingNextPage ? (
    <View style={styles.footer}>
      <Skeleton.Rect width="100%" height={60} borderRadius={radius.md} />
    </View>
  ) : null;

  return (
    <BottomSheet visible={visible} onClose={onClose} snapPoint={0.85}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={[styles.container, { backgroundColor: tc.bgSheet }]}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        {/* Header with comment count */}
        <View style={[styles.header, { borderBottomColor: tc.border }]}>
          <Text style={styles.headerTitle}>{t('saf.commentsWithCount', { count: reel.commentsCount })}</Text>
          <Pressable onPress={onClose} hitSlop={8}>
            <Icon name="x" size="sm" color={tc.text.primary} />
          </Pressable>
        </View>

        {/* Comments list */}
        <FlatList
            removeClippedSubviews={true}
          data={comments}
          keyExtractor={(item) => item.id}
          renderItem={renderComment}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={listEmpty}
          ListFooterComponent={listFooter}
          onEndReached={() => {
            if (commentsQuery.hasNextPage && !commentsQuery.isFetchingNextPage) {
              commentsQuery.fetchNextPage();
            }
          }}
          onEndReachedThreshold={0.4}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        />

        {/* Reply banner */}
        {replyTo && (
          <View style={[styles.replyBanner, { backgroundColor: tc.surface, borderBottomColor: tc.border }]}>
            <Text style={styles.replyLabel}>{t('saf.replyingTo', { username: replyTo.user.username })}</Text>
            <Pressable onPress={() => setReplyTo(null)} hitSlop={8}>
              <Icon name="x" size="xs" color={colors.text.tertiary} />
            </Pressable>
          </View>
        )}

        {/* Input */}
        <View style={[styles.inputContainer, { borderTopColor: tc.border, backgroundColor: tc.bgSheet }]}>
          <TextInput
            ref={inputRef}
            style={[styles.input, { backgroundColor: tc.surface }]}
            placeholder={t('saf.addComment')}
            placeholderTextColor={colors.text.tertiary}
            value={newComment}
            onChangeText={setNewComment}
            multiline
            maxLength={500}
          />
          <Animated.View style={sendPress.animatedStyle}>
            <Pressable
              accessibilityRole="button"
              style={[styles.sendButton, { backgroundColor: tc.surface }, newComment.trim().length === 0 && styles.sendButtonDisabled]}
              onPress={handleSubmit}
              onPressIn={sendPress.onPressIn}
              onPressOut={sendPress.onPressOut}
              disabled={newComment.trim().length === 0 || addCommentMutation.isPending}
              hitSlop={8}
            >
              <Icon
                name="send"
                size="sm"
                color={newComment.trim().length === 0 ? colors.text.tertiary : colors.emerald}
              />
            </Pressable>
          </Animated.View>
        </View>
      </KeyboardAvoidingView>
    </BottomSheet>
  );
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
    // backgroundColor set inline via tc.bgSheet
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    // borderBottomColor set inline via tc.border
  },
  headerTitle: {
    color: colors.text.primary,
    fontSize: fontSize.lg,
    fontWeight: '700',
  },
  listContent: {
    paddingHorizontal: spacing.base,
    paddingTop: spacing.md,
    paddingBottom: spacing.xl,
  },
  commentItem: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  opComment: {
    borderStartWidth: 2,
    borderStartColor: colors.emerald,
    paddingStart: spacing.sm,
  },
  replyComment: {
    marginStart: spacing.xl,
    borderStartWidth: 2,
    borderStartColor: colors.active.emerald20,
    paddingStart: spacing.sm,
  },
  commentContent: {
    flex: 1,
  },
  commentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 2,
  },
  commentHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  creatorBadge: {
    backgroundColor: colors.active.emerald10,
    borderRadius: radius.sm,
    paddingHorizontal: 4,
    paddingVertical: 1,
  },
  creatorBadgeText: {
    fontSize: fontSizeExt.micro,
    color: colors.emerald,
    fontWeight: '700',
  },
  pinnedIndicator: {
    position: 'absolute',
    top: -spacing.xs,
    start: spacing.xl,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  pinnedText: {
    fontSize: fontSizeExt.tiny,
    color: colors.gold,
    fontWeight: '600',
  },
  commentUsername: {
    color: colors.text.primary,
    fontSize: fontSize.base,
    fontWeight: '600',
  },
  commentTime: {
    color: colors.text.tertiary,
    fontSize: fontSize.xs,
  },
  commentText: {
    color: colors.text.primary,
    fontSize: fontSize.base,
    lineHeight: 20,
    marginBottom: spacing.sm,
  },
  commentActions: {
    flexDirection: 'row',
    gap: spacing.lg,
  },
  commentAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  commentActionText: {
    color: colors.text.secondary,
    fontSize: fontSize.xs,
  },
  skeletonContainer: {
    gap: spacing.md,
  },
  footer: {
    paddingVertical: spacing.md,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    // borderTopColor + backgroundColor set inline via tc
  },
  input: {
    flex: 1,
    // backgroundColor set inline via tc.surface
    color: colors.text.primary,
    fontSize: fontSize.base,
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    maxHeight: 100,
    marginEnd: spacing.sm,
  },
  sendButton: {
    width: 36,
    height: 36,
    borderRadius: radius.full,
    // backgroundColor set inline via tc.surface
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonDisabled: {
    opacity: 0.5,
  },
  replyBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
    // backgroundColor set inline via tc.surface
    borderBottomWidth: 1,
    // borderBottomColor set inline via tc.border
  },
  replyLabel: {
    color: colors.text.secondary,
    fontSize: fontSize.sm,
  },
});
