import { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
  Pressable,
  Dimensions,
  Pressable,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeInUp, FadeIn } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { useQuery } from '@tanstack/react-query';
import { Icon } from '@/components/ui/Icon';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { GlassHeader } from '@/components/ui/GlassHeader';
import { ScreenErrorBoundary } from '@/components/ui/ScreenErrorBoundary';
import { colors, spacing, fontSize, radius, fonts, fontSizeExt } from '@/theme';
import { gamificationApi } from '@/services/api';
import { useTranslation } from '@/hooks/useTranslation';
import { useThemeColors } from '@/hooks/useThemeColors';
import { useHaptic } from '@/hooks/useHaptic';
import { rtlFlexRow, rtlTextAlign } from '@/utils/rtl';
import type { IconName } from '@/components/ui/Icon';

const { width: screenWidth } = Dimensions.get('window');
const CARD_GAP = spacing.md;
const CARD_WIDTH = (screenWidth - spacing.base * 2 - CARD_GAP) / 2;

type AchievementCategory = 'all' | 'content' | 'social' | 'islamic' | 'milestone' | 'special';
type AchievementRarity = 'common' | 'rare' | 'epic' | 'legendary';

interface Achievement {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: AchievementCategory;
  rarity: AchievementRarity;
  isUnlocked: boolean;
  unlockedAt?: string;
  criteria?: string;
}

const RARITY_COLORS: Record<AchievementRarity, string> = {
  common: colors.text.secondary,
  rare: colors.extended.blue,
  epic: colors.extended.purple,
  legendary: colors.gold,
};

const RARITY_GRADIENTS: Record<AchievementRarity, [string, string]> = {
  common: ['rgba(139,148,158,0.15)', 'rgba(139,148,158,0.05)'],
  rare: ['rgba(88,166,255,0.15)', 'rgba(88,166,255,0.05)'],
  epic: ['rgba(163,113,247,0.15)', 'rgba(163,113,247,0.05)'],
  legendary: ['rgba(200,150,62,0.2)', 'rgba(200,150,62,0.05)'],
};

const CATEGORY_ICONS: Record<string, IconName> = {
  all: 'layers',
  content: 'edit',
  social: 'users',
  islamic: 'globe',
  milestone: 'trending-up',
  special: 'star' as IconName,
};

function AchievementCard({
  achievement,
  index,
  isRTL,
}: {
  achievement: Achievement;
  index: number;
  isRTL: boolean;
}) {
  const { t } = useTranslation();
  const tc = useThemeColors();
  const rarityColor = RARITY_COLORS[achievement.rarity];
  const gradientColors = RARITY_GRADIENTS[achievement.rarity];

  return (
    <Animated.View
      entering={FadeInUp.delay(Math.min(index * 80, 800)).duration(400)}
      style={styles.cardOuter}
    >
      <LinearGradient
        colors={achievement.isUnlocked ? gradientColors : ['rgba(45,53,72,0.3)', 'rgba(28,35,51,0.1)']}
        style={[
          styles.achievementCard,
          !achievement.isUnlocked && styles.lockedCard,
        ]}
      >
        {/* Icon / Lock overlay */}
        <View style={styles.iconContainer}>
          <LinearGradient
            colors={
              achievement.isUnlocked
                ? [RARITY_COLORS[achievement.rarity] + '30', RARITY_COLORS[achievement.rarity] + '10']
                : ['rgba(45,53,72,0.5)', 'rgba(28,35,51,0.3)']
            }
            style={styles.iconCircle}
          >
            {achievement.isUnlocked ? (
              <Icon name="check-circle" size="lg" color={rarityColor} />
            ) : (
              <Icon name="lock" size="lg" color={colors.text.tertiary} />
            )}
          </LinearGradient>
          {achievement.isUnlocked && (
            <View style={[styles.checkBadge, { backgroundColor: rarityColor }]}>
              <Icon name="check" size={10} color="#FFFFFF" />
            </View>
          )}
        </View>

        {/* Name */}
        <Text
          style={[
            styles.cardName,
            !achievement.isUnlocked && styles.lockedText,
            { textAlign: 'center' },
          ]}
          numberOfLines={2}
        >
          {achievement.name}
        </Text>

        {/* Description */}
        <Text
          style={[styles.cardDesc, { textAlign: 'center' }]}
          numberOfLines={2}
        >
          {achievement.isUnlocked ? achievement.description : (achievement.criteria ?? achievement.description)}
        </Text>

        {/* Rarity badge */}
        <View style={[styles.rarityBadge, { backgroundColor: rarityColor + '20' }]}>
          <Text style={[styles.rarityText, { color: rarityColor }]}>
            {t(`gamification.achievements.${achievement.rarity}`)}
          </Text>
        </View>

        {/* Unlock date */}
        {achievement.isUnlocked && achievement.unlockedAt && (
          <Text style={styles.unlockDate}>
            {t('gamification.achievements.unlockedAt', {
              date: new Date(achievement.unlockedAt).toLocaleDateString(),
            })}
          </Text>
        )}
      </LinearGradient>
    </Animated.View>
  );
}

function LoadingSkeleton() {
  return (
    <View style={styles.skeletonWrap}>
      <View style={styles.chipRow}>
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton.Rect key={i} width={80} height={32} borderRadius={radius.full} />
        ))}
      </View>
      <Skeleton.Rect width={120} height={18} borderRadius={radius.sm} />
      <View style={styles.gridRow}>
        {Array.from({ length: 6 }).map((_, i) => (
          <View key={i} style={styles.skeletonCard}>
            <Skeleton.Circle size={48} />
            <Skeleton.Text width="80%" />
            <Skeleton.Text width="60%" />
            <Skeleton.Rect width={60} height={20} borderRadius={radius.full} />
          </View>
        ))}
      </View>
    </View>
  );
}

function AchievementsScreen() {
  const { t, isRTL } = useTranslation();
  const router = useRouter();
  const haptic = useHaptic();
  const [selectedCategory, setSelectedCategory] = useState<AchievementCategory>('all');

  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['achievements'],
    queryFn: async () => {
      const res = await gamificationApi.getAchievements() as { data?: { achievements: Achievement[] }; achievements?: Achievement[] };
      const inner = res.data ?? res;
      return inner as { achievements: Achievement[] };
    },
  });

  const achievements = data?.achievements ?? [];
  const filtered =
    selectedCategory === 'all'
      ? achievements
      : achievements.filter((a) => a.category === selectedCategory);
  const unlockedCount = achievements.filter((a) => a.isUnlocked).length;

  const categories: { key: AchievementCategory; label: string }[] = [
    { key: 'all', label: t('common.viewAll') },
    { key: 'content', label: t('gamification.achievements.categoryContent') },
    { key: 'social', label: t('gamification.achievements.categorySocial') },
    { key: 'islamic', label: t('gamification.achievements.categoryIslamic') },
    { key: 'milestone', label: t('gamification.achievements.categoryMilestone') },
    { key: 'special', label: t('gamification.achievements.categorySpecial') },
  ];

  const handleCategoryChange = useCallback(
    (cat: AchievementCategory) => {
      haptic.light();
      setSelectedCategory(cat);
    },
    [haptic],
  );

  const renderItem = useCallback(
    ({ item, index }: { item: Achievement; index: number }) => (
      <AchievementCard achievement={item} index={index} isRTL={isRTL} />
    ),
    [isRTL],
  );

  const keyExtractor = useCallback((item: Achievement) => item.id, []);

  const ListHeader = (
    <>
      {/* Category chips */}
      <FlatList
        data={categories}
        horizontal
        showsHorizontalScrollIndicator={false}
        keyExtractor={(item) => item.key}
        contentContainerStyle={styles.chipRow}
        inverted={isRTL}
        renderItem={({ item: cat }) => (
          <Pressable
            onPress={() => handleCategoryChange(cat.key)}
            accessibilityRole="tab"
            accessibilityState={{ selected: selectedCategory === cat.key }}
            accessibilityLabel={cat.label}
          >
            <LinearGradient
              colors={
                selectedCategory === cat.key
                  ? [colors.emeraldLight, colors.emerald]
                  : colors.gradient.cardDark
              }
              style={styles.chip}
            >
              <Text
                style={[
                  styles.chipText,
                  selectedCategory === cat.key && styles.chipTextActive,
                ]}
              >
                {cat.label}
              </Text>
            </LinearGradient>
          </Pressable>
        )}
      />

      {/* Progress counter */}
      <Animated.View entering={FadeIn.duration(400)} style={[styles.counterRow, { flexDirection: rtlFlexRow(isRTL) }]}>
        <Icon name="check-circle" size="sm" color={colors.emerald} />
        <Text style={styles.counterText}>
          {unlockedCount}/{achievements.length} {t('gamification.achievements.unlocked')}
        </Text>
      </Animated.View>
    </>
  );

  return (
    <View style={[styles.container, { backgroundColor: tc.bg }]}>
      <GlassHeader
        title={t('gamification.achievements.title')}
        leftAction={{
          icon: 'arrow-left',
          onPress: () => router.back(),
          accessibilityLabel: t('common.back'),
        }}
      />

      <View style={styles.content}>
        {isLoading ? (
          <LoadingSkeleton />
        ) : achievements.length === 0 ? (
          <EmptyState
            icon="check-circle"
            title={t('gamification.achievements.title')}
            subtitle={t('gamification.achievements.startUsing')}
            actionLabel={t('common.retry')}
            onAction={() => refetch()}
          />
        ) : (
          <FlatList
            data={filtered}
            renderItem={renderItem}
            keyExtractor={keyExtractor}
            numColumns={2}
            columnWrapperStyle={styles.gridRow}
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
            ListEmptyComponent={
              <EmptyState
                icon="check-circle"
                title={t('gamification.achievements.locked')}
                subtitle={t('gamification.achievements.noneInCategory')}
              />
            }
          />
        )}
      </View>
    </View>
  );
}

export default function AchievementsScreenWrapper() {
  return (
    <ScreenErrorBoundary>
      <AchievementsScreen />
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
  // Chips
  chipRow: {
    gap: spacing.sm,
    paddingVertical: spacing.md,
  },
  chip: {
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
  },
  chipText: {
    fontFamily: fonts.bodyMedium,
    fontSize: fontSize.sm,
    color: colors.text.secondary,
  },
  chipTextActive: {
    color: '#FFFFFF',
    fontFamily: fonts.bodySemiBold,
  },
  // Counter
  counterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.base,
  },
  counterText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSize.base,
    color: colors.text.primary,
  },
  // Grid
  gridRow: {
    gap: CARD_GAP,
    marginBottom: CARD_GAP,
  },
  cardOuter: {
    width: CARD_WIDTH,
  },
  achievementCard: {
    borderRadius: radius.lg,
    padding: spacing.base,
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: 0.5,
    borderColor: colors.dark.borderLight,
    minHeight: 200,
  },
  lockedCard: {
    opacity: 0.6,
  },
  lockedText: {
    color: colors.text.tertiary,
  },
  iconContainer: {
    position: 'relative',
    marginBottom: spacing.xs,
  },
  iconCircle: {
    width: 56,
    height: 56,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkBadge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 18,
    height: 18,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.dark.bg,
  },
  cardName: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSize.sm,
    color: colors.text.primary,
  },
  cardDesc: {
    fontFamily: fonts.body,
    fontSize: fontSize.xs,
    color: colors.text.secondary,
    lineHeight: 16,
  },
  rarityBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.full,
  },
  rarityText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSizeExt.tiny,
  },
  unlockDate: {
    fontFamily: fonts.body,
    fontSize: fontSizeExt.tiny,
    color: colors.text.tertiary,
  },
  // Skeleton
  skeletonWrap: {
    paddingHorizontal: spacing.base,
    paddingTop: spacing.lg,
    gap: spacing.base,
  },
  skeletonCard: {
    width: CARD_WIDTH,
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.base,
  },
});
