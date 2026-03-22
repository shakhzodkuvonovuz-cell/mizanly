import { useState, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, Pressable, ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { Icon } from '@/components/ui/Icon';
import { GlassHeader } from '@/components/ui/GlassHeader';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { EmptyState } from '@/components/ui/EmptyState';
import { colors, spacing, radius, fontSize } from '@/theme';
import { useTranslation } from '@/hooks/useTranslation';
import { useThemeColors } from '@/hooks/useThemeColors';
import { ScreenErrorBoundary } from '@/components/ui/ScreenErrorBoundary';
import {
  gregorianToHijri,
  getHijriMonthName,
  formatHijriDate,
  HIJRI_MONTHS_EN,
  HIJRI_MONTHS_AR,
} from '@/utils/hijri';

const WEEKDAY_KEYS = [
  'screens.islamicCalendar.sun', 'screens.islamicCalendar.mon',
  'screens.islamicCalendar.tue', 'screens.islamicCalendar.wed',
  'screens.islamicCalendar.thu', 'screens.islamicCalendar.fri',
  'screens.islamicCalendar.sat',
];

interface IslamicEvent {
  day: number;
  month: number; // 0-based index (0 = Muharram)
  name: string;
  type: 'important' | 'eid';
  description: string;
}

// Events data with i18n keys
const ISLAMIC_EVENTS: IslamicEvent[] = [
  { day: 1, month: 0, name: 'screens.islamicCalendar.islamicNewYear', type: 'important', description: 'screens.islamicCalendar.descIslamicNewYear' },
  { day: 10, month: 0, name: 'screens.islamicCalendar.dayOfAshura', type: 'important', description: 'screens.islamicCalendar.descDayOfAshura' },
  { day: 12, month: 2, name: 'screens.islamicCalendar.mawlidAlNabi', type: 'important', description: 'screens.islamicCalendar.descMawlidAlNabi' },
  { day: 27, month: 6, name: 'screens.islamicCalendar.israAndMiraj', type: 'important', description: 'screens.islamicCalendar.descIsraAndMiraj' },
  { day: 1, month: 8, name: 'screens.islamicCalendar.firstDayOfRamadan', type: 'important', description: 'screens.islamicCalendar.descFirstDayOfRamadan' },
  { day: 27, month: 8, name: 'screens.islamicCalendar.laylatAlQadr', type: 'important', description: 'screens.islamicCalendar.descLaylatAlQadr' },
  { day: 1, month: 9, name: 'screens.islamicCalendar.eidAlFitr', type: 'eid', description: 'screens.islamicCalendar.descEidAlFitr' },
  { day: 8, month: 11, name: 'screens.islamicCalendar.dayOfArafah', type: 'important', description: 'screens.islamicCalendar.descDayOfArafah' },
  { day: 9, month: 11, name: 'screens.islamicCalendar.eidAlAdha', type: 'eid', description: 'screens.islamicCalendar.descEidAlAdha' },
];

/**
 * Compute the day-of-week the first day of a Hijri month falls on.
 * Uses an approximation based on the Kuwaiti algorithm cycle.
 */
function getStartDayOfHijriMonth(month: number, year: number): number {
  // Total days from Hijri epoch to start of given month/year
  // Each Hijri year ~ 354.36667 days, months alternate 30/29
  const yearsElapsed = year - 1;
  const leapYears = Math.floor((11 * yearsElapsed + 3) / 30);
  let totalDays = yearsElapsed * 354 + leapYears;
  for (let m = 0; m < month; m++) {
    totalDays += m % 2 === 0 ? 30 : 29;
  }
  // Hijri epoch (1 Muharram 1 AH) ~ Friday (day 5) in Julian calendar
  // Adjusted to approximate alignment
  return (totalDays + 5) % 7;
}

function getDaysInHijriMonth(month: number, year: number): number {
  // Odd months (1-indexed: 1,3,5,7,9,11) have 30 days, even have 29
  // Exception: month 12 in leap years has 30
  const isLeapYear = (11 * year + 14) % 30 < 11;
  if (month === 11 && isLeapYear) return 30; // 0-based month 11 = Dhu al-Hijjah
  return month % 2 === 0 ? 30 : 29;
}

// Generate calendar days using real Hijri computation
function generateDaysInMonth(
  month: number,
  year: number,
  todayHijri: { month: number; day: number; year: number },
) {
  const daysInMonth = getDaysInHijriMonth(month, year);
  const startDayOfWeek = getStartDayOfHijriMonth(month, year);

  const days: Array<{
    day: number | null;
    isToday: boolean;
    hasEvent: boolean;
    eventType?: string;
    event?: IslamicEvent;
  }> = [];

  // Empty slots for days before month starts
  for (let i = 0; i < startDayOfWeek; i++) {
    days.push({ day: null, isToday: false, hasEvent: false });
  }

  // Actual days
  for (let day = 1; day <= daysInMonth; day++) {
    const event = ISLAMIC_EVENTS.find(e => e.day === day && e.month === month);
    const isToday =
      todayHijri.year === year &&
      todayHijri.month === month + 1 && // todayHijri.month is 1-based
      todayHijri.day === day;
    days.push({
      day,
      isToday,
      hasEvent: !!event,
      eventType: event?.type,
      event,
    });
  }

  return days;
}

function CalendarDay({
  day,
  isToday,
  hasEvent,
  eventType,
  index,
  onPress,
}: {
  day: number | null;
  isToday: boolean;
  hasEvent: boolean;
  eventType?: string;
  index: number;
  onPress?: () => void;
}) {
  if (day === null) {
    return <View style={styles.dayCell} />;
  }

  const content = (
    <Animated.View entering={FadeInUp.delay(index * 20).duration(300)} style={styles.dayCell}>
      <View style={[
        styles.dayContent,
        isToday && styles.dayToday,
        hasEvent && styles.dayEvent,
        eventType === 'eid' && styles.dayEid,
      ]}>
        {isToday ? (
          <LinearGradient
            colors={[colors.emerald, colors.gold]}
            style={styles.dayTodayGradient}
          >
            <Text style={styles.dayTextToday}>{day}</Text>
          </LinearGradient>
        ) : (
          <>
            <Text style={[
              styles.dayText,
              hasEvent && styles.dayTextEvent,
              eventType === 'eid' && styles.dayTextEid,
            ]}>{day}</Text>
            {hasEvent && (
              <View style={[
                styles.eventDot,
                eventType === 'eid' && styles.eventDotEid,
                eventType === 'important' && styles.eventDotImportant,
              ]} />
            )}
          </>
        )}
      </View>
    </Animated.View>
  );

  if (hasEvent && onPress) {
    return (
      <Pressable accessibilityRole="button" onPress={onPress}>
        {content}
      </Pressable>
    );
  }

  return content;
}

function EventCard({
  event,
  index,
  t,
  isRTL,
}: {
  event: IslamicEvent;
  index: number;
  t: (key: string, params?: Record<string, unknown>) => string;
  isRTL: boolean;
}) {
  const monthNames = isRTL ? HIJRI_MONTHS_AR : HIJRI_MONTHS_EN;
  return (
    <Animated.View entering={FadeInUp.delay(index * 100).duration(500)} style={styles.eventCard}>
      <LinearGradient
        colors={event.type === 'eid' ? ['rgba(200,150,62,0.2)', 'rgba(28,35,51,0.15)'] : ['rgba(45,53,72,0.3)', 'rgba(28,35,51,0.15)']}
        style={[
          styles.eventCardGradient,
          event.type === 'eid' && styles.eventCardEid,
        ]}
      >
        <LinearGradient
          colors={event.type === 'eid' ? ['rgba(200,150,62,0.3)', 'rgba(200,150,62,0.1)'] : ['rgba(10,123,79,0.3)', 'rgba(10,123,79,0.1)']}
          style={styles.eventIconBg}
        >
          <Icon name={event.type === 'eid' ? 'star' : 'flag'} size="sm" color={event.type === 'eid' ? colors.gold : colors.emerald} />
        </LinearGradient>
        <View style={styles.eventInfo}>
          <Text style={[styles.eventName, event.type === 'eid' && styles.eventNameEid]}>{t(event.name)}</Text>
          <Text style={styles.eventDate}>{monthNames[event.month]} {event.day}</Text>
        </View>
        <View style={[
          styles.eventBadge,
          event.type === 'eid' && styles.eventBadgeEid,
        ]}>
          <Text style={[
            styles.eventBadgeText,
            event.type === 'eid' && styles.eventBadgeTextEid,
          ]}>{event.type === 'eid' ? t('screens.islamicCalendar.badgeEid') : t('screens.islamicCalendar.badgeEvent')}</Text>
        </View>
      </LinearGradient>
    </Animated.View>
  );
}

export default function IslamicCalendarScreen() {
  const router = useRouter();
  const { t, isRTL } = useTranslation();

  // Get today's real Hijri date
  const todayHijri = useMemo(() => gregorianToHijri(new Date()), []);
  const todayFormatted = useMemo(
    () => formatHijriDate(new Date(), isRTL ? 'ar' : 'en'),
    [isRTL],
  );
  const todayGregorian = useMemo(() => {
    const now = new Date();
    return now.toLocaleDateString(isRTL ? 'ar' : 'en', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  }, [isRTL]);

  // Month state: 0-based (0 = Muharram), year is Hijri year
  const [currentMonth, setCurrentMonth] = useState(todayHijri.month - 1); // convert 1-based to 0-based
  const [currentYear, setCurrentYear] = useState(todayHijri.year);

  // Event detail bottom sheet
  const [selectedEvent, setSelectedEvent] = useState<IslamicEvent | null>(null);
  const tc = useThemeColors();

  const days = useMemo(
    () => generateDaysInMonth(currentMonth, currentYear, todayHijri),
    [currentMonth, currentYear, todayHijri],
  );

  const handlePrevMonth = useCallback(() => {
    if (currentMonth === 0) {
      setCurrentMonth(11);
      setCurrentYear(y => y - 1);
    } else {
      setCurrentMonth(m => m - 1);
    }
  }, [currentMonth]);

  const handleNextMonth = useCallback(() => {
    if (currentMonth === 11) {
      setCurrentMonth(0);
      setCurrentYear(y => y + 1);
    } else {
      setCurrentMonth(m => m + 1);
    }
  }, [currentMonth]);

  const monthEvents = useMemo(
    () => ISLAMIC_EVENTS.filter(e => e.month === currentMonth),
    [currentMonth],
  );

  const upcomingEvents = useMemo(() => {
    const todayMonth = todayHijri.month - 1; // 0-based
    return ISLAMIC_EVENTS.filter(e =>
      e.month > todayMonth ||
      (e.month === todayMonth && e.day >= todayHijri.day),
    ).slice(0, 3);
  }, [todayHijri]);

  const monthNames = isRTL ? HIJRI_MONTHS_AR : HIJRI_MONTHS_EN;

  return (
    <ScreenErrorBoundary>
      <View style={[styles.container, { backgroundColor: tc.bg }]}>
        <GlassHeader
          title={t('hijri.title')}
          leftAction={{ icon: 'arrow-left', onPress: () => router.back() }}
        />

        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Current Date Card */}
          <Animated.View entering={FadeInUp.duration(500)}>
            <LinearGradient
              colors={[colors.emerald, colors.gold]}
              style={styles.currentDateCard}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
            >
              <View style={styles.currentDateContent}>
                <Text style={styles.currentHijriDate}>{todayFormatted}</Text>
                <Text style={styles.currentHijriSub}>{t('hijri.today')}</Text>
                <View style={styles.currentGregorian}>
                  <Icon name="calendar" size="xs" color="rgba(255,255,255,0.7)" />
                  <Text style={styles.currentGregorianText}>{todayGregorian}</Text>
                </View>
              </View>

              {/* Decorative crescent */}
              <View style={styles.crescentDecoration}>
                <View style={styles.crescentOuter}>
                  <View style={styles.crescentInner} />
                </View>
              </View>
            </LinearGradient>
          </Animated.View>

          {/* Calendar Card */}
          <Animated.View entering={FadeInUp.delay(100).duration(500)} style={styles.calendarContainer}>
            <LinearGradient
              colors={['rgba(45,53,72,0.4)', 'rgba(28,35,51,0.2)']}
              style={styles.calendarCard}
            >
              {/* Month Header */}
              <View style={styles.monthHeader}>
                <Pressable accessibilityRole="button" onPress={handlePrevMonth} style={styles.monthNavButton}>
                  <LinearGradient
                    colors={['rgba(10,123,79,0.3)', 'rgba(10,123,79,0.1)']}
                    style={styles.monthNavGradient}
                  >
                    <Icon name="chevron-left" size="sm" color={colors.emerald} />
                  </LinearGradient>
                </Pressable>

                <View style={styles.monthTitleContainer}>
                  <Text style={styles.monthTitleArabic}>{HIJRI_MONTHS_AR[currentMonth]}</Text>
                  <Text style={styles.monthTitle}>{HIJRI_MONTHS_EN[currentMonth]} {currentYear}</Text>
                </View>

                <Pressable accessibilityRole="button" onPress={handleNextMonth} style={styles.monthNavButton}>
                  <LinearGradient
                    colors={['rgba(10,123,79,0.3)', 'rgba(10,123,79,0.1)']}
                    style={styles.monthNavGradient}
                  >
                    <Icon name="chevron-right" size="sm" color={colors.emerald} />
                  </LinearGradient>
                </Pressable>
              </View>

              {/* Weekday Headers */}
              <View style={styles.weekdayHeader}>
                {WEEKDAY_KEYS.map((dayKey) => (
                  <Text key={dayKey} style={styles.weekdayText}>{t(dayKey)}</Text>
                ))}
              </View>

              {/* Calendar Grid */}
              <View style={styles.calendarGrid}>
                {days.map((dayData, index) => (
                  <CalendarDay
                    key={index}
                    day={dayData.day}
                    isToday={dayData.isToday}
                    hasEvent={dayData.hasEvent}
                    eventType={dayData.eventType}
                    index={index}
                    onPress={dayData.event ? () => setSelectedEvent(dayData.event ?? null) : undefined}
                  />
                ))}
              </View>

              {/* Legend */}
              <View style={styles.calendarLegend}>
                <View style={styles.legendItem}>
                  <View style={[styles.legendDot, { backgroundColor: colors.emerald }]} />
                  <Text style={styles.legendText}>{t('screens.islamicCalendar.legendToday')}</Text>
                </View>
                <View style={styles.legendItem}>
                  <View style={[styles.legendDot, { backgroundColor: colors.gold }]} />
                  <Text style={styles.legendText}>{t('screens.islamicCalendar.legendEid')}</Text>
                </View>
                <View style={styles.legendItem}>
                  <View style={[styles.legendDot, { backgroundColor: colors.emerald, opacity: 0.5 }]} />
                  <Text style={styles.legendText}>{t('screens.islamicCalendar.legendImportant')}</Text>
                </View>
              </View>
            </LinearGradient>
          </Animated.View>

          {/* Upcoming Events */}
          <View style={styles.eventsSection}>
            <View style={styles.sectionHeader}>
              <LinearGradient
                colors={['rgba(200,150,62,0.3)', 'rgba(200,150,62,0.1)']}
                style={styles.sectionIconBg}
              >
                <Icon name="flag" size="xs" color={colors.gold} />
              </LinearGradient>
              <Text style={styles.sectionTitle}>{t('screens.islamicCalendar.upcomingEvents')}</Text>
            </View>

            {upcomingEvents.length === 0 ? (
              <EmptyState
                icon="calendar"
                title={t('hijri.noEvents')}
              />
            ) : (
              upcomingEvents.map((event, index) => (
                <EventCard key={event.name} event={event} index={index} t={t} isRTL={isRTL} />
              ))
            )}
          </View>

          {/* Quick Links */}
          <View style={styles.quickLinks}>
            <Pressable accessibilityRole="button" style={styles.quickLink}>
              <LinearGradient
                colors={['rgba(10,123,79,0.3)', 'rgba(10,123,79,0.1)']}
                style={styles.quickLinkGradient}
              >
                <Icon name="clock" size="sm" color={colors.emerald} />
                <Text style={styles.quickLinkText}>{t('screens.islamicCalendar.prayerTimes')}</Text>
              </LinearGradient>
            </Pressable>

            <Pressable accessibilityRole="button" style={styles.quickLink}>
              <LinearGradient
                colors={['rgba(200,150,62,0.3)', 'rgba(200,150,62,0.1)']}
                style={styles.quickLinkGradient}
              >
                <Icon name="book-open" size="sm" color={colors.gold} />
                <Text style={styles.quickLinkText}>{t('screens.islamicCalendar.quran')}</Text>
              </LinearGradient>
            </Pressable>
          </View>
        </ScrollView>

        {/* Event Detail BottomSheet */}
        <BottomSheet
          visible={!!selectedEvent}
          onClose={() => setSelectedEvent(null)}
        >
          {selectedEvent && (
            <View style={styles.eventSheetContent}>
              <LinearGradient
                colors={
                  selectedEvent.type === 'eid'
                    ? ['rgba(200,150,62,0.3)', 'rgba(200,150,62,0.1)']
                    : ['rgba(10,123,79,0.3)', 'rgba(10,123,79,0.1)']
                }
                style={styles.eventSheetIconBg}
              >
                <Icon
                  name={selectedEvent.type === 'eid' ? 'star' : 'flag'}
                  size="md"
                  color={selectedEvent.type === 'eid' ? colors.gold : colors.emerald}
                />
              </LinearGradient>
              <Text style={[
                styles.eventSheetTitle,
                selectedEvent.type === 'eid' && { color: colors.gold },
              ]}>
                {t(selectedEvent.name)}
              </Text>
              <Text style={styles.eventSheetDate}>
                {monthNames[selectedEvent.month]} {selectedEvent.day}
              </Text>
              <Text style={styles.eventSheetDescription}>
                {t(selectedEvent.description)}
              </Text>
            </View>
          )}
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

  // Current Date Card
  currentDateCard: {
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
    overflow: 'hidden',
  },
  currentDateContent: {
    alignItems: 'center',
  },
  currentHijriDate: {
    color: '#fff',
    fontSize: fontSize.xl,
    fontWeight: '700',
    marginBottom: spacing.xs,
  },
  currentHijriSub: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: fontSize.md,
    marginBottom: spacing.md,
  },
  currentGregorian: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: 'rgba(0,0,0,0.2)',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.full,
  },
  currentGregorianText: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: fontSize.sm,
  },
  crescentDecoration: {
    position: 'absolute',
    top: -20,
    right: -20,
    opacity: 0.3,
  },
  crescentOuter: {
    width: 100,
    height: 100,
    borderRadius: radius.full,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  crescentInner: {
    width: 80,
    height: 80,
    borderRadius: radius.full,
    backgroundColor: colors.emerald,
    transform: [{ translateX: 15 }],
  },

  // Calendar
  calendarContainer: {
    marginBottom: spacing.md,
  },
  calendarCard: {
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  monthHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  monthNavButton: {
    width: 36,
    height: 36,
    borderRadius: radius.full,
    overflow: 'hidden',
  },
  monthNavGradient: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  monthTitleContainer: {
    alignItems: 'center',
  },
  monthTitleArabic: {
    color: colors.gold,
    fontSize: fontSize.lg,
    fontWeight: '600',
  },
  monthTitle: {
    color: colors.text.secondary,
    fontSize: fontSize.sm,
    marginTop: 2,
  },
  weekdayHeader: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: spacing.sm,
    paddingVertical: spacing.xs,
  },
  weekdayText: {
    color: colors.text.tertiary,
    fontSize: fontSize.xs,
    fontWeight: '600',
    width: 40,
    textAlign: 'center',
  },
  calendarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  dayCell: {
    width: `${100 / 7}%`,
    aspectRatio: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 2,
  },
  dayContent: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: radius.md,
  },
  dayToday: {
    padding: 2,
  },
  dayTodayGradient: {
    width: '100%',
    height: '100%',
    borderRadius: radius.md - 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dayEvent: {
    borderWidth: 1,
    borderColor: 'rgba(10,123,79,0.3)',
  },
  dayEid: {
    borderWidth: 1,
    borderColor: 'rgba(200,150,62,0.5)',
  },
  dayText: {
    color: colors.text.primary,
    fontSize: fontSize.base,
  },
  dayTextToday: {
    color: '#fff',
    fontSize: fontSize.base,
    fontWeight: '700',
  },
  dayTextEvent: {
    color: colors.emerald,
    fontWeight: '600',
  },
  dayTextEid: {
    color: colors.gold,
    fontWeight: '700',
  },
  eventDot: {
    width: 4,
    height: 4,
    borderRadius: radius.full,
    backgroundColor: colors.emerald,
    marginTop: 2,
  },
  eventDotEid: {
    backgroundColor: colors.gold,
    width: 5,
    height: 5,
  },
  eventDotImportant: {
    backgroundColor: colors.emerald,
    opacity: 0.7,
  },
  calendarLegend: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.lg,
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.06)',
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: radius.full,
  },
  legendText: {
    color: colors.text.secondary,
    fontSize: fontSize.xs,
  },

  // Events Section
  eventsSection: {
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
  eventCard: {
    marginBottom: spacing.sm,
    borderRadius: radius.lg,
    overflow: 'hidden',
  },
  eventCardGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  eventCardEid: {
    borderLeftWidth: 3,
    borderLeftColor: colors.gold,
  },
  eventIconBg: {
    width: 44,
    height: 44,
    borderRadius: radius.full,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.md,
  },
  eventInfo: {
    flex: 1,
  },
  eventName: {
    color: colors.text.primary,
    fontSize: fontSize.base,
    fontWeight: '600',
  },
  eventNameEid: {
    color: colors.gold,
  },
  eventDate: {
    color: colors.text.tertiary,
    fontSize: fontSize.xs,
    marginTop: 2,
  },
  eventBadge: {
    backgroundColor: 'rgba(10,123,79,0.2)',
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
    borderRadius: radius.sm,
  },
  eventBadgeEid: {
    backgroundColor: 'rgba(200,150,62,0.2)',
  },
  eventBadgeText: {
    color: colors.emerald,
    fontSize: 9,
    fontWeight: '700',
  },
  eventBadgeTextEid: {
    color: colors.gold,
  },

  // Quick Links
  quickLinks: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  quickLink: {
    flex: 1,
    borderRadius: radius.lg,
    overflow: 'hidden',
  },
  quickLinkGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  quickLinkText: {
    color: colors.text.primary,
    fontSize: fontSize.base,
    fontWeight: '500',
  },

  // Event Detail BottomSheet
  eventSheetContent: {
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
  },
  eventSheetIconBg: {
    width: 64,
    height: 64,
    borderRadius: radius.full,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  eventSheetTitle: {
    color: colors.text.primary,
    fontSize: fontSize.lg,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: spacing.xs,
  },
  eventSheetDate: {
    color: colors.text.secondary,
    fontSize: fontSize.sm,
    marginBottom: spacing.md,
  },
  eventSheetDescription: {
    color: colors.text.secondary,
    fontSize: fontSize.base,
    textAlign: 'center',
    lineHeight: 22,
  },
});
