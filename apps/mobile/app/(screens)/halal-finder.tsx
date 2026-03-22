import { useState, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, Pressable, FlatList, RefreshControl, Linking, Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Image } from 'expo-image';
import * as Location from 'expo-location';
import { SafeAreaView } from 'react-native-safe-area-context';
import { GlassHeader } from '@/components/ui/GlassHeader';
import { Icon } from '@/components/ui/Icon';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { ScreenErrorBoundary } from '@/components/ui/ScreenErrorBoundary';
import { useTranslation } from '@/hooks/useTranslation';
import { useHaptic } from '@/hooks/useHaptic';
import { useThemeColors } from '@/hooks/useThemeColors';
import { colors, spacing, fontSize, radius } from '@/theme';
import { api } from '@/services/api';
import { rtlFlexRow, rtlTextAlign } from '@/utils/rtl';

const CUISINE_TYPES = [
  'Middle Eastern', 'South Asian', 'Turkish', 'Malaysian', 'Indonesian',
  'North African', 'Persian', 'Pakistani', 'Bangladeshi', 'Mediterranean',
];

interface HalalRestaurant {
  id: string;
  name: string;
  address: string;
  city: string;
  cuisineType?: string;
  priceRange?: number;
  halalCertified: boolean;
  isVerified: boolean;
  averageRating: number;
  reviewCount: number;
  imageUrl?: string;
  distanceKm?: number;
}

function RestaurantCard({ restaurant, onPress }: { restaurant: HalalRestaurant; onPress: () => void }) {
  const { t, isRTL } = useTranslation();
  const tc = useThemeColors();

  const priceLabel = restaurant.priceRange
    ? '$'.repeat(restaurant.priceRange)
    : '';

  return (
    <Pressable
      style={[styles.card, { backgroundColor: tc.bgCard, borderColor: tc.border }]}
      onPress={onPress}
      accessibilityLabel={restaurant.name}
      accessibilityRole="button"
    >
      {restaurant.imageUrl && (
        <Image
          source={{ uri: restaurant.imageUrl }}
          style={styles.cardImage}
          contentFit="cover"
        />
      )}
      <View style={styles.cardContent}>
        <View style={[styles.cardHeader, { flexDirection: rtlFlexRow(isRTL) }]}>
          <Text style={[styles.cardName, { textAlign: rtlTextAlign(isRTL) }]} numberOfLines={1}>
            {restaurant.name}
          </Text>
          {restaurant.halalCertified && (
            <View style={styles.certBadge}>
              <Text style={styles.certBadgeText}>{t('halal.certified')}</Text>
            </View>
          )}
          {restaurant.isVerified && !restaurant.halalCertified && (
            <View style={styles.verifiedBadge}>
              <Text style={styles.verifiedBadgeText}>{t('halal.verified')}</Text>
            </View>
          )}
        </View>

        <Text style={styles.cardAddress} numberOfLines={1}>{restaurant.address}</Text>

        <View style={[styles.cardMeta, { flexDirection: rtlFlexRow(isRTL) }]}>
          {restaurant.cuisineType && (
            <Text style={styles.metaText}>{restaurant.cuisineType}</Text>
          )}
          {priceLabel ? <Text style={styles.metaText}>{priceLabel}</Text> : null}
          {restaurant.averageRating > 0 && (
            <View style={[styles.ratingRow, { flexDirection: rtlFlexRow(isRTL) }]}>
              <Icon name="heart-filled" size={12} color={colors.gold} />
              <Text style={styles.ratingText}>
                {restaurant.averageRating.toFixed(1)} ({restaurant.reviewCount})
              </Text>
            </View>
          )}
          {restaurant.distanceKm !== undefined && (
            <Text style={styles.distanceText}>
              {t('halal.distance', { distance: restaurant.distanceKm.toString() })}
            </Text>
          )}
        </View>
      </View>
    </Pressable>
  );
}

export default function HalalFinderScreen() {
  const router = useRouter();
  const { t, isRTL } = useTranslation();
  const haptic = useHaptic();
  const [selectedCuisine, setSelectedCuisine] = useState<string | null>(null);
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null);
  const tc = useThemeColors();

  // Request location
  const locationQuery = useQuery({
    queryKey: ['user-location'],
    queryFn: async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        return { lat: 21.4225, lng: 39.8262 }; // Default: Mecca
      }
      const loc = await Location.getCurrentPositionAsync({});
      return { lat: loc.coords.latitude, lng: loc.coords.longitude };
    },
    staleTime: 5 * 60 * 1000,
  });

  const currentLocation = locationQuery.data || location || { lat: 21.4225, lng: 39.8262 };

  const restaurantsQuery = useQuery({
    queryKey: ['halal-restaurants', currentLocation.lat, currentLocation.lng, selectedCuisine],
    queryFn: () =>
      api.get(`/halal/restaurants?lat=${currentLocation.lat}&lng=${currentLocation.lng}&radius=25${selectedCuisine ? `&cuisine=${selectedCuisine}` : ''}`
      }).then((r) => r.data),
    enabled: !!currentLocation,
  });

  const restaurants: HalalRestaurant[] = restaurantsQuery.data?.data ?? [];

  const handleRefresh = useCallback(() => {
    restaurantsQuery.refetch();
  }, [restaurantsQuery]);

  const handleOpenDirections = useCallback((restaurant: HalalRestaurant) => {
    const url = Platform.select({
      ios: `maps:0,0?q=${encodeURIComponent(restaurant.name)}&ll=${restaurant.address}`,
      android: `geo:0,0?q=${encodeURIComponent(restaurant.address)}`,
      default: `https://maps.google.com/?q=${encodeURIComponent(restaurant.address)}`,
    });
    if (url) Linking.openURL(url).catch(() => {});
  }, []);

  const listHeader = useMemo(() => (
    <View>
      {/* Cuisine filter chips */}
      <FlatList
        horizontal
        showsHorizontalScrollIndicator={false}
        data={CUISINE_TYPES}
        keyExtractor={(item) => item}
        contentContainerStyle={styles.chipsContainer}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => {
              haptic.selection();
              setSelectedCuisine(selectedCuisine === item ? null : item);
            }}
            style={[
              styles.chip, { backgroundColor: tc.bgElevated, borderColor: tc.border },
              selectedCuisine === item && styles.chipActive,
            ]}
            accessibilityLabel={item}
            accessibilityRole="button"
          >
            <Text style={[
              styles.chipText,
              selectedCuisine === item && styles.chipTextActive,
            ]}>
              {item}
            </Text>
          </Pressable>
        )}
      />
    </View>
  ), [selectedCuisine, haptic]);

  const listEmpty = useMemo(() => (
    !restaurantsQuery.isLoading ? (
      <EmptyState
        icon="map-pin"
        title={t('halal.restaurants')}
        subtitle={selectedCuisine
          ? `No ${selectedCuisine} restaurants found nearby`
          : 'No halal restaurants found nearby'}
      />
    ) : null
  ), [restaurantsQuery.isLoading, selectedCuisine, t]);

  return (
    <ScreenErrorBoundary>
      <SafeAreaView style={[styles.container, { backgroundColor: tc.bg }]} edges={['top']}>
        <GlassHeader
          title={t('halal.finder')}
          leftAction={{
            icon: <Icon name="arrow-left" size="md" color={colors.text.primary} />,
            onPress: () => router.back(),
            accessibilityLabel: 'Go back',
          }}
        />

        <FlatList
          data={restaurants}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <RestaurantCard
              restaurant={item}
              onPress={() => handleOpenDirections(item)}
            />
          )}
          ListHeaderComponent={listHeader}
          ListEmptyComponent={listEmpty}
          refreshControl={
            <RefreshControl
              refreshing={restaurantsQuery.isRefetching}
              onRefresh={handleRefresh}
              tintColor={colors.emerald}
            />
          }
          contentContainerStyle={styles.listContent}
          ListFooterComponent={
            restaurantsQuery.isLoading ? (
              <View style={{ gap: spacing.md, padding: spacing.base }}>
                <Skeleton.Rect width="100%" height={100} borderRadius={radius.md} />
                <Skeleton.Rect width="100%" height={100} borderRadius={radius.md} />
                <Skeleton.Rect width="100%" height={100} borderRadius={radius.md} />
              </View>
            ) : null
          }
        />
      </SafeAreaView>
    </ScreenErrorBoundary>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.dark.bg },
  listContent: { paddingBottom: spacing.xl },
  chipsContainer: {
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    gap: spacing.sm,
  },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.full,
    backgroundColor: colors.dark.bgElevated,
    borderWidth: 1,
    borderColor: colors.dark.border,
    marginRight: spacing.sm,
  },
  chipActive: {
    backgroundColor: colors.emerald,
    borderColor: colors.emerald,
  },
  chipText: {
    color: colors.text.secondary,
    fontSize: fontSize.sm,
  },
  chipTextActive: {
    color: '#fff',
    fontWeight: '600',
  },
  card: {
    marginHorizontal: spacing.base,
    marginBottom: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.dark.bgCard,
    overflow: 'hidden',
    borderWidth: 0.5,
    borderColor: colors.dark.border,
  },
  cardImage: {
    width: '100%',
    height: 140,
  },
  cardContent: {
    padding: spacing.md,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.xs,
  },
  cardName: {
    flex: 1,
    color: colors.text.primary,
    fontSize: fontSize.base,
    fontWeight: '700',
  },
  certBadge: {
    backgroundColor: colors.emerald,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.sm,
  },
  certBadgeText: {
    color: '#fff',
    fontSize: fontSize.xs,
    fontWeight: '700',
  },
  verifiedBadge: {
    backgroundColor: colors.active.emerald10,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.sm,
  },
  verifiedBadgeText: {
    color: colors.emerald,
    fontSize: fontSize.xs,
    fontWeight: '600',
  },
  cardAddress: {
    color: colors.text.secondary,
    fontSize: fontSize.sm,
    marginBottom: spacing.sm,
  },
  cardMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    flexWrap: 'wrap',
  },
  metaText: {
    color: colors.text.tertiary,
    fontSize: fontSize.xs,
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  ratingText: {
    color: colors.gold,
    fontSize: fontSize.xs,
    fontWeight: '600',
  },
  distanceText: {
    color: colors.text.tertiary,
    fontSize: fontSize.xs,
  },
});
