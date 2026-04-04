import { useState, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, TextInput, useWindowDimensions, ActivityIndicator, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Icon } from '@/components/ui/Icon';
import { GlassHeader } from '@/components/ui/GlassHeader';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { subtitlesApi } from '@/services/api';
import { colors, spacing, radius, fontSize, fonts } from '@/theme';
import { useTranslation } from '@/hooks/useTranslation';
import { useThemeColors } from '@/hooks/useThemeColors';
import type { SubtitleTrack } from '@/types';
import { ScreenErrorBoundary } from '@/components/ui/ScreenErrorBoundary';
import { BrandedRefreshControl } from '@/components/ui/BrandedRefreshControl';
import { useContextualHaptic } from '@/hooks/useContextualHaptic';
import { showToast } from '@/components/ui/Toast';
import { formatTime } from '@/utils/formatTime';

type FontOption = 'Default' | 'Bold' | 'Handwritten';
type SizeOption = 'S' | 'M' | 'L';
type PositionOption = 'Top' | 'Center' | 'Bottom';
type BackgroundOption = 'None' | 'Dark Bar' | 'Outline';

interface Caption {
  id: string;
  startTime: number;
  endTime: number;
  text: string;
}

const FONT_OPTIONS: FontOption[] = ['Default', 'Bold', 'Handwritten'];
const SIZE_OPTIONS: SizeOption[] = ['S', 'M', 'L'];
const POSITION_OPTIONS: PositionOption[] = ['Top', 'Center', 'Bottom'];
const BACKGROUND_OPTIONS: BackgroundOption[] = ['None', 'Dark Bar', 'Outline'];
const TEXT_COLORS = ['#FFFFFF', '#D4A94F', '#0A7B4F', '#C8963E', '#F85149', colors.extended.blue];

/**
 * Parse an SRT-style subtitle track into individual Caption segments.
 * When no SRT content is available, we generate placeholder captions from the track metadata.
 */
function parseCaptionsFromTracks(tracks: SubtitleTrack[]): Caption[] {
  if (!tracks || tracks.length === 0) return [];

  // Use the first track and create a caption entry per track as a baseline
  return tracks.map((track, index) => ({
    id: track.id,
    startTime: index * 4,
    endTime: (index + 1) * 4,
    text: track.label || `Caption ${index + 1}`,
  }));
}

export default function CaptionEditorScreen() {
  const router = useRouter();
  const tc = useThemeColors();
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { videoId } = useLocalSearchParams<{ videoId: string }>();
  const haptic = useContextualHaptic();
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const scrollRef = useRef<ScrollView>(null);

  const [localCaptions, setLocalCaptions] = useState<Caption[]>([]);
  const [hasLocalEdits, setHasLocalEdits] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);

  // Style states
  const [selectedFont, setSelectedFont] = useState<FontOption>('Default');
  const [selectedSize, setSelectedSize] = useState<SizeOption>('M');
  const [selectedPosition, setSelectedPosition] = useState<PositionOption>('Bottom');
  const [selectedBackground, setSelectedBackground] = useState<BackgroundOption>('Dark Bar');
  const [selectedColor, setSelectedColor] = useState('#FFFFFF');

  // Fetch subtitle tracks for this video
  const {
    data: tracksData,
    isLoading,
    isError,
    isRefetching,
    refetch,
  } = useQuery({
    queryKey: ['subtitles', videoId],
    queryFn: async () => {
      if (!videoId) return [];
      const res = await subtitlesApi.list(videoId);
      return Array.isArray(res) ? res : [];
    },
    enabled: !!videoId,
  });

  const captions = hasLocalEdits ? localCaptions : parseCaptionsFromTracks(tracksData ?? []);

  // Auto-generate captions mutation
  const generateMutation = useMutation({
    mutationFn: async () => {
      if (!videoId) throw new Error('No video ID');
      const res = await subtitlesApi.generate(videoId);
      return res;
    },
    onSuccess: () => {
      showToast({ message: t('captionEditor.captionsGenerated'), variant: 'success' });
      setHasLocalEdits(false);
      queryClient.invalidateQueries({ queryKey: ['subtitles', videoId] });
    },
    onError: () => {
      showToast({ message: t('captionEditor.generateFailed'), variant: 'error' });
    },
  });

  // Save/upload captions mutation
  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!videoId) throw new Error('No video ID');
      // Build an SRT string from local captions and upload
      const srtContent = captions
        .map((c, i) => {
          const startFormatted = formatSrtTime(c.startTime);
          const endFormatted = formatSrtTime(c.endTime);
          return `${i + 1}\n${startFormatted} --> ${endFormatted}\n${c.text}\n`;
        })
        .join('\n');
      // Upload as a new track — srtContent holds the raw SRT text, not a URL.
      // The backend field is named `srtUrl` but here we pass SRT content directly;
      // the server generates the actual URL after persisting the content.
      await subtitlesApi.upload(videoId, {
        label: t('captionEditor.autoGeneratedLabel'),
        language: 'en',
        srtContent,
      });
    },
    onSuccess: () => {
      showToast({ message: t('captionEditor.captionsSaved'), variant: 'success' });
      setHasLocalEdits(false);
      queryClient.invalidateQueries({ queryKey: ['subtitles', videoId] });
    },
    onError: () => {
      showToast({ message: t('captionEditor.saveFailed'), variant: 'error' });
    },
  });

  const formatSrtTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')},000`;
  };

  const getCurrentCaption = () => {
    return captions.find(c => currentTime >= c.startTime && currentTime < c.endTime);
  };

  const handleDeleteCaption = (id: string) => {
    Alert.alert(
      t('captionEditor.deleteCaption', 'Delete Caption'),
      t('captionEditor.deleteCaptionConfirm', 'Are you sure you want to delete this caption?'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: () => {
            haptic.delete();
            setHasLocalEdits(true);
            setLocalCaptions(captions.filter(c => c.id !== id));
          },
        },
      ],
    );
  };

  const handleCaptionTextChange = (id: string, newText: string) => {
    setHasLocalEdits(true);
    setLocalCaptions(captions.map(c => c.id === id ? { ...c, text: newText } : c));
  };

  const handleAutoGenerate = () => {
    haptic.navigate();
    generateMutation.mutate();
  };

  const handleSave = () => {
    haptic.success();
    saveMutation.mutate();
  };

  const handleAddCaption = () => {
    haptic.tick();
    const lastCaption = captions[captions.length - 1];
    const newStart = lastCaption ? lastCaption.endTime : 0;
    const newCaption: Caption = {
      id: Date.now().toString(),
      startTime: newStart,
      endTime: newStart + 4,
      text: t('captionEditor.newCaption'),
    };
    setHasLocalEdits(true);
    setLocalCaptions([...captions, newCaption]);
  };

  const isCaptionActive = (caption: Caption) => {
    return currentTime >= caption.startTime && currentTime < caption.endTime;
  };

  const renderCaptionItem = ({ item, index }: { item: Caption; index: number }) => {
    const active = isCaptionActive(item);

    return (
      <Animated.View entering={FadeInUp.delay(Math.min(index, 15) * 80).duration(400)}>
        <LinearGradient
          colors={active
            ? ['rgba(200,150,62,0.2)', 'rgba(200,150,62,0.05)']
            : colors.gradient.cardDark
          }
          style={[
            styles.captionCard,
            active && styles.captionCardActive
          ]}
        >
          <View style={styles.captionHeader}>
            <LinearGradient
              colors={['rgba(10,123,79,0.3)', 'rgba(10,123,79,0.1)']}
              style={styles.timeBadge}
            >
              <Text style={styles.timeBadgeText}>
                {formatTime(item.startTime)} - {formatTime(item.endTime)}
              </Text>
            </LinearGradient>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('common.delete')}
              style={({ pressed }) => [styles.deleteButton, pressed && { opacity: 0.6 }]}
              onPress={() => handleDeleteCaption(item.id)}
            >
              <View style={styles.deleteButtonInner}>
                <Icon name="trash" size="xs" color={colors.error} />
              </View>
            </Pressable>
          </View>
          <TextInput
            style={[styles.captionInput, { color: tc.text.primary }]}
            value={item.text}
            onChangeText={(text) => handleCaptionTextChange(item.id, text)}
            multiline
            placeholder={t('captionEditor.placeholder')}
            placeholderTextColor={tc.text.tertiary}
          />
        </LinearGradient>
      </Animated.View>
    );
  };

  const getFontFamily = () => {
    switch (selectedFont) {
      case 'Bold': return fonts.bold;
      case 'Handwritten': return fonts.medium;
      default: return fonts.regular;
    }
  };

  const getFontSize = () => {
    switch (selectedSize) {
      case 'S': return fontSize.sm;
      case 'L': return fontSize.lg;
      default: return fontSize.base;
    }
  };

  const getPreviewPosition = () => {
    switch (selectedPosition) {
      case 'Top': return { top: spacing.lg };
      case 'Center': return { top: '40%' as const };
      default: return { bottom: spacing.lg };
    }
  };

  // Loading skeleton
  if (isLoading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: tc.bg }]} edges={['top']}>
        <GlassHeader title={t('captionEditor.title')} showBackButton />
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: spacing.base }}>
          <Skeleton.Rect width="100%" height={screenHeight * 0.28} borderRadius={radius.lg} />
          <View style={{ marginTop: spacing.lg, gap: spacing.md }}>
            <Skeleton.Text width="40%" />
            {[1, 2, 3].map(i => (
              <Skeleton.Rect key={i} width="100%" height={80} borderRadius={radius.md} />
            ))}
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <ScreenErrorBoundary>
      <SafeAreaView style={[styles.container, { backgroundColor: tc.bg }]} edges={['top', 'bottom']}>
        <GlassHeader title={t('captionEditor.title')} showBackButton />

        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          ref={scrollRef}
          showsVerticalScrollIndicator={false}
          refreshControl={<BrandedRefreshControl refreshing={isRefetching} onRefresh={() => { setHasLocalEdits(false); refetch(); }} />}
        >
          {/* Video Preview */}
          <Animated.View entering={FadeInUp.delay(50).duration(400)}>
            <View style={styles.previewContainer}>
              <LinearGradient
                colors={['rgba(28,35,51,0.8)', 'rgba(13,17,23,0.9)']}
                style={[styles.previewGradient, { height: screenHeight * 0.28 }]}
              >
                {/* Video Placeholder */}
                <View style={styles.videoPlaceholder}>
                  <Icon name="video" size="xl" color={tc.text.tertiary} />
                </View>

                {/* Caption Overlay */}
                <View style={[styles.captionOverlay, getPreviewPosition()]}>
                  {selectedBackground === 'Dark Bar' && (
                    <View style={styles.captionBackground}>
                      <Text style={[
                        styles.captionOverlayText,
                        {
                          fontFamily: getFontFamily(),
                          fontSize: getFontSize(),
                          color: selectedColor,
                        }
                      ]}>
                        {getCurrentCaption()?.text || t('captionEditor.previewPlaceholder')}
                      </Text>
                    </View>
                  )}
                  {selectedBackground === 'Outline' && (
                    <Text style={[
                      styles.captionOverlayText,
                      styles.captionOutline,
                      {
                        fontFamily: getFontFamily(),
                        fontSize: getFontSize(),
                        color: selectedColor,
                      }
                    ]}>
                      {getCurrentCaption()?.text || t('captionEditor.previewPlaceholder')}
                    </Text>
                  )}
                  {selectedBackground === 'None' && (
                    <Text style={[
                      styles.captionOverlayText,
                      {
                        fontFamily: getFontFamily(),
                        fontSize: getFontSize(),
                        color: selectedColor,
                        textShadowColor: 'rgba(0,0,0,0.8)',
                        textShadowOffset: { width: 1, height: 1 },
                        textShadowRadius: 2,
                      }
                    ]}>
                      {getCurrentCaption()?.text || t('captionEditor.previewPlaceholder')}
                    </Text>
                  )}
                </View>

                {/* Timestamp */}
                <View style={styles.timestampBadge}>
                  <LinearGradient
                    colors={['rgba(45,53,72,0.8)', 'rgba(28,35,51,0.6)']}
                    style={styles.timestampGradient}
                  >
                    <Text style={[styles.timestampText, { color: tc.text.primary }]}>
                      {formatTime(currentTime)} / 01:30
                    </Text>
                  </LinearGradient>
                </View>

                {/* Playback Controls */}
                <View style={styles.playbackControls}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t('accessibility.rewind5Seconds')}
                    style={({ pressed }) => [styles.controlCircle, pressed && { opacity: 0.7 }]}
                    onPress={() => { haptic.tick(); setCurrentTime(Math.max(0, currentTime - 5)); }}
                  >
                    <LinearGradient
                      colors={['rgba(45,53,72,0.8)', 'rgba(28,35,51,0.6)']}
                      style={styles.controlGradient}
                    >
                      <Icon name="chevron-left" size="sm" color={tc.text.primary} />
                    </LinearGradient>
                  </Pressable>

                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={isPlaying ? t('common.pause') : t('common.play')}
                    style={({ pressed }) => [styles.controlCircle, styles.playCircle, pressed && { opacity: 0.7 }]}
                    onPress={() => { haptic.tick(); setIsPlaying(!isPlaying); }}
                  >
                    <LinearGradient
                      colors={['rgba(10,123,79,0.9)', 'rgba(6,107,66,0.95)']}
                      style={styles.controlGradient}
                    >
                      <Icon name={isPlaying ? "pause" : "play"} size="md" color={tc.text.primary} />
                    </LinearGradient>
                  </Pressable>

                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t('accessibility.forward5Seconds')}
                    style={({ pressed }) => [styles.controlCircle, pressed && { opacity: 0.7 }]}
                    onPress={() => { haptic.tick(); setCurrentTime(Math.min(90, currentTime + 5)); }}
                  >
                    <LinearGradient
                      colors={['rgba(45,53,72,0.8)', 'rgba(28,35,51,0.6)']}
                      style={styles.controlGradient}
                    >
                      <Icon name="chevron-right" size="sm" color={tc.text.primary} />
                    </LinearGradient>
                  </Pressable>
                </View>
              </LinearGradient>
            </View>
          </Animated.View>

          {/* Caption List */}
          <Animated.View entering={FadeInUp.delay(100).duration(400)}>
            <View style={styles.listHeader}>
              <Text style={[styles.listTitle, { color: tc.text.primary }]}>{t('captionEditor.captions', { count: captions.length })}</Text>
              <Pressable accessibilityRole="button" accessibilityLabel={t('common.add')} style={styles.addCaptionButton} onPress={handleAddCaption}>
                <LinearGradient
                  colors={['rgba(10,123,79,0.3)', 'rgba(10,123,79,0.1)']}
                  style={styles.addCaptionGradient}
                >
                  <Icon name="circle-plus" size="xs" color={colors.emerald} />
                  <Text style={styles.addCaptionText}>{t('common.add')}</Text>
                </LinearGradient>
              </Pressable>
            </View>

            {isError ? (
              <EmptyState
                icon="slash"
                title={t('common.error')}
                subtitle={t('errors.loadContentFailed', 'Could not load captions. Check your connection.')}
                actionLabel={t('common.retry', 'Retry')}
                onAction={() => refetch()}
              />
            ) : captions.length === 0 ? (
              <EmptyState
                icon="type"
                title={t('captionEditor.noCaptions')}
                subtitle={t('captionEditor.noCaptionsSubtitle')}
                actionLabel={t('captionEditor.autoGenerate')}
                onAction={handleAutoGenerate}
              />
            ) : (
              <View style={styles.captionList}>
                {captions.map((item, index) => (
                  <View key={item.id}>
                    {renderCaptionItem({ item, index })}
                  </View>
                ))}
              </View>
            )}
          </Animated.View>

          {/* Style Panel */}
          <Animated.View entering={FadeInUp.delay(200).duration(400)}>
            <View style={styles.styleCard}>
              <LinearGradient
                colors={colors.gradient.cardDark}
                style={styles.styleGradient}
              >
                {/* Header */}
                <View style={styles.styleHeader}>
                  <View style={styles.styleIconContainer}>
                    <LinearGradient
                      colors={['rgba(10,123,79,0.2)', 'rgba(200,150,62,0.1)']}
                      style={styles.styleIconGradient}
                    >
                      <Icon name="type" size="sm" color={colors.emerald} />
                    </LinearGradient>
                  </View>
                  <Text style={[styles.styleTitle, { color: tc.text.primary }]}>{t('captionEditor.style')}</Text>
                </View>

                {/* Font Selector */}
                <Text style={[styles.styleLabel, { color: tc.text.secondary }]}>{t('captionEditor.font')}</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.selectorScroll}>
                  {FONT_OPTIONS.map((font) => (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={t(`captionEditor.fontOption.${font.toLowerCase()}`)}
                      key={font}
                      style={styles.selectorButton}
                      onPress={() => { haptic.tick(); setSelectedFont(font); }}
                    >
                      <LinearGradient
                        colors={selectedFont === font
                          ? ['rgba(10,123,79,0.4)', 'rgba(10,123,79,0.2)']
                          : colors.gradient.cardDark
                        }
                        style={styles.selectorButtonGradient}
                      >
                        <Text style={[
                          styles.selectorButtonText, { color: tc.text.secondary },
                          selectedFont === font && styles.selectorButtonTextActive
                        ]}>
                          {t(`captionEditor.fontOption.${font.toLowerCase()}`)}
                        </Text>
                      </LinearGradient>
                    </Pressable>
                  ))}
                </ScrollView>

                {/* Size Selector */}
                <Text style={[styles.styleLabel, { color: tc.text.secondary }]}>{t('captionEditor.size')}</Text>
                <View style={styles.selectorRow}>
                  {SIZE_OPTIONS.map((size) => (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={t(`captionEditor.sizeOption.${size.toLowerCase()}`)}
                      key={size}
                      style={styles.selectorButton}
                      onPress={() => { haptic.tick(); setSelectedSize(size); }}
                    >
                      <LinearGradient
                        colors={selectedSize === size
                          ? ['rgba(10,123,79,0.4)', 'rgba(10,123,79,0.2)']
                          : colors.gradient.cardDark
                        }
                        style={styles.selectorButtonGradient}
                      >
                        <Text style={[
                          styles.selectorButtonText, { color: tc.text.secondary },
                          selectedSize === size && styles.selectorButtonTextActive
                        ]}>
                          {t(`captionEditor.sizeOption.${size.toLowerCase()}`)}
                        </Text>
                      </LinearGradient>
                    </Pressable>
                  ))}
                </View>

                {/* Position Selector */}
                <Text style={[styles.styleLabel, { color: tc.text.secondary }]}>{t('captionEditor.position')}</Text>
                <View style={styles.selectorRow}>
                  {POSITION_OPTIONS.map((position) => (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={t(`captionEditor.positionOption.${position.toLowerCase()}`)}
                      key={position}
                      style={styles.selectorButton}
                      onPress={() => { haptic.tick(); setSelectedPosition(position); }}
                    >
                      <LinearGradient
                        colors={selectedPosition === position
                          ? ['rgba(10,123,79,0.4)', 'rgba(10,123,79,0.2)']
                          : colors.gradient.cardDark
                        }
                        style={styles.selectorButtonGradient}
                      >
                        <Text style={[
                          styles.selectorButtonText, { color: tc.text.secondary },
                          selectedPosition === position && styles.selectorButtonTextActive
                        ]}>
                          {t(`captionEditor.positionOption.${position.toLowerCase()}`)}
                        </Text>
                      </LinearGradient>
                    </Pressable>
                  ))}
                </View>

                {/* Background Selector */}
                <Text style={[styles.styleLabel, { color: tc.text.secondary }]}>{t('captionEditor.background')}</Text>
                <View style={styles.selectorRow}>
                  {BACKGROUND_OPTIONS.map((bg) => (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={t(`captionEditor.backgroundOption.${bg.toLowerCase().replace(/\s+/g, '')}`)}
                      key={bg}
                      style={styles.selectorButton}
                      onPress={() => { haptic.tick(); setSelectedBackground(bg); }}
                    >
                      <LinearGradient
                        colors={selectedBackground === bg
                          ? ['rgba(10,123,79,0.4)', 'rgba(10,123,79,0.2)']
                          : colors.gradient.cardDark
                        }
                        style={styles.selectorButtonGradient}
                      >
                        <Text style={[
                          styles.selectorButtonText, { color: tc.text.secondary },
                          selectedBackground === bg && styles.selectorButtonTextActive
                        ]}>
                          {t(`captionEditor.backgroundOption.${bg.toLowerCase().replace(/\s+/g, '')}`)}
                        </Text>
                      </LinearGradient>
                    </Pressable>
                  ))}
                </View>

                {/* Color Picker */}
                <Text style={[styles.styleLabel, { color: tc.text.secondary }]}>{t('captionEditor.color')}</Text>
                <View style={styles.colorRow}>
                  {TEXT_COLORS.map((color) => (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={t('captionEditor.color') + ` ${color}`}
                      key={color}
                      style={[
                        styles.colorCircle,
                        { backgroundColor: color },
                        selectedColor === color && styles.colorCircleActive
                      ]}
                      onPress={() => { haptic.tick(); setSelectedColor(color); }}
                    />
                  ))}
                </View>
              </LinearGradient>
            </View>
          </Animated.View>

          {/* Bottom Spacing */}
          <View style={styles.bottomSpacing} />
        </ScrollView>
        </KeyboardAvoidingView>

        {/* Bottom Action Bar */}
        <View style={[styles.bottomBar, { backgroundColor: tc.bg }]}>
          <View
            style={styles.bottomBarGradient}
          >
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('captionEditor.autoGenerate')}
              style={styles.autoGenButton}
              onPress={handleAutoGenerate}
              disabled={generateMutation.isPending}
            >
              <LinearGradient
                colors={['rgba(45,53,72,0.6)', 'rgba(28,35,51,0.4)']}
                style={styles.autoGenGradient}
              >
                {generateMutation.isPending ? (
                  <>
                    <ActivityIndicator size="small" color={tc.text.secondary} />
                    <Text style={[styles.autoGenText, { color: tc.text.secondary }]}>{t('captionEditor.processing')}</Text>
                  </>
                ) : (
                  <>
                    <Icon name="mic" size="sm" color={tc.text.secondary} />
                    <Text style={[styles.autoGenText, { color: tc.text.secondary }]}>{t('captionEditor.autoGenerate')}</Text>
                  </>
                )}
              </LinearGradient>
            </Pressable>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('common.save')}
              style={styles.saveButton}
              onPress={handleSave}
              disabled={saveMutation.isPending}
            >
              <LinearGradient
                colors={['rgba(10,123,79,0.9)', 'rgba(6,107,66,0.95)']}
                style={styles.saveGradient}
              >
                {saveMutation.isPending ? (
                  <ActivityIndicator size="small" color={tc.text.primary} />
                ) : (
                  <Icon name="check" size="sm" color={tc.text.primary} />
                )}
                <Text style={[styles.saveText, { color: tc.text.primary }]}>{t('common.save')}</Text>
              </LinearGradient>
            </Pressable>
          </View>
        </View>
      </SafeAreaView>

    </ScreenErrorBoundary>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  previewContainer: {
    marginHorizontal: spacing.base,
    marginTop: spacing.md,
    borderRadius: radius.lg,
    overflow: 'hidden',
  },
  previewGradient: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.active.white6,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  videoPlaceholder: {
    opacity: 0.3,
  },
  captionOverlay: {
    position: 'absolute',
    start: spacing.base,
    end: spacing.base,
    alignItems: 'center',
  },
  captionBackground: {
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.sm,
  },
  captionOverlayText: {
    textAlign: 'center',
  },
  captionOutline: {
    textShadowColor: '#000',
    textShadowOffset: { width: -1, height: -1 },
    textShadowRadius: 2,
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
    fontFamily: fonts.mono,
  },
  playbackControls: {
    position: 'absolute',
    bottom: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  controlCircle: {
    borderRadius: radius.full,
    overflow: 'hidden',
  },
  playCircle: {
    transform: [{ scale: 1.2 }],
  },
  controlGradient: {
    width: 44,
    height: 44,
    borderRadius: radius.full,
    justifyContent: 'center',
    alignItems: 'center',
  },
  listHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginHorizontal: spacing.base,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  listTitle: {
    fontSize: fontSize.base,
    fontWeight: '600',
  },
  addCaptionButton: {
    borderRadius: radius.full,
    overflow: 'hidden',
  },
  addCaptionGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  addCaptionText: {
    fontSize: fontSize.sm,
    color: colors.emerald,
    fontWeight: '500',
  },
  captionList: {
    paddingHorizontal: spacing.base,
    gap: spacing.md,
  },
  captionCard: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.active.white6,
    padding: spacing.base,
  },
  captionCardActive: {
    borderColor: colors.gold,
    borderWidth: 2,
  },
  captionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  timeBadge: {
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  timeBadgeText: {
    fontSize: fontSize.xs,
    color: colors.emerald,
    fontFamily: fonts.mono,
  },
  deleteButton: {
    borderRadius: radius.full,
    overflow: 'hidden',
  },
  deleteButtonInner: {
    width: 28,
    height: 28,
    borderRadius: radius.full,
    backgroundColor: 'rgba(248,81,73,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  captionInput: {
    fontSize: fontSize.base,
    minHeight: 40,
    textAlignVertical: 'top',
  },
  styleCard: {
    marginHorizontal: spacing.base,
    marginTop: spacing.md,
  },
  styleGradient: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.active.white6,
    padding: spacing.base,
  },
  styleHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  styleIconContainer: {
    borderRadius: radius.sm,
    overflow: 'hidden',
  },
  styleIconGradient: {
    width: 32,
    height: 32,
    borderRadius: radius.sm,
    justifyContent: 'center',
    alignItems: 'center',
  },
  styleTitle: {
    fontSize: fontSize.base,
    fontWeight: '600',
  },
  styleLabel: {
    fontSize: fontSize.sm,
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
  },
  selectorScroll: {
    marginBottom: spacing.sm,
  },
  selectorRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  selectorButton: {
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  selectorButtonGradient: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
  },
  selectorButtonText: {
    fontSize: fontSize.sm,
  },
  selectorButtonTextActive: {
    color: colors.emerald,
    fontWeight: '600',
  },
  colorRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.xs,
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
    gap: spacing.md,
  },
  autoGenButton: {
    flex: 1,
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  autoGenGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
  },
  autoGenText: {
    fontSize: fontSize.base,
  },
  saveButton: {
    flex: 1,
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  saveGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
  },
  saveText: {
    fontSize: fontSize.base,
    fontWeight: '600',
  },
});
