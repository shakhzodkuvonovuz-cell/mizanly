import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput, Pressable, Platform, Alert } from 'react-native';
import Animated, { FadeInUp, FadeInDown } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { GlassHeader } from '@/components/ui/GlassHeader';
import { Icon } from '@/components/ui/Icon';
import { ScreenErrorBoundary } from '@/components/ui/ScreenErrorBoundary';
import { colors, spacing, fontSize, radius } from '@/theme';
import { videosApi } from '@/services/api';
import { useContextualHaptic } from '@/hooks/useContextualHaptic';
import { useTranslation } from '@/hooks/useTranslation';
import { useThemeColors } from '@/hooks/useThemeColors';
import { showToast } from '@/components/ui/Toast';

const THEMES = [
  { id: 'emerald', label: 'premiere.themeEmerald', colors: [colors.emerald, '#0D9B63'] },
  { id: 'gold', label: 'premiere.themeGold', colors: [colors.gold, '#D4A94F'] },
  { id: 'cosmic', label: 'premiere.themeCosmic', colors: [colors.extended.violet, '#4F46E5'] },
];

export default function VideoPremiereScreen() {
  const tc = useThemeColors();
  const styles = createStyles(tc);
  const { videoId, videoTitle } = useLocalSearchParams<{ videoId: string; videoTitle?: string }>();
  const router = useRouter();
  const haptic = useContextualHaptic();
  const { t, isRTL } = useTranslation();
  const queryClient = useQueryClient();

  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [chatEnabled, setChatEnabled] = useState(true);
  const [selectedTheme, setSelectedTheme] = useState('emerald');

  const createMutation = useMutation({
    mutationFn: () => {
      const scheduledAt = new Date(`${date}T${time}:00`).toISOString();
      return videosApi.createPremiere(videoId as string, {
        scheduledAt,
        chatEnabled,
        countdownTheme: selectedTheme,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['video', videoId] });
      haptic.save();
      showToast({ message: t('premiere.scheduled'), variant: 'success' });
      router.back();
    },
    onError: () => {
      showToast({ message: t('common.somethingWentWrong'), variant: 'error' });
    },
  });

  const handleSchedule = useCallback(() => {
    const isValidDate = /^\d{4}-\d{2}-\d{2}$/.test(date);
    const isValidTime = /^\d{2}:\d{2}$/.test(time);
    if (!isValidDate || !isValidTime) {
      Alert.alert(t('common.error'), t('premiere.invalidDateTime'));
      return;
    }
    createMutation.mutate();
  }, [date, time, t, createMutation]);

  const isValid = date.length >= 10 && time.length >= 5;

  return (
    <ScreenErrorBoundary>
      <View style={styles.container}>
        <GlassHeader
          title={t('premiere.schedule')}
          leftAction={{ icon: 'arrow-left', onPress: () => router.back() }}
        />
        <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
          {/* Video info */}
          <Animated.View entering={FadeInUp.duration(300)} style={styles.card}>
            <Icon name="video" size="md" color={colors.emerald} />
            <Text style={styles.videoTitle} numberOfLines={2}>{videoTitle || 'Video'}</Text>
          </Animated.View>

          {/* Date */}
          <Animated.View entering={FadeInUp.delay(100).duration(300)} style={styles.section}>
            <Text style={styles.label}>{t('premiere.dateLabel')}</Text>
            <TextInput
              style={styles.input}
              value={date}
              onChangeText={setDate}
              placeholder="2026-03-25"
              placeholderTextColor={colors.text.tertiary}
              keyboardType={Platform.OS === 'ios' ? 'default' : 'default'}
            />
          </Animated.View>

          {/* Time */}
          <Animated.View entering={FadeInUp.delay(150).duration(300)} style={styles.section}>
            <Text style={styles.label}>{t('premiere.timeLabel')}</Text>
            <TextInput
              style={styles.input}
              value={time}
              onChangeText={setTime}
              placeholder="18:00"
              placeholderTextColor={colors.text.tertiary}
            />
          </Animated.View>

          {/* Theme */}
          <Animated.View entering={FadeInUp.delay(200).duration(300)} style={styles.section}>
            <Text style={styles.label}>{t('premiere.countdownTheme')}</Text>
            <View style={styles.themeRow}>
              {THEMES.map(theme => (
                <Pressable
                  accessibilityRole="button"
                  key={theme.id}
                  onPress={() => { setSelectedTheme(theme.id); haptic.tick(); }}
                  style={[styles.themeCard, selectedTheme === theme.id && styles.themeCardActive]}
                >
                  <LinearGradient
                    colors={theme.colors as [string, string]}
                    style={styles.themeGradient}
                  />
                  <Text style={styles.themeLabel}>{t(theme.label)}</Text>
                </Pressable>
              ))}
            </View>
          </Animated.View>

          {/* Chat toggle */}
          <Animated.View entering={FadeInUp.delay(250).duration(300)} style={styles.toggleRow}>
            <View>
              <Text style={styles.toggleLabel}>{t('premiere.enableChat')}</Text>
              <Text style={styles.toggleHint}>{t('premiere.enableChatHint')}</Text>
            </View>
            <Pressable
              accessibilityRole="button"
              onPress={() => { setChatEnabled(!chatEnabled); haptic.tick(); }}
              style={[styles.toggleBtn, chatEnabled && styles.toggleBtnActive]}
            >
              <View style={[styles.toggleKnob, chatEnabled && styles.toggleKnobActive]} />
            </Pressable>
          </Animated.View>

          {/* Submit */}
          <Animated.View entering={FadeInDown.delay(300).duration(300)} style={styles.submitSection}>
            <Pressable
              accessibilityRole="button"
              onPress={handleSchedule}
              disabled={!isValid || createMutation.isPending}
              style={[styles.submitBtn, (!isValid || createMutation.isPending) && { opacity: 0.5 }]}
            >
              <LinearGradient
                colors={[colors.emerald, '#0D9B63']}
                style={styles.submitGradient}
              >
                <Text style={styles.submitText}>{t('premiere.schedule')}</Text>
              </LinearGradient>
            </Pressable>
          </Animated.View>
        </ScrollView>
      </View>
    </ScreenErrorBoundary>
  );
}

const createStyles = (tc: ReturnType<typeof useThemeColors>) => StyleSheet.create({
  container: { flex: 1, backgroundColor: tc.bg },
  scroll: { flex: 1 },
  content: { padding: spacing.base, paddingBottom: spacing['2xl'] },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: tc.bgCard,
    padding: spacing.base,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: tc.border,
    marginBottom: spacing.xl,
  },
  videoTitle: { color: colors.text.primary, fontSize: fontSize.base, fontWeight: '600', flex: 1 },
  section: { marginBottom: spacing.xl },
  label: { color: colors.text.secondary, fontSize: fontSize.sm, fontWeight: '500', marginBottom: spacing.sm },
  input: {
    backgroundColor: tc.bgCard,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: tc.border,
    padding: spacing.md,
    color: colors.text.primary,
    fontSize: fontSize.base,
  },
  themeRow: { flexDirection: 'row', gap: spacing.md },
  themeCard: {
    flex: 1,
    alignItems: 'center',
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 2,
    borderColor: 'transparent',
    backgroundColor: tc.bgCard,
  },
  themeCardActive: { borderColor: colors.emerald },
  themeGradient: { width: 40, height: 40, borderRadius: radius.full },
  themeLabel: { color: colors.text.secondary, fontSize: fontSize.xs, marginTop: spacing.sm },
  toggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: tc.bgCard,
    padding: spacing.base,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: tc.border,
    marginBottom: spacing.xl,
  },
  toggleLabel: { color: colors.text.primary, fontSize: fontSize.base, fontWeight: '500' },
  toggleHint: { color: colors.text.tertiary, fontSize: fontSize.xs, marginTop: 2 },
  toggleBtn: {
    width: 48,
    height: 28,
    borderRadius: radius.full,
    backgroundColor: tc.surface,
    justifyContent: 'center',
    padding: 2,
  },
  toggleBtnActive: { backgroundColor: colors.emerald },
  toggleKnob: {
    width: 24,
    height: 24,
    borderRadius: radius.full,
    backgroundColor: colors.text.secondary,
  },
  toggleKnobActive: { alignSelf: 'flex-end', backgroundColor: '#FFF' },
  submitSection: { marginTop: spacing.md },
  submitBtn: { borderRadius: radius.md, overflow: 'hidden' },
  submitGradient: { paddingVertical: spacing.base, alignItems: 'center', borderRadius: radius.md },
  submitText: { color: '#FFF', fontSize: fontSize.md, fontWeight: '700' },
});
