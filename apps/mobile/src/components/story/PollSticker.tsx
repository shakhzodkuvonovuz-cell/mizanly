import { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  TouchableOpacity,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  runOnJS,
} from 'react-native-reanimated';
import { colors, spacing, fontSize, radius, animation } from '@/theme';
import { Icon } from '@/components/ui/Icon';

export interface PollOption {
  id: string;
  text: string;
  votes?: number;
}

export interface PollStickerData {
  question: string;
  options: PollOption[];
  totalVotes: number;
  expiresAt?: Date;
}

interface PollStickerProps {
  data: PollStickerData;
  onResponse?: (optionId: string) => void;
  isCreator?: boolean;
  style?: any;
}

const AnimatedTouchable = Animated.createAnimatedComponent(TouchableOpacity);

export function PollSticker({ data, onResponse, isCreator = false, style }: PollStickerProps) {
  const [selectedOptionId, setSelectedOptionId] = useState<string | null>(null);
  const [hasVoted, setHasVoted] = useState(false);
  const [localOptions, setLocalOptions] = useState<PollOption[]>(data.options);

  // If creator, show results immediately
  useEffect(() => {
    if (isCreator) {
      setHasVoted(true);
    }
  }, [isCreator]);

  const optionHeights = localOptions.map(() => useSharedValue(0));

  const handleOptionPress = (optionId: string) => {
    if (hasVoted || isCreator) return;

    setSelectedOptionId(optionId);
    setHasVoted(true);

    // Update local votes for immediate feedback
    const updated = localOptions.map(opt =>
      opt.id === optionId ? { ...opt, votes: (opt.votes || 0) + 1 } : opt
    );
    setLocalOptions(updated);

    // Trigger animation
    updated.forEach((opt, index) => {
      const percentage = data.totalVotes > 0
        ? ((opt.votes || 0) / (data.totalVotes + 1)) * 100
        : opt.id === optionId ? 100 : 0;
      optionHeights[index].value = withSpring(percentage, animation.spring.snappy);
    });

    // Notify parent
    if (onResponse) {
      onResponse(optionId);
    }
  };

  const getOptionPercentage = (option: PollOption) => {
    const total = data.totalVotes + (hasVoted && !isCreator ? 1 : 0);
    if (total === 0) return 0;
    return ((option.votes || 0) / total) * 100;
  };

  const renderOption = (option: PollOption, index: number) => {
    const percentage = getOptionPercentage(option);
    const isSelected = selectedOptionId === option.id;
    const showResults = hasVoted || isCreator;

    const barStyle = useAnimatedStyle(() => ({
      width: `${showResults ? percentage : 0}%`,
    }));

    return (
      <Pressable
        key={option.id}
        style={[styles.optionWrapper, isSelected && styles.optionSelected]}
        onPress={() => handleOptionPress(option.id)}
        disabled={showResults}
        accessibilityLabel={`Option: ${option.text}`}
        accessibilityRole="button"
      >
        <View style={styles.optionBackground}>
          <Animated.View style={[styles.optionFill, barStyle]} />
          <Text style={styles.optionText} numberOfLines={2}>
            {option.text}
          </Text>
          {showResults && (
            <Text style={styles.percentageText}>
              {Math.round(percentage)}%
            </Text>
          )}
        </View>
      </Pressable>
    );
  };

  return (
    <View style={[styles.container, style]}>
      <Text style={styles.question}>{data.question}</Text>
      <View style={styles.optionsContainer}>
        {localOptions.map((opt, idx) => renderOption(opt, idx))}
      </View>
      <View style={styles.footer}>
        <Text style={styles.voteCount}>
          {data.totalVotes + (hasVoted && !isCreator ? 1 : 0)} votes
        </Text>
        {data.expiresAt && (
          <View style={styles.expiryRow}>
            <Icon name="clock" size="xs" color={colors.text.tertiary} />
            <Text style={styles.expiryText}>
              Ends {new Date(data.expiresAt).toLocaleDateString()}
            </Text>
          </View>
        )}
      </View>
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
    backdropFilter: 'blur(20px)',
  },
  question: {
    color: colors.text.primary,
    fontSize: fontSize.md,
    fontWeight: '600',
    marginBottom: spacing.lg,
    textAlign: 'center',
  },
  optionsContainer: {
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  optionWrapper: {
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  optionSelected: {
    borderWidth: 1,
    borderColor: colors.emerald,
  },
  optionBackground: {
    backgroundColor: colors.dark.bgElevated,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    overflow: 'hidden',
    position: 'relative',
  },
  optionFill: {
    position: 'absolute',
    top: 0,
    left: 0,
    bottom: 0,
    backgroundColor: colors.active.emerald20,
  },
  optionText: {
    color: colors.text.primary,
    fontSize: fontSize.base,
    fontWeight: '500',
    flex: 1,
    zIndex: 1,
  },
  percentageText: {
    color: colors.emerald,
    fontSize: fontSize.sm,
    fontWeight: '700',
    marginLeft: spacing.md,
    zIndex: 1,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: colors.dark.borderLight,
    paddingTop: spacing.md,
  },
  voteCount: {
    color: colors.text.secondary,
    fontSize: fontSize.sm,
  },
  expiryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  expiryText: {
    color: colors.text.tertiary,
    fontSize: fontSize.xs,
  },
});