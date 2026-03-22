import { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
  Pressable,
  TextInput,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { useQuery, useMutation, useQueryClient, useInfiniteQuery } from '@tanstack/react-query';
import { Icon } from '@/components/ui/Icon';
import { GlassHeader } from '@/components/ui/GlassHeader';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { BottomSheet, BottomSheetItem } from '@/components/ui/BottomSheet';
import { GradientButton } from '@/components/ui/GradientButton';
import { colors, spacing, radius, fontSize, fonts } from '@/theme';
import { useHaptic } from '@/hooks/useHaptic';
import { useTranslation } from '@/hooks/useTranslation';
import { useThemeColors } from '@/hooks/useThemeColors';
import { ScreenErrorBoundary } from '@/components/ui/ScreenErrorBoundary';
import { islamicApi } from '@/services/islamicApi';
import type { DhikrChallenge } from '@/types/islamic';
import { navigate } from '@/utils/navigation';

const PHRASE_OPTIONS = [
  { value: 'subhanallah', label: 'SubhanAllah' },
  { value: 'alhamdulillah', label: 'Alhamdulillah' },
  { value: 'allahuakbar', label: 'Allahu Akbar' },
  { value: 'lailahaillallah', label: 'La ilaha illAllah' },
  { value: 'astaghfirullah', label: 'Astaghfirullah' },
];

const PHRASE_ARABIC_MAP: Record<string, string> = {
  subhanallah: 'سبحان الله',
  alhamdulillah: 'الحمد لله',
  allahuakbar: 'الله أكبر',
  lailahaillallah: 'لا إله إلا الله',
  astaghfirullah: 'أستغفر الله',
};

function ChallengeCard({
  challenge,
  onPress,
}: {
  challenge: DhikrChallenge;
  onPress: () => void;
}) {
  const { t } = useTranslation();
  const tc = useThemeColors();
  const progress = challenge.targetTotal > 0
    ? Math.min(challenge.currentTotal / challenge.targetTotal, 1)
    : 0;

  return (
    <Pressable onPress={onPress}>
      <LinearGradient
        colors={colors.gradient.cardDark}
        style={styles.challengeCard}
      >
        <View style={styles.challengeHeader}>
          <Text style={styles.challengeTitle} numberOfLines={1}>{challenge.title}</Text>
          <Text style={styles.challengePhrase}>
            {PHRASE_ARABIC_MAP[challenge.phrase] || challenge.phrase}
          </Text>
        </View>

        {/* Progress bar */}
        <View style={[styles.progressBarTrack, { backgroundColor: tc.surface }]}>
          <View style={[styles.progressBarFill, { width: `${progress * 100}%` }]} />
        </View>

        <View style={styles.challengeFooter}>
          <Text style={styles.challengeProgress}>
            {t('dhikr.progress', {
              current: challenge.currentTotal.toLocaleString(),
              target: challenge.targetTotal.toLocaleString(),
            })}
          </Text>
          <View style={styles.participantBadge}>
            <Icon name="users" size="xs" color={colors.text.tertiary} />
            <Text style={styles.participantText}>
              {t('dhikr.participants', { count: challenge.participantCount })}
            </Text>
          </View>
        </View>
      </LinearGradient>
    </Pressable>
  );
}

function LoadingSkeleton() {
  const tc = useThemeColors();
  return (
    <View style={styles.skeletonContainer}>
      {[1, 2, 3].map((i) => (
        <View key={i} style={[styles.skeletonCard, { backgroundColor: tc.bgCard }]}>
          <Skeleton.Rect width="70%" height={18} borderRadius={radius.sm} />
          <View style={{ height: spacing.sm }} />
          <Skeleton.Rect width="40%" height={14} borderRadius={radius.sm} />
          <View style={{ height: spacing.md }} />
          <Skeleton.Rect width="100%" height={8} borderRadius={radius.full} />
          <View style={{ height: spacing.sm }} />
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Skeleton.Rect width="30%" height={12} borderRadius={radius.sm} />
            <Skeleton.Rect width="25%" height={12} borderRadius={radius.sm} />
          </View>
        </View>
      ))}
    </View>
  );
}

export default function DhikrChallengesScreen() {
  const router = useRouter();
  const haptic = useHaptic();
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [showCreateSheet, setShowCreateSheet] = useState(false);
  const [showPhraseSheet, setShowPhraseSheet] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newPhrase, setNewPhrase] = useState('subhanallah');
  const [newTarget, setNewTarget] = useState('1000');
  const [creating, setCreating] = useState(false);

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isLoading,
    refetch,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: ['dhikr-challenges'],
    queryFn: ({ pageParam }) => islamicApi.listDhikrChallenges(pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => {
      const page = lastPage as { meta?: { hasMore: boolean; cursor?: string } };
      return page.meta?.hasMore ? page.meta.cursor : undefined;
    },
  });

  const challenges = data?.pages.flatMap((page) => {
    const p = page as { data?: DhikrChallenge[] };
    return p.data ?? [];
  }) ?? [];

  const createMutation = useMutation({
    mutationFn: (data: { title: string; phrase: string; targetTotal: number }) =>
      islamicApi.createDhikrChallenge(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dhikr-challenges'] });
      setShowCreateSheet(false);
      setNewTitle('');
      setNewTarget('1000');
      setCreating(false);
    },
    onError: () => {
      setCreating(false);
    },
  });

  const [refreshing, setRefreshing] = useState(false);
  const tc = useThemeColors();

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  const handleCreate = useCallback(() => {
    if (!newTitle.trim()) return;
    const target = parseInt(newTarget, 10);
    if (isNaN(target) || target < 100) return;
    setCreating(true);
    createMutation.mutate({
      title: newTitle.trim(),
      phrase: newPhrase,
      targetTotal: target,
    });
  }, [newTitle, newPhrase, newTarget, createMutation]);

  const renderItem = useCallback(({ item, index }: { item: DhikrChallenge; index: number }) => (
    <Animated.View entering={FadeInUp.delay(index * 50).duration(300)}>
      <ChallengeCard
        challenge={item}
        onPress={() => navigate('/(screens)/dhikr-challenge-detail', { id: item.id })}
      />
    </Animated.View>
  ), [router]);

  const selectedPhraseLabel = PHRASE_OPTIONS.find(p => p.value === newPhrase)?.label ?? newPhrase;

  return (
    <ScreenErrorBoundary>
      <SafeAreaView style={[styles.container, { backgroundColor: tc.bg }]}>
        <GlassHeader
          title={t('dhikr.challenges')}
          leftAction={{ icon: 'arrow-left', onPress: () => router.back() }}
        />

        {isLoading ? (
          <LoadingSkeleton />
        ) : (
          <FlatList
            data={challenges}
            keyExtractor={(item) => item.id}
            renderItem={renderItem}
            contentContainerStyle={styles.listContent}
            refreshControl={
              <RefreshControl tintColor={colors.emerald} refreshing={refreshing} onRefresh={onRefresh} />
            }
            onEndReached={() => { if (hasNextPage) fetchNextPage(); }}
            onEndReachedThreshold={0.3}
            ListEmptyComponent={
              <EmptyState
                icon="users"
                title={t('dhikr.noActive')}
                subtitle={t('dhikr.createChallenge')}
              />
            }
          />
        )}

        {/* FAB */}
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            haptic.light();
            setShowCreateSheet(true);
          }}

          style={styles.fab}
        >
          <LinearGradient
            colors={[colors.emerald, colors.gold]}
            style={styles.fabGradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
          >
            <Icon name="plus" size="md" color={colors.text.primary} />
          </LinearGradient>
        </Pressable>

        {/* Create Challenge BottomSheet */}
        <BottomSheet visible={showCreateSheet} onClose={() => setShowCreateSheet(false)}>
          <View style={styles.sheetContent}>
            <Text style={styles.sheetTitle}>{t('dhikr.createChallenge')}</Text>

            <Text style={styles.inputLabel}>{t('dhikr.title')}</Text>
            <TextInput
              style={[styles.textInput, { backgroundColor: tc.surface, borderColor: tc.border }]}
              value={newTitle}
              onChangeText={setNewTitle}
              placeholder={t('dhikr.title')}
              placeholderTextColor={colors.text.tertiary}
              maxLength={100}
            />

            <Text style={styles.inputLabel}>{t('dhikr.phrase')}</Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => setShowPhraseSheet(true)}

              style={[styles.pickerButton, { backgroundColor: tc.surface, borderColor: tc.border }]}
            >
              <Text style={styles.pickerText}>{selectedPhraseLabel}</Text>
              <Icon name="chevron-down" size="xs" color={colors.text.tertiary} />
            </Pressable>

            <Text style={styles.inputLabel}>{t('dhikr.target')}</Text>
            <TextInput
              style={[styles.textInput, { backgroundColor: tc.surface, borderColor: tc.border }]}
              value={newTarget}
              onChangeText={setNewTarget}
              placeholder="1000"
              placeholderTextColor={colors.text.tertiary}
              keyboardType="numeric"
            />

            <View style={{ height: spacing.lg }} />
            <GradientButton
              label={t('dhikr.createChallenge')}
              onPress={handleCreate}
              loading={creating}
            />
          </View>
        </BottomSheet>

        {/* Phrase Picker Sheet */}
        <BottomSheet visible={showPhraseSheet} onClose={() => setShowPhraseSheet(false)}>
          {PHRASE_OPTIONS.map((opt) => (
            <BottomSheetItem
              key={opt.value}
              label={opt.label}
              icon={<Icon name={newPhrase === opt.value ? 'check-circle' : 'circle'} size="sm" color={newPhrase === opt.value ? colors.emerald : colors.text.tertiary} />}
              onPress={() => {
                setNewPhrase(opt.value);
                setShowPhraseSheet(false);
              }}
            />
          ))}
        </BottomSheet>
      </SafeAreaView>
    </ScreenErrorBoundary>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.dark.bg,
  },
  listContent: {
    paddingTop: 100,
    paddingHorizontal: spacing.base,
    paddingBottom: 100,
  },
  skeletonContainer: {
    paddingTop: 100,
    paddingHorizontal: spacing.base,
    gap: spacing.md,
  },
  skeletonCard: {
    backgroundColor: colors.dark.bgCard,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.active.white6,
  },
  challengeCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.active.white6,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  challengeHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  challengeTitle: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSize.base,
    color: colors.text.primary,
    flex: 1,
    marginRight: spacing.sm,
  },
  challengePhrase: {
    fontFamily: fonts.body,
    fontSize: fontSize.sm,
    color: colors.emerald,
    writingDirection: 'rtl',
  },
  progressBarTrack: {
    height: 8,
    backgroundColor: colors.dark.surface,
    borderRadius: radius.full,
    overflow: 'hidden',
    marginBottom: spacing.sm,
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: colors.emerald,
    borderRadius: radius.full,
  },
  challengeFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  challengeProgress: {
    fontFamily: fonts.body,
    fontSize: fontSize.xs,
    color: colors.text.secondary,
  },
  participantBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  participantText: {
    fontFamily: fonts.body,
    fontSize: fontSize.xs,
    color: colors.text.tertiary,
  },
  fab: {
    position: 'absolute',
    bottom: 24,
    right: spacing.base,
  },
  fabGradient: {
    width: 56,
    height: 56,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetContent: {
    padding: spacing.base,
  },
  sheetTitle: {
    fontFamily: fonts.heading,
    fontSize: fontSize.lg,
    color: colors.text.primary,
    marginBottom: spacing.lg,
  },
  inputLabel: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSize.sm,
    color: colors.text.secondary,
    marginBottom: spacing.xs,
    marginTop: spacing.md,
  },
  textInput: {
    fontFamily: fonts.body,
    fontSize: fontSize.base,
    color: colors.text.primary,
    backgroundColor: colors.dark.surface,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderWidth: 1,
    borderColor: colors.dark.border,
  },
  pickerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.dark.surface,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderWidth: 1,
    borderColor: colors.dark.border,
  },
  pickerText: {
    fontFamily: fonts.body,
    fontSize: fontSize.base,
    color: colors.text.primary,
  },
});
