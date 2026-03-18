import React, { useState, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput, Pressable } from 'react-native';
import Animated, { FadeInUp, FadeInDown } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { GlassHeader } from '@/components/ui/GlassHeader';
import { Icon } from '@/components/ui/Icon';
import { CharCountRing } from '@/components/ui/CharCountRing';
import { ScreenErrorBoundary } from '@/components/ui/ScreenErrorBoundary';
import { colors, spacing, fontSize, radius } from '@/theme';
import { clipsApi } from '@/services/api';
import { useHaptic } from '@/hooks/useHaptic';
import { useTranslation } from '@/hooks/useTranslation';

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export default function CreateClipScreen() {
  const { videoId, currentTime, duration, thumbnailUrl, videoTitle } = useLocalSearchParams<{
    videoId: string;
    currentTime?: string;
    duration?: string;
    thumbnailUrl?: string;
    videoTitle?: string;
  }>();
  const router = useRouter();
  const haptic = useHaptic();
  const { t, isRTL } = useTranslation();
  const queryClient = useQueryClient();

  const totalDuration = parseFloat(duration || '300');
  const startDefault = Math.max(0, parseFloat(currentTime || '0') - 15);

  const [title, setTitle] = useState('');
  const [startTime, setStartTime] = useState(startDefault);
  const [endTime, setEndTime] = useState(Math.min(startDefault + 30, totalDuration));

  const clipDuration = useMemo(() => Math.max(0, endTime - startTime), [startTime, endTime]);
  const isValid = clipDuration >= 0.5 && clipDuration <= 60 && endTime <= totalDuration;

  const createMutation = useMutation({
    mutationFn: () => clipsApi.create(videoId as string, {
      startTime,
      endTime,
      title: title.trim() || undefined,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clips', videoId] });
      haptic.success();
      router.back();
    },
  });

  const adjustStart = (delta: number) => {
    const newStart = Math.max(0, Math.min(startTime + delta, endTime - 0.5));
    setStartTime(newStart);
    haptic.light();
  };

  const adjustEnd = (delta: number) => {
    const newEnd = Math.min(totalDuration, Math.max(endTime + delta, startTime + 0.5));
    setEndTime(newEnd);
    haptic.light();
  };

  return (
    <ScreenErrorBoundary>
      <View style={styles.container}>
        <GlassHeader
          title={t('clips.title')}
          leftAction={{ icon: 'arrow-left', onPress: () => router.back() }}
        />
        <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
          {/* Thumbnail */}
          <Animated.View entering={FadeInUp.duration(300)} style={styles.thumbnailWrap}>
            {thumbnailUrl ? (
              <Image source={{ uri: thumbnailUrl }} style={styles.thumbnail} contentFit="cover" />
            ) : (
              <View style={[styles.thumbnail, { backgroundColor: colors.dark.surface, justifyContent: 'center', alignItems: 'center' }]}>
                <Icon name="video" size="xl" color={colors.text.tertiary} />
              </View>
            )}
            <View style={styles.durationBadge}>
              <Text style={styles.durationText}>{formatTime(clipDuration)}</Text>
            </View>
          </Animated.View>

          {/* Time range controls */}
          <Animated.View entering={FadeInUp.delay(100).duration(300)} style={styles.timeSection}>
            <Text style={styles.sectionLabel}>{t('clips.from')}</Text>
            <View style={styles.timeControls}>
              <Pressable onPress={() => adjustStart(-5)} style={styles.timeBtn}>
                <Icon name="chevron-left" size="sm" color={colors.text.primary} />
              </Pressable>
              <View style={styles.timeDisplay}>
                <Text style={styles.timeText}>{formatTime(startTime)}</Text>
              </View>
              <Pressable onPress={() => adjustStart(5)} style={styles.timeBtn}>
                <Icon name="chevron-right" size="sm" color={colors.text.primary} />
              </Pressable>
              <Text style={styles.timeSep}>—</Text>
              <Pressable onPress={() => adjustEnd(-5)} style={styles.timeBtn}>
                <Icon name="chevron-left" size="sm" color={colors.text.primary} />
              </Pressable>
              <View style={styles.timeDisplay}>
                <Text style={styles.timeText}>{formatTime(endTime)}</Text>
              </View>
              <Pressable onPress={() => adjustEnd(5)} style={styles.timeBtn}>
                <Icon name="chevron-right" size="sm" color={colors.text.primary} />
              </Pressable>
            </View>
            <Text style={styles.durationLabel}>
              {t('clips.duration')}: {formatTime(clipDuration)}
              {clipDuration > 60 && ` (${t('clips.maxDuration')})`}
            </Text>
          </Animated.View>

          {/* Title */}
          <Animated.View entering={FadeInUp.delay(150).duration(300)} style={styles.section}>
            <View style={styles.titleHeader}>
              <Text style={styles.sectionLabel}>{t('clips.clipTitle')}</Text>
              <CharCountRing current={title.length} max={100} size={24} />
            </View>
            <TextInput
              style={styles.input}
              value={title}
              onChangeText={(text) => setTitle(text.slice(0, 100))}
              placeholder={t('clips.titlePlaceholder')}
              placeholderTextColor={colors.text.tertiary}
              maxLength={100}
            />
          </Animated.View>

          {/* Source info */}
          <Animated.View entering={FadeInUp.delay(200).duration(300)} style={styles.infoCard}>
            <Icon name="link" size="sm" color={colors.text.secondary} />
            <Text style={styles.infoText} numberOfLines={1}>{videoTitle || 'Source video'}</Text>
          </Animated.View>

          {/* Max duration hint */}
          <Text style={styles.hint}>{t('clips.maxDuration')}</Text>

          {/* Submit */}
          <Animated.View entering={FadeInDown.delay(250).duration(300)} style={styles.submitSection}>
            <Pressable
              onPress={() => createMutation.mutate()}
              disabled={!isValid || createMutation.isPending}
              style={[styles.submitBtn, (!isValid || createMutation.isPending) && { opacity: 0.5 }]}
            >
              <LinearGradient colors={[colors.emerald, '#0D9B63']} style={styles.submitGradient}>
                <Text style={styles.submitText}>
                  {createMutation.isPending ? t('clips.creating') : t('clips.create')}
                </Text>
              </LinearGradient>
            </Pressable>
          </Animated.View>
        </ScrollView>
      </View>
    </ScreenErrorBoundary>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.dark.bg },
  scroll: { flex: 1 },
  content: { padding: spacing.base, paddingBottom: spacing['2xl'] },
  thumbnailWrap: { borderRadius: radius.lg, overflow: 'hidden', marginBottom: spacing.xl, position: 'relative' },
  thumbnail: { width: '100%', aspectRatio: 16 / 9, borderRadius: radius.lg },
  durationBadge: {
    position: 'absolute',
    bottom: spacing.sm,
    right: spacing.sm,
    backgroundColor: 'rgba(0,0,0,0.7)',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.sm,
  },
  durationText: { color: '#FFF', fontSize: fontSize.xs, fontWeight: '600', fontVariant: ['tabular-nums'] },
  timeSection: { marginBottom: spacing.xl },
  sectionLabel: { color: colors.text.secondary, fontSize: fontSize.sm, fontWeight: '500', marginBottom: spacing.sm },
  timeControls: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  timeBtn: {
    width: 36,
    height: 36,
    borderRadius: radius.full,
    backgroundColor: colors.dark.surface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  timeDisplay: {
    backgroundColor: colors.dark.bgCard,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderWidth: 1,
    borderColor: colors.dark.border,
  },
  timeText: { color: colors.emerald, fontSize: fontSize.md, fontWeight: '700', fontVariant: ['tabular-nums'] },
  timeSep: { color: colors.text.tertiary, fontSize: fontSize.base, marginHorizontal: spacing.xs },
  durationLabel: { color: colors.text.tertiary, fontSize: fontSize.xs, marginTop: spacing.sm },
  section: { marginBottom: spacing.xl },
  titleHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm },
  input: {
    backgroundColor: colors.dark.bgCard,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.dark.border,
    padding: spacing.md,
    color: colors.text.primary,
    fontSize: fontSize.base,
  },
  infoCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.dark.bgCard,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.dark.border,
    marginBottom: spacing.md,
  },
  infoText: { color: colors.text.secondary, fontSize: fontSize.sm, flex: 1 },
  hint: { color: colors.text.tertiary, fontSize: fontSize.xs, marginBottom: spacing.xl },
  submitSection: { marginTop: spacing.md },
  submitBtn: { borderRadius: radius.md, overflow: 'hidden' },
  submitGradient: { paddingVertical: spacing.base, alignItems: 'center', borderRadius: radius.md },
  submitText: { color: '#FFF', fontSize: fontSize.md, fontWeight: '700' },
});
