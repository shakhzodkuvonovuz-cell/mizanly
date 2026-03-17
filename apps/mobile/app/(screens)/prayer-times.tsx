import { useState, useCallback, useEffect, useMemo } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, Dimensions, RefreshControl,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeInUp, useSharedValue, useAnimatedStyle, withRepeat, withTiming, withSequence } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { Icon } from '@/components/ui/Icon';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { GlassHeader } from '@/components/ui/GlassHeader';
import { BottomSheet, BottomSheetItem } from '@/components/ui/BottomSheet';
import { colors, spacing, radius, fontSize } from '@/theme';

import { islamicApi } from '@/services/islamicApi';
import type { PrayerTimes as ApiPrayerTimes, PrayerMethodInfo } from '@/types/islamic';
import * as Location from 'expo-location';
import { useTranslation } from '@/hooks/useTranslation';
import { ScreenErrorBoundary } from '@/components/ui/ScreenErrorBoundary';

const { width: screenWidth } = Dimensions.get('window');

const PRAYER_NAMES = ['Fajr', 'Sunrise', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'];
const PRAYER_ARABIC = ['الفجر', 'الشروق', 'الظهر', 'العصر', 'المغرب', 'العشاء'];
const PRAYER_ICONS = ['moon', 'sun', 'sun', 'sun', 'sun', 'moon'] as const;

interface Prayer {
  name: string;
  arabic: string;
  icon: string;
  time: string;
}

const CALCULATION_METHODS = [
  'Muslim World League',
  'Islamic Society of North America (ISNA)',
  'Egyptian General Authority',
  'Umm al-Qura University, Makkah',
  'University of Karachi',
  'Jafari / Shia',
];

function timeStringToDate(timeStr: string): Date {
  const [hours, minutes] = timeStr.split(':').map(Number);
  const date = new Date();
  date.setHours(hours, minutes, 0, 0);
  return date;
}

function getPrayerList(prayerTimes: any): Prayer[] {
  // prayerTimes may be flat fields or have timings object
  const timings = prayerTimes?.timings || prayerTimes;
  return PRAYER_NAMES.map((name, index) => ({
    name,
    arabic: PRAYER_ARABIC[index],
    icon: PRAYER_ICONS[index],
    time: timings[name.toLowerCase()] || timings[index] || '--:--',
  }));
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

function CountdownTimer({ targetTime }: { targetTime: string }) {
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
    <Text style={styles.countdownText}>{remaining}</Text>
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
  const pulseAnim = useSharedValue(1);

  if (isCurrent) {
    pulseAnim.value = withRepeat(
      withSequence(
        withTiming(1.02, { duration: 1000 }),
        withTiming(1, { duration: 1000 })
      ),
      -1,
      true
    );
  }

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulseAnim.value }],
  }));

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

        <View style={styles.prayerContent}>
          <LinearGradient
            colors={isCurrent
              ? ['rgba(10,123,79,0.5)', 'rgba(200,150,62,0.3)']
              : ['rgba(110,119,129,0.2)', 'rgba(110,119,129,0.1)']
            }
            style={styles.prayerIconBg}
          >
            <Icon name={prayer.icon} size="sm" color={isCurrent ? '#fff' : colors.text.tertiary} />
          </LinearGradient>

          <View style={styles.prayerInfo}>
            <Text style={[styles.prayerName, isCurrent && styles.prayerNameCurrent]}>
              {prayer.name}
            </Text>
            <Text style={styles.prayerArabic}>{prayer.arabic}</Text>
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
        </View>
      </LinearGradient>
    </Animated.View>
  );
}

export default function PrayerTimesScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [prayerTimes, setPrayerTimes] = useState<ApiPrayerTimes | null>(null);
  const [calculationMethod, setCalculationMethod] = useState('MWL');
  const [showMethodPicker, setShowMethodPicker] = useState(false);
  const [qiblaDirection] = useState(45); // Degrees from North
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [currentPrayerIndex, setCurrentPrayerIndex] = useState(0);
  const [prayerMethods, setPrayerMethods] = useState<PrayerMethodInfo[]>([]);

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
      setPrayerTimes(timesResp.data);
      setPrayerMethods(methodsResp.data);
      // compute current prayer index based on current time
      const prayerList = getPrayerList(timesResp.data);
      const currentIndex = getCurrentPrayerIndex(prayerList);
      setCurrentPrayerIndex(currentIndex);
    } catch (err) {
      setError(t('islamic.errors.failedToLoad'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [calculationMethod, refreshing]);

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
    );
  }

  if (error) {
    return (
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
    );
  }

  if (!prayerTimes) {
    return (
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
    );
  }

  return (
    <ScreenErrorBoundary>
      <View style={styles.container}>
        <GlassHeader
          title="Prayer Times"
          leftAction={{ icon: 'arrow-left', onPress: () => router.back() }}
        />

        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl tintColor={colors.emerald} refreshing={refreshing} onRefresh={onRefresh} />
          }
        >
          {/* Location Header */}
          <Animated.View entering={FadeInUp.duration(500)} style={styles.locationContainer}>
            <LinearGradient
              colors={['rgba(45,53,72,0.4)', 'rgba(28,35,51,0.2)']}
              style={styles.locationCard}
            >
              <View style={styles.locationRow}>
                <Icon name="map-pin" size="sm" color={colors.emerald} />
                <Text style={styles.locationText}>Dubai, United Arab Emirates</Text>
              </View>
              <TouchableOpacity onPress={() => { /* Open location picker */ }}>
                <Text style={styles.changeLocation}>{t('common.change')}</Text>
              </TouchableOpacity>
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
                  {prayerList[currentPrayerIndex]?.name || ''}
                </Text>
                <Text style={styles.currentPrayerArabic}>
                  {prayerList[currentPrayerIndex]?.arabic || ''}
                </Text>

                <View style={styles.currentPrayerTimeRow}>
                  <Icon name="clock" size="sm" color="rgba(255,255,255,0.8)" />
                  <Text style={styles.currentPrayerTime}>
                    {prayerList[currentPrayerIndex]?.time || ''}
                  </Text>
                </View>

                <View style={styles.countdownContainer}>
                  <Text style={styles.countdownLabel}>{t('islamic.timeRemainingUntil')} {prayerList[nextPrayerIndex]?.name || ''}</Text>
                  <CountdownTimer targetTime={prayerList[nextPrayerIndex]?.time || '00:00'} />
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

          {/* Qibla Compass */}
          <Animated.View entering={FadeInUp.delay(200).duration(500)} style={styles.qiblaContainer}>
            <LinearGradient
              colors={['rgba(45,53,72,0.3)', 'rgba(28,35,51,0.15)']}
              style={styles.qiblaCard}
            >
              <View style={styles.qiblaHeader}>
                <LinearGradient
                  colors={['rgba(10,123,79,0.3)', 'rgba(200,150,62,0.2)']}
                  style={styles.qiblaIconBg}
                >
                  <Icon name="map-pin" size="xs" color={colors.emerald} />
                </LinearGradient>
                <Text style={styles.qiblaTitle}>{t('islamic.qiblaDirection')}</Text>
              </View>

              <View style={styles.compassContainer}>
                {/* Compass circle */}
                <LinearGradient
                  colors={['rgba(10,123,79,0.2)', 'rgba(28,35,51,0.3)']}
                  style={styles.compassCircle}
                >
                  {/* Cardinal directions */}
                  <Text style={[styles.compassDirection, styles.compassN]}>N</Text>
                  <Text style={[styles.compassDirection, styles.compassE]}>E</Text>
                  <Text style={[styles.compassDirection, styles.compassS]}>S</Text>
                  <Text style={[styles.compassDirection, styles.compassW]}>W</Text>

                  {/* Qibla arrow */}
                  <View style={[styles.qiblaArrow, { transform: [{ rotate: `${qiblaDirection}deg` }] }]}>
                    <LinearGradient
                      colors={[colors.emerald, colors.gold]}
                      style={styles.arrowHead}
                    />
                    <View style={styles.arrowTail} />
                  </View>

                  {/* Center dot */}
                  <LinearGradient
                    colors={[colors.emerald, colors.gold]}
                    style={styles.compassCenter}
                  >
                    <Text style={styles.qiblaIcon}>🕋</Text>
                  </LinearGradient>
                </LinearGradient>

                <Text style={styles.qiblaDirectionText}>
                  {qiblaDirection}° from North
                </Text>
              </View>
            </LinearGradient>
          </Animated.View>

          {/* All Prayers List */}
          <View style={styles.prayerListContainer}>
            <View style={styles.sectionHeader}>
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
                key={prayer.name}
                prayer={prayer}
                isCurrent={index === currentPrayerIndex}
                isNext={index === nextPrayerIndex}
                index={index}
              />
            ))}
          </View>

          {/* Calculation Method */}
          <TouchableOpacity
            style={styles.methodSelector}
            onPress={() => setShowMethodPicker(true)}
          >
            <LinearGradient
              colors={['rgba(45,53,72,0.3)', 'rgba(28,35,51,0.15)']}
              style={styles.methodCard}
            >
              <View style={styles.methodIconBg}>
                <Icon name="settings" size="sm" color={colors.gold} />
              </View>
              <View style={styles.methodText}>
                <Text style={styles.methodLabel}>{t('islamic.prayerMethod')}</Text>
                <Text style={styles.methodValue}>{calculationMethod}</Text>
              </View>
              <Icon name="chevron-right" size="sm" color={colors.text.tertiary} />
            </LinearGradient>
          </TouchableOpacity>

          {/* Date Info */}
          <View style={styles.dateInfo}>
            <Text style={styles.dateText}>
              15 Ramadan 1446 AH
            </Text>
            <Text style={styles.dateSubtext}>
              Friday, March 14, 2025
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
      </View>
  
    </ScreenErrorBoundary>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.dark.bg,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingTop: 100,
    paddingHorizontal: spacing.base,
    paddingBottom: spacing['3xl'],
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
    borderColor: 'rgba(255,255,255,0.06)',
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  locationText: {
    color: colors.text.primary,
    fontSize: fontSize.base,
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
    fontWeight: '700',
    marginBottom: spacing.xs,
  },
  currentPrayerArabic: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: fontSize.lg,
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
  countdownLabel: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: fontSize.xs,
    marginBottom: spacing.xs,
  },
  countdownText: {
    color: '#fff',
    fontSize: fontSize.xl,
    fontWeight: '700',
    fontFamily: 'monospace',
  },
  decorationPattern: {
    position: 'absolute',
    top: 0,
    right: 0,
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

  // Qibla
  qiblaContainer: {
    marginBottom: spacing.md,
  },
  qiblaCard: {
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  qiblaHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  qiblaIconBg: {
    width: 32,
    height: 32,
    borderRadius: radius.sm,
    justifyContent: 'center',
    alignItems: 'center',
  },
  qiblaTitle: {
    color: colors.text.primary,
    fontSize: fontSize.base,
    fontWeight: '600',
  },
  compassContainer: {
    alignItems: 'center',
  },
  compassCircle: {
    width: 160,
    height: 160,
    borderRadius: radius.full,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'rgba(10,123,79,0.3)',
  },
  compassDirection: {
    position: 'absolute',
    color: colors.text.tertiary,
    fontSize: fontSize.xs,
    fontWeight: '600',
  },
  compassN: { top: 8 },
  compassE: { right: 8 },
  compassS: { bottom: 8 },
  compassW: { left: 8 },
  qiblaArrow: {
    position: 'absolute',
    width: 100,
    height: 4,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  arrowHead: {
    width: 12,
    height: 12,
    borderRadius: radius.sm,
    transform: [{ rotate: '45deg' }],
  },
  arrowTail: {
    position: 'absolute',
    width: 50,
    height: 2,
    backgroundColor: colors.emerald,
    right: 6,
  },
  compassCenter: {
    width: 44,
    height: 44,
    borderRadius: radius.full,
    justifyContent: 'center',
    alignItems: 'center',
  },
  qiblaIcon: {
    fontSize: 20,
  },
  qiblaDirectionText: {
    color: colors.emerald,
    fontSize: fontSize.base,
    fontWeight: '600',
    marginTop: spacing.md,
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
    color: colors.text.primary,
    fontSize: fontSize.base,
    fontWeight: '600',
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
    borderColor: 'rgba(200,150,62,0.3)',
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
    marginRight: spacing.md,
  },
  prayerInfo: {
    flex: 1,
  },
  prayerName: {
    color: colors.text.primary,
    fontSize: fontSize.base,
    fontWeight: '600',
  },
  prayerNameCurrent: {
    color: '#fff',
  },
  prayerArabic: {
    color: colors.text.tertiary,
    fontSize: fontSize.xs,
    marginTop: 2,
  },
  prayerTimeContainer: {
    alignItems: 'flex-end',
  },
  prayerTime: {
    color: colors.text.secondary,
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
    borderRadius: 4,
    marginTop: spacing.xs,
  },
  currentBadgeText: {
    color: '#fff',
    fontSize: 9,
    fontWeight: '700',
  },
  nextBadge: {
    backgroundColor: 'rgba(200,150,62,0.2)',
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
    borderRadius: 4,
    marginTop: spacing.xs,
  },
  nextBadgeText: {
    color: colors.gold,
    fontSize: 9,
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
    borderColor: 'rgba(255,255,255,0.06)',
  },
  methodIconBg: {
    width: 44,
    height: 44,
    borderRadius: radius.full,
    backgroundColor: 'rgba(200,150,62,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.md,
  },
  methodText: {
    flex: 1,
  },
  methodLabel: {
    color: colors.text.secondary,
    fontSize: fontSize.xs,
    marginBottom: 2,
  },
  methodValue: {
    color: colors.text.primary,
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
    fontWeight: '600',
    marginBottom: spacing.xs,
  },
  dateSubtext: {
    color: colors.text.tertiary,
    fontSize: fontSize.sm,
  },
});
