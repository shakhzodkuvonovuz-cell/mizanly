import { useState, useEffect, useCallback } from 'react';
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
  withTiming,
} from 'react-native-reanimated';
import { colors, spacing, fontSize, radius } from '@/theme';
import { useThemeColors } from '@/hooks/useThemeColors';
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
  style?: StyleProp<ViewStyle>;
}

function PollOptionRow({
  option,
  isSelected,
  showResults,
  percentage,
  onPress,
}: {
  option: PollOption;
  isSelected: boolean;
  showResults: boolean;
  percentage: number;
  onPress: () => void;
}) {
  const tc = useThemeColors();
  const fillWidth = useSharedValue(0);

  useEffect(() => {
    if (showResults) {
      fillWidth.value = withTiming(percentage, { duration: 400 });
    }
  }, [showResults, percentage, fillWidth]);

  const barStyle = useAnimatedStyle(() => ({
    width: `${fillWidth.value}%`,
  }));

  return (
    <Pressable
      style={[styles.optionWrapper, isSelected && styles.optionSelected]}
      onPress={onPress}
      disabled={showResults}
      accessibilityLabel={`Option: ${option.text}`}
      accessibilityRole="button"
    >
      <View style={[styles.optionBackground, { backgroundColor: tc.bgElevated }]}>
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
}

export function PollSticker({ data, onResponse, isCreator = false, style }: PollStickerProps) {
  const tc = useThemeColors();
  const [selectedOptionId, setSelectedOptionId] = useState<string | null>(null);
  const [hasVoted, setHasVoted] = useState(false);
  const [localOptions, setLocalOptions] = useState<PollOption[]>(data.options);

  // If creator, show results immediately
  useEffect(() => {
    if (isCreator) {
      setHasVoted(true);
    }
  }, [isCreator]);

  const handleOptionPress = useCallback((optionId: string) => {
    if (hasVoted || isCreator) return;

    setSelectedOptionId(optionId);
    setHasVoted(true);

    // Update local votes for immediate feedback
    setLocalOptions(prev =>
      prev.map(opt =>
        opt.id === optionId ? { ...opt, votes: (opt.votes || 0) + 1 } : opt
      )
    );

    // Notify parent
    if (onResponse) {
      onResponse(optionId);
    }
  }, [hasVoted, isCreator, onResponse]);

  const getOptionPercentage = useCallback((option: PollOption) => {
    const total = data.totalVotes + (hasVoted && !isCreator ? 1 : 0);
    if (total === 0) return 0;
    return ((option.votes || 0) / total) * 100;
  }, [data.totalVotes, hasVoted, isCreator]);

  const showResults = hasVoted || isCreator;

  return (
    <View style={[styles.container, style]}>
      <Text style={styles.question}>{data.question}</Text>
      <View style={styles.optionsContainer}>
        {localOptions.map((opt) => (
          <PollOptionRow
            key={opt.id}
            option={opt}
            isSelected={selectedOptionId === opt.id}
            showResults={showResults}
            percentage={getOptionPercentage(opt)}
            onPress={() => handleOptionPress(opt.id)}
          />
        ))}
      </View>
      <View style={[styles.footer, { borderTopColor: tc.borderLight }]}>
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