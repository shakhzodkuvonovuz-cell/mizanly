import { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Dimensions,
} from 'react-native';
import Animated, {
  FadeIn,
  FadeOut,
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { Video, ResizeMode } from 'expo-av';
import { ProgressiveImage } from '@/components/ui/ProgressiveImage';
import { Icon } from '@/components/ui/Icon';
import { colors, spacing, fontSize, radius, fonts } from '@/theme';
import { useTranslation } from '@/hooks/useTranslation';
import { useContextualHaptic } from '@/hooks/useContextualHaptic';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

const VIEW_ONCE_PHOTO_DURATION = 10_000; // 10 seconds
const COUNTDOWN_INTERVAL = 100; // update every 100ms

interface ViewOnceMediaProps {
  messageId: string;
  mediaUrl: string;
  mediaType: 'IMAGE' | 'VIDEO';
  isViewed: boolean;
  isSender: boolean;
  onViewed: () => void;
}

export function ViewOnceMedia({
  messageId,
  mediaUrl,
  mediaType,
  isViewed,
  isSender,
  onViewed,
}: ViewOnceMediaProps) {
  const { t } = useTranslation();
  const haptic = useContextualHaptic();
  const [isViewerOpen, setIsViewerOpen] = useState(false);
  const [hasBeenViewed, setHasBeenViewed] = useState(isViewed);

  // Sync external isViewed prop
  useEffect(() => {
    if (isViewed) {
      setHasBeenViewed(true);
    }
  }, [isViewed]);

  const handleTapToView = useCallback(() => {
    if (isSender || hasBeenViewed) return;
    haptic.longPress();
    setIsViewerOpen(true);
  }, [isSender, hasBeenViewed, haptic]);

  const handleViewerClose = useCallback(() => {
    setIsViewerOpen(false);
    if (!hasBeenViewed) {
      setHasBeenViewed(true);
      onViewed();
    }
  }, [hasBeenViewed, onViewed]);

  const pillLabel = getPillLabel(mediaType, hasBeenViewed, isSender, t);
  const pillIconName = hasBeenViewed ? 'clock' as const : 'eye' as const;
  const pillColor = hasBeenViewed
    ? colors.text.tertiary
    : colors.emerald;

  return (
    <>
      <Pressable
        onPress={handleTapToView}
        style={[
          styles.pill,
          hasBeenViewed && styles.pillViewed,
          !hasBeenViewed && !isSender && styles.pillTappable,
        ]}
        accessibilityLabel={pillLabel}
        accessibilityRole="button"
        disabled={isSender || hasBeenViewed}
      >
        <Icon name={pillIconName} size="sm" color={pillColor} />
        <Text
          style={[
            styles.pillText,
            { color: pillColor },
            hasBeenViewed && styles.pillTextViewed,
          ]}
        >
          {pillLabel}
        </Text>
      </Pressable>

      {isViewerOpen && (
        <FullScreenViewer
          mediaUrl={mediaUrl}
          mediaType={mediaType}
          onClose={handleViewerClose}
        />
      )}
    </>
  );
}

function getPillLabel(
  mediaType: 'IMAGE' | 'VIDEO',
  viewed: boolean,
  isSender: boolean,
  t: (key: string) => string,
): string {
  if (viewed) {
    return t('viewOnce.opened');
  }
  if (isSender) {
    return mediaType === 'IMAGE'
      ? t('viewOnce.photo')
      : t('viewOnce.video');
  }
  return mediaType === 'IMAGE'
    ? t('viewOnce.tapToViewPhoto')
    : t('viewOnce.tapToViewVideo');
}

// --- Full-screen viewer overlay ---

interface FullScreenViewerProps {
  mediaUrl: string;
  mediaType: 'IMAGE' | 'VIDEO';
  onClose: () => void;
}

function FullScreenViewer({
  mediaUrl,
  mediaType,
  onClose,
}: FullScreenViewerProps) {
  const { t } = useTranslation();
  const haptic = useContextualHaptic();
  const videoRef = useRef<Video>(null);

  // Countdown for photo
  const [remainingMs, setRemainingMs] = useState(
    mediaType === 'IMAGE' ? VIEW_ONCE_PHOTO_DURATION : 0,
  );
  const countdownProgress = useSharedValue(1);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Photo countdown
  useEffect(() => {
    if (mediaType !== 'IMAGE') return;

    countdownProgress.value = withTiming(0, {
      duration: VIEW_ONCE_PHOTO_DURATION,
      easing: Easing.linear,
    });

    timerRef.current = setInterval(() => {
      setRemainingMs((prev) => {
        const next = prev - COUNTDOWN_INTERVAL;
        if (next <= 0) {
          if (timerRef.current) clearInterval(timerRef.current);
          onClose();
          return 0;
        }
        return next;
      });
    }, COUNTDOWN_INTERVAL);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [mediaType, onClose, countdownProgress]);

  // Video playback end
  const handleVideoStatusUpdate = useCallback(
    (status: { isLoaded: boolean; didJustFinish?: boolean }) => {
      if (status.isLoaded && status.didJustFinish) {
        haptic.navigate();
        onClose();
      }
    },
    [onClose, haptic],
  );

  const handleTapToClose = useCallback(() => {
    if (mediaType === 'IMAGE') {
      if (timerRef.current) clearInterval(timerRef.current);
      haptic.navigate();
      onClose();
    }
  }, [mediaType, onClose, haptic]);

  const countdownRingStyle = useAnimatedStyle(() => ({
    opacity: countdownProgress.value,
  }));

  const remainingSeconds = Math.ceil(remainingMs / 1000);

  return (
    <Animated.View
      entering={FadeIn.duration(200)}
      exiting={FadeOut.duration(200)}
      style={styles.overlay}
    >
      {/* Tap area (photos only) */}
      <Pressable
        style={styles.overlayPressable}
        onPress={handleTapToClose}
        disabled={mediaType === 'VIDEO'}
        accessibilityLabel={t('viewOnce.tapToClose')}
        accessibilityRole="button"
      >
        {/* Top bar */}
        <View style={styles.topBar}>
          <View style={styles.viewOnceLabel}>
            <Icon name="eye" size="xs" color={colors.text.secondary} />
            <Text style={styles.viewOnceLabelText}>
              {t('viewOnce.viewOnce')}
            </Text>
          </View>

          {mediaType === 'IMAGE' && (
            <View style={styles.countdownContainer}>
              <Animated.View style={[styles.countdownRing, countdownRingStyle]}>
                <View style={styles.countdownInner}>
                  <Text style={styles.countdownText}>
                    {remainingSeconds}
                  </Text>
                </View>
              </Animated.View>
            </View>
          )}

          <Pressable
            onPress={() => {
              if (timerRef.current) clearInterval(timerRef.current);
              haptic.navigate();
              onClose();
            }}
            style={styles.closeButton}
            accessibilityLabel={t('common.close')}
            accessibilityRole="button"
            hitSlop={12}
          >
            <Icon name="x" size="md" color={colors.text.primary} />
          </Pressable>
        </View>

        {/* Media */}
        <View style={styles.mediaContainer}>
          {mediaType === 'IMAGE' ? (
            <ProgressiveImage
              uri={mediaUrl}
              width={SCREEN_WIDTH - spacing.base * 2}
              height={SCREEN_HEIGHT * 0.6}
              borderRadius={radius.md}
              contentFit="contain"
            />
          ) : (
            <Video
              ref={videoRef}
              source={{ uri: mediaUrl }}
              style={styles.video}
              resizeMode={ResizeMode.CONTAIN}
              shouldPlay
              isLooping={false}
              onPlaybackStatusUpdate={handleVideoStatusUpdate}
              volume={1}
            />
          )}
        </View>

        {/* Screenshot warning */}
        <View style={styles.warningContainer}>
          <Icon name="eye-off" size="xs" color={colors.text.tertiary} />
          <Text style={styles.warningText}>
            {t('viewOnce.screenshotWarning')}
          </Text>
        </View>

        {/* Tap hint for photos */}
        {mediaType === 'IMAGE' && (
          <Text style={styles.tapHint}>
            {t('viewOnce.tapToClose')}
          </Text>
        )}
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  // Pill (inline in chat bubble)
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
    backgroundColor: colors.active.emerald10,
    alignSelf: 'flex-start',
  },
  pillViewed: {
    backgroundColor: colors.active.white5,
  },
  pillTappable: {
    backgroundColor: colors.active.emerald20,
  },
  pillText: {
    fontFamily: fonts.bodyMedium,
    fontSize: fontSize.sm,
  },
  pillTextViewed: {
    fontStyle: 'italic',
  },

  // Full-screen overlay
  overlay: {
    position: 'absolute',
    top: 0,
    start: 0,
    end: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.95)',
    zIndex: 9999,
  },
  overlayPressable: {
    flex: 1,
  },

  // Top bar
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: spacing['3xl'] + spacing.lg,
    paddingHorizontal: spacing.base,
    paddingBottom: spacing.md,
  },
  viewOnceLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    flex: 1,
  },
  viewOnceLabelText: {
    fontFamily: fonts.bodyMedium,
    fontSize: fontSize.sm,
    color: colors.text.secondary,
  },
  countdownContainer: {
    alignItems: 'center',
  },
  countdownRing: {
    width: 36,
    height: 36,
    borderRadius: radius.full,
    borderWidth: 2,
    borderColor: colors.emerald,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countdownInner: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  countdownText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSize.sm,
    color: colors.text.primary,
  },
  closeButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.full,
  },

  // Media
  mediaContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.base,
  },
  image: {
    width: SCREEN_WIDTH - spacing.base * 2,
    height: SCREEN_HEIGHT * 0.6,
    borderRadius: radius.md,
  },
  video: {
    width: SCREEN_WIDTH - spacing.base * 2,
    height: SCREEN_HEIGHT * 0.6,
    borderRadius: radius.md,
  },

  // Warning
  warningContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.md,
  },
  warningText: {
    fontFamily: fonts.body,
    fontSize: fontSize.xs,
    color: colors.text.tertiary,
  },

  // Tap hint
  tapHint: {
    fontFamily: fonts.body,
    fontSize: fontSize.xs,
    color: colors.text.tertiary,
    textAlign: 'center',
    paddingBottom: spacing['3xl'] + spacing.xl,
  },
});
