import { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { formatDistanceToNowStrict } from 'date-fns';
import { Avatar } from '@/components/ui/Avatar';
import { PostMedia } from './PostMedia';
import { colors, spacing, fontSize } from '@/theme';
import { postsApi } from '@/services/api';
import type { Post } from '@/types';

interface Props {
  post: Post;
  viewerId?: string;
}

export function PostCard({ post, viewerId }: Props) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [localLiked, setLocalLiked] = useState(post.userReaction === 'LIKE');
  const [localLikes, setLocalLikes] = useState(post.likesCount);
  const [localSaved, setLocalSaved] = useState(post.isSaved ?? false);

  const reactMutation = useMutation({
    mutationFn: () =>
      localLiked ? postsApi.unreact(post.id) : postsApi.react(post.id, 'LIKE'),
    onMutate: () => {
      setLocalLiked((p) => !p);
      setLocalLikes((p) => localLiked ? p - 1 : p + 1);
    },
    onError: () => {
      setLocalLiked((p) => !p);
      setLocalLikes((p) => localLiked ? p + 1 : p - 1);
    },
  });

  const saveMutation = useMutation({
    mutationFn: () => localSaved ? postsApi.unsave(post.id) : postsApi.save(post.id),
    onMutate: () => setLocalSaved((p) => !p),
    onError: () => setLocalSaved((p) => !p),
  });

  const timeAgo = formatDistanceToNowStrict(new Date(post.createdAt), { addSuffix: true });

  return (
    <View style={styles.card}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.userInfo}
          onPress={() => router.push(`/(screens)/profile/${post.user.username}`)}
          activeOpacity={0.8}
        >
          <Avatar uri={post.user.avatarUrl} name={post.user.displayName} size="md" />
          <View>
            <View style={styles.nameRow}>
              <Text style={styles.name}>{post.user.displayName}</Text>
              {post.user.isVerified && <Text style={styles.verified}>✓</Text>}
            </View>
            <Text style={styles.handle}>@{post.user.username} · {timeAgo}</Text>
          </View>
        </TouchableOpacity>
        <TouchableOpacity style={styles.moreBtn} hitSlop={8}>
          <Text style={styles.moreBtnText}>•••</Text>
        </TouchableOpacity>
      </View>

      {/* Caption */}
      {post.content ? (
        <TouchableOpacity
          onPress={() => router.push(`/(screens)/post/${post.id}`)}
          activeOpacity={0.9}
        >
          <Text style={styles.content} numberOfLines={5}>{post.content}</Text>
        </TouchableOpacity>
      ) : null}

      {/* Media */}
      {post.mediaUrls.length > 0 && (
        <TouchableOpacity
          activeOpacity={0.95}
          onPress={() => router.push(`/(screens)/post/${post.id}`)}
        >
          <PostMedia
            mediaUrls={post.mediaUrls}
            mediaTypes={post.mediaTypes}
            thumbnailUrl={post.thumbnailUrl}
            aspectRatio={post.mediaWidth && post.mediaHeight ? post.mediaWidth / post.mediaHeight : undefined}
          />
        </TouchableOpacity>
      )}

      {/* Actions */}
      <View style={styles.actions}>
        {/* Like */}
        <TouchableOpacity
          style={styles.action}
          onPress={() => reactMutation.mutate()}
          activeOpacity={0.7}
          disabled={!viewerId}
        >
          <Text style={[styles.actionIcon, localLiked && styles.actionIconActive]}>
            {localLiked ? '❤️' : '🤍'}
          </Text>
          {!post.hideLikesCount && (
            <Text style={[styles.actionCount, localLiked && styles.actionCountActive]}>
              {localLikes > 0 ? localLikes : ''}
            </Text>
          )}
        </TouchableOpacity>

        {/* Comment */}
        <TouchableOpacity
          style={styles.action}
          onPress={() => router.push(`/(screens)/post/${post.id}`)}
          activeOpacity={0.7}
        >
          <Text style={styles.actionIcon}>💬</Text>
          {post.commentsCount > 0 && (
            <Text style={styles.actionCount}>{post.commentsCount}</Text>
          )}
        </TouchableOpacity>

        {/* Share */}
        <TouchableOpacity
          style={styles.action}
          activeOpacity={0.7}
          disabled={!viewerId}
        >
          <Text style={styles.actionIcon}>🔄</Text>
          {post.sharesCount > 0 && (
            <Text style={styles.actionCount}>{post.sharesCount}</Text>
          )}
        </TouchableOpacity>

        <View style={styles.spacer} />

        {/* Bookmark */}
        <TouchableOpacity
          style={styles.action}
          onPress={() => saveMutation.mutate()}
          activeOpacity={0.7}
          disabled={!viewerId}
        >
          <Text style={[styles.actionIcon, localSaved && styles.bookmarkActive]}>
            {localSaved ? '🔖' : '🔖'}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderBottomWidth: 0.5, borderBottomColor: colors.dark.border },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.base, paddingTop: spacing.md, paddingBottom: spacing.sm },
  userInfo: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flex: 1 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  name: { color: colors.text.primary, fontWeight: '700', fontSize: fontSize.base },
  verified: { color: colors.emerald, fontSize: fontSize.sm },
  handle: { color: colors.text.secondary, fontSize: fontSize.xs, marginTop: 1 },
  moreBtn: { padding: spacing.sm },
  moreBtnText: { color: colors.text.secondary, fontSize: fontSize.sm, letterSpacing: 1 },
  content: { color: colors.text.primary, fontSize: fontSize.base, lineHeight: 22, paddingHorizontal: spacing.base, paddingBottom: spacing.sm },
  actions: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.base, paddingVertical: spacing.md, gap: spacing.xl },
  action: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  actionIcon: { fontSize: 22 },
  actionIconActive: { },
  actionCount: { color: colors.text.secondary, fontSize: fontSize.sm, fontWeight: '500' },
  actionCountActive: { color: colors.like },
  bookmarkActive: { },
  spacer: { flex: 1 },
});
