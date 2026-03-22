import { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Dimensions,
  Linking,
  Share,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Icon } from '@/components/ui/Icon';
import { GlassHeader } from '@/components/ui/GlassHeader';
import { Avatar } from '@/components/ui/Avatar';
import { VerifiedBadge } from '@/components/ui/VerifiedBadge';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import { colors, spacing, radius, fontSize, fonts } from '@/theme';
import { eventsApi } from '@/services/eventsApi';
import type { EventWithCounts, RsvpStatus as ApiRsvpStatus } from '@/types/events';
import type { User } from '@/types';
import { useTranslation } from '@/hooks/useTranslation';
import { useThemeColors } from '@/hooks/useThemeColors';
import { ScreenErrorBoundary } from '@/components/ui/ScreenErrorBoundary';
import { BrandedRefreshControl } from '@/components/ui/BrandedRefreshControl';

const { width } = Dimensions.get('window');

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
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { id } = useLocalSearchParams<{ id: string }>();

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

  // RSVP mutation
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
      queryClient.invalidateQueries({ queryKey: ['event', id] });
      queryClient.invalidateQueries({ queryKey: ['event-attendees', id] });
    },
  });

  const handleRsvp = useCallback((status: RsvpStatus) => {
    setRsvpStatus(status);
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

  const goingCount = (event as Record<string, unknown>).goingCount as number ?? event._count?.rsvps ?? 0;
  const maybeCount = (event as Record<string, unknown>).maybeCount as number ?? 0;
  const totalRsvps = event._count?.rsvps ?? 0;
  const remainingAttendees = Math.max(0, goingCount - attendees.length);
  const eventTypeBadge = event.eventType === 'virtual' ? t('events.virtual') :
    event.eventType === 'hybrid' ? t('events.hybrid') : t('events.inPerson');

  return (
    <ScreenErrorBoundary>
    <SafeAreaView style={[styles.container, { backgroundColor: tc.bg }]} edges={['top']}>
      <GlassHeader
        title={t('events.event')}
        onBack={() => router.back()}
        rightAction={{ icon: 'share', onPress: () => {
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
            <View style={[styles.coverPlaceholder, { backgroundColor: tc.bgCard }]}>
              <Icon name="image" size={48} color={colors.text.tertiary} />
            </View>
            <LinearGradient
              colors={['transparent', tc.bg]}
              style={styles.coverGradient}
            />
            <View style={styles.eventBadge}>
              <LinearGradient
                colors={['rgba(45,53,72,0.6)', 'rgba(28,35,51,0.4)']}
                style={styles.badgeGradient}
              >
                <Text style={styles.badgeText}>{eventTypeBadge}</Text>
              </LinearGradient>
            </View>
          </View>
        </Animated.View>

        {/* Event Info */}
        <Animated.View entering={FadeInUp.delay(100).duration(400)} style={styles.infoContainer}>
          <Text style={styles.eventTitle}>{event.title}</Text>

          {/* Host Row */}
          <View style={styles.hostRow}>
            <Avatar uri={event.user?.avatarUrl ?? null} name={event.user?.displayName ?? 'Host'} size="md" />
            <View style={styles.hostInfo}>
              <Text style={styles.hostText}>
                {t('events.hostedBy')} <Text style={styles.hostName}>@{event.user?.username ?? 'unknown'}</Text>
              </Text>
            </View>
            {event.user?.isVerified && <VerifiedBadge size={13} />}
          </View>
        </Animated.View>

        {/* Date/Time Card */}
        <Animated.View entering={FadeInUp.delay(150).duration(400)} style={styles.cardContainer}>
          <LinearGradient
            colors={colors.gradient.cardDark}
            style={styles.infoCard}
          >
            <LinearGradient
              colors={['rgba(200,150,62,0.3)', 'rgba(200,150,62,0.15)']}
              style={styles.iconBg}
            >
              <Icon name="calendar" size="sm" color={colors.gold} />
            </LinearGradient>
            <View style={styles.infoTextContainer}>
              <Text style={styles.infoMain}>{formatEventDate(event.startDate)}</Text>
              <Text style={styles.infoSub}>{formatEventTime(event.startDate, event.endDate)}</Text>
            </View>
            <Pressable
              style={[styles.addToCalendar, { backgroundColor: tc.surface }]}
              onPress={() => {
                // Open device calendar with event details
                const startDate = new Date(event.startDate).toISOString();
                Linking.openURL(`calshow:${new Date(event.startDate).getTime() / 1000}`);
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
              style={styles.infoCard}
            >
              <LinearGradient
                colors={['rgba(10,123,79,0.2)', 'rgba(10,123,79,0.1)']}
                style={styles.iconBg}
              >
                <Icon name="map-pin" size="sm" color={colors.emerald} />
              </LinearGradient>
              <View style={styles.infoTextContainer}>
                <Text style={styles.infoMain}>{event.location}</Text>
              </View>
              <Pressable
                style={[styles.directionsButton, { backgroundColor: tc.surface }]}
                onPress={() => {
                  const query = encodeURIComponent(event.location ?? '');
                  Linking.openURL(`https://maps.google.com/?q=${query}`);
                }}
                accessibilityRole="button"
                accessibilityLabel={t('events.directions')}
              >
                <Icon name="map-pin" size="xs" color={colors.text.primary} />
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
              <Text style={styles.descriptionText} numberOfLines={descExpanded ? undefined : 4}>{event.description}</Text>
              {!descExpanded && (
                <Pressable onPress={() => setDescExpanded(true)} accessibilityRole="button">
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
            <Text style={styles.rsvpLabel}>{t('events.areYouGoing')}</Text>
            <View style={styles.rsvpButtons}>
              {(['going', 'maybe', 'not-going'] as const).map((status) => {
                const styles_result = getRsvpButtonStyle(status);
                const isSelected = rsvpStatus === status;
                const label = status === 'going' ? t('events.going') : status === 'maybe' ? t('events.maybe') : t('events.cantGo');

                return (
                    <Pressable
                      accessibilityRole="button"
                      key={status}
                      style={styles_result.button}
                      onPress={() => handleRsvp(status)}

                      disabled={rsvpMutation.isPending}
                    >
                      {isSelected && status === 'going' ? (
                        <LinearGradient
                          colors={[colors.emerald, colors.emeraldDark]}
                          style={styles.rsvpGradient}
                        >
                          <Icon name="check" size="xs" color={colors.text.primary} style={styles.rsvpCheck} />
                          <Text style={styles.rsvpButtonTextActive}>{label}</Text>
                        </LinearGradient>
                      ) : isSelected && status === 'maybe' ? (
                        <LinearGradient
                          colors={[colors.gold, colors.goldLight]}
                          style={styles.rsvpGradient}
                        >
                          <Icon name="check" size="xs" color={colors.text.primary} style={styles.rsvpCheck} />
                          <Text style={styles.rsvpButtonTextActive}>{label}</Text>
                        </LinearGradient>
                      ) : (
                        <View style={styles.rsvpInner}>
                          {isSelected && <Icon name="check" size="xs" color={colors.text.secondary} style={styles.rsvpCheck} />}
                          <Text style={styles_result.text}>{label}</Text>
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
            <View style={styles.attendeesHeader}>
              <LinearGradient
                colors={['rgba(10,123,79,0.2)', 'rgba(200,150,62,0.1)']}
                style={styles.smallIconBg}
              >
                <Icon name="users" size="xs" color={colors.emerald} />
              </LinearGradient>
              <Text style={styles.attendeesTitle}>{t('events.attendees')}</Text>
              <View style={styles.attendeesCount}>
                <Text style={styles.countBadge}>
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
                <View style={styles.avatarRow}>
                  {attendees.slice(0, 5).map((attendee, index) => (
                    <View
                      key={attendee.id}
                      style={[styles.avatarStack, { borderColor: tc.bg }, { marginLeft: index > 0 ? -12 : 0 }]}
                    >
                      <Avatar uri={attendee.avatarUrl ?? null} name={attendee.displayName ?? attendee.username ?? ''} size="md" />
                    </View>
                  ))}
                  {remainingAttendees > 0 && (
                    <View style={[styles.moreAvatar, { borderColor: tc.bg, backgroundColor: tc.surface }]}>
                      <Text style={styles.moreText}>+{remainingAttendees}</Text>
                    </View>
                  )}
                </View>

                <Pressable
                  style={styles.seeAllButton}
                  onPress={() => router.push(`/(screens)/event-attendees/${id}` as never)}
                  accessibilityRole="button"
                >
                  <Text style={styles.seeAllText}>{t('events.seeAllAttendees')}</Text>
                  <Icon name="chevron-right" size="xs" color={colors.text.secondary} />
                </Pressable>
              </>
            )}
          </LinearGradient>
        </Animated.View>

        {/* Bottom Spacer */}
        <View style={styles.bottomSpacer} />
      </ScrollView>

      {/* Bottom Bar */}
      <View style={[styles.bottomBar, { backgroundColor: tc.bg, borderTopColor: tc.border }]}>
        <Pressable
          style={styles.shareEventButton}
          onPress={() => {
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
            <Icon name="share" size="sm" color={colors.text.primary} />
            <Text style={styles.shareButtonText}>{t('events.shareEvent')}</Text>
          </LinearGradient>
        </Pressable>

        <Pressable disabled={rsvpMutation.isPending}>
          <LinearGradient
            colors={[colors.emerald, colors.emeraldDark]}
            style={styles.rsvpConfirmButton}
          >
            <Text style={styles.rsvpConfirmText}>
              {t('events.rsvp')}: {rsvpStatus === 'going' ? t('events.going') : rsvpStatus === 'maybe' ? t('events.maybe') : rsvpStatus === 'not-going' ? t('events.cantGo') : t('events.respond')}
            </Text>
          </LinearGradient>
        </Pressable>
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
    backgroundColor: colors.dark.bgCard,
    justifyContent: 'center',
    alignItems: 'center',
  },
  coverGradient: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 100,
  },
  eventBadge: {
    position: 'absolute',
    top: spacing.base,
    left: spacing.base,
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
    marginLeft: spacing.md,
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
    backgroundColor: colors.dark.surface,
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
    backgroundColor: colors.dark.surface,
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
    backgroundColor: colors.dark.surface,
  },
  rsvpButtonOutline: {
    flex: 1,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.dark.borderLight,
    backgroundColor: colors.dark.surface,
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
    marginRight: spacing.xs,
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
    marginLeft: 'auto',
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
    borderColor: colors.dark.bg,
    borderRadius: radius.full,
  },
  moreAvatar: {
    width: 40,
    height: 40,
    borderRadius: radius.full,
    backgroundColor: colors.dark.surface,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: -12,
    borderWidth: 2,
    borderColor: colors.dark.bg,
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
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: spacing.base,
    backgroundColor: colors.dark.bg,
    borderTopWidth: 1,
    borderTopColor: colors.dark.border,
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
