import { useState, useRef, useCallback, useEffect } from 'react';
import {
  View, Text, StyleSheet, Pressable, FlatList, Dimensions,
  ScrollView, Alert, TextInput, RefreshControl,
  Pressable,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useMutation } from '@tanstack/react-query';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { ProgressiveImage } from '@/components/ui/ProgressiveImage';
import { Audio } from 'expo-av';
import Animated, {
  FadeIn, FadeInUp, FadeOut,
  useSharedValue, useAnimatedStyle, withTiming,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { Icon } from '@/components/ui/Icon';
import { GlassHeader } from '@/components/ui/GlassHeader';
import { GradientButton } from '@/components/ui/GradientButton';
import { CharCountRing } from '@/components/ui/CharCountRing';
import { EmptyState } from '@/components/ui/EmptyState';
import { MusicPicker } from '@/components/story/MusicPicker';
import { Skeleton } from '@/components/ui/Skeleton';
import { ScreenErrorBoundary } from '@/components/ui/ScreenErrorBoundary';
import { colors, spacing, fontSize, radius, fonts, shadow } from '@/theme';
import { storiesApi, uploadApi } from '@/services/api';
import { useTranslation } from '@/hooks/useTranslation';
import { useContextualHaptic } from '@/hooks/useContextualHaptic';
import { useThemeColors } from '@/hooks/useThemeColors';
import type { AudioTrack } from '@/types';

const { width: SCREEN_W } = Dimensions.get('window');
const IMAGE_SIZE = SCREEN_W - spacing.base * 2;
const MAX_IMAGES = 10;
const MAX_CAPTION = 500;
const DURATION_OPTIONS = [2, 3, 5, 7];

function PhotoMusicScreen() {
  const tc = useThemeColors();
  const styles = createStyles(tc);
  const router = useRouter();
  const { t } = useTranslation();
  const haptic = useContextualHaptic();
  const flatListRef = useRef<FlatList>(null);
  const soundRef = useRef<Audio.Sound | null>(null);

  // ── State ──
  const [images, setImages] = useState<{ uri: string }[]>([]);
  const [showMusicPicker, setShowMusicPicker] = useState(false);
  const [selectedTrack, setSelectedTrack] = useState<AudioTrack | null>(null);
  const [photoDuration, setPhotoDuration] = useState(3);
  const [caption, setCaption] = useState('');
  const [isPosting, setIsPosting] = useState(false);
  const [previewIndex, setPreviewIndex] = useState(0);
  const [isPreviewPlaying, setIsPreviewPlaying] = useState(false);
  const previewTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Animated page indicator ──
  const scrollX = useSharedValue(0);

  // ── Cleanup audio on unmount ──
  useEffect(() => {
    return () => {
      if (soundRef.current) {
        soundRef.current.unloadAsync();
      }
      if (previewTimerRef.current) {
        clearInterval(previewTimerRef.current);
      }
    };
  }, []);

  // ── Image Picker ──
  const pickImages = useCallback(async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(
        t('photoMusic.permissionRequired'),
        t('photoMusic.permissionMessage'),
      );
      return;
    }

    const remaining = MAX_IMAGES - images.length;
    if (remaining <= 0) {
      Alert.alert(t('photoMusic.maxPhotos'), t('photoMusic.maxPhotosMessage'));
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: true,
      selectionLimit: remaining,
      quality: 0.9,
    });

    if (!result.canceled && result.assets.length > 0) {
      haptic.tick();
      const newImages = result.assets.map((asset) => ({ uri: asset.uri }));
      setImages((prev) => [...prev, ...newImages]);
    }
  }, [images.length, haptic, t]);

  // ── Remove image ──
  const removeImage = useCallback((index: number) => {
    haptic.delete();
    setImages((prev) => prev.filter((_, i) => i !== index));
    if (previewIndex >= images.length - 1 && previewIndex > 0) {
      setPreviewIndex(previewIndex - 1);
    }
  }, [haptic, images.length, previewIndex]);

  // ── Music selection ──
  const handleSelectTrack = useCallback((track: AudioTrack) => {
    setSelectedTrack(track);
    setShowMusicPicker(false);
    haptic.tick();
  }, [haptic]);

  const removeTrack = useCallback(() => {
    setSelectedTrack(null);
    if (soundRef.current) {
      soundRef.current.unloadAsync();
      soundRef.current = null;
    }
    haptic.delete();
  }, [haptic]);

  // ── Preview mode ──
  const startPreview = useCallback(async () => {
    if (images.length === 0) return;

    setIsPreviewPlaying(true);
    setPreviewIndex(0);
    flatListRef.current?.scrollToIndex({ index: 0, animated: true });

    // Play audio if selected
    if (selectedTrack) {
      try {
        if (soundRef.current) {
          await soundRef.current.unloadAsync();
        }
        const { sound } = await Audio.Sound.createAsync(
          { uri: selectedTrack.audioUrl },
          { shouldPlay: true },
        );
        soundRef.current = sound;
      } catch {
        // Audio playback failed silently
      }
    }

    // Auto-scroll through images
    let currentIdx = 0;
    previewTimerRef.current = setInterval(() => {
      currentIdx += 1;
      if (currentIdx >= images.length) {
        stopPreview();
        return;
      }
      setPreviewIndex(currentIdx);
      flatListRef.current?.scrollToIndex({ index: currentIdx, animated: true });
    }, photoDuration * 1000);
  }, [images.length, selectedTrack, photoDuration]);

  const stopPreview = useCallback(async () => {
    setIsPreviewPlaying(false);
    if (previewTimerRef.current) {
      clearInterval(previewTimerRef.current);
      previewTimerRef.current = null;
    }
    if (soundRef.current) {
      await soundRef.current.stopAsync();
    }
  }, []);

  // ── Extract hashtags and mentions ──
  const extractTags = useCallback((text: string) => {
    const hashtagRegex = /#(\w+)/g;
    const mentionRegex = /@(\w+)/g;
    const hashtags: string[] = [];
    const mentions: string[] = [];
    let match: RegExpExecArray | null;

    match = hashtagRegex.exec(text);
    while (match !== null) {
      hashtags.push(match[1]);
      match = hashtagRegex.exec(text);
    }
    match = mentionRegex.exec(text);
    while (match !== null) {
      mentions.push(match[1]);
      match = mentionRegex.exec(text);
    }

    return { hashtags, mentions };
  }, []);

  // ── Upload and post ──
  const postMutation = useMutation({
    mutationFn: async () => {
      setIsPosting(true);

      // Upload all images
      const uploadedUrls: string[] = [];
      for (const img of images) {
        const presignData = await uploadApi.getPresignUrl('image/jpeg', 'stories');

        const response = await fetch(img.uri);
        const blob = await response.blob();
        await fetch(presignData.uploadUrl, {
          method: 'PUT',
          body: blob,
          headers: { 'Content-Type': 'image/jpeg' },
        });

        uploadedUrls.push(presignData.publicUrl);
      }

      const { hashtags } = extractTags(caption);

      // Create story with first image as main, rest in stickerData for slideshow
      await storiesApi.create({
        mediaUrl: uploadedUrls[0],
        mediaType: 'image',
        textOverlay: caption || undefined,
        stickerData: [
          {
            type: 'photoMusic',
            mediaUrls: uploadedUrls,
            audioTrackId: selectedTrack?.id,
            photoDuration,
            hashtags,
          },
        ],
      });
    },
    onSuccess: () => {
      setIsPosting(false);
      haptic.success();
      router.back();
    },
    onError: () => {
      setIsPosting(false);
      Alert.alert(t('photoMusic.postError'), t('photoMusic.postErrorMessage'));
    },
  });

  // ── Scroll handler for page indicator ──
  const handleScroll = useCallback((event: { nativeEvent: { contentOffset: { x: number } } }) => {
    const offsetX = event.nativeEvent.contentOffset.x;
    scrollX.value = offsetX;
    const newIndex = Math.round(offsetX / IMAGE_SIZE);
    if (newIndex !== previewIndex && newIndex >= 0 && newIndex < images.length) {
      setPreviewIndex(newIndex);
    }
  }, [previewIndex, images.length, scrollX]);

  // ── Render image item ──
  const renderImageItem = useCallback(({ item, index }: { item: { uri: string }; index: number }) => (
    <Animated.View entering={FadeIn.duration(200)} style={styles.imageContainer}>
      <ProgressiveImage
        uri={item.uri}
        width={IMAGE_SIZE}
        height={IMAGE_SIZE * 1.2}
        borderRadius={radius.lg}
      />
      {!isPreviewPlaying && (
        <Pressable
          style={styles.removeButton}
          onPress={() => removeImage(index)}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={t('photoMusic.removePhoto')}
        >
          <View style={styles.removeButtonInner}>
            <Icon name="x" size="sm" color={colors.text.primary} />
          </View>
        </Pressable>
      )}
    </Animated.View>
  ), [isPreviewPlaying, removeImage, t]);

  // ── Page indicator dots ──
  const renderPageDots = () => (
    <View style={styles.dotsContainer}>
      {images.map((_, index) => (
        <View
          key={`dot-${index}`}
          style={[
            styles.dot,
            index === previewIndex && styles.dotActive,
          ]}
        />
      ))}
    </View>
  );

  // ── Duration pill ──
  const renderDurationPill = (duration: number) => {
    const isSelected = photoDuration === duration;
    return (
      <Pressable
        key={`dur-${duration}`}
        style={[styles.durationPill, isSelected && styles.durationPillActive]}
        onPress={() => {
          setPhotoDuration(duration);
          haptic.tick();
        }}
        accessibilityRole="button"
        accessibilityLabel={t('photoMusic.secondsPerPhoto', { seconds: duration })}
      >
        <Text style={[styles.durationText, isSelected && styles.durationTextActive]}>
          {duration}{t('photoMusic.secondsShort')}
        </Text>
      </Pressable>
    );
  };

  const canPost = images.length > 0 && !isPosting;

  return (
    <View style={styles.screen}>
      <GlassHeader
        title={t('photoMusic.title')}
        leftAction={{
          icon: 'arrow-left',
          onPress: () => router.back(),
          accessibilityLabel: t('common.back'),
        }}
        rightActions={[
          {
            icon: canPost ? (
              <View style={styles.postButtonHeader}>
                {isPosting ? (
                  <Skeleton.Rect width={24} height={24} borderRadius={radius.full} />
                ) : (
                  <Text style={styles.postButtonText}>{t('photoMusic.post')}</Text>
                )}
              </View>
            ) : (
              <Text style={styles.postButtonDisabled}>{t('photoMusic.post')}</Text>
            ),
            onPress: () => {
              if (canPost) {
                postMutation.mutate();
              }
            },
            accessibilityLabel: t('photoMusic.post'),
          },
        ]}
      />

      <ScrollView
        style={styles.scrollContent}
        contentContainerStyle={styles.scrollContentInner}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* ── Photo Carousel ── */}
        {images.length > 0 ? (
          <Animated.View entering={FadeInUp.duration(300)} style={styles.carouselSection}>
            <FlatList
              ref={flatListRef}
              data={images}
              renderItem={renderImageItem}
              keyExtractor={(_, index) => `photo-${index}`}
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              onScroll={handleScroll}
              scrollEventThrottle={16}
              getItemLayout={(_, index) => ({
                length: IMAGE_SIZE,
                offset: IMAGE_SIZE * index,
                index,
              })}
              refreshControl={
                <RefreshControl
                  refreshing={false}
                  onRefresh={pickImages}
                  tintColor={colors.emerald}
                />
              }
            />
            {renderPageDots()}

            {/* Preview toggle */}
            <Pressable
              style={styles.previewButton}
              onPress={isPreviewPlaying ? stopPreview : startPreview}
              accessibilityRole="button"
              accessibilityLabel={
                isPreviewPlaying
                  ? t('photoMusic.stopPreview')
                  : t('photoMusic.startPreview')
              }
            >
              <Icon
                name={isPreviewPlaying ? 'x' : 'play'}
                size="sm"
                color={colors.text.primary}
              />
              <Text style={styles.previewButtonText}>
                {isPreviewPlaying
                  ? t('photoMusic.stopPreview')
                  : t('photoMusic.preview')}
              </Text>
            </Pressable>
          </Animated.View>
        ) : (
          <Animated.View entering={FadeIn.duration(300)} style={styles.emptyCarousel}>
            <EmptyState
              icon="image"
              title={t('photoMusic.noPhotos')}
              subtitle={t('photoMusic.noPhotosSubtitle')}
              actionLabel={t('photoMusic.addPhotos')}
              onAction={pickImages}
            />
          </Animated.View>
        )}

        {/* ── Music Selector ── */}
        <Animated.View entering={FadeInUp.delay(100).duration(300)} style={styles.section}>
          <Pressable
            style={styles.musicBar}
            onPress={() => setShowMusicPicker(true)}
            accessibilityRole="button"
            accessibilityLabel={t('photoMusic.selectMusic')}
          >
            <View style={styles.musicBarLeft}>
              <Icon name="play" size="sm" color={colors.emerald} />
              <Text style={styles.musicBarText} numberOfLines={1}>
                {selectedTrack
                  ? `${selectedTrack.title} - ${selectedTrack.artist}`
                  : t('photoMusic.selectMusic')}
              </Text>
            </View>
            {selectedTrack ? (
              <Pressable
                onPress={removeTrack}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel={t('photoMusic.removeMusic')}
              >
                <Icon name="x" size="sm" color={colors.text.secondary} />
              </Pressable>
            ) : (
              <Icon name="chevron-right" size="sm" color={colors.text.secondary} />
            )}
          </Pressable>
        </Animated.View>

        {/* ── Duration Selector ── */}
        <Animated.View entering={FadeInUp.delay(150).duration(300)} style={styles.section}>
          <Text style={styles.sectionLabel}>{t('photoMusic.durationPerPhoto')}</Text>
          <View style={styles.durationRow}>
            {DURATION_OPTIONS.map(renderDurationPill)}
          </View>
        </Animated.View>

        {/* ── Caption Input ── */}
        <Animated.View entering={FadeInUp.delay(200).duration(300)} style={styles.section}>
          <View style={styles.captionContainer}>
            <TextInput
              style={styles.captionInput}
              placeholder={t('photoMusic.captionPlaceholder')}
              placeholderTextColor={colors.text.tertiary}
              value={caption}
              onChangeText={setCaption}
              maxLength={MAX_CAPTION}
              multiline
              numberOfLines={3}
              textAlignVertical="top"
            />
            <View style={styles.captionFooter}>
              <Text style={styles.captionHint}>
                {t('photoMusic.captionHint')}
              </Text>
              <CharCountRing current={caption.length} max={MAX_CAPTION} size={28} />
            </View>
          </View>
        </Animated.View>

        {/* ── Add Photos Button ── */}
        {images.length > 0 && images.length < MAX_IMAGES && (
          <Animated.View entering={FadeInUp.delay(250).duration(300)} style={styles.section}>
            <GradientButton
              label={t('photoMusic.addMorePhotos', { count: MAX_IMAGES - images.length })}
              onPress={pickImages}
              variant="secondary"
              icon="plus"
            />
          </Animated.View>
        )}

        {/* Spacer for scroll */}
        <View style={styles.bottomSpacer} />
      </ScrollView>

      {/* ── Music Picker Bottom Sheet ── */}
      <MusicPicker
        visible={showMusicPicker}
        onClose={() => setShowMusicPicker(false)}
        onSelect={handleSelectTrack}
      />
    </View>
  );
}

export default function PhotoMusicScreenWrapper() {
  return (
    <ScreenErrorBoundary>
      <PhotoMusicScreen />
    </ScreenErrorBoundary>
  );
}

const createStyles = (tc: ReturnType<typeof useThemeColors>) => StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: tc.bg,
  },
  scrollContent: {
    flex: 1,
    marginTop: 100,
  },
  scrollContentInner: {
    paddingHorizontal: spacing.base,
    paddingTop: spacing.base,
  },
  // ── Carousel ──
  carouselSection: {
    marginBottom: spacing.lg,
  },
  imageContainer: {
    width: IMAGE_SIZE,
    height: IMAGE_SIZE * 1.2,
    borderRadius: radius.lg,
    overflow: 'hidden',
    backgroundColor: tc.bgCard,
  },
  image: {
    width: '100%',
    height: '100%',
  },
  removeButton: {
    position: 'absolute',
    top: spacing.sm,
    right: spacing.sm,
    zIndex: 10,
  },
  removeButtonInner: {
    width: 32,
    height: 32,
    borderRadius: radius.full,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  // ── Page dots ──
  dotsContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: spacing.md,
    gap: spacing.xs,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: radius.full,
    backgroundColor: tc.surface,
  },
  dotActive: {
    backgroundColor: colors.emerald,
    width: 12,
    height: 8,
    borderRadius: radius.sm,
  },
  // ── Preview button ──
  previewButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.base,
    backgroundColor: tc.bgCard,
    borderRadius: radius.md,
    alignSelf: 'center',
    gap: spacing.xs,
  },
  previewButtonText: {
    fontFamily: fonts.bodyMedium,
    fontSize: fontSize.sm,
    color: colors.text.primary,
  },
  // ── Empty state ──
  emptyCarousel: {
    height: IMAGE_SIZE * 0.8,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: tc.bgCard,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: tc.border,
    borderStyle: 'dashed',
    marginBottom: spacing.lg,
  },
  // ── Music bar ──
  section: {
    marginBottom: spacing.lg,
  },
  sectionLabel: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSize.sm,
    color: colors.text.secondary,
    marginBottom: spacing.sm,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  musicBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: tc.bgCard,
    borderRadius: radius.md,
    padding: spacing.base,
    borderWidth: 1,
    borderColor: tc.border,
  },
  musicBarLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    flex: 1,
  },
  musicBarText: {
    fontFamily: fonts.bodyMedium,
    fontSize: fontSize.base,
    color: colors.text.primary,
    flex: 1,
  },
  // ── Duration ──
  durationRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  durationPill: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    backgroundColor: tc.bgCard,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: tc.border,
  },
  durationPillActive: {
    backgroundColor: colors.active.emerald20,
    borderColor: colors.emerald,
  },
  durationText: {
    fontFamily: fonts.bodyMedium,
    fontSize: fontSize.sm,
    color: colors.text.secondary,
  },
  durationTextActive: {
    color: colors.emerald,
    fontFamily: fonts.bodySemiBold,
  },
  // ── Caption ──
  captionContainer: {
    backgroundColor: tc.bgCard,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: tc.border,
    padding: spacing.base,
  },
  captionInput: {
    fontFamily: fonts.body,
    fontSize: fontSize.base,
    color: colors.text.primary,
    minHeight: 80,
    textAlignVertical: 'top',
  },
  captionFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.sm,
  },
  captionHint: {
    fontFamily: fonts.body,
    fontSize: fontSize.xs,
    color: colors.text.tertiary,
  },
  // ── Post button header ──
  postButtonHeader: {
    backgroundColor: colors.emerald,
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    minWidth: 60,
    alignItems: 'center',
    justifyContent: 'center',
  },
  postButtonText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSize.sm,
    color: colors.text.onColor,
  },
  postButtonDisabled: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSize.sm,
    color: colors.text.tertiary,
  },
  bottomSpacer: {
    height: 60,
  },
});
