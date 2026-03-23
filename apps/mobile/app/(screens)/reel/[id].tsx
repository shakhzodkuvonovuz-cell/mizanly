import { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import {
  View, Text, StyleSheet, TextInput, Pressable,
  KeyboardAvoidingView, Platform, FlatList, Alert, Share,
  Dimensions, I18nManager,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery, useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
// GlassHeader handles safe area insets internally
import { useUser } from '@clerk/clerk-expo';
import { formatDistanceToNowStrict } from 'date-fns';
import { getDateFnsLocale } from '@/utils/localeFormat';
import { Video, ResizeMode } from 'expo-av';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
} from 'react-native-reanimated';
import { Avatar } from '@/components/ui/Avatar';
import { Icon } from '@/components/ui/Icon';
import { RichText } from '@/components/ui/RichText';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { GlassHeader } from '@/components/ui/GlassHeader';
import { ActionButton } from '@/components/ui/ActionButton';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { useContextualHaptic } from '@/hooks/useContextualHaptic';
import { useAnimatedPress } from '@/hooks/useAnimatedPress';
import { colors, spacing, fontSize, radius } from '@/theme';
import { reelsApi, followsApi, messagesApi } from '@/services/api';
import { rtlFlexRow, rtlTextAlign } from '@/utils/rtl';
import { useTranslation } from '@/hooks/useTranslation';
import { useThemeColors } from '@/hooks/useThemeColors';
import { BrandedRefreshControl } from '@/components/ui/BrandedRefreshControl';
import { formatCount } from '@/utils/formatCount';
import { showToast } from '@/components/ui/Toast';
import type { Comment, Reel, Conversation } from '@/types';
import { ScreenErrorBoundary } from '@/components/ui/ScreenErrorBoundary';
import { navigate } from '@/utils/navigation';

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
  const tc = useThemeColors();
  const styles = createStyles(tc);
  const haptic = useContextualHaptic();
  const { t } = useTranslation();
  const [localLiked, setLocalLiked] = useState((comment as Comment & { isLiked?: boolean }).isLiked ?? false);
  const [localLikes, setLocalLikes] = useState(comment.likesCount);
  const timeAgo = formatDistanceToNowStrict(new Date(comment.createdAt), { addSuffix: true, locale: getDateFnsLocale() });
  const isOwn = !!viewerId && comment.user.id === viewerId;

  const handleLikeComment = useCallback(async () => {
    haptic.like();
    const wasLiked = localLiked;
    setLocalLiked(prev => !prev);
    setLocalLikes(prev => wasLiked ? prev - 1 : prev + 1);
    try {
      if (wasLiked) {
        await reelsApi.unlikeComment(reelId, comment.id);
      } else {
        await reelsApi.likeComment(reelId, comment.id);
      }
    } catch {
      setLocalLiked(wasLiked);
      setLocalLikes(prev => wasLiked ? prev + 1 : prev - 1);
    }
  }, [haptic, localLiked, reelId, comment.id]);

  const deleteMutation = useMutation({
    mutationFn: () => reelsApi.deleteComment(reelId, comment.id),
    onSuccess: onDeleted,
    onError: (err: Error) => showToast({ message: err.message || t('common.error'), variant: 'error' }),
  });

  const handleDelete = () => {
    Alert.alert(t('comments.deleteTitle'), t('comments.deletePrompt'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('common.delete'), style: 'destructive', onPress: () => deleteMutation.mutate() },
    ]);
  };

  const isRTL = I18nManager.isRTL;

  return (
    <View style={[styles.commentRow, { flexDirection: rtlFlexRow(isRTL) }]}>
      <Avatar uri={comment.user.avatarUrl} name={comment.user.displayName} size="sm" />
      <View style={styles.commentBody}>
        <View style={styles.commentBubble}>
          <Text style={[styles.commentUser, { textAlign: rtlTextAlign(isRTL) }]}>{comment.user.displayName}</Text>
          <RichText text={comment.content} />
        </View>
        <View style={[styles.commentMeta, { flexDirection: rtlFlexRow(isRTL) }]}>
          <Text style={styles.commentTime}>{timeAgo}</Text>
          {localLikes > 0 && (
            <Text style={styles.commentLikesLabel}>{formatCount(localLikes)} {t('saf.likes')}</Text>
          )}
          <Pressable onPress={() => onReply(comment.id, comment.user.username)}>
            <Text style={styles.commentAction}>{t('common.reply')}</Text>
          </Pressable>
          {isOwn && (
            <Pressable onPress={handleDelete} disabled={deleteMutation.isPending}>
              <Text style={styles.commentActionDestructive}>{t('common.delete')}</Text>
            </Pressable>
          )}
        </View>
      </View>
      <Pressable
          accessibilityRole="button"
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
        </Pressable>
    </View>
  );
}

export default function ReelDetailScreen() {
  const tc = useThemeColors();
  const styles = createStyles(tc);
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user } = useUser();
  const queryClient = useQueryClient();
  const haptic = useContextualHaptic();
  const { t } = useTranslation();
  const inputRef = useRef<TextInput>(null);
  const videoRef = useRef<Video>(null);
  const [commentText, setCommentText] = useState('');
  const [replyTo, setReplyTo] = useState<{ id: string; username: string } | null>(null);
  const [isPlaying, setIsPlaying] = useState(true);
  const [showShareSheet, setShowShareSheet] = useState(false);
  const { animatedStyle, onPressIn, onPressOut } = useAnimatedPress();

  // Clear mode state
  const [clearMode, setClearMode] = useState(false);
  const clearModeToastShown = useRef(false);
  const overlayOpacity = useSharedValue(1);

  const overlayAnimatedStyle = useAnimatedStyle(() => ({
    opacity: overlayOpacity.value,
  }));

  const handleClearModeToggle = useCallback(() => {
    setClearMode((prev) => {
      const next = !prev;
      overlayOpacity.value = withTiming(next ? 0 : 1, { duration: 300 });
      if (!clearModeToastShown.current) {
        clearModeToastShown.current = true;
        showToast({ message: next ? t('clearMode.hide') : t('clearMode.show'), variant: 'info' });
      }
      return next;
    });
  }, [t, overlayOpacity]);

  // Record view when component mounts (only for authenticated users)
  useEffect(() => {
    if (id && user) {
      reelsApi.view(id).catch(() => {
        // Silently fail if view recording fails
      });
    }
  }, [id, user]);

  const reelQuery = useQuery({
    queryKey: ['reel', id],
    queryFn: () => reelsApi.getById(id),
    enabled: !!id,
  });

  const commentsQuery = useInfiniteQuery({
    queryKey: ['reel-comments', id],
    queryFn: ({ pageParam }) =>
      reelsApi.getComments(id, pageParam as string | undefined),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) =>
      last.meta.hasMore ? last.meta.cursor ?? undefined : undefined,
    enabled: !!id,
  });

  const comments: Comment[] = commentsQuery.data?.pages.flatMap((p) => p.data) ?? [];

  const sendMutation = useMutation({
    mutationFn: () =>
      reelsApi.comment(id, commentText.trim(), replyTo?.id),
    onSuccess: () => {
      setCommentText('');
      setReplyTo(null);
      queryClient.invalidateQueries({ queryKey: ['reel-comments', id] });
      queryClient.invalidateQueries({ queryKey: ['reel', id] });
      showToast({ message: t('common.done'), variant: 'success' });
    },
    onError: (err: Error) => showToast({ message: err.message || t('common.error'), variant: 'error' }),
  });

  const likeMutation = useMutation<unknown, unknown, void>({
    mutationFn: () =>
      reelQuery.data?.isLiked
        ? reelsApi.unlike(id)
        : reelsApi.like(id),
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: ['reel', id] });
      const prev = queryClient.getQueryData(['reel', id]);
      queryClient.setQueryData(['reel', id], (old: Reel | undefined) =>
        old ? { ...old, isLiked: !old.isLiked, likesCount: old.isLiked ? old.likesCount - 1 : old.likesCount + 1 } : old
      );
      return { prev };
    },
    onError: (_err, _vars, context) => {
      queryClient.setQueryData(['reel', id], (context as { prev?: unknown })?.prev);
    },
    onSettled: () => {
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

  const handlePlayPause = useCallback(() => {
    if (isPlaying) {
      videoRef.current?.pauseAsync();
    } else {
      videoRef.current?.playAsync();
    }
    setIsPlaying(!isPlaying);
  }, [isPlaying]);


  const handleLike = useCallback(() => {
    haptic.like();
    likeMutation.mutate();
  }, [haptic, likeMutation]);

  const handleBookmark = useCallback(() => {
    haptic.save();
    bookmarkMutation.mutate();
  }, [haptic, bookmarkMutation]);

  const handleShare = useCallback(async () => {
    haptic.navigate();
    shareMutation.mutate();
    try {
      await Share.share({
        message: t('share.defaultMessage'),
        url: `mizanly://reel/${id}`,
      });
    } catch {
      // User cancelled
    }
  }, [id, shareMutation, haptic, t]);

  // ── Share to DM ──
  const conversationsQuery = useQuery({
    queryKey: ['conversations'],
    queryFn: () => messagesApi.getConversations(),
    enabled: showShareSheet,
  });

  const handleShareToDM = useCallback(async (conversationId: string) => {
    if (!reelQuery.data) return;
    try {
      const reel = reelQuery.data;
      await messagesApi.sendMessage(conversationId, {
        content: `Check out this reel!`,
        mediaUrl: reel.hlsUrl || reel.videoUrl,
        messageType: 'reel_share',
      });
      showToast({ message: t('bakra.sent'), variant: 'success' });
      haptic.send();
      setShowShareSheet(false);
    } catch {
      showToast({ message: t('common.error'), variant: 'error' });
    }
  }, [reelQuery.data, haptic, t]);

  const canSend = commentText.trim().length > 0 && !sendMutation.isPending;

  if (reelQuery.isError) {
    return (
      <View style={styles.container}>
        <GlassHeader
          title={t('errors.title')}
          leftAction={{ icon: 'arrow-left', onPress: () => router.back(), accessibilityLabel: t('common.goBack') }}
        />
        <View style={{ marginTop: 88 }}>
          <EmptyState
            icon="slash"
            title={t('common.error')}
            subtitle={t('errors.loadContentFailed')}
            actionLabel={t('common.goBack')}
            onAction={() => router.back()}
          />
        </View>
      </View>
    );
  }

  const listHeader = useMemo(() => (
    reelQuery.data ? (
      <View style={styles.reelContainer}>
        {/* Video Player */}
        <Pressable onPress={handleClearModeToggle} style={styles.videoContainer}>
          <Video
            ref={videoRef}
            source={{ uri: reelQuery.data.hlsUrl || reelQuery.data.videoUrl }}
            style={styles.video}
            resizeMode={ResizeMode.COVER}
            shouldPlay={isPlaying}
            isLooping={reelQuery.data.isLooping ?? true}
            useNativeControls={false}
          />

          {/* Video Controls Overlay - Show play button when paused */}
          {!isPlaying && (
            <View style={styles.videoControls}>
              <Pressable onPress={handlePlayPause} style={styles.controlButton}>
                <Icon
                  name="play"
                  size={44}
                  color={colors.text.primary}
                />
              </Pressable>
            </View>
          )}

          {/* Gradient Overlay */}
          <LinearGradient
            colors={['transparent', 'rgba(0,0,0,0.8)']}
            style={styles.bottomGradient}
            locations={[0.6, 1]}
          />

          {/* Reel Info Overlay */}
          <Animated.View style={[styles.reelInfoOverlay, overlayAnimatedStyle]}>
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
              <Pressable
                style={styles.followButton}
                onPress={async () => {
                  try {
                    await followsApi.follow(reelQuery.data?.user?.id);
                    queryClient.invalidateQueries({ queryKey: ['reel', id] });
                  } catch {}
                }}
              >
                <Text style={styles.followButtonText}>{t('common.follow')}</Text>
              </Pressable>
            </View>

            {reelQuery.data.caption && (
              <Text style={styles.reelCaption}>
                <RichText text={reelQuery.data.caption} />
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
              <ActionButton
                icon={<Icon name="heart" size={28} color={colors.text.primary} />}
                activeIcon={<Icon name="heart-filled" size={28} color={colors.like} fill={colors.like} />}
                isActive={reelQuery.data.isLiked}
                count={reelQuery.data.likesCount}
                onPress={handleLike}
                disabled={likeMutation.isPending}
                activeColor={colors.like}
                accessibilityLabel={t('common.like')}
              />

              <ActionButton
                icon={<Icon name="message-circle" size={28} color={colors.text.primary} />}
                count={reelQuery.data.commentsCount}
                onPress={() => inputRef.current?.focus()}
                accessibilityLabel={t('accessibility.commentReel')}
              />

              <ActionButton
                icon={<Icon name="share" size={28} color={colors.text.primary} />}
                count={reelQuery.data.sharesCount}
                onPress={handleShare}
                disabled={shareMutation.isPending}
                accessibilityLabel={t('common.share')}
              />

              <ActionButton
                icon={<Icon name="bookmark" size={28} color={colors.text.primary} />}
                activeIcon={<Icon name="bookmark-filled" size={28} color={colors.gold} fill={colors.gold} />}
                isActive={reelQuery.data.isBookmarked}
                onPress={handleBookmark}
                disabled={bookmarkMutation.isPending}
                activeColor={colors.gold}
                accessibilityLabel={t('common.bookmark')}
              />

              <ActionButton
                icon={<Icon name="send" size={28} color={colors.text.primary} />}
                onPress={() => setShowShareSheet(true)}
                accessibilityLabel={t('bakra.shareToChat')}
              />
            </View>
          </Animated.View>
        </Pressable>

        {/* Comments Header */}
        <View style={styles.commentsHeader}>
          <Text style={styles.commentsTitle}>
            {formatCount(reelQuery.data.commentsCount)} {t('saf.comments')}
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
  ), [reelQuery.data, reelQuery.isLoading, isPlaying, overlayAnimatedStyle, handleClearModeToggle, handlePlayPause, handleLike, handleBookmark, handleShare, likeMutation.isPending, bookmarkMutation.isPending, shareMutation.isPending, t, id, queryClient, styles]);

  const listEmpty = useMemo(() => (
    !commentsQuery.isLoading && reelQuery.data ? (
      <EmptyState
        icon="message-circle"
        title={t('comments.emptyTitle')}
        subtitle={t('comments.emptySubtitle')}
      />
    ) : null
  ), [commentsQuery.isLoading, reelQuery.data, t]);

  const listFooter = useMemo(() => (
    commentsQuery.isFetchingNextPage ? (
      <Skeleton.Rect width="100%" height={60} />
    ) : null
  ), [commentsQuery.isFetchingNextPage]);

  return (
    <ScreenErrorBoundary>
      <View style={styles.container}>
        <GlassHeader
          title={t('bakra.reel')}
          leftAction={{ icon: 'arrow-left', onPress: () => router.back(), accessibilityLabel: t('common.goBack') }}
          rightActions={[
            { icon: 'layers', onPress: () => navigate('/(screens)/duet-create', { reelId: id }), accessibilityLabel: t('bakra.duet') },
            { icon: 'repeat', onPress: () => navigate('/(screens)/reel-remix', { reelId: id }), accessibilityLabel: t('bakra.remix') },
            { icon: 'share', onPress: () => navigate('/(screens)/stitch-create', { reelId: id }), accessibilityLabel: t('bakra.stitch') },
          ]}
        />

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
              <BrandedRefreshControl
                refreshing={reelQuery.isRefetching || commentsQuery.isRefetching}
                onRefresh={handleRefresh}
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
                    {t('comments.replyingTo')} @{replyTo.username}
                  </Text>
                  <Pressable onPress={() => setReplyTo(null)} hitSlop={8}>
                    <Icon name="x" size="xs" color={tc.text.secondary} />
                  </Pressable>
                </View>
              )}
              <View style={styles.inputRow}>
                <Avatar uri={user.imageUrl} name={user.fullName ?? t('common.me')} size="sm" />
                <TextInput
                  ref={inputRef}
                  style={styles.input}
                  placeholder={replyTo ? t('comments.replyPlaceholder', { username: replyTo.username }) : t('comments.addCommentPlaceholder')}
                  placeholderTextColor={tc.text.tertiary}
                  value={commentText}
                  onChangeText={setCommentText}
                  multiline
                  maxLength={500}
                />
                <Pressable
                  accessibilityRole="button"
                  onPress={() => canSend && sendMutation.mutate()}
                  disabled={!canSend}
                >
                  {sendMutation.isPending ? (
                    <Icon name="loader" size="sm" color={colors.emerald} />
                  ) : (
                    <Text style={[styles.sendBtn, !canSend && styles.sendBtnDisabled]}>
                      {t('common.send')}
                    </Text>
                  )}
                </Pressable>
              </View>
            </View>
          )}
        </KeyboardAvoidingView>

        {/* Share to DM BottomSheet */}
        <BottomSheet
          visible={showShareSheet}
          onClose={() => setShowShareSheet(false)}
          snapPoint={0.5}
          scrollable
        >
          <Text style={styles.shareSheetTitle}>{t('bakra.selectConversation')}</Text>
          {conversationsQuery.isLoading ? (
            <View style={styles.shareSheetList}>
              {Array.from({ length: 5 }).map((_, i) => (
                <View key={i} style={styles.shareSheetRow}>
                  <Skeleton.Circle size={40} />
                  <Skeleton.Rect width={140} height={14} />
                </View>
              ))}
            </View>
          ) : (conversationsQuery.data ?? []).length === 0 ? (
            <EmptyState
              icon="message-circle"
              title={t('risalah.noMessages')}
              subtitle={t('risalah.messagesHint')}
            />
          ) : (
            <FlatList
              data={conversationsQuery.data ?? []}
              keyExtractor={(item) => item.id}
              renderItem={({ item }: { item: Conversation }) => {
                const displayName = item.isGroup
                  ? item.groupName ?? t('risalah.group')
                  : item.members.find((m) => m.user.id !== user?.id)?.user.displayName ?? t('risalah.chat');
                const avatarUri = item.isGroup
                  ? item.groupAvatarUrl ?? null
                  : item.members.find((m) => m.user.id !== user?.id)?.user.avatarUrl ?? null;
                return (
                  <Pressable
                    style={styles.shareSheetRow}
                    onPress={() => handleShareToDM(item.id)}
                    accessibilityRole="button"
                    accessibilityLabel={t('bakra.shareToChat')}
                  >
                    <Avatar uri={avatarUri} name={displayName} size="md" />
                    <Text style={styles.shareSheetName} numberOfLines={1}>{displayName}</Text>
                    <Icon name="send" size="sm" color={tc.text.secondary} />
                  </Pressable>
                );
              }}
              contentContainerStyle={{ paddingBottom: spacing['2xl'] }}
            />
          )}
        </BottomSheet>
      </View>

    </ScreenErrorBoundary>
  );
}

const createStyles = (tc: ReturnType<typeof useThemeColors>) => StyleSheet.create({
  container: { flex: 1, backgroundColor: tc.bg },
  // Header is now handled by GlassHeader component
  reelContainer: {
    backgroundColor: tc.bg,
  },
  videoContainer: {
    width: VIDEO_WIDTH,
    height: VIDEO_HEIGHT,
    backgroundColor: tc.bg,
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
  // Action buttons now use ActionButton component
  commentsHeader: {
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    borderTopWidth: 0.5,
    borderTopColor: tc.border,
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
    backgroundColor: tc.bgElevated,
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
    borderTopColor: tc.border,
    backgroundColor: tc.bg,
    paddingBottom: Platform.OS === 'ios' ? spacing.base : spacing.sm,
  },
  replyBanner: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.xs,
    backgroundColor: tc.bgElevated,
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
  shareSheetTitle: {
    color: colors.text.primary,
    fontSize: fontSize.base,
    fontWeight: '700',
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.md,
  },
  shareSheetList: {
    paddingHorizontal: spacing.xl,
    gap: spacing.md,
  },
  shareSheetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.sm,
  },
  shareSheetName: {
    flex: 1,
    color: colors.text.primary,
    fontSize: fontSize.base,
    fontWeight: '600',
  },
});