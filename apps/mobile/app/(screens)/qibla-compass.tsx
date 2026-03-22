import { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, Dimensions, Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, {
  useSharedValue, useAnimatedStyle, withSpring, FadeInUp,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { Magnetometer, type MagnetometerMeasurement } from 'expo-sensors';
import * as Location from 'expo-location';
import { Icon } from '@/components/ui/Icon';
import { EmptyState } from '@/components/ui/EmptyState';
import { GlassHeader } from '@/components/ui/GlassHeader';
import { Skeleton } from '@/components/ui/Skeleton';
import { ScreenErrorBoundary } from '@/components/ui/ScreenErrorBoundary';
import { colors, spacing, radius, fontSize } from '@/theme';
import { useTranslation } from '@/hooks/useTranslation';
import { useHaptic } from '@/hooks/useHaptic';
import { useThemeColors } from '@/hooks/useThemeColors';

const { width: screenWidth } = Dimensions.get('window');
const COMPASS_SIZE = screenWidth * 0.75;
const KAABA_LAT = 21.4225;
const KAABA_LNG = 39.8262;

function toRadians(deg: number): number {
  return (deg * Math.PI) / 180;
}

function toDegrees(rad: number): number {
  return (rad * 180) / Math.PI;
}

function calculateQiblaBearing(lat: number, lng: number): number {
  const lat1 = toRadians(lat);
  const lat2 = toRadians(KAABA_LAT);
  const deltaLng = toRadians(KAABA_LNG - lng);

  const x = Math.sin(deltaLng) * Math.cos(lat2);
  const y =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(deltaLng);

  let bearing = toDegrees(Math.atan2(x, y));
  return (bearing + 360) % 360;
}

function calculateDistanceToKaaba(lat: number, lng: number): number {
  const R = 6371; // Earth radius in km
  const dLat = toRadians(KAABA_LAT - lat);
  const dLng = toRadians(KAABA_LNG - lng);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat)) *
      Math.cos(toRadians(KAABA_LAT)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c);
}

function getHeadingFromMagnetometer(data: MagnetometerMeasurement): number {
  const { x, y } = data;
  let heading = Math.atan2(y, x) * (180 / Math.PI);
  // Adjust for platform differences
  if (Platform.OS === 'ios') {
    heading = heading - 90;
  }
  return (heading + 360) % 360;
}

function getCardinalDirection(
  degrees: number,
  t: (key: string) => string
): string {
  const directions = [
    t('qibla.north'),
    t('qibla.northeast'),
    t('qibla.east'),
    t('qibla.southeast'),
    t('qibla.south'),
    t('qibla.southwest'),
    t('qibla.west'),
    t('qibla.northwest'),
  ];
  const index = Math.round(degrees / 45) % 8;
  return directions[index];
}

export default function QiblaCompassScreen() {
  const tc = useThemeColors();
  const styles = createStyles(tc);
  const router = useRouter();
  const { t } = useTranslation();
  const haptic = useHaptic();

  const [loading, setLoading] = useState(true);
  const [permissionGranted, setPermissionGranted] = useState(false);
  const [userLocation, setUserLocation] = useState<{
    lat: number;
    lng: number;
  } | null>(null);
  const [heading, setHeading] = useState(0);
  const [qiblaAngle, setQiblaAngle] = useState(0);
  const [isAligned, setIsAligned] = useState(false);

  const lastHapticRef = useRef(0);
  const subscriptionRef = useRef<ReturnType<typeof Magnetometer.addListener> | null>(null);

  const compassRotation = useSharedValue(0);
  const arrowRotation = useSharedValue(0);
  const alignedOpacity = useSharedValue(0);

  // Request location permission and get coordinates
  useEffect(() => {
    let mounted = true;

    async function getLocation() {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          if (mounted) {
            setPermissionGranted(false);
            setLoading(false);
          }
          return;
        }

        if (mounted) setPermissionGranted(true);

        const location = await Location.getCurrentPositionAsync({});
        if (mounted) {
          const lat = location.coords.latitude;
          const lng = location.coords.longitude;
          setUserLocation({ lat, lng });
          const bearing = calculateQiblaBearing(lat, lng);
          setQiblaAngle(bearing);
          setLoading(false);
        }
      } catch {
        if (mounted) setLoading(false);
      }
    }

    getLocation();
    return () => {
      mounted = false;
    };
  }, []);

  // Subscribe to magnetometer
  useEffect(() => {
    Magnetometer.setUpdateInterval(100);

    const subscription = Magnetometer.addListener(
      (data: MagnetometerMeasurement) => {
        const currentHeading = getHeadingFromMagnetometer(data);
        setHeading(currentHeading);

        // Compass rotates opposite to heading
        compassRotation.value = withSpring(-currentHeading, {
          damping: 20,
          stiffness: 90,
          mass: 1,
        });

        // Arrow: difference between qibla and heading
        const diff = qiblaAngle - currentHeading;
        arrowRotation.value = withSpring(diff, {
          damping: 20,
          stiffness: 90,
          mass: 1,
        });

        // Check alignment (within +/- 5 degrees)
        const normalizedDiff = ((diff % 360) + 360) % 360;
        const aligned = normalizedDiff < 5 || normalizedDiff > 355;
        setIsAligned(aligned);

        alignedOpacity.value = withSpring(aligned ? 1 : 0, {
          damping: 15,
          stiffness: 100,
        });

        // Haptic feedback when aligned
        if (aligned) {
          const now = Date.now();
          if (now - lastHapticRef.current > 1000) {
            haptic.medium();
            lastHapticRef.current = now;
          }
        }
      }
    );

    subscriptionRef.current = subscription;

    return () => {
      subscription.remove();
      subscriptionRef.current = null;
    };
  }, [qiblaAngle, compassRotation, arrowRotation, alignedOpacity, haptic]);

  const compassAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${compassRotation.value}deg` }],
  }));

  const arrowAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${arrowRotation.value}deg` }],
  }));

  const alignedTextStyle = useAnimatedStyle(() => ({
    opacity: alignedOpacity.value,
  }));

  const distance = userLocation
    ? calculateDistanceToKaaba(userLocation.lat, userLocation.lng)
    : 0;

  const cardinalDir = getCardinalDirection(qiblaAngle, t);

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <GlassHeader
          title={t('qibla.title')}
          leftAction={{ icon: 'arrow-left', onPress: () => router.back() }}
        />
        <View style={styles.loadingContainer}>
          <Skeleton.Rect
            width={COMPASS_SIZE}
            height={COMPASS_SIZE}
            borderRadius={radius.full}
          />
          <Skeleton.Rect
            width={200}
            height={20}
            borderRadius={radius.sm}
            style={{ marginTop: spacing.lg }}
          />
          <Skeleton.Rect
            width={150}
            height={16}
            borderRadius={radius.sm}
            style={{ marginTop: spacing.md }}
          />
        </View>
      </SafeAreaView>
    );
  }

  if (!permissionGranted) {
    return (
      <SafeAreaView style={styles.container}>
        <GlassHeader
          title={t('qibla.title')}
          leftAction={{ icon: 'arrow-left', onPress: () => router.back() }}
        />
        <View style={styles.emptyContainer}>
          <EmptyState
            icon="map-pin"
            title={t('qibla.permissionNeeded')}
          />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <ScreenErrorBoundary>
      <View style={styles.container} accessibilityLabel={t('qibla.title')}>
        <GlassHeader
          title={t('qibla.title')}
          leftAction={{ icon: 'arrow-left', onPress: () => router.back() }}
        />

        <View style={styles.content}>
          {/* Compass Rose */}
          <Animated.View entering={FadeInUp.duration(500)} style={styles.compassWrapper}>
            <Animated.View style={[styles.compassRose, compassAnimatedStyle]}>
              <LinearGradient
                colors={['rgba(10,123,79,0.15)', 'rgba(28,35,51,0.3)']}
                style={styles.compassCircle}
              >
                {/* Cardinal direction labels */}
                <Text style={[styles.cardinalLabel, styles.cardinalN]}>N</Text>
                <Text style={[styles.cardinalLabel, styles.cardinalE]}>E</Text>
                <Text style={[styles.cardinalLabel, styles.cardinalS]}>S</Text>
                <Text style={[styles.cardinalLabel, styles.cardinalW]}>W</Text>

                {/* Tick marks */}
                {Array.from({ length: 72 }).map((_, i) => (
                  <View
                    key={i}
                    style={[
                      styles.tickMark,
                      {
                        transform: [
                          { rotate: `${i * 5}deg` },
                          { translateY: -(COMPASS_SIZE / 2 - 12) },
                        ],
                      },
                      i % 18 === 0 && styles.tickMarkMajor,
                      i % 9 === 0 && i % 18 !== 0 && styles.tickMarkMinor,
                    ]}
                  />
                ))}
              </LinearGradient>
            </Animated.View>

            {/* Qibla Arrow Overlay (does not rotate with compass) */}
            <Animated.View
              style={[styles.arrowOverlay, arrowAnimatedStyle]}
            >
              <LinearGradient
                colors={['#C8963E', '#E8C476']}
                style={styles.qiblaArrowHead}
                start={{ x: 0.5, y: 0 }}
                end={{ x: 0.5, y: 1 }}
              />
              <View style={styles.qiblaArrowShaft} />
            </Animated.View>

            {/* Center Kaaba icon */}
            <View style={styles.centerDot}>
              <LinearGradient
                colors={[colors.emerald, colors.gold]}
                style={styles.centerGradient}
              >
                <Icon name="map-pin" size="sm" color="#fff" />
              </LinearGradient>
            </View>
          </Animated.View>

          {/* Bearing info */}
          <Animated.View entering={FadeInUp.delay(200).duration(500)} style={styles.infoContainer}>
            <Text style={styles.bearingText}>
              {t('qibla.bearing', {
                degrees: Math.round(qiblaAngle).toString(),
                direction: cardinalDir,
              })}
            </Text>
            <Text style={styles.distanceText}>
              {t('qibla.distanceToKaaba', {
                km: distance.toLocaleString(),
              })}
            </Text>
          </Animated.View>

          {/* Aligned indicator */}
          <Animated.View style={[styles.alignedContainer, alignedTextStyle]}>
            <LinearGradient
              colors={['rgba(10,123,79,0.4)', 'rgba(10,123,79,0.15)']}
              style={styles.alignedBadge}
            >
              <Icon name="check-circle" size="sm" color={colors.emerald} />
              <Text style={styles.alignedText}>{t('qibla.aligned')}</Text>
            </LinearGradient>
          </Animated.View>

          {/* Calibration hint */}
          <Animated.View entering={FadeInUp.delay(400).duration(500)} style={styles.calibrateContainer}>
            <Icon name="sliders" size="xs" color={colors.text.tertiary} />
            <Text style={styles.calibrateText}>{t('qibla.calibrate')}</Text>
          </Animated.View>
        </View>
      </View>
    </ScreenErrorBoundary>
  );
}

const createStyles = (tc: ReturnType<typeof useThemeColors>) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: tc.bg,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 100,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 100,
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 60,
    paddingBottom: spacing['3xl'],
  },

  // Compass
  compassWrapper: {
    width: COMPASS_SIZE,
    height: COMPASS_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  compassRose: {
    width: COMPASS_SIZE,
    height: COMPASS_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  compassCircle: {
    width: COMPASS_SIZE,
    height: COMPASS_SIZE,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.active.emerald30,
  },
  cardinalLabel: {
    position: 'absolute',
    color: colors.text.secondary,
    fontSize: fontSize.base,
    fontWeight: '700',
  },
  cardinalN: { top: 20, color: colors.emerald },
  cardinalE: { right: 20 },
  cardinalS: { bottom: 20 },
  cardinalW: { left: 20 },
  tickMark: {
    position: 'absolute',
    width: 1,
    height: 6,
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  tickMarkMajor: {
    height: 14,
    width: 2,
    backgroundColor: 'rgba(10,123,79,0.6)',
  },
  tickMarkMinor: {
    height: 10,
    backgroundColor: 'rgba(255,255,255,0.3)',
  },

  // Arrow overlay
  arrowOverlay: {
    position: 'absolute',
    width: COMPASS_SIZE,
    height: COMPASS_SIZE,
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingTop: 16,
  },
  qiblaArrowHead: {
    width: 20,
    height: 30,
    borderRadius: radius.sm,
    transform: [{ rotate: '45deg' }],
  },
  qiblaArrowShaft: {
    width: 4,
    height: COMPASS_SIZE / 2 - 60,
    backgroundColor: '#C8963E',
    borderRadius: radius.sm,
    marginTop: -6,
  },

  // Center
  centerDot: {
    position: 'absolute',
  },
  centerGradient: {
    width: 48,
    height: 48,
    borderRadius: radius.full,
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Info
  infoContainer: {
    alignItems: 'center',
    marginTop: spacing.xl,
  },
  bearingText: {
    color: colors.gold,
    fontSize: fontSize.xl,
    fontWeight: '700',
  },
  distanceText: {
    color: colors.text.tertiary,
    fontSize: fontSize.base,
    marginTop: spacing.xs,
  },

  // Aligned
  alignedContainer: {
    marginTop: spacing.lg,
  },
  alignedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.active.emerald40,
  },
  alignedText: {
    color: colors.emerald,
    fontSize: fontSize.base,
    fontWeight: '600',
  },

  // Calibrate
  calibrateContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.xl,
    paddingHorizontal: spacing.md,
  },
  calibrateText: {
    color: colors.text.tertiary,
    fontSize: fontSize.sm,
    textAlign: 'center',
  },
});
