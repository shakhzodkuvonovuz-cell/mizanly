import { useState, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  KeyboardAvoidingView, Platform, ActivityIndicator, FlatList,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery, useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useUser } from '@clerk/clerk-expo';
import { formatDistanceToNowStrict } from 'date-fns';
import { Image } from 'expo-image';
import { Avatar } from '@/components/ui/Avatar';
import { ThreadCard } from '@/components/majlis/ThreadCard';
import { colors, spacing, fontSize } from '@/theme';
import { threadsApi } from '@/services/api';
import type { ThreadReply } from '@/types';

function ReplyRow({
  reply,
  onReply,
}: {
  reply: ThreadReply;
  onReply: (id: string, username: string) => void;
}) {
  const timeAgo = formatDistanceToNowStrict(new Date(reply.createdAt), { addSuffix: true });
  const hasReplies = (reply._count?.replies ?? 0) > 0;

  return (
    <View style={styles.replyRow}>
      {/* Avatar + line column */}
      <View style={styles.replyLeft}>
        <Avatar uri={reply.user.avatarUrl} name={reply.user.displayName} size="sm" />
        {hasReplies && <View style={styles.replyLine} />}
      </View>

      {/* Content column */}
      <View style={styles.replyRight}>
        <View style={styles.replyTopRow}>
          <Text style={styles.replyName}>{reply.user.displayName}</Text>
          <Text style={styles.replyHandle}>@{reply.user.username}</Text>
          <Text style={styles.replyTime}>{timeAgo}</Text>
        </View>
        <Text style={styles.replyContent}>{reply.content}</Text>
        {reply.mediaUrls.length > 0 && (
          <Image
            source={{ uri: reply.mediaUrls[0] }}
            style={styles.replyMedia}
            contentFit="cover"
          />
        )}
        <View style={styles.replyActions}>
          <TouchableOpacity
            onPress={() => onReply(reply.id, reply.user.username)}
            style={styles.replyAction}
          >
            <Text style={styles.replyActionIcon}>💬</Text>
            {reply.likesCount > 0 && (
              <Text style={styles.replyActionCount}>{reply.likesCount}</Text>
            )}
          </TouchableOpacity>
          <TouchableOpacity style={styles.replyAction}>
            <Text style={styles.replyActionIcon}>🤍</Text>
            {reply.likesCount > 0 && (
              <Text style={styles.replyActionCount}>{reply.likesCount}</Text>
            )}
          </TouchableOpacity>
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

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={8} style={styles.backBtn}>
          <Text style={styles.backIcon}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Thread</Text>
        <View style={{ width: 40 }} />
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <FlatList
          data={replies}
          keyExtractor={(item) => item.id}
          onEndReached={() => {
            if (repliesQuery.hasNextPage && !repliesQuery.isFetchingNextPage) {
              repliesQuery.fetchNextPage();
            }
          }}
          onEndReachedThreshold={0.4}
          ListHeaderComponent={() =>
            threadQuery.data ? (
              <View>
                <ThreadCard thread={threadQuery.data} viewerId={user?.id} />
                <View style={styles.repliesHeader}>
                  <Text style={styles.repliesTitle}>
                    {threadQuery.data.repliesCount} Replies
                  </Text>
                </View>
              </View>
            ) : threadQuery.isLoading ? (
              <ActivityIndicator color={colors.emerald} style={styles.loader} />
            ) : null
          }
          renderItem={({ item }) => (
            <ReplyRow reply={item} onReply={handleReply} />
          )}
          ListEmptyComponent={() =>
            !repliesQuery.isLoading && threadQuery.data ? (
              <View style={styles.empty}>
                <Text style={styles.emptyText}>No replies yet.</Text>
              </View>
            ) : null
          }
          ListFooterComponent={() =>
            repliesQuery.isFetchingNextPage ? (
              <ActivityIndicator color={colors.emerald} style={{ paddingVertical: spacing.lg }} />
            ) : null
          }
          contentContainerStyle={{ paddingBottom: 100 }}
        />

        {/* Reply Input */}
        {user && (
          <View style={styles.inputWrap}>
            {replyTo && (
              <View style={styles.replyBanner}>
                <Text style={styles.replyBannerText}>
                  Replying to @{replyTo.username}
                </Text>
                <TouchableOpacity onPress={() => setReplyTo(null)} hitSlop={8}>
                  <Text style={styles.replyClose}>✕</Text>
                </TouchableOpacity>
              </View>
            )}
            <View style={styles.inputRow}>
              <Avatar uri={user.imageUrl} name={user.fullName ?? 'Me'} size="sm" />
              <TextInput
                ref={inputRef}
                style={styles.input}
                placeholder={replyTo ? `Reply to @${replyTo.username}…` : 'Write a reply…'}
                placeholderTextColor={colors.text.tertiary}
                value={replyText}
                onChangeText={setReplyText}
                multiline
                maxLength={500}
              />
              <TouchableOpacity
                onPress={() => canSend && sendMutation.mutate()}
                disabled={!canSend}
              >
                {sendMutation.isPending ? (
                  <ActivityIndicator color={colors.emerald} size="small" />
                ) : (
                  <Text style={[styles.sendBtn, !canSend && styles.sendBtnDisabled]}>
                    Reply
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
  backIcon: { color: colors.text.primary, fontSize: 22 },
  headerTitle: { color: colors.text.primary, fontSize: fontSize.base, fontWeight: '700' },
  loader: { marginTop: 60 },
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
  replyLeft: { alignItems: 'center', marginRight: spacing.sm, paddingTop: 2 },
  replyLine: {
    width: 1.5, flex: 1, backgroundColor: colors.dark.border,
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
  replyMedia: { width: '100%', height: 160, borderRadius: 10, marginTop: spacing.sm },
  replyActions: {
    flexDirection: 'row', gap: spacing.xl, marginTop: spacing.sm,
  },
  replyAction: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  replyActionIcon: { fontSize: 18 },
  replyActionCount: { color: colors.text.secondary, fontSize: fontSize.sm },
  empty: { alignItems: 'center', paddingTop: 40 },
  emptyText: { color: colors.text.secondary, fontSize: fontSize.base },
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
