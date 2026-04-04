import { useState, useRef, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, TextInput, Pressable,
  KeyboardAvoidingView, Platform, FlatList, Alert, Share,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { showToast } from '@/components/ui/Toast';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  interpolate,
  runOnJS,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery, useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useUser } from '@clerk/clerk-expo';
import { formatDistanceToNowStrict } from 'date-fns';
import { getDateFnsLocale } from '@/utils/localeFormat';
import { Avatar } from '@/components/ui/Avatar';
import { Icon } from '@/components/ui/Icon';
import { GlassHeader } from '@/components/ui/GlassHeader';
import { RichText } from '@/components/ui/RichText';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { PostCard } from '@/components/saf/PostCard';
import { ActionButton } from '@/components/ui/ActionButton';
import { ReactionPicker, type ReactionType } from '@/components/ui/ReactionPicker';
import { MentionAutocomplete } from '@/components/ui/MentionAutocomplete';
import { useContextualHaptic } from '@/hooks/useContextualHaptic';
import { useAnimatedPress } from '@/hooks/useAnimatedPress';
import { colors, spacing, fontSize, radius, fonts } from '@/theme';
import { postsApi } from '@/services/api';
import { communityNotesApi } from '@/services/communityNotesApi';
import type { Comment } from '@/types';
import { useTranslation } from '@/hooks/useTranslation';
import { useTTS } from '@/hooks/useTTS';
import { useThemeColors } from '@/hooks/useThemeColors';
import { ScreenErrorBoundary } from '@/components/ui/ScreenErrorBoundary';
import { BrandedRefreshControl } from '@/components/ui/BrandedRefreshControl';
import { LinearGradient } from 'expo-linear-gradient';
import { rtlFlexRow, rtlTextAlign, rtlBorderStart } from '@/utils/rtl';

type CommunityNote = {
  id: string;
  authorId: string;
  contentType: string;
  contentId: string;
  note: string;
  status: string;
  helpfulCount: number;
  notHelpfulCount: number;
  createdAt: string;
  author?: { id: string; displayName: string; avatarUrl?: string };
};

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
  const tc = useThemeColors();
  const styles = useMemo(() => createStyles(tc), [tc]);
  const haptic = useContextualHaptic();
  const { t, isRTL } = useTranslation();
  const [localLiked, setLocalLiked] = useState((comment as Comment & { isLiked?: boolean }).isLiked ?? false);
  const [localLikes, setLocalLikes] = useState(comment.likesCount);
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState(comment.content);
  const timeAgo = formatDistanceToNowStrict(new Date(comment.createdAt), { addSuffix: true, locale: getDateFnsLocale() });
  const isOwn = !!viewerId && comment.user.id === viewerId;
  const isPostAuthor = !!viewerId && !!postAuthorId && postAuthorId === viewerId;
  const canDelete = isOwn || isPostAuthor;
  const canEdit = isOwn; // only comment author can edit their own text
  const [showReactions, setShowReactions] = useState(false);

  // Swipe-to-like gesture
  const translateX = useSharedValue(0);

  const swipeRowStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  const heartRevealStyle = useAnimatedStyle(() => ({
    opacity: interpolate(translateX.value, [0, 50], [0, 1]),
    transform: [{ scale: interpolate(translateX.value, [0, 50], [0.5, 1]) }],
  }));

  const likeMutation = useMutation({
    mutationFn: () =>
      localLiked
        ? postsApi.unlikeComment(postId, comment.id)
        : postsApi.likeComment(postId, comment.id),
    onMutate: () => {
      setLocalLiked((wasLiked: boolean) => {
        setLocalLikes((count: number) => wasLiked ? count - 1 : count + 1);
        return !wasLiked;
      });
    },
    onError: () => {
      setLocalLiked((wasLiked: boolean) => {
        setLocalLikes((count: number) => wasLiked ? count + 1 : count - 1);
        return !wasLiked;
      });
    },
  });

  const handleSwipeLike = () => {
    if (!viewerId || localLiked) return;
    haptic.like();
    likeMutation.mutate();
  };

  const panGesture = Gesture.Pan()
    .activeOffsetX(10)
    .onUpdate((e) => {
      translateX.value = Math.max(0, e.translationX);
    })
    .onEnd((e) => {
      if (e.translationX > 50) {
        runOnJS(handleSwipeLike)();
      }
      translateX.value = withSpring(0, { damping: 15, stiffness: 300 });
    });

  const deleteMutation = useMutation({
    mutationFn: () => postsApi.deleteComment(postId, comment.id),
    onSuccess: onDeleted,
    onError: (err: Error) => showToast({ message: err.message, variant: 'error' }),
  });

  const editMutation = useMutation({
    mutationFn: (content: string) => postsApi.editComment(postId, comment.id, content),
    onSuccess: () => setEditing(false),
    onError: (err: Error) => showToast({ message: err.message, variant: 'error' }),
  });

  const handleDelete = () => {
    Alert.alert(t('saf.deleteCommentTitle'), t('saf.deleteCommentMessage'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('common.delete'), style: 'destructive', onPress: () => deleteMutation.mutate() },
    ]);
  };

  const handleCommentReaction = useCallback((_type: ReactionType) => {
    // TODO: Wire to postsApi.reactToComment(postId, comment.id, type) when backend supports multiple reaction types
    setShowReactions(false);
  }, [postId, comment.id]);

  const handleLongPress = useCallback(() => {
    if (!viewerId) return;
    haptic.longPress();
    setShowReactions((prev) => !prev);
  }, [viewerId, haptic]);

  return (
    <GestureDetector gesture={panGesture}>
    <View style={styles.swipeContainer}>
      <Animated.View style={[styles.swipeHeartIcon, heartRevealStyle]}>
        <Icon name="heart-filled" size="md" color={colors.error} />
      </Animated.View>
      <Animated.View style={[{ flexDirection: rtlFlexRow(isRTL) }, styles.commentRow, swipeRowStyle]}>
      <Avatar uri={comment.user.avatarUrl} name={comment.user.displayName} size="sm" />
      <View style={styles.commentBody}>
        <Pressable
          accessibilityRole="button"
          onLongPress={handleLongPress}
          delayLongPress={400}
          style={[
            styles.commentBubble,
            !!postAuthorId && comment.user.id === postAuthorId
              ? rtlBorderStart(isRTL, 2, colors.emerald)
              : rtlBorderStart(isRTL, 2, 'transparent'),
          ]}
          accessibilityLabel={t('reactions.longPressToReact')}
        >
          <Text style={[styles.commentUser, { textAlign: rtlTextAlign(isRTL) }]}>{comment.user.displayName}</Text>
          {editing ? (
            <TextInput
              accessibilityLabel={t('accessibility.commentTextInput')}
              style={[styles.commentText, styles.commentEditInput]}
              value={editText}
              onChangeText={setEditText}
              multiline
              autoFocus
              maxLength={500}
            />
          ) : (
            <RichText text={comment.content} />
          )}
        </Pressable>
        {editing ? (
          <View style={[styles.commentMeta, { flexDirection: rtlFlexRow(isRTL) }]}>
            <Pressable onPress={() => setEditing(false)} accessibilityLabel={t('accessibility.cancelEditing')} accessibilityRole="button">
              <Text style={styles.commentAction}>{t('common.cancel')}</Text>
            </Pressable>
            <Pressable
              onPress={() => editMutation.mutate(editText.trim())}
              disabled={!editText.trim() || editMutation.isPending}
              accessibilityLabel={t('accessibility.saveComment')}
              accessibilityRole="button"
            >
              <Text style={[styles.commentAction, { color: colors.emerald }]}>{t('common.save')}</Text>
            </Pressable>
          </View>
        ) : (
          <View style={[styles.commentMeta, { flexDirection: rtlFlexRow(isRTL) }]}>
            <Text style={styles.commentTime}>{timeAgo}</Text>
            {localLikes > 0 && (
              <Text style={styles.commentLikesLabel}>{t('saf.likes', { count: localLikes })}</Text>
            )}
            <Pressable onPress={() => onReply(comment.id, comment.user.username)} accessibilityLabel={t('accessibility.replyToComment')} accessibilityRole="button">
              <Text style={styles.commentAction}>{t('common.reply')}</Text>
            </Pressable>
            {canEdit && (
              <Pressable onPress={() => setEditing(true)} accessibilityLabel={t('accessibility.editComment')} accessibilityRole="button">
                <Text style={styles.commentAction}>{t('common.edit')}</Text>
              </Pressable>
            )}
            {canDelete && (
              <Pressable onPress={handleDelete} disabled={deleteMutation.isPending} accessibilityLabel={t('accessibility.deleteComment')} accessibilityRole="button">
                <Text style={styles.commentActionDestructive}>{t('common.delete')}</Text>
              </Pressable>
            )}
          </View>
        )}
        {/* Finding #410: View replies expansion */}
        {((comment as unknown as Record<string, unknown>).repliesCount as number) > 0 ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => onReply(comment.id, comment.user.username)}
            style={{ paddingStart: spacing['2xl'], paddingVertical: spacing.xs }}
          >
            <Text style={{ color: colors.emerald, fontSize: fontSize.xs, fontFamily: fonts.bodyMedium }}>
              {t('saf.viewReplies', { count: (comment as unknown as Record<string, unknown>).repliesCount as number })}
            </Text>
          </Pressable>
        ) : null}
        {showReactions && (
          <View style={styles.reactionPickerWrap}>
            <ReactionPicker
              onReact={handleCommentReaction}
              userReaction={undefined}
              compact
            />
          </View>
        )}
      </View>
      {!editing && (
        <Pressable
          onPress={() => { if (!viewerId) return; likeMutation.mutate(); haptic.like(); }}
          disabled={!viewerId}
          hitSlop={8}
          style={styles.commentLike}
          accessibilityLabel={localLiked ? t('accessibility.unlikeComment') : t('accessibility.likeComment')}
          accessibilityRole="button"
        >
          <Icon
            name={localLiked ? 'heart-filled' : 'heart'}
            size={16}
            color={localLiked ? colors.like : tc.text.tertiary}
            fill={localLiked ? colors.like : undefined}
          />
        </Pressable>
      )}
    </Animated.View>
    </View>
    </GestureDetector>
  );
}

function CommunityNotesSection({ postId }: { postId: string }) {
  const tc = useThemeColors();
  const cnStyles = createCommunityNotesStyles(tc);
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { user } = useUser();
  const haptic = useContextualHaptic();
  const [showAddForm, setShowAddForm] = useState(false);
  const [noteText, setNoteText] = useState('');

  const notesQuery = useQuery({
    queryKey: ['community-notes', 'post', postId],
    queryFn: () => communityNotesApi.getHelpful('post', postId),
    enabled: !!postId,
  });

  const notes: CommunityNote[] = (notesQuery.data as CommunityNote[]) ?? [];

  const createNoteMutation = useMutation({
    mutationFn: (note: string) =>
      communityNotesApi.create({ contentType: 'post', contentId: postId, note }),
    onSuccess: () => {
      setNoteText('');
      setShowAddForm(false);
      queryClient.invalidateQueries({ queryKey: ['community-notes', 'post', postId] });
      showToast({ message: t('communityNotes.noteAdded'), variant: 'success' });
    },
    onError: (err: Error) => showToast({ message: err.message || t('communityNotes.submitError'), variant: 'error' }),
  });

  const rateNoteMutation = useMutation({
    mutationFn: ({ noteId, rating }: { noteId: string; rating: 'helpful' | 'somewhat_helpful' | 'not_helpful' }) =>
      communityNotesApi.rate(noteId, rating),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['community-notes', 'post', postId] });
      const ratingLabels: Record<string, string> = {
        helpful: t('communityNotes.ratedHelpful'),
        somewhat_helpful: t('communityNotes.ratedSomewhat'),
        not_helpful: t('communityNotes.ratedNotHelpful'),
      };
      showToast({ message: ratingLabels[variables.rating] ?? t('common.saved'), variant: 'success' });
    },
    onError: (err: Error) => showToast({ message: err.message || t('communityNotes.rateError'), variant: 'error' }),
  });

  const handleSubmitNote = () => {
    if (!noteText.trim()) return;
    haptic.send();
    createNoteMutation.mutate(noteText.trim());
  };

  const handleRate = (noteId: string, rating: 'helpful' | 'somewhat_helpful' | 'not_helpful') => {
    haptic.tick();
    rateNoteMutation.mutate({ noteId, rating });
  };

  // Don't render section if loading or no notes and not showing add form
  if (notesQuery.isLoading) {
    return (
      <View style={cnStyles.section}>
        <Skeleton.Rect width="100%" height={60} />
      </View>
    );
  }

  if (notes.length === 0 && !showAddForm && !user) return null;

  return (
    <View style={cnStyles.section}>
      {notes.length > 0 && (
        <View style={cnStyles.notesContainer}>
          <View style={cnStyles.sectionHeaderRow}>
            <Icon name="edit" size="sm" color={colors.gold} />
            <Text style={cnStyles.sectionTitle}>{t('communityNotes.title')}</Text>
          </View>
          <Text style={cnStyles.contextLabel}>{t('communityNotes.contextByReaders')}</Text>

          {notes.map((note) => (
            <LinearGradient
              key={note.id}
              colors={['rgba(200,150,62,0.12)', 'rgba(200,150,62,0.04)']}
              style={cnStyles.noteCard}
            >
              <Text style={cnStyles.noteText}>{note.note}</Text>
              <View style={cnStyles.noteFooter}>
                <View style={cnStyles.noteAuthor}>
                  {note.author && (
                    <Avatar
                      uri={note.author.avatarUrl ?? null}
                      name={note.author.displayName}
                      size="xs"
                    />
                  )}
                  <Text style={cnStyles.noteAuthorText}>
                    {note.author?.displayName ?? t('common.unknown')}
                  </Text>
                </View>
                {user && (
                  <View style={cnStyles.ratingRow}>
                    <Pressable
                      style={cnStyles.ratingBtn}
                      onPress={() => handleRate(note.id, 'helpful')}
                      disabled={rateNoteMutation.isPending}
                      accessibilityLabel={t('communityNotes.helpful')}
                      accessibilityRole="button"
                    >
                      <Icon name="check" size={14} color={colors.emerald} />
                      {note.helpfulCount > 0 && (
                        <Text style={cnStyles.ratingCount}>{note.helpfulCount}</Text>
                      )}
                    </Pressable>
                    <Pressable
                      style={cnStyles.ratingBtn}
                      onPress={() => handleRate(note.id, 'not_helpful')}
                      disabled={rateNoteMutation.isPending}
                      accessibilityLabel={t('communityNotes.notHelpful')}
                      accessibilityRole="button"
                    >
                      <Icon name="x" size={14} color={colors.error} />
                      {note.notHelpfulCount > 0 && (
                        <Text style={cnStyles.ratingCountNeg}>{note.notHelpfulCount}</Text>
                      )}
                    </Pressable>
                  </View>
                )}
              </View>
            </LinearGradient>
          ))}
        </View>
      )}

      {/* Add note form */}
      {user && (
        showAddForm ? (
          <LinearGradient
            colors={['rgba(45,53,72,0.35)', 'rgba(28,35,51,0.2)']}
            style={cnStyles.addForm}
          >
            <TextInput
              style={cnStyles.addInput}
              value={noteText}
              onChangeText={setNoteText}
              placeholder={t('communityNotes.writePlaceholder')}
              placeholderTextColor={tc.text.tertiary}
              multiline
              maxLength={2000}
              textAlignVertical="top"
            />
            <View style={cnStyles.addActions}>
                            <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('accessibility.close')}
                onPress={() => { setShowAddForm(false); setNoteText(''); }}
              >
                <Text style={cnStyles.addCancel}>{t('common.cancel')}</Text>
              </Pressable>
              <Pressable
                style={[
                  cnStyles.submitBtn,
                  (!noteText.trim() || createNoteMutation.isPending) && cnStyles.submitBtnDisabled,
                ]}
                onPress={handleSubmitNote}
                disabled={!noteText.trim() || createNoteMutation.isPending}
                accessibilityLabel={t('communityNotes.submit')}
                accessibilityRole="button"
              >
                {createNoteMutation.isPending ? (
                  <Skeleton.Rect width={20} height={20} borderRadius={radius.full} />
                ) : (
                  <Text style={cnStyles.submitBtnText}>{t('communityNotes.submit')}</Text>
                )}
              </Pressable>
            </View>
          </LinearGradient>
        ) : (
          <Pressable
            style={cnStyles.addNoteBtn}
            onPress={() => setShowAddForm(true)}
            accessibilityLabel={t('communityNotes.addNote')}
            accessibilityRole="button"
          >
            <Icon name="edit" size="sm" color={colors.gold} />
            <Text style={cnStyles.addNoteBtnText}>{t('communityNotes.addNote')}</Text>
          </Pressable>
        )
      )}
    </View>
  );
}

export default function PostDetailScreen() {
  const tc = useThemeColors();
  const styles = useMemo(() => createStyles(tc), [tc]);
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user } = useUser();
  const queryClient = useQueryClient();
  const inputRef = useRef<TextInput>(null);
  const [commentText, setCommentText] = useState('');
  const [replyTo, setReplyTo] = useState<{ id: string; username: string } | null>(null);
  const [commentSort, setCommentSort] = useState<'top' | 'latest'>('top');
  const sendPress = useAnimatedPress({ scaleTo: 0.85 });
  const insets = useSafeAreaInsets();
  const { t, isRTL } = useTranslation();
  const tts = useTTS();
  const haptic = useContextualHaptic();

  const postQuery = useQuery({
    queryKey: ['post', id],
    queryFn: () => postsApi.getById(id),
    enabled: !!id,
    staleTime: 30_000,
  });

  const commentsQuery = useInfiniteQuery({
    queryKey: ['post-comments', id],
    queryFn: ({ pageParam }) =>
      postsApi.getComments(id, pageParam as string | undefined),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) =>
      last.meta.hasMore ? last.meta.cursor ?? undefined : undefined,
    enabled: !!id,
    staleTime: 30_000,
  });

  const rawComments: Comment[] = commentsQuery.data?.pages.flatMap((p) => p.data) ?? [];

  // Sticky bar — local like/save state
  const post = postQuery.data;
  const [localLiked, setLocalLiked] = useState(false);
  const [localLikes, setLocalLikes] = useState(0);
  const [localSaved, setLocalSaved] = useState(false);

  // Sync from server data
  const lastSyncedPostId = useRef<string | null>(null);
  if (post && post.id !== lastSyncedPostId.current) {
    lastSyncedPostId.current = post.id;
    setLocalLiked(post.userReaction === 'LIKE');
    setLocalLikes(post.likesCount);
    setLocalSaved(post.isSaved ?? false);
  }

  const likeMutation = useMutation({
    mutationFn: () => localLiked ? postsApi.unreact(id) : postsApi.react(id, 'LIKE'),
    onMutate: () => {
      setLocalLiked(prev => !prev);
      setLocalLikes(prev => localLiked ? prev - 1 : prev + 1);
    },
    onError: () => {
      setLocalLiked(prev => !prev);
      setLocalLikes(prev => localLiked ? prev + 1 : prev - 1);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['post', id] }),
  });

  const saveMutation = useMutation({
    mutationFn: () => localSaved ? postsApi.unsave(id) : postsApi.save(id),
    onMutate: () => setLocalSaved(prev => !prev),
    onError: () => setLocalSaved(prev => !prev),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['post', id] }),
  });

  const handleStickyLike = useCallback(() => {
    haptic.like();
    likeMutation.mutate();
  }, [haptic, likeMutation]);

  const handleStickySave = useCallback(() => {
    haptic.save();
    saveMutation.mutate();
  }, [haptic, saveMutation]);

  const handleStickyComment = useCallback(() => {
    inputRef.current?.focus();
  }, []);

  // Sort comments: "top" by likes descending, "latest" by creation date (API default)
  const comments = useMemo(() => {
    if (commentSort === 'latest') return rawComments;
    return [...rawComments].sort((a, b) => (b.likesCount ?? 0) - (a.likesCount ?? 0));
  }, [rawComments, commentSort]);

  const sendMutation = useMutation({
    mutationFn: () =>
      postsApi.addComment(id, commentText.trim(), replyTo?.id),
    onSuccess: () => {
      setCommentText('');
      setReplyTo(null);
      queryClient.invalidateQueries({ queryKey: ['post-comments', id] });
      queryClient.invalidateQueries({ queryKey: ['post', id] });
    },
    onError: (err: Error) => showToast({ message: err.message, variant: 'error' }),
  });

  const handleReply = useCallback((commentId: string, username: string) => {
    setReplyTo({ id: commentId, username });
    inputRef.current?.focus();
  }, []);

  const handleRefresh = useCallback(() => {
    postQuery.refetch();
    commentsQuery.refetch();
  }, [postQuery, commentsQuery]);

  const handleShare = useCallback(async () => {
    try {
      await Share.share({
        message: t('share.defaultMessage'),
        url: `mizanly://post/${id}`,
      });
    } catch {
      // User cancelled
    }
  }, [id, t]);

  const renderCommentItem = useCallback(
    ({ item }: { item: Comment }) => (
      <CommentRow
        comment={item}
        postId={id}
        viewerId={user?.id}
        postAuthorId={postQuery.data?.user?.id}
        onReply={handleReply}
        onDeleted={() => {
          queryClient.invalidateQueries({ queryKey: ['post-comments', id] });
          queryClient.invalidateQueries({ queryKey: ['post', id] });
        }}
      />
    ),
    [id, user?.id, postQuery.data?.user?.id, handleReply, queryClient],
  );

  const canSend = commentText.trim().length > 0 && !sendMutation.isPending;

  if (postQuery.isError) {
    return (
      <View style={styles.container}>
        <GlassHeader
          title={t('common.error')}
          leftAction={{ icon: 'arrow-left', onPress: () => router.back() }}
        />
        <View style={{ height: insets.top + 56 }} />
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

  const handleListen = useCallback(() => {
    if (!postQuery.data) return;
    const content = postQuery.data.content;
    if (content && content.length > 50) {
      const title = postQuery.data.user?.displayName
        ? `@${postQuery.data.user.username}`
        : t('saf.post');
      tts.speak(content, title);
    }
  }, [postQuery.data, tts, t]);

  const showListenButton = postQuery.data?.content && postQuery.data.content.length > 100;

  const listHeader = useMemo(() => (
    postQuery.data ? (
      <View>
        <PostCard post={postQuery.data} viewerId={user?.id} />
        {showListenButton && (
          <Pressable
            onPress={handleListen}
            style={[styles.listenButton, { flexDirection: rtlFlexRow(isRTL) }]}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityLabel={t('tts.listen')}
            accessibilityRole="button"
          >
            <Icon name="volume-x" size={16} color={colors.emerald} />
            <Text style={styles.listenText}>{t('tts.listen')}</Text>
          </Pressable>
        )}
        {/* Community Notes Section */}
        <CommunityNotesSection postId={id} />
        <View style={styles.commentsHeader}>
          <Text style={[styles.commentsTitle, { textAlign: rtlTextAlign(isRTL) }]}>
            {t('saf.comments', { count: postQuery.data.commentsCount })}
          </Text>
          <View style={[styles.sortRow, { flexDirection: rtlFlexRow(isRTL) }]}>
            <Pressable
              onPress={() => { setCommentSort('top'); haptic.tick(); }}
              style={[styles.sortButton, commentSort === 'top' && styles.sortButtonActive]}
              accessibilityLabel={t('common.top')}
              accessibilityRole="button"
            >
              <Text style={[styles.sortButtonText, commentSort === 'top' && styles.sortButtonTextActive]}>
                {t('common.top')}
              </Text>
            </Pressable>
            <Pressable
              onPress={() => { setCommentSort('latest'); haptic.tick(); }}
              style={[styles.sortButton, commentSort === 'latest' && styles.sortButtonActive]}
              accessibilityLabel={t('common.latest')}
              accessibilityRole="button"
            >
              <Text style={[styles.sortButtonText, commentSort === 'latest' && styles.sortButtonTextActive]}>
                {t('common.latest')}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    ) : postQuery.isLoading ? (
      <View style={{ padding: spacing.base }}>
        <Skeleton.PostCard />
      </View>
    ) : null
  ), [postQuery.data, postQuery.isLoading, user?.id, showListenButton, handleListen, isRTL, t, commentSort, haptic]);

  const listEmpty = useMemo(() => (
    !commentsQuery.isLoading && postQuery.data ? (
      <EmptyState
        icon="message-circle"
        title={t('saf.startConversation')}
        subtitle={t('saf.firstToShare')}
      />
    ) : null
  ), [commentsQuery.isLoading, postQuery.data, t]);

  const listFooter = useMemo(() => (
    commentsQuery.isFetchingNextPage ? (
      <Skeleton.Rect width="100%" height={60} />
    ) : null
  ), [commentsQuery.isFetchingNextPage]);

  return (
    <ScreenErrorBoundary>
    <View style={styles.container}>
      <GlassHeader
        title={t('saf.post')}
        leftAction={{ icon: 'arrow-left', onPress: () => router.back() }}
        rightActions={[
          { icon: 'share', onPress: handleShare, accessibilityLabel: t('common.share') },
        ]}
      />
      <View style={{ height: insets.top + 56 }} />

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={insets.top + 56}
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
            <BrandedRefreshControl
              refreshing={postQuery.isRefetching || commentsQuery.isRefetching}
              onRefresh={handleRefresh}
            />
          }
          ListHeaderComponent={listHeader}
          renderItem={renderCommentItem}
          ListEmptyComponent={listEmpty}
          ListFooterComponent={listFooter}
          contentContainerStyle={{ paddingBottom: 140 }}
        />

        {/* Sticky glass action bar */}
        {post && (
          <View style={styles.stickyBar}>
            {Platform.OS === 'ios' ? (
              <BlurView intensity={60} tint="dark" style={StyleSheet.absoluteFill} />
            ) : (
              <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(13, 17, 23, 0.95)' }]} />
            )}
            <View style={styles.stickyBarContent}>
              <ActionButton
                icon={<Icon name="heart" size="sm" color={tc.text.secondary} />}
                activeIcon={<Icon name="heart-filled" size="sm" color={colors.like} fill={colors.like} />}
                isActive={localLiked}
                count={localLikes > 0 ? localLikes : undefined}
                onPress={handleStickyLike}
                activeColor={colors.like}
                accessibilityLabel={localLiked ? t('accessibility.unlikePost') : t('accessibility.likePost')}
              />
              <ActionButton
                icon={<Icon name="message-circle" size="sm" color={tc.text.secondary} />}
                count={post.commentsCount > 0 ? post.commentsCount : undefined}
                onPress={handleStickyComment}
                accessibilityLabel={t('accessibility.commentPost')}
              />
              <ActionButton
                icon={<Icon name="share" size="sm" color={tc.text.secondary} />}
                onPress={handleShare}
                accessibilityLabel={t('common.share')}
              />
              <ActionButton
                icon={<Icon name="bookmark" size="sm" color={localSaved ? colors.bookmark : tc.text.tertiary} />}
                activeIcon={<Icon name="bookmark-filled" size="sm" color={colors.bookmark} fill={colors.bookmark} />}
                isActive={localSaved}
                onPress={handleStickySave}
                activeColor={colors.bookmark}
                accessibilityLabel={localSaved ? t('accessibility.unsavePost') : t('accessibility.savePost')}
              />
            </View>
          </View>
        )}

        {/* Comment Input — hidden when commentPermission is NOBODY (unless owner) */}
        {user && (() => {
          const post = postQuery.data as Record<string, unknown> | undefined;
          const permission = post?.commentPermission as string | undefined;
          const isPostOwner = post?.userId === user.id || (post?.user as Record<string, unknown> | undefined)?.id === user.id;
          if (permission === 'NOBODY' && !isPostOwner) return null;
          return true;
        })() && (
          <View style={styles.inputWrap}>
            {replyTo && (
              <View style={[styles.replyBanner, { flexDirection: rtlFlexRow(isRTL) }]}>
                <Text style={[styles.replyBannerText, { textAlign: rtlTextAlign(isRTL) }]}>
                  {t('saf.replyingTo', { username: replyTo.username })}
                </Text>
                <Pressable onPress={() => setReplyTo(null)} hitSlop={8} accessibilityLabel={t('accessibility.cancelReply')} accessibilityRole="button">
                  <Icon name="x" size="xs" color={tc.text.secondary} />
                </Pressable>
              </View>
            )}
            <View style={[styles.inputRow, { flexDirection: rtlFlexRow(isRTL) }]}>
              <Avatar uri={user.imageUrl} name={user.fullName ?? t('common.me')} size="sm" />
              <View style={{ flex: 1 }}>
                {/* Mention autocomplete dropdown */}
                {(() => {
                  const mentionMatch = commentText.match(/@(\w{1,30})$/);
                  const mentionQuery = mentionMatch?.[1] || '';
                  const showMentions = mentionQuery.length >= 1;
                  return showMentions ? (
                    <MentionAutocomplete
                      query={mentionQuery}
                      visible={showMentions}
                      onSelect={(selected) => {
                        const before = commentText.replace(/@\w{1,30}$/, '');
                        setCommentText(`${before}@${selected.username} `);
                      }}
                    />
                  ) : null;
                })()}
                <TextInput
                  ref={inputRef}
                  style={styles.input}
                  placeholder={replyTo ? t('saf.replyToUser', { username: replyTo.username }) : t('saf.addComment')}
                  placeholderTextColor={tc.text.tertiary}
                  value={commentText}
                  onChangeText={setCommentText}
                  multiline
                  maxLength={500}
                  accessibilityLabel={t('accessibility.commentTextInput')}
                />
              </View>
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
                  color={canSend ? colors.emerald : tc.text.tertiary}
                />
              </AnimatedPressable>
            </View>
          </View>
        )}
      </KeyboardAvoidingView>
    </View>
    </ScreenErrorBoundary>
  );
}

const createStyles = (tc: ReturnType<typeof useThemeColors>) => StyleSheet.create({
  container: { flex: 1, backgroundColor: tc.bg },
  headerSpacer: {},
  loader: { marginTop: 60 },
  listenButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
  },
  listenText: {
    color: colors.emerald,
    fontSize: fontSize.sm,
    fontFamily: fonts.bodySemiBold,
  },
  commentsHeader: {
    paddingHorizontal: spacing.base, paddingVertical: spacing.md,
    borderTopWidth: 0.5, borderTopColor: tc.border,
  },
  commentsTitle: { color: tc.text.primary, fontSize: fontSize.base, fontFamily: fonts.bodyBold },
  sortRow: {
    flexDirection: 'row' as const,
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
  sortButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.full,
    backgroundColor: 'transparent',
  },
  sortButtonActive: {
    backgroundColor: colors.active.emerald10,
  },
  sortButtonText: {
    color: tc.text.secondary,
    fontSize: fontSize.sm,
    fontFamily: fonts.bodySemiBold,
  },
  sortButtonTextActive: {
    color: colors.emerald,
  },
  swipeContainer: {
    position: 'relative',
    overflow: 'hidden',
  },
  swipeHeartIcon: {
    position: 'absolute',
    start: spacing.base,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 0,
  },
  commentRow: {
    flexDirection: 'row', paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm, gap: spacing.sm,
    backgroundColor: tc.bg,
  },
  commentBody: { flex: 1 },
  commentBubble: {
    backgroundColor: tc.bgElevated, borderRadius: radius.md,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
  },
  commentBubbleOP: {},
  commentBubbleDefault: {},
  commentUser: { color: tc.text.primary, fontSize: fontSize.sm, fontFamily: fonts.bodyBold, marginBottom: 2 },
  commentText: { color: tc.text.primary, fontSize: fontSize.sm, lineHeight: 19 },
  commentEditInput: { borderBottomWidth: 0.5, borderBottomColor: colors.emerald, paddingBottom: 2 },
  commentMeta: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.xs, paddingHorizontal: spacing.xs },
  commentTime: { color: tc.text.tertiary, fontSize: fontSize.xs },
  commentLikesLabel: { color: tc.text.secondary, fontSize: fontSize.xs, fontFamily: fonts.bodySemiBold },
  commentAction: { color: tc.text.secondary, fontSize: fontSize.xs, fontFamily: fonts.bodyBold },
  commentActionDestructive: { color: colors.error, fontSize: fontSize.xs, fontWeight: '700' },
  commentLike: { paddingTop: spacing.xs },
  reactionPickerWrap: {
    marginTop: spacing.xs,
  },
  inputWrap: {
    borderTopWidth: 0.5, borderTopColor: tc.border,
    backgroundColor: tc.bg,
    paddingBottom: Platform.OS === 'ios' ? spacing.base : spacing.sm,
  },
  replyBanner: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: spacing.base, paddingVertical: spacing.xs,
    backgroundColor: tc.bgElevated,
  },
  replyBannerText: { color: tc.text.secondary, fontSize: fontSize.xs },
  replyClose: { color: tc.text.secondary, fontSize: fontSize.sm },
  inputRow: {
    flexDirection: 'row', alignItems: 'flex-end',
    paddingHorizontal: spacing.base, paddingTop: spacing.sm, gap: spacing.sm,
  },
  input: {
    flex: 1, color: tc.text.primary, fontSize: fontSize.base,
    maxHeight: 100, paddingVertical: 6,
  },
  sendButton: {
    width: 36, height: 36, borderRadius: radius.full,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.active.emerald10,
  },
  stickyBar: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.08)',
    overflow: 'hidden',
  },
  stickyBarContent: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.base,
  },
});

const createCommunityNotesStyles = (tc: ReturnType<typeof useThemeColors>) => StyleSheet.create({
  section: {
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
    borderTopWidth: 0.5,
    borderTopColor: tc.border,
  },
  notesContainer: { gap: spacing.sm },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.xs,
  },
  sectionTitle: {
    color: colors.gold,
    fontSize: fontSize.sm,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  contextLabel: {
    color: tc.text.tertiary,
    fontSize: fontSize.xs,
    marginBottom: spacing.sm,
    fontStyle: 'italic',
  },
  noteCard: {
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: 'rgba(200,150,62,0.15)',
  },
  noteText: {
    color: tc.text.primary,
    fontSize: fontSize.sm,
    lineHeight: 20,
  },
  noteFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  noteAuthor: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  noteAuthorText: {
    color: tc.text.secondary,
    fontSize: fontSize.xs,
  },
  ratingRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  ratingBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.sm,
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  ratingCount: {
    color: colors.emerald,
    fontSize: fontSize.xs,
    fontWeight: '600',
  },
  ratingCountNeg: {
    color: colors.error,
    fontSize: fontSize.xs,
    fontWeight: '600',
  },
  addNoteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    marginTop: spacing.xs,
  },
  addNoteBtnText: {
    color: colors.gold,
    fontSize: fontSize.sm,
    fontWeight: '600',
  },
  addForm: {
    borderRadius: radius.md,
    padding: spacing.md,
    marginTop: spacing.sm,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  addInput: {
    color: tc.text.primary,
    fontSize: fontSize.base,
    minHeight: 80,
    textAlignVertical: 'top',
    lineHeight: 22,
  },
  addActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: spacing.md,
    marginTop: spacing.sm,
  },
  addCancel: {
    color: tc.text.secondary,
    fontSize: fontSize.base,
  },
  submitBtn: {
    backgroundColor: colors.gold,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xs + 2,
    minWidth: 60,
    alignItems: 'center',
  },
  submitBtnDisabled: {
    opacity: 0.5,
  },
  submitBtnText: {
    color: '#fff',
    fontSize: fontSize.sm,
    fontWeight: '700',
  },
});
