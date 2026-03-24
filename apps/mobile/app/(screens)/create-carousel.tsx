import { useState, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, Pressable, ScrollView, FlatList,
  useWindowDimensions, Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useUser } from '@clerk/clerk-expo';
import * as ImagePicker from 'expo-image-picker';
import { Image } from 'expo-image'; // Used in SlideThumb
import Animated, {
  FadeInUp, FadeInDown, FadeIn, useSharedValue, useAnimatedStyle, withSpring,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { ImageCarousel } from '@/components/ui/ImageCarousel';
import { GlassHeader } from '@/components/ui/GlassHeader';
import { GradientButton } from '@/components/ui/GradientButton';
import { Icon } from '@/components/ui/Icon';
import { Avatar } from '@/components/ui/Avatar';
import { RichCaptionInput } from '@/components/ui/RichCaptionInput';
import { UploadProgressBar, uploadWithProgress } from '@/components/ui/UploadProgressBar';
import { AnimatedAccordion } from '@/components/ui/AnimatedAccordion';
import { CharCountRing } from '@/components/ui/CharCountRing';
import { ScreenErrorBoundary } from '@/components/ui/ScreenErrorBoundary';
import { colors, spacing, fontSize, radius, fonts, fontSizeExt } from '@/theme';
import { reelsApi, uploadApi } from '@/services/api';
import { useTranslation } from '@/hooks/useTranslation';
import { useThemeColors } from '@/hooks/useThemeColors';
import { useContextualHaptic } from '@/hooks/useContextualHaptic';
import { showToast } from '@/components/ui/Toast';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);
const MAX_SLIDES = 35;
const CAPTION_MAX = 500;
const TOPIC_OPTIONS = ['islamic', 'education', 'technology', 'travel', 'food', 'fitness', 'art', 'nature', 'community', 'business'];

interface Slide {
  uri: string;
  width?: number;
  height?: number;
  text: string; // Per-slide text overlay
}

function SlideThumb({ slide, index, isSelected, onSelect, onRemove, total, t }: {
  slide: Slide;
  index: number;
  isSelected: boolean;
  onSelect: () => void;
  onRemove: () => void;
  total: number;
  t: (key: string) => string;
}) {
  const scale = useSharedValue(1);
  const animStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <Animated.View entering={FadeInDown.delay(index * 40).duration(250).springify()}>
      <AnimatedPressable
        onPress={onSelect}
        onLongPress={() => {
          if (total > 2) {
            Alert.alert(
              t('carousel.removeSlideTitle'),
              t('carousel.removeSlideMessage'),
              [
                { text: t('common.cancel'), style: 'cancel' },
                { text: t('common.remove'), style: 'destructive', onPress: onRemove },
              ],
            );
          }
        }}
        onPressIn={() => { scale.value = withSpring(0.92, { damping: 15, stiffness: 400 }); }}
        onPressOut={() => { scale.value = withSpring(1, { damping: 12, stiffness: 200 }); }}
        style={[animStyle, styles.thumbWrap, isSelected && { borderColor: colors.emerald, borderWidth: 2 }]}
        accessibilityLabel={`Slide ${index + 1}`}
        accessibilityRole="button"
      >
        <Image source={{ uri: slide.uri }} style={styles.thumbImg} contentFit="cover" />
        <View style={styles.thumbBadge}>
          <Text style={styles.thumbBadgeText}>{index + 1}</Text>
        </View>
        {slide.text.length > 0 && (
          <View style={styles.thumbTextIndicator}>
            <Icon name="pencil" size="xs" color="#fff" />
          </View>
        )}
      </AnimatedPressable>
    </Animated.View>
  );
}

function CreateCarouselScreen() {
  const tc = useThemeColors();
  const { t } = useTranslation();
  const haptic = useContextualHaptic();
  const router = useRouter();
  const { user } = useUser();
  const queryClient = useQueryClient();
  const { width: screenWidth } = useWindowDimensions();

  // ── State ──
  const [slides, setSlides] = useState<Slide[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [caption, setCaption] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const uploadAbortRef = useRef<(() => void) | null>(null);

  // Publish fields
  const [altText, setAltText] = useState('');
  const [locationName, setLocationName] = useState('');
  const [selectedTopics, setSelectedTopics] = useState<string[]>([]);
  const [brandedContent, setBrandedContent] = useState(false);
  const [brandPartner, setBrandPartner] = useState('');
  const [commentPermission, setCommentPermission] = useState<'EVERYONE' | 'FOLLOWERS' | 'NOBODY'>('EVERYONE');
  const [remixAllowed, setRemixAllowed] = useState(true);
  const [slideDuration, setSlideDuration] = useState(5); // seconds per slide (3-10)

  // Refs
  const thumbListRef = useRef<FlatList<Slide>>(null);

  const currentSlide = slides[selectedIndex];
  const canPublish = slides.length >= 2 && !uploading;

  // ── Pick photos ──
  const pickPhotos = useCallback(async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      selectionLimit: MAX_SLIDES - slides.length,
      quality: 0.9,
      orderedSelection: true,
    });

    if (!result.canceled && result.assets.length > 0) {
      haptic.tick();
      const newSlides: Slide[] = result.assets.map((a) => ({
        uri: a.uri,
        width: a.width,
        height: a.height,
        text: '',
      }));
      setSlides((prev) => [...prev, ...newSlides].slice(0, MAX_SLIDES));
    }
  }, [slides.length, haptic]);

  // ── Reorder: move slide ──
  const moveSlide = useCallback((from: number, to: number) => {
    if (to < 0 || to >= slides.length) return;
    haptic.tick();
    setSlides((prev) => {
      const copy = [...prev];
      const [moved] = copy.splice(from, 1);
      copy.splice(to, 0, moved);
      return copy;
    });
    setSelectedIndex(to);
  }, [slides.length, haptic]);

  // ── Remove slide ──
  const removeSlide = useCallback((index: number) => {
    haptic.delete();
    setSlides((prev) => {
      const next = prev.filter((_, i) => i !== index);
      // Adjust selectedIndex if it would be out of bounds
      setSelectedIndex((si) => (si >= next.length ? Math.max(0, next.length - 1) : si));
      return next;
    });
  }, [haptic]);

  // ── Update per-slide text ──
  const updateSlideText = useCallback((text: string) => {
    setSlides((prev) => prev.map((s, i) => i === selectedIndex ? { ...s, text } : s));
  }, [selectedIndex]);

  // ── Upload + publish ──
  const publishMutation = useMutation({
    mutationFn: async () => {
      setUploading(true);
      setUploadProgress(0);

      const carouselUrls: string[] = [];
      const carouselTexts: string[] = [];

      // Upload each slide image
      for (let i = 0; i < slides.length; i++) {
        const slide = slides[i];
        // Extract extension from URI, handling paths with multiple dots and query params
        const uriPath = slide.uri.split('?')[0];
        const ext = uriPath.split('.').pop()?.toLowerCase() ?? 'jpg';
        const MIME_MAP: Record<string, string> = { png: 'image/png', webp: 'image/webp', gif: 'image/gif', heic: 'image/heic' };
        const contentType = MIME_MAP[ext] ?? 'image/jpeg';
        const { uploadUrl, publicUrl } = await uploadApi.getPresignUrl(contentType, 'reels');

        const fileRes = await fetch(slide.uri);
        const blob = await fileRes.blob();

        const baseProgress = (i / slides.length) * 100;
        const itemWeight = 100 / slides.length;
        const { promise, abort } = uploadWithProgress(
          uploadUrl,
          blob,
          contentType,
          (percent) => setUploadProgress(baseProgress + (percent / 100) * itemWeight),
        );
        uploadAbortRef.current = abort;
        await promise;

        carouselUrls.push(publicUrl);
        carouselTexts.push(slide.text);
      }

      uploadAbortRef.current = null;
      setUploading(false);

      return reelsApi.create({
        videoUrl: carouselUrls[0], // First image as primary (required field)
        duration: Math.min(180, slides.length * slideDuration), // Capped at 180s (reel max)
        isPhotoCarousel: true,
        carouselUrls,
        carouselTexts,
        caption: caption.trim() || undefined,
        altText: altText.trim() || undefined,
        locationName: locationName.trim() || undefined,
        topics: selectedTopics.length > 0 ? selectedTopics : undefined,
        commentPermission,
        remixAllowed,
        brandedContent,
        brandPartner: brandedContent ? brandPartner.trim() || undefined : undefined,
      });
    },
    onSuccess: () => {
      haptic.success();
      queryClient.invalidateQueries({ queryKey: ['bakra-feed'] });
      queryClient.invalidateQueries({ queryKey: ['reels'] });
      showToast({ message: t('carousel.published'), variant: 'success' });
      router.back();
    },
    onError: (err: Error) => {
      haptic.error();
      setUploading(false);
      showToast({ message: err.message || t('carousel.publishFailed'), variant: 'error' });
    },
  });

  const handleCancel = () => {
    if (slides.length > 0) {
      Alert.alert(t('common.discard'), t('carousel.discardConfirm'), [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('common.discard'), style: 'destructive', onPress: () => router.back() },
      ]);
    } else {
      router.back();
    }
  };

  // ── Empty state: photo picker ──
  if (slides.length === 0) {
    return (
      <ScreenErrorBoundary>
        <SafeAreaView style={[styles.container, { backgroundColor: tc.bg }]} edges={['top']}>
          <GlassHeader
            title={t('carousel.title')}
            leftIcon="x"
            onLeftPress={() => router.back()}
          />
          <View style={styles.emptyContainer}>
            <Animated.View entering={FadeIn.duration(400)} style={styles.emptyContent}>
              <LinearGradient
                colors={[`${colors.gold}25`, `${colors.gold}08`]}
                style={styles.emptyIconWrap}
              >
                <Icon name="layers" size={48} color={colors.gold} />
              </LinearGradient>
              <Text style={[styles.emptyTitle, { color: tc.text.primary }]}>
                {t('carousel.emptyTitle')}
              </Text>
              <Text style={[styles.emptySubtitle, { color: tc.text.secondary }]}>
                {t('carousel.emptySubtitle')}
              </Text>
              <GradientButton
                label={t('carousel.selectPhotos')}
                onPress={pickPhotos}
                icon="image"
                style={{ marginTop: spacing.xl }}
              />
            </Animated.View>
          </View>
        </SafeAreaView>
      </ScreenErrorBoundary>
    );
  }

  // ── Main: editor with slides ──
  const previewSize = screenWidth - spacing.base * 2;

  return (
    <ScreenErrorBoundary>
      <SafeAreaView style={[styles.container, { backgroundColor: tc.bg }]} edges={['top']}>
        <GlassHeader
          title={t('carousel.title')}
          leftIcon="x"
          onLeftPress={handleCancel}
          rightContent={
            <GradientButton
              label={uploading ? `${Math.round(uploadProgress)}%` : t('common.publish')}
              onPress={() => publishMutation.mutate()}
              disabled={!canPublish || publishMutation.isPending}
              size="sm"
            />
          }
        />

        <UploadProgressBar
          progress={uploadProgress}
          visible={uploading}
          label={`${t('carousel.uploadingSlide')} ${Math.ceil((uploadProgress / 100) * slides.length)} / ${slides.length}`}
          onCancel={() => {
            uploadAbortRef.current?.();
            setUploading(false);
          }}
        />

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* ── Preview: swipeable carousel preview ── */}
          <Animated.View entering={FadeInUp.duration(300)} style={[styles.previewWrap, { height: previewSize }]}>
            <ImageCarousel
              images={slides.map((s) => s.uri)}
              texts={slides.map((s) => s.text)}
              height={previewSize}
              borderRadius={radius.lg}
              showIndicators={slides.length > 1}
            />

            {/* Reorder arrows overlaid */}
            {slides.length > 1 && (
              <View style={styles.reorderRow}>
                <Pressable
                  onPress={() => moveSlide(selectedIndex, selectedIndex - 1)}
                  disabled={selectedIndex === 0}
                  style={[styles.reorderBtn, selectedIndex === 0 && { opacity: 0.3 }]}
                  hitSlop={12}
                  accessibilityLabel={t('carousel.movePrev')}
                >
                  <Icon name="chevron-left" size="md" color="#fff" />
                </Pressable>
                <Pressable
                  onPress={() => moveSlide(selectedIndex, selectedIndex + 1)}
                  disabled={selectedIndex === slides.length - 1}
                  style={[styles.reorderBtn, selectedIndex === slides.length - 1 && { opacity: 0.3 }]}
                  hitSlop={12}
                  accessibilityLabel={t('carousel.moveNext')}
                >
                  <Icon name="chevron-right" size="md" color="#fff" />
                </Pressable>
              </View>
            )}
          </Animated.View>

          {/* ── Thumbnail strip (auto-scrolls to selected) ── */}
          <FlatList
            ref={thumbListRef}
            data={slides}
            keyExtractor={(_, i) => `thumb-${i}`}
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.thumbStrip}
            onContentSizeChange={() => {
              if (selectedIndex > 0) {
                thumbListRef.current?.scrollToIndex({ index: selectedIndex, animated: true, viewPosition: 0.5 });
              }
            }}
            getItemLayout={(_, index) => ({ length: 72 + spacing.sm, offset: (72 + spacing.sm) * index, index })}
            renderItem={({ item, index }) => (
              <SlideThumb
                slide={item}
                index={index}
                isSelected={index === selectedIndex}
                onSelect={() => {
                  setSelectedIndex(index);
                  thumbListRef.current?.scrollToIndex({ index, animated: true, viewPosition: 0.5 });
                }}
                onRemove={() => removeSlide(index)}
                total={slides.length}
                t={t}
              />
            )}
            ListFooterComponent={
              slides.length < MAX_SLIDES ? (
                <Pressable
                  onPress={pickPhotos}
                  style={[styles.addThumb, { borderColor: tc.border }]}
                  accessibilityLabel={t('carousel.addMore')}
                  accessibilityRole="button"
                >
                  <Icon name="plus" size="md" color={tc.text.tertiary} />
                </Pressable>
              ) : null
            }
          />

          {/* ── Per-slide text overlay ── */}
          <AnimatedAccordion
            title={t('carousel.slideText')}
            icon="pencil"
            defaultExpanded={false}
          >
            <View style={styles.slideTextWrap}>
              <RichCaptionInput
                value={currentSlide?.text ?? ''}
                onChangeText={updateSlideText}
                placeholder={t('carousel.slideTextPlaceholder')}
                maxLength={200}
                minHeight={60}
                multiline
              />
              <View style={styles.slideTextMeta}>
                <Text style={[styles.slideTextHint, { color: tc.text.tertiary }]}>
                  {t('carousel.slideTextHint')}
                </Text>
                <CharCountRing current={currentSlide?.text.length ?? 0} max={200} size={24} />
              </View>
            </View>
          </AnimatedAccordion>

          {/* ── Caption ── */}
          <View style={[styles.section, { borderColor: tc.border }]}>
            <View style={styles.sectionHeader}>
              <Avatar
                uri={user?.imageUrl ?? null}
                name={user?.fullName ?? ''}
                size="sm"
              />
              <Text style={[styles.sectionTitle, { color: tc.text.primary }]}>
                {t('carousel.caption')}
              </Text>
              <CharCountRing current={caption.length} max={CAPTION_MAX} size={28} />
            </View>
            <RichCaptionInput
              value={caption}
              onChangeText={setCaption}
              placeholder={t('carousel.captionPlaceholder')}
              maxLength={CAPTION_MAX}
              minHeight={80}
              multiline
            />
          </View>

          {/* ── Publish fields ── */}
          <AnimatedAccordion title={t('compose.altText')} icon="eye" defaultExpanded={false}>
            <RichCaptionInput
              value={altText}
              onChangeText={setAltText}
              placeholder={t('compose.altTextPlaceholder')}
              maxLength={1000}
              minHeight={48}
            />
          </AnimatedAccordion>

          {/* Location */}
          <AnimatedAccordion title={t('compose.location')} icon="map-pin" defaultExpanded={false}>
            <RichCaptionInput
              value={locationName}
              onChangeText={setLocationName}
              placeholder={t('compose.locationPlaceholder')}
              maxLength={200}
              minHeight={40}
              multiline={false}
            />
          </AnimatedAccordion>

          {/* Topics */}
          <AnimatedAccordion title={t('compose.topics')} icon="hash" defaultExpanded={false}>
            <View style={styles.topicsWrap}>
              {TOPIC_OPTIONS.map((topic) => {
                const isSelected = selectedTopics.includes(topic);
                return (
                  <Pressable
                    key={topic}
                    onPress={() => {
                      haptic.tick();
                      setSelectedTopics((prev) =>
                        isSelected ? prev.filter((t2) => t2 !== topic) : prev.length < 3 ? [...prev, topic] : prev,
                      );
                    }}
                    style={[
                      styles.topicChip,
                      { borderColor: isSelected ? colors.emerald : 'rgba(255,255,255,0.15)' },
                      isSelected && { backgroundColor: `${colors.emerald}20` },
                    ]}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: isSelected }}
                  >
                    <Text style={[styles.topicChipText, { color: isSelected ? colors.emerald : tc.text.secondary }]}>
                      {t(`compose.topic_${topic}`)}
                    </Text>
                  </Pressable>
                );
              })}
              <Text style={[styles.topicsHint, { color: tc.text.tertiary }]}>
                {t('compose.topicsMax')} ({selectedTopics.length}/3)
              </Text>
            </View>
          </AnimatedAccordion>

          {/* Slide timing */}
          <AnimatedAccordion title={t('carousel.slideTiming')} icon="clock" defaultExpanded={false}>
            <View style={styles.timingRow}>
              {[3, 5, 7, 10].map((sec) => (
                <Pressable
                  key={sec}
                  onPress={() => { setSlideDuration(sec); haptic.tick(); }}
                  style={[
                    styles.timingChip,
                    { borderColor: slideDuration === sec ? colors.emerald : 'rgba(255,255,255,0.15)' },
                    slideDuration === sec && { backgroundColor: `${colors.emerald}20` },
                  ]}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: slideDuration === sec }}
                >
                  <Text style={[
                    styles.timingChipText,
                    { color: slideDuration === sec ? colors.emerald : tc.text.secondary },
                  ]}>
                    {sec}s
                  </Text>
                </Pressable>
              ))}
              <Text style={[styles.timingTotal, { color: tc.text.tertiary }]}>
                {t('carousel.totalDuration')}: {Math.min(180, slides.length * slideDuration)}s
              </Text>
            </View>
          </AnimatedAccordion>

          {/* Comment permission */}
          <AnimatedAccordion title={t('compose.whoCanComment')} icon="message-circle" defaultExpanded={false}>
            {(['EVERYONE', 'FOLLOWERS', 'NOBODY'] as const).map((perm) => (
              <Pressable
                key={perm}
                onPress={() => { setCommentPermission(perm); haptic.tick(); }}
                style={[styles.radioRow, { borderColor: tc.border }]}
                accessibilityRole="radio"
                accessibilityState={{ selected: commentPermission === perm }}
              >
                <View style={[styles.radioOuter, commentPermission === perm && styles.radioSelected]}>
                  {commentPermission === perm && <View style={styles.radioInner} />}
                </View>
                <Text style={[styles.toggleLabel, { color: tc.text.primary }]}>
                  {t(`compose.commentPerm_${perm}`)}
                </Text>
              </Pressable>
            ))}
          </AnimatedAccordion>

          {/* Remix toggle */}
          <AnimatedAccordion title={t('compose.remixSettings')} icon="repeat" defaultExpanded={false}>
            <Pressable
              onPress={() => { setRemixAllowed(!remixAllowed); haptic.tick(); }}
              style={[styles.toggleRow, { borderColor: tc.border }]}
              accessibilityRole="switch"
              accessibilityState={{ checked: remixAllowed }}
            >
              <Text style={[styles.toggleLabel, { color: tc.text.primary }]}>
                {t('compose.allowRemix')}
              </Text>
              <View style={[styles.toggleTrack, remixAllowed && styles.toggleActive]}>
                <View style={[styles.toggleThumb, remixAllowed && styles.toggleThumbActive]} />
              </View>
            </Pressable>
          </AnimatedAccordion>

          {/* Branded content */}
          <AnimatedAccordion title={t('compose.brandedContent')} icon="flag" defaultExpanded={false}>
            <Pressable
              onPress={() => { setBrandedContent(!brandedContent); haptic.tick(); }}
              style={[styles.toggleRow, { borderColor: tc.border }]}
              accessibilityRole="switch"
              accessibilityState={{ checked: brandedContent }}
            >
              <Text style={[styles.toggleLabel, { color: tc.text.primary }]}>
                {t('compose.brandedContentLabel')}
              </Text>
              <View style={[styles.toggleTrack, brandedContent && styles.toggleActive]}>
                <View style={[styles.toggleThumb, brandedContent && styles.toggleThumbActive]} />
              </View>
            </Pressable>
            {brandedContent && (
              <RichCaptionInput
                value={brandPartner}
                onChangeText={setBrandPartner}
                placeholder={t('compose.brandPartnerPlaceholder')}
                maxLength={100}
                minHeight={40}
                multiline={false}
              />
            )}
          </AnimatedAccordion>

          <View style={{ height: spacing.xl * 2 }} />
        </ScrollView>
      </SafeAreaView>
    </ScreenErrorBoundary>
  );
}

export default CreateCarouselScreen;

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: spacing.base, paddingTop: spacing.md },

  // Empty state
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: spacing.xl },
  emptyContent: { alignItems: 'center' },
  emptyIconWrap: {
    width: 100, height: 100, borderRadius: radius.full,
    alignItems: 'center', justifyContent: 'center', marginBottom: spacing.xl,
  },
  emptyTitle: { fontSize: fontSize.xl, fontFamily: fonts.bodyBold, fontWeight: '700', marginBottom: spacing.sm, textAlign: 'center' },
  emptySubtitle: { fontSize: fontSize.base, fontFamily: fonts.body, textAlign: 'center', lineHeight: 22 },

  // Preview
  previewWrap: {
    borderRadius: radius.lg, overflow: 'hidden',
    marginBottom: spacing.md, position: 'relative',
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 12, elevation: 6,
  },

  reorderRow: {
    position: 'absolute', bottom: spacing.md, start: 0, end: 0,
    flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: spacing.md,
  },
  reorderBtn: {
    width: 40, height: 40, borderRadius: radius.full,
    backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center',
  },

  // Thumbnail strip
  thumbStrip: { paddingVertical: spacing.sm, gap: spacing.sm, paddingEnd: spacing.base },
  thumbWrap: { width: 72, height: 72, borderRadius: radius.md, overflow: 'hidden', position: 'relative' },
  thumbImg: { width: '100%', height: '100%' },
  thumbBadge: {
    position: 'absolute', top: 4, start: 4,
    width: 20, height: 20, borderRadius: radius.full,
    backgroundColor: colors.emerald, alignItems: 'center', justifyContent: 'center',
  },
  thumbBadgeText: { color: '#fff', fontSize: 10, fontFamily: fonts.bodyBold, fontWeight: '700' },
  thumbTextIndicator: {
    position: 'absolute', bottom: 4, end: 4,
    width: 18, height: 18, borderRadius: radius.full,
    backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center',
  },
  addThumb: {
    width: 72, height: 72, borderRadius: radius.md, borderWidth: 1.5, borderStyle: 'dashed',
    alignItems: 'center', justifyContent: 'center',
  },

  // Slide text
  slideTextWrap: { paddingBottom: spacing.sm },
  slideTextMeta: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: spacing.xs },
  slideTextHint: { fontSize: fontSizeExt.tiny, fontFamily: fonts.body, flex: 1 },

  // Caption section
  section: { borderTopWidth: 1, paddingTop: spacing.md, marginTop: spacing.md },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.md },
  sectionTitle: { fontSize: fontSize.md, fontFamily: fonts.bodyBold, fontWeight: '600', flex: 1 },

  // Slide timing
  timingRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap', paddingBottom: spacing.sm },
  timingChip: {
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    borderRadius: radius.full, borderWidth: 1.5,
  },
  timingChipText: { fontSize: fontSize.sm, fontFamily: fonts.bodyMedium, fontWeight: '600' },
  timingTotal: { fontSize: fontSizeExt.tiny, fontFamily: fonts.body, marginStart: spacing.xs },

  // Topics
  topicsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, paddingBottom: spacing.sm },
  topicChip: {
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    borderRadius: radius.full, borderWidth: 1.5,
  },
  topicChipText: { fontSize: fontSize.sm, fontFamily: fonts.bodyMedium, fontWeight: '500' },
  topicsHint: { width: '100%', fontSize: fontSizeExt.tiny, fontFamily: fonts.body, marginTop: spacing.xs },

  // Publish field toggles + radio
  radioRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.sm },
  radioOuter: {
    width: 22, height: 22, borderRadius: 11, borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.3)', alignItems: 'center', justifyContent: 'center',
  },
  radioSelected: { borderColor: colors.emerald },
  radioInner: { width: 12, height: 12, borderRadius: 6, backgroundColor: colors.emerald },
  toggleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: spacing.sm },
  toggleLabel: { fontSize: fontSize.base, fontFamily: fonts.body },
  toggleTrack: {
    width: 48, height: 28, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.12)',
    justifyContent: 'center', paddingHorizontal: 2,
  },
  toggleActive: { backgroundColor: colors.emerald },
  toggleThumb: {
    width: 24, height: 24, borderRadius: 12, backgroundColor: '#fff',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.2, shadowRadius: 2, elevation: 2,
  },
  toggleThumbActive: { alignSelf: 'flex-end' },
});
