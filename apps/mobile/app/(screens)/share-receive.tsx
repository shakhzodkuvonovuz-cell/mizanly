import { useState, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  Pressable,
  Platform,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ProgressiveImage } from '@/components/ui/ProgressiveImage';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeInUp, FadeInDown } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, spacing, fontSize, radius, fonts, shadow } from '@/theme';
import { Icon, type IconName } from '@/components/ui/Icon';
import { GlassHeader } from '@/components/ui/GlassHeader';
import { GradientButton } from '@/components/ui/GradientButton';
import { EmptyState } from '@/components/ui/EmptyState';
import { CharCountRing } from '@/components/ui/CharCountRing';
import { ScreenErrorBoundary } from '@/components/ui/ScreenErrorBoundary';
import { useTranslation } from '@/hooks/useTranslation';
import { useContextualHaptic } from '@/hooks/useContextualHaptic';
import { useThemeColors } from '@/hooks/useThemeColors';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type SpaceKey = 'SAF' | 'MAJLIS' | 'BAKRA' | 'MINBAR';

interface SpaceOption {
  key: SpaceKey;
  labelKey: string;
  icon: IconName;
  accentColor: string;
  accentBg: string;
}

const MAX_CAPTION_LENGTH = 2000;

// ---------------------------------------------------------------------------
// Space configuration
// ---------------------------------------------------------------------------

const SPACES: SpaceOption[] = [
  {
    key: 'SAF',
    labelKey: 'shareReceive.saf',
    icon: 'image',
    accentColor: colors.emerald,
    accentBg: colors.active.emerald10,
  },
  {
    key: 'MAJLIS',
    labelKey: 'shareReceive.majlis',
    icon: 'message-circle',
    accentColor: colors.gold,
    accentBg: colors.active.gold10,
  },
  {
    key: 'BAKRA',
    labelKey: 'shareReceive.bakra',
    icon: 'play',
    accentColor: colors.info,
    accentBg: 'rgba(88, 166, 255, 0.1)',
  },
  {
    key: 'MINBAR',
    labelKey: 'shareReceive.minbar',
    icon: 'video',
    accentColor: '#A855F7',
    accentBg: 'rgba(168, 85, 247, 0.1)',
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Pick the best default space based on which content type was shared. */
function inferDefaultSpace(params: {
  sharedImage?: string;
  sharedVideo?: string;
  sharedText?: string;
  sharedUrl?: string;
}): SpaceKey {
  if (params.sharedImage) return 'SAF';
  if (params.sharedVideo) return 'BAKRA';
  if (params.sharedUrl) return 'MAJLIS';
  return 'MAJLIS'; // text defaults to discussion
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function SharedContentPreview({
  sharedImage,
  sharedVideo,
  sharedText,
  sharedUrl,
  t,
}: {
  sharedImage?: string;
  sharedVideo?: string;
  sharedText?: string;
  sharedUrl?: string;
  t: (key: string) => string;
}) {
  const tc = useThemeColors();
  const styles = createStyles(tc);
  if (sharedImage) {
    return (
      <Animated.View entering={FadeInUp.delay(100).duration(400)} style={styles.previewCard}>
        <ProgressiveImage
          uri={sharedImage}
          width="100%"
          height={220}
          borderRadius={radius.lg}
        />
      </Animated.View>
    );
  }

  if (sharedVideo) {
    return (
      <Animated.View entering={FadeInUp.delay(100).duration(400)} style={styles.previewCard}>
        <View style={styles.videoPlaceholder}>
          <LinearGradient
            colors={['rgba(13,17,23,0.4)', 'rgba(13,17,23,0.8)']}
            style={StyleSheet.absoluteFill}
          />
          <View style={styles.playOverlay}>
            <Icon name="play" size="xl" color={tc.text.primary} />
          </View>
          <Text style={styles.videoLabel} numberOfLines={1}>
            {sharedVideo.split('/').pop() ?? t('shareReceive.preview')}
          </Text>
        </View>
      </Animated.View>
    );
  }

  if (sharedUrl) {
    return (
      <Animated.View entering={FadeInUp.delay(100).duration(400)} style={styles.previewCard}>
        <View style={styles.urlRow}>
          <View style={styles.urlIconWrap}>
            <Icon name="globe" size="md" color={colors.info} />
          </View>
          <View style={styles.urlTextWrap}>
            <Text style={styles.urlLabel}>{t('shareReceive.urlPreview')}</Text>
            <Text style={styles.urlValue} numberOfLines={2}>
              {sharedUrl}
            </Text>
          </View>
        </View>
      </Animated.View>
    );
  }

  if (sharedText) {
    return (
      <Animated.View entering={FadeInUp.delay(100).duration(400)} style={styles.previewCard}>
        <Text style={styles.textPreview} numberOfLines={6}>
          {sharedText}
        </Text>
      </Animated.View>
    );
  }

  return null;
}

function SpaceCard({
  space,
  selected,
  onPress,
  index,
  t,
}: {
  space: SpaceOption;
  selected: boolean;
  onPress: () => void;
  index: number;
  t: (key: string) => string;
}) {
  const tc = useThemeColors();
  const styles = createStyles(tc);
  return (
    <Animated.View
      entering={FadeInUp.delay(200 + index * 80).duration(350)}
      style={styles.spaceCardWrapper}
    >
      <Pressable
        onPress={onPress}
        style={[
          styles.spaceCard,
          { borderColor: selected ? space.accentColor : tc.border },
          selected && { borderWidth: 2 },
        ]}
        accessibilityRole="radio"
        accessibilityState={{ selected }}
        accessibilityLabel={t(space.labelKey)}
      >
        <View style={[styles.spaceIconCircle, { backgroundColor: space.accentBg }]}>
          <Icon name={space.icon} size="md" color={space.accentColor} />
        </View>
        <Text
          style={[
            styles.spaceLabel,
            selected && { color: space.accentColor },
          ]}
          numberOfLines={2}
        >
          {t(space.labelKey)}
        </Text>
        {selected && (
          <View style={[styles.selectedDot, { backgroundColor: space.accentColor }]} />
        )}
      </Pressable>
    </Animated.View>
  );
}

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------

function ShareReceiveContent() {
  const tc = useThemeColors();
  const styles = createStyles(tc);
  const router = useRouter();
  const { t } = useTranslation();
  const haptic = useContextualHaptic();

  const { sharedText, sharedImage, sharedVideo, sharedUrl } = useLocalSearchParams<{
    sharedText?: string;
    sharedImage?: string;
    sharedVideo?: string;
    sharedUrl?: string;
  }>();

  const hasContent = !!(sharedText || sharedImage || sharedVideo || sharedUrl);

  const [selectedSpace, setSelectedSpace] = useState<SpaceKey>(
    inferDefaultSpace({ sharedImage, sharedVideo, sharedText, sharedUrl }),
  );
  const [caption, setCaption] = useState(sharedText ?? '');

  const handleSpaceSelect = useCallback(
    (key: SpaceKey) => {
      haptic.tick();
      setSelectedSpace(key);
    },
    [haptic],
  );

  const handleShare = useCallback(() => {
    haptic.success();

    const prefillMedia = sharedImage || sharedVideo || sharedUrl || '';

    type ScreenPath =
      | '/(screens)/create-post'
      | '/(screens)/create-thread'
      | '/(screens)/create-reel'
      | '/(screens)/create-video';

    const pathMap: Record<SpaceKey, ScreenPath> = {
      SAF: '/(screens)/create-post',
      MAJLIS: '/(screens)/create-thread',
      BAKRA: '/(screens)/create-reel',
      MINBAR: '/(screens)/create-video',
    };

    router.push({
      pathname: pathMap[selectedSpace],
      params: {
        prefillContent: caption,
        prefillMedia,
      },
    });
  }, [haptic, selectedSpace, caption, sharedImage, sharedVideo, sharedUrl, router]);

  const captionLength = useMemo(() => caption.length, [caption]);

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  if (!hasContent) {
    return (
      <SafeAreaView style={styles.container}>
        <GlassHeader
          title={t('shareReceive.title')}
          leftAction={{
            icon: 'arrow-left',
            onPress: () => router.back(),
            accessibilityLabel: t('common.back'),
          }}
        />
        <View style={styles.emptyWrapper}>
          <EmptyState
            icon="share"
            title={t('shareReceive.noContent')}
            subtitle={t('common.retry')}
          />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <GlassHeader
        title={t('shareReceive.title')}
        leftAction={{
          icon: 'arrow-left',
          onPress: () => router.back(),
          accessibilityLabel: t('common.back'),
        }}
      />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Shared content preview */}
        <Animated.View entering={FadeInUp.delay(50).duration(350)}>
          <Text style={styles.sectionTitle}>{t('shareReceive.preview')}</Text>
        </Animated.View>

        <SharedContentPreview
          sharedImage={sharedImage}
          sharedVideo={sharedVideo}
          sharedText={sharedText}
          sharedUrl={sharedUrl}
          t={t}
        />

        {/* Space selector */}
        <Animated.View entering={FadeInUp.delay(180).duration(350)}>
          <Text style={styles.sectionTitle}>{t('shareReceive.selectSpace')}</Text>
        </Animated.View>

        <View style={styles.spacesGrid}>
          {SPACES.map((space, index) => (
            <SpaceCard
              key={space.key}
              space={space}
              selected={selectedSpace === space.key}
              onPress={() => handleSpaceSelect(space.key)}
              index={index}
              t={t}
            />
          ))}
        </View>

        {/* Caption input */}
        <Animated.View entering={FadeInDown.delay(500).duration(350)} style={styles.captionSection}>
          <View style={styles.captionHeader}>
            <Text style={styles.sectionTitle}>{t('shareReceive.addCaption')}</Text>
            <CharCountRing current={captionLength} max={MAX_CAPTION_LENGTH} size={28} />
          </View>
          <TextInput
            style={styles.captionInput}
            value={caption}
            onChangeText={setCaption}
            placeholder={t('shareReceive.addCaption')}
            placeholderTextColor={tc.text.tertiary}
            multiline
            maxLength={MAX_CAPTION_LENGTH}
            textAlignVertical="top"
            selectionColor={colors.emerald}
            accessibilityLabel={t('shareReceive.addCaption')}
          />
        </Animated.View>

        {/* Share button */}
        <Animated.View entering={FadeInDown.delay(600).duration(350)} style={styles.shareButton}>
          <GradientButton
            label={t('shareReceive.share')}
            icon="send"
            onPress={handleShare}
            size="lg"
            fullWidth
          />
        </Animated.View>
      </ScrollView>
    </SafeAreaView>
  );
}

export default function ShareReceiveScreen() {
  return (
    <ScreenErrorBoundary>
      <ShareReceiveContent />
    </ScreenErrorBoundary>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const createStyles = (tc: ReturnType<typeof useThemeColors>) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: tc.bg,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingTop: Platform.OS === 'ios' ? 100 : 80,
    paddingHorizontal: spacing.base,
    paddingBottom: spacing['2xl'],
  },
  emptyWrapper: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sectionTitle: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSize.md,
    color: tc.text.primary,
    marginBottom: spacing.md,
    marginTop: spacing.lg,
  },

  // Preview card
  previewCard: {
    backgroundColor: tc.bgCard,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: tc.border,
    overflow: 'hidden',
  },
  previewImage: {
    width: '100%',
    height: 220,
    borderRadius: radius.lg,
  },
  videoPlaceholder: {
    width: '100%',
    height: 200,
    backgroundColor: tc.surface,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: radius.lg,
  },
  playOverlay: {
    width: 56,
    height: 56,
    borderRadius: radius.full,
    backgroundColor: 'rgba(10, 123, 79, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    ...shadow.md,
  },
  videoLabel: {
    fontFamily: fonts.body,
    fontSize: fontSize.sm,
    color: tc.text.secondary,
    marginTop: spacing.sm,
    paddingHorizontal: spacing.base,
    paddingBottom: spacing.sm,
  },
  urlRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.base,
  },
  urlIconWrap: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: 'rgba(88, 166, 255, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginEnd: spacing.md,
  },
  urlTextWrap: {
    flex: 1,
  },
  urlLabel: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSize.sm,
    color: tc.text.secondary,
    marginBottom: spacing.xs,
  },
  urlValue: {
    fontFamily: fonts.body,
    fontSize: fontSize.base,
    color: colors.info,
  },
  textPreview: {
    fontFamily: fonts.body,
    fontSize: fontSize.base,
    color: tc.text.primary,
    padding: spacing.base,
    lineHeight: 22,
  },

  // Space selector grid
  spacesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  spaceCardWrapper: {
    width: '47%',
    flexGrow: 1,
  },
  spaceCard: {
    backgroundColor: tc.bgCard,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: tc.border,
    padding: spacing.base,
    alignItems: 'center',
    minHeight: 110,
    justifyContent: 'center',
  },
  spaceIconCircle: {
    width: 48,
    height: 48,
    borderRadius: radius.full,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  spaceLabel: {
    fontFamily: fonts.bodyMedium,
    fontSize: fontSize.sm,
    color: tc.text.secondary,
    textAlign: 'center',
  },
  selectedDot: {
    position: 'absolute',
    top: spacing.sm,
    end: spacing.sm,
    width: 8,
    height: 8,
    borderRadius: radius.full,
  },

  // Caption
  captionSection: {
    marginTop: spacing.sm,
  },
  captionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  captionInput: {
    backgroundColor: tc.bgCard,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: tc.border,
    padding: spacing.base,
    minHeight: 100,
    fontFamily: fonts.body,
    fontSize: fontSize.base,
    color: tc.text.primary,
  },

  // Share button
  shareButton: {
    marginTop: spacing.xl,
  },
});
