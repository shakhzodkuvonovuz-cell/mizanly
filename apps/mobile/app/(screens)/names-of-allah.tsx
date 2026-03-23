import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, FlatList, Pressable, Share,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { useQuery } from '@tanstack/react-query';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Audio } from 'expo-av';
import { Icon } from '@/components/ui/Icon';
import { GlassHeader } from '@/components/ui/GlassHeader';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { BrandedRefreshControl } from '@/components/ui/BrandedRefreshControl';
import { ScreenErrorBoundary } from '@/components/ui/ScreenErrorBoundary';
import { showToast } from '@/components/ui/Toast';
import { colors, spacing, radius, fontSize, fonts, fontSizeExt } from '@/theme';
import { useContextualHaptic } from '@/hooks/useContextualHaptic';
import { useTranslation } from '@/hooks/useTranslation';
import { useThemeColors } from '@/hooks/useThemeColors';
import { islamicApi } from '@/services/islamicApi';
import { rtlFlexRow, rtlTextAlign } from '@/utils/rtl';

interface NameOfAllah {
  number: number;
  arabic: string;
  arabicName?: string;
  transliteration: string;
  meaning: string;
  englishMeaning?: string;
  explanation?: string;
  quranRef?: string;
}

const LEARNED_KEY = 'mizanly_learned_names';

function NameCard({ name, isLearned, onToggleLearned, onShare, onPlayAudio, expanded, onToggleExpand }: {
  name: NameOfAllah;
  isLearned: boolean;
  onToggleLearned: () => void;
  onShare: () => void;
  onPlayAudio: () => void;
  expanded: boolean;
  onToggleExpand: () => void;
}) {
  const tc = useThemeColors();
  const styles = createStyles(tc);
  const { t, isRTL } = useTranslation();

  return (
    <Pressable
      style={[styles.nameCard, isLearned && styles.nameCardLearned]}
      onPress={onToggleExpand}
      accessibilityLabel={`${name.transliteration} - ${name.englishMeaning}`}
      accessibilityRole="button"
    >
      <View style={[styles.nameHeader, { flexDirection: rtlFlexRow(isRTL) }]}>
        <View style={styles.numberBadge}>
          <Text style={styles.numberText}>{name.number}</Text>
        </View>
        <View style={styles.nameInfo}>
          <Text style={styles.arabicName}>{name.arabicName}</Text>
          <Text style={styles.transliterationName}>{name.transliteration}</Text>
          <Text style={styles.meaningText}>{name.englishMeaning}</Text>
        </View>
        {isLearned && (
          <Icon name="check-circle" size={18} color={colors.emerald} />
        )}
      </View>

      {expanded && (
        <Animated.View entering={FadeInUp.duration(200)} style={styles.expandedSection}>
          <Text style={[styles.explanationText, { textAlign: rtlTextAlign(isRTL) }]}>
            {name.explanation}
          </Text>

          {name.quranRef && (
            <Text style={styles.quranRef}>
              {t('namesOfAllah.quranReference')}: {name.quranRef}
            </Text>
          )}

          <View style={[styles.nameActions, { flexDirection: rtlFlexRow(isRTL) }]}>
            <Pressable
              onPress={onPlayAudio}
              style={styles.nameActionBtn}
              hitSlop={8}
              accessibilityLabel={t('common.listen', { defaultValue: 'Listen' })}
              accessibilityRole="button"
            >
              <Icon name="play" size={16} color={tc.text.secondary} />
              <Text style={styles.nameActionText}>{t('common.listen', { defaultValue: 'Listen' })}</Text>
            </Pressable>
            <Pressable
              onPress={onToggleLearned}
              style={[styles.nameActionBtn, isLearned && styles.nameActionBtnActive]}
              hitSlop={8}
              accessibilityLabel={t('namesOfAllah.markAsLearned')}
              accessibilityRole="button"
            >
              <Icon name={isLearned ? 'check-circle' : 'check'} size={16} color={isLearned ? colors.emerald : tc.text.secondary} />
              <Text style={[styles.nameActionText, isLearned && { color: colors.emerald }]}>
                {isLearned ? t('namesOfAllah.learned') : t('namesOfAllah.markAsLearned')}
              </Text>
            </Pressable>
            <Pressable
              onPress={onShare}
              style={styles.nameActionBtn}
              hitSlop={8}
              accessibilityLabel={t('common.share')}
              accessibilityRole="button"
            >
              <Icon name="share" size={16} color={tc.text.secondary} />
              <Text style={styles.nameActionText}>{t('common.share')}</Text>
            </Pressable>
          </View>
        </Animated.View>
      )}
    </Pressable>
  );
}

export default function NamesOfAllahScreen() {
  const tc = useThemeColors();
  const styles = createStyles(tc);
  const router = useRouter();
  const haptic = useContextualHaptic();
  const { t, isRTL } = useTranslation();
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [learnedSet, setLearnedSet] = useState<Set<number>>(new Set());
  const [learnedLoaded, setLearnedLoaded] = useState(false);

  // Audio playback (name pronunciation not yet available from API)
  const soundRef = useRef<Audio.Sound | null>(null);

  const handlePlayAudio = useCallback(() => {
    haptic.navigate();
    showToast({ message: t('islamic.audioPronunciationComingSoon', { defaultValue: 'Audio pronunciation coming soon' }), variant: 'info' });
  }, [haptic, t]);

  useEffect(() => {
    return () => { soundRef.current?.unloadAsync(); };
  }, []);

  // Load learned names from AsyncStorage
  const loadLearned = useCallback(async () => {
    try {
      const stored = await AsyncStorage.getItem(LEARNED_KEY);
      if (stored) {
        setLearnedSet(new Set(JSON.parse(stored)));
      }
    } catch {
      // ignore
    }
    setLearnedLoaded(true);
  }, []);

  useEffect(() => {
    if (!learnedLoaded) loadLearned();
  }, [learnedLoaded, loadLearned]);

  const namesQuery = useQuery({
    queryKey: ['names-of-allah'],
    queryFn: () => islamicApi.getNamesOfAllah(),
  });

  const dailyQuery = useQuery({
    queryKey: ['daily-name'],
    queryFn: () => islamicApi.getDailyNameOfAllah(),
  });

  const names: NameOfAllah[] = namesQuery.data ?? [];
  const dailyName: NameOfAllah | null = dailyQuery.data ?? null;

  const toggleLearned = useCallback(async (num: number) => {
    haptic.success();
    setLearnedSet(prev => {
      const next = new Set(prev);
      if (next.has(num)) next.delete(num);
      else next.add(num);
      AsyncStorage.setItem(LEARNED_KEY, JSON.stringify([...next])).catch(() => {});
      return next;
    });
  }, [haptic]);

  const handleShare = useCallback((name: NameOfAllah) => {
    const text = `${name.arabicName}\n${name.transliteration}\n${name.englishMeaning}\n\n${name.explanation}\n\nShared from Mizanly`;
    Share.share({ message: text }).catch(() => {});
  }, []);

  const handleRefresh = useCallback(() => {
    namesQuery.refetch();
    dailyQuery.refetch();
  }, [namesQuery, dailyQuery]);

  const learnedCount = learnedSet.size;

  const listHeader = useMemo(() => (
    <View>
      {/* Progress bar */}
      <View style={styles.progressSection}>
        <Text style={styles.progressText}>
          {t('namesOfAllah.progress', { count: learnedCount })}
        </Text>
        <View style={styles.progressBar}>
          <View style={[styles.progressFill, { width: `${(learnedCount / 99) * 100}%` }]} />
        </View>
      </View>

      {/* Daily Name */}
      {dailyName && (
        <View style={styles.dailyCard}>
          <Text style={styles.dailyLabel}>{t('namesOfAllah.dailyName')}</Text>
          <Text style={styles.dailyArabic}>{dailyName.arabicName}</Text>
          <Text style={styles.dailyTranslit}>{dailyName.transliteration}</Text>
          <Text style={styles.dailyMeaning}>{dailyName.englishMeaning}</Text>
          <Text style={styles.dailyExplanation}>{dailyName.explanation}</Text>
        </View>
      )}
    </View>
  ), [dailyName, learnedCount, t]);

  return (
    <ScreenErrorBoundary>
      <SafeAreaView style={styles.container} edges={['top']}>
        <GlassHeader
          title={t('namesOfAllah.title')}
          leftAction={{
            icon: 'arrow-left',
            onPress: () => router.back(),
            accessibilityLabel: t('common.goBack'),
          }}
        />

        <FlatList
          data={names}
          keyExtractor={(item) => String(item.number)}
          renderItem={({ item, index }) => (
            <Animated.View entering={FadeInUp.delay(Math.min(index, 15) * 40).duration(350).springify()}>
            <NameCard
              name={item}
              isLearned={learnedSet.has(item.number)}
              onToggleLearned={() => toggleLearned(item.number)}
              onShare={() => handleShare(item)}
              onPlayAudio={handlePlayAudio}
              expanded={expandedId === item.number}
              onToggleExpand={() => setExpandedId(expandedId === item.number ? null : item.number)}
            />
            </Animated.View>
          )}
          ListHeaderComponent={listHeader}
          ListEmptyComponent={
            namesQuery.isLoading ? null : (
              <EmptyState icon="heart" title={t('namesOfAllah.title')} />
            )
          }
          refreshControl={
            <BrandedRefreshControl refreshing={namesQuery.isRefetching} onRefresh={handleRefresh} />
          }
          contentContainerStyle={styles.listContent}
          ListFooterComponent={
            namesQuery.isLoading ? (
              <View style={{ gap: spacing.sm, padding: spacing.base }}>
                {Array.from({ length: 10 }).map((_, i) => (
                  <Skeleton.Rect key={i} width="100%" height={72} borderRadius={radius.md} />
                ))}
              </View>
            ) : null
          }
        />
      </SafeAreaView>
    </ScreenErrorBoundary>
  );
}

const createStyles = (tc: ReturnType<typeof useThemeColors>) => StyleSheet.create({
  container: { flex: 1, backgroundColor: tc.bg },
  listContent: { paddingBottom: spacing['2xl'] },
  progressSection: {
    padding: spacing.base,
  },
  progressText: {
    color: colors.text.secondary,
    fontSize: fontSize.sm,
    marginBottom: spacing.sm,
  },
  progressBar: {
    height: 6,
    backgroundColor: tc.surface,
    borderRadius: radius.full,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: colors.emerald,
    borderRadius: radius.full,
  },
  dailyCard: {
    margin: spacing.base,
    marginTop: 0,
    padding: spacing.lg,
    backgroundColor: tc.bgCard,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.gold,
  },
  dailyLabel: {
    color: colors.gold,
    fontSize: fontSize.xs,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: spacing.sm,
  },
  dailyArabic: {
    color: colors.text.primary,
    fontSize: fontSizeExt.display,
    fontFamily: fonts.arabic,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  dailyTranslit: {
    color: colors.emerald,
    fontSize: fontSize.base,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: spacing.xs,
  },
  dailyMeaning: {
    color: colors.text.primary,
    fontSize: fontSize.md,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  dailyExplanation: {
    color: colors.text.secondary,
    fontSize: fontSize.sm,
    textAlign: 'center',
    lineHeight: 20,
  },
  nameCard: {
    marginHorizontal: spacing.base,
    marginBottom: spacing.sm,
    padding: spacing.md,
    backgroundColor: tc.bgCard,
    borderRadius: radius.md,
    borderWidth: 0.5,
    borderColor: tc.border,
  },
  nameCardLearned: {
    borderColor: colors.emerald,
    borderWidth: 1,
  },
  nameHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  numberBadge: {
    width: 32,
    height: 32,
    borderRadius: radius.full,
    backgroundColor: tc.surface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  numberText: {
    color: colors.text.secondary,
    fontSize: fontSize.xs,
    fontWeight: '700',
  },
  nameInfo: {
    flex: 1,
  },
  arabicName: {
    color: colors.text.primary,
    fontSize: fontSize.lg,
    fontFamily: fonts.arabic,
  },
  transliterationName: {
    color: colors.emerald,
    fontSize: fontSize.sm,
    fontWeight: '600',
  },
  meaningText: {
    color: colors.text.secondary,
    fontSize: fontSize.xs,
  },
  expandedSection: {
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 0.5,
    borderTopColor: tc.border,
  },
  explanationText: {
    color: colors.text.primary,
    fontSize: fontSize.sm,
    lineHeight: 20,
    marginBottom: spacing.sm,
  },
  quranRef: {
    color: colors.gold,
    fontSize: fontSize.xs,
    marginBottom: spacing.sm,
  },
  nameActions: {
    flexDirection: 'row',
    gap: spacing.lg,
  },
  nameActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.xs,
  },
  nameActionBtnActive: {},
  nameActionText: {
    color: colors.text.secondary,
    fontSize: fontSize.xs,
  },
});
