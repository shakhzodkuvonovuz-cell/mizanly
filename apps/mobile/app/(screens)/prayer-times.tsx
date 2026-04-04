import { useState, useCallback, useEffect, useMemo } from 'react';
import {
  View, Text, StyleSheet, Pressable, ScrollView, Dimensions, Switch, Share,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeInUp, useSharedValue, useAnimatedStyle, withRepeat, withTiming, withSequence } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Icon, type IconName } from '@/components/ui/Icon';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { GlassHeader } from '@/components/ui/GlassHeader';
import { BottomSheet, BottomSheetItem } from '@/components/ui/BottomSheet';
import { colors, spacing, radius, fontSize, fonts, fontSizeExt, lineHeight, letterSpacing } from '@/theme';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { Magnetometer } from 'expo-sensors';
import { islamicApi } from '@/services/islamicApi';
import type { PrayerTimes as ApiPrayerTimes, PrayerMethodInfo, PrayerNotificationSetting } from '@/types/islamic';
import * as Location from 'expo-location';

const PRAYER_TIMES_CACHE_KEY = 'cached-prayer-times';
const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours
import { useTranslation } from '@/hooks/useTranslation';
import { useThemeColors } from '@/hooks/useThemeColors';
import { useContextualHaptic } from '@/hooks/useContextualHaptic';
import { formatHijriDate } from '@/utils/hijri';
import { BrandedRefreshControl } from '@/components/ui/BrandedRefreshControl';
import { ScreenErrorBoundary } from '@/components/ui/ScreenErrorBoundary';
import { navigate } from '@/utils/navigation';
import { rtlFlexRow, rtlChevron } from '@/utils/rtl';

const { width: screenWidth } = Dimensions.get('window');

/** i18n keys for each prayer — resolved via t() at render time */
const PRAYER_KEYS = ['fajr', 'sunrise', 'dhuhr', 'asr', 'maghrib', 'isha'] as const;
/** Arabic script names — always displayed as subtitle (sacred calligraphy, not locale-dependent) */
const PRAYER_ARABIC: Record<typeof PRAYER_KEYS[number], string> = {
  fajr: '\u0627\u0644\u0641\u062C\u0631',
  sunrise: '\u0627\u0644\u0634\u0631\u0648\u0642',
  dhuhr: '\u0627\u0644\u0638\u0647\u0631',
  asr: '\u0627\u0644\u0639\u0635\u0631',
  maghrib: '\u0627\u0644\u0645\u063A\u0631\u0628',
  isha: '\u0627\u0644\u0639\u0634\u0627\u0621',
};
const PRAYER_ICONS: readonly IconName[] = ['moon', 'sun', 'sun', 'sun', 'sun', 'moon'];

interface Prayer {
  key: typeof PRAYER_KEYS[number];
  icon: IconName;
  time: string;
}

// CALCULATION_METHODS removed — actual methods fetched from islamicApi.getPrayerMethods()

function timeStringToDate(timeStr: string): Date {
  const [hours, minutes] = timeStr.split(':').map(Number);
  const date = new Date();
  date.setHours(hours, minutes, 0, 0);
  return date;
}

function getPrayerList(pt: ApiPrayerTimes): Prayer[] {
  return PRAYER_KEYS.map((prayerKey, index) => {
    const time = typeof pt[prayerKey] === 'string' ? pt[prayerKey] as string : '--:--';
    return { key: prayerKey, icon: PRAYER_ICONS[index], time };
  });
}

function getCurrentPrayerIndex(prayerList: Prayer[]): number {
  const now = new Date();
  for (let i = prayerList.length - 1; i >= 0; i--) {
    const prayerTime = timeStringToDate(prayerList[i].time);
    if (now >= prayerTime) {
      return i;
    }
  }
  return 0; // Default to first prayer if before Fajr
}

function getCompassDirection(degrees: number): string {
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  return dirs[Math.round(degrees / 45) % 8];
}

function CountdownTimer({ targetTime, nextPrayerName }: { targetTime: string; nextPrayerName: string }) {
  const tc = useThemeColors();
  const styles = useMemo(() => createStyles(tc), [tc]);
  const { t } = useTranslation();
  const [remaining, setRemaining] = useState('00:00:00');

  useEffect(() => {
    const interval = setInterval(() => {
      const now = new Date();
      const [hours, minutes] = targetTime.split(':').map(Number);
      const target = new Date();
      target.setHours(hours, minutes, 0, 0);
      // If target time is earlier than now, assume it's tomorrow
      if (target <= now) {
        target.setDate(target.getDate() + 1);
      }
      const diff = target.getTime() - now.getTime();
      if (diff <= 0) {
        setRemaining('00:00:00');
        return;
      }
      const hoursRemaining = Math.floor(diff / (1000 * 60 * 60));
      const minutesRemaining = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const secondsRemaining = Math.floor((diff % (1000 * 60)) / 1000);
      setRemaining(
        `${hoursRemaining.toString().padStart(2, '0')}:${minutesRemaining.toString().padStart(2, '0')}:${secondsRemaining.toString().padStart(2, '0')}`
      );
    }, 1000);
    return () => clearInterval(interval);
  }, [targetTime]);

  return (
    <View style={styles.countdownTimerWrap}>
      <Text style={styles.countdownTimerLabel}>{t('islamic.nextPrayerIn', { prayer: nextPrayerName })}</Text>
      <Text style={styles.countdownTimerText}>{remaining}</Text>
    </View>
  );
}

function PrayerCard({
  prayer,
  isCurrent,
  isNext,
  index,
}: {
  prayer: Prayer;
  isCurrent: boolean;
  isNext: boolean;
  index: number;
}) {
  const tc = useThemeColors();
  const styles = useMemo(() => createStyles(tc), [tc]);
  const { t, isRTL: prayerIsRTL } = useTranslation();
  const haptic = useContextualHaptic();
  const pulseAnim = useSharedValue(1);
  const [notifyEnabled, setNotifyEnabled] = useState(true);

  const prayerDisplayName = t(`islamic.${prayer.key}`);

  // Load saved adhan notification preference for this prayer (keyed by stable key, not display name)
  useEffect(() => {
    AsyncStorage.getItem(`adhan-notify-${prayer.key}`).then((val) => {
      if (val !== null) setNotifyEnabled(JSON.parse(val));
    });
  }, [prayer.key]);

  useEffect(() => {
    if (isCurrent) {
      pulseAnim.value = withRepeat(
        withSequence(
          withTiming(1.02, { duration: 1000 }),
          withTiming(1, { duration: 1000 })
        ),
        -1,
        true
      );
    } else {
      pulseAnim.value = 1;
    }
  }, [isCurrent, pulseAnim]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulseAnim.value }],
  }));

  const toggleNotify = useCallback(() => {
    const next = !notifyEnabled;
    setNotifyEnabled(next);
    haptic.tick();
    AsyncStorage.setItem(`adhan-notify-${prayer.key}`, JSON.stringify(next));
  }, [notifyEnabled, haptic, prayer.key]);

  return (
    <Animated.View
      entering={FadeInUp.delay(index * 80).duration(500)}
      style={[
        styles.prayerCard,
        isCurrent && styles.prayerCardCurrent,
        isNext && styles.prayerCardNext,
        animatedStyle,
      ]}
    >
      <LinearGradient
        colors={isCurrent
          ? ['rgba(10,123,79,0.4)', 'rgba(10,123,79,0.2)']
          : ['rgba(45,53,72,0.3)', 'rgba(28,35,51,0.15)']
        }
        style={styles.prayerCardGradient}
      >
        {/* Left accent bar for current prayer */}
        {isCurrent && (
          <LinearGradient
            colors={[colors.emerald, colors.gold]}
            style={styles.currentAccentBar}
          />
        )}

        <View style={[styles.prayerContent, { flexDirection: rtlFlexRow(prayerIsRTL) }]}>
          <LinearGradient
            colors={isCurrent
              ? ['rgba(10,123,79,0.5)', 'rgba(200,150,62,0.3)']
              : ['rgba(110,119,129,0.2)', 'rgba(110,119,129,0.1)']
            }
            style={styles.prayerIconBg}
          >
            <Icon name={prayer.icon} size="sm" color={isCurrent ? '#fff' : tc.text.tertiary} />
          </LinearGradient>

          <View style={styles.prayerInfo}>
            <Text style={[styles.prayerName, isCurrent && styles.prayerNameCurrent]}>
              {prayerDisplayName}
            </Text>
            {/* Always show Arabic script name as subtitle (sacred calligraphy) */}
            <Text style={styles.prayerArabic}>{PRAYER_ARABIC[prayer.key]}</Text>
          </View>

          <View style={styles.prayerTimeContainer}>
            <Text style={[styles.prayerTime, isCurrent && styles.prayerTimeCurrent]}>
              {prayer.time}
            </Text>
            {isCurrent && (
              <View style={styles.currentBadge}>
                <Text style={styles.currentBadgeText}>{t('islamic.now')}</Text>
              </View>
            )}
            {isNext && (
              <View style={styles.nextBadge}>
                <Text style={styles.nextBadgeText}>{t('islamic.next')}</Text>
              </View>
            )}
          </View>

          {/* Per-prayer adhan notification toggle */}
          <Pressable
            onPress={toggleNotify}
            hitSlop={8}
            accessibilityRole="switch"
            accessibilityState={{ checked: notifyEnabled }}
            accessibilityLabel={t('islamic.adhanNotification', { prayer: prayerDisplayName })}
            style={styles.bellToggle}
          >
            <Icon
              name="bell"
              size="sm"
              color={notifyEnabled ? colors.emerald : tc.text.tertiary}
            />
          </Pressable>
        </View>
      </LinearGradient>
    </Animated.View>
  );
}

function getSkyGradient(currentPrayerIndex: number): readonly [string, string, string] {
  switch (currentPrayerIndex) {
    case 0: // Fajr — pre-dawn deep blue
      return ['#0a0e27', '#1a1a4e', '#2d1b69'] as const;
    case 1: // Sunrise — warm orange-blue transition
      return ['#1a1a4e', '#c84b31', '#ffa41b'] as const;
    case 2: // Dhuhr — bright sky blue
      return ['#1a3c5e', '#2980b9', '#6dd5fa'] as const;
    case 3: // Asr — warm afternoon
      return ['#2980b9', '#c0965c', '#f0a830'] as const;
    case 4: // Maghrib — sunset gold-purple
      return ['#2d1b69', '#c84b31', '#f0a830'] as const;
    case 5: // Isha — deep night
      return ['#0a0e27', '#0d1117', '#1a1a4e'] as const;
    default:
      return ['#0d1117', '#0d1117', '#1a1a4e'] as const;
  }
}

const REMINDER_OPTIONS = [0, 5, 10, 15, 30];
const ADHAN_STYLES: Array<{ key: string; value: string }> = [
  { key: 'makkah', value: 'prayerNotifications.makkah' },
  { key: 'madinah', value: 'prayerNotifications.madinah' },
  { key: 'alaqsa', value: 'prayerNotifications.alaqsa' },
];

export default function PrayerTimesScreen() {
  const tc = useThemeColors();
  const styles = useMemo(() => createStyles(tc), [tc]);
  const router = useRouter();
  const { t, isRTL } = useTranslation();
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [prayerTimes, setPrayerTimes] = useState<ApiPrayerTimes | null>(null);
  const [calculationMethod, setCalculationMethod] = useState('MWL');
  const [showMethodPicker, setShowMethodPicker] = useState(false);
  const [showNotifSettings, setShowNotifSettings] = useState(false);
  const [showAdhanStylePicker, setShowAdhanStylePicker] = useState(false);
  const [showReminderPicker, setShowReminderPicker] = useState(false);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  // Compute Qibla direction from user location (Kaaba: 21.4225, 39.8262)
  const qiblaDirection = useMemo(() => {
    if (!userLocation) return 0;
    const lat1 = (userLocation.lat * Math.PI) / 180;
    const lng1 = (userLocation.lng * Math.PI) / 180;
    const lat2 = (21.4225 * Math.PI) / 180;
    const lng2 = (39.8262 * Math.PI) / 180;
    const dLng = lng2 - lng1;
    const x = Math.sin(dLng) * Math.cos(lat2);
    const y = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
    const bearing = (Math.atan2(x, y) * 180) / Math.PI;
    return Math.round((bearing + 360) % 360);
  }, [userLocation]);
  const [currentPrayerIndex, setCurrentPrayerIndex] = useState(0);
  const [prayerMethods, setPrayerMethods] = useState<PrayerMethodInfo[]>([]);
  const [deviceHeading, setDeviceHeading] = useState(0);

  // Subscribe to magnetometer for live Qibla compass rotation
  useEffect(() => {
    let subscription: ReturnType<typeof Magnetometer.addListener> | null = null;
    const subscribe = async () => {
      try {
        const isAvailable = await Magnetometer.isAvailableAsync();
        if (!isAvailable) return;
        Magnetometer.setUpdateInterval(100);
        subscription = Magnetometer.addListener(({ x, y }: { x: number; y: number }) => {
          // Calculate heading from magnetometer x/y
          const heading = Math.atan2(y, x) * (180 / Math.PI);
          const normalizedHeading = (heading + 360) % 360;
          setDeviceHeading(normalizedHeading);
        });
      } catch {
        // Magnetometer not available on this device
      }
    };
    subscribe();
    return () => {
      if (subscription) subscription.remove();
    };
  }, []);

  // Compass rotation: rotate Qibla arrow relative to device heading
  const compassRotation = useMemo(() => {
    return (qiblaDirection - deviceHeading + 360) % 360;
  }, [qiblaDirection, deviceHeading]);

  const { data: notifSettings } = useQuery({
    queryKey: ['prayer-notification-settings'],
    queryFn: () => islamicApi.getPrayerNotificationSettings(),
    staleTime: 60_000,
  });

  const updateMutation = useMutation({
    mutationFn: (data: Partial<PrayerNotificationSetting>) =>
      islamicApi.updatePrayerNotificationSettings(data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['prayer-notification-settings'] }),
  });

  const settings = notifSettings;

  const prayerList = useMemo(() => {
    if (!prayerTimes) return [];
    return getPrayerList(prayerTimes);
  }, [prayerTimes]);

  useEffect(() => {
    if (prayerList.length === 0) return;
    const updateCurrentPrayer = () => {
      const newIndex = getCurrentPrayerIndex(prayerList);
      setCurrentPrayerIndex(newIndex);
    };
    updateCurrentPrayer();
    const interval = setInterval(updateCurrentPrayer, 60000); // update every minute
    return () => clearInterval(interval);
  }, [prayerList]);

  const fetchData = useCallback(async () => {
    try {
      setError(null);
      if (!refreshing) setLoading(true);

      // Try loading from cache first for instant display
      try {
        const cached = await AsyncStorage.getItem(PRAYER_TIMES_CACHE_KEY);
        if (cached) {
          const { data: cachedTimes, methods: cachedMethods, timestamp, method } = JSON.parse(cached);
          const isFresh = Date.now() - timestamp < CACHE_TTL_MS;
          if (isFresh && method === calculationMethod && cachedTimes) {
            setPrayerTimes(cachedTimes);
            if (cachedMethods) setPrayerMethods(cachedMethods);
            const cached_prayerList = getPrayerList(cachedTimes as ApiPrayerTimes);
            setCurrentPrayerIndex(getCurrentPrayerIndex(cached_prayerList));
            setLoading(false);
          }
        }
      } catch {
        // Cache miss — continue to fetch
      }

      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setError(t('islamic.errors.locationPermission'));
        setLoading(false);
        setRefreshing(false);
        return;
      }
      const location = await Location.getCurrentPositionAsync({});
      const lat = location.coords.latitude;
      const lng = location.coords.longitude;
      setUserLocation({ lat, lng });
      const [timesResp, methodsResp] = await Promise.all([
        islamicApi.getPrayerTimes(lat, lng, calculationMethod),
        islamicApi.getPrayerMethods(),
      ]);
      setPrayerTimes(timesResp);
      setPrayerMethods(methodsResp);
      // compute current prayer index based on current time
      const prayerList = getPrayerList(timesResp as ApiPrayerTimes);
      const currentIndex = getCurrentPrayerIndex(prayerList);
      setCurrentPrayerIndex(currentIndex);

      // Cache the result for offline use
      try {
        await AsyncStorage.setItem(PRAYER_TIMES_CACHE_KEY, JSON.stringify({
          data: timesResp,
          methods: methodsResp,
          timestamp: Date.now(),
          method: calculationMethod,
        }));
      } catch {
        // Cache write failure is non-critical
      }
    } catch (err) {
      setError(t('islamic.errors.failedToLoad'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [calculationMethod]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const nextPrayerIndex = prayerList.length > 0 ? (currentPrayerIndex + 1) % prayerList.length : 0;

  if (loading) {
    return (
      <ScreenErrorBoundary>
        <SafeAreaView style={styles.container}>
          <GlassHeader
            title={t('islamic.prayerTimes')}
            leftAction={{ icon: 'arrow-left', onPress: () => router.back() }}
          />
          <View style={[styles.scrollContent, { flex: 1, paddingTop: 100 }]}>
            <Skeleton.Rect width={screenWidth - 32} height={200} borderRadius={radius.lg} />
            <Skeleton.Rect width={200} height={20} borderRadius={radius.sm} style={{ marginTop: spacing.lg }} />
            <Skeleton.Rect width={150} height={16} borderRadius={radius.sm} style={{ marginTop: spacing.md }} />
          </View>
        </SafeAreaView>
      </ScreenErrorBoundary>
    );
  }

  if (error) {
    return (
      <ScreenErrorBoundary>
        <SafeAreaView style={styles.container}>
          <GlassHeader
            title={t('islamic.prayerTimes')}
            leftAction={{ icon: 'arrow-left', onPress: () => router.back() }}
          />
          <View style={[styles.scrollContent, { flex: 1, paddingTop: 100 }]}>
            <EmptyState
              icon="clock"
              title={t('islamic.errors.failedToLoad')}
              subtitle={error}
              actionLabel={t('common.retry')}
              onAction={fetchData}
            />
          </View>
        </SafeAreaView>
      </ScreenErrorBoundary>
    );
  }

  if (!prayerTimes) {
    return (
      <ScreenErrorBoundary>
        <SafeAreaView style={styles.container}>
          <GlassHeader
            title={t('islamic.prayerTimes')}
            leftAction={{ icon: 'arrow-left', onPress: () => router.back() }}
          />
          <View style={[styles.scrollContent, { flex: 1, paddingTop: 100 }]}>
            <EmptyState
              icon="clock"
              title={t('islamic.errors.noPrayerTimes')}
              subtitle={t('islamic.errors.couldNotLoad')}
              actionLabel={t('common.retry')}
              onAction={fetchData}
            />
          </View>
        </SafeAreaView>
      </ScreenErrorBoundary>
    );
  }

  return (
    <ScreenErrorBoundary>
      <View style={styles.container}>
        {/* Time-of-day sky gradient background */}
        <LinearGradient
          colors={getSkyGradient(currentPrayerIndex)}
          style={StyleSheet.absoluteFill}
        />

        <GlassHeader
          title={t('islamic.prayerTimes')}
          leftAction={{ icon: 'arrow-left', onPress: () => router.back() }}
          rightAction={{ icon: 'settings', onPress: () => setShowNotifSettings(true) }}
        />

        {/* Emerald glow behind prayer cards */}
        <LinearGradient
          colors={['rgba(10,123,79,0.08)', 'transparent']}
          style={styles.prayerGlow}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
        />

        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <BrandedRefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
        >
          {/* Location Header */}
          <Animated.View entering={FadeInUp.duration(500)} style={styles.locationContainer}>
            <LinearGradient
              colors={colors.gradient.cardDark}
              style={styles.locationCard}
            >
              <View style={[styles.locationRow, { flexDirection: rtlFlexRow(isRTL) }]}>
                <Icon name="map-pin" size="sm" color={colors.emerald} />
                <Text style={styles.locationText}>{userLocation ? t('islamic.locationCoords', { lat: userLocation.lat.toFixed(2), lng: userLocation.lng.toFixed(2) }) : t('islamic.detectingLocation')}</Text>
              </View>
              <Pressable onPress={() => navigate('/(screens)/location-picker')}>
                <Text style={styles.changeLocation}>{t('common.change')}</Text>
              </Pressable>
            </LinearGradient>
          </Animated.View>

          {/* Current Prayer Card */}
          <Animated.View entering={FadeInUp.delay(100).duration(500)}>
            <LinearGradient
              colors={[colors.emerald, colors.gold]}
              style={styles.currentPrayerContainer}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
            >
              <View style={styles.currentPrayerContent}>
                <Text style={styles.currentPrayerLabel}>{t('islamic.currentPrayer')}</Text>
                <Text style={styles.currentPrayerName}>
                  {prayerList[currentPrayerIndex]?.key ? t(`islamic.${prayerList[currentPrayerIndex].key}`) : ''}
                </Text>
                <Text style={styles.currentPrayerArabic}>
                  {prayerList[currentPrayerIndex]?.key ? PRAYER_ARABIC[prayerList[currentPrayerIndex].key] : ''}
                </Text>

                <View style={[styles.currentPrayerTimeRow, { flexDirection: rtlFlexRow(isRTL) }]}>
                  <Icon name="clock" size="sm" color="rgba(255,255,255,0.8)" />
                  <Text style={styles.currentPrayerTime}>
                    {prayerList[currentPrayerIndex]?.time || ''}
                  </Text>
                </View>

                <View style={styles.countdownContainer}>
                  <CountdownTimer
                    targetTime={prayerList[nextPrayerIndex]?.time || '00:00'}
                    nextPrayerName={prayerList[nextPrayerIndex]?.key ? t(`islamic.${prayerList[nextPrayerIndex].key}`) : ''}
                  />
                </View>
              </View>

              {/* Decorative pattern */}
              <View style={styles.decorationPattern}>
                {[...Array(6)].map((_, i) => (
                  <View key={i} style={[styles.patternDot, { opacity: 0.1 + i * 0.05 }]} />
                ))}
              </View>
            </LinearGradient>
          </Animated.View>

          {/* Compact Qibla Direction Card with live compass */}
          <Animated.View entering={FadeInUp.delay(200).duration(400)} style={styles.qiblaCompactCard}>
            <LinearGradient
              colors={['rgba(200,150,62,0.15)', 'rgba(200,150,62,0.05)']}
              style={styles.qiblaCompactGradient}
            >
              <View style={[styles.qiblaCompactRow, { flexDirection: rtlFlexRow(isRTL) }]}>
                {/* Live rotating compass arrow */}
                <View style={[styles.qiblaArrowContainer, { transform: [{ rotate: `${compassRotation}deg` }] }]}>
                  <Icon name="map-pin" size="sm" color={colors.gold} />
                </View>
                <View style={styles.qiblaCompactTextContainer}>
                  <Text style={[styles.qiblaCompactLabel, { color: tc.text.secondary }]}>
                    {t('islamic.qiblaDirection')}
                  </Text>
                  <Text style={[styles.qiblaCompactValue, { color: tc.text.primary }]}>
                    {qiblaDirection
                      ? `${qiblaDirection}\u00B0 ${getCompassDirection(qiblaDirection)}`
                      : t('islamic.calculating')}
                  </Text>
                  {deviceHeading > 0 && (
                    <Text style={[styles.qiblaCompactHeading, { color: tc.text.tertiary }]}>
                      {t('islamic.deviceHeading')}: {Math.round(deviceHeading)}{'\u00B0'}
                    </Text>
                  )}
                </View>
                <Pressable
                  onPress={() => navigate('/(screens)/qibla-compass')}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel={t('islamic.openCompass')}
                >
                  <Icon name={rtlChevron(isRTL, 'forward')} size="sm" color={tc.text.tertiary} />
                </Pressable>
              </View>
            </LinearGradient>
          </Animated.View>

          {/* All Prayers List */}
          <View style={styles.prayerListContainer}>
            <View style={[styles.sectionHeader, { flexDirection: rtlFlexRow(isRTL) }]}>
              <LinearGradient
                colors={['rgba(10,123,79,0.3)', 'rgba(200,150,62,0.2)']}
                style={styles.sectionIconBg}
              >
                <Icon name="clock" size="xs" color={colors.emerald} />
              </LinearGradient>
              <Text style={styles.sectionTitle}>{t('islamic.todaysPrayerTimes')}</Text>
            </View>

            {prayerList.map((prayer, index) => (
              <PrayerCard
                key={prayer.key}
                prayer={prayer}
                isCurrent={index === currentPrayerIndex}
                isNext={index === nextPrayerIndex}
                index={index}
              />
            ))}
          </View>

          {/* Calculation Method */}
          <Pressable
            accessibilityRole="button"
            style={styles.methodSelector}
            onPress={() => setShowMethodPicker(true)}
          >
            <LinearGradient
              colors={['rgba(45,53,72,0.3)', 'rgba(28,35,51,0.15)']}
              style={[styles.methodCard, { flexDirection: rtlFlexRow(isRTL) }]}
            >
              <View style={styles.methodIconBg}>
                <Icon name="settings" size="sm" color={colors.gold} />
              </View>
              <View style={styles.methodText}>
                <Text style={styles.methodLabel}>{t('islamic.prayerMethod')}</Text>
                <Text style={styles.methodValue}>{calculationMethod}</Text>
              </View>
              <Icon name={rtlChevron(isRTL, 'forward')} size="sm" color={tc.text.tertiary} />
            </LinearGradient>
          </Pressable>

          {/* Date Info */}
          <View style={styles.dateInfo}>
            <Text style={styles.dateText}>
              {formatHijriDate(new Date(), isRTL ? 'ar' : 'en')}
            </Text>
            <Text style={styles.dateSubtext}>
              {new Date().toLocaleDateString(isRTL ? 'ar' : 'en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
            </Text>
          </View>
        </ScrollView>

        {/* Method Picker Bottom Sheet */}
        <BottomSheet visible={showMethodPicker} onClose={() => setShowMethodPicker(false)}>
          {prayerMethods.map((method) => (
            <BottomSheetItem
              key={method.id}
              label={method.name}
              onPress={() => {
                setCalculationMethod(method.id);
                setShowMethodPicker(false);
              }}
              icon={calculationMethod === method.id ? (
                <Icon name="check" size="sm" color={colors.emerald} />
              ) : undefined}
            />
          ))}
        </BottomSheet>

        {/* Prayer Notification Settings Bottom Sheet */}
        <BottomSheet visible={showNotifSettings} onClose={() => setShowNotifSettings(false)}>
          <Text style={styles.settingsTitle}>{t('prayerNotifications.settings')}</Text>

          {/* DND during prayer */}
          <View style={[styles.settingsRow, { flexDirection: rtlFlexRow(isRTL) }]}>
            <View style={styles.settingsRowText}>
              <Text style={styles.settingsLabel}>{t('prayerNotifications.dndDuringPrayer')}</Text>
              <Text style={styles.settingsDescription}>{t('prayerNotifications.dndDescription')}</Text>
            </View>
            <Switch
              value={settings?.dndDuringPrayer ?? false}
              onValueChange={(val) => updateMutation.mutate({ dndDuringPrayer: val })}
              trackColor={{ false: tc.border, true: colors.emerald }}
              thumbColor="#fff"
            />
          </View>

          {/* Adhan alerts */}
          <View style={[styles.settingsRow, { flexDirection: rtlFlexRow(isRTL) }]}>
            <View style={styles.settingsRowText}>
              <Text style={styles.settingsLabel}>{t('prayerNotifications.adhanAlerts')}</Text>
              <Text style={styles.settingsDescription}>{t('prayerNotifications.adhanDescription')}</Text>
            </View>
            <Switch
              value={settings?.adhanEnabled ?? false}
              onValueChange={(val) => updateMutation.mutate({ adhanEnabled: val })}
              trackColor={{ false: tc.border, true: colors.emerald }}
              thumbColor="#fff"
            />
          </View>

          {/* Adhan style */}
          <BottomSheetItem
            label={`${t('prayerNotifications.adhanStyle')}: ${t(`prayerNotifications.${settings?.adhanStyle ?? 'makkah'}`)}`}
            icon={<Icon name="volume-x" size="sm" color={colors.gold} />}
            onPress={() => {
              setShowNotifSettings(false);
              setShowAdhanStylePicker(true);
            }}
          />

          {/* Reminder before prayer */}
          <BottomSheetItem
            label={`${t('prayerNotifications.reminderBefore')}: ${
              (settings?.reminderMinutes ?? 15) === 0
                ? t('prayerNotifications.none')
                : t('prayerNotifications.minutes', { count: settings?.reminderMinutes ?? 15 })
            }`}
            icon={<Icon name="bell" size="sm" color={colors.gold} />}
            onPress={() => {
              setShowNotifSettings(false);
              setShowReminderPicker(true);
            }}
          />
        </BottomSheet>

        {/* Adhan Style Picker */}
        <BottomSheet visible={showAdhanStylePicker} onClose={() => setShowAdhanStylePicker(false)}>
          <Text style={styles.settingsTitle}>{t('prayerNotifications.adhanStyle')}</Text>
          {ADHAN_STYLES.map((style) => (
            <BottomSheetItem
              key={style.key}
              label={t(style.value)}
              onPress={() => {
                updateMutation.mutate({ adhanStyle: style.key });
                setShowAdhanStylePicker(false);
              }}
              icon={settings?.adhanStyle === style.key ? (
                <Icon name="check" size="sm" color={colors.emerald} />
              ) : undefined}
            />
          ))}
        </BottomSheet>

        {/* Reminder Picker */}
        <BottomSheet visible={showReminderPicker} onClose={() => setShowReminderPicker(false)}>
          <Text style={styles.settingsTitle}>{t('prayerNotifications.reminderBefore')}</Text>
          {REMINDER_OPTIONS.map((mins) => (
            <BottomSheetItem
              key={mins}
              label={mins === 0 ? t('prayerNotifications.none') : t('prayerNotifications.minutes', { count: mins })}
              onPress={() => {
                updateMutation.mutate({ reminderMinutes: mins });
                setShowReminderPicker(false);
              }}
              icon={settings?.reminderMinutes === mins ? (
                <Icon name="check" size="sm" color={colors.emerald} />
              ) : undefined}
            />
          ))}
        </BottomSheet>
      </View>

    </ScreenErrorBoundary>
  );
}

const createStyles = (tc: ReturnType<typeof useThemeColors>) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingTop: 100,
    paddingHorizontal: spacing.base,
    paddingBottom: spacing['3xl'],
  },

  // Emerald glow overlay behind prayer cards
  prayerGlow: {
    position: 'absolute',
    top: 200,
    start: 0,
    end: 0,
    height: 200,
    zIndex: 0,
  },

  // Location
  locationContainer: {
    marginBottom: spacing.md,
  },
  locationCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.active.white6,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  locationText: {
    color: tc.text.primary,
    fontSize: fontSize.base,
    lineHeight: lineHeight.base,
    fontWeight: '500',
  },
  changeLocation: {
    color: colors.emerald,
    fontSize: fontSize.sm,
    fontWeight: '600',
  },

  // Current Prayer
  currentPrayerContainer: {
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
    overflow: 'hidden',
  },
  currentPrayerContent: {
    alignItems: 'center',
  },
  currentPrayerLabel: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: fontSize.sm,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: spacing.xs,
  },
  currentPrayerName: {
    color: '#fff',
    fontSize: fontSize['2xl'],
    lineHeight: lineHeight['2xl'],
    letterSpacing: letterSpacing.snug,
    fontWeight: '700',
    marginBottom: spacing.xs,
  },
  currentPrayerArabic: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: fontSize.lg,
    lineHeight: lineHeight.lg,
    fontFamily: fonts.arabic,
    marginBottom: spacing.md,
  },
  currentPrayerTimeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginBottom: spacing.md,
  },
  currentPrayerTime: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: fontSize.md,
    fontWeight: '600',
  },
  countdownContainer: {
    backgroundColor: 'rgba(0,0,0,0.2)',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radius.lg,
    alignItems: 'center',
  },
  // countdownLabel removed — now inside CountdownTimer component
  countdownTimerWrap: {
    alignItems: 'center',
  },
  countdownTimerLabel: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: fontSize.xs,
    fontWeight: '500',
    letterSpacing: 0.5,
    marginBottom: spacing.xs,
  },
  countdownTimerText: {
    fontSize: fontSizeExt.jumbo,
    fontFamily: fonts.bodyBold,
    color: colors.emerald,
    fontVariant: ['tabular-nums'],
    letterSpacing: 2,
    textShadowColor: 'rgba(10,123,79,0.3)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 10,
  },
  decorationPattern: {
    position: 'absolute',
    top: 0,
    end: 0,
    flexDirection: 'row',
    gap: 4,
    padding: spacing.md,
  },
  patternDot: {
    width: 6,
    height: 6,
    borderRadius: radius.full,
    backgroundColor: '#fff',
  },

  // Compact Qibla Card
  qiblaCompactCard: {
    marginHorizontal: 0,
    marginBottom: spacing.md,
  },
  qiblaCompactGradient: {
    borderRadius: radius.lg,
    padding: spacing.md,
  },
  qiblaCompactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  qiblaCompactTextContainer: {
    flex: 1,
  },
  qiblaArrowContainer: {
    width: 36,
    height: 36,
    borderRadius: radius.full,
    backgroundColor: 'rgba(200,150,62,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  qiblaCompactLabel: {
    fontSize: fontSize.xs,
  },
  qiblaCompactValue: {
    fontSize: fontSize.base,
    fontFamily: fonts.bodyBold,
  },
  qiblaCompactHeading: {
    fontSize: fontSize.xs,
    marginTop: 1,
  },

  // Prayer List
  prayerListContainer: {
    marginBottom: spacing.md,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  sectionIconBg: {
    width: 32,
    height: 32,
    borderRadius: radius.sm,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sectionTitle: {
    color: tc.text.primary,
    fontSize: fontSize.base,
    lineHeight: lineHeight.base,
    fontFamily: fonts.bodySemiBold,
  },
  prayerCard: {
    marginBottom: spacing.sm,
    borderRadius: radius.lg,
    overflow: 'hidden',
  },
  prayerCardCurrent: {
    shadowColor: colors.emerald,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  prayerCardNext: {
    borderWidth: 1,
    borderColor: colors.active.gold30,
  },
  prayerCardGradient: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  currentAccentBar: {
    width: 4,
    height: '100%',
  },
  prayerContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
  },
  prayerIconBg: {
    width: 44,
    height: 44,
    borderRadius: radius.full,
    justifyContent: 'center',
    alignItems: 'center',
    marginEnd: spacing.md,
  },
  prayerInfo: {
    flex: 1,
  },
  prayerName: {
    color: tc.text.primary,
    fontSize: fontSize.base,
    lineHeight: lineHeight.base,
    fontFamily: fonts.bodySemiBold,
  },
  prayerNameCurrent: {
    color: '#fff',
  },
  prayerArabic: {
    fontFamily: fonts.arabic,
    color: tc.text.tertiary,
    fontSize: fontSize.xs,
    marginTop: 2,
  },
  prayerTimeContainer: {
    alignItems: 'flex-end',
  },
  bellToggle: {
    marginStart: spacing.sm,
    padding: spacing.xs,
  },
  prayerTime: {
    color: tc.text.secondary,
    fontSize: fontSize.base,
    fontWeight: '500',
  },
  prayerTimeCurrent: {
    color: '#fff',
    fontWeight: '600',
  },
  currentBadge: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
    borderRadius: radius.sm,
    marginTop: spacing.xs,
  },
  currentBadgeText: {
    color: '#fff',
    fontSize: fontSizeExt.micro,
    fontWeight: '700',
  },
  nextBadge: {
    backgroundColor: colors.active.gold20,
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
    borderRadius: radius.sm,
    marginTop: spacing.xs,
  },
  nextBadgeText: {
    color: colors.gold,
    fontSize: fontSizeExt.micro,
    fontWeight: '700',
  },

  // Method Selector
  methodSelector: {
    marginBottom: spacing.md,
  },
  methodCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.active.white6,
  },
  methodIconBg: {
    width: 44,
    height: 44,
    borderRadius: radius.full,
    backgroundColor: colors.active.gold20,
    justifyContent: 'center',
    alignItems: 'center',
    marginEnd: spacing.md,
  },
  methodText: {
    flex: 1,
  },
  methodLabel: {
    color: tc.text.secondary,
    fontSize: fontSize.xs,
    marginBottom: 2,
  },
  methodValue: {
    color: tc.text.primary,
    fontSize: fontSize.base,
    fontWeight: '500',
  },

  // Date Info
  dateInfo: {
    alignItems: 'center',
    paddingVertical: spacing.md,
  },
  dateText: {
    color: colors.gold,
    fontSize: fontSize.lg,
    lineHeight: lineHeight.lg,
    letterSpacing: letterSpacing.snug,
    fontWeight: '600',
    marginBottom: spacing.xs,
  },
  dateSubtext: {
    color: tc.text.tertiary,
    fontSize: fontSize.sm,
    lineHeight: lineHeight.sm,
  },

  // Settings
  settingsTitle: {
    color: tc.text.primary,
    fontSize: fontSize.lg,
    lineHeight: lineHeight.lg,
    letterSpacing: letterSpacing.snug,
    fontFamily: fonts.bodyBold,
    paddingHorizontal: spacing.base,
    paddingBottom: spacing.md,
  },
  settingsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.active.white6,
  },
  settingsRowText: {
    flex: 1,
    marginEnd: spacing.md,
  },
  settingsLabel: {
    color: tc.text.primary,
    fontSize: fontSize.base,
    lineHeight: lineHeight.base,
    fontWeight: '500',
  },
  settingsDescription: {
    color: tc.text.tertiary,
    fontSize: fontSize.xs,
    lineHeight: lineHeight.xs,
    marginTop: 2,
  },
});
