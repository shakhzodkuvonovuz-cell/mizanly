import { useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl, TouchableOpacity, Dimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { Icon } from '@/components/ui/Icon';
import { GlassHeader } from '@/components/ui/GlassHeader';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { colors, spacing, radius, fontSize, fonts } from '@/theme';
import { ScreenErrorBoundary } from '@/components/ui/ScreenErrorBoundary';

const { width: screenWidth } = Dimensions.get('window');

type SpaceType = 'Saf' | 'Majlis' | 'Bakra';
type AmPm = 'AM' | 'PM';

export default function SchedulePostScreen() {
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);
  const [selectedDate, setSelectedDate] = useState(15); // March 15, 2026
  const [currentMonth, setCurrentMonth] = useState(2); // March (0-indexed)
  const [currentYear] = useState(2026);
  const [selectedHour, setSelectedHour] = useState(6);
  const [selectedMinute, setSelectedMinute] = useState(0);
  const [selectedAmPm, setSelectedAmPm] = useState<AmPm>('PM');
  const [isScheduling, setIsScheduling] = useState(false);

  const today = 13; // March 13, 2026 (today)

  const postData = {
    content: 'Just finished an amazing photoshoot! Can\'t wait to share these moments with you all. What do you think of this look? 📸✨',
    hasMedia: true,
    space: 'Saf' as SpaceType,
  };

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 1000);
  }, []);

  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];

  const getDaysInMonth = (month: number, year: number) => {
    return new Date(year, month + 1, 0).getDate();
  };

  const getFirstDayOfMonth = (month: number, year: number) => {
    return new Date(year, month, 1).getDay();
  };

  const daysInMonth = getDaysInMonth(currentMonth, currentYear);
  const firstDay = getFirstDayOfMonth(currentMonth, currentYear);

  const changeMonth = (delta: number) => {
    setCurrentMonth((prev) => {
      let newMonth = prev + delta;
      if (newMonth > 11) newMonth = 0;
      if (newMonth < 0) newMonth = 11;
      return newMonth;
    });
  };

  const quickDates = [
    { label: 'Tomorrow', day: today + 1 },
    { label: 'This Weekend', day: 15 },
    { label: 'Next Week', day: 20 },
  ];

  const hours = Array.from({ length: 12 }, (_, i) => i + 1);
  const minutes = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55];

  const handleSchedule = () => {
    setIsScheduling(true);
    setTimeout(() => {
      setIsScheduling(false);
      router.back();
    }, 2000);
  };

  const formatScheduledTime = () => {
    const hour24 = selectedAmPm === 'PM' && selectedHour !== 12
      ? selectedHour + 12
      : selectedAmPm === 'AM' && selectedHour === 12
        ? 0
        : selectedHour;
    const minuteStr = selectedMinute.toString().padStart(2, '0');
    return `${monthNames[currentMonth]} ${selectedDate}, ${currentYear} at ${selectedHour}:${minuteStr} ${selectedAmPm}`;
  };

  return (
    <ScreenErrorBoundary>
    <SafeAreaView style={styles.container} edges={['top']}>
      <GlassHeader title="Schedule Post" showBackButton />

      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl tintColor={colors.emerald} refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {/* Post Preview Card */}
        <Animated.View entering={FadeInUp.delay(50).duration(400)}>
          <View style={styles.previewCard}>
            <LinearGradient
              colors={['rgba(45,53,72,0.4)', 'rgba(28,35,51,0.2)']}
              style={styles.previewGradient}
            >
              {/* User Info */}
              <View style={styles.userRow}>
                <View style={styles.avatarPlaceholder}>
                  <Icon name="user" size="md" color={colors.text.tertiary} />
                </View>
                <View style={styles.userInfo}>
                  <Text style={styles.userName}>Your Name</Text>
                  <Text style={styles.userHandle}>@username</Text>
                </View>
                <View style={styles.draftBadge}>
                  <LinearGradient
                    colors={['rgba(10,123,79,0.3)', 'rgba(10,123,79,0.1)']}
                    style={styles.draftBadgeGradient}
                  >
                    <Icon name="check" size="xs" color={colors.emerald} />
                    <Text style={styles.draftBadgeText}>Draft saved</Text>
                  </LinearGradient>
                </View>
              </View>

              {/* Post Content */}
              <Text style={styles.postContent} numberOfLines={3}>
                {postData.content}
              </Text>

              {/* Post Meta */}
              <View style={styles.postMeta}>
                {postData.hasMedia && (
                  <View style={styles.mediaIndicator}>
                    <Icon name="image" size="xs" color={colors.text.tertiary} />
                  </View>
                )}
                <View style={styles.spaceBadge}>
                  <LinearGradient
                    colors={['rgba(45,53,72,0.6)', 'rgba(28,35,51,0.4)']}
                    style={styles.spaceBadgeGradient}
                  >
                    <Text style={styles.spaceBadgeText}>{postData.space} Post</Text>
                  </LinearGradient>
                </View>
              </View>
            </LinearGradient>
          </View>
        </Animated.View>

        {/* Date Picker Section */}
        <Animated.View entering={FadeInUp.delay(100).duration(400)}>
          <View style={styles.dateCard}>
            <LinearGradient
              colors={['rgba(45,53,72,0.4)', 'rgba(28,35,51,0.2)']}
              style={styles.dateGradient}
            >
              {/* Header */}
              <View style={styles.dateHeader}>
                <View style={styles.dateIconContainer}>
                  <LinearGradient
                    colors={['rgba(10,123,79,0.2)', 'rgba(200,150,62,0.1)']}
                    style={styles.dateIconGradient}
                  >
                    <Icon name="calendar" size="sm" color={colors.emerald} />
                  </LinearGradient>
                </View>
                <View style={styles.monthNavigation}>
                  <TouchableOpacity onPress={() => changeMonth(-1)}>
                    <Icon name="chevron-left" size="md" color={colors.text.secondary} />
                  </TouchableOpacity>
                  <Text style={styles.monthText}>{monthNames[currentMonth]} {currentYear}</Text>
                  <TouchableOpacity onPress={() => changeMonth(1)}>
                    <Icon name="chevron-right" size="md" color={colors.text.secondary} />
                  </TouchableOpacity>
                </View>
              </View>

              {/* Weekday Headers */}
              <View style={styles.weekdayRow}>
                {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day, i) => (
                  <Text key={i} style={styles.weekdayText}>{day}</Text>
                ))}
              </View>

              {/* Calendar Grid */}
              <View style={styles.calendarGrid}>
                {/* Empty cells for days before first day */}
                {Array.from({ length: firstDay }).map((_, i) => (
                  <View key={`empty-${i}`} style={styles.calendarDay} />
                ))}

                {/* Day cells */}
                {Array.from({ length: daysInMonth }, (_, i) => {
                  const day = i + 1;
                  const isToday = day === today && currentMonth === 2;
                  const isSelected = day === selectedDate;
                  const isPast = day < today && currentMonth === 2;

                  return (
                      <TouchableOpacity
                        key={day}
                        style={styles.calendarDay}
                        onPress={() => !isPast && setSelectedDate(day)}
                        disabled={isPast}
                      >
                        {isSelected ? (
                          <LinearGradient
                            colors={['rgba(10,123,79,0.8)', 'rgba(10,123,79,0.6)']}
                            style={styles.selectedDay}
                          >
                            <Text style={styles.selectedDayText}>{day}</Text>
                          </LinearGradient>
                        ) : isToday ? (
                          <View style={styles.todayDay}>
                            <Text style={styles.todayDayText}>{day}</Text>
                          </View>
                        ) : (
                          <Text style={[styles.dayText, isPast && styles.pastDayText]}>{day}</Text>
                        )}
                      </TouchableOpacity>
                  
                  );
                })}
              </View>

              {/* Quick Date Buttons */}
              <View style={styles.quickDates}>
                {quickDates.map((quick) => (
                  <TouchableOpacity
                    key={quick.label}
                    style={styles.quickDateButton}
                    onPress={() => setSelectedDate(quick.day)}
                  >
                    <LinearGradient
                      colors={selectedDate === quick.day
                        ? ['rgba(10,123,79,0.4)', 'rgba(10,123,79,0.2)']
                        : ['rgba(45,53,72,0.4)', 'rgba(28,35,51,0.2)']
                      }
                      style={styles.quickDateGradient}
                    >
                      <Text style={[
                        styles.quickDateText,
                        selectedDate === quick.day && styles.quickDateTextActive
                      ]}>
                        {quick.label}
                      </Text>
                    </LinearGradient>
                  </TouchableOpacity>
                ))}
              </View>
            </LinearGradient>
          </View>
        </Animated.View>

        {/* Time Picker Section */}
        <Animated.View entering={FadeInUp.delay(150).duration(400)}>
          <View style={styles.timeCard}>
            <LinearGradient
              colors={['rgba(45,53,72,0.4)', 'rgba(28,35,51,0.2)']}
              style={styles.timeGradient}
            >
              {/* Header */}
              <View style={styles.timeHeader}>
                <View style={styles.timeIconContainer}>
                  <LinearGradient
                    colors={['rgba(10,123,79,0.2)', 'rgba(200,150,62,0.1)']}
                    style={styles.timeIconGradient}
                  >
                    <Icon name="clock" size="sm" color={colors.emerald} />
                  </LinearGradient>
                </View>
                <Text style={styles.timeTitle}>Time</Text>
              </View>

              {/* Hour Selector */}
              <Text style={styles.timeLabel}>Hour</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.hourScroll}>
                {hours.map((hour) => (
                  <TouchableOpacity
                    key={hour}
                    style={styles.timeOptionButton}
                    onPress={() => setSelectedHour(hour)}
                  >
                    <LinearGradient
                      colors={selectedHour === hour
                        ? ['rgba(10,123,79,0.4)', 'rgba(10,123,79,0.2)']
                        : ['rgba(45,53,72,0.4)', 'rgba(28,35,51,0.2)']
                      }
                      style={styles.timeOptionGradient}
                    >
                      <Text style={[
                        styles.timeOptionText,
                        selectedHour === hour && styles.timeOptionTextActive
                      ]}>
                        {hour}
                      </Text>
                    </LinearGradient>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              {/* Minute Selector */}
              <Text style={styles.timeLabel}>Minute</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.minuteScroll}>
                {minutes.map((minute) => (
                  <TouchableOpacity
                    key={minute}
                    style={styles.timeOptionButton}
                    onPress={() => setSelectedMinute(minute)}
                  >
                    <LinearGradient
                      colors={selectedMinute === minute
                        ? ['rgba(10,123,79,0.4)', 'rgba(10,123,79,0.2)']
                        : ['rgba(45,53,72,0.4)', 'rgba(28,35,51,0.2)']
                      }
                      style={styles.timeOptionGradient}
                    >
                      <Text style={[
                        styles.timeOptionText,
                        selectedMinute === minute && styles.timeOptionTextActive
                      ]}>
                        {minute.toString().padStart(2, '0')}
                      </Text>
                    </LinearGradient>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              {/* AM/PM Toggle */}
              <View style={styles.ampmContainer}>
                {(['AM', 'PM'] as AmPm[]).map((ampm) => (
                  <TouchableOpacity
                    key={ampm}
                    style={styles.ampmButton}
                    onPress={() => setSelectedAmPm(ampm)}
                  >
                    <LinearGradient
                      colors={selectedAmPm === ampm
                        ? ['rgba(10,123,79,0.4)', 'rgba(10,123,79,0.2)']
                        : ['rgba(45,53,72,0.4)', 'rgba(28,35,51,0.2)']
                      }
                      style={styles.ampmGradient}
                    >
                      <Text style={[
                        styles.ampmText,
                        selectedAmPm === ampm && styles.ampmTextActive
                      ]}>
                        {ampm}
                      </Text>
                    </LinearGradient>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Best Time Suggestion */}
              <View style={styles.bestTimeContainer}>
                <LinearGradient
                  colors={['rgba(200,150,62,0.15)', 'rgba(200,150,62,0.05)']}
                  style={styles.bestTimeGradient}
                >
                  <Icon name="trending-up" size="sm" color={colors.gold} />
                  <Text style={styles.bestTimeText}>6:00 PM (high engagement)</Text>
                </LinearGradient>
              </View>
            </LinearGradient>
          </View>
        </Animated.View>

        {/* Timezone Card */}
        <Animated.View entering={FadeInUp.delay(200).duration(400)}>
          <View style={styles.timezoneCard}>
            <LinearGradient
              colors={['rgba(45,53,72,0.4)', 'rgba(28,35,51,0.2)']}
              style={styles.timezoneGradient}
            >
              <View style={styles.timezoneRow}>
                <Icon name="globe" size="sm" color={colors.text.secondary} />
                <View style={styles.timezoneInfo}>
                  <Text style={styles.timezoneLabel}>Timezone</Text>
                  <Text style={styles.timezoneValue}>UTC+3 (Arabia Standard Time)</Text>
                </View>
              </View>
            </LinearGradient>
          </View>
        </Animated.View>

        {/* Summary Card */}
        <Animated.View entering={FadeInUp.delay(250).duration(400)}>
          <View style={styles.summaryCard}>
            <LinearGradient
              colors={['rgba(200,150,62,0.15)', 'rgba(200,150,62,0.05)']}
              style={styles.summaryGradient}
            >
              <View style={styles.summaryBorder} />
              <View style={styles.summaryContent}>
                <Text style={styles.summaryLabel}>Scheduled for:</Text>
                <Text style={styles.summaryValue}>{formatScheduledTime()}</Text>

                <View style={styles.summaryRow}>
                  <Icon name="share" size="xs" color={colors.text.secondary} />
                  <Text style={styles.summaryDetail}>Will post to: {postData.space}</Text>
                </View>

                <View style={styles.summaryRow}>
                  <Icon name="bell" size="xs" color={colors.text.secondary} />
                  <Text style={styles.summaryDetail}>You&apos;ll receive a reminder 30 minutes before</Text>
                </View>
              </View>
            </LinearGradient>
          </View>
        </Animated.View>

        {/* Bottom Spacing */}
        <View style={styles.bottomSpacing} />
      </ScrollView>

      {/* Bottom Action Bar */}
      <View style={styles.bottomBar}>
        <LinearGradient
          colors={['rgba(13,17,23,0.95)', 'rgba(13,17,23,1)']}
          style={styles.bottomBarGradient}
        >
          <TouchableOpacity style={styles.cancelButton} onPress={() => router.back()}>
            <Text style={styles.cancelButtonText}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.scheduleButton} onPress={handleSchedule} disabled={isScheduling}>
            <LinearGradient
              colors={['rgba(10,123,79,0.9)', 'rgba(6,107,66,0.95)']}
              style={styles.scheduleButtonGradient}
            >
              {isScheduling ? (
                <Skeleton.Circle size={20} />
              ) : (
                <>
                  <Icon name="calendar" size="sm" color="#FFF" />
                  <Text style={styles.scheduleButtonText}>Schedule</Text>
                </>
              )}
            </LinearGradient>
          </TouchableOpacity>
        </LinearGradient>
      </View>
    </SafeAreaView>
    </ScreenErrorBoundary>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.dark.bg,
  },
  previewCard: {
    marginHorizontal: spacing.base,
    marginTop: spacing.md,
  },
  previewGradient: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    padding: spacing.base,
  },
  userRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  avatarPlaceholder: {
    width: 40,
    height: 40,
    borderRadius: radius.full,
    backgroundColor: colors.dark.surface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  userInfo: {
    flex: 1,
  },
  userName: {
    fontSize: fontSize.base,
    fontWeight: '600',
    color: colors.text.primary,
  },
  userHandle: {
    fontSize: fontSize.sm,
    color: colors.text.secondary,
  },
  draftBadge: {
    borderRadius: radius.full,
    overflow: 'hidden',
  },
  draftBadgeGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  draftBadgeText: {
    fontSize: fontSize.xs,
    color: colors.emerald,
  },
  postContent: {
    fontSize: fontSize.base,
    color: colors.text.primary,
    marginTop: spacing.md,
    lineHeight: 22,
  },
  postMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.md,
  },
  mediaIndicator: {
    width: 32,
    height: 32,
    borderRadius: radius.md,
    backgroundColor: colors.dark.surface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  spaceBadge: {
    borderRadius: radius.full,
    overflow: 'hidden',
  },
  spaceBadgeGradient: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  spaceBadgeText: {
    fontSize: fontSize.xs,
    color: colors.text.secondary,
  },
  dateCard: {
    marginHorizontal: spacing.base,
    marginTop: spacing.md,
  },
  dateGradient: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    padding: spacing.base,
  },
  dateHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  dateIconContainer: {
    borderRadius: radius.sm,
    overflow: 'hidden',
  },
  dateIconGradient: {
    width: 32,
    height: 32,
    borderRadius: radius.sm,
    justifyContent: 'center',
    alignItems: 'center',
  },
  monthNavigation: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  monthText: {
    fontSize: fontSize.md,
    fontWeight: '600',
    color: colors.text.primary,
  },
  weekdayRow: {
    flexDirection: 'row',
    marginBottom: spacing.sm,
  },
  weekdayText: {
    flex: 1,
    textAlign: 'center',
    fontSize: fontSize.xs,
    color: colors.text.tertiary,
    fontWeight: '500',
  },
  calendarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  calendarDay: {
    width: `${100 / 7}%`,
    aspectRatio: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dayText: {
    fontSize: fontSize.base,
    color: colors.text.primary,
  },
  pastDayText: {
    color: colors.text.tertiary,
    opacity: 0.5,
  },
  todayDay: {
    width: 36,
    height: 36,
    borderRadius: radius.full,
    borderWidth: 2,
    borderColor: colors.emerald,
    justifyContent: 'center',
    alignItems: 'center',
  },
  todayDayText: {
    fontSize: fontSize.base,
    color: colors.emerald,
    fontWeight: '600',
  },
  selectedDay: {
    width: 36,
    height: 36,
    borderRadius: radius.full,
    justifyContent: 'center',
    alignItems: 'center',
  },
  selectedDayText: {
    fontSize: fontSize.base,
    color: '#FFF',
    fontWeight: '600',
  },
  quickDates: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  quickDateButton: {
    flex: 1,
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  quickDateGradient: {
    paddingVertical: spacing.sm,
    alignItems: 'center',
  },
  quickDateText: {
    fontSize: fontSize.sm,
    color: colors.text.secondary,
  },
  quickDateTextActive: {
    color: colors.emerald,
    fontWeight: '600',
  },
  timeCard: {
    marginHorizontal: spacing.base,
    marginTop: spacing.md,
  },
  timeGradient: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    padding: spacing.base,
  },
  timeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  timeIconContainer: {
    borderRadius: radius.sm,
    overflow: 'hidden',
  },
  timeIconGradient: {
    width: 32,
    height: 32,
    borderRadius: radius.sm,
    justifyContent: 'center',
    alignItems: 'center',
  },
  timeTitle: {
    fontSize: fontSize.base,
    fontWeight: '600',
    color: colors.text.primary,
  },
  timeLabel: {
    fontSize: fontSize.sm,
    color: colors.text.secondary,
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
  },
  hourScroll: {
    marginBottom: spacing.sm,
  },
  minuteScroll: {
    marginBottom: spacing.sm,
  },
  timeOptionButton: {
    marginRight: spacing.sm,
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  timeOptionGradient: {
    width: 48,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: radius.md,
  },
  timeOptionText: {
    fontSize: fontSize.base,
    color: colors.text.secondary,
    fontFamily: fonts.mono,
  },
  timeOptionTextActive: {
    color: colors.emerald,
    fontWeight: '600',
  },
  ampmContainer: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  ampmButton: {
    flex: 1,
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  ampmGradient: {
    paddingVertical: spacing.sm,
    alignItems: 'center',
    borderRadius: radius.md,
  },
  ampmText: {
    fontSize: fontSize.base,
    color: colors.text.secondary,
  },
  ampmTextActive: {
    color: colors.emerald,
    fontWeight: '600',
  },
  bestTimeContainer: {
    marginTop: spacing.md,
    borderRadius: radius.full,
    overflow: 'hidden',
  },
  bestTimeGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  bestTimeText: {
    fontSize: fontSize.sm,
    color: colors.gold,
  },
  timezoneCard: {
    marginHorizontal: spacing.base,
    marginTop: spacing.md,
  },
  timezoneGradient: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    padding: spacing.base,
  },
  timezoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  timezoneInfo: {
    flex: 1,
  },
  timezoneLabel: {
    fontSize: fontSize.xs,
    color: colors.text.tertiary,
  },
  timezoneValue: {
    fontSize: fontSize.base,
    color: colors.text.primary,
  },
  summaryCard: {
    marginHorizontal: spacing.base,
    marginTop: spacing.md,
  },
  summaryGradient: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(200,150,62,0.3)',
    position: 'relative',
    overflow: 'hidden',
  },
  summaryBorder: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
    backgroundColor: colors.gold,
  },
  summaryContent: {
    padding: spacing.base,
    paddingLeft: spacing.lg,
  },
  summaryLabel: {
    fontSize: fontSize.sm,
    color: colors.text.secondary,
    marginBottom: spacing.xs,
  },
  summaryValue: {
    fontSize: fontSize.md,
    fontWeight: '600',
    color: colors.gold,
    marginBottom: spacing.md,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginBottom: spacing.xs,
  },
  summaryDetail: {
    fontSize: fontSize.sm,
    color: colors.text.secondary,
  },
  bottomSpacing: {
    height: 100,
  },
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
  },
  bottomBarGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    paddingBottom: spacing.lg,
  },
  cancelButton: {
    paddingHorizontal: spacing.lg,
  },
  cancelButtonText: {
    fontSize: fontSize.base,
    color: colors.text.secondary,
  },
  scheduleButton: {
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  scheduleButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
  },
  scheduleButtonText: {
    fontSize: fontSize.base,
    color: '#FFF',
    fontWeight: '600',
  },
});
