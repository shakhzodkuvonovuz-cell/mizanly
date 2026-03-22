import { useState, useRef, useCallback } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Video, ResizeMode } from 'expo-av';
import Animated, { FadeIn, FadeInUp } from 'react-native-reanimated';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Avatar } from '@/components/ui/Avatar';
import { Icon } from '@/components/ui/Icon';
import { GradientButton } from '@/components/ui/GradientButton';
import { EmptyState } from '@/components/ui/EmptyState';
import { colors, spacing, fontSize, radius } from '@/theme';
import { reelsApi, uploadApi } from '@/services/api';
import { useTranslation } from '@/hooks/useTranslation';
import { useContextualHaptic } from '@/hooks/useContextualHaptic';
import { useThemeColors } from '@/hooks/useThemeColors';

interface VideoReplySheetProps {
  visible: boolean;
  onClose: () => void;
  commentId: string;
  commentType: 'post' | 'reel';
  commentText: string;
  commentAuthor: { username: string; avatarUrl: string | null };
  onPosted?: () => void;
}

type CameraFacing = 'front' | 'back';

const MAX_DURATION_SEC = 60;

function formatTimer(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export function VideoReplySheet({
  visible,
  onClose,
  commentId,
  commentType,
  commentText,
  commentAuthor,
  onPosted,
}: VideoReplySheetProps) {
  const { t } = useTranslation();
  const haptic = useContextualHaptic();
  const tc = useThemeColors();

  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [facing, setFacing] = useState<CameraFacing>('front');
  const [flashEnabled, setFlashEnabled] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordedUri, setRecordedUri] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [isPosting, setIsPosting] = useState(false);

  const toggleFacing = useCallback(() => {
    haptic.tick();
    setFacing((prev) => (prev === 'front' ? 'back' : 'front'));
  }, [haptic]);

  const toggleFlash = useCallback(() => {
    haptic.tick();
    setFlashEnabled((prev) => !prev);
  }, [haptic]);

  const startRecording = useCallback(async () => {
    if (!cameraRef.current) return;
    haptic.send();
    setIsRecording(true);
    setElapsed(0);

    timerRef.current = setInterval(() => {
      setElapsed((prev) => {
        if (prev >= MAX_DURATION_SEC - 1) {
          // Auto-stop at max duration
          stopRecording();
          return MAX_DURATION_SEC;
        }
        return prev + 1;
      });
    }, 1000);

    try {
      const result = await cameraRef.current.recordAsync({
        maxDuration: MAX_DURATION_SEC,
      });
      if (result?.uri) {
        setRecordedUri(result.uri);
      }
    } catch {
      // Recording may have been stopped externally
    }
  }, [haptic]);

  const stopRecording = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setIsRecording(false);
    cameraRef.current?.stopRecording();
  }, []);

  const handleRetake = useCallback(() => {
    haptic.tick();
    setRecordedUri(null);
    setElapsed(0);
  }, [haptic]);

  const handlePost = useCallback(async () => {
    if (!recordedUri) return;
    haptic.send();
    setIsPosting(true);

    try {
      // Step 1: Get presigned URL
      const presign = await uploadApi.getPresignUrl('video/mp4', 'video-replies');
      const uploadData = await presign;

      // Step 2: Upload video
      const videoBlob = await fetch(recordedUri).then((r) => r.blob());
      const uploadRes = await fetch(uploadData.uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': 'video/mp4' },
        body: videoBlob,
      });

      if (!uploadRes.ok) {
        throw new Error('Upload failed');
      }

      // Step 3: Create video reply via comment with video URL
      // TODO: Video reply format needs backend parsing support — currently stored as text
      // The commentId here refers to the parent comment, but reelsApi.comment expects a reelId
      // For now, we send the video URL as a media attachment hint
      await reelsApi.comment(commentId, uploadData.publicUrl);

      haptic.success();
      onPosted?.();
      handleClose();
    } catch {
      haptic.error();
    } finally {
      setIsPosting(false);
    }
  }, [recordedUri, commentId, haptic, onPosted]);

  const handleClose = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setIsRecording(false);
    setRecordedUri(null);
    setElapsed(0);
    setFacing('front');
    setFlashEnabled(false);
    onClose();
  }, [onClose]);

  const renderContent = () => {
    // No camera permission
    if (!permission?.granted) {
      return (
        <View style={styles.permissionContainer}>
          <EmptyState
            icon="camera"
            title={t('videoReply.cameraPermissionTitle')}
            subtitle={t('videoReply.cameraPermissionSubtitle')}
            actionLabel={t('videoReply.grantPermission')}
            onAction={requestPermission}
          />
        </View>
      );
    }

    return (
      <View style={styles.content}>
        {/* Original comment card */}
        <Animated.View entering={FadeIn.duration(300)} style={[styles.commentCard, { backgroundColor: tc.bgCard, borderColor: tc.border }]}>
          <Avatar
            uri={commentAuthor.avatarUrl}
            name={commentAuthor.username}
            size="sm"
          />
          <View style={styles.commentInfo}>
            <Text style={styles.commentUsername} numberOfLines={1}>
              @{commentAuthor.username}
            </Text>
            <Text style={styles.commentTextPreview} numberOfLines={2}>
              &ldquo;{commentText}&rdquo;
            </Text>
          </View>
        </Animated.View>

        {/* Camera preview or recorded video */}
        {recordedUri ? (
          <Animated.View entering={FadeInUp.duration(300)} style={styles.previewContainer}>
            <Video
              source={{ uri: recordedUri }}
              style={styles.cameraPreview}
              resizeMode={ResizeMode.COVER}
              useNativeControls
              isLooping
              shouldPlay
            />
          </Animated.View>
        ) : (
          <View style={[styles.previewContainer, { backgroundColor: tc.surface }]}>
            <CameraView
              ref={cameraRef}
              style={styles.cameraPreview}
              facing={facing}
              mode="video"
              flash={flashEnabled ? 'on' : 'off'}
            />
            {isRecording && (
              <Animated.View entering={FadeIn} style={styles.recordingIndicator}>
                <View style={styles.recordingDot} />
                <Text style={styles.recordingText}>{t('videoReply.recording')}</Text>
              </Animated.View>
            )}
          </View>
        )}

        {/* Timer */}
        <View style={styles.timerRow}>
          <Icon name="clock" size="sm" color={colors.text.secondary} />
          <Text style={styles.timerText}>
            {formatTimer(elapsed)} / {formatTimer(MAX_DURATION_SEC)}
          </Text>
        </View>

        {/* Controls */}
        {recordedUri ? (
          <Animated.View entering={FadeIn.duration(200)} style={styles.postControls}>
            <GradientButton
              label={t('videoReply.retake')}
              variant="secondary"
              onPress={handleRetake}
              icon="camera"
              disabled={isPosting}
            />
            <GradientButton
              label={t('videoReply.postReply')}
              variant="primary"
              onPress={handlePost}
              icon="send"
              loading={isPosting}
            />
          </Animated.View>
        ) : (
          <View style={styles.cameraControls}>
            {/* Flip camera */}
            <Pressable
              style={[styles.controlButton, { backgroundColor: tc.surface, borderColor: tc.border }]}
              onPress={toggleFacing}
              accessibilityLabel={t('videoReply.flipCamera')}
              accessibilityRole="button"
            >
              <Icon name="repeat" size="md" color={colors.text.primary} />
            </Pressable>

            {/* Record button */}
            <Pressable
              style={[styles.recordButton, isRecording && styles.recordButtonActive]}
              onPress={isRecording ? stopRecording : startRecording}
              accessibilityLabel={isRecording ? t('videoReply.stopRecording') : t('videoReply.startRecording')}
              accessibilityRole="button"
            >
              <View style={[styles.recordButtonInner, isRecording && styles.recordButtonInnerActive]} />
            </Pressable>

            {/* Flash toggle */}
            <Pressable
              style={[styles.controlButton, { backgroundColor: tc.surface, borderColor: tc.border }]}
              onPress={toggleFlash}
              accessibilityLabel={t('videoReply.toggleFlash')}
              accessibilityRole="button"
            >
              <Icon
                name={flashEnabled ? 'eye' : 'eye-off'}
                size="md"
                color={flashEnabled ? colors.gold : colors.text.primary}
              />
            </Pressable>
          </View>
        )}
      </View>
    );
  };

  return (
    <BottomSheet visible={visible} onClose={handleClose} snapPoint={0.9}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>{t('videoReply.title')}</Text>
        <Pressable
          onPress={handleClose}
          hitSlop={8}
          accessibilityLabel={t('common.close')}
          accessibilityRole="button"
        >
          <Icon name="x" size="md" color={colors.text.secondary} />
        </Pressable>
      </View>
      {renderContent()}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.base,
    paddingBottom: spacing.sm,
  },
  headerTitle: {
    color: colors.text.primary,
    fontSize: fontSize.md,
    fontWeight: '700',
  },
  content: {
    paddingHorizontal: spacing.base,
    paddingBottom: spacing.lg,
  },
  permissionContainer: {
    paddingVertical: spacing['2xl'],
    paddingHorizontal: spacing.base,
  },
  commentCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    backgroundColor: colors.dark.bgCard,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
    borderWidth: 0.5,
    borderColor: colors.dark.border,
  },
  commentInfo: {
    flex: 1,
    gap: spacing.xs,
  },
  commentUsername: {
    color: colors.emerald,
    fontSize: fontSize.sm,
    fontWeight: '600',
  },
  commentTextPreview: {
    color: colors.text.secondary,
    fontSize: fontSize.sm,
    fontStyle: 'italic',
  },
  previewContainer: {
    width: '100%',
    aspectRatio: 9 / 16,
    maxHeight: 360,
    borderRadius: radius.lg,
    overflow: 'hidden',
    backgroundColor: colors.dark.surface,
    marginBottom: spacing.md,
    position: 'relative',
  },
  cameraPreview: {
    flex: 1,
  },
  recordingIndicator: {
    position: 'absolute',
    top: spacing.md,
    left: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.sm,
  },
  recordingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.error,
  },
  recordingText: {
    color: '#fff',
    fontSize: fontSize.xs,
    fontWeight: '600',
  },
  timerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    marginBottom: spacing.md,
  },
  timerText: {
    color: colors.text.secondary,
    fontSize: fontSize.sm,
    fontWeight: '500',
  },
  cameraControls: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing['2xl'],
  },
  controlButton: {
    width: 48,
    height: 48,
    borderRadius: radius.full,
    backgroundColor: colors.dark.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 0.5,
    borderColor: colors.dark.border,
  },
  recordButton: {
    width: 72,
    height: 72,
    borderRadius: radius.full,
    borderWidth: 4,
    borderColor: colors.text.primary,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 4,
  },
  recordButtonActive: {
    borderColor: colors.error,
  },
  recordButtonInner: {
    width: '100%',
    height: '100%',
    borderRadius: radius.full,
    backgroundColor: colors.error,
  },
  recordButtonInnerActive: {
    borderRadius: radius.sm,
    width: 28,
    height: 28,
  },
  postControls: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.md,
  },
});
