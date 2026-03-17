import { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  PanResponder,
  Dimensions,
  StyleProp,
  ViewStyle,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  runOnJS,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, spacing, fontSize, radius, animation } from '@/theme';
import { Icon } from '@/components/ui/Icon';

export interface SliderStickerData {
  emoji: string;
  question: string;
  minValue?: number;
  maxValue?: number;
  averageValue?: number; // from all responses
  totalResponses?: number;
}

interface SliderStickerProps {
  data: SliderStickerData;
  onResponse?: (value: number) => void;
  isCreator?: boolean;
  style?: StyleProp<ViewStyle>;
}

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const SLIDER_WIDTH = 240;
const SLIDER_HEIGHT = 40;
const THUMB_SIZE = 48;

export function SliderSticker({ data, onResponse, isCreator = false, style }: SliderStickerProps) {
  const min = data.minValue ?? 0;
  const max = data.maxValue ?? 100;
  const initialAverage = data.averageValue ?? (min + max) / 2;
  const totalResponses = data.totalResponses ?? 0;

  const [value, setValue] = useState(initialAverage);
  const [hasSubmitted, setHasSubmitted] = useState(false);
  const [isSliding, setIsSliding] = useState(false);
  const [showAverage, setShowAverage] = useState(false);

  const sliderPos = useSharedValue((initialAverage - min) / (max - min) * SLIDER_WIDTH);
  const thumbScale = useSharedValue(1);
  const averagePos = useSharedValue((initialAverage - min) / (max - min) * SLIDER_WIDTH);

  // Update average position when data changes
  useEffect(() => {
    const avg = data.averageValue ?? initialAverage;
    averagePos.value = withSpring((avg - min) / (max - min) * SLIDER_WIDTH, animation.spring.snappy);
  }, [data.averageValue, min, max, initialAverage, averagePos]);

  const startX = useRef(0);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => !hasSubmitted && !isCreator,
      onMoveShouldSetPanResponder: () => !hasSubmitted && !isCreator,
      onPanResponderGrant: () => {
        startX.current = sliderPos.value;
        thumbScale.value = withSpring(1.2, animation.spring.bouncy);
        setIsSliding(true);
      },
      onPanResponderMove: (_, gestureState) => {
        let newX = startX.current + gestureState.dx;
        if (newX < 0) newX = 0;
        if (newX > SLIDER_WIDTH) newX = SLIDER_WIDTH;
        sliderPos.value = newX;
        const newValue = min + (newX / SLIDER_WIDTH) * (max - min);
        runOnJS(setValue)(Math.round(newValue));
      },
      onPanResponderRelease: (_, gestureState) => {
        let newX = startX.current + gestureState.dx;
        if (newX < 0) newX = 0;
        if (newX > SLIDER_WIDTH) newX = SLIDER_WIDTH;
        sliderPos.value = withSpring(newX, animation.spring.snappy);
        thumbScale.value = withSpring(1, animation.spring.gentle);
        setIsSliding(false);

        const newValue = min + (newX / SLIDER_WIDTH) * (max - min);
        const rounded = Math.round(newValue);
        setValue(rounded);

        if (!hasSubmitted && !isCreator) {
          setHasSubmitted(true);
          setShowAverage(true);
          if (onResponse) {
            onResponse(rounded);
          }
        }
      },
    })
  ).current;

  const sliderStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: sliderPos.value }],
  }));

  const thumbStyle = useAnimatedStyle(() => ({
    transform: [{ scale: thumbScale.value }],
  }));

  const averageStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: averagePos.value }],
  }));

  const fillWidthStyle = useAnimatedStyle(() => ({
    width: sliderPos.value,
  }));

  return (
    <View style={[styles.container, style]}>
      <View style={styles.header}>
        <Text style={styles.emoji}>{data.emoji}</Text>
        <Text style={styles.question}>{data.question}</Text>
      </View>

      <View style={styles.sliderContainer}>
        {/* Track background */}
        <View style={styles.track}>
          <Animated.View style={[styles.fill, fillWidthStyle]}>
            <LinearGradient
              colors={[colors.emerald, colors.gold]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={StyleSheet.absoluteFill}
            />
          </Animated.View>
        </View>

        {/* Average indicator (visible after submission or creator view) */}
        {(hasSubmitted || isCreator) && (
          <Animated.View style={[styles.averageIndicator, averageStyle]}>
            <View style={styles.averageLine} />
            <Text style={styles.averageLabel}>Avg</Text>
          </Animated.View>
        )}

        {/* Thumb */}
        <Animated.View
          style={[styles.thumb, thumbStyle, sliderStyle]}
          {...panResponder.panHandlers}
        >
          <View style={styles.thumbInner}>
            <Text style={styles.thumbEmoji}>{data.emoji}</Text>
          </View>
        </Animated.View>
      </View>

      {/* Value display */}
      <View style={styles.valueContainer}>
        <Text style={styles.valueLabel}>
          {isSliding ? 'Slide to answer' : hasSubmitted ? 'Your answer' : 'Drag the emoji'}
        </Text>
        <Text style={styles.valueNumber}>{value}</Text>
      </View>

      {/* Footer with stats */}
      <View style={styles.footer}>
        <Text style={styles.minMax}>
          {min} – {max}
        </Text>
        {hasSubmitted || isCreator ? (
          <View style={styles.stats}>
            <Icon name="users" size="xs" color={colors.text.tertiary} />
            <Text style={styles.statsText}>
              {totalResponses + (hasSubmitted && !isCreator ? 1 : 0)} responses
            </Text>
            <Text style={styles.averageText}>
              Avg: {data.averageValue ?? initialAverage}
            </Text>
          </View>
        ) : (
          <Text style={styles.hint}>Release to submit</Text>
        )}
      </View>

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
    width: 300,
    maxWidth: '100%',
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  emoji: {
    fontSize: fontSize.xl,
  },
  question: {
    color: colors.text.primary,
    fontSize: fontSize.md,
    fontWeight: '600',
    flex: 1,
  },
  sliderContainer: {
    width: SLIDER_WIDTH,
    height: SLIDER_HEIGHT,
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  track: {
    width: '100%',
    height: 8,
    backgroundColor: colors.dark.bgElevated,
    borderRadius: radius.full,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: radius.full,
    overflow: 'hidden',
  },
  thumb: {
    position: 'absolute',
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: radius.full,
    backgroundColor: colors.dark.bgCard,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: colors.emerald,
    shadowColor: colors.emerald,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 8,
    left: -THUMB_SIZE / 2,
  },
  thumbInner: {
    width: THUMB_SIZE - 10,
    height: THUMB_SIZE - 10,
    borderRadius: (THUMB_SIZE - 10) / 2,
    backgroundColor: colors.dark.bgElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumbEmoji: {
    fontSize: fontSize.lg,
  },
  averageIndicator: {
    position: 'absolute',
    alignItems: 'center',
    top: -20,
    left: -10,
  },
  averageLine: {
    width: 2,
    height: 30,
    backgroundColor: colors.gold,
    marginBottom: 2,
  },
  averageLabel: {
    color: colors.gold,
    fontSize: fontSize.xs,
    fontWeight: '700',
  },
  valueContainer: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'center',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  valueLabel: {
    color: colors.text.secondary,
    fontSize: fontSize.sm,
  },
  valueNumber: {
    color: colors.emerald,
    fontSize: fontSize['2xl'],
    fontWeight: '800',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
    borderTopWidth: 1,
    borderTopColor: colors.dark.borderLight,
    paddingTop: spacing.md,
  },
  minMax: {
    color: colors.text.tertiary,
    fontSize: fontSize.sm,
  },
  stats: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  statsText: {
    color: colors.text.tertiary,
    fontSize: fontSize.xs,
  },
  averageText: {
    color: colors.gold,
    fontSize: fontSize.xs,
    fontWeight: '600',
    marginLeft: spacing.sm,
  },
  hint: {
    color: colors.text.tertiary,
    fontSize: fontSize.xs,
    fontStyle: 'italic',
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