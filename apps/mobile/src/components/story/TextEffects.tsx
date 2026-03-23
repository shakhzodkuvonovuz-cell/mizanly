import { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  Pressable,
  ScrollView,
  Platform,
  KeyboardAvoidingView,
} from 'react-native';
import Animated, {
  FadeIn,
  FadeOut,
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  withSequence,
} from 'react-native-reanimated';
import { Icon } from '@/components/ui/Icon';
import { BottomSheet, BottomSheetItem } from '@/components/ui/BottomSheet';
import { colors, spacing, fontSize as fontSizes, radius } from '@/theme';
import { useTranslation } from '@/hooks/useTranslation';
import { useThemeColors } from '@/hooks/useThemeColors';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TextEffect {
  id: string;
  text: string;
  style: 'classic' | 'modern' | 'neon' | 'typewriter' | 'strong' | 'cursive';
  color: string;
  bgColor?: string;
  fontSize: number;
  alignment: 'left' | 'center' | 'right';
  animation: 'none' | 'fade-in' | 'typewriter' | 'bounce' | 'slide-up';
}

interface TextEffectsProps {
  visible: boolean;
  onClose: () => void;
  onAdd: (effect: TextEffect) => void;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

interface StylePreset {
  id: TextEffect['style'];
  label: string;
  fontFamily: string | undefined;
  fontWeight: '400' | '600' | '700' | '900';
}

const STYLE_PRESETS: StylePreset[] = [
  { id: 'classic', label: 'Classic', fontFamily: undefined, fontWeight: '400' },
  { id: 'modern', label: 'Modern', fontFamily: undefined, fontWeight: '700' },
  { id: 'neon', label: 'Neon', fontFamily: undefined, fontWeight: '600' },
  {
    id: 'typewriter',
    label: 'Typewriter',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    fontWeight: '400',
  },
  { id: 'strong', label: 'Strong', fontFamily: undefined, fontWeight: '900' },
  {
    id: 'cursive',
    label: 'Cursive',
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
    fontWeight: '400',
  },
];

const TEXT_COLORS = [
  '#FFFFFF', '#000000', '#0A7B4F', '#C8963E',
  '#F85149', colors.extended.blue, '#D2A8FF', '#FFA657',
  colors.extended.greenBright, '#F0883E', '#FF7B72', '#79C0FF',
] as const;

const SIZE_STEPS = [20, 32, 48] as const;

const ALIGNMENT_CYCLE: Array<'left' | 'center' | 'right'> = ['left', 'center', 'right'];

type AnimationOption = TextEffect['animation'];

interface AnimationChoice {
  id: AnimationOption;
  label: string;
  iconName: 'eye' | 'type' | 'play' | 'chevron-down' | 'chevron-right';
}

const ANIMATION_OPTIONS: AnimationChoice[] = [
  { id: 'none', label: 'None', iconName: 'eye' },
  { id: 'fade-in', label: 'Fade In', iconName: 'eye' },
  { id: 'typewriter', label: 'Typewriter', iconName: 'type' },
  { id: 'bounce', label: 'Bounce', iconName: 'play' },
  { id: 'slide-up', label: 'Slide Up', iconName: 'chevron-down' },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getAlignmentIcon(alignment: 'left' | 'center' | 'right'): 'chevron-left' | 'layout' | 'chevron-right' {
  switch (alignment) {
    case 'left':
      return 'chevron-left';
    case 'center':
      return 'layout';
    case 'right':
      return 'chevron-right';
  }
}

function getSizeLabel(size: number): string {
  if (size <= 20) return 'S';
  if (size <= 32) return 'M';
  return 'L';
}

function hexToRgba(hex: string, alpha: number): string {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.substring(0, 2), 16);
  const g = parseInt(clean.substring(2, 4), 16);
  const b = parseInt(clean.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// ---------------------------------------------------------------------------
// AnimatedPreview
// ---------------------------------------------------------------------------

interface AnimatedPreviewProps {
  text: string;
  animationType: AnimationOption;
  style: Record<string, unknown>;
}

function AnimatedPreview({ text, animationType, style }: AnimatedPreviewProps) {
  const opacity = useSharedValue(1);
  const scale = useSharedValue(1);
  const translateY = useSharedValue(0);
  const charCount = useSharedValue(text.length);

  useEffect(() => {
    // Reset values
    opacity.value = 1;
    scale.value = 1;
    translateY.value = 0;
    charCount.value = text.length;

    switch (animationType) {
      case 'fade-in':
        opacity.value = 0;
        opacity.value = withTiming(1, { duration: 500 });
        break;
      case 'typewriter':
        charCount.value = 0;
        charCount.value = withTiming(text.length, { duration: text.length * 80 });
        break;
      case 'bounce':
        scale.value = 0;
        scale.value = withSequence(
          withSpring(1.2, { damping: 8, stiffness: 300 }),
          withSpring(1, { damping: 12, stiffness: 200 }),
        );
        break;
      case 'slide-up':
        translateY.value = 50;
        translateY.value = withSpring(0, { damping: 14, stiffness: 170 });
        break;
      default:
        break;
    }
  }, [animationType, text, opacity, scale, translateY, charCount]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [
      { scale: scale.value },
      { translateY: translateY.value },
    ],
  }));

  const typewriterStyle = useAnimatedStyle(() => {
    if (animationType !== 'typewriter') return {};
    return {
      // We need to control visibility via a clip approach; RN doesn't support
      // text slicing in animated styles, so we show full text and use opacity
      // to indicate completion. The real typewriter effect would use a JS-driven
      // interval, but for preview we approximate with a quick fade.
      opacity: charCount.value > 0 ? 1 : 0,
    };
  });

  return (
    <Animated.Text
      style={[style, animatedStyle, typewriterStyle]}
      numberOfLines={0}
    >
      {text}
    </Animated.Text>
  );
}

// ---------------------------------------------------------------------------
// TextEffects Component
// ---------------------------------------------------------------------------

export function TextEffects({ visible, onClose, onAdd }: TextEffectsProps) {
  const { t } = useTranslation();
  const tc = useThemeColors();

  const [text, setText] = useState('');
  const [selectedStyle, setSelectedStyle] = useState<TextEffect['style']>('classic');
  const [selectedColor, setSelectedColor] = useState('#FFFFFF');
  const [bgColor, setBgColor] = useState<string | undefined>(undefined);
  const [textAlignment, setTextAlignment] = useState<'left' | 'center' | 'right'>('center');
  const [textSize, setTextSize] = useState(32);
  const [animation, setAnimation] = useState<TextEffect['animation']>('none');
  const [animSheetVisible, setAnimSheetVisible] = useState(false);

  // Reset state when overlay opens
  useEffect(() => {
    if (visible) {
      setText('');
      setSelectedStyle('classic');
      setSelectedColor('#FFFFFF');
      setBgColor(undefined);
      setTextAlignment('center');
      setTextSize(32);
      setAnimation('none');
    }
  }, [visible]);

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  const handleDone = useCallback(() => {
    if (!text.trim()) return;
    const effect: TextEffect = {
      id: Date.now().toString(),
      text: text.trim(),
      style: selectedStyle,
      color: selectedColor,
      bgColor,
      fontSize: textSize,
      alignment: textAlignment,
      animation,
    };
    onAdd(effect);
  }, [text, selectedStyle, selectedColor, bgColor, textSize, textAlignment, animation, onAdd]);

  const handleToggleBg = useCallback(() => {
    setBgColor((prev) =>
      prev ? undefined : hexToRgba(selectedColor, 0.3),
    );
  }, [selectedColor]);

  const handleCycleAlignment = useCallback(() => {
    setTextAlignment((prev) => {
      const idx = ALIGNMENT_CYCLE.indexOf(prev);
      return ALIGNMENT_CYCLE[(idx + 1) % ALIGNMENT_CYCLE.length];
    });
  }, []);

  const handleCycleSize = useCallback(() => {
    setTextSize((prev) => {
      const idx = SIZE_STEPS.indexOf(prev as typeof SIZE_STEPS[number]);
      if (idx === -1) return SIZE_STEPS[0];
      return SIZE_STEPS[(idx + 1) % SIZE_STEPS.length];
    });
  }, []);

  const handleSelectAnimation = useCallback((anim: AnimationOption) => {
    setAnimation(anim);
    setAnimSheetVisible(false);
  }, []);

  // ---------------------------------------------------------------------------
  // Style computation for preview text
  // ---------------------------------------------------------------------------

  const currentPreset = STYLE_PRESETS.find((p) => p.id === selectedStyle) ?? STYLE_PRESETS[0];

  const getPreviewTextStyle = useCallback((): Record<string, unknown> => {
    const base: Record<string, unknown> = {
      color: selectedColor,
      fontSize: textSize,
      fontWeight: currentPreset.fontWeight,
      textAlign: textAlignment,
    };

    if (currentPreset.fontFamily) {
      base.fontFamily = currentPreset.fontFamily;
    }

    if (bgColor) {
      base.backgroundColor = bgColor;
      base.paddingHorizontal = spacing.md;
      base.paddingVertical = spacing.xs;
      base.borderRadius = radius.sm;
      base.overflow = 'hidden';
    }

    // Style-specific effects
    switch (selectedStyle) {
      case 'modern':
        base.textShadowColor = 'rgba(0, 0, 0, 0.3)';
        base.textShadowOffset = { width: 1, height: 1 };
        base.textShadowRadius = 3;
        break;
      case 'neon':
        base.textShadowColor = selectedColor;
        base.textShadowRadius = 10;
        base.textShadowOffset = { width: 0, height: 0 };
        break;
      case 'typewriter':
        if (!bgColor) {
          base.backgroundColor = 'rgba(0, 0, 0, 0.6)';
          base.paddingHorizontal = spacing.md;
          base.paddingVertical = spacing.xs;
          base.borderRadius = radius.sm;
          base.overflow = 'hidden';
        }
        break;
      case 'strong':
        // Multiple shadows at offsets to create a pseudo-stroke/outline
        base.textShadowColor = 'rgba(0, 0, 0, 0.8)';
        base.textShadowOffset = { width: 2, height: 2 };
        base.textShadowRadius = 1;
        break;
      case 'cursive':
        base.fontStyle = 'italic';
        base.color = selectedColor === '#FFFFFF' ? colors.goldLight : selectedColor;
        break;
    }

    return base;
  }, [selectedColor, textSize, textAlignment, currentPreset, bgColor, selectedStyle]);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  if (!visible) return null;

  return (
    <Animated.View
      entering={FadeIn.duration(200)}
      exiting={FadeOut.duration(150)}
      style={styles.overlay}
    >
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
      >
        {/* Header */}
        <View style={styles.header}>
          <Pressable onPress={onClose} hitSlop={12} style={styles.headerBtn}>
            <Text style={styles.headerBtnText}>{t('common.cancel')}</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={handleDone}
            hitSlop={12}
            style={[styles.headerBtn, !text.trim() && styles.headerBtnDisabled]}
            disabled={!text.trim()}
          >
            <Text style={[styles.headerBtnText, styles.headerDoneText, !text.trim() && styles.headerBtnDisabledText]}>
              {t('common.done')}
            </Text>
          </Pressable>
        </View>

        {/* Text preview area */}
        <View style={styles.previewArea}>
          {text.trim() ? (
            <AnimatedPreview
              text={text}
              animationType={animation}
              style={getPreviewTextStyle()}
            />
          ) : null}
          <TextInput
            style={[
              styles.textInput,
              {
                fontSize: textSize,
                fontWeight: currentPreset.fontWeight,
                textAlign: textAlignment,
                fontFamily: currentPreset.fontFamily,
                color: text.trim() ? 'transparent' : colors.text.tertiary,
              },
            ]}
            value={text}
            onChangeText={setText}
            placeholder={t('story.textEffects.placeholder')}
            placeholderTextColor={colors.text.tertiary}
            multiline
            autoFocus
            selectionColor={colors.emerald}
          />
        </View>

        {/* Bottom controls */}
        <View style={styles.controlsContainer}>
          {/* Style presets */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.presetsRow}
          >
            {STYLE_PRESETS.map((preset) => {
              const isSelected = preset.id === selectedStyle;
              return (
                <Pressable
                  accessibilityRole="button"
                  key={preset.id}
                  onPress={() => setSelectedStyle(preset.id)}
                  style={[
                    styles.presetChip, { backgroundColor: tc.surface, borderColor: tc.border },
                    isSelected && styles.presetChipSelected,
                  ]}
                >
                  <Text
                    style={[
                      styles.presetLabel,
                      isSelected && styles.presetLabelSelected,
                      preset.fontFamily ? { fontFamily: preset.fontFamily } : undefined,
                    ]}
                  >
                    {t(`story.textEffects.styles.${preset.id}`)}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>

          {/* Color picker */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.colorRow}
          >
            {TEXT_COLORS.map((clr) => {
              const isSelected = clr === selectedColor;
              return (
                <Pressable
                  accessibilityRole="button"
                  key={clr}
                  onPress={() => setSelectedColor(clr)}
                  style={[
                    styles.colorSwatch,
                    { backgroundColor: clr },
                    isSelected && styles.colorSwatchSelected,
                    clr === '#000000' && [styles.colorSwatchDark, { borderColor: tc.border }],
                  ]}
                >
                  {isSelected && (
                    <Icon
                      name="check"
                      size={14}
                      color={clr === '#FFFFFF' || clr === '#FFA657' ? '#000000' : '#FFFFFF'}
                    />
                  )}
                </Pressable>
              );
            })}
          </ScrollView>

          {/* Toolbar */}
          <View style={styles.toolbar}>
            {/* BG toggle */}
            <Pressable onPress={handleToggleBg} style={styles.toolBtn}>
              <View style={[styles.toolBtnInner, { backgroundColor: tc.surface }, bgColor ? styles.toolBtnActive : undefined]}>
                <Text style={[styles.toolBtnLabel, bgColor ? styles.toolBtnLabelActive : undefined]}>
                  {t('story.textEffects.bg')}
                </Text>
              </View>
            </Pressable>

            {/* Alignment */}
            <Pressable onPress={handleCycleAlignment} style={styles.toolBtn}>
              <View style={[styles.toolBtnInner, { backgroundColor: tc.surface }]}>
                <Icon name={getAlignmentIcon(textAlignment)} size="sm" color={colors.text.primary} />
              </View>
            </Pressable>

            {/* Font size */}
            <Pressable onPress={handleCycleSize} style={styles.toolBtn}>
              <View style={[styles.toolBtnInner, { backgroundColor: tc.surface }]}>
                <Text style={styles.toolSizeLabel}>{getSizeLabel(textSize)}</Text>
              </View>
            </Pressable>

            {/* Animation */}
            <Pressable onPress={() => setAnimSheetVisible(true)} style={styles.toolBtn}>
              <View style={[styles.toolBtnInner, { backgroundColor: tc.surface }, animation !== 'none' ? styles.toolBtnActive : undefined]}>
                <Icon name="play" size="sm" color={animation !== 'none' ? colors.emerald : colors.text.primary} />
              </View>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>

      {/* Animation picker bottom sheet */}
      <BottomSheet visible={animSheetVisible} onClose={() => setAnimSheetVisible(false)}>
        {ANIMATION_OPTIONS.map((opt) => (
          <BottomSheetItem
            key={opt.id}
            label={t(`story.textEffects.animations.${opt.id}`)}
            icon={<Icon name={opt.iconName} size="sm" color={animation === opt.id ? colors.emerald : colors.text.primary} />}
            onPress={() => handleSelectAnimation(opt.id)}
          />
        ))}
      </BottomSheet>
    </Animated.View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    zIndex: 100,
  },
  container: {
    flex: 1,
  },
  // Header
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.base,
    paddingTop: spacing.xl,
    paddingBottom: spacing.sm,
  },
  headerBtn: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xs,
  },
  headerBtnText: {
    color: colors.text.primary,
    fontSize: fontSizes.base,
  },
  headerDoneText: {
    color: colors.emerald,
    fontWeight: '600',
  },
  headerBtnDisabled: {
    opacity: 0.4,
  },
  headerBtnDisabledText: {
    color: colors.text.tertiary,
  },
  // Preview area
  previewArea: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    position: 'relative',
  },
  textInput: {
    position: 'absolute',
    top: 0,
    start: spacing.xl,
    end: spacing.xl,
    bottom: 0,
    textAlignVertical: 'center',
    padding: spacing.base,
  },
  // Controls container
  controlsContainer: {
    paddingBottom: spacing['2xl'],
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  // Style presets row
  presetsRow: {
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    gap: spacing.sm,
  },
  presetChip: {
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.dark.border,
    backgroundColor: colors.dark.surface,
  },
  presetChipSelected: {
    borderColor: colors.emerald,
    backgroundColor: 'rgba(10, 123, 79, 0.2)',
  },
  presetLabel: {
    color: colors.text.secondary,
    fontSize: fontSizes.sm,
  },
  presetLabelSelected: {
    color: colors.emerald,
    fontWeight: '600',
  },
  // Color row
  colorRow: {
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
    alignItems: 'center',
  },
  colorSwatch: {
    width: 28,
    height: 28,
    borderRadius: radius.full,
    justifyContent: 'center',
    alignItems: 'center',
  },
  colorSwatchSelected: {
    borderWidth: 2,
    borderColor: colors.text.primary,
  },
  colorSwatchDark: {
    borderWidth: 1,
    borderColor: colors.dark.border,
  },
  // Toolbar
  toolbar: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingHorizontal: spacing.base,
    paddingTop: spacing.md,
  },
  toolBtn: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  toolBtnInner: {
    width: 44,
    height: 44,
    borderRadius: radius.full,
    backgroundColor: colors.dark.surface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  toolBtnActive: {
    backgroundColor: 'rgba(10, 123, 79, 0.2)',
    borderWidth: 1,
    borderColor: colors.emerald,
  },
  toolBtnLabel: {
    color: colors.text.primary,
    fontSize: fontSizes.xs,
    fontWeight: '700',
  },
  toolBtnLabelActive: {
    color: colors.emerald,
  },
  toolSizeLabel: {
    color: colors.text.primary,
    fontSize: fontSizes.base,
    fontWeight: '700',
  },
});

export default TextEffects;
