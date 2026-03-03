import { Text, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { colors, fontSize } from '@/theme';

interface Props {
  text: string;
  style?: object;
  numberOfLines?: number;
  onPostPress?: () => void; // tap on body text (non-link areas)
}

/**
 * Renders text with tappable #hashtag and @mention links.
 * Hashtags navigate to /(screens)/hashtag/[tag]
 * Mentions navigate to /(screens)/profile/[username]
 */
export function RichText({ text, style, numberOfLines, onPostPress }: Props) {
  const router = useRouter();

  // Split text into segments: plain text | hashtag | mention
  const segments: { type: 'text' | 'hashtag' | 'mention'; value: string }[] = [];
  const TOKEN_RE = /(#[\w\u0600-\u06FF]+|@[\w.]+)/g;

  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = TOKEN_RE.exec(text)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ type: 'text', value: text.slice(lastIndex, match.index) });
    }
    const token = match[0];
    if (token.startsWith('#')) {
      segments.push({ type: 'hashtag', value: token.slice(1) });
    } else {
      segments.push({ type: 'mention', value: token.slice(1) });
    }
    lastIndex = match.index + token.length;
  }

  if (lastIndex < text.length) {
    segments.push({ type: 'text', value: text.slice(lastIndex) });
  }

  return (
    <Text style={[styles.base, style]} numberOfLines={numberOfLines} onPress={onPostPress}>
      {segments.map((seg, i) => {
        if (seg.type === 'hashtag') {
          return (
            <Text
              key={i}
              style={styles.hashtag}
              onPress={(e) => {
                e.stopPropagation?.();
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
                router.push(`/(screens)/profile/${seg.value}`);
              }}
            >
              @{seg.value}
            </Text>
          );
        }
        return <Text key={i}>{seg.value}</Text>;
      })}
    </Text>
  );
}

const styles = StyleSheet.create({
  base: { color: colors.text.primary, fontSize: fontSize.base, lineHeight: 22 },
  hashtag: { color: colors.emerald, fontWeight: '500' },
  mention: { color: colors.emerald, fontWeight: '500' },
});
