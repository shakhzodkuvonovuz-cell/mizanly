import { useState, useRef, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, TextInput, Pressable,
  KeyboardAvoidingView, Platform, FlatList, Alert, Share,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { showToast } from '@/components/ui/Toast';
import { useQuery, useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useUser } from '@clerk/clerk-expo';
import { formatDistanceToNowStrict } from 'date-fns';
import { getDateFnsLocale } from '@/utils/localeFormat';
import { BrandedRefreshControl } from '@/components/ui/BrandedRefreshControl';
import { ProgressiveImage } from '@/components/ui/ProgressiveImage';
import { Avatar } from '@/components/ui/Avatar';
import { Icon } from '@/components/ui/Icon';
import { RichText } from '@/components/ui/RichText';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { GlassHeader } from '@/components/ui/GlassHeader';
import { ThreadCard } from '@/components/majlis/ThreadCard';
import { ActionButton } from '@/components/ui/ActionButton';
import { colors, spacing, fontSize, radius } from '@/theme';
import { threadsApi } from '@/services/api';
import type { ThreadReply } from '@/types';
import { useTranslation } from '@/hooks/useTranslation';
import { useTTS } from '@/hooks/useTTS';
import { useContextualHaptic } from '@/hooks/useContextualHaptic';
import { useThemeColors } from '@/hooks/useThemeColors';
import { ScreenErrorBoundary } from '@/components/ui/ScreenErrorBoundary';
import { rtlFlexRow, rtlTextAlign, rtlMargin } from '@/utils/rtl';

function ReplyRow({
  reply,
  threadId,
  viewerId,
  onReply,
  onDeleted,
  depth = 0,
}: {
  reply: ThreadReply;
  threadId: string;
  viewerId?: string;
  onReply: (id: string, username: string) => void;
  onDeleted: () => void;
  depth?: number;
}) {
  const tc = useThemeColors();
  const styles = createStyles(tc);
  const { t, isRTL } = useTranslation();
  const timeAgo = formatDistanceToNowStrict(new Date(reply.createdAt), { addSuffix: true, locale: getDateFnsLocale() });
  const hasReplies = (reply._count?.replies ?? 0) > 0;
  const [liked, setLiked] = useState(reply.isLiked ?? false);
  const [likeCount, setLikeCount] = useState(reply.likesCount);

  const isOwn = !!viewerId && reply.user.id === viewerId;
  const clampedDepth = Math.min(depth, 3);
  const indent = clampedDepth * 24;

  const handleLike = useCallback(() => {
    setLiked((prev) => {
      const next = !prev;
      setLikeCount((c) => c + (next ? 1 : -1));
      if (next) {
        threadsApi.likeReply(threadId, reply.id).catch(() => {
          setLiked(false); setLikeCount((c) => c - 1);
        });
      } else {
        threadsApi.unlikeReply(threadId, reply.id).catch(() => {
          setLiked(true); setLikeCount((c) => c + 1);
        });
      }
      return next;
    });
  }, [threadId, reply.id]);

  const deleteMutation = useMutation({
    mutationFn: () => threadsApi.deleteReply(threadId, reply.id),
    onSuccess: onDeleted,
    onError: (err: Error) => showToast({ message: err.message, variant: 'error' }),
  });

  const handleDelete = useCallback(() => {
    Alert.alert(t('majlis.deleteReplyTitle'), t('majlis.deleteReplyMessage'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('common.delete'), style: 'destructive', onPress: () => deleteMutation.mutate() },
    ]);
  }, [deleteMutation]);

  return (
    <View style={[
      styles.replyRow,
      { flexDirection: rtlFlexRow(isRTL) },
      indent > 0 && (isRTL ? { marginRight: indent } : { marginLeft: indent }),
    ]}>
      {/* Indent connecting line */}
      {indent > 0 && (
        <View
          style={[
            styles.indentLine,
            isRTL
              ? { right: -indent + 12 }
              : { left: -indent + 12 },
          ]}
        />
      )}

      {/* Avatar + line column */}
      <View style={[styles.replyLeft, rtlMargin(isRTL, 0, spacing.sm)]}>
        <Avatar uri={reply.user.avatarUrl} name={reply.user.displayName} size="sm" />
        {hasReplies && <View style={styles.replyLine} />}
      </View>

      {/* Content column */}
      <View style={styles.replyRight}>
        <View style={[styles.replyTopRow, { flexDirection: rtlFlexRow(isRTL) }]}>
          <Text style={styles.replyName}>{reply.user.displayName}</Text>
          <Text style={styles.replyHandle}>@{reply.user.username}</Text>
          <Text style={[styles.replyTime, isRTL ? { marginRight: 'auto', marginLeft: undefined } : undefined]}>{timeAgo}</Text>
        </View>
        <RichText text={reply.content} />
        {reply.mediaUrls.length > 0 && (
          <ProgressiveImage
            uri={reply.mediaUrls[0]}
            width="100%"
            height={160}
            borderRadius={radius.md}
            style={{ marginTop: spacing.sm }}
          />
        )}
        <View style={[styles.replyActions, { flexDirection: rtlFlexRow(isRTL) }]}>
          <Pressable
            onPress={() => onReply(reply.id, reply.user.username)}
            style={styles.replyAction}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityLabel={t('accessibility.replyToUser', { username: reply.user.displayName })}
            accessibilityRole="button"
          >
            <Icon name="message-circle" size={20} color={tc.text.secondary} />
            {(reply._count?.replies ?? 0) > 0 && (
              <Text style={styles.replyActionCount}>{reply._count?.replies ?? 0}</Text>
            )}
          </Pressable>
          <Pressable
            style={styles.replyAction}
            onPress={handleLike}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityLabel={liked ? t('accessibility.unlikeReply') : t('accessibility.likeReply')}
            accessibilityRole="button"
          >
            <Icon
              name={liked ? 'heart-filled' : 'heart'}
              size={20}
              color={liked ? colors.like : tc.text.secondary}
              fill={liked ? colors.like : undefined}
            />
            {likeCount > 0 && (
              <Text style={[styles.replyActionCount, liked && { color: colors.like }]}>
                {likeCount}
              </Text>
            )}
          </Pressable>
          {isOwn && (
            <Pressable
              style={styles.replyAction}
              onPress={handleDelete}
              disabled={deleteMutation.isPending}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityLabel={t('accessibility.deleteReply')}
              accessibilityRole="button"
            >
              <Icon name="trash" size={20} color={colors.error} />
            </Pressable>
          )}
        </View>
      </View>
    </View>
  );
}

export default function ThreadDetailScreen() {
  const tc = useThemeColors();
  const styles = createStyles(tc);
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user } = useUser();
  const queryClient = useQueryClient();
  const inputRef = useRef<TextInput>(null);
  const lastThreadTapRef = useRef<number>(0);
  const [replyText, setReplyText] = useState('');
  const [replyTo, setReplyTo] = useState<{ id: string; username: string } | null>(null);
  const [replySort, setReplySort] = useState<'top' | 'latest'>('top');
  const { t, isRTL } = useTranslation();
  const tts = useTTS();
  const haptic = useContextualHaptic();

  const threadQuery = useQuery({
    queryKey: ['thread', id],
    queryFn: () => threadsApi.getById(id),
    enabled: !!id,
  });

  const repliesQuery = useInfiniteQuery({
    queryKey: ['thread-replies', id],
    queryFn: ({ pageParam }) =>
      threadsApi.getReplies(id, pageParam as string | undefined),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) =>
      last.meta.hasMore ? last.meta.cursor ?? undefined : undefined,
    enabled: !!id,
  });

  const rawReplies: ThreadReply[] = repliesQuery.data?.pages.flatMap((p) => p.data) ?? [];

  // Build depth map: replies with parentId are nested under their parent
  const depthMap = useMemo(() => {
    const map = new Map<string, number>();
    const parentSet = new Set(rawReplies.map((r) => r.id));
    for (const reply of rawReplies) {
      if (!reply.parentId || !parentSet.has(reply.parentId)) {
        map.set(reply.id, 0);
      } else {
        const parentDepth = map.get(reply.parentId) ?? 0;
        map.set(reply.id, parentDepth + 1);
      }
    }
    return map;
  }, [rawReplies]);

  // Sort replies: "top" by likes descending, "latest" by creation date (API default)
  const replies = useMemo(() => {
    if (replySort === 'latest') return rawReplies;
    return [...rawReplies].sort((a, b) => (b.likesCount ?? 0) - (a.likesCount ?? 0));
  }, [rawReplies, replySort]);

  // Sticky bar — local like/bookmark state
  const thread = threadQuery.data;
  const [localLiked, setLocalLiked] = useState(false);
  const [localLikes, setLocalLikes] = useState(0);
  const [localBookmarked, setLocalBookmarked] = useState(false);

  const lastSyncedThreadId = useRef<string | null>(null);
  if (thread && thread.id !== lastSyncedThreadId.current) {
    lastSyncedThreadId.current = thread.id;
    setLocalLiked(thread.userReaction === 'LIKE');
    setLocalLikes(thread.likesCount ?? 0);
    setLocalBookmarked(thread.isBookmarked ?? false);
  }

  const threadLikeMutation = useMutation({
    mutationFn: () => localLiked ? threadsApi.unlike(id) : threadsApi.like(id),
    onMutate: () => {
      setLocalLiked(prev => !prev);
      setLocalLikes(prev => localLiked ? prev - 1 : prev + 1);
    },
    onError: () => {
      setLocalLiked(prev => !prev);
      setLocalLikes(prev => localLiked ? prev + 1 : prev - 1);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['thread', id] }),
  });

  const threadBookmarkMutation = useMutation({
    mutationFn: () => localBookmarked ? threadsApi.unbookmark(id) : threadsApi.bookmark(id),
    onMutate: () => setLocalBookmarked(prev => !prev),
    onError: () => setLocalBookmarked(prev => !prev),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['thread', id] }),
  });

  const handleStickyLike = useCallback(() => {
    haptic.like();
    threadLikeMutation.mutate();
  }, [haptic, threadLikeMutation]);

  const handleStickyBookmark = useCallback(() => {
    haptic.save();
    threadBookmarkMutation.mutate();
  }, [haptic, threadBookmarkMutation]);

  const handleStickyReply = useCallback(() => {
    inputRef.current?.focus();
  }, []);

  const handleRefresh = useCallback(() => {
    threadQuery.refetch();
    repliesQuery.refetch();
  }, [threadQuery, repliesQuery]);

  const sendMutation = useMutation({
    mutationFn: () =>
      threadsApi.addReply(id, replyText.trim(), replyTo?.id),
    onSuccess: () => {
      setReplyText('');
      setReplyTo(null);
      queryClient.invalidateQueries({ queryKey: ['thread-replies', id] });
      queryClient.invalidateQueries({ queryKey: ['thread', id] });
    },
    onError: (err: Error) => showToast({ message: err.message, variant: 'error' }),
  });

  const handleReply = useCallback((replyId: string, username: string) => {
    setReplyTo({ id: replyId, username });
    inputRef.current?.focus();
  }, []);

  const handleShare = useCallback(async () => {
    try {
      await Share.share({
        message: t('share.defaultMessage'),
        url: `mizanly://thread/${id}`,
      });
    } catch {
      // User cancelled
    }
  }, [id, t]);

  const canSend = replyText.trim().length > 0 && !sendMutation.isPending;

  if (threadQuery.isError) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <GlassHeader
          title={t('common.error')}
          leftAction={{
            icon: 'arrow-left',
            onPress: () => router.back(),
            accessibilityLabel: t('common.goBack')
          }}
        />
        <EmptyState
          icon="slash"
          title={t('common.error')}
          subtitle={t('majlis.loadContentError')}
          actionLabel={t('saf.goBack')}
          onAction={() => router.back()}
        />
      </SafeAreaView>
    );
  }

  const handleListen = useCallback(() => {
    if (!threadQuery.data) return;
    haptic.navigate();
    const content = threadQuery.data.content;
    if (content && content.length > 50) {
      const title = threadQuery.data.user?.displayName
        ? `@${threadQuery.data.user.username}`
        : t('majlis.thread');
      tts.speak(content, title);
    }
  }, [threadQuery.data, haptic, tts, t]);

  const showListenButton = threadQuery.data?.content && threadQuery.data.content.length > 100;

  const listHeader = useMemo(() => (
    threadQuery.data ? (
      <View>
        <Pressable onPress={() => {
          const now = Date.now();
          if (lastThreadTapRef.current && now - lastThreadTapRef.current < 300) {
            threadLikeMutation.mutate();
            haptic.like();
            lastThreadTapRef.current = 0;
          } else {
            lastThreadTapRef.current = now;
          }
        }}>
          <ThreadCard thread={threadQuery.data} viewerId={user?.id} />
        </Pressable>
        {showListenButton && (
          <Pressable
            onPress={handleListen}
            style={[styles.listenButton, { flexDirection: rtlFlexRow(isRTL) }]}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityLabel={t('tts.listen')}
            accessibilityRole="button"
          >
            <Icon name="volume-2" size={16} color={colors.emerald} />
            <Text style={styles.listenText}>{t('tts.listen')}</Text>
          </Pressable>
        )}
        <View style={styles.repliesHeader}>
          <Text style={[styles.repliesTitle, { textAlign: rtlTextAlign(isRTL) }]}>
            {t('majlis.replies', { count: threadQuery.data.repliesCount })}
          </Text>
          <View style={[styles.sortRow, { flexDirection: rtlFlexRow(isRTL) }]}>
            <Pressable
              onPress={() => { setReplySort('top'); haptic.tick(); }}
              style={[styles.sortButton, replySort === 'top' && styles.sortButtonActive]}
              accessibilityLabel={t('common.top')}
              accessibilityRole="button"
            >
              <Text style={[styles.sortButtonText, replySort === 'top' && styles.sortButtonTextActive]}>
                {t('common.top')}
              </Text>
            </Pressable>
            <Pressable
              onPress={() => { setReplySort('latest'); haptic.tick(); }}
              style={[styles.sortButton, replySort === 'latest' && styles.sortButtonActive]}
              accessibilityLabel={t('common.latest')}
              accessibilityRole="button"
            >
              <Text style={[styles.sortButtonText, replySort === 'latest' && styles.sortButtonTextActive]}>
                {t('common.latest')}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    ) : threadQuery.isLoading ? (
      <View style={{ padding: spacing.base }}>
        <Skeleton.ThreadCard />
      </View>
    ) : null
  ), [threadQuery.data, threadQuery.isLoading, user?.id, showListenButton, handleListen, isRTL, t, replySort, haptic]);

  const listEmpty = useMemo(() => (
    !repliesQuery.isLoading && threadQuery.data ? (
      <EmptyState icon="message-circle" title={t('majlis.joinConversation')} subtitle={t('majlis.beFirstToShare')} />
    ) : null
  ), [repliesQuery.isLoading, threadQuery.data, t]);

  const listFooter = useMemo(() => (
    repliesQuery.isFetchingNextPage ? (
      <Skeleton.Rect width="100%" height={60} />
    ) : null
  ), [repliesQuery.isFetchingNextPage]);

  return (
    <ScreenErrorBoundary>
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <GlassHeader
        title={t('majlis.thread')}
        leftAction={{
          icon: 'arrow-left',
          onPress: () => router.back(),
          accessibilityLabel: t('common.goBack')
        }}
        rightActions={[
          { icon: 'share', onPress: handleShare, accessibilityLabel: t('common.share') },
          { icon: 'flag', onPress: () => router.push(`/(screens)/report?type=thread&id=${id}` as never), accessibilityLabel: t('common.report') },
        ]}
      />

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <FlatList
            removeClippedSubviews={true}
          data={replies}
          keyExtractor={(item) => item.id}
          onEndReached={() => {
            if (repliesQuery.hasNextPage && !repliesQuery.isFetchingNextPage) {
              repliesQuery.fetchNextPage();
            }
          }}
          onEndReachedThreshold={0.4}
          ListHeaderComponent={listHeader}
          refreshControl={
            <BrandedRefreshControl
              refreshing={threadQuery.isRefetching || repliesQuery.isRefetching}
              onRefresh={handleRefresh}
            />
          }
          renderItem={({ item }) => (
            <ReplyRow
              reply={item}
              threadId={id}
              viewerId={user?.id}
              onReply={handleReply}
              onDeleted={() => {
                queryClient.invalidateQueries({ queryKey: ['thread-replies', id] });
                queryClient.invalidateQueries({ queryKey: ['thread', id] });
              }}
              depth={depthMap.get(item.id) ?? 0}
            />
          )}
          ListEmptyComponent={listEmpty}
          ListFooterComponent={listFooter}
          contentContainerStyle={{ paddingBottom: 140 }}
        />

        {/* Sticky glass action bar */}
        {thread && (
          <View style={styles.stickyBar}>
            {Platform.OS === 'ios' ? (
              <BlurView intensity={60} tint="dark" style={StyleSheet.absoluteFill} />
            ) : (
              <View style={[StyleSheet.absoluteFill, { backgroundColor: tc.isDark ? 'rgba(13, 17, 23, 0.95)' : 'rgba(255, 255, 255, 0.95)' }]} />
            )}
            <View style={styles.stickyBarContent}>
              <ActionButton
                icon={<Icon name="heart" size="sm" color={tc.text.secondary} />}
                activeIcon={<Icon name="heart-filled" size="sm" color={colors.like} fill={colors.like} />}
                isActive={localLiked}
                count={localLikes > 0 ? localLikes : undefined}
                onPress={handleStickyLike}
                activeColor={colors.like}
                accessibilityLabel={localLiked ? t('accessibility.unlikeThread') : t('accessibility.likeThread')}
              />
              <ActionButton
                icon={<Icon name="message-circle" size="sm" color={tc.text.secondary} />}
                count={thread.repliesCount > 0 ? thread.repliesCount : undefined}
                onPress={handleStickyReply}
                accessibilityLabel={t('accessibility.replyToThread')}
              />
              <ActionButton
                icon={<Icon name="share" size="sm" color={tc.text.secondary} />}
                onPress={handleShare}
                accessibilityLabel={t('common.share')}
              />
              <ActionButton
                icon={<Icon name="bookmark" size="sm" color={localBookmarked ? colors.bookmark : tc.text.tertiary} />}
                activeIcon={<Icon name="bookmark-filled" size="sm" color={colors.bookmark} fill={colors.bookmark} />}
                isActive={localBookmarked}
                onPress={handleStickyBookmark}
                activeColor={colors.bookmark}
                accessibilityLabel={localBookmarked ? t('accessibility.unbookmarkThread') : t('accessibility.bookmarkThread')}
              />
            </View>
          </View>
        )}

        {/* Reply Input */}
        {user && (
          <View style={styles.inputWrap}>
            {replyTo && (
              <View style={[styles.replyBanner, { flexDirection: rtlFlexRow(isRTL) }]}>
                <Text style={[styles.replyBannerText, { textAlign: rtlTextAlign(isRTL) }]}>
                  {t('saf.replyingTo', { username: replyTo.username })}
                </Text>
                <Pressable
                  onPress={() => setReplyTo(null)}
                  hitSlop={8}
                  accessibilityLabel={t('accessibility.cancelReply')}
                  accessibilityRole="button"
                >
                  <Icon name="x" size="xs" color={tc.text.secondary} />
                </Pressable>
              </View>
            )}
            <View style={[styles.inputRow, { flexDirection: rtlFlexRow(isRTL) }]}>
              <Avatar uri={user.imageUrl} name={user.fullName ?? t('common.me')} size="sm" />
              <TextInput
                ref={inputRef}
                style={styles.input}
                placeholder={replyTo ? t('saf.replyToUser', { username: replyTo.username }) : t('majlis.writeReply')}
                placeholderTextColor={tc.text.tertiary}
                value={replyText}
                onChangeText={setReplyText}
                multiline
                maxLength={500}
                accessibilityLabel={t('accessibility.replyInput')}
              />
              <Pressable
                onPress={() => { if (canSend) { haptic.send(); sendMutation.mutate(); } }}
                disabled={!canSend || sendMutation.isPending}
                accessibilityLabel={t('accessibility.sendComment')}
                accessibilityRole="button"
              >
                {sendMutation.isPending ? (
                  <Icon name="loader" size="sm" color={colors.emerald} />
                ) : (
                  <Text style={[styles.sendBtn, !canSend && styles.sendBtnDisabled]}>
                    {t('common.reply')}
                  </Text>
                )}
              </Pressable>
            </View>
          </View>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
    </ScreenErrorBoundary>
  );
}

const createStyles = (tc: ReturnType<typeof useThemeColors>) => StyleSheet.create({
  container: { flex: 1, backgroundColor: tc.bg },
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
    fontWeight: '600',
  },
  repliesHeader: {
    paddingHorizontal: spacing.base, paddingVertical: spacing.md,
    borderTopWidth: 0.5, borderTopColor: tc.border,
  },
  repliesTitle: { color: tc.text.primary, fontSize: fontSize.base, fontWeight: '700' },
  sortRow: {
    flexDirection: 'row',
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
    fontWeight: '600',
  },
  sortButtonTextActive: {
    color: colors.emerald,
  },
  replyRow: {
    flexDirection: 'row', paddingHorizontal: spacing.base,
    paddingTop: spacing.md, paddingBottom: spacing.sm,
    borderBottomWidth: 0.5, borderBottomColor: tc.border,
    position: 'relative' as const,
  },
  indentLine: {
    position: 'absolute' as const,
    top: 0,
    bottom: 0,
    width: 2,
    backgroundColor: tc.border,
    borderRadius: 1,
  },
  replyLeft: { alignItems: 'center', paddingTop: 2 },
  replyLine: {
    width: 2, flex: 1, backgroundColor: 'rgba(10, 123, 79, 0.3)',
    marginTop: spacing.xs, borderRadius: 1,
  },
  replyRight: { flex: 1 },
  replyTopRow: {
    flexDirection: 'row', alignItems: 'center',
    gap: spacing.xs, marginBottom: spacing.xs,
  },
  replyName: { color: tc.text.primary, fontWeight: '700', fontSize: fontSize.sm },
  replyHandle: { color: tc.text.secondary, fontSize: fontSize.xs },
  replyTime: { color: tc.text.tertiary, fontSize: fontSize.xs, marginLeft: 'auto' },
  replyContent: { color: tc.text.primary, fontSize: fontSize.base, lineHeight: 21 },
  replyMedia: { width: '100%', height: 160, borderRadius: radius.md, marginTop: spacing.sm },
  replyActions: {
    flexDirection: 'row', gap: spacing.xl, marginTop: spacing.sm,
  },
  replyAction: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  replyActionCount: { color: tc.text.secondary, fontSize: fontSize.sm },
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
    maxHeight: 100, paddingVertical: 8, paddingHorizontal: spacing.base,
    backgroundColor: tc.bgElevated, borderRadius: radius.full,
  },
  sendBtn: { color: colors.emerald, fontSize: fontSize.base, fontWeight: '700' },
  sendBtnDisabled: { color: tc.text.tertiary },
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
