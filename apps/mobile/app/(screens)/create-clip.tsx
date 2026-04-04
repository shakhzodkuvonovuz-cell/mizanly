import React, { useState, useMemo, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput, Pressable } from 'react-native';
import Animated, { FadeInUp, FadeInDown } from 'react-native-reanimated';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { GlassHeader } from '@/components/ui/GlassHeader';
import { Icon } from '@/components/ui/Icon';
import { CharCountRing } from '@/components/ui/CharCountRing';
import { ScreenErrorBoundary } from '@/components/ui/ScreenErrorBoundary';
import { ProgressiveImage } from '@/components/ui/ProgressiveImage';
import { GradientButton } from '@/components/ui/GradientButton';
import { showToast } from '@/components/ui/Toast';
import { colors, spacing, fontSize, radius } from '@/theme';
import { clipsApi } from '@/services/api';
import { useContextualHaptic } from '@/hooks/useContextualHaptic';
import { useTranslation } from '@/hooks/useTranslation';
import { useThemeColors } from '@/hooks/useThemeColors';
import { formatTime } from '@/utils/formatTime';

export default function CreateClipScreen() {
  const { videoId, currentTime, duration, thumbnailUrl, videoTitle } = useLocalSearchParams<{
    videoId: string;
    currentTime?: string;
    duration?: string;
    thumbnailUrl?: string;
    videoTitle?: string;
  }>();
  const tc = useThemeColors();
  const router = useRouter();
  const haptic = useContextualHaptic();
  const { t, isRTL } = useTranslation();
  const queryClient = useQueryClient();

  const totalDuration = parseFloat(duration || '300');
  const startDefault = Math.max(0, parseFloat(currentTime || '0') - 15);

  const [title, setTitle] = useState('');
  const [startTime, setStartTime] = useState(startDefault);
  const [endTime, setEndTime] = useState(Math.min(startDefault + 30, totalDuration));

  const clipDuration = useMemo(() => Math.max(0, endTime - startTime), [startTime, endTime]);
  const isValid = clipDuration >= 0.5 && clipDuration <= 60 && endTime <= totalDuration;

  const createLockRef = useRef(false);
  const createMutation = useMutation({
    mutationFn: () => clipsApi.create(videoId as string, {
      startTime,
      endTime,
      title: title.trim() || undefined,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clips', videoId] });
      haptic.success();
      showToast({ message: t('clips.created') || 'Clip created', variant: 'success' });
      router.back();
    },
    onError: (err: Error) => {
      haptic.error();
      showToast({ message: err.message || t('clips.createFailed') || 'Failed to create clip', variant: 'error' });
    },
    onSettled: () => { createLockRef.current = false; },
  });

  const adjustStart = (delta: number) => {
    const newStart = Math.max(0, Math.min(startTime + delta, endTime - 0.5));
    setStartTime(newStart);
    haptic.tick();
  };

  const adjustEnd = (delta: number) => {
    const newEnd = Math.min(totalDuration, Math.max(endTime + delta, startTime + 0.5));
    setEndTime(newEnd);
    haptic.tick();
  };

  return (
    <ScreenErrorBoundary>
      <View style={[styles.container, { backgroundColor: tc.bg }]}>
        <GlassHeader
          title={t('clips.title')}
          leftAction={{ icon: 'arrow-left', onPress: () => router.back() }}
        />
        <ScrollView style={styles.scroll} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {/* Thumbnail */}
          <Animated.View entering={FadeInUp.duration(300)} style={styles.thumbnailWrap}>
            {thumbnailUrl ? (
              <ProgressiveImage
                uri={thumbnailUrl as string}
                width="100%"
                height={200}
                borderRadius={radius.lg}
                contentFit="cover"
                accessibilityLabel={videoTitle as string || t('clips.videoThumbnail')}
              />
            ) : (
              <View style={[styles.thumbnail, { backgroundColor: tc.surface, justifyContent: 'center', alignItems: 'center' }]}>
                <Icon name="video" size="xl" color={tc.text.tertiary} />
              </View>
            )}
            <View style={styles.durationBadge}>
              <Text style={styles.durationText}>{formatTime(clipDuration)}</Text>
            </View>
          </Animated.View>

          {/* Time range controls */}
          <Animated.View entering={FadeInUp.delay(100).duration(300)} style={styles.timeSection}>
            <Text style={[styles.sectionLabel, { color: tc.text.secondary }]}>{t('clips.from')}</Text>
            <View style={styles.timeControls}>
              <Pressable onPress={() => adjustStart(-5)} style={[styles.timeBtn, { backgroundColor: tc.surface }]}>
                <Icon name="chevron-left" size="sm" color={tc.text.primary} />
              </Pressable>
              <View style={[styles.timeDisplay, { backgroundColor: tc.bgCard, borderColor: tc.border }]}>
                <Text style={styles.timeText}>{formatTime(startTime)}</Text>
              </View>
              <Pressable onPress={() => adjustStart(5)} style={[styles.timeBtn, { backgroundColor: tc.surface }]}>
                <Icon name="chevron-right" size="sm" color={tc.text.primary} />
              </Pressable>
              <Text style={[styles.timeSep, { color: tc.text.tertiary }]}>—</Text>
              <Pressable onPress={() => adjustEnd(-5)} style={[styles.timeBtn, { backgroundColor: tc.surface }]}>
                <Icon name="chevron-left" size="sm" color={tc.text.primary} />
              </Pressable>
              <View style={[styles.timeDisplay, { backgroundColor: tc.bgCard, borderColor: tc.border }]}>
                <Text style={styles.timeText}>{formatTime(endTime)}</Text>
              </View>
              <Pressable onPress={() => adjustEnd(5)} style={[styles.timeBtn, { backgroundColor: tc.surface }]}>
                <Icon name="chevron-right" size="sm" color={tc.text.primary} />
              </Pressable>
            </View>
            <Text style={[styles.durationLabel, { color: tc.text.tertiary }]}>
              {t('clips.duration')}: {formatTime(clipDuration)}
              {clipDuration > 60 && ` (${t('clips.maxDuration')})`}
            </Text>
          </Animated.View>

          {/* Title */}
          <Animated.View entering={FadeInUp.delay(150).duration(300)} style={styles.section}>
            <View style={styles.titleHeader}>
              <Text style={[styles.sectionLabel, { color: tc.text.secondary }]}>{t('clips.clipTitle')}</Text>
              <CharCountRing current={title.length} max={100} size={24} />
            </View>
            <TextInput
              style={[styles.input, { backgroundColor: tc.bgCard, borderColor: tc.border, color: tc.text.primary }]}
              value={title}
              onChangeText={(text) => setTitle(text.slice(0, 100))}
              placeholder={t('clips.titlePlaceholder')}
              placeholderTextColor={tc.text.tertiary}
              maxLength={100}
            />
          </Animated.View>

          {/* Source info */}
          <Animated.View entering={FadeInUp.delay(200).duration(300)} style={[styles.infoCard, { backgroundColor: tc.bgCard, borderColor: tc.border }]}>
            <Icon name="link" size="sm" color={tc.text.secondary} />
            <Text style={[styles.infoText, { color: tc.text.secondary }]} numberOfLines={1}>{videoTitle || t('clips.sourceVideo')}</Text>
          </Animated.View>

          {/* Max duration hint */}
          <Text style={[styles.hint, { color: tc.text.tertiary }]}>{t('clips.maxDuration')}</Text>

          {/* Submit */}
          <Animated.View entering={FadeInDown.delay(250).duration(300)} style={styles.submitSection}>
            <GradientButton
              label={createMutation.isPending ? t('clips.creating') : t('clips.create')}
              onPress={() => { if (createLockRef.current) return; createLockRef.current = true; createMutation.mutate(); }}
              disabled={!isValid || createMutation.isPending}
              loading={createMutation.isPending}
              fullWidth
              size="lg"
              icon="send"
            />
          </Animated.View>
        </ScrollView>
      </View>
    </ScreenErrorBoundary>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { flex: 1 },
  content: { padding: spacing.base, paddingBottom: spacing['2xl'] },
  thumbnailWrap: { borderRadius: radius.lg, overflow: 'hidden', marginBottom: spacing.xl, position: 'relative' },
  thumbnail: { width: '100%', aspectRatio: 16 / 9, borderRadius: radius.lg },
  durationBadge: {
    position: 'absolute',
    bottom: spacing.sm,
    end: spacing.sm,
    backgroundColor: 'rgba(0,0,0,0.7)',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.sm,
  },
  durationText: { color: '#FFF', fontSize: fontSize.xs, fontWeight: '600' as const, fontVariant: ['tabular-nums'] as const },
  timeSection: { marginBottom: spacing.xl },
  sectionLabel: { fontSize: fontSize.sm, fontWeight: '500', marginBottom: spacing.sm },
  timeControls: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  timeBtn: {
    width: 36,
    height: 36,
    borderRadius: radius.full,
    justifyContent: 'center',
    alignItems: 'center',
  },
  timeDisplay: {
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderWidth: 1,
  },
  timeText: { color: colors.emerald, fontSize: fontSize.md, fontWeight: '700', fontVariant: ['tabular-nums'] },
  timeSep: { fontSize: fontSize.base, marginHorizontal: spacing.xs },
  durationLabel: { fontSize: fontSize.xs, marginTop: spacing.sm },
  section: { marginBottom: spacing.xl },
  titleHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm },
  input: {
    borderRadius: radius.md,
    borderWidth: 1,
    padding: spacing.md,
    fontSize: fontSize.base,
  },
  infoCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    marginBottom: spacing.md,
  },
  infoText: { fontSize: fontSize.sm, flex: 1 },
  hint: { fontSize: fontSize.xs, marginBottom: spacing.xl },
  submitSection: { marginTop: spacing.md },
});
