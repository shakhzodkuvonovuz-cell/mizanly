import React, { useState, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, FlatList, Pressable,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Icon } from '@/components/ui/Icon';
import { GlassHeader } from '@/components/ui/GlassHeader';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { BrandedRefreshControl } from '@/components/ui/BrandedRefreshControl';
import { ScreenErrorBoundary } from '@/components/ui/ScreenErrorBoundary';
import { BottomSheet, BottomSheetItem } from '@/components/ui/BottomSheet';
import { colors, spacing, radius, fontSize, fonts } from '@/theme';
import { useContextualHaptic } from '@/hooks/useContextualHaptic';
import { useTranslation } from '@/hooks/useTranslation';
import { useThemeColors } from '@/hooks/useThemeColors';
import { islamicApi } from '@/services/islamicApi';
import { showToast } from '@/components/ui/Toast';
import { rtlFlexRow, rtlTextAlign } from '@/utils/rtl';

// Surah data (name + ayah count for all 114 surahs)
const SURAHS = [
  { num: 1, name: 'Al-Fatiha', arabic: 'الفاتحة', ayahs: 7 },
  { num: 2, name: 'Al-Baqarah', arabic: 'البقرة', ayahs: 286 },
  { num: 3, name: 'Ali Imran', arabic: 'آل عمران', ayahs: 200 },
  { num: 4, name: 'An-Nisa', arabic: 'النساء', ayahs: 176 },
  { num: 5, name: 'Al-Ma\'idah', arabic: 'المائدة', ayahs: 120 },
  { num: 6, name: 'Al-An\'am', arabic: 'الأنعام', ayahs: 165 },
  { num: 7, name: 'Al-A\'raf', arabic: 'الأعراف', ayahs: 206 },
  { num: 8, name: 'Al-Anfal', arabic: 'الأنفال', ayahs: 75 },
  { num: 9, name: 'At-Tawbah', arabic: 'التوبة', ayahs: 129 },
  { num: 10, name: 'Yunus', arabic: 'يونس', ayahs: 109 },
  { num: 11, name: 'Hud', arabic: 'هود', ayahs: 123 },
  { num: 12, name: 'Yusuf', arabic: 'يوسف', ayahs: 111 },
  { num: 13, name: 'Ar-Ra\'d', arabic: 'الرعد', ayahs: 43 },
  { num: 14, name: 'Ibrahim', arabic: 'إبراهيم', ayahs: 52 },
  { num: 15, name: 'Al-Hijr', arabic: 'الحجر', ayahs: 99 },
  { num: 16, name: 'An-Nahl', arabic: 'النحل', ayahs: 128 },
  { num: 17, name: 'Al-Isra', arabic: 'الإسراء', ayahs: 111 },
  { num: 18, name: 'Al-Kahf', arabic: 'الكهف', ayahs: 110 },
  { num: 19, name: 'Maryam', arabic: 'مريم', ayahs: 98 },
  { num: 20, name: 'Ta-Ha', arabic: 'طه', ayahs: 135 },
  { num: 21, name: 'Al-Anbiya', arabic: 'الأنبياء', ayahs: 112 },
  { num: 22, name: 'Al-Hajj', arabic: 'الحج', ayahs: 78 },
  { num: 23, name: 'Al-Mu\'minun', arabic: 'المؤمنون', ayahs: 118 },
  { num: 24, name: 'An-Nur', arabic: 'النور', ayahs: 64 },
  { num: 25, name: 'Al-Furqan', arabic: 'الفرقان', ayahs: 77 },
  { num: 26, name: 'Ash-Shu\'ara', arabic: 'الشعراء', ayahs: 227 },
  { num: 27, name: 'An-Naml', arabic: 'النمل', ayahs: 93 },
  { num: 28, name: 'Al-Qasas', arabic: 'القصص', ayahs: 88 },
  { num: 29, name: 'Al-Ankabut', arabic: 'العنكبوت', ayahs: 69 },
  { num: 30, name: 'Ar-Rum', arabic: 'الروم', ayahs: 60 },
  { num: 31, name: 'Luqman', arabic: 'لقمان', ayahs: 34 },
  { num: 32, name: 'As-Sajdah', arabic: 'السجدة', ayahs: 30 },
  { num: 33, name: 'Al-Ahzab', arabic: 'الأحزاب', ayahs: 73 },
  { num: 34, name: 'Saba', arabic: 'سبأ', ayahs: 54 },
  { num: 35, name: 'Fatir', arabic: 'فاطر', ayahs: 45 },
  { num: 36, name: 'Ya-Sin', arabic: 'يس', ayahs: 83 },
  { num: 37, name: 'As-Saffat', arabic: 'الصافات', ayahs: 182 },
  { num: 38, name: 'Sad', arabic: 'ص', ayahs: 88 },
  { num: 39, name: 'Az-Zumar', arabic: 'الزمر', ayahs: 75 },
  { num: 40, name: 'Ghafir', arabic: 'غافر', ayahs: 85 },
  { num: 41, name: 'Fussilat', arabic: 'فصلت', ayahs: 54 },
  { num: 42, name: 'Ash-Shura', arabic: 'الشورى', ayahs: 53 },
  { num: 43, name: 'Az-Zukhruf', arabic: 'الزخرف', ayahs: 89 },
  { num: 44, name: 'Ad-Dukhan', arabic: 'الدخان', ayahs: 59 },
  { num: 45, name: 'Al-Jathiyah', arabic: 'الجاثية', ayahs: 37 },
  { num: 46, name: 'Al-Ahqaf', arabic: 'الأحقاف', ayahs: 35 },
  { num: 47, name: 'Muhammad', arabic: 'محمد', ayahs: 38 },
  { num: 48, name: 'Al-Fath', arabic: 'الفتح', ayahs: 29 },
  { num: 49, name: 'Al-Hujurat', arabic: 'الحجرات', ayahs: 18 },
  { num: 50, name: 'Qaf', arabic: 'ق', ayahs: 45 },
  { num: 51, name: 'Adh-Dhariyat', arabic: 'الذاريات', ayahs: 60 },
  { num: 52, name: 'At-Tur', arabic: 'الطور', ayahs: 49 },
  { num: 53, name: 'An-Najm', arabic: 'النجم', ayahs: 62 },
  { num: 54, name: 'Al-Qamar', arabic: 'القمر', ayahs: 55 },
  { num: 55, name: 'Ar-Rahman', arabic: 'الرحمن', ayahs: 78 },
  { num: 56, name: 'Al-Waqi\'ah', arabic: 'الواقعة', ayahs: 96 },
  { num: 57, name: 'Al-Hadid', arabic: 'الحديد', ayahs: 29 },
  { num: 58, name: 'Al-Mujadila', arabic: 'المجادلة', ayahs: 22 },
  { num: 59, name: 'Al-Hashr', arabic: 'الحشر', ayahs: 24 },
  { num: 60, name: 'Al-Mumtahanah', arabic: 'الممتحنة', ayahs: 13 },
  { num: 61, name: 'As-Saff', arabic: 'الصف', ayahs: 14 },
  { num: 62, name: 'Al-Jumu\'ah', arabic: 'الجمعة', ayahs: 11 },
  { num: 63, name: 'Al-Munafiqun', arabic: 'المنافقون', ayahs: 11 },
  { num: 64, name: 'At-Taghabun', arabic: 'التغابن', ayahs: 18 },
  { num: 65, name: 'At-Talaq', arabic: 'الطلاق', ayahs: 12 },
  { num: 66, name: 'At-Tahrim', arabic: 'التحريم', ayahs: 12 },
  { num: 67, name: 'Al-Mulk', arabic: 'الملك', ayahs: 30 },
  { num: 68, name: 'Al-Qalam', arabic: 'القلم', ayahs: 52 },
  { num: 69, name: 'Al-Haqqah', arabic: 'الحاقة', ayahs: 52 },
  { num: 70, name: 'Al-Ma\'arij', arabic: 'المعارج', ayahs: 44 },
  { num: 71, name: 'Nuh', arabic: 'نوح', ayahs: 28 },
  { num: 72, name: 'Al-Jinn', arabic: 'الجن', ayahs: 28 },
  { num: 73, name: 'Al-Muzzammil', arabic: 'المزمل', ayahs: 20 },
  { num: 74, name: 'Al-Muddaththir', arabic: 'المدثر', ayahs: 56 },
  { num: 75, name: 'Al-Qiyamah', arabic: 'القيامة', ayahs: 40 },
  { num: 76, name: 'Al-Insan', arabic: 'الإنسان', ayahs: 31 },
  { num: 77, name: 'Al-Mursalat', arabic: 'المرسلات', ayahs: 50 },
  { num: 78, name: 'An-Naba', arabic: 'النبأ', ayahs: 40 },
  { num: 79, name: 'An-Nazi\'at', arabic: 'النازعات', ayahs: 46 },
  { num: 80, name: 'Abasa', arabic: 'عبس', ayahs: 42 },
  { num: 81, name: 'At-Takwir', arabic: 'التكوير', ayahs: 29 },
  { num: 82, name: 'Al-Infitar', arabic: 'الانفطار', ayahs: 19 },
  { num: 83, name: 'Al-Mutaffifin', arabic: 'المطففين', ayahs: 36 },
  { num: 84, name: 'Al-Inshiqaq', arabic: 'الانشقاق', ayahs: 25 },
  { num: 85, name: 'Al-Buruj', arabic: 'البروج', ayahs: 22 },
  { num: 86, name: 'At-Tariq', arabic: 'الطارق', ayahs: 17 },
  { num: 87, name: 'Al-A\'la', arabic: 'الأعلى', ayahs: 19 },
  { num: 88, name: 'Al-Ghashiyah', arabic: 'الغاشية', ayahs: 26 },
  { num: 89, name: 'Al-Fajr', arabic: 'الفجر', ayahs: 30 },
  { num: 90, name: 'Al-Balad', arabic: 'البلد', ayahs: 20 },
  { num: 91, name: 'Ash-Shams', arabic: 'الشمس', ayahs: 15 },
  { num: 92, name: 'Al-Layl', arabic: 'الليل', ayahs: 21 },
  { num: 93, name: 'Ad-Duha', arabic: 'الضحى', ayahs: 11 },
  { num: 94, name: 'Ash-Sharh', arabic: 'الشرح', ayahs: 8 },
  { num: 95, name: 'At-Tin', arabic: 'التين', ayahs: 8 },
  { num: 96, name: 'Al-Alaq', arabic: 'العلق', ayahs: 19 },
  { num: 97, name: 'Al-Qadr', arabic: 'القدر', ayahs: 5 },
  { num: 98, name: 'Al-Bayyinah', arabic: 'البينة', ayahs: 8 },
  { num: 99, name: 'Az-Zalzalah', arabic: 'الزلزلة', ayahs: 8 },
  { num: 100, name: 'Al-Adiyat', arabic: 'العاديات', ayahs: 11 },
  { num: 101, name: 'Al-Qari\'ah', arabic: 'القارعة', ayahs: 11 },
  { num: 102, name: 'At-Takathur', arabic: 'التكاثر', ayahs: 8 },
  { num: 103, name: 'Al-Asr', arabic: 'العصر', ayahs: 3 },
  { num: 104, name: 'Al-Humazah', arabic: 'الهمزة', ayahs: 9 },
  { num: 105, name: 'Al-Fil', arabic: 'الفيل', ayahs: 5 },
  { num: 106, name: 'Quraysh', arabic: 'قريش', ayahs: 4 },
  { num: 107, name: 'Al-Ma\'un', arabic: 'الماعون', ayahs: 7 },
  { num: 108, name: 'Al-Kawthar', arabic: 'الكوثر', ayahs: 3 },
  { num: 109, name: 'Al-Kafirun', arabic: 'الكافرون', ayahs: 6 },
  { num: 110, name: 'An-Nasr', arabic: 'النصر', ayahs: 3 },
  { num: 111, name: 'Al-Masad', arabic: 'المسد', ayahs: 5 },
  { num: 112, name: 'Al-Ikhlas', arabic: 'الإخلاص', ayahs: 4 },
  { num: 113, name: 'Al-Falaq', arabic: 'الفلق', ayahs: 5 },
  { num: 114, name: 'An-Nas', arabic: 'الناس', ayahs: 6 },
];

const STATUS_COLORS: Record<string, string> = {
  memorized: colors.emerald,
  in_progress: colors.gold,
  needs_review: colors.extended.orange,
  not_started: colors.dark.surface,
};

const STATUS_LABELS: Record<string, string> = {
  memorized: 'hifz.memorized',
  in_progress: 'hifz.inProgress',
  needs_review: 'hifz.needsReview',
  not_started: 'hifz.notStarted',
};

interface SurahProgress {
  surahNum: number;
  status: string;
  lastReviewedAt: string | null;
}

const SurahRow = React.memo(function SurahRow({ surah, progress, onPress }: {
  surah: typeof SURAHS[0];
  progress: SurahProgress;
  onPress: () => void;
}) {
  const { t, isRTL } = useTranslation();
  const tc = useThemeColors();
  const statusColor = STATUS_COLORS[progress.status] || tc.surface;

  return (
    <Pressable
      style={[styles.surahRow, { borderBottomColor: tc.border }]}
      onPress={onPress}
      accessibilityLabel={`${surah.name} - ${t(STATUS_LABELS[progress.status])}`}
      accessibilityRole="button"
    >
      <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
      <View style={styles.surahInfo}>
        <View style={[styles.surahNameRow, { flexDirection: rtlFlexRow(isRTL) }]}>
          <Text style={[styles.surahNum, { color: tc.text.tertiary }]}>{surah.num}.</Text>
          <Text style={[styles.surahName, { color: tc.text.primary }]}>{surah.name}</Text>
          <Text style={[styles.surahArabic, { color: tc.text.secondary }]}>{surah.arabic}</Text>
        </View>
        <Text style={[styles.surahMeta, { color: tc.text.tertiary }]}>
          {surah.ayahs} ayahs · {t(STATUS_LABELS[progress.status])}
        </Text>
      </View>
      <Icon name="chevron-right" size={16} color={tc.text.tertiary} />
    </Pressable>
  );
});

export default function HifzTrackerScreen() {
  const router = useRouter();
  const haptic = useContextualHaptic();
  const queryClient = useQueryClient();
  const { t, isRTL } = useTranslation();
  const [statusSheet, setStatusSheet] = useState<{ visible: boolean; surahNum: number }>({ visible: false, surahNum: 0 });
  const tc = useThemeColors();

  const progressQuery = useQuery({
    queryKey: ['hifz-progress'],
    queryFn: () => islamicApi.getHifzProgress(),
  });

  const statsQuery = useQuery({
    queryKey: ['hifz-stats'],
    queryFn: () => islamicApi.getHifzStats(),
  });

  const reviewQuery = useQuery({
    queryKey: ['hifz-review'],
    queryFn: () => islamicApi.getHifzReviewSchedule(),
  });

  const updateMutation = useMutation({
    mutationFn: ({ surahNum, status }: { surahNum: number; status: string }) =>
      islamicApi.updateHifzProgress(surahNum, status),
    onSuccess: () => {
      haptic.success();
      queryClient.invalidateQueries({ queryKey: ['hifz-progress'] });
      queryClient.invalidateQueries({ queryKey: ['hifz-stats'] });
      queryClient.invalidateQueries({ queryKey: ['hifz-review'] });
      setStatusSheet({ visible: false, surahNum: 0 });
    },
  });

  const progressList: SurahProgress[] = (progressQuery.data as SurahProgress[] | undefined) ?? SURAHS.map(s => ({ surahNum: s.num, status: 'not_started', lastReviewedAt: null }));
  const progressMap = useMemo(() => new Map(progressList.map(p => [p.surahNum, p])), [progressList]);
  const stats = statsQuery.data as Record<string, number> | undefined;
  const reviewList = (reviewQuery.data as SurahProgress[] | undefined) ?? [];

  const handleRefresh = useCallback(() => {
    progressQuery.refetch();
    statsQuery.refetch();
    reviewQuery.refetch();
  }, [progressQuery, statsQuery, reviewQuery]);

  const listHeader = useMemo(() => (
    <View>
      {/* Stats */}
      {stats ? (
        <View style={styles.statsRow}>
          <View style={[styles.statCard, { backgroundColor: tc.bgCard }, { borderLeftColor: colors.emerald }]}>
            <Text style={[styles.statValue, { color: colors.emerald }, { color: tc.text.primary }]}>{stats.memorized}</Text>
            <Text style={[styles.statLabel, { color: tc.text.secondary }]}>{t('hifz.memorized')}</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: tc.bgCard }, { borderLeftColor: colors.gold }]}>
            <Text style={[styles.statValue, { color: colors.gold }, { color: tc.text.primary }]}>{stats.inProgress}</Text>
            <Text style={[styles.statLabel, { color: tc.text.secondary }]}>{t('hifz.inProgress')}</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: tc.bgCard }, { borderLeftColor: colors.extended.orange }]}>
            <Text style={[styles.statValue, { color: colors.extended.orange }, { color: tc.text.primary }]}>{stats.needsReview}</Text>
            <Text style={[styles.statLabel, { color: tc.text.secondary }]}>{t('hifz.needsReview')}</Text>
          </View>
        </View>
      ) : (
        <View style={styles.statsRow}>
          <Skeleton.Rect width="30%" height={60} borderRadius={radius.md} />
          <Skeleton.Rect width="30%" height={60} borderRadius={radius.md} />
          <Skeleton.Rect width="30%" height={60} borderRadius={radius.md} />
        </View>
      )}

      {/* Progress bar */}
      {stats && (
        <View style={styles.progressSection}>
          <Text style={[styles.progressText, { color: tc.text.secondary }]}>
            {t('hifz.totalMemorized', { count: stats.memorized })} ({stats.percentage}%)
          </Text>
          <View style={[styles.progressBar, { backgroundColor: tc.surface }]}>
            <View style={[styles.progressFill, { width: `${stats.percentage}%` }]} />
          </View>
        </View>
      )}

      {/* Review Today */}
      {reviewList.length > 0 && (
        <View style={[styles.reviewSection, { backgroundColor: tc.bgCard }]}>
          <Text style={[styles.sectionTitle, { textAlign: rtlTextAlign(isRTL) }, { color: tc.text.primary }]}>
            {t('hifz.reviewToday')}
          </Text>
          {reviewList.slice(0, 5).map((r: SurahProgress) => {
            const surah = SURAHS[r.surahNum - 1];
            return surah ? (
              <View key={r.surahNum} style={styles.reviewItem}>
                <Icon name="clock" size={14} color="#F59E0B" />
                <Text style={[styles.reviewText, { color: tc.text.secondary }]}>{surah.num}. {surah.name} ({surah.arabic})</Text>
              </View>
            ) : null;
          })}
        </View>
      )}

      <Text style={[styles.sectionTitle, { textAlign: rtlTextAlign(isRTL), paddingHorizontal: spacing.base }, { color: tc.text.primary }]}>
        {t('hifz.surahView')}
      </Text>
    </View>
  ), [stats, reviewList, isRTL, t]);

  return (
    <ScreenErrorBoundary>
      <SafeAreaView style={[styles.container, { backgroundColor: tc.bg }]} edges={['top']}>
        <GlassHeader
          title={t('hifz.title')}
          leftAction={{
            icon: 'arrow-left',
            onPress: () => router.back(),
            accessibilityLabel: t('common.goBack'),
          }}
        />

        <FlatList
          data={SURAHS}
          keyExtractor={(item) => String(item.num)}
          renderItem={({ item }) => {
            const progress = progressMap.get(item.num) ?? { surahNum: item.num, status: 'not_started', lastReviewedAt: null };
            return (
              <SurahRow
                surah={item}
                progress={progress}
                onPress={() => { haptic.tick(); setStatusSheet({ visible: true, surahNum: item.num }); }}
              />
            );
          }}
          ListHeaderComponent={listHeader}
          refreshControl={
            <BrandedRefreshControl refreshing={progressQuery.isRefetching} onRefresh={handleRefresh} />
          }
          contentContainerStyle={styles.listContent}
        />

        {/* Status picker bottom sheet */}
        <BottomSheet
          visible={statusSheet.visible}
          onClose={() => setStatusSheet({ visible: false, surahNum: 0 })}
        >
          <BottomSheetItem
            label={t('hifz.notStarted')}
            icon={<View style={[styles.sheetDot, { backgroundColor: tc.surface }]} />}
            onPress={() => updateMutation.mutate({ surahNum: statusSheet.surahNum, status: 'not_started' })}
          />
          <BottomSheetItem
            label={t('hifz.inProgress')}
            icon={<View style={[styles.sheetDot, { backgroundColor: colors.gold }]} />}
            onPress={() => updateMutation.mutate({ surahNum: statusSheet.surahNum, status: 'in_progress' })}
          />
          <BottomSheetItem
            label={t('hifz.memorized')}
            icon={<View style={[styles.sheetDot, { backgroundColor: colors.emerald }]} />}
            onPress={() => updateMutation.mutate({ surahNum: statusSheet.surahNum, status: 'memorized' })}
          />
          <BottomSheetItem
            label={t('hifz.needsReview')}
            icon={<View style={[styles.sheetDot, { backgroundColor: colors.extended.orange }]} />}
            onPress={() => updateMutation.mutate({ surahNum: statusSheet.surahNum, status: 'needs_review' })}
          />
        </BottomSheet>
      </SafeAreaView>
    </ScreenErrorBoundary>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.dark.bg },
  listContent: { paddingBottom: spacing['2xl'] },
  statsRow: {
    flexDirection: 'row',
    paddingHorizontal: spacing.base,
    gap: spacing.sm,
    paddingVertical: spacing.base,
  },
  statCard: {
    flex: 1,
    backgroundColor: colors.dark.bgCard,
    borderRadius: radius.md,
    padding: spacing.md,
    alignItems: 'center',
    borderLeftWidth: 3,
  },
  statValue: {
    color: colors.text.primary,
    fontSize: fontSize.xl,
    fontWeight: '700',
  },
  statLabel: {
    color: colors.text.secondary,
    fontSize: fontSize.xs,
    marginTop: spacing.xs,
  },
  progressSection: {
    paddingHorizontal: spacing.base,
    marginBottom: spacing.base,
  },
  progressText: {
    color: colors.text.secondary,
    fontSize: fontSize.sm,
    marginBottom: spacing.sm,
  },
  progressBar: {
    height: 8,
    backgroundColor: colors.dark.surface,
    borderRadius: radius.full,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: colors.emerald,
    borderRadius: radius.full,
  },
  reviewSection: {
    marginHorizontal: spacing.base,
    marginBottom: spacing.base,
    padding: spacing.base,
    backgroundColor: colors.dark.bgCard,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.extended.orange,
  },
  sectionTitle: {
    color: colors.text.primary,
    fontSize: fontSize.base,
    fontWeight: '700',
    marginBottom: spacing.sm,
  },
  reviewItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.xs,
  },
  reviewText: {
    color: colors.text.secondary,
    fontSize: fontSize.sm,
  },
  surahRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    gap: spacing.md,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.dark.border,
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: radius.full,
  },
  surahInfo: {
    flex: 1,
  },
  surahNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  surahNum: {
    color: colors.text.tertiary,
    fontSize: fontSize.sm,
    fontWeight: '600',
    width: 28,
  },
  surahName: {
    color: colors.text.primary,
    fontSize: fontSize.sm,
    fontWeight: '600',
    flex: 1,
  },
  surahArabic: {
    color: colors.text.secondary,
    fontSize: fontSize.sm,
    fontFamily: fonts.arabic,
  },
  surahMeta: {
    color: colors.text.tertiary,
    fontSize: fontSize.xs,
    marginTop: 2,
    marginStart: 28,
  },
  sheetDot: {
    width: 16,
    height: 16,
    borderRadius: radius.full,
  },
});
