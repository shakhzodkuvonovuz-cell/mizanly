import { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  ScrollView,
} from 'react-native';
import { BrandedRefreshControl } from '@/components/ui/BrandedRefreshControl';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { useRouter } from 'expo-router';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GlassHeader } from '@/components/ui/GlassHeader';
import { Icon } from '@/components/ui/Icon';
import type { IconName } from '@/components/ui/Icon';
import { Avatar } from '@/components/ui/Avatar';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { GradientButton } from '@/components/ui/GradientButton';
import { ScreenErrorBoundary } from '@/components/ui/ScreenErrorBoundary';
import { useTranslation } from '@/hooks/useTranslation';
import { useContextualHaptic } from '@/hooks/useContextualHaptic';
import { useThemeColors } from '@/hooks/useThemeColors';
import { colors, spacing, fontSize, radius, fonts } from '@/theme';
import { volunteerApi } from '@/services/api';

const CATEGORY_KEYS = ['all', 'disaster_relief', 'mosque', 'education', 'food_bank', 'cleanup'] as const;

const CATEGORY_I18N: Record<string, string> = {
  all: 'volunteer.categoryAll',
  disaster_relief: 'volunteer.categoryDisasterRelief',
  mosque: 'volunteer.categoryMosque',
  education: 'volunteer.categoryEducation',
  food_bank: 'volunteer.categoryFoodBank',
  cleanup: 'volunteer.categoryCleanup',
};

type CategoryKey = typeof CATEGORY_KEYS[number];

interface VolunteerOpportunity {
  id: string;
  title: string;
  description: string;
  category: string;
  location?: string;
  date?: string;
  spotsTotal: number;
  spotsFilled: number;
  isActive: boolean;
  organizer: {
    id: string;
    username: string;
    displayName: string;
    avatarUrl?: string;
  };
  createdAt: string;
}

interface VolunteerResponse {
  data: VolunteerOpportunity[];
  meta: { cursor: string | null; hasMore: boolean };
}

function getCategoryIcon(category: string): IconName {
  switch (category) {
    case 'disaster_relief': return 'heart';
    case 'mosque': return 'globe';
    case 'education': return 'layers';
    case 'food_bank': return 'heart-filled';
    case 'cleanup': return 'check-circle';
    default: return 'users';
  }
}

function VolunteerBoardContent() {
  const tc = useThemeColors();
  const styles = createStyles(tc);
  const { t } = useTranslation();
  const router = useRouter();
  const haptic = useContextualHaptic();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();

  const [selectedCategory, setSelectedCategory] = useState<CategoryKey>('all');

  const opportunitiesQuery = useInfiniteQuery<VolunteerResponse>({
    queryKey: ['volunteer-opportunities', selectedCategory],
    queryFn: ({ pageParam }) =>
      volunteerApi.getOpportunities({
        cursor: pageParam as string | undefined,
        category: selectedCategory === 'all' ? undefined : selectedCategory,
      }) as Promise<VolunteerResponse>,
    getNextPageParam: (lastPage) =>
      lastPage.meta.hasMore ? lastPage.meta.cursor ?? undefined : undefined,
    initialPageParam: undefined as string | undefined,
  });

  const signUpMutation = useMutation({
    mutationFn: (id: string) => volunteerApi.signUp(id),
    onSuccess: () => {
      haptic.success();
      queryClient.invalidateQueries({ queryKey: ['volunteer-opportunities'] });
    },
  });

  const allOpportunities = opportunitiesQuery.data?.pages.flatMap((p) => p.data) ?? [];

  const handleRefresh = useCallback(() => {
    opportunitiesQuery.refetch();
  }, [opportunitiesQuery]);

  const handleLoadMore = () => {
    if (opportunitiesQuery.hasNextPage && !opportunitiesQuery.isFetchingNextPage) {
      opportunitiesQuery.fetchNextPage();
    }
  };

  const handleCategoryPress = (key: CategoryKey) => {
    haptic.tick();
    setSelectedCategory(key);
  };

  const handleSignUp = (opportunity: VolunteerOpportunity) => {
    haptic.follow();
    signUpMutation.mutate(opportunity.id);
  };

  const renderCategoryChips = () => (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.chipRow}
    >
      {CATEGORY_KEYS.map((key) => {
        const label = t(CATEGORY_I18N[key], key.replace(/_/g, ' '));
        return (
          <Pressable
            key={key}
            style={[
              styles.chip,
              selectedCategory === key && styles.chipActive,
            ]}
            onPress={() => handleCategoryPress(key)}
            accessibilityRole="button"
            accessibilityLabel={label}
          >
            <Text
              style={[
                styles.chipText,
                selectedCategory === key && styles.chipTextActive,
              ]}
            >
              {label}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );

  const renderOpportunity = ({ item, index }: { item: VolunteerOpportunity; index: number }) => {
    const isFull = item.spotsFilled >= item.spotsTotal;
    const spotsRemaining = item.spotsTotal - item.spotsFilled;
    const fillPercentage = Math.min((item.spotsFilled / item.spotsTotal) * 100, 100);

    return (
      <Animated.View entering={FadeInUp.delay(index * 60).duration(300)}>
        <View style={styles.opportunityCard}>
          {/* Category icon + title */}
          <View style={styles.cardHeader}>
            <View style={styles.categoryIcon}>
              <Icon
                name={getCategoryIcon(item.category)}
                size="md"
                color={colors.emerald}
              />
            </View>
            <View style={styles.cardHeaderInfo}>
              <Text style={styles.cardTitle} numberOfLines={2}>
                {item.title}
              </Text>
              <Text style={styles.cardCategory}>
                {item.category.replace(/_/g, ' ')}
              </Text>
            </View>
          </View>

          {/* Description */}
          <Text style={styles.cardDescription} numberOfLines={2}>
            {item.description}
          </Text>

          {/* Location + Date */}
          <View style={styles.metaRow}>
            {item.location && (
              <View style={styles.metaItem}>
                <Icon name="map-pin" size="xs" color={colors.text.tertiary} />
                <Text style={styles.metaText} numberOfLines={1}>
                  {item.location}
                </Text>
              </View>
            )}
            {item.date && (
              <View style={styles.metaItem}>
                <Icon name="clock" size="xs" color={colors.text.tertiary} />
                <Text style={styles.metaText}>
                  {new Date(item.date).toLocaleDateString()}
                </Text>
              </View>
            )}
          </View>

          {/* Spots progress */}
          <View style={styles.spotsSection}>
            <View style={styles.spotsHeader}>
              <Text style={styles.spotsLabel}>
                {item.spotsFilled}/{item.spotsTotal} {t('volunteer.filled', 'filled')}
              </Text>
              <Text style={[styles.spotsRemaining, isFull && styles.spotsFull]}>
                {isFull
                  ? t('volunteer.full', 'Full')
                  : `${spotsRemaining} ${t('volunteer.spotsLeft', 'spots left')}`}
              </Text>
            </View>
            <View style={styles.progressBarBg}>
              <View
                style={[
                  styles.progressBarFill,
                  { width: `${fillPercentage}%` },
                  isFull && styles.progressBarFull,
                ]}
              />
            </View>
          </View>

          {/* Organizer + Sign Up */}
          <View style={styles.cardFooter}>
            <View style={styles.organizerRow}>
              <Avatar
                uri={item.organizer.avatarUrl}
                name={item.organizer.displayName}
                size="sm"
              />
              <Text style={styles.organizerName} numberOfLines={1}>
                {item.organizer.displayName}
              </Text>
            </View>
            <GradientButton
              label={t('volunteer.signUp', 'Sign Up')}
              onPress={() => handleSignUp(item)}
              size="sm"
              disabled={isFull || signUpMutation.isPending}
              loading={signUpMutation.isPending && signUpMutation.variables === item.id}
            />
          </View>
        </View>
      </Animated.View>
    );
  };

  const renderSkeleton = () => (
    <View style={styles.skeletonWrap}>
      {Array.from({ length: 4 }).map((_, i) => (
        <View key={`skel-${i}`} style={styles.opportunityCard}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
            <Skeleton.Circle size={40} />
            <View style={{ flex: 1 }}>
              <Skeleton.Text width="70%" />
              <Skeleton.Text width="30%" />
            </View>
          </View>
          <Skeleton.Text width="90%" />
          <Skeleton.Text width="60%" />
          <Skeleton.Rect width="100%" height={6} borderRadius={radius.full} />
        </View>
      ))}
    </View>
  );

  return (
    <View style={styles.container}>
      <GlassHeader
        title={t('volunteer.title', 'Volunteer')}
        leftAction={{
          icon: 'arrow-left',
          onPress: () => router.back(),
          accessibilityLabel: t('common.back', 'Back'),
        }}
      />

      <View style={[styles.content, { paddingTop: insets.top + 52 }]}>
        {opportunitiesQuery.isLoading ? (
          <View style={styles.listPadding}>
            {renderCategoryChips()}
            {renderSkeleton()}
          </View>
        ) : (
          <FlatList
            data={allOpportunities}
            renderItem={renderOpportunity}
            keyExtractor={(item) => item.id}
            ListHeaderComponent={renderCategoryChips}
            ListEmptyComponent={
              <EmptyState
                icon="users"
                title={t('volunteer.empty', 'No opportunities yet')}
                subtitle={t('volunteer.emptySub', 'Check back later for volunteer opportunities')}
              />
            }
            ListFooterComponent={
              opportunitiesQuery.isFetchingNextPage ? (
                <View style={styles.footerLoader}>
                  <Skeleton.Rect width={120} height={20} borderRadius={radius.sm} />
                </View>
              ) : null
            }
            contentContainerStyle={styles.listPadding}
            onEndReached={handleLoadMore}
            onEndReachedThreshold={0.5}
            refreshControl={
              <BrandedRefreshControl
                refreshing={opportunitiesQuery.isFetching && !opportunitiesQuery.isLoading}
                onRefresh={handleRefresh}
              />
            }
          />
        )}
      </View>
    </View>
  );
}

export default function VolunteerBoardScreen() {
  return (
    <ScreenErrorBoundary>
      <VolunteerBoardContent />
    </ScreenErrorBoundary>
  );
}

const createStyles = (tc: ReturnType<typeof useThemeColors>) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: tc.bg,
  },
  content: {
    flex: 1,
  },
  listPadding: {
    paddingHorizontal: spacing.base,
    paddingBottom: spacing['2xl'],
  },
  // Category chips
  chipRow: {
    gap: spacing.sm,
    paddingBottom: spacing.md,
    paddingTop: spacing.sm,
  },
  chip: {
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
    backgroundColor: tc.bgCard,
    borderWidth: 1,
    borderColor: tc.border,
  },
  chipActive: {
    backgroundColor: colors.active.emerald10,
    borderColor: colors.emerald,
  },
  chipText: {
    color: colors.text.secondary,
    fontSize: fontSize.sm,
    fontFamily: fonts.bodySemiBold,
  },
  chipTextActive: {
    color: colors.emerald,
  },
  // Opportunity card
  opportunityCard: {
    backgroundColor: tc.bgCard,
    borderRadius: radius.lg,
    padding: spacing.base,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: tc.border,
    gap: spacing.md,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  categoryIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.active.emerald10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardHeaderInfo: {
    flex: 1,
    gap: 2,
  },
  cardTitle: {
    color: colors.text.primary,
    fontSize: fontSize.base,
    fontFamily: fonts.bodySemiBold,
    lineHeight: 20,
  },
  cardCategory: {
    color: colors.emerald,
    fontSize: fontSize.xs,
    fontFamily: fonts.bodySemiBold,
    textTransform: 'capitalize',
  },
  cardDescription: {
    color: colors.text.secondary,
    fontSize: fontSize.sm,
    fontFamily: fonts.body,
    lineHeight: 20,
  },
  // Meta
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  metaText: {
    color: colors.text.tertiary,
    fontSize: fontSize.xs,
    fontFamily: fonts.body,
  },
  // Spots
  spotsSection: {
    gap: spacing.xs,
  },
  spotsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  spotsLabel: {
    color: colors.text.secondary,
    fontSize: fontSize.xs,
    fontFamily: fonts.bodySemiBold,
  },
  spotsRemaining: {
    color: colors.emerald,
    fontSize: fontSize.xs,
    fontFamily: fonts.bodySemiBold,
  },
  spotsFull: {
    color: colors.error,
  },
  progressBarBg: {
    height: 6,
    backgroundColor: tc.surface,
    borderRadius: radius.full,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: colors.emerald,
    borderRadius: radius.full,
  },
  progressBarFull: {
    backgroundColor: colors.error,
  },
  // Footer
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  organizerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flex: 1,
  },
  organizerName: {
    color: colors.text.secondary,
    fontSize: fontSize.sm,
    fontFamily: fonts.body,
    flex: 1,
  },
  // Skeleton
  skeletonWrap: {
    gap: spacing.md,
  },
  footerLoader: {
    paddingVertical: spacing.base,
    alignItems: 'center',
  },
});
