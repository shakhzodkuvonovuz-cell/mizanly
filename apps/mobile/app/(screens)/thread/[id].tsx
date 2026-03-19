import { useState, useRef, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, TextInput, Pressable,
  KeyboardAvoidingView, Platform, FlatList, RefreshControl, Alert,
  Pressable,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery, useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useUser } from '@clerk/clerk-expo';
import { formatDistanceToNowStrict } from 'date-fns';
import { Image } from 'expo-image';
import { Avatar } from '@/components/ui/Avatar';
import { Icon } from '@/components/ui/Icon';
import { RichText } from '@/components/ui/RichText';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { GlassHeader } from '@/components/ui/GlassHeader';
import { ThreadCard } from '@/components/majlis/ThreadCard';
import { colors, spacing, fontSize, radius } from '@/theme';
import { threadsApi } from '@/services/api';
import type { ThreadReply } from '@/types';
import { useTranslation } from '@/hooks/useTranslation';
import { useTTS } from '@/hooks/useTTS';
import { useHaptic } from '@/hooks/useHaptic';
import { ScreenErrorBoundary } from '@/components/ui/ScreenErrorBoundary';
import { rtlFlexRow, rtlTextAlign, rtlMargin } from '@/utils/rtl';

function ReplyRow({
  reply,
  threadId,
  viewerId,
  onReply,
  onDeleted,
}: {
  reply: ThreadReply;
  threadId: string;
  viewerId?: string;
  onReply: (id: string, username: string) => void;
  onDeleted: () => void;
}) {
  const { t, isRTL } = useTranslation();
  const timeAgo = formatDistanceToNowStrict(new Date(reply.createdAt), { addSuffix: true });
  const hasReplies = (reply._count?.replies ?? 0) > 0;
  const [liked, setLiked] = useState(reply.isLiked ?? false);
  const [likeCount, setLikeCount] = useState(reply.likesCount);

  const isOwn = !!viewerId && reply.user.id === viewerId;

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
    onError: (err: Error) => Alert.alert(t('common.error'), err.message),
  });

  const handleDelete = useCallback(() => {
    Alert.alert(t('majlis.deleteReplyTitle'), t('majlis.deleteReplyMessage'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('common.delete'), style: 'destructive', onPress: () => deleteMutation.mutate() },
    ]);
  }, [deleteMutation]);

  return (
    <View style={[styles.replyRow, { flexDirection: rtlFlexRow(isRTL) }]}>
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
          <Image
            source={{ uri: reply.mediaUrls[0] }}
            style={styles.replyMedia}
            contentFit="cover"
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
            <Icon name="message-circle" size={20} color={colors.text.secondary} />
            {(reply._count?.replies ?? 0) > 0 && (
              <Text style={styles.replyActionCount}>{reply._count!.replies}</Text>
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
              color={liked ? colors.like : colors.text.secondary}
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
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user } = useUser();
  const queryClient = useQueryClient();
  const inputRef = useRef<TextInput>(null);
  const [replyText, setReplyText] = useState('');
  const [replyTo, setReplyTo] = useState<{ id: string; username: string } | null>(null);
  const { t, isRTL } = useTranslation();
  const tts = useTTS();
  const haptic = useHaptic();

  const threadQuery = useQuery({
    queryKey: ['thread', id],
    queryFn: () => threadsApi.getById(id),
  });

  const repliesQuery = useInfiniteQuery({
    queryKey: ['thread-replies', id],
    queryFn: ({ pageParam }) =>
      threadsApi.getReplies(id, pageParam as string | undefined),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) =>
      last.meta.hasMore ? last.meta.cursor ?? undefined : undefined,
  });

  const replies: ThreadReply[] = repliesQuery.data?.pages.flatMap((p) => p.data) ?? [];

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
  });

  const handleReply = useCallback((replyId: string, username: string) => {
    setReplyTo({ id: replyId, username });
    inputRef.current?.focus();
  }, []);

  const canSend = replyText.trim().length > 0 && !sendMutation.isPending;

  if (threadQuery.isError) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <GlassHeader
          title={t('common.error')}
          leftAction={{ 
            icon: <Icon name="arrow-left" size="md" color={colors.text.primary} />, 
            onPress: () => router.back(),
            accessibilityLabel: 'Go back'
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
    haptic.light();
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
        <ThreadCard thread={threadQuery.data} viewerId={user?.id} />
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
        <View style={styles.repliesHeader}>
          <Text style={[styles.repliesTitle, { textAlign: rtlTextAlign(isRTL) }]}>
            {t('majlis.replies', { count: threadQuery.data.repliesCount })}
          </Text>
        </View>
      </View>
    ) : threadQuery.isLoading ? (
      <View style={{ padding: spacing.base }}>
        <Skeleton.ThreadCard />
      </View>
    ) : null
  ), [threadQuery.data, threadQuery.isLoading, user?.id, showListenButton, handleListen, isRTL, t]);

  const listEmpty = useMemo(() => (
    !repliesQuery.isLoading && threadQuery.data ? (
      <EmptyState icon="message-circle" title={t('majlis.joinConversation')} subtitle={t('majlis.beFirstToShare')} />
    ) : null
  ), [repliesQuery.isLoading, threadQuery.data]);

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
          icon: <Icon name="arrow-left" size="md" color={colors.text.primary} />, 
          onPress: () => router.back(),
          accessibilityLabel: 'Go back'
        }}
      />

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
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
            <RefreshControl
              refreshing={threadQuery.isRefetching || repliesQuery.isRefetching}
              onRefresh={handleRefresh}
              tintColor={colors.emerald}
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
            />
          )}
          ListEmptyComponent={listEmpty}
          ListFooterComponent={listFooter}
          contentContainerStyle={{ paddingBottom: 100 }}
        />

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
                  <Icon name="x" size="xs" color={colors.text.secondary} />
                </Pressable>
              </View>
            )}
            <View style={[styles.inputRow, { flexDirection: rtlFlexRow(isRTL) }]}>
              <Avatar uri={user.imageUrl} name={user.fullName ?? t('common.me')} size="sm" />
              <TextInput
                ref={inputRef}
                style={styles.input}
                placeholder={replyTo ? t('saf.replyToUser', { username: replyTo.username }) : t('majlis.writeReply')}
                placeholderTextColor={colors.text.tertiary}
                value={replyText}
                onChangeText={setReplyText}
                multiline
                maxLength={500}
                accessibilityLabel={t('accessibility.replyInput')}
              />
              <Pressable
                onPress={() => canSend && sendMutation.mutate()}
                disabled={!canSend}
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

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.dark.bg },
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
    borderTopWidth: 0.5, borderTopColor: colors.dark.border,
  },
  repliesTitle: { color: colors.text.primary, fontSize: fontSize.base, fontWeight: '700' },
  replyRow: {
    flexDirection: 'row', paddingHorizontal: spacing.base,
    paddingTop: spacing.md, paddingBottom: spacing.sm,
    borderBottomWidth: 0.5, borderBottomColor: colors.dark.border,
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
  replyName: { color: colors.text.primary, fontWeight: '700', fontSize: fontSize.sm },
  replyHandle: { color: colors.text.secondary, fontSize: fontSize.xs },
  replyTime: { color: colors.text.tertiary, fontSize: fontSize.xs, marginLeft: 'auto' },
  replyContent: { color: colors.text.primary, fontSize: fontSize.base, lineHeight: 21 },
  replyMedia: { width: '100%', height: 160, borderRadius: radius.md, marginTop: spacing.sm },
  replyActions: {
    flexDirection: 'row', gap: spacing.xl, marginTop: spacing.sm,
  },
  replyAction: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  replyActionCount: { color: colors.text.secondary, fontSize: fontSize.sm },
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
    maxHeight: 100, paddingVertical: 8, paddingHorizontal: spacing.base,
    backgroundColor: colors.dark.bgElevated, borderRadius: radius.full,
  },
  sendBtn: { color: colors.emerald, fontSize: fontSize.base, fontWeight: '700' },
  sendBtnDisabled: { color: colors.text.tertiary },
});
