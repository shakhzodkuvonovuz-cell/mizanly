import { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert,
  RefreshControl, FlatList, TextInput, Platform, Share,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useUser } from '@clerk/clerk-expo';
import { Video, ResizeMode } from 'expo-av';
import { formatDistanceToNowStrict } from 'date-fns';
import { Avatar } from '@/components/ui/Avatar';
import { Icon } from '@/components/ui/Icon';
import { GlassHeader } from '@/components/ui/GlassHeader';
import { Badge } from '@/components/ui/Badge';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { BottomSheet, BottomSheetItem } from '@/components/ui/BottomSheet';
import { colors, spacing, fontSize, radius } from '@/theme';
import { liveApi } from '@/services/api';

interface LiveParticipant {
  id: string;
  userId: string;
  user: {
    id: string;
    username: string;
    avatarUrl?: string;
  };
  role: 'HOST' | 'SPEAKER' | 'LISTENER';
  raisedHand: boolean;
}

export default function LiveViewerScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user } = useUser();
  const queryClient = useQueryClient();
  const videoRef = useRef<Video>(null);
  const insets = useSafeAreaInsets();
  const [refreshing, setRefreshing] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [showParticipants, setShowParticipants] = useState(false);
  const [chatMessage, setChatMessage] = useState('');

  // Fetch live stream
  const liveQuery = useQuery({
    queryKey: ['live', id],
    queryFn: () => liveApi.getById(id),
    enabled: !!id,
  });

  // Fetch participants
  const participantsQuery = useQuery({
    queryKey: ['live-participants', id],
    queryFn: () => liveApi.getParticipants(id).then(res => res.data),
    enabled: !!id,
  });

  const live = liveQuery.data;
  const participants = participantsQuery.data ?? [];

  // Join live stream on mount if not already joined
  const joinMutation = useMutation({
    mutationFn: () => liveApi.join(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['live', id] });
      queryClient.invalidateQueries({ queryKey: ['live-participants', id] });
    },
    onError: (err: Error) => {
      Alert.alert('Error', err.message || 'Failed to join live stream.');
    },
  });

  // Leave live stream on unmount
  const leaveMutation = useMutation({
    mutationFn: () => liveApi.leave(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['live', id] });
      queryClient.invalidateQueries({ queryKey: ['live-participants', id] });
    },
  });

  useEffect(() => {
    if (live?.id && user?.id && !live.isJoined) {
      joinMutation.mutate();
    }
  }, [live?.id, user?.id, live?.isJoined]);

  useEffect(() => {
    return () => {
      if (live?.id && user?.id) {
        leaveMutation.mutate();
      }
    };
  }, [live?.id, user?.id]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([liveQuery.refetch(), participantsQuery.refetch()]);
    setRefreshing(false);
  }, [liveQuery, participantsQuery]);

  // Mutations
  const raiseHandMutation = useMutation({
    mutationFn: () => liveApi.raiseHand(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['live-participants', id] }),
  });

  const lowerHandMutation = useMutation({
    mutationFn: () => liveApi.lowerHand(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['live-participants', id] }),
  });

  const sendChatMutation = useMutation({
    mutationFn: () => liveApi.sendChat(id, chatMessage),
    onSuccess: () => setChatMessage(''),
  });

  const handleRaiseHand = () => {
    const participant = participants.find(p => p.userId === user?.id);
    if (participant?.raisedHand) {
      lowerHandMutation.mutate();
    } else {
      raiseHandMutation.mutate();
    }
  };

  const handleSendChat = () => {
    if (chatMessage.trim()) {
      sendChatMutation.mutate();
    }
  };

  const handleShare = useCallback(async () => {
    if (!live?.id) return;
    try {
      await Share.share({
        message: `Join the live stream "${live.title}" on Mizanly!`,
        url: `https://mizanly.app/live/${live.id}`,
      });
    } catch (error: any) {
      if (error.message) {
        Alert.alert('Error sharing', error.message);
      }
    }
  }, [live?.id, live?.title]);

  const handleInviteSpeaker = (participantId: string) => {
    Alert.alert('Invite to speak', 'This would send an invite to the user to become a speaker.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Invite', onPress: () => liveApi.inviteSpeaker(id, participantId).catch(() => {}) },
    ]);
  };

  const handleRemoveParticipant = (participantId: string) => {
    Alert.alert('Remove participant', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => liveApi.removeParticipant(id, participantId).catch(() => {}) },
    ]);
  };

  const renderParticipantItem = ({ item }: { item: LiveParticipant }) => {
    const isSelf = item.userId === user?.id;
    const isHost = item.role === 'HOST';
    const isSpeaker = item.role === 'SPEAKER';
    const canModerate = live?.isHost;

    return (
      <View style={styles.participantItem}>
        <Avatar uri={item.user.avatarUrl} name={item.user.username} size="md" />
        <View style={styles.participantInfo}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
            <Text style={styles.participantName}>{item.user.username}</Text>
            {isHost && <Badge label="Host" color={colors.emerald} />}
            {isSpeaker && <Badge label="Speaker" color={colors.gold} />}
            {item.raisedHand && <Badge label="✋" color={colors.active.emerald10} />}
          </View>
          <Text style={styles.participantRole}>
            {item.role.toLowerCase()}{item.raisedHand ? ' • Hand raised' : ''}
          </Text>
        </View>
        {canModerate && !isSelf && (
          <View style={styles.participantActions}>
            {item.role === 'LISTENER' && (
              <TouchableOpacity onPress={() => handleInviteSpeaker(item.id)} style={styles.participantActionBtn}>
                <Icon name="mic" size="sm" color={colors.text.secondary} />
              </TouchableOpacity>
            )}
            <TouchableOpacity onPress={() => handleRemoveParticipant(item.id)} style={styles.participantActionBtn}>
              <Icon name="x" size="sm" color={colors.text.secondary} />
            </TouchableOpacity>
          </View>
        )}
      </View>
    );
  };

  if (liveQuery.isLoading) {
    return (
      <View style={styles.container}>
        <GlassHeader
          title="Live"
          leftAction={{ icon: 'arrow-left', onPress: () => router.back(), accessibilityLabel: 'Go back' }}
        />
        <View style={{ paddingTop: insets.top + 44 }}>
          <Skeleton.Rect width="100%" aspectRatio={16/9} borderRadius={0} />
          <View style={styles.skeletonContent}>
            <Skeleton.Rect width="80%" height={24} borderRadius={radius.sm} />
            <Skeleton.Rect width="40%" height={16} borderRadius={radius.sm} style={{ marginTop: spacing.sm }} />
            <Skeleton.Rect width="100%" height={60} borderRadius={radius.sm} style={{ marginTop: spacing.lg }} />
            <Skeleton.Rect width="100%" height={80} borderRadius={radius.sm} style={{ marginTop: spacing.lg }} />
          </View>
        </View>
      </View>
    );
  }

  if (liveQuery.isError) {
    return (
      <View style={styles.container}>
        <GlassHeader
          title="Live"
          leftAction={{ icon: 'arrow-left', onPress: () => router.back(), accessibilityLabel: 'Go back' }}
        />
        <View style={{ paddingTop: insets.top + 44, flex: 1 }}>
          <EmptyState
            icon="slash"
            title="Something went wrong"
            subtitle="Could not load this live stream. Please try again."
            actionLabel="Go back"
            onAction={() => router.back()}
          />
        </View>
      </View>
    );
  }

  if (!live) {
    return (
      <View style={styles.container}>
        <GlassHeader
          title="Live"
          leftAction={{ icon: 'arrow-left', onPress: () => router.back(), accessibilityLabel: 'Go back' }}
        />
        <View style={{ paddingTop: insets.top + 44, flex: 1 }}>
          <EmptyState
            icon="video"
            title="Live stream not found"
            subtitle="This stream may have ended or is unavailable"
            actionLabel="Go back"
            onAction={() => router.back()}
          />
        </View>
      </View>
    );
  }

  const hostParticipant = participants.find(p => p.role === 'HOST');
  const speakers = participants.filter(p => p.role === 'SPEAKER');
  const listeners = participants.filter(p => p.role === 'LISTENER');
  const raisedHands = participants.filter(p => p.raisedHand);

  return (
    <View style={styles.container}>
      <GlassHeader
        title="Live"
        leftAction={{ icon: 'arrow-left', onPress: () => router.back(), accessibilityLabel: 'Go back' }}
        rightActions={[
          {
            icon: 'users',
            onPress: () => setShowParticipants(true),
            accessibilityLabel: 'Participants',
            badge: participants.length > 0 ? participants.length : undefined,
          },
          {
            icon: 'message-circle',
            onPress: () => setShowChat(true),
            accessibilityLabel: 'Chat',
          },
        ]}
      />

      <ScrollView
        style={{ paddingTop: insets.top + 44 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.emerald} />
        }
        showsVerticalScrollIndicator={false}
      >
        {/* Video player (if video stream) */}
        {live.liveType === 'VIDEO' && live.videoUrl && (
          <Video
            ref={videoRef}
            source={{ uri: live.videoUrl }}
            style={styles.videoPlayer}
            resizeMode={ResizeMode.CONTAIN}
            useNativeControls
            shouldPlay
            isLooping={false}
          />
        )}

        {/* Audio space UI (if audio) */}
        {live.liveType === 'AUDIO' && (
          <View style={styles.audioContainer}>
            <View style={styles.audioVisualizer}>
              {[1, 2, 3, 4, 5].map((i) => (
                <View key={i} style={styles.audioBar} />
              ))}
            </View>
            <Text style={styles.audioLabel}>Audio Space</Text>
            <Text style={styles.audioHint}>Live conversation in progress</Text>
          </View>
        )}

        {/* Stream info */}
        <View style={styles.content}>
          <Text style={styles.liveTitle}>{live.title}</Text>
          <View style={styles.liveStats}>
            <Icon name="eye" size="xs" color={colors.text.secondary} />
            <Text style={styles.liveStatsText}>
              {live.viewerCount.toLocaleString()} watching
            </Text>
            <Text style={styles.liveStatsDot}>•</Text>
            <Text style={styles.liveStatsText}>
              {formatDistanceToNowStrict(new Date(live.startedAt || live.createdAt), { addSuffix: true })}
            </Text>
          </View>

          {/* Host row */}
          {hostParticipant && (
            <View style={styles.hostRow}>
              <Avatar uri={hostParticipant.user.avatarUrl} name={hostParticipant.user.username} size="lg" />
              <View style={styles.hostInfo}>
                <Text style={styles.hostName}>Hosted by {hostParticipant.user.username}</Text>
                <Text style={styles.hostStatus}>Live now</Text>
              </View>
            </View>
          )}

          {/* Description */}
          {live.description && (
            <View style={styles.descriptionContainer}>
              <Text style={styles.descriptionText}>{live.description}</Text>
            </View>
          )}

          {/* Quick actions */}
          <View style={styles.actionRow}>
            <TouchableOpacity style={styles.actionButton} onPress={handleRaiseHand}>
              <Icon
                name={participants.find(p => p.userId === user?.id)?.raisedHand ? 'hand' : 'hand'}
                size="md"
                color={participants.find(p => p.userId === user?.id)?.raisedHand ? colors.emerald : colors.text.primary}
              />
              <Text style={styles.actionLabel}>
                {participants.find(p => p.userId === user?.id)?.raisedHand ? 'Lower hand' : 'Raise hand'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionButton} onPress={() => setShowChat(true)}>
              <Icon name="message-circle" size="md" color={colors.text.primary} />
              <Text style={styles.actionLabel}>Chat</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionButton} onPress={handleShare}>
              <Icon name="share" size="md" color={colors.text.primary} />
              <Text style={styles.actionLabel}>Share</Text>
            </TouchableOpacity>
          </View>

          {/* Speakers avatars */}
          {speakers.length > 0 && (
            <View style={styles.speakersSection}>
              <Text style={styles.sectionTitle}>Speakers ({speakers.length})</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.avatarsScroll}>
                {speakers.map((p) => (
                  <View key={p.id} style={styles.avatarWrap}>
                    <Avatar uri={p.user.avatarUrl} name={p.user.username} size="xl" />
                    <Text style={styles.avatarName}>{p.user.username}</Text>
                  </View>
                ))}
              </ScrollView>
            </View>
          )}

          {/* Raised hands */}
          {raisedHands.length > 0 && (
            <View style={styles.raisedHandsSection}>
              <Text style={styles.sectionTitle}>Raised hands ({raisedHands.length})</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.avatarsScroll}>
                {raisedHands.map((p) => (
                  <View key={p.id} style={styles.avatarWrap}>
                    <Avatar uri={p.user.avatarUrl} name={p.user.username} size="lg" />
                    <Text style={styles.avatarName}>{p.user.username}</Text>
                  </View>
                ))}
              </ScrollView>
            </View>
          )}
        </View>
      </ScrollView>

      {/* Participants bottom sheet */}
      <BottomSheet visible={showParticipants} onClose={() => setShowParticipants(false)} snapPoint={0.7}>
        <View style={styles.sheetHeader}>
          <Text style={styles.sheetTitle}>Participants ({participants.length})</Text>
        </View>
        <FlatList
            removeClippedSubviews={true}
          data={participants}
          renderItem={renderParticipantItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.participantList}
        />
      </BottomSheet>

      {/* Chat bottom sheet */}
      <BottomSheet visible={showChat} onClose={() => setShowChat(false)} snapPoint={0.7}>
        <View style={styles.sheetHeader}>
          <Text style={styles.sheetTitle}>Live Chat</Text>
        </View>
        <View style={styles.chatMessages}>
          <Text style={styles.chatPlaceholder}>
            Chat messages would appear here in real‑time.
          </Text>
        </View>
        <View style={styles.chatInputRow}>
          <TextInput
            style={styles.chatInput}
            placeholder="Send a message..."
            placeholderTextColor={colors.text.tertiary}
            value={chatMessage}
            onChangeText={setChatMessage}
            multiline
          />
          <TouchableOpacity onPress={handleSendChat} disabled={!chatMessage.trim()}>
            <Icon name="send" size="sm" color={chatMessage.trim() ? colors.emerald : colors.text.tertiary} />
          </TouchableOpacity>
        </View>
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.dark.bg },
  videoPlayer: {
    width: '100%',
    aspectRatio: 16 / 9,
    backgroundColor: colors.dark.bgElevated,
  },
  audioContainer: {
    width: '100%',
    aspectRatio: 2 / 1,
    backgroundColor: colors.dark.bgElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  audioVisualizer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    height: 60,
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  audioBar: {
    width: 8,
    backgroundColor: colors.emerald,
    borderRadius: radius.sm,
    height: '50%',
  },
  audioLabel: {
    color: colors.text.primary,
    fontSize: fontSize.lg,
    fontWeight: '700',
    marginBottom: spacing.xs,
  },
  audioHint: {
    color: colors.text.secondary,
    fontSize: fontSize.sm,
  },
  content: {
    paddingHorizontal: spacing.base,
    paddingTop: spacing.base,
  },
  liveTitle: {
    color: colors.text.primary,
    fontSize: fontSize.lg,
    fontWeight: '700',
    marginBottom: spacing.xs,
  },
  liveStats: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginBottom: spacing.lg,
  },
  liveStatsText: {
    color: colors.text.secondary,
    fontSize: fontSize.sm,
  },
  liveStatsDot: {
    color: colors.text.tertiary,
    fontSize: fontSize.sm,
  },
  hostRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  hostInfo: {
    flex: 1,
  },
  hostName: {
    color: colors.text.primary,
    fontSize: fontSize.base,
    fontWeight: '600',
  },
  hostStatus: {
    color: colors.emerald,
    fontSize: fontSize.sm,
    fontWeight: '600',
  },
  descriptionContainer: {
    backgroundColor: colors.dark.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  descriptionText: {
    color: colors.text.secondary,
    fontSize: fontSize.base,
    lineHeight: fontSize.lg,
  },
  actionRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginVertical: spacing.lg,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.dark.border,
    paddingVertical: spacing.sm,
  },
  actionButton: {
    alignItems: 'center',
    gap: spacing.xs,
  },
  actionLabel: {
    color: colors.text.secondary,
    fontSize: fontSize.sm,
    fontWeight: '500',
  },
  speakersSection: {
    marginBottom: spacing.lg,
  },
  raisedHandsSection: {
    marginBottom: spacing.xl,
  },
  sectionTitle: {
    color: colors.text.primary,
    fontSize: fontSize.base,
    fontWeight: '600',
    marginBottom: spacing.sm,
  },
  avatarsScroll: {
    marginHorizontal: -spacing.base,
    paddingHorizontal: spacing.base,
  },
  avatarWrap: {
    alignItems: 'center',
    marginRight: spacing.lg,
  },
  avatarName: {
    color: colors.text.secondary,
    fontSize: fontSize.sm,
    marginTop: spacing.xs,
  },
  skeletonContent: {
    paddingHorizontal: spacing.base,
    paddingTop: spacing.base,
  },
  // Participants sheet
  sheetHeader: {
    alignItems: 'center',
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.dark.border,
  },
  sheetTitle: {
    color: colors.text.primary,
    fontSize: fontSize.lg,
    fontWeight: '700',
  },
  participantList: {
    paddingHorizontal: spacing.base,
    paddingBottom: spacing.md,
  },
  participantItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.dark.border,
  },
  participantInfo: {
    flex: 1,
    marginLeft: spacing.sm,
  },
  participantName: {
    color: colors.text.primary,
    fontSize: fontSize.base,
    fontWeight: '600',
  },
  participantRole: {
    color: colors.text.tertiary,
    fontSize: fontSize.sm,
    marginTop: spacing.xs,
  },
  participantActions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  participantActionBtn: {
    padding: spacing.xs,
  },
  // Chat sheet
  chatMessages: {
    flex: 1,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chatPlaceholder: {
    color: colors.text.tertiary,
    fontSize: fontSize.base,
    textAlign: 'center',
  },
  chatInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.dark.border,
  },
  chatInput: {
    flex: 1,
    color: colors.text.primary,
    fontSize: fontSize.base,
    backgroundColor: colors.dark.surface,
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginRight: spacing.sm,
    maxHeight: 100,
  },
});