import { useState, useEffect, memo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Linking,
  Image,
  Dimensions,
  Pressable,
} from 'react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { Icon } from './Icon';
import { Skeleton } from './Skeleton';
import { colors, spacing, radius, fontSize, shadow } from '@/theme';
import { useThemeColors } from '@/hooks/useThemeColors';

const { width: screenWidth } = Dimensions.get('window');

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

// Mock data generator — in production this would fetch from backend
function generateMockMetadata(url: string): LinkMetadata {
  const urlObj = new URL(url);
  const domain = urlObj.hostname.replace('www.', '');

  // Mock data based on domain
  const mockTitles = [
    'The Future of Social Media in the Muslim World',
    '5 Ways to Improve Your Daily Prayer Focus',
    'Building Community Through Digital Platforms',
    'Islamic Art and Modern Design Fusion',
  ];
  const mockDescriptions = [
    'Exploring how culturally intelligent platforms are reshaping digital connection across the Muslim world.',
    'Practical tips to maintain spiritual focus during daily prayers in a hyper-connected world.',
    'A deep dive into community-building strategies that combine traditional values with modern technology.',
    'How traditional Islamic patterns inspire contemporary UI/UX design in groundbreaking applications.',
  ];

  const randomIndex = Math.floor(Math.random() * mockTitles.length);

  return {
    domain,
    title: mockTitles[randomIndex],
    description: mockDescriptions[randomIndex],
    imageUrl: `https://picsum.photos/seed/${encodeURIComponent(domain)}/400/200`,
    faviconUrl: `https://www.google.com/s2/favicons?domain=${domain}&sz=64`,
  };
}

export const LinkPreview = memo(function LinkPreview({ url, onPress }: LinkPreviewProps) {
  const tc = useThemeColors();
  const [metadata, setMetadata] = useState<LinkMetadata | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    // Simulate network fetch
    const timer = setTimeout(() => {
      try {
        setMetadata(generateMockMetadata(url));
        setLoading(false);
      } catch (err) {
        setError(true);
        setLoading(false);
      }
    }, 800);

    return () => clearTimeout(timer);
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
              <Image
                source={{ uri: metadata.imageUrl }}
                style={styles.previewImage}
                resizeMode="cover"
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
                <Skeleton.Rect width={120} height={14} style={{ marginLeft: spacing.sm }} />
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
              <Text style={styles.linkText}>Open link</Text>
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
    height: '100%',
  },
  imageOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 40,
  },
  imageSkeleton: {
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
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
    marginRight: spacing.sm,
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