import React, { useState } from 'react';
import { View, Text, StyleSheet, FlatList, RefreshControl, Pressable, TextInput } from 'react-native';
import Animated, { FadeInUp, FadeInDown } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { GlassHeader } from '@/components/ui/GlassHeader';
import { Icon } from '@/components/ui/Icon';
import { Avatar } from '@/components/ui/Avatar';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { BottomSheet, BottomSheetItem } from '@/components/ui/BottomSheet';
import { CharCountRing } from '@/components/ui/CharCountRing';
import { ScreenErrorBoundary } from '@/components/ui/ScreenErrorBoundary';
import { colors, spacing, fontSize, radius } from '@/theme';
import { useHaptic } from '@/hooks/useHaptic';
import { useTranslation } from '@/hooks/useTranslation';

const API_BASE = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000/api/v1';

const MADHABS = [
  { id: 'any', label: 'Any Madhab' },
  { id: 'hanafi', label: 'Hanafi' },
  { id: 'maliki', label: 'Maliki' },
  { id: 'shafii', label: "Shafi'i" },
  { id: 'hanbali', label: 'Hanbali' },
];

export default function FatwaQAScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const haptic = useHaptic();
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState<'browse' | 'ask'>('browse');
  const [selectedMadhab, setSelectedMadhab] = useState('any');
  const [question, setQuestion] = useState('');
  const [askMadhab, setAskMadhab] = useState('any');
  const [madhabSheetOpen, setMadhabSheetOpen] = useState(false);

  const questionsQuery = useInfiniteQuery<{ data?: Array<Record<string, unknown>>; meta?: { cursor: string | null; hasMore: boolean } }>({
    queryKey: ['fatwa-questions', selectedMadhab],
    queryFn: async ({ pageParam }) => {
      const params = new URLSearchParams();
      if (pageParam) params.set('cursor', pageParam as string);
      if (selectedMadhab !== 'any') params.set('madhab', selectedMadhab);
      const res = await fetch(`${API_BASE}/fatwa?${params}`);
      return res.json();
    },
    getNextPageParam: (lastPage) =>
      lastPage?.meta?.hasMore ? lastPage.meta.cursor : undefined,
    initialPageParam: undefined as string | undefined,
    enabled: activeTab === 'browse',
  });

  const askMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${API_BASE}/fatwa`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question, madhab: askMadhab !== 'any' ? askMadhab : undefined }),
      });
      return res.json();
    },
    onSuccess: () => {
      setQuestion('');
      setActiveTab('browse');
      queryClient.invalidateQueries({ queryKey: ['fatwa-questions'] });
      haptic.success();
    },
  });

  const questions = questionsQuery.data?.pages.flatMap((p) => p.data || []) || [];

  const renderQuestion = ({ item, index }: { item: Record<string, unknown>; index: number }) => {
    const asker = item.asker as Record<string, unknown> | undefined;
    const isAnswered = item.status === 'answered';
    return (
      <Animated.View entering={FadeInUp.delay(index * 60).duration(300)}>
        <View style={styles.questionCard}>
          <View style={styles.questionHeader}>
            <Avatar uri={asker?.avatarUrl as string | null} name={asker?.displayName as string || ''} size="sm" />
            <View style={{ flex: 1 }}>
              <Text style={styles.askerName}>{asker?.displayName as string}</Text>
              {Boolean(item.madhab) ? (
                <View style={styles.madhabBadge}>
                  <Text style={styles.madhabBadgeText}>{String(item.madhab)}</Text>
                </View>
              ) : null}
            </View>
            <View style={[styles.statusBadge, { backgroundColor: isAnswered ? colors.emerald + '20' : colors.gold + '20' }]}>
              <Icon name={isAnswered ? 'check-circle' : 'clock'} size="xs" color={isAnswered ? colors.emerald : colors.gold} />
              <Text style={[styles.statusText, { color: isAnswered ? colors.emerald : colors.gold }]}>
                {isAnswered ? 'Answered' : 'Pending'}
              </Text>
            </View>
          </View>
          <Text style={styles.questionText}>{item.question as string}</Text>
          {isAnswered && Boolean(item.answerId) ? (
            <View style={styles.answerCard}>
              <Icon name="check-circle" size="sm" color={colors.emerald} />
              <Text style={styles.answerText} numberOfLines={3}>{String(item.answerId)}</Text>
            </View>
          ) : null}
        </View>
      </Animated.View>
    );
  };

  return (
    <ScreenErrorBoundary>
      <View style={styles.container}>
        <GlassHeader
          title={t('community.fatwaQA')}
          leftAction={{ icon: 'arrow-left', onPress: () => router.back() }}
        />

        {/* Tabs */}
        <View style={styles.tabs}>
          {(['browse', 'ask'] as const).map(tab => (
            <Pressable
              accessibilityRole="button"
              key={tab}
              style={[styles.tab, activeTab === tab && styles.tabActive]}
              onPress={() => { setActiveTab(tab); haptic.light(); }}
            >
              <Icon name={tab === 'browse' ? 'search' : 'pencil'} size="sm" color={activeTab === tab ? colors.emerald : colors.text.secondary} />
              <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>
                {tab === 'browse' ? 'Browse' : 'Ask'}
              </Text>
            </Pressable>
          ))}
        </View>

        {activeTab === 'browse' ? (
          <>
            {/* Madhab filter */}
            <View style={styles.filterRow}>
              {MADHABS.map(m => (
                <Pressable
                  accessibilityRole="button"
                  key={m.id}
                  style={[styles.filterChip, selectedMadhab === m.id && styles.filterChipActive]}
                  onPress={() => { setSelectedMadhab(m.id); haptic.light(); }}
                >
                  <Text style={[styles.filterChipText, selectedMadhab === m.id && styles.filterChipTextActive]}>
                    {m.label}
                  </Text>
                </Pressable>
              ))}
            </View>

            <FlatList<Record<string, unknown>>
              data={questions}
              renderItem={renderQuestion}
              keyExtractor={(item) => item.id as string}
              contentContainerStyle={styles.list}
              refreshControl={
                <RefreshControl refreshing={questionsQuery.isRefetching} onRefresh={() => questionsQuery.refetch()} tintColor={colors.emerald} />
              }
              onEndReached={() => questionsQuery.hasNextPage && questionsQuery.fetchNextPage()}
              ListEmptyComponent={
                questionsQuery.isLoading ? (
                  <View style={styles.skeletons}>
                    {[1, 2, 3].map(i => <Skeleton.Rect key={i} width="100%" height={140} borderRadius={radius.lg} />)}
                  </View>
                ) : (
                  <EmptyState icon="globe" title={t('community.noQuestionsYet')} subtitle={t('community.askFirstQuestion')} />
                )
              }
            />
          </>
        ) : (
          <Animated.View entering={FadeInDown.duration(300)} style={styles.askForm}>
            <Text style={styles.askLabel}>Your Question</Text>
            <View style={styles.inputWrap}>
              <TextInput
                style={styles.questionInput}
                value={question}
                onChangeText={(t) => setQuestion(t.slice(0, 2000))}
                placeholder={t('community.questionPlaceholder')}
                placeholderTextColor={colors.text.tertiary}
                multiline
                maxLength={2000}
              />
              <View style={styles.charRingWrap}>
                <CharCountRing current={question.length} max={2000} size={24} />
              </View>
            </View>

            <Text style={[styles.askLabel, { marginTop: spacing.xl }]}>Preferred Madhab</Text>
            <Pressable style={styles.madhabSelector} onPress={() => setMadhabSheetOpen(true)}>
              <Text style={styles.madhabSelectorText}>
                {MADHABS.find(m => m.id === askMadhab)?.label || 'Any Madhab'}
              </Text>
              <Icon name="chevron-down" size="sm" color={colors.text.secondary} />
            </Pressable>

            <Pressable
              accessibilityRole="button"
              style={[styles.submitBtn, (!question.trim() || askMutation.isPending) && { opacity: 0.5 }]}
              onPress={() => askMutation.mutate()}
              disabled={!question.trim() || askMutation.isPending}
            >
              <LinearGradient colors={[colors.emerald, '#0D9B63']} style={styles.submitGradient}>
                <Icon name="send" size="sm" color="#FFF" />
                <Text style={styles.submitText}>Submit Question</Text>
              </LinearGradient>
            </Pressable>
          </Animated.View>
        )}

        <BottomSheet visible={madhabSheetOpen} onClose={() => setMadhabSheetOpen(false)}>
          {MADHABS.map(m => (
            <BottomSheetItem
              key={m.id}
              label={m.label}
              icon={<Icon name={askMadhab === m.id ? 'check-circle' : 'globe'} size="sm" color={askMadhab === m.id ? colors.emerald : colors.text.secondary} />}
              onPress={() => { setAskMadhab(m.id); setMadhabSheetOpen(false); haptic.light(); }}
            />
          ))}
        </BottomSheet>
      </View>
    </ScreenErrorBoundary>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.dark.bg },
  tabs: { flexDirection: 'row', marginHorizontal: spacing.base, marginBottom: spacing.md, gap: spacing.sm },
  tab: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs, paddingVertical: spacing.md, borderRadius: radius.md, backgroundColor: colors.dark.bgCard, borderWidth: 1, borderColor: colors.dark.border },
  tabActive: { borderColor: colors.emerald, backgroundColor: colors.emerald + '10' },
  tabText: { color: colors.text.secondary, fontSize: fontSize.sm, fontWeight: '500' },
  tabTextActive: { color: colors.emerald },
  filterRow: { flexDirection: 'row', paddingHorizontal: spacing.base, gap: spacing.sm, marginBottom: spacing.md, flexWrap: 'wrap' },
  filterChip: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.full, backgroundColor: colors.dark.bgCard, borderWidth: 1, borderColor: colors.dark.border },
  filterChipActive: { borderColor: colors.emerald, backgroundColor: colors.emerald + '10' },
  filterChipText: { color: colors.text.secondary, fontSize: fontSize.xs, fontWeight: '500' },
  filterChipTextActive: { color: colors.emerald },
  list: { paddingHorizontal: spacing.base, paddingBottom: spacing['2xl'] },
  skeletons: { gap: spacing.md },
  questionCard: { backgroundColor: colors.dark.bgCard, borderRadius: radius.lg, padding: spacing.base, borderWidth: 1, borderColor: colors.dark.border, marginBottom: spacing.md },
  questionHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.md },
  askerName: { color: colors.text.primary, fontSize: fontSize.sm, fontWeight: '600' },
  madhabBadge: { backgroundColor: colors.gold + '15', paddingHorizontal: spacing.sm, paddingVertical: 1, borderRadius: radius.full, alignSelf: 'flex-start', marginTop: 2 },
  madhabBadgeText: { color: colors.gold, fontSize: fontSize.xs, fontWeight: '500', textTransform: 'capitalize' },
  statusBadge: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, borderRadius: radius.full },
  statusText: { fontSize: fontSize.xs, fontWeight: '600' },
  questionText: { color: colors.text.primary, fontSize: fontSize.base, lineHeight: 22 },
  answerCard: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md, backgroundColor: colors.emerald + '08', padding: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.emerald + '20' },
  answerText: { color: colors.text.secondary, fontSize: fontSize.sm, flex: 1, lineHeight: 20 },
  askForm: { paddingHorizontal: spacing.base },
  askLabel: { color: colors.text.secondary, fontSize: fontSize.sm, fontWeight: '600', marginBottom: spacing.sm, textTransform: 'uppercase', letterSpacing: 1 },
  inputWrap: { position: 'relative' },
  questionInput: { backgroundColor: colors.dark.bgCard, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.dark.border, padding: spacing.base, color: colors.text.primary, fontSize: fontSize.base, minHeight: 150, textAlignVertical: 'top' },
  charRingWrap: { position: 'absolute', bottom: spacing.sm, right: spacing.sm },
  madhabSelector: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: colors.dark.bgCard, borderRadius: radius.md, borderWidth: 1, borderColor: colors.dark.border, padding: spacing.md },
  madhabSelectorText: { color: colors.text.primary, fontSize: fontSize.base },
  submitBtn: { marginTop: spacing.xl, borderRadius: radius.md, overflow: 'hidden' },
  submitGradient: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, paddingVertical: spacing.base, borderRadius: radius.md },
  submitText: { color: '#FFF', fontSize: fontSize.md, fontWeight: '700' },
});
