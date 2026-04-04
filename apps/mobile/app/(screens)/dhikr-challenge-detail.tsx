import { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Icon } from '@/components/ui/Icon';
import { GlassHeader } from '@/components/ui/GlassHeader';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { Avatar } from '@/components/ui/Avatar';
import { GradientButton } from '@/components/ui/GradientButton';
import { colors, spacing, radius, fontSize, fonts, fontSizeExt } from '@/theme';
import { useContextualHaptic } from '@/hooks/useContextualHaptic';
import { formatCount } from '@/utils/formatCount';
import { useTranslation } from '@/hooks/useTranslation';
import { useThemeColors } from '@/hooks/useThemeColors';
import { BrandedRefreshControl } from '@/components/ui/BrandedRefreshControl';
import { showToast } from '@/components/ui/Toast';
import { ScreenErrorBoundary } from '@/components/ui/ScreenErrorBoundary';
import { islamicApi } from '@/services/islamicApi';
import type { DhikrChallengeDetail } from '@/types/islamic';

const PHRASE_ARABIC_MAP: Record<string, string> = {
  subhanallah: 'سبحان الله',
  alhamdulillah: 'الحمد لله',
  allahuakbar: 'الله أكبر',
  lailahaillallah: 'لا إله إلا الله',
  astaghfirullah: 'أستغفر الله',
};

function ProgressRing({ current, target }: { current: number; target: number }) {
  const tc = useThemeColors();
  const progress = target > 0 ? Math.min(current / target, 1) : 0;
  const percentage = Math.round(progress * 100);

  return (
    <View style={styles.progressRingContainer}>
      <LinearGradient
        colors={[colors.emerald, colors.gold]}
        style={styles.progressRingOuter}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      >
        <View style={[styles.progressRingInner, { backgroundColor: tc.bgCard }]}>
          <Text style={[styles.progressRingPercent, { color: tc.text.primary }]}>{percentage}%</Text>
          <Text style={[styles.progressRingLabel, { color: tc.text.secondary }]}>
            {current.toLocaleString()} / {target.toLocaleString()}
          </Text>
        </View>
      </LinearGradient>
    </View>
  );
}

function ContributorRow({
  contributor,
  rank,
}: {
  contributor: DhikrChallengeDetail['topContributors'][0];
  rank: number;
}) {
  const tc = useThemeColors();
  return (
    <View style={[styles.contributorRow, { borderBottomColor: tc.border }]}>
      <View style={styles.rankBadge}>
        <Text style={[styles.rankText, rank <= 3 && styles.rankTextTop, { color: tc.text.tertiary }]}>{rank}</Text>
      </View>
      <Avatar
        uri={contributor.user?.avatarUrl ?? null}
        name={contributor.user?.displayName ?? 'User'}
        size="sm"
      />
      <Text style={[styles.contributorName, { color: tc.text.primary }]} numberOfLines={1}>
        {contributor.user?.displayName ?? 'Anonymous'}
      </Text>
      <Text style={styles.contributorCount}>
        {formatCount(contributor.contributed)}
      </Text>
    </View>
  );
}

function LoadingSkeleton() {
  return (
    <View style={styles.skeletonContainer}>
      <View style={{ alignItems: 'center', marginBottom: spacing.xl }}>
        <Skeleton.Circle size={160} />
      </View>
      <Skeleton.Rect width="60%" height={20} borderRadius={radius.sm} />
      <View style={{ height: spacing.sm }} />
      <Skeleton.Rect width="40%" height={16} borderRadius={radius.sm} />
      <View style={{ height: spacing.xl }} />
      {[1, 2, 3, 4].map((i) => (
        <View key={i} style={{ flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md }}>
          <Skeleton.Circle size={32} />
          <Skeleton.Rect width="50%" height={16} borderRadius={radius.sm} />
        </View>
      ))}
    </View>
  );
}

export default function DhikrChallengeDetailScreen() {
  const router = useRouter();
  const haptic = useContextualHaptic();
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [contributeCount, setContributeCount] = useState(0);
  const [showContribute, setShowContribute] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const tc = useThemeColors();

  const { data: challenge, isLoading, isError, refetch } = useQuery({
    queryKey: ['dhikr-challenge', id],
    queryFn: () => islamicApi.getDhikrChallenge(id ?? ''),
    enabled: !!id,
  });

  const joinMutation = useMutation({
    mutationFn: () => islamicApi.joinDhikrChallenge(id ?? ''),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dhikr-challenge', id] });
      queryClient.invalidateQueries({ queryKey: ['dhikr-challenges'] });
      showToast({ message: t('dhikr.joinedChallenge', { defaultValue: 'Joined challenge' }), variant: 'success' });
    },
    onError: () => {
      haptic.error();
      showToast({ message: t('common.somethingWentWrong'), variant: 'error' });
    },
  });

  const contributeMutation = useMutation({
    mutationFn: (count: number) => islamicApi.contributeToDhikrChallenge(id ?? '', count),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dhikr-challenge', id] });
      queryClient.invalidateQueries({ queryKey: ['dhikr-challenges'] });
      setContributeCount(0);
      setShowContribute(false);
      showToast({ message: t('dhikr.contributed', { defaultValue: 'Contribution submitted' }), variant: 'success' });
    },
    onError: () => {
      haptic.error();
      showToast({ message: t('common.somethingWentWrong'), variant: 'error' });
    },
  });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  const handleContributeTap = useCallback(() => {
    haptic.tick();
    setContributeCount(prev => prev + 1);
  }, [haptic]);

  const handleSubmitContribution = useCallback(() => {
    if (contributeCount <= 0) return;
    haptic.send();
    contributeMutation.mutate(contributeCount);
  }, [contributeCount, haptic, contributeMutation]);

  const detail = challenge;

  // isParticipant is now based on participantCount field, not contributor list (#46 fix)
  const _isParticipant = (detail?.participantCount ?? 0) > 0;

  const renderHeader = useCallback(() => {
    if (!detail) return null;

    return (
      <View>
        {/* Progress Ring */}
        <Animated.View entering={FadeInUp.duration(500)}>
          <ProgressRing current={detail.currentTotal} target={detail.targetTotal} />
        </Animated.View>

        {/* Challenge Info */}
        <Animated.View entering={FadeInUp.delay(100).duration(400)}>
          <View style={styles.challengeInfo}>
            <Text style={[styles.challengeTitle, { color: tc.text.primary }]}>{detail.title}</Text>
            <Text style={styles.challengePhrase}>
              {PHRASE_ARABIC_MAP[detail.phrase] || detail.phrase}
            </Text>
            <View style={styles.metaRow}>
              <View style={styles.metaItem}>
                <Icon name="users" size="xs" color={tc.text.tertiary} />
                <Text style={[styles.metaText, { color: tc.text.tertiary }]}>
                  {t('dhikr.participants', { count: detail.participantCount })}
                </Text>
              </View>
              <View style={styles.metaItem}>
                <Icon name="bar-chart-2" size="xs" color={tc.text.tertiary} />
                <Text style={[styles.metaText, { color: tc.text.tertiary }]}>
                  {t('dhikr.progress', {
                    current: detail.currentTotal.toLocaleString(),
                    target: detail.targetTotal.toLocaleString(),
                  })}
                </Text>
              </View>
            </View>
          </View>
        </Animated.View>

        {/* Action Buttons */}
        <Animated.View entering={FadeInUp.delay(200).duration(400)}>
          <View style={styles.actionRow}>
            {!showContribute ? (
              <>
                <View style={styles.actionBtnWrap}>
                  <GradientButton
                    label={t('dhikr.joinChallenge')}
                    onPress={() => {
                      haptic.follow();
                      joinMutation.mutate();
                    }}
                    loading={joinMutation.isPending}
                  />
                </View>
                <View style={styles.actionBtnWrap}>
                  <GradientButton
                    label={t('dhikr.contribute')}
                    variant="secondary"
                    onPress={() => setShowContribute(true)}
                  />
                </View>
              </>
            ) : (
              <View style={styles.contributeSection}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t('dhikr.contribute')}
                  onPress={handleContributeTap}
                  style={({ pressed }) => [styles.contributeCounter, pressed && { opacity: 0.8, transform: [{ scale: 0.97 }] }]}
                >
                  <LinearGradient
                    colors={[colors.emerald, colors.goldLight]}
                    style={styles.contributeCounterGradient}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                  >
                    <View style={[styles.contributeCounterInner, { backgroundColor: tc.bgCard }]}>
                      <Text style={[styles.contributeCountText, { color: tc.text.primary }]}>{contributeCount}</Text>
                      <Text style={styles.contributeTapHint}>
                        {PHRASE_ARABIC_MAP[detail.phrase] || detail.phrase}
                      </Text>
                    </View>
                  </LinearGradient>
                </Pressable>
                <View style={styles.contributeActions}>
                  <GradientButton
                    label={t('dhikr.contribute')}
                    onPress={handleSubmitContribution}
                    loading={contributeMutation.isPending}
                    icon="send"
                  />
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t('common.cancel')}
                    onPress={() => {
                      setShowContribute(false);
                      setContributeCount(0);
                    }}
                    style={[styles.cancelBtn, { backgroundColor: tc.surface }]}
                  >
                    <Icon name="x" size="sm" color={tc.text.tertiary} />
                  </Pressable>
                </View>
              </View>
            )}
          </View>
        </Animated.View>

        {/* Leaderboard Title */}
        <Animated.View entering={FadeInUp.delay(300).duration(400)}>
          <Text style={[styles.leaderboardTitle, { color: tc.text.primary }]}>{t('dhikr.leaderboard')}</Text>
        </Animated.View>
      </View>
    );
  }, [detail, showContribute, contributeCount, haptic, joinMutation, contributeMutation, handleContributeTap, handleSubmitContribution, t]);

  return (
    <ScreenErrorBoundary>
      <SafeAreaView style={[styles.container, { backgroundColor: tc.bg }]}>
        <GlassHeader
          title={detail?.title ?? t('dhikr.challenges')}
          leftAction={{ icon: 'arrow-left', onPress: () => router.back() }}
        />

        {isLoading ? (
          <LoadingSkeleton />
        ) : isError ? (
          <EmptyState
            icon="alert-circle"
            title={t('common.error')}
            subtitle={t('common.somethingWentWrong')}
            actionLabel={t('common.retry')}
            onAction={() => refetch()}
          />
        ) : (
          <FlatList
            data={detail?.topContributors ?? []}
            keyExtractor={(item, index) => `${item.userId}-${index}`}
            renderItem={useCallback(({ item, index }) => (
              <Animated.View entering={FadeInUp.delay(350 + Math.min(index, 15) * 50).duration(300)}>
                <ContributorRow contributor={item} rank={index + 1} />
              </Animated.View>
            ), [])}
            ListHeaderComponent={renderHeader}
            ListEmptyComponent={
              <EmptyState
                icon="users"
                title={t('islamic.dhikr.noContributors')}
                subtitle={t('islamic.dhikr.beFirstContributor')}
              />
            }
            contentContainerStyle={styles.listContent}
            refreshControl={
              <BrandedRefreshControl refreshing={refreshing} onRefresh={onRefresh} />
            }
          />
        )}
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
    paddingBottom: spacing.xxl,
  },
  skeletonContainer: {
    paddingTop: 100,
    paddingHorizontal: spacing.base,
  },
  progressRingContainer: {
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  progressRingOuter: {
    width: 160,
    height: 160,
    borderRadius: radius.full,
    padding: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  progressRingInner: {
    width: 148,
    height: 148,
    borderRadius: radius.full,
    backgroundColor: colors.dark.bgCard,
    alignItems: 'center',
    justifyContent: 'center',
  },
  progressRingPercent: {
    fontFamily: fonts.heading,
    fontSize: 36,
    color: colors.text.primary,
  },
  progressRingLabel: {
    fontFamily: fonts.body,
    fontSize: fontSize.xs,
    color: colors.text.secondary,
    marginTop: spacing.xs,
  },
  challengeInfo: {
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  challengeTitle: {
    fontFamily: fonts.heading,
    fontSize: fontSize.xl,
    color: colors.text.primary,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  challengePhrase: {
    fontFamily: fonts.arabic,
    fontSize: fontSize.lg,
    color: colors.emerald,
    writingDirection: 'rtl',
    marginBottom: spacing.md,
  },
  metaRow: {
    flexDirection: 'row',
    gap: spacing.lg,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  metaText: {
    fontFamily: fonts.body,
    fontSize: fontSize.sm,
    color: colors.text.tertiary,
  },
  actionRow: {
    marginBottom: spacing.xl,
  },
  actionBtnWrap: {
    marginBottom: spacing.sm,
  },
  contributeSection: {
    alignItems: 'center',
    gap: spacing.md,
  },
  contributeCounter: {
    alignSelf: 'center',
  },
  contributeCounterGradient: {
    width: 100,
    height: 100,
    borderRadius: radius.full,
    padding: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  contributeCounterInner: {
    width: 92,
    height: 92,
    borderRadius: radius.full,
    backgroundColor: colors.dark.bgCard,
    alignItems: 'center',
    justifyContent: 'center',
  },
  contributeCountText: {
    fontFamily: fonts.heading,
    fontSize: fontSizeExt.heading,
    color: colors.text.primary,
  },
  contributeTapHint: {
    fontFamily: fonts.arabic,
    fontSize: fontSize.xs,
    color: colors.emerald,
    writingDirection: 'rtl',
  },
  contributeActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    width: '100%',
  },
  cancelBtn: {
    width: 40,
    height: 40,
    borderRadius: radius.full,
    backgroundColor: colors.dark.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  leaderboardTitle: {
    fontFamily: fonts.heading,
    fontSize: fontSize.md,
    color: colors.text.primary,
    marginBottom: spacing.md,
  },
  contributorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    gap: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.04)',
  },
  rankBadge: {
    width: 28,
    alignItems: 'center',
  },
  rankText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSize.sm,
    color: colors.text.tertiary,
  },
  rankTextTop: {
    color: colors.gold,
  },
  contributorName: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSize.base,
    color: colors.text.primary,
    flex: 1,
  },
  contributorCount: {
    fontFamily: fonts.heading,
    fontSize: fontSize.base,
    color: colors.emerald,
  },
});
