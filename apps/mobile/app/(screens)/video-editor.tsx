import { View, Text, StyleSheet, ScrollView, Pressable, Dimensions, TextInput, ActivityIndicator, useWindowDimensions } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { GestureDetector } from 'react-native-gesture-handler';
import { LinearGradient } from 'expo-linear-gradient';
import { Video, ResizeMode } from 'expo-av';
import { Icon, type IconName } from '@/components/ui/Icon';
import { GlassHeader } from '@/components/ui/GlassHeader';
import { colors, spacing, radius, fontSize, fonts } from '@/theme';
import { useTranslation } from '@/hooks/useTranslation';
import { ScreenErrorBoundary } from '@/components/ui/ScreenErrorBoundary';
import { useContextualHaptic } from '@/hooks/useContextualHaptic';
import { useThemeColors } from '@/hooks/useThemeColors';
import { showToast } from '@/components/ui/Toast';
import { MusicPicker } from '@/components/story/MusicPicker';
import { EmojiPicker } from '@/components/ui/EmojiPicker';
import { formatTime } from '@/utils/formatTime';
import * as Speech from 'expo-speech';
import {
  useVideoEditorState,
  useVideoTimeline,
  useVideoPlayback,
  useVideoExport,
  useVideoVoiceover,
  useVideoVolumeGestures,
} from '@/hooks/video-editor';
import type { ToolTab, SpeedOption, SpeedCurve, VoiceEffect, FilterName } from '@/hooks/video-editor';

// Fallback dimensions for createStyles (overridden by hook values in component)
const { width: fallbackScreenWidth, height: fallbackScreenHeight } = Dimensions.get('window');

const SPEED_OPTIONS: SpeedOption[] = [0.25, 0.5, 1, 1.5, 2, 3];

const FILTERS: { id: FilterName; labelKey: string; color: string }[] = [
  { id: 'original', labelKey: 'videoEditor.filterOriginal', color: '#FFFFFF' },
  { id: 'warm', labelKey: 'videoEditor.filterWarm', color: '#D4A94F' },
  { id: 'cool', labelKey: 'videoEditor.filterCool', color: colors.extended.blue },
  { id: 'bw', labelKey: 'videoEditor.filterBW', color: '#8B949E' },
  { id: 'vintage', labelKey: 'videoEditor.filterVintage', color: '#C8963E' },
  { id: 'vivid', labelKey: 'videoEditor.filterVivid', color: '#0A7B4F' },
  { id: 'dramatic', labelKey: 'videoEditor.filterDramatic', color: '#F85149' },
  { id: 'fade', labelKey: 'videoEditor.filterFade', color: '#6E7781' },
  { id: 'emerald', labelKey: 'videoEditor.filterEmerald', color: '#0A7B4F' },
  { id: 'golden', labelKey: 'videoEditor.filterGolden', color: '#C8963E' },
  { id: 'night', labelKey: 'videoEditor.filterNight', color: '#1C2333' },
  { id: 'soft', labelKey: 'videoEditor.filterSoft', color: '#E8D5B7' },
  { id: 'cinematic', labelKey: 'videoEditor.filterCinematic', color: '#2D3548' },
];

const FONT_OPTION_KEYS = ['default', 'bold', 'handwritten'];
const TEXT_COLORS = ['#FFFFFF', '#D4A94F', '#0A7B4F', '#C8963E', '#F85149', colors.extended.blue];

export default function VideoEditorScreen() {
  const tc = useThemeColors();
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const cardGradient: readonly [string, string] = tc.isDark ? colors.gradient.cardDark : ['rgba(230,235,240,0.6)', 'rgba(240,242,245,0.3)'];
  const styles = createStyles(tc, screenWidth, screenHeight);
  const router = useRouter();
  const params = useLocalSearchParams<{ videoUri?: string; uri?: string; returnTo?: string }>();
  const { t, language: currentLanguage, isRTL } = useTranslation();
  const haptic = useContextualHaptic();
  const insets = useSafeAreaInsets();
  const videoUri = params.videoUri || params.uri || null;

  // ── Hook orchestration ──────────────────────────────────────────────

  const state = useVideoEditorState();

  const playback = useVideoPlayback({
    isPlaying: state.isPlaying,
    setIsPlaying: state.setIsPlaying,
    setCurrentTime: state.setCurrentTime,
    totalDuration: state.totalDuration,
    setTotalDuration: state.setTotalDuration,
    setEndTime: state.setEndTime,
    videoLoaded: state.videoLoaded,
    setVideoLoaded: state.setVideoLoaded,
    playbackSpeed: state.playbackSpeed,
    setPlaybackSpeed: state.setPlaybackSpeed,
    originalVolume: state.originalVolume,
    startTime: state.startTime,
    endTime: state.endTime,
  });

  const timeline = useVideoTimeline({
    totalDuration: state.totalDuration,
    startTime: state.startTime,
    endTime: state.endTime,
    setStartTime: state.setStartTime,
    setEndTime: state.setEndTime,
    videoRef: playback.videoRef,
  });

  const volumeGestures = useVideoVolumeGestures({
    setOriginalVolume: state.setOriginalVolume,
    setMusicVolume: state.setMusicVolume,
  });

  const voiceover = useVideoVoiceover({
    videoRef: playback.videoRef,
    startTime: state.startTime,
    setVoiceoverUri: state.setVoiceoverUri,
    isRecordingVoiceover: state.isRecordingVoiceover,
    setIsRecordingVoiceover: state.setIsRecordingVoiceover,
    t: t as (key: string, defaultValueOrOptions?: string | Record<string, unknown>) => string,
  });

  const exporter = useVideoExport({
    videoUri,
    t: t as (key: string, defaultValueOrOptions?: string | Record<string, unknown>) => string,
    router: router as { back: () => void; replace: (opts: { pathname: string; params: Record<string, string> }) => void },
    returnTo: params.returnTo,
    startTime: state.startTime,
    endTime: state.endTime,
    totalDuration: state.totalDuration,
    playbackSpeed: state.playbackSpeed,
    speedCurve: state.speedCurve,
    selectedFilter: state.selectedFilter,
    selectedQuality: state.selectedQuality,
    captionText: state.captionText,
    selectedTextColor: state.selectedTextColor,
    selectedFont: state.selectedFont,
    textStartTime: state.textStartTime,
    textEndTime: state.textEndTime,
    textSize: state.textSize,
    textBg: state.textBg,
    textShadow: state.textShadow,
    originalVolume: state.originalVolume,
    musicVolume: state.musicVolume,
    selectedTrack: state.selectedTrack,
    voiceoverUri: state.voiceoverUri,
    isReversed: state.isReversed,
    aspectRatio: state.aspectRatio,
    voiceEffect: state.voiceEffect,
    stabilize: state.stabilize,
    noiseReduce: state.noiseReduce,
    freezeFrameAt: state.freezeFrameAt,
    brightness: state.brightness,
    contrast: state.contrast,
    saturation: state.saturation,
    temperature: state.temperature,
    fadeIn: state.fadeIn,
    fadeOut: state.fadeOut,
    rotation: state.rotation,
    sharpen: state.sharpen,
    vignetteOn: state.vignetteOn,
    grain: state.grain,
    audioPitch: state.audioPitch,
    flipH: state.flipH,
    flipV: state.flipV,
    glitch: state.glitch,
    letterbox: state.letterbox,
    boomerang: state.boomerang,
    isExporting: state.isExporting,
    setIsExporting: state.setIsExporting,
    setExportProgress: state.setExportProgress,
  });

  // ── Tool panel renderer ─────────────────────────────────────────────

  const renderToolPanel = () => {
    switch (state.selectedTool) {
      case 'trim':
        return (
          <View style={styles.toolPanel}>
            <View style={styles.timeInputRow}>
              <View style={styles.timeInputContainer}>
                <Text style={styles.timeInputLabel}>{t('videoEditor.start')}</Text>
                <TextInput
                  style={styles.timeInput}
                  value={formatTime(state.startTime)}
                  editable={false}
                />
              </View>
              <View style={styles.timeInputContainer}>
                <Text style={styles.timeInputLabel}>{t('videoEditor.end')}</Text>
                <TextInput
                  style={styles.timeInput}
                  value={formatTime(state.endTime)}
                  editable={false}
                />
              </View>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('videoEditor.splitAtPlayhead')}
              style={styles.splitButton}
              onPress={() => {
                if (state.currentTime > state.startTime + 1 && state.currentTime < state.endTime - 1) {
                  state.pushUndo();
                  haptic.tick();
                  state.setEndTime(state.currentTime);
                  showToast({ message: t('videoEditor.splitDone'), variant: 'success' });
                } else {
                  showToast({ message: t('videoEditor.splitTooShort'), variant: 'info' });
                }
              }}
            >
              <LinearGradient
                colors={['rgba(45,53,72,0.6)', 'rgba(28,35,51,0.4)']}
                style={styles.splitButtonGradient}
              >
                <Icon name="scissors" size="sm" color={tc.text.primary} />
                <Text style={styles.splitButtonText}>{t('videoEditor.splitAtPlayhead')}</Text>
              </LinearGradient>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('videoEditor.deleteSelectedSegment')}
              style={styles.deleteButton}
              onPress={() => {
                state.pushUndo();
                haptic.delete();
                state.setStartTime(0);
                state.setEndTime(state.totalDuration);
              }}
            >
              <View style={styles.deleteButtonInner}>
                <Icon name="trash" size="sm" color={colors.error} />
                <Text style={styles.deleteButtonText}>{t('videoEditor.deleteSelectedSegment')}</Text>
              </View>
            </Pressable>
          </View>
        );

      case 'speed':
        return (
          <View style={styles.toolPanel}>
            <Text style={styles.toolPanelTitle}>{t('videoEditor.playbackSpeed')}</Text>
            <View style={styles.speedGrid}>
              {SPEED_OPTIONS.map((speed) => (
                <Pressable accessibilityRole="button"
                  accessibilityLabel={`${speed}x ${t('videoEditor.speed')}`}
                  key={speed}
                  style={styles.speedButton}
                  onPress={() => { state.pushUndo(); state.setPlaybackSpeed(speed); haptic.tick(); }}
                >
                  <LinearGradient
                    colors={state.playbackSpeed === speed
                      ? ['rgba(10,123,79,0.4)', 'rgba(10,123,79,0.2)']
                      : cardGradient
                    }
                    style={styles.speedButtonGradient}
                  >
                    <Text style={[
                      styles.speedButtonText,
                      state.playbackSpeed === speed && styles.speedButtonTextActive
                    ]}>
                      {speed}x
                    </Text>
                  </LinearGradient>
                </Pressable>
              ))}
            </View>

            {/* Speed curve presets (CapCut-style) */}
            <Text style={[styles.toolSubTitle, { marginTop: spacing.md }]}>{t('videoEditor.speedCurves')}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={styles.effectsRow}>
                {[
                  { id: 'none', label: t('videoEditor.curve.none') },
                  { id: 'montage', label: t('videoEditor.curve.montage') },
                  { id: 'hero', label: t('videoEditor.curve.hero') },
                  { id: 'bullet', label: t('videoEditor.curve.bullet') },
                  { id: 'flashIn', label: t('videoEditor.curve.flashIn') },
                  { id: 'flashOut', label: t('videoEditor.curve.flashOut') },
                ].map((curve) => (
                  <Pressable
                    key={curve.id}
                    accessibilityRole="button"
                    style={styles.effectChip}
                    onPress={() => { state.pushUndo(); state.setSpeedCurve(curve.id as SpeedCurve); haptic.tick(); }}
                  >
                    <LinearGradient
                      colors={state.speedCurve === curve.id
                        ? ['rgba(200,150,62,0.4)', 'rgba(200,150,62,0.2)']
                        : cardGradient
                      }
                      style={styles.effectChipGradient}
                    >
                      <Text style={[styles.effectChipText, state.speedCurve === curve.id && { color: colors.gold, fontWeight: '600' }]}>
                        {curve.label}
                      </Text>
                    </LinearGradient>
                  </Pressable>
                ))}
              </View>
            </ScrollView>
          </View>
        );

      case 'filters':
        return (
          <View style={styles.toolPanel}>
            <Text style={styles.toolPanelTitle}>{t('videoEditor.selectFilter')}</Text>
            <View style={styles.filterGrid}>
              {FILTERS.map((filter, index) => (
                <Animated.View
                  key={filter.id}
                  entering={FadeInUp.delay(index * 50).duration(300)}
                >
                  <Pressable accessibilityRole="button"
                    accessibilityLabel={t(filter.labelKey)}
                    style={styles.filterButton}
                    onPress={() => { state.pushUndo(); state.setSelectedFilter(filter.id); }}
                  >
                    <LinearGradient
                      colors={cardGradient}
                      style={[
                        styles.filterButtonGradient,
                        state.selectedFilter === filter.id && styles.filterButtonGradientActive
                      ]}
                    >
                      <View style={[styles.filterPreview, { backgroundColor: filter.color }]} />
                      <Text style={styles.filterName}>{t(filter.labelKey)}</Text>
                    </LinearGradient>
                  </Pressable>
                </Animated.View>
              ))}
            </View>
          </View>
        );

      case 'adjust':
        return (
          <View style={styles.toolPanel}>
            <Text style={styles.toolPanelTitle}>{t('videoEditor.adjust')}</Text>
            {[
              { label: t('videoEditor.brightness'), value: state.brightness, setter: state.setBrightness, icon: 'sun' as IconName },
              { label: t('videoEditor.contrast'), value: state.contrast, setter: state.setContrast, icon: 'circle-plus' as IconName },
              { label: t('videoEditor.saturation'), value: state.saturation, setter: state.setSaturation, icon: 'layers' as IconName },
              { label: t('videoEditor.temperature'), value: state.temperature, setter: state.setTemperature, icon: 'hash' as IconName },
            ].map(({ label, value, setter, icon }) => (
              <View key={label} style={styles.adjustRow}>
                <View style={styles.adjustLabelRow}>
                  <Icon name={icon} size={14} color={value !== 0 ? colors.emerald : tc.text.secondary} />
                  <Text style={styles.adjustLabel}>{label}</Text>
                  <Text style={styles.adjustValue}>{value > 0 ? '+' : ''}{value}</Text>
                </View>
                <View style={styles.adjustSliderTrack}>
                  <View style={[styles.adjustSliderCenter]} />
                  <View style={[
                    styles.adjustSliderFill,
                    value >= 0
                      ? { left: '50%', width: `${Math.abs(value) / 2}%` }
                      : { right: '50%', width: `${Math.abs(value) / 2}%` }
                  ]} />
                  <Pressable
                    style={[styles.adjustSliderThumb, { left: `${50 + value / 2}%` }]}
                    onPress={() => { state.pushUndo(); setter(0); haptic.tick(); }}
                  />
                </View>
                <View style={styles.adjustPresetRow}>
                  {[-50, -25, 0, 25, 50].map(preset => (
                    <Pressable
                      key={preset}
                      style={[styles.adjustPreset, value === preset && styles.adjustPresetActive]}
                      onPress={() => { state.pushUndo(); setter(preset); haptic.tick(); }}
                    >
                      <Text style={[styles.adjustPresetText, value === preset && styles.adjustPresetTextActive]}>
                        {preset > 0 ? `+${preset}` : String(preset)}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            ))}

            {/* Video Fade In/Out */}
            <Text style={[styles.toolSubTitle, { marginTop: spacing.md }]}>{t('videoEditor.videoFade')}</Text>
            <View style={styles.fadeRow}>
              <View style={styles.fadeItem}>
                <Text style={styles.fadeLabel}>{t('videoEditor.fadeIn')}</Text>
                <View style={styles.fadeButtons}>
                  {[0, 0.5, 1, 2].map(sec => (
                    <Pressable
                      key={sec}
                      style={[styles.fadeButton, state.fadeIn === sec && styles.fadeButtonActive]}
                      onPress={() => { state.pushUndo(); state.setFadeIn(sec); haptic.tick(); }}
                    >
                      <Text style={[styles.fadeButtonText, state.fadeIn === sec && styles.fadeButtonTextActive]}>
                        {sec === 0 ? t('videoEditor.off') : `${sec}s`}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>
              <View style={styles.fadeItem}>
                <Text style={styles.fadeLabel}>{t('videoEditor.fadeOut')}</Text>
                <View style={styles.fadeButtons}>
                  {[0, 0.5, 1, 2].map(sec => (
                    <Pressable
                      key={sec}
                      style={[styles.fadeButton, state.fadeOut === sec && styles.fadeButtonActive]}
                      onPress={() => { state.pushUndo(); state.setFadeOut(sec); haptic.tick(); }}
                    >
                      <Text style={[styles.fadeButtonText, state.fadeOut === sec && styles.fadeButtonTextActive]}>
                        {sec === 0 ? t('videoEditor.off') : `${sec}s`}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            </View>
          </View>
        );

      case 'text':
        return (
          <View style={styles.toolPanel}>
            <Text style={styles.toolPanelTitle}>{t('videoEditor.addCaption')}</Text>
            <TextInput
              style={styles.captionInput}
              placeholder={t('videoEditor.addTextOverlay')}
              placeholderTextColor={tc.text.tertiary}
              value={state.captionText}
              onChangeText={state.setCaptionText}
              maxLength={200}
              multiline
              numberOfLines={3}
            />
            {state.captionText.length > 0 && (
              <Text style={styles.captionCharCount}>{state.captionText.length}/200</Text>
            )}

            {/* Text timing */}
            {state.captionText.length > 0 && (
              <>
                <Text style={styles.toolSubTitle}>{t('videoEditor.textTiming')}</Text>
                <View style={styles.timeInputRow}>
                  <View style={styles.timeInputContainer}>
                    <Text style={styles.timeInputLabel}>{t('videoEditor.textAppears')}</Text>
                    <Pressable
                      accessibilityRole="button"
                      style={styles.timeInput}
                      onPress={() => { state.pushUndo(); state.setTextStartTime(state.currentTime); haptic.tick(); }}
                    >
                      <Text style={styles.timeInputValue}>{formatTime(state.textStartTime)}</Text>
                    </Pressable>
                  </View>
                  <View style={styles.timeInputContainer}>
                    <Text style={styles.timeInputLabel}>{t('videoEditor.textDisappears')}</Text>
                    <Pressable
                      accessibilityRole="button"
                      style={styles.timeInput}
                      onPress={() => { state.pushUndo(); state.setTextEndTime(state.currentTime); haptic.tick(); }}
                    >
                      <Text style={styles.timeInputValue}>{formatTime(state.textEndTime || state.endTime)}</Text>
                    </Pressable>
                  </View>
                </View>
                <Text style={styles.textTimingHint}>{t('videoEditor.textTimingHint')}</Text>
              </>
            )}

            <Text style={styles.toolSubTitle}>{t('videoEditor.fontStyle')}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.fontScroll}>
              {FONT_OPTION_KEYS.map((font) => (
                <Pressable accessibilityRole="button"
                  accessibilityLabel={t(`videoEditor.font.${font}`)}
                  key={font}
                  style={styles.fontButton}
                  onPress={() => { state.pushUndo(); state.setSelectedFont(font); haptic.tick(); }}
                >
                  <LinearGradient
                    colors={state.selectedFont === font
                      ? ['rgba(10,123,79,0.4)', 'rgba(10,123,79,0.2)']
                      : cardGradient
                    }
                    style={styles.fontButtonGradient}
                  >
                    <Text style={[
                      styles.fontButtonText,
                      state.selectedFont === font && styles.fontButtonTextActive
                    ]}>
                      {t(`videoEditor.font.${font}`)}
                    </Text>
                  </LinearGradient>
                </Pressable>
              ))}
            </ScrollView>

            <Text style={styles.toolSubTitle}>{t('videoEditor.textColor')}</Text>
            <View style={styles.colorRow}>
              {TEXT_COLORS.map((color) => (
                <Pressable accessibilityRole="button"
                  accessibilityLabel={`${t('videoEditor.textColor')} ${color}`}
                  key={color}
                  style={[
                    styles.colorCircle,
                    { backgroundColor: color },
                    state.selectedTextColor === color && styles.colorCircleActive
                  ]}
                  onPress={() => state.setSelectedTextColor(color)}
                />
              ))}
            </View>

            {/* Text size */}
            <Text style={styles.toolSubTitle}>{t('videoEditor.textSizeLabel')}</Text>
            <View style={styles.adjustPresetRow}>
              {[24, 36, 48, 64, 80].map(size => (
                <Pressable
                  key={size}
                  style={[styles.adjustPreset, state.textSize === size && styles.adjustPresetActive]}
                  onPress={() => { state.pushUndo(); state.setTextSize(size); haptic.tick(); }}
                >
                  <Text style={[styles.adjustPresetText, state.textSize === size && styles.adjustPresetTextActive]}>{size}</Text>
                </Pressable>
              ))}
            </View>

            {/* Text style toggles */}
            <View style={[styles.effectToggleGrid, { marginTop: spacing.sm }]}>
              <Pressable
                style={[styles.effectToggleItem, state.textBg && styles.effectToggleActive]}
                onPress={() => { state.pushUndo(); state.setTextBg(!state.textBg); haptic.tick(); }}
              >
                <Text style={[styles.effectToggleText, state.textBg && styles.effectToggleTextActive]}>{t('videoEditor.textBackground')}</Text>
              </Pressable>
              <Pressable
                style={[styles.effectToggleItem, state.textShadow && styles.effectToggleActive]}
                onPress={() => { state.pushUndo(); state.setTextShadow(!state.textShadow); haptic.tick(); }}
              >
                <Text style={[styles.effectToggleText, state.textShadow && styles.effectToggleTextActive]}>{t('videoEditor.textShadowLabel')}</Text>
              </Pressable>
            </View>

            {/* Text-to-Speech + Emoji */}
            <View style={styles.ttsRow}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('videoEditor.textToSpeech')}
                style={styles.ttsButton}
                onPress={async () => {
                  if (!state.captionText.trim()) return;
                  if (state.isSpeaking) {
                    Speech.stop();
                    state.setIsSpeaking(false);
                  } else {
                    state.setIsSpeaking(true);
                    const langMap: Record<string, string> = { en: 'en-US', ar: 'ar-SA', tr: 'tr-TR', ur: 'ur-PK', bn: 'bn-BD', fr: 'fr-FR', id: 'id-ID', ms: 'ms-MY' };
                    Speech.speak(state.captionText, {
                      language: langMap[currentLanguage] || 'en-US',
                      onDone: () => state.setIsSpeaking(false),
                      onStopped: () => state.setIsSpeaking(false),
                    });
                  }
                }}
              >
                <LinearGradient
                  colors={state.isSpeaking
                    ? ['rgba(248,81,73,0.4)', 'rgba(248,81,73,0.2)']
                    : cardGradient
                  }
                  style={styles.ttsButtonGradient}
                >
                  <Icon name={state.isSpeaking ? 'volume-x' : 'volume-2'} size="sm" color={state.isSpeaking ? colors.error : tc.text.secondary} />
                  <Text style={styles.ttsButtonText}>
                    {state.isSpeaking ? t('videoEditor.stopTTS') : t('videoEditor.textToSpeech')}
                  </Text>
                </LinearGradient>
              </Pressable>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('videoEditor.addEmoji')}
                style={styles.ttsButton}
                onPress={() => state.setShowEmojiPicker(true)}
              >
                <LinearGradient
                  colors={cardGradient}
                  style={styles.ttsButtonGradient}
                >
                  <Icon name="smile" size="sm" color={tc.text.secondary} />
                  <Text style={styles.ttsButtonText}>{t('videoEditor.addEmoji')}</Text>
                </LinearGradient>
              </Pressable>
            </View>
          </View>
        );

      case 'music':
        return (
          <View style={styles.toolPanel}>
            <Text style={styles.toolPanelTitle}>{t('videoEditor.backgroundMusic')}</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('videoEditor.addFromAudioLibrary')}
              style={styles.libraryButton}
              onPress={() => state.setShowMusicPicker(true)}
            >
              <LinearGradient
                colors={['rgba(45,53,72,0.6)', 'rgba(28,35,51,0.4)']}
                style={styles.libraryButtonGradient}
              >
                <Icon name="music" size="sm" color={colors.emerald} />
                <Text style={styles.libraryButtonText}>{t('videoEditor.addFromAudioLibrary')}</Text>
                <Icon name="chevron-right" size="sm" color={tc.text.tertiary} />
              </LinearGradient>
            </Pressable>

            {state.selectedTrack ? (
              <View style={styles.currentTrackCard}>
                <LinearGradient
                  colors={cardGradient}
                  style={styles.currentTrackGradient}
                >
                  <View style={styles.trackInfo}>
                    <View style={styles.trackIconContainer}>
                      <LinearGradient
                        colors={['rgba(200,150,62,0.2)', 'rgba(10,123,79,0.1)']}
                        style={styles.trackIconGradient}
                      >
                        <Icon name="music" size="sm" color={colors.gold} />
                      </LinearGradient>
                    </View>
                    <View style={styles.trackDetails}>
                      <Text style={styles.trackName} numberOfLines={1}>{state.selectedTrack.title}</Text>
                      <Text style={styles.trackArtist} numberOfLines={1}>{state.selectedTrack.artist}</Text>
                    </View>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={t('videoEditor.removeTrack')}
                      style={styles.removeTrackButton}
                      onPress={() => state.setSelectedTrack(null)}
                    >
                      <Icon name="x" size="xs" color={colors.error} />
                    </Pressable>
                  </View>
                </LinearGradient>
              </View>
            ) : (
              <View style={styles.noTrackHint}>
                <Icon name="music" size="sm" color={tc.text.tertiary} />
                <Text style={styles.noTrackHintText}>{t('videoEditor.noMusicSelected')}</Text>
              </View>
            )}
          </View>
        );

      case 'volume':
        return (
          <View style={styles.toolPanel}>
            <Text style={styles.toolPanelTitle}>{t('videoEditor.audioLevels')}</Text>

            <View style={styles.volumeRow}>
              <View style={styles.volumeIconContainer}>
                <Icon name="volume-2" size="sm" color={tc.text.secondary} />
              </View>
              <View style={styles.volumeLabelContainer}>
                <Text style={styles.volumeLabel}>{t('videoEditor.originalAudio')}</Text>
                <Text style={styles.volumeValue}>{state.originalVolume}%</Text>
              </View>
            </View>
            <GestureDetector gesture={volumeGestures.onOriginalVolumeGesture}>
              <View
                ref={volumeGestures.volumeSliderRef}
                style={styles.sliderTrack}
                onLayout={(e) => {
                  volumeGestures.volumeSliderWidth.current = e.nativeEvent.layout.width;
                  volumeGestures.volumeSliderRef.current?.measureInWindow((x) => { volumeGestures.volumeSliderX.current = x; });
                }}
              >
                <View style={[styles.sliderFill, { width: `${state.originalVolume}%` }]} />
                <View style={[styles.sliderThumb, { left: `${state.originalVolume}%` }]} />
              </View>
            </GestureDetector>

            <View style={[styles.volumeRow, styles.volumeRowSecond]}>
              <View style={styles.volumeIconContainer}>
                <Icon name="music" size="sm" color={tc.text.secondary} />
              </View>
              <View style={styles.volumeLabelContainer}>
                <Text style={styles.volumeLabel}>{t('videoEditor.backgroundMusic')}</Text>
                <Text style={styles.volumeValue}>{state.musicVolume}%</Text>
              </View>
            </View>
            <GestureDetector gesture={volumeGestures.onMusicVolumeGesture}>
              <View style={styles.sliderTrack}>
                <View style={[styles.sliderFill, { width: `${state.musicVolume}%` }]} />
                <View style={[styles.sliderThumb, { left: `${state.musicVolume}%` }]} />
              </View>
            </GestureDetector>
          </View>
        );

      case 'effects':
        return (
          <View style={styles.toolPanel}>
            <Text style={styles.toolPanelTitle}>{t('videoEditor.audioEffects')}</Text>

            {/* Voice effects */}
            <Text style={styles.toolSubTitle}>{t('videoEditor.voiceEffect')}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={styles.effectsRow}>
                {(['none', 'robot', 'echo', 'deep', 'chipmunk', 'telephone'] as VoiceEffect[]).map((effect) => (
                  <Pressable
                    key={effect}
                    accessibilityRole="button"
                    accessibilityLabel={t(`videoEditor.effect.${effect}`)}
                    style={styles.effectChip}
                    onPress={() => { state.pushUndo(); state.setVoiceEffect(effect); haptic.tick(); }}
                  >
                    <LinearGradient
                      colors={state.voiceEffect === effect
                        ? ['rgba(10,123,79,0.4)', 'rgba(10,123,79,0.2)']
                        : cardGradient
                      }
                      style={styles.effectChipGradient}
                    >
                      <Text style={[styles.effectChipText, state.voiceEffect === effect && styles.effectChipTextActive]}>
                        {t(`videoEditor.effect.${effect}`)}
                      </Text>
                    </LinearGradient>
                  </Pressable>
                ))}
              </View>
            </ScrollView>

            {/* Audio Pitch */}
            <Text style={[styles.toolSubTitle, { marginTop: spacing.md }]}>{t('videoEditor.audioPitch')}</Text>
            <View style={styles.adjustLabelRow}>
              <Text style={styles.adjustLabel}>{t('videoEditor.pitchSemitones')}</Text>
              <Text style={styles.adjustValue}>{state.audioPitch > 0 ? '+' : ''}{state.audioPitch}</Text>
            </View>
            <View style={styles.adjustPresetRow}>
              {[-6, -3, 0, 3, 6].map(preset => (
                <Pressable
                  key={preset}
                  style={[styles.adjustPreset, state.audioPitch === preset && styles.adjustPresetActive]}
                  onPress={() => { state.pushUndo(); state.setAudioPitch(preset); haptic.tick(); }}
                >
                  <Text style={[styles.adjustPresetText, state.audioPitch === preset && styles.adjustPresetTextActive]}>
                    {preset > 0 ? `+${preset}` : String(preset)}
                  </Text>
                </Pressable>
              ))}
            </View>

            {/* Enhancement toggles */}
            <Text style={[styles.toolSubTitle, { marginTop: spacing.md }]}>{t('videoEditor.enhancements')}</Text>

            <Pressable
              accessibilityRole="switch"
              style={styles.toggleRow}
              onPress={() => { state.pushUndo(); state.setNoiseReduce(!state.noiseReduce); haptic.tick(); }}
            >
              <View style={styles.toggleInfo}>
                <Icon name="volume-x" size="sm" color={state.noiseReduce ? colors.emerald : tc.text.secondary} />
                <View>
                  <Text style={styles.toggleLabel}>{t('videoEditor.noiseReduction')}</Text>
                  <Text style={styles.toggleDesc}>{t('videoEditor.noiseReductionDesc')}</Text>
                </View>
              </View>
              <View style={[styles.toggleSwitch, state.noiseReduce && styles.toggleSwitchActive]}>
                <View style={[styles.toggleThumb, state.noiseReduce && styles.toggleThumbActive]} />
              </View>
            </Pressable>

            <Pressable
              accessibilityRole="switch"
              style={styles.toggleRow}
              onPress={() => { state.pushUndo(); state.setStabilize(!state.stabilize); haptic.tick(); }}
            >
              <View style={styles.toggleInfo}>
                <Icon name="layers" size="sm" color={state.stabilize ? colors.emerald : tc.text.secondary} />
                <View>
                  <Text style={styles.toggleLabel}>{t('videoEditor.stabilization')}</Text>
                  <Text style={styles.toggleDesc}>{t('videoEditor.stabilizationDesc')}</Text>
                </View>
              </View>
              <View style={[styles.toggleSwitch, state.stabilize && styles.toggleSwitchActive]}>
                <View style={[styles.toggleThumb, state.stabilize && styles.toggleThumbActive]} />
              </View>
            </Pressable>

            {/* Freeze frame */}
            <Text style={[styles.toolSubTitle, { marginTop: spacing.md }]}>{t('videoEditor.freezeFrame')}</Text>
            <View style={styles.freezeRow}>
              <Pressable
                accessibilityRole="button"
                style={styles.freezeButton}
                onPress={() => {
                  state.pushUndo();
                  haptic.tick();
                  state.setFreezeFrameAt(state.freezeFrameAt === null ? state.currentTime : null);
                }}
              >
                <LinearGradient
                  colors={state.freezeFrameAt !== null
                    ? ['rgba(10,123,79,0.4)', 'rgba(10,123,79,0.2)']
                    : cardGradient
                  }
                  style={styles.freezeButtonGradient}
                >
                  <Icon name="pause" size="sm" color={state.freezeFrameAt !== null ? colors.emerald : tc.text.secondary} />
                  <Text style={[styles.freezeButtonText, state.freezeFrameAt !== null && { color: colors.emerald }]}>
                    {state.freezeFrameAt !== null
                      ? `${t('videoEditor.frozenAt')} ${formatTime(state.freezeFrameAt)}`
                      : t('videoEditor.freezeAtPlayhead')
                    }
                  </Text>
                </LinearGradient>
              </Pressable>
            </View>

            {/* Visual effects toggles */}
            <Text style={[styles.toolSubTitle, { marginTop: spacing.md }]}>{t('videoEditor.visualEffects')}</Text>

            <View style={styles.effectToggleGrid}>
              <Pressable
                style={[styles.effectToggleItem, state.sharpen && styles.effectToggleActive]}
                onPress={() => { state.pushUndo(); state.setSharpen(!state.sharpen); haptic.tick(); }}
              >
                <Icon name="eye" size="sm" color={state.sharpen ? colors.emerald : tc.text.secondary} />
                <Text style={[styles.effectToggleText, state.sharpen && styles.effectToggleTextActive]}>{t('videoEditor.sharpen')}</Text>
              </Pressable>
              <Pressable
                style={[styles.effectToggleItem, state.vignetteOn && styles.effectToggleActive]}
                onPress={() => { state.pushUndo(); state.setVignetteOn(!state.vignetteOn); haptic.tick(); }}
              >
                <Icon name="circle-plus" size="sm" color={state.vignetteOn ? colors.emerald : tc.text.secondary} />
                <Text style={[styles.effectToggleText, state.vignetteOn && styles.effectToggleTextActive]}>{t('videoEditor.vignetteEffect')}</Text>
              </Pressable>
              <Pressable
                style={[styles.effectToggleItem, state.grain && styles.effectToggleActive]}
                onPress={() => { state.pushUndo(); state.setGrain(!state.grain); haptic.tick(); }}
              >
                <Icon name="hash" size="sm" color={state.grain ? colors.emerald : tc.text.secondary} />
                <Text style={[styles.effectToggleText, state.grain && styles.effectToggleTextActive]}>{t('videoEditor.filmGrain')}</Text>
              </Pressable>
              <Pressable
                style={[styles.effectToggleItem, state.rotation !== 0 && styles.effectToggleActive]}
                onPress={() => {
                  state.pushUndo();
                  const rotations: (0 | 90 | 180 | 270)[] = [0, 90, 180, 270];
                  const idx = rotations.indexOf(state.rotation);
                  state.setRotation(rotations[(idx + 1) % rotations.length]);
                  haptic.tick();
                }}
              >
                <Icon name="repeat" size="sm" color={state.rotation !== 0 ? colors.emerald : tc.text.secondary} />
                <Text style={[styles.effectToggleText, state.rotation !== 0 && styles.effectToggleTextActive]}>
                  {state.rotation === 0 ? t('videoEditor.rotate') : `${state.rotation}°`}
                </Text>
              </Pressable>
              <Pressable
                style={[styles.effectToggleItem, state.flipH && styles.effectToggleActive]}
                onPress={() => { state.pushUndo(); state.setFlipH(!state.flipH); haptic.tick(); }}
              >
                <Icon name="arrow-left" size="sm" color={state.flipH ? colors.emerald : tc.text.secondary} style={{ transform: [{ scaleX: isRTL ? 1 : -1 }] }} />
                <Text style={[styles.effectToggleText, state.flipH && styles.effectToggleTextActive]}>{t('videoEditor.flipH')}</Text>
              </Pressable>
              <Pressable
                style={[styles.effectToggleItem, state.flipV && styles.effectToggleActive]}
                onPress={() => { state.pushUndo(); state.setFlipV(!state.flipV); haptic.tick(); }}
              >
                <Icon name="arrow-left" size="sm" color={state.flipV ? colors.emerald : tc.text.secondary} style={{ transform: [{ rotate: '90deg' }] }} />
                <Text style={[styles.effectToggleText, state.flipV && styles.effectToggleTextActive]}>{t('videoEditor.flipV')}</Text>
              </Pressable>
              <Pressable
                style={[styles.effectToggleItem, state.glitch && styles.effectToggleActive]}
                onPress={() => { state.pushUndo(); state.setGlitch(!state.glitch); haptic.tick(); }}
              >
                <Icon name="slash" size="sm" color={state.glitch ? colors.error : tc.text.secondary} />
                <Text style={[styles.effectToggleText, state.glitch && styles.effectToggleTextActive]}>{t('videoEditor.glitchEffect')}</Text>
              </Pressable>
              <Pressable
                style={[styles.effectToggleItem, state.letterbox && styles.effectToggleActive]}
                onPress={() => { state.pushUndo(); state.setLetterbox(!state.letterbox); haptic.tick(); }}
              >
                <Icon name="minus" size="sm" color={state.letterbox ? colors.emerald : tc.text.secondary} />
                <Text style={[styles.effectToggleText, state.letterbox && styles.effectToggleTextActive]}>{t('videoEditor.letterbox')}</Text>
              </Pressable>
              <Pressable
                style={[styles.effectToggleItem, state.boomerang && styles.effectToggleActive]}
                onPress={() => { state.pushUndo(); state.setBoomerang(!state.boomerang); haptic.tick(); }}
              >
                <Icon name="repeat" size="sm" color={state.boomerang ? colors.gold : tc.text.secondary} />
                <Text style={[styles.effectToggleText, state.boomerang && { color: colors.gold, fontWeight: '600' }]}>{t('videoEditor.boomerang')}</Text>
              </Pressable>
            </View>
          </View>
        );

      case 'voiceover':
        return (
          <View style={styles.toolPanel}>
            <Text style={styles.toolPanelTitle}>{t('videoEditor.voiceover')}</Text>
            <Text style={styles.voiceoverHint}>
              {t('videoEditor.voiceoverHint')}
            </Text>

            {/* Record button */}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={state.isRecordingVoiceover ? t('videoEditor.stopRecording') : t('videoEditor.startRecording')}
              style={styles.voiceoverRecordButton}
              onPress={voiceover.toggleVoiceoverRecording}
            >
              <LinearGradient
                colors={state.isRecordingVoiceover
                  ? ['rgba(248,81,73,0.8)', 'rgba(248,81,73,0.6)']
                  : ['rgba(10,123,79,0.8)', 'rgba(10,123,79,0.6)']
                }
                style={styles.voiceoverRecordGradient}
              >
                <Icon name={state.isRecordingVoiceover ? 'square' : 'mic'} size="lg" color="#FFF" />
                <Text style={styles.voiceoverRecordText}>
                  {state.isRecordingVoiceover ? t('videoEditor.stopRecording') : t('videoEditor.startRecording')}
                </Text>
              </LinearGradient>
            </Pressable>

            {/* Show recorded voiceover */}
            {state.voiceoverUri && (
              <View style={styles.voiceoverRecorded}>
                <Icon name="check-circle" size="sm" color={colors.emerald} />
                <Text style={styles.voiceoverRecordedText}>{t('videoEditor.voiceoverReady')}</Text>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => {
                    state.setVoiceoverUri(null);
                    haptic.delete();
                  }}
                >
                  <Icon name="trash" size="sm" color={colors.error} />
                </Pressable>
              </View>
            )}
          </View>
        );

      default:
        return null;
    }
  };

  // ── JSX ─────────────────────────────────────────────────────────────

  return (
    <ScreenErrorBoundary>
    <SafeAreaView style={styles.container} edges={['top']}>
      <GlassHeader title={t('videoEditor.editVideo')} showBackButton />

      {/* Quick action bar */}
      <View style={styles.quickActions}>
        <Pressable accessibilityRole="button" accessibilityLabel={t('videoEditor.undo')} onPress={state.handleUndo} disabled={state.undoStack.length === 0} accessibilityState={{ disabled: state.undoStack.length === 0 }} style={[styles.quickActionBtn, state.undoStack.length === 0 && styles.quickActionDisabled]}>
          <Icon name="arrow-left" size="sm" color={state.undoStack.length > 0 ? tc.text.primary : tc.text.tertiary} />
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel={t('videoEditor.redo')} onPress={state.handleRedo} disabled={state.redoStack.length === 0} accessibilityState={{ disabled: state.redoStack.length === 0 }} style={[styles.quickActionBtn, state.redoStack.length === 0 && styles.quickActionDisabled]}>
          <View style={{ transform: [{ scaleX: isRTL ? 1 : -1 }] }}>
            <Icon name="arrow-left" size="sm" color={state.redoStack.length > 0 ? tc.text.primary : tc.text.tertiary} />
          </View>
        </Pressable>
        <View style={styles.quickActionDivider} />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('videoEditor.reverse')}
          onPress={() => { state.pushUndo(); state.setIsReversed(!state.isReversed); haptic.tick(); }}
          style={[styles.quickActionBtn, state.isReversed && styles.quickActionActive]}
        >
          <Icon name="repeat" size="sm" color={state.isReversed ? colors.emerald : tc.text.secondary} />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('videoEditor.aspectRatio')}
          onPress={() => {
            haptic.tick();
            const ratios: typeof state.aspectRatio[] = ['9:16', '16:9', '1:1', '4:5'];
            const idx = ratios.indexOf(state.aspectRatio);
            state.setAspectRatio(ratios[(idx + 1) % ratios.length]);
          }}
          style={styles.quickActionBtn}
        >
          <Icon name="layers" size="sm" color={tc.text.secondary} />
          <Text style={styles.quickActionLabel}>{state.aspectRatio}</Text>
        </Pressable>
        <View style={styles.quickActionDivider} />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('videoEditor.autoCaptions')}
          onPress={() => {
            if (videoUri) (router as { push: (opts: { pathname: string; params: Record<string, string> }) => void }).push({ pathname: '/(screens)/caption-editor', params: { videoUri } });
          }}
          style={styles.quickActionBtn}
        >
          <Icon name="edit" size="sm" color={tc.text.secondary} />
          <Text style={styles.quickActionLabel}>{t('videoEditor.autoCaptions')}</Text>
        </Pressable>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        {/* Video Preview Area */}
        <View style={styles.previewContainer}>
          <LinearGradient
            colors={['rgba(28,35,51,0.8)', 'rgba(13,17,23,0.9)']}
            style={styles.previewGradient}
          >
            {/* Timestamp Badge */}
            <View style={styles.timestampBadge}>
              <LinearGradient
                colors={['rgba(45,53,72,0.8)', 'rgba(28,35,51,0.6)']}
                style={styles.timestampGradient}
              >
                <Text style={styles.timestampText}>
                  {formatTime(state.currentTime)} / {formatTime(state.totalDuration)}
                </Text>
              </LinearGradient>
            </View>

            {/* Playback Speed Badge */}
            <Pressable accessibilityRole="button" accessibilityLabel={`${t('videoEditor.playbackSpeed')} ${state.playbackSpeed}x`} style={styles.speedBadge} onPress={playback.cyclePlaybackSpeed}>
              <LinearGradient
                colors={['rgba(45,53,72,0.8)', 'rgba(28,35,51,0.6)']}
                style={styles.speedBadgeGradient}
              >
                <Text style={styles.speedBadgeText}>{state.playbackSpeed}x</Text>
              </LinearGradient>
            </Pressable>

            {/* Real Video Player */}
            {videoUri ? (
              <Video
                ref={playback.videoRef}
                source={{ uri: videoUri }}
                style={StyleSheet.absoluteFill}
                resizeMode={ResizeMode.CONTAIN}
                onPlaybackStatusUpdate={playback.onPlaybackStatusUpdate}
                onLoad={() => state.setVideoLoaded(true)}
                shouldPlay={false}
                isLooping={false}
              />
            ) : (
              <View style={styles.videoPlaceholder}>
                <Icon name="video" size="xl" color={tc.text.tertiary} />
                <Text style={styles.noVideoText}>{t('videoEditor.noVideo')}</Text>
              </View>
            )}

            {/* Play/Pause Button */}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={state.isPlaying ? t('videoEditor.pause', 'Pause') : t('videoEditor.play', 'Play')}
              style={styles.playButton}
              onPress={playback.togglePlayback}
            >
              <LinearGradient
                colors={['rgba(10,123,79,0.9)', 'rgba(6,107,66,0.95)']}
                style={styles.playButtonGradient}
              >
                <Icon name={state.isPlaying ? 'pause' : 'play'} size="xl" color="#FFF" />
              </LinearGradient>
            </Pressable>
          </LinearGradient>
        </View>

        {/* Timeline Section */}
        <Animated.View entering={FadeInUp.delay(100).duration(400)}>
          <View style={styles.timelineContainer}>
            <LinearGradient
              colors={cardGradient}
              style={styles.timelineGradient}
            >
              {/* Time Labels */}
              <View style={styles.timeLabels}>
                <Text style={styles.timeLabelStart}>{formatTime(state.startTime)}</Text>
                <Text style={styles.timeLabelEnd}>{formatTime(state.endTime)}</Text>
              </View>

              {/* Waveform Strip with Draggable Trim Handles */}
              <View
                style={styles.waveformContainer}
                onLayout={(e) => { timeline.timelineWidth.current = e.nativeEvent.layout.width; }}
              >
                <View style={styles.waveform}>
                  {timeline.waveformData.map((h, i) => (
                    <View
                      key={i}
                      style={[
                        styles.waveformBar,
                        { height: h }
                      ]}
                    />
                  ))}
                </View>

                {/* Left Trim Handle */}
                <GestureDetector gesture={timeline.leftTrimGesture}>
                  <Animated.View style={[styles.trimHandle, timeline.leftHandleStyle]}>
                    <LinearGradient
                      colors={['rgba(10,123,79,0.8)', 'rgba(10,123,79,0.6)']}
                      style={styles.trimHandleGradient}
                    >
                      <Icon name="chevron-right" size="xs" color="#FFF" />
                    </LinearGradient>
                  </Animated.View>
                </GestureDetector>

                {/* Right Trim Handle */}
                <GestureDetector gesture={timeline.rightTrimGesture}>
                  <Animated.View style={[styles.trimHandle, timeline.rightHandleStyle]}>
                    <LinearGradient
                      colors={['rgba(10,123,79,0.8)', 'rgba(10,123,79,0.6)']}
                      style={styles.trimHandleGradient}
                    >
                      <Icon name="chevron-left" size="xs" color="#FFF" />
                    </LinearGradient>
                  </Animated.View>
                </GestureDetector>

                {/* Playhead */}
                <View style={[styles.playhead, { left: `${state.totalDuration > 0 ? (state.currentTime / state.totalDuration) * 100 : 0}%` }]}>
                  <View style={styles.playheadTriangle} />
                  <View style={styles.playheadLine} />
                </View>
              </View>

              <Text style={styles.dragHint}>{t('videoEditor.dragHandlesToTrim')}</Text>
            </LinearGradient>
          </View>
        </Animated.View>

        {/* Tools Tab Bar */}
        <Animated.View entering={FadeInUp.delay(150).duration(400)}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.toolsScroll}
            contentContainerStyle={styles.toolsContent}
          >
            {[
              { id: 'trim', icon: 'scissors' as IconName, label: t('videoEditor.trim') },
              { id: 'speed', icon: 'fast-forward' as IconName, label: t('videoEditor.speed') },
              { id: 'filters', icon: 'sliders' as IconName, label: t('videoEditor.filters') },
              { id: 'adjust', icon: 'sun' as IconName, label: t('videoEditor.adjust') },
              { id: 'text', icon: 'type' as IconName, label: t('videoEditor.text') },
              { id: 'music', icon: 'music' as IconName, label: t('videoEditor.music') },
              { id: 'volume', icon: 'volume-2' as IconName, label: t('videoEditor.volume') },
              { id: 'effects', icon: 'sliders' as IconName, label: t('videoEditor.effects') },
              { id: 'voiceover', icon: 'mic' as IconName, label: t('videoEditor.voiceover') },
            ].map((tool) => (
              <Pressable accessibilityRole="button"
                accessibilityLabel={tool.label}
                key={tool.id}
                style={styles.toolTab}
                onPress={() => state.setSelectedTool(tool.id as ToolTab)}
              >
                <LinearGradient
                  colors={state.selectedTool === tool.id
                    ? ['rgba(10,123,79,0.5)', 'rgba(10,123,79,0.3)']
                    : cardGradient
                  }
                  style={styles.toolTabGradient}
                >
                  <Icon
                    name={tool.icon}
                    size="sm"
                    color={state.selectedTool === tool.id ? colors.emerald : tc.text.secondary}
                  />
                  <Text style={[
                    styles.toolTabText,
                    state.selectedTool === tool.id && styles.toolTabTextActive
                  ]}>
                    {tool.label}
                  </Text>
                </LinearGradient>
              </Pressable>
            ))}
          </ScrollView>
        </Animated.View>

        {/* Tool Panel */}
        <Animated.View entering={FadeInUp.delay(200).duration(400)}>
          <View style={styles.toolPanelContainer}>
            <LinearGradient
              colors={cardGradient}
              style={styles.toolPanelGradient}
            >
              {renderToolPanel()}
            </LinearGradient>
          </View>
        </Animated.View>

        {/* Quality Selector */}
        <Animated.View entering={FadeInUp.delay(250).duration(400)}>
          <View style={styles.qualityContainer}>
            <Text style={styles.qualityLabel}>{t('videoEditor.exportQuality')}</Text>
            <View style={styles.qualityButtons}>
              {(['720p', '1080p', '4K'] as const).map((quality) => (
                <Pressable accessibilityRole="button"
                  accessibilityLabel={`${t('videoEditor.exportQuality')} ${quality}`}
                  key={quality}
                  style={styles.qualityButton}
                  onPress={() => state.setSelectedQuality(quality)}
                >
                  <LinearGradient
                    colors={state.selectedQuality === quality
                      ? ['rgba(10,123,79,0.4)', 'rgba(10,123,79,0.2)']
                      : cardGradient
                    }
                    style={styles.qualityButtonGradient}
                  >
                    <Text style={[
                      styles.qualityButtonText,
                      state.selectedQuality === quality && styles.qualityButtonTextActive
                    ]}>
                      {quality}
                    </Text>
                  </LinearGradient>
                </Pressable>
              ))}
            </View>
          </View>
        </Animated.View>

        {/* Bottom Spacing */}
        <View style={styles.bottomSpacing} />
      </ScrollView>

      {/* Bottom Action Bar */}
      <View style={[styles.bottomBar, { paddingBottom: insets.bottom }]}>
        <LinearGradient
          colors={['rgba(13,17,23,0.95)', 'rgba(13,17,23,1)']}
          style={styles.bottomBarGradient}
        >
          <Pressable accessibilityRole="button" accessibilityLabel={t('common.cancel')} style={styles.cancelButton} onPress={() => router.back()} hitSlop={8}>
            <Text style={styles.cancelButtonText}>{t('common.cancel')}</Text>
          </Pressable>
          {state.isExporting ? (
            <Pressable accessibilityRole="button" accessibilityLabel={t('common.cancel')} style={styles.exportButton} onPress={exporter.handleCancelExport}>
              <LinearGradient
                colors={['rgba(248,81,73,0.8)', 'rgba(248,81,73,0.6)']}
                style={styles.exportButtonGradient}
              >
                <View style={styles.exportProgressContainer}>
                  <ActivityIndicator size="small" color="#FFF" />
                  <Text style={styles.exportButtonText}>{state.exportProgress}%</Text>
                </View>
              </LinearGradient>
            </Pressable>
          ) : (
            <Pressable accessibilityRole="button" accessibilityLabel={t('videoEditor.export')} style={styles.exportButton} onPress={exporter.handleExport}>
              <LinearGradient
                colors={['rgba(10,123,79,0.9)', 'rgba(6,107,66,0.95)']}
                style={styles.exportButtonGradient}
              >
                <Icon name="check" size="sm" color="#FFF" />
                <Text style={styles.exportButtonText}>{t('videoEditor.export')}</Text>
              </LinearGradient>
            </Pressable>
          )}
        </LinearGradient>
      </View>
      {/* Emoji Picker Bottom Sheet */}
      <EmojiPicker
        visible={state.showEmojiPicker}
        onClose={() => state.setShowEmojiPicker(false)}
        onSelect={(emoji) => {
          state.setCaptionText(prev => prev + emoji);
          state.setShowEmojiPicker(false);
          haptic.tick();
        }}
      />

      {/* Music Picker Bottom Sheet */}
      <MusicPicker
        visible={state.showMusicPicker}
        onClose={() => state.setShowMusicPicker(false)}
        onSelect={(track) => {
          state.setSelectedTrack(track);
          state.setShowMusicPicker(false);
          haptic.tick();
        }}
      />
    </SafeAreaView>
    </ScreenErrorBoundary>
  );
}

const createStyles = (tc: ReturnType<typeof useThemeColors>, screenWidth = fallbackScreenWidth, screenHeight = fallbackScreenHeight) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: tc.bg,
  },
  quickActions: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.xs,
    gap: spacing.xs,
  },
  quickActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.full,
  },
  quickActionDisabled: {
    opacity: 0.3,
  },
  quickActionActive: {
    backgroundColor: 'rgba(10,123,79,0.15)',
  },
  quickActionLabel: {
    fontSize: fontSize.xs,
    color: tc.text.secondary,
  },
  quickActionDivider: {
    width: 1,
    height: 16,
    backgroundColor: tc.border,
    marginHorizontal: spacing.xs,
  },
  previewContainer: {
    marginHorizontal: spacing.base,
    marginTop: spacing.md,
    borderRadius: radius.lg,
    overflow: 'hidden',
  },
  previewGradient: {
    height: screenHeight * 0.42,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.active.white6,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  timestampBadge: {
    position: 'absolute',
    top: spacing.md,
    end: spacing.md,
    borderRadius: radius.full,
    overflow: 'hidden',
  },
  timestampGradient: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  timestampText: {
    fontSize: fontSize.xs,
    color: tc.text.primary,
    fontFamily: fonts.mono,
  },
  speedBadge: {
    position: 'absolute',
    top: spacing.md,
    start: spacing.md,
    borderRadius: radius.full,
    overflow: 'hidden',
  },
  speedBadgeGradient: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  speedBadgeText: {
    fontSize: fontSize.xs,
    color: tc.text.primary,
    fontFamily: fonts.mono,
  },
  playButton: {
    width: 64,
    height: 64,
    borderRadius: radius.full,
    overflow: 'hidden',
  },
  playButtonGradient: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  videoPlaceholder: {
    position: 'absolute',
    opacity: 0.3,
    alignItems: 'center',
    gap: spacing.sm,
  },
  noVideoText: {
    fontSize: fontSize.sm,
    color: tc.text.tertiary,
  },
  exportProgressContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  timelineContainer: {
    marginHorizontal: spacing.base,
    marginTop: spacing.md,
  },
  timelineGradient: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.active.white6,
    padding: spacing.base,
  },
  timeLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  timeLabelStart: {
    fontSize: fontSize.xs,
    color: tc.text.tertiary,
    fontFamily: fonts.mono,
  },
  timeLabelEnd: {
    fontSize: fontSize.xs,
    color: tc.text.tertiary,
    fontFamily: fonts.mono,
  },
  waveformContainer: {
    height: 60,
    backgroundColor: tc.surface,
    borderRadius: radius.md,
    position: 'relative',
    overflow: 'hidden',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
  },
  waveform: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  waveformBar: {
    width: 3,
    backgroundColor: 'rgba(200,150,62,0.6)',
    borderRadius: radius.sm,
  },
  trimHandle: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 28,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  trimHandleGradient: {
    width: 20,
    height: 44,
    borderRadius: radius.sm,
    justifyContent: 'center',
    alignItems: 'center',
  },
  playhead: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 2,
    alignItems: 'center',
  },
  playheadLine: {
    width: 2,
    height: '100%',
    backgroundColor: colors.gold,
  },
  playheadTriangle: {
    width: 0,
    height: 0,
    backgroundColor: 'transparent',
    borderStyle: 'solid',
    borderLeftWidth: 6,
    borderRightWidth: 6,
    borderTopWidth: 8,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: colors.gold,
    marginBottom: 2,
  },
  dragHint: {
    fontSize: fontSize.xs,
    color: tc.text.tertiary,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
  toolsScroll: {
    marginTop: spacing.md,
  },
  toolsContent: {
    paddingHorizontal: spacing.base,
    gap: spacing.sm,
  },
  toolTab: {
    borderRadius: radius.full,
    overflow: 'hidden',
  },
  toolTabGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
  },
  toolTabText: {
    fontSize: fontSize.sm,
    color: tc.text.secondary,
  },
  toolTabTextActive: {
    color: colors.emerald,
    fontWeight: '600',
  },
  toolPanelContainer: {
    marginHorizontal: spacing.base,
    marginTop: spacing.md,
  },
  toolPanelGradient: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.active.white6,
    padding: spacing.base,
  },
  toolPanel: {
    gap: spacing.md,
  },
  toolPanelTitle: {
    fontSize: fontSize.md,
    fontWeight: '600',
    color: tc.text.primary,
  },
  toolSubTitle: {
    fontSize: fontSize.sm,
    color: tc.text.secondary,
    marginTop: spacing.sm,
  },
  timeInputRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  timeInputContainer: {
    flex: 1,
  },
  timeInputLabel: {
    fontSize: fontSize.xs,
    color: tc.text.tertiary,
    marginBottom: spacing.xs,
  },
  timeInput: {
    backgroundColor: tc.surface,
    borderRadius: radius.md,
    padding: spacing.sm,
    fontSize: fontSize.base,
    color: tc.text.primary,
    fontFamily: fonts.mono,
    textAlign: 'center',
  },
  splitButton: {
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  splitButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    padding: spacing.md,
  },
  splitButtonText: {
    fontSize: fontSize.base,
    color: tc.text.primary,
  },
  deleteButton: {
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  deleteButtonInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    padding: spacing.md,
    backgroundColor: 'rgba(248,81,73,0.1)',
    borderRadius: radius.md,
  },
  deleteButtonText: {
    fontSize: fontSize.base,
    color: colors.error,
  },
  speedGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  speedButton: {
    flex: 1,
    minWidth: 70,
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  speedButtonGradient: {
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  speedButtonText: {
    fontSize: fontSize.base,
    color: tc.text.secondary,
  },
  speedButtonTextActive: {
    color: colors.emerald,
    fontWeight: '600',
  },
  filterGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  filterButton: {
    width: (screenWidth - spacing.base * 4 - spacing.sm * 2) / 3,
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  filterButtonGradient: {
    padding: spacing.sm,
    alignItems: 'center',
    gap: spacing.xs,
  },
  filterButtonGradientActive: {
    borderWidth: 2,
    borderColor: colors.emerald,
  },
  filterPreview: {
    width: 36,
    height: 36,
    borderRadius: radius.full,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  filterName: {
    fontSize: fontSize.xs,
    color: tc.text.secondary,
  },
  captionInput: {
    backgroundColor: tc.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    fontSize: fontSize.base,
    color: tc.text.primary,
    minHeight: 80,
    textAlignVertical: 'top',
    borderWidth: 1,
    borderColor: tc.border,
  },
  captionCharCount: {
    fontSize: fontSize.xs,
    color: tc.text.tertiary,
    textAlign: 'right',
  },
  addTextButton: {
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  addTextButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    padding: spacing.md,
  },
  addTextButtonText: {
    fontSize: fontSize.base,
    color: tc.text.primary,
  },
  fontScroll: {
    marginTop: spacing.sm,
  },
  fontButton: {
    marginEnd: spacing.sm,
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  fontButtonGradient: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  fontButtonText: {
    fontSize: fontSize.sm,
    color: tc.text.secondary,
  },
  fontButtonTextActive: {
    color: colors.emerald,
    fontWeight: '600',
  },
  colorRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  colorCircle: {
    width: 32,
    height: 32,
    borderRadius: radius.full,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  colorCircleActive: {
    borderColor: colors.emerald,
    borderWidth: 3,
  },
  libraryButton: {
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  libraryButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.md,
  },
  libraryButtonText: {
    fontSize: fontSize.base,
    color: tc.text.primary,
    flex: 1,
    marginStart: spacing.sm,
  },
  currentTrackCard: {
    marginTop: spacing.sm,
  },
  currentTrackGradient: {
    borderRadius: radius.md,
    padding: spacing.md,
  },
  trackInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  trackIconContainer: {
    borderRadius: radius.sm,
    overflow: 'hidden',
  },
  trackIconGradient: {
    width: 40,
    height: 40,
    borderRadius: radius.sm,
    justifyContent: 'center',
    alignItems: 'center',
  },
  trackDetails: {
    flex: 1,
  },
  trackName: {
    fontSize: fontSize.base,
    color: tc.text.primary,
    fontWeight: '500',
  },
  trackArtist: {
    fontSize: fontSize.xs,
    color: tc.text.tertiary,
  },
  removeTrackButton: {
    width: 32,
    height: 32,
    borderRadius: radius.full,
    backgroundColor: 'rgba(248,81,73,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  effectToggleGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  effectToggleItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: tc.surface,
    borderWidth: 1,
    borderColor: tc.border,
  },
  effectToggleActive: {
    borderColor: colors.emerald,
    backgroundColor: 'rgba(10,123,79,0.1)',
  },
  effectToggleText: {
    fontSize: fontSize.sm,
    color: tc.text.secondary,
  },
  effectToggleTextActive: {
    color: colors.emerald,
    fontWeight: '600',
  },
  adjustRow: {
    marginBottom: spacing.md,
  },
  adjustLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginBottom: spacing.xs,
  },
  adjustLabel: {
    flex: 1,
    fontSize: fontSize.sm,
    color: tc.text.primary,
  },
  adjustValue: {
    fontSize: fontSize.xs,
    color: tc.text.tertiary,
    fontFamily: fonts.mono,
    minWidth: 30,
    textAlign: 'right',
  },
  adjustSliderTrack: {
    height: 4,
    backgroundColor: tc.surface,
    borderRadius: radius.full,
    position: 'relative',
    marginBottom: spacing.xs,
  },
  adjustSliderCenter: {
    position: 'absolute',
    left: '50%',
    width: 1,
    height: '100%',
    backgroundColor: tc.border,
  },
  adjustSliderFill: {
    position: 'absolute',
    height: '100%',
    backgroundColor: colors.emerald,
    borderRadius: radius.full,
  },
  adjustSliderThumb: {
    position: 'absolute',
    width: 14,
    height: 14,
    borderRadius: radius.sm,
    backgroundColor: colors.gold,
    top: -5,
    marginStart: -7,
  },
  adjustPresetRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  adjustPreset: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.full,
  },
  adjustPresetActive: {
    backgroundColor: 'rgba(10,123,79,0.15)',
  },
  adjustPresetText: {
    fontSize: fontSize.xs,
    color: tc.text.tertiary,
  },
  adjustPresetTextActive: {
    color: colors.emerald,
    fontWeight: '600',
  },
  fadeRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  fadeItem: {
    flex: 1,
  },
  fadeLabel: {
    fontSize: fontSize.sm,
    color: tc.text.secondary,
    marginBottom: spacing.xs,
  },
  fadeButtons: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  fadeButton: {
    flex: 1,
    paddingVertical: spacing.xs,
    borderRadius: radius.sm,
    backgroundColor: tc.surface,
    alignItems: 'center',
  },
  fadeButtonActive: {
    backgroundColor: 'rgba(10,123,79,0.2)',
  },
  fadeButtonText: {
    fontSize: fontSize.xs,
    color: tc.text.tertiary,
  },
  fadeButtonTextActive: {
    color: colors.emerald,
    fontWeight: '600',
  },
  ttsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  ttsButton: {
    flex: 1,
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  ttsButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
  },
  ttsButtonText: {
    fontSize: fontSize.sm,
    color: tc.text.secondary,
  },
  textTimingHint: {
    fontSize: fontSize.xs,
    color: tc.text.tertiary,
    fontStyle: 'italic',
  },
  timeInputValue: {
    fontSize: fontSize.base,
    color: tc.text.primary,
    fontFamily: fonts.mono,
    textAlign: 'center',
  },
  effectsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  effectChip: {
    borderRadius: radius.full,
    overflow: 'hidden',
  },
  effectChipGradient: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
  },
  effectChipText: {
    fontSize: fontSize.sm,
    color: tc.text.secondary,
  },
  effectChipTextActive: {
    color: colors.emerald,
    fontWeight: '600',
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
  },
  toggleInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flex: 1,
  },
  toggleLabel: {
    fontSize: fontSize.base,
    color: tc.text.primary,
  },
  toggleDesc: {
    fontSize: fontSize.xs,
    color: tc.text.tertiary,
  },
  toggleSwitch: {
    width: 44,
    height: 24,
    borderRadius: radius.md,
    backgroundColor: tc.surface,
    justifyContent: 'center',
    paddingHorizontal: 2,
  },
  toggleSwitchActive: {
    backgroundColor: colors.emerald,
  },
  toggleThumb: {
    width: 20,
    height: 20,
    borderRadius: radius.md,
    backgroundColor: tc.text.tertiary,
  },
  toggleThumbActive: {
    backgroundColor: '#FFF',
    alignSelf: 'flex-end',
  },
  freezeRow: {
    marginTop: spacing.xs,
  },
  freezeButton: {
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  freezeButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
  },
  freezeButtonText: {
    fontSize: fontSize.base,
    color: tc.text.secondary,
  },
  voiceoverHint: {
    fontSize: fontSize.sm,
    color: tc.text.secondary,
    lineHeight: fontSize.sm * 1.5,
  },
  voiceoverRecordButton: {
    borderRadius: radius.lg,
    overflow: 'hidden',
  },
  voiceoverRecordGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.lg,
    borderRadius: radius.lg,
  },
  voiceoverRecordText: {
    fontSize: fontSize.md,
    fontWeight: '600',
    color: '#FFF',
  },
  voiceoverRecorded: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    backgroundColor: 'rgba(10,123,79,0.1)',
    borderRadius: radius.md,
  },
  voiceoverRecordedText: {
    flex: 1,
    fontSize: fontSize.sm,
    color: colors.emerald,
  },
  noTrackHint: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.lg,
    opacity: 0.5,
  },
  noTrackHintText: {
    fontSize: fontSize.sm,
    color: tc.text.tertiary,
  },
  volumeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  volumeRowSecond: {
    marginTop: spacing.md,
  },
  volumeIconContainer: {
    width: 28,
    height: 28,
    borderRadius: radius.full,
    backgroundColor: tc.surface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  volumeLabelContainer: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  volumeLabel: {
    fontSize: fontSize.sm,
    color: tc.text.secondary,
  },
  volumeValue: {
    fontSize: fontSize.sm,
    color: colors.emerald,
    fontFamily: fonts.mono,
  },
  sliderTrack: {
    height: 6,
    backgroundColor: tc.surface,
    borderRadius: radius.full,
    marginTop: spacing.xs,
    position: 'relative',
  },
  sliderFill: {
    height: '100%',
    backgroundColor: colors.emerald,
    borderRadius: radius.full,
  },
  sliderThumb: {
    position: 'absolute',
    width: 16,
    height: 16,
    borderRadius: radius.full,
    backgroundColor: colors.gold,
    top: -5,
  },
  qualityContainer: {
    marginHorizontal: spacing.base,
    marginTop: spacing.md,
  },
  qualityLabel: {
    fontSize: fontSize.sm,
    color: tc.text.secondary,
    marginBottom: spacing.sm,
  },
  qualityButtons: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  qualityButton: {
    flex: 1,
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  qualityButtonGradient: {
    paddingVertical: spacing.sm,
    alignItems: 'center',
  },
  qualityButtonText: {
    fontSize: fontSize.sm,
    color: tc.text.secondary,
  },
  qualityButtonTextActive: {
    color: colors.emerald,
    fontWeight: '600',
  },
  bottomSpacing: {
    height: 100,
  },
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    start: 0,
    end: 0,
  },
  bottomBarGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    paddingBottom: spacing.lg,
  },
  cancelButton: {
    paddingHorizontal: spacing.lg,
  },
  cancelButtonText: {
    fontSize: fontSize.base,
    color: tc.text.secondary,
  },
  exportButton: {
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  exportButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
  },
  exportButtonText: {
    fontSize: fontSize.base,
    color: '#FFF',
    fontWeight: '600',
  },
});
