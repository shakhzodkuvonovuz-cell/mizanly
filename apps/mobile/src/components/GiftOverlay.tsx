import { useEffect, useCallback } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  withSequence,
  withDelay,
  runOnJS,
  Easing,
} from 'react-native-reanimated';
import { Icon } from '@/components/ui/Icon';
import { useTranslation } from '@/hooks/useTranslation';
import { useHaptic } from '@/hooks/useHaptic';
import { colors, spacing, fontSize, radius, fonts, shadow } from '@/theme';

const GIFT_ICONS: Record<string, string> = {
  rose: 'heart',
  heart: 'heart-filled',
  star: 'trending-up',
  crescent: 'globe',
  mosque: 'layers',
  diamond: 'bookmark',
  crown: 'check-circle',
  galaxy: 'globe',
};

const AUTO_DISMISS_MS = 3000;
const FLOAT_DISTANCE = -80;

interface GiftOverlayProps {
  giftType: string;
  senderName: string;
  coinValue: number;
  visible: boolean;
  onDone: () => void;
}

export function GiftOverlay({ giftType, senderName, coinValue, visible, onDone }: GiftOverlayProps) {
  const { t } = useTranslation();
  const haptic = useHaptic();

  const scale = useSharedValue(0);
  const translateY = useSharedValue(0);
  const opacity = useSharedValue(0);

  const dismiss = useCallback(() => {
    onDone();
  }, [onDone]);

  useEffect(() => {
    if (visible) {
      haptic.medium();

      // Reset values
      scale.value = 0;
      translateY.value = 0;
      opacity.value = 0;

      // Animate in: scale spring + fade in
      scale.value = withSpring(1, { damping: 10, stiffness: 400, mass: 0.6 });
      opacity.value = withTiming(1, { duration: 200, easing: Easing.out(Easing.quad) });

      // Float upward + fade out after delay
      translateY.value = withDelay(
        1500,
        withTiming(FLOAT_DISTANCE, { duration: 1200, easing: Easing.out(Easing.quad) }),
      );
      opacity.value = withDelay(
        2000,
        withTiming(0, { duration: 800, easing: Easing.in(Easing.quad) }),
      );

      // Auto-dismiss
      const timer = setTimeout(() => {
        dismiss();
      }, AUTO_DISMISS_MS);

      return () => clearTimeout(timer);
    } else {
      scale.value = 0;
      opacity.value = 0;
      translateY.value = 0;
    }
  }, [visible, dismiss, haptic, scale, translateY, opacity]);

  const containerStyle = useAnimatedStyle(() => ({
    transform: [
      { scale: scale.value },
      { translateY: translateY.value },
    ],
    opacity: opacity.value,
  }));

  if (!visible) return null;

  const iconName = (GIFT_ICONS[giftType] ?? 'heart') as React.ComponentProps<typeof Icon>['name'];

  return (
    <View style={styles.overlay} pointerEvents="none">
      <Animated.View style={[styles.card, containerStyle]}>
        <View style={styles.iconWrap}>
          <Icon name={iconName} size="xl" color={colors.gold} />
        </View>
        <View style={styles.textWrap}>
          <Text style={styles.senderText} numberOfLines={1}>
            {senderName}
          </Text>
          <Text style={styles.actionText}>
            {t('giftOverlay.sent', 'sent a gift')}
          </Text>
        </View>
        <View style={styles.coinBadge}>
          <Icon name="bookmark" size="xs" color={colors.gold} />
          <Text style={styles.coinText}>{coinValue}</Text>
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    bottom: 120,
    left: spacing.base,
    right: spacing.base,
    alignItems: 'center',
    zIndex: 200,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(13, 17, 23, 0.85)',
    borderRadius: radius.lg,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.base,
    gap: spacing.md,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    ...shadow.md,
    maxWidth: 320,
  },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: radius.full,
    backgroundColor: 'rgba(200, 150, 62, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  textWrap: {
    flex: 1,
  },
  senderText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSize.base,
    color: colors.text.primary,
  },
  actionText: {
    fontFamily: fonts.body,
    fontSize: fontSize.sm,
    color: colors.text.secondary,
    marginTop: spacing.xs,
  },
  coinBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: 'rgba(200, 150, 62, 0.15)',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.full,
  },
  coinText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSize.sm,
    color: colors.gold,
  },
});
