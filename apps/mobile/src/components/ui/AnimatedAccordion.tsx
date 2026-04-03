import { useState, useCallback, useRef } from 'react';
import { View, Text, Pressable, StyleSheet, LayoutChangeEvent } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  interpolate,
  Extrapolation,
} from 'react-native-reanimated';
import { Icon } from '@/components/ui/Icon';
import { colors, spacing, fontSize, radius, fonts, animation } from '@/theme';
import { useThemeColors } from '@/hooks/useThemeColors';
import { useContextualHaptic } from '@/hooks/useContextualHaptic';

type IconName = React.ComponentProps<typeof Icon>['name'];

interface AnimatedAccordionProps {
  /** Icon shown in the header row */
  icon: IconName;
  /** Icon color */
  iconColor?: string;
  /** Title text */
  title: string;
  /** Optional subtitle/value shown on right side when collapsed */
  subtitle?: string;
  /** Whether the section starts expanded */
  defaultExpanded?: boolean;
  /** Active indicator (e.g., has alt text, has tagged users) */
  isActive?: boolean;
  /** The content to show when expanded */
  children: React.ReactNode;
}

/**
 * Animated accordion section — smooth height animation using Reanimated.
 * Measures content height on layout, animates between 0 and measured height.
 * Spring-based for natural feel.
 */
export function AnimatedAccordion({
  icon,
  iconColor,
  title,
  subtitle,
  defaultExpanded = false,
  isActive = false,
  children,
}: AnimatedAccordionProps) {
  const tc = useThemeColors();
  const haptic = useContextualHaptic();
  const [expanded, setExpanded] = useState(defaultExpanded);
  const contentHeight = useRef(0);
  const animatedHeight = useSharedValue(defaultExpanded ? 1 : 0);
  const chevronRotate = useSharedValue(defaultExpanded ? 1 : 0);
  const headerScale = useSharedValue(1);

  const toggle = useCallback(() => {
    haptic.tick();
    const next = !expanded;
    setExpanded(next);
    animatedHeight.value = withSpring(next ? 1 : 0, {
      damping: 20,
      mass: 1,
      stiffness: 180,
      overshootClamping: false,
    });
    chevronRotate.value = withSpring(next ? 1 : 0, {
      damping: 15,
      stiffness: 200,
    });
  }, [expanded, animatedHeight, chevronRotate, haptic]);

  const onContentLayout = useCallback((e: LayoutChangeEvent) => {
    const h = e.nativeEvent.layout.height;
    if (h > 0) contentHeight.current = h;
  }, []);

  // [W12-C01#35] Use 0 instead of 300 fallback to avoid flicker on first expansion
  // Content starts hidden; onLayout measures real height before animation needs it
  const contentContainerStyle = useAnimatedStyle(() => {
    const maxH = contentHeight.current || 0;
    return {
      height: maxH > 0 ? interpolate(animatedHeight.value, [0, 1], [0, maxH], Extrapolation.CLAMP) : 0,
      opacity: interpolate(animatedHeight.value, [0, 0.3, 1], [0, 0.5, 1], Extrapolation.CLAMP),
      overflow: 'hidden' as const,
    };
  });

  const chevronStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${interpolate(chevronRotate.value, [0, 1], [0, 90])}deg` }],
  }));

  const headerAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: headerScale.value }],
  }));

  const resolvedIconColor = isActive ? colors.emerald : (iconColor || tc.text.secondary);

  return (
    <View>
      {/* Header row */}
      <Animated.View style={headerAnimatedStyle}>
        <Pressable
          onPress={toggle}
          onPressIn={() => { headerScale.value = withSpring(0.97, { damping: 15, stiffness: 400 }); }}
          onPressOut={() => { headerScale.value = withSpring(1, { damping: 12, stiffness: 200 }); }}
          style={[styles.header, { backgroundColor: tc.bgElevated }]}
          accessibilityRole="button"
          accessibilityState={{ expanded }}
          accessibilityLabel={title}
        >
          <Icon name={icon} size="sm" color={resolvedIconColor} />
          <Text style={[styles.title, { color: isActive ? colors.emerald : tc.text.primary }]} numberOfLines={1}>
            {title}
          </Text>
          {subtitle && !expanded && (
            <Text style={[styles.subtitle, { color: tc.text.tertiary }]} numberOfLines={1}>
              {subtitle}
            </Text>
          )}
          <Animated.View style={chevronStyle}>
            <Icon name="chevron-right" size="sm" color={tc.text.tertiary} />
          </Animated.View>
        </Pressable>
      </Animated.View>

      {/* Animated content */}
      <Animated.View style={contentContainerStyle}>
        <View onLayout={onContentLayout} style={styles.content}>
          {children}
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
  },
  title: {
    flex: 1,
    fontSize: fontSize.sm,
    fontFamily: fonts.bodyMedium,
    fontWeight: '500',
  },
  subtitle: {
    fontSize: fontSize.xs,
    fontFamily: fonts.body,
    maxWidth: '40%',
    textAlign: 'right',
  },
  content: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
    position: 'absolute',
    width: '100%',
  },
});
