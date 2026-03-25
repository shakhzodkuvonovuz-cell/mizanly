import { useState, useCallback, useEffect, useRef, useMemo, memo } from 'react';
import { View, Text, StyleSheet, Alert, Share, Pressable } from 'react-native';
import { showToast } from '@/components/ui/Toast';
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
import { navigate } from '@/utils/navigation';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { formatDistanceToNowStrict } from 'date-fns';
import { getDateFnsLocale } from '@/utils/localeFormat';
import { Avatar } from '@/components/ui/Avatar';
import { RichText } from '@/components/ui/RichText';
import { Icon } from '@/components/ui/Icon';
import { VerifiedBadge } from '@/components/ui/VerifiedBadge';
import { ActionButton } from '@/components/ui/ActionButton';
import { BottomSheet, BottomSheetItem } from '@/components/ui/BottomSheet';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useContextualHaptic } from '@/hooks/useContextualHaptic';
import { useAnimatedIcon } from '@/hooks/useAnimatedIcon';
import { useTranslation } from '@/hooks/useTranslation';
import { PostMedia } from './PostMedia';
import { LinkPreview } from '@/components/ui/LinkPreview';
import { ReactionPicker } from '@/components/ui/ReactionPicker';
import { FloatingHearts } from '@/components/ui/FloatingHearts';
import { SocialProof } from '@/components/ui/SocialProof';
import { colors, spacing, fontSize, animation, radius, lineHeight, letterSpacing } from '@/theme';
import { useThemeColors } from '@/hooks/useThemeColors';
import { aiApi } from '@/services/api';
import { postsApi, feedApi } from '@/services/api';
import * as Clipboard from 'expo-clipboard';
import type { Post } from '@/types';

interface Props {
  post: Post;
  viewerId?: string;
  isOwn?: boolean;
  isFrequentCreator?: boolean;
  onLongPress?: () => void;
}

export const PostCard = memo(function PostCard({ post, viewerId, isOwn, isFrequentCreator, onLongPress }: Props) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const haptic = useContextualHaptic();
  const tc = useThemeColors();
  const [localLiked, setLocalLiked] = useState(post.userReaction === 'LIKE');
  const [localLikes, setLocalLikes] = useState(post.likesCount);
  const [localSaved, setLocalSaved] = useState(post.isSaved ?? false);
  const [showMenu, setShowMenu] = useState(false);
  const [captionExpanded, setCaptionExpanded] = useState(false);
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

  // Icon animations for like (bounce) and bookmark (pulse)
  const heartAnim = useAnimatedIcon('bounce');
  const bookmarkAnim = useAnimatedIcon('pulse');

  // Double-tap overlay heart
  const overlayHeartScale = useSharedValue(0);
  const overlayHeartOpacity = useSharedValue(0);
  const likeCountScale = useSharedValue(1);
  const likeCountAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scale: likeCountScale.value }],
  }));

  const reactInFlight = useRef(false);
  const reactMutation = useMutation({
    mutationFn: () =>
      localLiked ? postsApi.unreact(post.id) : postsApi.react(post.id, 'LIKE'),
    onMutate: () => {
      const prev = { liked: localLiked, likes: localLikes };
      setLocalLiked((p) => !p);
      setLocalLikes((p) => localLiked ? p - 1 : p + 1);
      // Animate like count bump
      likeCountScale.value = withSpring(1.2, { damping: 8, stiffness: 300 });
      setTimeout(() => { likeCountScale.value = withSpring(1, { damping: 10, stiffness: 200 }); }, 150);
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

  const handleSave = useCallback(() => {
    if (!localSaved) {
      bookmarkAnim.trigger();
    }
    saveMutation.mutate();
  }, [localSaved, bookmarkAnim, saveMutation]);

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
      showToast({ message: tr('saf.couldNotShareAsStory'), variant: 'error' });
    },
  });

  const getShareLinkMutation = useMutation({
    mutationFn: () => postsApi.getShareLink(post.id),
    onSuccess: (data) => {
      Clipboard.setStringAsync(data.url);
      haptic.save();
    },
    onError: () => {
      Clipboard.setStringAsync(`mizanly://post/${post.id}`);
      haptic.save();
    },
  });

  const dismissMutation = useMutation({
    mutationFn: () => feedApi.dismiss('post', post.id),
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
      heartAnim.trigger();
    }
    reactMutation.mutate();
  }, [localLiked, triggerHeartAnimation, heartAnim, reactMutation]);

  // Double-tap to like handler (Instagram-style: only likes, never unlikes)
  const handleDoubleTapLike = useCallback(() => {
    if (!localLiked && !reactInFlight.current) {
      reactInFlight.current = true;
      reactMutation.mutate();
      triggerHeartAnimation();
      haptic.like();
    } else if (localLiked) {
      // Already liked — just show heart animation without API call (Instagram behavior)
      triggerHeartAnimation();
      haptic.like();
    }
  }, [localLiked, reactMutation, triggerHeartAnimation, haptic]);

  // Gesture: double-tap on image area to like
  const doubleTapGesture = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd(() => {
      'worklet';
      runOnJS(handleDoubleTapLike)();
    });

  const overlayHeartStyle = useAnimatedStyle(() => ({
    transform: [{ scale: overlayHeartScale.value }],
    opacity: overlayHeartOpacity.value,
  }));

  const timeAgo = useMemo(() => formatDistanceToNowStrict(new Date(post.createdAt), { addSuffix: true, locale: getDateFnsLocale() }), [post.createdAt]);

  // Show "Edited" label — prefer editedAt field (set by update endpoint), fall back to updatedAt heuristic
  const isEdited = useMemo(() => {
    if ((post as Record<string, unknown>).editedAt) return true;
    if (!post.updatedAt || !post.createdAt) return false;
    return new Date(post.updatedAt).getTime() - new Date(post.createdAt).getTime() > 60_000;
  }, [post.updatedAt, post.createdAt]);

  // Derive likers for SocialProof: use recentLikers from API, fallback to post author
  const likers = useMemo(() => {
    if (post.recentLikers?.length) return post.recentLikers;
    if (post.user) {
      return [{ avatarUrl: post.user.avatarUrl ?? null, name: post.user.displayName ?? post.user.username, username: post.user.username }];
    }
    return [];
  }, [post.recentLikers, post.user]);

  const handleLongPress = useCallback(() => {
    if (onLongPress) {
      haptic.longPress();
      onLongPress();
    }
  }, [onLongPress, haptic]);

  if (dismissed) return null;

  return (
    <Pressable onLongPress={handleLongPress} delayLongPress={400} disabled={!onLongPress}>
    <Animated.View style={[styles.card, { backgroundColor: tc.bgCard, borderColor: tc.borderLight }]}>
      {/* Repost attribution */}
      {post.sharedPost && (
        <Pressable
          style={styles.repostAttribution}
          onPress={() => router.push(`/(screens)/profile/${post.sharedPost!.user.username}`)}
          accessibilityLabel={tr('saf.repostedBy', { username: post.sharedPost.user.username })}
          accessibilityRole="button"
        >
          <Icon name="repeat" size={12} color={colors.text.tertiary} />
          <Text style={styles.repostText}>
            {tr('saf.repostedBy', { username: post.sharedPost.user.username })}
          </Text>
        </Pressable>
      )}

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
                <View style={{ marginStart: 4, flexDirection: 'row', alignItems: 'center', gap: 2 }}>
                  <Icon name="heart-filled" size={12} color={colors.gold} />
                </View>
              )}
              {(post.collaborators?.length ?? 0) > 0 && (
                <View style={{ marginStart: 4 }}>
                  <Icon name="users" size="sm" color={colors.text.secondary} />
                </View>
              )}
            </View>
            <Text style={styles.handle}>
              @{post.user.username} · {timeAgo}
              {isEdited && <Text style={styles.editedLabel}> · {tr('common.edited')}</Text>}
              {post.isPromoted && <Text style={styles.sponsoredLabel}> · {tr('saf.sponsored')}</Text>}
            </Text>
          </View>
        </Pressable>
        <Pressable
          style={styles.moreBtn}
          hitSlop={8}
          onPress={() => { haptic.navigate(); setShowMenu(true); }}
          accessibilityLabel={tr('accessibility.moreOptions')}
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
            numberOfLines={captionExpanded ? undefined : 5}
            onPostPress={() => router.push(`/(screens)/post/${post.id}`)}
          />
          {/* Show more / less toggle for long captions */}
          {post.content.length > 200 && (
            <Pressable onPress={() => setCaptionExpanded(prev => !prev)} hitSlop={8}>
              <Text style={{ color: tc.text.secondary, fontSize: fontSize.sm, marginTop: 2 }}>
                {captionExpanded ? tr('common.showLess', 'Show less') : tr('common.showMore', '...more')}
              </Text>
            </Pressable>
          )}
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

      {/* Link preview — show when post has a URL but no media */}
      {post.content && post.mediaUrls.length === 0 && (() => {
        const urlMatch = post.content.match(/https?:\/\/[^\s]+/);
        return urlMatch ? <LinkPreview url={urlMatch[0]} /> : null;
      })()}

      {/* Media with double-tap to like */}
      {post.mediaUrls.length > 0 && (
        <View style={[styles.mediaContainer, { backgroundColor: tc.bg }]}>
          <GestureDetector gesture={doubleTapGesture}>
            <Animated.View
              accessible
              accessibilityLabel={tr('accessibility.doubleTapLike')}
              accessibilityRole="image"
              accessibilityHint="Double tap to like this post"
            >
              <PostMedia
                mediaUrls={post.mediaUrls}
                mediaTypes={post.mediaTypes}
                thumbnailUrl={post.thumbnailUrl}
                aspectRatio={post.mediaWidth && post.mediaHeight ? post.mediaWidth / post.mediaHeight : undefined}
                blurred={post.isSensitive && !revealed}
                blurhash={post.blurhash}
                altText={post.altText}
              />
              {/* Overlay heart for double-tap */}
              <Animated.View style={[styles.overlayHeart, overlayHeartStyle]} pointerEvents="none">
                <View style={styles.heartGlow}>
                  <Icon name="heart-filled" size={100} color={colors.like} fill={colors.like} strokeWidth={0} />
                </View>
              </Animated.View>
              {/* Floating hearts effect */}
              <FloatingHearts trigger={heartTrigger} />
            </Animated.View>
          </GestureDetector>
          {post.isSensitive && !revealed && (
            <View style={styles.sensitiveOverlay}>
              <Icon name="eye-off" size="lg" color={colors.text.secondary} />
              <Text style={styles.sensitiveText}>Sensitive content</Text>
              <Text style={styles.sensitiveSubtext}>This post may contain sensitive material</Text>
              <Pressable
                style={styles.sensitiveRevealBtn}
                onPress={() => setRevealed(true)}
                accessibilityLabel={tr('accessibility.showSensitive')}
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
          icon={<Animated.View style={heartAnim.animatedStyle}><Icon name="heart" size="sm" color={colors.text.secondary} /></Animated.View>}
          activeIcon={<Animated.View style={heartAnim.animatedStyle}><Icon name="heart-filled" size="sm" color={colors.like} fill={colors.like} /></Animated.View>}
          isActive={localLiked}
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
          hapticType="tick"
          accessibilityLabel={tr('accessibility.commentOnPost')}
          accessibilityHint="View or add comments"
        />

        <ActionButton
          icon={<Icon name="share" size="sm" color={colors.text.secondary} />}
          count={post.sharesCount > 0 ? post.sharesCount : undefined}
          onPress={handleShare}
          hapticType="tick"
          accessibilityLabel={tr('accessibility.sharePost')}
          accessibilityHint="Share this post with others"
        />

        <View style={styles.spacer} />

        <ActionButton
          icon={<Animated.View style={bookmarkAnim.animatedStyle}><Icon name="bookmark" size="sm" color={localSaved ? colors.bookmark : colors.text.tertiary} /></Animated.View>}
          activeIcon={<Animated.View style={bookmarkAnim.animatedStyle}><Icon name="bookmark-filled" size="sm" color={colors.bookmark} fill={colors.bookmark} /></Animated.View>}
          isActive={localSaved}
          onPress={handleSave}
          disabled={!viewerId}
          activeColor={colors.bookmark}
          accessibilityLabel={localSaved ? 'Remove bookmark' : 'Bookmark post'}
          accessibilityHint={localSaved ? 'Remove from saved items' : 'Save this post for later'}
        />
      </View>

      {/* Social proof — "Liked by [avatar] name and N others" — with scale animation on like */}
      {!post.hideLikesCount && localLikes > 0 && (
        <Animated.View style={likeCountAnimStyle}>
          <SocialProof
            users={likers}
            count={localLikes}
            onPress={() => router.push(`/(screens)/post/${post.id}`)}
            onUserPress={(username) => router.push(`/(screens)/profile/${username}`)}
          />
        </Animated.View>
      )}

      {/* More menu */}
      <BottomSheet visible={showMenu} onClose={() => setShowMenu(false)}>
        {isOwn ? (
          <>
            <BottomSheetItem
              label={tr('common.copyLink')}
              icon={<Icon name="link" size="sm" color={colors.text.primary} />}
              onPress={handleCopyLink}
            />
            <BottomSheetItem
              label={tr('common.shareAsStory')}
              icon={<Icon name="layers" size="sm" color={colors.text.primary} />}
              onPress={() => shareAsStoryMutation.mutate()}
            />
            <BottomSheetItem
              label={tr('common.notInterested')}
              icon={<Icon name="eye-off" size="sm" color={colors.text.primary} />}
              onPress={() => dismissMutation.mutate()}
            />
            <BottomSheetItem
              label={tr('saf.crossPost')}
              icon={<Icon name="repeat" size="sm" color={colors.text.primary} />}
              onPress={() => { setShowMenu(false); navigate(`/(screens)/cross-post?postId=${post.id}`); }}
            />
            <BottomSheetItem
              label={tr('saf.boostPost')}
              icon={<Icon name="trending-up" size="sm" color={colors.gold} />}
              onPress={() => { setShowMenu(false); navigate(`/(screens)/boost-post?postId=${post.id}`); }}
            />
            <BottomSheetItem
              label={tr('saf.postInsights')}
              icon={<Icon name="bar-chart-2" size="sm" color={colors.text.primary} />}
              onPress={() => { setShowMenu(false); navigate(`/(screens)/post-insights?postId=${post.id}`); }}
            />
            <BottomSheetItem
              label={tr('common.delete')}
              icon={<Icon name="trash" size="sm" color={colors.error} />}
              onPress={handleDelete}
              destructive
            />
          </>
        ) : (
          <>
            {/* Reaction picker at top of long-press menu */}
            <View style={{ paddingHorizontal: spacing.base, paddingVertical: spacing.sm }}>
              <ReactionPicker
                onReact={(type) => {
                  setShowMenu(false);
                  // Use the existing react mutation for like/unlike
                  if (!reactInFlight.current) {
                    reactInFlight.current = true;
                    reactMutation.mutate();
                  }
                }}
                userReaction={localLiked ? 'LIKE' : undefined}
                compact
              />
            </View>
            <BottomSheetItem
              label={tr('common.notInterested')}
              icon={<Icon name="eye-off" size="sm" color={colors.text.primary} />}
              onPress={() => dismissMutation.mutate()}
            />
            <BottomSheetItem
              label={tr('common.copyLink')}
              icon={<Icon name="link" size="sm" color={colors.text.primary} />}
              onPress={handleCopyLink}
            />
            <BottomSheetItem
              label={tr('common.shareAsStory')}
              icon={<Icon name="layers" size="sm" color={colors.text.primary} />}
              onPress={() => shareAsStoryMutation.mutate()}
            />
            <BottomSheetItem
              label={tr('saf.whyShowing')}
              icon={<Icon name="eye" size="sm" color={colors.text.primary} />}
              onPress={() => { setShowMenu(false); navigate(`/(screens)/why-showing?postId=${post.id}`); }}
            />
            <BottomSheetItem
              label={tr('common.report')}
              icon={<Icon name="flag" size="sm" color={colors.error} />}
              onPress={handleReport}
              destructive
            />
          </>
        )}
      </BottomSheet>
    </Animated.View>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  repostAttribution: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.base,
    paddingTop: spacing.sm,
  },
  repostText: {
    color: colors.text.tertiary,
    fontSize: fontSize.xs,
    fontWeight: '500',
  },
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
  name: { color: colors.text.primary, fontWeight: '700', fontSize: fontSize.base, lineHeight: lineHeight.base },
  handle: { color: colors.text.secondary, fontSize: fontSize.xs, lineHeight: lineHeight.xs, marginTop: 1 },
  editedLabel: { color: colors.text.tertiary, fontSize: fontSize.xs, fontStyle: 'italic' },
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
    lineHeight: lineHeight.xs,
    fontWeight: '500',
  },
  mediaContainer: {
    backgroundColor: colors.dark.bg, // Black background for pillarboxing if needed
    width: '100%',
  },
  overlayHeart: {
    position: 'absolute',
    top: 0, start: 0, end: 0, bottom: 0,
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
    lineHeight: lineHeight.base,
    fontWeight: '600',
  },
  sensitiveSubtext: {
    color: colors.text.secondary,
    fontSize: fontSize.sm,
    lineHeight: lineHeight.sm,
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
