import { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  Dimensions,
  FlatList,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { Icon, type IconName } from '@/components/ui/Icon';
import { GlassHeader } from '@/components/ui/GlassHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { colors, spacing, radius, fontSize, fonts } from '@/theme';

const { width } = Dimensions.get('window');

type TabType = 'solid' | 'gradients' | 'patterns' | 'photos';

interface ThemeOption {
  id: string;
  name: string;
  color?: string;
  gradient?: [string, string];
  icon?: IconName;
}

const TABS: { id: TabType; label: string }[] = [
  { id: 'solid', label: 'Solid Colors' },
  { id: 'gradients', label: 'Gradients' },
  { id: 'patterns', label: 'Patterns' },
  { id: 'photos', label: 'Photos' },
];

const SOLID_COLORS: ThemeOption[] = [
  { id: 'default', name: 'Default Dark', color: '#0D1117' },
  { id: 'midnight', name: 'Midnight Blue', color: '#1a1a2e' },
  { id: 'purple', name: 'Deep Purple', color: '#2d1b4e' },
  { id: 'forest', name: 'Forest', color: '#0d3322' },
  { id: 'charcoal', name: 'Charcoal', color: '#242424' },
  { id: 'navy', name: 'Navy', color: '#1a237e' },
  { id: 'slate', name: 'Slate', color: '#263238' },
  { id: 'burgundy', name: 'Burgundy', color: '#3e1c1c' },
  { id: 'teal', name: 'Dark Teal', color: '#004d40' },
  { id: 'espresso', name: 'Espresso', color: '#3e2723' },
  { id: 'graphite', name: 'Graphite', color: '#333333' },
  { id: 'obsidian', name: 'Obsidian', color: '#1c1c1c' },
];

const GRADIENTS: ThemeOption[] = [
  { id: 'emerald-night', name: 'Emerald Night', gradient: ['#0A7B4F', '#0D1117'] },
  { id: 'golden-hour', name: 'Golden Hour', gradient: ['#C8963E', '#0D1117'] },
  { id: 'ocean-deep', name: 'Ocean Deep', gradient: ['#0d47a1', '#1a237e'] },
  { id: 'twilight', name: 'Twilight', gradient: ['#311b92', '#4a148c'] },
  { id: 'aurora', name: 'Aurora', gradient: ['#004d40', '#1b5e20'] },
  { id: 'cosmic', name: 'Cosmic', gradient: ['#1a237e', '#000051'] },
  { id: 'sahara', name: 'Sahara', gradient: ['#5d4037', '#3e2723'] },
  { id: 'midnight-rose', name: 'Midnight Rose', gradient: ['#4a148c', '#311b92'] },
];

const PATTERNS: ThemeOption[] = [
  { id: 'geometric', name: 'Geometric', icon: 'layers' },
  { id: 'stars', name: 'Stars', icon: 'star' },
  { id: 'waves', name: 'Waves', icon: 'droplet' },
  { id: 'dots', name: 'Dots', icon: 'circle' },
  { id: 'islamic', name: 'Islamic Art', icon: 'moon' },
  { id: 'minimal', name: 'Minimal', icon: 'slash' },
];

const PHOTOS: ThemeOption[] = [
  { id: 'upload', name: 'Upload Photo', icon: 'image' },
  { id: 'nature1', name: 'Nature 1', color: colors.dark.surface },
  { id: 'nature2', name: 'Nature 2', color: colors.dark.surface },
  { id: 'abstract1', name: 'Abstract 1', color: colors.dark.surface },
  { id: 'abstract2', name: 'Abstract 2', color: colors.dark.surface },
];

export default function ChatThemePickerScreen() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<TabType>('solid');
  const [selectedTheme, setSelectedTheme] = useState<string>('default');
  const [opacity, setOpacity] = useState(30);
  const [blur, setBlur] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 1000);
  }, []);

  const getCurrentTheme = () => {
    return (
      SOLID_COLORS.find(t => t.id === selectedTheme) ||
      GRADIENTS.find(t => t.id === selectedTheme) ||
      { color: colors.dark.bg }
    );
  };

  const renderColorItem = ({ item, index }: { item: ThemeOption; index: number }) => {
    const isSelected = selectedTheme === item.id;
    const itemWidth = (width - 64) / 2;

    return (
      <Animated.View entering={FadeInUp.delay(index * 60).duration(400)}>
        <TouchableOpacity
          style={[styles.colorItem, { width: itemWidth }]}
          onPress={() => setSelectedTheme(item.id)}
          activeOpacity={0.8}
        >
          <View
            style={[
              styles.colorSwatch,
              { backgroundColor: item.color },
              isSelected && styles.colorSwatchSelected,
            ]}
          >
            {isSelected && (
              <LinearGradient
                colors={['rgba(10,123,79,0.8)', 'rgba(10,123,79,0.6)']}
                style={styles.checkOverlay}
              >
                <Icon name="check" size="sm" color={colors.text.primary} />
              </LinearGradient>
            )}
          </View>
          <Text style={styles.themeName}>{item.name}</Text>
        </TouchableOpacity>
      </Animated.View>
    );
  };

  const renderGradientItem = ({ item, index }: { item: ThemeOption; index: number }) => {
    const isSelected = selectedTheme === item.id;
    const itemWidth = (width - 64) / 2;

    return (
      <Animated.View entering={FadeInUp.delay(index * 60).duration(400)}>
        <TouchableOpacity
          style={[styles.colorItem, { width: itemWidth }]}
          onPress={() => setSelectedTheme(item.id)}
          activeOpacity={0.8}
        >
          <LinearGradient
            colors={item.gradient || ['#0D1117', '#0D1117']}
            style={[
              styles.colorSwatch,
              isSelected && styles.colorSwatchSelected,
            ]}
          >
            {isSelected && (
              <View style={styles.checkOverlay}>
                <Icon name="check" size="sm" color={colors.text.primary} />
              </View>
            )}
          </LinearGradient>
          <Text style={styles.themeName}>{item.name}</Text>
        </TouchableOpacity>
      </Animated.View>
    );
  };

  const renderPatternItem = ({ item, index }: { item: ThemeOption; index: number }) => {
    const isSelected = selectedTheme === item.id;

    return (
      <Animated.View entering={FadeInUp.delay(index * 60).duration(400)}>
        <TouchableOpacity
          style={[styles.patternItem, isSelected && styles.patternItemSelected]}
          onPress={() => setSelectedTheme(item.id)}
          activeOpacity={0.8}
        >
          <LinearGradient
            colors={['rgba(45,53,72,0.6)', 'rgba(28,35,51,0.4)']}
            style={styles.patternInner}
          >
            <Icon name={item.icon || 'layers'} size="md" color={colors.emerald} />
            <Text style={styles.patternName}>{item.name}</Text>
          </LinearGradient>
          {isSelected && (
            <View style={styles.patternCheck}>
              <Icon name="check" size="xs" color={colors.emerald} />
            </View>
          )}
        </TouchableOpacity>
      </Animated.View>
    );
  };

  const renderPhotoItem = ({ item, index }: { item: ThemeOption; index: number }) => {
    const isSelected = selectedTheme === item.id;
    const isUpload = item.id === 'upload';

    return (
      <Animated.View entering={FadeInUp.delay(index * 60).duration(400)}>
        <TouchableOpacity
          style={[styles.photoItem, isUpload && styles.photoItemUpload, isSelected && styles.photoItemSelected]}
          onPress={() => !isUpload && setSelectedTheme(item.id)}
          activeOpacity={0.8}
        >
          {isUpload ? (
            <View style={styles.uploadContent}>
              <Icon name="image" size="lg" color={colors.emerald} />
              <Icon name="plus" size="xs" color={colors.gold} style={styles.uploadPlus} />
              <Text style={styles.uploadText}>{item.name}</Text>
            </View>
          ) : (
            <View style={styles.photoContent}>
              <Icon name="image" size="md" color={colors.text.tertiary} />
              <Text style={styles.themeName}>{item.name}</Text>
            </View>
          )}
          {isSelected && !isUpload && (
            <View style={styles.photoCheck}>
              <Icon name="check" size="xs" color={colors.text.primary} />
            </View>
          )}
        </TouchableOpacity>
      </Animated.View>
    );
  };

  const currentTheme = getCurrentTheme();

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <GlassHeader title="Chat Theme" onBack={() => router.back()} />

      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl tintColor={colors.emerald} refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {/* Current Theme Preview */}
        <View style={styles.previewContainer}>
          <LinearGradient
            colors={['rgba(45,53,72,0.4)', 'rgba(28,35,51,0.2)']}
            style={[styles.previewCard, { backgroundColor: currentTheme.color || colors.dark.bg }]}
          >
            {currentTheme.gradient && (
              <LinearGradient
                colors={currentTheme.gradient}
                style={StyleSheet.absoluteFill}
                opacity={0.3}
              />
            )}
            {/* Mock Chat Messages */}
            <View style={styles.chatPreview}>
              <View style={styles.messageRow}>
                <LinearGradient
                  colors={['rgba(10,123,79,0.3)', 'rgba(10,123,79,0.2)']}
                  style={styles.receivedMessage}
                >
                  <Text style={styles.messageText}>Hey! Have you seen the new design?</Text>
                </LinearGradient>
              </View>
              <View style={[styles.messageRow, styles.sentRow]}>
                <LinearGradient
                  colors={[colors.emerald, colors.emeraldDark]}
                  style={styles.sentMessage}
                >
                  <Text style={styles.sentMessageText}>Yes! It looks amazing ✨</Text>
                </LinearGradient>
              </View>
              <View style={styles.messageRow}>
                <LinearGradient
                  colors={['rgba(10,123,79,0.3)', 'rgba(10,123,79,0.2)']}
                  style={styles.receivedMessage}
                >
                  <Text style={styles.messageText}>Love the emerald accents</Text>
                </LinearGradient>
              </View>
            </View>
          </LinearGradient>
          <Text style={styles.currentLabel}>
            Current: {SOLID_COLORS.find(t => t.id === selectedTheme)?.name ||
              GRADIENTS.find(t => t.id === selectedTheme)?.name ||
              PATTERNS.find(t => t.id === selectedTheme)?.name ||
              'Custom'}
          </Text>
        </View>

        {/* Tabs */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.tabsContainer}
        >
          {TABS.map((tab, index) => {
            const isActive = activeTab === tab.id;
            return (
              <Animated.View key={tab.id} entering={FadeInUp.delay(index * 80).duration(400)}>
                <TouchableOpacity
                  style={[styles.tab, isActive && styles.tabActive]}
                  onPress={() => setActiveTab(tab.id)}
                  activeOpacity={0.8}
                >
                  {isActive ? (
                    <LinearGradient
                      colors={[colors.emerald, colors.emeraldDark]}
                      style={styles.tabGradient}
                    >
                      <Text style={[styles.tabText, styles.tabTextActive]}>{tab.label}</Text>
                    </LinearGradient>
                  ) : (
                    <View style={styles.tabInner}>
                      <Text style={styles.tabText}>{tab.label}</Text>
                    </View>
                  )}
                </TouchableOpacity>
              </Animated.View>
            );
          })}
        </ScrollView>

        {/* Theme Grid */}
        <View style={styles.gridContainer}>
          {activeTab === 'solid' && (
            <FlatList
              data={SOLID_COLORS}
              renderItem={renderColorItem}
              keyExtractor={item => item.id}
              numColumns={2}
              scrollEnabled={false}
              columnWrapperStyle={styles.gridRow}
              contentContainerStyle={styles.gridContent}
            />
          )}
          {activeTab === 'gradients' && (
            <FlatList
              data={GRADIENTS}
              renderItem={renderGradientItem}
              keyExtractor={item => item.id}
              numColumns={2}
              scrollEnabled={false}
              columnWrapperStyle={styles.gridRow}
              contentContainerStyle={styles.gridContent}
            />
          )}
          {activeTab === 'patterns' && (
            <FlatList
              data={PATTERNS}
              renderItem={renderPatternItem}
              keyExtractor={item => item.id}
              numColumns={2}
              scrollEnabled={false}
              columnWrapperStyle={styles.gridRow}
              contentContainerStyle={styles.gridContent}
            />
          )}
          {activeTab === 'photos' && (
            <FlatList
              data={PHOTOS}
              renderItem={renderPhotoItem}
              keyExtractor={item => item.id}
              numColumns={2}
              scrollEnabled={false}
              columnWrapperStyle={styles.gridRow}
              contentContainerStyle={styles.gridContent}
            />
          )}
        </View>

        {/* Opacity/Blur Controls */}
        <Animated.View entering={FadeInUp.delay(300).duration(400)}>
          <LinearGradient
            colors={['rgba(45,53,72,0.4)', 'rgba(28,35,51,0.2)']}
            style={styles.controlsCard}
          >
            <View style={styles.controlsHeader}>
              <LinearGradient
                colors={['rgba(10,123,79,0.2)', 'rgba(200,150,62,0.1)']}
                style={styles.controlsIconBg}
              >
                <Icon name="sliders" size="xs" color={colors.emerald} />
              </LinearGradient>
              <Text style={styles.controlsTitle}>Appearance</Text>
            </View>

            <View style={styles.sliderRow}>
              <Text style={styles.sliderLabel}>Wallpaper Opacity</Text>
              <Text style={styles.sliderValue}>{opacity}%</Text>
            </View>
            <View style={styles.sliderTrack}>
              <View style={[styles.sliderFill, { width: `${opacity}%` }]} />
            </View>

            <View style={[styles.sliderRow, { marginTop: spacing.lg }]}>
              <Text style={styles.sliderLabel}>Message Blur</Text>
              <Text style={styles.sliderValue}>{blur}%</Text>
            </View>
            <View style={styles.sliderTrack}>
              <View style={[styles.sliderFill, { width: `${blur}%` }]} />
            </View>
          </LinearGradient>
        </Animated.View>

        {/* Bottom Spacer */}
        <View style={styles.bottomSpacer} />
      </ScrollView>

      {/* Bottom Bar */}
      <View style={styles.bottomBar}>
        <TouchableOpacity activeOpacity={0.8}>
          <Text style={styles.resetText}>Reset to Default</Text>
        </TouchableOpacity>
        <TouchableOpacity activeOpacity={0.8}>
          <LinearGradient
            colors={[colors.emerald, colors.emeraldDark]}
            style={styles.applyButton}
          >
            <Text style={styles.applyText}>Apply</Text>
          </LinearGradient>
        </TouchableOpacity>
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
    paddingHorizontal: spacing.base,
    marginTop: spacing.base,
  },
  previewCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    padding: spacing.lg,
    minHeight: 160,
    overflow: 'hidden',
  },
  chatPreview: {
    gap: spacing.sm,
  },
  messageRow: {
    flexDirection: 'row',
  },
  sentRow: {
    justifyContent: 'flex-end',
  },
  receivedMessage: {
    borderRadius: radius.md,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
    maxWidth: '75%',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  sentMessage: {
    borderRadius: radius.md,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
    maxWidth: '75%',
  },
  messageText: {
    fontSize: fontSize.sm,
    fontFamily: fonts.regular,
    color: colors.text.primary,
  },
  sentMessageText: {
    fontSize: fontSize.sm,
    fontFamily: fonts.regular,
    color: colors.text.primary,
  },
  currentLabel: {
    fontSize: fontSize.sm,
    fontFamily: fonts.medium,
    color: colors.text.secondary,
    marginTop: spacing.md,
    textAlign: 'center',
  },
  tabsContainer: {
    flexDirection: 'row',
    paddingHorizontal: spacing.base,
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
  tab: {
    borderRadius: radius.full,
    overflow: 'hidden',
  },
  tabActive: {
    shadowColor: colors.emerald,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
  },
  tabGradient: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  tabInner: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    backgroundColor: colors.dark.surface,
    borderRadius: radius.full,
  },
  tabText: {
    fontSize: fontSize.sm,
    fontFamily: fonts.medium,
    color: colors.text.secondary,
  },
  tabTextActive: {
    color: colors.text.primary,
  },
  gridContainer: {
    marginTop: spacing.lg,
    paddingHorizontal: spacing.base,
  },
  gridRow: {
    justifyContent: 'space-between',
    marginBottom: spacing.base,
  },
  gridContent: {
    paddingBottom: spacing.base,
  },
  colorItem: {
    alignItems: 'center',
  },
  colorSwatch: {
    width: '100%',
    aspectRatio: 1.5,
    borderRadius: radius.md,
    position: 'relative',
    overflow: 'hidden',
  },
  colorSwatchSelected: {
    borderWidth: 2,
    borderColor: colors.emerald,
  },
  checkOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },
  themeName: {
    fontSize: fontSize.xs,
    fontFamily: fonts.medium,
    color: colors.text.secondary,
    marginTop: spacing.xs,
  },
  patternItem: {
    width: (width - 64) / 2,
    borderRadius: radius.md,
    overflow: 'hidden',
    position: 'relative',
  },
  patternItemSelected: {
    borderWidth: 2,
    borderColor: colors.emerald,
  },
  patternInner: {
    padding: spacing.lg,
    alignItems: 'center',
    gap: spacing.sm,
    aspectRatio: 1.5,
    borderRadius: radius.md,
  },
  patternName: {
    fontSize: fontSize.sm,
    fontFamily: fonts.medium,
    color: colors.text.primary,
  },
  patternCheck: {
    position: 'absolute',
    top: spacing.xs,
    right: spacing.xs,
    width: 20,
    height: 20,
    borderRadius: radius.full,
    backgroundColor: colors.emerald,
    justifyContent: 'center',
    alignItems: 'center',
  },
  photoItem: {
    width: (width - 64) / 2,
    aspectRatio: 1.5,
    borderRadius: radius.md,
    backgroundColor: colors.dark.surface,
    overflow: 'hidden',
    position: 'relative',
  },
  photoItemUpload: {
    borderWidth: 2,
    borderColor: colors.emerald,
    borderStyle: 'dashed',
    backgroundColor: 'transparent',
  },
  photoItemSelected: {
    borderWidth: 2,
    borderColor: colors.emerald,
  },
  photoContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.sm,
  },
  uploadContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.sm,
    position: 'relative',
  },
  uploadPlus: {
    position: 'absolute',
    right: '35%',
    top: '30%',
  },
  uploadText: {
    fontSize: fontSize.sm,
    fontFamily: fonts.medium,
    color: colors.emerald,
  },
  photoCheck: {
    position: 'absolute',
    top: spacing.xs,
    right: spacing.xs,
    width: 20,
    height: 20,
    borderRadius: radius.full,
    backgroundColor: colors.emerald,
    justifyContent: 'center',
    alignItems: 'center',
  },
  controlsCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    padding: spacing.base,
    marginHorizontal: spacing.base,
    marginTop: spacing.lg,
  },
  controlsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  controlsIconBg: {
    width: 32,
    height: 32,
    borderRadius: radius.sm,
    justifyContent: 'center',
    alignItems: 'center',
  },
  controlsTitle: {
    fontSize: fontSize.md,
    fontFamily: fonts.semibold,
    color: colors.text.primary,
  },
  sliderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sliderLabel: {
    fontSize: fontSize.base,
    fontFamily: fonts.medium,
    color: colors.text.primary,
  },
  sliderValue: {
    fontSize: fontSize.sm,
    fontFamily: fonts.semibold,
    color: colors.gold,
  },
  sliderTrack: {
    height: 4,
    backgroundColor: colors.dark.surface,
    borderRadius: radius.full,
    marginTop: spacing.sm,
    overflow: 'hidden',
  },
  sliderFill: {
    height: '100%',
    backgroundColor: colors.emerald,
  },
  bottomSpacer: {
    height: 100,
  },
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: spacing.base,
    backgroundColor: colors.dark.bg,
    borderTopWidth: 1,
    borderTopColor: colors.dark.border,
  },
  resetText: {
    fontSize: fontSize.base,
    fontFamily: fonts.medium,
    color: colors.text.secondary,
    padding: spacing.sm,
  },
  applyButton: {
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
  },
  applyText: {
    fontSize: fontSize.base,
    fontFamily: fonts.semibold,
    color: colors.text.primary,
  },
});
