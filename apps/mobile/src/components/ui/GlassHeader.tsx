import React from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Platform,
} from 'react-native';
import Animated from 'react-native-reanimated';
import { WebSafeBlurView } from '@/components/ui/WebSafeBlurView';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, fonts, fontSize, spacing, radius } from '@/theme';
import { useAnimatedPress } from '@/hooks/useAnimatedPress';
import { useHaptic } from '@/hooks/useHaptic';
import { Icon } from '@/components/ui/Icon';
import type { IconName } from '@/components/ui/Icon';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

interface HeaderAction {
  icon: string | React.ReactNode;
  onPress: () => void;
  accessibilityLabel?: string;
  badge?: number;
}

interface GlassHeaderProps {
  title?: string;
  titleComponent?: React.ReactNode;
  leftAction?: HeaderAction;
  rightActions?: HeaderAction[];
  borderless?: boolean;
}

function HeaderButton({ icon, onPress, accessibilityLabel, badge }: HeaderAction) {
  const haptic = useHaptic();
  const { onPressIn, onPressOut, animatedStyle } = useAnimatedPress({ scaleTo: 0.88 });

  const handlePress = () => {
    haptic.light();
    onPress();
  };

  return (
    <AnimatedPressable
      onPress={handlePress}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      style={[styles.headerButton, animatedStyle]}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? (typeof icon === 'string' ? icon : 'action')}
      hitSlop={8}
    >
      {typeof icon === 'string' ? (
        <Icon name={icon as IconName} size={22} color={colors.text.primary} />
      ) : (
        icon
      )}
      {badge != null && badge > 0 ? (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>
            {badge > 99 ? '99+' : badge}
          </Text>
        </View>
      ) : null}
    </AnimatedPressable>
  );
}

export function GlassHeader({
  title,
  titleComponent,
  leftAction,
  rightActions,
  borderless = false,
}: GlassHeaderProps) {
  const insets = useSafeAreaInsets();

  const headerContent = (
    <View
      style={[
        styles.inner,
        { paddingTop: insets.top },
        !borderless && styles.border,
      ]}
    >
      <View style={styles.row}>
        <View style={styles.left}>
          {leftAction ? (
            <HeaderButton {...leftAction} />
          ) : (
            <View style={styles.spacer} />
          )}
        </View>

        <View style={styles.center}>
          {titleComponent ?? (
            title ? (
              <Text style={styles.title} numberOfLines={1}>
                {title}
              </Text>
            ) : null
          )}
        </View>

        <View style={styles.right}>
          {rightActions && rightActions.length > 0 ? (
            rightActions.map((action, index) => (
              <HeaderButton key={`header-action-${index}`} {...action} />
            ))
          ) : (
            <View style={styles.spacer} />
          )}
        </View>
      </View>
    </View>
  );

  if (Platform.OS === 'ios' || Platform.OS === 'web') {
    return (
      <WebSafeBlurView intensity={60} tint="dark" style={styles.container}>
        {headerContent}
      </WebSafeBlurView>
    );
  }

  return (
    <View style={[styles.container, styles.androidBg]}>
      {headerContent}
    </View>
  );
}

const BUTTON_SIZE = 44;

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 100,
  },
  androidBg: {
    backgroundColor: 'rgba(13, 17, 23, 0.92)',
  },
  inner: {
    paddingBottom: spacing.sm,
    paddingHorizontal: spacing.base,
  },
  border: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.dark.border,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    height: BUTTON_SIZE,
  },
  left: {
    width: BUTTON_SIZE,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: spacing.xs,
  },
  right: {
    minWidth: BUTTON_SIZE,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: spacing.xs,
  },
  title: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSize.md,
    color: colors.text.primary,
    letterSpacing: 0.2,
  },
  headerButton: {
    width: BUTTON_SIZE,
    height: BUTTON_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.full,
  },
  spacer: {
    width: BUTTON_SIZE,
    height: BUTTON_SIZE,
  },
  badge: {
    position: 'absolute',
    top: 4,
    right: 4,
    minWidth: 18,
    height: 18,
    borderRadius: radius.full,
    backgroundColor: colors.error,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    borderWidth: 1.5,
    borderColor: colors.dark.bg,
  },
  badgeText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 10,
    color: '#FFFFFF',
    textAlign: 'center',
  },
});
