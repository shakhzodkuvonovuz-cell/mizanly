import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, Pressable, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { Audio } from 'expo-av';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, spacing, fontSize, radius } from '@/theme';
import { Icon } from '@/components/ui/Icon';
import { Skeleton } from '@/components/ui/Skeleton';
import { GlassHeader } from '@/components/ui/GlassHeader';
import { GradientButton } from '@/components/ui/GradientButton';
import { uploadApi } from '@/services/api';
import { useContextualHaptic } from '@/hooks/useContextualHaptic';
import { useTranslation } from '@/hooks/useTranslation';
import { useThemeColors } from '@/hooks/useThemeColors';
import { ScreenErrorBoundary } from '@/components/ui/ScreenErrorBoundary';
import { showToast } from '@/components/ui/Toast';

const MAX_TIME = 300; // 5 minutes

type State = 'idle' | 'recording' | 'recorded' | 'playing';

export default function VoiceRecorderScreen() {
  const tc = useThemeColors();
  const s = createS(tc);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const haptic = useContextualHaptic();
  const { t } = useTranslation();
  const [state, setState] = useState<State>('idle');
  const [time, setTime] = useState(0);
  const [uri, setUri] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [levels, setLevels] = useState<number[]>([]);
  const recording = useRef<Audio.Recording | null>(null);
  const sound = useRef<Audio.Sound | null>(null);
  const timer = useRef<NodeJS.Timeout | null>(null);
  const levelTimer = useRef<NodeJS.Timeout | null>(null);
  const stopRef = useRef<() => void>(() => {});

  useEffect(() => () => {
    timer.current && clearInterval(timer.current);
    levelTimer.current && clearInterval(levelTimer.current);
    sound.current?.unloadAsync();
    recording.current?.stopAndUnloadAsync();
  }, []);

  const format = (s: number) =>
    `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`;

  const start = useCallback(async () => {
    const { granted } = await Audio.requestPermissionsAsync();
    if (!granted) {
      showToast({ message: t('screens.voiceRecorder.microphoneRequired'), variant: 'error' });
      return;
    }
    await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
    const rec = new Audio.Recording();
    await rec.prepareToRecordAsync({
      ...Audio.RecordingOptionsPresets.HIGH_QUALITY,
      isMeteringEnabled: true,
    });
    await rec.startAsync();
    recording.current = rec;
    setState('recording');
    setTime(0);
    setLevels([]);
    haptic.send();
    const timeRef = { value: 0 };
    timer.current = setInterval(() => {
      timeRef.value += 1;
      if (timeRef.value >= MAX_TIME) {
        stopRef.current();
        return;
      }
      setTime(timeRef.value);
    }, 1000);
    levelTimer.current = setInterval(async () => {
      if (!recording.current) return;
      try {
        const status = await recording.current.getStatusAsync();
        if (status.isRecording && status.metering != null) {
          // Normalize metering (dBFS, typically -160..0) to 0..100 range
          const normalized = Math.max(0, Math.min(100, (status.metering + 60) * (100 / 60)));
          setLevels((l) => {
            const updated = [...l, normalized];
            if (updated.length > 20) updated.shift();
            return updated;
          });
        }
      } catch {
        // Recording may have stopped between interval ticks
      }
    }, 100);
  }, [haptic]); // stop is accessed via stopRef to avoid stale closure

  const stop = useCallback(async () => {
    timer.current && clearInterval(timer.current);
    levelTimer.current && clearInterval(levelTimer.current);
    if (!recording.current) return;
    const rec = recording.current;
    recording.current = null;
    await rec.stopAndUnloadAsync();
    const u = rec.getURI();
    if (!u) {
      showToast({ message: t('screens.voiceRecorder.recordingFailed'), variant: 'error' });
      setState('idle');
      return;
    }
    setUri(u);
    setState('recorded');
    haptic.tick();
  }, [haptic, t]);

  // Keep stopRef in sync with the latest stop callback
  stopRef.current = stop;

  const play = useCallback(async () => {
    if (!uri) return;
    await Audio.setAudioModeAsync({ allowsRecordingIOS: false, playsInSilentModeIOS: true });
    const { sound: snd } = await Audio.Sound.createAsync({ uri });
    sound.current = snd;
    setState('playing');
    await snd.playAsync();
    snd.setOnPlaybackStatusUpdate((status) => {
      if (status.isLoaded && status.didJustFinish) {
        setState('recorded');
        snd.unloadAsync();
        sound.current = null;
      }
    });
  }, [uri]);

  const stopPlay = useCallback(async () => {
    if (sound.current) {
      await sound.current.stopAsync();
      await sound.current.unloadAsync();
      sound.current = null;
    }
    setState('recorded');
  }, []);

  const send = useCallback(async () => {
    if (!uri) return;
    setUploading(true);
    try {
      const presign = await uploadApi.getPresignUrl('audio/m4a', 'voice-messages');
      const response = await fetch(uri);
      const blob = await response.blob();
      await fetch(presign.uploadUrl, { method: 'PUT', body: blob, headers: { 'Content-Type': 'audio/m4a' } });
      // Navigate back after successful upload
      router.back();
    } catch {
      showToast({ message: t('voiceRecorder.uploadFailed'), variant: 'error' });
    } finally {
      setUploading(false);
    }
  }, [uri, router, t]);

  const cancel = useCallback(() => {
    if (state !== 'idle') {
      Alert.alert(t('screens.voiceRecorder.discardRecording'), t('screens.voiceRecorder.discardConfirm'), [
        { text: t('screens.voiceRecorder.keep'), style: 'cancel' },
        {
          text: t('screens.voiceRecorder.discard'),
          style: 'destructive',
          onPress: () => {
            sound.current?.unloadAsync();
            recording.current?.stopAndUnloadAsync();
            setState('idle');
            setUri(null);
            setTime(0);
            setLevels([]);
          },
        },
      ]);
    } else {
      router.back();
    }
  }, [state, router]);

  const isRecording = state === 'recording';
  const isRecorded = state === 'recorded';
  const isPlaying = state === 'playing';

  // Memoize idle amplitude bars to prevent re-allocation on each render
  const idleBars = useMemo(() => Array(20).fill(0), []);

  return (
    <ScreenErrorBoundary>
      <SafeAreaView style={s.container} edges={['top', 'bottom']}>
        <GlassHeader
          title={t('screens.voiceRecorder.title')}
          leftAction={{ icon: 'arrow-left', onPress: cancel, accessibilityLabel: t('common.back') }}
        />

        <View style={[s.content, { paddingTop: insets.top + 52 }]}>
          <Animated.View entering={FadeInUp.delay(0).duration(400)} style={s.glassCard}>
            <LinearGradient
              colors={colors.gradient.cardDark}
              style={s.cardGradient}
            >
              <View style={s.timerContainer}>
                <LinearGradient
                  colors={isRecording ? ['rgba(248,81,73,0.2)', 'rgba(248,81,73,0.1)'] : ['rgba(10,123,79,0.2)', 'rgba(200,150,62,0.1)']}
                  style={s.timerIconBg}
                >
                  <Icon
                    name={isRecording || isPlaying ? 'mic' : isRecorded ? 'check' : 'mic'}
                    size="lg"
                    color={isRecording ? colors.error : colors.emerald}
                  />
                </LinearGradient>
                <Text style={s.timerText}>{format(time)}</Text>
                <Text style={s.timerSubtext}>
                  {isRecording ? t('screens.voiceRecorder.recording') : isPlaying ? t('screens.voiceRecorder.playing') : isRecorded ? t('screens.voiceRecorder.recorded') : t('screens.voiceRecorder.readyToRecord')}
                </Text>
              </View>

              <View style={s.amplitudeContainer}>
                {(isRecording ? levels : idleBars).map((l, idx) => (
                  <View
                    key={idx}
                    style={[
                      s.amplitudeBar,
                      {
                        height: 8 + (isRecording ? l * 0.3 : 0),
                        backgroundColor: isRecording ? colors.emerald : tc.text.tertiary,
                      },
                    ]}
                  />
                ))}
              </View>

              <Pressable
                accessibilityRole="button"
                style={s.recordButtonWrap}
                onPress={isRecording ? stop : isPlaying ? stopPlay : isRecorded ? play : start}
              >
                <LinearGradient
                  colors={isRecording ? ['rgba(248,81,73,0.8)', 'rgba(248,81,73,0.4)'] : ['rgba(10,123,79,0.8)', 'rgba(200,150,62,0.4)']}
                  style={[s.recordButton, (isRecorded || isPlaying) && s.playButton]}
                >
                  <Icon
                    name={isRecording || isPlaying ? 'pause' : isRecorded ? 'play' : 'mic'}
                    size="xl"
                    color="#FFF"
                  />
                </LinearGradient>
              </Pressable>

              <Text style={s.hintText}>
                {isRecording
                  ? t('screens.voiceRecorder.tapToStop')
                  : isPlaying
                    ? t('screens.voiceRecorder.tapToStopPlayback')
                    : isRecorded
                      ? t('screens.voiceRecorder.tapToListen')
                      : t('screens.voiceRecorder.tapToStart')}
              </Text>
            </LinearGradient>
          </Animated.View>
        </View>

        <View style={s.footer}>
          <GradientButton
            label={state === 'idle' ? t('common.cancel') : t('screens.voiceRecorder.discard')}
            onPress={cancel}
            variant="secondary"
            disabled={uploading}
          />
          <GradientButton
            label={uploading ? '…' : t('screens.voiceRecorder.send')}
            onPress={send}
            disabled={!uri || uploading}
          />
        </View>
      </SafeAreaView>
  
    </ScreenErrorBoundary>
  );
}

const createS = (tc: ReturnType<typeof useThemeColors>) => StyleSheet.create({
  container: { flex: 1, backgroundColor: tc.bg },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing['2xl'],
  },
  glassCard: {
    width: '100%',
    borderRadius: radius.lg,
  },
  cardGradient: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.active.white6,
    padding: spacing['2xl'],
    alignItems: 'center',
  },
  timerContainer: { alignItems: 'center', marginBottom: spacing['2xl'] },
  timerIconBg: {
    width: 56,
    height: 56,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  timerText: { fontSize: fontSize['3xl'], fontWeight: '700', color: tc.text.primary, letterSpacing: 1 },
  timerSubtext: { fontSize: fontSize.sm, color: tc.text.secondary, marginTop: spacing.xs },
  amplitudeContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'center',
    height: 100,
    width: '100%',
    marginBottom: spacing['2xl'],
    gap: 2,
  },
  amplitudeBar: { width: 4, borderRadius: radius.sm },
  recordButtonWrap: {
    borderRadius: radius.full,
  },
  recordButton: {
    width: 100,
    height: 100,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  playButton: {
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  hintText: { fontSize: fontSize.sm, color: tc.text.secondary, textAlign: 'center', marginTop: spacing.sm },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: tc.border,
  },
});