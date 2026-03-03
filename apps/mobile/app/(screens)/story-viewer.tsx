import { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  Dimensions, ActivityIndicator, TextInput, Platform,
  KeyboardAvoidingView, Alert,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { Video, ResizeMode } from 'expo-av';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Avatar } from '@/components/ui/Avatar';
import { colors, spacing, fontSize } from '@/theme';
import { storiesApi } from '@/services/api';
import type { StoryGroup } from '@/types';
import { formatDistanceToNowStrict } from 'date-fns';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
const STORY_DURATION = 5000; // ms per story slide for images

function ProgressBar({
  count,
  activeIndex,
  progress,
}: {
  count: number;
  activeIndex: number;
  progress: number; // 0–1
}) {
  return (
    <View style={styles.progressRow}>
      {Array.from({ length: count }).map((_, i) => (
        <View key={i} style={styles.progressTrack}>
          <View
            style={[
              styles.progressFill,
              {
                width: i < activeIndex ? '100%' : i === activeIndex ? `${progress * 100}%` : '0%',
              },
            ]}
          />
        </View>
      ))}
    </View>
  );
}

export default function StoryViewerScreen() {
  const { groupJson, startIndex: startIndexParam } = useLocalSearchParams<{
    groupJson: string;
    startIndex?: string;
  }>();

  const router = useRouter();
  const queryClient = useQueryClient();

  const group: StoryGroup = groupJson ? JSON.parse(groupJson) : null;
  if (!group || group.stories.length === 0) {
    router.back();
    return null;
  }

  const [storyIndex, setStoryIndex] = useState(Number(startIndexParam ?? 0));
  const [progress, setProgress] = useState(0);
  const [paused, setPaused] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [showReply, setShowReply] = useState(false);

  const story = group.stories[storyIndex];
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const progressRef = useRef(0);

  const advance = useCallback(() => {
    setStoryIndex((prev) => {
      if (prev + 1 < group.stories.length) return prev + 1;
      router.back();
      return prev;
    });
    setProgress(0);
    progressRef.current = 0;
  }, [group.stories.length, router]);

  // Progress timer (for images; videos use their own duration)
  useEffect(() => {
    if (paused || story?.mediaType?.startsWith('video')) return;
    progressRef.current = 0;
    setProgress(0);
    const interval = 50;
    const steps = STORY_DURATION / interval;
    timerRef.current = setInterval(() => {
      progressRef.current += 1 / steps;
      setProgress(progressRef.current);
      if (progressRef.current >= 1) {
        clearInterval(timerRef.current!);
        advance();
      }
    }, interval);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [storyIndex, paused, story?.mediaType, advance]);

  // Mark viewed
  useEffect(() => {
    if (story?.id) {
      storiesApi.markViewed(story.id).catch(() => {});
    }
  }, [story?.id]);

  const replyMutation = useMutation({
    mutationFn: () => storiesApi.create({
      mediaUrl: story.mediaUrl,
      mediaType: story.mediaType,
      content: replyText,
    }),
    onSuccess: () => {
      setReplyText('');
      setShowReply(false);
    },
    onError: (err: Error) => Alert.alert('Error', err.message),
  });

  const handleTapLeft = () => {
    if (storyIndex > 0) {
      setStoryIndex(storyIndex - 1);
      setProgress(0);
      progressRef.current = 0;
    } else {
      router.back();
    }
  };

  const handleTapRight = () => advance();

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
              setProgress(status.positionMillis / status.durationMillis);
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
      <View style={styles.topOverlay}>
        <SafeAreaView edges={['top']}>
          <ProgressBar
            count={group.stories.length}
            activeIndex={storyIndex}
            progress={progress}
          />
          {/* User info */}
          <View style={styles.userRow}>
            <Avatar uri={group.user.avatarUrl} name={group.user.displayName} size="sm" />
            <Text style={styles.userName}>{group.user.displayName}</Text>
            <Text style={styles.timeAgo}>{timeAgo}</Text>
            <TouchableOpacity onPress={() => router.back()} hitSlop={12} style={styles.closeBtn}>
              <Text style={styles.closeIcon}>✕</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </View>

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

      {/* Bottom reply bar */}
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
              >
                {replyMutation.isPending ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.sendIcon}>➤</Text>
                )}
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

      {/* Views count (own stories) */}
      <View style={styles.viewsRow} pointerEvents="none">
        <Text style={styles.viewsText}>👁 {story.viewsCount}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  media: { ...StyleSheet.absoluteFillObject },

  topOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0,
    paddingHorizontal: spacing.sm,
    backgroundColor: 'linear-gradient(180deg, rgba(0,0,0,0.6) 0%, transparent 100%)' as any,
  },

  progressRow: {
    flexDirection: 'row', gap: 3, marginTop: spacing.sm, paddingHorizontal: spacing.xs,
  },
  progressTrack: {
    flex: 1, height: 2, backgroundColor: 'rgba(255,255,255,0.35)', borderRadius: 1, overflow: 'hidden',
  },
  progressFill: { height: '100%', backgroundColor: '#fff', borderRadius: 1 },

  userRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingHorizontal: spacing.sm, paddingVertical: spacing.sm,
  },
  userName: { color: '#fff', fontSize: fontSize.sm, fontWeight: '700', flex: 1 },
  timeAgo: { color: 'rgba(255,255,255,0.7)', fontSize: fontSize.xs },
  closeBtn: { padding: 4 },
  closeIcon: { color: '#fff', fontSize: 18 },

  tapZones: { ...StyleSheet.absoluteFillObject, flexDirection: 'row' },
  tapLeft: { flex: 1 },
  tapRight: { flex: 2 },

  textOverlay: {
    position: 'absolute', top: '40%', left: spacing.xl, right: spacing.xl,
    alignItems: 'center',
  },
  overlayText: { fontSize: fontSize.xl, fontWeight: '700', textAlign: 'center', textShadowColor: 'rgba(0,0,0,0.8)', textShadowRadius: 4, textShadowOffset: { width: 0, height: 1 } },

  bottomBar: { position: 'absolute', bottom: 0, left: 0, right: 0, paddingHorizontal: spacing.base },
  replyPlaceholder: {
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.4)', borderRadius: 24,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    marginBottom: spacing.md,
  },
  replyPlaceholderText: { color: 'rgba(255,255,255,0.6)', fontSize: fontSize.base },

  replyRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.4)', borderRadius: 24,
    paddingHorizontal: spacing.md, paddingVertical: spacing.xs,
    marginBottom: spacing.md,
  },
  replyInput: { flex: 1, color: '#fff', fontSize: fontSize.base, paddingVertical: spacing.sm },
  sendIcon: { color: '#fff', fontSize: 20 },

  viewsRow: {
    position: 'absolute', bottom: 80, left: spacing.base,
  },
  viewsText: { color: 'rgba(255,255,255,0.7)', fontSize: fontSize.xs },
});
