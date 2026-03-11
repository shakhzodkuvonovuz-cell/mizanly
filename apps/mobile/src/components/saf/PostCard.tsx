import { useState, useCallback, memo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert, Share, Pressable } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withSequence,
  withTiming,
  withDelay,
  runOnJS,
} from 'react-native-reanimated';
import { useRouter } from 'expo-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { formatDistanceToNowStrict } from 'date-fns';
import { Avatar } from '@/components/ui/Avatar';
import { RichText } from '@/components/ui/RichText';
import { Icon } from '@/components/ui/Icon';
import { VerifiedBadge } from '@/components/ui/VerifiedBadge';
import { ActionButton } from '@/components/ui/ActionButton';
import { BottomSheet, BottomSheetItem } from '@/components/ui/BottomSheet';
import { useHaptic } from '@/hooks/useHaptic';
import { PostMedia } from './PostMedia';
import { FloatingHearts } from '@/components/ui/FloatingHearts';
import { colors, spacing, fontSize, animation, radius } from '@/theme';
import { postsApi, feedApi } from '@/services/api';
import * as Clipboard from 'expo-clipboard';
import type { Post } from '@/types';

interface Props {
  post: Post;
  viewerId?: string;
  isOwn?: boolean;
}

export const PostCard = memo(function PostCard({ post, viewerId, isOwn }: Props) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const haptic = useHaptic();
  const [localLiked, setLocalLiked] = useState(post.userReaction === 'LIKE');
  const [localLikes, setLocalLikes] = useState(post.likesCount);
  const [localSaved, setLocalSaved] = useState(post.isSaved ?? false);
  const [showMenu, setShowMenu] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [heartTrigger, setHeartTrigger] = useState(0);

  // Double-tap overlay heart
  const overlayHeartScale = useSharedValue(0);
  const overlayHeartOpacity = useSharedValue(0);

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

  const shareAsStoryMutation = useMutation({
    mutationFn: () => {
      const api = postsApi as typeof postsApi & { shareAsStory?: (id: string) => Promise<unknown> };
      if (typeof api.shareAsStory === 'function') {
        return api.shareAsStory(post.id);
      }
      return Promise.reject(new Error('Not implemented'));
    },
    onSuccess: () => setShowMenu(false),
    onError: () => {}, // silent fail for unimplemented feature
  });

  const getShareLinkMutation = useMutation({
    mutationFn: () => postsApi.getShareLink(post.id),
    onSuccess: (data) => {
      Clipboard.setStringAsync(data.url);
      haptic.light();
    },
    onError: () => {
      Clipboard.setStringAsync(`mizanly://post/${post.id}`);
      haptic.light();
    },
  });

  const dismissMutation = useMutation({
    mutationFn: () => feedApi.dismiss({ postId: post.id, reason: 'not_interested' }),
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

  const handleCopyLink = () => {
    setShowMenu(false);
    getShareLinkMutation.mutate();
  };

  const handleShare = () => {
    Share.share({
      message: `${post.content ?? ''}\n\nmizanly://post/${post.id}`,
      url: `mizanly://post/${post.id}`,
    });
  };

  // Heart animation trigger
  const triggerHeartAnimation = useCallback(() => {
    overlayHeartScale.value = 0;
    overlayHeartOpacity.value = 1;
    overlayHeartScale.value = withSequence(
      withTiming(1.2, { duration: 200 }),
      withTiming(1, { duration: 200 }),
      withTiming(0, { duration: 400 }),
    );
    overlayHeartOpacity.value = withDelay(
      600,
      withTiming(0, { duration: 200 }),
    );
    // Trigger floating hearts effect
    setHeartTrigger((t) => t + 1);
  }, [overlayHeartScale, overlayHeartOpacity]);

  // Handle like button press
  const handleLike = useCallback(() => {
    if (!localLiked) {
      triggerHeartAnimation();
    }
    reactMutation.mutate();
  }, [localLiked, triggerHeartAnimation, reactMutation]);

  // Double-tap to like handler
  const lastTap = useSharedValue(0);
  const handleDoubleTap = useCallback(() => {
    const now = Date.now();
    if (now - lastTap.value < 300) {
      // Double tap detected
      if (!localLiked) {
        reactMutation.mutate();
        triggerHeartAnimation();
      }
      haptic.medium();
    }
    lastTap.value = now;
  }, [localLiked, reactMutation, haptic, lastTap, triggerHeartAnimation]);

  const overlayHeartStyle = useAnimatedStyle(() => ({
    transform: [{ scale: overlayHeartScale.value }],
    opacity: overlayHeartOpacity.value,
  }));

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
          accessibilityLabel={`View ${post.user.displayName}'s profile`}
          accessibilityRole="button"
          accessibilityHint="Open user profile"
        >
          <Avatar uri={post.user.avatarUrl} name={post.user.displayName} size="md" />
          <View>
            <View style={styles.nameRow}>
              <Text style={styles.name}>{post.user.displayName}</Text>
              {post.user.isVerified && <VerifiedBadge size={14} />}
              {(post.collaborators?.length ?? 0) > 0 && (
                <View style={{ marginLeft: 4 }}>
                  <Icon name="users" size="sm" color={colors.text.secondary} />
                </View>
              )}
            </View>
            <Text style={styles.handle}>@{post.user.username} · {timeAgo}</Text>
          </View>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.moreBtn}
          hitSlop={8}
          onPress={() => { haptic.light(); setShowMenu(true); }}
          accessibilityLabel="More options"
          accessibilityRole="button"
          accessibilityHint="Open post options menu"
        >
          <Icon name="more-horizontal" size="sm" color={colors.text.secondary} />
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

      {/* Media with double-tap to like */}
      {post.mediaUrls.length > 0 && (
        <View>
          <Pressable
            onPress={handleDoubleTap}
            accessibilityLabel="Double-tap to like"
            accessibilityRole="button"
            accessibilityHint="Double tap to like this post"
          >
            <PostMedia
              mediaUrls={post.mediaUrls}
              mediaTypes={post.mediaTypes}
              thumbnailUrl={post.thumbnailUrl}
              aspectRatio={post.mediaWidth && post.mediaHeight ? post.mediaWidth / post.mediaHeight : undefined}
              blurred={post.isSensitive && !revealed}
            />
            {/* Overlay heart for double-tap */}
            <Animated.View style={[styles.overlayHeart, overlayHeartStyle]} pointerEvents="none">
              <Icon name="heart-filled" size={80} color={colors.like} fill={colors.like} />
            </Animated.View>
            {/* Floating hearts effect */}
            <FloatingHearts trigger={heartTrigger} />
          </Pressable>
          {post.isSensitive && !revealed && (
            <View style={styles.sensitiveOverlay}>
              <Icon name="eye-off" size="lg" color={colors.text.secondary} />
              <Text style={styles.sensitiveText}>Sensitive content</Text>
              <Text style={styles.sensitiveSubtext}>This post may contain sensitive material</Text>
              <Pressable
                style={styles.sensitiveRevealBtn}
                onPress={() => setRevealed(true)}
                accessibilityLabel="Show sensitive content"
                accessibilityRole="button"
              >
                <Text style={styles.sensitiveRevealText}>View</Text>
              </Pressable>
            </View>
          )}
        </View>
      )}

      {/* Actions */}
      <View style={styles.actions}>
        <ActionButton
          icon={<Icon name="heart" size="sm" color={colors.text.secondary} />}
          activeIcon={<Icon name="heart-filled" size="sm" color={colors.like} fill={colors.like} />}
          isActive={localLiked}
          count={post.hideLikesCount ? undefined : (localLikes > 0 ? localLikes : undefined)}
          onPress={handleLike}
          disabled={!viewerId}
          activeColor={colors.like}
          accessibilityLabel={localLiked ? 'Unlike post' : 'Like post'}
          accessibilityHint={localLiked ? 'Remove like from post' : 'Like this post'}
        />

        <ActionButton
          icon={<Icon name="message-circle" size="sm" color={colors.text.secondary} />}
          count={post.commentsCount > 0 ? post.commentsCount : undefined}
          onPress={() => router.push(`/(screens)/post/${post.id}`)}
          hapticType="light"
          accessibilityLabel="Comment on post"
          accessibilityHint="View or add comments"
        />

        <ActionButton
          icon={<Icon name="share" size="sm" color={colors.text.secondary} />}
          count={post.sharesCount > 0 ? post.sharesCount : undefined}
          onPress={handleShare}
          hapticType="light"
          accessibilityLabel="Share post"
          accessibilityHint="Share this post with others"
        />

        <View style={styles.spacer} />

        <ActionButton
          icon={<Icon name="bookmark" size="sm" color={localSaved ? colors.bookmark : colors.text.tertiary} />}
          activeIcon={<Icon name="bookmark-filled" size="sm" color={colors.bookmark} fill={colors.bookmark} />}
          isActive={localSaved}
          onPress={() => saveMutation.mutate()}
          disabled={!viewerId}
          activeColor={colors.bookmark}
          accessibilityLabel={localSaved ? 'Remove bookmark' : 'Bookmark post'}
          accessibilityHint={localSaved ? 'Remove from saved items' : 'Save this post for later'}
        />
      </View>

      {/* More menu */}
      <BottomSheet visible={showMenu} onClose={() => setShowMenu(false)}>
        {isOwn ? (
          <>
            <BottomSheetItem
              label="Copy Link"
              icon={<Icon name="link" size="sm" color={colors.text.primary} />}
              onPress={handleCopyLink}
            />
            <BottomSheetItem
              label="Share as Story"
              icon={<Icon name="layers" size="sm" color={colors.text.primary} />}
              onPress={() => shareAsStoryMutation.mutate()}
            />
            <BottomSheetItem
              label="Not interested"
              icon={<Icon name="eye-off" size="sm" color={colors.text.primary} />}
              onPress={() => dismissMutation.mutate()}
            />
            <BottomSheetItem
              label="Delete post"
              icon={<Icon name="trash" size="sm" color={colors.error} />}
              onPress={handleDelete}
              destructive
            />
          </>
        ) : (
          <>
            <BottomSheetItem
              label="Not interested"
              icon={<Icon name="eye-off" size="sm" color={colors.text.primary} />}
              onPress={() => dismissMutation.mutate()}
            />
            <BottomSheetItem
              label="Copy Link"
              icon={<Icon name="link" size="sm" color={colors.text.primary} />}
              onPress={handleCopyLink}
            />
            <BottomSheetItem
              label="Share as Story"
              icon={<Icon name="layers" size="sm" color={colors.text.primary} />}
              onPress={() => shareAsStoryMutation.mutate()}
            />
            <BottomSheetItem
              label="Report"
              icon={<Icon name="flag" size="sm" color={colors.error} />}
              onPress={handleReport}
              destructive
            />
          </>
        )}
      </BottomSheet>
    </View>
  );
});

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.dark.bgCard,
    marginBottom: spacing.sm,
    borderRadius: radius.md,
    marginHorizontal: spacing.xs,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.base,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  userInfo: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flex: 1 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  name: { color: colors.text.primary, fontWeight: '700', fontSize: fontSize.base },
  handle: { color: colors.text.secondary, fontSize: fontSize.xs, marginTop: 1 },
  moreBtn: { padding: spacing.sm },
  content: {
    color: colors.text.primary,
    fontSize: fontSize.base,
    lineHeight: 22,
    paddingHorizontal: spacing.base,
    paddingBottom: spacing.sm,
  },
  overlayHeart: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    gap: spacing.xl,
  },
  spacer: { flex: 1 },
  sensitiveOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.glass.dark,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    gap: spacing.sm,
  },
  sensitiveText: {
    color: colors.text.primary,
    fontSize: fontSize.base,
    fontWeight: '600',
  },
  sensitiveSubtext: {
    color: colors.text.secondary,
    fontSize: fontSize.sm,
    textAlign: 'center',
    paddingHorizontal: spacing.xl,
  },
  sensitiveRevealBtn: {
    marginTop: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xs,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.text.secondary,
  },
  sensitiveRevealText: {
    color: colors.text.primary,
    fontSize: fontSize.sm,
    fontWeight: '600',
  },
});
