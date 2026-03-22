import { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Dimensions,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { Icon, type IconName } from '@/components/ui/Icon';
import { GlassHeader } from '@/components/ui/GlassHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { BrandedRefreshControl } from '@/components/ui/BrandedRefreshControl';
import { showToast } from '@/components/ui/Toast';
import { colors, spacing, radius, fontSize, fonts } from '@/theme';
import { useTranslation } from '@/hooks/useTranslation';
import { useThemeColors } from '@/hooks/useThemeColors';
import { ScreenErrorBoundary } from '@/components/ui/ScreenErrorBoundary';

const { width } = Dimensions.get('window');

const CHAT_THEME_STORAGE_PREFIX = 'chat-theme:';

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
  const params = useLocalSearchParams<{ conversationId: string }>();
  const conversationId = params.conversationId;
  const tc = useThemeColors();
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<TabType>('solid');
  const [selectedTheme, setSelectedTheme] = useState<string>('default');
  const [opacity, setOpacity] = useState(30);
  const [blur, setBlur] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  // Load saved theme on mount
  useEffect(() => {
    if (!conversationId) return;
    AsyncStorage.getItem(`${CHAT_THEME_STORAGE_PREFIX}${conversationId}`).then(
      (val) => {
        if (val) {
          try {
            const saved = JSON.parse(val) as { themeId: string; opacity: number; blur: number };
            setSelectedTheme(saved.themeId);
            setOpacity(saved.opacity);
            setBlur(saved.blur);
          } catch {
            // Corrupted data — ignore
          }
        }
      },
    );
  }, [conversationId]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    // Theme picker data is local — reload from AsyncStorage
    if (conversationId) {
      AsyncStorage.getItem(`${CHAT_THEME_STORAGE_PREFIX}${conversationId}`).then(
        (val) => {
          if (val) {
            try {
              const saved = JSON.parse(val) as { themeId: string; opacity: number; blur: number };
              setSelectedTheme(saved.themeId);
              setOpacity(saved.opacity);
              setBlur(saved.blur);
            } catch { /* ignore */ }
          }
          setRefreshing(false);
        },
      ).catch(() => setRefreshing(false));
    } else {
      setRefreshing(false);
    }
  }, [conversationId]);

  const getCurrentTheme = (): ThemeOption => {
    return (
      SOLID_COLORS.find(opt => opt.id === selectedTheme) ||
      GRADIENTS.find(opt => opt.id === selectedTheme) ||
      { id: 'default', name: 'Default', color: tc.bg }
    );
  };

  const getTranslatedThemeName = (id: string) => {
    const theme = SOLID_COLORS.find(opt => opt.id === id) ||
      GRADIENTS.find(opt => opt.id === id) ||
      PATTERNS.find(opt => opt.id === id) ||
      PHOTOS.find(opt => opt.id === id);
    if (theme) {
      return t(`chatThemePicker.themeName.${id}`);
    }
    return t('chatThemePicker.custom');
  };

  const renderColorItem = ({ item, index }: { item: ThemeOption; index: number }) => {
    const isSelected = selectedTheme === item.id;
    const itemWidth = (width - 64) / 2;

    return (
      <Animated.View entering={FadeInUp.delay(index * 60).duration(400)}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t(`chatThemePicker.themeName.${item.id}`)}
          style={[styles.colorItem, { width: itemWidth }]}
          onPress={() => setSelectedTheme(item.id)}
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
                <Icon name="check" size="sm" color={tc.text.primary} />
              </LinearGradient>
            )}
          </View>
          <Text style={[styles.themeName, { color: tc.text.secondary }]}>{t(`chatThemePicker.themeName.${item.id}`)}</Text>
        </Pressable>
      </Animated.View>
    );
  };

  const renderGradientItem = ({ item, index }: { item: ThemeOption; index: number }) => {
    const isSelected = selectedTheme === item.id;
    const itemWidth = (width - 64) / 2;

    return (
      <Animated.View entering={FadeInUp.delay(index * 60).duration(400)}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t(`chatThemePicker.themeName.${item.id}`)}
          style={[styles.colorItem, { width: itemWidth }]}
          onPress={() => setSelectedTheme(item.id)}
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
                <Icon name="check" size="sm" color={tc.text.primary} />
              </View>
            )}
          </LinearGradient>
          <Text style={[styles.themeName, { color: tc.text.secondary }]}>{t(`chatThemePicker.themeName.${item.id}`)}</Text>
        </Pressable>
      </Animated.View>
    );
  };

  const renderPatternItem = ({ item, index }: { item: ThemeOption; index: number }) => {
    const isSelected = selectedTheme === item.id;

    return (
      <Animated.View entering={FadeInUp.delay(index * 60).duration(400)}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t(`chatThemePicker.themeName.${item.id}`)}
          style={[styles.patternItem, isSelected && styles.patternItemSelected]}
          onPress={() => setSelectedTheme(item.id)}
        >
          <LinearGradient
            colors={['rgba(45,53,72,0.6)', 'rgba(28,35,51,0.4)']}
            style={styles.patternInner}
          >
            <Icon name={item.icon || 'layers'} size="md" color={colors.emerald} />
            <Text style={[styles.patternName, { color: tc.text.primary }]}>{t(`chatThemePicker.themeName.${item.id}`)}</Text>
          </LinearGradient>
          {isSelected && (
            <View style={styles.patternCheck}>
              <Icon name="check" size="xs" color={colors.emerald} />
            </View>
          )}
        </Pressable>
      </Animated.View>
    );
  };

  const renderPhotoItem = ({ item, index }: { item: ThemeOption; index: number }) => {
    const isSelected = selectedTheme === item.id;
    const isUpload = item.id === 'upload';

    return (
      <Animated.View entering={FadeInUp.delay(index * 60).duration(400)}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t(`chatThemePicker.themeName.${item.id}`)}
          style={[styles.photoItem, isUpload && styles.photoItemUpload, isSelected && styles.photoItemSelected]}
          onPress={() => !isUpload && setSelectedTheme(item.id)}
        >
          {isUpload ? (
            <View style={styles.uploadContent}>
              <Icon name="image" size="lg" color={colors.emerald} />
              <Icon name="plus" size="xs" color={colors.gold} style={styles.uploadPlus} />
              <Text style={styles.uploadText}>{t(`chatThemePicker.themeName.${item.id}`)}</Text>
            </View>
          ) : (
            <View style={styles.photoContent}>
              <Icon name="image" size="md" color={tc.text.tertiary} />
              <Text style={[styles.themeName, { color: tc.text.secondary }]}>{t(`chatThemePicker.themeName.${item.id}`)}</Text>
            </View>
          )}
          {isSelected && !isUpload && (
            <View style={styles.photoCheck}>
              <Icon name="check" size="xs" color={tc.text.primary} />
            </View>
          )}
        </Pressable>
      </Animated.View>
    );
  };

  const currentTheme = getCurrentTheme();

  return (
    <ScreenErrorBoundary>
    <SafeAreaView style={[styles.container, { backgroundColor: tc.bg }]} edges={['top']}>
      <GlassHeader title={t('chatThemePicker.title')} onBack={() => router.back()} />

      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<BrandedRefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {/* Current Theme Preview */}
        <View style={styles.previewContainer}>
          <LinearGradient
            colors={colors.gradient.cardDark}
            style={[styles.previewCard, { backgroundColor: currentTheme.color || tc.bg }]}
          >
            {currentTheme.gradient && (
              <LinearGradient
                colors={currentTheme.gradient}
                style={[StyleSheet.absoluteFill, { opacity: 0.3 }]}
              />
            )}
            {/* Sample messages for theme preview */}
            <View style={styles.chatPreview}>
              <View style={styles.messageRow}>
                <LinearGradient
                  colors={['rgba(10,123,79,0.3)', 'rgba(10,123,79,0.2)']}
                  style={styles.receivedMessage}
                >
                  <Text style={[styles.messageText, { color: tc.text.primary }]}>{t('chatThemePicker.preview.message1')}</Text>
                </LinearGradient>
              </View>
              <View style={[styles.messageRow, styles.sentRow]}>
                <LinearGradient
                  colors={[colors.emerald, colors.emeraldDark]}
                  style={styles.sentMessage}
                >
                  <Text style={[styles.sentMessageText, { color: tc.text.primary }]}>{t('chatThemePicker.preview.message2')}</Text>
                </LinearGradient>
              </View>
              <View style={styles.messageRow}>
                <LinearGradient
                  colors={['rgba(10,123,79,0.3)', 'rgba(10,123,79,0.2)']}
                  style={styles.receivedMessage}
                >
                  <Text style={[styles.messageText, { color: tc.text.primary }]}>{t('chatThemePicker.preview.message3')}</Text>
                </LinearGradient>
              </View>
            </View>
          </LinearGradient>
          <Text style={[styles.currentLabel, { color: tc.text.secondary }]}>
            {t('chatThemePicker.current')} {getTranslatedThemeName(selectedTheme)}
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
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t(`chatThemePicker.tab.${tab.id}`)}
                    style={[styles.tab, isActive && styles.tabActive]}
                    onPress={() => setActiveTab(tab.id)}
                  >
                    {isActive ? (
                      <LinearGradient
                        colors={[colors.emerald, colors.emeraldDark]}
                        style={styles.tabGradient}
                      >
                        <Text style={[styles.tabText, styles.tabTextActive]}>{t(`chatThemePicker.tab.${tab.id}`)}</Text>
                      </LinearGradient>
                    ) : (
                      <View style={[styles.tabInner, { backgroundColor: tc.surface }]}>
                        <Text style={[styles.tabText, { color: tc.text.secondary }]}>{t(`chatThemePicker.tab.${tab.id}`)}</Text>
                      </View>
                    )}
                  </Pressable>
                </Animated.View>

            );
          })}
        </ScrollView>

        {/* Theme Grid — using .map() instead of FlatList inside ScrollView */}
        <View style={styles.gridContainer}>
          {activeTab === 'solid' && (
            <View style={styles.gridContent}>
              {/* Pair items into rows of 2 */}
              {Array.from({ length: Math.ceil(SOLID_COLORS.length / 2) }, (_, rowIdx) => (
                <View key={rowIdx} style={styles.gridRow}>
                  {SOLID_COLORS.slice(rowIdx * 2, rowIdx * 2 + 2).map((item, i) =>
                    renderColorItem({ item, index: rowIdx * 2 + i })
                  )}
                </View>
              ))}
            </View>
          )}
          {activeTab === 'gradients' && (
            <View style={styles.gridContent}>
              {Array.from({ length: Math.ceil(GRADIENTS.length / 2) }, (_, rowIdx) => (
                <View key={rowIdx} style={styles.gridRow}>
                  {GRADIENTS.slice(rowIdx * 2, rowIdx * 2 + 2).map((item, i) =>
                    renderGradientItem({ item, index: rowIdx * 2 + i })
                  )}
                </View>
              ))}
            </View>
          )}
          {activeTab === 'patterns' && (
            <View style={styles.gridContent}>
              {Array.from({ length: Math.ceil(PATTERNS.length / 2) }, (_, rowIdx) => (
                <View key={rowIdx} style={styles.gridRow}>
                  {PATTERNS.slice(rowIdx * 2, rowIdx * 2 + 2).map((item, i) =>
                    renderPatternItem({ item, index: rowIdx * 2 + i })
                  )}
                </View>
              ))}
            </View>
          )}
          {activeTab === 'photos' && (
            <View style={styles.gridContent}>
              {Array.from({ length: Math.ceil(PHOTOS.length / 2) }, (_, rowIdx) => (
                <View key={rowIdx} style={styles.gridRow}>
                  {PHOTOS.slice(rowIdx * 2, rowIdx * 2 + 2).map((item, i) =>
                    renderPhotoItem({ item, index: rowIdx * 2 + i })
                  )}
                </View>
              ))}
            </View>
          )}
        </View>

        {/* Opacity/Blur Controls */}
        <Animated.View entering={FadeInUp.delay(300).duration(400)}>
          <LinearGradient
            colors={colors.gradient.cardDark}
            style={styles.controlsCard}
          >
            <View style={styles.controlsHeader}>
              <LinearGradient
                colors={['rgba(10,123,79,0.2)', 'rgba(200,150,62,0.1)']}
                style={styles.controlsIconBg}
              >
                <Icon name="sliders" size="xs" color={colors.emerald} />
              </LinearGradient>
              <Text style={[styles.controlsTitle, { color: tc.text.primary }]}>{t('chatThemePicker.appearance')}</Text>
            </View>

            <View style={styles.sliderRow}>
              <Text style={[styles.sliderLabel, { color: tc.text.primary }]}>{t('chatThemePicker.wallpaperOpacity')}</Text>
              <Text style={styles.sliderValue}>{opacity}%</Text>
            </View>
            <View style={styles.sliderButtons}>
              <Pressable onPress={() => setOpacity(Math.max(0, opacity - 10))} accessibilityRole="button" accessibilityLabel={t('chatThemePicker.decreaseOpacity')}>
                <Icon name="chevron-left" size="sm" color={tc.text.secondary} />
              </Pressable>
              <View style={[styles.sliderTrack, { backgroundColor: tc.surface, flex: 1 }]}>
                <View style={[styles.sliderFill, { width: `${opacity}%` }]} />
              </View>
              <Pressable onPress={() => setOpacity(Math.min(100, opacity + 10))} accessibilityRole="button" accessibilityLabel={t('chatThemePicker.increaseOpacity')}>
                <Icon name="chevron-right" size="sm" color={tc.text.secondary} />
              </Pressable>
            </View>

            <View style={[styles.sliderRow, { marginTop: spacing.lg }]}>
              <Text style={[styles.sliderLabel, { color: tc.text.primary }]}>{t('chatThemePicker.messageBlur')}</Text>
              <Text style={styles.sliderValue}>{blur}%</Text>
            </View>
            <View style={styles.sliderButtons}>
              <Pressable onPress={() => setBlur(Math.max(0, blur - 10))} accessibilityRole="button" accessibilityLabel={t('chatThemePicker.decreaseBlur')}>
                <Icon name="chevron-left" size="sm" color={tc.text.secondary} />
              </Pressable>
              <View style={[styles.sliderTrack, { backgroundColor: tc.surface, flex: 1 }]}>
                <View style={[styles.sliderFill, { width: `${blur}%` }]} />
              </View>
              <Pressable onPress={() => setBlur(Math.min(100, blur + 10))} accessibilityRole="button" accessibilityLabel={t('chatThemePicker.increaseBlur')}>
                <Icon name="chevron-right" size="sm" color={tc.text.secondary} />
              </Pressable>
            </View>
          </LinearGradient>
        </Animated.View>

        {/* Bottom Spacer */}
        <View style={styles.bottomSpacer} />
      </ScrollView>

      {/* Bottom Bar */}
      <View style={[styles.bottomBar, { backgroundColor: tc.bg, borderTopColor: tc.border }]}>
        <Pressable
          onPress={async () => {
            if (conversationId) {
              await AsyncStorage.removeItem(`${CHAT_THEME_STORAGE_PREFIX}${conversationId}`);
            }
            setSelectedTheme('default');
            setActiveTab('solid');
            setOpacity(30);
            setBlur(0);
            router.back();
          }}
          accessibilityRole="button"
          accessibilityLabel={t('chatThemePicker.resetToDefault')}
        >
          <Text style={[styles.resetText, { color: tc.text.secondary }]}>{t('chatThemePicker.resetToDefault')}</Text>
        </Pressable>
        <Pressable
          onPress={async () => {
            if (conversationId) {
              await AsyncStorage.setItem(
                `${CHAT_THEME_STORAGE_PREFIX}${conversationId}`,
                JSON.stringify({ themeId: selectedTheme, opacity, blur }),
              );
              showToast({ message: t('chatThemePicker.themeApplied'), variant: 'success' });
            }
            router.back();
          }}
          accessibilityRole="button"
          accessibilityLabel={t('chatThemePicker.apply')}
          style={{ opacity: selectedTheme === 'default' ? 0.5 : 1 }}
        >
          <LinearGradient
            colors={[colors.emerald, colors.emeraldDark]}
            style={styles.applyButton}
          >
            <Text style={[styles.applyText, { color: tc.text.primary }]}>{t('chatThemePicker.apply')}</Text>
          </LinearGradient>
        </Pressable>
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
    paddingHorizontal: spacing.base,
    marginTop: spacing.base,
  },
  previewCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.active.white6,
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
    borderColor: colors.active.white6,
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
    borderColor: colors.active.white6,
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
  sliderButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.sm,
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
