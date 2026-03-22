import { useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  StyleProp,
  ViewStyle,
} from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { Icon } from '@/components/ui/Icon';
import { GradientButton } from '@/components/ui/GradientButton';
import { colors, spacing, fontSize, radius, fonts } from '@/theme';
import { useTranslation } from '@/hooks/useTranslation';
import { useHaptic } from '@/hooks/useHaptic';
import { useThemeColors } from '@/hooks/useThemeColors';

interface AddYoursStickerProps {
  chainId: string;
  prompt: string;
  participantCount: number;
  isCreator?: boolean;
  onAddYours: () => void;
  onViewResponses?: () => void;
  style?: StyleProp<ViewStyle>;
}

/**
 * Format a count for display (e.g., 1234 -> "1,234")
 */
function formatCount(count: number): string {
  if (count >= 1_000_000) {
    return `${(count / 1_000_000).toFixed(1)}M`;
  }
  if (count >= 1_000) {
    return `${(count / 1_000).toFixed(1)}K`;
  }
  return count.toLocaleString();
}

export function AddYoursSticker({
  chainId,
  prompt,
  participantCount,
  isCreator = false,
  onAddYours,
  onViewResponses,
  style,
}: AddYoursStickerProps) {
  const { t } = useTranslation();
  const haptic = useHaptic();
  const tc = useThemeColors();

  const handleAddYours = useCallback(() => {
    haptic.light();
    onAddYours();
  }, [haptic, onAddYours]);

  const handleViewResponses = useCallback(() => {
    if (onViewResponses) {
      haptic.light();
      onViewResponses();
    }
  }, [haptic, onViewResponses]);

  return (
    <Animated.View
      entering={FadeIn.duration(300)}
      style={[styles.container, style]}
      accessibilityRole="none"
      accessibilityLabel={t('story.addYours.accessibilityLabel', {
        defaultValue: 'Add yours sticker',
      })}
    >
      {/* Header */}
      <View style={styles.header}>
        <Icon name="star" size="sm" color={colors.emerald} />
        <Text style={styles.headerText}>
          {t('story.addYours.title', { defaultValue: 'Add Yours' })}
        </Text>
      </View>

      {/* Prompt */}
      <Text style={styles.prompt} numberOfLines={3}>
        {prompt}
      </Text>

      {/* Action Button */}
      <View style={styles.buttonWrapper}>
        <GradientButton
          label={t('story.addYours.button', { defaultValue: 'Add Yours' })}
          onPress={handleAddYours}
          icon="plus"
          size="sm"
          fullWidth
        />
      </View>

      {/* Footer */}
      <View style={[styles.footer, { borderTopColor: tc.borderLight }]}>
        {isCreator && onViewResponses ? (
          <Pressable
            style={styles.viewResponsesRow}
            onPress={handleViewResponses}
            accessibilityRole="button"
            accessibilityLabel={t('story.addYours.viewResponses', {
              defaultValue: 'View responses',
            })}
          >
            <Icon name="eye" size="xs" color={colors.emerald} />
            <Text style={styles.viewResponsesText}>
              {t('story.addYours.viewResponses', {
                defaultValue: 'View responses',
              })}
            </Text>
            <Icon name="chevron-right" size="xs" color={colors.emerald} />
          </Pressable>
        ) : (
          <View style={styles.participantRow}>
            <Icon name="users" size="xs" color={colors.text.secondary} />
            <Text style={styles.participantText}>
              {t('story.addYours.participated', {
                count: participantCount,
                defaultValue: '{{count}} participated',
              }).replace('{{count}}', formatCount(participantCount))}
            </Text>
          </View>
        )}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.glass.darkHeavy,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: 'rgba(10, 123, 79, 0.3)',
    width: 280,
    maxWidth: '100%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    marginBottom: spacing.base,
  },
  headerText: {
    color: colors.emerald,
    fontSize: fontSize.base,
    fontFamily: fonts.bodySemiBold,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  prompt: {
    color: colors.text.primary,
    fontSize: fontSize.md,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: spacing.lg,
    lineHeight: 24,
    fontStyle: 'italic',
  },
  buttonWrapper: {
    marginBottom: spacing.base,
  },
  footer: {
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: colors.dark.borderLight,
    paddingTop: spacing.md,
  },
  participantRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  participantText: {
    color: colors.text.secondary,
    fontSize: fontSize.sm,
  },
  viewResponsesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.active.emerald10,
    borderRadius: radius.full,
  },
  viewResponsesText: {
    color: colors.emerald,
    fontSize: fontSize.sm,
    fontWeight: '600',
  },
});
