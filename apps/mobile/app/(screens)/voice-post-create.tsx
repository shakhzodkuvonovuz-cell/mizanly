import React, { useState, useRef, useCallback, useEffect } from 'react';
import { View, Text, StyleSheet, Pressable, Dimensions, Alert } from 'react-native';
import Animated, { FadeInUp, FadeIn, useSharedValue, useAnimatedStyle, withRepeat, withTiming, withSpring } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { Audio } from 'expo-av';
import { useRouter } from 'expo-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { GlassHeader } from '@/components/ui/GlassHeader';
import { Icon } from '@/components/ui/Icon';
import { ScreenErrorBoundary } from '@/components/ui/ScreenErrorBoundary';
import { useTranslation } from '@/hooks/useTranslation';
import { colors, spacing, fontSize, radius } from '@/theme';
import { uploadApi, postsApi } from '@/services/api';
import { useHaptic } from '@/hooks/useHaptic';
import { useThemeColors } from '@/hooks/useThemeColors';

const MAX_DURATION = 120; // 2 minutes max

export default function VoicePostCreateScreen() {
  const tc = useThemeColors();
  const styles = createStyles(tc);
  const router = useRouter();
  const { t } = useTranslation();
  const haptic = useHaptic();
  const queryClient = useQueryClient();
  const recordingRef = useRef<Audio.Recording | null>(null);

  const [isRecording, setIsRecording] = useState(false);
  const [duration, setDuration] = useState(0);
  const [recordingUri, setRecordingUri] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const stopRecordingRef = useRef<() => void>(() => {});
  const durationRef = useRef(0);
  // Memoize waveform random heights to prevent flickering on re-render (Finding 50)
  const waveformHeights = useRef(Array.from({ length: 30 }, () => 10 + Math.random() * 40)).current;

  const pulseScale = useSharedValue(1);
  const pulseStyle = useAnimatedStyle(() => ({ transform: [{ scale: pulseScale.value }] }));

  // Cleanup interval on unmount
  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  const startRecording = useCallback(async () => {
    try {
      const { granted } = await Audio.requestPermissionsAsync();
      if (!granted) {
        Alert.alert(t('voicePost.permissionNeeded'), t('voicePost.microphoneRequired'));
        return;
      }
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
      const recording = new Audio.Recording();
      await recording.prepareToRecordAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      await recording.startAsync();
      recordingRef.current = recording;
      setIsRecording(true);
      setDuration(0);
      setRecordingUri(null);
      haptic.light();

      pulseScale.value = withRepeat(withTiming(1.15, { duration: 800 }), -1, true);

      durationRef.current = 0;
      intervalRef.current = setInterval(() => {
        durationRef.current += 1;
        setDuration(durationRef.current);
        if (durationRef.current >= MAX_DURATION) {
          stopRecordingRef.current();
        }
      }, 1000);
    } catch {
      // Permission denied or error
    }
  }, []);

  const stopRecording = useCallback(async () => {
    if (!recordingRef.current) return;
    try {
      await recordingRef.current.stopAndUnloadAsync();
      const uri = recordingRef.current.getURI();
      setRecordingUri(uri);
      setIsRecording(false);
      pulseScale.value = withSpring(1);
      if (intervalRef.current) clearInterval(intervalRef.current);
      haptic.success();
    } catch {
      setIsRecording(false);
    }
  }, [haptic, pulseScale]);

  // Keep stopRecordingRef in sync with the latest callback
  stopRecordingRef.current = stopRecording;

  const postMutation = useMutation({
    mutationFn: async () => {
      if (!recordingUri) throw new Error('No recording');
      // Upload audio to R2
      const presign = await uploadApi.getPresignUrl('audio/m4a', 'voice-posts');
      const response = await fetch(recordingUri);
      const blob = await response.blob();
      await fetch(presign.uploadUrl, { method: 'PUT', body: blob, headers: { 'Content-Type': 'audio/m4a' } });
      // Create voice post via API
      return postsApi.create({
        postType: 'VOICE',
        content: '',
        mediaUrls: [presign.publicUrl],
        mediaTypes: ['audio'],
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['voice-posts'] });
      haptic.success();
      router.back();
    },
  });

  const formatTime = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

  return (
    <ScreenErrorBoundary>
      <View style={styles.container}>
        <GlassHeader
          title={t('community.voicePost')}
          leftAction={{ icon: 'arrow-left', onPress: () => router.back() }}
        />

        <View style={styles.content}>
          {/* Timer */}
          <Animated.View entering={FadeIn.duration(300)} style={styles.timerSection}>
            <Text style={[styles.timer, isRecording && { color: colors.error }]}>
              {formatTime(duration)}
            </Text>
            <Text style={styles.maxDuration}>{t('voicePost.maxDuration', { time: formatTime(MAX_DURATION) })}</Text>
          </Animated.View>

          {/* Waveform placeholder — uses memoized random heights to prevent flicker */}
          <View style={styles.waveform}>
            {waveformHeights.map((randomHeight, i) => {
              const height = isRecording
                ? randomHeight
                : recordingUri ? 10 + Math.sin(i * 0.5) * 20 + 20 : 10;
              return (
                <View
                  key={i}
                  style={[styles.waveBar, {
                    height,
                    backgroundColor: isRecording ? colors.emerald
                      : recordingUri ? colors.emerald + '80'
                      : tc.surface,
                  }]}
                />
              );
            })}
          </View>

          {/* Record button */}
          <Animated.View style={[styles.recordSection, pulseStyle]}>
            <Pressable
              accessibilityRole="button"
              style={[styles.recordButton, isRecording && styles.recordButtonActive]}
              onPress={isRecording ? stopRecording : startRecording}

            >
              <LinearGradient
                colors={isRecording ? ['#F85149', '#E11D48'] : [colors.emerald, '#0D9B63']}
                style={styles.recordGradient}
              >
                <Icon name={isRecording ? 'square' : 'mic'} size="xl" color="#FFF" />
              </LinearGradient>
            </Pressable>
            <Text style={styles.recordHint}>
              {isRecording ? t('voicePost.tapToStop') : recordingUri ? t('voicePost.tapToReRecord') : t('voicePost.tapToRecord')}
            </Text>
          </Animated.View>

          {/* Post button */}
          {recordingUri && !isRecording && (
            <Animated.View entering={FadeInUp.duration(300)} style={styles.postSection}>
              <Pressable
                accessibilityRole="button"
                style={[styles.postBtn, postMutation.isPending && { opacity: 0.5 }]}
                onPress={() => postMutation.mutate()}
                disabled={postMutation.isPending}
              >
                <LinearGradient colors={[colors.emerald, '#0D9B63']} style={styles.postGradient}>
                  <Icon name="send" size="sm" color="#FFF" />
                  <Text style={styles.postText}>{t('voicePost.postVoice')}</Text>
                </LinearGradient>
              </Pressable>
            </Animated.View>
          )}
        </View>
      </View>
    </ScreenErrorBoundary>
  );
}

const createStyles = (tc: ReturnType<typeof useThemeColors>) => StyleSheet.create({
  container: { flex: 1, backgroundColor: tc.bg },
  content: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: spacing.base },
  timerSection: { alignItems: 'center', marginBottom: spacing['2xl'] },
  timer: { fontSize: 64, fontWeight: '700', color: colors.text.primary, fontVariant: ['tabular-nums'] },
  maxDuration: { color: colors.text.tertiary, fontSize: fontSize.sm, marginTop: spacing.xs },
  waveform: { flexDirection: 'row', alignItems: 'center', gap: 3, height: 60, marginBottom: spacing['2xl'] },
  waveBar: { width: 4, borderRadius: 2, minHeight: 4 },
  recordSection: { alignItems: 'center', marginBottom: spacing['2xl'] },
  recordButton: { width: 88, height: 88, borderRadius: radius.full, overflow: 'hidden' },
  recordButtonActive: { borderWidth: 3, borderColor: '#F85149' },
  recordGradient: { flex: 1, justifyContent: 'center', alignItems: 'center', borderRadius: radius.full },
  recordHint: { color: colors.text.secondary, fontSize: fontSize.sm, marginTop: spacing.md },
  postSection: { width: '100%' },
  postBtn: { borderRadius: radius.md, overflow: 'hidden' },
  postGradient: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, paddingVertical: spacing.base, borderRadius: radius.md },
  postText: { color: '#FFF', fontSize: fontSize.md, fontWeight: '700' },
});
