import { useState, useCallback, useMemo, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
  TouchableOpacity,
  TextInput,
  Dimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { Icon, type IconName } from '@/components/ui/Icon';
import { GlassHeader } from '@/components/ui/GlassHeader';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { colors, spacing, radius, fontSize, fonts } from '@/theme';
import { useHaptic } from '@/hooks/useHaptic';

import { islamicApi } from '@/services/islamicApi';
import type { Mosque as ApiMosque, PrayerTimes } from '@/types/islamic';
import * as Location from 'expo-location';
import { useTranslation } from '@/hooks/useTranslation';
import { ScreenErrorBoundary } from '@/components/ui/ScreenErrorBoundary';

const { width } = Dimensions.get('window');

interface Mosque {
  id: string;
  name: string;
  address: string;
  distance: string;
  nextPrayer: string;
  nextPrayerTime: string;
  facilities: string[];
}


const FACILITY_ICONS: Record<string, IconName> = {
  parking: 'circle',
  wheelchair: 'check-circle',
  womens: 'users',
  wudu: 'droplet',
  school: 'book-open',
  library: 'book-open',
  cafe: 'coffee',
};

const FACILITY_LABELS: Record<string, string> = {
  parking: 'Parking',
  wheelchair: 'Accessible',
  womens: "Women's Area",
  wudu: 'Wudu Area',
  school: 'School',
  library: 'Library',
  cafe: 'Cafe',
};

function FacilityBadge({ facility }: { facility: string }) {
  const { t } = useTranslation();
  return (
    <View style={styles.facilityBadge}>
      <Icon name={FACILITY_ICONS[facility]} size="xs" color={colors.text.tertiary} />
      <Text style={styles.facilityText}>{t(`islamic.facilities.${facility}`) || facility}</Text>
    </View>
  );
}

function MosqueCard({ mosque, index }: { mosque: Mosque; index: number }) {
  const haptic = useHaptic();

  return (
    <Animated.View entering={FadeInUp.delay(index * 80).duration(400)}>
      <LinearGradient
        colors={['rgba(45,53,72,0.4)', 'rgba(28,35,51,0.2)']}
        style={styles.mosqueCard}
      >
        {/* Header Row */}
        <View style={styles.mosqueHeader}>
          <View style={styles.mosqueNameContainer}>
            <Text style={styles.mosqueName}>{mosque.name}</Text>
            <Text style={styles.mosqueAddress}>{mosque.address}</Text>
          </View>

          {/* Distance Badge */}
          <LinearGradient
            colors={['rgba(10,123,79,0.2)', 'rgba(10,123,79,0.1)']}
            style={styles.distanceBadge}
          >
            <Icon name="map-pin" size="xs" color={colors.emerald} />
            <Text style={styles.distanceText}>{mosque.distance}</Text>
          </LinearGradient>
        </View>

        {/* Next Prayer */}
        <View style={styles.nextPrayerRow}>
          <LinearGradient
            colors={['rgba(200,150,62,0.15)', 'rgba(200,150,62,0.05)']}
            style={styles.nextPrayerBadge}
          >
            <Icon name="clock" size="xs" color={colors.gold} />
            <Text style={styles.nextPrayerText}>
              {mosque.nextPrayer}: {mosque.nextPrayerTime}
            </Text>
          </LinearGradient>
        </View>

        {/* Facilities */}
        <View style={styles.facilitiesContainer}>
          <View style={styles.facilitiesRow}>
            {mosque.facilities.slice(0, 4).map(facility => (
              <FacilityBadge key={facility} facility={facility} />
            ))}
          </View>
        </View>

        {/* Directions Button */}
        <TouchableOpacity
          onPress={() => haptic.light()}
          activeOpacity={0.8}
          style={styles.directionsButton}
        >
          <LinearGradient
            colors={[colors.emerald, colors.emeraldDark]}
            style={styles.directionsGradient}
          >
            <Icon name="map-pin" size="xs" color={colors.text.primary} />
            <Text style={styles.directionsText}>{t('islamic.directions')}</Text>
          </LinearGradient>
        </TouchableOpacity>
      </LinearGradient>
    </Animated.View>
  );
}

export default function MosqueFinderScreen() {
  const router = useRouter();
  const haptic = useHaptic();
  const { t } = useTranslation();
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [mosques, setMosques] = useState<Mosque[]>([]);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setError(null);
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setError(t('islamic.errors.locationPermissionMosques'));
        setLoading(false);
        setRefreshing(false);
        return;
      }
      const location = await Location.getCurrentPositionAsync({});
      const lat = location.coords.latitude;
      const lng = location.coords.longitude;
      setUserLocation({ lat, lng });
      const response = await islamicApi.getMosques(lat, lng, 10); // radius 10km
      const apiMosques = response.data;
      const mappedMosques: Mosque[] = apiMosques.map((m: ApiMosque) => ({
        id: m.id,
        name: m.name,
        address: m.address,
        distance: m.distanceKm >= 1 ? `${m.distanceKm.toFixed(1)} km` : `${Math.round(m.distanceKm * 1000)} m`,
        nextPrayer: 'Fajr', // TODO: compute from m.prayerTimes
        nextPrayerTime: '5:23 AM', // TODO: compute
        facilities: m.facilities,
      }));
      setMosques(mappedMosques);
    } catch (err) {
      setError(t('islamic.errors.failedToLoadMosques'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchData();
  }, [fetchData]);

  const filteredMosques = useMemo(() => {
    if (!searchQuery.trim()) return mosques;
    const query = searchQuery.toLowerCase();
    return mosques.filter(
      mosque =>
        mosque.name.toLowerCase().includes(query) ||
        mosque.address.toLowerCase().includes(query)
    );
  }, [searchQuery, mosques]);

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <GlassHeader
          title={t('islamic.mosqueFinder')}
          leftAction={{ icon: 'arrow-left', onPress: () => router.back() }}
        />
        <View style={[styles.scrollContent, { flex: 1, paddingTop: 100 }]}>
          <Skeleton.Rect width={width - 32} height={200} borderRadius={radius.lg} />
          <Skeleton.Rect width={200} height={20} borderRadius={radius.sm} style={{ marginTop: spacing.lg }} />
          <Skeleton.Rect width={150} height={16} borderRadius={radius.sm} style={{ marginTop: spacing.md }} />
        </View>
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={styles.container}>
        <GlassHeader
          title={t('islamic.mosqueFinder')}
          leftAction={{ icon: 'arrow-left', onPress: () => router.back() }}
        />
        <View style={[styles.scrollContent, { flex: 1, paddingTop: 100 }]}>
          <EmptyState
            icon="map-pin"
            title={t('islamic.errors.failedToLoadMosques')}
            subtitle={error}
            actionLabel={t('common.retry')}
            onAction={fetchData}
          />
        </View>
      </SafeAreaView>
    );
  }

  if (mosques.length === 0) {
    return (
      <SafeAreaView style={styles.container}>
        <GlassHeader
          title={t('islamic.mosqueFinder')}
          leftAction={{ icon: 'arrow-left', onPress: () => router.back() }}
        />
        <View style={[styles.scrollContent, { flex: 1, paddingTop: 100 }]}>
          <EmptyState
            icon="map-pin"
            title={t('islamic.errors.noMosquesNearby')}
            subtitle={t('islamic.errors.tryDifferentLocation')}
            actionLabel={t('common.retry')}
            onAction={fetchData}
          />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <ScreenErrorBoundary>
      <SafeAreaView style={styles.container}>
        <GlassHeader
          title="Nearby Mosques"
          leftAction={{ icon: 'arrow-left', onPress: () => router.back() }}
        />

        <FlatList
          data={filteredMosques}
          keyExtractor={item => item.id}
          refreshControl={<RefreshControl tintColor={colors.emerald} refreshing={refreshing} onRefresh={onRefresh} />}
          contentContainerStyle={styles.scrollContent}
          ListHeaderComponent={
            <>
              {/* Search Bar */}
              <Animated.View entering={FadeInUp.duration(400)}>
                <LinearGradient
                  colors={['rgba(45,53,72,0.6)', 'rgba(28,35,51,0.3)']}
                  style={styles.searchContainer}
                >
                  <Icon name="search" size="sm" color={colors.text.tertiary} />
                  <TextInput
                    style={styles.searchInput}
                    value={searchQuery}
                    onChangeText={setSearchQuery}
                    placeholder={t('islamic.searchMosquesPlaceholder')}
                    placeholderTextColor={colors.text.tertiary}
                  />
                  {searchQuery.length > 0 && (
                    <TouchableOpacity onPress={() => setSearchQuery('')}>
                      <Icon name="x" size="sm" color={colors.text.secondary} />
                    </TouchableOpacity>
                  )}
                </LinearGradient>
              </Animated.View>

              {/* Map Placeholder */}
              <Animated.View entering={FadeInUp.delay(100).duration(400)}>
                <LinearGradient
                  colors={['rgba(10,123,79,0.1)', 'rgba(28,35,51,0.2)']}
                  style={styles.mapPlaceholder}
                >
                  <LinearGradient
                    colors={['rgba(10,123,79,0.2)', 'rgba(200,150,62,0.1)']}
                    style={styles.mapIconBg}
                  >
                    <Icon name="map-pin" size="xl" color={colors.emerald} />
                  </LinearGradient>
                  <Text style={styles.mapPlaceholderText}>{t('islamic.mapViewComingSoon')}</Text>
                </LinearGradient>
              </Animated.View>

              {/* Results Count */}
              <View style={styles.resultsHeader}>
                <Text style={styles.resultsText}>
  {t('islamic.mosquesNearby', { count: filteredMosques.length })}
                </Text>
              </View>
            </>
          }
          renderItem={({ item, index }) => (
            <MosqueCard mosque={item} index={index} />
          )}
          ListEmptyComponent={
            <EmptyState
              icon="map-pin"
              title={t('islamic.noMosquesFound')}
              subtitle={searchQuery ? t('islamic.tryDifferentSearchTerm') : t('islamic.noMosquesInArea')}
            />
          }
          ListFooterComponent={
            <>
              {/* Qibla Direction Card */}
              <Animated.View entering={FadeInUp.delay(filteredMosques.length * 80 + 200).duration(400)}>
                <LinearGradient
                  colors={['rgba(45,53,72,0.4)', 'rgba(28,35,51,0.2)']}
                  style={styles.qiblaCard}
                >
                  <LinearGradient
                    colors={['rgba(10,123,79,0.2)', 'rgba(200,150,62,0.1)']}
                    style={styles.qiblaIconBg}
                  >
                    <Icon name="globe" size="md" color={colors.emerald} />
                  </LinearGradient>

                  <View style={styles.qiblaContent}>
                    <Text style={styles.qiblaTitle}>{t('islamic.qiblaDirection')}</Text>
                    <Text style={styles.qiblaDirection}>118° Southeast</Text>
                    <Text style={styles.qiblaHint}>{t('islamic.qiblaHint')}</Text>
                  </View>

                  {/* Arrow Indicator */}
                  <View style={styles.arrowContainer}>
                    <LinearGradient
                      colors={[colors.emerald, colors.goldLight]}
                      style={styles.arrowCircle}
                    >
                      <Icon name="arrow-left" size="md" color={colors.text.primary} style={styles.arrowIcon} />
                    </LinearGradient>
                  </View>
                </LinearGradient>
              </Animated.View>

              {/* Bottom spacing */}
              <View style={{ height: spacing.xxl }} />
            </>
          }
        />
      </SafeAreaView>
  
    </ScreenErrorBoundary>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.dark.bg,
  },
  scrollContent: {
    padding: spacing.base,
    paddingTop: 100,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginBottom: spacing.md,
  },
  searchInput: {
    flex: 1,
    fontFamily: fonts.body,
    fontSize: fontSize.base,
    color: colors.text.primary,
    marginLeft: spacing.sm,
    padding: 0,
  },
  mapPlaceholder: {
    height: 200,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  mapIconBg: {
    width: 64,
    height: 64,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  mapPlaceholderText: {
    fontFamily: fonts.body,
    fontSize: fontSize.base,
    color: colors.text.secondary,
  },
  resultsHeader: {
    marginBottom: spacing.md,
  },
  resultsText: {
    fontFamily: fonts.body,
    fontSize: fontSize.sm,
    color: colors.text.tertiary,
  },
  mosqueCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  mosqueHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: spacing.sm,
  },
  mosqueNameContainer: {
    flex: 1,
    marginRight: spacing.sm,
  },
  mosqueName: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSize.md,
    color: colors.text.primary,
    marginBottom: spacing.xs,
  },
  mosqueAddress: {
    fontFamily: fonts.body,
    fontSize: fontSize.sm,
    color: colors.text.secondary,
    lineHeight: 20,
  },
  distanceBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    gap: spacing.xs,
  },
  distanceText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSize.xs,
    color: colors.emerald,
  },
  nextPrayerRow: {
    marginBottom: spacing.sm,
  },
  nextPrayerBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    gap: spacing.xs,
  },
  nextPrayerText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSize.sm,
    color: colors.gold,
  },
  facilitiesContainer: {
    marginBottom: spacing.md,
  },
  facilitiesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  facilityBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(45,53,72,0.6)',
    borderRadius: radius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    gap: spacing.xs,
  },
  facilityText: {
    fontFamily: fonts.body,
    fontSize: fontSize.xs,
    color: colors.text.tertiary,
  },
  directionsButton: {
    alignSelf: 'stretch',
  },
  directionsGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.full,
    paddingVertical: spacing.sm,
    gap: spacing.xs,
  },
  directionsText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSize.base,
    color: colors.text.primary,
  },
  qiblaCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    padding: spacing.lg,
    marginTop: spacing.lg,
  },
  qiblaIconBg: {
    width: 48,
    height: 48,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qiblaContent: {
    flex: 1,
    marginLeft: spacing.md,
  },
  qiblaTitle: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSize.base,
    color: colors.text.primary,
    marginBottom: spacing.xs,
  },
  qiblaDirection: {
    fontFamily: fonts.heading,
    fontSize: fontSize.lg,
    color: colors.emerald,
    marginBottom: spacing.xs,
  },
  qiblaHint: {
    fontFamily: fonts.body,
    fontSize: fontSize.sm,
    color: colors.text.secondary,
  },
  arrowContainer: {
    marginLeft: spacing.md,
  },
  arrowCircle: {
    width: 44,
    height: 44,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  arrowIcon: {
    transform: [{ rotate: '45deg' }],
  },
});
