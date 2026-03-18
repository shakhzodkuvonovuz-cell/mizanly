import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TextInput,
  TouchableOpacity, Pressable, ActivityIndicator, Clipboard,
} from 'react-native';
import Animated, { FadeInUp, FadeInDown, FadeIn } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useMutation } from '@tanstack/react-query';
import { GlassHeader } from '@/components/ui/GlassHeader';
import { Icon } from '@/components/ui/Icon';
import type { IconName } from '@/components/ui/Icon';
import { EmptyState } from '@/components/ui/EmptyState';
import { ScreenErrorBoundary } from '@/components/ui/ScreenErrorBoundary';
import { colors, spacing, fontSize, radius } from '@/theme';
import { aiApi } from '@/services/api';
import { useHaptic } from '@/hooks/useHaptic';
import { useTranslation } from '@/hooks/useTranslation';
import type { AiCaptionSuggestion } from '@/types';

type TabId = 'captions' | 'hashtags' | 'ideas';

const TABS: { id: TabId; icon: IconName; label: string }[] = [
  { id: 'captions', icon: 'pencil', label: 'ai.tabs.captions' },
  { id: 'hashtags', icon: 'hash', label: 'ai.tabs.hashtags' },
  { id: 'ideas', icon: 'loader', label: 'ai.tabs.ideas' },
];

const TONE_COLORS: Record<string, string> = {
  casual: colors.emerald,
  professional: colors.info,
  funny: colors.gold,
  inspirational: '#9333EA',
};

export default function AiAssistantScreen() {
  const router = useRouter();
  const haptic = useHaptic();
  const { t, isRTL } = useTranslation();

  const [activeTab, setActiveTab] = useState<TabId>('captions');
  const [input, setInput] = useState('');
  const [captions, setCaptions] = useState<AiCaptionSuggestion[]>([]);
  const [hashtags, setHashtags] = useState<string[]>([]);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  // Caption suggestion
  const captionMutation = useMutation({
    mutationFn: () => aiApi.suggestCaptions(input),
    onSuccess: (data) => {
      setCaptions(Array.isArray(data) ? data : []);
      haptic.success();
    },
  });

  // Hashtag suggestion
  const hashtagMutation = useMutation({
    mutationFn: () => aiApi.suggestHashtags(input),
    onSuccess: (data) => {
      setHashtags(Array.isArray(data) ? data : []);
      haptic.success();
    },
  });

  // Posting time
  const timeMutation = useMutation({
    mutationFn: () => aiApi.suggestPostingTime(),
  });

  const handleGenerate = useCallback(() => {
    if (!input.trim() && activeTab !== 'ideas') return;
    haptic.light();

    if (activeTab === 'captions') {
      captionMutation.mutate();
    } else if (activeTab === 'hashtags') {
      hashtagMutation.mutate();
    } else {
      timeMutation.mutate();
    }
  }, [activeTab, input]);

  const handleCopyCaption = (text: string, index: number) => {
    Clipboard.setString(text);
    setCopiedIndex(index);
    haptic.success();
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  const handleCopyHashtags = () => {
    Clipboard.setString(hashtags.map(h => `#${h}`).join(' '));
    haptic.success();
  };

  const isLoading = captionMutation.isPending || hashtagMutation.isPending || timeMutation.isPending;

  return (
    <ScreenErrorBoundary>
      <View style={styles.container}>
        <GlassHeader
          title={t('ai.title')}
          leftAction={{ icon: 'arrow-left', onPress: () => router.back() }}
        />

        <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
          {/* Tab selector */}
          <Animated.View entering={FadeInUp.duration(300)} style={styles.tabRow}>
            {TABS.map((tab) => (
              <Pressable
                key={tab.id}
                onPress={() => { setActiveTab(tab.id); haptic.light(); }}
                style={[styles.tab, activeTab === tab.id && styles.tabActive]}
              >
                <Icon
                  name={tab.icon}
                  size="sm"
                  color={activeTab === tab.id ? colors.emerald : colors.text.secondary}
                />
                <Text style={[styles.tabLabel, activeTab === tab.id && styles.tabLabelActive]}>
                  {t(tab.label)}
                </Text>
              </Pressable>
            ))}
          </Animated.View>

          {/* Input */}
          {activeTab !== 'ideas' && (
            <Animated.View entering={FadeInUp.delay(100).duration(300)} style={styles.inputCard}>
              <TextInput
                style={[styles.input, isRTL && { textAlign: 'right' }]}
                value={input}
                onChangeText={setInput}
                placeholder={
                  activeTab === 'captions'
                    ? t('ai.captionPlaceholder')
                    : t('ai.hashtagPlaceholder')
                }
                placeholderTextColor={colors.text.tertiary}
                multiline
                maxLength={500}
              />
            </Animated.View>
          )}

          {/* Generate button */}
          <Animated.View entering={FadeInUp.delay(150).duration(300)} style={styles.generateSection}>
            <TouchableOpacity
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
            </TouchableOpacity>
          </Animated.View>

          {/* Results: Captions */}
          {activeTab === 'captions' && captions.length > 0 && (
            <View style={styles.results}>
              <Text style={styles.resultsTitle}>{t('ai.suggestions')}</Text>
              {captions.map((suggestion, i) => (
                <Animated.View
                  key={i}
                  entering={FadeInUp.delay(i * 80).duration(300)}
                >
                  <TouchableOpacity
                    style={styles.captionCard}
                    onPress={() => handleCopyCaption(suggestion.caption, i)}
                    activeOpacity={0.7}
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
                        color={copiedIndex === i ? colors.emerald : colors.text.tertiary}
                      />
                    </View>
                    <Text style={styles.captionText}>{suggestion.caption}</Text>
                  </TouchableOpacity>
                </Animated.View>
              ))}
            </View>
          )}

          {/* Results: Hashtags */}
          {activeTab === 'hashtags' && hashtags.length > 0 && (
            <Animated.View entering={FadeIn.duration(300)} style={styles.results}>
              <View style={styles.hashtagHeader}>
                <Text style={styles.resultsTitle}>{t('ai.suggestions')}</Text>
                <TouchableOpacity onPress={handleCopyHashtags} style={styles.copyAllBtn}>
                  <Icon name="layers" size="xs" color={colors.emerald} />
                  <Text style={styles.copyAllText}>{t('ai.copyAll')}</Text>
                </TouchableOpacity>
              </View>
              <View style={styles.hashtagGrid}>
                {hashtags.map((tag, i) => (
                  <Animated.View key={tag} entering={FadeInUp.delay(i * 50).duration(200)}>
                    <TouchableOpacity
                      style={styles.hashtagChip}
                      onPress={() => { Clipboard.setString(`#${tag}`); haptic.light(); }}
                    >
                      <Text style={styles.hashtagText}>#{tag}</Text>
                    </TouchableOpacity>
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
                <Text style={styles.timeTitle}>{t('ai.bestTime')}</Text>
                <Text style={styles.timeValue}>
                  {(timeMutation.data as { bestTime: string }).bestTime}
                </Text>
                <Text style={styles.timeReason}>
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
      </View>
    </ScreenErrorBoundary>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.dark.bg },
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
    backgroundColor: colors.dark.bgCard,
    borderWidth: 1,
    borderColor: colors.dark.border,
  },
  tabActive: {
    borderColor: colors.emerald,
    backgroundColor: colors.emerald + '10',
  },
  tabLabel: {
    color: colors.text.secondary,
    fontSize: fontSize.sm,
    fontWeight: '500',
  },
  tabLabelActive: { color: colors.emerald },
  inputCard: {
    backgroundColor: colors.dark.bgCard,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.dark.border,
    marginBottom: spacing.base,
  },
  input: {
    color: colors.text.primary,
    fontSize: fontSize.base,
    padding: spacing.base,
    minHeight: 100,
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
  resultsTitle: { color: colors.text.secondary, fontSize: fontSize.sm, fontWeight: '600', marginBottom: spacing.md, textTransform: 'uppercase', letterSpacing: 1 },
  captionCard: {
    backgroundColor: colors.dark.bgCard,
    borderRadius: radius.lg,
    padding: spacing.base,
    borderWidth: 1,
    borderColor: colors.dark.border,
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
  captionText: { color: colors.text.primary, fontSize: fontSize.base, lineHeight: 22 },
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
  timeTitle: { color: colors.text.secondary, fontSize: fontSize.sm, fontWeight: '500', marginTop: spacing.md },
  timeValue: { color: colors.gold, fontSize: 48, fontWeight: '800', fontVariant: ['tabular-nums'], marginVertical: spacing.sm },
  timeReason: { color: colors.text.tertiary, fontSize: fontSize.sm, textAlign: 'center' },
  emptyWrap: { marginTop: spacing['2xl'] },
});
