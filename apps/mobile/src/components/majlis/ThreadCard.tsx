import { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useMutation } from '@tanstack/react-query';
import { formatDistanceToNowStrict } from 'date-fns';
import { Image } from 'expo-image';
import { Avatar } from '@/components/ui/Avatar';
import { colors, spacing, fontSize } from '@/theme';
import { threadsApi } from '@/services/api';
import type { Thread } from '@/types';

interface Props {
  thread: Thread;
  viewerId?: string;
}

export function ThreadCard({ thread, viewerId }: Props) {
  const router = useRouter();
  const [localLiked, setLocalLiked] = useState(thread.userReaction === 'LIKE');
  const [localLikes, setLocalLikes] = useState(thread.likesCount);
  const [localBookmarked, setLocalBookmarked] = useState(thread.isBookmarked ?? false);
  const [localReposts, setLocalReposts] = useState(thread.repostsCount);

  const likeMutation = useMutation({
    mutationFn: () => localLiked ? threadsApi.unlike(thread.id) : threadsApi.like(thread.id),
    onMutate: () => {
      setLocalLiked((p) => !p);
      setLocalLikes((p) => localLiked ? p - 1 : p + 1);
    },
    onError: () => {
      setLocalLiked((p) => !p);
      setLocalLikes((p) => localLiked ? p + 1 : p - 1);
    },
  });

  const bookmarkMutation = useMutation({
    mutationFn: () =>
      localBookmarked ? threadsApi.unbookmark(thread.id) : threadsApi.bookmark(thread.id),
    onMutate: () => setLocalBookmarked((p) => !p),
    onError: () => setLocalBookmarked((p) => !p),
  });

  const timeAgo = formatDistanceToNowStrict(new Date(thread.createdAt), { addSuffix: true });

  return (
    <TouchableOpacity
      style={styles.card}
      onPress={() => router.push(`/(screens)/thread/${thread.id}`)}
      activeOpacity={0.95}
    >
      {/* Avatar column */}
      <View style={styles.left}>
        <TouchableOpacity
          onPress={() => router.push(`/(screens)/profile/${thread.user.username}`)}
          activeOpacity={0.8}
        >
          <Avatar uri={thread.user.avatarUrl} name={thread.user.displayName} size="md" />
        </TouchableOpacity>
        {thread.repliesCount > 0 && <View style={styles.replyLine} />}
      </View>

      {/* Content column */}
      <View style={styles.right}>
        {/* User + time */}
        <View style={styles.topRow}>
          <TouchableOpacity
            style={styles.userInfo}
            onPress={() => router.push(`/(screens)/profile/${thread.user.username}`)}
            activeOpacity={0.8}
          >
            <Text style={styles.name}>{thread.user.displayName}</Text>
            {thread.user.isVerified && <Text style={styles.verified}>✓</Text>}
            <Text style={styles.handle}>@{thread.user.username}</Text>
          </TouchableOpacity>
          <Text style={styles.time}>{timeAgo}</Text>
          <TouchableOpacity hitSlop={8}>
            <Text style={styles.more}>•••</Text>
          </TouchableOpacity>
        </View>

        {/* Content */}
        <Text style={styles.content}>{thread.content}</Text>

        {/* Media (first image only in feed) */}
        {thread.mediaUrls.length > 0 && (
          <Image
            source={{ uri: thread.mediaUrls[0] }}
            style={styles.media}
            contentFit="cover"
          />
        )}

        {/* Repost of */}
        {thread.repostOf && (
          <View style={styles.repostOf}>
            <Text style={styles.repostOfHandle}>@{thread.repostOf.user.username}</Text>
            <Text style={styles.repostOfContent} numberOfLines={2}>{thread.repostOf.content}</Text>
          </View>
        )}

        {/* Poll summary */}
        {thread.poll && (
          <View style={styles.pollWrap}>
            <Text style={styles.pollQuestion}>{thread.poll.question}</Text>
            <Text style={styles.pollMeta}>
              {thread.poll.totalVotes} votes · {thread.poll.options.length} options
            </Text>
          </View>
        )}

        {/* Actions */}
        <View style={styles.actions}>
          <TouchableOpacity
            style={styles.action}
            onPress={() => router.push(`/(screens)/thread/${thread.id}`)}
            activeOpacity={0.7}
          >
            <Text style={styles.actionIcon}>💬</Text>
            {thread.repliesCount > 0 && <Text style={styles.actionCount}>{thread.repliesCount}</Text>}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.action}
            activeOpacity={0.7}
            disabled={!viewerId}
          >
            <Text style={styles.actionIcon}>🔄</Text>
            {localReposts > 0 && <Text style={styles.actionCount}>{localReposts}</Text>}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.action}
            onPress={() => likeMutation.mutate()}
            activeOpacity={0.7}
            disabled={!viewerId}
          >
            <Text style={[styles.actionIcon, localLiked && styles.likedIcon]}>
              {localLiked ? '❤️' : '🤍'}
            </Text>
            {!thread.hideLikesCount && localLikes > 0 && (
              <Text style={[styles.actionCount, localLiked && styles.likedCount]}>{localLikes}</Text>
            )}
          </TouchableOpacity>

          <View style={styles.spacer} />

          <TouchableOpacity
            style={styles.action}
            onPress={() => bookmarkMutation.mutate()}
            activeOpacity={0.7}
            disabled={!viewerId}
          >
            <Text style={styles.actionIcon}>{localBookmarked ? '🔖' : '🔖'}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: 'row', paddingHorizontal: spacing.base, paddingTop: spacing.md, paddingBottom: spacing.sm, borderBottomWidth: 0.5, borderBottomColor: colors.dark.border },
  left: { alignItems: 'center', marginRight: spacing.md, paddingTop: 2 },
  replyLine: { width: 1.5, flex: 1, backgroundColor: colors.dark.border, marginTop: spacing.sm, borderRadius: 1 },
  right: { flex: 1 },
  topRow: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.xs, gap: spacing.xs },
  userInfo: { flexDirection: 'row', alignItems: 'center', gap: 4, flex: 1 },
  name: { color: colors.text.primary, fontWeight: '700', fontSize: fontSize.base },
  verified: { color: colors.emerald, fontSize: fontSize.xs },
  handle: { color: colors.text.secondary, fontSize: fontSize.sm },
  time: { color: colors.text.tertiary, fontSize: fontSize.xs },
  more: { color: colors.text.tertiary, fontSize: fontSize.sm, letterSpacing: 1 },
  content: { color: colors.text.primary, fontSize: fontSize.base, lineHeight: 22, marginBottom: spacing.sm },
  media: { width: '100%', height: 220, borderRadius: 12, marginBottom: spacing.sm },
  repostOf: { borderWidth: 1, borderColor: colors.dark.border, borderRadius: 10, padding: spacing.md, marginBottom: spacing.sm },
  repostOfHandle: { color: colors.text.secondary, fontSize: fontSize.xs, marginBottom: 4 },
  repostOfContent: { color: colors.text.primary, fontSize: fontSize.sm },
  pollWrap: { borderWidth: 1, borderColor: colors.dark.border, borderRadius: 10, padding: spacing.md, marginBottom: spacing.sm },
  pollQuestion: { color: colors.text.primary, fontSize: fontSize.sm, fontWeight: '600', marginBottom: 4 },
  pollMeta: { color: colors.text.secondary, fontSize: fontSize.xs },
  actions: { flexDirection: 'row', alignItems: 'center', marginTop: spacing.xs, gap: spacing.xl },
  action: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  actionIcon: { fontSize: 20 },
  likedIcon: {},
  actionCount: { color: colors.text.secondary, fontSize: fontSize.sm },
  likedCount: { color: colors.like },
  spacer: { flex: 1 },
});
