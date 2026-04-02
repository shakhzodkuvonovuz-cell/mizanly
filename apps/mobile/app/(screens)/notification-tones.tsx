import { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, Pressable, FlatList,
} from 'react-native';
import { BrandedRefreshControl } from '@/components/ui/BrandedRefreshControl';
import { useRouter, useLocalSearchParams } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Audio } from 'expo-av';
import Animated, {
  FadeIn, FadeInUp,
  useSharedValue, useAnimatedStyle, withSpring,
} from 'react-native-reanimated';
import { useSafeAreaInsets, SafeAreaView } from 'react-native-safe-area-context';
import { Icon } from '@/components/ui/Icon';
import { GlassHeader } from '@/components/ui/GlassHeader';
import { GradientButton } from '@/components/ui/GradientButton';
import { ScreenErrorBoundary } from '@/components/ui/ScreenErrorBoundary';
import { colors, spacing, fontSize, radius, fonts, shadow, animation } from '@/theme';
import { useTranslation } from '@/hooks/useTranslation';
import { useContextualHaptic } from '@/hooks/useContextualHaptic';
import { useThemeColors } from '@/hooks/useThemeColors';
import { rtlFlexRow } from '@/utils/rtl';
import { showToast } from '@/components/ui/Toast';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

// ── Constants ──
const TONE_STORAGE_PREFIX = 'notification-tone:';

interface ToneOption {
  id: string;
  labelKey: string;
  icon: 'bell' | 'volume-x';
  /** Frequency in Hz for generated preview tone (0 = silent) */
  previewHz: number;
}

const TONE_OPTIONS: ToneOption[] = [
  { id: 'default', labelKey: 'notificationTones.default', icon: 'bell', previewHz: 880 },
  { id: 'silent', labelKey: 'notificationTones.silent', icon: 'volume-x', previewHz: 0 },
  { id: 'gentle_bell', labelKey: 'notificationTones.gentleBell', icon: 'bell', previewHz: 659 },
  { id: 'soft_chime', labelKey: 'notificationTones.softChime', icon: 'bell', previewHz: 523 },
  { id: 'adhan_soft', labelKey: 'notificationTones.adhanSoft', icon: 'bell', previewHz: 440 },
  { id: 'islamic_melody', labelKey: 'notificationTones.islamicMelody', icon: 'bell', previewHz: 587 },
  { id: 'water_drop', labelKey: 'notificationTones.waterDrop', icon: 'bell', previewHz: 784 },
  { id: 'none', labelKey: 'notificationTones.none', icon: 'volume-x', previewHz: 0 },
];

/**
 * Generate a short WAV buffer for a sine-wave beep at the given frequency.
 * Returns a base64-encoded WAV data URI playable by expo-av.
 */
function generateToneWav(hz: number, durationMs = 300, sampleRate = 22050): string {
  const numSamples = Math.floor(sampleRate * (durationMs / 1000));
  const numChannels = 1;
  const bitsPerSample = 16;
  const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
  const blockAlign = numChannels * (bitsPerSample / 8);
  const dataSize = numSamples * blockAlign;
  const headerSize = 44;
  const buffer = new ArrayBuffer(headerSize + dataSize);
  const view = new DataView(buffer);

  // RIFF header
  const writeStr = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
  };
  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);
  writeStr(36, 'data');
  view.setUint32(40, dataSize, true);

  // Generate sine wave samples with fade-in/out envelope
  const fadeLen = Math.floor(numSamples * 0.15);
  for (let i = 0; i < numSamples; i++) {
    let amplitude = 0.35;
    if (i < fadeLen) amplitude *= i / fadeLen;
    else if (i > numSamples - fadeLen) amplitude *= (numSamples - i) / fadeLen;
    const sample = Math.sin(2 * Math.PI * hz * (i / sampleRate)) * amplitude;
    const val = Math.max(-1, Math.min(1, sample));
    view.setInt16(headerSize + i * 2, val * 0x7fff, true);
  }

  // Convert to base64
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  // Use btoa which is available in React Native Hermes
  const b64 = btoa(binary);
  return `data:audio/wav;base64,${b64}`;
}

function NotificationTonesScreen() {
  const tc = useThemeColors();
  const styles = createStyles(tc);
  const router = useRouter();
  const params = useLocalSearchParams<{
    conversationId: string;
    currentTone?: string;
  }>();
  const { t, isRTL } = useTranslation();
  const haptic = useContextualHaptic();
  const insets = useSafeAreaInsets();

  const conversationId = params.conversationId;

  // ── State ──
  const [selectedTone, setSelectedTone] = useState<string>(
    params.currentTone ?? 'default',
  );
  const [playingTone, setPlayingTone] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [originalTone, setOriginalTone] = useState<string>('default');

  // ── Load saved tone ──
  useEffect(() => {
    if (!conversationId) return;
    AsyncStorage.getItem(`${TONE_STORAGE_PREFIX}${conversationId}`)
      .then((val) => {
        if (val) {
          setSelectedTone(val);
          setOriginalTone(val);
        }
      })
      .catch(() => {
        showToast({ message: t('common.error', { defaultValue: 'Could not load tone' }), variant: 'error' });
      });
  }, [conversationId, t]);

  // ── Handlers ──
  const handleSelect = useCallback((toneId: string) => {
    haptic.tick();
    setSelectedTone(toneId);
  }, [haptic]);

  const soundRef = useRef<Audio.Sound | null>(null);

  const handlePreview = useCallback(async (toneId: string) => {
    haptic.tick();

    const tone = TONE_OPTIONS.find((o) => o.id === toneId);
    if (!tone || tone.previewHz === 0) {
      // Silent tone — just show brief visual
      setPlayingTone(toneId);
      setTimeout(() => setPlayingTone(null), 400);
      return;
    }

    // Stop any currently playing preview
    if (soundRef.current) {
      try { await soundRef.current.unloadAsync(); } catch { /* ignore */ }
      soundRef.current = null;
    }

    setPlayingTone(toneId);

    try {
      const wavUri = generateToneWav(tone.previewHz, 300);
      const { sound } = await Audio.Sound.createAsync(
        { uri: wavUri },
        { shouldPlay: true },
      );
      soundRef.current = sound;

      sound.setOnPlaybackStatusUpdate((status) => {
        if (status.isLoaded && status.didJustFinish) {
          setPlayingTone(null);
          sound.unloadAsync().catch(() => {});
          soundRef.current = null;
        }
      });
    } catch {
      // Fallback: just show visual feedback if audio fails
      setTimeout(() => setPlayingTone(null), 400);
    }
  }, [haptic]);

  // Cleanup audio on unmount
  useEffect(() => {
    return () => {
      soundRef.current?.unloadAsync().catch(() => {});
    };
  }, []);

  const handleSave = useCallback(async () => {
    if (!conversationId || saving) return;
    setSaving(true);
    try {
      await AsyncStorage.setItem(
        `${TONE_STORAGE_PREFIX}${conversationId}`,
        selectedTone,
      );
      haptic.success();
      showToast({ message: t('notificationTones.saved', { defaultValue: 'Tone saved' }), variant: 'success' });
      router.back();
    } catch {
      haptic.error();
      showToast({ message: t('common.error', { defaultValue: 'Failed to save' }), variant: 'error' });
    } finally {
      setSaving(false);
    }
  }, [conversationId, selectedTone, haptic, router, saving, t]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    if (conversationId) {
      const val = await AsyncStorage.getItem(
        `${TONE_STORAGE_PREFIX}${conversationId}`,
      );
      if (val) {
        setSelectedTone(val);
        setOriginalTone(val);
      }
    }
    setRefreshing(false);
  }, [conversationId]);

  const hasChanged = selectedTone !== originalTone;

  // ── Render tone row ──
  const renderToneItem = useCallback(
    ({ item, index }: { item: ToneOption; index: number }) => {
      const isSelected = selectedTone === item.id;
      const isPlaying = playingTone === item.id;
      const isSilent = item.id === 'silent' || item.id === 'none';

      return (
        <Animated.View entering={FadeInUp.delay(index * 40).duration(250)}>
          <Pressable
            onPress={() => handleSelect(item.id)}
            style={[styles.toneRow, { flexDirection: rtlFlexRow(isRTL) }, isSelected && styles.toneRowSelected]}
            accessibilityRole="radio"
            accessibilityState={{ selected: isSelected }}
            accessibilityLabel={t(item.labelKey)}
          >
            {/* Radio indicator */}
            <View
              style={[
                styles.radio,
                isSelected && styles.radioSelected,
              ]}
            >
              {isSelected && <View style={styles.radioInner} />}
            </View>

            {/* Tone name */}
            <View style={styles.toneInfo}>
              <Text
                style={[
                  styles.toneName,
                  isSelected && styles.toneNameSelected,
                ]}
              >
                {t(item.labelKey)}
              </Text>
              {item.id === 'default' && (
                <Text style={styles.toneSubtitle}>
                  {t('notificationTones.defaultDescription')}
                </Text>
              )}
            </View>

            {/* Play preview button */}
            {!isSilent ? (
              <Pressable
                onPress={() => handlePreview(item.id)}
                style={[
                  styles.playButton,
                  isPlaying && styles.playButtonActive,
                ]}
                accessibilityRole="button"
                accessibilityLabel={t('notificationTones.preview')}
                hitSlop={8}
              >
                <Icon
                  name={isPlaying ? 'volume-2' : 'play'}
                  size="sm"
                  color={isPlaying ? colors.emerald : tc.text.tertiary}
                />
              </Pressable>
            ) : (
              <View style={styles.playButtonSpacer} />
            )}
          </Pressable>
        </Animated.View>
      );
    },
    [selectedTone, playingTone, handleSelect, handlePreview, t],
  );

  const keyExtractor = useCallback((item: ToneOption) => item.id, []);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <GlassHeader
        title={t('notificationTones.title')}
        leftAction={{
          icon: 'arrow-left',
          onPress: () => router.back(),
          accessibilityLabel: t('common.back'),
        }}
      />

      <FlatList
        data={TONE_OPTIONS}
        renderItem={renderToneItem}
        keyExtractor={keyExtractor}
        style={styles.list}
        contentContainerStyle={[
          styles.listContent,
          { paddingBottom: insets.bottom + (hasChanged ? 100 : spacing.xl) },
        ]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <BrandedRefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
          />
        }
        ListHeaderComponent={
          <Animated.View entering={FadeIn.duration(300)} style={styles.headerInfo}>
            <View style={styles.headerIconWrap}>
              <Icon name="bell" size="lg" color={colors.emerald} />
            </View>
            <Text style={styles.headerTitle}>
              {t('notificationTones.selectTone')}
            </Text>
            <Text style={styles.headerSubtitle}>
              {t('notificationTones.selectToneDescription')}
            </Text>
          </Animated.View>
        }
        ItemSeparatorComponent={() => <View style={styles.separator} />}
      />

      {/* Save Button */}
      {hasChanged && (
        <Animated.View
          entering={FadeIn.duration(200)}
          style={[styles.saveBar, { paddingBottom: insets.bottom + spacing.base }]}
        >
          <GradientButton
            label={t('notificationTones.save')}
            onPress={handleSave}
            loading={saving}
            fullWidth
            size="lg"
          />
        </Animated.View>
      )}
    </SafeAreaView>
  );
}

export default function NotificationTonesScreenWrapper() {
  return (
    <ScreenErrorBoundary>
      <NotificationTonesScreen />
    </ScreenErrorBoundary>
  );
}

const createStyles = (tc: ReturnType<typeof useThemeColors>) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: tc.bg,
  },
  list: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: spacing.base,
    paddingTop: spacing.base,
  },
  // Header
  headerInfo: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
    marginBottom: spacing.md,
  },
  headerIconWrap: {
    width: 56,
    height: 56,
    borderRadius: radius.full,
    backgroundColor: colors.active.emerald10,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  headerTitle: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSize.md,
    color: tc.text.primary,
    marginBottom: spacing.xs,
  },
  headerSubtitle: {
    fontFamily: fonts.body,
    fontSize: fontSize.sm,
    color: tc.text.secondary,
    textAlign: 'center',
    paddingHorizontal: spacing.xl,
  },
  // Tone row
  toneRow: {
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.base,
    borderRadius: radius.md,
    backgroundColor: tc.bgElevated,
  },
  toneRowSelected: {
    backgroundColor: colors.active.emerald10,
    borderWidth: 1,
    borderColor: colors.emerald,
  },
  // Radio
  radio: {
    width: 22,
    height: 22,
    borderRadius: radius.full,
    borderWidth: 2,
    borderColor: tc.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginEnd: spacing.md,
  },
  radioSelected: {
    borderColor: colors.emerald,
  },
  radioInner: {
    width: 12,
    height: 12,
    borderRadius: radius.full,
    backgroundColor: colors.emerald,
  },
  // Tone info
  toneInfo: {
    flex: 1,
  },
  toneName: {
    fontFamily: fonts.bodyMedium,
    fontSize: fontSize.base,
    color: tc.text.primary,
  },
  toneNameSelected: {
    fontFamily: fonts.bodySemiBold,
    color: colors.emerald,
  },
  toneSubtitle: {
    fontFamily: fonts.body,
    fontSize: fontSize.xs,
    color: tc.text.tertiary,
    marginTop: 2,
  },
  // Play button
  playButton: {
    width: 36,
    height: 36,
    borderRadius: radius.full,
    backgroundColor: colors.active.white5,
    alignItems: 'center',
    justifyContent: 'center',
    marginStart: spacing.sm,
  },
  playButtonActive: {
    backgroundColor: colors.active.emerald10,
  },
  playButtonSpacer: {
    width: 36,
    height: 36,
    marginStart: spacing.sm,
  },
  // Separator
  separator: {
    height: spacing.sm,
  },
  // Save bar
  saveBar: {
    position: 'absolute',
    bottom: 0,
    start: 0,
    end: 0,
    paddingHorizontal: spacing.base,
    paddingTop: spacing.md,
    backgroundColor: tc.isDark ? 'rgba(13, 17, 23, 0.95)' : 'rgba(255, 255, 255, 0.95)',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: tc.border,
  },
});
