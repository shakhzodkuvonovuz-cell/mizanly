import { useState, useCallback, useEffect, useRef, memo } from 'react';
import { View, Text, StyleSheet, Alert, Share, Pressable } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withSequence,
  withTiming,
  withDelay,
  runOnJS,
  FadeInUp,
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
import { useTranslation } from '@/hooks/useTranslation';
import { PostMedia } from './PostMedia';
import { FloatingHearts } from '@/components/ui/FloatingHearts';
import { colors, spacing, fontSize, animation, radius } from '@/theme';
import { aiApi } from '@/services/api';
import { postsApi, feedApi } from '@/services/api';
import * as Clipboard from 'expo-clipboard';
import type { Post } from '@/types';

interface Props {
  post: Post;
  viewerId?: string;
  isOwn?: boolean;
  isFrequentCreator?: boolean;
}

export const PostCard = memo(function PostCard({ post, viewerId, isOwn, isFrequentCreator }: Props) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const haptic = useHaptic();
  const [localLiked, setLocalLiked] = useState(post.userReaction === 'LIKE');
  const [localLikes, setLocalLikes] = useState(post.likesCount);
  const [localSaved, setLocalSaved] = useState(post.isSaved ?? false);
  const [showMenu, setShowMenu] = useState(false);
  const [translatedText, setTranslatedText] = useState<string | null>(null);
  const [isTranslating, setIsTranslating] = useState(false);
  const { t: tr } = useTranslation();

  // Sync local state when server data changes (e.g. after feed refetch or FlashList recycle)
  useEffect(() => {
    setLocalLiked(post.userReaction === 'LIKE');
    setLocalLikes(post.likesCount);
    setLocalSaved(post.isSaved ?? false);
  }, [post.id, post.userReaction, post.likesCount, post.isSaved]);
  const [dismissed, setDismissed] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [heartTrigger, setHeartTrigger] = useState(0);

  // Double-tap overlay heart
  const overlayHeartScale = useSharedValue(0);
  const overlayHeartOpacity = useSharedValue(0);

  const reactInFlight = useRef(false);
  const reactMutation = useMutation({
    mutationFn: () =>
      localLiked ? postsApi.unreact(post.id) : postsApi.react(post.id, 'LIKE'),
    onMutate: () => {
      const prev = { liked: localLiked, likes: localLikes };
      setLocalLiked((p) => !p);
      setLocalLikes((p) => localLiked ? p - 1 : p + 1);
      return prev;
    },
    onError: (_e, _v, ctx) => {
      if (ctx) {
        setLocalLiked(ctx.liked);
        setLocalLikes(ctx.likes);
      }
    },
    onSettled: () => { reactInFlight.current = false; },
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
    mutationFn: () => postsApi.shareAsStory(post.id),
    onSuccess: () => {
      setShowMenu(false);
      haptic.success();
    },
    onError: () => {
      Alert.alert(tr('common.error'), tr('saf.couldNotShareAsStory'));
    },
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
    Alert.alert(tr('saf.deletePostTitle'), tr('common.cannotBeUndone'), [
      { text: tr('common.cancel'), style: 'cancel' },
      { text: tr('common.delete'), style: 'destructive', onPress: () => deleteMutation.mutate() },
    ]);
  };

  const handleReport = () => {
    setShowMenu(false);
    Alert.alert(tr('saf.reportPostTitle'), tr('common.reportReason'), [
      { text: tr('common.spam'), onPress: () => postsApi.report(post.id, 'SPAM').catch(() => {}) },
      { text: tr('common.inappropriate'), onPress: () => postsApi.report(post.id, 'INAPPROPRIATE').catch(() => {}) },
      { text: tr('common.misinformation'), onPress: () => postsApi.report(post.id, 'MISINFORMATION').catch(() => {}) },
      { text: tr('common.cancel'), style: 'cancel' },
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
    // Burst animation
    overlayHeartScale.value = withSequence(
      withSpring(1.4, animation.spring.bouncy),
      withSpring(1.2, animation.spring.responsive),
      withDelay(200, withSpring(0, animation.spring.fluid))
    );
    overlayHeartOpacity.value = withSequence(
      withTiming(1, { duration: 100 }),
      withDelay(400, withTiming(0, { duration: 300 }))
    );
    // Trigger floating hearts effect
    setHeartTrigger((t) => t + 1);
  }, [overlayHeartScale, overlayHeartOpacity]);

  // Handle like button press
  const handleLike = useCallback(() => {
    if (reactInFlight.current) return;
    reactInFlight.current = true;
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
      if (!localLiked && !reactInFlight.current) {
        reactInFlight.current = true;
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
    <Animated.View entering={FadeInUp.duration(400).springify()} style={styles.card}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable
          style={styles.userInfo}
          onPress={() => router.push(`/(screens)/profile/${post.user.username}`)}
         
          accessibilityLabel={`View ${post.user.displayName}'s profile`}
          accessibilityRole="button"
          accessibilityHint="Open user profile"
        >
          <Avatar uri={post.user.avatarUrl} name={post.user.displayName} size="md" />
          <View>
            <View style={styles.nameRow}>
              <Text style={styles.name}>{post.user.displayName}</Text>
              {post.user.isVerified && <VerifiedBadge size={14} />}
              {isFrequentCreator && (
                <View style={{ marginLeft: 4, flexDirection: 'row', alignItems: 'center', gap: 2 }}>
                  <Icon name="heart-filled" size={12} color={colors.gold} />
                </View>
              )}
              {(post.collaborators?.length ?? 0) > 0 && (
                <View style={{ marginLeft: 4 }}>
                  <Icon name="users" size="sm" color={colors.text.secondary} />
                </View>
              )}
            </View>
            <Text style={styles.handle}>
              @{post.user.username} · {timeAgo}
              {post.isPromoted && <Text style={styles.sponsoredLabel}> · {tr('saf.sponsored')}</Text>}
            </Text>
          </View>
        </Pressable>
        <Pressable
          style={styles.moreBtn}
          hitSlop={8}
          onPress={() => { haptic.light(); setShowMenu(true); }}
          accessibilityLabel={t('accessibility.moreOptions')}
          accessibilityRole="button"
          accessibilityHint="Open post options menu"
        >
          <Icon name="more-horizontal" size="sm" color={colors.text.secondary} />
        </Pressable>
      </View>

      {/* Caption */}
      {post.content ? (
        <>
          <RichText
            text={translatedText || post.content}
            style={styles.content}
            numberOfLines={5}
            onPostPress={() => router.push(`/(screens)/post/${post.id}`)}
          />
          {/* Translate button */}
          {post.content.length > 10 && (
            <Pressable
              style={styles.translateBtn}
              onPress={async () => {
                if (translatedText) {
                  setTranslatedText(null);
                  return;
                }
                setIsTranslating(true);
                try {
                  const result = await aiApi.translate(post.content ?? '', 'en', post.id, 'post');
                  setTranslatedText(typeof result === 'string' ? result : ((result as { translatedText?: string })?.translatedText ?? (post.content ?? null)));
                } catch {
                  // Translation failed silently
                } finally {
                  setIsTranslating(false);
                }
              }}
            >
              <Icon name="globe" size="xs" color={colors.text.tertiary} />
              <Text style={styles.translateText}>
                {isTranslating ? tr('ai.translating') : translatedText ? tr('ai.showOriginal') : tr('ai.translate')}
              </Text>
            </Pressable>
          )}
        </>
      ) : null}

      {/* Media with double-tap to like */}
      {post.mediaUrls.length > 0 && (
        <View style={styles.mediaContainer}>
          <Pressable
            onPress={handleDoubleTap}
            accessibilityLabel={t('accessibility.doubleTapLike')}
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
              <View style={styles.heartGlow}>
                <Icon name="heart-filled" size={100} color={colors.like} fill={colors.like} strokeWidth={0} />
              </View>
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
                accessibilityLabel={t('accessibility.showSensitive')}
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
          accessibilityLabel={t('accessibility.commentOnPost')}
          accessibilityHint="View or add comments"
        />

        <ActionButton
          icon={<Icon name="share" size="sm" color={colors.text.secondary} />}
          count={post.sharesCount > 0 ? post.sharesCount : undefined}
          onPress={handleShare}
          hapticType="light"
          accessibilityLabel={t('accessibility.sharePost')}
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
              label={t('common.copyLink')}
              icon={<Icon name="link" size="sm" color={colors.text.primary} />}
              onPress={handleCopyLink}
            />
            <BottomSheetItem
              label={t('common.shareAsStory')}
              icon={<Icon name="layers" size="sm" color={colors.text.primary} />}
              onPress={() => shareAsStoryMutation.mutate()}
            />
            <BottomSheetItem
              label={t('common.notInterested')}
              icon={<Icon name="eye-off" size="sm" color={colors.text.primary} />}
              onPress={() => dismissMutation.mutate()}
            />
            <BottomSheetItem
              label={t('saf.crossPost')}
              icon={<Icon name="repeat" size="sm" color={colors.text.primary} />}
              onPress={() => { setShowMenu(false); router.push(`/(screens)/cross-post?postId=${post.id}` as never); }}
            />
            <BottomSheetItem
              label={t('saf.boostPost')}
              icon={<Icon name="trending-up" size="sm" color={colors.gold} />}
              onPress={() => { setShowMenu(false); router.push(`/(screens)/boost-post?postId=${post.id}` as never); }}
            />
            <BottomSheetItem
              label={t('saf.postInsights')}
              icon={<Icon name="bar-chart-2" size="sm" color={colors.text.primary} />}
              onPress={() => { setShowMenu(false); router.push(`/(screens)/post-insights?postId=${post.id}` as never); }}
            />
            <BottomSheetItem
              label={t('common.delete')}
              icon={<Icon name="trash" size="sm" color={colors.error} />}
              onPress={handleDelete}
              destructive
            />
          </>
        ) : (
          <>
            <BottomSheetItem
              label={t('common.notInterested')}
              icon={<Icon name="eye-off" size="sm" color={colors.text.primary} />}
              onPress={() => dismissMutation.mutate()}
            />
            <BottomSheetItem
              label={t('common.copyLink')}
              icon={<Icon name="link" size="sm" color={colors.text.primary} />}
              onPress={handleCopyLink}
            />
            <BottomSheetItem
              label={t('common.shareAsStory')}
              icon={<Icon name="layers" size="sm" color={colors.text.primary} />}
              onPress={() => shareAsStoryMutation.mutate()}
            />
            <BottomSheetItem
              label={t('saf.whyShowing')}
              icon={<Icon name="help-circle" size="sm" color={colors.text.primary} />}
              onPress={() => { setShowMenu(false); router.push(`/(screens)/why-showing?postId=${post.id}` as never); }}
            />
            <BottomSheetItem
              label={t('common.report')}
              icon={<Icon name="flag" size="sm" color={colors.error} />}
              onPress={handleReport}
              destructive
            />
          </>
        )}
      </BottomSheet>
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.dark.bgCard,
    marginBottom: spacing.md,
    borderRadius: radius.lg,
    marginHorizontal: 0, // Edge-to-edge
    borderTopWidth: 0.5,
    borderBottomWidth: 0.5,
    borderColor: colors.dark.borderLight,
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
  sponsoredLabel: { color: colors.text.tertiary, fontSize: fontSize.xs, fontWeight: '600' },
  moreBtn: { padding: spacing.sm },
  content: {
    color: colors.text.primary,
    fontSize: fontSize.base,
    lineHeight: 22,
    paddingHorizontal: spacing.base,
    paddingBottom: spacing.sm,
  },
  translateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.base,
    paddingBottom: spacing.sm,
  },
  translateText: {
    color: colors.text.tertiary,
    fontSize: fontSize.xs,
    fontWeight: '500',
  },
  mediaContainer: {
    backgroundColor: colors.dark.bg, // Black background for pillarboxing if needed
    width: '100%',
  },
  overlayHeart: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  heartGlow: {
    shadowColor: colors.error,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 20,
    elevation: 20,
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
    backgroundColor: 'rgba(13, 17, 23, 0.85)',
    alignItems: 'center',
    justifyContent: 'center',
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
