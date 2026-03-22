import { useState, useCallback } from 'react';
import {
  View, Text, TextInput, StyleSheet, Pressable, Alert,
  KeyboardAvoidingView, Platform, ScrollView,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeInUp } from 'react-native-reanimated';
import * as Location from 'expo-location';
import { GlassHeader } from '@/components/ui/GlassHeader';
import { GradientButton } from '@/components/ui/GradientButton';
import { EmptyState } from '@/components/ui/EmptyState';
import { Icon } from '@/components/ui/Icon';
import { Skeleton } from '@/components/ui/Skeleton';
import { ScreenErrorBoundary } from '@/components/ui/ScreenErrorBoundary';
import { colors, fonts, fontSize, spacing, radius, shadow } from '@/theme';
import { useTranslation } from '@/hooks/useTranslation';
import { useHaptic } from '@/hooks/useHaptic';
import { useThemeColors } from '@/hooks/useThemeColors';

interface LocationData {
  latitude: number;
  longitude: number;
  address: string;
}

function LocationPickerContent() {
  const router = useRouter();
  const params = useLocalSearchParams<{ conversationId: string }>();
  const { t } = useTranslation();
  const haptic = useHaptic();

  const [location, setLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [address, setAddress] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [searching, setSearching] = useState(false);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [manualLat, setManualLat] = useState('');
  const [manualLng, setManualLng] = useState('');
  const tc = useThemeColors();

  const reverseGeocode = useCallback(async (lat: number, lng: number) => {
    try {
      const results = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lng });
      if (results.length > 0) {
        const r = results[0];
        const parts = [r.name, r.street, r.city, r.region, r.country].filter(Boolean);
        return parts.join(', ');
      }
    } catch {
      // Geocoding may fail silently
    }
    return '';
  }, []);

  const handleUseCurrentLocation = useCallback(async () => {
    setLoading(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setPermissionDenied(true);
        setLoading(false);
        return;
      }
      setPermissionDenied(false);
      const pos = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      const coords = {
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
      };
      setLocation(coords);
      const addr = await reverseGeocode(coords.latitude, coords.longitude);
      setAddress(addr);
      haptic.success();
    } catch {
      Alert.alert(
        t('location.errorTitle', 'Location Error'),
        t('location.errorMessage', 'Could not get your current location. Please try again or enter coordinates manually.'),
      );
    } finally {
      setLoading(false);
    }
  }, [t, haptic, reverseGeocode]);

  const handleSearchAddress = useCallback(async () => {
    if (!searchQuery.trim()) return;
    setSearching(true);
    try {
      const results = await Location.geocodeAsync(searchQuery.trim());
      if (results.length > 0) {
        const first = results[0];
        const coords = { latitude: first.latitude, longitude: first.longitude };
        setLocation(coords);
        const addr = await reverseGeocode(coords.latitude, coords.longitude);
        setAddress(addr || searchQuery.trim());
        haptic.success();
      } else {
        Alert.alert(
          t('location.notFound', 'Not Found'),
          t('location.notFoundMessage', 'No results found for this address. Try a different search.'),
        );
      }
    } catch {
      Alert.alert(
        t('location.searchError', 'Search Error'),
        t('location.searchErrorMessage', 'Could not search for this address. Please check your connection.'),
      );
    } finally {
      setSearching(false);
    }
  }, [searchQuery, t, haptic, reverseGeocode]);

  const handleManualCoordinates = useCallback(async () => {
    const lat = parseFloat(manualLat);
    const lng = parseFloat(manualLng);
    if (isNaN(lat) || isNaN(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      Alert.alert(
        t('location.invalidCoords', 'Invalid Coordinates'),
        t('location.invalidCoordsMessage', 'Please enter valid latitude (-90 to 90) and longitude (-180 to 180).'),
      );
      return;
    }
    haptic.light();
    const coords = { latitude: lat, longitude: lng };
    setLocation(coords);
    const addr = await reverseGeocode(lat, lng);
    setAddress(addr);
  }, [manualLat, manualLng, t, haptic, reverseGeocode]);

  const handleShareLocation = useCallback(() => {
    if (!location) return;
    haptic.success();
    const locationData: LocationData = {
      latitude: location.latitude,
      longitude: location.longitude,
      address,
    };
    // Navigate back to conversation with location data as params
    if (params.conversationId) {
      router.navigate({
        pathname: '/(screens)/conversation/[id]',
        params: {
          id: params.conversationId,
          sharedLocation: JSON.stringify(locationData),
        },
      });
    } else {
      router.back();
    }
  }, [location, address, haptic, router, params.conversationId]);

  return (
    <View style={[styles.container, { backgroundColor: tc.bg }]}>
      <GlassHeader
        title={t('location.shareLocation', 'Share Location')}
        leftAction={{
          icon: 'arrow-left',
          onPress: () => router.back(),
          accessibilityLabel: t('common.back', 'Go back'),
        }}
      />

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={100}
      >
        <ScrollView
          style={styles.flex}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Search Bar */}
          <Animated.View entering={FadeInUp.delay(100).duration(300)} style={styles.searchContainer}>
            <View style={[styles.searchBar, { backgroundColor: tc.bgCard, borderColor: tc.border }]}>
              <Icon name="search" size="sm" color={colors.text.tertiary} />
              <TextInput
                style={styles.searchInput}
                placeholder={t('location.searchPlaceholder', 'Search for an address...')}
                placeholderTextColor={colors.text.tertiary}
                value={searchQuery}
                onChangeText={setSearchQuery}
                onSubmitEditing={handleSearchAddress}
                returnKeyType="search"
                autoCorrect={false}
              />
              {searching ? (
                <Skeleton.Circle size={20} />
              ) : searchQuery.length > 0 ? (
                <Pressable onPress={() => setSearchQuery('')} hitSlop={8}>
                  <Icon name="x" size="xs" color={colors.text.tertiary} />
                </Pressable>
              ) : null}
            </View>
          </Animated.View>

          {/* Permission Denied State */}
          {permissionDenied ? (
            <Animated.View entering={FadeInUp.delay(150).duration(300)} style={styles.section}>
              <EmptyState
                icon="lock"
                title={t('location.permissionDenied', 'Location Permission Denied')}
                subtitle={t('location.permissionMessage', 'Enable location access in your device settings, or enter coordinates manually below.')}
              />
            </Animated.View>
          ) : null}

          {/* Location Display Card */}
          <Animated.View entering={FadeInUp.delay(200).duration(300)} style={styles.section}>
            <View style={[styles.locationCard, { backgroundColor: tc.bgCard, borderColor: tc.border }]}>
              {loading ? (
                <View style={styles.loadingContainer}>
                  <Skeleton.Rect width={80} height={80} borderRadius={radius.md} />
                  <View style={styles.loadingTexts}>
                    <Skeleton.Text width="80%" />
                    <Skeleton.Text width="60%" />
                  </View>
                </View>
              ) : location ? (
                <>
                  <View style={[styles.mapPlaceholder, { backgroundColor: tc.surface }]}>
                    <Icon name="map-pin" size="xl" color={colors.emerald} />
                    <Text style={styles.mapLabel}>
                      {t('location.mapPreview', 'Map Preview')}
                    </Text>
                  </View>
                  <View style={styles.coordsRow}>
                    <Text style={styles.coordLabel}>{t('location.lat', 'Lat')}</Text>
                    <Text style={styles.coordValue}>{location.latitude.toFixed(6)}</Text>
                    <Text style={[styles.coordLabel, styles.coordLabelRight]}>
                      {t('location.lng', 'Lng')}
                    </Text>
                    <Text style={styles.coordValue}>{location.longitude.toFixed(6)}</Text>
                  </View>
                  {address ? (
                    <Text style={styles.addressText} numberOfLines={2}>
                      {address}
                    </Text>
                  ) : null}
                </>
              ) : (
                <View style={styles.emptyMap}>
                  <Icon name="map-pin" size="xl" color={colors.text.tertiary} />
                  <Text style={styles.emptyMapText}>
                    {t('location.noLocation', 'No location selected')}
                  </Text>
                </View>
              )}
            </View>
          </Animated.View>

          {/* Use Current Location Button */}
          <Animated.View entering={FadeInUp.delay(300).duration(300)} style={styles.section}>
            <GradientButton
              label={t('location.useCurrent', 'Use Current Location')}
              onPress={handleUseCurrentLocation}
              icon="map-pin"
              loading={loading}
              variant="secondary"
              fullWidth
              size="lg"
            />
          </Animated.View>

          {/* Manual Coordinate Input */}
          <Animated.View entering={FadeInUp.delay(400).duration(300)} style={styles.section}>
            <Text style={styles.sectionTitle}>
              {t('location.manualEntry', 'Manual Coordinates')}
            </Text>
            <View style={styles.coordInputRow}>
              <View style={styles.coordInputWrapper}>
                <Text style={styles.inputLabel}>{t('location.latitude', 'Latitude')}</Text>
                <TextInput
                  style={[styles.coordInput, { backgroundColor: tc.bgCard, borderColor: tc.border }]}
                  placeholder="e.g. 21.4225"
                  placeholderTextColor={colors.text.tertiary}
                  value={manualLat}
                  onChangeText={setManualLat}
                  keyboardType="numeric"
                  returnKeyType="next"
                />
              </View>
              <View style={styles.coordInputWrapper}>
                <Text style={styles.inputLabel}>{t('location.longitude', 'Longitude')}</Text>
                <TextInput
                  style={[styles.coordInput, { backgroundColor: tc.bgCard, borderColor: tc.border }]}
                  placeholder="e.g. 39.8262"
                  placeholderTextColor={colors.text.tertiary}
                  value={manualLng}
                  onChangeText={setManualLng}
                  keyboardType="numeric"
                  returnKeyType="done"
                  onSubmitEditing={handleManualCoordinates}
                />
              </View>
            </View>
            <Pressable
              style={styles.applyButton}
              onPress={handleManualCoordinates}
              accessibilityRole="button"
              accessibilityLabel={t('location.applyCoords', 'Apply coordinates')}
            >
              <Icon name="check" size="sm" color={colors.emerald} />
              <Text style={styles.applyButtonText}>
                {t('location.applyCoords', 'Apply Coordinates')}
              </Text>
            </Pressable>
          </Animated.View>
        </ScrollView>

        {/* Share Button */}
        <View style={[styles.bottomBar, { backgroundColor: tc.bgElevated, borderTopColor: tc.border }]}>
          <GradientButton
            label={t('location.share', 'Share Location')}
            onPress={handleShareLocation}
            icon="send"
            disabled={!location}
            fullWidth
            size="lg"
          />
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

export default function LocationPickerScreen() {
  return (
    <ScreenErrorBoundary>
      <LocationPickerContent />
    </ScreenErrorBoundary>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.dark.bg,
  },
  flex: {
    flex: 1,
  },
  scrollContent: {
    paddingTop: 100,
    paddingBottom: spacing['2xl'],
  },
  searchContainer: {
    paddingHorizontal: spacing.base,
    marginBottom: spacing.base,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.dark.bgCard,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.dark.border,
    paddingHorizontal: spacing.md,
    height: 44,
    gap: spacing.sm,
  },
  searchInput: {
    flex: 1,
    fontFamily: fonts.body,
    fontSize: fontSize.base,
    color: colors.text.primary,
    paddingVertical: 0,
  },
  section: {
    paddingHorizontal: spacing.base,
    marginBottom: spacing.lg,
  },
  sectionTitle: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSize.sm,
    color: colors.text.secondary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: spacing.md,
  },
  locationCard: {
    backgroundColor: colors.dark.bgCard,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.dark.border,
    padding: spacing.base,
    overflow: 'hidden',
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  loadingTexts: {
    flex: 1,
    gap: spacing.sm,
  },
  mapPlaceholder: {
    height: 120,
    backgroundColor: colors.dark.surface,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
    gap: spacing.sm,
  },
  mapLabel: {
    fontFamily: fonts.body,
    fontSize: fontSize.xs,
    color: colors.text.tertiary,
  },
  coordsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  coordLabel: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSize.xs,
    color: colors.text.tertiary,
    marginRight: spacing.xs,
  },
  coordLabelRight: {
    marginLeft: spacing.base,
  },
  coordValue: {
    fontFamily: fonts.mono,
    fontSize: fontSize.sm,
    color: colors.text.primary,
  },
  addressText: {
    fontFamily: fonts.body,
    fontSize: fontSize.sm,
    color: colors.text.secondary,
    lineHeight: 20,
  },
  emptyMap: {
    height: 120,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  emptyMapText: {
    fontFamily: fonts.body,
    fontSize: fontSize.sm,
    color: colors.text.tertiary,
  },
  coordInputRow: {
    flexDirection: 'row',
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  coordInputWrapper: {
    flex: 1,
  },
  inputLabel: {
    fontFamily: fonts.bodyMedium,
    fontSize: fontSize.xs,
    color: colors.text.secondary,
    marginBottom: spacing.xs,
  },
  coordInput: {
    backgroundColor: colors.dark.bgCard,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.dark.border,
    paddingHorizontal: spacing.md,
    height: 44,
    fontFamily: fonts.mono,
    fontSize: fontSize.base,
    color: colors.text.primary,
  },
  applyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
  },
  applyButtonText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSize.sm,
    color: colors.emerald,
  },
  bottomBar: {
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.dark.border,
    backgroundColor: colors.dark.bgElevated,
  },
});
