import { useState, useCallback, useRef, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl, TouchableOpacity, Dimensions } from 'react-native';
import { useRouter } from 'expo-router';
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
import { ScreenErrorBoundary } from '@/components/ui/ScreenErrorBoundary';

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

type CategoryType = 'solid' | 'gradients' | 'images' | 'videos' | 'custom';

const SOLID_COLORS = [
  { name: 'Black', color: '#0D1117' },
  { name: 'White', color: '#FFFFFF' },
  { name: 'Emerald', color: '#0A7B4F' },
  { name: 'Gold', color: '#C8963E' },
  { name: 'Blue', color: '#58A6FF' },
  { name: 'Red', color: '#F85149' },
  { name: 'Purple', color: '#A371F7' },
  { name: 'Pink', color: '#F778BA' },
  { name: 'Orange', color: '#F0883E' },
  { name: 'Yellow', color: '#D4A94F' },
  { name: 'Cyan', color: '#39D0D8' },
  { name: 'Gray', color: '#6E7781' },
];

const GRADIENT_BACKGROUNDS = [
  { name: 'Sunset', colors: ['#F0883E', '#F85149'] as [string, string] },
  { name: 'Ocean', colors: ['#58A6FF', '#0A7B4F'] as [string, string] },
  { name: 'Forest', colors: ['#0A7B4F', '#066B42'] as [string, string] },
  { name: 'Midnight', colors: ['#0D1117', '#21283B'] as [string, string] },
  { name: 'Rose', colors: ['#F778BA', '#F85149'] as [string, string] },
  { name: 'Arctic', colors: ['#39D0D8', '#FFFFFF'] as [string, string] },
  { name: 'Desert', colors: ['#C8963E', '#F0883E'] as [string, string] },
  { name: 'Aurora', colors: ['#0A7B4F', '#A371F7'] as [string, string] },
];

const IMAGE_BACKGROUNDS = [
  { name: 'Beach' },
  { name: 'Mountains' },
  { name: 'City' },
  { name: 'Studio' },
  { name: 'Space' },
  { name: 'Library' },
  { name: 'Cafe' },
  { name: 'Garden' },
];

const VIDEO_BACKGROUNDS = [
  { name: 'Particles' },
  { name: 'Rain' },
  { name: 'Fire' },
  { name: 'Bokeh' },
  { name: 'Clouds' },
  { name: 'Matrix' },
];

export default function GreenScreenEditorScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const [refreshing, setRefreshing] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<CategoryType>('solid');
  const [selectedBackground, setSelectedBackground] = useState<string>('Emerald');
  const [selectedGradient, setSelectedGradient] = useState<string>('Forest');
  const [blurIntensity, setBlurIntensity] = useState(30);
  const [edgeSmoothing, setEdgeSmoothing] = useState(50);
  const [isRecording, setIsRecording] = useState(false);
  const [facing, setFacing] = useState<'front' | 'back'>('front');
  const [permission, requestPermission] = useCameraPermissions();
  const [audioPermission, setAudioPermission] = useState(false);
  const cameraRef = useRef<CameraView>(null);
  const [recordedUri, setRecordedUri] = useState<string | null>(null);

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
    } else {
      setIsRecording(true);
      try {
        const video = await cameraRef.current.recordAsync({ maxDuration: 60 });
        if (video?.uri) {
          setRecordedUri(video.uri);
        }
      } catch (_err: unknown) {
        // Recording was cancelled or failed
      } finally {
        setIsRecording(false);
      }
    }
  };

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 1000);
  }, []);

  const categories: { id: CategoryType; label: string }[] = [
    { id: 'solid', label: t('screens.greenScreen.solidColors') },
    { id: 'gradients', label: t('screens.greenScreen.gradients') },
    { id: 'images', label: t('screens.greenScreen.images') },
    { id: 'videos', label: t('screens.greenScreen.videos') },
    { id: 'custom', label: t('screens.greenScreen.custom') },
  ];

  const getBackgroundStyle = () => {
    switch (selectedCategory) {
      case 'solid':
        const solidColor = SOLID_COLORS.find(c => c.name === selectedBackground)?.color;
        return { backgroundColor: solidColor || colors.emerald };
      case 'gradients':
        return null; // Rendered with LinearGradient
      default:
        return { backgroundColor: colors.dark.surface };
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
                <TouchableOpacity
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
                </TouchableOpacity>
                <Text style={styles.colorName}>{color.name}</Text>
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
                <TouchableOpacity
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
                </TouchableOpacity>
                <Text style={styles.gradientName}>{gradient.name}</Text>
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
                <TouchableOpacity
                  style={styles.imageCard}
                  onPress={() => setSelectedBackground(image.name)}
                >
                  <LinearGradient
                    colors={['rgba(45,53,72,0.6)', 'rgba(28,35,51,0.4)']}
                    style={styles.imageCardGradient}
                  >
                    <Icon name="image" size="md" color={colors.text.tertiary} />
                  </LinearGradient>
                  <Text style={styles.imageName}>{image.name}</Text>
                </TouchableOpacity>
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
                <TouchableOpacity
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
                  <Text style={styles.videoName}>{video.name}</Text>
                </TouchableOpacity>
              </Animated.View>
            ))}
          </View>
        );

      case 'custom':
        return (
          <View style={styles.customContainer}>
            <TouchableOpacity style={styles.uploadButton}>
              <LinearGradient
                colors={['rgba(45,53,72,0.4)', 'rgba(28,35,51,0.2)']}
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
            </TouchableOpacity>

            <TouchableOpacity style={styles.uploadButton}>
              <LinearGradient
                colors={['rgba(45,53,72,0.4)', 'rgba(28,35,51,0.2)']}
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
            </TouchableOpacity>

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
        <SafeAreaView style={styles.container}>
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
      <SafeAreaView style={styles.container} edges={['top']}>
        <GlassHeader title={t('screens.greenScreen.title')} showBackButton />

        <ScrollView
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl tintColor={colors.emerald} refreshing={refreshing} onRefresh={onRefresh} />}
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
                  <TouchableOpacity
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
                  </TouchableOpacity>
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
                  <TouchableOpacity
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
                  </TouchableOpacity>
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
                <TouchableOpacity
                  key={category.id}
                  style={styles.categoryButton}
                  onPress={() => setSelectedCategory(category.id)}
                >
                  <LinearGradient
                    colors={selectedCategory === category.id
                      ? ['rgba(10,123,79,0.5)', 'rgba(10,123,79,0.3)']
                      : ['rgba(45,53,72,0.4)', 'rgba(28,35,51,0.2)']
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
                </TouchableOpacity>
              ))}
            </ScrollView>
          </Animated.View>

          {/* Background Grid */}
          <Animated.View entering={FadeInUp.delay(150).duration(400)}>
            <View style={styles.gridContainer}>
              <LinearGradient
                colors={['rgba(45,53,72,0.4)', 'rgba(28,35,51,0.2)']}
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
                colors={['rgba(45,53,72,0.4)', 'rgba(28,35,51,0.2)']}
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
                <View style={styles.sliderTrack}>
                  <LinearGradient
                    colors={[colors.emerald, 'rgba(10,123,79,0.3)']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={[styles.sliderFill, { width: `${blurIntensity}%` }]}
                  />
                  <View style={[styles.sliderThumb, { left: `${blurIntensity}%` }]} />
                </View>

                {/* Edge Smoothing */}
                <View style={[styles.sliderRow, styles.sliderRowSecond]}>
                  <Text style={styles.sliderLabel}>{t('screens.greenScreen.edgeSmoothing')}</Text>
                  <Text style={styles.sliderValue}>{edgeSmoothing}%</Text>
                </View>
                <View style={styles.sliderTrack}>
                  <LinearGradient
                    colors={[colors.emerald, 'rgba(10,123,79,0.3)']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={[styles.sliderFill, { width: `${edgeSmoothing}%` }]}
                  />
                  <View style={[styles.sliderThumb, { left: `${edgeSmoothing}%` }]} />
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
            <TouchableOpacity style={styles.cancelButton} onPress={() => router.back()}>
              <Text style={styles.cancelButtonText}>{t('common.cancel')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.applyButton} onPress={() => router.push('/camera')}>
              <LinearGradient
                colors={['rgba(10,123,79,0.9)', 'rgba(6,107,66,0.95)']}
                style={styles.applyButtonGradient}
              >
                <Text style={styles.applyButtonText}>{t('screens.greenScreen.applyAndRecord')}</Text>
              </LinearGradient>
            </TouchableOpacity>
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
    borderColor: 'rgba(255,255,255,0.06)',
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
    borderColor: 'rgba(255,255,255,0.06)',
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
    borderColor: 'rgba(255,255,255,0.06)',
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
    borderColor: 'rgba(255,255,255,0.06)',
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
    borderColor: 'rgba(255,255,255,0.06)',
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
  sliderTrack: {
    height: 8,
    backgroundColor: colors.dark.surface,
    borderRadius: radius.full,
    marginTop: spacing.xs,
    position: 'relative',
  },
  sliderFill: {
    height: '100%',
    borderRadius: radius.full,
  },
  sliderThumb: {
    position: 'absolute',
    width: 20,
    height: 20,
    borderRadius: radius.full,
    backgroundColor: colors.gold,
    top: -6,
    marginLeft: -10,
    borderWidth: 2,
    borderColor: colors.dark.bg,
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
