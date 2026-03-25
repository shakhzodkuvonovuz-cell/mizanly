import React, { memo } from 'react';
import { useTranslation } from '@/hooks/useTranslation';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Platform,
} from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import Animated from 'react-native-reanimated';
import { WebSafeBlurView } from '@/components/ui/WebSafeBlurView';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { colors, fonts, fontSize, spacing, radius, fontSizeExt } from '@/theme';
import { useAnimatedPress } from '@/hooks/useAnimatedPress';
import { useContextualHaptic } from '@/hooks/useContextualHaptic';
import { useThemeColors } from '@/hooks/useThemeColors';
import { Icon } from '@/components/ui/Icon';
import type { IconName } from '@/components/ui/Icon';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

interface HeaderAction {
  icon: string | React.ReactNode;
  onPress: () => void;
  accessibilityLabel?: string;
  badge?: number;
}

export interface GlassHeaderProps {
  title?: string;
  titleComponent?: React.ReactNode;
  leftAction?: HeaderAction;
  leftIcon?: string;
  onLeftPress?: () => void;
  rightAction?: HeaderAction;
  rightActions?: HeaderAction[];
  rightContent?: React.ReactNode;
  borderless?: boolean;
  showBackButton?: boolean;
  showBack?: boolean;
  onBack?: () => void;
  style?: StyleProp<ViewStyle>;
}

function HeaderButton({ icon, onPress, accessibilityLabel, badge }: HeaderAction) {
  const haptic = useContextualHaptic();
  const tc = useThemeColors();
  const { onPressIn, onPressOut, animatedStyle } = useAnimatedPress({ scaleTo: 0.88 });

  const handlePress = () => {
    haptic.navigate();
    onPress();
  };

  return (
    <AnimatedPressable
      onPress={handlePress}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      style={[styles.headerButton, animatedStyle]}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? (typeof icon === 'string' ? icon : undefined)}
      hitSlop={8}
    >
      {typeof icon === 'string' ? (
        <Icon name={icon as IconName} size={22} color={colors.text.primary} />
      ) : (
        icon
      )}
      {badge != null && badge > 0 ? (
        <View style={[styles.badge, { borderColor: tc.bg }]}>
          <Text style={styles.badgeText}>
            {badge > 99 ? '99+' : badge}
          </Text>
        </View>
      ) : null}
    </AnimatedPressable>
  );
}

export const GlassHeader = memo(function GlassHeader({
  title,
  titleComponent,
  leftAction,
  rightAction,
  rightActions,
  borderless = false,
  showBackButton = false,
  showBack = false,
  onBack,
  style,
}: GlassHeaderProps) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { t } = useTranslation();
  const tc = useThemeColors();

  // Resolve left action: explicit leftAction > showBackButton/showBack
  const resolvedLeftAction = leftAction ?? (
    (showBackButton || showBack) ? {
      icon: 'arrow-left',
      onPress: onBack ?? (() => router.back()),
      accessibilityLabel: t('common.back'),
    } : undefined
  );

  // Merge singular rightAction into rightActions array
  const resolvedRightActions = rightActions ?? (rightAction ? [rightAction] : undefined);

  const headerContent = (
    <View
      style={[
        styles.inner,
        { paddingTop: insets.top },
        !borderless && [styles.border, { borderBottomColor: tc.border }],
      ]}
    >
      <View style={styles.row}>
        <View style={styles.left}>
          {resolvedLeftAction ? (
            <HeaderButton {...resolvedLeftAction} />
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
          {resolvedRightActions && resolvedRightActions.length > 0 ? (
            resolvedRightActions.map((action, index) => (
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
      <WebSafeBlurView intensity={60} tint="dark" style={[styles.container, style]}>
        {headerContent}
      </WebSafeBlurView>
    );
  }

  return (
    <View style={[styles.container, styles.androidBg, style]}>
      {headerContent}
    </View>
  );
});

const BUTTON_SIZE = 44;

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    start: 0,
    end: 0,
    zIndex: 100,
  },
  androidBg: {
    backgroundColor: 'rgba(13, 17, 23, 0.92)',
  },
  inner: {
    paddingBottom: spacing.sm,
    paddingHorizontal: spacing.base,
  },
  // TODO: colors.dark.border overridden by inline style with tc.border from useThemeColors()
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
    end: 4,
    minWidth: 18,
    height: 18,
    borderRadius: radius.full,
    backgroundColor: colors.error,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    borderWidth: 1.5,
    borderColor: colors.dark.bg, // TODO: overridden by inline style with tc.bg from useThemeColors()
  },
  badgeText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSizeExt.tiny,
    color: '#FFFFFF',
    textAlign: 'center',
  },
});
