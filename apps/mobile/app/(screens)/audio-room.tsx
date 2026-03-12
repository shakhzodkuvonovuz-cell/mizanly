import { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  Dimensions,
  Alert,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useAuth, useUser } from '@clerk/clerk-expo';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeInUp, useSharedValue, useAnimatedStyle, withSpring, withRepeat } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { Icon } from '@/components/ui/Icon';
import { GlassHeader } from '@/components/ui/GlassHeader';
import { Avatar } from '@/components/ui/Avatar';
import { colors, spacing, radius, fontSize, fonts } from '@/theme';
import { audioRoomsApi } from '@/services/audioRoomsApi';
import type { AudioRoom, AudioRoomParticipant } from '@/types/audioRooms';
import { Skeleton } from '@/components/ui/Skeleton';

const { width } = Dimensions.get('window');

interface Speaker {
  id: string;
  name: string;
  avatar: string | null;
  isSpeaking: boolean;
  isMuted: boolean;
  isHost: boolean;
}

interface Listener {
  id: string;
  name: string;
  avatar: string | null;
}

interface RaisedHand {
  id: string;
  userId: string;
  name: string;
  avatar: string | null;
  raisedAgo: string;
}




export default function AudioRoomScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [room, setRoom] = useState<AudioRoom | null>(null);
  const [participants, setParticipants] = useState<AudioRoomParticipant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const pulseAnim = useSharedValue(1);

  useEffect(() => {
    if (!room || room.status !== 'live') {
      pulseAnim.value = 1;
      return;
    }
    pulseAnim.value = withRepeat(
      withSpring(1.3, { damping: 2, stiffness: 100 }),
      -1,
      true
    );
  }, [room, pulseAnim]);

  const pulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulseAnim.value }],
    opacity: 2 - pulseAnim.value,
  }));

  const fetchData = useCallback(async () => {
    if (!id) return;
    try {
      setError(null);
      const [roomRes, participantsRes] = await Promise.all([
        audioRoomsApi.getById(id),
        audioRoomsApi.listParticipants(id),
      ]);
      setRoom(roomRes.data);
      setParticipants(participantsRes.data.data);
    } catch (err) {
      setError('Failed to load audio room');
      Alert.alert('Error', 'Failed to load audio room');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [id]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Poll participants for live rooms
  useEffect(() => {
    if (!id || !room || room.status !== 'live') return;
    const interval = setInterval(() => {
      audioRoomsApi.listParticipants(id).then(res => setParticipants(res.data.data));
    }, 10000);
    return () => clearInterval(interval);
  }, [id, room]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchData();
  }, [fetchData]);

  const formatTimeAgo = (dateString?: string) => {
    if (!dateString) return 'Just now';
    const diff = new Date().getTime() - new Date(dateString).getTime();
    const minutes = Math.floor(diff / 60000);
    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  };

  const { user } = useUser();
  const currentUserId = user?.id;

  const currentParticipant = currentUserId ? participants.find(p => p.userId === currentUserId) : null;

  const isSpeaker = currentParticipant?.role === 'host' || currentParticipant?.role === 'speaker';
  const isHandRaised = currentParticipant?.handRaised ?? false;
  const isMicOn = !currentParticipant?.isMuted;

  const speakers = participants.filter(p => p.role === 'host' || p.role === 'speaker');
  const listeners = participants.filter(p => p.role === 'listener');
  const raisedHands = participants.filter(p => p.handRaised);

  const speakerData: Speaker[] = speakers.map(p => ({
    id: p.id,
    name: p.user.name || p.user.username || 'User',
    avatar: p.user.avatarUrl || null,
    isSpeaking: false, // TODO: implement speaking detection
    isMuted: p.isMuted,
    isHost: p.role === 'host',
  }));

  const listenerData: Listener[] = listeners.map(p => ({
    id: p.id,
    name: p.user.name || p.user.username || 'User',
    avatar: p.user.avatarUrl || null,
  }));

  const displayedListeners = listenerData.slice(0, 12);
  const moreListenerCount = listenerData.length - displayedListeners.length;

  const raisedHandData: RaisedHand[] = raisedHands.map(p => ({
    id: p.id,
    userId: p.userId,
    name: p.user.name || p.user.username || 'User',
    avatar: p.user.avatarUrl || null,
    raisedAgo: 'Just now', // TODO: compute from handRaisedAt if available
  }));

  const handleToggleMic = async () => {
    if (!room) return;
    try {
      await audioRoomsApi.toggleMute(room.id);
      fetchData(); // refresh participants
    } catch (err) {
      Alert.alert('Error', 'Failed to toggle mute');
    }
  };

  const handleToggleHand = async () => {
    if (!room) return;
    try {
      await audioRoomsApi.toggleHand(room.id);
      fetchData(); // refresh participants
    } catch (err) {
      Alert.alert('Error', 'Failed to raise hand');
    }
  };

  const handleLeave = async () => {
    if (!room) return;
    try {
      await audioRoomsApi.leave(room.id);
      router.back();
    } catch (err) {
      Alert.alert('Error', 'Failed to leave room');
    }
  };

  const handleAcceptHand = async (userId: string) => {
    if (!room) return;
    try {
      await audioRoomsApi.changeRole(room.id, { userId, role: 'speaker' });
      fetchData();
    } catch (err) {
      Alert.alert('Error', 'Failed to accept hand');
    }
  };

  // Loading skeleton
  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <GlassHeader title="Audio Room" onBack={() => router.back()} />
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <Skeleton.Rect width="100%" height={200} borderRadius={radius.lg} />
          <Skeleton.Rect width="100%" height={150} borderRadius={radius.lg} style={{ marginTop: spacing.md }} />
          <Skeleton.Rect width="100%" height={150} borderRadius={radius.lg} style={{ marginTop: spacing.md }} />
        </ScrollView>
      </SafeAreaView>
    );
  }

  // Error state
  if (error) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <GlassHeader title="Audio Room" onBack={() => router.back()} />
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: spacing.base }}>
          <Text style={{ color: colors.error, fontSize: fontSize.md, marginBottom: spacing.md }}>{error}</Text>
          <TouchableOpacity onPress={fetchData}>
            <Text style={{ color: colors.emerald }}>Retry</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (!room) {
    return null;
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <GlassHeader
        title="Audio Room"
        onBack={() => router.back()}
        rightAction={
          <TouchableOpacity style={styles.menuButton} activeOpacity={0.8}>
            <Icon name="more-horizontal" size="md" color={colors.text.primary} />
          </TouchableOpacity>
        }
      />

      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl tintColor={colors.emerald} refreshing={refreshing} onRefresh={onRefresh} />}
        contentContainerStyle={styles.scrollContent}
      >
        {/* Room Info Hero */}
        <Animated.View entering={FadeInUp.duration(400)}>
          <LinearGradient
            colors={['rgba(45,53,72,0.4)', 'rgba(28,35,51,0.2)']}
            style={styles.roomCard}
          >
            <Text style={styles.roomTitle}>
              {room.title}
            </Text>

            {/* Host Badge */}
            <View style={styles.hostRow}>
              <Avatar uri={room.host.avatarUrl} name={room.host.name} size="md" />
              <View style={styles.hostInfo}>
                <Text style={styles.hostLabel}>Hosted by @{room.host.username}</Text>
              </View>
              <LinearGradient
                colors={[colors.gold, colors.goldLight]}
                style={styles.hostBadge}
              >
                <Icon name="star" size="xs" color={colors.text.primary} />
              </LinearGradient>
            </View>

            {/* LIVE Badge */}
            <View style={styles.liveRow}>
              <View style={styles.liveBadge}>
                <View style={styles.liveDot}>
                  <Animated.View style={[styles.livePulse, pulseStyle]} />
                  <View style={styles.liveDotInner} />
                </View>
                <LinearGradient
                  colors={['rgba(248,81,73,0.3)', 'rgba(248,81,73,0.15)']}
                  style={styles.liveTextBg}
                >
                  <Text style={styles.liveText}>LIVE</Text>
                </LinearGradient>
              </View>

              <View style={styles.statsRow}>
                <Icon name="users" size="xs" color={colors.gold} />
                <Text style={styles.listenerCount}>{participants.length} listening</Text>
                <Text style={styles.dot}>·</Text>
                <Icon name="clock" size="xs" color={colors.text.tertiary} />
                <Text style={styles.startedText}>Started {formatTimeAgo(room.startedAt)}</Text>
              </View>
            </View>
          </LinearGradient>
        </Animated.View>

        {/* Speakers Section */}
        <Animated.View entering={FadeInUp.delay(100).duration(400)} style={styles.sectionContainer}>
          <LinearGradient
            colors={['rgba(45,53,72,0.4)', 'rgba(28,35,51,0.2)']}
            style={styles.sectionCard}
          >
            <View style={styles.sectionHeader}>
              <LinearGradient
                colors={['rgba(10,123,79,0.2)', 'rgba(200,150,62,0.1)']}
                style={styles.sectionIconBg}
              >
                <Icon name="mic" size="xs" color={colors.emerald} />
              </LinearGradient>
              <Text style={styles.sectionTitle}>Speakers</Text>
            </View>

            <View style={styles.speakersGrid}>
              {speakerData.map((speaker, index) => (
                <Animated.View
                  key={speaker.id}
                  entering={FadeInUp.delay(index * 80).duration(400)}
                  style={styles.speakerItem}
                >
                  <View style={styles.speakerAvatarContainer}>
                    {speaker.isSpeaking && (
                      <Animated.View
                        entering={FadeInUp.duration(200)}
                        style={styles.speakingRing}
                      >
                        <LinearGradient
                          colors={[colors.emeraldLight, colors.emerald]}
                          style={styles.speakingRingInner}
                        />
                      </Animated.View>
                    )}
                    <Avatar uri={speaker.avatar} name={speaker.name} size="xl" />
                    {speaker.isMuted && (
                      <View style={styles.mutedBadge}>
                        <Icon name="volume-x" size="xs" color={colors.error} />
                      </View>
                    )}
                    {speaker.isHost && (
                      <LinearGradient
                        colors={[colors.gold, colors.goldLight]}
                        style={styles.speakerHostBadge}
                      >
                        <Icon name="star" size="xs" color={colors.text.primary} />
                      </LinearGradient>
                    )}
                  </View>
                  <Text style={styles.speakerName}>{speaker.name}</Text>
                </Animated.View>
              ))}
            </View>
          </LinearGradient>
        </Animated.View>

        {/* Listeners Section */}
        <Animated.View entering={FadeInUp.delay(200).duration(400)} style={styles.sectionContainer}>
          <LinearGradient
            colors={['rgba(45,53,72,0.4)', 'rgba(28,35,51,0.2)']}
            style={styles.sectionCard}
          >
            <View style={styles.sectionHeader}>
              <LinearGradient
                colors={['rgba(10,123,79,0.2)', 'rgba(200,150,62,0.1)']}
                style={styles.sectionIconBg}
              >
                <Icon name="users" size="xs" color={colors.emerald} />
              </LinearGradient>
              <Text style={styles.sectionTitle}>Listeners</Text>
              <View style={styles.countBadge}>
                <Text style={styles.countText}>{listenerData.length}</Text>
              </View>
            </View>

            <View style={styles.listenersGrid}>
              {displayedListeners.map((listener, index) => (
                <Animated.View
                  key={listener.id}
                  entering={FadeInUp.delay(index * 50).duration(400)}
                  style={styles.listenerItem}
                >
                  <Avatar uri={listener.avatar} name={listener.name} size="sm" />
                  <Text style={styles.listenerName}>{listener.name}</Text>
                </Animated.View>
              ))}
            </View>

            <View style={styles.moreBadge}>
              <Text style={styles.moreText}>+{moreListenerCount} more</Text>
            </View>
          </LinearGradient>
        </Animated.View>

        {/* Raised Hands Section */}
        <Animated.View entering={FadeInUp.delay(300).duration(400)} style={styles.sectionContainer}>
          <LinearGradient
            colors={['rgba(45,53,72,0.4)', 'rgba(28,35,51,0.2)']}
            style={styles.sectionCard}
          >
            <View style={styles.sectionHeader}>
              <LinearGradient
                colors={['rgba(200,150,62,0.2)', 'rgba(200,150,62,0.1)']}
                style={styles.sectionIconBg}
              >
                <Icon name="edit" size="xs" color={colors.gold} />
              </LinearGradient>
              <Text style={styles.sectionTitle}>Raised Hands</Text>
              <View style={[styles.countBadge, { backgroundColor: colors.gold }]}>
                <Text style={[styles.countText, { color: colors.dark.bg }]}>{raisedHandData.length}</Text>
              </View>
            </View>

            {raisedHandData.map((hand, index) => (
              <Animated.View
                key={hand.id}
                entering={FadeInUp.delay(index * 80).duration(400)}
                style={[styles.raisedHandRow, index < raisedHandData.length - 1 && styles.raisedHandBorder]}
              >
                <Avatar uri={hand.avatar} name={hand.name} size="sm" />
                <View style={styles.raisedHandInfo}>
                  <Text style={styles.raisedHandName}>{hand.name}</Text>
                  <Text style={styles.raisedHandTime}>Raised {hand.raisedAgo}</Text>
                </View>
                <View style={styles.raisedHandActions}>
                  <TouchableOpacity activeOpacity={0.8} onPress={() => handleAcceptHand(hand.userId)}>
                    <LinearGradient
                      colors={[colors.emerald, colors.emeraldDark]}
                      style={styles.acceptButton}
                    >
                      <Text style={styles.acceptText}>Accept</Text>
                    </LinearGradient>
                  </TouchableOpacity>
                  <TouchableOpacity activeOpacity={0.8}>
                    <Text style={styles.declineText}>Decline</Text>
                  </TouchableOpacity>
                </View>
              </Animated.View>
            ))}
          </LinearGradient>
        </Animated.View>

        {/* Bottom Spacer */}
        <View style={styles.bottomSpacer} />
      </ScrollView>

      {/* Room Controls */}
      <View style={styles.controlsContainer}>
        <Text style={styles.statusText}>
          You are a {isSpeaker ? 'speaker' : 'listener'}
        </Text>

        <LinearGradient
          colors={['rgba(45,53,72,0.6)', 'rgba(28,35,51,0.4)']}
          style={styles.controlsBar}
        >
          {/* Mic Toggle */}
          <TouchableOpacity
            style={styles.controlButton}
            onPress={handleToggleMic}
            activeOpacity={0.8}
          >
            <LinearGradient
              colors={isMicOn ? [colors.emerald, colors.emeraldDark] : [colors.error, colors.error]}
              style={styles.controlButtonInner}
            >
              <Icon name={isMicOn ? 'mic' : 'volume-x'} size="md" color={colors.text.primary} />
            </LinearGradient>
          </TouchableOpacity>

          {/* Raise Hand */}
          <TouchableOpacity
            style={styles.controlButton}
            onPress={handleToggleHand}
            activeOpacity={0.8}
          >
            <LinearGradient
              colors={isHandRaised ? [colors.gold, colors.goldLight] : ['rgba(45,53,72,0.6)', 'rgba(28,35,51,0.4)']}
              style={styles.controlButtonInner}
            >
              <Icon name="edit" size="md" color={isHandRaised ? colors.dark.bg : colors.text.primary} />
            </LinearGradient>
          </TouchableOpacity>

          {/* Reactions */}
          <TouchableOpacity style={styles.controlButton} activeOpacity={0.8}>
            <LinearGradient
              colors={['rgba(45,53,72,0.6)', 'rgba(28,35,51,0.4)']}
              style={styles.controlButtonInner}
            >
              <Icon name="smile" size="md" color={colors.text.primary} />
            </LinearGradient>
          </TouchableOpacity>

          {/* Leave */}
          <TouchableOpacity style={styles.controlButton} onPress={handleLeave} activeOpacity={0.8}>
            <LinearGradient
              colors={[colors.error, colors.error]}
              style={styles.controlButtonInner}
            >
              <Icon name="log-out" size="md" color={colors.text.primary} />
            </LinearGradient>
          </TouchableOpacity>
        </LinearGradient>

        {/* End Room (Host Only - Mock) */}
        <TouchableOpacity style={styles.endRoomButton} activeOpacity={0.8}>
          <Text style={styles.endRoomText}>End Room</Text>
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
  menuButton: {
    padding: spacing.sm,
  },
  scrollContent: {
    padding: spacing.base,
  },
  roomCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    padding: spacing.lg,
  },
  roomTitle: {
    fontSize: fontSize.lg,
    fontFamily: fonts.bold,
    color: colors.text.primary,
    lineHeight: 28,
    marginBottom: spacing.lg,
  },
  hostRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  hostInfo: {
    flex: 1,
  },
  hostLabel: {
    fontSize: fontSize.base,
    fontFamily: fonts.medium,
    color: colors.text.secondary,
  },
  hostBadge: {
    width: 24,
    height: 24,
    borderRadius: radius.full,
    justifyContent: 'center',
    alignItems: 'center',
  },
  liveRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  liveDot: {
    width: 12,
    height: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  livePulse: {
    position: 'absolute',
    width: 12,
    height: 12,
    borderRadius: radius.full,
    backgroundColor: colors.error,
  },
  liveDotInner: {
    width: 8,
    height: 8,
    borderRadius: radius.full,
    backgroundColor: colors.error,
  },
  liveTextBg: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.sm,
  },
  liveText: {
    fontSize: fontSize.xs,
    fontFamily: fonts.bold,
    color: colors.error,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  listenerCount: {
    fontSize: fontSize.sm,
    fontFamily: fonts.medium,
    color: colors.gold,
  },
  dot: {
    fontSize: fontSize.sm,
    color: colors.text.tertiary,
  },
  startedText: {
    fontSize: fontSize.sm,
    fontFamily: fonts.regular,
    color: colors.text.tertiary,
  },
  sectionContainer: {
    marginTop: spacing.md,
  },
  sectionCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    padding: spacing.base,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  sectionIconBg: {
    width: 28,
    height: 28,
    borderRadius: radius.sm,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sectionTitle: {
    fontSize: fontSize.md,
    fontFamily: fonts.semibold,
    color: colors.text.primary,
  },
  countBadge: {
    marginLeft: 'auto',
    backgroundColor: colors.dark.surface,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.sm,
  },
  countText: {
    fontSize: fontSize.xs,
    fontFamily: fonts.semibold,
    color: colors.text.primary,
  },
  speakersGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.lg,
  },
  speakerItem: {
    width: (width - 80) / 3,
    alignItems: 'center',
  },
  speakerAvatarContainer: {
    position: 'relative',
    marginBottom: spacing.xs,
  },
  speakingRing: {
    position: 'absolute',
    top: -4,
    left: -4,
    right: -4,
    bottom: -4,
    borderRadius: radius.full,
  },
  speakingRingInner: {
    flex: 1,
    borderRadius: radius.full,
    opacity: 0.4,
  },
  mutedBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 20,
    height: 20,
    borderRadius: radius.full,
    backgroundColor: colors.dark.surface,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: colors.dark.bg,
  },
  speakerHostBadge: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: 20,
    height: 20,
    borderRadius: radius.full,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: colors.dark.bg,
  },
  speakerName: {
    fontSize: fontSize.sm,
    fontFamily: fonts.medium,
    color: colors.text.secondary,
  },
  listenersGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.base,
  },
  listenerItem: {
    width: (width - 96) / 4,
    alignItems: 'center',
  },
  listenerName: {
    fontSize: fontSize.xs,
    fontFamily: fonts.regular,
    color: colors.text.tertiary,
    marginTop: spacing.xs,
  },
  moreBadge: {
    marginTop: spacing.md,
    alignItems: 'center',
  },
  moreText: {
    fontSize: fontSize.sm,
    fontFamily: fonts.medium,
    color: colors.text.secondary,
  },
  raisedHandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
  },
  raisedHandBorder: {
    borderBottomWidth: 1,
    borderBottomColor: colors.dark.border,
  },
  raisedHandInfo: {
    flex: 1,
    marginLeft: spacing.sm,
  },
  raisedHandName: {
    fontSize: fontSize.base,
    fontFamily: fonts.semibold,
    color: colors.text.primary,
  },
  raisedHandTime: {
    fontSize: fontSize.xs,
    fontFamily: fonts.regular,
    color: colors.text.tertiary,
    marginTop: spacing.xs,
  },
  raisedHandActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  acceptButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
  },
  acceptText: {
    fontSize: fontSize.sm,
    fontFamily: fonts.semibold,
    color: colors.text.primary,
  },
  declineText: {
    fontSize: fontSize.sm,
    fontFamily: fonts.medium,
    color: colors.text.tertiary,
  },
  bottomSpacer: {
    height: 220,
  },
  controlsContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: spacing.base,
    backgroundColor: colors.dark.bg,
    borderTopWidth: 1,
    borderTopColor: colors.dark.border,
  },
  statusText: {
    fontSize: fontSize.sm,
    fontFamily: fonts.medium,
    color: colors.text.secondary,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  controlsBar: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.lg,
    padding: spacing.md,
    borderRadius: radius.lg,
  },
  controlButton: {
    borderRadius: radius.full,
    overflow: 'hidden',
  },
  controlButtonInner: {
    width: 56,
    height: 56,
    borderRadius: radius.full,
    justifyContent: 'center',
    alignItems: 'center',
  },
  endRoomButton: {
    marginTop: spacing.md,
    alignItems: 'center',
  },
  endRoomText: {
    fontSize: fontSize.base,
    fontFamily: fonts.medium,
    color: colors.error,
  },
});
