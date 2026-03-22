import { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Dimensions, ActivityIndicator } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { Icon } from '@/components/ui/Icon';
import { GlassHeader } from '@/components/ui/GlassHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { colors, spacing, radius, fontSize, fonts } from '@/theme';
import { ScreenErrorBoundary } from '@/components/ui/ScreenErrorBoundary';
import { useTranslation } from '@/hooks/useTranslation';
import { useContextualHaptic } from '@/hooks/useContextualHaptic';
import { useThemeColors } from '@/hooks/useThemeColors';
import { postsApi, threadsApi, reelsApi } from '@/services/api';
import { showToast } from '@/components/ui/Toast';

const { width: screenWidth } = Dimensions.get('window');

type SpaceType = 'Saf' | 'Majlis' | 'Bakra';
type AmPm = 'AM' | 'PM';

export default function SchedulePostScreen() {
  const tc = useThemeColors();
  const styles = createStyles(tc);
  const { t, isRTL } = useTranslation();
  const router = useRouter();
  const haptic = useContextualHaptic();
  const params = useLocalSearchParams<{ space?: string; content?: string; mediaUrls?: string }>();
  const now = new Date();
  const [selectedDate, setSelectedDate] = useState(now.getDate() + 2);
  const [currentMonth, setCurrentMonth] = useState(now.getMonth());
  const [currentYear, setCurrentYear] = useState(now.getFullYear());
  const [selectedHour, setSelectedHour] = useState(6);
  const [selectedMinute, setSelectedMinute] = useState(0);
  const [selectedAmPm, setSelectedAmPm] = useState<AmPm>('PM');
  const [isScheduling, setIsScheduling] = useState(false);

  const today = now.getDate();

  const postData = {
    content: params.content || '',
    hasMedia: !!params.mediaUrls,
    space: (params.space || 'Saf') as SpaceType,
  };

  const monthNames = Array.from({ length: 12 }, (_, i) =>
    new Date(2024, i, 1).toLocaleDateString(undefined, { month: 'long' })
  );

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
      if (newMonth > 11) { newMonth = 0; setCurrentYear(y => y + 1); }
      if (newMonth < 0) { newMonth = 11; setCurrentYear(y => y - 1); }
      return newMonth;
    });
  };

  const getNextWeekend = () => {
    const d = new Date();
    const daysUntilSat = (6 - d.getDay() + 7) % 7 || 7;
    d.setDate(d.getDate() + daysUntilSat);
    return d.getDate();
  };
  const getNextWeek = () => {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    return d.getDate();
  };
  const quickDates = [
    { label: t('common.tomorrow'), day: new Date(now.getTime() + 86400000).getDate() },
    { label: t('screens.schedule-post.thisWeekend'), day: getNextWeekend() },
    { label: t('screens.schedule-post.nextWeek'), day: getNextWeek() },
  ];

  const hours = Array.from({ length: 12 }, (_, i) => i + 1);
  const minutes = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55];

  // Note: Backend auto-publisher not yet implemented — scheduled posts require a BullMQ cron job
  // TODO [cross-scope]: Backend create DTOs may not validate scheduledAt field — verify in posts/threads/reels DTOs
  const handleSchedule = async () => {
    setIsScheduling(true);
    haptic.send();

    try {
      // Build the scheduled timestamp
      const hour24 = selectedAmPm === 'PM' && selectedHour !== 12
        ? selectedHour + 12
        : selectedAmPm === 'AM' && selectedHour === 12 ? 0 : selectedHour;
      const scheduledAt = new Date(currentYear, currentMonth, selectedDate, hour24, selectedMinute);

      if (scheduledAt <= new Date()) {
        showToast({ message: t('screens.schedule-post.mustBeFuture'), variant: 'error' });
        setIsScheduling(false);
        return;
      }

      let mediaUrls: string[] = [];
      try { mediaUrls = params.mediaUrls ? JSON.parse(params.mediaUrls) : []; } catch { /* malformed param */ }
      const space = postData.space;

      // Call the appropriate API based on the content space
      if (space === 'Saf') {
        await postsApi.create({
          postType: mediaUrls.length > 0 ? 'IMAGE' : 'TEXT',
          content: postData.content,
          mediaUrls,
          scheduledAt: scheduledAt.toISOString(),
        });
      } else if (space === 'Majlis') {
        await threadsApi.create({
          content: postData.content,
          scheduledAt: scheduledAt.toISOString(),
        });
      } else if (space === 'Bakra') {
        await reelsApi.create({
          videoUrl: mediaUrls[0] || '',
          duration: 0, // Will be set by the video processing pipeline
          caption: postData.content,
          scheduledAt: scheduledAt.toISOString(),
        });
      }

      haptic.success();
      showToast({ message: t('screens.schedule-post.scheduled'), variant: 'success' });
      router.back();
    } catch (err) {
      const message = err instanceof Error ? err.message : t('common.somethingWentWrong');
      showToast({ message, variant: 'error' });
    } finally {
      setIsScheduling(false);
    }
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
      <GlassHeader title={t('screens.schedule-post.title')} showBackButton />

      <ScrollView
        showsVerticalScrollIndicator={false}
      >
        {/* Post Preview Card */}
        <Animated.View entering={FadeInUp.delay(50).duration(400)}>
          <View style={styles.previewCard}>
            <LinearGradient
              colors={colors.gradient.cardDark}
              style={styles.previewGradient}
            >
              {/* User Info */}
              <View style={styles.userRow}>
                <View style={styles.avatarPlaceholder}>
                  <Icon name="user" size="md" color={tc.text.tertiary} />
                </View>
                <View style={styles.userInfo}>
                  <Text style={styles.userName}>{t('screens.schedule-post.yourName')}</Text>
                  <Text style={styles.userHandle}>@username</Text>
                </View>
                <View style={styles.draftBadge}>
                  <LinearGradient
                    colors={['rgba(10,123,79,0.3)', 'rgba(10,123,79,0.1)']}
                    style={styles.draftBadgeGradient}
                  >
                    <Icon name="check" size="xs" color={colors.emerald} />
                    <Text style={styles.draftBadgeText}>{t('screens.schedule-post.draftSaved')}</Text>
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
                    <Icon name="image" size="xs" color={tc.text.tertiary} />
                  </View>
                )}
                <View style={styles.spaceBadge}>
                  <LinearGradient
                    colors={['rgba(45,53,72,0.6)', 'rgba(28,35,51,0.4)']}
                    style={styles.spaceBadgeGradient}
                  >
                    <Text style={styles.spaceBadgeText}>{postData.space} {t('screens.schedule-post.post')}</Text>
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
              colors={colors.gradient.cardDark}
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
                  <Pressable accessibilityRole="button" accessibilityLabel={t('screens.schedule-post.previousMonth')} onPress={() => changeMonth(-1)}>
                    <Icon name="chevron-left" size="md" color={tc.text.secondary} />
                  </Pressable>
                  <Text style={styles.monthText}>{monthNames[currentMonth]} {currentYear}</Text>
                  <Pressable accessibilityRole="button" accessibilityLabel={t('screens.schedule-post.nextMonth')} onPress={() => changeMonth(1)}>
                    <Icon name="chevron-right" size="md" color={tc.text.secondary} />
                  </Pressable>
                </View>
              </View>

              {/* Weekday Headers */}
              <View style={styles.weekdayRow}>
                {Array.from({ length: 7 }, (_, i) => {
                // 2023-12-31 is a Sunday; offset by i to get Sun-Sat
                const d = new Date(2023, 11, 31 + i);
                return d.toLocaleDateString(undefined, { weekday: 'narrow' });
              }).map((day, i) => (
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
                  const isToday = day === today && currentMonth === now.getMonth() && currentYear === now.getFullYear();
                  const isSelected = day === selectedDate;
                  const isPast = (currentYear < now.getFullYear()) || (currentYear === now.getFullYear() && currentMonth < now.getMonth()) || (currentYear === now.getFullYear() && currentMonth === now.getMonth() && day < today);

                  return (
                      <Pressable accessibilityRole="button"
                        accessibilityLabel={`${day}`}
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
                      </Pressable>
                  
                  );
                })}
              </View>

              {/* Quick Date Buttons */}
              <View style={styles.quickDates}>
                {quickDates.map((quick) => (
                  <Pressable accessibilityRole="button"
                    accessibilityLabel={quick.label}
                    key={quick.label}
                    style={styles.quickDateButton}
                    onPress={() => setSelectedDate(quick.day)}
                  >
                    <LinearGradient
                      colors={selectedDate === quick.day
                        ? ['rgba(10,123,79,0.4)', 'rgba(10,123,79,0.2)']
                        : colors.gradient.cardDark
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
                  </Pressable>
                ))}
              </View>
            </LinearGradient>
          </View>
        </Animated.View>

        {/* Time Picker Section */}
        <Animated.View entering={FadeInUp.delay(150).duration(400)}>
          <View style={styles.timeCard}>
            <LinearGradient
              colors={colors.gradient.cardDark}
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
                <Text style={styles.timeTitle}>{t('screens.schedule-post.time')}</Text>
              </View>

              {/* Hour Selector */}
              <Text style={styles.timeLabel}>{t('screens.schedule-live.hour')}</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.hourScroll}>
                {hours.map((hour) => (
                  <Pressable accessibilityRole="button"
                    accessibilityLabel={`${t('screens.schedule-live.hour')} ${hour}`}
                    key={hour}
                    style={styles.timeOptionButton}
                    onPress={() => setSelectedHour(hour)}
                  >
                    <LinearGradient
                      colors={selectedHour === hour
                        ? ['rgba(10,123,79,0.4)', 'rgba(10,123,79,0.2)']
                        : colors.gradient.cardDark
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
                  </Pressable>
                ))}
              </ScrollView>

              {/* Minute Selector */}
              <Text style={styles.timeLabel}>{t('screens.schedule-live.minute')}</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.minuteScroll}>
                {minutes.map((minute) => (
                  <Pressable accessibilityRole="button"
                    accessibilityLabel={`${t('screens.schedule-live.minute')} ${minute.toString().padStart(2, '0')}`}
                    key={minute}
                    style={styles.timeOptionButton}
                    onPress={() => setSelectedMinute(minute)}
                  >
                    <LinearGradient
                      colors={selectedMinute === minute
                        ? ['rgba(10,123,79,0.4)', 'rgba(10,123,79,0.2)']
                        : colors.gradient.cardDark
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
                  </Pressable>
                ))}
              </ScrollView>

              {/* AM/PM Toggle */}
              <View style={styles.ampmContainer}>
                {(['AM', 'PM'] as AmPm[]).map((ampm) => (
                  <Pressable accessibilityRole="button"
                    accessibilityLabel={ampm}
                    key={ampm}
                    style={styles.ampmButton}
                    onPress={() => setSelectedAmPm(ampm)}
                  >
                    <LinearGradient
                      colors={selectedAmPm === ampm
                        ? ['rgba(10,123,79,0.4)', 'rgba(10,123,79,0.2)']
                        : colors.gradient.cardDark
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
                  </Pressable>
                ))}
              </View>

              {/* Best Time Suggestion */}
              <View style={styles.bestTimeContainer}>
                <LinearGradient
                  colors={['rgba(200,150,62,0.15)', 'rgba(200,150,62,0.05)']}
                  style={styles.bestTimeGradient}
                >
                  <Icon name="trending-up" size="sm" color={colors.gold} />
                  <Text style={styles.bestTimeText}>{t('screens.schedule-post.bestTimeTip', 'Check Creator Studio for best posting times')}</Text>
                </LinearGradient>
              </View>
            </LinearGradient>
          </View>
        </Animated.View>

        {/* Timezone Card */}
        <Animated.View entering={FadeInUp.delay(200).duration(400)}>
          <View style={styles.timezoneCard}>
            <LinearGradient
              colors={colors.gradient.cardDark}
              style={styles.timezoneGradient}
            >
              <View style={styles.timezoneRow}>
                <Icon name="globe" size="sm" color={tc.text.secondary} />
                <View style={styles.timezoneInfo}>
                  <Text style={styles.timezoneLabel}>{t('screens.schedule-post.timezone')}</Text>
                  <Text style={styles.timezoneValue}>{`UTC${-(new Date().getTimezoneOffset() / 60) >= 0 ? '+' : ''}${-(new Date().getTimezoneOffset() / 60)} (${Intl.DateTimeFormat().resolvedOptions().timeZone})`}</Text>
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
                <Text style={styles.summaryLabel}>{t('screens.schedule-post.scheduledFor')}</Text>
                <Text style={styles.summaryValue}>{formatScheduledTime()}</Text>

                <View style={styles.summaryRow}>
                  <Icon name="share" size="xs" color={tc.text.secondary} />
                  <Text style={styles.summaryDetail}>{t('screens.schedule-post.willPostTo', { space: postData.space })}</Text>
                </View>

                <View style={styles.summaryRow}>
                  <Icon name="bell" size="xs" color={tc.text.secondary} />
                  <Text style={styles.summaryDetail}>{t('screens.schedule-post.reminderNote')}</Text>
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
          <Pressable accessibilityRole="button" accessibilityLabel={t('common.cancel')} style={styles.cancelButton} onPress={() => router.back()}>
            <Text style={styles.cancelButtonText}>{t('common.cancel')}</Text>
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel={t('screens.schedule-post.schedule')} style={styles.scheduleButton} onPress={handleSchedule} disabled={isScheduling}>
            <LinearGradient
              colors={['rgba(10,123,79,0.9)', 'rgba(6,107,66,0.95)']}
              style={styles.scheduleButtonGradient}
            >
              {isScheduling ? (
                <ActivityIndicator size="small" color="#FFF" />
              ) : (
                <>
                  <Icon name="calendar" size="sm" color="#FFF" />
                  <Text style={styles.scheduleButtonText}>{t('screens.schedule-post.schedule')}</Text>
                </>
              )}
            </LinearGradient>
          </Pressable>
        </LinearGradient>
      </View>
    </SafeAreaView>
    </ScreenErrorBoundary>
  );
}

const createStyles = (tc: ReturnType<typeof useThemeColors>) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: tc.bg,
  },
  previewCard: {
    marginHorizontal: spacing.base,
    marginTop: spacing.md,
  },
  previewGradient: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.active.white6,
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
    backgroundColor: tc.surface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  userInfo: {
    flex: 1,
  },
  userName: {
    fontSize: fontSize.base,
    fontFamily: fonts.bodySemiBold,
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
    backgroundColor: tc.surface,
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
    borderColor: colors.active.white6,
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
    fontFamily: fonts.bodySemiBold,
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
    fontFamily: fonts.bodyMedium,
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
    fontFamily: fonts.bodySemiBold,
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
    fontFamily: fonts.bodySemiBold,
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
    fontFamily: fonts.bodySemiBold,
  },
  timeCard: {
    marginHorizontal: spacing.base,
    marginTop: spacing.md,
  },
  timeGradient: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.active.white6,
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
    fontFamily: fonts.bodySemiBold,
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
    fontFamily: fonts.body, // TODO [cross-scope]: fonts.mono maps to DMSans (not monospace) — fix in theme/index.ts
  },
  timeOptionTextActive: {
    color: colors.emerald,
    fontFamily: fonts.bodySemiBold,
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
    fontFamily: fonts.bodySemiBold,
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
    borderColor: colors.active.white6,
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
    borderColor: colors.active.gold30,
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
    fontFamily: fonts.bodySemiBold,
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
    fontFamily: fonts.bodySemiBold,
  },
});
