import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { View, Text, StyleSheet, Pressable, Vibration, Platform, ScrollView, StatusBar, useWindowDimensions } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useUser } from '@clerk/clerk-expo';
import { useQuery } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  FadeIn,
  FadeInUp,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { VideoTrack } from '@livekit/react-native';
import { Track, type RemoteParticipant } from 'livekit-client';
import type { TrackReference } from '@livekit/components-react';
import { Avatar } from '@/components/ui/Avatar';
import { Icon } from '@/components/ui/Icon';
import { GlassHeader } from '@/components/ui/GlassHeader';
import { Skeleton } from '@/components/ui/Skeleton';
import { showToast } from '@/components/ui/Toast';
import { colors, spacing, fontSize, radius } from '@/theme';
import { useTranslation } from '@/hooks/useTranslation';
import { useThemeColors } from '@/hooks/useThemeColors';
import { useContextualHaptic } from '@/hooks/useContextualHaptic';
import { useLiveKitCall, type CallType, type DataChannelMessage } from '@/hooks/useLiveKitCall';
import { livekitApi } from '@/services/livekit';
import type { CallSession } from '@/types';
import { ScreenErrorBoundary } from '@/components/ui/ScreenErrorBoundary';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { useStore } from '@/store';

// SCREEN_W is obtained from useWindowDimensions() inside the component
const RING_TIMEOUT_MS = 30_000; // 30s auto-cancel
const VIBRATION_PATTERN = [0, 500, 200, 500]; // vibrate pattern for incoming ring
const QUALITY_COLORS: Record<string, string> = {
  excellent: colors.emerald,
  good: colors.emerald,
  poor: colors.gold,
  lost: colors.error,
  unknown: colors.text.secondary,
};

// ── Helper: build a TrackReference from a participant ──
function cameraTrackRef(participant: RemoteParticipant): TrackReference | undefined {
  const pub = participant.getTrackPublication(Track.Source.Camera);
  if (!pub?.track) return undefined;
  return { participant, publication: pub, source: Track.Source.Camera } as TrackReference;
}

// ── Grid layout: how many columns for N participants ──
function gridCols(count: number): number {
  if (count <= 1) return 1;
  if (count <= 4) return 2;
  return 3;
}

export default function CallScreen() {
  const { id, roomName, sessionId, callType: callTypeParam, targetUserId, callerName: callerNameParam } = useLocalSearchParams<{
    id: string;
    roomName?: string;
    sessionId?: string;
    callType?: string;
    targetUserId?: string;
    callerName?: string;
  }>();
  const router = useRouter();
  const { user } = useUser();
  const userId = user?.id;
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const tc = useThemeColors();
  const haptic = useContextualHaptic();
  const { width: SCREEN_W } = useWindowDimensions();
  const [raisedHand, setRaisedHand] = useState(false);
  const [remoteRaisedHands, setRemoteRaisedHands] = useState<Set<string>>(new Set());
  const [reactions, setReactions] = useState<Array<{ emoji: string; id: number }>>([]);
  const [showVerification, setShowVerification] = useState(false);
  const [incomingAnswered, setIncomingAnswered] = useState(false);
  // Track fire-and-forget timers (reactions, debounce) to prevent setState on unmounted component
  const pendingTimersRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());
  useEffect(() => {
    return () => {
      for (const timer of pendingTimersRef.current) clearTimeout(timer);
      pendingTimersRef.current.clear();
    };
  }, []);

  const setTrackedTimeout = useCallback((fn: () => void, ms: number) => {
    const timer = setTimeout(() => {
      pendingTimersRef.current.delete(timer);
      fn();
    }, ms);
    pendingTimersRef.current.add(timer);
  }, []);

  const setActiveCall = useStore(s => s.setActiveCall);
  const setActiveCallDuration = useStore(s => s.setActiveCallDuration);

  const isIncoming = !!roomName && !!sessionId;

  const livekit = useLiveKitCall({
    isIncoming,
    roomName: roomName || undefined,
    sessionId: sessionId || undefined,
    callType: callTypeParam as CallType | undefined, // [F4] Pass from push params
  });

  // [F28 fix] Only keep screen awake during active call, not after it ends.
  useEffect(() => {
    const active = livekit.status === 'connected' || livekit.status === 'reconnecting'
      || livekit.status === 'ringing' || livekit.status === 'creating' || livekit.status === 'connecting';
    if (active) {
      activateKeepAwakeAsync('call');
    } else {
      deactivateKeepAwake('call');
    }
    return () => { deactivateKeepAwake('call'); };
  }, [livekit.status]);

  // Fetch active call info for display
  const { data: activeCall, isLoading } = useQuery({
    queryKey: ['active-call', id],
    queryFn: async () => {
      const result = await livekitApi.getActiveCall();
      return (result as { data: CallSession | null }).data;
    },
    enabled: !!id,
  });

  const call = activeCall;
  const isVideo = (callTypeParam === 'VIDEO') || (call?.callType === 'VIDEO');
  const otherParticipant = call?.participants?.find(
    (p: { userId: string; role: string }) => p.userId !== userId
  );
  const displayName = otherParticipant?.user?.displayName || otherParticipant?.user?.username || callerNameParam || t('common.user');
  const avatarUrl = otherParticipant?.user?.avatarUrl;

  // Update global store when call connects/ends (for floating bar)
  useEffect(() => {
    if (livekit.status === 'connected') {
      setActiveCall(id, displayName);
    } else if (livekit.status === 'ended' || livekit.status === 'failed') {
      setActiveCall(null, null);
    }
  }, [livekit.status, id, displayName, setActiveCall]);

  useEffect(() => {
    if (livekit.status === 'connected') setActiveCallDuration(livekit.duration);
  }, [livekit.duration, livekit.status, setActiveCallDuration]);

  // [F8] Do NOT clear activeCall on unmount — the floating bar needs to persist
  // when user navigates away during an active call. Only clear on ended/failed.
  // The endCall handler already sets activeCall(null, null) via the status effect above.

  // ── Vibration for incoming calls ──
  // Ringtone audio is handled by CallKit (iOS) / ConnectionService (Android) natively.
  // This only handles haptic vibration as a supplement.
  useEffect(() => {
    if (!isIncoming || incomingAnswered) return;

    // [F30 fix] Android: use Vibration.vibrate(pattern, repeat=true) instead of
    // setInterval + vibrate(pattern). The setInterval approach caused overlapping
    // vibrations when the interval fired while the previous pattern was still playing.
    // With repeat=true, the OS manages the pattern loop natively — no overlap.
    // iOS: Vibration.vibrate() always does a single 400ms pulse, patterns are ignored.
    // We use a longer interval (3s) for iOS to match a ring cadence.
    if (Platform.OS === 'android') {
      Vibration.vibrate(VIBRATION_PATTERN, true); // true = repeat
    } else {
      // iOS doesn't support patterns or repeat — use interval for periodic single pulse
      const vibInterval = setInterval(() => Vibration.vibrate(), 2500);
      return () => {
        clearInterval(vibInterval);
        Vibration.cancel();
      };
    }

    return () => { Vibration.cancel(); };
  }, [isIncoming, incomingAnswered]);

  // ── Caller-side ring timeout — SERVER-COORDINATED (F13 fix) ──
  //
  // Previous approach: a 30-second setTimeout that unilaterally called endCall().
  // Bug: callee answers at second 29, server marks session ACTIVE at 29.5s,
  // but the client's dumb timer fires at 30s and kills the call.
  //
  // New approach: poll the server every 2s. The server is the source of truth:
  //   - RINGING → still waiting (count elapsed time locally)
  //   - ACTIVE  → someone answered, cancel timeout
  //   - ENDED/MISSED/DECLINED → call is over, navigate back
  // After 30s of RINGING, the client ends the call. But it CHECKS server state
  // first — if the server says ACTIVE, it does NOT end, even past 30s.
  const ringStartRef = useRef<number>(0);
  // Ref for endCall so the poll callback doesn't need `livekit` in deps (which is
  // a new object every render and would reset the interval constantly).
  const endCallRef = useRef(livekit.endCall);
  endCallRef.current = livekit.endCall;

  useEffect(() => {
    const isRinging = livekit.status === 'ringing' || livekit.status === 'creating';
    if (!isRinging || isIncoming) return;

    // [N1 fix] Need the session ID to poll the specific session, not getActiveCall
    const callerSessionId = livekit.sessionId;
    if (!callerSessionId) return; // Session not created yet — will re-run when status changes

    ringStartRef.current = Date.now();
    let stopped = false;

    const pollInterval = setInterval(async () => {
      if (stopped) return;

      try {
        // [N1 fix] Poll the specific session by ID, consistent with callee-side (F16)
        const result = await livekitApi.getSession(callerSessionId);
        const session = (result as { data: CallSession | null }).data;

        if (!session || session.status === 'ENDED' || session.status === 'MISSED' || session.status === 'DECLINED') {
          // Server says call is over — respect it
          stopped = true;
          clearInterval(pollInterval);
          showToast({ message: t('calls.callEnded'), variant: 'info' });
          endCallRef.current();
          return;
        }

        if (session.status === 'ACTIVE') {
          // Someone joined — the call is live. Don't touch it.
          stopped = true;
          clearInterval(pollInterval);
          return;
        }

        // Still RINGING — check local elapsed time
        const elapsed = Date.now() - ringStartRef.current;
        if (elapsed >= RING_TIMEOUT_MS) {
          // 30s of confirmed RINGING on the server. Safe to end.
          stopped = true;
          clearInterval(pollInterval);
          showToast({ message: t('calls.noAnswer'), variant: 'warning' });
          endCallRef.current();
        }
      } catch {
        // Network error — don't end the call, just retry on next poll
      }
    }, 2000);

    return () => {
      stopped = true;
      clearInterval(pollInterval);
    };
  }, [livekit.status, isIncoming, t]);

  // ── Auto-degrade video on poor quality (only fires once per degradation) ──
  const degradedRef = useRef(false);
  const toggleCameraRef = useRef(livekit.toggleCamera);
  toggleCameraRef.current = livekit.toggleCamera;
  useEffect(() => {
    if (livekit.connectionQuality === 'poor' || livekit.connectionQuality === 'lost') {
      if (!degradedRef.current && livekit.isCameraOn && isVideo) {
        degradedRef.current = true;
        showToast({ message: t('calls.poorConnection'), variant: 'warning' });
        toggleCameraRef.current();
      }
    } else if (livekit.connectionQuality === 'excellent' || livekit.connectionQuality === 'good') {
      degradedRef.current = false;
    }
  }, [livekit.connectionQuality, livekit.isCameraOn, isVideo, t]);

  // [F29 fix] Auto-start outgoing call — fires once via ref guard, no eslint-disable needed.
  const autoStartedRef = useRef(false);
  const startCallRef = useRef(livekit.startCall);
  startCallRef.current = livekit.startCall;
  useEffect(() => {
    if (autoStartedRef.current) return;
    if (livekit.status !== 'idle') return;
    if (!isIncoming && targetUserId && callTypeParam) {
      autoStartedRef.current = true;
      startCallRef.current({ targetUserId, callType: callTypeParam as CallType });
    }
  }, [livekit.status, isIncoming, targetUserId, callTypeParam]);

  // ── Callee-side timeout: if caller hangs up, poll detects it ──
  const isWaitingForAnswerEarly = isIncoming && !incomingAnswered && livekit.status === 'idle';
  useEffect(() => {
    if (!isWaitingForAnswerEarly || !sessionId) return;

    // [F16 fix] Poll the specific session by ID, not getActiveCall() which could
    // return a different session if the user somehow has multiple active calls.
    const pollInterval = setInterval(async () => {
      try {
        const result = await livekitApi.getSession(sessionId);
        const session = (result as { data: CallSession | null }).data;
        // If the session no longer exists or is ENDED/MISSED/DECLINED, the caller hung up
        if (!session || session.status === 'ENDED' || session.status === 'MISSED' || session.status === 'DECLINED') {
          Vibration.cancel();
          showToast({ message: t('calls.callEnded'), variant: 'info' });
          if (router.canGoBack()) router.back();
        }
      } catch {
        // Network error during poll — ignore, will retry
      }
    }, 2000);

    // [F14 fix] Hard timeout at 35s (was 45s). Caller gives up at 30s and the
    // stale-session cleanup marks RINGING sessions as MISSED after 60s. The callee's
    // hard timeout should be just after the caller's (30s + 5s buffer) to avoid a
    // 15-second zombie window where the callee's phone rings but the room is gone.
    const hardTimeout = setTimeout(() => {
      Vibration.cancel();
      showToast({ message: t('calls.missedCall'), variant: 'info' });
      if (router.canGoBack()) router.back();
    }, 35_000);

    return () => {
      clearInterval(pollInterval);
      clearTimeout(hardTimeout);
    };
  }, [isWaitingForAnswerEarly, sessionId, router, t]);

  // [F29 fix] Join incoming call after Answer — use ref for joinCall to avoid livekit in deps
  const joinCallRef = useRef(livekit.joinCall);
  joinCallRef.current = livekit.joinCall;
  useEffect(() => {
    if (isIncoming && incomingAnswered && livekit.status === 'idle') {
      Vibration.cancel();
      joinCallRef.current();
    }
  }, [isIncoming, incomingAnswered, livekit.status]);

  // Handle data channel messages — use ref for stable subscription
  const onDataMessageRef = useRef(livekit.onDataMessage);
  onDataMessageRef.current = livekit.onDataMessage;
  useEffect(() => {
    const unsub = onDataMessageRef.current((msg: DataChannelMessage) => {
      switch (msg.topic) {
        case 'raise-hand':
          setRemoteRaisedHands(prev => {
            const next = new Set(prev);
            if ((msg.payload as { raised?: boolean }).raised) next.add(msg.senderIdentity);
            else next.delete(msg.senderIdentity);
            return next;
          });
          break;
        case 'reactions': {
          const emoji = (msg.payload as { emoji?: string }).emoji;
          if (emoji) {
            const rid = Date.now();
            // [F15] Cap at 10 simultaneous reactions to prevent jank from floods
            setReactions(prev => [...prev.slice(-9), { emoji, id: rid }]);
            setTrackedTimeout(() => setReactions(prev => prev.filter(r => r.id !== rid)), 3000);
          }
          break;
        }
      }
    });
    return unsub;
    // Subscribe once — ref keeps callback current without re-subscribing
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Show errors
  useEffect(() => {
    if (livekit.error) { showToast({ message: livekit.error, variant: 'error' }); haptic.error(); }
  }, [livekit.error, haptic]);

  // Navigate back on end
  useEffect(() => {
    if (livekit.status === 'ended') {
      const timer = setTimeout(() => { if (router.canGoBack()) router.back(); }, 1500);
      return () => clearTimeout(timer);
    }
  }, [livekit.status, router]);

  // ── Handlers with debounce guard ──
  const actionLockRef = useRef(false);
  const debounced = useCallback((fn: () => void) => {
    if (actionLockRef.current) return;
    actionLockRef.current = true;
    fn();
    setTrackedTimeout(() => { actionLockRef.current = false; }, 300);
  }, [setTrackedTimeout]);
  const handleEndCall = useCallback(() => debounced(() => { haptic.delete(); livekit.endCall(); }), [haptic, livekit, debounced]);
  const handleToggleMute = useCallback(() => debounced(() => { haptic.tick(); livekit.toggleMute(); }), [haptic, livekit, debounced]);
  const handleToggleSpeaker = useCallback(() => debounced(() => { haptic.tick(); livekit.toggleSpeaker(); }), [haptic, livekit, debounced]);
  const handleToggleCamera = useCallback(() => debounced(() => { haptic.tick(); livekit.toggleCamera(); }), [haptic, livekit, debounced]);
  const handleFlipCamera = useCallback(() => debounced(() => { haptic.tick(); livekit.flipCamera(); }), [haptic, livekit, debounced]);
  const handleToggleScreenShare = useCallback(() => debounced(() => { haptic.tick(); livekit.toggleScreenShare(); }), [haptic, livekit, debounced]);
  const handleRaiseHand = useCallback(() => {
    haptic.tick();
    const nr = !raisedHand;
    setRaisedHand(nr);
    livekit.sendDataMessage('raise-hand', { raised: nr });
  }, [haptic, livekit, raisedHand]);
  const handleSendReaction = useCallback((emoji: string) => {
    haptic.tick();
    livekit.sendDataMessage('reactions', { emoji });
    const rid = Date.now();
    setReactions(prev => [...prev, { emoji, id: rid }]);
    setTrackedTimeout(() => setReactions(prev => prev.filter(r => r.id !== rid)), 3000);
  }, [haptic, livekit, setTrackedTimeout]);
  const handleAnswer = useCallback(() => { haptic.success(); setIncomingAnswered(true); }, [haptic]);
  // [F5] Decline notifies the server (was previously a silent navigate-away)
  const handleDecline = useCallback(() => {
    haptic.delete();
    Vibration.cancel();
    livekit.declineCall();
    router.back();
  }, [haptic, livekit, router]);

  const formatDuration = (s: number) => {
    const m = Math.floor(s / 60);
    return `${m.toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`;
  };

  const statusText = useMemo(() => {
    switch (livekit.status) {
      case 'idle': case 'creating': return t('calls.calling');
      case 'ringing': return isIncoming ? t('calls.ringing') : t('calls.calling');
      case 'connecting': return t('calls.connecting');
      case 'connected': return t('calls.connectedDuration', { duration: formatDuration(livekit.duration) });
      case 'reconnecting': return t('calls.reconnecting');
      case 'ended': return t('calls.callEnded');
      case 'failed': return livekit.error || t('calls.callFailed');
      default: return '';
    }
  }, [livekit.status, livekit.duration, livekit.error, isIncoming, t]);

  // Pulse animation
  const pulseScale = useSharedValue(1);
  const pulseOpacity = useSharedValue(0.5);
  useEffect(() => {
    const ringing = livekit.status === 'ringing' || livekit.status === 'creating' || livekit.status === 'connecting';
    if (ringing) {
      pulseScale.value = withRepeat(withTiming(1.4, { duration: 1500 }), -1, true);
      pulseOpacity.value = withRepeat(withTiming(0, { duration: 1500 }), -1, true);
    } else { pulseScale.value = 1; pulseOpacity.value = 0; }
  }, [livekit.status, pulseScale, pulseOpacity]);
  const pulseStyle = useAnimatedStyle(() => ({ transform: [{ scale: pulseScale.value }], opacity: pulseOpacity.value }));

  // ── Build TrackReferences for VideoTrack ──
  const localTrackRef = useMemo((): TrackReference | undefined => {
    if (!isVideo || !livekit.isCameraOn || !livekit.localParticipant) return undefined;
    const pub = livekit.localParticipant.getTrackPublication(Track.Source.Camera);
    if (!pub?.track) return undefined;
    return { participant: livekit.localParticipant, publication: pub, source: Track.Source.Camera } as TrackReference;
  }, [isVideo, livekit.isCameraOn, livekit.localParticipant]);

  const remoteTrackRefs = useMemo((): Array<{ identity: string; trackRef: TrackReference; isSpeaking: boolean }> => {
    if (!isVideo || livekit.status !== 'connected') return [];
    return livekit.remoteParticipants
      .filter(p => p.isCameraOn)
      .map(p => {
        const tr = cameraTrackRef(p.participant);
        return tr ? { identity: p.identity, trackRef: tr, isSpeaking: p.isSpeaking } : null;
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);
  }, [isVideo, livekit.status, livekit.remoteParticipants]);

  const isActive = livekit.status === 'connected' || livekit.status === 'reconnecting';
  const isPreConnect = livekit.status === 'idle' || livekit.status === 'creating' || livekit.status === 'ringing' || livekit.status === 'connecting';
  const isWaitingForAnswer = isIncoming && !incomingAnswered && livekit.status === 'idle';
  const qualityColor = QUALITY_COLORS[livekit.connectionQuality] || QUALITY_COLORS.unknown;

  if (isLoading && !isIncoming) {
    return (
      <View style={[styles.container, { backgroundColor: tc.bg }]}>
        <GlassHeader title={t('calls.call')} leftAction={{ icon: 'arrow-left', onPress: () => router.back(), accessibilityLabel: t('accessibility.goBack') }} borderless />
        <View style={[styles.center, { paddingTop: insets.top + 44 }]}>
          <Skeleton.Circle size={128} />
          <Skeleton.Rect width={200} height={20} style={{ marginTop: spacing.xl }} />
          <Skeleton.Rect width={120} height={16} style={{ marginTop: spacing.md }} />
          <View style={styles.controlsPlaceholder}>
            {Array.from({ length: 4 }).map((_, i) => <Skeleton.Circle key={i} size={56} />)}
          </View>
        </View>
      </View>
    );
  }

  // ── Video grid for group calls ──
  const renderVideoGrid = () => {
    if (!isVideo || !isActive || remoteTrackRefs.length === 0) return null;

    // 1:1 — fullscreen remote + local PiP
    if (remoteTrackRefs.length === 1) {
      return (
        <>
          <VideoTrack
            trackRef={remoteTrackRefs[0].trackRef}
            style={styles.fullscreenVideo}
            objectFit="cover"
            iosPIP={{ enabled: true, startAutomatically: true, preferredSize: { width: 9, height: 16 } }}
          />
          {localTrackRef && (
            <View style={[styles.localVideoPiP, { top: insets.top + 60 }]}>
              <VideoTrack trackRef={localTrackRef} style={styles.localVideoInner} objectFit="cover" mirror zOrder={1} />
            </View>
          )}
        </>
      );
    }

    // Group — adaptive grid with speaker spotlight
    const cols = gridCols(remoteTrackRefs.length + (localTrackRef ? 1 : 0));
    const tileW = (SCREEN_W - spacing.xs * (cols + 1)) / cols;
    const tileH = tileW * 1.33; // 3:4 aspect
    // Speaker spotlight: active speaker gets full width
    const spotlightW = SCREEN_W - spacing.xs * 2;
    const spotlightH = spotlightW * 0.75; // 4:3 landscape for spotlight

    const allTiles = [
      ...(localTrackRef ? [{ key: 'local', trackRef: localTrackRef, mirror: true, isSpeaking: false }] : []),
      ...remoteTrackRefs.map(r => ({ key: r.identity, trackRef: r.trackRef, mirror: false, isSpeaking: r.isSpeaking })),
    ];

    // Find active speaker for spotlight (only when 3+ participants)
    const activeSpeaker = allTiles.length >= 3 ? allTiles.find(t => t.isSpeaking) : null;
    const nonSpeakers = activeSpeaker ? allTiles.filter(t => t.key !== activeSpeaker.key) : allTiles;

    return (
      <ScrollView
        contentContainerStyle={[styles.videoGrid, { paddingTop: insets.top + 50, paddingBottom: 200 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Spotlight: active speaker gets full-width tile */}
        {activeSpeaker && (
          <View key={activeSpeaker.key} style={[styles.videoTile, styles.videoTileSpeaking, { width: spotlightW, height: spotlightH }]}>
            <VideoTrack trackRef={activeSpeaker.trackRef} style={styles.videoTileInner} objectFit="cover" mirror={activeSpeaker.mirror} />
            <Text style={styles.videoTileLabel}>{activeSpeaker.key === 'local' ? t('calls.you') : activeSpeaker.key}</Text>
          </View>
        )}
        {/* Remaining participants in grid */}
        {nonSpeakers.map(tile => (
          <View
            key={tile.key}
            style={[
              styles.videoTile,
              { width: tileW, height: tileH },
              tile.isSpeaking && styles.videoTileSpeaking,
            ]}
          >
            <VideoTrack trackRef={tile.trackRef} style={styles.videoTileInner} objectFit="cover" mirror={tile.mirror} />
            <Text style={styles.videoTileLabel}>{tile.key === 'local' ? t('calls.you') : tile.key}</Text>
          </View>
        ))}
      </ScrollView>
    );
  };

  return (
    <ScreenErrorBoundary>
      <View style={[styles.container, { backgroundColor: tc.bg }]}>
        <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />
        <LinearGradient colors={['rgba(10,123,79,0.15)', 'rgba(28,35,51,0.8)', tc.bg]} style={styles.gradientBg} />

        {/* Video grid (replaces old RTCView) */}
        {renderVideoGrid()}

        <GlassHeader
          title={isVideo ? t('calls.videoCall') : t('calls.voiceCall')}
          leftAction={{ icon: 'arrow-left', onPress: () => router.back(), accessibilityLabel: t('accessibility.goBack') }}
          borderless
        />

        {/* E2EE indicator */}
        {livekit.isE2EEEnabled && isActive && (
          <Pressable
            style={[styles.e2eeIndicator, { top: insets.top + 50 }]}
            onPress={() => setShowVerification(v => !v)}
            accessibilityRole="button"
            accessibilityLabel={t('calls.e2eeVerification')}
          >
            <Icon name="lock" size="sm" color={colors.emerald} />
            <Text style={styles.e2eeText}>{t('calls.encrypted')}</Text>
          </Pressable>
        )}

        {/* Emoji verification overlay */}
        {showVerification && livekit.isE2EEEnabled && (
          <Animated.View entering={FadeIn.duration(200)} style={[styles.verificationOverlay, { top: insets.top + 80 }]}>
            <Text style={[styles.verificationTitle, { color: tc.text.primary }]}>{t('calls.verifyEncryption')}</Text>
            <View style={styles.emojiRow}>
              {livekit.e2eeVerificationEmojis.map((emoji, i) => <Text key={i} style={styles.verificationEmoji}>{emoji}</Text>)}
            </View>
            <Text style={[styles.verificationHint, { color: tc.text.secondary }]}>
              {t('calls.verifyHint') + '\n' + t('calls.verifyHow')}
            </Text>
          </Animated.View>
        )}

        {/* Floating reactions — staggered positions */}
        {reactions.map((r, i) => (
          <Animated.Text
            key={r.id}
            entering={FadeInUp.duration(500)}
            style={[
              styles.floatingReaction,
              { end: spacing.xl + (i % 3) * 30, bottom: `${30 + (i % 4) * 5}%` },
            ]}
          >
            {r.emoji}
          </Animated.Text>
        ))}

        {/* Connection quality (real metrics) */}
        {isActive && (
          <View style={[styles.qualityIndicator, { top: insets.top + 50, end: spacing.base }]}>
            <View style={[styles.qualityDot, { backgroundColor: qualityColor }]} />
            <Text style={[styles.qualityText, { color: qualityColor }]}>
              {livekit.connectionQuality === 'unknown' ? '' : livekit.connectionQuality}
            </Text>
          </View>
        )}

        <View style={[styles.center, { paddingTop: insets.top + 44 }]}>
          {/* Avatar (voice calls or when no video) */}
          {(!isVideo || remoteTrackRefs.length === 0 || !isActive) && (
            <>
              <View style={styles.avatarContainer}>
                {isPreConnect && <Animated.View style={[styles.pulseRing, pulseStyle]} />}
                <Avatar uri={avatarUrl} name={displayName} size="3xl" showRing ringColor={isActive ? colors.emerald : colors.gold} />
              </View>
              <Animated.Text entering={FadeInUp.delay(100).duration(400)} style={[styles.name, { color: tc.text.primary }]}>
                {displayName}
              </Animated.Text>
            </>
          )}

          <Animated.Text
            entering={FadeIn.delay(200).duration(300)}
            key={statusText}
            style={[
              styles.status,
              { color: tc.text.secondary },
              isActive && styles.statusConnected,
              (livekit.status === 'ended' || livekit.status === 'failed') && styles.statusEnded,
              livekit.status === 'reconnecting' && styles.statusReconnecting,
            ]}
          >
            {statusText}
          </Animated.Text>

          {livekit.remoteParticipants.length > 1 && isActive && (
            <Text style={[styles.participantCount, { color: tc.text.secondary }]}>
              {t('calls.participantCount', { count: livekit.remoteParticipants.length + 1 })}
            </Text>
          )}

          {remoteRaisedHands.size > 0 && (
            <View style={styles.raisedHandsBanner}>
              <Icon name="hand" size="sm" color={colors.gold} />
              <Text style={styles.raisedHandsText}>{Array.from(remoteRaisedHands).join(', ')}</Text>
            </View>
          )}

          {isVideo && isPreConnect && (
            <Animated.View entering={FadeInUp.delay(300).duration(400)} style={styles.videoPreview}>
              <LinearGradient colors={['rgba(45,53,72,0.6)', 'rgba(28,35,51,0.4)']} style={styles.videoPreviewGradient}>
                <Icon name="video" size="lg" color={tc.text.tertiary} />
                <Text style={[styles.videoPreviewText, { color: tc.text.tertiary }]}>{t('calls.connectingVideo')}</Text>
              </LinearGradient>
            </Animated.View>
          )}

          {/* Incoming: Answer / Decline */}
          {isWaitingForAnswer && (
            <Animated.View entering={FadeInUp.delay(300).duration(400)} style={styles.controls}>
              <Pressable accessibilityRole="button" style={styles.controlButton} onPress={handleDecline}>
                <LinearGradient colors={[colors.error, 'rgba(248,81,73,0.8)']} style={styles.endCallGradient}>
                  <Icon name="x" size="xl" color={tc.text.primary} />
                </LinearGradient>
                <Text style={[styles.controlLabel, { color: tc.text.primary }]}>{t('calls.decline')}</Text>
              </Pressable>
              <Pressable accessibilityRole="button" style={styles.controlButton} onPress={handleAnswer}>
                <LinearGradient colors={[colors.emerald, 'rgba(10,123,79,0.85)']} style={styles.endCallGradient}>
                  <Icon name="phone" size="xl" color={tc.text.primary} />
                </LinearGradient>
                <Text style={[styles.controlLabel, { color: tc.text.primary }]}>{t('calls.answer')}</Text>
              </Pressable>
            </Animated.View>
          )}

          {/* Controls */}
          {!isWaitingForAnswer && (
            <Animated.View entering={FadeInUp.delay(300).duration(400)} style={styles.controls}>
              <Pressable accessibilityRole="button" style={styles.controlButton} onPress={handleToggleMute}>
                <LinearGradient colors={livekit.isMuted ? [colors.emerald, colors.gold] : ['rgba(45,53,72,0.6)', 'rgba(28,35,51,0.4)']} style={styles.controlGradient}>
                  <Icon name={livekit.isMuted ? 'mic-off' : 'mic'} size="lg" color={tc.text.primary} />
                </LinearGradient>
                <Text style={[styles.controlLabel, { color: tc.text.primary }]}>{livekit.isMuted ? t('calls.unmute') : t('calls.mute')}</Text>
              </Pressable>

              <Pressable accessibilityRole="button" style={styles.controlButton} onPress={handleToggleSpeaker}>
                <LinearGradient colors={livekit.isSpeakerOn ? [colors.emerald, colors.gold] : ['rgba(45,53,72,0.6)', 'rgba(28,35,51,0.4)']} style={styles.controlGradient}>
                  <Icon name={livekit.isSpeakerOn ? 'volume-2' : 'volume-x'} size="lg" color={tc.text.primary} />
                </LinearGradient>
                <Text style={[styles.controlLabel, { color: tc.text.primary }]}>{livekit.isSpeakerOn ? t('calls.speakerOff') : t('calls.speaker')}</Text>
              </Pressable>

              {isVideo && (
                <Pressable accessibilityRole="button" style={styles.controlButton} onPress={handleToggleCamera}>
                  <LinearGradient colors={livekit.isCameraOn ? ['rgba(45,53,72,0.6)', 'rgba(28,35,51,0.4)'] : [colors.emerald, colors.gold]} style={styles.controlGradient}>
                    <Icon name={livekit.isCameraOn ? 'video' : 'video-off'} size="lg" color={tc.text.primary} />
                  </LinearGradient>
                  <Text style={[styles.controlLabel, { color: tc.text.primary }]}>{livekit.isCameraOn ? t('calls.cameraOff') : t('calls.cameraOn')}</Text>
                </Pressable>
              )}

              {isVideo && livekit.isCameraOn && (
                <Pressable accessibilityRole="button" style={styles.controlButton} onPress={handleFlipCamera}>
                  <LinearGradient colors={['rgba(45,53,72,0.6)', 'rgba(28,35,51,0.4)']} style={styles.controlGradient}>
                    <Icon name="repeat" size="lg" color={tc.text.primary} />
                  </LinearGradient>
                  <Text style={[styles.controlLabel, { color: tc.text.primary }]}>{t('calls.flip')}</Text>
                </Pressable>
              )}

              {isActive && (
                <Pressable accessibilityRole="button" style={styles.controlButton} onPress={handleToggleScreenShare}>
                  <LinearGradient colors={livekit.isScreenSharing ? [colors.emerald, colors.gold] : ['rgba(45,53,72,0.6)', 'rgba(28,35,51,0.4)']} style={styles.controlGradient}>
                    <Icon name="monitor" size="lg" color={tc.text.primary} />
                  </LinearGradient>
                  <Text style={[styles.controlLabel, { color: tc.text.primary }]}>{livekit.isScreenSharing ? t('calls.stopShare') : t('calls.share')}</Text>
                </Pressable>
              )}

              {isActive && livekit.remoteParticipants.length > 0 && (
                <Pressable accessibilityRole="button" style={styles.controlButton} onPress={handleRaiseHand}>
                  <LinearGradient colors={raisedHand ? [colors.gold, colors.emerald] : ['rgba(45,53,72,0.6)', 'rgba(28,35,51,0.4)']} style={styles.controlGradient}>
                    <Icon name="hand" size="lg" color={tc.text.primary} />
                  </LinearGradient>
                  <Text style={[styles.controlLabel, { color: tc.text.primary }]}>{t('calls.raiseHand')}</Text>
                </Pressable>
              )}

              <Pressable accessibilityRole="button" style={styles.controlButton} onPress={handleEndCall} disabled={livekit.status === 'ended'}>
                <LinearGradient colors={[colors.error, 'rgba(248,81,73,0.8)']} style={styles.endCallGradient}>
                  <Icon name="phone-off" size="xl" color={tc.text.primary} />
                </LinearGradient>
                <Text style={[styles.controlLabel, { color: tc.text.primary }]}>{t('calls.end')}</Text>
              </Pressable>
            </Animated.View>
          )}

          {isActive && (
            <View style={styles.reactionBar}>
              {['\u{1F44D}', '\u{2764}', '\u{1F602}', '\u{1F44F}', '\u{1F389}'].map((emoji) => (
                                <Pressable
                  accessibilityRole="button"
                  key={emoji}
                  onPress={() => handleSendReaction(emoji)}
                  style={styles.reactionButton}
                >
                  <Text style={styles.reactionEmoji}>{emoji}</Text>
                </Pressable>
              ))}
            </View>
          )}
        </View>
      </View>
    </ScreenErrorBoundary>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  gradientBg: { ...StyleSheet.absoluteFillObject },
  fullscreenVideo: { ...StyleSheet.absoluteFillObject },
  localVideoPiP: {
    position: 'absolute', end: spacing.base, width: 120, height: 160,
    borderRadius: radius.md, overflow: 'hidden', zIndex: 10,
    borderWidth: 2, borderColor: 'rgba(255,255,255,0.2)',
  },
  localVideoInner: { flex: 1 },
  videoGrid: {
    flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center',
    gap: spacing.xs, paddingHorizontal: spacing.xs,
  },
  videoTile: {
    borderRadius: radius.md, overflow: 'hidden',
    borderWidth: 2, borderColor: 'transparent',
  },
  videoTileSpeaking: { borderColor: colors.emerald },
  videoTileInner: { flex: 1 },
  videoTileLabel: {
    position: 'absolute', bottom: spacing.xs, start: spacing.sm,
    color: 'rgba(255,255,255,0.95)', fontSize: fontSize.xs, fontWeight: '600',
    textShadowColor: 'rgba(0,0,0,0.7)', textShadowRadius: 4,
    textShadowOffset: { width: 0, height: 1 },
  },
  controlLabel: { fontSize: fontSize.xs, fontWeight: '500', marginTop: spacing.sm },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.base },
  avatarContainer: { position: 'relative', alignItems: 'center', justifyContent: 'center' },
  pulseRing: { position: 'absolute', width: 140, height: 140, borderRadius: radius.full, backgroundColor: colors.emerald },
  name: { fontSize: fontSize.xl, fontWeight: '700', marginTop: spacing.xl },
  status: { fontSize: fontSize.base, marginTop: spacing.lg, fontWeight: '600' },
  statusConnected: { color: colors.emerald },
  statusEnded: { color: colors.error },
  statusReconnecting: { color: colors.gold },
  participantCount: { fontSize: fontSize.sm, marginTop: spacing.sm },
  videoPreview: { marginTop: spacing.lg, width: '90%', aspectRatio: 4 / 3, borderRadius: radius.lg, overflow: 'hidden' },
  videoPreviewGradient: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: spacing.sm },
  videoPreviewText: { fontSize: fontSize.xs },
  controls: { flexDirection: 'row', justifyContent: 'center', gap: spacing.lg, marginTop: spacing['3xl'], flexWrap: 'wrap' },
  controlButton: { alignItems: 'center', gap: spacing.xs },
  controlGradient: { width: 64, height: 64, borderRadius: radius.full, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  endCallGradient: { width: 72, height: 72, borderRadius: radius.full, justifyContent: 'center', alignItems: 'center', shadowColor: colors.error, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 12, elevation: 8 },
  controlsPlaceholder: { flexDirection: 'row', gap: spacing.lg, marginTop: spacing['3xl'] },
  e2eeIndicator: {
    position: 'absolute', start: spacing.base, flexDirection: 'row', alignItems: 'center',
    gap: spacing.xs, backgroundColor: 'rgba(10,123,79,0.2)', paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs, borderRadius: radius.full, zIndex: 10,
  },
  e2eeText: { color: colors.emerald, fontSize: fontSize.xs, fontWeight: '600' },
  verificationOverlay: {
    position: 'absolute', start: spacing.base, end: spacing.base,
    backgroundColor: 'rgba(28,35,51,0.95)', borderRadius: radius.lg,
    padding: spacing.xl, alignItems: 'center', zIndex: 20,
  },
  verificationTitle: { fontSize: fontSize.md, fontWeight: '700', marginBottom: spacing.md },
  emojiRow: { flexDirection: 'row', gap: spacing.md },
  verificationEmoji: { fontSize: fontSize.xl + 4 },
  verificationHint: { fontSize: fontSize.xs, marginTop: spacing.md, textAlign: 'center' },
  qualityIndicator: { position: 'absolute', zIndex: 10, flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  qualityDot: { width: 8, height: 8, borderRadius: radius.sm },
  qualityText: { fontSize: fontSize.xs, fontWeight: '600', textTransform: 'capitalize' },
  raisedHandsBanner: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: 'rgba(200,150,62,0.2)', paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs, borderRadius: radius.full, marginTop: spacing.sm,
  },
  raisedHandsText: { color: colors.gold, fontSize: fontSize.xs, fontWeight: '600' },
  reactionBar: {
    flexDirection: 'row', gap: spacing.md, marginTop: spacing.xl,
    backgroundColor: 'rgba(45,53,72,0.4)', paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm, borderRadius: radius.full,
  },
  reactionButton: { padding: spacing.xs },
  reactionEmoji: { fontSize: fontSize.xl },
  floatingReaction: { position: 'absolute', fontSize: fontSize.xl * 1.67, zIndex: 30 },
});
