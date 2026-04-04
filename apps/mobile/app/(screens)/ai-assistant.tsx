import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TextInput,
  Pressable, ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { showToast } from '@/components/ui/Toast';
import Animated, { FadeInUp, FadeInDown, FadeIn } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useMutation } from '@tanstack/react-query';
import { GlassHeader } from '@/components/ui/GlassHeader';
import { Icon } from '@/components/ui/Icon';
import type { IconName } from '@/components/ui/Icon';
import { EmptyState } from '@/components/ui/EmptyState';
import { ScreenErrorBoundary } from '@/components/ui/ScreenErrorBoundary';
import { colors, spacing, fontSize, radius, fontSizeExt, fonts } from '@/theme';
import { aiApi } from '@/services/api';
import { useContextualHaptic } from '@/hooks/useContextualHaptic';
import { useTranslation } from '@/hooks/useTranslation';
import { useThemeColors } from '@/hooks/useThemeColors';
import type { AiCaptionSuggestion } from '@/types';

type TabId = 'captions' | 'hashtags' | 'ideas';

const TABS: { id: TabId; icon: IconName; label: string }[] = [
  { id: 'captions', icon: 'pencil', label: 'ai.tabs.captions' },
  { id: 'hashtags', icon: 'hash', label: 'ai.tabs.hashtags' },
  { id: 'ideas', icon: 'loader', label: 'ai.tabs.ideas' },
];

const TONE_PURPLE = '#9333EA';

const TONE_COLORS: Record<string, string> = {
  casual: colors.emerald,
  professional: colors.info,
  funny: colors.gold,
  inspirational: TONE_PURPLE,
};

export default function AiAssistantScreen() {
  const router = useRouter();
  const tc = useThemeColors();
  const haptic = useContextualHaptic();
  const { t, isRTL } = useTranslation();

  const [activeTab, setActiveTab] = useState<TabId>('captions');
  const [input, setInput] = useState('');
  const [captions, setCaptions] = useState<AiCaptionSuggestion[]>([]);
  const [hashtags, setHashtags] = useState<string[]>([]);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  const generateLockRef = useRef(false);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    return () => { if (copyTimerRef.current) clearTimeout(copyTimerRef.current); };
  }, []);

  // Caption suggestion
  const captionMutation = useMutation({
    mutationFn: () => aiApi.suggestCaptions(input),
    onSuccess: (data) => {
      setCaptions(Array.isArray(data) ? data : []);
      haptic.success();
      showToast({ message: t('ai.generated'), variant: 'success' });
    },
    onError: () => {
      showToast({ message: t('common.somethingWentWrong'), variant: 'error' });
    },
    onSettled: () => { generateLockRef.current = false; },
  });

  // Hashtag suggestion
  const hashtagMutation = useMutation({
    mutationFn: () => aiApi.suggestHashtags(input),
    onSuccess: (data) => {
      setHashtags(Array.isArray(data) ? data : []);
      haptic.success();
      showToast({ message: t('ai.generated'), variant: 'success' });
    },
    onError: () => {
      showToast({ message: t('common.somethingWentWrong'), variant: 'error' });
    },
    onSettled: () => { generateLockRef.current = false; },
  });

  // Posting time
  const timeMutation = useMutation({
    mutationFn: () => aiApi.suggestPostingTime(),
    onError: () => {
      showToast({ message: t('common.somethingWentWrong'), variant: 'error' });
    },
    onSettled: () => { generateLockRef.current = false; },
  });

  const handleGenerate = useCallback(() => {
    if (!input.trim() && activeTab !== 'ideas') return;
    if (generateLockRef.current) return;
    generateLockRef.current = true;
    haptic.send();

    if (activeTab === 'captions') {
      captionMutation.mutate();
    } else if (activeTab === 'hashtags') {
      hashtagMutation.mutate();
    } else {
      timeMutation.mutate();
    }
  }, [activeTab, input]);

  const handleCopyCaption = (text: string, index: number) => {
    void Clipboard.setStringAsync(text);
    setCopiedIndex(index);
    haptic.success();
    showToast({ message: t('common.copied'), variant: 'success' });
    if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    copyTimerRef.current = setTimeout(() => {
      copyTimerRef.current = null;
      setCopiedIndex(null);
    }, 2000);
  };

  const handleCopyHashtags = () => {
    void Clipboard.setStringAsync(hashtags.map(h => `#${h}`).join(' '));
    haptic.success();
    showToast({ message: t('common.copied'), variant: 'success' });
  };

  const isLoading = captionMutation.isPending || hashtagMutation.isPending || timeMutation.isPending;

  return (
    <ScreenErrorBoundary>
      <View style={[styles.container, { backgroundColor: tc.bg }]}>
        <GlassHeader
          title={t('ai.title')}
          leftAction={{ icon: 'arrow-left', onPress: () => router.back() }}
        />

        <KeyboardAvoidingView style={styles.scroll} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
          {/* Tab selector */}
          <Animated.View entering={FadeInUp.duration(300)} style={styles.tabRow}>
            {TABS.map((tab) => (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t(tab.label)}
                key={tab.id}
                onPress={() => { setActiveTab(tab.id); haptic.tick(); }}
                style={[styles.tab, { backgroundColor: tc.bgCard, borderColor: tc.border }, activeTab === tab.id && styles.tabActive]}
              >
                <Icon
                  name={tab.icon}
                  size="sm"
                  color={activeTab === tab.id ? colors.emerald : tc.text.secondary}
                />
                <Text style={[styles.tabLabel, { color: tc.text.secondary }, activeTab === tab.id && styles.tabLabelActive]}>
                  {t(tab.label)}
                </Text>
              </Pressable>
            ))}
          </Animated.View>

          {/* Input */}
          {activeTab !== 'ideas' && (
            <Animated.View entering={FadeInUp.delay(100).duration(300)} style={[styles.inputCard, { backgroundColor: tc.bgCard, borderColor: tc.border }]}>
              <TextInput
                style={[styles.input, { color: tc.text.primary }, isRTL && { textAlign: 'right' }]}
                value={input}
                onChangeText={setInput}
                placeholder={
                  activeTab === 'captions'
                    ? t('ai.captionPlaceholder')
                    : t('ai.hashtagPlaceholder')
                }
                placeholderTextColor={tc.text.tertiary}
                multiline
                maxLength={500}
              />
            </Animated.View>
          )}

          {/* Generate button */}
          <Animated.View entering={FadeInUp.delay(150).duration(300)} style={styles.generateSection}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('ai.generate')}
              onPress={handleGenerate}
              disabled={isLoading || (!input.trim() && activeTab !== 'ideas')}
              style={[styles.generateBtn, (isLoading || (!input.trim() && activeTab !== 'ideas')) && { opacity: 0.5 }]}
            >
              <LinearGradient
                colors={[colors.emerald, '#0D9B63']}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                style={styles.generateGradient}
              >
                {isLoading ? (
                  <ActivityIndicator color="#FFF" size="small" />
                ) : (
                  <>
                    <Icon name="loader" size="sm" color="#FFF" />
                    <Text style={styles.generateText}>{t('ai.generate')}</Text>
                  </>
                )}
              </LinearGradient>
            </Pressable>
          </Animated.View>

          {/* Results: Captions */}
          {activeTab === 'captions' && captions.length > 0 && (
            <View style={styles.results}>
              <Text style={[styles.resultsTitle, { color: tc.text.secondary }]}>{t('ai.suggestions')}</Text>
              {captions.map((suggestion, i) => (
                <Animated.View
                  key={i}
                  entering={FadeInUp.delay(i * 80).duration(300)}
                >
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t('ai.suggestions')}
                    style={[styles.captionCard, { backgroundColor: tc.bgCard, borderColor: tc.border }]}
                    onPress={() => handleCopyCaption(suggestion.caption, i)}
                  >
                    <View style={styles.captionHeader}>
                      <View style={[styles.toneBadge, { backgroundColor: (TONE_COLORS[suggestion.tone] || colors.emerald) + '20' }]}>
                        <Text style={[styles.toneText, { color: TONE_COLORS[suggestion.tone] || colors.emerald }]}>
                          {suggestion.tone}
                        </Text>
                      </View>
                      <Icon
                        name={copiedIndex === i ? 'check' : 'layers'}
                        size="xs"
                        color={copiedIndex === i ? colors.emerald : tc.text.tertiary}
                      />
                    </View>
                    <Text style={[styles.captionText, { color: tc.text.primary }]}>{suggestion.caption}</Text>
                  </Pressable>
                </Animated.View>
              ))}
            </View>
          )}

          {/* Results: Hashtags */}
          {activeTab === 'hashtags' && hashtags.length > 0 && (
            <Animated.View entering={FadeIn.duration(300)} style={styles.results}>
              <View style={styles.hashtagHeader}>
                <Text style={[styles.resultsTitle, { color: tc.text.secondary }]}>{t('ai.suggestions')}</Text>
                <Pressable accessibilityRole="button" accessibilityLabel={t('ai.copyAll')} onPress={handleCopyHashtags} style={styles.copyAllBtn}>
                  <Icon name="layers" size="xs" color={colors.emerald} />
                  <Text style={styles.copyAllText}>{t('ai.copyAll')}</Text>
                </Pressable>
              </View>
              <View style={styles.hashtagGrid}>
                {hashtags.map((tag, i) => (
                  <Animated.View key={tag} entering={FadeInUp.delay(i * 50).duration(200)}>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`#${tag}`}
                      style={styles.hashtagChip}
                      onPress={() => { void Clipboard.setStringAsync(`#${tag}`); haptic.success(); }}
                    >
                      <Text style={styles.hashtagText}>#{tag}</Text>
                    </Pressable>
                  </Animated.View>
                ))}
              </View>
            </Animated.View>
          )}

          {/* Results: Best Posting Time */}
          {activeTab === 'ideas' && timeMutation.data && (
            <Animated.View entering={FadeIn.duration(300)} style={styles.timeCard}>
              <LinearGradient
                colors={[colors.gold + '20', 'transparent']}
                style={styles.timeCardGradient}
              >
                <Icon name="clock" size="lg" color={colors.gold} />
                <Text style={[styles.timeTitle, { color: tc.text.secondary }]}>{t('ai.bestTime')}</Text>
                <Text style={styles.timeValue}>
                  {(timeMutation.data as { bestTime: string }).bestTime}
                </Text>
                <Text style={[styles.timeReason, { color: tc.text.tertiary }]}>
                  {(timeMutation.data as { reason: string }).reason}
                </Text>
              </LinearGradient>
            </Animated.View>
          )}

          {/* Empty state */}
          {!isLoading && captions.length === 0 && hashtags.length === 0 && !timeMutation.data && (
            <Animated.View entering={FadeIn.delay(200).duration(300)} style={styles.emptyWrap}>
              <EmptyState
                icon="loader"
                title={t('ai.emptyTitle')}
                subtitle={t('ai.emptySubtitle')}
              />
            </Animated.View>
          )}
        </ScrollView>
        </KeyboardAvoidingView>
      </View>
    </ScreenErrorBoundary>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { flex: 1 },
  content: { padding: spacing.base, paddingBottom: spacing['2xl'] },
  tabRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.xl,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  tabActive: {
    borderColor: colors.emerald,
    backgroundColor: colors.emerald + '10',
  },
  tabLabel: {
    fontSize: fontSize.sm,
    fontWeight: '500',
  },
  tabLabelActive: { color: colors.emerald },
  inputCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
    marginBottom: spacing.base,
  },
  input: {
    fontSize: fontSize.base,
    padding: spacing.base,
    minHeight: spacing.base * 6,
    textAlignVertical: 'top',
  },
  generateSection: { marginBottom: spacing.xl },
  generateBtn: { borderRadius: radius.md, overflow: 'hidden' },
  generateGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
  },
  generateText: { color: '#FFF', fontSize: fontSize.base, fontWeight: '700' },
  results: { marginBottom: spacing.xl },
  resultsTitle: { fontSize: fontSize.sm, fontWeight: '600', marginBottom: spacing.md, textTransform: 'uppercase', letterSpacing: 1 },
  captionCard: {
    borderRadius: radius.lg,
    padding: spacing.base,
    borderWidth: 1,
    marginBottom: spacing.md,
  },
  captionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  toneBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.full,
  },
  toneText: { fontSize: fontSize.xs, fontWeight: '600', textTransform: 'capitalize' },
  captionText: { fontSize: fontSize.base, lineHeight: 22 },
  hashtagHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  copyAllBtn: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  copyAllText: { color: colors.emerald, fontSize: fontSize.sm, fontWeight: '500' },
  hashtagGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  hashtagChip: {
    backgroundColor: colors.emerald + '15',
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderWidth: 1,
    borderColor: colors.emerald + '30',
  },
  hashtagText: { color: colors.emerald, fontSize: fontSize.sm, fontWeight: '500' },
  timeCard: { borderRadius: radius.lg, overflow: 'hidden', marginBottom: spacing.xl },
  timeCardGradient: {
    padding: spacing.xl,
    alignItems: 'center',
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.gold + '30',
  },
  timeTitle: { fontSize: fontSize.sm, fontWeight: '500', marginTop: spacing.md },
  timeValue: { color: colors.gold, fontSize: fontSizeExt.jumbo, fontWeight: '700', fontVariant: ['tabular-nums'], marginVertical: spacing.sm },
  timeReason: { fontSize: fontSize.sm, textAlign: 'center' },
  emptyWrap: { marginTop: spacing['2xl'] },
});
