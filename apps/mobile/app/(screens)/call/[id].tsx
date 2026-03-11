import { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, Pressable, TouchableOpacity,
  ActivityIndicator, Alert,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useUser } from '@clerk/clerk-expo';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { io, Socket } from 'socket.io-client';
import { Avatar } from '@/components/ui/Avatar';
import { Icon } from '@/components/ui/Icon';
import { GlassHeader } from '@/components/ui/GlassHeader';
import { Skeleton } from '@/components/ui/Skeleton';
import { colors, spacing, fontSize, radius, animation } from '@/theme';
import { callsApi } from '@/services/api';

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

const SOCKET_URL = `${(process.env.EXPO_PUBLIC_API_URL?.replace('/api/v1', '') || 'http://localhost:3000')}/chat`;

export default function CallScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user } = useUser();
  const userId = user?.id;
  const queryClient = useQueryClient();
  const insets = useSafeAreaInsets();
  const socketRef = useRef<Socket | null>(null);
  const [callStatus, setCallStatus] = useState<CallStatus>('ringing');
  const [isMuted, setIsMuted] = useState(false);
  const [isSpeaker, setIsSpeaker] = useState(false);
  const [isFrontCamera, setIsFrontCamera] = useState(true);
  const [duration, setDuration] = useState(0); // seconds
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const { data: call, isLoading } = useQuery({
    queryKey: ['call', id],
    queryFn: () => callsApi.getCall(id),
    enabled: !!id,
  });

  const answerMutation = useMutation({
    mutationFn: () => callsApi.answerCall(id),
    onSuccess: () => setCallStatus('connected'),
    onError: (err: Error) => Alert.alert('Error', err.message),
  });

  const endCallMutation = useMutation({
    mutationFn: () => callsApi.endCall(id),
    onSuccess: () => {
      setCallStatus('ended');
      router.back();
    },
    onError: (err: Error) => Alert.alert('Error', err.message),
  });

  const declineMutation = useMutation({
    mutationFn: () => callsApi.declineCall(id),
    onSuccess: () => {
      setCallStatus('declined');
      router.back();
    },
    onError: (err: Error) => Alert.alert('Error', err.message),
  });

  // Setup socket connection
  useEffect(() => {
    const socket = io(SOCKET_URL, {
      transports: ['websocket'],
      auth: { callId: id },
    });

    socket.on('call_accepted', () => {
      setCallStatus('connected');
    });
    socket.on('call_ended', () => {
      setCallStatus('ended');
      if (intervalRef.current) clearInterval(intervalRef.current);
      setTimeout(() => router.back(), 2000);
    });
    socket.on('call_ringing', () => {
      setCallStatus('ringing');
    });
    socket.on('call_missed', () => {
      setCallStatus('missed');
    });

    socketRef.current = socket;

    return () => {
      socket.disconnect();
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [id]);

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

  const handleAnswer = () => answerMutation.mutate();
  const handleDecline = () => declineMutation.mutate();
  const handleEndCall = () => endCallMutation.mutate();
  const toggleMute = () => setIsMuted(!isMuted);
  const toggleSpeaker = () => setIsSpeaker(!isSpeaker);
  const toggleCamera = () => setIsFrontCamera(!isFrontCamera);

  const isIncoming = call?.callerId !== userId;
  const isVideo = call?.type === 'video';
  const otherUser = isIncoming ? call?.caller : call?.callee;
  const displayName = otherUser?.displayName || 'User';
  const avatarUrl = otherUser?.avatarUrl;

  const statusText = {
    ringing: isIncoming ? 'Ringing...' : 'Calling...',
    connected: `Connected ${formatDuration(duration)}`,
    ended: 'Call Ended',
    missed: 'Missed Call',
    declined: 'Declined',
  }[callStatus];

  if (isLoading) {
    return (
      <View style={styles.container}>
        <GlassHeader
          title="Call"
          leftAction={{ icon: 'arrow-left', onPress: () => router.back(), accessibilityLabel: 'Go back' }}
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
    <View style={styles.container}>
      <GlassHeader
        title={isVideo ? 'Video Call' : 'Voice Call'}
        leftAction={{ icon: 'arrow-left', onPress: () => router.back(), accessibilityLabel: 'Go back' }}
        borderless
      />

      <View style={[styles.center, { paddingTop: insets.top + 44 }]}>
        {/* Avatar */}
        <Avatar
          uri={avatarUrl}
          name={displayName}
          size="3xl"
          showRing
          ringColor={colors.emerald}
        />

        {/* Name */}
        <Text style={styles.name}>{displayName}</Text>
        <Text style={styles.username}>@{otherUser?.username}</Text>

        {/* Status */}
        <Text style={styles.status}>{statusText}</Text>

        {/* Controls */}
        <View style={styles.controls}>
          {callStatus === 'ringing' && isIncoming ? (
            <>
              <TouchableOpacity
                style={[styles.controlButton, styles.declineButton]}
                onPress={handleDecline}
                disabled={declineMutation.isPending}
              >
                {declineMutation.isPending ? (
                  <ActivityIndicator color={colors.text.primary} size="small" />
                ) : (
                  <Icon name="x" size="xl" color={colors.text.primary} />
                )}
                <Text style={styles.controlLabel}>Decline</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.controlButton, styles.answerButton]}
                onPress={handleAnswer}
                disabled={answerMutation.isPending}
              >
                {answerMutation.isPending ? (
                  <ActivityIndicator color={colors.text.primary} size="small" />
                ) : (
                  <Icon name="phone" size="xl" color={colors.text.primary} />
                )}
                <Text style={styles.controlLabel}>Answer</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <TouchableOpacity
                style={[styles.controlButton, isMuted && styles.controlButtonActive]}
                onPress={toggleMute}
              >
                <Icon name={isMuted ? 'volume-x' : 'mic'} size="lg" color={colors.text.primary} />
                <Text style={styles.controlLabel}>{isMuted ? 'Unmute' : 'Mute'}</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.controlButton, isSpeaker && styles.controlButtonActive]}
                onPress={toggleSpeaker}
              >
                <Icon name="volume-x" size="lg" color={colors.text.primary} />
                <Text style={styles.controlLabel}>{isSpeaker ? 'Speaker Off' : 'Speaker'}</Text>
              </TouchableOpacity>

              {isVideo && (
                <TouchableOpacity
                  style={[styles.controlButton, styles.controlButtonActive]}
                  onPress={toggleCamera}
                >
                  <Icon name="repeat" size="lg" color={colors.text.primary} />
                  <Text style={styles.controlLabel}>Flip</Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity
                style={[styles.controlButton, styles.endCallButton]}
                onPress={handleEndCall}
                disabled={endCallMutation.isPending}
              >
                {endCallMutation.isPending ? (
                  <ActivityIndicator color={colors.text.primary} size="small" />
                ) : (
                  <Icon name="phone" size="xl" color={colors.text.primary} />
                )}
                <Text style={styles.controlLabel}>End</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.dark.bg,
  },
  controlLabel: {
    color: colors.text.primary,
    fontSize: fontSize.xs,
    fontWeight: '500',
    marginTop: spacing.xs,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.base,
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
    backgroundColor: colors.dark.surface,
    borderRadius: radius.full,
    padding: spacing.lg,
    width: 80,
    height: 80,
    justifyContent: 'center',
  },
  controlButtonActive: {
    backgroundColor: colors.active.emerald20,
  },
  answerButton: {
    backgroundColor: colors.emerald,
  },
  declineButton: {
    backgroundColor: colors.error,
  },
  endCallButton: {
    backgroundColor: colors.error,
  },
  controlsPlaceholder: {
    flexDirection: 'row',
    gap: spacing.lg,
    marginTop: spacing['3xl'],
  },
});