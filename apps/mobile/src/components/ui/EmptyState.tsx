import { View, Text, StyleSheet } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import Animated from 'react-native-reanimated';
import { Icon } from './Icon';
import { GradientButton } from './GradientButton';
import { useEntranceAnimation } from '@/hooks/useEntranceAnimation';
import { colors, spacing, fontSize, radius } from '@/theme';

export interface EmptyStateProps {
  icon?: React.ComponentProps<typeof Icon>['name'];
  title: string;
  subtitle?: string;
  actionLabel?: string;
  onAction?: () => void;
  style?: StyleProp<ViewStyle>;
  size?: 'sm' | 'md' | 'lg';
}

export function EmptyState({ icon, title, subtitle, actionLabel, onAction, style }: EmptyStateProps) {
  const { animatedStyle: entranceStyle } = useEntranceAnimation();

  return (
    <Animated.View style={[styles.container, entranceStyle, style]}>
      {icon && (
        <View style={styles.iconWrap}>
          <Icon name={icon} size="xl" color={colors.text.tertiary} />
        </View>
      )}
      <Text style={styles.title}>{title}</Text>
      {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
      {actionLabel && onAction && (
        <View style={styles.actionWrap}>
          <GradientButton label={actionLabel} onPress={onAction} size="sm" />
        </View>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    paddingTop: spacing['4xl'],
    paddingHorizontal: spacing.xl,
    gap: spacing.sm,
  },
  iconWrap: {
    width: 64,
    height: 64,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.active.emerald20,
    backgroundColor: colors.dark.bgElevated,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  title: {
    color: colors.text.primary,
    fontSize: fontSize.lg,
    fontWeight: '600',
    textAlign: 'center',
  },
  subtitle: {
    color: colors.text.secondary,
    fontSize: fontSize.base,
    textAlign: 'center',
    lineHeight: 22,
  },
  actionWrap: {
    marginTop: spacing.md,
  },
});
