import { useCallback, useEffect, useRef } from 'react';
import * as Speech from 'expo-speech';
import i18next from 'i18next';
import { useStore } from '@/store';

const SPEED_OPTIONS = [0.75, 1, 1.25, 1.5] as const;
type TTSSpeed = (typeof SPEED_OPTIONS)[number];

// Language mapping from i18n locale to TTS language code
const LANGUAGE_MAP: Record<string, string> = {
  en: 'en-US',
  ar: 'ar-SA',
  tr: 'tr-TR',
  ur: 'ur-PK',
  bn: 'bn-BD',
  fr: 'fr-FR',
  id: 'id-ID',
  ms: 'ms-MY',
};

// Simple Arabic detection
function isArabicText(text: string): boolean {
  const arabicRange = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/;
  const arabicChars = (text.match(new RegExp(arabicRange.source, 'g')) || []).length;
  return arabicChars > text.length * 0.3;
}

// Quran verse detection — requires at least 2 pattern matches to avoid false positives.
// Single patterns like (2:255) or بِسْمِ اللَّهِ alone are too broad and match
// non-Quran text (e.g., version numbers, common Islamic greetings).
function isQuranText(text: string): boolean {
  const quranPatterns = [
    /سورة/,            // "Surah" in Arabic
    /آية/,              // "Ayah" in Arabic
    /﷽/,               // Bismillah Unicode ligature
    /بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ/, // Full Bismillah (more specific than partial)
    /\(\d+:\d+\)/,      // (2:255) style verse references
    /Surah\s+\w+/i,     // English surah references
    /Quran\s+\d+/i,     // Quran chapter references
  ];
  const matchCount = quranPatterns.filter((p) => p.test(text)).length;
  // Require at least 2 matching patterns to classify as Quran text
  return matchCount >= 2;
}

function detectLanguage(text: string): string {
  if (isArabicText(text)) return 'ar-SA';

  // Check for Turkish characters
  if (/[çğıöşüÇĞİÖŞÜ]/.test(text)) return 'tr-TR';

  // Check for Urdu/Persian characters
  if (/[\u0600-\u06FF]/.test(text) && /[پچڈڑکگں]/.test(text)) return 'ur-PK';

  // Check for Bengali characters
  if (/[\u0980-\u09FF]/.test(text)) return 'bn-BD';

  // Check for French accented characters
  if (/[àâçéèêëïîôùûüÿœæ]/i.test(text)) return 'fr-FR';

  // Check for Malay/Indonesian (harder to distinguish, use locale fallback)
  return LANGUAGE_MAP[i18next.language] || 'en-US';
}

export function useTTS() {
  const ttsText = useStore((s) => s.ttsText);
  const ttsTitle = useStore((s) => s.ttsTitle);
  const ttsPlaying = useStore((s) => s.ttsPlaying);
  const ttsSpeed = useStore((s) => s.ttsSpeed);
  const setTTSText = useStore((s) => s.setTTSText);
  const setTTSTitle = useStore((s) => s.setTTSTitle);
  const setTTSPlaying = useStore((s) => s.setTTSPlaying);
  const setTTSSpeed = useStore((s) => s.setTTSSpeed);
  const stopTTS = useStore((s) => s.stopTTS);

  const currentSpeedRef = useRef(ttsSpeed);
  currentSpeedRef.current = ttsSpeed;
  // Flag to suppress the onStopped callback during speed cycling (avoids race condition
  // where Speech.stop()'s onStopped fires and sets ttsPlaying=false before Speech.speak starts)
  const ignoringStopRef = useRef(false);

  // Stop speech when component unmounts while speaking
  useEffect(() => {
    return () => {
      // Don't stop on unmount — TTS should persist across screens
    };
  }, []);

  const speak = useCallback(
    (text: string, title: string) => {
      // If Quran text, don't use TTS — should use proper recitation
      if (isQuranText(text)) {
        return { isQuran: true };
      }

      // Stop any current speech
      Speech.stop();

      const language = detectLanguage(text);

      setTTSText(text);
      setTTSTitle(title);
      setTTSPlaying(true);

      Speech.speak(text, {
        language,
        rate: currentSpeedRef.current,
        onDone: () => {
          setTTSPlaying(false);
        },
        onStopped: () => {
          // Ignore stop events triggered by cycleSpeed — it will immediately re-speak
          if (ignoringStopRef.current) {
            ignoringStopRef.current = false;
            return;
          }
          setTTSPlaying(false);
        },
        onError: () => {
          setTTSPlaying(false);
        },
      });

      return { isQuran: false };
    },
    [setTTSText, setTTSTitle, setTTSPlaying],
  );

  const pause = useCallback(() => {
    Speech.stop();
    setTTSPlaying(false);
  }, [setTTSPlaying]);

  const restart = useCallback(() => {
    if (!ttsText) return;
    setTTSPlaying(true);
    const language = detectLanguage(ttsText);
    Speech.speak(ttsText, {
      language,
      rate: currentSpeedRef.current,
      onDone: () => setTTSPlaying(false),
      onStopped: () => setTTSPlaying(false),
      onError: () => setTTSPlaying(false),
    });
  }, [ttsText, setTTSPlaying]);

  const stop = useCallback(() => {
    Speech.stop();
    stopTTS();
  }, [stopTTS]);

  const cycleSpeed = useCallback(() => {
    const currentIndex = SPEED_OPTIONS.indexOf(ttsSpeed as TTSSpeed);
    const nextIndex = (currentIndex + 1) % SPEED_OPTIONS.length;
    const newSpeed = SPEED_OPTIONS[nextIndex];
    setTTSSpeed(newSpeed);

    // If currently playing, restart with new speed
    if (ttsPlaying && ttsText) {
      // Set flag so the onStopped from Speech.stop() doesn't reset ttsPlaying
      ignoringStopRef.current = true;
      Speech.stop();
      const language = detectLanguage(ttsText);
      Speech.speak(ttsText, {
        language,
        rate: newSpeed,
        onDone: () => setTTSPlaying(false),
        onStopped: () => {
          if (ignoringStopRef.current) {
            ignoringStopRef.current = false;
            return;
          }
          setTTSPlaying(false);
        },
        onError: () => setTTSPlaying(false),
      });
    }
  }, [ttsSpeed, ttsPlaying, ttsText, setTTSSpeed, setTTSPlaying]);

  return {
    speak,
    pause,
    restart,
    stop,
    cycleSpeed,
    isPlaying: ttsPlaying,
    currentText: ttsText,
    currentTitle: ttsTitle,
    speed: ttsSpeed,
    isActive: !!ttsText,
    SPEED_OPTIONS,
  };
}
