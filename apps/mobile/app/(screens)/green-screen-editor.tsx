// Note: Background segmentation requires expo-gl or react-native-vision-camera with frame processors — not yet installed
import { useState, useCallback, useRef, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Dimensions } from 'react-native';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Audio } from 'expo-av';
import { Icon } from '@/components/ui/Icon';
import { GlassHeader } from '@/components/ui/GlassHeader';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { colors, spacing, radius, fontSize, fonts } from '@/theme';
import { useTranslation } from '@/hooks/useTranslation';
import { useThemeColors } from '@/hooks/useThemeColors';
import { ScreenErrorBoundary } from '@/components/ui/ScreenErrorBoundary';
import { BrandedRefreshControl } from '@/components/ui/BrandedRefreshControl';
import { useContextualHaptic } from '@/hooks/useContextualHaptic';
import { showToast } from '@/components/ui/Toast';
import { navigate } from '@/utils/navigation';

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

function SimpleSlider({ value, onValueChange, fillColor = colors.emerald, trackColor = 'rgba(255,255,255,0.2)' }: { value: number; onValueChange: (v: number) => void; fillColor?: string; trackColor?: string }) {
  const trackWidth = useRef(0);
  return (
    <Pressable
      accessibilityRole="adjustable"
      onLayout={(e) => { trackWidth.current = e.nativeEvent.layout.width; }}
      onPress={(e) => {
        if (trackWidth.current <= 0) return;
        const ratio = e.nativeEvent.locationX / trackWidth.current;
        onValueChange(Math.max(0, Math.min(1, ratio)));
      }}
      style={sliderHitStyles.hitArea}
    >
      <View style={[sliderHitStyles.track, { backgroundColor: trackColor }]}>
        <View style={[sliderHitStyles.fill, { width: `${value * 100}%`, backgroundColor: fillColor }]} />
      </View>
    </Pressable>
  );
}

const sliderHitStyles = StyleSheet.create({
  hitArea: { height: 44, justifyContent: 'center' },
  track: { height: 8, borderRadius: radius.full, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: radius.full },
});

type CategoryType = 'solid' | 'gradients' | 'images' | 'videos' | 'custom';

const SOLID_COLORS = [
  { name: 'black', color: '#0D1117' },
  { name: 'white', color: '#FFFFFF' },
  { name: 'emerald', color: '#0A7B4F' },
  { name: 'gold', color: '#C8963E' },
  { name: 'blue', color: colors.extended.blue },
  { name: 'red', color: '#F85149' },
  { name: 'purple', color: colors.extended.purple },
  { name: 'pink', color: '#F778BA' },
  { name: 'orange', color: '#F0883E' },
  { name: 'yellow', color: '#D4A94F' },
  { name: 'cyan', color: '#39D0D8' },
  { name: 'gray', color: '#6E7781' },
];

const GRADIENT_BACKGROUNDS = [
  { name: 'sunset', colors: ['#F0883E', '#F85149'] as [string, string] },
  { name: 'ocean', colors: [colors.extended.blue, colors.emerald] as [string, string] },
  { name: 'forest', colors: ['#0A7B4F', '#066B42'] as [string, string] },
  { name: 'midnight', colors: ['#0D1117', '#21283B'] as [string, string] },
  { name: 'rose', colors: ['#F778BA', '#F85149'] as [string, string] },
  { name: 'arctic', colors: ['#39D0D8', '#FFFFFF'] as [string, string] },
  { name: 'desert', colors: ['#C8963E', '#F0883E'] as [string, string] },
  { name: 'aurora', colors: [colors.emerald, colors.extended.purple] as [string, string] },
];

const IMAGE_BACKGROUNDS = [
  { name: 'beach' },
  { name: 'mountains' },
  { name: 'city' },
  { name: 'studio' },
  { name: 'space' },
  { name: 'library' },
  { name: 'cafe' },
  { name: 'garden' },
];

const VIDEO_BACKGROUNDS = [
  { name: 'particles' },
  { name: 'rain' },
  { name: 'fire' },
  { name: 'bokeh' },
  { name: 'clouds' },
  { name: 'matrix' },
];

export default function GreenScreenEditorScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const [refreshing, setRefreshing] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<CategoryType>('solid');
  const [selectedBackground, setSelectedBackground] = useState<string>('emerald');
  const [selectedGradient, setSelectedGradient] = useState<string>('forest');
  const [blurIntensity, setBlurIntensity] = useState(30);
  const [edgeSmoothing, setEdgeSmoothing] = useState(50);
  const [isRecording, setIsRecording] = useState(false);
  const [facing, setFacing] = useState<'front' | 'back'>('front');
  const [permission, requestPermission] = useCameraPermissions();
  const [audioPermission, setAudioPermission] = useState(false);
  const cameraRef = useRef<CameraView>(null);
  const [recordedUri, setRecordedUri] = useState<string | null>(null);
  const tc = useThemeColors();
  const haptic = useContextualHaptic();

  useEffect(() => {
    (async () => {
      const { granted } = await Audio.requestPermissionsAsync();
      setAudioPermission(granted);
    })();
  }, []);

  const handleRecord = async () => {
    if (!cameraRef.current) return;

    if (isRecording) {
      cameraRef.current.stopRecording();
      setIsRecording(false);
      haptic.tick();
    } else {
      // Honest: background segmentation is not available — camera just records normally
      showToast({ message: t('screens.greenScreen.noSegmentation'), variant: 'info' });
      setIsRecording(true);
      haptic.navigate();
      try {
        const video = await cameraRef.current.recordAsync({ maxDuration: 60 });
        if (video?.uri) {
          setRecordedUri(video.uri);
          haptic.success();
        }
      } catch (_err: unknown) {
        // Recording was cancelled or failed
      } finally {
        setIsRecording(false);
      }
    }
  };

  // No data to refresh on this screen — refresh is a no-op
  const onRefresh = useCallback(() => {
    setRefreshing(true);
    setRefreshing(false);
  }, []);

  const categories: { id: CategoryType; label: string }[] = [
    { id: 'solid', label: t('screens.greenScreen.solidColors') },
    { id: 'gradients', label: t('screens.greenScreen.gradients') },
    { id: 'images', label: t('screens.greenScreen.images') },
    { id: 'videos', label: t('screens.greenScreen.videos') },
    { id: 'custom', label: t('screens.greenScreen.custom') },
  ];

  const handlePickImage = useCallback(async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) {
      setSelectedBackground(result.assets[0].uri);
      setSelectedCategory('custom');
    }
  }, []);

  const handlePickVideo = useCallback(async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Videos,
      allowsEditing: true,
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) {
      setSelectedBackground(result.assets[0].uri);
      setSelectedCategory('custom');
    }
  }, []);

  const getBackgroundStyle = () => {
    switch (selectedCategory) {
      case 'solid':
        const solidColor = SOLID_COLORS.find(c => c.name === selectedBackground)?.color;
        return { backgroundColor: solidColor || colors.emerald };
      case 'gradients':
        return null; // Rendered with LinearGradient
      default:
        return { backgroundColor: tc.surface };
    }
  };

  const renderBackgroundGrid = () => {
    switch (selectedCategory) {
      case 'solid':
        return (
          <View style={styles.colorGrid}>
            {SOLID_COLORS.map((color, index) => (
              <Animated.View
                key={color.name}
                entering={FadeInUp.delay(index * 30).duration(300)}
                style={styles.colorGridItem}
              >
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t(`screens.greenScreen.color.${color.name}`)}
                  style={[
                    styles.colorCircle,
                    { backgroundColor: color.color },
                    selectedBackground === color.name && styles.colorCircleActive
                  ]}
                  onPress={() => setSelectedBackground(color.name)}
                >
                  {selectedBackground === color.name && (
                    <Icon name="check" size="xs" color="#FFF" />
                  )}
                </Pressable>
                <Text style={styles.colorName}>{t(`screens.greenScreen.color.${color.name}`)}</Text>
              </Animated.View>
            ))}
          </View>
        );

      case 'gradients':
        return (
          <View style={styles.gradientGrid}>
            {GRADIENT_BACKGROUNDS.map((gradient, index) => (
              <Animated.View
                key={gradient.name}
                entering={FadeInUp.delay(index * 30).duration(300)}
                style={styles.gradientGridItem}
              >
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t(`screens.greenScreen.gradient.${gradient.name}`)}
                  style={[
                    styles.gradientPreview,
                    selectedGradient === gradient.name && styles.gradientPreviewActive
                  ]}
                  onPress={() => setSelectedGradient(gradient.name)}
                >
                  <LinearGradient
                    colors={gradient.colors}
                    style={styles.gradientPreviewInner}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                  >
                    {selectedGradient === gradient.name && (
                      <View style={styles.checkOverlay}>
                        <Icon name="check" size="sm" color="#FFF" />
                      </View>
                    )}
                  </LinearGradient>
                </Pressable>
                <Text style={styles.gradientName}>{t(`screens.greenScreen.gradient.${gradient.name}`)}</Text>
              </Animated.View>
            ))}
          </View>
        );

      case 'images':
        return (
          <View style={styles.imageGrid}>
            {IMAGE_BACKGROUNDS.map((image, index) => (
              <Animated.View
                key={image.name}
                entering={FadeInUp.delay(index * 30).duration(300)}
                style={styles.imageGridItem}
              >
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t(`screens.greenScreen.bg.${image.name}`)}
                  style={styles.imageCard}
                  onPress={() => setSelectedBackground(image.name)}
                >
                  <LinearGradient
                    colors={['rgba(45,53,72,0.6)', 'rgba(28,35,51,0.4)']}
                    style={styles.imageCardGradient}
                  >
                    <Icon name="image" size="md" color={tc.text.tertiary} />
                  </LinearGradient>
                  <Text style={styles.imageName}>{t(`screens.greenScreen.bg.${image.name}`)}</Text>
                </Pressable>
              </Animated.View>
            ))}
          </View>
        );

      case 'videos':
        return (
          <View style={styles.videoGrid}>
            {VIDEO_BACKGROUNDS.map((video, index) => (
              <Animated.View
                key={video.name}
                entering={FadeInUp.delay(index * 30).duration(300)}
                style={styles.videoGridItem}
              >
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t(`screens.greenScreen.bg.${video.name}`)}
                  style={styles.videoCard}
                  onPress={() => setSelectedBackground(video.name)}
                >
                  <LinearGradient
                    colors={['rgba(45,53,72,0.6)', 'rgba(28,35,51,0.4)']}
                    style={styles.videoCardGradient}
                  >
                    <View style={styles.playOverlay}>
                      <Icon name="play" size="sm" color="#FFF" />
                    </View>
                  </LinearGradient>
                  <Text style={styles.videoName}>{t(`screens.greenScreen.bg.${video.name}`)}</Text>
                </Pressable>
              </Animated.View>
            ))}
          </View>
        );

      case 'custom':
        return (
          <View style={styles.customContainer}>
            <Pressable style={styles.uploadButton} onPress={handlePickImage} accessibilityRole="button" accessibilityLabel={t('screens.greenScreen.uploadImage')}>
              <LinearGradient
                colors={colors.gradient.cardDark}
                style={[styles.uploadButtonGradient, styles.uploadButtonDashed]}
              >
                <View style={styles.uploadIconContainer}>
                  <Icon name="image" size="md" color={colors.emerald} />
                  <View style={styles.plusBadge}>
                    <Icon name="plus" size="xs" color="#FFF" />
                  </View>
                </View>
                <Text style={styles.uploadButtonText}>{t('screens.greenScreen.uploadImage')}</Text>
                <Text style={styles.uploadButtonSubtext}>{t('screens.greenScreen.imageFormats')}</Text>
              </LinearGradient>
            </Pressable>

            <Pressable style={styles.uploadButton} onPress={handlePickVideo} accessibilityRole="button" accessibilityLabel={t('screens.greenScreen.uploadVideo')}>
              <LinearGradient
                colors={colors.gradient.cardDark}
                style={[styles.uploadButtonGradient, styles.uploadButtonDashed]}
              >
                <View style={styles.uploadIconContainer}>
                  <Icon name="video" size="md" color={colors.emerald} />
                  <View style={styles.plusBadge}>
                    <Icon name="plus" size="xs" color="#FFF" />
                  </View>
                </View>
                <Text style={styles.uploadButtonText}>{t('screens.greenScreen.uploadVideo')}</Text>
                <Text style={styles.uploadButtonSubtext}>{t('screens.greenScreen.videoFormats')}</Text>
              </LinearGradient>
            </Pressable>

            <View style={styles.recentSection}>
              <Text style={styles.recentTitle}>{t('screens.greenScreen.recentUploads')}</Text>
              <EmptyState
                icon="image"
                title={t('screens.greenScreen.noUploadsYet')}
                subtitle={t('screens.greenScreen.recentUploadsHint')}
              />
            </View>
          </View>
        );

      default:
        return null;
    }
  };

  const getSelectedGradientColors = () => {
    const grad = GRADIENT_BACKGROUNDS.find(g => g.name === selectedGradient);
    return grad?.colors || ['#0A7B4F', '#066B42'];
  };

  if (!permission?.granted) {
    return (
      <ScreenErrorBoundary>
        <SafeAreaView style={[styles.container, { backgroundColor: tc.bg }]}>
          <GlassHeader title={t('screens.greenScreen.title')} onBack={() => router.back()} />
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
            <EmptyState
              icon="camera"
              title={t('camera.permissionRequired')}
              subtitle={t('camera.permissionMessage')}
              actionLabel={t('camera.grantPermission')}
              onAction={requestPermission}
            />
          </View>
        </SafeAreaView>
      </ScreenErrorBoundary>
    );
  }

  return (
    <ScreenErrorBoundary>
      <SafeAreaView style={[styles.container, { backgroundColor: tc.bg }]} edges={['top']}>
        <GlassHeader title={t('screens.greenScreen.title')} showBackButton />

        <ScrollView
          showsVerticalScrollIndicator={false}
          refreshControl={<BrandedRefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        >
          {/* Camera Preview */}
          <Animated.View entering={FadeInUp.delay(50).duration(400)}>
            <View style={styles.previewContainer}>
              {selectedCategory === 'gradients' ? (
                <LinearGradient
                  colors={getSelectedGradientColors()}
                  style={styles.previewGradient}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                >
                  {/* Camera overlay on background */}
                  <CameraView
                    ref={cameraRef}
                    style={styles.cameraOverlay}
                    facing={facing}
                    mode="video"
                  />

                  {/* Record Button Overlay */}
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={isRecording ? t('common.stop') : t('screens.greenScreen.record')}
                    style={styles.recordOverlayButton}
                    onPress={handleRecord}
                  >
                    <LinearGradient
                      colors={isRecording
                        ? ['rgba(248,81,73,0.9)', 'rgba(220,60,50,0.95)']
                        : ['rgba(10,123,79,0.9)', 'rgba(6,107,66,0.95)']
                      }
                      style={styles.recordOverlayGradient}
                    >
                      <Icon name="video" size="md" color="#FFF" />
                    </LinearGradient>
                  </Pressable>
                </LinearGradient>
              ) : (
                <LinearGradient
                  colors={['rgba(28,35,51,0.8)', 'rgba(13,17,23,0.9)']}
                  style={[styles.previewGradient, getBackgroundStyle()]}
                >
                  {/* Camera overlay on background */}
                  <CameraView
                    ref={cameraRef}
                    style={styles.cameraOverlay}
                    facing={facing}
                    mode="video"
                  />

                  {/* Record Button Overlay */}
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={isRecording ? t('common.stop') : t('screens.greenScreen.record')}
                    style={styles.recordOverlayButton}
                    onPress={handleRecord}
                  >
                    <LinearGradient
                      colors={isRecording
                        ? ['rgba(248,81,73,0.9)', 'rgba(220,60,50,0.95)']
                        : ['rgba(10,123,79,0.9)', 'rgba(6,107,66,0.95)']
                      }
                      style={styles.recordOverlayGradient}
                    >
                      <Icon name="video" size="md" color="#FFF" />
                    </LinearGradient>
                  </Pressable>
                </LinearGradient>
              )}
            </View>
          </Animated.View>

          {/* Category Tabs */}
          <Animated.View entering={FadeInUp.delay(100).duration(400)}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.categoryScroll}
              contentContainerStyle={styles.categoryContent}
            >
              {categories.map((category) => (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={category.label}
                  key={category.id}
                  style={styles.categoryButton}
                  onPress={() => { haptic.tick(); setSelectedCategory(category.id); }}
                >
                  <LinearGradient
                    colors={selectedCategory === category.id
                      ? ['rgba(10,123,79,0.5)', 'rgba(10,123,79,0.3)']
                      : colors.gradient.cardDark
                    }
                    style={styles.categoryButtonGradient}
                  >
                    <Text style={[
                      styles.categoryButtonText,
                      selectedCategory === category.id && styles.categoryButtonTextActive
                    ]}>
                      {category.label}
                    </Text>
                  </LinearGradient>
                </Pressable>
              ))}
            </ScrollView>
          </Animated.View>

          {/* Background Grid */}
          <Animated.View entering={FadeInUp.delay(150).duration(400)}>
            <View style={styles.gridContainer}>
              <LinearGradient
                colors={colors.gradient.cardDark}
                style={styles.gridGradient}
              >
                <Text style={styles.gridTitle}>
                  {categories.find(c => c.id === selectedCategory)?.label}
                </Text>
                {renderBackgroundGrid()}
              </LinearGradient>
            </View>
          </Animated.View>

          {/* Intensity Sliders */}
          <Animated.View entering={FadeInUp.delay(200).duration(400)}>
            <View style={styles.sliderCard}>
              <LinearGradient
                colors={colors.gradient.cardDark}
                style={styles.sliderGradient}
              >
                {/* Header */}
                <View style={styles.sliderHeader}>
                  <View style={styles.sliderIconContainer}>
                    <LinearGradient
                      colors={['rgba(10,123,79,0.2)', 'rgba(200,150,62,0.1)']}
                      style={styles.sliderIconGradient}
                    >
                      <Icon name="sliders" size="sm" color={colors.emerald} />
                    </LinearGradient>
                  </View>
                  <Text style={styles.sliderTitle}>{t('screens.greenScreen.adjustments')}</Text>
                </View>

                {/* Background Blur */}
                <View style={styles.sliderRow}>
                  <Text style={styles.sliderLabel}>{t('screens.greenScreen.backgroundBlur')}</Text>
                  <Text style={styles.sliderValue}>{blurIntensity}%</Text>
                </View>
                <SimpleSlider
                  value={blurIntensity / 100}
                  onValueChange={(v) => setBlurIntensity(Math.round(v * 100))}
                  fillColor={colors.emerald}
                  trackColor={tc.surface}
                />

                {/* Edge Smoothing */}
                <View style={[styles.sliderRow, styles.sliderRowSecond]}>
                  <Text style={styles.sliderLabel}>{t('screens.greenScreen.edgeSmoothing')}</Text>
                  <Text style={styles.sliderValue}>{edgeSmoothing}%</Text>
                </View>
                <SimpleSlider
                  value={edgeSmoothing / 100}
                  onValueChange={(v) => setEdgeSmoothing(Math.round(v * 100))}
                  fillColor={colors.emerald}
                  trackColor={tc.surface}
                />
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
            <Pressable style={styles.cancelButton} onPress={() => router.back()} accessibilityRole="button" accessibilityLabel={t('common.cancel')}>
              <Text style={styles.cancelButtonText}>{t('common.cancel')}</Text>
            </Pressable>
            <Pressable style={styles.applyButton} onPress={() => navigate('/(screens)/camera')} accessibilityRole="button" accessibilityLabel={t('screens.greenScreen.applyAndRecord')}>
              <LinearGradient
                colors={['rgba(10,123,79,0.9)', 'rgba(6,107,66,0.95)']}
                style={styles.applyButtonGradient}
              >
                <Text style={styles.applyButtonText}>{t('screens.greenScreen.applyAndRecord')}</Text>
              </LinearGradient>
            </Pressable>
          </LinearGradient>
        </View>
      </SafeAreaView>
  
    </ScreenErrorBoundary>
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
    height: screenHeight * 0.38,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.active.white6,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  cameraOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: radius.lg,
  },
  recordOverlayButton: {
    position: 'absolute',
    bottom: spacing.lg,
    right: spacing.lg,
    borderRadius: radius.full,
    overflow: 'hidden',
  },
  recordOverlayGradient: {
    width: 56,
    height: 56,
    borderRadius: radius.full,
    justifyContent: 'center',
    alignItems: 'center',
  },
  categoryScroll: {
    marginTop: spacing.md,
  },
  categoryContent: {
    paddingHorizontal: spacing.base,
    gap: spacing.sm,
  },
  categoryButton: {
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  categoryButtonGradient: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
  },
  categoryButtonText: {
    fontSize: fontSize.sm,
    color: colors.text.secondary,
  },
  categoryButtonTextActive: {
    color: colors.emerald,
    fontWeight: '600',
  },
  gridContainer: {
    marginHorizontal: spacing.base,
    marginTop: spacing.md,
  },
  gridGradient: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.active.white6,
    padding: spacing.base,
  },
  gridTitle: {
    fontSize: fontSize.base,
    fontWeight: '600',
    color: colors.text.primary,
    marginBottom: spacing.md,
  },
  colorGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  colorGridItem: {
    width: (screenWidth - spacing.base * 4 - spacing.md * 3) / 4,
    alignItems: 'center',
    gap: spacing.xs,
  },
  colorCircle: {
    width: 56,
    height: 56,
    borderRadius: radius.full,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.1)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
  },
  colorCircleActive: {
    borderColor: colors.emerald,
    borderWidth: 3,
  },
  colorName: {
    fontSize: fontSize.xs,
    color: colors.text.tertiary,
  },
  gradientGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  gradientGridItem: {
    width: (screenWidth - spacing.base * 4 - spacing.md * 3) / 4,
    alignItems: 'center',
    gap: spacing.xs,
  },
  gradientPreview: {
    width: 56,
    height: 56,
    borderRadius: radius.md,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  gradientPreviewActive: {
    borderColor: colors.emerald,
    borderWidth: 3,
  },
  gradientPreviewInner: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkOverlay: {
    width: 28,
    height: 28,
    borderRadius: radius.full,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  gradientName: {
    fontSize: fontSize.xs,
    color: colors.text.tertiary,
  },
  imageGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  imageGridItem: {
    width: (screenWidth - spacing.base * 4 - spacing.md * 1) / 2,
  },
  imageCard: {
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  imageCardGradient: {
    height: 80,
    borderRadius: radius.md,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.active.white6,
  },
  imageName: {
    fontSize: fontSize.sm,
    color: colors.text.secondary,
    marginTop: spacing.xs,
    textAlign: 'center',
  },
  videoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  videoGridItem: {
    width: (screenWidth - spacing.base * 4 - spacing.md * 2) / 3,
  },
  videoCard: {
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  videoCardGradient: {
    height: 70,
    borderRadius: radius.md,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.active.white6,
  },
  playOverlay: {
    width: 32,
    height: 32,
    borderRadius: radius.full,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  videoName: {
    fontSize: fontSize.xs,
    color: colors.text.secondary,
    marginTop: spacing.xs,
    textAlign: 'center',
  },
  customContainer: {
    gap: spacing.md,
  },
  uploadButton: {
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  uploadButtonGradient: {
    padding: spacing.lg,
    alignItems: 'center',
    gap: spacing.xs,
    borderRadius: radius.md,
  },
  uploadButtonDashed: {
    borderWidth: 2,
    borderColor: colors.emerald,
    borderStyle: 'dashed',
  },
  uploadIconContainer: {
    position: 'relative',
    marginBottom: spacing.xs,
  },
  plusBadge: {
    position: 'absolute',
    bottom: -4,
    right: -4,
    width: 18,
    height: 18,
    borderRadius: radius.full,
    backgroundColor: colors.emerald,
    justifyContent: 'center',
    alignItems: 'center',
  },
  uploadButtonText: {
    fontSize: fontSize.base,
    color: colors.text.primary,
    fontWeight: '500',
  },
  uploadButtonSubtext: {
    fontSize: fontSize.xs,
    color: colors.text.tertiary,
  },
  recentSection: {
    marginTop: spacing.sm,
  },
  recentTitle: {
    fontSize: fontSize.sm,
    color: colors.text.secondary,
    marginBottom: spacing.sm,
  },
  sliderCard: {
    marginHorizontal: spacing.base,
    marginTop: spacing.md,
  },
  sliderGradient: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.active.white6,
    padding: spacing.base,
  },
  sliderHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  sliderIconContainer: {
    borderRadius: radius.sm,
    overflow: 'hidden',
  },
  sliderIconGradient: {
    width: 32,
    height: 32,
    borderRadius: radius.sm,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sliderTitle: {
    fontSize: fontSize.base,
    fontWeight: '600',
    color: colors.text.primary,
  },
  sliderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sliderRowSecond: {
    marginTop: spacing.md,
  },
  sliderLabel: {
    fontSize: fontSize.sm,
    color: colors.text.secondary,
  },
  sliderValue: {
    fontSize: fontSize.sm,
    color: colors.emerald,
    fontFamily: fonts.mono,
  },
  // sliderTrack/sliderFill/sliderThumb removed — replaced by interactive SimpleSlider component
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
  applyButton: {
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  applyButtonGradient: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
  },
  applyButtonText: {
    fontSize: fontSize.base,
    color: '#FFF',
    fontWeight: '600',
  },
});
