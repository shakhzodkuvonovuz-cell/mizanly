import { useState, useEffect, memo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Linking,
  Pressable,
} from 'react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { Icon } from './Icon';
import { ProgressiveImage } from './ProgressiveImage';
import { Skeleton } from './Skeleton';
import { colors, spacing, radius, fontSize, shadow } from '@/theme';
import { useThemeColors } from '@/hooks/useThemeColors';
import { useTranslation } from '@/hooks/useTranslation';
import { api } from '@/services/api';

export interface LinkPreviewProps {
  url: string;
  onPress?: () => void;
}

interface LinkMetadata {
  domain: string;
  title: string;
  description: string;
  imageUrl?: string;
  faviconUrl?: string;
}

export const LinkPreview = memo(function LinkPreview({ url, onPress }: LinkPreviewProps) {
  const { t } = useTranslation();
  const tc = useThemeColors();
  const [metadata, setMetadata] = useState<LinkMetadata | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function fetchMetadata() {
      try {
        const data = await api.get<{
          url: string;
          domain: string;
          title: string | null;
          description: string | null;
          imageUrl: string | null;
          faviconUrl: string | null;
        }>(`/og/unfurl?url=${encodeURIComponent(url)}`);

        if (!cancelled && data) {
          setMetadata({
            domain: data.domain,
            title: data.title || data.domain,
            description: data.description || '',
            imageUrl: data.imageUrl || undefined,
            faviconUrl: data.faviconUrl || undefined,
          });
          setLoading(false);
        }
      } catch {
        if (!cancelled) {
          // Fallback: extract domain from URL
          try {
            const domain = new URL(url).hostname.replace('www.', '');
            setMetadata({
              domain,
              title: domain,
              description: url,
              faviconUrl: `https://www.google.com/s2/favicons?domain=${domain}&sz=64`,
            });
          } catch {
            setError(true);
          }
          setLoading(false);
        }
      }
    }

    fetchMetadata();
    return () => { cancelled = true; };
  }, [url]);

  const handlePress = () => {
    if (onPress) {
      onPress();
    } else {
      Linking.openURL(url).catch(() => {});
    }
  };

  if (error) {
    // Fallback to simple link display
    return (
      <Pressable
        onPress={handlePress}
        accessibilityRole="link"
        accessibilityLabel={`Link to ${url}`}
      >
        <View style={[styles.errorContainer, { backgroundColor: tc.bgCard, borderColor: tc.borderLight }]}>
          <Icon name="link" size="sm" color={colors.emerald} />
          <Text style={styles.errorText} numberOfLines={1}>
            {url}
          </Text>
        </View>
      </Pressable>
    );
  }

  return (
    <Pressable
      onPress={handlePress}
      accessibilityRole="link"
      accessibilityLabel={metadata ? `Link to ${metadata.domain}: ${metadata.title}` : `Link to ${url}`}
    >
      <Animated.View entering={FadeInUp.duration(400)} style={styles.container}>
        <LinearGradient
          colors={colors.gradient.cardDark}
          style={styles.gradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        >
          {/* Preview Image */}
          {loading ? (
            <Skeleton.Rect
              width="100%"
              height={160}
              borderRadius={radius.lg}
              style={styles.imageSkeleton}
            />
          ) : metadata?.imageUrl ? (
            <View style={styles.imageContainer}>
              <ProgressiveImage
                uri={metadata.imageUrl}
                blurhash={null}
                width="100%"
                height={160}
                contentFit="cover"
                transition={200}
                accessibilityLabel={metadata?.title ? `Preview image for ${metadata.title}` : 'Link preview image'}
              />
              <LinearGradient
                colors={['rgba(13,17,23,0.8)', 'transparent']}
                style={styles.imageOverlay}
              />
            </View>
          ) : null}

          {/* Content */}
          <View style={styles.content}>
            {/* Domain Row */}
            <View style={styles.domainRow}>
              {loading ? (
                <Skeleton.Rect width={24} height={24} borderRadius={radius.sm} />
              ) : (
                <View style={styles.faviconContainer}>
                  <LinearGradient
                    colors={['rgba(10,123,79,0.3)', 'rgba(200,150,62,0.2)']}
                    style={styles.faviconBackground}
                  >
                    <Icon name="link" size="xs" color={colors.emerald} />
                  </LinearGradient>
                </View>
              )}

              {loading ? (
                <Skeleton.Rect width={120} height={14} style={{ marginStart: spacing.sm }} />
              ) : (
                <Text style={styles.domainText} numberOfLines={1}>
                  {metadata?.domain}
                </Text>
              )}
            </View>

            {/* Title */}
            {loading ? (
              <Skeleton.Rect width="100%" height={18} style={{ marginTop: spacing.sm }} />
            ) : (
              <Text style={styles.titleText} numberOfLines={2}>
                {metadata?.title}
              </Text>
            )}

            {/* Description */}
            {loading ? (
              <View style={{ marginTop: spacing.xs }}>
                <Skeleton.Rect width="100%" height={12} />
                <Skeleton.Rect width="80%" height={12} style={{ marginTop: 4 }} />
              </View>
            ) : (
              <Text style={styles.descriptionText} numberOfLines={2}>
                {metadata?.description}
              </Text>
            )}

            {/* Link Indicator */}
            <View style={styles.linkIndicator}>
              <Icon name="link" size="xs" color={colors.text.tertiary} />
              <Text style={styles.linkText}>{t('common.openLink')}</Text>
            </View>
          </View>

          {/* Glass border effect */}
          <View style={styles.glassBorder} />
        </LinearGradient>
      </Animated.View>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  container: {
    borderRadius: radius.lg,
    overflow: 'hidden',
    marginVertical: spacing.xs,
    ...shadow.md,
  },
  gradient: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    overflow: 'hidden',
    position: 'relative',
  },
  imageContainer: {
    height: 160,
    position: 'relative',
  },
  previewImage: {
    width: '100%',
    height: 160,
  },
  imageOverlay: {
    position: 'absolute',
    top: 0,
    start: 0,
    end: 0,
    height: 40,
  },
  imageSkeleton: {
    borderBottomStartRadius: 0,
    borderBottomEndRadius: 0,
  },
  content: {
    padding: spacing.lg,
  },
  domainRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  faviconContainer: {
    marginEnd: spacing.sm,
  },
  faviconBackground: {
    width: 28,
    height: 28,
    borderRadius: radius.sm,
    justifyContent: 'center',
    alignItems: 'center',
  },
  domainText: {
    color: colors.emerald,
    fontSize: fontSize.sm,
    fontWeight: '600',
    flex: 1,
  },
  titleText: {
    color: colors.text.primary,
    fontSize: fontSize.md,
    fontWeight: '700',
    marginBottom: spacing.xs,
    lineHeight: 22,
  },
  descriptionText: {
    color: colors.text.secondary,
    fontSize: fontSize.sm,
    lineHeight: 18,
    marginBottom: spacing.md,
  },
  linkIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  linkText: {
    color: colors.text.tertiary,
    fontSize: fontSize.xs,
    fontWeight: '500',
  },
  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    backgroundColor: colors.dark.bgCard,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.dark.borderLight,
  },
  errorText: {
    color: colors.text.primary,
    fontSize: fontSize.base,
    flex: 1,
  },
  glassBorder: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.03)',
    pointerEvents: 'none',
  },
});