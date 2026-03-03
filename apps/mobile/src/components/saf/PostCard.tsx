import { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal, Pressable, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { formatDistanceToNowStrict } from 'date-fns';
import { Avatar } from '@/components/ui/Avatar';
import { RichText } from '@/components/ui/RichText';
import { PostMedia } from './PostMedia';
import { colors, spacing, fontSize } from '@/theme';
import { postsApi } from '@/services/api';
import type { Post } from '@/types';

interface Props {
  post: Post;
  viewerId?: string;
  isOwn?: boolean;
}

export function PostCard({ post, viewerId, isOwn }: Props) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [localLiked, setLocalLiked] = useState(post.userReaction === 'LIKE');
  const [localLikes, setLocalLikes] = useState(post.likesCount);
  const [localSaved, setLocalSaved] = useState(post.isSaved ?? false);
  const [showMenu, setShowMenu] = useState(false);
  const [dismissed, setDismissed] = useState(false);

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

  const deleteMutation = useMutation({
    mutationFn: () => postsApi.delete(post.id),
    onSuccess: () => {
      setShowMenu(false);
      queryClient.invalidateQueries({ queryKey: ['saf-feed'] });
      queryClient.invalidateQueries({ queryKey: ['profile'] });
    },
  });

  const dismissMutation = useMutation({
    mutationFn: () => postsApi.dismiss(post.id),
    onSuccess: () => { setShowMenu(false); setDismissed(true); },
  });

  const handleDelete = () => {
    setShowMenu(false);
    Alert.alert('Delete post?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deleteMutation.mutate() },
    ]);
  };

  const handleReport = () => {
    setShowMenu(false);
    Alert.alert('Report post', 'Why are you reporting this?', [
      { text: 'Spam', onPress: () => postsApi.report(post.id, 'SPAM').catch(() => {}) },
      { text: 'Inappropriate', onPress: () => postsApi.report(post.id, 'INAPPROPRIATE').catch(() => {}) },
      { text: 'Misinformation', onPress: () => postsApi.report(post.id, 'MISINFORMATION').catch(() => {}) },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const timeAgo = formatDistanceToNowStrict(new Date(post.createdAt), { addSuffix: true });

  if (dismissed) return null;

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
        <TouchableOpacity style={styles.moreBtn} hitSlop={8} onPress={() => setShowMenu(true)}>
          <Text style={styles.moreBtnText}>•••</Text>
        </TouchableOpacity>
      </View>

      {/* Caption */}
      {post.content ? (
        <RichText
          text={post.content}
          style={styles.content}
          numberOfLines={5}
          onPostPress={() => router.push(`/(screens)/post/${post.id}`)}
        />
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

      {/* More menu */}
      <Modal visible={showMenu} transparent animationType="fade">
        <Pressable style={styles.menuOverlay} onPress={() => setShowMenu(false)}>
          <Pressable style={styles.menuSheet}>
            {isOwn ? (
              <>
                <TouchableOpacity style={styles.menuItem} onPress={handleDelete}>
                  <Text style={styles.menuItemDestructive}>🗑️  Delete post</Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <TouchableOpacity style={styles.menuItem} onPress={() => dismissMutation.mutate()}>
                  <Text style={styles.menuItemText}>🙈  Not interested</Text>
                </TouchableOpacity>
                <View style={styles.menuDivider} />
                <TouchableOpacity style={styles.menuItem} onPress={handleReport}>
                  <Text style={styles.menuItemDestructive}>🚩  Report</Text>
                </TouchableOpacity>
              </>
            )}
            <View style={styles.menuDivider} />
            <TouchableOpacity style={styles.menuItem} onPress={() => setShowMenu(false)}>
              <Text style={styles.menuItemCancel}>Cancel</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
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

  menuOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  menuSheet: {
    backgroundColor: colors.dark.bgSheet, borderTopLeftRadius: 18, borderTopRightRadius: 18,
    paddingBottom: spacing.xl, overflow: 'hidden',
  },
  menuItem: { paddingHorizontal: spacing.base, paddingVertical: spacing.md + 2 },
  menuItemText: { color: colors.text.primary, fontSize: fontSize.base },
  menuItemDestructive: { color: '#FF453A', fontSize: fontSize.base },
  menuItemCancel: { color: colors.text.secondary, fontSize: fontSize.base, textAlign: 'center' },
  menuDivider: { height: 0.5, backgroundColor: colors.dark.border },
});
