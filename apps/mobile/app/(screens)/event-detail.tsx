import { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  Dimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { Icon } from '@/components/ui/Icon';
import { GlassHeader } from '@/components/ui/GlassHeader';
import { Avatar } from '@/components/ui/Avatar';
import { VerifiedBadge } from '@/components/ui/VerifiedBadge';
import { EmptyState } from '@/components/ui/EmptyState';
import { colors, spacing, radius, fontSize, fonts } from '@/theme';
import { eventsApi } from '@/services/eventsApi';
import type { EventWithCounts, RsvpStatus as ApiRsvpStatus } from '@/types/events';
import { Skeleton } from '@/components/ui/Skeleton';
import { Alert } from 'react-native';
import { useLocalSearchParams } from 'expo-router';

const { width } = Dimensions.get('window');

type RsvpStatus = 'going' | 'maybe' | 'not-going' | null;

interface Attendee {
  id: string;
  name: string;
  avatar: string | null;
}

interface Comment {
  id: string;
  author: string;
  avatar: string | null;
  text: string;
  time: string;
}

const MOCK_ATTENDEES: Attendee[] = []; // TODO: fetch attendees from API

const MOCK_COMMENTS: Comment[] = [
  {
    id: '1',
    author: 'Sarah M.',
    avatar: null,
    text: 'Looking forward to it! Will bring some dates.',
    time: '2h ago',
  },
  {
    id: '2',
    author: 'Yusuf A.',
    avatar: null,
    text: 'Is there parking available nearby?',
    time: '4h ago',
  },
  {
    id: '3',
    author: 'Noor H.',
    avatar: null,
    text: 'Can\'t wait to see everyone there!',
    time: '5h ago',
  },
];

export default function EventDetailScreen() {
  const router = useRouter();
  const [rsvpStatus, setRsvpStatus] = useState<RsvpStatus>('going');
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [event, setEvent] = useState<EventWithCounts | null>(null);
  const [attendees, setAttendees] = useState<Attendee[]>([]);
  const [comments, setComments] = useState<Comment[]>([]);
  const { id } = useLocalSearchParams<{ id: string }>();

  const fetchEvent = useCallback(async () => {
    if (!id) return;
    try {
      setError(null);
      const response = await eventsApi.getById(id as string);
      setEvent(response.data);
      // TODO: fetch attendees and comments
    } catch (err: any) {
      setError(err.message || 'Failed to load event');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [id]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchEvent();
  }, [fetchEvent]);

  useEffect(() => {
    if (id) {
      fetchEvent();
    }
  }, [id, fetchEvent]);

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

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <GlassHeader
        title="Event"
        onBack={() => router.back()}
        rightAction={
          <TouchableOpacity style={styles.shareButton} activeOpacity={0.8}>
            <Icon name="share" size="sm" color={colors.text.primary} />
          </TouchableOpacity>
        }
      />

      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl tintColor={colors.emerald} refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {/* Cover Image Hero */}
        <Animated.View entering={FadeInUp.duration(400)}>
          <View style={styles.coverContainer}>
            <View style={styles.coverPlaceholder}>
              <Icon name="image" size={48} color={colors.text.tertiary} />
            </View>
            <LinearGradient
              colors={['transparent', colors.dark.bg]}
              style={styles.coverGradient}
            />
            <View style={styles.eventBadge}>
              <LinearGradient
                colors={['rgba(45,53,72,0.6)', 'rgba(28,35,51,0.4)']}
                style={styles.badgeGradient}
              >
                <Text style={styles.badgeText}>In-Person</Text>
              </LinearGradient>
            </View>
          </View>
        </Animated.View>

        {/* Event Info */}
        <Animated.View entering={FadeInUp.delay(100).duration(400)} style={styles.infoContainer}>
          <Text style={styles.eventTitle}>Community Iftar Gathering</Text>

          {/* Host Row */}
          <View style={styles.hostRow}>
            <Avatar uri={null} name="ICC" size="md" />
            <View style={styles.hostInfo}>
              <Text style={styles.hostText}>
                Hosted by <Text style={styles.hostName}>@icc_riyadh</Text>
              </Text>
            </View>
            <VerifiedBadge size={13} />
          </View>
        </Animated.View>

        {/* Date/Time Card */}
        <Animated.View entering={FadeInUp.delay(150).duration(400)} style={styles.cardContainer}>
          <LinearGradient
            colors={['rgba(45,53,72,0.4)', 'rgba(28,35,51,0.2)']}
            style={styles.infoCard}
          >
            <LinearGradient
              colors={['rgba(200,150,62,0.3)', 'rgba(200,150,62,0.15)']}
              style={styles.iconBg}
            >
              <Icon name="calendar" size="sm" color={colors.gold} />
            </LinearGradient>
            <View style={styles.infoTextContainer}>
              <Text style={styles.infoMain}>Saturday, March 20, 2026</Text>
              <Text style={styles.infoSub}>7:00 PM — 9:00 PM (AST)</Text>
            </View>
            <TouchableOpacity style={styles.addToCalendar} activeOpacity={0.8}>
              <Icon name="calendar" size="xs" color={colors.emerald} />
              <Text style={styles.addText}>Add</Text>
            </TouchableOpacity>
          </LinearGradient>
        </Animated.View>

        {/* Location Card */}
        <Animated.View entering={FadeInUp.delay(200).duration(400)} style={styles.cardContainer}>
          <LinearGradient
            colors={['rgba(45,53,72,0.4)', 'rgba(28,35,51,0.2)']}
            style={styles.infoCard}
          >
            <LinearGradient
              colors={['rgba(10,123,79,0.2)', 'rgba(10,123,79,0.1)']}
              style={styles.iconBg}
            >
              <Icon name="map-pin" size="sm" color={colors.emerald} />
            </LinearGradient>
            <View style={styles.infoTextContainer}>
              <Text style={styles.infoMain}>Islamic Community Center</Text>
              <Text style={styles.infoSub}>123 Main Street, Riyadh</Text>
            </View>
            <TouchableOpacity style={styles.directionsButton} activeOpacity={0.8}>
              <Icon name="map-pin" size="xs" color={colors.text.primary} />
            </TouchableOpacity>
          </LinearGradient>
        </Animated.View>

        {/* Description Card */}
        <Animated.View entering={FadeInUp.delay(250).duration(400)} style={styles.cardContainer}>
          <LinearGradient
            colors={['rgba(45,53,72,0.4)', 'rgba(28,35,51,0.2)']}
            style={styles.descriptionCard}
          >
            <Text style={styles.descriptionText}>
              Join us for a blessed evening of community iftar during Ramadan. We'll break our fast together, share a meal, and enjoy each other's company. All are welcome — bring your family and friends!
            </Text>
            <TouchableOpacity activeOpacity={0.8}>
              <Text style={styles.readMore}>Read more</Text>
            </TouchableOpacity>
          </LinearGradient>
        </Animated.View>

        {/* RSVP Section */}
        <Animated.View entering={FadeInUp.delay(300).duration(400)} style={styles.cardContainer}>
          <LinearGradient
            colors={['rgba(45,53,72,0.4)', 'rgba(28,35,51,0.2)']}
            style={[styles.rsvpCard, { borderColor: colors.gold }]}
          >
            <Text style={styles.rsvpLabel}>Are you going?</Text>
            <View style={styles.rsvpButtons}>
              {(['going', 'maybe', 'not-going'] as const).map((status) => {
                const styles_result = getRsvpButtonStyle(status);
                const isSelected = rsvpStatus === status;
                const label = status === 'not-going' ? "Can't Go" : status.charAt(0).toUpperCase() + status.slice(1);

                return (
                  <TouchableOpacity
                    key={status}
                    style={styles_result.button}
                    onPress={() => setRsvpStatus(status)}
                    activeOpacity={0.8}
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
                  </TouchableOpacity>
                );
              })}
            </View>
          </LinearGradient>
        </Animated.View>

        {/* Attendees Section */}
        <Animated.View entering={FadeInUp.delay(350).duration(400)} style={styles.cardContainer}>
          <LinearGradient
            colors={['rgba(45,53,72,0.4)', 'rgba(28,35,51,0.2)']}
            style={styles.attendeesCard}
          >
            <View style={styles.attendeesHeader}>
              <LinearGradient
                colors={['rgba(10,123,79,0.2)', 'rgba(200,150,62,0.1)']}
                style={styles.smallIconBg}
              >
                <Icon name="users" size="xs" color={colors.emerald} />
              </LinearGradient>
              <Text style={styles.attendeesTitle}>Attendees</Text>
              <View style={styles.attendeesCount}>
                <Text style={styles.countBadge}>47 Going · 12 Maybe · 8 Invited</Text>
              </View>
            </View>

            <View style={styles.avatarRow}>
              {MOCK_ATTENDEES.map((attendee, index) => (
                <View
                  key={attendee.id}
                  style={[styles.avatarStack, { marginLeft: index > 0 ? -12 : 0 }]}
                >
                  <Avatar uri={attendee.avatar} name={attendee.name} size="md" />
                </View>
              ))}
              <View style={styles.moreAvatar}>
                <Text style={styles.moreText}>+42</Text>
              </View>
            </View>

            <TouchableOpacity style={styles.seeAllButton} activeOpacity={0.8}>
              <Text style={styles.seeAllText}>See All Attendees</Text>
              <Icon name="chevron-right" size="xs" color={colors.text.secondary} />
            </TouchableOpacity>
          </LinearGradient>
        </Animated.View>

        {/* Discussion Section */}
        <Animated.View entering={FadeInUp.delay(400).duration(400)} style={styles.cardContainer}>
          <LinearGradient
            colors={['rgba(45,53,72,0.4)', 'rgba(28,35,51,0.2)']}
            style={styles.discussionCard}
          >
            <View style={styles.discussionHeader}>
              <LinearGradient
                colors={['rgba(10,123,79,0.2)', 'rgba(200,150,62,0.1)']}
                style={styles.smallIconBg}
              >
                <Icon name="message-circle" size="xs" color={colors.emerald} />
              </LinearGradient>
              <Text style={styles.discussionTitle}>Discussion</Text>
              <Text style={styles.commentCount}>3 comments</Text>
            </View>

            {MOCK_COMMENTS.map((comment) => (
              <View key={comment.id} style={styles.commentRow}>
                <Avatar uri={comment.avatar} name={comment.author} size="sm" />
                <View style={styles.commentContent}>
                  <View style={styles.commentHeader}>
                    <Text style={styles.commentAuthor}>{comment.author}</Text>
                    <Text style={styles.commentTime}>{comment.time}</Text>
                  </View>
                  <Text style={styles.commentText}>{comment.text}</Text>
                </View>
              </View>
            ))}

            <View style={styles.commentInputRow}>
              <Avatar uri={null} name="You" size="sm" />
              <View style={styles.commentInput}>
                <Text style={styles.commentInputPlaceholder}>Add a comment...</Text>
              </View>
            </View>
          </LinearGradient>
        </Animated.View>

        {/* Bottom Spacer */}
        <View style={styles.bottomSpacer} />
      </ScrollView>

      {/* Bottom Bar */}
      <View style={styles.bottomBar}>
        <TouchableOpacity style={styles.shareEventButton} activeOpacity={0.8}>
          <LinearGradient
            colors={['rgba(45,53,72,0.6)', 'rgba(28,35,51,0.4)']}
            style={styles.shareButtonInner}
          >
            <Icon name="share" size="sm" color={colors.text.primary} />
            <Text style={styles.shareButtonText}>Share Event</Text>
          </LinearGradient>
        </TouchableOpacity>

        <TouchableOpacity activeOpacity={0.8}>
          <LinearGradient
            colors={[colors.emerald, colors.emeraldDark]}
            style={styles.rsvpConfirmButton}
          >
            <Text style={styles.rsvpConfirmText}>
              RSVP: {rsvpStatus === 'going' ? 'Going' : rsvpStatus === 'maybe' ? 'Maybe' : "Can't Go"}
            </Text>
          </LinearGradient>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
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
    borderColor: 'rgba(255,255,255,0.06)',
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
    borderColor: 'rgba(255,255,255,0.06)',
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
    borderColor: 'rgba(255,255,255,0.06)',
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
  discussionCard: {
    padding: spacing.base,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  discussionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  discussionTitle: {
    fontSize: fontSize.md,
    fontFamily: fonts.semibold,
    color: colors.text.primary,
  },
  commentCount: {
    marginLeft: 'auto',
    fontSize: fontSize.xs,
    fontFamily: fonts.medium,
    color: colors.text.secondary,
  },
  commentRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  commentContent: {
    flex: 1,
    backgroundColor: colors.dark.surface,
    borderRadius: radius.md,
    padding: spacing.sm,
  },
  commentHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  commentAuthor: {
    fontSize: fontSize.sm,
    fontFamily: fonts.semibold,
    color: colors.text.primary,
  },
  commentTime: {
    fontSize: fontSize.xs,
    fontFamily: fonts.regular,
    color: colors.text.tertiary,
  },
  commentText: {
    fontSize: fontSize.sm,
    fontFamily: fonts.regular,
    color: colors.text.secondary,
  },
  commentInputRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  commentInput: {
    flex: 1,
    backgroundColor: colors.dark.surface,
    borderRadius: radius.md,
    padding: spacing.sm,
  },
  commentInputPlaceholder: {
    fontSize: fontSize.sm,
    fontFamily: fonts.regular,
    color: colors.text.tertiary,
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
