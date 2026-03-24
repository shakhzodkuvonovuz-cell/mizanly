import { useState, useCallback, useMemo, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  TextInput,
  Dimensions,
  Linking,
  Platform,
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
import { useContextualHaptic } from '@/hooks/useContextualHaptic';
import { BrandedRefreshControl } from '@/components/ui/BrandedRefreshControl';
import { showToast } from '@/components/ui/Toast';
import { islamicApi } from '@/services/islamicApi';
import type { Mosque as ApiMosque, PrayerTimes } from '@/types/islamic';
import * as Location from 'expo-location';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import { useTranslation } from '@/hooks/useTranslation';
import { useThemeColors } from '@/hooks/useThemeColors';
import { ScreenErrorBoundary } from '@/components/ui/ScreenErrorBoundary';

const { width } = Dimensions.get('window');

const PRAYER_ORDER = ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'] as const;

// Mecca (Kaaba) coordinates
const KAABA_LAT = 21.4225;
const KAABA_LNG = 39.8262;

function computeQiblaBearing(lat: number, lng: number): { degrees: number; direction: string } {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const toDeg = (r: number) => (r * 180) / Math.PI;
  const dLng = toRad(KAABA_LNG - lng);
  const lat1 = toRad(lat);
  const lat2 = toRad(KAABA_LAT);
  const x = Math.sin(dLng) * Math.cos(lat2);
  const y = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  let bearing = toDeg(Math.atan2(x, y));
  bearing = ((bearing % 360) + 360) % 360;
  const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  const idx = Math.round(bearing / 45) % 8;
  return { degrees: Math.round(bearing), direction: directions[idx] };
}

function computeNextPrayer(prayerTimes?: PrayerTimes | Record<string, string>): string {
  if (!prayerTimes) return 'Fajr';
  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  for (const prayer of PRAYER_ORDER) {
    const timeStr = prayerTimes[prayer];
    if (!timeStr) continue;
    const [h, m] = timeStr.split(':').map(Number);
    if (h * 60 + m > currentMinutes) {
      return prayer.charAt(0).toUpperCase() + prayer.slice(1);
    }
  }
  return 'Fajr'; // Tomorrow's Fajr
}

function computeNextPrayerTime(prayerTimes?: PrayerTimes | Record<string, string>): string {
  if (!prayerTimes) return '--:--';
  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  for (const prayer of PRAYER_ORDER) {
    const timeStr = prayerTimes[prayer];
    if (!timeStr) continue;
    const [h, m] = timeStr.split(':').map(Number);
    if (h * 60 + m > currentMinutes) {
      const hour12 = h % 12 || 12;
      const ampm = h < 12 ? 'AM' : 'PM';
      return `${hour12}:${m.toString().padStart(2, '0')} ${ampm}`;
    }
  }
  // Return tomorrow's Fajr time
  const fajrTime = prayerTimes.fajr;
  if (fajrTime) {
    const [h, m] = fajrTime.split(':').map(Number);
    const hour12 = h % 12 || 12;
    return `${hour12}:${m.toString().padStart(2, '0')} AM`;
  }
  return '--:--';
}

interface Mosque {
  id: string;
  name: string;
  address: string;
  distance: string;
  nextPrayer: string;
  nextPrayerTime: string;
  facilities: string[];
  lat: number;
  lng: number;
}


const FACILITY_ICONS: Record<string, IconName> = {
  parking: 'map-pin',
  wheelchair: 'check-circle',
  womens: 'users',
  wudu: 'globe',
  school: 'book-open',
  library: 'book-open',
  cafe: 'clock',
};

function FacilityBadge({ facility }: { facility: string }) {
  const { t } = useTranslation();
  const tc = useThemeColors();
  return (
    <View style={styles.facilityBadge}>
      <Icon name={FACILITY_ICONS[facility]} size="xs" color={tc.text.tertiary} />
      <Text style={[styles.facilityText, { color: tc.text.tertiary }]}>{t(`islamic.facilities.${facility}`) || facility}</Text>
    </View>
  );
}

function openDirections(lat: number, lng: number, name: string) {
  const encodedName = encodeURIComponent(name);
  const url = Platform.select({
    ios: `maps:0,0?q=${encodedName}&ll=${lat},${lng}`,
    android: `geo:${lat},${lng}?q=${lat},${lng}(${encodedName})`,
    default: `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`,
  });
  Linking.openURL(url);
}

function MosqueCard({ mosque, index }: { mosque: Mosque; index: number }) {
  const { t } = useTranslation();
  const tc = useThemeColors();
  const haptic = useContextualHaptic();
  const router = useRouter();

  return (
    <Animated.View entering={FadeInUp.delay(index * 80).duration(400)}>
      <Pressable
        accessibilityRole="button"
        onPress={() => router.push({ pathname: '/(screens)/mosque-detail' as never, params: { id: mosque.id } })}
      >
      <LinearGradient
        colors={colors.gradient.cardDark}
        style={styles.mosqueCard}
      >
        {/* Header Row */}
        <View style={styles.mosqueHeader}>
          <View style={styles.mosqueNameContainer}>
            <Text style={[styles.mosqueName, { color: tc.text.primary }]}>{mosque.name}</Text>
            <Text style={[styles.mosqueAddress, { color: tc.text.secondary }]}>{mosque.address}</Text>
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
        <Pressable
          accessibilityRole="button"
          onPress={() => { haptic.navigate(); openDirections(mosque.lat, mosque.lng, mosque.name); }}

          style={styles.directionsButton}
        >
          <LinearGradient
            colors={[colors.emerald, colors.emeraldDark]}
            style={styles.directionsGradient}
          >
            <Icon name="map-pin" size="xs" color={tc.text.primary} />
            <Text style={[styles.directionsText, { color: tc.text.primary }]}>{t('islamic.directions')}</Text>
          </LinearGradient>
        </Pressable>
      </LinearGradient>
      </Pressable>
    </Animated.View>
  );
}

export default function MosqueFinderScreen() {
  const router = useRouter();
  const haptic = useContextualHaptic();
  const { t } = useTranslation();
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [mosques, setMosques] = useState<Mosque[]>([]);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const tc = useThemeColors();

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
      const apiMosques = Array.isArray(response) ? response : [];
      const mappedMosques: Mosque[] = apiMosques.map((m: ApiMosque) => ({
        id: m.id,
        name: m.name,
        address: m.address,
        distance: m.distanceKm >= 1 ? `${m.distanceKm.toFixed(1)} km` : `${Math.round(m.distanceKm * 1000)} m`,
        nextPrayer: computeNextPrayer(m.prayerTimes),
        nextPrayerTime: computeNextPrayerTime(m.prayerTimes),
        facilities: m.facilities,
        lat: m.latitude,
        lng: m.longitude,
      }));
      setMosques(mappedMosques);
    } catch (err) {
      setError(t('islamic.errors.failedToLoadMosques'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [t]);

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
      <SafeAreaView style={[styles.container, { backgroundColor: tc.bg }]}>
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
      <SafeAreaView style={[styles.container, { backgroundColor: tc.bg }]}>
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
      <SafeAreaView style={[styles.container, { backgroundColor: tc.bg }]}>
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
      <SafeAreaView style={[styles.container, { backgroundColor: tc.bg }]}>
        <GlassHeader
          title={t('islamic.nearbyMosques')}
          leftAction={{ icon: 'arrow-left', onPress: () => router.back() }}
        />

        <FlatList
          data={filteredMosques}
          keyExtractor={item => item.id}
          refreshControl={<BrandedRefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          contentContainerStyle={styles.scrollContent}
          ListHeaderComponent={
            <>
              {/* Map */}
              {userLocation && (
                <Animated.View entering={FadeInUp.duration(500)} style={styles.mapContainer}>
                  <MapView
                    style={styles.map}
                    provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
                    initialRegion={{
                      latitude: userLocation.lat,
                      longitude: userLocation.lng,
                      latitudeDelta: 0.05,
                      longitudeDelta: 0.05,
                    }}
                    showsUserLocation
                    showsMyLocationButton={false}
                    mapType="standard"
                  >
                    {filteredMosques.map((m) => (
                      <Marker
                        key={m.id}
                        coordinate={{ latitude: m.lat, longitude: m.lng }}
                        title={m.name}
                        description={`${m.distance} · ${m.nextPrayer} ${m.nextPrayerTime}`}
                        pinColor={colors.emerald}
                      />
                    ))}
                  </MapView>
                </Animated.View>
              )}

              {/* Search Bar */}
              <Animated.View entering={FadeInUp.duration(400)}>
                <LinearGradient
                  colors={['rgba(45,53,72,0.6)', 'rgba(28,35,51,0.3)']}
                  style={styles.searchContainer}
                >
                  <Icon name="search" size="sm" color={tc.text.tertiary} />
                  <TextInput
                    style={[styles.searchInput, { color: tc.text.primary }]}
                    value={searchQuery}
                    onChangeText={setSearchQuery}
                    placeholder={t('islamic.searchMosquesPlaceholder')}
                    placeholderTextColor={tc.text.tertiary}
                  />
                  {searchQuery.length > 0 && (
                    <Pressable accessibilityRole="button" accessibilityLabel={t('common.clear')} onPress={() => setSearchQuery('')}>
                      <Icon name="x" size="sm" color={tc.text.secondary} />
                    </Pressable>
                  )}
                </LinearGradient>
              </Animated.View>

              {/* Results Count */}
              <View style={styles.resultsHeader}>
                <Text style={[styles.resultsText, { color: tc.text.tertiary }]}>
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
                  colors={colors.gradient.cardDark}
                  style={styles.qiblaCard}
                >
                  <LinearGradient
                    colors={['rgba(10,123,79,0.2)', 'rgba(200,150,62,0.1)']}
                    style={styles.qiblaIconBg}
                  >
                    <Icon name="globe" size="md" color={colors.emerald} />
                  </LinearGradient>

                  <View style={styles.qiblaContent}>
                    <Text style={[styles.qiblaTitle, { color: tc.text.primary }]}>{t('islamic.qiblaDirection')}</Text>
                    <Text style={styles.qiblaDirection}>
                      {userLocation
                        ? `${computeQiblaBearing(userLocation.lat, userLocation.lng).degrees}° ${computeQiblaBearing(userLocation.lat, userLocation.lng).direction}`
                        : '--°'}
                    </Text>
                    <Text style={[styles.qiblaHint, { color: tc.text.secondary }]}>{t('islamic.qiblaHint')}</Text>
                  </View>

                  {/* Arrow Indicator */}
                  <View style={styles.arrowContainer}>
                    <LinearGradient
                      colors={[colors.emerald, colors.goldLight]}
                      style={styles.arrowCircle}
                    >
                      <Icon name="arrow-left" size="md" color={tc.text.primary} style={styles.arrowIcon} />
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
  mapContainer: {
    height: 220,
    borderRadius: radius.lg,
    overflow: 'hidden',
    marginBottom: spacing.md,
  },
  map: {
    width: '100%',
    height: '100%',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.active.white6,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginBottom: spacing.md,
  },
  searchInput: {
    flex: 1,
    fontFamily: fonts.body,
    fontSize: fontSize.base,
    color: colors.text.primary,
    marginStart: spacing.sm,
    padding: 0,
  },
  mapPlaceholder: {
    height: 200,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.active.white6,
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
    borderColor: colors.active.white6,
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
    marginEnd: spacing.sm,
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
    borderColor: colors.active.white6,
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
    marginStart: spacing.md,
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
    marginStart: spacing.md,
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
