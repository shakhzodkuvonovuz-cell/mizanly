import { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, Dimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { Icon } from '@/components/ui/Icon';
import { GlassHeader } from '@/components/ui/GlassHeader';
import { colors, spacing, radius, fontSize } from '@/theme';
import { useTranslation } from '@/hooks/useTranslation';
import { ScreenErrorBoundary } from '@/components/ui/ScreenErrorBoundary';

const { width: screenWidth } = Dimensions.get('window');

const HIJRI_MONTHS = [
  'Muharram', 'Safar', 'Rabi\' al-Awwal', 'Rabi\' al-Thani',
  'Jumada al-Awwal', 'Jumada al-Thani', 'Rajab', 'Sha\'ban',
  'Ramadan', 'Shawwal', 'Dhu al-Qi\'dah', 'Dhu al-Hijjah'
];

const HIJRI_MONTHS_ARABIC = [
  'المحرم', 'صفر', 'ربيع الأول', 'ربيع الثاني',
  'جمادى الأولى', 'جمادى الآخرة', 'رجب', 'شعبان',
  'رمضان', 'شوال', 'ذو القعدة', 'ذو الحجة'
];

const WEEKDAY_KEYS = [
  'screens.islamicCalendar.sun', 'screens.islamicCalendar.mon',
  'screens.islamicCalendar.tue', 'screens.islamicCalendar.wed',
  'screens.islamicCalendar.thu', 'screens.islamicCalendar.fri',
  'screens.islamicCalendar.sat',
];

// Mock events data
const ISLAMIC_EVENTS = [
  { day: 1, month: 0, name: 'screens.islamicCalendar.islamicNewYear', type: 'important' },
  { day: 10, month: 0, name: 'screens.islamicCalendar.dayOfAshura', type: 'important' },
  { day: 12, month: 2, name: 'screens.islamicCalendar.mawlidAlNabi', type: 'important' },
  { day: 27, month: 6, name: 'screens.islamicCalendar.israAndMiraj', type: 'important' },
  { day: 1, month: 8, name: 'screens.islamicCalendar.firstDayOfRamadan', type: 'important' },
  { day: 27, month: 8, name: 'screens.islamicCalendar.laylatAlQadr', type: 'important' },
  { day: 1, month: 9, name: 'screens.islamicCalendar.eidAlFitr', type: 'eid' },
  { day: 8, month: 11, name: 'screens.islamicCalendar.dayOfArafah', type: 'important' },
  { day: 9, month: 11, name: 'screens.islamicCalendar.eidAlAdha', type: 'eid' },
];

// Generate mock calendar days
function generateDaysInMonth(month: number, year: number) {
  const daysInMonth = [30, 29, 30, 29, 30, 29, 30, 29, 30, 29, 30, 29][month];
  const startDayOfWeek = 5; // Mock: month starts on Friday

  const days: Array<{ day: number | null; isToday: boolean; hasEvent: boolean; eventType?: string }> = [];

  // Empty slots for days before month starts
  for (let i = 0; i < startDayOfWeek; i++) {
    days.push({ day: null, isToday: false, hasEvent: false });
  }

  // Actual days
  for (let day = 1; day <= daysInMonth; day++) {
    const event = ISLAMIC_EVENTS.find(e => e.day === day && e.month === month);
    days.push({
      day,
      isToday: day === 15, // Mock: today is 15th
      hasEvent: !!event,
      eventType: event?.type,
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
}: {
  day: number | null;
  isToday: boolean;
  hasEvent: boolean;
  eventType?: string;
  index: number;
}) {
  if (day === null) {
    return <View style={styles.dayCell} />;
  }

  return (
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
}

function EventCard({ event, index, t }: { event: typeof ISLAMIC_EVENTS[0]; index: number; t: (key: string, params?: Record<string, unknown>) => string }) {
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
          <Text style={styles.eventDate}>{HIJRI_MONTHS[event.month]} {event.day}</Text>
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
  const { t } = useTranslation();
  const [currentMonth, setCurrentMonth] = useState(8); // Ramadan
  const [currentYear, setCurrentYear] = useState(1446);

  const days = generateDaysInMonth(currentMonth, currentYear);

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

  const upcomingEvents = ISLAMIC_EVENTS.filter(e =>
    e.month > currentMonth || (e.month === currentMonth && e.day >= 15)
  ).slice(0, 3);

  return (
    <ScreenErrorBoundary>
      <View style={styles.container}>
        <GlassHeader
          title={t('screens.islamicCalendar.title')}
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
                <Text style={styles.currentHijriDate}>15 {HIJRI_MONTHS_ARABIC[8]} 1446</Text>
                <Text style={styles.currentHijriSub}>{t('screens.islamicCalendar.currentHijriSub')}</Text>
                <View style={styles.currentGregorian}>
                  <Icon name="calendar" size="xs" color="rgba(255,255,255,0.7)" />
                  <Text style={styles.currentGregorianText}>{t('screens.islamicCalendar.currentGregorianDate')}</Text>
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
                <TouchableOpacity onPress={handlePrevMonth} style={styles.monthNavButton}>
                  <LinearGradient
                    colors={['rgba(10,123,79,0.3)', 'rgba(10,123,79,0.1)']}
                    style={styles.monthNavGradient}
                  >
                    <Icon name="chevron-left" size="sm" color={colors.emerald} />
                  </LinearGradient>
                </TouchableOpacity>

                <View style={styles.monthTitleContainer}>
                  <Text style={styles.monthTitleArabic}>{HIJRI_MONTHS_ARABIC[currentMonth]}</Text>
                  <Text style={styles.monthTitle}>{HIJRI_MONTHS[currentMonth]} {currentYear}</Text>
                </View>

                <TouchableOpacity onPress={handleNextMonth} style={styles.monthNavButton}>
                  <LinearGradient
                    colors={['rgba(10,123,79,0.3)', 'rgba(10,123,79,0.1)']}
                    style={styles.monthNavGradient}
                  >
                    <Icon name="chevron-right" size="sm" color={colors.emerald} />
                  </LinearGradient>
                </TouchableOpacity>
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

            {upcomingEvents.map((event, index) => (
              <EventCard key={event.name} event={event} index={index} t={t} />
            ))}
          </View>

          {/* Quick Links */}
          <View style={styles.quickLinks}>
            <TouchableOpacity style={styles.quickLink}>
              <LinearGradient
                colors={['rgba(10,123,79,0.3)', 'rgba(10,123,79,0.1)']}
                style={styles.quickLinkGradient}
              >
                <Icon name="clock" size="sm" color={colors.emerald} />
                <Text style={styles.quickLinkText}>{t('screens.islamicCalendar.prayerTimes')}</Text>
              </LinearGradient>
            </TouchableOpacity>

            <TouchableOpacity style={styles.quickLink}>
              <LinearGradient
                colors={['rgba(200,150,62,0.3)', 'rgba(200,150,62,0.1)']}
                style={styles.quickLinkGradient}
              >
                <Icon name="book-open" size="sm" color={colors.gold} />
                <Text style={styles.quickLinkText}>{t('screens.islamicCalendar.quran')}</Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </ScrollView>
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
    borderRadius: 4,
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
});
