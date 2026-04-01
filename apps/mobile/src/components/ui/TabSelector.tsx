import { useCallback, useRef } from 'react';
import { View, Text, Pressable, StyleSheet, LayoutChangeEvent } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';
import { useContextualHaptic } from '@/hooks/useContextualHaptic';
import { colors, spacing, fontSize, radius } from '@/theme';
import { useThemeColors } from '@/hooks/useThemeColors';

interface Tab {
  key: string;
  label: string;
}

interface TabSelectorProps {
  tabs: readonly Tab[];
  activeKey: string;
  onTabChange: (key: string) => void;
  variant?: 'underline' | 'pill';
  style?: object;
}

/** Spring config for the indicator slide — damping 20 for smooth deceleration, stiffness 200 for snappy arrival */
const INDICATOR_SPRING = { damping: 20, stiffness: 200 };

export function TabSelector({ tabs, activeKey, onTabChange, variant = 'underline', style }: TabSelectorProps) {
  const haptic = useContextualHaptic();
  const tc = useThemeColors();
  const activeIndex = tabs.findIndex((t) => t.key === activeKey);
  const indicatorLeft = useSharedValue(0);
  const tabWidth = useSharedValue(0);

  // Track every tab's layout so we can animate to any tab on press
  const tabLayouts = useRef<{ x: number; width: number }[]>([]);

  const handleTabLayout = useCallback(
    (index: number) => (e: LayoutChangeEvent) => {
      const { x, width } = e.nativeEvent.layout;
      tabLayouts.current[index] = { x, width };
      // Seed the indicator on the currently active tab
      if (index === activeIndex) {
        indicatorLeft.value = x;
        tabWidth.value = width;
      }
    },
    [activeIndex, indicatorLeft, tabWidth],
  );

  const handlePress = useCallback(
    (key: string, index: number) => {
      haptic.tick();
      // Animate indicator to the pressed tab's measured position
      const layout = tabLayouts.current[index];
      if (layout) {
        indicatorLeft.value = withSpring(layout.x, INDICATOR_SPRING);
        tabWidth.value = withSpring(layout.width, INDICATOR_SPRING);
      }
      onTabChange(key);
    },
    [haptic, onTabChange, indicatorLeft, tabWidth],
  );

  const indicatorStyle = useAnimatedStyle(() => ({
    left: indicatorLeft.value,
    width: tabWidth.value,
  }));

  if (variant === 'pill') {
    return (
      <View style={[styles.pillContainer, style]}>
        <View style={[styles.pillTrack, { backgroundColor: tc.bgElevated }]}>
          <Animated.View style={[styles.pillIndicator, indicatorStyle]} />
          {tabs.map((tab, i) => (
            <Pressable
              key={tab.key}
              style={styles.pillTab}
              onPress={() => handlePress(tab.key, i)}
              onLayout={handleTabLayout(i)}
              accessibilityLabel={`${tab.label} tab`}
              accessibilityRole="tab"
            >
              <Text
                style={[
                  styles.pillLabel,
                  activeKey === tab.key && styles.pillLabelActive,
                ]}
              >
                {tab.label}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.underlineContainer, { borderBottomColor: tc.border }, style]}>
      {tabs.map((tab, i) => (
        <Pressable
          key={tab.key}
          style={styles.underlineTab}
          onPress={() => handlePress(tab.key, i)}
          onLayout={handleTabLayout(i)}
          accessibilityLabel={`${tab.label} tab`}
          accessibilityRole="tab"
        >
          <Text
            style={[
              styles.underlineLabel,
              activeKey === tab.key && styles.underlineLabelActive,
            ]}
          >
            {tab.label}
          </Text>
        </Pressable>
      ))}
      <Animated.View style={[styles.underlineIndicator, indicatorStyle]} />
    </View>
  );
}

const styles = StyleSheet.create({
  // Underline variant
  underlineContainer: {
    flexDirection: 'row',
    borderBottomWidth: 0.5,
    borderBottomColor: colors.dark.border,
    position: 'relative',
  },
  underlineTab: {
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
  },
  underlineLabel: {
    color: colors.text.secondary,
    fontSize: fontSize.base,
    fontWeight: '600',
  },
  underlineLabelActive: {
    color: colors.text.primary,
    fontWeight: '700',
  },
  underlineIndicator: {
    position: 'absolute',
    bottom: -0.5,
    height: 3,
    backgroundColor: colors.emerald,
    borderRadius: 1.5,
    shadowColor: colors.emerald,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 6,
    elevation: 3,
  },

  // Pill variant
  pillContainer: {
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
  },
  pillTrack: {
    flexDirection: 'row',
    backgroundColor: colors.dark.bgElevated,
    borderRadius: radius.full,
    padding: 3,
    position: 'relative',
  },
  pillIndicator: {
    position: 'absolute',
    top: 3,
    bottom: 3,
    backgroundColor: colors.dark.surface, // overridden inline with tc.surface
    borderRadius: radius.full,
    borderWidth: 0.5,
    borderColor: colors.glass.border,
  },
  pillTab: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.sm,
    zIndex: 1,
  },
  pillLabel: {
    color: colors.text.secondary,
    fontSize: fontSize.sm,
    fontWeight: '600',
  },
  pillLabelActive: {
    color: colors.text.primary,
    fontWeight: '700',
  },
});
