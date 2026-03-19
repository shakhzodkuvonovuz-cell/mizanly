import { memo, useState, useCallback } from 'react';
import { memo, View, Text, Pressable, StyleSheet } from 'react-native';
import Animated, { FadeIn, FadeOut, Layout } from 'react-native-reanimated';
import { memo, Icon } from '@/components/ui/Icon';
import { memo, colors, spacing, fontSize, radius, fonts } from '@/theme';
import { memo, useTranslation } from '@/hooks/useTranslation';

interface AlgorithmCardProps {
  reasons: string[];
  onDismiss: () => void;
  onNotInterested: () => void;
}

export const AlgorithmCard = memo(function AlgorithmCard({ reasons, onDismiss, onNotInterested }: AlgorithmCardProps) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);

  const toggleExpanded = useCallback(() => {
    setExpanded((prev) => !prev);
  }, []);

  if (reasons.length === 0) return null;

  return (
    <Animated.View
      entering={FadeIn.duration(200)}
      exiting={FadeOut.duration(150)}
      layout={Layout.springify()}
      style={styles.container}
    >
      <View style={styles.header}>
        <View style={styles.reasonRow}>
          <Icon name="eye" size="sm" color={colors.emerald} />
          <Text style={styles.reasonText} numberOfLines={expanded ? undefined : 1}>
            {reasons[0]}
          </Text>
        </View>
        <Pressable onPress={onDismiss} hitSlop={8} accessibilityRole="button" accessibilityLabel={t('algorithmCard.dismiss', 'Dismiss')}>
          <Icon name="x" size="xs" color={colors.text.tertiary} />
        </Pressable>
      </View>

      {expanded && reasons.length > 1 ? (
        <Animated.View entering={FadeIn.duration(200)} style={styles.expandedReasons}>
          {reasons.slice(1).map((reason, index) => (
            <View key={`reason-${index}`} style={styles.reasonRow}>
              <Icon name="check-circle" size="xs" color={colors.text.tertiary} />
              <Text style={styles.secondaryReasonText}>{reason}</Text>
            </View>
          ))}
        </Animated.View>
      ) : null}

      <View style={styles.footer}>
        <Pressable onPress={toggleExpanded} hitSlop={6} accessibilityRole="button">
          <Text style={styles.whyText}>
            {expanded
              ? t('algorithmCard.showLess', 'Show less')
              : t('algorithmCard.whySeeing', 'Why am I seeing this?')}
          </Text>
        </Pressable>

        <Pressable onPress={onNotInterested} hitSlop={6} accessibilityRole="button">
          <Text style={styles.notInterestedText}>
            {t('algorithmCard.notInterested', 'Not interested')}
          </Text>
        </Pressable>
      </View>
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.dark.bgCard,
    borderWidth: 0.5,
    borderColor: colors.glass.border,
    borderRadius: radius.md,
    padding: spacing.md,
    marginHorizontal: spacing.base,
    marginVertical: spacing.sm,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  reasonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flex: 1,
    paddingVertical: spacing.xs,
  },
  reasonText: {
    fontFamily: fonts.body,
    fontSize: fontSize.sm,
    color: colors.text.secondary,
    flex: 1,
  },
  secondaryReasonText: {
    fontFamily: fonts.body,
    fontSize: fontSize.xs,
    color: colors.text.tertiary,
    flex: 1,
  },
  expandedReasons: {
    marginTop: spacing.xs,
    gap: spacing.xs,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.dark.border,
  },
  whyText: {
    fontFamily: fonts.bodyMedium,
    fontSize: fontSize.xs,
    color: colors.emerald,
  },
  notInterestedText: {
    fontFamily: fonts.body,
    fontSize: fontSize.xs,
    color: colors.text.tertiary,
  },
});
