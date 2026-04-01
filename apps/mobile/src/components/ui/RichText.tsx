import { memo } from 'react';
import { View, Text, StyleSheet, Linking } from 'react-native';
import { useRouter } from 'expo-router';
import { LinkPreview } from '@/components/ui/LinkPreview';
import { colors, fontSize, fonts } from '@/theme';
import { useContextualHaptic } from '@/hooks/useContextualHaptic';

interface Props {
  text: string;
  style?: object;
  numberOfLines?: number;
  onPostPress?: () => void;
}

// Detect if text contains RTL characters (Arabic, Persian, Urdu, etc.)
const RTL_RE = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;
function detectWritingDirection(text: string): 'rtl' | 'ltr' {
  return RTL_RE.test(text) ? 'rtl' : 'ltr';
}

export const RichText = memo(function RichText({ text, style, numberOfLines, onPostPress }: Props) {
  const router = useRouter();
  const haptic = useContextualHaptic();
  const writingDirection = detectWritingDirection(text);

  const segments: { type: 'text' | 'hashtag' | 'mention' | 'url' | 'phone' | 'email' | 'quran_ref'; value: string }[] = [];
  // Finding #322: Added Quran citation pattern (\d{1,3}:\d{1,3}) for auto-linking surah:verse refs
  const TOKEN_RE = /(https?:\/\/[^\s]+|#[\w\u0600-\u06FF]+|@[\w.]+|\b\d{1,3}:\d{1,3}\b|\+?\d{1,4}[-.\s]?\(?\d{1,3}\)?[-.\s]?\d{1,4}[-.\s]?\d{1,9}|[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g;

  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = TOKEN_RE.exec(text)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ type: 'text', value: text.slice(lastIndex, match.index) });
    }
    const token = match[0];
    if (token.startsWith('http')) {
      segments.push({ type: 'url', value: token });
    } else if (token.startsWith('#')) {
      segments.push({ type: 'hashtag', value: token.slice(1) });
    } else if (token.startsWith('@')) {
      segments.push({ type: 'mention', value: token.slice(1) });
    } else if (token.includes('@')) {
      segments.push({ type: 'email', value: token });
    } else if (/^\d{1,3}:\d{1,3}$/.test(token)) {
      // Quran citation: surah:verse (e.g., "2:255", "3:103")
      // Filter out common time formats: surah numbers are 1-114, verse max ~286
      const [surah, verse] = token.split(':').map(Number);
      if (surah >= 1 && surah <= 114 && verse >= 1 && verse <= 286) {
        segments.push({ type: 'quran_ref', value: token });
      } else {
        segments.push({ type: 'text', value: token });
      }
    } else {
      segments.push({ type: 'phone', value: token });
    }
    lastIndex = match.index + token.length;
  }

  if (lastIndex < text.length) {
    segments.push({ type: 'text', value: text.slice(lastIndex) });
  }

  const firstUrl = segments.find(seg => seg.type === 'url')?.value;

  return (
    <View>
      <Text style={[styles.base, { writingDirection, textAlign: writingDirection === 'rtl' ? 'right' : 'left' }, style]} numberOfLines={numberOfLines} onPress={onPostPress}>
      {segments.map((seg, i) => {
        if (seg.type === 'url') {
          return (
            <Text
              key={i}
              style={styles.url}
              onPress={(e) => { e.stopPropagation?.(); haptic.navigate(); Linking.openURL(seg.value); }}
            >
              {seg.value}
            </Text>
          );
        }
        if (seg.type === 'hashtag') {
          return (
            <Text
              key={i}
              style={styles.hashtag}
              onPress={(e) => {
                e.stopPropagation?.();
                haptic.navigate();
                router.push(`/(screens)/hashtag/${seg.value}`);
              }}
            >
              #{seg.value}
            </Text>
          );
        }
        if (seg.type === 'mention') {
          return (
            <Text
              key={i}
              style={styles.mention}
              onPress={(e) => {
                e.stopPropagation?.();
                haptic.navigate();
                router.push(`/(screens)/profile/${seg.value}`);
              }}
            >
              @{seg.value}
            </Text>
          );
        }
        // Finding #322: Quran citation auto-link
        if (seg.type === 'quran_ref') {
          const [surah, verse] = seg.value.split(':');
          return (
            <Text
              key={i}
              style={{ color: colors.emerald, fontWeight: '600' }}
              onPress={(e) => {
                e.stopPropagation?.();
                haptic.navigate();
                router.push(`/(screens)/tafsir-viewer?surah=${surah}&verse=${verse}` as never);
              }}
            >
              Quran {seg.value}
            </Text>
          );
        }
        if (seg.type === 'phone') {
          return (
            <Text
              key={i}
              style={styles.phone}
              onPress={(e) => { e.stopPropagation?.(); haptic.navigate(); Linking.openURL(`tel:${seg.value}`); }}
            >
              {seg.value}
            </Text>
          );
        }
        if (seg.type === 'email') {
          return (
            <Text
              key={i}
              style={styles.email}
              onPress={(e) => { e.stopPropagation?.(); haptic.navigate(); Linking.openURL(`mailto:${seg.value}`); }}
            >
              {seg.value}
            </Text>
          );
        }
        return <Text key={i}>{seg.value}</Text>;
      })}
      </Text>
      {firstUrl && <LinkPreview url={firstUrl} />}
    </View>
  );
});

const styles = StyleSheet.create({
  base: {
    color: colors.text.primary,
    fontSize: fontSize.base,
    lineHeight: 22,
  },
  hashtag: {
    color: colors.emerald,
    fontWeight: '600',
  },
  mention: {
    color: colors.emerald,
    fontWeight: '600',
  },
  url: {
    color: colors.emerald,
    textDecorationLine: 'underline',
  },
  phone: {
    color: colors.emerald,
    textDecorationLine: 'underline',
  },
  email: {
    color: colors.emerald,
    textDecorationLine: 'underline',
  },
});
