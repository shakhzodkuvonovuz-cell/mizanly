import { useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl, TouchableOpacity, Dimensions, TextInput, FlatList } from 'react-native';
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
import type { SubtitleTrack } from '@/types';

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

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
const TEXT_COLORS = ['#FFFFFF', '#D4A94F', '#0A7B4F', '#C8963E', '#F85149', '#58A6FF'];

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
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { videoId } = useLocalSearchParams<{ videoId: string }>();

  const [localCaptions, setLocalCaptions] = useState<Caption[]>([]);
  const [hasLocalEdits, setHasLocalEdits] = useState(false);
  const [currentTime, setCurrentTime] = useState(12);
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
    isRefetching,
    refetch,
  } = useQuery({
    queryKey: ['subtitles', videoId],
    queryFn: async () => {
      if (!videoId) return [];
      const res = await subtitlesApi.list(videoId);
      return (res as { data: SubtitleTrack[] }).data ?? [];
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
      setHasLocalEdits(false);
      queryClient.invalidateQueries({ queryKey: ['subtitles', videoId] });
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
      // Upload as a new track (the SRT URL would be generated server-side)
      await subtitlesApi.upload(videoId, {
        label: 'Auto-generated',
        language: 'en',
        srtUrl: srtContent,
      });
    },
    onSuccess: () => {
      setHasLocalEdits(false);
      queryClient.invalidateQueries({ queryKey: ['subtitles', videoId] });
    },
  });

  const formatSrtTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')},000`;
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const getCurrentCaption = () => {
    return captions.find(c => currentTime >= c.startTime && currentTime < c.endTime);
  };

  const handleDeleteCaption = (id: string) => {
    setHasLocalEdits(true);
    setLocalCaptions(captions.filter(c => c.id !== id));
  };

  const handleCaptionTextChange = (id: string, newText: string) => {
    setHasLocalEdits(true);
    setLocalCaptions(captions.map(c => c.id === id ? { ...c, text: newText } : c));
  };

  const handleAutoGenerate = () => {
    generateMutation.mutate();
  };

  const handleSave = () => {
    saveMutation.mutate();
  };

  const handleAddCaption = () => {
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
      <Animated.View entering={FadeInUp.delay(index * 80).duration(400)}>
        <LinearGradient
          colors={active
            ? ['rgba(200,150,62,0.2)', 'rgba(200,150,62,0.05)']
            : ['rgba(45,53,72,0.4)', 'rgba(28,35,51,0.2)']
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
            <TouchableOpacity
              style={styles.deleteButton}
              onPress={() => handleDeleteCaption(item.id)}
            >
              <View style={styles.deleteButtonInner}>
                <Icon name="trash" size="xs" color={colors.error} />
              </View>
            </TouchableOpacity>
          </View>
          <TextInput
            style={styles.captionInput}
            value={item.text}
            onChangeText={(text) => handleCaptionTextChange(item.id, text)}
            multiline
            placeholder={t('captionEditor.placeholder')}
            placeholderTextColor={colors.text.tertiary}
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
      <SafeAreaView style={styles.container} edges={['top']}>
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
    <SafeAreaView style={styles.container} edges={['top']}>
      <GlassHeader title={t('captionEditor.title')} showBackButton />

      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl tintColor={colors.emerald} refreshing={isRefetching} onRefresh={() => refetch()} />}
      >
        {/* Video Preview */}
        <Animated.View entering={FadeInUp.delay(50).duration(400)}>
          <View style={styles.previewContainer}>
            <LinearGradient
              colors={['rgba(28,35,51,0.8)', 'rgba(13,17,23,0.9)']}
              style={styles.previewGradient}
            >
              {/* Video Placeholder */}
              <View style={styles.videoPlaceholder}>
                <Icon name="video" size="xl" color={colors.text.tertiary} />
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
                  <Text style={styles.timestampText}>
                    {formatTime(currentTime)} / 01:30
                  </Text>
                </LinearGradient>
              </View>

              {/* Playback Controls */}
              <View style={styles.playbackControls}>
                <TouchableOpacity
                  style={styles.controlCircle}
                  onPress={() => setCurrentTime(Math.max(0, currentTime - 5))}
                >
                  <LinearGradient
                    colors={['rgba(45,53,72,0.8)', 'rgba(28,35,51,0.6)']}
                    style={styles.controlGradient}
                  >
                    <Icon name="rewind" size="sm" color={colors.text.primary} />
                  </LinearGradient>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.controlCircle, styles.playCircle]}
                  onPress={() => setIsPlaying(!isPlaying)}
                >
                  <LinearGradient
                    colors={['rgba(10,123,79,0.9)', 'rgba(6,107,66,0.95)']}
                    style={styles.controlGradient}
                  >
                    <Icon name={isPlaying ? 'pause' : 'play'} size="md" color="#FFF" />
                  </LinearGradient>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.controlCircle}
                  onPress={() => setCurrentTime(Math.min(90, currentTime + 5))}
                >
                  <LinearGradient
                    colors={['rgba(45,53,72,0.8)', 'rgba(28,35,51,0.6)']}
                    style={styles.controlGradient}
                  >
                    <Icon name="fast-forward" size="sm" color={colors.text.primary} />
                  </LinearGradient>
                </TouchableOpacity>
              </View>
            </LinearGradient>
          </View>
        </Animated.View>

        {/* Caption List */}
        <Animated.View entering={FadeInUp.delay(100).duration(400)}>
          <View style={styles.listHeader}>
            <Text style={styles.listTitle}>{t('captionEditor.captions', { count: captions.length })}</Text>
            <TouchableOpacity style={styles.addCaptionButton} onPress={handleAddCaption}>
              <LinearGradient
                colors={['rgba(10,123,79,0.3)', 'rgba(10,123,79,0.1)']}
                style={styles.addCaptionGradient}
              >
                <Icon name="circle-plus" size="xs" color={colors.emerald} />
                <Text style={styles.addCaptionText}>{t('common.add')}</Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>

          {captions.length === 0 ? (
            <EmptyState
              icon="type"
              title={t('captionEditor.noCaptions')}
              subtitle={t('captionEditor.noCaptionsSubtitle')}
              actionLabel={t('captionEditor.autoGenerate')}
              onAction={handleAutoGenerate}
            />
          ) : (
            <FlatList
              data={captions}
              renderItem={renderCaptionItem}
              keyExtractor={(item) => item.id}
              scrollEnabled={false}
              contentContainerStyle={styles.captionList}
            />
          )}
        </Animated.View>

        {/* Style Panel */}
        <Animated.View entering={FadeInUp.delay(200).duration(400)}>
          <View style={styles.styleCard}>
            <LinearGradient
              colors={['rgba(45,53,72,0.4)', 'rgba(28,35,51,0.2)']}
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
                <Text style={styles.styleTitle}>{t('captionEditor.style')}</Text>
              </View>

              {/* Font Selector */}
              <Text style={styles.styleLabel}>{t('captionEditor.font')}</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.selectorScroll}>
                {FONT_OPTIONS.map((font) => (
                  <TouchableOpacity
                    key={font}
                    style={styles.selectorButton}
                    onPress={() => setSelectedFont(font)}
                  >
                    <LinearGradient
                      colors={selectedFont === font
                        ? ['rgba(10,123,79,0.4)', 'rgba(10,123,79,0.2)']
                        : ['rgba(45,53,72,0.4)', 'rgba(28,35,51,0.2)']
                      }
                      style={styles.selectorButtonGradient}
                    >
                      <Text style={[
                        styles.selectorButtonText,
                        selectedFont === font && styles.selectorButtonTextActive
                      ]}>
                        {t(`captionEditor.fontOption.${font.toLowerCase()}`)}
                      </Text>
                    </LinearGradient>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              {/* Size Selector */}
              <Text style={styles.styleLabel}>{t('captionEditor.size')}</Text>
              <View style={styles.selectorRow}>
                {SIZE_OPTIONS.map((size) => (
                  <TouchableOpacity
                    key={size}
                    style={styles.selectorButton}
                    onPress={() => setSelectedSize(size)}
                  >
                    <LinearGradient
                      colors={selectedSize === size
                        ? ['rgba(10,123,79,0.4)', 'rgba(10,123,79,0.2)']
                        : ['rgba(45,53,72,0.4)', 'rgba(28,35,51,0.2)']
                      }
                      style={styles.selectorButtonGradient}
                    >
                      <Text style={[
                        styles.selectorButtonText,
                        selectedSize === size && styles.selectorButtonTextActive
                      ]}>
                        {t(`captionEditor.sizeOption.${size.toLowerCase()}`)}
                      </Text>
                    </LinearGradient>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Position Selector */}
              <Text style={styles.styleLabel}>{t('captionEditor.position')}</Text>
              <View style={styles.selectorRow}>
                {POSITION_OPTIONS.map((position) => (
                  <TouchableOpacity
                    key={position}
                    style={styles.selectorButton}
                    onPress={() => setSelectedPosition(position)}
                  >
                    <LinearGradient
                      colors={selectedPosition === position
                        ? ['rgba(10,123,79,0.4)', 'rgba(10,123,79,0.2)']
                        : ['rgba(45,53,72,0.4)', 'rgba(28,35,51,0.2)']
                      }
                      style={styles.selectorButtonGradient}
                    >
                      <Text style={[
                        styles.selectorButtonText,
                        selectedPosition === position && styles.selectorButtonTextActive
                      ]}>
                        {t(`captionEditor.positionOption.${position.toLowerCase()}`)}
                      </Text>
                    </LinearGradient>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Background Selector */}
              <Text style={styles.styleLabel}>{t('captionEditor.background')}</Text>
              <View style={styles.selectorRow}>
                {BACKGROUND_OPTIONS.map((bg) => (
                  <TouchableOpacity
                    key={bg}
                    style={styles.selectorButton}
                    onPress={() => setSelectedBackground(bg)}
                  >
                    <LinearGradient
                      colors={selectedBackground === bg
                        ? ['rgba(10,123,79,0.4)', 'rgba(10,123,79,0.2)']
                        : ['rgba(45,53,72,0.4)', 'rgba(28,35,51,0.2)']
                      }
                      style={styles.selectorButtonGradient}
                    >
                      <Text style={[
                        styles.selectorButtonText,
                        selectedBackground === bg && styles.selectorButtonTextActive
                      ]}>
                        {t(`captionEditor.backgroundOption.${bg.toLowerCase().replace(/\s+/g, '')}`)}
                      </Text>
                    </LinearGradient>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Color Picker */}
              <Text style={styles.styleLabel}>{t('captionEditor.color')}</Text>
              <View style={styles.colorRow}>
                {TEXT_COLORS.map((color) => (
                  <TouchableOpacity
                    key={color}
                    style={[
                      styles.colorCircle,
                      { backgroundColor: color },
                      selectedColor === color && styles.colorCircleActive
                    ]}
                    onPress={() => setSelectedColor(color)}
                  />
                ))}
              </View>
            </LinearGradient>
          </View>
        </Animated.View>

        {/* Bottom Spacing */}
        <View style={styles.bottomSpacing} />
      </ScrollView>

      {/* Bottom Action Bar */}
      <View style={styles.bottomBar}>
        <LinearGradient
          colors={['rgba(13,17,23,0.95)', 'rgba(13,17,23,1)']}
          style={styles.bottomBarGradient}
        >
          <TouchableOpacity
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
                  <Skeleton.Circle size={16} />
                  <Text style={styles.autoGenText}>{t('captionEditor.processing')}</Text>
                </>
              ) : (
                <>
                  <Icon name="mic" size="sm" color={colors.text.secondary} />
                  <Text style={styles.autoGenText}>{t('captionEditor.autoGenerate')}</Text>
                </>
              )}
            </LinearGradient>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.saveButton}
            onPress={handleSave}
            disabled={saveMutation.isPending}
          >
            <LinearGradient
              colors={['rgba(10,123,79,0.9)', 'rgba(6,107,66,0.95)']}
              style={styles.saveGradient}
            >
              {saveMutation.isPending ? (
                <Skeleton.Circle size={16} />
              ) : (
                <Icon name="check" size="sm" color="#FFF" />
              )}
              <Text style={styles.saveText}>{t('common.save')}</Text>
            </LinearGradient>
          </TouchableOpacity>
        </LinearGradient>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.dark.bg,
  },
  previewContainer: {
    marginHorizontal: spacing.base,
    marginTop: spacing.md,
    borderRadius: radius.lg,
    overflow: 'hidden',
  },
  previewGradient: {
    height: screenHeight * 0.28,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  videoPlaceholder: {
    opacity: 0.3,
  },
  captionOverlay: {
    position: 'absolute',
    left: spacing.base,
    right: spacing.base,
    alignItems: 'center',
  },
  captionBackground: {
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.sm,
  },
  captionOverlayText: {
    color: colors.text.primary,
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
    right: spacing.md,
    borderRadius: radius.full,
    overflow: 'hidden',
  },
  timestampGradient: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  timestampText: {
    fontSize: fontSize.xs,
    color: colors.text.primary,
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
    color: colors.text.primary,
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
    borderColor: 'rgba(255,255,255,0.06)',
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
    color: colors.text.primary,
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
    borderColor: 'rgba(255,255,255,0.06)',
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
    color: colors.text.primary,
  },
  styleLabel: {
    fontSize: fontSize.sm,
    color: colors.text.secondary,
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
    color: colors.text.secondary,
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
    left: 0,
    right: 0,
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
    color: colors.text.secondary,
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
    color: '#FFF',
    fontWeight: '600',
  },
});
