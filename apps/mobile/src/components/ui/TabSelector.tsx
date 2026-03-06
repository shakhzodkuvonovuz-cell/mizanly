import { useCallback } from 'react';
import { View, Text, Pressable, StyleSheet, LayoutChangeEvent } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';
import { useHaptic } from '@/hooks/useHaptic';
import { colors, spacing, fontSize, animation, radius } from '@/theme';

interface Tab {
  key: string;
  label: string;
}

interface TabSelectorProps {
  tabs: Tab[];
  activeKey: string;
  onTabChange: (key: string) => void;
  variant?: 'underline' | 'pill';
  style?: object;
}

export function TabSelector({ tabs, activeKey, onTabChange, variant = 'underline', style }: TabSelectorProps) {
  const haptic = useHaptic();
  const activeIndex = tabs.findIndex((t) => t.key === activeKey);
  const tabWidth = useSharedValue(0);
  const indicatorLeft = useSharedValue(0);

  const handleTabLayout = useCallback(
    (index: number) => (e: LayoutChangeEvent) => {
      const { x, width } = e.nativeEvent.layout;
      if (index === activeIndex) {
        indicatorLeft.value = x;
        tabWidth.value = width;
      }
    },
    [activeIndex, indicatorLeft, tabWidth],
  );

  const handlePress = useCallback(
    (key: string, index: number) => {
      haptic.selection();
      onTabChange(key);
    },
    [haptic, onTabChange],
  );

  // Update indicator position when active index changes
  const indicatorStyle = useAnimatedStyle(() => {
    return {
      left: withSpring(indicatorLeft.value, animation.spring.snappy),
      width: withSpring(tabWidth.value, animation.spring.snappy),
    };
  });

  if (variant === 'pill') {
    return (
      <View style={[styles.pillContainer, style]}>
        <View style={styles.pillTrack}>
          <Animated.View style={[styles.pillIndicator, indicatorStyle]} />
          {tabs.map((tab, i) => (
            <Pressable
              key={tab.key}
              style={styles.pillTab}
              onPress={() => handlePress(tab.key, i)}
              onLayout={handleTabLayout(i)}
              accessibilityLabel={`${tab.label} tab`}
              accessibilityRole="button"
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
    <View style={[styles.underlineContainer, style]}>
      {tabs.map((tab, i) => (
        <Pressable
          key={tab.key}
          style={styles.underlineTab}
          onPress={() => handlePress(tab.key, i)}
          onLayout={handleTabLayout(i)}
          accessibilityLabel={`${tab.label} tab`}
          accessibilityRole="button"
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
  },
  underlineIndicator: {
    position: 'absolute',
    bottom: -0.5,
    height: 2.5,
    backgroundColor: colors.emerald,
    borderRadius: 1.25,
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
    backgroundColor: colors.dark.surface,
    borderRadius: radius.full,
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
  },
});
