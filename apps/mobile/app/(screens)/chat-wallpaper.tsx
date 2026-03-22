import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, Pressable, ScrollView, Alert,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Animated, {
  FadeIn, FadeInUp,
  useSharedValue, useAnimatedStyle, withSpring,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from '@/components/ui/Icon';
import { GlassHeader } from '@/components/ui/GlassHeader';
import { GradientButton } from '@/components/ui/GradientButton';
import { ScreenErrorBoundary } from '@/components/ui/ScreenErrorBoundary';
import { colors, spacing, fontSize, radius, fonts, shadow, animation } from '@/theme';
import { useTranslation } from '@/hooks/useTranslation';
import { useThemeColors } from '@/hooks/useThemeColors';
import { useContextualHaptic } from '@/hooks/useContextualHaptic';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

// ── Constants ──
const WALLPAPER_STORAGE_PREFIX = 'chat-wallpaper:';

type WallpaperTab = 'solid' | 'gradient' | 'pattern' | 'custom';

interface SolidColor {
  name: string;
  value: string;
}

interface GradientPair {
  name: string;
  colors: [string, string];
}

interface PatternItem {
  name: string;
  color: string;
}

const SOLID_COLORS: SolidColor[] = [
  { name: 'Emerald', value: colors.emerald },
  { name: 'Gold', value: colors.gold },
  { name: 'Dark', value: colors.dark.bg },
  { name: 'Surface', value: colors.dark.surface },
  { name: 'Red', value: '#DC2626' },
  { name: 'Blue', value: '#2563EB' },
  { name: 'Purple', value: colors.extended.violet },
  { name: 'Orange', value: '#EA580C' },
  { name: 'Green', value: '#16A34A' },
  { name: 'Teal', value: '#0D9488' },
  { name: 'Pink', value: '#DB2777' },
  { name: 'Gray', value: '#6B7280' },
];

const GRADIENT_PAIRS: GradientPair[] = [
  { name: 'Emerald Night', colors: [colors.emerald, colors.dark.bg] },
  { name: 'Golden Dusk', colors: [colors.gold, colors.dark.bg] },
  { name: 'Purple Night', colors: [colors.extended.violet, colors.dark.bg] },
  { name: 'Ocean Deep', colors: ['#2563EB', colors.dark.bg] },
  { name: 'Emerald Gold', colors: [colors.emerald, colors.gold] },
  { name: 'Sunset', colors: ['#EA580C', '#DC2626'] },
  { name: 'Teal Depth', colors: ['#0D9488', colors.dark.bg] },
  { name: 'Rose Night', colors: ['#DB2777', colors.dark.bg] },
];

const PATTERNS: PatternItem[] = [
  { name: 'Arabesque', color: '#1A3A2A' },
  { name: 'Zellige', color: '#2A1A3A' },
  { name: 'Stars', color: '#1A2A3A' },
  { name: 'Hexagon', color: '#3A2A1A' },
  { name: 'Lattice', color: '#1A3A3A' },
  { name: 'Muqarnas', color: '#2A3A1A' },
];

const TABS: WallpaperTab[] = ['solid', 'gradient', 'pattern', 'custom'];

function ChatWallpaperScreen() {
  const router = useRouter();
  const tc = useThemeColors();
  const params = useLocalSearchParams<{ conversationId: string }>();
  const { t } = useTranslation();
  const haptic = useContextualHaptic();
  const insets = useSafeAreaInsets();

  const conversationId = params.conversationId;

  // ── State ──
  const [activeTab, setActiveTab] = useState<WallpaperTab>('solid');
  const [selectedColor, setSelectedColor] = useState<string | null>(null);
  const [selectedGradient, setSelectedGradient] = useState<[string, string] | null>(null);
  const [selectedPattern, setSelectedPattern] = useState<string | null>(null);
  const [customImage, setCustomImage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [currentWallpaper, setCurrentWallpaper] = useState<string | null>(null);

  // ── Load current wallpaper ──
  useEffect(() => {
    if (!conversationId) return;
    AsyncStorage.getItem(`${WALLPAPER_STORAGE_PREFIX}${conversationId}`).then(
      (val) => {
        if (val) setCurrentWallpaper(val);
      },
    );
  }, [conversationId]);

  // ── Selection helpers ──
  const clearSelections = useCallback(() => {
    setSelectedColor(null);
    setSelectedGradient(null);
    setSelectedPattern(null);
    setCustomImage(null);
  }, []);

  const handleSelectColor = useCallback((value: string) => {
    haptic.tick();
    clearSelections();
    setSelectedColor(value);
  }, [haptic, clearSelections]);

  const handleSelectGradient = useCallback((pair: [string, string]) => {
    haptic.tick();
    clearSelections();
    setSelectedGradient(pair);
  }, [haptic, clearSelections]);

  const handleSelectPattern = useCallback((name: string) => {
    haptic.tick();
    clearSelections();
    setSelectedPattern(name);
  }, [haptic, clearSelections]);

  const handlePickImage = useCallback(async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [9, 16],
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) {
      haptic.tick();
      clearSelections();
      setCustomImage(result.assets[0].uri);
    }
  }, [haptic, clearSelections]);

  const handleDefault = useCallback(async () => {
    haptic.tick();
    clearSelections();
    if (conversationId) {
      await AsyncStorage.removeItem(`${WALLPAPER_STORAGE_PREFIX}${conversationId}`);
    }
    setCurrentWallpaper(null);
    Alert.alert(t('chatWallpaper.defaultSet'), t('chatWallpaper.defaultSetMessage'));
  }, [haptic, clearSelections, conversationId, t]);

  const handleSave = useCallback(async () => {
    if (!conversationId) return;
    setSaving(true);
    try {
      let wallpaperValue = '';
      if (selectedColor) {
        wallpaperValue = `solid:${selectedColor}`;
      } else if (selectedGradient) {
        wallpaperValue = `gradient:${selectedGradient[0]},${selectedGradient[1]}`;
      } else if (selectedPattern) {
        wallpaperValue = `pattern:${selectedPattern}`;
      } else if (customImage) {
        wallpaperValue = `custom:${customImage}`;
      }
      if (wallpaperValue) {
        await AsyncStorage.setItem(
          `${WALLPAPER_STORAGE_PREFIX}${conversationId}`,
          wallpaperValue,
        );
        setCurrentWallpaper(wallpaperValue);
        haptic.success();
        router.back();
      }
    } catch {
      Alert.alert(t('common.error'), t('chatWallpaper.saveFailed'));
    } finally {
      setSaving(false);
    }
  }, [conversationId, selectedColor, selectedGradient, selectedPattern, customImage, haptic, router, t]);

  const hasSelection = selectedColor || selectedGradient || selectedPattern || customImage;

  // ── Preview rendering ──
  const renderPreview = () => {
    if (selectedColor) {
      return <View style={[styles.previewInner, { backgroundColor: selectedColor }]} />;
    }
    if (selectedGradient) {
      return (
        <LinearGradient
          colors={selectedGradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={styles.previewInner}
        />
      );
    }
    if (selectedPattern) {
      const pattern = PATTERNS.find((p) => p.name === selectedPattern);
      return (
        <View style={[styles.previewInner, { backgroundColor: pattern?.color ?? tc.bg }]}>
          <Text style={styles.patternPreviewLabel}>{selectedPattern}</Text>
        </View>
      );
    }
    if (customImage) {
      return <Image source={{ uri: customImage }} style={styles.previewInner} contentFit="cover" />;
    }
    if (currentWallpaper) {
      const [type, value] = currentWallpaper.split(':');
      if (type === 'solid') {
        return <View style={[styles.previewInner, { backgroundColor: value }]} />;
      }
      if (type === 'gradient' && value) {
        const gradColors = value.split(',') as [string, string];
        return (
          <LinearGradient
            colors={gradColors}
            start={{ x: 0, y: 0 }}
            end={{ x: 0, y: 1 }}
            style={styles.previewInner}
          />
        );
      }
    }
    return <View style={[styles.previewInner, { backgroundColor: tc.bg }]} />;
  };

  // ── Tab rendering ──
  const renderSolidTab = () => (
    <Animated.View entering={FadeIn.duration(200)} style={styles.grid3}>
      {SOLID_COLORS.map((color) => (
        <Pressable
          key={color.value}
          onPress={() => handleSelectColor(color.value)}
          style={styles.colorItem}
          accessibilityRole="button"
          accessibilityLabel={color.name}
        >
          <View
            style={[
              styles.colorCircle,
              { backgroundColor: color.value },
              selectedColor === color.value && styles.colorSelected,
            ]}
          >
            {selectedColor === color.value && (
              <Icon name="check" size="sm" color={colors.text.primary} />
            )}
          </View>
          <Text style={styles.colorName}>{color.name}</Text>
        </Pressable>
      ))}
    </Animated.View>
  );

  const renderGradientTab = () => (
    <Animated.View entering={FadeIn.duration(200)} style={styles.grid2}>
      {GRADIENT_PAIRS.map((pair) => {
        const isSelected =
          selectedGradient?.[0] === pair.colors[0] &&
          selectedGradient?.[1] === pair.colors[1];
        return (
          <Pressable
            key={pair.name}
            onPress={() => handleSelectGradient(pair.colors)}
            style={styles.gradientItem}
            accessibilityRole="button"
            accessibilityLabel={pair.name}
          >
            <LinearGradient
              colors={pair.colors}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={[
                styles.gradientCard,
                isSelected && styles.gradientSelected,
              ]}
            >
              {isSelected && (
                <Icon name="check" size="md" color={colors.text.primary} />
              )}
            </LinearGradient>
            <Text style={styles.gradientName}>{pair.name}</Text>
          </Pressable>
        );
      })}
    </Animated.View>
  );

  const renderPatternTab = () => (
    <Animated.View entering={FadeIn.duration(200)} style={styles.grid2}>
      {PATTERNS.map((pattern) => {
        const isSelected = selectedPattern === pattern.name;
        return (
          <Pressable
            key={pattern.name}
            onPress={() => handleSelectPattern(pattern.name)}
            style={styles.gradientItem}
            accessibilityRole="button"
            accessibilityLabel={pattern.name}
          >
            <View
              style={[
                styles.patternCard,
                { backgroundColor: pattern.color },
                isSelected && styles.gradientSelected,
              ]}
            >
              <Text style={styles.patternLabel}>{pattern.name}</Text>
              {isSelected && (
                <View style={styles.patternCheck}>
                  <Icon name="check" size="sm" color={colors.text.primary} />
                </View>
              )}
            </View>
          </Pressable>
        );
      })}
    </Animated.View>
  );

  const renderCustomTab = () => (
    <Animated.View entering={FadeIn.duration(200)} style={styles.customSection}>
      {customImage ? (
        <View style={[styles.customPreviewWrap, { borderColor: tc.border }]}>
          <Image source={{ uri: customImage }} style={styles.customPreview} contentFit="cover" />
          <Pressable
            style={styles.customRemove}
            onPress={() => setCustomImage(null)}
            accessibilityRole="button"
            accessibilityLabel={t('common.remove')}
          >
            <Icon name="x" size="sm" color={colors.text.primary} />
          </Pressable>
        </View>
      ) : null}
      <GradientButton
        label={t('chatWallpaper.chooseFromGallery')}
        onPress={handlePickImage}
        variant="secondary"
        icon="image"
        fullWidth
        size="lg"
      />
    </Animated.View>
  );

  const renderTabContent = () => {
    switch (activeTab) {
      case 'solid':
        return renderSolidTab();
      case 'gradient':
        return renderGradientTab();
      case 'pattern':
        return renderPatternTab();
      case 'custom':
        return renderCustomTab();
    }
  };

  const tabLabels: Record<WallpaperTab, string> = {
    solid: t('chatWallpaper.solid'),
    gradient: t('chatWallpaper.gradient'),
    pattern: t('chatWallpaper.pattern'),
    custom: t('chatWallpaper.custom'),
  };

  return (
    <View style={[styles.container, { backgroundColor: tc.bg }]}>
      <GlassHeader
        title={t('chatWallpaper.title')}
        leftAction={{
          icon: 'arrow-left',
          onPress: () => router.back(),
          accessibilityLabel: t('common.back'),
        }}
      />

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: insets.bottom + spacing.xl },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Preview Card */}
        <Animated.View entering={FadeInUp.delay(100).duration(300)} style={[styles.previewCard, { borderColor: tc.border }]}>
          <View style={styles.previewContainer}>
            {renderPreview()}
            <View style={styles.previewOverlay}>
              <Text style={styles.previewLabel}>{t('chatWallpaper.preview')}</Text>
            </View>
          </View>
        </Animated.View>

        {/* Category Tabs */}
        <View style={[styles.tabRow, { backgroundColor: tc.bgElevated }]}>
          {TABS.map((tab) => {
            const isActive = activeTab === tab;
            return (
              <Pressable
                key={tab}
                onPress={() => {
                  haptic.tick();
                  setActiveTab(tab);
                }}
                style={[styles.tab, isActive && styles.tabActive]}
                accessibilityRole="tab"
                accessibilityState={{ selected: isActive }}
              >
                <Text style={[styles.tabText, isActive && styles.tabTextActive]}>
                  {tabLabels[tab]}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* Tab Content */}
        <View style={styles.tabContent}>
          {renderTabContent()}
        </View>

        {/* Default Button */}
        <Pressable
          onPress={handleDefault}
          style={[styles.defaultButton, { backgroundColor: tc.bgElevated, borderColor: tc.border }]}
          accessibilityRole="button"
          accessibilityLabel={t('chatWallpaper.useDefault')}
        >
          <Icon name="slash" size="sm" color={colors.text.secondary} />
          <Text style={styles.defaultText}>{t('chatWallpaper.useDefault')}</Text>
        </Pressable>

        {/* Save Button */}
        {hasSelection ? (
          <Animated.View entering={FadeIn.duration(200)} style={styles.saveButtonWrap}>
            <GradientButton
              label={t('chatWallpaper.setWallpaper')}
              onPress={handleSave}
              loading={saving}
              fullWidth
              size="lg"
            />
          </Animated.View>
        ) : null}
      </ScrollView>
    </View>
  );
}

export default function ChatWallpaperScreenWrapper() {
  return (
    <ScreenErrorBoundary>
      <ChatWallpaperScreen />
    </ScreenErrorBoundary>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.dark.bg,
  },
  scrollView: {
    flex: 1,
    marginTop: 100,
  },
  scrollContent: {
    paddingHorizontal: spacing.base,
    paddingTop: spacing.base,
  },
  // Preview
  previewCard: {
    borderRadius: radius.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.dark.border,
    marginBottom: spacing.lg,
    ...shadow.md,
  },
  previewContainer: {
    height: 200,
    borderRadius: radius.lg,
    overflow: 'hidden',
  },
  previewInner: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewOverlay: {
    position: 'absolute',
    bottom: spacing.sm,
    left: spacing.sm,
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.sm,
  },
  previewLabel: {
    fontFamily: fonts.bodyMedium,
    fontSize: fontSize.sm,
    color: colors.text.primary,
  },
  patternPreviewLabel: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSize.lg,
    color: 'rgba(255,255,255,0.3)',
  },
  // Tabs
  tabRow: {
    flexDirection: 'row',
    backgroundColor: colors.dark.bgElevated,
    borderRadius: radius.md,
    padding: spacing.xs,
    marginBottom: spacing.lg,
  },
  tab: {
    flex: 1,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    borderRadius: radius.sm,
  },
  tabActive: {
    backgroundColor: colors.active.emerald20,
  },
  tabText: {
    fontFamily: fonts.bodyMedium,
    fontSize: fontSize.sm,
    color: colors.text.secondary,
  },
  tabTextActive: {
    fontFamily: fonts.bodySemiBold,
    color: colors.emerald,
  },
  tabContent: {
    marginBottom: spacing.lg,
  },
  // Solid colors grid
  grid3: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.base,
    justifyContent: 'flex-start',
  },
  colorItem: {
    width: '28%',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  colorCircle: {
    width: 56,
    height: 56,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
    marginBottom: spacing.xs,
  },
  colorSelected: {
    borderColor: colors.emerald,
    ...shadow.glow,
  },
  colorName: {
    fontFamily: fonts.body,
    fontSize: fontSize.xs,
    color: colors.text.secondary,
    textAlign: 'center',
  },
  // Gradient grid
  grid2: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  gradientItem: {
    width: '47%',
    marginBottom: spacing.sm,
  },
  gradientCard: {
    height: 80,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  gradientSelected: {
    borderColor: colors.emerald,
    ...shadow.glow,
  },
  gradientName: {
    fontFamily: fonts.body,
    fontSize: fontSize.xs,
    color: colors.text.secondary,
    textAlign: 'center',
    marginTop: spacing.xs,
  },
  // Pattern
  patternCard: {
    height: 80,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  patternLabel: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSize.sm,
    color: 'rgba(255,255,255,0.5)',
  },
  patternCheck: {
    position: 'absolute',
    top: spacing.sm,
    right: spacing.sm,
  },
  // Custom
  customSection: {
    gap: spacing.base,
  },
  customPreviewWrap: {
    height: 160,
    borderRadius: radius.md,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.dark.border,
  },
  customPreview: {
    width: '100%',
    height: '100%',
  },
  customRemove: {
    position: 'absolute',
    top: spacing.sm,
    right: spacing.sm,
    width: 32,
    height: 32,
    borderRadius: radius.full,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Default
  defaultButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.dark.border,
    backgroundColor: colors.dark.bgElevated,
    marginBottom: spacing.base,
  },
  defaultText: {
    fontFamily: fonts.bodyMedium,
    fontSize: fontSize.base,
    color: colors.text.secondary,
  },
  // Save
  saveButtonWrap: {
    marginTop: spacing.sm,
  },
});
