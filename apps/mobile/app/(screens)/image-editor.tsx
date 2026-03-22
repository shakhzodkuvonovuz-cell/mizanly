import { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, Pressable, ScrollView, Dimensions,
  Image as RNImage, StatusBar,
} from 'react-native';
import { useRouter } from 'expo-router';
import Animated, {
  useSharedValue, useAnimatedStyle, withSpring,
  withTiming, interpolate,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { Icon, type IconName } from '@/components/ui/Icon';
import { GlassHeader } from '@/components/ui/GlassHeader';
import { GradientButton } from '@/components/ui/GradientButton';
import { colors, spacing, radius, fontSize } from '@/theme';
import { useTranslation } from '@/hooks/useTranslation';
import { useThemeColors } from '@/hooks/useThemeColors';
import { ScreenErrorBoundary } from '@/components/ui/ScreenErrorBoundary';

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

type AspectRatio = 'free' | '1:1' | '4:5' | '16:9';
type FilterType = 'normal' | 'warm' | 'cool' | 'vivid' | 'noir' | 'emerald' | 'gold' | 'fade' | 'sharp' | 'dreamy';
type EditTab = 'crop' | 'filter' | 'adjust';

const FILTERS: { id: FilterType; name: string; color: string }[] = [
  { id: 'normal', name: 'Normal', color: 'transparent' },
  { id: 'warm', name: 'Warm', color: 'rgba(255,160,60,0.2)' },
  { id: 'cool', name: 'Cool', color: 'rgba(60,120,255,0.2)' },
  { id: 'vivid', name: 'Vivid', color: 'rgba(255,60,120,0.15)' },
  { id: 'noir', name: 'Noir', color: 'rgba(0,0,0,0.4)' },
  { id: 'emerald', name: 'Emerald', color: 'rgba(10,123,79,0.2)' },
  { id: 'gold', name: 'Gold', color: 'rgba(200,150,62,0.25)' },
  { id: 'fade', name: 'Fade', color: 'rgba(200,180,160,0.3)' },
  { id: 'sharp', name: 'Sharp', color: 'rgba(255,255,255,0.1)' },
  { id: 'dreamy', name: 'Dreamy', color: 'rgba(180,140,200,0.2)' },
];

const ASPECT_RATIOS: { value: AspectRatio; label: string; ratio: number }[] = [
  { value: 'free', label: 'Free', ratio: 0 },
  { value: '1:1', label: '1:1', ratio: 1 },
  { value: '4:5', label: '4:5', ratio: 4/5 },
  { value: '16:9', label: '16:9', ratio: 16/9 },
];

export default function ImageEditorScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<EditTab>('filter');
  const [selectedFilter, setSelectedFilter] = useState<FilterType>('normal');
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>('free');
  const [brightness, setBrightness] = useState(50);
  const [contrast, setContrast] = useState(50);
  const [saturation, setSaturation] = useState(50);

  const imageScale = useSharedValue(1);
  const cropFrameScale = useSharedValue(1);
  const tc = useThemeColors();

  const animatedImageStyle = useAnimatedStyle(() => ({
    transform: [{ scale: imageScale.value }],
  }));

  const handleDone = useCallback(() => {
    // Apply edits and navigate back or to create-post
    router.back();
  }, [router]);

  const handleCancel = useCallback(() => {
    router.back();
  }, [router]);

  const getFilterStyle = (filter: FilterType) => {
    const f = FILTERS.find(f => f.id === filter);
    return { backgroundColor: f?.color || 'transparent' };
  };

  const renderCropTab = () => (
    <View style={styles.tabContent}>
      <Text style={styles.tabTitle}>{t('screens.imageEditor.aspectRatio')}</Text>
      <View style={styles.aspectRow}>
        {ASPECT_RATIOS.map((ar) => (
          <Pressable
            accessibilityRole="button"
            key={ar.value}
            style={[styles.aspectButton, aspectRatio === ar.value && styles.aspectButtonActive]}
            onPress={() => setAspectRatio(ar.value)}
          >
            <View style={[styles.aspectPreview, { borderColor: tc.border }, { aspectRatio: ar.ratio || 1 }]}>
              <View style={[styles.aspectInner, aspectRatio === ar.value && styles.aspectInnerActive]} />
            </View>
            <Text style={[styles.aspectLabel, aspectRatio === ar.value && styles.aspectLabelActive]}>
              {t(`screens.imageEditor.aspectRatio.${ar.value}`)}
            </Text>
          </Pressable>
        ))}
      </View>

      <Text style={styles.tabTitle}>{t('screens.imageEditor.cropFrame')}</Text>
      <View style={styles.cropFrameContainer}>
        <LinearGradient
          colors={['rgba(45,53,72,0.3)', 'rgba(28,35,51,0.15)']}
          style={styles.cropFrame}
        >
          <View style={styles.cropCorners}>
            <View style={[styles.corner, styles.cornerTopLeft]} />
            <View style={[styles.corner, styles.cornerTopRight]} />
            <View style={[styles.corner, styles.cornerBottomLeft]} />
            <View style={[styles.corner, styles.cornerBottomRight]} />
          </View>
          <Text style={styles.cropHint}>{t('screens.imageEditor.dragCornersHint')}</Text>
        </LinearGradient>
      </View>
    </View>
  );

  const renderFilterTab = () => (
    <View style={styles.tabContent}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterScroll}
      >
        {FILTERS.map((filter, index) => (
          <Pressable
            accessibilityRole="button"
            key={filter.id}
            style={[styles.filterItem, selectedFilter === filter.id && styles.filterItemActive]}
            onPress={() => setSelectedFilter(filter.id)}
          >
            <LinearGradient
              colors={['#2D3548', '#1C2333']}
              style={[styles.filterPreview, { backgroundColor: filter.color }]}
            >
              <View style={[styles.filterOverlay, { backgroundColor: filter.color }]} />
              <Text style={styles.filterPreviewText}>Aa</Text>
            </LinearGradient>
            <Text style={[styles.filterName, selectedFilter === filter.id && styles.filterNameActive]}>
              {t(`screens.imageEditor.filter.${filter.id}`)}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );

  const renderAdjustTab = () => (
    <View style={styles.tabContent}>
      {[
        { label: t('screens.imageEditor.brightness'), value: brightness, setValue: setBrightness, icon: 'sun' as IconName },
        { label: t('screens.imageEditor.contrast'), value: contrast, setValue: setContrast, icon: 'circle' as IconName },
        { label: t('screens.imageEditor.saturation'), value: saturation, setValue: setSaturation, icon: 'droplet' as IconName },
      ].map((slider) => (
        <View key={slider.label} style={styles.sliderContainer}>
          <View style={styles.sliderHeader}>
            <LinearGradient
              colors={['rgba(10,123,79,0.2)', 'rgba(200,150,62,0.1)']}
              style={styles.sliderIconBg}
            >
              <Icon name={slider.icon } size="xs" color={colors.emerald} />
            </LinearGradient>
            <Text style={styles.sliderLabel}>{slider.label}</Text>
            <Text style={styles.sliderValue}>{slider.value}%</Text>
          </View>
          <View style={styles.sliderTrack}>
            <LinearGradient
              colors={[colors.emerald, colors.gold]}
              style={[styles.sliderFill, { width: `${slider.value}%` }]}
            />
            <View style={[styles.sliderThumb, { backgroundColor: tc.bg }, { left: `${slider.value}%` }]}>
              <LinearGradient
                colors={[colors.emerald, colors.emeraldLight || colors.emerald]}
                style={styles.sliderThumbInner}
              />
            </View>
          </View>
          <View style={[styles.sliderTrackBg, { backgroundColor: tc.border }]} />
        </View>
      ))}
    </View>
  );

  const TAB_ICONS: Record<EditTab, IconName> = {
    crop: 'image',
    filter: 'layers',
    adjust: 'sliders',
  };

  return (
    <ScreenErrorBoundary>
      <View style={[styles.container, { backgroundColor: tc.bg }]}>
        <StatusBar barStyle="light-content" />

        {/* Header */}
        <GlassHeader
          title={t('screens.imageEditor.title')}
          leftAction={{ icon: 'x', onPress: handleCancel }}
          rightAction={{ icon: 'check', onPress: handleDone }}
        />

        {/* Image Preview */}
        <View style={styles.previewContainer}>
          <Animated.View style={[styles.imageWrapper, animatedImageStyle]}>
            <LinearGradient
              colors={['#2D3548', '#1C2333']}
              style={[styles.imagePlaceholder, getFilterStyle(selectedFilter)]}
            >
              <Icon name="image" size="xl" color={colors.text.tertiary} />
              <Text style={styles.imagePlaceholderText}>{t('screens.imageEditor.yourImage')}</Text>
            </LinearGradient>

            {/* Crop Frame Overlay */}
            {activeTab === 'crop' && (
              <View style={styles.cropOverlay}>
                <View style={[styles.cropFrameOuter, aspectRatio !== 'free' && { aspectRatio: ASPECT_RATIOS.find(ar => ar.value === aspectRatio)?.ratio || 1 }]}>
                  <LinearGradient
                    colors={['rgba(255,255,255,0.1)', 'rgba(255,255,255,0.05)']}
                    style={styles.cropFrameInner}
                  >
                    <View style={styles.cropGrid}>
                      <View style={styles.cropGridV1} />
                      <View style={styles.cropGridV2} />
                      <View style={styles.cropGridH1} />
                      <View style={styles.cropGridH2} />
                    </View>
                  </LinearGradient>
                </View>
              </View>
            )}
          </Animated.View>
        </View>

        {/* Edit Controls */}
        <View style={styles.controlsContainer}>
          {/* Tab Selector */}
          <View style={styles.tabBar}>
            {(['crop', 'filter', 'adjust'] as EditTab[]).map((tab) => (
              <Pressable
                accessibilityRole="button"
                key={tab}
                style={[styles.tab, activeTab === tab && styles.tabActive]}
                onPress={() => setActiveTab(tab)}
              >
                <LinearGradient
                  colors={activeTab === tab ? ['rgba(10,123,79,0.3)', 'rgba(200,150,62,0.2)'] : ['transparent', 'transparent']}
                  style={styles.tabIconBg}
                >
                  <Icon name={TAB_ICONS[tab] } size="sm" color={activeTab === tab ? colors.emerald : colors.text.tertiary} />
                </LinearGradient>
                <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>
                  {t(`screens.imageEditor.tab.${tab}`)}
                </Text>
              </Pressable>
            ))}
          </View>

          {/* Tab Content */}
          <LinearGradient
            colors={['rgba(45,53,72,0.3)', 'rgba(28,35,51,0.15)']}
            style={styles.tabContentContainer}
          >
            {activeTab === 'crop' && renderCropTab()}
            {activeTab === 'filter' && renderFilterTab()}
            {activeTab === 'adjust' && renderAdjustTab()}
          </LinearGradient>

          {/* Done Button */}
          <GradientButton
            label={t('common.done')}
            onPress={handleDone}
            style={styles.doneButton}
          />
        </View>
      </View>
  
    </ScreenErrorBoundary>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.dark.bg,
  },

  // Preview
  previewContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 100,
    paddingHorizontal: spacing.base,
  },
  imageWrapper: {
    width: '100%',
    aspectRatio: 4/5,
    borderRadius: radius.lg,
    overflow: 'hidden',
  },
  imagePlaceholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  imagePlaceholderText: {
    color: colors.text.tertiary,
    fontSize: fontSize.base,
    marginTop: spacing.sm,
  },

  // Crop Overlay
  cropOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  cropFrameOuter: {
    width: '80%',
    aspectRatio: 1,
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  cropFrameInner: {
    flex: 1,
    borderWidth: 2,
    borderColor: '#fff',
  },
  cropGrid: {
    ...StyleSheet.absoluteFillObject,
  },
  cropGridV1: {
    position: 'absolute',
    left: '33.33%',
    top: 0,
    bottom: 0,
    width: 1,
    backgroundColor: 'rgba(255,255,255,0.3)',
  },
  cropGridV2: {
    position: 'absolute',
    left: '66.66%',
    top: 0,
    bottom: 0,
    width: 1,
    backgroundColor: 'rgba(255,255,255,0.3)',
  },
  cropGridH1: {
    position: 'absolute',
    top: '33.33%',
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.3)',
  },
  cropGridH2: {
    position: 'absolute',
    top: '66.66%',
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.3)',
  },

  // Controls
  controlsContainer: {
    paddingHorizontal: spacing.base,
    paddingBottom: spacing.xl,
  },

  // Tab Bar
  tabBar: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  tab: {
    alignItems: 'center',
    padding: spacing.sm,
    borderRadius: radius.md,
  },
  tabActive: {
    backgroundColor: 'rgba(10,123,79,0.1)',
  },
  tabIconBg: {
    width: 44,
    height: 44,
    borderRadius: radius.full,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  tabText: {
    color: colors.text.tertiary,
    fontSize: fontSize.xs,
  },
  tabTextActive: {
    color: colors.emerald,
    fontWeight: '600',
  },

  // Tab Content
  tabContentContainer: {
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    maxHeight: 200,
  },
  tabContent: {
    flex: 1,
  },
  tabTitle: {
    color: colors.text.secondary,
    fontSize: fontSize.sm,
    fontWeight: '600',
    marginBottom: spacing.md,
  },

  // Crop Tab
  aspectRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: spacing.lg,
  },
  aspectButton: {
    alignItems: 'center',
    padding: spacing.sm,
  },
  aspectButtonActive: {
    backgroundColor: 'rgba(10,123,79,0.1)',
    borderRadius: radius.md,
  },
  aspectPreview: {
    width: 48,
    height: 48,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.dark.border,
    borderRadius: radius.sm,
    marginBottom: spacing.xs,
  },
  aspectInner: {
    width: 36,
    height: 28,
    borderWidth: 1,
    borderColor: colors.text.tertiary,
    borderRadius: 2,
  },
  aspectInnerActive: {
    borderColor: colors.emerald,
    borderWidth: 2,
  },
  aspectLabel: {
    color: colors.text.tertiary,
    fontSize: fontSize.xs,
  },
  aspectLabelActive: {
    color: colors.emerald,
    fontWeight: '600',
  },

  cropFrameContainer: {
    alignItems: 'center',
  },
  cropFrame: {
    width: '100%',
    height: 120,
    borderRadius: radius.md,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  cropCorners: {
    position: 'absolute',
    top: 8,
    left: 8,
    right: 8,
    bottom: 8,
  },
  corner: {
    position: 'absolute',
    width: 20,
    height: 20,
    borderColor: colors.emerald,
  },
  cornerTopLeft: {
    top: 0,
    left: 0,
    borderTopWidth: 2,
    borderLeftWidth: 2,
    borderTopLeftRadius: 4,
  },
  cornerTopRight: {
    top: 0,
    right: 0,
    borderTopWidth: 2,
    borderRightWidth: 2,
    borderTopRightRadius: 4,
  },
  cornerBottomLeft: {
    bottom: 0,
    left: 0,
    borderBottomWidth: 2,
    borderLeftWidth: 2,
    borderBottomLeftRadius: 4,
  },
  cornerBottomRight: {
    bottom: 0,
    right: 0,
    borderBottomWidth: 2,
    borderRightWidth: 2,
    borderBottomRightRadius: 4,
  },
  cropHint: {
    color: colors.text.tertiary,
    fontSize: fontSize.xs,
    marginTop: spacing.md,
  },

  // Filter Tab
  filterScroll: {
    gap: spacing.md,
    paddingHorizontal: spacing.sm,
  },
  filterItem: {
    alignItems: 'center',
  },
  filterItemActive: {
    backgroundColor: 'rgba(10,123,79,0.1)',
    borderRadius: radius.md,
    padding: spacing.xs,
  },
  filterPreview: {
    width: 64,
    height: 64,
    borderRadius: radius.full,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.xs,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  filterOverlay: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: radius.full,
  },
  filterPreviewText: {
    fontSize: fontSize.lg,
    fontWeight: '700',
    color: colors.text.primary,
  },
  filterName: {
    color: colors.text.tertiary,
    fontSize: fontSize.xs,
  },
  filterNameActive: {
    color: colors.emerald,
    fontWeight: '600',
  },

  // Adjust Tab
  sliderContainer: {
    marginBottom: spacing.md,
  },
  sliderHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  sliderIconBg: {
    width: 28,
    height: 28,
    borderRadius: radius.sm,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.sm,
  },
  sliderLabel: {
    color: colors.text.secondary,
    fontSize: fontSize.sm,
    flex: 1,
  },
  sliderValue: {
    color: colors.emerald,
    fontSize: fontSize.sm,
    fontWeight: '600',
  },
  sliderTrack: {
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
    justifyContent: 'center',
  },
  sliderTrackBg: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.dark.border,
    zIndex: -1,
  },
  sliderFill: {
    height: 6,
    borderRadius: 3,
    position: 'absolute',
    left: 0,
  },
  sliderThumb: {
    position: 'absolute',
    marginLeft: -10,
    width: 20,
    height: 20,
    borderRadius: radius.full,
    backgroundColor: colors.dark.bg,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
  },
  sliderThumbInner: {
    width: 14,
    height: 14,
    borderRadius: radius.full,
  },

  // Done Button
  doneButton: {
    marginTop: spacing.sm,
  },
});
