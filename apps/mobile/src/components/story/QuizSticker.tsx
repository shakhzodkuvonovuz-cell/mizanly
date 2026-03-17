import { useState, useEffect } from 'react';
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
} from 'react-native-reanimated';
import { colors, spacing, fontSize, radius, animation } from '@/theme';
import { Icon } from '@/components/ui/Icon';

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

export function QuizSticker({ data, onResponse, isCreator = false, style }: QuizStickerProps) {
  const [selectedOptionId, setSelectedOptionId] = useState<string | null>(null);
  const [hasAnswered, setHasAnswered] = useState(false);
  const [showExplanation, setShowExplanation] = useState(false);
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
  const confetti = useSharedValue(0);

  const handleOptionPress = (optionId: string) => {
    if (hasAnswered || isCreator) return;

    setSelectedOptionId(optionId);
    setHasAnswered(true);

    const correct = optionId === correctOptionId;
    if (!correct) {
      // Shake animation for wrong answer
      shake.value = withSequence(
        withTiming(10, { duration: 100 }),
        withTiming(-10, { duration: 100 }),
        withTiming(10, { duration: 100 }),
        withTiming(0, { duration: 100 }),
      );
    } else {
      // Confetti placeholder animation (scale up)
      confetti.value = withSpring(1.2, animation.spring.bouncy, () => {
        confetti.value = withSpring(1, animation.spring.gentle);
      });
    }

    // Notify parent
    if (onResponse) {
      onResponse(optionId, correct);
    }
  };

  const shakeStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: shake.value }],
  }));

  const confettiStyle = useAnimatedStyle(() => ({
    transform: [{ scale: confetti.value }],
  }));

  const renderOption = (option: QuizOption) => {
    const isSelected = selectedOptionId === option.id;
    const showCorrect = hasAnswered && option.isCorrect;
    const showWrong = hasAnswered && isSelected && !option.isCorrect;

    return (
      <AnimatedPressable
        key={option.id}
        style={[
          styles.option,
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
        <Animated.View style={[styles.feedbackContainer, confettiStyle]}>
          <Text style={isCorrect ? styles.correctText : styles.wrongText}>
            {isCorrect ? 'Correct! 🎉' : 'Not quite!'}
          </Text>
          {data.explanation && (
            <Pressable onPress={() => setShowExplanation(!showExplanation)}>
              <Text style={styles.explanationToggle}>
                {showExplanation ? 'Hide explanation' : 'Show explanation'}
              </Text>
            </Pressable>
          )}
          {showExplanation && data.explanation && (
            <Text style={styles.explanation}>
              {data.explanation}
            </Text>
          )}
        </Animated.View>
      )}

      {isCreator && (
        <View style={styles.creatorBadge}>
          <Icon name="eye" size="xs" color={colors.text.secondary} />
          <Text style={styles.creatorText}>Creator view</Text>
        </View>
      )}
    </View>
  );
}

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
    marginLeft: spacing.md,
  },
  feedbackContainer: {
    backgroundColor: colors.dark.bgCard,
    borderRadius: radius.md,
    padding: spacing.md,
    marginTop: spacing.md,
    alignItems: 'center',
  },
  correctText: {
    color: colors.success,
    fontSize: fontSize.md,
    fontWeight: '700',
    marginBottom: spacing.xs,
  },
  wrongText: {
    color: colors.error,
    fontSize: fontSize.md,
    fontWeight: '700',
    marginBottom: spacing.xs,
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