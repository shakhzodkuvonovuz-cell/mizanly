import { useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  StyleProp,
  ViewStyle,
} from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { Image } from 'expo-image';
import { Icon } from '@/components/ui/Icon';
import { colors, spacing, fontSize, radius, fonts } from '@/theme';
import { useTranslation } from '@/hooks/useTranslation';
import { useHaptic } from '@/hooks/useHaptic';

interface LinkStickerProps {
  url: string;
  title?: string;
  favicon?: string;
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
}

/**
 * Extract a display-friendly domain + path from a URL, truncated to maxLength.
 */
function truncateUrl(url: string, maxLength: number = 40): string {
  try {
    const parsed = new URL(url);
    const domain = parsed.hostname.replace(/^www\./, '');
    const path = parsed.pathname === '/' ? '' : parsed.pathname;
    const display = domain + path;
    if (display.length <= maxLength) return display;
    return display.slice(0, maxLength - 1) + '\u2026';
  } catch {
    // Fallback for malformed URLs
    if (url.length <= maxLength) return url;
    return url.slice(0, maxLength - 1) + '\u2026';
  }
}

export function LinkSticker({
  url,
  title,
  favicon,
  onPress,
  style,
}: LinkStickerProps) {
  const { t } = useTranslation();
  const haptic = useHaptic();

  const displayUrl = useMemo(() => truncateUrl(url), [url]);

  const handlePress = useCallback(() => {
    haptic.light();
    onPress();
  }, [haptic, onPress]);

  return (
    <Animated.View entering={FadeIn.duration(300)} style={style}>
      <Pressable
        style={styles.container}
        onPress={handlePress}
        accessibilityRole="link"
        accessibilityLabel={t('story.link.accessibilityLabel', {
          defaultValue: 'Open link: {{url}}',
        }).replace('{{url}}', displayUrl)}
        accessibilityHint={t('story.link.accessibilityHint', {
          defaultValue: 'Opens the link in your browser',
        })}
      >
        {/* URL Row */}
        <View style={styles.urlRow}>
          {favicon ? (
            <Image
              source={{ uri: favicon }}
              style={styles.favicon}
              contentFit="contain"
              accessibilityIgnoresInvertColors
            />
          ) : (
            <Icon name="link" size="sm" color={colors.text.secondary} />
          )}
          <Text style={styles.urlText} numberOfLines={1}>
            {displayUrl}
          </Text>
        </View>

        {/* Title */}
        {title ? (
          <Text style={styles.title} numberOfLines={2}>
            {title}
          </Text>
        ) : null}

        {/* See More CTA */}
        <View style={styles.ctaRow}>
          <Icon name="chevron-right" size="xs" color={colors.emerald} />
          <Text style={styles.ctaText}>
            {t('story.link.seeMore', { defaultValue: 'See More' })}
          </Text>
        </View>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    borderRadius: radius.md,
    padding: spacing.base,
    borderWidth: 1,
    borderColor: colors.glass.border,
    width: 260,
    maxWidth: '100%',
  },
  urlRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  favicon: {
    width: 20,
    height: 20,
    borderRadius: radius.sm,
  },
  urlText: {
    color: colors.text.secondary,
    fontSize: fontSize.sm,
    flex: 1,
  },
  title: {
    color: colors.text.primary,
    fontSize: fontSize.base,
    fontFamily: fonts.bodySemiBold,
    fontWeight: '600',
    lineHeight: 20,
    marginBottom: spacing.sm,
  },
  ctaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.dark.borderLight,
  },
  ctaText: {
    color: colors.emerald,
    fontSize: fontSize.sm,
    fontWeight: '600',
  },
});
