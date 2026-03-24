import { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, Pressable,
  Dimensions,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useUser, useAuth } from '@clerk/clerk-expo';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { io, Socket } from 'socket.io-client';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withSpring,
  FadeIn,
  FadeInUp,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { Avatar } from '@/components/ui/Avatar';
import { Icon } from '@/components/ui/Icon';
import { GlassHeader } from '@/components/ui/GlassHeader';
import { Skeleton } from '@/components/ui/Skeleton';
import { showToast } from '@/components/ui/Toast';
import { colors, spacing, fontSize, radius, animation } from '@/theme';
import { api, callsApi, SOCKET_URL } from '@/services/api';
import { useTranslation } from '@/hooks/useTranslation';
import { useThemeColors } from '@/hooks/useThemeColors';
import { useContextualHaptic } from '@/hooks/useContextualHaptic';
import { RTCView } from 'react-native-webrtc';
import { useWebRTC, type IceServer } from '@/hooks/useWebRTC';
import type { CallSession } from '@/types';
import { ScreenErrorBoundary } from '@/components/ui/ScreenErrorBoundary';

type CallType = 'voice' | 'video';
type CallStatus = 'ringing' | 'connected' | 'ended' | 'missed' | 'declined';

interface Call {
  id: string;
  callerId: string;
  calleeId: string;
  type: CallType;
  status: CallStatus;
  startedAt?: string;
  endedAt?: string;
  caller?: { id: string; username: string; displayName: string; avatarUrl?: string };
  callee?: { id: string; username: string; displayName: string; avatarUrl?: string };
}

// SOCKET_URL imported from @/services/api

export default function CallScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user } = useUser();
  const { getToken } = useAuth();
  const userId = user?.id;
  const queryClient = useQueryClient();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const tc = useThemeColors();
  const haptic = useContextualHaptic();
  const socketRef = useRef<Socket | null>(null);
  const [callStatus, setCallStatus] = useState<CallStatus>('ringing');
  const [duration, setDuration] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const { data: call, isLoading } = useQuery({
    queryKey: ['call', id],
    queryFn: async (): Promise<Call> => {
      const r = await api.get(`/calls/${id}`);
      return r as Call;
    },
    enabled: !!id,
  });

  // Fetch ICE server config for WebRTC peer connection (TURN/STUN)
  const { data: iceConfig } = useQuery({
    queryKey: ['ice-servers'],
    queryFn: () => callsApi.getIceServers(),
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });

  // ── WebRTC peer connection ──
  const isIncomingCall = call?.callerId !== userId;
  const targetUser = isIncomingCall ? call?.callerId : call?.calleeId;

  const webrtc = useWebRTC({
    socketRef,
    targetUserId: targetUser ?? '',
    callType: (call?.type ?? 'voice') as 'voice' | 'video',
    iceServers: (iceConfig as { iceServers?: IceServer[] })?.iceServers ?? [],
    isInitiator: !isIncomingCall,
    onConnected: () => setCallStatus('connected'),
    onDisconnected: () => setCallStatus('ended'),
    onFailed: () => { setCallStatus('ended'); showToast({ message: t('calls.connectionFailed'), variant: 'error' }); },
  });

  const answerMutation = useMutation({
    mutationFn: () => callsApi.answer(id),
    onSuccess: () => { setCallStatus('connected'); haptic.success(); },
    onError: (err: Error) => { showToast({ message: err.message, variant: 'error' }); haptic.error(); },
  });

  const endCallMutation = useMutation({
    mutationFn: () => callsApi.end(id),
    onSuccess: () => {
      setCallStatus('ended');
      haptic.delete();
      router.back();
    },
    onError: (err: Error) => { showToast({ message: err.message, variant: 'error' }); haptic.error(); },
  });

  const declineMutation = useMutation({
    mutationFn: () => callsApi.decline(id),
    onSuccess: () => {
      setCallStatus('declined');
      haptic.delete();
      router.back();
    },
    onError: (err: Error) => { showToast({ message: err.message, variant: 'error' }); haptic.error(); },
  });

  // Setup socket connection with JWT auth (matches /chat namespace pattern)
  useEffect(() => {
    let mounted = true;
    const connect = async () => {
      const token = await getToken();
      if (!token || !mounted) return;
      const socket = io(SOCKET_URL, {
        transports: ['websocket'],
        auth: { token },
        reconnection: true,
        reconnectionAttempts: 10,
        reconnectionDelay: 1000,
      });

      socket.on('connect_error', async () => {
        if (!mounted) return;
        const freshToken = await getToken({ skipCache: true });
        if (freshToken && socket) {
          socket.auth = { token: freshToken };
        }
      });

      socket.on('call_answered', () => {
        setCallStatus('connected');
      });
      socket.on('call_ended', () => {
        setCallStatus('ended');
        if (intervalRef.current) clearInterval(intervalRef.current);
        setTimeout(() => router.back(), 2000);
      });
      socket.on('incoming_call', () => {
        setCallStatus('ringing');
      });
      socket.on('call_rejected', () => {
        setCallStatus('missed');
      });

      socketRef.current = socket;
    };
    connect();

    return () => {
      mounted = false;
      socketRef.current?.disconnect();
      socketRef.current = null;
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [id, getToken]);

  // Duration timer
  useEffect(() => {
    if (callStatus === 'connected') {
      intervalRef.current = setInterval(() => {
        setDuration((prev) => prev + 1);
      }, 1000);
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [callStatus]);

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const handleAnswer = () => {
    haptic.success();
    answerMutation.mutate();
    webrtc.start(); // Start media + peer connection on answer
  };
  const handleDecline = () => { haptic.delete(); declineMutation.mutate(); };
  const handleEndCall = () => {
    haptic.delete();
    webrtc.hangup();
    endCallMutation.mutate();
  };
  const toggleMute = () => { haptic.tick(); webrtc.toggleMute(); };
  const toggleSpeaker = () => { haptic.tick(); }; // Speaker routing needs InCallManager — keep as UI state for now
  const toggleCamera = () => { haptic.tick(); webrtc.flipCamera(); };

  // Start WebRTC when caller initiates (not incoming)
  useEffect(() => {
    if (call && !isIncomingCall && callStatus === 'ringing' && socketRef.current) {
      webrtc.start();
    }
  }, [call, isIncomingCall, callStatus]);

  // Pulsing ring animation for ringing state
  const pulseScale = useSharedValue(1);
  const pulseOpacity = useSharedValue(0.5);

  useEffect(() => {
    if (callStatus === 'ringing') {
      pulseScale.value = withRepeat(
        withTiming(1.4, { duration: 1500 }),
        -1,
        true
      );
      pulseOpacity.value = withRepeat(
        withTiming(0, { duration: 1500 }),
        -1,
        true
      );
    }
  }, [callStatus]);

  const pulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulseScale.value }],
    opacity: pulseOpacity.value,
  }));

  const isIncoming = call?.callerId !== userId;
  const isVideo = call?.type === 'video';
  const otherUser = isIncoming ? call?.caller : call?.callee;
  const displayName = otherUser?.displayName || t('common.user');
  const avatarUrl = otherUser?.avatarUrl;

  const statusText = {
    ringing: isIncoming ? t('calls.ringing') : t('calls.calling'),
    connected: t('calls.connectedDuration', { duration: formatDuration(duration) }),
    ended: t('calls.callEnded'),
    missed: t('calls.missedCall'),
    declined: t('calls.declined'),
  }[callStatus];

  if (isLoading) {
    return (
      <View style={[styles.container, { backgroundColor: tc.bg }]}>
        <GlassHeader
          title={t('calls.call')}
          leftAction={{ icon: 'arrow-left', onPress: () => router.back(), accessibilityLabel: t('accessibility.goBack') }}
          borderless
        />
        <View style={[styles.center, { paddingTop: insets.top + 44 }]}>
          <Skeleton.Circle size={128} />
          <Skeleton.Rect width={200} height={20} style={{ marginTop: spacing.xl }} />
          <Skeleton.Rect width={120} height={16} style={{ marginTop: spacing.md }} />
          <View style={styles.controlsPlaceholder}>
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton.Circle key={i} size={56} />
            ))}
          </View>
        </View>
      </View>
    );
  }

  return (
    <ScreenErrorBoundary>
      <View style={[styles.container, { backgroundColor: tc.bg }]}>
        {/* Premium gradient background */}
        <LinearGradient
          colors={['rgba(10,123,79,0.15)', 'rgba(28,35,51,0.8)', tc.bg]}
          style={styles.gradientBg}
        />

        <GlassHeader
          title={isVideo ? t('calls.videoCall') : t('calls.voiceCall')}
          leftAction={{ icon: 'arrow-left', onPress: () => router.back(), accessibilityLabel: t('accessibility.goBack') }}
          borderless
        />

        <View style={[styles.center, { paddingTop: insets.top + 44 }]}>
          {/* Avatar with pulsing ring */}
          <View style={styles.avatarContainer}>
            {callStatus === 'ringing' && (
              <Animated.View style={[styles.pulseRing, pulseStyle]} />
            )}
            <Avatar
              uri={avatarUrl}
              name={displayName}
              size="3xl"
              showRing
              ringColor={callStatus === 'connected' ? colors.emerald : colors.gold}
            />
          </View>

          {/* Name with animated entrance */}
          <Animated.Text entering={FadeInUp.delay(100).duration(400)} style={[styles.name, { color: tc.text.primary }]}>
            {displayName}
          </Animated.Text>
          <Animated.Text entering={FadeInUp.delay(150).duration(400)} style={[styles.username, { color: tc.text.secondary }]}>
            @{otherUser?.username}
          </Animated.Text>

          {/* Status with animated transition */}
          <Animated.Text
            entering={FadeIn.delay(200).duration(300)}
            key={statusText}
            style={[
              styles.status,
              callStatus === 'connected' && styles.statusConnected,
              callStatus === 'ended' && styles.statusEnded,
            ]}
          >
            {statusText}
          </Animated.Text>

          {/* Video streams — remote full-screen, local PiP */}
          {isVideo && callStatus === 'connected' && webrtc.remoteStream && (
            <Animated.View entering={FadeInUp.delay(300).duration(400)} style={styles.videoPreview}>
              <RTCView
                streamURL={webrtc.remoteStream.toURL()}
                style={styles.remoteVideo}
                objectFit="cover"
                mirror={false}
              />
              {/* Local camera PiP */}
              {webrtc.localStream && (
                <View style={styles.localVideoPip}>
                  <RTCView
                    streamURL={webrtc.localStream.toURL()}
                    style={styles.localVideo}
                    objectFit="cover"
                    mirror={webrtc.isFrontCamera}
                    zOrder={1}
                  />
                </View>
              )}
            </Animated.View>
          )}
          {/* Fallback: video call connected but no remote stream yet */}
          {isVideo && callStatus === 'connected' && !webrtc.remoteStream && (
            <Animated.View entering={FadeInUp.delay(300).duration(400)} style={styles.videoPreview}>
              <LinearGradient
                colors={['rgba(45,53,72,0.6)', 'rgba(28,35,51,0.4)']}
                style={styles.videoPreviewGradient}
              >
                <Icon name="video" size="lg" color={tc.text.tertiary} />
                <Text style={[styles.videoPreviewText, { color: tc.text.tertiary }]}>{t('calls.connectingVideo')}</Text>
              </LinearGradient>
            </Animated.View>
          )}

          {/* Premium Controls */}
          <Animated.View entering={FadeInUp.delay(300).duration(400)} style={styles.controls}>
            {callStatus === 'ringing' && isIncoming ? (
              <>
                {/* Decline Button */}
                <Pressable
                  accessibilityRole="button"
                  style={styles.controlButton}
                  onPress={handleDecline}
                  disabled={declineMutation.isPending}

                >
                  <LinearGradient
                    colors={[colors.error, 'rgba(248,81,73,0.8)']}
                    style={styles.declineGradient}
                  >
                    {declineMutation.isPending ? (
                      <Skeleton.Rect width={24} height={24} borderRadius={radius.full} />
                    ) : (
                      <Icon name="x" size="xl" color={tc.text.primary} />
                    )}
                  </LinearGradient>
                  <Text style={[styles.controlLabel, { color: tc.text.primary }]}>{t('calls.decline')}</Text>
                </Pressable>

                {/* Answer Button */}
                <Pressable
                  accessibilityRole="button"
                  style={styles.controlButton}
                  onPress={handleAnswer}
                  disabled={answerMutation.isPending}

                >
                  <LinearGradient
                    colors={[colors.emerald, colors.gold]}
                    style={styles.answerGradient}
                  >
                    {answerMutation.isPending ? (
                      <Skeleton.Rect width={24} height={24} borderRadius={radius.full} />
                    ) : (
                      <Icon name="phone" size="xl" color={tc.text.primary} />
                    )}
                  </LinearGradient>
                  <Text style={[styles.controlLabel, { color: tc.text.primary }]}>{t('calls.answer')}</Text>
                </Pressable>
              </>
            ) : (
              <>
                {/* Mute Button */}
                <Pressable
                  accessibilityRole="button"
                  style={styles.controlButton}
                  onPress={toggleMute}

                >
                  <LinearGradient
                    colors={webrtc.isMuted ? [colors.emerald, colors.gold] : ['rgba(45,53,72,0.6)', 'rgba(28,35,51,0.4)']}
                    style={styles.controlGradient}
                  >
                    <Icon name={webrtc.isMuted ? 'volume-x' : 'mic'} size="lg" color={tc.text.primary} />
                  </LinearGradient>
                  <Text style={[styles.controlLabel, { color: tc.text.primary }]}>{webrtc.isMuted ? t('calls.unmute') : t('calls.mute')}</Text>
                </Pressable>

                {/* Speaker Button */}
                <Pressable
                  accessibilityRole="button"
                  style={styles.controlButton}
                  onPress={toggleSpeaker}

                >
                  <LinearGradient
                    colors={webrtc.isSpeakerOn ? [colors.emerald, colors.gold] : ['rgba(45,53,72,0.6)', 'rgba(28,35,51,0.4)']}
                    style={styles.controlGradient}
                  >
                    <Icon name="volume-x" size="lg" color={tc.text.primary} />
                  </LinearGradient>
                  <Text style={[styles.controlLabel, { color: tc.text.primary }]}>{webrtc.isSpeakerOn ? t('calls.speakerOff') : t('calls.speaker')}</Text>
                </Pressable>

                {/* Flip Camera Button */}
                {isVideo && (
                  <Pressable
                    accessibilityRole="button"
                    style={styles.controlButton}
                    onPress={toggleCamera}

                  >
                    <LinearGradient
                      colors={['rgba(45,53,72,0.6)', 'rgba(28,35,51,0.4)']}
                      style={styles.controlGradient}
                    >
                      <Icon name="repeat" size="lg" color={tc.text.primary} />
                    </LinearGradient>
                    <Text style={[styles.controlLabel, { color: tc.text.primary }]}>{t('calls.flip')}</Text>
                  </Pressable>
                )}

                {/* End Call Button */}
                <Pressable
                  accessibilityRole="button"
                  style={styles.controlButton}
                  onPress={handleEndCall}
                  disabled={endCallMutation.isPending}

                >
                  <LinearGradient
                    colors={[colors.error, 'rgba(248,81,73,0.8)']}
                    style={styles.endCallGradient}
                  >
                    {endCallMutation.isPending ? (
                      <Skeleton.Rect width={24} height={24} borderRadius={radius.full} />
                    ) : (
                      <Icon name="phone" size="xl" color={tc.text.primary} />
                    )}
                  </LinearGradient>
                  <Text style={[styles.controlLabel, { color: tc.text.primary }]}>{t('calls.end')}</Text>
                </Pressable>
              </>
            )}
          </Animated.View>
        </View>
      </View>

    </ScreenErrorBoundary>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.dark.bg,
  },
  gradientBg: {
    ...StyleSheet.absoluteFillObject,
  },
  controlLabel: {
    color: colors.text.primary,
    fontSize: fontSize.xs,
    fontWeight: '500',
    marginTop: spacing.sm,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.base,
  },
  avatarContainer: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pulseRing: {
    position: 'absolute',
    width: 140,
    height: 140,
    borderRadius: radius.full,
    backgroundColor: colors.emerald,
  },
  name: {
    color: colors.text.primary,
    fontSize: fontSize.xl,
    fontWeight: '700',
    marginTop: spacing.xl,
  },
  username: {
    color: colors.text.secondary,
    fontSize: fontSize.sm,
    marginTop: spacing.xs,
  },
  status: {
    color: colors.text.secondary,
    fontSize: fontSize.base,
    marginTop: spacing.lg,
    fontWeight: '600',
  },
  statusConnected: {
    color: colors.emerald,
  },
  statusEnded: {
    color: colors.error,
  },
  videoPreview: {
    marginTop: spacing.lg,
    width: '90%',
    aspectRatio: 4 / 3,
    borderRadius: radius.lg,
    overflow: 'hidden',
    position: 'relative',
  },
  remoteVideo: {
    width: '100%',
    height: '100%',
  },
  localVideoPip: {
    position: 'absolute',
    top: spacing.sm,
    end: spacing.sm,
    width: 100,
    height: 140,
    borderRadius: radius.md,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  localVideo: {
    width: '100%',
    height: '100%',
  },
  videoPreviewGradient: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.sm,
  },
  videoPreviewText: {
    color: colors.text.tertiary,
    fontSize: fontSize.xs,
  },
  controls: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.lg,
    marginTop: spacing['3xl'],
    flexWrap: 'wrap',
  },
  controlButton: {
    alignItems: 'center',
    gap: spacing.xs,
  },
  controlGradient: {
    width: 72,
    height: 72,
    borderRadius: radius.full,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  answerGradient: {
    width: 72,
    height: 72,
    borderRadius: radius.full,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: colors.emerald,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },
  declineGradient: {
    width: 72,
    height: 72,
    borderRadius: radius.full,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: colors.error,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },
  endCallGradient: {
    width: 72,
    height: 72,
    borderRadius: radius.full,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: colors.error,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },
  controlsPlaceholder: {
    flexDirection: 'row',
    gap: spacing.lg,
    marginTop: spacing['3xl'],
  },
});