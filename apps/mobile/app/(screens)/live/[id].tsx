import { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert,
  RefreshControl, FlatList, TextInput, Platform, Share, Dimensions,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useUser } from '@clerk/clerk-expo';
import { Video, ResizeMode } from 'expo-av';
import { formatDistanceToNowStrict } from 'date-fns';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withSpring,
  withSequence,
  interpolate,
  Extrapolation,
  FadeIn,
  FadeInUp,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { Avatar } from '@/components/ui/Avatar';
import { Icon } from '@/components/ui/Icon';
import { GlassHeader } from '@/components/ui/GlassHeader';
import { Badge } from '@/components/ui/Badge';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { BottomSheet, BottomSheetItem } from '@/components/ui/BottomSheet';
import { colors, spacing, fontSize, radius } from '@/theme';
import { liveApi } from '@/services/api';
import { ScreenErrorBoundary } from '@/components/ui/ScreenErrorBoundary';
import { useTranslation } from '@/hooks/useTranslation';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// Floating emoji reaction type
interface FloatingReaction {
  id: string;
  emoji: string;
  startX: number;
}

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
  const { t, isRTL } = useTranslation();
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
  const [floatingReactions, setFloatingReactions] = useState<FloatingReaction[]>([]);

  // Fetch live stream
  const liveQuery = useQuery({
    queryKey: ['live', id],
    queryFn: () => liveApi.getById(id),
    enabled: !!id,
  });

  // Fetch participants
  const participantsQuery = useQuery({
    queryKey: ['live-participants', id],
    queryFn: () => liveApi.getParticipants(id),
    enabled: !!id,
  });

  const live = liveQuery.data;
  const participants = (participantsQuery.data ?? []) as unknown as LiveParticipant[];

  // Animated values for visual effects
  const pulseAnim = useSharedValue(1);
  const viewerCountAnim = useSharedValue(1);
  const audioBars = [useSharedValue(0.3), useSharedValue(0.5), useSharedValue(0.7), useSharedValue(0.4), useSharedValue(0.6)];

  // Pulsing animation for LIVE badge
  useEffect(() => {
    pulseAnim.value = withRepeat(
      withTiming(1.5, { duration: 1000 }),
      -1,
      true
    );
  }, []);

  // Animated audio bars for audio space
  useEffect(() => {
    if (live?.liveType === 'AUDIO') {
      const interval = setInterval(() => {
        audioBars.forEach((bar) => {
          bar.value = withSpring(0.2 + Math.random() * 0.8, { damping: 10, stiffness: 100 });
        });
      }, 200);
      return () => clearInterval(interval);
    }
  }, [live?.liveType]);

  // Floating reactions animation
  const addFloatingReaction = (emoji: string) => {
    const reactionId = Date.now().toString();
    const startX = Math.random() * (SCREEN_WIDTH - 100) + 50;
    setFloatingReactions(prev => [...prev, { id: reactionId, emoji, startX }]);
    setTimeout(() => {
      setFloatingReactions(prev => prev.filter(r => r.id !== reactionId));
    }, 3000);
  };

  // Viewer count bump animation
  useEffect(() => {
    if (live?.viewersCount) {
      viewerCountAnim.value = withSequence(
        withSpring(1.2, { damping: 8, stiffness: 300 }),
        withSpring(1, { damping: 12, stiffness: 200 })
      );
    }
  }, [live?.viewersCount]);

  const pulseStyle = useAnimatedStyle(() => ({
    opacity: interpolate(pulseAnim.value, [1, 1.5], [1, 0.5], Extrapolation.CLAMP),
    transform: [{ scale: interpolate(pulseAnim.value, [1, 1.5], [1, 1.2], Extrapolation.CLAMP) }],
  }));

  const viewerCountStyle = useAnimatedStyle(() => ({
    transform: [{ scale: viewerCountAnim.value }],
  }));

  // Join live stream on mount if not already joined
  const joinMutation = useMutation({
    mutationFn: () => liveApi.join(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['live', id] });
      queryClient.invalidateQueries({ queryKey: ['live-participants', id] });
    },
    onError: (err: Error) => {
      Alert.alert(t('common.error'), err.message || t('screens.live.joinError'));
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
    const participant = participants.find((p: LiveParticipant) => p.userId === user?.id);
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
        message: t('screens.live.shareMessage', { title: live.title }),
        url: `https://mizanly.app/live/${live.id}`,
      });
    } catch (error: unknown) {
      if (error instanceof Error && error.message) {
        Alert.alert(t('screens.live.errorSharing'), error.message);
      }
    }
  }, [live?.id, live?.title]);

  const handleInviteSpeaker = (participantId: string) => {
    Alert.alert(t('screens.live.inviteToSpeak'), t('screens.live.inviteToSpeakDesc'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('screens.live.invite'), onPress: () => liveApi.inviteSpeaker(id, participantId).catch(() => {}) },
    ]);
  };

  const handleRemoveParticipant = (participantId: string) => {
    Alert.alert(t('screens.live.removeParticipant'), t('screens.live.removeParticipantConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('common.remove'), style: 'destructive', onPress: () => liveApi.removeParticipant(id, participantId).catch(() => {}) },
    ]);
  };

  // Floating reaction component
  function FloatingReactionBubble({ reaction }: { reaction: FloatingReaction }) {
    const yAnim = useSharedValue(0);
    const opacityAnim = useSharedValue(1);

    useEffect(() => {
      yAnim.value = withTiming(-300, { duration: 3000 });
      opacityAnim.value = withTiming(0, { duration: 2500 });
    }, []);

    const animatedStyle = useAnimatedStyle(() => ({
      transform: [{ translateY: yAnim.value }],
      opacity: opacityAnim.value,
    }));

    return (
      <Animated.View style={[styles.floatingReaction, { left: reaction.startX }, animatedStyle]}>
        <Text style={styles.floatingReactionEmoji}>{reaction.emoji}</Text>
      </Animated.View>
    );
  }

  // Audio bar animated component
  function AudioBar({ value }: { value: Animated.SharedValue<number> }) {
    const animatedStyle = useAnimatedStyle(() => ({
      height: `${value.value * 100}%`,
    }));

    return (
      <Animated.View style={[styles.audioBarAnimated, animatedStyle]} />
    );
  }

  const renderParticipantItem = ({ item }: { item: LiveParticipant }) => {
    const isSelf = item.userId === user?.id;
    const isHost = item.role === 'HOST';
    const isSpeaker = item.role === 'SPEAKER';
    const canModerate = live?.isHost;

    return (
      <View style={styles.participantItem}>
        <View style={styles.avatarWithBadge}>
          <Avatar uri={item.user.avatarUrl} name={item.user.username} size="md" />
          {isHost && (
            <View style={styles.hostCrownBadge}>
              <Icon name="check" size={10} color="#fff" />
            </View>
          )}
        </View>
        <View style={styles.participantInfo}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
            <Text style={styles.participantName}>{item.user.username}</Text>
            {isHost && (
              <LinearGradient
                colors={[colors.gold, '#A67C00']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.hostBadge}
              >
                <Icon name="check" size={10} color="#fff" />
              </LinearGradient>
            )}
            {isSpeaker && (
              <LinearGradient
                colors={[colors.emerald, '#05593A']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.speakerBadge}
              >
                <Icon name="mic" size={10} color="#fff" />
              </LinearGradient>
            )}
            {item.raisedHand && (
              <View style={styles.raisedHandBadge}>
                <Text style={styles.raisedHandEmoji}>✋</Text>
              </View>
            )}
          </View>
          <Text style={styles.participantRole}>
            {isHost ? `👑 ${t('screens.live.host')}` : isSpeaker ? `🎤 ${t('screens.live.speaker')}` : `👤 ${t('screens.live.listener')}`}
            {item.raisedHand ? ` • ${t('screens.live.wantsToSpeak')}` : ''}
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
              <Icon name="x" size="sm" color={colors.error} />
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
          title={t('screens.live.title')}
          leftAction={{ icon: 'arrow-left', onPress: () => router.back(), accessibilityLabel: t('common.back') }}
        />
        <View style={{ paddingTop: insets.top + 44 }}>
          <Skeleton.Rect width="100%" height={Math.round(SCREEN_WIDTH * 9 / 16)} borderRadius={0} />
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
          title={t('screens.live.title')}
          leftAction={{ icon: 'arrow-left', onPress: () => router.back(), accessibilityLabel: t('common.back') }}
        />
        <View style={{ paddingTop: insets.top + 44, flex: 1 }}>
          <EmptyState
            icon="slash"
            title={t('screens.live.errorTitle')}
            subtitle={t('screens.live.errorSubtitle')}
            actionLabel={t('screens.live.errorAction')}
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
          title={t('screens.live.title')}
          leftAction={{ icon: 'arrow-left', onPress: () => router.back(), accessibilityLabel: t('common.back') }}
        />
        <View style={{ paddingTop: insets.top + 44, flex: 1 }}>
          <EmptyState
            icon="video"
            title={t('screens.live.notFoundTitle')}
            subtitle={t('screens.live.notFoundSubtitle')}
            actionLabel={t('screens.live.errorAction')}
            onAction={() => router.back()}
          />
        </View>
      </View>
    );
  }

  const hostParticipant = participants.find((p: LiveParticipant) => p.role === 'HOST');
  const speakers = participants.filter((p: LiveParticipant) => p.role === 'SPEAKER');
  const listeners = participants.filter((p: LiveParticipant) => p.role === 'LISTENER');
  const raisedHands = participants.filter((p: LiveParticipant) => p.raisedHand);

  return (
    <ScreenErrorBoundary>
      <View style={styles.container}>
        {/* Floating reactions overlay */}
        <View style={styles.floatingReactionsOverlay} pointerEvents="none">
          {floatingReactions.map(reaction => (
            <FloatingReactionBubble key={reaction.id} reaction={reaction} />
          ))}
        </View>

        <GlassHeader
          title={t('screens.live.title')}
          leftAction={{ icon: 'arrow-left', onPress: () => router.back(), accessibilityLabel: t('common.back') }}
          rightActions={[
            {
              icon: 'users',
              onPress: () => setShowParticipants(true),
              accessibilityLabel: t('screens.live.participants'),
              badge: participants.length > 0 ? participants.length : undefined,
            },
            {
              icon: 'message-circle',
              onPress: () => setShowChat(true),
              accessibilityLabel: t('screens.live.chat'),
            },
          ]}
        />

        {/* LIVE badge with pulsing dot */}
        <Animated.View style={[styles.liveBadgeContainer, { top: insets.top + 60 }]} entering={FadeIn}>
          <View style={styles.liveBadge}>
            <Animated.View style={[styles.liveDot, pulseStyle]} />
            <Text style={styles.liveBadgeText}>{t('screens.live.liveLabel')}</Text>
          </View>
          <Animated.View style={[styles.viewerCountBadge, viewerCountStyle]}>
            <Icon name="eye" size={12} color="#fff" />
            <Text style={styles.viewerCountText}>{(live?.viewersCount || 0).toLocaleString()}</Text>
          </Animated.View>
        </Animated.View>

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
              <LinearGradient
                colors={[colors.dark.bgElevated, colors.dark.surface]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.audioGradient}
              >
                <View style={styles.audioVisualizer}>
                  {audioBars.map((bar, i) => (
                    <AudioBar key={i} value={bar} />
                  ))}
                </View>
                <Text style={styles.audioLabel}>{t('screens.live.audioSpace')}</Text>
                <Text style={styles.audioHint}>{t('screens.live.audioSpaceDesc')}</Text>
                {/* Waveform decoration */}
                <View style={styles.waveformDecoration}>
                  {[...Array(20)].map((_, i) => (
                    <View
                      key={i}
                      style={[
                        styles.waveformDot,
                        { opacity: 0.1 + (i / 20) * 0.3 },
                      ]}
                    />
                  ))}
                </View>
              </LinearGradient>
            </View>
          )}

          {/* Stream info */}
          <View style={styles.content}>
            <Text style={styles.liveTitle}>{live.title}</Text>
            <View style={styles.liveStats}>
              <Icon name="eye" size="xs" color={colors.gold} />
              <Text style={styles.liveStatsTextGold}>
                {live.viewersCount.toLocaleString()} {t('screens.live.watching')}
              </Text>
              <Text style={styles.liveStatsDot}>•</Text>
              <Text style={styles.liveStatsText}>
                {formatDistanceToNowStrict(new Date(live.startedAt || live.createdAt), { addSuffix: true })}
              </Text>
            </View>

            {/* Host row with crown */}
            {hostParticipant && (
              <View style={styles.hostRow}>
                <View style={styles.hostAvatarContainer}>
                  <Avatar uri={hostParticipant.user.avatarUrl} name={hostParticipant.user.username} size="lg" />
                  <LinearGradient
                    colors={[colors.gold, '#A67C00']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.hostCrownBadgeLarge}
                  >
                    <Icon name="check" size={12} color="#fff" />
                  </LinearGradient>
                </View>
                <View style={styles.hostInfo}>
                  <Text style={styles.hostName}>{t('screens.live.hostedBy')} {hostParticipant.user.username}</Text>
                  <View style={styles.liveStatusRow}>
                    <Animated.View style={[styles.liveStatusDot, pulseStyle]} />
                    <Text style={styles.hostStatus}>{t('screens.live.liveNow')}</Text>
                  </View>
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
                  name={participants.find((p: LiveParticipant) => p.userId === user?.id)?.raisedHand ? 'user' : 'user'}
                  size="md"
                  color={participants.find((p: LiveParticipant) => p.userId === user?.id)?.raisedHand ? colors.emerald : colors.text.primary}
                />
                <Text style={styles.actionLabel}>
                  {participants.find((p: LiveParticipant) => p.userId === user?.id)?.raisedHand ? t('screens.live.lowerHand') : t('screens.live.raiseHand')}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.actionButton} onPress={() => setShowChat(true)}>
                <Icon name="message-circle" size="md" color={colors.text.primary} />
                <Text style={styles.actionLabel}>{t('screens.live.chat')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.actionButton} onPress={handleShare}>
                <Icon name="share" size="md" color={colors.text.primary} />
                <Text style={styles.actionLabel}>{t('common.share')}</Text>
              </TouchableOpacity>
            </View>

            {/* Speakers avatars */}
            {speakers.length > 0 && (
              <View style={styles.speakersSection}>
                <Text style={styles.sectionTitle}>{t('screens.live.speakers')} ({speakers.length})</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.avatarsScroll}>
                  {speakers.map((p: LiveParticipant) => (
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
                <Text style={styles.sectionTitle}>{t('screens.live.raisedHands')} ({raisedHands.length})</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.avatarsScroll}>
                  {raisedHands.map((p: LiveParticipant) => (
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
            <Text style={styles.sheetTitle}>{t('screens.live.participants')} ({participants.length})</Text>
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
            <Text style={styles.sheetTitle}>{t('screens.live.liveChat')}</Text>
            <View style={styles.chatHeaderGlow} />
          </View>

          {/* Sample chat messages with translucent bubbles */}
          <View style={styles.chatMessagesContainer}>
            <ScrollView style={styles.chatScroll} showsVerticalScrollIndicator={false}>
              {/* Welcome message */}
              <LinearGradient
                colors={['rgba(10,123,79,0.15)', 'rgba(10,123,79,0.05)']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.welcomeBubble}
              >
                <Text style={styles.welcomeText}>{t('screens.live.welcomeToStream')}</Text>
              </LinearGradient>

              {/* Sample message */}
              <View style={styles.chatMessageRow}>
                <Avatar uri={null} name="Sarah" size="xs" />
                <LinearGradient
                  colors={['rgba(45,53,72,0.9)', 'rgba(45,53,72,0.7)']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.chatBubble}
                >
                  <Text style={styles.chatUsername}>Sarah</Text>
                  <Text style={styles.chatMessageText}>This is amazing! 🔥</Text>
                </LinearGradient>
              </View>

              {/* Sample message with gold accent */}
              <View style={styles.chatMessageRow}>
                <Avatar uri={null} name="Ahmed" size="xs" />
                <LinearGradient
                  colors={['rgba(200,150,62,0.15)', 'rgba(200,150,62,0.05)']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={[styles.chatBubble, styles.chatBubbleGold]}
                >
                  <Text style={styles.chatUsername}>Ahmed</Text>
                  <Text style={styles.chatMessageText}>Great stream today! 👏</Text>
                </LinearGradient>
              </View>
            </ScrollView>

            {/* Floating emoji reaction bar */}
            <View style={styles.reactionBar}>
              {['🔥', '❤️', '👏', '😂', '😮'].map((emoji) => (
                <TouchableOpacity
                  key={emoji}
                  style={styles.reactionButton}
                  onPress={() => addFloatingReaction(emoji)}
                >
                  <Text style={styles.reactionEmoji}>{emoji}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={styles.chatInputRow}>
            <TextInput
              style={styles.chatInput}
              placeholder={t('screens.live.sendMessage')}
              placeholderTextColor={colors.text.tertiary}
              value={chatMessage}
              onChangeText={setChatMessage}
              multiline
            />
            <TouchableOpacity
              style={[styles.sendButton, !chatMessage.trim() && styles.sendButtonDisabled]}
              onPress={handleSendChat}
              disabled={!chatMessage.trim()}
            >
              <LinearGradient
                colors={chatMessage.trim() ? [colors.emerald, '#05593A'] : [colors.dark.surface, colors.dark.surface]}
                style={styles.sendButtonGradient}
              >
                <Icon name="send" size={14} color={chatMessage.trim() ? '#fff' : colors.text.tertiary} />
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </BottomSheet>
      </View>
  
    </ScreenErrorBoundary>
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

  // LIVE badge styles
  liveBadgeContainer: {
    position: 'absolute',
    left: spacing.base,
    zIndex: 100,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(248,81,73,0.9)',
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.sm,
    gap: spacing.xs,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#fff',
  },
  liveBadgeText: {
    color: '#fff',
    fontSize: fontSize.xs,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  viewerCountBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.sm,
    gap: spacing.xs,
  },
  viewerCountText: {
    color: '#fff',
    fontSize: fontSize.xs,
    fontWeight: '600',
  },

  // Floating reactions
  floatingReactionsOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 50,
    pointerEvents: 'none',
  },
  floatingReaction: {
    position: 'absolute',
    bottom: 120,
  },
  floatingReactionEmoji: {
    fontSize: 32,
  },

  // Enhanced host styles
  hostAvatarContainer: {
    position: 'relative',
  },
  hostCrownBadgeLarge: {
    position: 'absolute',
    bottom: -4,
    right: -4,
    width: 24,
    height: 24,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.dark.bg,
  },
  liveStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: 2,
  },
  liveStatusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.emerald,
  },

  // Audio visualizer
  audioGradient: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  audioBarAnimated: {
    width: 8,
    backgroundColor: colors.emerald,
    borderRadius: radius.sm,
  },
  waveformDecoration: {
    position: 'absolute',
    bottom: 20,
    flexDirection: 'row',
    gap: 8,
  },
  waveformDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.emerald,
  },

  // Participant badges
  avatarWithBadge: {
    position: 'relative',
  },
  hostCrownBadge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 18,
    height: 18,
    borderRadius: radius.md,
    backgroundColor: colors.gold,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: colors.dark.bg,
  },
  hostBadge: {
    width: 20,
    height: 20,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  speakerBadge: {
    width: 20,
    height: 20,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  raisedHandBadge: {
    width: 20,
    height: 20,
    borderRadius: radius.md,
    backgroundColor: colors.active.emerald10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  raisedHandEmoji: {
    fontSize: 12,
  },

  // Chat styling
  liveStatsTextGold: {
    color: colors.gold,
    fontSize: fontSize.sm,
    fontWeight: '600',
  },
  chatMessagesContainer: {
    flex: 1,
    backgroundColor: 'rgba(13,17,23,0.95)',
  },
  chatScroll: {
    paddingHorizontal: spacing.base,
    paddingTop: spacing.md,
  },
  welcomeBubble: {
    alignSelf: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: 'rgba(10,123,79,0.3)',
  },
  welcomeText: {
    color: colors.emerald,
    fontSize: fontSize.sm,
    fontWeight: '500',
  },
  chatMessageRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.xs,
    marginBottom: spacing.sm,
  },
  chatBubble: {
    flex: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    borderTopLeftRadius: radius.sm,
    borderWidth: 1,
    borderColor: 'rgba(45,53,72,0.5)',
  },
  chatBubbleGold: {
    borderColor: 'rgba(200,150,62,0.3)',
  },
  chatUsername: {
    color: colors.gold,
    fontSize: fontSize.xs,
    fontWeight: '600',
    marginBottom: 2,
  },
  chatMessageText: {
    color: colors.text.primary,
    fontSize: fontSize.base,
    lineHeight: fontSize.lg,
  },
  chatHeaderGlow: {
    position: 'absolute',
    bottom: -20,
    left: 0,
    right: 0,
    height: 40,
    backgroundColor: 'rgba(10,123,79,0.1)',
    borderRadius: radius.lg,
  },

  // Reaction bar
  reactionBar: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: 'rgba(45,53,72,0.8)',
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    marginHorizontal: spacing.base,
    marginBottom: spacing.sm,
  },
  reactionButton: {
    width: 40,
    height: 40,
    borderRadius: radius.full,
    backgroundColor: 'rgba(13,17,23,0.8)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  reactionEmoji: {
    fontSize: 22,
  },

  // Send button
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: radius.full,
    overflow: 'hidden',
  },
  sendButtonDisabled: {
    opacity: 0.5,
  },
  sendButtonGradient: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
});