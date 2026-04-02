import { useState, useCallback, useEffect, useRef } from 'react';
import { View, Text, Pressable, StyleSheet, TextInput, ScrollView, Dimensions, Platform, Alert, ViewStyle, TextStyle } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { ProgressiveImage } from '@/components/ui/ProgressiveImage';
import { LinearGradient } from 'expo-linear-gradient';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue, useAnimatedStyle,
  runOnJS, withTiming, withDelay, withSpring, FadeIn, FadeInDown,
} from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';
import { MusicPicker } from '@/components/story/MusicPicker';
import { DrawingCanvas } from '@/components/story/DrawingCanvas';
import type { DrawPath } from '@/components/story/DrawingCanvas';
import { TextEffects } from '@/components/story/TextEffects';
import type { TextEffect } from '@/components/story/TextEffects';
import { GifSearch, type GifItem } from '@/components/story/GifSticker';
import { LocationSearch, type LocationData } from '@/components/story/LocationSticker';
import { isSDKAvailable, showGiphyPicker } from '@/services/giphyService';
import { Icon } from '@/components/ui/Icon';
import { Avatar } from '@/components/ui/Avatar';
import { BottomSheet, BottomSheetItem } from '@/components/ui/BottomSheet';
import { CharCountRing } from '@/components/ui/CharCountRing';
import { GlassHeader } from '@/components/ui/GlassHeader';
import { GradientButton } from '@/components/ui/GradientButton';
import { colors, spacing, fontSize, radius, fontSizeExt, fonts, animation } from '@/theme';
import { storiesApi, uploadApi } from '@/services/api';
import { useTranslation } from '@/hooks/useTranslation';
import { useThemeColors } from '@/hooks/useThemeColors';
import { useContextualHaptic } from '@/hooks/useContextualHaptic';
import { ScreenErrorBoundary } from '@/components/ui/ScreenErrorBoundary';
import { navigate } from '@/utils/navigation';
import { showToast } from '@/components/ui/Toast';
import { EidFrame } from '@/components/islamic/EidFrame';
import type { Occasion } from '@/components/islamic/EidFrame';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
const CANVAS_H = SCREEN_H * 0.7;

// ── Filter presets ──
// Each filter applies a color overlay on top of the image for a tint effect
const FILTERS = [
  { id: 'none', label: 'Normal', overlay: null },
  { id: 'warm', label: 'Warm', overlay: 'rgba(255, 180, 100, 0.15)' },
  { id: 'cool', label: 'Cool', overlay: 'rgba(100, 150, 255, 0.15)' },
  { id: 'vintage', label: 'Vintage', overlay: 'rgba(180, 150, 100, 0.2)' },
  { id: 'noir', label: 'Noir', overlay: 'rgba(0, 0, 0, 0.35)' },
  { id: 'emerald', label: 'Emerald', overlay: 'rgba(10, 123, 79, 0.15)' },
  { id: 'gold', label: 'Gold', overlay: 'rgba(200, 150, 62, 0.15)' },
];

// ── Font options ──
const FONTS = [
  { id: 'default', label: 'Default', fontFamily: undefined },
  { id: 'serif', label: 'Serif', fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif' },
  { id: 'mono', label: 'Mono', fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace' },
  { id: 'bold', label: 'Bold', fontFamily: undefined, fontWeight: '900' as const },
];

// ── Text colors ──
const TEXT_COLORS = [
  '#FFFFFF', '#0A7B4F', '#C8963E', '#000000',
  '#F85149', colors.extended.blue, '#D2A8FF', '#FFA657',
];

// ── Background gradient presets (for text-only stories) ──
const BG_GRADIENTS: [string, string][] = [
  ['#0A7B4F', '#065535'],
  ['#1a1a2e', '#16213e'],
  ['#C8963E', '#8B6914'],
  ['#0D1117', '#161B22'],
  ['#6B2FA0', '#3B0764'],
  ['#F85149', '#9B2C2C'],
];

// ── Sticker types (all 10 interactive types + mention/hashtag) ──
type StickerType = 'poll' | 'question' | 'countdown' | 'quiz' | 'location' | 'mention' | 'hashtag' | 'slider' | 'gif' | 'link' | 'addYours' | 'music';

interface Sticker {
  id: string;
  type: StickerType;
  x: number;
  y: number;
  scale: number;
  data: Record<string, unknown>;
}

// ── Sticker tray items (all 10 + mention/hashtag) ──
type IconName = React.ComponentProps<typeof Icon>['name'];
const STICKER_TRAY_ITEMS: Array<{ type: StickerType; icon: IconName; labelKey: string; color: string }> = [
  { type: 'poll', icon: 'bar-chart-2', labelKey: 'stories.poll', color: colors.emerald },
  { type: 'quiz', icon: 'check-circle', labelKey: 'stories.quiz', color: colors.extended.purple },
  { type: 'question', icon: 'at-sign', labelKey: 'stories.question', color: colors.extended.blue },
  { type: 'countdown', icon: 'clock', labelKey: 'stories.countdown', color: colors.gold },
  { type: 'slider', icon: 'trending-up', labelKey: 'stories.slider', color: colors.extended.orange },
  { type: 'location', icon: 'map-pin', labelKey: 'common.location', color: colors.extended.greenBright },
  { type: 'link', icon: 'link', labelKey: 'stories.link', color: colors.extended.blue },
  { type: 'addYours', icon: 'circle-plus', labelKey: 'stories.addYours', color: colors.emerald },
  { type: 'gif', icon: 'image', labelKey: 'stories.gif', color: colors.extended.purple },
  { type: 'music', icon: 'music', labelKey: 'stories.musicSticker', color: colors.extended.orangeLight },
  { type: 'mention', icon: 'at-sign', labelKey: 'stories.mention', color: colors.emeraldLight },
  { type: 'hashtag', icon: 'hash', labelKey: 'stories.hashtag', color: colors.gold },
];

// #region DraggableSticker Component (~70 lines)
// Draggable sticker wrapper — extracted to avoid Rules of Hooks in .map()
function DraggableSticker({
  sticker,
  onRemove,
  children,
  stickerStyle,
}: {
  sticker: Sticker;
  onRemove: (id: string) => void;
  children: React.ReactNode;
  stickerStyle: ViewStyle;
}) {
  const dragHaptic = useContextualHaptic();
  const translateX = useSharedValue(sticker.x);
  const translateY = useSharedValue(sticker.y);
  const contextX = useSharedValue(0);
  const contextY = useSharedValue(0);
  const isDragging = useSharedValue(false);
  const stickerScale = useSharedValue(1);

  const triggerDragHaptic = () => {
    dragHaptic.tick();
  };

  const panGesture = Gesture.Pan()
    .onStart(() => {
      contextX.value = translateX.value;
      contextY.value = translateY.value;
      isDragging.value = true;
      stickerScale.value = withSpring(1.08, { damping: 12, stiffness: 300 });
      runOnJS(triggerDragHaptic)();
    })
    .onUpdate((event) => {
      translateX.value = contextX.value + event.translationX;
      translateY.value = contextY.value + event.translationY;
    })
    .onEnd(() => {
      isDragging.value = false;
      stickerScale.value = withSpring(1, { damping: 15, stiffness: 200 });
    });

  const longPressGesture = Gesture.LongPress()
    .minDuration(500)
    .onEnd((_event, success) => {
      if (success) {
        runOnJS(onRemove)(sticker.id);
      }
    });

  const composedGesture = Gesture.Race(panGesture, longPressGesture);

  const animatedStyle = useAnimatedStyle(() => ({
    position: 'absolute' as const,
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: sticker.scale * stickerScale.value },
    ],
    // Subtle shadow lift when dragging
    shadowColor: '#000',
    shadowOffset: { width: 0, height: isDragging.value ? 8 : 2 },
    shadowOpacity: isDragging.value ? 0.3 : 0.1,
    shadowRadius: isDragging.value ? 16 : 4,
    elevation: isDragging.value ? 12 : 2,
  }));

  return (
    <GestureDetector gesture={composedGesture}>
      <Animated.View style={[animatedStyle, stickerStyle]}>
        {children}
      </Animated.View>
    </GestureDetector>
  );
}

// #endregion

// #region CreateStoryScreen — Main Screen Component
export default function CreateStoryScreen() {
  const router = useRouter();
  const tc = useThemeColors();
  const toolBtnStyle = getToolBtnStyle(tc);
  const editorTitle = getEditorTitle(tc);
  const editorInput = getEditorInput(tc);
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  const { eidFrame: eidFrameParam } = useLocalSearchParams<{ eidFrame?: string }>();

  // ── Eid Frame state ──
  const [eidFrameOccasion, setEidFrameOccasion] = useState<Occasion | null>(
    (eidFrameParam as Occasion) || null
  );
  const [showEidFramePicker, setShowEidFramePicker] = useState(false);

  const EID_OCCASIONS: Array<{ id: Occasion; label: string }> = [
    { id: 'eid-fitr', label: 'Eid al-Fitr' },
    { id: 'eid-adha', label: 'Eid al-Adha' },
    { id: 'ramadan', label: 'Ramadan' },
    { id: 'mawlid', label: 'Mawlid' },
    { id: 'isra-miraj', label: "Isra' & Mi'raj" },
    { id: 'hijri-new-year', label: 'Islamic New Year' },
  ];

  // ── Media state ──
  const [mediaUri, setMediaUri] = useState<string | null>(null);
  const [mediaType, setMediaType] = useState<'image' | 'video'>('image');

  // ── Text overlay state ──
  const [text, setText] = useState('');
  const [textColor, setTextColor] = useState('#FFFFFF');
  const [fontIndex, setFontIndex] = useState(0);
  const [textBgEnabled, setTextBgEnabled] = useState(false);

  // ── Filter state ──
  const [filterIndex, setFilterIndex] = useState(0);

  // ── Background gradient (text-only stories) ──
  const [bgGradientIndex, setBgGradientIndex] = useState(0);

  // ── Stickers ──
  const [stickers, setStickers] = useState<Sticker[]>([]);
  const [showStickerMenu, setShowStickerMenu] = useState(false);
  const [activeStickerEditor, setActiveStickerEditor] = useState<StickerType | null>(null);

  // ── Sticker editor temp state ──
  const [pollQuestion, setPollQuestion] = useState('');
  const [pollOptions, setPollOptions] = useState(['', '']);
  const [questionPrompt, setQuestionPrompt] = useState('');
  const [countdownTitle, setCountdownTitle] = useState('');
  const [countdownDate, setCountdownDate] = useState('');
  const [quizQuestion, setQuizQuestion] = useState('');
  const [quizOptions, setQuizOptions] = useState(['', '', '', '']);
  const [quizCorrectIndex, setQuizCorrectIndex] = useState(0);
  const [mentionUsername, setMentionUsername] = useState('');
  const [hashtagText, setHashtagText] = useState('');
  const [sliderQuestion, setSliderQuestion] = useState('');
  const [sliderEmoji, setSliderEmoji] = useState('');
  const [sliderMin, setSliderMin] = useState('0');
  const [sliderMax, setSliderMax] = useState('100');

  // ── New sticker editor state ──
  const [linkUrl, setLinkUrl] = useState('');
  const [linkTitle, setLinkTitle] = useState('');
  const [addYoursPrompt, setAddYoursPrompt] = useState('');
  const [showGifSearch, setShowGifSearch] = useState(false);
  const [showLocationSearch, setShowLocationSearch] = useState(false);
  const [stickerSearch, setStickerSearch] = useState('');
  const [musicDisplayMode, setMusicDisplayMode] = useState<'compact' | 'lyrics' | 'waveform'>('compact');
  const haptic = useContextualHaptic();

  // ── Close friends / Subscribers (mutually exclusive) ──
  const [closeFriendsOnly, setCloseFriendsOnly] = useState(false);
  const [subscribersOnly, setSubscribersOnly] = useState(false);

  const handleCloseFriendsToggle = (val: boolean) => {
    setCloseFriendsOnly(val);
    if (val) setSubscribersOnly(false);
  };
  const handleSubscribersToggle = (val: boolean) => {
    setSubscribersOnly(val);
    if (val) setCloseFriendsOnly(false);
  };

  // ── Active tool ──
  const [activeTool, setActiveTool] = useState<'text' | 'filter' | 'sticker' | null>(null);

  // ── Music / Drawing / Text Effects ──
  const [showMusicPicker, setShowMusicPicker] = useState(false);
  const [selectedTrack, setSelectedTrack] = useState<{ id: string; title: string; artist: string } | null>(null);
  const [showDrawing, setShowDrawing] = useState(false);
  const [drawPaths, setDrawPaths] = useState<DrawPath[]>([]);
  const [showTextEffects, setShowTextEffects] = useState(false);
  const [textEffects, setTextEffects] = useState<TextEffect[]>([]);

  // ── Sticker hint toast ──
  const [showStickerHint, setShowStickerHint] = useState(false);
  const hintOpacity = useSharedValue(0);

  // Cleanup GIPHY SDK listener on unmount
  useEffect(() => {
    return () => {
      if (giphyCleanupRef.current) { giphyCleanupRef.current(); giphyCleanupRef.current = null; }
    };
  }, []);

  // ── Discard check ──
  const hasContent = mediaUri || text.length > 0 || stickers.length > 0;

  const handleClose = () => {
    if (hasContent) {
      Alert.alert(t('stories.discardStory'), t('stories.unsavedChanges'), [
        { text: t('stories.keepEditing'), style: 'cancel' },
        { text: t('common.discard'), style: 'destructive', onPress: () => router.back() },
      ]);
    } else {
      router.back();
    }
  };

  // ── Media picker ──
  const pickMedia = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      showToast({ message: t('stories.mediaPermissionRequired', 'Media library permission required'), variant: 'error' });
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images', 'videos'],
      allowsEditing: true,
      aspect: [9, 16],
      quality: 0.9,
      exif: false,
    });
    if (!result.canceled && result.assets[0]) {
      setMediaUri(result.assets[0].uri);
      setMediaType(result.assets[0].type === 'video' ? 'video' : 'image');
    }
  };

  const takePhoto = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) return;
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images', 'videos'],
      allowsEditing: true,
      aspect: [9, 16],
      quality: 0.9,
      exif: false,
    });
    if (!result.canceled && result.assets[0]) {
      setMediaUri(result.assets[0].uri);
      setMediaType(result.assets[0].type === 'video' ? 'video' : 'image');
    }
  };

  // ── Add sticker ──
  const addSticker = (type: StickerType, data: Record<string, unknown>) => {
    setStickers(prev => [
      ...prev,
      {
        id: `${type}-${Date.now()}`,
        type,
        x: SCREEN_W / 2 - 80,
        y: CANVAS_H / 2 - 40,
        scale: 1,
        data,
      },
    ]);
    setActiveStickerEditor(null);
    setShowStickerMenu(false);
    // Show hint toast
    setShowStickerHint(true);
    hintOpacity.value = 1;
    hintOpacity.value = withDelay(2000, withTiming(0, { duration: 300 }, () => {
      runOnJS(setShowStickerHint)(false);
    }));
  };

  const removeSticker = (id: string) => {
    Alert.alert(t('stories.removeSticker'), '', [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('common.remove'), style: 'destructive', onPress: () => {
        setStickers(prev => prev.filter(s => s.id !== id));
      }},
    ]);
  };

  // ── Submit sticker forms ──
  const submitPoll = () => {
    if (!pollQuestion.trim() || pollOptions.filter(o => o.trim()).length < 2) return;
    addSticker('poll', { question: pollQuestion, options: pollOptions.filter(o => o.trim()) });
    setPollQuestion(''); setPollOptions(['', '']);
  };

  const submitQuestion = () => {
    if (!questionPrompt.trim()) return;
    addSticker('question', { prompt: questionPrompt });
    setQuestionPrompt('');
  };

  const submitCountdown = () => {
    if (!countdownTitle.trim()) return;
    addSticker('countdown', { title: countdownTitle, endsAt: countdownDate || null });
    setCountdownTitle(''); setCountdownDate('');
  };

  const submitQuiz = () => {
    if (!quizQuestion.trim() || quizOptions.filter(o => o.trim()).length < 2) return;
    addSticker('quiz', {
      question: quizQuestion,
      options: quizOptions.filter(o => o.trim()),
      correctIndex: quizCorrectIndex,
    });
    setQuizQuestion(''); setQuizOptions(['', '', '', '']); setQuizCorrectIndex(0);
  };

  const submitMention = () => {
    if (!mentionUsername.trim()) return;
    addSticker('mention', { username: mentionUsername.replace('@', '') });
    setMentionUsername('');
  };

  const submitHashtag = () => {
    if (!hashtagText.trim()) return;
    addSticker('hashtag', { tag: hashtagText.replace('#', '') });
    setHashtagText('');
  };

  const submitSlider = () => {
    if (!sliderQuestion.trim()) return;
    const min = parseInt(sliderMin) || 0;
    const max = parseInt(sliderMax) || 100;
    if (min >= max) return;
    addSticker('slider', {
      emoji: sliderEmoji.trim() || '',
      question: sliderQuestion.trim(),
      minValue: min,
      maxValue: max,
    });
    setSliderQuestion('');
    setSliderEmoji('');
    setSliderMin('0');
    setSliderMax('100');
  };

  const submitLink = () => {
    if (!linkUrl.trim()) return;
    addSticker('link', {
      url: linkUrl.trim(),
      title: linkTitle.trim() || undefined,
    });
    setLinkUrl('');
    setLinkTitle('');
  };

  const submitAddYours = () => {
    if (!addYoursPrompt.trim()) return;
    addSticker('addYours', {
      prompt: addYoursPrompt.trim(),
    });
    setAddYoursPrompt('');
  };

  const giphyCleanupRef = useRef<(() => void) | null>(null);

  const handleGifSelect = (gif: GifItem) => {
    addSticker('gif', {
      gifUrl: gif.url,
      gifPreviewUrl: gif.previewUrl,
      gifWidth: gif.width,
      gifHeight: gif.height,
      gifTitle: gif.title,
    });
    setShowGifSearch(false);
  };

  // Open GIF picker — native GIPHY dialog first, fallback to custom search
  const openGifPicker = () => {
    if (isSDKAvailable()) {
      // Clean up previous listener
      if (giphyCleanupRef.current) { giphyCleanupRef.current(); giphyCleanupRef.current = null; }
      const cleanup = showGiphyPicker({
        mediaTypes: ['gif', 'sticker', 'text', 'emoji'],
        onSelect: (media) => {
          addSticker('gif', {
            gifUrl: media.url,
            gifPreviewUrl: media.previewUrl,
            gifWidth: media.width,
            gifHeight: media.height,
            gifTitle: media.title,
          });
        },
      });
      giphyCleanupRef.current = cleanup;
    } else {
      setShowGifSearch(true);
    }
  };

  const handleLocationSelect = (location: LocationData) => {
    addSticker('location', {
      locationId: location.id,
      locationName: location.name,
      locationAddress: location.address,
      locationCity: location.city,
    });
    setShowLocationSearch(false);
  };

  const handleMusicStickerAdd = () => {
    if (!selectedTrack) {
      setShowMusicPicker(true);
      return;
    }
    addSticker('music', {
      trackId: selectedTrack.id,
      title: selectedTrack.title,
      artist: selectedTrack.artist,
      displayMode: musicDisplayMode,
    });
  };

  // ── Upload mutation ──
  const publishMutation = useMutation({
    mutationFn: async () => {
      let mediaUrl = '';
      if (mediaUri) {
        const contentType = mediaType === 'video' ? 'video/mp4' : 'image/jpeg';
        const upload = await uploadApi.getPresignUrl(contentType, 'stories');
        // Actually upload the media blob to R2
        const response = await fetch(mediaUri);
        const blob = await response.blob();
        await fetch(upload.uploadUrl, { method: 'PUT', body: blob, headers: { 'Content-Type': contentType } });
        mediaUrl = upload.publicUrl;
      }
      return storiesApi.create({
        mediaUrl,
        mediaType,
        textOverlay: text || undefined,
        textColor,
        fontFamily: FONTS[fontIndex].id,
        filter: FILTERS[filterIndex].id,
        bgGradient: !mediaUri ? JSON.stringify(BG_GRADIENTS[bgGradientIndex]) : undefined,
        stickerData: stickers.length > 0 ? stickers : undefined,
        closeFriendsOnly,
        subscribersOnly,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stories-feed'] });
      showToast({ message: t('stories.published'), variant: 'success' });
      router.back();
    },
    onError: (error: Error) => showToast({ message: error.message || t('stories.failedToPublish'), variant: 'error' }),
  });

  const currentFont = FONTS[fontIndex];
  const currentFilter = FILTERS[filterIndex];

  // ── Render sticker on canvas ──
  const stickerStylesMap: Record<StickerType, ViewStyle> = {
    poll: { backgroundColor: 'rgba(13,17,23,0.88)', borderRadius: radius.lg, padding: spacing.md, minWidth: 220, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
    question: { backgroundColor: 'rgba(10,123,79,0.85)', borderRadius: radius.lg, padding: spacing.md, minWidth: 220, borderWidth: 1, borderColor: 'rgba(10,123,79,0.3)' },
    countdown: { backgroundColor: 'rgba(13,17,23,0.88)', borderRadius: radius.lg, padding: spacing.md, minWidth: 180, borderWidth: 2, borderColor: colors.gold },
    quiz: { backgroundColor: 'rgba(13,17,23,0.88)', borderRadius: radius.lg, padding: spacing.md, minWidth: 220, borderWidth: 1, borderColor: 'rgba(163,113,247,0.3)' },
    location: { backgroundColor: 'rgba(10,123,79,0.85)', borderRadius: radius.full, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
    mention: { backgroundColor: 'rgba(10,123,79,0.85)', borderRadius: radius.full, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
    hashtag: { backgroundColor: 'rgba(200,150,62,0.85)', borderRadius: radius.full, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
    slider: { backgroundColor: 'rgba(13,17,23,0.88)', borderRadius: radius.lg, padding: spacing.md, minWidth: 220, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
    gif: { borderRadius: radius.md, overflow: 'hidden' as const },
    link: { backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: radius.md, padding: spacing.md, minWidth: 200, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
    addYours: { backgroundColor: 'rgba(13,17,23,0.88)', borderRadius: radius.lg, padding: spacing.md, minWidth: 220, borderWidth: 1, borderColor: 'rgba(10,123,79,0.3)' },
    music: { borderRadius: radius.full, overflow: 'hidden' as const },
  };

  const renderStickerContent = (sticker: Sticker) => {
    switch (sticker.type) {
      case 'poll':
        return (
          <View>
            <Text style={{ color: tc.text.primary, fontSize: fontSize.sm, fontWeight: '700', marginBottom: spacing.sm }}>
              {String(sticker.data.question)}
            </Text>
            {(sticker.data.options as string[]).map((opt, i) => (
              <View key={i} style={{
                backgroundColor: tc.surface, borderRadius: radius.sm,
                paddingVertical: spacing.sm, paddingHorizontal: spacing.md,
                marginBottom: spacing.xs,
              }}>
                <Text style={{ color: tc.text.primary, fontSize: fontSize.sm }}>{opt}</Text>
              </View>
            ))}
          </View>
        );
      case 'question':
        return (
          <View>
            <Text style={{ color: '#fff', fontSize: fontSize.sm, fontWeight: '700', textAlign: 'center' }}>
              {String(sticker.data.prompt)}
            </Text>
            <View style={{
              backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: radius.sm,
              paddingVertical: spacing.md, marginTop: spacing.sm,
            }}>
              <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: fontSize.xs, textAlign: 'center' }}>
                {t('stories.tapToRespond')}
              </Text>
            </View>
          </View>
        );
      case 'countdown':
        return (
          <View style={{ alignItems: 'center' }}>
            <Icon name="clock" size="sm" color={colors.emerald} />
            <Text style={{ color: tc.text.primary, fontSize: fontSize.sm, fontWeight: '700', marginTop: 4 }}>
              {String(sticker.data.title)}
            </Text>
            <Text style={{ color: tc.text.secondary, fontSize: fontSize.xs, marginTop: 2 }}>
              {sticker.data.endsAt ? String(sticker.data.endsAt) : t('stories.noEndDateSet')}
            </Text>
          </View>
        );
      case 'quiz':
        return (
          <View>
            <Text style={{ color: tc.text.primary, fontSize: fontSize.sm, fontWeight: '700', marginBottom: spacing.sm }}>
              {String(sticker.data.question)}
            </Text>
            {(sticker.data.options as string[]).map((opt, i) => (
              <View key={i} style={{
                backgroundColor: i === sticker.data.correctIndex ? colors.emerald : tc.surface,
                borderRadius: radius.sm, paddingVertical: spacing.sm, paddingHorizontal: spacing.md,
                marginBottom: spacing.xs,
              }}>
                <Text style={{ color: tc.text.primary, fontSize: fontSize.sm }}>{opt}</Text>
              </View>
            ))}
          </View>
        );
      case 'location':
        return (
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Icon name="map-pin" size="xs" color="#000" />
            <Text style={{ color: '#000', fontSize: fontSize.sm, fontWeight: '600', marginStart: 4 }}>
              {t('common.location')}
            </Text>
          </View>
        );
      case 'mention':
        return (
          <Text style={{ color: '#fff', fontSize: fontSize.sm, fontWeight: '600' }}>
            @{String(sticker.data.username)}
          </Text>
        );
      case 'hashtag':
        return (
          <Text style={{ color: '#fff', fontSize: fontSize.sm, fontWeight: '600' }}>
            #{String(sticker.data.tag)}
          </Text>
        );
      case 'slider':
        return (
          <View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm }}>
              <Icon name="trending-up" size="sm" color={colors.extended.orange} />
              <Text style={{ color: tc.text.primary, fontSize: fontSize.sm, fontWeight: '700', flex: 1 }}>
                {String(sticker.data.question)}
              </Text>
            </View>
            <View style={{ height: 6, backgroundColor: tc.surface, borderRadius: radius.full, overflow: 'hidden' }}>
              <View style={{ width: '50%', height: '100%', backgroundColor: colors.emerald, borderRadius: radius.full }} />
            </View>
            <Text style={{ color: tc.text.tertiary, fontSize: fontSize.xs, marginTop: spacing.xs }}>
              {String(sticker.data.minValue || 0)} – {String(sticker.data.maxValue || 100)}
            </Text>
          </View>
        );
      case 'gif':
        return (
          <View style={{ alignItems: 'center' }}>
            <ProgressiveImage uri={String(sticker.data.gifPreviewUrl)} width={120} height={90} borderRadius={radius.sm} contentFit="cover" />
          </View>
        );
      case 'link':
        return (
          <View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.xs }}>
              <Icon name="link" size="sm" color={colors.extended.blue} />
              <Text style={{ color: tc.text.secondary, fontSize: fontSize.xs, flex: 1 }} numberOfLines={1}>
                {String(sticker.data.url)}
              </Text>
            </View>
            {sticker.data.title ? (
              <Text style={{ color: tc.text.primary, fontSize: fontSize.sm, fontWeight: '600' }} numberOfLines={2}>
                {String(sticker.data.title)}
              </Text>
            ) : null}
          </View>
        );
      case 'addYours':
        return (
          <View style={{ alignItems: 'center' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm }}>
              <Icon name="circle-plus" size="sm" color={colors.emerald} />
              <Text style={{ color: colors.emerald, fontSize: fontSize.sm, fontWeight: '600' }}>
                {t('stories.addYours')}
              </Text>
            </View>
            <Text style={{ color: tc.text.primary, fontSize: fontSize.sm, fontWeight: '600', fontStyle: 'italic', textAlign: 'center' }}>
              {String(sticker.data.prompt)}
            </Text>
          </View>
        );
      case 'music':
        return (
          <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(10,123,79,0.85)', paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.full, gap: spacing.sm }}>
            <Icon name="music" size="sm" color="#fff" />
            <View style={{ flex: 1 }}>
              <Text style={{ color: '#fff', fontSize: fontSize.sm, fontWeight: '700' }} numberOfLines={1}>
                {String(sticker.data.title)}
              </Text>
              <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: fontSizeExt.tiny }} numberOfLines={1}>
                {String(sticker.data.artist)}
              </Text>
            </View>
          </View>
        );
      default:
        return null;
    }
  };

  const renderSticker = (sticker: Sticker) => (
    <DraggableSticker
      key={sticker.id}
      sticker={sticker}
      onRemove={removeSticker}
      stickerStyle={stickerStylesMap[sticker.type]}
    >
      {renderStickerContent(sticker)}
    </DraggableSticker>
  );

  return (
    <ScreenErrorBoundary>
    <SafeAreaView style={{ flex: 1, backgroundColor: tc.bg }}>
      {/* ── Header ── */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: spacing.base, paddingVertical: spacing.sm, backgroundColor: tc.bgElevated, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: tc.border }}>
        <Pressable onPress={handleClose} hitSlop={8} accessibilityLabel={t('common.close')} accessibilityRole="button">
          <Icon name="x" size="md" color={tc.text.primary} />
        </Pressable>
        <Text style={{ color: tc.text.primary, fontSize: fontSize.md, fontWeight: '700', letterSpacing: 0.2 }}>{t('stories.newStory')}</Text>
        <View style={{ flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' }}>
          <Pressable
            onPress={() => setActiveTool(activeTool === 'text' ? null : 'text')}
            style={{
              alignItems: 'center',
              padding: spacing.xs,
              backgroundColor: activeTool === 'text' ? colors.active.emerald20 : 'transparent',
              borderRadius: radius.full,
            }}
            accessibilityLabel={t('accessibility.addText')}
            accessibilityRole="button"
          >
            <Icon name="edit" size="sm" color={activeTool === 'text' ? colors.emerald : tc.text.primary} />
            <Text style={{
              fontSize: fontSize.xs,
              color: tc.text.secondary,
              marginTop: 2,
            }}>{t('stories.text')}</Text>
          </Pressable>
          <Pressable
            onPress={() => setActiveTool(activeTool === 'sticker' ? null : 'sticker')}
            style={{
              alignItems: 'center',
              padding: spacing.xs,
              backgroundColor: activeTool === 'sticker' ? colors.active.emerald20 : 'transparent',
              borderRadius: radius.full,
            }}
            accessibilityLabel={t('stories.addSticker')}
            accessibilityRole="button"
          >
            <Icon name="smile" size="sm" color={activeTool === 'sticker' ? colors.emerald : tc.text.primary} />
            <Text style={{
              fontSize: fontSize.xs,
              color: tc.text.secondary,
              marginTop: 2,
            }}>{t('stories.sticker')}</Text>
          </Pressable>
          <Pressable
            onPress={() => setActiveTool(activeTool === 'filter' ? null : 'filter')}
            style={{
              alignItems: 'center',
              padding: spacing.xs,
              backgroundColor: activeTool === 'filter' ? colors.active.emerald20 : 'transparent',
              borderRadius: radius.full,
            }}
            accessibilityLabel={t('stories.addFilter')}
            accessibilityRole="button"
          >
            <Icon name="layers" size="sm" color={activeTool === 'filter' ? colors.emerald : tc.text.primary} />
            <Text style={{
              fontSize: fontSize.xs,
              color: tc.text.secondary,
              marginTop: 2,
            }}>{t('stories.filter')}</Text>
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel={t('story.music')} style={{ alignItems: 'center', padding: spacing.xs }} onPress={() => setShowMusicPicker(true)}>
            <Icon name="music" size="sm" color={selectedTrack ? colors.emerald : tc.text.primary} />
            <Text style={{ fontSize: fontSize.xs, color: tc.text.secondary, marginTop: 2 }}>{t('story.music')}</Text>
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel={t('story.draw')} style={{ alignItems: 'center', padding: spacing.xs }} onPress={() => setShowDrawing(true)}>
            <Icon name="pencil" size="sm" color={drawPaths.length > 0 ? colors.emerald : tc.text.primary} />
            <Text style={{ fontSize: fontSize.xs, color: tc.text.secondary, marginTop: 2 }}>{t('story.draw')}</Text>
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel={t('story.effects')} style={{ alignItems: 'center', padding: spacing.xs }} onPress={() => setShowTextEffects(true)}>
            <Icon name="edit" size="sm" color={textEffects.length > 0 ? colors.emerald : tc.text.primary} />
            <Text style={{ fontSize: fontSize.xs, color: tc.text.secondary, marginTop: 2 }}>{t('story.effects')}</Text>
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel={t('eidCards.pickOccasion')} style={{ alignItems: 'center', padding: spacing.xs }} onPress={() => setShowEidFramePicker(true)}>
            <Icon name="star" size="sm" color={eidFrameOccasion ? colors.emerald : tc.text.primary} />
            <Text style={{ fontSize: fontSize.xs, color: tc.text.secondary, marginTop: 2 }}>{t('eidCards.pickOccasion')}</Text>
          </Pressable>
        </View>
      </View>

      {/* ── Canvas ── */}
      <View style={{ height: CANVAS_H, marginHorizontal: spacing.sm, borderRadius: radius.lg, overflow: 'hidden' }}>
        {eidFrameOccasion ? (
          <EidFrame occasion={eidFrameOccasion}>
            {mediaUri ? (
              <View style={{ flex: 1 }}>
                <ProgressiveImage uri={mediaUri} width="100%" height={CANVAS_H} contentFit="cover" />
                {currentFilter.overlay && (
                  <View style={[StyleSheet.absoluteFill, { backgroundColor: currentFilter.overlay }]} pointerEvents="none" />
                )}
              </View>
            ) : (
              <LinearGradient colors={BG_GRADIENTS[bgGradientIndex]} style={{ flex: 1 }} />
            )}
          </EidFrame>
        ) : mediaUri ? (
          <View style={{ flex: 1 }}>
            <ProgressiveImage uri={mediaUri} width={SCREEN_W} height={CANVAS_H} contentFit="cover" />
            {currentFilter.overlay && (
              <View style={[StyleSheet.absoluteFill, { backgroundColor: currentFilter.overlay }]} pointerEvents="none" />
            )}
          </View>
        ) : (
          <LinearGradient colors={BG_GRADIENTS[bgGradientIndex]} style={{ flex: 1 }} />
        )}

        {/* Text overlay */}
        {text.length > 0 && (
          <View style={{
            position: 'absolute', start: 0, end: 0, top: '40%',
            alignItems: 'center', paddingHorizontal: spacing.base,
          }}>
            <View style={textBgEnabled ? {
              backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: radius.sm,
              paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
            } : undefined}>
              <Text style={{
                color: textColor,
                fontSize: fontSize.xl,
                fontWeight: currentFont.fontWeight || '700',
                fontFamily: currentFont.fontFamily,
                textAlign: 'center',
                textShadowColor: 'rgba(0,0,0,0.5)',
                textShadowOffset: { width: 1, height: 1 },
                textShadowRadius: 3,
              }}>
                {text}
              </Text>
            </View>
          </View>
        )}

        {/* Draw paths overlay */}
        {drawPaths.length > 0 && (
          <Svg style={StyleSheet.absoluteFill} width={SCREEN_W} height={CANVAS_H} pointerEvents="none">
            {drawPaths.map((p, i) => (
              <Path key={i} d={p.d} stroke={p.stroke} strokeWidth={p.strokeWidth}
                opacity={p.opacity} fill="none" strokeLinecap="round" strokeLinejoin="round" />
            ))}
          </Svg>
        )}

        {/* Text effects overlay */}
        {textEffects.map((te) => (
          <Animated.View key={te.id} entering={FadeIn} style={[{
            position: 'absolute' as const,
            start: spacing.base,
            end: spacing.base,
            top: SCREEN_H * 0.4,
          }, { alignItems: te.alignment === 'left' ? 'flex-start' : te.alignment === 'right' ? 'flex-end' : 'center' }]}>
            <Text style={{
              color: te.color,
              fontSize: te.fontSize,
              textAlign: te.alignment,
              fontWeight: te.style === 'strong' || te.style === 'modern' ? '800' : '400',
              fontStyle: te.style === 'cursive' ? 'italic' : 'normal',
              ...(te.bgColor ? { backgroundColor: te.bgColor, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs } : {}),
              ...(te.style === 'neon' ? { textShadowColor: te.color, textShadowRadius: 10, textShadowOffset: { width: 0, height: 0 } } : {}),
            }}>
              {te.text}
            </Text>
          </Animated.View>
        ))}

        {/* Stickers on canvas */}
        {stickers.map(renderSticker)}

        {/* Sticker placement hint toast */}
        {showStickerHint && (
          <Animated.View
            style={{
              position: 'absolute',
              bottom: 20,
              start: 0,
              end: 0,
              alignItems: 'center',
              opacity: hintOpacity,
            }}
          >
            <View style={{
              backgroundColor: 'rgba(0,0,0,0.7)',
              borderRadius: radius.full,
              paddingHorizontal: spacing.md,
              paddingVertical: spacing.sm,
            }}>
              <Text style={{
                color: tc.text.secondary,
                fontSize: fontSize.xs,
              }}>{t('stories.dragToMoveAndResize')}</Text>
            </View>
          </Animated.View>
        )}
      </View>

      {/* ── Selected track indicator ── */}
      {selectedTrack && (
        <Animated.View entering={FadeIn} style={{
          flexDirection: 'row' as const,
          alignItems: 'center' as const,
          backgroundColor: tc.bgCard,
          paddingHorizontal: spacing.md,
          paddingVertical: spacing.sm,
          borderRadius: radius.md,
          marginHorizontal: spacing.base,
          marginTop: spacing.sm,
          gap: spacing.sm,
        }}>
          <Icon name="music" size="sm" color={colors.emerald} />
          <Text style={{ flex: 1, color: tc.text.primary, fontSize: fontSize.sm }} numberOfLines={1}>
            {selectedTrack.title} — {selectedTrack.artist}
          </Text>
          <Pressable accessibilityRole="button" accessibilityLabel={t('common.remove')} onPress={() => setSelectedTrack(null)} hitSlop={8}>
            <Icon name="x" size="sm" color={tc.text.secondary} />
          </Pressable>
        </Animated.View>
      )}

      {/* ── Tool Panels ── */}
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: spacing.base }} keyboardShouldPersistTaps="handled">

        {/* No media: pick or shoot */}
        {!mediaUri && activeTool === null && (
          <>
            <View style={{ flexDirection: 'row', gap: spacing.md, marginBottom: spacing.md }}>
              <Pressable onPress={pickMedia} style={[toolBtnStyle, { flex: 1 }]} accessibilityLabel={t('stories.pickFromGallery')} accessibilityRole="button">
                <Icon name="image" size="sm" color={colors.emerald} />
                <Text style={{ color: tc.text.primary, fontSize: fontSize.sm, marginStart: spacing.sm }}>{t('stories.gallery')}</Text>
              </Pressable>
              <Pressable onPress={takePhoto} style={[toolBtnStyle, { flex: 1 }]} accessibilityLabel={t('stories.takePhoto')} accessibilityRole="button">
                <Icon name="camera" size="sm" color={colors.emerald} />
                <Text style={{ color: tc.text.primary, fontSize: fontSize.sm, marginStart: spacing.sm }}>{t('stories.camera')}</Text>
              </Pressable>
            </View>
            <View style={{ flexDirection: 'row', gap: spacing.md, marginBottom: spacing.md }}>
              <Pressable onPress={() => navigate('/(screens)/disposable-camera')} style={[toolBtnStyle, { flex: 1 }]} accessibilityLabel={t('stories.disposable')} accessibilityRole="button">
                <Icon name="camera" size="sm" color={colors.gold} />
                <Text style={{ color: tc.text.primary, fontSize: fontSize.sm, marginStart: spacing.sm }}>{t('stories.disposable')}</Text>
              </Pressable>
              <Pressable onPress={() => navigate('/(screens)/photo-music')} style={[toolBtnStyle, { flex: 1 }]} accessibilityLabel={t('stories.photoMusic')} accessibilityRole="button">
                <Icon name="music" size="sm" color={colors.gold} />
                <Text style={{ color: tc.text.primary, fontSize: fontSize.sm, marginStart: spacing.sm }}>{t('stories.photoMusic')}</Text>
              </Pressable>
            </View>
          </>
        )}

        {/* BG gradient picker (text-only stories) */}
        {!mediaUri && (
          <View style={{ marginBottom: spacing.md }}>
            <Text style={{ color: tc.text.secondary, fontSize: fontSize.xs, marginBottom: spacing.sm }}>{t('stories.background')}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {BG_GRADIENTS.map((g, i) => {
                const isActive = i === bgGradientIndex;
                return (
                  <Pressable key={i} accessibilityRole="button" accessibilityLabel={`${t('stories.background')} ${i + 1}`} accessibilityState={{ selected: isActive }} onPress={() => setBgGradientIndex(i)}>
                    <View style={{
                      width: 48,
                      height: 48,
                      borderRadius: radius.full,
                      marginEnd: spacing.sm,
                      overflow: 'hidden',
                      justifyContent: 'center',
                      alignItems: 'center',
                      borderWidth: isActive ? 2 : 0,
                      borderColor: colors.emerald,
                    }}>
                      <LinearGradient
                        colors={g}
                        style={StyleSheet.absoluteFill}
                      />
                      {isActive && (
                        <View style={{
                          width: 20,
                          height: 20,
                          borderRadius: radius.full,
                          backgroundColor: colors.emerald,
                          justifyContent: 'center',
                          alignItems: 'center',
                        }}>
                          <Icon name="check" size={12} color="#fff" />
                        </View>
                      )}
                    </View>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        )}

        {mediaUri && activeTool === null && (
          <Pressable onPress={pickMedia} style={toolBtnStyle} accessibilityLabel={t('stories.changeMedia')} accessibilityRole="button">
            <Icon name="image" size="sm" color={tc.text.secondary} />
            <Text style={{ color: tc.text.secondary, fontSize: fontSize.sm, marginStart: spacing.sm }}>{t('stories.changeMedia')}</Text>
          </Pressable>
        )}

        {/* ── Text tool ── */}
        {activeTool === 'text' && (
          <View>
            <TextInput
              value={text}
              onChangeText={setText}
              placeholder={t('stories.addTextPlaceholder')}
              placeholderTextColor={tc.text.tertiary}
              multiline
              maxLength={200}
              style={{
                color: tc.text.primary, fontSize: fontSize.base,
                backgroundColor: tc.bgElevated, borderRadius: radius.sm,
                padding: spacing.md, minHeight: 60, marginBottom: spacing.md,
              }}
            />
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.sm }}>
              <CharCountRing current={text.length} max={200} size={24} />
              <Pressable onPress={() => setTextBgEnabled(!textBgEnabled)} style={{
                flexDirection: 'row', alignItems: 'center',
                backgroundColor: textBgEnabled ? colors.active.emerald10 : tc.surface,
                paddingHorizontal: spacing.md, paddingVertical: spacing.xs, borderRadius: radius.full,
              }} accessibilityLabel={t('accessibility.toggleTextBg')} accessibilityRole="switch" accessibilityState={{ checked: textBgEnabled }}>
                <Text style={{ color: textBgEnabled ? colors.emerald : tc.text.secondary, fontSize: fontSize.xs }}>
                  BG
                </Text>
              </Pressable>
            </View>
            {/* Color picker */}
            <View style={{ flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md }}>
              {TEXT_COLORS.map(c => (
                <Pressable key={c} accessibilityRole="radio" accessibilityState={{ selected: c === textColor }} accessibilityLabel={c} onPress={() => setTextColor(c)} hitSlop={4} style={{
                  width: 28, height: 28, borderRadius: radius.full,
                  backgroundColor: c, borderWidth: c === textColor ? 2 : 1,
                  borderColor: c === textColor ? colors.emerald : tc.border,
                }} />
              ))}
            </View>
            {/* Font picker */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {FONTS.map((f, i) => (
                <Pressable key={f.id} accessibilityRole="radio" accessibilityState={{ selected: i === fontIndex }} onPress={() => setFontIndex(i)} style={{
                  paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
                  backgroundColor: i === fontIndex ? colors.emerald : tc.surface,
                  borderRadius: radius.full, marginEnd: spacing.sm,
                }}>
                  <Text style={{
                    color: i === fontIndex ? '#fff' : tc.text.primary,
                    fontSize: fontSize.sm, fontFamily: f.fontFamily, fontWeight: f.fontWeight,
                  }}>
                    {t(`stories.font${f.id.charAt(0).toUpperCase() + f.id.slice(1)}`, { defaultValue: f.label })}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        )}

        {/* ── Filter tool ── */}
        {activeTool === 'filter' && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {FILTERS.map((f, i) => (
              <Pressable key={f.id} accessibilityRole="radio" accessibilityState={{ selected: i === filterIndex }} accessibilityLabel={f.label} onPress={() => setFilterIndex(i)} style={{ marginEnd: spacing.md, alignItems: 'center' }}>
                {/* Circular thumbnail with filter tint overlay */}
                <View style={{
                  width: 40, height: 40, borderRadius: radius.full, overflow: 'hidden',
                  borderWidth: i === filterIndex ? 2 : 0, borderColor: colors.emerald,
                }}>
                  {mediaUri && (
                    <View style={{ flex: 1 }}>
                      <ProgressiveImage uri={mediaUri} width={40} height={40} />
                      {f.overlay && (
                        <View style={[StyleSheet.absoluteFill, { backgroundColor: f.overlay }]} />
                      )}
                    </View>
                  )}
                  {!mediaUri && (
                    <View style={{ flex: 1 }}>
                      <LinearGradient colors={BG_GRADIENTS[bgGradientIndex]} style={{ flex: 1 }} />
                      {f.overlay && (
                        <View style={[StyleSheet.absoluteFill, { backgroundColor: f.overlay }]} />
                      )}
                    </View>
                  )}
                </View>
                <Text style={{
                  color: i === filterIndex ? colors.emerald : tc.text.secondary,
                  fontSize: fontSizeExt.tiny,
                  marginTop: 4,
                }}>
                  {t(`stories.filter${f.id.charAt(0).toUpperCase() + f.id.slice(1)}`, { defaultValue: f.label })}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        )}

        {/* ── Sticker tray — search + 3-column grid with 80px cells ── */}
        {activeTool === 'sticker' && !activeStickerEditor && (
          <Animated.View entering={FadeIn.duration(200)}>
            {/* Search bar */}
            <View style={{
              flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
              backgroundColor: tc.bgElevated, borderRadius: radius.md,
              paddingHorizontal: spacing.md, height: 44, marginBottom: spacing.lg,
              borderWidth: 1, borderColor: tc.border,
            }}>
              <Icon name="search" size="sm" color={tc.text.tertiary} />
              <TextInput
                value={stickerSearch}
                onChangeText={setStickerSearch}
                placeholder={t('stories.searchStickers')}
                placeholderTextColor={tc.text.tertiary}
                style={{ flex: 1, color: tc.text.primary, fontSize: fontSize.base, fontFamily: fonts.body, paddingVertical: 0 }}
                accessibilityLabel={t('stories.searchStickers')}
                autoCapitalize="none"
              />
              {stickerSearch.length > 0 && (
                <Pressable onPress={() => setStickerSearch('')} hitSlop={8}>
                  <Icon name="x" size="sm" color={tc.text.tertiary} />
                </Pressable>
              )}
            </View>

            {/* 3-column grid — filtered stickers */}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md }}>
              {STICKER_TRAY_ITEMS.filter(item => {
                if (!stickerSearch.trim()) return true;
                const q = stickerSearch.toLowerCase();
                return item.type.toLowerCase().includes(q) || t(item.labelKey).toLowerCase().includes(q);
              }).map((item, index) => {
                const cellWidth = (SCREEN_W - spacing.base * 2 - spacing.md * 2) / 3;
                return (
                  <Animated.View
                    key={item.type}
                    entering={FadeInDown.delay(index * 40).duration(300).springify().damping(14).stiffness(130)}
                    style={{ width: cellWidth }}
                  >
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={t(item.labelKey)}
                      onPress={() => {
                        haptic.tick();
                        if (item.type === 'location') setShowLocationSearch(true);
                        else if (item.type === 'gif') openGifPicker();
                        else if (item.type === 'music') handleMusicStickerAdd();
                        else setActiveStickerEditor(item.type);
                      }}
                      style={({ pressed }) => ({
                        backgroundColor: pressed ? `${item.color}15` : tc.bgElevated,
                        borderRadius: radius.lg,
                        height: 88,
                        alignItems: 'center',
                        justifyContent: 'center',
                        borderWidth: 1.5,
                        borderColor: pressed ? item.color : tc.border,
                        transform: [{ scale: pressed ? 0.9 : 1 }],
                        // Depth
                        shadowColor: pressed ? item.color : '#000',
                        shadowOffset: { width: 0, height: pressed ? 1 : 3 },
                        shadowOpacity: pressed ? 0.3 : 0.12,
                        shadowRadius: pressed ? 4 : 8,
                        elevation: pressed ? 2 : 4,
                      })}
                    >
                      <LinearGradient
                        colors={[`${item.color}30`, `${item.color}05`]}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={{
                          width: 44, height: 44, borderRadius: radius.full,
                          alignItems: 'center', justifyContent: 'center',
                          marginBottom: spacing.xs,
                        }}
                      >
                        <Icon name={item.icon} size="lg" color={item.color} />
                      </LinearGradient>
                      <Text style={{
                        color: tc.text.primary, fontSize: fontSizeExt.caption,
                        fontFamily: fonts.bodyMedium, fontWeight: '500',
                        textAlign: 'center',
                      }} numberOfLines={1}>
                        {t(item.labelKey)}
                      </Text>
                    </Pressable>
                  </Animated.View>
                );
              })}
            </View>
          </Animated.View>
        )}

        {/* ── Sticker editors ── */}
        {activeStickerEditor === 'poll' && (
          <View>
            <Text style={editorTitle}>{t('stories.createPoll')}</Text>
            <TextInput value={pollQuestion} onChangeText={setPollQuestion} placeholder={t('stories.askAQuestion')}
              placeholderTextColor={tc.text.tertiary} maxLength={100}
              style={editorInput} />
            {pollOptions.map((opt, i) => (
              <TextInput key={i} value={opt} onChangeText={v => {
                const next = [...pollOptions]; next[i] = v; setPollOptions(next);
              }} placeholder={`Option ${i + 1}`} placeholderTextColor={tc.text.tertiary}
                maxLength={50} style={[editorInput, { marginTop: spacing.sm }]} />
            ))}
            {pollOptions.length < 4 && (
              <Pressable accessibilityRole="button" onPress={() => setPollOptions([...pollOptions, ''])} style={{ marginTop: spacing.sm }}>
                <Text style={{ color: colors.emerald, fontSize: fontSize.sm }}>{t('stories.addOption')}</Text>
              </Pressable>
            )}
            <View style={{ flexDirection: 'row', gap: spacing.md, marginTop: spacing.md }}>
              <Pressable accessibilityRole="button" accessibilityLabel={t('common.cancel')} onPress={() => setActiveStickerEditor(null)} style={[editorBtn, { backgroundColor: tc.surface }]}>
                <Text style={{ color: tc.text.primary}}>{t('common.cancel')}</Text>
              </Pressable>
              <Pressable accessibilityRole="button" accessibilityLabel={t('stories.addPoll')} onPress={submitPoll} style={[editorBtn, { backgroundColor: colors.emerald, flex: 1 }]}>
                <Text style={{ color: '#fff', fontWeight: '600' }}>{t('stories.addPoll')}</Text>
              </Pressable>
            </View>
          </View>
        )}

        {activeStickerEditor === 'question' && (
          <View>
            <Text style={editorTitle}>{t('stories.askAQuestionTitle')}</Text>
            <TextInput value={questionPrompt} onChangeText={setQuestionPrompt} placeholder={t('stories.yourQuestion')}
              placeholderTextColor={tc.text.tertiary} maxLength={100} style={editorInput} />
            <View style={{ flexDirection: 'row', gap: spacing.md, marginTop: spacing.md }}>
              <Pressable accessibilityRole="button" onPress={() => setActiveStickerEditor(null)} style={[editorBtn, { backgroundColor: tc.surface }]}>
                <Text style={{ color: tc.text.primary}}>{t('common.cancel')}</Text>
              </Pressable>
              <Pressable accessibilityRole="button" onPress={submitQuestion} style={[editorBtn, { backgroundColor: colors.emerald, flex: 1 }]}>
                <Text style={{ color: '#fff', fontWeight: '600' }}>{t('stories.addQuestion')}</Text>
              </Pressable>
            </View>
          </View>
        )}

        {activeStickerEditor === 'countdown' && (
          <View>
            <Text style={editorTitle}>{t('stories.countdown')}</Text>
            <TextInput value={countdownTitle} onChangeText={setCountdownTitle} placeholder={t('stories.countdownName')}
              placeholderTextColor={tc.text.tertiary} maxLength={60} style={editorInput} />
            <TextInput value={countdownDate} onChangeText={setCountdownDate} placeholder={t('stories.endDate')}
              placeholderTextColor={tc.text.tertiary} style={[editorInput, { marginTop: spacing.sm }]} />
            <View style={{ flexDirection: 'row', gap: spacing.md, marginTop: spacing.md }}>
              <Pressable accessibilityRole="button" onPress={() => setActiveStickerEditor(null)} style={[editorBtn, { backgroundColor: tc.surface }]}>
                <Text style={{ color: tc.text.primary}}>{t('common.cancel')}</Text>
              </Pressable>
              <Pressable accessibilityRole="button" onPress={submitCountdown} style={[editorBtn, { backgroundColor: colors.emerald, flex: 1 }]}>
                <Text style={{ color: '#fff', fontWeight: '600' }}>{t('stories.addCountdown')}</Text>
              </Pressable>
            </View>
          </View>
        )}

        {activeStickerEditor === 'quiz' && (
          <View>
            <Text style={editorTitle}>{t('stories.createQuiz')}</Text>
            <TextInput value={quizQuestion} onChangeText={setQuizQuestion} placeholder={t('stories.quizQuestion')}
              placeholderTextColor={tc.text.tertiary} maxLength={100} style={editorInput} />
            {quizOptions.map((opt, i) => (
              <Pressable key={i} onPress={() => setQuizCorrectIndex(i)} style={{ flexDirection: 'row', alignItems: 'center', marginTop: spacing.sm }}>
                <View style={{
                  width: 20, height: 20, borderRadius: radius.full,
                  backgroundColor: i === quizCorrectIndex ? colors.emerald : tc.surface,
                  borderWidth: 1, borderColor: tc.border, marginEnd: spacing.sm,
                  justifyContent: 'center', alignItems: 'center',
                }}>
                  {i === quizCorrectIndex && <Icon name="check" size={12} color="#fff" />}
                </View>
                <TextInput value={opt} onChangeText={v => {
                  const next = [...quizOptions]; next[i] = v; setQuizOptions(next);
                }} placeholder={`Option ${i + 1}`} placeholderTextColor={tc.text.tertiary}
                  maxLength={50} style={[editorInput, { flex: 1 }]} />
              </Pressable>
            ))}
            <Text style={{ color: tc.text.tertiary, fontSize: fontSize.xs, marginTop: spacing.xs }}>
              {t('stories.tapToMarkCorrect')}
            </Text>
            <View style={{ flexDirection: 'row', gap: spacing.md, marginTop: spacing.md }}>
              <Pressable accessibilityRole="button" onPress={() => setActiveStickerEditor(null)} style={[editorBtn, { backgroundColor: tc.surface }]}>
                <Text style={{ color: tc.text.primary}}>{t('common.cancel')}</Text>
              </Pressable>
              <Pressable accessibilityRole="button" onPress={submitQuiz} style={[editorBtn, { backgroundColor: colors.emerald, flex: 1 }]}>
                <Text style={{ color: '#fff', fontWeight: '600' }}>{t('stories.addQuiz')}</Text>
              </Pressable>
            </View>
          </View>
        )}

        {activeStickerEditor === 'mention' && (
          <View>
            <Text style={editorTitle}>{t('stories.mentionSomeone')}</Text>
            <TextInput value={mentionUsername} onChangeText={setMentionUsername} placeholder="@username"
              placeholderTextColor={tc.text.tertiary} autoCapitalize="none" style={editorInput} />
            <View style={{ flexDirection: 'row', gap: spacing.md, marginTop: spacing.md }}>
              <Pressable accessibilityRole="button" onPress={() => setActiveStickerEditor(null)} style={[editorBtn, { backgroundColor: tc.surface }]}>
                <Text style={{ color: tc.text.primary}}>{t('common.cancel')}</Text>
              </Pressable>
              <Pressable accessibilityRole="button" onPress={submitMention} style={[editorBtn, { backgroundColor: colors.emerald, flex: 1 }]}>
                <Text style={{ color: '#fff', fontWeight: '600' }}>{t('stories.addMention')}</Text>
              </Pressable>
            </View>
          </View>
        )}

        {activeStickerEditor === 'hashtag' && (
          <View>
            <Text style={editorTitle}>{t('stories.addHashtag')}</Text>
            <TextInput value={hashtagText} onChangeText={setHashtagText} placeholder="#hashtag"
              placeholderTextColor={tc.text.tertiary} autoCapitalize="none" style={editorInput} />
            <View style={{ flexDirection: 'row', gap: spacing.md, marginTop: spacing.md }}>
              <Pressable accessibilityRole="button" onPress={() => setActiveStickerEditor(null)} style={[editorBtn, { backgroundColor: tc.surface }]}>
                <Text style={{ color: tc.text.primary}}>{t('common.cancel')}</Text>
              </Pressable>
              <Pressable accessibilityRole="button" onPress={submitHashtag} style={[editorBtn, { backgroundColor: colors.emerald, flex: 1 }]}>
                <Text style={{ color: '#fff', fontWeight: '600' }}>{t('stories.addHashtag')}</Text>
              </Pressable>
            </View>
          </View>
        )}

        {activeStickerEditor === 'slider' && (
          <View>
            <Text style={editorTitle}>{t('stories.createSlider')}</Text>
            <TextInput value={sliderQuestion} onChangeText={setSliderQuestion} placeholder={t('stories.askAQuestion')}
              placeholderTextColor={tc.text.tertiary} maxLength={100} style={editorInput} />
            <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm }}>
              <TextInput value={sliderMin} onChangeText={setSliderMin} placeholder={t('common.min')}
                placeholderTextColor={tc.text.tertiary} keyboardType="numeric"
                style={[editorInput, { flex: 1 }]} />
              <TextInput value={sliderMax} onChangeText={setSliderMax} placeholder={t('common.max')}
                placeholderTextColor={tc.text.tertiary} keyboardType="numeric"
                style={[editorInput, { flex: 1 }]} />
            </View>
            <View style={{ flexDirection: 'row', gap: spacing.md, marginTop: spacing.md }}>
              <Pressable onPress={() => setActiveStickerEditor(null)} style={[editorBtn, { backgroundColor: tc.surface }]} accessibilityRole="button" accessibilityLabel={t('common.cancel')}>
                <Text style={{ color: tc.text.primary }}>{t('common.cancel')}</Text>
              </Pressable>
              <Pressable onPress={submitSlider} style={[editorBtn, { backgroundColor: colors.emerald, flex: 1 }]} accessibilityRole="button" accessibilityLabel={t('stories.addSlider')}>
                <Text style={{ color: '#fff', fontWeight: '600' }}>{t('stories.addSlider')}</Text>
              </Pressable>
            </View>
          </View>
        )}

        {/* ── Link sticker editor ── */}
        {activeStickerEditor === 'link' && (
          <View>
            <Text style={editorTitle}>{t('stories.addLink')}</Text>
            <TextInput
              value={linkUrl}
              onChangeText={setLinkUrl}
              placeholder="https://..."
              placeholderTextColor={tc.text.tertiary}
              autoCapitalize="none"
              keyboardType="url"
              style={editorInput}
              accessibilityLabel={t('stories.linkUrl')}
            />
            <TextInput
              value={linkTitle}
              onChangeText={setLinkTitle}
              placeholder={t('stories.linkTitleOptional')}
              placeholderTextColor={tc.text.tertiary}
              maxLength={60}
              style={[editorInput, { marginTop: spacing.sm }]}
              accessibilityLabel={t('stories.linkTitle')}
            />
            <View style={{ flexDirection: 'row', gap: spacing.md, marginTop: spacing.md }}>
              <Pressable onPress={() => setActiveStickerEditor(null)} style={[editorBtn, { backgroundColor: tc.surface }]} accessibilityRole="button" accessibilityLabel={t('common.cancel')}>
                <Text style={{ color: tc.text.primary }}>{t('common.cancel')}</Text>
              </Pressable>
              <Pressable onPress={submitLink} style={[editorBtn, { backgroundColor: colors.extended.blue, flex: 1 }]} accessibilityRole="button" accessibilityLabel={t('stories.addLink')}>
                <Text style={{ color: '#fff', fontWeight: '600' }}>{t('stories.addLink')}</Text>
              </Pressable>
            </View>
          </View>
        )}

        {/* ── Add Yours sticker editor ── */}
        {activeStickerEditor === 'addYours' && (
          <View>
            <Text style={editorTitle}>{t('stories.createAddYours')}</Text>
            <TextInput
              value={addYoursPrompt}
              onChangeText={setAddYoursPrompt}
              placeholder={t('stories.addYoursPromptPlaceholder')}
              placeholderTextColor={tc.text.tertiary}
              maxLength={200}
              multiline
              style={[editorInput, { minHeight: 60 }]}
              accessibilityLabel={t('stories.addYoursPrompt')}
            />
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.sm }}>
              <CharCountRing current={addYoursPrompt.length} max={200} size={22} />
            </View>
            <View style={{ flexDirection: 'row', gap: spacing.md, marginTop: spacing.md }}>
              <Pressable onPress={() => setActiveStickerEditor(null)} style={[editorBtn, { backgroundColor: tc.surface }]} accessibilityRole="button" accessibilityLabel={t('common.cancel')}>
                <Text style={{ color: tc.text.primary }}>{t('common.cancel')}</Text>
              </Pressable>
              <Pressable onPress={submitAddYours} style={[editorBtn, { backgroundColor: colors.emerald, flex: 1 }]} accessibilityRole="button" accessibilityLabel={t('stories.addYoursAdd')}>
                <Text style={{ color: '#fff', fontWeight: '600' }}>{t('stories.addYoursAdd')}</Text>
              </Pressable>
            </View>
          </View>
        )}

        {/* ── Music sticker mode selector ── */}
        {activeStickerEditor === 'music' && (
          <View>
            <Text style={editorTitle}>{t('stories.musicStickerStyle')}</Text>
            {selectedTrack ? (
              <View style={{ backgroundColor: tc.bgElevated, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.md }}>
                <Text style={{ color: tc.text.primary, fontSize: fontSize.sm, fontWeight: '600' }} numberOfLines={1}>
                  {selectedTrack.title} — {selectedTrack.artist}
                </Text>
              </View>
            ) : (
              <Pressable
                onPress={() => setShowMusicPicker(true)}
                style={{ backgroundColor: tc.bgElevated, borderRadius: radius.md, padding: spacing.lg, alignItems: 'center', marginBottom: spacing.md }}
                accessibilityRole="button"
                accessibilityLabel={t('stories.pickATrack')}
              >
                <Icon name="music" size="lg" color={colors.emerald} />
                <Text style={{ color: tc.text.secondary, fontSize: fontSize.sm, marginTop: spacing.sm }}>
                  {t('stories.pickATrack')}
                </Text>
              </Pressable>
            )}
            <View style={{ flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md }}>
              {(['compact', 'waveform', 'lyrics'] as const).map(mode => (
                <Pressable
                  key={mode}
                  onPress={() => setMusicDisplayMode(mode)}
                  style={{
                    flex: 1,
                    paddingVertical: spacing.sm,
                    borderRadius: radius.md,
                    backgroundColor: musicDisplayMode === mode ? colors.emerald : tc.bgElevated,
                    alignItems: 'center',
                  }}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: musicDisplayMode === mode }}
                  accessibilityLabel={mode}
                >
                  <Text style={{ color: musicDisplayMode === mode ? '#fff' : tc.text.secondary, fontSize: fontSize.sm, fontWeight: '600', textTransform: 'capitalize' }}>
                    {mode}
                  </Text>
                </Pressable>
              ))}
            </View>
            <View style={{ flexDirection: 'row', gap: spacing.md }}>
              <Pressable onPress={() => setActiveStickerEditor(null)} style={[editorBtn, { backgroundColor: tc.surface }]} accessibilityRole="button" accessibilityLabel={t('common.cancel')}>
                <Text style={{ color: tc.text.primary }}>{t('common.cancel')}</Text>
              </Pressable>
              <Pressable
                onPress={handleMusicStickerAdd}
                style={[editorBtn, { backgroundColor: selectedTrack ? colors.emerald : tc.surface, flex: 1 }]}
                disabled={!selectedTrack}
                accessibilityRole="button"
                accessibilityLabel={t('stories.addMusicSticker')}
              >
                <Text style={{ color: selectedTrack ? '#fff' : tc.text.tertiary, fontWeight: '600' }}>
                  {t('stories.addMusicSticker')}
                </Text>
              </Pressable>
            </View>
          </View>
        )}

        {/* ── Bottom actions ── */}
        <View style={{ marginTop: spacing.lg }}>
          {/* Close friends toggle */}
          <Pressable
            onPress={() => handleCloseFriendsToggle(!closeFriendsOnly)}
            style={{
              flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
              backgroundColor: closeFriendsOnly ? colors.active.emerald10 : tc.bgElevated,
              borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.md,
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Icon name="users" size="sm" color={closeFriendsOnly ? colors.emerald : tc.text.secondary} />
              <Text style={{ color: closeFriendsOnly ? colors.emerald : tc.text.primary, marginStart: spacing.sm, fontSize: fontSize.sm }}>
                {t('stories.closeFriendsOnly')}
              </Text>
            </View>
            <View style={{
              width: 20, height: 20, borderRadius: radius.full,
              backgroundColor: closeFriendsOnly ? colors.emerald : tc.surface,
              borderWidth: 1, borderColor: tc.border,
              justifyContent: 'center', alignItems: 'center',
            }}>
              {closeFriendsOnly && <Icon name="check" size={12} color="#fff" />}
            </View>
          </Pressable>
          {/* Subscribers-only toggle */}
          <Pressable
            onPress={() => handleSubscribersToggle(!subscribersOnly)}
            style={{
              flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
              backgroundColor: subscribersOnly ? 'rgba(200,150,62,0.1)' : tc.bgElevated,
              borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.md,
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Icon name="lock" size="sm" color={subscribersOnly ? colors.gold : tc.text.secondary} />
              <Text style={{ color: subscribersOnly ? colors.gold : tc.text.primary, marginStart: spacing.sm, fontSize: fontSize.sm }}>
                {t('stories.subscribersOnly')}
              </Text>
            </View>
            <View style={{
              width: 20, height: 20, borderRadius: radius.full,
              backgroundColor: subscribersOnly ? colors.gold : tc.surface,
              borderWidth: 1, borderColor: tc.border,
              justifyContent: 'center', alignItems: 'center',
            }}>
              {subscribersOnly && <Icon name="check" size={12} color="#fff" />}
            </View>
          </Pressable>

          {/* Publish button */}
          <GradientButton
            label={t('stories.shareStory')}
            onPress={() => { if (!publishMutation.isPending) publishMutation.mutate(); }}
            loading={publishMutation.isPending}
            disabled={publishMutation.isPending || (!mediaUri && !text.trim())}
            fullWidth
          />
        </View>
      </ScrollView>
    </SafeAreaView>
    <MusicPicker
      visible={showMusicPicker}
      onClose={() => setShowMusicPicker(false)}
      onSelect={(track) => { setSelectedTrack({ id: track.id, title: track.title, artist: track.artist }); setShowMusicPicker(false); }}
    />
    <DrawingCanvas
      visible={showDrawing}
      onClose={() => setShowDrawing(false)}
      onSave={(paths) => { setDrawPaths(paths); setShowDrawing(false); }}
      canvasWidth={SCREEN_W}
      canvasHeight={CANVAS_H}
    />
    <TextEffects
      visible={showTextEffects}
      onClose={() => setShowTextEffects(false)}
      onAdd={(effect) => { setTextEffects(prev => [...prev, effect]); setShowTextEffects(false); }}
    />
    <BottomSheet visible={showEidFramePicker} onClose={() => setShowEidFramePicker(false)}>
      <View style={{ padding: spacing.base }}>
        <Text style={{ color: tc.text.primary, fontSize: fontSize.md, fontWeight: '700', marginBottom: spacing.md }}>
          {t('eidCards.pickOccasion')}
        </Text>
        {eidFrameOccasion && (
          <BottomSheetItem
            icon="x"
            label={t('common.cancel')}
            onPress={() => { setEidFrameOccasion(null); setShowEidFramePicker(false); }}
          />
        )}
        {EID_OCCASIONS.map((occ) => (
          <BottomSheetItem
            key={occ.id}
            icon="star"
            label={occ.label}
            onPress={() => { setEidFrameOccasion(occ.id); setShowEidFramePicker(false); }}
          />
        ))}
      </View>
    </BottomSheet>
    {/* ── GIF search BottomSheet ── */}
    <BottomSheet visible={showGifSearch} onClose={() => setShowGifSearch(false)}>
      <View style={{ padding: spacing.base, minHeight: 400 }}>
        <Text style={{ color: tc.text.primary, fontSize: fontSize.md, fontWeight: '700', marginBottom: spacing.md }}>
          {t('stories.searchGifs')}
        </Text>
        <GifSearch
          onSelect={handleGifSelect}
          onClose={() => setShowGifSearch(false)}
        />
      </View>
    </BottomSheet>
    {/* ── Location search BottomSheet ── */}
    <BottomSheet visible={showLocationSearch} onClose={() => setShowLocationSearch(false)}>
      <View style={{ padding: spacing.base, minHeight: 400 }}>
        <Text style={{ color: tc.text.primary, fontSize: fontSize.md, fontWeight: '700', marginBottom: spacing.md }}>
          {t('stories.addLocation')}
        </Text>
        <LocationSearch
          onSelect={handleLocationSelect}
          onClose={() => setShowLocationSearch(false)}
        />
      </View>
    </BottomSheet>
    </ScreenErrorBoundary>
  );
}

// ── Shared style factories ──
const getToolBtnStyle = (tc: ReturnType<typeof useThemeColors>): ViewStyle => ({
  flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
  backgroundColor: tc.bgElevated, borderRadius: radius.md,
  paddingVertical: spacing.md, paddingHorizontal: spacing.base,
  marginBottom: spacing.md,
});

const getEditorTitle = (tc: ReturnType<typeof useThemeColors>): TextStyle => ({
  color: tc.text.primary, fontSize: fontSize.md, fontWeight: '700', marginBottom: spacing.md,
});

const getEditorInput = (tc: ReturnType<typeof useThemeColors>): TextStyle => ({
  color: tc.text.primary, fontSize: fontSize.sm,
  backgroundColor: tc.bgElevated, borderRadius: radius.sm,
  paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
});

const editorBtn: ViewStyle = {
  borderRadius: radius.md, paddingVertical: spacing.sm,
  paddingHorizontal: spacing.base, alignItems: 'center',
};