import { useState, useRef, useCallback, useEffect } from 'react';
import { View, Text, Pressable, StyleSheet, TextInput, ScrollView, Dimensions, Platform, Alert, ViewStyle, TextStyle } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import { PanGestureHandler, PinchGestureHandler } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue, useAnimatedStyle, useAnimatedGestureHandler,
  withSpring, runOnJS, withTiming, withDelay, FadeIn,
} from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';
import { MusicPicker } from '@/components/story/MusicPicker';
import { DrawingCanvas } from '@/components/story/DrawingCanvas';
import type { DrawPath } from '@/components/story/DrawingCanvas';
import { TextEffects } from '@/components/story/TextEffects';
import type { TextEffect } from '@/components/story/TextEffects';
import { Icon } from '@/components/ui/Icon';
import { Avatar } from '@/components/ui/Avatar';
import { BottomSheet, BottomSheetItem } from '@/components/ui/BottomSheet';
import { CharCountRing } from '@/components/ui/CharCountRing';
import { GlassHeader } from '@/components/ui/GlassHeader';
import { GradientButton } from '@/components/ui/GradientButton';
import { colors, spacing, fontSize, radius } from '@/theme';
import { storiesApi, uploadApi } from '@/services/api';
import { useTranslation } from '@/hooks/useTranslation';
import { ScreenErrorBoundary } from '@/components/ui/ScreenErrorBoundary';
import { EidFrame } from '@/components/islamic/EidFrame';
import type { Occasion } from '@/components/islamic/EidFrame';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
const CANVAS_H = SCREEN_H * 0.7;

// ── Filter presets ──
const FILTERS = [
  { id: 'none', label: 'Normal', style: {} },
  { id: 'warm', label: 'Warm', style: { tintColor: 'rgba(255,180,100,0.15)' } },
  { id: 'cool', label: 'Cool', style: { tintColor: 'rgba(100,150,255,0.15)' } },
  { id: 'vintage', label: 'Vintage', style: { tintColor: 'rgba(200,150,80,0.2)' } },
  { id: 'noir', label: 'Noir', style: { tintColor: 'rgba(0,0,0,0.3)' } },
  { id: 'emerald', label: 'Emerald', style: { tintColor: 'rgba(10,123,79,0.15)' } },
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
  '#F85149', '#58A6FF', '#D2A8FF', '#FFA657',
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

// ── Sticker types ──
type StickerType = 'poll' | 'question' | 'countdown' | 'quiz' | 'location' | 'mention' | 'hashtag' | 'slider';

interface Sticker {
  id: string;
  type: StickerType;
  x: number;
  y: number;
  scale: number;
  data: Record<string, unknown>;
}

export default function CreateStoryScreen() {
  const router = useRouter();
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
  const [sliderEmoji, setSliderEmoji] = useState('📊');
  const [sliderMin, setSliderMin] = useState('0');
  const [sliderMax, setSliderMax] = useState('100');

  // ── Close friends / Subscribers ──
  const [closeFriendsOnly, setCloseFriendsOnly] = useState(false);
  const [subscribersOnly, setSubscribersOnly] = useState(false);

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

  // ── Gradient selection animation ──
  const gradientScales = useRef(BG_GRADIENTS.map(() => useSharedValue(1))).current;

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
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.All,
      allowsEditing: true,
      aspect: [9, 16],
      quality: 0.9,
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
      mediaTypes: ImagePicker.MediaTypeOptions.All,
      allowsEditing: true,
      aspect: [9, 16],
      quality: 0.9,
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
    setStickers(prev => prev.filter(s => s.id !== id));
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
      emoji: sliderEmoji.trim() || '📊',
      question: sliderQuestion.trim(),
      minValue: min,
      maxValue: max,
    });
    setSliderQuestion('');
    setSliderEmoji('📊');
    setSliderMin('0');
    setSliderMax('100');
  };

  // ── Upload mutation ──
  const publishMutation = useMutation({
    mutationFn: async () => {
      let mediaUrl = '';
      if (mediaUri) {
        const upload = await uploadApi.getPresignUrl(mediaType === 'video' ? 'video/mp4' : 'image/jpeg', 'stories');
        mediaUrl = upload.publicUrl;
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
      queryClient.invalidateQueries({ queryKey: ['stories'] });
      router.back();
    },
    onError: () => Alert.alert(t('common.error'), t('stories.failedToPublish')),
  });

  const currentFont = FONTS[fontIndex];
  const currentFilter = FILTERS[filterIndex];

  // ── Render sticker on canvas ──
  const renderSticker = (sticker: Sticker) => {
    const stickerStyles: Record<StickerType, ViewStyle> = {
      poll: { backgroundColor: colors.dark.bgSheet, borderRadius: radius.md, padding: spacing.md, minWidth: 200 },
      question: { backgroundColor: 'rgba(10,123,79,0.85)', borderRadius: radius.md, padding: spacing.md, minWidth: 200 },
      countdown: { backgroundColor: colors.dark.bgCard, borderRadius: radius.md, padding: spacing.md, minWidth: 160 },
      quiz: { backgroundColor: colors.dark.bgSheet, borderRadius: radius.md, padding: spacing.md, minWidth: 200 },
      location: { backgroundColor: 'rgba(255,255,255,0.9)', borderRadius: radius.full, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
      mention: { backgroundColor: 'rgba(10,123,79,0.85)', borderRadius: radius.full, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
      hashtag: { backgroundColor: 'rgba(200,150,62,0.85)', borderRadius: radius.full, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
      slider: { backgroundColor: colors.dark.bgSheet, borderRadius: radius.md, padding: spacing.md, minWidth: 200 },
    };

    return (
      <Pressable
        key={sticker.id}
        onLongPress={() => {
          Alert.alert(t('stories.removeSticker'), '', [
            { text: t('common.cancel'), style: 'cancel' },
            { text: t('common.remove'), style: 'destructive', onPress: () => removeSticker(sticker.id) },
          ]);
        }}
        style={[
          { position: 'absolute', left: sticker.x, top: sticker.y, transform: [{ scale: sticker.scale }] },
          stickerStyles[sticker.type],
        ]}
      >
        {sticker.type === 'poll' && (
          <View>
            <Text style={{ color: colors.text.primary, fontSize: fontSize.sm, fontWeight: '700', marginBottom: spacing.sm }}>
              {String(sticker.data.question)}
            </Text>
            {(sticker.data.options as string[]).map((opt, i) => (
              <View key={i} style={{
                backgroundColor: colors.dark.surface, borderRadius: radius.sm,
                paddingVertical: spacing.sm, paddingHorizontal: spacing.md,
                marginBottom: spacing.xs,
              }}>
                <Text style={{ color: colors.text.primary, fontSize: fontSize.sm }}>{opt}</Text>
              </View>
            ))}
          </View>
        )}
        {sticker.type === 'question' && (
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
        )}
        {sticker.type === 'countdown' && (
          <View style={{ alignItems: 'center' }}>
            <Icon name="clock" size="sm" color={colors.emerald} />
            <Text style={{ color: colors.text.primary, fontSize: fontSize.sm, fontWeight: '700', marginTop: 4 }}>
              {String(sticker.data.title)}
            </Text>
            <Text style={{ color: colors.text.secondary, fontSize: fontSize.xs, marginTop: 2 }}>
              {sticker.data.endsAt ? String(sticker.data.endsAt) : t('stories.noEndDateSet')}
            </Text>
          </View>
        )}
        {sticker.type === 'quiz' && (
          <View>
            <Text style={{ color: colors.text.primary, fontSize: fontSize.sm, fontWeight: '700', marginBottom: spacing.sm }}>
              {String(sticker.data.question)}
            </Text>
            {(sticker.data.options as string[]).map((opt, i) => (
              <View key={i} style={{
                backgroundColor: i === sticker.data.correctIndex ? colors.emerald : colors.dark.surface,
                borderRadius: radius.sm, paddingVertical: spacing.sm, paddingHorizontal: spacing.md,
                marginBottom: spacing.xs,
              }}>
                <Text style={{ color: colors.text.primary, fontSize: fontSize.sm }}>{opt}</Text>
              </View>
            ))}
          </View>
        )}
        {sticker.type === 'location' && (
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Icon name="map-pin" size="xs" color="#000" />
            <Text style={{ color: '#000', fontSize: fontSize.sm, fontWeight: '600', marginLeft: 4 }}>
              {t('common.location')}
            </Text>
          </View>
        )}
        {sticker.type === 'mention' && (
          <Text style={{ color: '#fff', fontSize: fontSize.sm, fontWeight: '600' }}>
            @{String(sticker.data.username)}
          </Text>
        )}
        {sticker.type === 'hashtag' && (
          <Text style={{ color: '#fff', fontSize: fontSize.sm, fontWeight: '600' }}>
            #{String(sticker.data.tag)}
          </Text>
        )}
        {sticker.type === 'slider' && (
          <View>
            <Text style={{ color: colors.text.primary, fontSize: fontSize.sm, fontWeight: '700', marginBottom: spacing.sm }}>
              {String(sticker.data.emoji)} {String(sticker.data.question)}
            </Text>
            <Text style={{ color: colors.text.secondary, fontSize: fontSize.xs }}>
              {String(sticker.data.minValue || 0)} – {String(sticker.data.maxValue || 100)}
            </Text>
          </View>
        )}
      </Pressable>
    );
  };

  return (
    <ScreenErrorBoundary>
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.dark.bg }}>
      {/* ── Header ── */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: spacing.base, paddingVertical: spacing.sm, backgroundColor: 'rgba(13, 17, 23, 0.92)', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.dark.border }}>
        <Pressable onPress={handleClose} hitSlop={8} accessibilityLabel={t('common.close')} accessibilityRole="button">
          <Icon name="x" size="md" color={colors.text.primary} />
        </Pressable>
        <Text style={{ color: colors.text.primary, fontSize: fontSize.md, fontWeight: '700', letterSpacing: 0.2 }}>{t('stories.newStory')}</Text>
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
            <Icon name="edit" size="sm" color={activeTool === 'text' ? colors.emerald : colors.text.primary} />
            <Text style={{
              fontSize: fontSize.xs,
              color: colors.text.secondary,
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
            <Icon name="smile" size="sm" color={activeTool === 'sticker' ? colors.emerald : colors.text.primary} />
            <Text style={{
              fontSize: fontSize.xs,
              color: colors.text.secondary,
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
            <Icon name="layers" size="sm" color={activeTool === 'filter' ? colors.emerald : colors.text.primary} />
            <Text style={{
              fontSize: fontSize.xs,
              color: colors.text.secondary,
              marginTop: 2,
            }}>{t('stories.filter')}</Text>
          </Pressable>
          <Pressable style={{ alignItems: 'center', padding: spacing.xs }} onPress={() => setShowMusicPicker(true)}>
            <Icon name="volume-x" size="sm" color={selectedTrack ? colors.emerald : colors.text.primary} />
            <Text style={{ fontSize: fontSize.xs, color: colors.text.secondary, marginTop: 2 }}>{t('story.music')}</Text>
          </Pressable>
          <Pressable style={{ alignItems: 'center', padding: spacing.xs }} onPress={() => setShowDrawing(true)}>
            <Icon name="pencil" size="sm" color={drawPaths.length > 0 ? colors.emerald : colors.text.primary} />
            <Text style={{ fontSize: fontSize.xs, color: colors.text.secondary, marginTop: 2 }}>{t('story.draw')}</Text>
          </Pressable>
          <Pressable style={{ alignItems: 'center', padding: spacing.xs }} onPress={() => setShowTextEffects(true)}>
            <Icon name="edit" size="sm" color={textEffects.length > 0 ? colors.emerald : colors.text.primary} />
            <Text style={{ fontSize: fontSize.xs, color: colors.text.secondary, marginTop: 2 }}>{t('story.effects')}</Text>
          </Pressable>
          <Pressable style={{ alignItems: 'center', padding: spacing.xs }} onPress={() => setShowEidFramePicker(true)}>
            <Icon name="star" size="sm" color={eidFrameOccasion ? colors.emerald : colors.text.primary} />
            <Text style={{ fontSize: fontSize.xs, color: colors.text.secondary, marginTop: 2 }}>{t('eidCards.pickOccasion')}</Text>
          </Pressable>
        </View>
      </View>

      {/* ── Canvas ── */}
      <View style={{ height: CANVAS_H, marginHorizontal: spacing.sm, borderRadius: radius.lg, overflow: 'hidden' }}>
        {eidFrameOccasion ? (
          <EidFrame occasion={eidFrameOccasion}>
            {mediaUri ? (
              <View style={{ flex: 1 }}>
                <Image source={{ uri: mediaUri }} style={[{ width: '100%', height: '100%' }, currentFilter.style]} contentFit="cover" />
              </View>
            ) : (
              <LinearGradient colors={BG_GRADIENTS[bgGradientIndex]} style={{ flex: 1 }} />
            )}
          </EidFrame>
        ) : mediaUri ? (
          <View style={{ flex: 1 }}>
            <Image source={{ uri: mediaUri }} style={[{ width: '100%', height: '100%' }, currentFilter.style]} contentFit="cover" />
          </View>
        ) : (
          <LinearGradient colors={BG_GRADIENTS[bgGradientIndex]} style={{ flex: 1 }} />
        )}

        {/* Text overlay */}
        {text.length > 0 && (
          <View style={{
            position: 'absolute', left: 0, right: 0, top: '40%',
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
            left: spacing.base,
            right: spacing.base,
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
              left: 0,
              right: 0,
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
                color: colors.text.secondary,
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
          backgroundColor: colors.dark.bgCard,
          paddingHorizontal: spacing.md,
          paddingVertical: spacing.sm,
          borderRadius: radius.md,
          marginHorizontal: spacing.base,
          marginTop: spacing.sm,
          gap: spacing.sm,
        }}>
          <Icon name="volume-x" size="sm" color={colors.emerald} />
          <Text style={{ flex: 1, color: colors.text.primary, fontSize: fontSize.sm }} numberOfLines={1}>
            {selectedTrack.title} — {selectedTrack.artist}
          </Text>
          <Pressable onPress={() => setSelectedTrack(null)} hitSlop={8}>
            <Icon name="x" size="sm" color={colors.text.secondary} />
          </Pressable>
        </Animated.View>
      )}

      {/* ── Tool Panels ── */}
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: spacing.base }}>

        {/* No media: pick or shoot */}
        {!mediaUri && activeTool === null && (
          <View style={{ flexDirection: 'row', gap: spacing.md, marginBottom: spacing.md }}>
            <Pressable onPress={pickMedia} style={[toolBtnStyle, { flex: 1 }]} accessibilityLabel={t('stories.pickFromGallery')} accessibilityRole="button">
              <Icon name="image" size="sm" color={colors.emerald} />
              <Text style={{ color: colors.text.primary, fontSize: fontSize.sm, marginLeft: spacing.sm }}>{t('stories.gallery')}</Text>
            </Pressable>
            <Pressable onPress={takePhoto} style={[toolBtnStyle, { flex: 1 }]} accessibilityLabel={t('stories.takePhoto')} accessibilityRole="button">
              <Icon name="camera" size="sm" color={colors.emerald} />
              <Text style={{ color: colors.text.primary, fontSize: fontSize.sm, marginLeft: spacing.sm }}>{t('stories.camera')}</Text>
            </Pressable>
          </View>
          <View style={{ flexDirection: 'row', gap: spacing.md, marginBottom: spacing.md }}>
            <Pressable onPress={() => router.push('/(screens)/disposable-camera' as never)} style={[toolBtnStyle, { flex: 1 }]} accessibilityLabel={t('stories.disposable')} accessibilityRole="button">
              <Icon name="camera" size="sm" color={colors.gold} />
              <Text style={{ color: colors.text.primary, fontSize: fontSize.sm, marginLeft: spacing.sm }}>{t('stories.disposable')}</Text>
            </Pressable>
            <Pressable onPress={() => router.push('/(screens)/photo-music' as never)} style={[toolBtnStyle, { flex: 1 }]} accessibilityLabel={t('stories.photoMusic')} accessibilityRole="button">
              <Icon name="volume-x" size="sm" color={colors.gold} />
              <Text style={{ color: colors.text.primary, fontSize: fontSize.sm, marginLeft: spacing.sm }}>{t('stories.photoMusic')}</Text>
            </Pressable>
          </View>
        )}

        {/* BG gradient picker (text-only stories) */}
        {!mediaUri && (
          <View style={{ marginBottom: spacing.md }}>
            <Text style={{ color: colors.text.secondary, fontSize: fontSize.xs, marginBottom: spacing.sm }}>{t('stories.background')}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {BG_GRADIENTS.map((g, i) => {
                const isActive = i === bgGradientIndex;
                const animatedStyle = useAnimatedStyle(() => ({
                  transform: [{ scale: gradientScales[i].value }],
                }));

                const handleGradientPress = () => {
                  // Bounce animation
                  gradientScales[i].value = withTiming(1.15, { duration: 100 }, () => {
                    gradientScales[i].value = withTiming(1, { duration: 150 });
                  });
                  setBgGradientIndex(i);
                };

                return (
                    <Pressable key={i} onPress={handleGradientPress}>
                      <Animated.View style={[
                        {
                          width: 48,
                          height: 48,
                          borderRadius: radius.full,
                          marginRight: spacing.sm,
                          overflow: 'hidden',
                          justifyContent: 'center',
                          alignItems: 'center',
                        },
                        animatedStyle,
                      ]}>
                        <LinearGradient
                          colors={g}
                          style={StyleSheet.absoluteFill}
                        />
                        {/* Emerald check overlay when active */}
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
                      </Animated.View>
                    </Pressable>
                
                );
              })}
            </ScrollView>
          </View>
        )}

        {mediaUri && activeTool === null && (
          <Pressable onPress={pickMedia} style={toolBtnStyle} accessibilityLabel={t('stories.changeMedia')} accessibilityRole="button">
            <Icon name="image" size="sm" color={colors.text.secondary} />
            <Text style={{ color: colors.text.secondary, fontSize: fontSize.sm, marginLeft: spacing.sm }}>{t('stories.changeMedia')}</Text>
          </Pressable>
        )}

        {/* ── Text tool ── */}
        {activeTool === 'text' && (
          <View>
            <TextInput
              value={text}
              onChangeText={setText}
              placeholder={t('stories.addTextPlaceholder')}
              placeholderTextColor={colors.text.tertiary}
              multiline
              maxLength={200}
              style={{
                color: colors.text.primary, fontSize: fontSize.base,
                backgroundColor: colors.dark.bgElevated, borderRadius: radius.sm,
                padding: spacing.md, minHeight: 60, marginBottom: spacing.md,
              }}
            />
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.sm }}>
              <CharCountRing current={text.length} max={200} size={24} />
              <Pressable onPress={() => setTextBgEnabled(!textBgEnabled)} style={{
                flexDirection: 'row', alignItems: 'center',
                backgroundColor: textBgEnabled ? colors.active.emerald10 : colors.dark.surface,
                paddingHorizontal: spacing.md, paddingVertical: spacing.xs, borderRadius: radius.full,
              }} accessibilityLabel={t('accessibility.toggleTextBg')} accessibilityRole="button">
                <Text style={{ color: textBgEnabled ? colors.emerald : colors.text.secondary, fontSize: fontSize.xs }}>
                  BG
                </Text>
              </Pressable>
            </View>
            {/* Color picker */}
            <View style={{ flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md }}>
              {TEXT_COLORS.map(c => (
                <Pressable key={c} onPress={() => setTextColor(c)} style={{
                  width: 28, height: 28, borderRadius: radius.full,
                  backgroundColor: c, borderWidth: c === textColor ? 2 : 1,
                  borderColor: c === textColor ? colors.emerald : colors.dark.border,
                }} />
              ))}
            </View>
            {/* Font picker */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {FONTS.map((f, i) => (
                <Pressable key={f.id} onPress={() => setFontIndex(i)} style={{
                  paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
                  backgroundColor: i === fontIndex ? colors.emerald : colors.dark.surface,
                  borderRadius: radius.full, marginRight: spacing.sm,
                }}>
                  <Text style={{
                    color: i === fontIndex ? '#fff' : colors.text.primary,
                    fontSize: fontSize.sm, fontFamily: f.fontFamily, fontWeight: f.fontWeight,
                  }}>
                    {f.label}
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
              <Pressable key={f.id} onPress={() => setFilterIndex(i)} style={{ marginRight: spacing.md, alignItems: 'center' }}>
                {/* Circular thumbnail with filter tint overlay */}
                <View style={{
                  width: 40, height: 40, borderRadius: radius.full, overflow: 'hidden',
                  borderWidth: i === filterIndex ? 2 : 0, borderColor: colors.emerald,
                }}>
                  {mediaUri && (
                    <View style={{ flex: 1 }}>
                      <Image source={{ uri: mediaUri }} style={{ width: 40, height: 40 }} contentFit="cover" />
                      <View style={[StyleSheet.absoluteFill, f.style as Record<string, unknown>]} />
                    </View>
                  )}
                  {!mediaUri && (
                    <LinearGradient colors={BG_GRADIENTS[bgGradientIndex]} style={[{ flex: 1 }, f.style as Record<string, unknown>]} />
                  )}
                </View>
                <Text style={{
                  color: i === filterIndex ? colors.emerald : colors.text.secondary,
                  fontSize: 10,
                  marginTop: 4,
                }}>
                  {f.label}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        )}

        {/* ── Sticker tool ── */}
        {activeTool === 'sticker' && !activeStickerEditor && (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
            {[
              { type: 'poll' as StickerType, icon: 'bar-chart-2' as const, label: t('stories.poll') },
              { type: 'question' as StickerType, icon: 'at-sign' as const, label: t('stories.question') },
              { type: 'countdown' as StickerType, icon: 'clock' as const, label: t('stories.countdown') },
              { type: 'quiz' as StickerType, icon: 'check-circle' as const, label: t('stories.quiz') },
              { type: 'slider' as StickerType, icon: 'trending-up' as const, label: t('stories.slider') },
              { type: 'mention' as StickerType, icon: 'at-sign' as const, label: t('stories.mention') },
              { type: 'hashtag' as StickerType, icon: 'hash' as const, label: t('stories.hashtag') },
              { type: 'location' as StickerType, icon: 'map-pin' as const, label: t('common.location') },
            ].map(item => (
              <Pressable key={item.type} onPress={() => {
                if (item.type === 'location') {
                  addSticker('location', {});
                } else {
                  setActiveStickerEditor(item.type);
                }
              }} style={{
                backgroundColor: colors.dark.bgElevated, borderRadius: radius.md,
                padding: spacing.md, alignItems: 'center', width: (SCREEN_W - spacing.base * 2 - spacing.sm * 2) / 3 - 1,
              }}>
                <Icon name={item.icon} size="md" color={colors.emerald} />
                <Text style={{ color: colors.text.primary, fontSize: fontSize.xs, marginTop: spacing.xs }}>{item.label}</Text>
              </Pressable>
            ))}
          </View>
        )}

        {/* ── Sticker editors ── */}
        {activeStickerEditor === 'poll' && (
          <View>
            <Text style={editorTitle}>{t('stories.createPoll')}</Text>
            <TextInput value={pollQuestion} onChangeText={setPollQuestion} placeholder={t('stories.askAQuestion')}
              placeholderTextColor={colors.text.tertiary} maxLength={100}
              style={editorInput} />
            {pollOptions.map((opt, i) => (
              <TextInput key={i} value={opt} onChangeText={v => {
                const next = [...pollOptions]; next[i] = v; setPollOptions(next);
              }} placeholder={`Option ${i + 1}`} placeholderTextColor={colors.text.tertiary}
                maxLength={50} style={[editorInput, { marginTop: spacing.sm }]} />
            ))}
            {pollOptions.length < 4 && (
              <Pressable onPress={() => setPollOptions([...pollOptions, ''])} style={{ marginTop: spacing.sm }}>
                <Text style={{ color: colors.emerald, fontSize: fontSize.sm }}>{t('stories.addOption')}</Text>
              </Pressable>
            )}
            <View style={{ flexDirection: 'row', gap: spacing.md, marginTop: spacing.md }}>
              <Pressable onPress={() => setActiveStickerEditor(null)} style={[editorBtn, { backgroundColor: colors.dark.surface }]}>
                <Text style={{ color: colors.text.primary }}>{t('common.cancel')}</Text>
              </Pressable>
              <Pressable onPress={submitPoll} style={[editorBtn, { backgroundColor: colors.emerald, flex: 1 }]}>
                <Text style={{ color: '#fff', fontWeight: '600' }}>{t('stories.addPoll')}</Text>
              </Pressable>
            </View>
          </View>
        )}

        {activeStickerEditor === 'question' && (
          <View>
            <Text style={editorTitle}>{t('stories.askAQuestionTitle')}</Text>
            <TextInput value={questionPrompt} onChangeText={setQuestionPrompt} placeholder={t('stories.yourQuestion')}
              placeholderTextColor={colors.text.tertiary} maxLength={100} style={editorInput} />
            <View style={{ flexDirection: 'row', gap: spacing.md, marginTop: spacing.md }}>
              <Pressable onPress={() => setActiveStickerEditor(null)} style={[editorBtn, { backgroundColor: colors.dark.surface }]}>
                <Text style={{ color: colors.text.primary }}>{t('common.cancel')}</Text>
              </Pressable>
              <Pressable onPress={submitQuestion} style={[editorBtn, { backgroundColor: colors.emerald, flex: 1 }]}>
                <Text style={{ color: '#fff', fontWeight: '600' }}>{t('stories.addQuestion')}</Text>
              </Pressable>
            </View>
          </View>
        )}

        {activeStickerEditor === 'countdown' && (
          <View>
            <Text style={editorTitle}>{t('stories.countdown')}</Text>
            <TextInput value={countdownTitle} onChangeText={setCountdownTitle} placeholder={t('stories.countdownName')}
              placeholderTextColor={colors.text.tertiary} maxLength={60} style={editorInput} />
            <TextInput value={countdownDate} onChangeText={setCountdownDate} placeholder={t('stories.endDate')}
              placeholderTextColor={colors.text.tertiary} style={[editorInput, { marginTop: spacing.sm }]} />
            <View style={{ flexDirection: 'row', gap: spacing.md, marginTop: spacing.md }}>
              <Pressable onPress={() => setActiveStickerEditor(null)} style={[editorBtn, { backgroundColor: colors.dark.surface }]}>
                <Text style={{ color: colors.text.primary }}>{t('common.cancel')}</Text>
              </Pressable>
              <Pressable onPress={submitCountdown} style={[editorBtn, { backgroundColor: colors.emerald, flex: 1 }]}>
                <Text style={{ color: '#fff', fontWeight: '600' }}>{t('stories.addCountdown')}</Text>
              </Pressable>
            </View>
          </View>
        )}

        {activeStickerEditor === 'quiz' && (
          <View>
            <Text style={editorTitle}>{t('stories.createQuiz')}</Text>
            <TextInput value={quizQuestion} onChangeText={setQuizQuestion} placeholder={t('stories.quizQuestion')}
              placeholderTextColor={colors.text.tertiary} maxLength={100} style={editorInput} />
            {quizOptions.map((opt, i) => (
              <Pressable key={i} onPress={() => setQuizCorrectIndex(i)} style={{ flexDirection: 'row', alignItems: 'center', marginTop: spacing.sm }}>
                <View style={{
                  width: 20, height: 20, borderRadius: radius.full,
                  backgroundColor: i === quizCorrectIndex ? colors.emerald : colors.dark.surface,
                  borderWidth: 1, borderColor: colors.dark.border, marginRight: spacing.sm,
                  justifyContent: 'center', alignItems: 'center',
                }}>
                  {i === quizCorrectIndex && <Icon name="check" size={12} color="#fff" />}
                </View>
                <TextInput value={opt} onChangeText={v => {
                  const next = [...quizOptions]; next[i] = v; setQuizOptions(next);
                }} placeholder={`Option ${i + 1}`} placeholderTextColor={colors.text.tertiary}
                  maxLength={50} style={[editorInput, { flex: 1 }]} />
              </Pressable>
            ))}
            <Text style={{ color: colors.text.tertiary, fontSize: fontSize.xs, marginTop: spacing.xs }}>
              {t('stories.tapToMarkCorrect')}
            </Text>
            <View style={{ flexDirection: 'row', gap: spacing.md, marginTop: spacing.md }}>
              <Pressable onPress={() => setActiveStickerEditor(null)} style={[editorBtn, { backgroundColor: colors.dark.surface }]}>
                <Text style={{ color: colors.text.primary }}>{t('common.cancel')}</Text>
              </Pressable>
              <Pressable onPress={submitQuiz} style={[editorBtn, { backgroundColor: colors.emerald, flex: 1 }]}>
                <Text style={{ color: '#fff', fontWeight: '600' }}>{t('stories.addQuiz')}</Text>
              </Pressable>
            </View>
          </View>
        )}

        {activeStickerEditor === 'mention' && (
          <View>
            <Text style={editorTitle}>{t('stories.mentionSomeone')}</Text>
            <TextInput value={mentionUsername} onChangeText={setMentionUsername} placeholder="@username"
              placeholderTextColor={colors.text.tertiary} autoCapitalize="none" style={editorInput} />
            <View style={{ flexDirection: 'row', gap: spacing.md, marginTop: spacing.md }}>
              <Pressable onPress={() => setActiveStickerEditor(null)} style={[editorBtn, { backgroundColor: colors.dark.surface }]}>
                <Text style={{ color: colors.text.primary }}>{t('common.cancel')}</Text>
              </Pressable>
              <Pressable onPress={submitMention} style={[editorBtn, { backgroundColor: colors.emerald, flex: 1 }]}>
                <Text style={{ color: '#fff', fontWeight: '600' }}>{t('stories.addMention')}</Text>
              </Pressable>
            </View>
          </View>
        )}

        {activeStickerEditor === 'hashtag' && (
          <View>
            <Text style={editorTitle}>{t('stories.addHashtag')}</Text>
            <TextInput value={hashtagText} onChangeText={setHashtagText} placeholder="#hashtag"
              placeholderTextColor={colors.text.tertiary} autoCapitalize="none" style={editorInput} />
            <View style={{ flexDirection: 'row', gap: spacing.md, marginTop: spacing.md }}>
              <Pressable onPress={() => setActiveStickerEditor(null)} style={[editorBtn, { backgroundColor: colors.dark.surface }]}>
                <Text style={{ color: colors.text.primary }}>{t('common.cancel')}</Text>
              </Pressable>
              <Pressable onPress={submitHashtag} style={[editorBtn, { backgroundColor: colors.emerald, flex: 1 }]}>
                <Text style={{ color: '#fff', fontWeight: '600' }}>{t('stories.addHashtag')}</Text>
              </Pressable>
            </View>
          </View>
        )}

        {activeStickerEditor === 'slider' && (
          <View>
            <Text style={editorTitle}>{t('stories.createSlider')}</Text>
            <TextInput value={sliderQuestion} onChangeText={setSliderQuestion} placeholder={t('stories.askAQuestion')}
              placeholderTextColor={colors.text.tertiary} maxLength={100} style={editorInput} />
            <TextInput value={sliderEmoji} onChangeText={setSliderEmoji} placeholder={t('stories.emojiOptional')}
              placeholderTextColor={colors.text.tertiary} maxLength={2} style={[editorInput, { marginTop: spacing.sm }]} />
            <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm }}>
              <TextInput value={sliderMin} onChangeText={setSliderMin} placeholder={t('common.min')}
                placeholderTextColor={colors.text.tertiary} keyboardType="numeric"
                style={[editorInput, { flex: 1 }]} />
              <TextInput value={sliderMax} onChangeText={setSliderMax} placeholder={t('common.max')}
                placeholderTextColor={colors.text.tertiary} keyboardType="numeric"
                style={[editorInput, { flex: 1 }]} />
            </View>
            <View style={{ flexDirection: 'row', gap: spacing.md, marginTop: spacing.md }}>
              <Pressable onPress={() => setActiveStickerEditor(null)} style={[editorBtn, { backgroundColor: colors.dark.surface }]}>
                <Text style={{ color: colors.text.primary }}>{t('common.cancel')}</Text>
              </Pressable>
              <Pressable onPress={submitSlider} style={[editorBtn, { backgroundColor: colors.emerald, flex: 1 }]}>
                <Text style={{ color: '#fff', fontWeight: '600' }}>{t('stories.addSlider')}</Text>
              </Pressable>
            </View>
          </View>
        )}

        {/* ── Bottom actions ── */}
        <View style={{ marginTop: spacing.lg }}>
          {/* Close friends toggle */}
          <Pressable
            onPress={() => setCloseFriendsOnly(!closeFriendsOnly)}
            style={{
              flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
              backgroundColor: closeFriendsOnly ? colors.active.emerald10 : colors.dark.bgElevated,
              borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.md,
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Icon name="users" size="sm" color={closeFriendsOnly ? colors.emerald : colors.text.secondary} />
              <Text style={{ color: closeFriendsOnly ? colors.emerald : colors.text.primary, marginLeft: spacing.sm, fontSize: fontSize.sm }}>
                {t('stories.closeFriendsOnly')}
              </Text>
            </View>
            <View style={{
              width: 20, height: 20, borderRadius: radius.full,
              backgroundColor: closeFriendsOnly ? colors.emerald : colors.dark.surface,
              borderWidth: 1, borderColor: colors.dark.border,
              justifyContent: 'center', alignItems: 'center',
            }}>
              {closeFriendsOnly && <Icon name="check" size={12} color="#fff" />}
            </View>
          </Pressable>
          {/* Subscribers-only toggle */}
          <Pressable
            onPress={() => setSubscribersOnly(!subscribersOnly)}
            style={{
              flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
              backgroundColor: subscribersOnly ? 'rgba(200,150,62,0.1)' : colors.dark.bgElevated,
              borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.md,
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Icon name="lock" size="sm" color={subscribersOnly ? colors.gold : colors.text.secondary} />
              <Text style={{ color: subscribersOnly ? colors.gold : colors.text.primary, marginLeft: spacing.sm, fontSize: fontSize.sm }}>
                {t('stories.subscribersOnly')}
              </Text>
            </View>
            <View style={{
              width: 20, height: 20, borderRadius: radius.full,
              backgroundColor: subscribersOnly ? colors.gold : colors.dark.surface,
              borderWidth: 1, borderColor: colors.dark.border,
              justifyContent: 'center', alignItems: 'center',
            }}>
              {subscribersOnly && <Icon name="check" size={12} color="#fff" />}
            </View>
          </Pressable>

          {/* Publish button */}
          <GradientButton
            label={t('stories.shareStory')}
            onPress={() => publishMutation.mutate()}
            loading={publishMutation.isPending}
            disabled={!mediaUri && !text.trim()}
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
        <Text style={{ color: colors.text.primary, fontSize: fontSize.md, fontWeight: '700', marginBottom: spacing.md }}>
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
    </ScreenErrorBoundary>
  );
}

// ── Shared styles ──
const toolBtnStyle: ViewStyle = {
  flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
  backgroundColor: colors.dark.bgElevated, borderRadius: radius.md,
  paddingVertical: spacing.md, paddingHorizontal: spacing.base,
  marginBottom: spacing.md,
};

const editorTitle: TextStyle = {
  color: colors.text.primary, fontSize: fontSize.md, fontWeight: '700', marginBottom: spacing.md,
};

const editorInput: TextStyle = {
  color: colors.text.primary, fontSize: fontSize.sm,
  backgroundColor: colors.dark.bgElevated, borderRadius: radius.sm,
  paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
};

const editorBtn: ViewStyle = {
  borderRadius: radius.md, paddingVertical: spacing.sm,
  paddingHorizontal: spacing.base, alignItems: 'center',
};