import { useState, useEffect, useCallback, useMemo, useRef, memo } from 'react';
import {
  View, Text, StyleSheet, Pressable,
  Dimensions, TextInput, Platform,
  KeyboardAvoidingView, Alert, FlatList, RefreshControl,
  ViewToken,
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
import { useMutation, useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { Video, ResizeMode } from 'expo-av';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Avatar } from '@/components/ui/Avatar';
import { Icon } from '@/components/ui/Icon';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { colors, spacing, fontSize, radius } from '@/theme';
import { storiesApi } from '@/services/api';
import { PollSticker, QuizSticker, QuestionSticker, CountdownSticker, SliderSticker } from '@/components/story';
import type { StoryGroup } from '@/types';
import { formatDistanceToNowStrict } from 'date-fns';
import { getDateFnsLocale } from '@/utils/localeFormat';
import { useHaptic } from '@/hooks/useHaptic';
import { useTranslation } from '@/hooks/useTranslation';
import { ScreenErrorBoundary } from '@/components/ui/ScreenErrorBoundary';
import { useStore } from '@/store';

type Sticker = {
  id: string;
  type: 'poll' | 'quiz' | 'question' | 'countdown' | 'slider' | 'location' | 'mention' | 'hashtag';
  data: Record<string, unknown>;
  x: number;
  y: number;
  scale: number;
};

const { width: SCREEN_W } = Dimensions.get('window');
const STORY_DURATION = 5000; // ms per story slide for images
const QUICK_REACTIONS = ['\u2764\uFE0F', '\uD83D\uDD25', '\uD83D\uDC4F', '\uD83D\uDE02', '\uD83D\uDE0D', '\uD83D\uDE22'];

// ─── Progress bar components ──────────────────────────────────────────────────

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

// ─── Emoji reaction button ────────────────────────────────────────────────────

function EmojiReactionButton({ emoji, onPress, t }: { emoji: string; onPress: () => void; t: (key: string, opts?: Record<string, unknown>) => string }) {
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
    <Pressable
      onPress={handlePress}
      style={styles.reactionBtn}
      accessibilityLabel={t('accessibility.reactWithEmoji', { emoji })}
      accessibilityRole="button"
    >
      <Animated.Text style={[styles.reactionEmoji, animatedStyle]}>
        {emoji}
      </Animated.Text>
    </Pressable>
  );
}

// ─── StoryGroupPage — one user's stories ──────────────────────────────────────

interface StoryGroupPageProps {
  group: StoryGroup;
  isActive: boolean;
  isOwnStory: boolean;
  onComplete: () => void;
  onGoPrevGroup: () => void;
  onClose: () => void;
}

const StoryGroupPage = memo(function StoryGroupPage({
  group,
  isActive,
  isOwnStory,
  onComplete,
  onGoPrevGroup,
  onClose,
}: StoryGroupPageProps) {
  const [storyIndex, setStoryIndex] = useState(0);
  const progressValue = useSharedValue(0);
  const [paused, setPaused] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [showReply, setShowReply] = useState(false);
  const [showViewers, setShowViewers] = useState(false);
  const [stickerResponses, setStickerResponses] = useState<Record<string, Record<string, unknown>>>({});
  const { t } = useTranslation();
  const { selection } = useHaptic();

  const story = group.stories[storyIndex];

  const stickers = useMemo(() => {
    if (!story?.stickerData) return [];
    try {
      const data = typeof story.stickerData === 'string'
        ? JSON.parse(story.stickerData)
        : story.stickerData;
      return Array.isArray(data) ? data : [];
    } catch {
      return [];
    }
  }, [story]);

  const viewersQuery = useQuery({
    queryKey: ['story-viewers', story?.id],
    queryFn: () => storiesApi.getViewers(story?.id ?? ''),
    enabled: isOwnStory && showViewers && !!story?.id,
  });

  // Reset story index when this page becomes active (returning from a swipe)
  // Only reset if we're swiping BACK to this group — not on initial mount
  const hasBeenActive = useRef(false);
  useEffect(() => {
    if (isActive && !hasBeenActive.current) {
      hasBeenActive.current = true;
    }
  }, [isActive]);

  // Advance to next story within this group, or signal group complete
  const advance = useCallback(() => {
    cancelAnimation(progressValue);
    progressValue.value = 0;
    setStoryIndex((prev) => {
      if (prev + 1 < group.stories.length) return prev + 1;
      // Last story in group finished — signal parent to advance to next group
      onComplete();
      return prev;
    });
  }, [group.stories.length, onComplete, progressValue]);

  // Reset progress on story index change
  useEffect(() => {
    progressValue.value = 0;
  }, [storyIndex, progressValue]);

  // Progress animation (for images; videos use their own duration)
  // Only run when this page is the active/visible one
  useEffect(() => {
    if (!isActive || paused || showViewers || story?.mediaType?.startsWith('video')) {
      cancelAnimation(progressValue);
      return;
    }
    const currentProgress = progressValue.value;
    const remainingDuration = STORY_DURATION * (1 - currentProgress);
    progressValue.value = withTiming(1, { duration: Math.max(0, remainingDuration) }, (finished) => {
      if (finished) runOnJS(advance)();
    });
    return () => { cancelAnimation(progressValue); };
  }, [storyIndex, paused, showViewers, story?.mediaType, advance, progressValue, isActive]);

  // Mark viewed
  useEffect(() => {
    if (story?.id && isActive) {
      storiesApi.markViewed(story.id).catch(() => {});
    }
  }, [story?.id, isActive]);

  const handleStickerResponse = useCallback((stickerId: string, response: Record<string, unknown>) => {
    setStickerResponses(prev => ({ ...prev, [stickerId]: response }));
    const sticker = stickers.find(s => s.id === stickerId);
    if (sticker && story?.id) {
      storiesApi.submitStickerResponse(story.id, sticker.type, response).catch(() => {});
    }
  }, [stickers, story?.id]);

  const renderSticker = (sticker: Sticker) => {
    const { id, type, data, x, y, scale } = sticker;
    const stickerStyle = { position: 'absolute' as const, left: x, top: y, transform: [{ scale }] };
    switch (type) {
      case 'poll': {
        const options = Array.isArray(data.options) ? data.options as string[] : [];
        const pollData = {
          question: String(data.question ?? ''),
          options: options.map((opt, idx) => ({
            id: `opt-${idx}`,
            text: String(opt),
            votes: 0,
          })),
          totalVotes: 0,
        };
        return (
          <PollSticker
            key={id}
            data={pollData}
            onResponse={(optionId) => handleStickerResponse(id, { optionId })}
            isCreator={isOwnStory}
            style={stickerStyle}
          />
        );
      }
      case 'quiz': {
        const quizOpts = Array.isArray(data.options) ? data.options as string[] : [];
        const correctIdx = typeof data.correctIndex === 'number' ? data.correctIndex : 0;
        const quizOptions = quizOpts.map((opt, idx) => ({
          id: `opt-${idx}`,
          text: String(opt),
          isCorrect: idx === correctIdx,
        }));
        const quizData = {
          question: String(data.question ?? ''),
          options: quizOptions,
          explanation: '',
        };
        return (
          <QuizSticker
            key={id}
            data={quizData}
            onResponse={(optionId, isCorrect) => handleStickerResponse(id, { optionId, isCorrect })}
            isCreator={isOwnStory}
            style={stickerStyle}
          />
        );
      }
      case 'question': {
        const questionData = {
          prompt: String(data.prompt ?? ''),
          submittedQuestions: [],
        };
        return (
          <QuestionSticker
            key={id}
            data={questionData}
            onResponse={(questionText) => handleStickerResponse(id, { questionText })}
            isCreator={isOwnStory}
            style={stickerStyle}
          />
        );
      }
      case 'countdown': {
        const endsAt = data.endsAt ? new Date(String(data.endsAt)) : new Date(Date.now() + 86400000);
        const countdownData = {
          eventName: String(data.title ?? ''),
          targetDate: endsAt,
          description: '',
        };
        return (
          <CountdownSticker
            key={id}
            data={countdownData}
            onRemindMeToggle={(enabled) => handleStickerResponse(id, { remindMe: enabled })}
            isCreator={isOwnStory}
            style={stickerStyle}
          />
        );
      }
      case 'slider': {
        const sliderData = {
          emoji: String(data.emoji ?? '\uD83D\uDCCA'),
          question: String(data.question ?? ''),
          minValue: typeof data.minValue === 'number' ? data.minValue : 0,
          maxValue: typeof data.maxValue === 'number' ? data.maxValue : 100,
          averageValue: typeof data.averageValue === 'number' ? data.averageValue : 50,
          totalResponses: typeof data.totalResponses === 'number' ? data.totalResponses : 0,
        };
        return (
          <SliderSticker
            key={id}
            data={sliderData}
            onResponse={(value) => handleStickerResponse(id, { value })}
            isCreator={isOwnStory}
            style={stickerStyle}
          />
        );
      }
      default:
        return (
          <View key={id} style={[stickerStyle, { backgroundColor: 'rgba(0,0,0,0.5)', padding: 8, borderRadius: radius.md }]}>
            <Text style={{ color: '#fff', fontSize: fontSize.sm }}>
              {type === 'location' ? `\uD83D\uDCCD ${String(data.name ?? '')}` : type === 'mention' ? `@${String(data.username ?? '')}` : `#${String(data.tag ?? '')}`}
            </Text>
          </View>
        );
    }
  };

  const replyMutation = useMutation({
    mutationFn: async () => {
      if (!story) throw new Error('Story not available');
      await storiesApi.replyToStory(story.id, replyText);
    },
    onSuccess: () => {
      setReplyText('');
      setShowReply(false);
    },
    onError: (err: Error) => Alert.alert(t('common.error'), err.message),
  });

  const reactionMutation = useMutation({
    mutationFn: async (emoji: string) => {
      if (!story) throw new Error('Story not available');
      await storiesApi.replyToStory(story.id, emoji);
    },
    onError: (err: Error) => Alert.alert(t('common.error'), err.message),
  });

  const handleTapLeft = () => {
    cancelAnimation(progressValue);
    progressValue.value = 0;
    if (storyIndex > 0) {
      setStoryIndex(storyIndex - 1);
    } else {
      // First story in group — go to previous group
      onGoPrevGroup();
    }
  };

  const handleTapRight = () => advance();

  const handleStoryReaction = (emoji: string) => {
    selection();
    reactionMutation.mutate(emoji);
  };

  const timeAgo = story?.createdAt
    ? formatDistanceToNowStrict(new Date(story.createdAt), { addSuffix: true, locale: getDateFnsLocale() })
    : '';

  return (
    <View style={styles.groupPage}>
      {/* Story media */}
      {story?.mediaType?.startsWith('video') ? (
        <Video
          source={{ uri: story.mediaUrl }}
          style={styles.media}
          resizeMode={ResizeMode.COVER}
          shouldPlay={isActive && !paused}
          isLooping={false}
          onPlaybackStatusUpdate={(status) => {
            if (status.isLoaded && status.durationMillis) {
              progressValue.value = status.positionMillis / status.durationMillis;
              if (status.didJustFinish) advance();
            }
          }}
        />
      ) : story ? (
        <Image
          source={{ uri: story.mediaUrl }}
          style={styles.media}
          contentFit="cover"
        />
      ) : null}

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
            <Avatar
              uri={group.user.avatarUrl}
              name={group.user.displayName}
              size="sm"
              showStoryRing={group.stories.length > storyIndex + 1}
              ringColor={colors.emerald}
            />
            <Text style={styles.userName}>{group.user.displayName}</Text>
            <Text style={styles.timeAgo}>{timeAgo}</Text>
            <Pressable
              onPress={onClose}
              hitSlop={12}
              style={styles.closeBtn}
              accessibilityLabel={t('accessibility.closeStory')}
              accessibilityRole="button"
            >
              <Icon name="x" size="sm" color={colors.text.primary} />
            </Pressable>
          </View>
        </SafeAreaView>
      </LinearGradient>

      {/* Tap zones */}
      <View style={styles.tapZones} pointerEvents="box-none">
        <Pressable
          style={styles.tapLeft}
          onPress={handleTapLeft}
          onPressIn={() => setPaused(true)}
          onPressOut={() => setPaused(false)}
          accessibilityLabel={t('accessibility.previousStorySlide')}
          accessibilityRole="button"
        />
        <Pressable
          style={styles.tapRight}
          onPress={handleTapRight}
          onPressIn={() => setPaused(true)}
          onPressOut={() => setPaused(false)}
          accessibilityLabel={t('accessibility.nextStorySlide')}
          accessibilityRole="button"
        />
      </View>

      {/* Story stickers */}
      {stickers.length > 0 && (
        <View style={styles.stickersContainer} pointerEvents="box-none">
          {stickers.map(renderSticker)}
        </View>
      )}

      {/* Text overlay */}
      {story?.textOverlay ? (
        <View style={styles.textOverlay}>
          <Text style={[styles.overlayText, { color: story.textColor ?? '#fff' }]}>
            {story.textOverlay}
          </Text>
        </View>
      ) : null}

      {/* Quick reactions */}
      {!isOwnStory && (
        <View style={styles.reactionsRow}>
          {QUICK_REACTIONS.map(emoji => (
            <EmojiReactionButton
              key={emoji}
              emoji={emoji}
              onPress={() => handleStoryReaction(emoji)}
              t={t}
            />
          ))}
        </View>
      )}

      {/* Bottom area: reply bar for others, views tap for own */}
      {isOwnStory ? (
        <SafeAreaView edges={['bottom']} style={styles.bottomBar}>
          <Pressable
            style={styles.viewsBtn}
            onPress={() => setShowViewers(true)}
            accessibilityLabel={t('accessibility.viewViewers', { count: story?.viewsCount })}
            accessibilityRole="button"
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Icon name="eye" size="sm" color="#fff" />
              <Text style={styles.viewsBtnText}>{t('saf.views', { count: story?.viewsCount })}</Text>
            </View>
          </Pressable>
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
                  placeholder={t('saf.replyToStory')}
                  placeholderTextColor="rgba(255,255,255,0.5)"
                  autoFocus
                  maxLength={200}
                  onBlur={() => setShowReply(false)}
                  accessibilityLabel={t('accessibility.storyReplyInput')}
                />
                <Pressable
                  onPress={() => replyMutation.mutate()}
                  disabled={!replyText.trim() || replyMutation.isPending}
                  hitSlop={8}
                  style={replyMutation.isPending ? { opacity: 0.5 } : undefined}
                  accessibilityLabel={t('accessibility.sendReply')}
                  accessibilityRole="button"
                >
                  <Icon
                    name="send"
                    size="sm"
                    color={replyText.trim() ? colors.emerald : 'rgba(255,255,255,0.5)'}
                  />
                </Pressable>
              </View>
            ) : (
              <Pressable
                style={styles.replyPlaceholder}
                onPress={() => { setShowReply(true); setPaused(true); }}
                accessibilityLabel={t('accessibility.tapToReply')}
                accessibilityRole="button"
              >
                <Text style={styles.replyPlaceholderText}>
                  {t('saf.replyToStory')}
                </Text>
              </Pressable>
            )}
          </SafeAreaView>
        </KeyboardAvoidingView>
      )}

      {/* Viewers bottom sheet (own stories) */}
      <BottomSheet visible={showViewers} onClose={() => setShowViewers(false)} snapPoint={0.6}>
        <Text style={styles.viewersTitle}>
          {t('saf.view', { count: story?.viewsCount })}
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
            removeClippedSubviews={true}
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
              <Text style={styles.viewersEmpty}>{t('saf.noViewsYet')}</Text>
            }
            contentContainerStyle={{ paddingBottom: spacing['2xl'] }}
          />
        )}
      </BottomSheet>
    </View>
  );
});

// ─── Main screen — horizontal pager across story groups ───────────────────────

export default function StoryViewerScreen() {
  const { groupJson, startIndex: startIndexParam, isOwn } = useLocalSearchParams<{
    groupJson: string;
    startIndex?: string;
    isOwn?: string;
  }>();

  const storyViewerData = useStore((s) => s.storyViewerData);
  const router = useRouter();
  const { t } = useTranslation();

  // Resolve groups array and initial group index
  const { groups, initialGroupIndex, ownStory } = useMemo(() => {
    let resolved: StoryGroup[] = [];
    let startIdx = 0;
    let own = isOwn === 'true';

    if (storyViewerData && storyViewerData.groups && storyViewerData.groups.length > 0) {
      resolved = storyViewerData.groups as StoryGroup[];
      startIdx = storyViewerData.startIndex ?? 0;
      if (storyViewerData.isOwn) own = true;
    } else {
      try {
        const parsed = groupJson ? JSON.parse(groupJson) : null;
        if (parsed) {
          resolved = [parsed];
          startIdx = 0;
        }
      } catch {
        resolved = [];
      }
    }

    // Filter out groups with no stories
    const filtered = resolved.filter(g => g.stories.length > 0);
    // Clamp startIdx in case filtering changed the length
    const clampedIdx = Math.min(startIdx, Math.max(0, filtered.length - 1));

    return { groups: filtered, initialGroupIndex: clampedIdx, ownStory: own };
  }, [storyViewerData, groupJson, isOwn]);

  const [currentGroupIndex, setCurrentGroupIndex] = useState(initialGroupIndex);
  const flatListRef = useRef<FlatList<StoryGroup>>(null);

  // Clear store data on unmount
  useEffect(() => {
    return () => {
      useStore.getState().setStoryViewerData(null);
    };
  }, []);

  // We need a ref to track currentGroupIndex for callbacks that
  // might fire before React commits the state update
  const currentGroupIndexRef = useRef(initialGroupIndex);

  // Scroll to next group programmatically
  const goToNextGroup = useCallback(() => {
    const next = currentGroupIndexRef.current + 1;
    if (next >= groups.length) {
      router.back();
      return;
    }
    currentGroupIndexRef.current = next;
    setCurrentGroupIndex(next);
    flatListRef.current?.scrollToIndex({ index: next, animated: true });
  }, [groups.length, router]);

  // Scroll to previous group programmatically
  const goToPrevGroup = useCallback(() => {
    const prev = currentGroupIndexRef.current;
    if (prev <= 0) {
      router.back();
      return;
    }
    const next = prev - 1;
    currentGroupIndexRef.current = next;
    setCurrentGroupIndex(next);
    flatListRef.current?.scrollToIndex({ index: next, animated: true });
  }, [router]);

  const handleClose = useCallback(() => {
    router.back();
  }, [router]);

  // Track which page is visible after a manual swipe
  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    if (viewableItems.length > 0 && viewableItems[0].index != null) {
      currentGroupIndexRef.current = viewableItems[0].index;
      setCurrentGroupIndex(viewableItems[0].index);
    }
  }).current;

  const viewabilityConfig = useRef({ viewAreaCoveragePercentThreshold: 50 }).current;

  const getItemLayout = useCallback((_: StoryGroup[] | null, index: number) => ({
    length: SCREEN_W,
    offset: SCREEN_W * index,
    index,
  }), []);

  const renderGroupPage = useCallback(({ item, index }: { item: StoryGroup; index: number }) => (
    <StoryGroupPage
      group={item}
      isActive={index === currentGroupIndex}
      isOwnStory={ownStory && index === initialGroupIndex}
      onComplete={goToNextGroup}
      onGoPrevGroup={goToPrevGroup}
      onClose={handleClose}
    />
  ), [currentGroupIndex, ownStory, initialGroupIndex, goToNextGroup, goToPrevGroup, handleClose]);

  const keyExtractor = useCallback((item: StoryGroup, index: number) =>
    `${item.user.id}-${index}`, []);

  // Guard: no groups
  if (groups.length === 0) {
    return (
      <ScreenErrorBoundary>
        <View style={styles.container}>
          <EmptyState
            icon="flag"
            title={t('saf.story.unavailable')}
            subtitle={t('saf.story.unavailableSubtitle')}
            actionLabel={t('saf.goBack')}
            onAction={() => router.back()}
          />
        </View>
      </ScreenErrorBoundary>
    );
  }

  return (
    <ScreenErrorBoundary>
      <View style={styles.container}>
        <FlatList
          ref={flatListRef}
          data={groups}
          keyExtractor={keyExtractor}
          renderItem={renderGroupPage}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          bounces={false}
          initialScrollIndex={initialGroupIndex}
          getItemLayout={getItemLayout}
          onViewableItemsChanged={onViewableItemsChanged}
          viewabilityConfig={viewabilityConfig}
          removeClippedSubviews={Platform.OS === 'android'}
          maxToRenderPerBatch={3}
          windowSize={3}
        />
      </View>
    </ScreenErrorBoundary>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  groupPage: { width: SCREEN_W, height: '100%', backgroundColor: '#000' },
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
    flex: 1,
    height: 2.5,
    borderRadius: 1.5,
    backgroundColor: 'rgba(255,255,255,0.25)',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 1.5,
    backgroundColor: colors.emerald,
  },

  userRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingHorizontal: spacing.sm, paddingVertical: spacing.sm,
  },
  userName: { color: '#fff', fontSize: fontSize.sm, fontWeight: '700', flex: 1 },
  timeAgo: { color: 'rgba(255,255,255,0.7)', fontSize: fontSize.xs },
  closeBtn: { padding: spacing.xs, backgroundColor: 'rgba(0,0,0,0.3)', borderRadius: radius.full },

  tapZones: { ...StyleSheet.absoluteFillObject, flexDirection: 'row' },
  tapLeft: { flex: 1 },
  tapRight: { flex: 2 },
  stickersContainer: { ...StyleSheet.absoluteFillObject, pointerEvents: 'box-none' },

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
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginBottom: spacing.md,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  replyPlaceholderText: { color: 'rgba(255,255,255,0.5)', fontSize: fontSize.base },

  replyRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
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
