import { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
  Pressable,
} from 'react-native';
import { useRouter } from 'expo-router';
import Animated, { FadeInUp, FadeIn } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { useQuery } from '@tanstack/react-query';
import { useUser } from '@clerk/clerk-expo';
import { Icon } from '@/components/ui/Icon';
import { Avatar } from '@/components/ui/Avatar';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { GlassHeader } from '@/components/ui/GlassHeader';
import { VerifiedBadge } from '@/components/ui/VerifiedBadge';
import { ScreenErrorBoundary } from '@/components/ui/ScreenErrorBoundary';
import { colors, spacing, fontSize, radius, fonts, fontSizeExt } from '@/theme';
import { gamificationApi } from '@/services/api';
import { useTranslation } from '@/hooks/useTranslation';
import { useHaptic } from '@/hooks/useHaptic';
import { useThemeColors } from '@/hooks/useThemeColors';
import { rtlFlexRow, rtlTextAlign } from '@/utils/rtl';

type LeaderboardTab = 'xp' | 'streaks' | 'helpers';

interface LeaderboardEntry {
  userId: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  isVerified: boolean;
  score: number;
  rank: number;
}

const GOLD = '#FFD700';
const SILVER = '#C0C0C0';
const BRONZE = '#CD7F32';

function PodiumCard({
  entry,
  position,
  isRTL,
}: {
  entry: LeaderboardEntry;
  position: 1 | 2 | 3;
  isRTL: boolean;
}) {
  const router = useRouter();
  const tc = useThemeColors();
  const medalColor = position === 1 ? GOLD : position === 2 ? SILVER : BRONZE;
  const height = position === 1 ? 140 : position === 2 ? 110 : 90;

  return (
    <Animated.View
      entering={FadeInUp.delay(position * 150).duration(500)}
      style={[styles.podiumCard, { height }]}
    >
      <Pressable
        onPress={() => router.push(`/(screens)/profile/${entry.username}`)}
        accessibilityLabel={`${entry.displayName}, rank ${position}`}
        accessibilityRole="button"
      >
        <View style={styles.podiumAvatarWrap}>
          <Avatar uri={entry.avatarUrl} name={entry.displayName} size="lg" showRing ringColor={medalColor} />
          <View style={[styles.medalBadge, { borderColor: tc.bg }, { backgroundColor: medalColor }]}>
            <Text style={styles.medalText}>{position}</Text>
          </View>
        </View>
        <Text style={styles.podiumName} numberOfLines={1}>
          {entry.displayName}
        </Text>
        <View style={[styles.podiumScoreRow, { flexDirection: rtlFlexRow(isRTL) }]}>
          <Icon name="trending-up" size="xs" color={medalColor} />
          <Text style={[styles.podiumScore, { color: medalColor }]}>
            {entry.score.toLocaleString()}
          </Text>
        </View>
      </Pressable>
    </Animated.View>
  );
}

function LeaderboardRow({
  entry,
  isCurrentUser,
  index,
  isRTL,
}: {
  entry: LeaderboardEntry;
  isCurrentUser: boolean;
  index: number;
  isRTL: boolean;
}) {
  const router = useRouter();

  return (
    <Animated.View entering={FadeInUp.delay(Math.min(index * 60, 600)).duration(400)}>
      <Pressable
        onPress={() => router.push(`/(screens)/profile/${entry.username}`)}
        accessibilityLabel={`${entry.displayName}, rank ${entry.rank}, score ${entry.score}`}
        accessibilityRole="button"
      >
        <LinearGradient
          colors={
            isCurrentUser
              ? ['rgba(10,123,79,0.15)', 'rgba(10,123,79,0.05)']
              : ['rgba(45,53,72,0.3)', 'rgba(28,35,51,0.1)']
          }
          style={[
            styles.listRow,
            { flexDirection: rtlFlexRow(isRTL) },
            isCurrentUser && styles.currentUserRow,
          ]}
        >
          <Text style={styles.rankText}>
            {entry.rank}
          </Text>
          <Avatar uri={entry.avatarUrl} name={entry.displayName} size="sm" />
          <View style={styles.listNameWrap}>
            <View style={[styles.nameRow, { flexDirection: rtlFlexRow(isRTL) }]}>
              <Text
                style={[styles.listName, { textAlign: rtlTextAlign(isRTL) }]}
                numberOfLines={1}
              >
                {entry.displayName}
              </Text>
              {entry.isVerified && <VerifiedBadge size={13} />}
            </View>
            <Text style={[styles.listUsername, { textAlign: rtlTextAlign(isRTL) }]}>
              @{entry.username}
            </Text>
          </View>
          <Text style={styles.listScore}>{entry.score.toLocaleString()}</Text>
        </LinearGradient>
      </Pressable>
    </Animated.View>
  );
}

function LoadingSkeleton() {
  return (
    <View style={styles.skeletonContainer}>
      <View style={styles.podiumRow}>
        {[1, 2, 3].map((i) => (
          <View key={i} style={styles.podiumSkeletonItem}>
            <Skeleton.Circle size={52} />
            <Skeleton.Text width={60} />
            <Skeleton.Rect width={40} height={14} borderRadius={radius.sm} />
          </View>
        ))}
      </View>
      {Array.from({ length: 7 }).map((_, i) => (
        <View key={i} style={styles.skeletonRow}>
          <Skeleton.Rect width={24} height={20} borderRadius={radius.sm} />
          <Skeleton.Circle size={32} />
          <View style={{ flex: 1, gap: spacing.xs }}>
            <Skeleton.Text width="60%" />
            <Skeleton.Text width="30%" />
          </View>
          <Skeleton.Rect width={50} height={18} borderRadius={radius.sm} />
        </View>
      ))}
    </View>
  );
}

function LeaderboardScreen() {
  const { t, isRTL } = useTranslation();
  const router = useRouter();
  const haptic = useHaptic();
  const { user } = useUser();
  const [activeTab, setActiveTab] = useState<LeaderboardTab>('xp');
  const tc = useThemeColors();

  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['leaderboard', activeTab],
    queryFn: async () => {
      const res = await gamificationApi.getLeaderboard(activeTab, 50) as { entries: LeaderboardEntry[] };
      return res;
    },
  });

  const entries = data?.entries ?? [];
  const top3 = entries.slice(0, 3);
  const rest = entries.slice(3);

  const handleTabChange = useCallback(
    (tab: LeaderboardTab) => {
      haptic.light();
      setActiveTab(tab);
    },
    [haptic],
  );

  const tabs: { key: LeaderboardTab; label: string }[] = [
    { key: 'xp', label: t('gamification.leaderboard.xp') },
    { key: 'streaks', label: t('gamification.leaderboard.streaks') },
    { key: 'helpers', label: t('gamification.leaderboard.helpers') },
  ];

  const renderItem = useCallback(
    ({ item, index }: { item: LeaderboardEntry; index: number }) => (
      <LeaderboardRow
        entry={item}
        isCurrentUser={item.userId === user?.id}
        index={index}
        isRTL={isRTL}
      />
    ),
    [user?.id, isRTL],
  );

  const keyExtractor = useCallback((item: LeaderboardEntry) => item.userId, []);

  // Re-order podium: [2nd, 1st, 3rd]
  const podiumOrder = top3.length >= 3 ? [top3[1], top3[0], top3[2]] : top3;

  const ListHeader = (
    <>
      {/* Tab Chips */}
      <View style={[styles.tabRow, { flexDirection: rtlFlexRow(isRTL) }]}>
        {tabs.map((tab) => (
          <Pressable
            key={tab.key}
            onPress={() => handleTabChange(tab.key)}
            accessibilityRole="tab"
            accessibilityState={{ selected: activeTab === tab.key }}
            accessibilityLabel={tab.label}
          >
            <LinearGradient
              colors={
                activeTab === tab.key
                  ? [colors.emeraldLight, colors.emerald]
                  : colors.gradient.cardDark
              }
              style={styles.tabChip}
            >
              <Text
                style={[
                  styles.tabLabel,
                  activeTab === tab.key && styles.tabLabelActive,
                ]}
              >
                {tab.label}
              </Text>
            </LinearGradient>
          </Pressable>
        ))}
      </View>

      {/* Podium */}
      {top3.length >= 3 && (
        <Animated.View
          entering={FadeIn.duration(400)}
          style={[styles.podiumRow, { flexDirection: rtlFlexRow(isRTL) }]}
        >
          {podiumOrder.map((entry, i) => (
            <PodiumCard
              key={entry.userId}
              entry={entry}
              position={(i === 0 ? 2 : i === 1 ? 1 : 3) as 1 | 2 | 3}
              isRTL={isRTL}
            />
          ))}
        </Animated.View>
      )}
    </>
  );

  return (
    <View style={[styles.container, { backgroundColor: tc.bg }]}>
      <GlassHeader
        title={t('gamification.leaderboard.title')}
        leftAction={{
          icon: 'arrow-left',
          onPress: () => router.back(),
          accessibilityLabel: t('common.back'),
        }}
      />

      <View style={styles.content}>
        {isLoading ? (
          <LoadingSkeleton />
        ) : entries.length === 0 ? (
          <EmptyState
            icon="bar-chart-2"
            title={t('gamification.leaderboard.title')}
            subtitle={t('gamification.leaderboard.noData')}
            actionLabel={t('common.retry')}
            onAction={() => refetch()}
          />
        ) : (
          <FlatList
            data={rest}
            renderItem={renderItem}
            keyExtractor={keyExtractor}
            ListHeaderComponent={ListHeader}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl
                refreshing={isRefetching}
                onRefresh={refetch}
                tintColor={colors.emerald}
              />
            }
          />
        )}
      </View>
    </View>
  );
}

export default function LeaderboardScreenWrapper() {
  return (
    <ScreenErrorBoundary>
      <LeaderboardScreen />
    </ScreenErrorBoundary>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.dark.bg,
  },
  content: {
    flex: 1,
    paddingTop: 100,
  },
  listContent: {
    paddingHorizontal: spacing.base,
    paddingBottom: spacing['2xl'],
  },
  skeletonContainer: {
    paddingHorizontal: spacing.base,
    paddingTop: spacing.lg,
    gap: spacing.md,
  },
  skeletonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
  },
  // Tabs
  tabRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.lg,
    justifyContent: 'center',
  },
  tabChip: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
  },
  tabLabel: {
    fontFamily: fonts.bodyMedium,
    fontSize: fontSize.sm,
    color: colors.text.secondary,
  },
  tabLabelActive: {
    color: '#FFFFFF',
    fontFamily: fonts.bodySemiBold,
  },
  // Podium
  podiumRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'flex-end',
    gap: spacing.md,
    marginBottom: spacing.xl,
    paddingHorizontal: spacing.sm,
  },
  podiumCard: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingBottom: spacing.sm,
  },
  podiumSkeletonItem: {
    flex: 1,
    alignItems: 'center',
    gap: spacing.sm,
  },
  podiumAvatarWrap: {
    position: 'relative',
    marginBottom: spacing.sm,
  },
  medalBadge: {
    position: 'absolute',
    bottom: -4,
    right: -4,
    width: 22,
    height: 22,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.dark.bg,
  },
  medalText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSizeExt.tiny,
    color: '#000',
  },
  podiumName: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSize.sm,
    color: colors.text.primary,
    textAlign: 'center',
    maxWidth: 90,
  },
  podiumScoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  podiumScore: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSize.sm,
  },
  // List
  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.base,
    marginBottom: spacing.sm,
    borderRadius: radius.md,
    gap: spacing.md,
  },
  currentUserRow: {
    borderWidth: 1,
    borderColor: colors.emerald,
  },
  rankText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSize.base,
    color: colors.text.secondary,
    width: 28,
    textAlign: 'center',
  },
  listNameWrap: {
    flex: 1,
    gap: 2,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  listName: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSize.base,
    color: colors.text.primary,
  },
  listUsername: {
    fontFamily: fonts.body,
    fontSize: fontSize.xs,
    color: colors.text.tertiary,
  },
  listScore: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSize.base,
    color: colors.emerald,
  },
});
