import { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal, Pressable, Alert, Share } from 'react-native';
import { useRouter } from 'expo-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { formatDistanceToNowStrict } from 'date-fns';
import { Image } from 'expo-image';
import { Avatar } from '@/components/ui/Avatar';
import { RichText } from '@/components/ui/RichText';
import { colors, spacing, fontSize } from '@/theme';
import { threadsApi } from '@/services/api';
import type { Thread } from '@/types';

interface Props {
  thread: Thread;
  viewerId?: string;
  isOwn?: boolean;
}

export function ThreadCard({ thread, viewerId, isOwn }: Props) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [localLiked, setLocalLiked] = useState(thread.userReaction === 'LIKE');
  const [localLikes, setLocalLikes] = useState(thread.likesCount);
  const [localBookmarked, setLocalBookmarked] = useState(thread.isBookmarked ?? false);
  const [localReposts, setLocalReposts] = useState(thread.repostsCount);
  const [localReposted, setLocalReposted] = useState(thread.isReposted ?? false);
  const [localPoll, setLocalPoll] = useState(thread.poll ?? null);
  const [showMenu, setShowMenu] = useState(false);
  const [dismissed, setDismissed] = useState(false);

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

  const repostMutation = useMutation({
    mutationFn: () =>
      localReposted ? threadsApi.unrepost(thread.id) : threadsApi.repost(thread.id),
    onMutate: () => {
      setLocalReposted((p) => !p);
      setLocalReposts((p) => localReposted ? p - 1 : p + 1);
    },
    onError: () => {
      setLocalReposted((p) => !p);
      setLocalReposts((p) => localReposted ? p + 1 : p - 1);
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
      message: `${thread.content ?? ''}\n\nmizanly://thread/${thread.id}`,
      url: `mizanly://thread/${thread.id}`,
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

  const timeAgo = formatDistanceToNowStrict(new Date(thread.createdAt), { addSuffix: true });

  if (dismissed) return null;

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
          <TouchableOpacity hitSlop={8} onPress={() => setShowMenu(true)}>
            <Text style={styles.more}>•••</Text>
          </TouchableOpacity>
        </View>

        {/* Content */}
        <RichText
          text={thread.content ?? ''}
          style={styles.content}
          onPostPress={() => router.push(`/(screens)/thread/${thread.id}`)}
        />

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
                  <View key={opt.id} style={styles.pollResultRow}>
                    <View style={[styles.pollBar, { width: `${pct}%` }]} />
                    <View style={styles.pollResultContent}>
                      <Text style={[styles.pollOptionText, isSelected && styles.pollOptionSelected]}>
                        {opt.text}
                      </Text>
                      <Text style={[styles.pollPct, isSelected && styles.pollOptionSelected]}>
                        {pct}%{isSelected ? ' ✓' : ''}
                      </Text>
                    </View>
                  </View>
                );
              }
              return (
                <TouchableOpacity
                  key={opt.id}
                  style={styles.pollOptionBtn}
                  onPress={() => viewerId && votePollMutation.mutate(opt.id)}
                  disabled={!viewerId || votePollMutation.isPending}
                  activeOpacity={0.7}
                >
                  <Text style={styles.pollOptionText}>{opt.text}</Text>
                </TouchableOpacity>
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
            onPress={() => viewerId && repostMutation.mutate()}
            activeOpacity={0.7}
            disabled={!viewerId}
          >
            <Text style={[styles.actionIcon, localReposted && styles.repostedIcon]}>🔄</Text>
            {localReposts > 0 && (
              <Text style={[styles.actionCount, localReposted && styles.repostedCount]}>
                {localReposts}
              </Text>
            )}
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

          <TouchableOpacity style={styles.action} onPress={handleShare} activeOpacity={0.7}>
            <Text style={styles.actionIcon}>↗️</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.action}
            onPress={() => bookmarkMutation.mutate()}
            activeOpacity={0.7}
            disabled={!viewerId}
          >
            <Text style={[styles.actionIcon, !localBookmarked && styles.actionIconDim]}>🔖</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* More menu */}
      <Modal visible={showMenu} transparent animationType="fade">
        <Pressable style={styles.menuOverlay} onPress={() => setShowMenu(false)}>
          <Pressable style={styles.menuSheet}>
            {isOwn ? (
              <TouchableOpacity style={styles.menuItem} onPress={handleDelete}>
                <Text style={styles.menuItemDestructive}>🗑️  Delete thread</Text>
              </TouchableOpacity>
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
  pollQuestion: { color: colors.text.primary, fontSize: fontSize.sm, fontWeight: '600', marginBottom: spacing.sm },
  pollOptionBtn: {
    borderWidth: 1, borderColor: colors.emerald, borderRadius: 8,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    marginBottom: spacing.xs,
  },
  pollOptionText: { color: colors.text.primary, fontSize: fontSize.sm },
  pollOptionSelected: { color: colors.emerald, fontWeight: '600' },
  pollResultRow: {
    height: 34, borderRadius: 8, overflow: 'hidden',
    backgroundColor: colors.dark.bgElevated,
    marginBottom: spacing.xs, justifyContent: 'center',
  },
  pollBar: { position: 'absolute', left: 0, top: 0, bottom: 0, backgroundColor: 'rgba(10,123,79,0.25)', borderRadius: 8 },
  pollResultContent: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: spacing.sm },
  pollPct: { color: colors.text.secondary, fontSize: fontSize.xs },
  pollMeta: { color: colors.text.secondary, fontSize: fontSize.xs, marginTop: spacing.xs },
  actions: { flexDirection: 'row', alignItems: 'center', marginTop: spacing.xs, gap: spacing.xl },
  action: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  actionIcon: { fontSize: 20 },
  likedIcon: {},
  repostedIcon: {},
  actionIconDim: { opacity: 0.4 },
  actionCount: { color: colors.text.secondary, fontSize: fontSize.sm },
  likedCount: { color: colors.like },
  repostedCount: { color: colors.emerald },
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
