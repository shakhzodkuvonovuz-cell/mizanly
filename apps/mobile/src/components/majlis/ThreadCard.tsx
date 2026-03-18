import { useState, useEffect, memo } from 'react';
import { View, Text, StyleSheet, Alert, Share , Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { formatDistanceToNowStrict } from 'date-fns';
import { Image } from 'expo-image';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  FadeInUp,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { Avatar } from '@/components/ui/Avatar';
import { RichText } from '@/components/ui/RichText';
import { Icon } from '@/components/ui/Icon';
import { VerifiedBadge } from '@/components/ui/VerifiedBadge';
import { ActionButton } from '@/components/ui/ActionButton';
import { BottomSheet, BottomSheetItem } from '@/components/ui/BottomSheet';
import { useHaptic } from '@/hooks/useHaptic';
import { colors, spacing, fontSize, animation, radius } from '@/theme';
import { threadsApi } from '@/services/api';
import * as Clipboard from 'expo-clipboard';
import type { Thread } from '@/types';

interface Props {
  thread: Thread;
  viewerId?: string;
  isOwn?: boolean;
}

export const ThreadCard = memo(function ThreadCard({ thread, viewerId, isOwn }: Props) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const haptic = useHaptic();
  const [localLiked, setLocalLiked] = useState(thread.userReaction === 'LIKE');
  const [localLikes, setLocalLikes] = useState(thread.likesCount);
  const [localBookmarked, setLocalBookmarked] = useState(thread.isBookmarked ?? false);
  const [localReposts, setLocalReposts] = useState(thread.repostsCount);
  const [localReposted, setLocalReposted] = useState(thread.isReposted ?? false);
  const [localPoll, setLocalPoll] = useState(thread.poll ?? null);
  const [showMenu, setShowMenu] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  // Sync local state when server data changes
  useEffect(() => {
    setLocalLiked(thread.userReaction === 'LIKE');
    setLocalLikes(thread.likesCount);
    setLocalBookmarked(thread.isBookmarked ?? false);
    setLocalReposted(thread.isReposted ?? false);
    setLocalReposts(thread.repostsCount);
  }, [thread.id, thread.userReaction, thread.likesCount, thread.isBookmarked, thread.isReposted, thread.repostsCount]);

  const likeMutation = useMutation({
    mutationFn: () => localLiked ? threadsApi.unlike(thread.id) : threadsApi.like(thread.id),
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
  });

  const bookmarkMutation = useMutation({
    mutationFn: () =>
      localBookmarked ? threadsApi.unbookmark(thread.id) : threadsApi.bookmark(thread.id),
    onMutate: () => {
      const prev = localBookmarked;
      setLocalBookmarked((p) => !p);
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx) setLocalBookmarked(ctx.prev);
    },
  });

  const repostMutation = useMutation({
    mutationFn: () =>
      localReposted ? threadsApi.unrepost(thread.id) : threadsApi.repost(thread.id),
    onMutate: () => {
      const prev = { reposted: localReposted, reposts: localReposts };
      setLocalReposted((p) => !p);
      setLocalReposts((p) => localReposted ? p - 1 : p + 1);
      return prev;
    },
    onError: (_e, _v, ctx) => {
      if (ctx) {
        setLocalReposted(ctx.reposted);
        setLocalReposts(ctx.reposts);
      }
    },
  });

  const votePollMutation = useMutation({
    mutationFn: (optionId: string) => threadsApi.votePoll(optionId),
    onMutate: (optionId: string) => {
      setLocalPoll((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          userVoteId: optionId,
          totalVotes: prev.userVoteId ? prev.totalVotes : prev.totalVotes + 1,
          options: prev.options.map((o) => ({
            ...o,
            votesCount:
              o.id === optionId ? o.votesCount + 1
              : o.id === prev.userVoteId ? o.votesCount - 1
              : o.votesCount,
          })),
        };
      });
    },
    onError: () => setLocalPoll(thread.poll ?? null),
  });

  const handleShare = () => {
    Share.share({
      message: `mizanly.app/thread/${thread.id}`,
    });
  };

  const deleteMutation = useMutation({
    mutationFn: () => threadsApi.delete(thread.id),
    onSuccess: () => {
      setShowMenu(false);
      queryClient.invalidateQueries({ queryKey: ['majlis-feed'] });
    },
  });

  const dismissMutation = useMutation({
    mutationFn: () => threadsApi.dismiss(thread.id),
    onSuccess: () => { setShowMenu(false); setDismissed(true); },
  });

  const handleDelete = () => {
    setShowMenu(false);
    Alert.alert('Delete thread?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deleteMutation.mutate() },
    ]);
  };

  const handleReport = () => {
    setShowMenu(false);
    Alert.alert('Report thread', 'Why are you reporting this?', [
      { text: 'Spam', onPress: () => threadsApi.report(thread.id, 'SPAM').catch(() => {}) },
      { text: 'Inappropriate', onPress: () => threadsApi.report(thread.id, 'INAPPROPRIATE').catch(() => {}) },
      { text: 'Misinformation', onPress: () => threadsApi.report(thread.id, 'MISINFORMATION').catch(() => {}) },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const handleCopyLink = async () => {
    setShowMenu(false);
    haptic.light();
    await Clipboard.setStringAsync(`https://mizanly.app/thread/${thread.id}`);
    // Optionally show a toast? Not needed.
  };

  const timeAgo = formatDistanceToNowStrict(new Date(thread.createdAt), { addSuffix: true });

  if (dismissed) return null;

  return (
    <Animated.View entering={FadeInUp.duration(400).springify()}>
    <Pressable
      style={styles.card}
      onPress={() => router.push(`/(screens)/thread/${thread.id}`)}
     
    >
      {/* Repost header */}
      {thread.repostOf && (
        <View style={styles.repostHeader}>
          <Icon name="repeat" size="xs" color={colors.text.tertiary} />
          <Text style={styles.repostHeaderText}>Reposted</Text>
        </View>
      )}

      <View style={styles.cardInner}>
        {/* Avatar column */}
        <View style={styles.left}>
          <Pressable
            onPress={() => router.push(`/(screens)/profile/${thread.user.username}`)}
           
            accessibilityLabel={`View ${thread.user.displayName}'s profile`}
            accessibilityRole="button"
            accessibilityHint="Open user profile"
          >
            <Avatar uri={thread.user.avatarUrl} name={thread.user.displayName} size="md" />
          </Pressable>
          {thread.repliesCount > 0 && (
            <LinearGradient
              colors={[colors.emerald, 'transparent']}
              style={styles.replyLine}
            />
          )}
        </View>

        {/* Content column */}
        <View style={styles.right}>
          {/* User + time */}
          <View style={styles.topRow}>
            <Pressable
              style={styles.userInfo}
              onPress={() => router.push(`/(screens)/profile/${thread.user.username}`)}
             
              accessibilityLabel={`View ${thread.user.displayName}'s profile`}
              accessibilityRole="button"
              accessibilityHint="Open user profile"
            >
              <Text style={styles.name}>{thread.user.displayName}</Text>
              {thread.user.isVerified && <VerifiedBadge size={13} />}
              <Text style={styles.handle}>@{thread.user.username}</Text>
              {thread.replyPermission && thread.replyPermission !== 'everyone' && (
                <Icon name="lock" size="xs" color={colors.text.tertiary} />
              )}
            </Pressable>
            <Text style={styles.time}>{timeAgo}</Text>
            <Pressable
              hitSlop={8}
              onPress={() => { haptic.light(); setShowMenu(true); }}
              accessibilityLabel="More options"
              accessibilityRole="button"
              accessibilityHint="Open thread options menu"
            >
              <Icon name="more-horizontal" size="xs" color={colors.text.tertiary} />
            </Pressable>
          </View>

          {/* Content */}
          <RichText
            text={thread.content ?? ''}
            style={styles.content}
            onPostPress={() => router.push(`/(screens)/thread/${thread.id}`)}
          />

          {/* Media */}
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

          {/* Poll */}
          {localPoll && (
            <View style={styles.pollWrap}>
              <Text style={styles.pollQuestion}>{localPoll.question}</Text>
              {localPoll.options.map((opt) => {
                const voted = !!localPoll.userVoteId;
                const pct = localPoll.totalVotes > 0
                  ? Math.round((opt.votesCount / localPoll.totalVotes) * 100) : 0;
                const isSelected = localPoll.userVoteId === opt.id;
                if (voted) {
                  return (
                    <PollResultBar
                      key={opt.id}
                      text={opt.text}
                      pct={pct}
                      isSelected={isSelected}
                    />
                  );
                }
                return (
                  <Pressable
                    key={opt.id}
                    style={styles.pollOptionBtn}
                    onPress={() => {
                      if (viewerId) {
                        haptic.medium();
                        votePollMutation.mutate(opt.id);
                      }
                    }}
                    disabled={!viewerId || votePollMutation.isPending}
                   
                    accessibilityLabel={`Vote for ${opt.text}`}
                    accessibilityRole="button"
                    accessibilityHint="Select this poll option"
                  >
                    <Text style={styles.pollOptionText}>{opt.text}</Text>
                  </Pressable>
                );
              })}
              <Text style={styles.pollMeta}>
                {localPoll.totalVotes} vote{localPoll.totalVotes !== 1 ? 's' : ''}
                {localPoll.endsAt
                  ? ` · ends ${formatDistanceToNowStrict(new Date(localPoll.endsAt), { addSuffix: true })}`
                  : ''}
              </Text>
            </View>
          )}

          {/* Actions */}
          <View style={styles.actions}>
            <ActionButton
              icon={<Icon name="message-circle" size="xs" color={colors.text.secondary} />}
              count={thread.repliesCount > 0 ? thread.repliesCount : undefined}
              onPress={() => router.push(`/(screens)/thread/${thread.id}`)}
              hapticType="light"
              accessibilityLabel="Reply to thread"
              accessibilityHint="Reply to this thread"
            />

            <ActionButton
              icon={<Icon name="repeat" size="xs" color={localReposted ? colors.emerald : colors.text.secondary} />}
              count={localReposts > 0 ? localReposts : undefined}
              isActive={localReposted}
              onPress={() => viewerId && repostMutation.mutate()}
              disabled={!viewerId}
              activeColor={colors.emerald}
              accessibilityLabel={localReposted ? 'Undo repost' : 'Repost'}
              accessibilityHint={localReposted ? 'Remove repost' : 'Repost this thread'}
            />

            <ActionButton
              icon={<Icon name="heart" size="xs" color={colors.text.secondary} />}
              activeIcon={<Icon name="heart-filled" size="xs" color={colors.like} fill={colors.like} />}
              isActive={localLiked}
              count={!thread.hideLikesCount && localLikes > 0 ? localLikes : undefined}
              onPress={() => likeMutation.mutate()}
              disabled={!viewerId}
              activeColor={colors.like}
              accessibilityLabel={localLiked ? 'Unlike thread' : 'Like thread'}
              accessibilityHint={localLiked ? 'Remove like' : 'Like this thread'}
            />

            <View style={styles.spacer} />

            <ActionButton
              icon={<Icon name="share" size="xs" color={colors.text.secondary} />}
              onPress={handleShare}
              hapticType="light"
              accessibilityLabel="Share thread"
              accessibilityHint="Share this thread with others"
            />

            <ActionButton
              icon={<Icon name="bookmark" size="xs" color={localBookmarked ? colors.bookmark : colors.text.tertiary} />}
              activeIcon={<Icon name="bookmark-filled" size="xs" color={colors.bookmark} fill={colors.bookmark} />}
              isActive={localBookmarked}
              onPress={() => bookmarkMutation.mutate()}
              disabled={!viewerId}
              activeColor={colors.bookmark}
              accessibilityLabel={localBookmarked ? 'Remove bookmark' : 'Bookmark thread'}
              accessibilityHint={localBookmarked ? 'Remove from bookmarks' : 'Bookmark this thread'}
            />
          </View>

        </View>
      </View>

      {/* More menu */}
      <BottomSheet visible={showMenu} onClose={() => setShowMenu(false)}>
        <BottomSheetItem
          label="Share"
          icon={<Icon name="share" size="sm" color={colors.text.primary} />}
          onPress={() => { setShowMenu(false); handleShare(); }}
        />
        <BottomSheetItem
          label="Copy Link"
          icon={<Icon name="link" size="sm" color={colors.text.primary} />}
          onPress={handleCopyLink}
        />
        <BottomSheetItem
          label={localBookmarked ? 'Unbookmark' : 'Bookmark'}
          icon={<Icon name={localBookmarked ? 'bookmark-filled' : 'bookmark'} size="sm" color={colors.text.primary} />}
          onPress={() => { setShowMenu(false); bookmarkMutation.mutate(); }}
        />
        {isOwn ? (
          <BottomSheetItem
            label="Delete thread"
            icon={<Icon name="trash" size="sm" color={colors.error} />}
            onPress={handleDelete}
            destructive
          />
        ) : (
          <>
            <BottomSheetItem
              label="Not interested"
              icon={<Icon name="eye-off" size="sm" color={colors.text.primary} />}
              onPress={() => dismissMutation.mutate()}
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
    </Pressable>
    </Animated.View>
  );
});

function PollResultBar({ text, pct, isSelected }: { text: string; pct: number; isSelected: boolean }) {
  const width = useSharedValue(0);

  // Animate the bar width on mount
  useEffect(() => {
    const timer = setTimeout(() => {
      width.value = withSpring(pct, animation.spring.gentle);
    }, 100);
    return () => clearTimeout(timer);
  }, [pct]);

  const barStyle = useAnimatedStyle(() => ({
    width: `${width.value}%`,
  }));

  return (
    <View style={styles.pollResultRow}>
      <Animated.View style={[styles.pollBar, barStyle]} />
      <View style={styles.pollResultContent}>
        <Text style={[styles.pollOptionText, isSelected && styles.pollOptionSelected]}>
          {text}
        </Text>
        <View style={styles.pollPctRow}>
          <Text style={[styles.pollPct, isSelected && styles.pollOptionSelected]}>
            {pct}%
          </Text>
          {isSelected && <Icon name="check" size={12} color={colors.emerald} />}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderBottomWidth: 0.5,
    borderBottomColor: colors.dark.border,
  },
  repostHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingLeft: spacing.base + spacing.md + 40,
    paddingTop: spacing.sm,
  },
  repostHeaderText: {
    color: colors.text.tertiary,
    fontSize: fontSize.xs,
    fontWeight: '500',
  },
  cardInner: {
    flexDirection: 'row',
    paddingHorizontal: spacing.base,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  left: { alignItems: 'center', marginRight: spacing.md, paddingTop: 2 },
  replyLine: {
    width: 2,
    flex: 1,
    marginTop: spacing.sm,
    borderRadius: 1,
  },
  right: { flex: 1 },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.xs,
    gap: spacing.xs,
  },
  userInfo: { flexDirection: 'row', alignItems: 'center', gap: 4, flex: 1 },
  name: { color: colors.text.primary, fontWeight: '700', fontSize: fontSize.base, letterSpacing: -0.3 },
  handle: { color: colors.text.secondary, fontSize: fontSize.sm, letterSpacing: -0.1 },
  time: { color: colors.text.tertiary, fontSize: fontSize.sm },
  content: {
    color: colors.text.primary,
    fontSize: fontSize.base,
    lineHeight: 22,
    letterSpacing: -0.2, // Tighter tracking for denser reads
    marginBottom: spacing.sm,
  },
  media: { width: '100%', height: 220, borderRadius: radius.md, marginBottom: spacing.sm },
  repostOf: {
    borderWidth: 1,
    borderColor: colors.dark.borderLight,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    backgroundColor: 'rgba(255,255,255,0.02)',
  },
  repostOfHandle: { color: colors.text.secondary, fontSize: fontSize.xs, marginBottom: 4, fontWeight: '600' },
  repostOfContent: { color: colors.text.primary, fontSize: fontSize.sm },
  pollWrap: {
    borderWidth: 1,
    borderColor: colors.dark.border,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  pollQuestion: {
    color: colors.text.primary,
    fontSize: fontSize.sm,
    fontWeight: '600',
    marginBottom: spacing.sm,
  },
  pollOptionBtn: {
    borderWidth: 1,
    borderColor: colors.emerald,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginBottom: spacing.xs,
  },
  pollOptionText: { color: colors.text.primary, fontSize: fontSize.sm },
  pollOptionSelected: { color: colors.emerald, fontWeight: '600' },
  pollResultRow: {
    height: 36,
    borderRadius: radius.sm,
    overflow: 'hidden',
    backgroundColor: colors.dark.bgElevated,
    marginBottom: spacing.xs,
    justifyContent: 'center',
  },
  pollBar: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: colors.active.emerald20,
    borderRadius: radius.sm,
  },
  pollResultContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.sm,
  },
  pollPctRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  pollPct: { color: colors.text.secondary, fontSize: fontSize.xs },
  pollMeta: { color: colors.text.secondary, fontSize: fontSize.xs, marginTop: spacing.xs },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.xs,
    gap: spacing.xl,
    paddingBottom: spacing.sm,
  },
  spacer: { flex: 1 },
});
