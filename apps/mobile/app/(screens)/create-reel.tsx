import { useRef, useEffect, useMemo } from 'react';
import {
  View, Text, StyleSheet, TextInput,
  ScrollView, Alert, useWindowDimensions, Pressable,
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeIn, FadeInUp, FadeOut } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { GlassHeader } from '@/components/ui/GlassHeader';
import { useUser } from '@clerk/clerk-expo';
import * as ImagePicker from 'expo-image-picker';
import { Video, ResizeMode } from 'expo-av';
import { CameraView } from 'expo-camera';
import { Avatar } from '@/components/ui/Avatar';
import { ProgressiveImage } from '@/components/ui/ProgressiveImage';
import { Icon } from '@/components/ui/Icon';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { CharCountRing } from '@/components/ui/CharCountRing';
import { Autocomplete } from '@/components/ui/Autocomplete';
import { colors, spacing, fontSize, radius, fonts } from '@/theme';
import { useTranslation } from '@/hooks/useTranslation';
import { useThemeColors } from '@/hooks/useThemeColors';
import { ScreenErrorBoundary } from '@/components/ui/ScreenErrorBoundary';
import { navigate } from '@/utils/navigation';
import { showToast } from '@/components/ui/Toast';
import { MusicPicker } from '@/components/story/MusicPicker';
import { useReelCapture } from '@/hooks/create/useReelCapture';
import { useReelEdit, type ReelTransitionType } from '@/hooks/create/useReelEdit';
import { useReelPublish } from '@/hooks/create/useReelPublish';

export default function CreateReelScreen() {
  const routeParams = useLocalSearchParams<{ videoUri?: string; edited?: string; isDuet?: string; duetOfId?: string; isStitch?: string; stitchOfId?: string }>();
  const tc = useThemeColors();
  const insets = useSafeAreaInsets();
  const { user } = useUser();
  const { t } = useTranslation();
  const { width: SCREEN_W } = useWindowDimensions();
  const VIDEO_PREVIEW_WIDTH = useMemo(() => SCREEN_W - spacing.base * 2, [SCREEN_W]);
  const VIDEO_PREVIEW_HEIGHT = useMemo(() => VIDEO_PREVIEW_WIDTH * (16 / 9), [VIDEO_PREVIEW_WIDTH]);
  const styles = useMemo(() => createStyles(tc, VIDEO_PREVIEW_WIDTH, VIDEO_PREVIEW_HEIGHT), [tc, VIDEO_PREVIEW_WIDTH, VIDEO_PREVIEW_HEIGHT]);

  const videoRef = useRef<Video>(null);

  // ── Hooks ──
  const capture = useReelCapture(t, routeParams.videoUri);
  const edit = useReelEdit(t);
  const publish = useReelPublish(
    () => {
      if (!capture.video) return null;
      return {
        videoUri: capture.video.uri,
        videoDuration: capture.video.duration,
        caption: edit.caption,
        hashtags: edit.hashtags,
        mentions: edit.mentions,
        normalizeAudio: edit.normalizeAudio,
        thumbnailUri: capture.thumbnailUri,
        selectedTrack: edit.selectedTrack,
        isDuet: routeParams.isDuet === 'true',
        duetOfId: routeParams.duetOfId || undefined,
        isStitch: routeParams.isStitch === 'true',
        stitchOfId: routeParams.stitchOfId || undefined,
      };
    },
    t,
  );

  // Draft persistence
  const clipsRef = useRef(capture.clips);
  const captionRef = useRef(edit.caption);
  useEffect(() => { clipsRef.current = capture.clips; }, [capture.clips]);
  useEffect(() => { captionRef.current = edit.caption; }, [edit.caption]);

  useEffect(() => {
    edit.restoreDraft(capture.setClips, edit.setCaption);
    return () => {
      edit.saveDraftOnUnmount(clipsRef.current, captionRef.current);
    };
  }, []);

  const hasContent = !!capture.video || edit.caption.trim().length > 0;

  return (
    <ScreenErrorBoundary>
      <View style={[styles.container, { backgroundColor: tc.bg }]}>
        <GlassHeader
          title={t('createReel.title')}
          leftAction={{ icon: 'arrow-left', onPress: () => publish.handleBack(hasContent), accessibilityLabel: t('common.back') }}
          rightActions={[{ icon: 'send', onPress: publish.handleUpload, accessibilityLabel: t('common.share') }]}
        />

        <ScrollView style={styles.scroll} contentContainerStyle={[styles.scrollContent, { paddingTop: insets.top + 52 }]} keyboardShouldPersistTaps="handled">
          {/* Countdown Overlay */}
          {edit.countdown !== null && (
            <View style={styles.countdownOverlay}>
              <Animated.View style={[styles.countdownContainer, edit.countdownStyle]}>
                <LinearGradient
                  colors={[colors.emerald, colors.extended.greenDark]}
                  style={styles.countdownCircle}
                >
                  <Text style={styles.countdownText}>{edit.countdown}</Text>
                </LinearGradient>
              </Animated.View>
            </View>
          )}

          {/* Video preview with focus ring */}
          {capture.video ? (
            <Animated.View entering={FadeInUp} style={styles.videoContainer}>
              <LinearGradient
                colors={[colors.emerald, colors.gold, colors.emerald]}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                style={styles.focusRing}
              >
                <View style={styles.videoInner}>
                  <Video
                    ref={videoRef}
                    source={{ uri: capture.video.uri }}
                    style={[styles.videoPreview, { backgroundColor: tc.surface }]}
                    resizeMode={ResizeMode.COVER}
                    useNativeControls
                    isLooping
                    onLoad={(status) => {
                      if (status.isLoaded && status.durationMillis && capture.video?.duration === 0) {
                        capture.setVideo(prev => prev ? { ...prev, duration: status.durationMillis! / 1000 } : prev);
                      }
                    }}
                  />
                </View>
              </LinearGradient>

              <View style={styles.videoInfoBadge}>
                <LinearGradient colors={['rgba(0,0,0,0.7)', 'rgba(0,0,0,0.5)']} style={styles.videoInfoGradient}>
                  <Icon name="play" size={12} color="#fff" />
                  <Text style={styles.videoInfoText}>{Math.floor(capture.video.duration)}s</Text>
                </LinearGradient>
              </View>

              <Pressable accessibilityRole="button" accessibilityLabel={t('common.edit')} style={styles.editVideoButton} onPress={() => navigate('/(screens)/video-editor', { videoUri: capture.video?.uri ?? '', returnTo: '/(screens)/create-reel' })} hitSlop={8}>
                <LinearGradient colors={['rgba(10,123,79,0.9)', 'rgba(6,107,66,0.9)']} style={styles.editVideoGradient}>
                  <Icon name="scissors" size="sm" color="#fff" />
                </LinearGradient>
              </Pressable>

              <Pressable accessibilityLabel={t('accessibility.close')} accessibilityRole="button" style={styles.removeVideoButton} onPress={capture.removeVideo} hitSlop={8}>
                <LinearGradient colors={['rgba(248,81,73,0.9)', 'rgba(200,60,50,0.9)']} style={styles.removeVideoGradient}>
                  <Icon name="x" size="sm" color="#fff" />
                </LinearGradient>
              </Pressable>
            </Animated.View>
          ) : capture.showCamera ? (
            <View style={styles.cameraSection}>
              <View style={styles.modeToggle}>
                <Pressable accessibilityLabel={t('accessibility.close')} accessibilityRole="button" onPress={() => capture.setShowCamera(false)} style={[styles.modeTab, !capture.showCamera && styles.modeTabActive]}>
                  <Icon name="image" size="sm" color={!capture.showCamera ? '#FFF' : tc.text.secondary} />
                  <Text style={[styles.modeText, !capture.showCamera && styles.modeTextActive]}>{t('createReel.gallery')}</Text>
                </Pressable>
                <Pressable accessibilityLabel={t('accessibility.openCamera')} accessibilityRole="button" onPress={capture.handleOpenCamera} style={[styles.modeTab, capture.showCamera && styles.modeTabActive]}>
                  <Icon name="camera" size="sm" color={capture.showCamera ? '#FFF' : tc.text.secondary} />
                  <Text style={[styles.modeText, capture.showCamera && styles.modeTextActive]}>{t('createReel.record')}</Text>
                </Pressable>
              </View>

              <View style={styles.cameraContainer}>
                <CameraView ref={capture.cameraRef} style={styles.camera} facing={capture.facing} mode="video" />

                {capture.isRecording && (
                  <View style={styles.cameraTimerOverlay}>
                    <View style={styles.cameraTimerBadge}>
                      <View style={styles.cameraRecordingDot} />
                      <Text style={styles.cameraTimerText}>{capture.formatRecordTime(capture.recordTime)}</Text>
                    </View>
                  </View>
                )}

                <View style={styles.cameraControls}>
                  <Pressable accessibilityRole="button" onPress={() => capture.setFacing(capture.facing === 'back' ? 'front' : 'back')} style={styles.cameraFlipButton}>
                    <Icon name="repeat" size="md" color="#fff" />
                  </Pressable>
                  <Pressable accessibilityRole="button" accessibilityLabel={t('createReel.timerRecord')} onPress={() => { if (!capture.isRecording) edit.startCountdown(() => capture.handleCameraRecord()); }} style={styles.cameraFlipButton}>
                    <Icon name="clock" size="md" color="#fff" />
                  </Pressable>
                  <Pressable accessibilityRole="button" onPress={capture.handleCameraRecord} style={styles.recordButton}>
                    <View style={styles.recordButtonOuter}>
                      {capture.isRecording ? <View style={styles.recordDotActive} /> : <View style={styles.recordDot} />}
                    </View>
                  </Pressable>
                  {capture.clips.length > 0 && !capture.isRecording ? (
                    <Pressable accessibilityRole="button" accessibilityLabel={t('createReel.deleteLastClip')} onPress={capture.deleteLastClip} style={styles.cameraFlipButton}>
                      <Icon name="trash" size="md" color={colors.error} />
                    </Pressable>
                  ) : (
                    <Pressable accessibilityLabel={t('accessibility.close')} accessibilityRole="button" onPress={() => {
                      if (capture.clips.length > 0) {
                        Alert.alert(t('createReel.discardClips'), t('createReel.discardClipsMessage'), [
                          { text: t('common.cancel'), style: 'cancel' },
                          { text: t('createReel.discard'), style: 'destructive', onPress: () => { capture.setShowCamera(false); capture.setClips([]); } },
                        ]);
                      } else {
                        capture.setShowCamera(false);
                      }
                    }} style={styles.cameraFlipButton}>
                      <Icon name="x" size="md" color="#fff" />
                    </Pressable>
                  )}
                </View>

                {capture.clips.length > 0 && !capture.isRecording && (
                  <View style={styles.clipBar}>
                    <View style={styles.clipCountBadge}>
                      <Text style={styles.clipCountText}>
                        {capture.clips.length} {capture.clips.length === 1 ? t('createReel.clip') : t('createReel.clips')} · {capture.formatRecordTime(capture.totalClipsDuration)}
                      </Text>
                    </View>
                    {capture.clips.length >= 2 && (
                      <Pressable accessibilityLabel={t('accessibility.selectCategory')} accessibilityRole="button" style={styles.transitionBadge} onPress={() => {
                        const types: ReelTransitionType[] = ['none', 'fade', 'dissolve', 'wipeleft', 'slideup'];
                        const idx = types.indexOf(edit.clipTransition);
                        edit.setClipTransition(types[(idx + 1) % types.length]);
                      }}>
                        <Icon name="layers" size={12} color={edit.clipTransition !== 'none' ? colors.emerald : colors.text.onColor} />
                        <Text style={[styles.clipCountText, edit.clipTransition !== 'none' && { color: colors.emerald }]}>
                          {edit.clipTransition === 'none' ? t('createReel.noTransition') : edit.clipTransition}
                        </Text>
                      </Pressable>
                    )}
                    <Pressable accessibilityRole="button" accessibilityLabel={t('createReel.doneRecording')} style={styles.clipDoneButton} onPress={capture.finalizeClips}>
                      <LinearGradient colors={[colors.emerald, 'rgba(6,107,66,0.95)']} style={styles.clipDoneGradient}>
                        <Icon name="check" size="sm" color="#fff" />
                        <Text style={styles.clipDoneText}>{t('createReel.doneRecording')}</Text>
                      </LinearGradient>
                    </Pressable>
                  </View>
                )}

                {capture.totalClipsDuration > 0 && (
                  <View style={styles.clipProgressBar}>
                    <View style={[styles.clipProgressFill, { width: `${Math.min(100, (capture.totalClipsDuration / 60) * 100)}%` }]} />
                  </View>
                )}
              </View>
            </View>
          ) : (
            <View>
              <View style={styles.modeToggle}>
                <Pressable accessibilityLabel={t('accessibility.close')} accessibilityRole="button" onPress={() => capture.setShowCamera(false)} style={[styles.modeTab, !capture.showCamera && styles.modeTabActive]}>
                  <Icon name="image" size="sm" color={!capture.showCamera ? '#FFF' : tc.text.secondary} />
                  <Text style={[styles.modeText, !capture.showCamera && styles.modeTextActive]}>{t('createReel.gallery')}</Text>
                </Pressable>
                <Pressable accessibilityLabel={t('accessibility.openCamera')} accessibilityRole="button" onPress={capture.handleOpenCamera} style={[styles.modeTab, capture.showCamera && styles.modeTabActive]}>
                  <Icon name="camera" size="sm" color={capture.showCamera ? '#FFF' : tc.text.secondary} />
                  <Text style={[styles.modeText, capture.showCamera && styles.modeTextActive]}>{t('createReel.record')}</Text>
                </Pressable>
              </View>

              <Pressable accessibilityRole="button" accessibilityLabel={t('accessibility.pickVideo')} style={[styles.uploadPlaceholder, { backgroundColor: tc.surface, borderColor: tc.border }]} onPress={capture.pickVideo}>
                <LinearGradient colors={['rgba(10,123,79,0.1)', 'rgba(200,150,62,0.05)']} style={styles.uploadPlaceholderGradient}>
                  <View style={styles.uploadIconContainer}>
                    <Icon name="video" size="xl" color={colors.emerald} />
                  </View>
                  <Text style={styles.uploadText}>{t('createReel.selectVideo')}</Text>
                  <Text style={styles.uploadSubtext}>{t('createReel.videoRequirements')}</Text>
                </LinearGradient>
              </Pressable>
            </View>
          )}

          {/* Thumbnail filmstrip */}
          {capture.video && capture.thumbnailOptions.length > 0 && (
            <View style={styles.thumbnailSection}>
              <Text style={styles.sectionLabel}>{t('createReel.selectThumbnail')}</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm }}>
                {capture.thumbnailOptions.map((frame) => (
                  <Pressable accessibilityRole="button" key={frame} onPress={() => { capture.setThumbnailUri(frame); capture.setCustomThumbnail(false); }} style={[styles.thumbnailFrame, capture.thumbnailUri === frame && !capture.customThumbnail && styles.thumbnailFrameSelected]}>
                    <ProgressiveImage uri={frame} width={80} height={45} accessibilityLabel={t('accessibility.contentImage')} />
                  </Pressable>
                ))}
                <Pressable accessibilityLabel={t('accessibility.pickImage')} accessibilityRole="button" onPress={async () => {
                  const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8, exif: false });
                  if (!result.canceled && result.assets[0]) { capture.setThumbnailUri(result.assets[0].uri); capture.setCustomThumbnail(true); }
                }} style={[styles.thumbnailFrame, styles.uploadThumbnailButton]}>
                  <Icon name="image" size="md" color={tc.text.secondary} />
                  <Text style={styles.uploadThumbnailText}>{t('createReel.customThumbnail')}</Text>
                </Pressable>
              </ScrollView>
            </View>
          )}

          {/* Caption */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <LinearGradient colors={[colors.gold, colors.emerald]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.sectionAccent} />
              <Text style={styles.sectionLabel}>{t('createReel.caption')}</Text>
            </View>
            <LinearGradient colors={colors.gradient.cardDark} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.captionCard}>
              <TextInput ref={edit.captionInputRef} style={styles.captionInput} placeholder={t('createReel.captionPlaceholder')} placeholderTextColor={tc.text.tertiary} value={edit.caption} onChangeText={edit.handleCaptionChange} multiline maxLength={500} textAlignVertical="top" />
              <View style={styles.captionFooter}>
                <CharCountRing current={edit.caption.length} max={500} size={28} />
              </View>
            </LinearGradient>
          </View>

          {/* Premium Gradient Toolbar */}
          <View style={styles.toolbarContainer}>
            <LinearGradient colors={['rgba(45,53,72,0.5)', 'rgba(28,35,51,0.3)']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.toolbarCard}>
              <Pressable accessibilityRole="button" style={styles.toolbarButton} onPress={() => edit.handleToolbarPress('hashtag')}>
                <LinearGradient colors={['rgba(10,123,79,0.2)', 'rgba(10,123,79,0.05)']} style={styles.toolbarBtnGradient}>
                  <Icon name="hash" size="md" color={colors.emerald} />
                </LinearGradient>
                <Text style={styles.toolbarLabel}>{t('createReel.hashtag')}</Text>
              </Pressable>
              <Pressable accessibilityRole="button" style={styles.toolbarButton} onPress={() => edit.handleToolbarPress('mention')}>
                <LinearGradient colors={['rgba(200,150,62,0.2)', 'rgba(200,150,62,0.05)']} style={styles.toolbarBtnGradient}>
                  <Icon name="at-sign" size="md" color={colors.gold} />
                </LinearGradient>
                <Text style={styles.toolbarLabel}>{t('createReel.mention')}</Text>
              </Pressable>
              <Pressable accessibilityRole="button" style={styles.toolbarButton} onPress={() => edit.setShowMusicPicker(true)}>
                <LinearGradient colors={edit.selectedTrack ? ['rgba(10,123,79,0.2)', 'rgba(10,123,79,0.05)'] : ['rgba(110,119,129,0.15)', 'rgba(110,119,129,0.05)']} style={styles.toolbarBtnGradient}>
                  <Icon name="music" size="md" color={edit.selectedTrack ? colors.emerald : tc.text.primary} />
                </LinearGradient>
                <Text style={styles.toolbarLabel}>{t('createReel.music')}</Text>
              </Pressable>
              <Pressable accessibilityLabel={t('accessibility.selectCategory')} style={styles.toolbarButton} onPress={() => navigate('/(screens)/reel-templates')} accessibilityRole="button">
                <LinearGradient colors={['rgba(200,150,62,0.2)', 'rgba(200,150,62,0.05)']} style={styles.toolbarBtnGradient}>
                  <Icon name="layers" size="md" color={colors.gold} />
                </LinearGradient>
                <Text style={styles.toolbarLabel}>{t('createReel.templates')}</Text>
              </Pressable>
              <Pressable style={styles.toolbarButton} onPress={() => navigate('/(screens)/schedule-post', { space: 'bakra' })} accessibilityRole="button">
                <LinearGradient colors={['rgba(10,123,79,0.2)', 'rgba(10,123,79,0.05)']} style={styles.toolbarBtnGradient}>
                  <Icon name="clock" size="md" color={colors.emerald} />
                </LinearGradient>
                <Text style={styles.toolbarLabel}>{t('createReel.schedule')}</Text>
              </Pressable>
              <Pressable accessibilityLabel={t('accessibility.pickImage')} style={styles.toolbarButton} onPress={() => navigate('/(screens)/green-screen-editor')} accessibilityRole="button">
                <LinearGradient colors={['rgba(10,123,79,0.2)', 'rgba(10,123,79,0.05)']} style={styles.toolbarBtnGradient}>
                  <Icon name="image" size="md" color={colors.emerald} />
                </LinearGradient>
                <Text style={styles.toolbarLabel}>{t('createReel.greenScreen')}</Text>
              </Pressable>
              <Pressable accessibilityLabel={t('accessibility.selectAudioTrack')} style={styles.toolbarButton} onPress={() => navigate('/(screens)/audio-library')} accessibilityRole="button">
                <LinearGradient colors={['rgba(200,150,62,0.2)', 'rgba(200,150,62,0.05)']} style={styles.toolbarBtnGradient}>
                  <Icon name="music" size="md" color={colors.gold} />
                </LinearGradient>
                <Text style={styles.toolbarLabel}>{t('createReel.audioLibrary')}</Text>
              </Pressable>
            </LinearGradient>
          </View>

          {/* Selected track indicator */}
          {edit.selectedTrack && (
            <Animated.View entering={FadeIn} style={[styles.selectedTrackBar, { backgroundColor: tc.bgCard }]}>
              <Icon name="music" size="sm" color={colors.emerald} />
              <Text style={styles.selectedTrackText} numberOfLines={1}>
                {edit.selectedTrack.title} — {edit.selectedTrack.artist}
              </Text>
              <Pressable accessibilityRole="button" accessibilityLabel={t('accessibility.close')} onPress={() => edit.setSelectedTrack(null)} hitSlop={8}>
                <Icon name="x" size="sm" color={tc.text.secondary} />
              </Pressable>
            </Animated.View>
          )}

          {/* Extracted tags */}
          {(edit.hashtags.length > 0 || edit.mentions.length > 0) && (
            <View style={styles.tagsSection}>
              <View style={styles.sectionHeader}>
                <LinearGradient colors={[colors.emerald, colors.gold]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.sectionAccent} />
                <Text style={styles.sectionLabel}>{t('createReel.tags')}</Text>
              </View>
              <View style={styles.tagsRow}>
                {edit.hashtags.map(tag => (
                  <LinearGradient key={tag} colors={['rgba(10,123,79,0.2)', 'rgba(10,123,79,0.1)']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.tagGradient}>
                    <Icon name="hash" size={12} color={colors.emerald} />
                    <Text style={styles.tagText}>{tag}</Text>
                  </LinearGradient>
                ))}
                {edit.mentions.map(mention => (
                  <LinearGradient key={mention} colors={['rgba(200,150,62,0.2)', 'rgba(200,150,62,0.1)']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.tagGradient}>
                    <Icon name="at-sign" size={12} color={colors.gold} />
                    <Text style={styles.tagTextGold}>{mention}</Text>
                  </LinearGradient>
                ))}
              </View>
            </View>
          )}

          {/* Normalize audio toggle */}
          <View style={[styles.toggleRow, { borderBottomColor: tc.border }]}>
            <View style={{ flex: 1 }}>
              <Text style={styles.toggleLabel}>{t('createReel.normalizeAudio')}</Text>
              <Text style={styles.toggleSubtitle}>{t('createReel.normalizeAudioDesc')}</Text>
            </View>
            <Pressable accessibilityRole="button" onPress={() => edit.setNormalizeAudio(!edit.normalizeAudio)} style={[styles.toggle, edit.normalizeAudio && styles.toggleActive]}>
              <View style={[styles.toggleThumb, edit.normalizeAudio && styles.toggleThumbActive]} />
            </Pressable>
          </View>
        </ScrollView>

        {/* Autocomplete sheets */}
        <BottomSheet visible={edit.showAutocomplete !== null} onClose={() => edit.setShowAutocomplete(null)} snapPoint={0.5}>
          {edit.showAutocomplete === 'hashtag' && (
            <Autocomplete visible type="hashtag" query="" onSelect={(item) => edit.insertAtCursor(`#${item}`)} onClose={() => edit.setShowAutocomplete(null)} />
          )}
          {edit.showAutocomplete === 'mention' && (
            <Autocomplete visible type="mention" query="" onSelect={(item) => edit.insertAtCursor(`@${item}`)} onClose={() => edit.setShowAutocomplete(null)} />
          )}
        </BottomSheet>

        <MusicPicker
          visible={edit.showMusicPicker}
          onClose={() => edit.setShowMusicPicker(false)}
          onSelect={(track) => { edit.setSelectedTrack(track); edit.setShowMusicPicker(false); }}
        />
      </View>
    </ScreenErrorBoundary>
  );
}

const createStyles = (tc: ReturnType<typeof useThemeColors>, VIDEO_PREVIEW_WIDTH = 0, VIDEO_PREVIEW_HEIGHT = 0) => StyleSheet.create({
  container: { flex: 1, backgroundColor: tc.bg },
  scroll: { flex: 1 },
  scrollContent: { padding: spacing.base },
  videoContainer: { position: 'relative', marginBottom: spacing.lg },
  videoPreview: { width: VIDEO_PREVIEW_WIDTH, height: VIDEO_PREVIEW_HEIGHT, borderRadius: radius.md, backgroundColor: tc.surface },
  editVideoButton: { position: 'absolute', top: spacing.sm, end: spacing.sm + 32 + spacing.sm, backgroundColor: 'rgba(0,0,0,0.7)', borderRadius: radius.full, width: 32, height: 32, alignItems: 'center', justifyContent: 'center', zIndex: 10, overflow: 'hidden' },
  editVideoGradient: { width: '100%', height: '100%', borderRadius: radius.full, alignItems: 'center', justifyContent: 'center' },
  removeVideoButton: { position: 'absolute', top: spacing.sm, end: spacing.sm, backgroundColor: 'rgba(0,0,0,0.7)', borderRadius: radius.full, width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  uploadPlaceholder: { width: VIDEO_PREVIEW_WIDTH, height: VIDEO_PREVIEW_HEIGHT, borderRadius: radius.md, backgroundColor: tc.surface, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: tc.border, borderStyle: 'dashed', marginBottom: spacing.lg },
  uploadText: { color: tc.text.primary, fontSize: fontSize.base, fontWeight: '600', marginTop: spacing.sm },
  uploadSubtext: { color: tc.text.secondary, fontSize: fontSize.sm, marginTop: spacing.xs },
  section: { marginBottom: spacing.lg },
  sectionLabel: { color: tc.text.secondary, fontSize: fontSize.sm, fontWeight: '500', marginBottom: spacing.sm },
  captionInput: { color: tc.text.primary, fontSize: fontSize.base, minHeight: 100 },
  captionFooter: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: spacing.sm },
  toolbar: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.lg },
  toolbarButton: { alignItems: 'center', gap: spacing.xs },
  toolbarLabel: { color: tc.text.secondary, fontSize: fontSize.xs },
  tagsSection: { marginBottom: spacing.lg },
  tagsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  tagText: { color: colors.emerald, fontSize: fontSize.sm },
  clipBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.base, paddingVertical: spacing.sm },
  clipCountBadge: { backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: spacing.md, paddingVertical: spacing.xs, borderRadius: radius.full },
  clipCountText: { fontSize: fontSize.sm, color: colors.text.onColor, fontFamily: fonts.mono },
  transitionBadge: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, borderRadius: radius.full },
  clipDoneButton: { borderRadius: radius.full, overflow: 'hidden' },
  clipDoneGradient: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, borderRadius: radius.full },
  clipDoneText: { fontSize: fontSize.sm, fontWeight: '600', color: colors.text.onColor },
  clipProgressBar: { height: 3, backgroundColor: 'rgba(255,255,255,0.2)', marginHorizontal: spacing.base, borderRadius: radius.full },
  clipProgressFill: { height: '100%', backgroundColor: colors.emerald, borderRadius: radius.full },
  countdownOverlay: { position: 'absolute', top: 0, start: 0, end: 0, bottom: 0, zIndex: 100, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(13,17,23,0.8)' },
  countdownContainer: { alignItems: 'center', justifyContent: 'center' },
  countdownCircle: { width: 120, height: 120, borderRadius: radius.full, alignItems: 'center', justifyContent: 'center', shadowColor: colors.emerald, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.5, shadowRadius: 20, elevation: 10 },
  countdownText: { color: colors.text.onColor, fontSize: 60, fontWeight: '700' },
  focusRing: { padding: 3, borderRadius: radius.lg },
  videoInner: { borderRadius: radius.lg - 3, overflow: 'hidden' },
  videoInfoBadge: { position: 'absolute', bottom: spacing.sm, start: spacing.sm },
  videoInfoGradient: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, borderRadius: radius.sm },
  videoInfoText: { color: colors.text.onColor, fontSize: fontSize.sm, fontWeight: '600' },
  removeVideoGradient: { width: 32, height: 32, borderRadius: radius.full, alignItems: 'center', justifyContent: 'center' },
  uploadPlaceholderGradient: { width: VIDEO_PREVIEW_WIDTH, height: VIDEO_PREVIEW_HEIGHT, borderRadius: radius.lg, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: colors.active.emerald30, borderStyle: 'dashed', marginBottom: spacing.lg },
  uploadIconContainer: { width: 64, height: 64, borderRadius: radius.lg, backgroundColor: colors.active.emerald10, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.md },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm },
  sectionAccent: { width: 4, height: 16, borderRadius: 2 },
  captionCard: { borderRadius: radius.lg, padding: spacing.md, borderWidth: 1, borderColor: 'rgba(45,53,72,0.3)' },
  toolbarContainer: { marginBottom: spacing.lg },
  toolbarCard: { flexDirection: 'row', justifyContent: 'space-around', paddingVertical: spacing.md, borderRadius: radius.lg, borderWidth: 1, borderColor: 'rgba(45,53,72,0.3)' },
  toolbarBtnGradient: { width: 48, height: 48, borderRadius: radius.lg, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.xs },
  tagGradient: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, borderRadius: radius.md },
  tagTextGold: { color: colors.gold, fontSize: fontSize.sm, fontWeight: '500' },
  thumbnailSection: { marginTop: spacing.base, marginBottom: spacing.base },
  thumbnailFrame: { width: 64, height: 114, borderRadius: radius.sm, overflow: 'hidden' as const, borderWidth: 2, borderColor: 'transparent' },
  thumbnailFrameSelected: { borderColor: colors.emerald },
  uploadThumbnailButton: { backgroundColor: tc.bgCard, justifyContent: 'center' as const, alignItems: 'center' as const, borderStyle: 'dashed' as const, borderColor: tc.border },
  uploadThumbnailText: { color: tc.text.secondary, fontSize: fontSize.xs, marginTop: 2 },
  toggleRow: { flexDirection: 'row' as const, justifyContent: 'space-between' as const, alignItems: 'center' as const, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: tc.border },
  toggleLabel: { color: tc.text.primary, fontSize: fontSize.base, fontWeight: '500' as const },
  toggleSubtitle: { color: tc.text.secondary, fontSize: fontSize.xs, marginTop: 2 },
  toggle: { width: 48, height: 28, borderRadius: radius.full, backgroundColor: tc.surface, justifyContent: 'center' as const, padding: 2 },
  toggleActive: { backgroundColor: colors.emerald },
  toggleThumb: { width: 24, height: 24, borderRadius: radius.full, backgroundColor: tc.text.primary },
  toggleThumbActive: { alignSelf: 'flex-end' as const },
  modeToggle: { flexDirection: 'row' as const, marginBottom: spacing.md, borderRadius: radius.full, backgroundColor: 'rgba(45,53,72,0.4)', padding: 3 },
  modeTab: { flex: 1, flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'center' as const, gap: spacing.xs, paddingVertical: spacing.sm, borderRadius: radius.full },
  modeTabActive: { backgroundColor: colors.emerald },
  modeText: { fontSize: fontSize.sm, fontWeight: '600' as const, color: tc.text.secondary },
  modeTextActive: { color: colors.text.onColor },
  cameraSection: { marginBottom: spacing.lg },
  cameraContainer: { width: VIDEO_PREVIEW_WIDTH, height: VIDEO_PREVIEW_HEIGHT, borderRadius: radius.lg, overflow: 'hidden' as const, position: 'relative' as const },
  camera: { width: '100%' as const, height: '100%' as const },
  cameraTimerOverlay: { position: 'absolute' as const, top: spacing.md, start: 0, end: 0, alignItems: 'center' as const },
  cameraTimerBadge: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: spacing.xs, backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: spacing.md, paddingVertical: spacing.xs, borderRadius: radius.full },
  cameraRecordingDot: { width: 8, height: 8, borderRadius: radius.full, backgroundColor: colors.error },
  cameraTimerText: { color: colors.text.onColor, fontSize: fontSize.sm, fontWeight: '600' as const },
  cameraControls: { position: 'absolute' as const, bottom: spacing.lg, start: 0, end: 0, flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'center' as const, gap: spacing.xl },
  cameraFlipButton: { width: 44, height: 44, borderRadius: radius.full, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center' as const, justifyContent: 'center' as const },
  recordButton: { width: 72, height: 72, borderRadius: radius.full, borderWidth: 3, borderColor: colors.error, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.3)' },
  recordButtonOuter: { width: 60, height: 60, borderRadius: radius.full, alignItems: 'center', justifyContent: 'center' },
  recordDot: { width: 52, height: 52, borderRadius: radius.full, backgroundColor: colors.error },
  recordDotActive: { width: 24, height: 24, borderRadius: 6, backgroundColor: colors.error },
  selectedTrackBar: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.md, marginBottom: spacing.md },
  selectedTrackText: { flex: 1, color: tc.text.primary, fontSize: fontSize.sm },
});
