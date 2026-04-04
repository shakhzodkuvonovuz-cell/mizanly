import { useState, useCallback, useEffect } from 'react';
import { useTranslation } from '@/hooks/useTranslation';
import {
  View, Text, TextInput, StyleSheet,
  Pressable,
} from 'react-native';
import * as Location from 'expo-location';
import { Icon } from './Icon';
import { showToast } from './Toast';
import { BottomSheet, BottomSheetItem } from './BottomSheet';
import { Skeleton } from './Skeleton';
import { colors, spacing, fontSize, radius } from '@/theme';
import { useThemeColors } from '@/hooks/useThemeColors';

interface LocationResult {
  id: string;
  name: string;
  address?: string;
  latitude?: number;
  longitude?: number;
}

interface LocationPickerProps {
  visible: boolean;
  onClose: () => void;
  onSelect: (location: { name: string; latitude?: number; longitude?: number }) => void;
}

// Mock location data - in production this would use Google Places or similar API
const POPULAR_LOCATIONS: LocationResult[] = [
  { id: '1', name: 'Masjid al-Haram', address: 'Makkah, Saudi Arabia', latitude: 21.4225, longitude: 39.8262 },
  { id: '2', name: 'Masjid an-Nabawi', address: 'Madinah, Saudi Arabia', latitude: 24.4672, longitude: 39.6111 },
  { id: '3', name: 'Al-Aqsa Mosque', address: 'Jerusalem, Palestine', latitude: 31.7761, longitude: 35.2358 },
  { id: '4', name: 'Blue Mosque', address: 'Istanbul, Turkey', latitude: 41.0054, longitude: 28.9768 },
  { id: '5', name: "Hagia Sophia", address: 'Istanbul, Turkey', latitude: 41.0086, longitude: 28.9802 },
  { id: '6', name: 'Sheikh Zayed Grand Mosque', address: 'Abu Dhabi, UAE', latitude: 24.4127, longitude: 54.4749 },
  { id: '7', name: 'Hassan II Mosque', address: 'Casablanca, Morocco', latitude: 33.6086, longitude: -7.6328 },
  { id: '8', name: 'Faisal Mosque', address: 'Islamabad, Pakistan', latitude: 33.7294, longitude: 73.0372 },
  { id: '9', name: 'Istiqlal Mosque', address: 'Jakarta, Indonesia', latitude: -6.1702, longitude: 106.8314 },
  { id: '10', name: 'Sultan Mosque', address: 'Singapore', latitude: 1.3021, longitude: 103.8593 },
];

export function LocationPicker({ visible, onClose, onSelect }: LocationPickerProps) {
  const { t } = useTranslation();
  const tc = useThemeColors();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<LocationResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [recentLocations, setRecentLocations] = useState<LocationResult[]>([]);

  useEffect(() => {
    if (visible) {
      setResults(POPULAR_LOCATIONS);
      // Load recent locations from storage (mock for now)
      setRecentLocations([]);
    }
  }, [visible]);

  const searchLocations = useCallback(async (searchQuery: string) => {
    if (!searchQuery.trim()) {
      setResults(POPULAR_LOCATIONS);
      return;
    }

    setLoading(true);
    try {
      // First: filter popular locations locally
      const localMatches = POPULAR_LOCATIONS.filter(
        (loc) =>
          loc.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          loc.address?.toLowerCase().includes(searchQuery.toLowerCase()),
      );

      // Then: geocode the search query for real-world results
      const geocoded = await Location.geocodeAsync(searchQuery);
      const geocodedResults: LocationResult[] = [];
      for (const geo of geocoded.slice(0, 5)) {
        const reverseResults = await Location.reverseGeocodeAsync({
          latitude: geo.latitude,
          longitude: geo.longitude,
        });
        const place = reverseResults[0];
        if (place) {
          geocodedResults.push({
            id: `geo-${geo.latitude}-${geo.longitude}`,
            name: place.name || place.street || searchQuery,
            address: [place.city, place.region, place.country].filter(Boolean).join(', '),
            latitude: geo.latitude,
            longitude: geo.longitude,
          });
        }
      }

      setResults([...localMatches, ...geocodedResults]);
    } catch {
      // Fallback to local filter on geocode failure
      const filtered = POPULAR_LOCATIONS.filter(
        (loc) =>
          loc.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          loc.address?.toLowerCase().includes(searchQuery.toLowerCase()),
      );
      setResults(filtered);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => searchLocations(query), 300);
    return () => clearTimeout(timer);
  }, [query, searchLocations]);

  const handleSelect = (location: LocationResult) => {
    onSelect({
      name: location.name,
      latitude: location.latitude,
      longitude: location.longitude,
    });
    onClose();
  };

  const handleCurrentLocation = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        showToast({ message: t('common.locationPermissionRequired'), variant: 'warning' });
        return;
      }
      setLoading(true);
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      // Attempt reverse geocoding for a human-readable name
      let locationName = t('common.currentLocation');
      try {
        const [geo] = await Location.reverseGeocodeAsync({
          latitude: loc.coords.latitude,
          longitude: loc.coords.longitude,
        });
        if (geo) {
          locationName = [geo.name, geo.city, geo.country].filter(Boolean).join(', ');
        }
      } catch {
        // Reverse geocode failed — use generic name
      }
      onSelect({
        name: locationName,
        latitude: loc.coords.latitude,
        longitude: loc.coords.longitude,
      });
      onClose();
    } catch {
      showToast({ message: t('common.locationFetchFailed'), variant: 'error' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <BottomSheet visible={visible} onClose={onClose} snapPoint={0.7}>
      <View style={styles.container}>
        <Text style={[styles.title, { color: tc.text.primary }]}>{t('locationPicker.title')}</Text>

        <View style={styles.searchRow}>
          <View style={[styles.searchInput, { backgroundColor: tc.bgElevated, borderColor: tc.border }]}>
            <Icon name="search" size="sm" color={tc.text.tertiary} />
            <TextInput
              style={[styles.input, { color: tc.text.primary }]}
              placeholder={t('common.searchLocations')}
              placeholderTextColor={tc.text.tertiary}
              value={query}
              onChangeText={setQuery}
              autoFocus
            />
            {query.length > 0 && (
                <Pressable onPress={() => setQuery('')}>
                  <Icon name="x" size="sm" color={tc.text.tertiary} />
                </Pressable>
              )}
          </View>
        </View>

        <Pressable
          accessibilityRole="button"
          style={[styles.currentLocation, { borderBottomColor: tc.border }]}
          onPress={handleCurrentLocation}
        >
          <View style={[styles.currentLocationIcon, { backgroundColor: colors.active.emerald10 }]}>
            <Icon name="map-pin" size="md" color={colors.emerald} />
          </View>
          <Text style={[styles.currentLocationText, { color: colors.emerald }]}>{t('locationPicker.useCurrentLocation')}</Text>
        </Pressable>

        {recentLocations.length > 0 && !query && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: tc.text.secondary }]}>{t('locationPicker.recent')}</Text>
            {recentLocations.map((loc) => (
              <BottomSheetItem
                key={loc.id}
                label={loc.name}
                icon={<Icon name="map-pin" size="sm" color={tc.text.secondary} />}
                onPress={() => handleSelect(loc)}
              />
            ))}
          </View>
        )}

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: tc.text.secondary }]}>
            {query ? t('locationPicker.searchResults') : t('locationPicker.popularLocations')}
          </Text>

          {loading ? (
            <View style={styles.skeletonList}>
              {Array.from({ length: 4 }).map((_, i) => (
                <View key={i} style={styles.skeletonRow}>
                  <Skeleton.Circle size={40} />
                  <View style={{ flex: 1, gap: 4 }}>
                    <Skeleton.Rect width="60%" height={14} />
                    <Skeleton.Rect width="40%" height={11} />
                  </View>
                </View>
              ))}
            </View>
          ) : results.length === 0 ? (
            <View style={styles.empty}>
              <Text style={[styles.emptyText, { color: tc.text.tertiary }]}>{t('locationPicker.noLocationsFound')}</Text>
            </View>
          ) : (
            results.map((loc) => (
              <BottomSheetItem
                key={loc.id}
                label={loc.name}
                icon={<Icon name="map-pin" size="sm" color={tc.text.secondary} />}
                onPress={() => handleSelect(loc)}
              />
            ))
          )}
        </View>
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.lg,
  },
  title: {
    fontSize: fontSize.lg,
    fontWeight: '700',
    marginBottom: spacing.md,
    paddingHorizontal: spacing.xl,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
    paddingHorizontal: spacing.xl,
  },
  searchInput: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderWidth: 1,
  },
  input: {
    flex: 1,
    fontSize: fontSize.base,
    paddingVertical: spacing.xs,
  },
  currentLocation: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderBottomWidth: 0.5,
    marginBottom: spacing.sm,
  },
  currentLocationIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  currentLocationText: {
    fontSize: fontSize.base,
    fontWeight: '600',
  },
  section: {
    marginBottom: spacing.md,
  },
  sectionTitle: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    textTransform: 'uppercase',
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.xl,
  },
  skeletonList: {
    paddingHorizontal: spacing.xl,
    gap: spacing.md,
    paddingVertical: spacing.md,
  },
  skeletonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  empty: {
    paddingVertical: spacing.xl,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: fontSize.base,
  },
});
