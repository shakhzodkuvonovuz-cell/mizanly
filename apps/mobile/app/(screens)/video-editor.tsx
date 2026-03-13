import { useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl, TouchableOpacity, Dimensions, TextInput } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { Icon, type IconName } from '@/components/ui/Icon';
import { GlassHeader } from '@/components/ui/GlassHeader';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { colors, spacing, radius, fontSize, fonts } from '@/theme';
import { useTranslation } from '@/hooks/useTranslation';

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

type ToolTab = 'trim' | 'speed' | 'filters' | 'text' | 'music' | 'volume';
type SpeedOption = 0.25 | 0.5 | 1 | 1.5 | 2 | 3;
type FilterName = 'original' | 'warm' | 'cool' | 'bw' | 'vintage' | 'vivid' | 'dramatic' | 'fade';
type QualityOption = '720p' | '1080p' | '4K';

const SPEED_OPTIONS: SpeedOption[] = [0.25, 0.5, 1, 1.5, 2, 3];

const FILTERS: { id: FilterName; name: string; color: string }[] = [
  { id: 'original', name: 'Original', color: '#FFFFFF' },
  { id: 'warm', name: 'Warm', color: '#D4A94F' },
  { id: 'cool', name: 'Cool', color: '#58A6FF' },
  { id: 'bw', name: 'B&W', color: '#8B949E' },
  { id: 'vintage', name: 'Vintage', color: '#C8963E' },
  { id: 'vivid', name: 'Vivid', color: '#0A7B4F' },
  { id: 'dramatic', name: 'Dramatic', color: '#F85149' },
  { id: 'fade', name: 'Fade', color: '#6E7781' },
];

const FONT_OPTIONS = ['Default', 'Bold', 'Handwritten'];
const TEXT_COLORS = ['#FFFFFF', '#D4A94F', '#0A7B4F', '#C8963E', '#F85149', '#58A6FF'];

export default function VideoEditorScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const [refreshing, setRefreshing] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(12);
  const [totalDuration] = useState(45);
  const [playbackSpeed, setPlaybackSpeed] = useState<SpeedOption>(1);
  const [selectedTool, setSelectedTool] = useState<ToolTab>('trim');
  const [selectedFilter, setSelectedFilter] = useState<FilterName>('original');
  const [selectedQuality, setSelectedQuality] = useState<QualityOption>('1080p');
  const [startTime, setStartTime] = useState(0);
  const [endTime, setEndTime] = useState(45);
  const [selectedFont, setSelectedFont] = useState('Default');
  const [selectedTextColor, setSelectedTextColor] = useState('#FFFFFF');
  const [captionText, setCaptionText] = useState('');
  const [originalVolume, setOriginalVolume] = useState(80);
  const [musicVolume, setMusicVolume] = useState(60);
  const [isExporting, setIsExporting] = useState(false);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 1000);
  }, []);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const cyclePlaybackSpeed = () => {
    const speeds: SpeedOption[] = [0.5, 1, 1.5, 2];
    const currentIndex = speeds.indexOf(playbackSpeed);
    const nextIndex = (currentIndex + 1) % speeds.length;
    setPlaybackSpeed(speeds[nextIndex]);
  };

  const handleExport = () => {
    setIsExporting(true);
    setTimeout(() => {
      setIsExporting(false);
      router.back();
    }, 2000);
  };

  const renderToolPanel = () => {
    switch (selectedTool) {
      case 'trim':
        return (
          <View style={styles.toolPanel}>
            <View style={styles.timeInputRow}>
              <View style={styles.timeInputContainer}>
                <Text style={styles.timeInputLabel}>{t('videoEditor.start')}</Text>
                <TextInput
                  style={styles.timeInput}
                  value={formatTime(startTime)}
                  editable={false}
                />
              </View>
              <View style={styles.timeInputContainer}>
                <Text style={styles.timeInputLabel}>{t('videoEditor.end')}</Text>
                <TextInput
                  style={styles.timeInput}
                  value={formatTime(endTime)}
                  editable={false}
                />
              </View>
            </View>
            <TouchableOpacity style={styles.splitButton}>
              <LinearGradient
                colors={['rgba(45,53,72,0.6)', 'rgba(28,35,51,0.4)']}
                style={styles.splitButtonGradient}
              >
                <Icon name="scissors" size="sm" color={colors.text.primary} />
                <Text style={styles.splitButtonText}>{t('videoEditor.splitAtPlayhead')}</Text>
              </LinearGradient>
            </TouchableOpacity>
            <TouchableOpacity style={styles.deleteButton}>
              <View style={styles.deleteButtonInner}>
                <Icon name="trash" size="sm" color={colors.error} />
                <Text style={styles.deleteButtonText}>{t('videoEditor.deleteSelectedSegment')}</Text>
              </View>
            </TouchableOpacity>
          </View>
        );

      case 'speed':
        return (
          <View style={styles.toolPanel}>
            <Text style={styles.toolPanelTitle}>{t('videoEditor.playbackSpeed')}</Text>
            <View style={styles.speedGrid}>
              {SPEED_OPTIONS.map((speed) => (
                <TouchableOpacity
                  key={speed}
                  style={styles.speedButton}
                  onPress={() => setPlaybackSpeed(speed)}
                >
                  <LinearGradient
                    colors={playbackSpeed === speed
                      ? ['rgba(10,123,79,0.4)', 'rgba(10,123,79,0.2)']
                      : ['rgba(45,53,72,0.4)', 'rgba(28,35,51,0.2)']
                    }
                    style={styles.speedButtonGradient}
                  >
                    <Text style={[
                      styles.speedButtonText,
                      playbackSpeed === speed && styles.speedButtonTextActive
                    ]}>
                      {speed}x
                    </Text>
                  </LinearGradient>
                </TouchableOpacity>
              ))}
            </View>
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
                  <TouchableOpacity
                    style={styles.filterButton}
                    onPress={() => setSelectedFilter(filter.id)}
                  >
                    <LinearGradient
                      colors={['rgba(45,53,72,0.4)', 'rgba(28,35,51,0.2)']}
                      style={[
                        styles.filterButtonGradient,
                        selectedFilter === filter.id && styles.filterButtonGradientActive
                      ]}
                    >
                      <View style={[styles.filterPreview, { backgroundColor: filter.color }]} />
                      <Text style={styles.filterName}>{filter.name}</Text>
                    </LinearGradient>
                  </TouchableOpacity>
                </Animated.View>
              ))}
            </View>
          </View>
        );

      case 'text':
        return (
          <View style={styles.toolPanel}>
            <Text style={styles.toolPanelTitle}>{t('videoEditor.addCaption')}</Text>
            <TouchableOpacity style={styles.addTextButton}>
              <LinearGradient
                colors={['rgba(45,53,72,0.6)', 'rgba(28,35,51,0.4)']}
                style={styles.addTextButtonGradient}
              >
                <Icon name="type" size="sm" color={colors.text.primary} />
                <Text style={styles.addTextButtonText}>{t('videoEditor.addTextOverlay')}</Text>
              </LinearGradient>
            </TouchableOpacity>

            <Text style={styles.toolSubTitle}>{t('videoEditor.fontStyle')}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.fontScroll}>
              {FONT_OPTIONS.map((font) => (
                <TouchableOpacity
                  key={font}
                  style={styles.fontButton}
                  onPress={() => setSelectedFont(font)}
                >
                  <LinearGradient
                    colors={selectedFont === font
                      ? ['rgba(10,123,79,0.4)', 'rgba(10,123,79,0.2)']
                      : ['rgba(45,53,72,0.4)', 'rgba(28,35,51,0.2)']
                    }
                    style={styles.fontButtonGradient}
                  >
                    <Text style={[
                      styles.fontButtonText,
                      selectedFont === font && styles.fontButtonTextActive
                    ]}>
                      {font}
                    </Text>
                  </LinearGradient>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <Text style={styles.toolSubTitle}>{t('videoEditor.textColor')}</Text>
            <View style={styles.colorRow}>
              {TEXT_COLORS.map((color) => (
                <TouchableOpacity
                  key={color}
                  style={[
                    styles.colorCircle,
                    { backgroundColor: color },
                    selectedTextColor === color && styles.colorCircleActive
                  ]}
                  onPress={() => setSelectedTextColor(color)}
                />
              ))}
            </View>
          </View>
        );

      case 'music':
        return (
          <View style={styles.toolPanel}>
            <Text style={styles.toolPanelTitle}>{t('videoEditor.backgroundMusic')}</Text>
            <TouchableOpacity style={styles.libraryButton}>
              <LinearGradient
                colors={['rgba(45,53,72,0.6)', 'rgba(28,35,51,0.4)']}
                style={styles.libraryButtonGradient}
              >
                <Icon name="music" size="sm" color={colors.emerald} />
                <Text style={styles.libraryButtonText}>{t('videoEditor.addFromAudioLibrary')}</Text>
                <Icon name="chevron-right" size="sm" color={colors.text.tertiary} />
              </LinearGradient>
            </TouchableOpacity>

            <View style={styles.currentTrackCard}>
              <LinearGradient
                colors={['rgba(45,53,72,0.4)', 'rgba(28,35,51,0.2)']}
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
                    <Text style={styles.trackName}>Summer Vibes</Text>
                    <Text style={styles.trackArtist}>by AudioLibrary</Text>
                  </View>
                  <TouchableOpacity style={styles.removeTrackButton}>
                    <Icon name="x" size="xs" color={colors.error} />
                  </TouchableOpacity>
                </View>
              </LinearGradient>
            </View>
          </View>
        );

      case 'volume':
        return (
          <View style={styles.toolPanel}>
            <Text style={styles.toolPanelTitle}>{t('videoEditor.audioLevels')}</Text>

            <View style={styles.volumeRow}>
              <View style={styles.volumeIconContainer}>
                <Icon name="volume-2" size="sm" color={colors.text.secondary} />
              </View>
              <View style={styles.volumeLabelContainer}>
                <Text style={styles.volumeLabel}>{t('videoEditor.originalAudio')}</Text>
                <Text style={styles.volumeValue}>{originalVolume}%</Text>
              </View>
            </View>
            <View style={styles.sliderTrack}>
              <View style={[styles.sliderFill, { width: `${originalVolume}%` }]} />
              <View style={styles.sliderThumb} />
            </View>

            <View style={[styles.volumeRow, styles.volumeRowSecond]}>
              <View style={styles.volumeIconContainer}>
                <Icon name="music" size="sm" color={colors.text.secondary} />
              </View>
              <View style={styles.volumeLabelContainer}>
                <Text style={styles.volumeLabel}>{t('videoEditor.backgroundMusic')}</Text>
                <Text style={styles.volumeValue}>{musicVolume}%</Text>
              </View>
            </View>
            <View style={styles.sliderTrack}>
              <View style={[styles.sliderFill, { width: `${musicVolume}%` }]} />
              <View style={styles.sliderThumb} />
            </View>
          </View>
        );

      default:
        return null;
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <GlassHeader title={t('videoEditor.editVideo')} showBackButton />

      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl tintColor={colors.emerald} refreshing={refreshing} onRefresh={onRefresh} />}
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
                  {formatTime(currentTime)} / {formatTime(totalDuration)}
                </Text>
              </LinearGradient>
            </View>

            {/* Playback Speed Badge */}
            <TouchableOpacity style={styles.speedBadge} onPress={cyclePlaybackSpeed}>
              <LinearGradient
                colors={['rgba(45,53,72,0.8)', 'rgba(28,35,51,0.6)']}
                style={styles.speedBadgeGradient}
              >
                <Text style={styles.speedBadgeText}>{playbackSpeed}x</Text>
              </LinearGradient>
            </TouchableOpacity>

            {/* Play/Pause Button */}
            <TouchableOpacity
              style={styles.playButton}
              onPress={() => setIsPlaying(!isPlaying)}
            >
              <LinearGradient
                colors={['rgba(10,123,79,0.9)', 'rgba(6,107,66,0.95)']}
                style={styles.playButtonGradient}
              >
                <Icon name={isPlaying ? 'pause' : 'play'} size="xl" color="#FFF" />
              </LinearGradient>
            </TouchableOpacity>

            {/* Video Placeholder Icon */}
            <View style={styles.videoPlaceholder}>
              <Icon name="video" size="xl" color={colors.text.tertiary} />
            </View>
          </LinearGradient>
        </View>

        {/* Timeline Section */}
        <Animated.View entering={FadeInUp.delay(100).duration(400)}>
          <View style={styles.timelineContainer}>
            <LinearGradient
              colors={['rgba(45,53,72,0.4)', 'rgba(28,35,51,0.2)']}
              style={styles.timelineGradient}
            >
              {/* Time Labels */}
              <View style={styles.timeLabels}>
                <Text style={styles.timeLabelStart}>00:00</Text>
                <Text style={styles.timeLabelEnd}>00:45</Text>
              </View>

              {/* Waveform Strip */}
              <View style={styles.waveformContainer}>
                <View style={styles.waveform}>
                  {Array.from({ length: 40 }).map((_, i) => (
                    <View
                      key={i}
                      style={[
                        styles.waveformBar,
                        { height: Math.random() * 30 + 10 }
                      ]}
                    />
                  ))}
                </View>

                {/* Trim Handles */}
                <View style={[styles.trimHandle, styles.trimHandleLeft]}>
                  <LinearGradient
                    colors={['rgba(10,123,79,0.8)', 'rgba(10,123,79,0.6)']}
                    style={styles.trimHandleGradient}
                  >
                    <Icon name="scissors" size="xs" color="#FFF" />
                  </LinearGradient>
                </View>
                <View style={[styles.trimHandle, styles.trimHandleRight]}>
                  <LinearGradient
                    colors={['rgba(10,123,79,0.8)', 'rgba(10,123,79,0.6)']}
                    style={styles.trimHandleGradient}
                  >
                    <Icon name="scissors" size="xs" color="#FFF" />
                  </LinearGradient>
                </View>

                {/* Playhead */}
                <View style={[styles.playhead, { left: `${(currentTime / totalDuration) * 100}%` }]}>
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
            {([
              { id: 'trim', icon: 'scissors' as IconName, label: t('videoEditor.trim') },
              { id: 'speed', icon: 'fast-forward' as IconName, label: t('videoEditor.speed') },
              { id: 'filters', icon: 'sliders' as IconName, label: t('videoEditor.filters') },
              { id: 'text', icon: 'type' as IconName, label: t('videoEditor.text') },
              { id: 'music', icon: 'music' as IconName, label: t('videoEditor.music') },
              { id: 'volume', icon: 'volume-2' as IconName, label: t('videoEditor.volume') },
            ].map((tool) => (
              <TouchableOpacity
                key={tool.id}
                style={styles.toolTab}
                onPress={() => setSelectedTool(tool.id as ToolTab)}
              >
                <LinearGradient
                  colors={selectedTool === tool.id
                    ? ['rgba(10,123,79,0.5)', 'rgba(10,123,79,0.3)']
                    : ['rgba(45,53,72,0.4)', 'rgba(28,35,51,0.2)']
                  }
                  style={styles.toolTabGradient}
                >
                  <Icon
                    name={tool.icon}
                    size="sm"
                    color={selectedTool === tool.id ? colors.emerald : colors.text.secondary}
                  />
                  <Text style={[
                    styles.toolTabText,
                    selectedTool === tool.id && styles.toolTabTextActive
                  ]}>
                    {tool.label}
                  </Text>
                </LinearGradient>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </Animated.View>

        {/* Tool Panel */}
        <Animated.View entering={FadeInUp.delay(200).duration(400)}>
          <View style={styles.toolPanelContainer}>
            <LinearGradient
              colors={['rgba(45,53,72,0.4)', 'rgba(28,35,51,0.2)']}
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
              {(['720p', '1080p', '4K'] as QualityOption[]).map((quality) => (
                <TouchableOpacity
                  key={quality}
                  style={styles.qualityButton}
                  onPress={() => setSelectedQuality(quality)}
                >
                  <LinearGradient
                    colors={selectedQuality === quality
                      ? ['rgba(10,123,79,0.4)', 'rgba(10,123,79,0.2)']
                      : ['rgba(45,53,72,0.4)', 'rgba(28,35,51,0.2)']
                    }
                    style={styles.qualityButtonGradient}
                  >
                    <Text style={[
                      styles.qualityButtonText,
                      selectedQuality === quality && styles.qualityButtonTextActive
                    ]}>
                      {quality}
                    </Text>
                  </LinearGradient>
                </TouchableOpacity>
              ))}
            </View>
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
          <TouchableOpacity style={styles.cancelButton} onPress={() => router.back()}>
            <Text style={styles.cancelButtonText}>{t('common.cancel')}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.exportButton} onPress={handleExport} disabled={isExporting}>
            <LinearGradient
              colors={['rgba(10,123,79,0.9)', 'rgba(6,107,66,0.95)']}
              style={styles.exportButtonGradient}
            >
              {isExporting ? (
                <Skeleton.Circle size={20} />
              ) : (
                <>
                  <Icon name="check" size="sm" color="#FFF" />
                  <Text style={styles.exportButtonText}>{t('videoEditor.export')}</Text>
                </>
              )}
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
    height: screenHeight * 0.42,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
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
  speedBadge: {
    position: 'absolute',
    top: spacing.md,
    left: spacing.md,
    borderRadius: radius.full,
    overflow: 'hidden',
  },
  speedBadgeGradient: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  speedBadgeText: {
    fontSize: fontSize.xs,
    color: colors.text.primary,
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
  },
  timelineContainer: {
    marginHorizontal: spacing.base,
    marginTop: spacing.md,
  },
  timelineGradient: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    padding: spacing.base,
  },
  timeLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  timeLabelStart: {
    fontSize: fontSize.xs,
    color: colors.text.tertiary,
    fontFamily: fonts.mono,
  },
  timeLabelEnd: {
    fontSize: fontSize.xs,
    color: colors.text.tertiary,
    fontFamily: fonts.mono,
  },
  waveformContainer: {
    height: 60,
    backgroundColor: colors.dark.surface,
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
    width: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  trimHandleLeft: {
    left: 10,
  },
  trimHandleRight: {
    right: 10,
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
    color: colors.text.tertiary,
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
    color: colors.text.secondary,
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
    borderColor: 'rgba(255,255,255,0.06)',
    padding: spacing.base,
  },
  toolPanel: {
    gap: spacing.md,
  },
  toolPanelTitle: {
    fontSize: fontSize.md,
    fontWeight: '600',
    color: colors.text.primary,
  },
  toolSubTitle: {
    fontSize: fontSize.sm,
    color: colors.text.secondary,
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
    color: colors.text.tertiary,
    marginBottom: spacing.xs,
  },
  timeInput: {
    backgroundColor: colors.dark.surface,
    borderRadius: radius.md,
    padding: spacing.sm,
    fontSize: fontSize.base,
    color: colors.text.primary,
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
    color: colors.text.primary,
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
    color: colors.text.secondary,
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
    color: colors.text.secondary,
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
    color: colors.text.primary,
  },
  fontScroll: {
    marginTop: spacing.sm,
  },
  fontButton: {
    marginRight: spacing.sm,
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  fontButtonGradient: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  fontButtonText: {
    fontSize: fontSize.sm,
    color: colors.text.secondary,
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
    color: colors.text.primary,
    flex: 1,
    marginLeft: spacing.sm,
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
    color: colors.text.primary,
    fontWeight: '500',
  },
  trackArtist: {
    fontSize: fontSize.xs,
    color: colors.text.tertiary,
  },
  removeTrackButton: {
    width: 32,
    height: 32,
    borderRadius: radius.full,
    backgroundColor: 'rgba(248,81,73,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
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
    backgroundColor: colors.dark.surface,
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
    color: colors.text.secondary,
  },
  volumeValue: {
    fontSize: fontSize.sm,
    color: colors.emerald,
    fontFamily: fonts.mono,
  },
  sliderTrack: {
    height: 6,
    backgroundColor: colors.dark.surface,
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
    color: colors.text.secondary,
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
    color: colors.text.secondary,
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
  },
  cancelButton: {
    paddingHorizontal: spacing.lg,
  },
  cancelButtonText: {
    fontSize: fontSize.base,
    color: colors.text.secondary,
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
