import { useState, useCallback, useRef, useEffect } from 'react';
import { Alert, TextInput } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSharedValue, useAnimatedStyle, withSpring, withSequence, withDelay } from 'react-native-reanimated';
import { useContextualHaptic } from '@/hooks/useContextualHaptic';
import { showToast } from '@/components/ui/Toast';
import type { TFunction } from 'i18next';
import type { AudioTrack } from '@/types';

type AutocompleteType = 'hashtag' | 'mention' | null;
export type ReelTransitionType = 'none' | 'fade' | 'dissolve' | 'wipeleft' | 'slideup';

interface UseReelEditReturn {
  caption: string;
  setCaption: (v: string) => void;
  hashtags: string[];
  mentions: string[];
  normalizeAudio: boolean;
  setNormalizeAudio: (v: boolean) => void;
  showAutocomplete: AutocompleteType;
  setShowAutocomplete: (v: AutocompleteType) => void;
  autocompleteAnchor: number;
  showMusicPicker: boolean;
  setShowMusicPicker: (v: boolean) => void;
  selectedTrack: AudioTrack | null;
  setSelectedTrack: (v: AudioTrack | null) => void;
  captionInputRef: React.RefObject<TextInput>;
  clipTransition: ReelTransitionType;
  setClipTransition: (v: ReelTransitionType) => void;
  handleCaptionChange: (text: string) => void;
  insertAtCursor: (text: string) => void;
  handleToolbarPress: (type: AutocompleteType) => void;
  // Countdown
  countdown: number | null;
  countdownScale: ReturnType<typeof useSharedValue<number>>;
  countdownOpacity: ReturnType<typeof useSharedValue<number>>;
  countdownStyle: ReturnType<typeof useAnimatedStyle>;
  startCountdown: (onComplete: () => void) => void;
  // Draft persistence
  saveDraftOnUnmount: (clips: { uri: string; duration?: number }[], caption: string) => void;
  restoreDraft: (setClips: (clips: { uri: string; duration: number }[]) => void, setCaption: (c: string) => void) => void;
}

export function useReelEdit(t: TFunction): UseReelEditReturn {
  const haptic = useContextualHaptic();

  const [caption, setCaption] = useState('');
  const [hashtags, setHashtags] = useState<string[]>([]);
  const [mentions, setMentions] = useState<string[]>([]);
  const [normalizeAudio, setNormalizeAudio] = useState(false);
  const [showAutocomplete, setShowAutocomplete] = useState<AutocompleteType>(null);
  const [autocompleteAnchor, setAutocompleteAnchor] = useState(0);
  const [showMusicPicker, setShowMusicPicker] = useState(false);
  const [selectedTrack, setSelectedTrack] = useState<AudioTrack | null>(null);
  const captionInputRef = useRef<TextInput>(null);
  const [clipTransition, setClipTransition] = useState<ReelTransitionType>('none');

  // Countdown
  const [countdown, setCountdown] = useState<number | null>(null);
  const countdownScale = useSharedValue(1);
  const countdownOpacity = useSharedValue(1);
  const countdownIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdownDelayRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
      if (countdownDelayRef.current) clearTimeout(countdownDelayRef.current);
    };
  }, []);

  useEffect(() => {
    if (countdown !== null) {
      countdownScale.value = withSequence(
        withSpring(1.5, { damping: 10, stiffness: 200 }),
        withSpring(1, { damping: 15, stiffness: 300 })
      );
      countdownOpacity.value = withDelay(600, withSpring(0));
    }
  }, [countdown]);

  const countdownStyle = useAnimatedStyle(() => ({
    transform: [{ scale: countdownScale.value }],
    opacity: countdownOpacity.value,
  }));

  const extractHashtags = useCallback((text: string) => {
    const matches = text.match(/#[\w\u0600-\u06FF]+/g) || [];
    return matches.map(tag => tag.slice(1).toLowerCase());
  }, []);

  const extractMentions = useCallback((text: string) => {
    const matches = text.match(/@[\w\u0600-\u06FF]+/g) || [];
    return matches.map(mention => mention.slice(1).toLowerCase());
  }, []);

  const handleCaptionChange = useCallback((text: string) => {
    setCaption(text);
    setHashtags(extractHashtags(text));
    setMentions(extractMentions(text));
  }, [extractHashtags, extractMentions]);

  const insertAtCursor = useCallback((text: string) => {
    if (!captionInputRef.current) return;
    setCaption(prev => prev + text);
    setShowAutocomplete(null);
  }, []);

  const handleToolbarPress = useCallback((type: AutocompleteType) => {
    haptic.tick();
    setShowAutocomplete(type);
  }, [haptic]);

  const startCountdown = useCallback((onComplete: () => void) => {
    if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
    if (countdownDelayRef.current) clearTimeout(countdownDelayRef.current);
    setCountdown(3);
    countdownIntervalRef.current = setInterval(() => {
      setCountdown((prev) => {
        if (prev === null || prev <= 1) {
          if (countdownIntervalRef.current) {
            clearInterval(countdownIntervalRef.current);
            countdownIntervalRef.current = null;
          }
          countdownDelayRef.current = setTimeout(() => {
            countdownDelayRef.current = null;
            setCountdown(null);
            onComplete();
          }, 500);
          return null;
        }
        return prev - 1;
      });
    }, 1000);
  }, []);

  // Draft persistence
  const saveDraftOnUnmount = useCallback((clips: { uri: string; duration?: number }[], captionVal: string) => {
    if (clips.length > 0) {
      AsyncStorage.setItem('reel-draft', JSON.stringify({
        clips: clips.map((c) => ({ uri: c.uri, duration: c.duration })),
        caption: captionVal,
        savedAt: new Date().toISOString(),
      })).catch(() => {});
    }
  }, []);

  const restoreDraft = useCallback((setClipsFn: (clips: { uri: string; duration: number }[]) => void, setCaptionFn: (c: string) => void) => {
    AsyncStorage.getItem('reel-draft').then(saved => {
      if (saved) {
        try {
          const draft = JSON.parse(saved);
          if (draft.clips?.length > 0) {
            Alert.alert(
              t('compose.restoreDraft', 'Restore Draft?'),
              t('compose.restoreDraftMessage', 'You have an unsaved reel draft. Would you like to restore it?'),
              [
                { text: t('common.discard', 'Discard'), style: 'destructive', onPress: () => AsyncStorage.removeItem('reel-draft') },
                { text: t('common.restore', 'Restore'), onPress: () => {
                  if (draft.clips?.length > 0) setClipsFn(draft.clips);
                  if (draft.caption) setCaptionFn(draft.caption);
                  AsyncStorage.removeItem('reel-draft');
                }},
              ],
            );
          }
        } catch {}
      }
    });
  }, [t]);

  return {
    caption, setCaption,
    hashtags, mentions,
    normalizeAudio, setNormalizeAudio,
    showAutocomplete, setShowAutocomplete,
    autocompleteAnchor,
    showMusicPicker, setShowMusicPicker,
    selectedTrack, setSelectedTrack,
    captionInputRef,
    clipTransition, setClipTransition,
    handleCaptionChange,
    insertAtCursor,
    handleToolbarPress,
    countdown, countdownScale, countdownOpacity, countdownStyle,
    startCountdown,
    saveDraftOnUnmount, restoreDraft,
  };
}
