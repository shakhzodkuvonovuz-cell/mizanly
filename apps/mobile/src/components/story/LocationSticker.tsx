import { useState, useCallback, useRef, useEffect, useMemo, memo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Pressable,
  FlatList,
  StyleProp,
  ViewStyle,
} from 'react-native';
import Animated, {
  FadeIn,
  FadeInDown,
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import * as Location from 'expo-location';
import { Icon } from '@/components/ui/Icon';
import { colors, spacing, fontSize, fontSizeExt, radius, fonts, animation } from '@/theme';
import { useThemeColors } from '@/hooks/useThemeColors';
import { useTranslation } from '@/hooks/useTranslation';
import { useContextualHaptic } from '@/hooks/useContextualHaptic';

// ── Types ──
export interface LocationData {
  id: string;
  name: string;
  address: string;
  city?: string;
  country?: string;
  lat?: number;
  lng?: number;
  category?: string;
}

export interface LocationStickerData {
  locationId: string;
  locationName: string;
  locationAddress?: string;
  locationCity?: string;
}

// ── Nearby/popular locations (mock data for now, production uses expo-location + Places API) ──
const MOCK_LOCATIONS: LocationData[] = [
  { id: 'loc-1', name: 'Surry Hills', address: 'Sydney NSW', city: 'Sydney', country: 'Australia', category: 'Neighborhood' },
  { id: 'loc-2', name: 'Al-Azhar Mosque', address: 'Cairo, Egypt', city: 'Cairo', country: 'Egypt', category: 'Mosque' },
  { id: 'loc-3', name: 'Masjid Al-Haram', address: 'Mecca, Saudi Arabia', city: 'Mecca', country: 'Saudi Arabia', category: 'Mosque' },
  { id: 'loc-4', name: 'Al-Masjid an-Nabawi', address: 'Medina, Saudi Arabia', city: 'Medina', country: 'Saudi Arabia', category: 'Mosque' },
  { id: 'loc-5', name: 'Lakemba Mosque', address: 'Wangee Rd, Lakemba NSW', city: 'Sydney', country: 'Australia', category: 'Mosque' },
  { id: 'loc-6', name: 'Blue Mosque', address: 'Sultanahmet, Istanbul', city: 'Istanbul', country: 'Turkey', category: 'Mosque' },
  { id: 'loc-7', name: 'Sydney Opera House', address: 'Bennelong Point, Sydney', city: 'Sydney', country: 'Australia', category: 'Landmark' },
  { id: 'loc-8', name: 'Bondi Beach', address: 'Bondi Beach NSW', city: 'Sydney', country: 'Australia', category: 'Beach' },
  { id: 'loc-9', name: 'Central Park', address: 'New York, NY', city: 'New York', country: 'USA', category: 'Park' },
  { id: 'loc-10', name: 'Islamic Museum of Australia', address: 'Thornbury, Melbourne', city: 'Melbourne', country: 'Australia', category: 'Museum' },
];

// ── Location Search Panel ──
interface LocationSearchProps {
  onSelect: (location: LocationData) => void;
  onClose: () => void;
  style?: StyleProp<ViewStyle>;
}

export const LocationSearch = memo(function LocationSearch({ onSelect, onClose, style }: LocationSearchProps) {
  const tc = useThemeColors();
  const { t } = useTranslation();
  const haptic = useContextualHaptic();
  const [query, setQuery] = useState('');
  const [results] = useState<LocationData[]>(MOCK_LOCATIONS);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const filteredResults = useMemo(() => {
    if (!query.trim()) return results;
    const q = query.toLowerCase();
    return results.filter(
      loc =>
        loc.name.toLowerCase().includes(q) ||
        loc.address.toLowerCase().includes(q) ||
        (loc.city && loc.city.toLowerCase().includes(q)) ||
        (loc.category && loc.category.toLowerCase().includes(q))
    );
  }, [query, results]);

  const handleSelect = useCallback((location: LocationData) => {
    haptic.tick();
    onSelect(location);
  }, [haptic, onSelect]);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const categoryIcon = (category?: string): 'map-pin' | 'star' | 'globe' => {
    switch (category) {
      case 'Mosque': return 'star';
      case 'Landmark':
      case 'Museum': return 'globe';
      default: return 'map-pin';
    }
  };

  return (
    <View style={[styles.searchContainer, style]}>
      {/* Use current location — real expo-location */}
      <Pressable
        onPress={async () => {
          haptic.navigate();
          try {
            const { status } = await Location.requestForegroundPermissionsAsync();
            if (status !== 'granted') {
              onSelect({ id: 'current', name: t('stories.useCurrentLocation'), address: '', category: 'Current' });
              return;
            }
            const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
            // Reverse geocode to get address
            const [geo] = await Location.reverseGeocodeAsync({ latitude: loc.coords.latitude, longitude: loc.coords.longitude });
            const name = geo?.name || geo?.street || t('stories.useCurrentLocation');
            const address = [geo?.city, geo?.region, geo?.country].filter(Boolean).join(', ');
            onSelect({
              id: 'current',
              name,
              address: address || t('stories.useCurrentLocation'),
              city: geo?.city || undefined,
              country: geo?.country || undefined,
              lat: loc.coords.latitude,
              lng: loc.coords.longitude,
              category: 'Current',
            });
          } catch {
            onSelect({ id: 'current', name: t('stories.useCurrentLocation'), address: '', category: 'Current' });
          }
        }}
        style={({ pressed }) => [
          styles.currentLocationBtn,
          { backgroundColor: pressed ? colors.active.emerald20 : colors.active.emerald10, transform: [{ scale: pressed ? 0.97 : 1 }] },
        ]}
        accessibilityRole="button"
        accessibilityLabel={t('stories.useCurrentLocation')}
      >
        <View style={styles.currentLocationIcon}>
          <Icon name="map-pin" size="md" color={colors.emerald} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ color: colors.emerald, fontSize: fontSize.base, fontFamily: fonts.bodyBold, fontWeight: '700' }}>
            {t('stories.useCurrentLocation')}
          </Text>
          <Text style={{ color: tc.text.tertiary, fontSize: fontSize.xs, fontFamily: fonts.body, marginTop: 1 }}>
            {t('stories.shareWhereYouAre')}
          </Text>
        </View>
        <Icon name="chevron-right" size="sm" color={colors.emerald} />
      </Pressable>

      {/* Search input */}
      <View style={[styles.searchBar, { backgroundColor: tc.bgElevated, borderColor: tc.borderLight }]}>
        <Icon name="search" size="sm" color={tc.text.tertiary} />
        <TextInput
          style={[styles.searchInput, { color: tc.text.primary }]}
          placeholder={t('stories.searchLocation')}
          placeholderTextColor={tc.text.tertiary}
          value={query}
          onChangeText={setQuery}
          autoCapitalize="words"
          returnKeyType="search"
          accessibilityLabel={t('stories.searchLocation')}
        />
        {query.length > 0 && (
          <Pressable onPress={() => setQuery('')} hitSlop={8}>
            <Icon name="x" size="sm" color={tc.text.tertiary} />
          </Pressable>
        )}
      </View>

      {/* Nearby header */}
      {!query.trim() && (
        <View style={styles.sectionHeader}>
          <Icon name="map-pin" size="sm" color={colors.emerald} />
          <Text style={[styles.sectionTitle, { color: tc.text.secondary }]}>
            {t('stories.nearbyLocations')}
          </Text>
        </View>
      )}

      {/* Results list */}
      <FlatList
        data={filteredResults}
        keyExtractor={item => item.id}
        showsVerticalScrollIndicator={false}
        renderItem={useCallback(({ item, index }) => (
          <Animated.View entering={FadeInDown.delay(index * 40).duration(200)}>
            <Pressable
              onPress={() => handleSelect(item)}
              style={({ pressed }) => [styles.locationItem, { backgroundColor: pressed ? colors.active.emerald10 : tc.bgElevated, transform: [{ scale: pressed ? 0.97 : 1 }] }]}
              accessibilityLabel={`${item.name}, ${item.address}`}
              accessibilityRole="button"
            >
              <View style={[styles.locationIcon, { backgroundColor: colors.active.emerald10 }]}>
                <Icon name={categoryIcon(item.category)} size="sm" color={colors.emerald} />
              </View>
              <View style={styles.locationInfo}>
                <Text style={[styles.locationName, { color: tc.text.primary }]} numberOfLines={1}>
                  {item.name}
                </Text>
                <Text style={[styles.locationAddress, { color: tc.text.secondary }]} numberOfLines={1}>
                  {item.address}
                </Text>
              </View>
              {item.category && (
                <View style={styles.categoryBadge}>
                  <Text style={styles.categoryText}>{item.category}</Text>
                </View>
              )}
            </Pressable>
          </Animated.View>
        ), [])}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Icon name="map-pin" size="lg" color={tc.text.tertiary} />
            <Text style={[styles.emptyText, { color: tc.text.tertiary }]}>
              {t('stories.noLocationsFound')}
            </Text>
          </View>
        }
        contentContainerStyle={styles.resultsList}
      />
    </View>
  );
});

// ── Location sticker display (on story canvas) ──
interface LocationStickerDisplayProps {
  data: LocationStickerData;
  onPress?: () => void;
  variant?: 'pill' | 'card';
  style?: StyleProp<ViewStyle>;
}

export function LocationStickerDisplay({
  data,
  onPress,
  variant = 'pill',
  style,
}: LocationStickerDisplayProps) {
  const scale = useSharedValue(1);

  const handlePressIn = () => {
    scale.value = withSpring(0.95, animation.spring.snappy);
  };
  const handlePressOut = () => {
    scale.value = withSpring(1, animation.spring.snappy);
  };

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  if (variant === 'card') {
    return (
      <Animated.View entering={FadeIn.duration(300)} style={[animatedStyle, style]}>
        <Pressable
          onPress={onPress}
          onPressIn={handlePressIn}
          onPressOut={handlePressOut}
          style={styles.cardContainer}
          accessibilityLabel={`Location: ${data.locationName}`}
          accessibilityRole="button"
        >
          <View style={styles.cardIcon}>
            <Icon name="map-pin" size="md" color={colors.emerald} />
          </View>
          <Text style={styles.cardName} numberOfLines={1}>
            {data.locationName}
          </Text>
          {data.locationCity && (
            <Text style={styles.cardCity} numberOfLines={1}>
              {data.locationCity}
            </Text>
          )}
        </Pressable>
      </Animated.View>
    );
  }

  // ── Pill variant (default) — glassmorphic with gradient ──
  return (
    <Animated.View entering={FadeIn.duration(300)} style={[animatedStyle, style]}>
      <Pressable
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        style={styles.pillContainer}
        accessibilityLabel={`Location: ${data.locationName}`}
        accessibilityRole="button"
      >
        <LinearGradient
          colors={['rgba(10,123,79,0.9)', 'rgba(6,107,66,0.85)']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={StyleSheet.absoluteFill}
        />
        <Icon name="map-pin" size={14} color={colors.text.onColor} />
        <Text style={styles.pillText} numberOfLines={1}>
          {data.locationName}
        </Text>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  // ── Search panel ──
  searchContainer: {
    flex: 1,
    maxHeight: 500,
  },
  currentLocationBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.lg,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.emerald,
  },
  currentLocationIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.full,
    backgroundColor: colors.active.emerald20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.md,
    borderWidth: 1,
    height: 44,
    gap: spacing.sm,
  },
  searchInput: {
    flex: 1,
    fontSize: fontSize.base,
    fontFamily: fonts.body,
    paddingVertical: 0,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  sectionTitle: {
    fontSize: fontSize.sm,
    fontFamily: fonts.bodyMedium,
    fontWeight: '500',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  resultsList: {
    gap: spacing.sm,
    paddingBottom: spacing.base,
  },
  locationItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    borderRadius: radius.md,
    gap: spacing.md,
  },
  locationIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  locationInfo: {
    flex: 1,
  },
  locationName: {
    fontSize: fontSize.base,
    fontFamily: fonts.bodyMedium,
    fontWeight: '500',
  },
  locationAddress: {
    fontSize: fontSize.sm,
    fontFamily: fonts.body,
    marginTop: 2,
  },
  categoryBadge: {
    backgroundColor: colors.active.emerald10,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.full,
  },
  categoryText: {
    color: colors.emerald,
    fontSize: fontSizeExt.tiny,
    fontFamily: fonts.bodyMedium,
    fontWeight: '500',
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xl,
    gap: spacing.sm,
  },
  emptyText: {
    fontSize: fontSize.sm,
    fontFamily: fonts.body,
  },

  // ── Pill display ──
  pillContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    overflow: 'hidden',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
    gap: spacing.xs,
    maxWidth: 240,
    // Shadow for depth
    shadowColor: colors.emerald,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 4,
  },
  pillText: {
    color: '#fff',
    fontSize: fontSize.sm,
    fontFamily: fonts.bodyBold,
    fontWeight: '700',
  },

  // ── Card display ──
  cardContainer: {
    backgroundColor: colors.glass.darkHeavy,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.glass.border,
    alignItems: 'center',
    width: 200,
    maxWidth: '100%',
  },
  cardIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.full,
    backgroundColor: colors.active.emerald10,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  cardName: {
    color: colors.text.primary,
    fontSize: fontSize.base,
    fontFamily: fonts.bodyBold,
    fontWeight: '700',
    textAlign: 'center',
  },
  cardCity: {
    color: colors.text.secondary,
    fontSize: fontSize.sm,
    fontFamily: fonts.body,
    marginTop: 2,
  },
});
