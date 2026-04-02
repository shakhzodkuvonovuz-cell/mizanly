import { useState, useCallback, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Linking,
  Share,
  Platform,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Icon } from '@/components/ui/Icon';
import { GlassHeader } from '@/components/ui/GlassHeader';
import { Avatar } from '@/components/ui/Avatar';
import { VerifiedBadge } from '@/components/ui/VerifiedBadge';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import { ProgressiveImage } from '@/components/ui/ProgressiveImage';
import { colors, spacing, radius, fontSize, fonts } from '@/theme';
import { eventsApi } from '@/services/eventsApi';
import type { EventWithCounts, RsvpStatus as ApiRsvpStatus } from '@/types/events';
import type { User } from '@/types';
import { useTranslation } from '@/hooks/useTranslation';
import { useThemeColors } from '@/hooks/useThemeColors';
import { useContextualHaptic } from '@/hooks/useContextualHaptic';
import { ScreenErrorBoundary } from '@/components/ui/ScreenErrorBoundary';
import { BrandedRefreshControl } from '@/components/ui/BrandedRefreshControl';
import { showToast } from '@/components/ui/Toast';
import { rtlFlexRow, rtlTextAlign } from '@/utils/rtl';

type RsvpStatus = 'going' | 'maybe' | 'not-going' | null;

function toApiRsvpStatus(status: RsvpStatus): ApiRsvpStatus | null {
  if (status === 'going') return 'going';
  if (status === 'maybe') return 'maybe';
  if (status === 'not-going') return 'not_going';
  return null;
}

function formatEventDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString(undefined, {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

function formatEventTime(startStr: string, endStr?: string): string {
  const start = new Date(startStr);
  const startTime = start.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  if (!endStr) return startTime;
  const end = new Date(endStr);
  const endTime = end.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  return `${startTime} — ${endTime}`;
}

export default function EventDetailScreen() {
  const router = useRouter();
  const { t, isRTL } = useTranslation();
  const queryClient = useQueryClient();
  const { id } = useLocalSearchParams<{ id: string }>();
  const haptic = useContextualHaptic();
  const insets = useSafeAreaInsets();
  const isNavigatingRef = useRef(false);

  const [rsvpStatus, setRsvpStatus] = useState<RsvpStatus>(null);
  const [descExpanded, setDescExpanded] = useState(false);
  const tc = useThemeColors();

  // Fetch event details
  const {
    data: event,
    isLoading: eventLoading,
    isRefetching,
    refetch: refetchEvent,
    error: eventError,
  } = useQuery({
    queryKey: ['event', id],
    queryFn: async () => {
      if (!id) throw new Error('No event ID');
      const res = await eventsApi.getById(id);
      return res as EventWithCounts;
    },
    enabled: !!id,
  });

  // Initialize RSVP status from server data when event loads
  useEffect(() => {
    if (event?.myRsvp) {
      const statusMap: Record<string, RsvpStatus> = {
        going: 'going',
        maybe: 'maybe',
        not_going: 'not-going',
      };
      setRsvpStatus(statusMap[event.myRsvp] ?? null);
    }
  }, [event?.myRsvp]);

  // Fetch attendees
  const {
    data: attendeesData,
    refetch: refetchAttendees,
  } = useQuery({
    queryKey: ['event-attendees', id],
    queryFn: async () => {
      if (!id) return { data: [], meta: { hasMore: false } };
      const res = await eventsApi.listAttendees(id, undefined, 'going');
      return res as { data: User[]; meta: { hasMore: boolean } };
    },
    enabled: !!id,
  });

  const attendees = attendeesData?.data ?? [];

  // RSVP mutation with optimistic rollback
  const rsvpMutation = useMutation({
    mutationFn: async (status: RsvpStatus) => {
      if (!id) throw new Error('No event ID');
      const apiStatus = toApiRsvpStatus(status);
      if (!apiStatus) {
        await eventsApi.removeRsvp(id);
        return null;
      }
      const res = await eventsApi.rsvp(id, { status: apiStatus });
      return res;
    },
    onSuccess: () => {
      haptic.success();
      showToast({ message: t('events.rsvpUpdated'), variant: 'success' });
      queryClient.invalidateQueries({ queryKey: ['event', id] });
      queryClient.invalidateQueries({ queryKey: ['event-attendees', id] });
    },
    onError: (_err, _vars, context: { previousStatus: RsvpStatus } | undefined) => {
      haptic.error();
      showToast({ message: t('common.somethingWentWrong'), variant: 'error' });
      // Rollback optimistic update
      if (context) {
        setRsvpStatus(context.previousStatus);
      }
    },
    onMutate: (newStatus: RsvpStatus) => {
      const previousStatus = rsvpStatus;
      setRsvpStatus(newStatus);
      return { previousStatus };
    },
  });

  const handleRsvp = useCallback((status: RsvpStatus) => {
    if (rsvpMutation.isPending) return;
    rsvpMutation.mutate(status);
  }, [rsvpMutation]);

  const handleRefresh = useCallback(() => {
    refetchEvent();
    refetchAttendees();
  }, [refetchEvent, refetchAttendees]);

  const getRsvpButtonStyle = (status: RsvpStatus) => {
    const isSelected = rsvpStatus === status;
    switch (status) {
      case 'going':
        return isSelected
          ? { button: styles.rsvpButtonGoing, text: styles.rsvpButtonTextActive }
          : { button: styles.rsvpButtonOutline, text: styles.rsvpButtonText };
      case 'maybe':
        return isSelected
          ? { button: styles.rsvpButtonMaybe, text: styles.rsvpButtonTextActive }
          : { button: styles.rsvpButtonOutline, text: styles.rsvpButtonText };
      case 'not-going':
        return isSelected
          ? { button: styles.rsvpButtonNotGoing, text: styles.rsvpButtonText }
          : { button: styles.rsvpButtonOutline, text: styles.rsvpButtonText };
      default:
        return { button: styles.rsvpButtonOutline, text: styles.rsvpButtonText };
    }
  };

  // Loading skeleton
  if (eventLoading) {
    return (
      <ScreenErrorBoundary>
        <SafeAreaView style={[styles.container, { backgroundColor: tc.bg }]} edges={['top']}>
          <GlassHeader
            title={t('events.event')}
            showBack
            onBack={() => router.back()}
          />
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: spacing.base }}>
            <Skeleton.Rect width="100%" height={220} borderRadius={radius.lg} />
            <View style={{ marginTop: spacing.lg, gap: spacing.md }}>
              <Skeleton.Text width="70%" />
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                <Skeleton.Circle size={40} />
                <Skeleton.Text width="40%" />
              </View>
              <Skeleton.Rect width="100%" height={80} borderRadius={radius.lg} />
              <Skeleton.Rect width="100%" height={80} borderRadius={radius.lg} />
              <Skeleton.Rect width="100%" height={120} borderRadius={radius.lg} />
            </View>
          </ScrollView>
        </SafeAreaView>
      </ScreenErrorBoundary>
    );
  }

  // Error state
  if (eventError || !event) {
    return (
      <ScreenErrorBoundary>
        <SafeAreaView style={[styles.container, { backgroundColor: tc.bg }]} edges={['top']}>
          <GlassHeader
            title={t('events.event')}
            showBack
            onBack={() => router.back()}
          />
          <EmptyState
            icon="calendar"
            title={t('events.loadFailed')}
            subtitle={eventError instanceof Error ? eventError.message : t('events.tryAgain')}
            actionLabel={t('common.retry')}
            onAction={() => refetchEvent()}
          />
        </SafeAreaView>
      </ScreenErrorBoundary>
    );
  }

  const goingCount = (event as unknown as Record<string, unknown>).goingCount as number ?? event._count?.rsvps ?? 0;
  const maybeCount = (event as unknown as Record<string, unknown>).maybeCount as number ?? 0;
  const totalRsvps = event._count?.rsvps ?? 0;
  const remainingAttendees = Math.max(0, goingCount - attendees.length);
  const eventTypeBadge = event.eventType === 'virtual' ? t('events.virtual') :
    event.eventType === 'hybrid' ? t('events.hybrid') : t('events.inPerson');

  return (
    <ScreenErrorBoundary>
    <SafeAreaView style={[styles.container, { backgroundColor: tc.bg }]} edges={['top']}>
      <GlassHeader
        title={t('events.event')}
        showBack
        onBack={() => router.back()}
        rightAction={{ icon: 'share', onPress: () => {
          haptic.tick();
          Share.share({
            message: `${event.title} — ${formatEventDate(event.startDate)}${event.location ? ` at ${event.location}` : ''}`,
          });
        } }}
      />

      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<BrandedRefreshControl refreshing={isRefetching} onRefresh={handleRefresh} />}
      >
        {/* Cover Image Hero */}
        <Animated.View entering={FadeInUp.duration(400)}>
          <View style={styles.coverContainer}>
            {(event as unknown as Record<string, unknown>).coverImageUrl ? (
              <ProgressiveImage
                uri={(event as unknown as Record<string, unknown>).coverImageUrl as string}
                width="100%"
                height={220}
                borderRadius={radius.lg}
              />
            ) : (
              <View style={[styles.coverPlaceholder, { backgroundColor: tc.bgCard }]}>
                <Icon name="image" size={48} color={tc.text.tertiary} />
              </View>
            )}
            <LinearGradient
              colors={['transparent', tc.bg]}
              style={styles.coverGradient}
            />
            <View style={styles.eventBadge}>
              <LinearGradient
                colors={['rgba(45,53,72,0.6)', 'rgba(28,35,51,0.4)']}
                style={styles.badgeGradient}
              >
                <Text style={[styles.badgeText, { color: tc.text.primary }]}>{eventTypeBadge}</Text>
              </LinearGradient>
            </View>
          </View>
        </Animated.View>

        {/* Event Info */}
        <Animated.View entering={FadeInUp.delay(100).duration(400)} style={styles.infoContainer}>
          <Text style={[styles.eventTitle, { color: tc.text.primary }]}>{event.title}</Text>

          {/* Host Row */}
          <View style={[styles.hostRow, { flexDirection: rtlFlexRow(isRTL) }]}>
            <Avatar uri={event.user?.avatarUrl ?? null} name={event.user?.displayName ?? 'Host'} size="md" />
            <View style={styles.hostInfo}>
              <Text style={[styles.hostText, { color: tc.text.secondary }]}>
                {t('events.hostedBy')} <Text style={[styles.hostName, { color: tc.text.primary }]}>@{event.user?.username ?? 'unknown'}</Text>
              </Text>
            </View>
            {event.user?.isVerified && <VerifiedBadge size={13} />}
          </View>
        </Animated.View>

        {/* Date/Time Card */}
        <Animated.View entering={FadeInUp.delay(150).duration(400)} style={styles.cardContainer}>
          <LinearGradient
            colors={colors.gradient.cardDark}
            style={[styles.infoCard, { flexDirection: rtlFlexRow(isRTL) }]}
          >
            <LinearGradient
              colors={['rgba(200,150,62,0.3)', 'rgba(200,150,62,0.15)']}
              style={styles.iconBg}
            >
              <Icon name="calendar" size="sm" color={colors.gold} />
            </LinearGradient>
            <View style={styles.infoTextContainer}>
              <Text style={[styles.infoMain, { color: tc.text.primary }]}>{formatEventDate(event.startDate)}</Text>
              <Text style={[styles.infoSub, { color: tc.text.secondary }]}>{formatEventTime(event.startDate, event.endDate)}</Text>
            </View>
            <Pressable
              style={({ pressed }) => [styles.addToCalendar, { backgroundColor: tc.surface }, pressed && { opacity: 0.7 }]}
              onPress={() => {
                haptic.tick();
                if (Platform.OS === 'ios') {
                  Linking.openURL(`calshow:${new Date(event.startDate).getTime() / 1000}`);
                } else {
                  // Android: open calendar with intent
                  const startMs = new Date(event.startDate).getTime();
                  Linking.openURL(`content://com.android.calendar/time/${startMs}`);
                }
              }}
              accessibilityRole="button"
            >
              <Icon name="calendar" size="xs" color={colors.emerald} />
              <Text style={styles.addText}>{t('events.add')}</Text>
            </Pressable>
          </LinearGradient>
        </Animated.View>

        {/* Location Card */}
        {event.location && (
          <Animated.View entering={FadeInUp.delay(200).duration(400)} style={styles.cardContainer}>
            <LinearGradient
              colors={colors.gradient.cardDark}
              style={[styles.infoCard, { flexDirection: rtlFlexRow(isRTL) }]}
            >
              <LinearGradient
                colors={['rgba(10,123,79,0.2)', 'rgba(10,123,79,0.1)']}
                style={styles.iconBg}
              >
                <Icon name="map-pin" size="sm" color={colors.emerald} />
              </LinearGradient>
              <View style={styles.infoTextContainer}>
                <Text style={[styles.infoMain, { color: tc.text.primary }]}>{event.location}</Text>
              </View>
              <Pressable
                style={({ pressed }) => [styles.directionsButton, { backgroundColor: tc.surface }, pressed && { opacity: 0.7 }]}
                onPress={() => {
                  haptic.tick();
                  const query = encodeURIComponent(event.location ?? '');
                  Linking.openURL(`https://maps.google.com/?q=${query}`);
                }}
                accessibilityRole="button"
                accessibilityLabel={t('events.directions')}
              >
                <Icon name="map-pin" size="xs" color={tc.text.primary} />
              </Pressable>
            </LinearGradient>
          </Animated.View>
        )}

        {/* Description Card */}
        {event.description && (
          <Animated.View entering={FadeInUp.delay(250).duration(400)} style={styles.cardContainer}>
            <LinearGradient
              colors={colors.gradient.cardDark}
              style={styles.descriptionCard}
            >
              <Text style={[styles.descriptionText, { color: tc.text.secondary }]} numberOfLines={descExpanded ? undefined : 4}>{event.description}</Text>
              {!descExpanded && (
                <Pressable onPress={() => { setDescExpanded(true); haptic.tick(); }} accessibilityRole="button">
                  <Text style={styles.readMore}>{t('common.readMore')}</Text>
                </Pressable>
              )}
            </LinearGradient>
          </Animated.View>
        )}

        {/* RSVP Section */}
        <Animated.View entering={FadeInUp.delay(300).duration(400)} style={styles.cardContainer}>
          <LinearGradient
            colors={colors.gradient.cardDark}
            style={[styles.rsvpCard, { borderColor: colors.gold }]}
          >
            <Text style={[styles.rsvpLabel, { color: tc.text.primary }]}>{t('events.areYouGoing')}</Text>
            <View style={[styles.rsvpButtons, { flexDirection: rtlFlexRow(isRTL) }]}>
              {(['going', 'maybe', 'not-going'] as const).map((status) => {
                const styles_result = getRsvpButtonStyle(status);
                const isSelected = rsvpStatus === status;
                const label = status === 'going' ? t('events.going') : status === 'maybe' ? t('events.maybe') : t('events.cantGo');

                return (
                    <Pressable
                      accessibilityRole="button"
                      key={status}
                      style={[styles_result.button, !isSelected && { backgroundColor: tc.surface, borderColor: tc.border }]}
                      onPress={() => handleRsvp(status)}
                      disabled={rsvpMutation.isPending}
                    >
                      {isSelected && status === 'going' ? (
                        <LinearGradient
                          colors={[colors.emerald, colors.emeraldDark]}
                          style={styles.rsvpGradient}
                        >
                          <Icon name="check" size="xs" color={tc.text.primary} style={styles.rsvpCheck} />
                          <Text style={[styles.rsvpButtonTextActive, { color: '#fff' }]}>{label}</Text>
                        </LinearGradient>
                      ) : isSelected && status === 'maybe' ? (
                        <LinearGradient
                          colors={[colors.gold, colors.goldLight]}
                          style={styles.rsvpGradient}
                        >
                          <Icon name="check" size="xs" color={tc.text.primary} style={styles.rsvpCheck} />
                          <Text style={[styles.rsvpButtonTextActive, { color: '#fff' }]}>{label}</Text>
                        </LinearGradient>
                      ) : (
                        <View style={styles.rsvpInner}>
                          {isSelected && <Icon name="check" size="xs" color={tc.text.secondary} style={styles.rsvpCheck} />}
                          <Text style={[styles_result.text, { color: tc.text.secondary }]}>{label}</Text>
                        </View>
                      )}
                    </Pressable>

                );
              })}
            </View>
          </LinearGradient>
        </Animated.View>

        {/* Attendees Section */}
        <Animated.View entering={FadeInUp.delay(350).duration(400)} style={styles.cardContainer}>
          <LinearGradient
            colors={colors.gradient.cardDark}
            style={styles.attendeesCard}
          >
            <View style={[styles.attendeesHeader, { flexDirection: rtlFlexRow(isRTL) }]}>
              <LinearGradient
                colors={['rgba(10,123,79,0.2)', 'rgba(200,150,62,0.1)']}
                style={styles.smallIconBg}
              >
                <Icon name="users" size="xs" color={colors.emerald} />
              </LinearGradient>
              <Text style={[styles.attendeesTitle, { color: tc.text.primary }]}>{t('events.attendees')}</Text>
              <View style={styles.attendeesCount}>
                <Text style={[styles.countBadge, { color: tc.text.secondary }]}>
                  {goingCount} {t('events.going')} · {maybeCount} {t('events.maybe')}
                </Text>
              </View>
            </View>

            {attendees.length === 0 ? (
              <EmptyState
                icon="users"
                title={t('events.noAttendees')}
                subtitle={t('events.beFirst')}
              />
            ) : (
              <>
                <View style={[styles.avatarRow, { flexDirection: rtlFlexRow(isRTL) }]}>
                  {attendees.slice(0, 5).map((attendee, index) => (
                    <View
                      key={attendee.id}
                      style={[styles.avatarStack, { borderColor: tc.bg }, { marginStart: index > 0 ? -12 : 0 }]}
                    >
                      <Avatar uri={attendee.avatarUrl ?? null} name={attendee.displayName ?? attendee.username ?? ''} size="md" />
                    </View>
                  ))}
                  {remainingAttendees > 0 && (
                    <View style={[styles.moreAvatar, { borderColor: tc.bg, backgroundColor: tc.surface }]}>
                      <Text style={[styles.moreText, { color: tc.text.secondary }]}>+{remainingAttendees}</Text>
                    </View>
                  )}
                </View>

                <Pressable
                  style={({ pressed }) => [styles.seeAllButton, pressed && { opacity: 0.7 }]}
                  onPress={() => {
                    if (isNavigatingRef.current) return;
                    isNavigatingRef.current = true;
                    haptic.tick();
                    router.push(`/(screens)/event-attendees/${id}` as never);
                    setTimeout(() => { isNavigatingRef.current = false; }, 500);
                  }}
                  accessibilityRole="button"
                >
                  <Text style={[styles.seeAllText, { color: tc.text.secondary }]}>{t('events.seeAllAttendees')}</Text>
                  <Icon name="chevron-right" size="xs" color={tc.text.secondary} />
                </Pressable>
              </>
            )}
          </LinearGradient>
        </Animated.View>

        {/* Bottom Spacer */}
        <View style={styles.bottomSpacer} />
      </ScrollView>

      {/* Bottom Bar */}
      <Animated.View entering={FadeInUp.delay(100).duration(300)} style={[styles.bottomBar, { backgroundColor: tc.bg, borderTopColor: tc.border, paddingBottom: Math.max(insets.bottom, spacing.base), flexDirection: rtlFlexRow(isRTL) }]}>
        <Pressable
          style={({ pressed }) => [styles.shareEventButton, pressed && { opacity: 0.7 }]}
          onPress={() => {
            haptic.tick();
            Share.share({
              message: `${event.title} — ${formatEventDate(event.startDate)}${event.location ? ` at ${event.location}` : ''}`,
            });
          }}
          accessibilityRole="button"
        >
          <LinearGradient
            colors={['rgba(45,53,72,0.6)', 'rgba(28,35,51,0.4)']}
            style={styles.shareButtonInner}
          >
            <Icon name="share" size="sm" color={tc.text.primary} />
            <Text style={[styles.shareButtonText, { color: tc.text.primary }]}>{t('events.shareEvent')}</Text>
          </LinearGradient>
        </Pressable>

        <Pressable disabled={rsvpMutation.isPending} style={({ pressed }) => [pressed && { opacity: 0.7 }]}>
          <LinearGradient
            colors={[colors.emerald, colors.emeraldDark]}
            style={styles.rsvpConfirmButton}
          >
            <Text style={[styles.rsvpConfirmText, { color: tc.text.primary }]}>
              {t('events.rsvp')}: {rsvpStatus === 'going' ? t('events.going') : rsvpStatus === 'maybe' ? t('events.maybe') : rsvpStatus === 'not-going' ? t('events.cantGo') : t('events.respond')}
            </Text>
          </LinearGradient>
        </Pressable>
      </Animated.View>
    </SafeAreaView>
    </ScreenErrorBoundary>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.dark.bg,
  },
  shareButton: {
    padding: spacing.sm,
  },
  coverContainer: {
    height: 220,
    marginHorizontal: spacing.base,
    borderRadius: radius.lg,
    overflow: 'hidden',
    position: 'relative',
  },
  coverPlaceholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  coverGradient: {
    position: 'absolute',
    bottom: 0,
    start: 0,
    end: 0,
    height: 100,
  },
  eventBadge: {
    position: 'absolute',
    top: spacing.base,
    start: spacing.base,
  },
  badgeGradient: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  badgeText: {
    fontSize: fontSize.xs,
    fontFamily: fonts.semibold,
    color: colors.text.primary,
  },
  infoContainer: {
    paddingHorizontal: spacing.base,
    paddingTop: spacing.lg,
  },
  eventTitle: {
    fontSize: fontSize.xl,
    fontFamily: fonts.bold,
    color: colors.text.primary,
    marginBottom: spacing.md,
  },
  hostRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  hostInfo: {
    flex: 1,
  },
  hostText: {
    fontSize: fontSize.base,
    fontFamily: fonts.regular,
    color: colors.text.secondary,
  },
  hostName: {
    fontFamily: fonts.medium,
    color: colors.text.primary,
  },
  cardContainer: {
    paddingHorizontal: spacing.base,
    marginTop: spacing.md,
  },
  infoCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.base,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.active.white6,
  },
  iconBg: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  infoTextContainer: {
    flex: 1,
    marginStart: spacing.md,
  },
  infoMain: {
    fontSize: fontSize.base,
    fontFamily: fonts.semibold,
    color: colors.text.primary,
  },
  infoSub: {
    fontSize: fontSize.sm,
    fontFamily: fonts.regular,
    color: colors.text.secondary,
    marginTop: spacing.xs,
  },
  addToCalendar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
  },
  addText: {
    fontSize: fontSize.sm,
    fontFamily: fonts.medium,
    color: colors.emerald,
  },
  directionsButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
  },
  descriptionCard: {
    padding: spacing.base,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.active.white6,
  },
  descriptionText: {
    fontSize: fontSize.base,
    fontFamily: fonts.regular,
    color: colors.text.secondary,
    lineHeight: 22,
  },
  readMore: {
    fontSize: fontSize.sm,
    fontFamily: fonts.medium,
    color: colors.emerald,
    marginTop: spacing.sm,
  },
  rsvpCard: {
    padding: spacing.lg,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.gold,
  },
  rsvpLabel: {
    fontSize: fontSize.base,
    fontFamily: fonts.semibold,
    color: colors.text.primary,
    marginBottom: spacing.md,
  },
  rsvpButtons: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  rsvpButtonGoing: {
    flex: 1,
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  rsvpButtonMaybe: {
    flex: 1,
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  rsvpButtonNotGoing: {
    flex: 1,
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  rsvpButtonOutline: {
    flex: 1,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  rsvpGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.md,
    gap: spacing.xs,
  },
  rsvpInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.md,
    gap: spacing.xs,
  },
  rsvpButtonText: {
    fontSize: fontSize.sm,
    fontFamily: fonts.medium,
    color: colors.text.secondary,
  },
  rsvpButtonTextActive: {
    fontSize: fontSize.sm,
    fontFamily: fonts.semibold,
    color: colors.text.primary,
  },
  rsvpCheck: {
    marginEnd: spacing.xs,
  },
  attendeesCard: {
    padding: spacing.base,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.active.white6,
  },
  attendeesHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  smallIconBg: {
    width: 28,
    height: 28,
    borderRadius: radius.sm,
    justifyContent: 'center',
    alignItems: 'center',
  },
  attendeesTitle: {
    fontSize: fontSize.md,
    fontFamily: fonts.semibold,
    color: colors.text.primary,
  },
  attendeesCount: {
    marginStart: 'auto',
  },
  countBadge: {
    fontSize: fontSize.xs,
    fontFamily: fonts.medium,
    color: colors.text.secondary,
  },
  avatarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  avatarStack: {
    borderWidth: 2,
    borderRadius: radius.full,
  },
  moreAvatar: {
    width: 40,
    height: 40,
    borderRadius: radius.full,
    justifyContent: 'center',
    alignItems: 'center',
    marginStart: -12,
    borderWidth: 2,
  },
  moreText: {
    fontSize: fontSize.xs,
    fontFamily: fonts.medium,
    color: colors.text.secondary,
  },
  seeAllButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
  },
  seeAllText: {
    fontSize: fontSize.sm,
    fontFamily: fonts.medium,
    color: colors.text.secondary,
  },
  bottomSpacer: {
    height: 100,
  },
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    start: 0,
    end: 0,
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: spacing.base,
    borderTopWidth: 1,
  },
  shareEventButton: {
    borderRadius: radius.full,
    overflow: 'hidden',
  },
  shareButtonInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radius.full,
  },
  shareButtonText: {
    fontSize: fontSize.base,
    fontFamily: fonts.medium,
    color: colors.text.primary,
  },
  rsvpConfirmButton: {
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
  },
  rsvpConfirmText: {
    fontSize: fontSize.base,
    fontFamily: fonts.semibold,
    color: colors.text.primary,
  },
});
