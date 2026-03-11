import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Pressable,
  Dimensions, TextInput, Platform,
  KeyboardAvoidingView, Alert, FlatList, RefreshControl,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  cancelAnimation,
  runOnJS,
} from 'react-native-reanimated';
import type { SharedValue } from 'react-native-reanimated';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { Video, ResizeMode } from 'expo-av';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Avatar } from '@/components/ui/Avatar';
import { Icon } from '@/components/ui/Icon';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Skeleton } from '@/components/ui/Skeleton';
import { colors, spacing, fontSize, radius } from '@/theme';
import { storiesApi, messagesApi } from '@/services/api';
import type { StoryGroup } from '@/types';
import { formatDistanceToNowStrict } from 'date-fns';
import { useHaptic } from '@/hooks/useHaptic';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
const STORY_DURATION = 5000; // ms per story slide for images
const QUICK_REACTIONS = ['❤️', '🔥', '👏', '😂', '😍', '😢'];

function ProgressSegment({
  index,
  activeIndex,
  progress,
}: {
  index: number;
  activeIndex: number;
  progress: SharedValue<number>;
}) {
  const fillStyle = useAnimatedStyle(() => {
    const pct =
      index < activeIndex ? 100 : index === activeIndex ? progress.value * 100 : 0;
    return { width: `${pct}%` };
  });
  return (
    <View style={styles.progressTrack}>
      <Animated.View style={[styles.progressFill, fillStyle]} />
    </View>
  );
}

function ProgressBar({
  count,
  activeIndex,
  progress,
}: {
  count: number;
  activeIndex: number;
  progress: SharedValue<number>;
}) {
  return (
    <View style={styles.progressRow}>
      {Array.from({ length: count }).map((_, i) => (
        <ProgressSegment key={i} index={i} activeIndex={activeIndex} progress={progress} />
      ))}
    </View>
  );
}

export default function StoryViewerScreen() {
  const { groupJson, startIndex: startIndexParam, isOwn } = useLocalSearchParams<{
    groupJson: string;
    startIndex?: string;
    isOwn?: string;
  }>();

  const ownStory = isOwn === 'true';

  const router = useRouter();
  const queryClient = useQueryClient();

  let group: StoryGroup | null = null;
  try {
    group = groupJson ? JSON.parse(groupJson) : null;
  } catch {
    group = null;
  }

  const [storyIndex, setStoryIndex] = useState(Number(startIndexParam ?? 0));
  const progressValue = useSharedValue(0);
  const [paused, setPaused] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [showReply, setShowReply] = useState(false);
  const [showViewers, setShowViewers] = useState(false);

  const story = group?.stories[storyIndex];

  const viewersQuery = useQuery({
    queryKey: ['story-viewers', story?.id],
    queryFn: () => storiesApi.getViewers(story!.id),
    enabled: ownStory && showViewers && !!story?.id,
  });

  const advance = useCallback(() => {
    cancelAnimation(progressValue);
    progressValue.value = 0;
    setStoryIndex((prev) => {
      if (prev + 1 < (group?.stories.length ?? 0)) return prev + 1;
      router.back();
      return prev;
    });
  }, [group?.stories.length, router, progressValue]);

  // Progress animation (for images; videos use their own duration)
  useEffect(() => {
    if (paused || showViewers || story?.mediaType?.startsWith('video')) {
      cancelAnimation(progressValue);
      return;
    }
    progressValue.value = 0;
    progressValue.value = withTiming(1, { duration: STORY_DURATION }, (finished) => {
      if (finished) runOnJS(advance)();
    });
    return () => { cancelAnimation(progressValue); };
  }, [storyIndex, paused, showViewers, story?.mediaType, advance, progressValue]);

  // Mark viewed
  useEffect(() => {
    if (story?.id) {
      storiesApi.markViewed(story.id).catch(() => {});
    }
  }, [story?.id]);
  const { selection } = useHaptic();

function EmojiReactionButton({ emoji, onPress }: { emoji: string; onPress: () => void }) {
  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));
  const handlePress = () => {
    scale.value = withTiming(1.3, { duration: 100 }, () => {
      scale.value = withTiming(1, { duration: 100 });
    });
    onPress();
  };
  return (
    <Pressable onPress={handlePress} style={styles.reactionBtn} activeOpacity={0.7}>
      <Animated.Text style={[styles.reactionEmoji, animatedStyle]}>
        {emoji}
      </Animated.Text>
    </Pressable>
  );
}

  const replyMutation = useMutation({
    mutationFn: async () => {
      const convo = await messagesApi.createDM(group!.user.id);
      await messagesApi.sendMessage(convo.id, { content: replyText });
    },
    onSuccess: () => {
      setReplyText('');
      setShowReply(false);
    },
    onError: (err: Error) => Alert.alert('Error', err.message),
  });
  const reactionMutation = useMutation({
    mutationFn: async (emoji: string) => {
      const convo = await messagesApi.createDM(group!.user.id);
      await messagesApi.sendMessage(convo.id, { content: emoji });
    },
    onError: (err: Error) => Alert.alert('Error', err.message),
  });

  // Guard: must be after all hooks
  if (!group || group.stories.length === 0) {
    return null;
  }

  const handleTapLeft = () => {
    cancelAnimation(progressValue);
    progressValue.value = 0;
    if (storyIndex > 0) {
      setStoryIndex(storyIndex - 1);
    } else {
      router.back();
    }
  };

  const handleTapRight = () => advance();

  const handleStoryReaction = (emoji: string) => {
    selection();
    reactionMutation.mutate(emoji);
  };

  const timeAgo = story.createdAt
    ? formatDistanceToNowStrict(new Date(story.createdAt), { addSuffix: true })
    : '';

  return (
    <View style={styles.container}>
      {/* Story media */}
      {story.mediaType?.startsWith('video') ? (
        <Video
          source={{ uri: story.mediaUrl }}
          style={styles.media}
          resizeMode={ResizeMode.COVER}
          shouldPlay={!paused}
          isLooping={false}
          onPlaybackStatusUpdate={(status) => {
            if (status.isLoaded && status.durationMillis) {
              progressValue.value = status.positionMillis / status.durationMillis;
              if (status.didJustFinish) advance();
            }
          }}
        />
      ) : (
        <Image
          source={{ uri: story.mediaUrl }}
          style={styles.media}
          contentFit="cover"
        />
      )}

      {/* Gradient overlay (top) */}
      <LinearGradient
        colors={['rgba(0,0,0,0.6)', 'transparent']}
        style={styles.topOverlay}
        pointerEvents="box-none"
      >
        <SafeAreaView edges={['top']}>
          <ProgressBar
            count={group.stories.length}
            activeIndex={storyIndex}
            progress={progressValue}
          />
          {/* User info */}
          <View style={styles.userRow}>
            <Avatar uri={group.user.avatarUrl} name={group.user.displayName} size="sm" />
            <Text style={styles.userName}>{group.user.displayName}</Text>
            <Text style={styles.timeAgo}>{timeAgo}</Text>
            <TouchableOpacity onPress={() => router.back()} hitSlop={12} style={styles.closeBtn}>
              <Icon name="x" size="sm" color="#fff" />
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </LinearGradient>

      {/* Tap zones */}
      <View style={styles.tapZones} pointerEvents="box-none">
        <TouchableOpacity
          style={styles.tapLeft}
          onPress={handleTapLeft}
          onPressIn={() => setPaused(true)}
          onPressOut={() => setPaused(false)}
          activeOpacity={1}
        />
        <TouchableOpacity
          style={styles.tapRight}
          onPress={handleTapRight}
          onPressIn={() => setPaused(true)}
          onPressOut={() => setPaused(false)}
          activeOpacity={1}
        />
      </View>

      {/* Text overlay */}
      {story.textOverlay ? (
        <View style={styles.textOverlay}>
          <Text style={[styles.overlayText, { color: story.textColor ?? '#fff' }]}>
            {story.textOverlay}
          </Text>
        </View>
      ) : null}

      {/* Quick reactions */}
      {!ownStory && (
        <View style={styles.reactionsRow}>
          {QUICK_REACTIONS.map(emoji => (
            <EmojiReactionButton
              key={emoji}
              emoji={emoji}
              onPress={() => handleStoryReaction(emoji)}
            />
          ))}
        </View>
      )}

      {/* Bottom area: reply bar for others, views tap for own */}
      {ownStory ? (
        <SafeAreaView edges={['bottom']} style={styles.bottomBar}>
          <TouchableOpacity
            style={styles.viewsBtn}
            onPress={() => setShowViewers(true)}
            activeOpacity={0.8}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Icon name="eye" size="sm" color="#fff" />
              <Text style={styles.viewsBtnText}>{story.viewsCount} views</Text>
            </View>
          </TouchableOpacity>
        </SafeAreaView>
      ) : (
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.bottomBar}
        >
          <SafeAreaView edges={['bottom']}>
            {showReply ? (
              <View style={styles.replyRow}>
                <TextInput
                  style={styles.replyInput}
                  value={replyText}
                  onChangeText={setReplyText}
                  placeholder={`Reply to ${group.user.displayName}…`}
                  placeholderTextColor="rgba(255,255,255,0.5)"
                  autoFocus
                  maxLength={200}
                  onBlur={() => setShowReply(false)}
                />
                <TouchableOpacity
                  onPress={() => replyMutation.mutate()}
                  disabled={!replyText.trim() || replyMutation.isPending}
                  hitSlop={8}
                  style={replyMutation.isPending ? { opacity: 0.5 } : undefined}
                >
                  <Icon name="send" size="sm" color="#fff" />
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity
                style={styles.replyPlaceholder}
                onPress={() => { setShowReply(true); setPaused(true); }}
              >
                <Text style={styles.replyPlaceholderText}>
                  Reply to {group.user.displayName}…
                </Text>
              </TouchableOpacity>
            )}
          </SafeAreaView>
        </KeyboardAvoidingView>
      )}

      {/* Viewers bottom sheet (own stories) */}
      <BottomSheet visible={showViewers} onClose={() => setShowViewers(false)} snapPoint={0.6}>
        <Text style={styles.viewersTitle}>
          {story.viewsCount} {story.viewsCount === 1 ? 'view' : 'views'}
        </Text>
        {viewersQuery.isLoading ? (
          <View style={styles.viewersSkeleton}>
            {Array.from({ length: 5 }).map((_, i) => (
              <View key={i} style={styles.viewerSkeletonRow}>
                <Skeleton.Circle size={32} />
                <View style={{ flex: 1, gap: spacing.xs }}>
                  <Skeleton.Rect width={120} height={13} />
                  <Skeleton.Rect width={80} height={11} />
                </View>
              </View>
            ))}
          </View>
        ) : (
          <FlatList
            data={viewersQuery.data?.data ?? []}
            keyExtractor={(item) => item.id}
            refreshControl={
              <RefreshControl
                refreshing={viewersQuery.isRefetching}
                onRefresh={() => viewersQuery.refetch()}
                tintColor={colors.emerald}
              />
            }
            renderItem={({ item }) => (
              <View style={styles.viewerRow}>
                <Avatar uri={item.avatarUrl} name={item.displayName} size="sm" />
                <View style={styles.viewerInfo}>
                  <Text style={styles.viewerName}>{item.displayName}</Text>
                  <Text style={styles.viewerUsername}>@{item.username}</Text>
                </View>
              </View>
            )}
            ListEmptyComponent={
              <Text style={styles.viewersEmpty}>No views yet</Text>
            }
            contentContainerStyle={{ paddingBottom: spacing['2xl'] }}
          />
        )}
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  media: { ...StyleSheet.absoluteFillObject },

  topOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0,
    paddingHorizontal: spacing.sm,
    paddingBottom: spacing['2xl'],
  },

  progressRow: {
    flexDirection: 'row', gap: 3, marginTop: spacing.sm, paddingHorizontal: spacing.xs,
  },
  progressTrack: {
    flex: 1, height: 2, backgroundColor: 'rgba(255,255,255,0.35)', borderRadius: 1, overflow: 'hidden',
  },
  progressFill: { height: '100%', backgroundColor: colors.emerald, borderRadius: 1 },

  userRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingHorizontal: spacing.sm, paddingVertical: spacing.sm,
  },
  userName: { color: '#fff', fontSize: fontSize.sm, fontWeight: '700', flex: 1 },
  timeAgo: { color: 'rgba(255,255,255,0.7)', fontSize: fontSize.xs },
  closeBtn: { padding: spacing.xs },

  tapZones: { ...StyleSheet.absoluteFillObject, flexDirection: 'row' },
  tapLeft: { flex: 1 },
  tapRight: { flex: 2 },

  textOverlay: {
    position: 'absolute', top: '40%', left: spacing.xl, right: spacing.xl,
    alignItems: 'center',
  },
  overlayText: { fontSize: fontSize.xl, fontWeight: '700', textAlign: 'center', textShadowColor: 'rgba(0,0,0,0.8)', textShadowRadius: 4, textShadowOffset: { width: 0, height: 1 } },
  reactionsRow: {
    position: 'absolute',
    zIndex: 1,
    bottom: 120,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.lg,
    paddingHorizontal: spacing.base,
  },
  reactionBtn: {
    padding: spacing.sm,
  },
  reactionEmoji: {
    fontSize: fontSize.xl,
  },

  bottomBar: { position: 'absolute', bottom: 0, left: 0, right: 0, paddingHorizontal: spacing.base },
  replyPlaceholder: {
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)', borderRadius: radius.full,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    marginBottom: spacing.md,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  replyPlaceholderText: { color: 'rgba(255,255,255,0.6)', fontSize: fontSize.base },

  replyRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)', borderRadius: radius.full,
    paddingHorizontal: spacing.md, paddingVertical: spacing.xs,
    marginBottom: spacing.md,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  replyInput: { flex: 1, color: '#fff', fontSize: fontSize.base, paddingVertical: spacing.sm },
  viewsBtn: {
    alignSelf: 'flex-start',
    marginHorizontal: spacing.base,
    marginBottom: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  viewsBtnText: { color: '#fff', fontSize: fontSize.sm, fontWeight: '600' },

  viewersTitle: {
    color: colors.text.primary, fontSize: fontSize.base, fontWeight: '700',
    paddingHorizontal: spacing.xl, paddingBottom: spacing.md,
  },
  viewersSkeleton: {
    paddingHorizontal: spacing.xl, gap: spacing.md,
  },
  viewerSkeletonRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
  },
  viewerRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingHorizontal: spacing.xl, paddingVertical: spacing.sm,
  },
  viewerInfo: { flex: 1 },
  viewerName: { color: colors.text.primary, fontSize: fontSize.sm, fontWeight: '600' },
  viewerUsername: { color: colors.text.secondary, fontSize: fontSize.xs },
  viewersEmpty: {
    color: colors.text.tertiary, textAlign: 'center',
    marginTop: spacing.xl, fontSize: fontSize.base,
  },
});
