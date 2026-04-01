import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  FadeIn,
  FadeOut,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { Icon } from '@/components/ui/Icon';
import { colors, spacing, fontSize, radius, fonts, fontSizeExt } from '@/theme';
import { useThemeColors } from '@/hooks/useThemeColors';
import { useTranslation } from '@/hooks/useTranslation';

interface UploadProgressBarProps {
  /** 0-100 percentage */
  progress: number;
  /** Whether upload is active */
  visible: boolean;
  /** File being uploaded (e.g., "Photo 2 of 3") */
  label?: string;
  /** Cancel upload handler */
  onCancel?: () => void;
}

/**
 * Premium upload progress bar — emerald gradient fill with spring animation.
 * Shows at the top of compose screens during media upload.
 * Non-blocking: user can continue editing while upload runs.
 */
export function UploadProgressBar({ progress, visible, label, onCancel }: UploadProgressBarProps) {
  const tc = useThemeColors();
  const { t } = useTranslation();
  const fillWidth = useSharedValue(progress);

  // Spring-animate the fill to the current progress (in useEffect to avoid re-triggering on every render)
  React.useEffect(() => {
    fillWidth.value = withSpring(progress, { damping: 20, stiffness: 80, mass: 0.5 });
  }, [progress, fillWidth]);

  const fillStyle = useAnimatedStyle(() => ({
    width: `${Math.min(100, Math.max(0, fillWidth.value))}%`,
  }));

  if (!visible) return null;

  const isComplete = progress >= 100;

  return (
    <Animated.View
      entering={FadeIn.duration(200)}
      exiting={FadeOut.duration(300)}
      style={[styles.container, { backgroundColor: tc.bgElevated, borderColor: tc.border }]}
    >
      {/* Progress track */}
      <View style={styles.trackContainer}>
        <View style={[styles.track, { backgroundColor: tc.surface }]}>
          <Animated.View style={[styles.fill, fillStyle]}>
            <LinearGradient
              colors={isComplete ? [colors.emerald, colors.emeraldLight] : [colors.emerald, colors.gold]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={StyleSheet.absoluteFill}
            />
          </Animated.View>
        </View>

        {/* Percentage text */}
        <Text style={[styles.percentage, { color: isComplete ? colors.emerald : tc.text.primary }]}>
          {isComplete ? (
            <Icon name="check-circle" size={14} color={colors.emerald} />
          ) : (
            `${Math.round(progress)}%`
          )}
        </Text>
      </View>

      {/* Label + cancel row */}
      <View style={styles.infoRow}>
        <View style={styles.labelRow}>
          {!isComplete && (
            <Animated.View
              style={styles.spinner}
            >
              <Icon name="loader" size={14} color={colors.emerald} />
            </Animated.View>
          )}
          <Text style={[styles.label, { color: tc.text.secondary }]} numberOfLines={1}>
            {label || (isComplete ? t('compose.uploadComplete') : t('compose.uploadingMedia'))}
          </Text>
        </View>

        {onCancel && !isComplete && (
          <Pressable
            onPress={onCancel}
            hitSlop={8}
            style={({ pressed }) => [styles.cancelBtn, { opacity: pressed ? 0.6 : 1 }]}
            accessibilityRole="button"
            accessibilityLabel={t('common.cancel')}
          >
            <Icon name="x" size={14} color={tc.text.tertiary} />
          </Pressable>
        )}
      </View>
    </Animated.View>
  );
}

/**
 * Upload a blob to a presigned URL with real progress tracking.
 * Uses XMLHttpRequest instead of fetch() because fetch doesn't support upload progress.
 *
 * @returns Promise that resolves when upload completes, rejects on error.
 */
export function uploadWithProgress(
  url: string,
  blob: Blob,
  contentType: string,
  onProgress: (percent: number) => void,
): { promise: Promise<void>; abort: () => void } {
  const xhr = new XMLHttpRequest();
  let aborted = false;

  const promise = new Promise<void>((resolve, reject) => {
    xhr.open('PUT', url, true);
    xhr.setRequestHeader('Content-Type', contentType);

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && !aborted) {
        const percent = (event.loaded / event.total) * 100;
        onProgress(Math.round(percent));
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress(100);
        resolve();
      } else {
        reject(new Error(`Upload failed (${xhr.status})`));
      }
    };

    xhr.onerror = () => reject(new Error('Upload network error'));
    xhr.ontimeout = () => reject(new Error('Upload timeout'));

    xhr.send(blob);
  });

  return {
    promise,
    abort: () => {
      aborted = true;
      xhr.abort();
    },
  };
}

const styles = StyleSheet.create({
  container: {
    marginHorizontal: spacing.base,
    marginVertical: spacing.sm,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
  },
  trackContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.sm,
  },
  track: {
    flex: 1,
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: 3,
    overflow: 'hidden',
  },
  percentage: {
    fontSize: fontSizeExt.caption,
    fontFamily: fonts.mono,
    fontWeight: '700',
    minWidth: 36,
    textAlign: 'right',
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flex: 1,
  },
  spinner: {
    width: 14,
    height: 14,
  },
  label: {
    fontSize: fontSize.xs,
    fontFamily: fonts.body,
    flex: 1,
  },
  cancelBtn: {
    padding: spacing.xs,
  },
});
