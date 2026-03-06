import { useState, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, TextInput, FlatList, TouchableOpacity, KeyboardAvoidingView, Platform } from 'react-native';
import { useMutation, useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { Avatar } from '@/components/ui/Avatar';
import { Icon } from '@/components/ui/Icon';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { colors, spacing, fontSize, radius } from '@/theme';
import { reelsApi } from '@/services/api';
import type { Reel, Comment } from '@/types';
import { formatDistanceToNowStrict } from 'date-fns';
import { useHaptic } from '@/hooks/useHaptic';

interface CommentsSheetProps {
  reel: Reel;
  visible: boolean;
  onClose: () => void;
}

export function CommentsSheet({ reel, visible, onClose }: CommentsSheetProps) {
  const haptic = useHaptic();
  const queryClient = useQueryClient();
  const [newComment, setNewComment] = useState('');
  const inputRef = useRef<TextInput>(null);

  const commentsQuery = useInfiniteQuery({
    queryKey: ['reel-comments', reel.id],
    queryFn: ({ pageParam }) => reelsApi.getComments(reel.id, pageParam as string | undefined),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.meta.hasMore ? last.meta.cursor ?? undefined : undefined,
  });

  const addCommentMutation = useMutation({
    mutationFn: (content: string) => reelsApi.comment(reel.id, content),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reel-comments', reel.id] });
      queryClient.invalidateQueries({ queryKey: ['reels-feed'] });
      queryClient.invalidateQueries({ queryKey: ['reel', reel.id] });
      setNewComment('');
      inputRef.current?.blur();
      haptic.light();
    },
  });

  const comments: Comment[] = commentsQuery.data?.pages.flatMap((p) => p.data) ?? [];

  const handleSubmit = () => {
    const trimmed = newComment.trim();
    if (trimmed.length === 0) return;
    addCommentMutation.mutate(trimmed);
  };

  const handleLikeComment = async (commentId: string) => {
    // TODO: Implement comment like API when available
    haptic.light();
  };

  const renderComment = ({ item }: { item: Comment }) => (
    <View style={styles.commentItem}>
      <Avatar
        uri={item.user.avatarUrl}
        name={item.user.username}
        size="sm"
        showRing={false}
      />
      <View style={styles.commentContent}>
        <View style={styles.commentHeader}>
          <Text style={styles.commentUsername}>{item.user.username}</Text>
          <Text style={styles.commentTime}>
            {formatDistanceToNowStrict(new Date(item.createdAt), { addSuffix: true })}
          </Text>
        </View>
        <Text style={styles.commentText}>{item.content}</Text>
        <View style={styles.commentActions}>
          <TouchableOpacity
            style={styles.commentAction}
            onPress={() => handleLikeComment(item.id)}
            hitSlop={8}
          >
            <Icon name="heart" size="xs" color={colors.text.secondary} />
            <Text style={styles.commentActionText}>
              {item.likesCount > 0 ? item.likesCount : ''}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.commentAction}
            onPress={() => {/* TODO: Reply */}}
            hitSlop={8}
          >
            <Icon name="message-circle" size="xs" color={colors.text.secondary} />
            <Text style={styles.commentActionText}>
              {item._count?.replies ? item._count.replies : ''}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );

  const listEmpty = commentsQuery.isLoading ? (
    <View style={styles.skeletonContainer}>
      <Skeleton.Rect width="100%" height={60} borderRadius={radius.md} />
      <Skeleton.Rect width="100%" height={60} borderRadius={radius.md} />
      <Skeleton.Rect width="100%" height={60} borderRadius={radius.md} />
    </View>
  ) : (
    <EmptyState
      icon="message-circle"
      title="No comments yet"
      subtitle="Be the first to comment"
      compact
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
        style={styles.container}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Comments</Text>
          <TouchableOpacity onPress={onClose} hitSlop={8}>
            <Icon name="x" size="sm" color={colors.text.primary} />
          </TouchableOpacity>
        </View>

        {/* Comments list */}
        <FlatList
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

        {/* Input */}
        <View style={styles.inputContainer}>
          <TextInput
            ref={inputRef}
            style={styles.input}
            placeholder="Add a comment..."
            placeholderTextColor={colors.text.tertiary}
            value={newComment}
            onChangeText={setNewComment}
            multiline
            maxLength={500}
          />
          <TouchableOpacity
            style={[styles.sendButton, newComment.trim().length === 0 && styles.sendButtonDisabled]}
            onPress={handleSubmit}
            disabled={newComment.trim().length === 0 || addCommentMutation.isPending}
            hitSlop={8}
          >
            <Icon
              name="send"
              size="sm"
              color={newComment.trim().length === 0 ? colors.text.tertiary : colors.emerald}
            />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.dark.bgSheet,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.dark.border,
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
  commentContent: {
    flex: 1,
  },
  commentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: 2,
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
    borderTopColor: colors.dark.border,
    backgroundColor: colors.dark.bgSheet,
  },
  input: {
    flex: 1,
    backgroundColor: colors.dark.surface,
    color: colors.text.primary,
    fontSize: fontSize.base,
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    maxHeight: 100,
    marginRight: spacing.sm,
  },
  sendButton: {
    width: 36,
    height: 36,
    borderRadius: radius.full,
    backgroundColor: colors.dark.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonDisabled: {
    opacity: 0.5,
  },
});