import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, Pressable, FlatList, RefreshControl,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Animated, {
  FadeIn, FadeInUp,
  useSharedValue, useAnimatedStyle, withSpring,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from '@/components/ui/Icon';
import { GlassHeader } from '@/components/ui/GlassHeader';
import { GradientButton } from '@/components/ui/GradientButton';
import { ScreenErrorBoundary } from '@/components/ui/ScreenErrorBoundary';
import { colors, spacing, fontSize, radius, fonts, shadow, animation } from '@/theme';
import { useTranslation } from '@/hooks/useTranslation';
import { useContextualHaptic } from '@/hooks/useContextualHaptic';
import { useThemeColors } from '@/hooks/useThemeColors';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

// ── Constants ──
const TONE_STORAGE_PREFIX = 'notification-tone:';

interface ToneOption {
  id: string;
  labelKey: string;
  icon: 'bell' | 'volume-x' | 'volume-x';
}

const TONE_OPTIONS: ToneOption[] = [
  { id: 'default', labelKey: 'notificationTones.default', icon: 'bell' },
  { id: 'silent', labelKey: 'notificationTones.silent', icon: 'volume-x' },
  { id: 'gentle_bell', labelKey: 'notificationTones.gentleBell', icon: 'bell' },
  { id: 'soft_chime', labelKey: 'notificationTones.softChime', icon: 'bell' },
  { id: 'adhan_soft', labelKey: 'notificationTones.adhanSoft', icon: 'bell' },
  { id: 'islamic_melody', labelKey: 'notificationTones.islamicMelody', icon: 'bell' },
  { id: 'water_drop', labelKey: 'notificationTones.waterDrop', icon: 'bell' },
  { id: 'none', labelKey: 'notificationTones.none', icon: 'volume-x' },
];

function NotificationTonesScreen() {
  const tc = useThemeColors();
  const styles = createStyles(tc);
  const router = useRouter();
  const params = useLocalSearchParams<{
    conversationId: string;
    currentTone?: string;
  }>();
  const { t } = useTranslation();
  const haptic = useContextualHaptic();
  const insets = useSafeAreaInsets();

  const conversationId = params.conversationId;

  // ── State ──
  const [selectedTone, setSelectedTone] = useState<string>(
    params.currentTone ?? 'default',
  );
  const [playingTone, setPlayingTone] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [originalTone, setOriginalTone] = useState<string>('default');

  // ── Load saved tone ──
  useEffect(() => {
    if (!conversationId) return;
    AsyncStorage.getItem(`${TONE_STORAGE_PREFIX}${conversationId}`).then(
      (val) => {
        if (val) {
          setSelectedTone(val);
          setOriginalTone(val);
        }
      },
    );
  }, [conversationId]);

  // ── Handlers ──
  const handleSelect = useCallback((toneId: string) => {
    haptic.tick();
    setSelectedTone(toneId);
  }, [haptic]);

  const handlePreview = useCallback((toneId: string) => {
    // Audio files not yet available — preview is a visual-only indicator
    haptic.tick();
    setPlayingTone(toneId);
    // Auto-clear after brief visual feedback
    setTimeout(() => setPlayingTone(null), 1500);
  }, [haptic]);

  const handleSave = useCallback(async () => {
    if (!conversationId) return;
    setSaving(true);
    try {
      await AsyncStorage.setItem(
        `${TONE_STORAGE_PREFIX}${conversationId}`,
        selectedTone,
      );
      haptic.success();
      router.back();
    } catch {
      haptic.error();
    } finally {
      setSaving(false);
    }
  }, [conversationId, selectedTone, haptic, router]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    if (conversationId) {
      const val = await AsyncStorage.getItem(
        `${TONE_STORAGE_PREFIX}${conversationId}`,
      );
      if (val) {
        setSelectedTone(val);
        setOriginalTone(val);
      }
    }
    setRefreshing(false);
  }, [conversationId]);

  const hasChanged = selectedTone !== originalTone;

  // ── Render tone row ──
  const renderToneItem = useCallback(
    ({ item, index }: { item: ToneOption; index: number }) => {
      const isSelected = selectedTone === item.id;
      const isPlaying = playingTone === item.id;
      const isSilent = item.id === 'silent' || item.id === 'none';

      return (
        <Animated.View entering={FadeInUp.delay(index * 40).duration(250)}>
          <Pressable
            onPress={() => handleSelect(item.id)}
            style={[styles.toneRow, isSelected && styles.toneRowSelected]}
            accessibilityRole="radio"
            accessibilityState={{ selected: isSelected }}
            accessibilityLabel={t(item.labelKey)}
          >
            {/* Radio indicator */}
            <View
              style={[
                styles.radio,
                isSelected && styles.radioSelected,
              ]}
            >
              {isSelected && <View style={styles.radioInner} />}
            </View>

            {/* Tone name */}
            <View style={styles.toneInfo}>
              <Text
                style={[
                  styles.toneName,
                  isSelected && styles.toneNameSelected,
                ]}
              >
                {t(item.labelKey)}
              </Text>
              {item.id === 'default' && (
                <Text style={styles.toneSubtitle}>
                  {t('notificationTones.defaultDescription')}
                </Text>
              )}
            </View>

            {/* Play preview button */}
            {!isSilent ? (
              <Pressable
                onPress={() => handlePreview(item.id)}
                style={[
                  styles.playButton,
                  isPlaying && styles.playButtonActive,
                ]}
                accessibilityRole="button"
                accessibilityLabel={t('notificationTones.preview')}
                hitSlop={8}
              >
                <Icon
                  name={isPlaying ? 'loader' : 'volume-x'}
                  size="sm"
                  color={isPlaying ? colors.emerald : colors.text.tertiary}
                />
              </Pressable>
            ) : (
              <View style={styles.playButtonSpacer} />
            )}
          </Pressable>
        </Animated.View>
      );
    },
    [selectedTone, playingTone, handleSelect, handlePreview, t],
  );

  const keyExtractor = useCallback((item: ToneOption) => item.id, []);

  return (
    <View style={styles.container}>
      <GlassHeader
        title={t('notificationTones.title')}
        leftAction={{
          icon: 'arrow-left',
          onPress: () => router.back(),
          accessibilityLabel: t('common.back'),
        }}
      />

      <FlatList
        data={TONE_OPTIONS}
        renderItem={renderToneItem}
        keyExtractor={keyExtractor}
        style={styles.list}
        contentContainerStyle={[
          styles.listContent,
          { paddingBottom: insets.bottom + (hasChanged ? 100 : spacing.xl) },
        ]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={colors.emerald}
          />
        }
        ListHeaderComponent={
          <Animated.View entering={FadeIn.duration(300)} style={styles.headerInfo}>
            <View style={styles.headerIconWrap}>
              <Icon name="bell" size="lg" color={colors.emerald} />
            </View>
            <Text style={styles.headerTitle}>
              {t('notificationTones.selectTone')}
            </Text>
            <Text style={styles.headerSubtitle}>
              {t('notificationTones.selectToneDescription')}
            </Text>
          </Animated.View>
        }
        ItemSeparatorComponent={() => <View style={styles.separator} />}
      />

      {/* Save Button */}
      {hasChanged && (
        <Animated.View
          entering={FadeIn.duration(200)}
          style={[styles.saveBar, { paddingBottom: insets.bottom + spacing.base }]}
        >
          <GradientButton
            label={t('notificationTones.save')}
            onPress={handleSave}
            loading={saving}
            fullWidth
            size="lg"
          />
        </Animated.View>
      )}
    </View>
  );
}

export default function NotificationTonesScreenWrapper() {
  return (
    <ScreenErrorBoundary>
      <NotificationTonesScreen />
    </ScreenErrorBoundary>
  );
}

const createStyles = (tc: ReturnType<typeof useThemeColors>) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: tc.bg,
  },
  list: {
    flex: 1,
    marginTop: 100,
  },
  listContent: {
    paddingHorizontal: spacing.base,
    paddingTop: spacing.base,
  },
  // Header
  headerInfo: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
    marginBottom: spacing.md,
  },
  headerIconWrap: {
    width: 56,
    height: 56,
    borderRadius: radius.full,
    backgroundColor: colors.active.emerald10,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  headerTitle: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSize.md,
    color: colors.text.primary,
    marginBottom: spacing.xs,
  },
  headerSubtitle: {
    fontFamily: fonts.body,
    fontSize: fontSize.sm,
    color: colors.text.secondary,
    textAlign: 'center',
    paddingHorizontal: spacing.xl,
  },
  // Tone row
  toneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.base,
    borderRadius: radius.md,
    backgroundColor: tc.bgElevated,
  },
  toneRowSelected: {
    backgroundColor: colors.active.emerald10,
    borderWidth: 1,
    borderColor: colors.emerald,
  },
  // Radio
  radio: {
    width: 22,
    height: 22,
    borderRadius: radius.full,
    borderWidth: 2,
    borderColor: tc.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  radioSelected: {
    borderColor: colors.emerald,
  },
  radioInner: {
    width: 12,
    height: 12,
    borderRadius: radius.full,
    backgroundColor: colors.emerald,
  },
  // Tone info
  toneInfo: {
    flex: 1,
  },
  toneName: {
    fontFamily: fonts.bodyMedium,
    fontSize: fontSize.base,
    color: colors.text.primary,
  },
  toneNameSelected: {
    fontFamily: fonts.bodySemiBold,
    color: colors.emerald,
  },
  toneSubtitle: {
    fontFamily: fonts.body,
    fontSize: fontSize.xs,
    color: colors.text.tertiary,
    marginTop: 2,
  },
  // Play button
  playButton: {
    width: 36,
    height: 36,
    borderRadius: radius.full,
    backgroundColor: colors.active.white5,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: spacing.sm,
  },
  playButtonActive: {
    backgroundColor: colors.active.emerald10,
  },
  playButtonSpacer: {
    width: 36,
    height: 36,
    marginLeft: spacing.sm,
  },
  // Separator
  separator: {
    height: spacing.sm,
  },
  // Save bar
  saveBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: spacing.base,
    paddingTop: spacing.md,
    backgroundColor: 'rgba(13, 17, 23, 0.95)',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: tc.border,
  },
});
