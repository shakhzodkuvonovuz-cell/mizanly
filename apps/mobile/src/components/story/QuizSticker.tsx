import { useState, useEffect, memo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  StyleProp,
  ViewStyle,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withSequence,
  withTiming,
  withDelay,
  Easing,
  FadeIn,
} from 'react-native-reanimated';
import { colors, spacing, fontSize, radius, animation, fonts } from '@/theme';
import { useThemeColors } from '@/hooks/useThemeColors';
import { useTranslation } from '@/hooks/useTranslation';
import { useContextualHaptic } from '@/hooks/useContextualHaptic';
import { Icon } from '@/components/ui/Icon';

// ── Confetti: ticker-tape particles with gravity, rotation, varied shapes ──
const CONFETTI_COLORS = [colors.emerald, colors.gold, colors.extended.blue, colors.extended.purple, colors.extended.orangeLight, colors.extended.greenBright];
const CONFETTI_COUNT = 24;

// Pre-compute random values per particle (deterministic from index)
function seedRandom(index: number) {
  const a = Math.sin(index * 9301 + 49297) * 49297;
  return a - Math.floor(a);
}

function ConfettiPiece({ index, isActive }: { index: number; isActive: boolean }) {
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const rotate = useSharedValue(0);
  const opacity = useSharedValue(0);

  // Deterministic random values for this particle
  const rand = seedRandom(index);
  const rand2 = seedRandom(index + 100);
  const rand3 = seedRandom(index + 200);

  // Spread angle: full circle with some randomness
  const baseAngle = (index / CONFETTI_COUNT) * Math.PI * 2;
  const angle = baseAngle + (rand - 0.5) * 0.6;

  // Burst distance varies
  const burstDistance = 50 + rand2 * 60;

  // Gravity fall distance
  const gravityDrop = 80 + rand3 * 40;

  // Varied dimensions: some wide rectangles, some thin strips, some squares
  const isWide = index % 3 === 0;
  const isThin = index % 3 === 1;
  const particleW = isWide ? 10 : isThin ? 4 : 7;
  const particleH = isWide ? 5 : isThin ? 10 : 7;
  const particleRadius = index % 4 === 0 ? particleW / 2 : 1; // some circles, mostly rectangles

  const color = CONFETTI_COLORS[index % CONFETTI_COLORS.length];

  useEffect(() => {
    if (isActive) {
      const delay = index * 15; // Fast stagger

      // Burst outward
      opacity.value = withDelay(delay, withTiming(1, { duration: 80 }));

      translateX.value = withDelay(delay, withSequence(
        // Phase 1: burst outward (fast)
        withTiming(Math.cos(angle) * burstDistance, { duration: 250, easing: Easing.out(Easing.cubic) }),
        // Phase 2: drift with air resistance
        withTiming(Math.cos(angle) * burstDistance + (rand - 0.5) * 30, { duration: 600, easing: Easing.inOut(Easing.ease) }),
      ));

      translateY.value = withDelay(delay, withSequence(
        // Phase 1: burst upward-outward
        withTiming(Math.sin(angle) * burstDistance - 30, { duration: 250, easing: Easing.out(Easing.cubic) }),
        // Phase 2: gravity pulls down (the "fall")
        withTiming(Math.sin(angle) * burstDistance + gravityDrop, { duration: 700, easing: Easing.in(Easing.quad) }),
      ));

      // Tumbling rotation
      rotate.value = withDelay(delay,
        withTiming((rand - 0.5) * 720, { duration: 950, easing: Easing.out(Easing.ease) })
      );

      // Fade out near the end
      opacity.value = withDelay(delay, withSequence(
        withTiming(1, { duration: 80 }),
        withDelay(650, withTiming(0, { duration: 300, easing: Easing.in(Easing.ease) })),
      ));
    }
  }, [isActive, index, angle, burstDistance, gravityDrop, rand, opacity, translateX, translateY, rotate]);

  const pieceStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { rotate: `${rotate.value}deg` },
    ],
    opacity: opacity.value,
  }));

  return (
    <Animated.View style={[
      {
        position: 'absolute',
        width: particleW,
        height: particleH,
        borderRadius: particleRadius,
        backgroundColor: color,
      },
      pieceStyle,
    ]} />
  );
}

export interface QuizOption {
  id: string;
  text: string;
  isCorrect: boolean;
}

export interface QuizStickerData {
  question: string;
  options: QuizOption[];
  explanation?: string;
}

interface QuizStickerProps {
  data: QuizStickerData;
  onResponse?: (optionId: string, isCorrect: boolean) => void;
  isCreator?: boolean;
  style?: StyleProp<ViewStyle>;
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export const QuizSticker = memo(function QuizSticker({ data, onResponse, isCreator = false, style }: QuizStickerProps) {
  const tc = useThemeColors();
  const { t } = useTranslation();
  const haptic = useContextualHaptic();
  const [selectedOptionId, setSelectedOptionId] = useState<string | null>(null);
  const [hasAnswered, setHasAnswered] = useState(false);
  const [showExplanation, setShowExplanation] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);
  const correctOptionId = data.options.find(opt => opt.isCorrect)?.id;
  const isCorrect = selectedOptionId === correctOptionId;

  // Creator sees results immediately
  useEffect(() => {
    if (isCreator) {
      setHasAnswered(true);
      setSelectedOptionId(correctOptionId || null);
    }
  }, [isCreator, correctOptionId]);

  const shake = useSharedValue(0);
  const feedbackScale = useSharedValue(0);

  const handleOptionPress = (optionId: string) => {
    if (hasAnswered || isCreator) return;

    setSelectedOptionId(optionId);
    setHasAnswered(true);

    const correct = optionId === correctOptionId;
    if (!correct) {
      haptic.error();
      // Shake animation for wrong answer
      shake.value = withSequence(
        withTiming(10, { duration: 80 }),
        withTiming(-10, { duration: 80 }),
        withTiming(8, { duration: 70 }),
        withTiming(-8, { duration: 70 }),
        withTiming(0, { duration: 60 }),
      );
    } else {
      haptic.success();
      setShowConfetti(true);
      // Scale bounce on correct
      feedbackScale.value = withSpring(1, animation.spring.bouncy);
    }

    // Notify parent
    if (onResponse) {
      onResponse(optionId, correct);
    }
  };

  const shakeStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: shake.value }],
  }));

  const feedbackStyle = useAnimatedStyle(() => ({
    transform: [{ scale: feedbackScale.value }],
  }));

  const renderOption = (option: QuizOption) => {
    const isSelected = selectedOptionId === option.id;
    const showCorrect = hasAnswered && option.isCorrect;
    const showWrong = hasAnswered && isSelected && !option.isCorrect;

    return (
      <AnimatedPressable
        key={option.id}
        style={[
          styles.option, { backgroundColor: tc.bgElevated },
          isSelected && styles.optionSelected,
          showCorrect && styles.optionCorrect,
          showWrong && styles.optionWrong,
        ]}
        onPress={() => handleOptionPress(option.id)}
        disabled={hasAnswered || isCreator}
        accessibilityLabel={`Answer: ${option.text}`}
        accessibilityRole="button"
      >
        <Text style={styles.optionText} numberOfLines={2}>
          {option.text}
        </Text>
        <View style={styles.iconContainer}>
          {showCorrect && (
            <Icon name="check-circle" size="sm" color={colors.success} />
          )}
          {showWrong && (
            <Icon name="x" size="sm" color={colors.error} />
          )}
        </View>
      </AnimatedPressable>
    );
  };

  return (
    <View style={[styles.container, style]}>
      <Animated.View style={[styles.questionContainer, shakeStyle]}>
        <Text style={styles.question}>{data.question}</Text>
      </Animated.View>

      <View style={styles.optionsContainer}>
        {data.options.map(renderOption)}
      </View>

      {hasAnswered && (
        <Animated.View style={[styles.feedbackContainer, { backgroundColor: tc.bgCard }]}>
          {/* Ticker-tape confetti burst on correct answer */}
          {showConfetti && (
            <View style={styles.confettiContainer}>
              {Array.from({ length: CONFETTI_COUNT }, (_, i) => (
                <ConfettiPiece key={i} index={i} isActive={showConfetti} />
              ))}
            </View>
          )}
          <Animated.View style={feedbackStyle}>
            <View style={styles.feedbackRow}>
              <Icon
                name={isCorrect ? 'check-circle' : 'x'}
                size="md"
                color={isCorrect ? colors.success : colors.error}
              />
              <Text style={isCorrect ? styles.correctText : styles.wrongText}>
                {isCorrect
                  ? t('stories.quizCorrect', { defaultValue: 'Correct!' })
                  : t('stories.quizWrong', { defaultValue: 'Not quite!' })}
              </Text>
            </View>
          </Animated.View>
          {data.explanation && (
            <Pressable
              onPress={() => setShowExplanation(!showExplanation)}
              accessibilityRole="button"
              accessibilityLabel={showExplanation
                ? t('stories.hideExplanation', { defaultValue: 'Hide explanation' })
                : t('stories.showExplanation', { defaultValue: 'Show explanation' })}
            >
              <Text style={styles.explanationToggle}>
                {showExplanation
                  ? t('stories.hideExplanation', { defaultValue: 'Hide explanation' })
                  : t('stories.showExplanation', { defaultValue: 'Show explanation' })}
              </Text>
            </Pressable>
          )}
          {showExplanation && data.explanation && (
            <Animated.Text entering={FadeIn.duration(200)} style={styles.explanation}>
              {data.explanation}
            </Animated.Text>
          )}
        </Animated.View>
      )}

      {isCreator && (
        <View style={styles.creatorBadge}>
          <Icon name="eye" size="xs" color={colors.text.secondary} />
          <Text style={styles.creatorText}>
            {t('stories.creatorView', { defaultValue: 'Creator view' })}
          </Text>
        </View>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.glass.darkHeavy,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.glass.border,
    width: 280,
    maxWidth: '100%',
  },
  questionContainer: {
    marginBottom: spacing.lg,
  },
  question: {
    color: colors.text.primary,
    fontSize: fontSize.md,
    fontWeight: '700',
    textAlign: 'center',
  },
  optionsContainer: {
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  option: {
    backgroundColor: colors.dark.bgElevated,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  optionSelected: {
    borderColor: colors.emerald,
  },
  optionCorrect: {
    backgroundColor: colors.active.emerald10,
    borderColor: colors.success,
  },
  optionWrong: {
    backgroundColor: colors.active.error10,
    borderColor: colors.error,
  },
  optionText: {
    color: colors.text.primary,
    fontSize: fontSize.base,
    fontWeight: '500',
    flex: 1,
  },
  iconContainer: {
    marginStart: spacing.md,
  },
  feedbackContainer: {
    backgroundColor: colors.dark.bgCard,
    borderRadius: radius.md,
    padding: spacing.md,
    marginTop: spacing.md,
    alignItems: 'center',
    overflow: 'visible',
  },
  confettiContainer: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    width: 0,
    height: 0,
    zIndex: 10,
  },
  feedbackRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.xs,
  },
  correctText: {
    color: colors.success,
    fontSize: fontSize.md,
    fontFamily: fonts.bodyBold,
    fontWeight: '700',
  },
  wrongText: {
    color: colors.error,
    fontSize: fontSize.md,
    fontFamily: fonts.bodyBold,
    fontWeight: '700',
  },
  explanationToggle: {
    color: colors.emerald,
    fontSize: fontSize.sm,
    fontWeight: '600',
    marginTop: spacing.xs,
  },
  explanation: {
    color: colors.text.secondary,
    fontSize: fontSize.sm,
    marginTop: spacing.md,
    textAlign: 'center',
    lineHeight: 18,
  },
  creatorBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    marginTop: spacing.md,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.active.white5,
    borderRadius: radius.full,
    alignSelf: 'center',
  },
  creatorText: {
    color: colors.text.secondary,
    fontSize: fontSize.xs,
  },
});