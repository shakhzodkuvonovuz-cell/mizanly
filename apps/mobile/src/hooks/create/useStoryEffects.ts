import { useState, useCallback, useRef, useEffect } from 'react';
import { Alert, Dimensions } from 'react-native';
import { useSharedValue, withDelay, withTiming } from 'react-native-reanimated';
import { runOnJS } from 'react-native-reanimated';
import { isSDKAvailable, showGiphyPicker } from '@/services/giphyService';
import type { DrawPath } from '@/components/story/DrawingCanvas';
import type { TextEffect } from '@/components/story/TextEffects';
import type { GifItem } from '@/components/story/GifSticker';
import type { LocationData } from '@/components/story/LocationSticker';
import { useContextualHaptic } from '@/hooks/useContextualHaptic';
import type { TFunction } from 'i18next';

const { width: SCREEN_W } = Dimensions.get('window');
const CANVAS_H = Dimensions.get('window').height * 0.7;

export type StickerType = 'poll' | 'question' | 'countdown' | 'quiz' | 'location' | 'mention' | 'hashtag' | 'slider' | 'gif' | 'link' | 'addYours' | 'music';

export interface Sticker {
  id: string;
  type: StickerType;
  x: number;
  y: number;
  scale: number;
  data: Record<string, unknown>;
}

interface UseStoryEffectsReturn {
  // Text overlay
  text: string;
  setText: (v: string) => void;
  textColor: string;
  setTextColor: (v: string) => void;
  fontIndex: number;
  setFontIndex: (v: number) => void;
  textBgEnabled: boolean;
  setTextBgEnabled: (v: boolean) => void;

  // Filters
  filterIndex: number;
  setFilterIndex: (v: number) => void;

  // Background gradient
  bgGradientIndex: number;
  setBgGradientIndex: (v: number) => void;

  // Stickers
  stickers: Sticker[];
  setStickers: React.Dispatch<React.SetStateAction<Sticker[]>>;
  showStickerMenu: boolean;
  setShowStickerMenu: (v: boolean) => void;
  activeStickerEditor: StickerType | null;
  setActiveStickerEditor: (v: StickerType | null) => void;
  addSticker: (type: StickerType, data: Record<string, unknown>) => void;
  removeSticker: (id: string) => void;

  // Sticker editor temp state
  pollQuestion: string;
  setPollQuestion: (v: string) => void;
  pollOptions: string[];
  setPollOptions: (v: string[]) => void;
  questionPrompt: string;
  setQuestionPrompt: (v: string) => void;
  countdownTitle: string;
  setCountdownTitle: (v: string) => void;
  countdownDate: string;
  setCountdownDate: (v: string) => void;
  quizQuestion: string;
  setQuizQuestion: (v: string) => void;
  quizOptions: string[];
  setQuizOptions: (v: string[]) => void;
  quizCorrectIndex: number;
  setQuizCorrectIndex: (v: number) => void;
  mentionUsername: string;
  setMentionUsername: (v: string) => void;
  hashtagText: string;
  setHashtagText: (v: string) => void;
  sliderQuestion: string;
  setSliderQuestion: (v: string) => void;
  sliderEmoji: string;
  setSliderEmoji: (v: string) => void;
  sliderMin: string;
  setSliderMin: (v: string) => void;
  sliderMax: string;
  setSliderMax: (v: string) => void;
  linkUrl: string;
  setLinkUrl: (v: string) => void;
  linkTitle: string;
  setLinkTitle: (v: string) => void;
  addYoursPrompt: string;
  setAddYoursPrompt: (v: string) => void;
  musicDisplayMode: 'compact' | 'lyrics' | 'waveform';
  setMusicDisplayMode: (v: 'compact' | 'lyrics' | 'waveform') => void;

  // Sticker submissions
  submitPoll: () => void;
  submitQuestion: () => void;
  submitCountdown: () => void;
  submitQuiz: () => void;
  submitMention: () => void;
  submitHashtag: () => void;
  submitSlider: () => void;
  submitLink: () => void;
  submitAddYours: () => void;

  // GIF / Location / Music stickers
  showGifSearch: boolean;
  setShowGifSearch: (v: boolean) => void;
  showLocationSearch: boolean;
  setShowLocationSearch: (v: boolean) => void;
  stickerSearch: string;
  setStickerSearch: (v: string) => void;
  handleGifSelect: (gif: GifItem) => void;
  openGifPicker: () => void;
  handleLocationSelect: (location: LocationData) => void;
  handleMusicStickerAdd: () => void;

  // Music / Drawing / Text Effects modals
  showMusicPicker: boolean;
  setShowMusicPicker: (v: boolean) => void;
  selectedTrack: { id: string; title: string; artist: string } | null;
  setSelectedTrack: (v: { id: string; title: string; artist: string } | null) => void;
  showDrawing: boolean;
  setShowDrawing: (v: boolean) => void;
  drawPaths: DrawPath[];
  setDrawPaths: (v: DrawPath[]) => void;
  showTextEffects: boolean;
  setShowTextEffects: (v: boolean) => void;
  textEffects: TextEffect[];
  setTextEffects: React.Dispatch<React.SetStateAction<TextEffect[]>>;

  // Sticker hint
  showStickerHint: boolean;
  hintOpacity: ReturnType<typeof useSharedValue<number>>;

  // Active tool
  activeTool: 'text' | 'filter' | 'sticker' | null;
  setActiveTool: (v: 'text' | 'filter' | 'sticker' | null) => void;

  // Eid frame
  eidFrameOccasion: string | null;
  setEidFrameOccasion: (v: string | null) => void;
  showEidFramePicker: boolean;
  setShowEidFramePicker: (v: boolean) => void;
}

export function useStoryEffects(
  t: TFunction,
  eidFrameParam?: string,
): UseStoryEffectsReturn {
  const haptic = useContextualHaptic();

  // Eid Frame
  const [eidFrameOccasion, setEidFrameOccasion] = useState<string | null>(eidFrameParam || null);
  const [showEidFramePicker, setShowEidFramePicker] = useState(false);

  // Text overlay
  const [text, setText] = useState('');
  const [textColor, setTextColor] = useState('#FFFFFF');
  const [fontIndex, setFontIndex] = useState(0);
  const [textBgEnabled, setTextBgEnabled] = useState(false);

  // Filter
  const [filterIndex, setFilterIndex] = useState(0);

  // Background gradient
  const [bgGradientIndex, setBgGradientIndex] = useState(0);

  // Active tool
  const [activeTool, setActiveTool] = useState<'text' | 'filter' | 'sticker' | null>(null);

  // Stickers
  const [stickers, setStickers] = useState<Sticker[]>([]);
  const [showStickerMenu, setShowStickerMenu] = useState(false);
  const [activeStickerEditor, setActiveStickerEditor] = useState<StickerType | null>(null);

  // Sticker editor temp state
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
  const [linkUrl, setLinkUrl] = useState('');
  const [linkTitle, setLinkTitle] = useState('');
  const [addYoursPrompt, setAddYoursPrompt] = useState('');
  const [showGifSearch, setShowGifSearch] = useState(false);
  const [showLocationSearch, setShowLocationSearch] = useState(false);
  const [stickerSearch, setStickerSearch] = useState('');
  const [musicDisplayMode, setMusicDisplayMode] = useState<'compact' | 'lyrics' | 'waveform'>('compact');

  // Music / Drawing / Text Effects
  const [showMusicPicker, setShowMusicPicker] = useState(false);
  const [selectedTrack, setSelectedTrack] = useState<{ id: string; title: string; artist: string } | null>(null);
  const [showDrawing, setShowDrawing] = useState(false);
  const [drawPaths, setDrawPaths] = useState<DrawPath[]>([]);
  const [showTextEffects, setShowTextEffects] = useState(false);
  const [textEffects, setTextEffects] = useState<TextEffect[]>([]);

  // Sticker hint
  const [showStickerHint, setShowStickerHint] = useState(false);
  const hintOpacity = useSharedValue(0);

  // GIPHY cleanup
  const giphyCleanupRef = useRef<(() => void) | null>(null);
  useEffect(() => {
    return () => {
      if (giphyCleanupRef.current) {
        giphyCleanupRef.current();
        giphyCleanupRef.current = null;
      }
    };
  }, []);

  const addSticker = useCallback((type: StickerType, data: Record<string, unknown>) => {
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
    setShowStickerHint(true);
    hintOpacity.value = 1;
    hintOpacity.value = withDelay(2000, withTiming(0, { duration: 300 }, () => {
      runOnJS(setShowStickerHint)(false);
    }));
  }, [hintOpacity]);

  const removeSticker = useCallback((id: string) => {
    Alert.alert(t('stories.removeSticker'), '', [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('common.remove'), style: 'destructive', onPress: () => {
        setStickers(prev => prev.filter(s => s.id !== id));
      }},
    ]);
  }, [t]);

  // Sticker form submissions
  const submitPoll = useCallback(() => {
    if (!pollQuestion.trim() || pollOptions.filter(o => o.trim()).length < 2) return;
    addSticker('poll', { question: pollQuestion, options: pollOptions.filter(o => o.trim()) });
    setPollQuestion(''); setPollOptions(['', '']);
  }, [pollQuestion, pollOptions, addSticker]);

  const submitQuestion = useCallback(() => {
    if (!questionPrompt.trim()) return;
    addSticker('question', { prompt: questionPrompt });
    setQuestionPrompt('');
  }, [questionPrompt, addSticker]);

  const submitCountdown = useCallback(() => {
    if (!countdownTitle.trim()) return;
    addSticker('countdown', { title: countdownTitle, endsAt: countdownDate || null });
    setCountdownTitle(''); setCountdownDate('');
  }, [countdownTitle, countdownDate, addSticker]);

  const submitQuiz = useCallback(() => {
    if (!quizQuestion.trim() || quizOptions.filter(o => o.trim()).length < 2) return;
    addSticker('quiz', {
      question: quizQuestion,
      options: quizOptions.filter(o => o.trim()),
      correctIndex: quizCorrectIndex,
    });
    setQuizQuestion(''); setQuizOptions(['', '', '', '']); setQuizCorrectIndex(0);
  }, [quizQuestion, quizOptions, quizCorrectIndex, addSticker]);

  const submitMention = useCallback(() => {
    if (!mentionUsername.trim()) return;
    addSticker('mention', { username: mentionUsername.replace('@', '') });
    setMentionUsername('');
  }, [mentionUsername, addSticker]);

  const submitHashtag = useCallback(() => {
    if (!hashtagText.trim()) return;
    addSticker('hashtag', { tag: hashtagText.replace('#', '') });
    setHashtagText('');
  }, [hashtagText, addSticker]);

  const submitSlider = useCallback(() => {
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
  }, [sliderQuestion, sliderEmoji, sliderMin, sliderMax, addSticker]);

  const submitLink = useCallback(() => {
    if (!linkUrl.trim()) return;
    addSticker('link', {
      url: linkUrl.trim(),
      title: linkTitle.trim() || undefined,
    });
    setLinkUrl('');
    setLinkTitle('');
  }, [linkUrl, linkTitle, addSticker]);

  const submitAddYours = useCallback(() => {
    if (!addYoursPrompt.trim()) return;
    addSticker('addYours', {
      prompt: addYoursPrompt.trim(),
    });
    setAddYoursPrompt('');
  }, [addYoursPrompt, addSticker]);

  const handleGifSelect = useCallback((gif: GifItem) => {
    addSticker('gif', {
      gifUrl: gif.url,
      gifPreviewUrl: gif.previewUrl,
      gifWidth: gif.width,
      gifHeight: gif.height,
      gifTitle: gif.title,
    });
    setShowGifSearch(false);
  }, [addSticker]);

  const openGifPicker = useCallback(() => {
    if (isSDKAvailable()) {
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
  }, [addSticker]);

  const handleLocationSelect = useCallback((location: LocationData) => {
    addSticker('location', {
      locationId: location.id,
      locationName: location.name,
      locationAddress: location.address,
      locationCity: location.city,
    });
    setShowLocationSearch(false);
  }, [addSticker]);

  const handleMusicStickerAdd = useCallback(() => {
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
  }, [selectedTrack, musicDisplayMode, addSticker]);

  return {
    // Text
    text, setText, textColor, setTextColor, fontIndex, setFontIndex, textBgEnabled, setTextBgEnabled,
    // Filters
    filterIndex, setFilterIndex,
    // BG gradient
    bgGradientIndex, setBgGradientIndex,
    // Stickers
    stickers, setStickers, showStickerMenu, setShowStickerMenu,
    activeStickerEditor, setActiveStickerEditor,
    addSticker, removeSticker,
    // Sticker editor temp state
    pollQuestion, setPollQuestion, pollOptions, setPollOptions,
    questionPrompt, setQuestionPrompt,
    countdownTitle, setCountdownTitle, countdownDate, setCountdownDate,
    quizQuestion, setQuizQuestion, quizOptions, setQuizOptions, quizCorrectIndex, setQuizCorrectIndex,
    mentionUsername, setMentionUsername, hashtagText, setHashtagText,
    sliderQuestion, setSliderQuestion, sliderEmoji, setSliderEmoji, sliderMin, setSliderMin, sliderMax, setSliderMax,
    linkUrl, setLinkUrl, linkTitle, setLinkTitle,
    addYoursPrompt, setAddYoursPrompt,
    musicDisplayMode, setMusicDisplayMode,
    // Submissions
    submitPoll, submitQuestion, submitCountdown, submitQuiz,
    submitMention, submitHashtag, submitSlider, submitLink, submitAddYours,
    // GIF / Location / Music
    showGifSearch, setShowGifSearch, showLocationSearch, setShowLocationSearch,
    stickerSearch, setStickerSearch,
    handleGifSelect, openGifPicker, handleLocationSelect, handleMusicStickerAdd,
    // Modals
    showMusicPicker, setShowMusicPicker, selectedTrack, setSelectedTrack,
    showDrawing, setShowDrawing, drawPaths, setDrawPaths,
    showTextEffects, setShowTextEffects, textEffects, setTextEffects,
    // Hint
    showStickerHint, hintOpacity,
    // Active tool
    activeTool, setActiveTool,
    // Eid
    eidFrameOccasion, setEidFrameOccasion, showEidFramePicker, setShowEidFramePicker,
  };
}
