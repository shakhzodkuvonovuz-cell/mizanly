import { useState, useCallback, useRef, forwardRef, useImperativeHandle } from 'react';
import { View, TextInput, Text, StyleSheet, NativeSyntheticEvent, TextInputSelectionChangeEventData } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { colors, spacing, fontSize, radius, fonts } from '@/theme';
import { useThemeColors } from '@/hooks/useThemeColors';

/**
 * RichCaptionInput — TextInput with live syntax highlighting.
 *
 * Renders a transparent TextInput for editing + an overlaid Text component
 * that highlights #hashtags (emerald), @mentions (blue), and URLs (gold).
 *
 * The overlay Text mirrors the input text exactly, with colored spans.
 * User sees the colored text; editing happens in the invisible TextInput underneath.
 *
 * Used in: create-post, create-thread, create-story caption fields.
 */

// ── Tokenizer: splits text into typed segments ──
type TokenType = 'text' | 'hashtag' | 'mention' | 'url';

interface Token {
  type: TokenType;
  value: string;
}

function tokenize(text: string): Token[] {
  const tokens: Token[] = [];
  // Match hashtags, mentions, and URLs
  const regex = /(#[a-zA-Z0-9_\u0600-\u06FF]+)|(@[a-zA-Z0-9_.]+)|(https?:\/\/[^\s]+)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    // Text before this match
    if (match.index > lastIndex) {
      tokens.push({ type: 'text', value: text.slice(lastIndex, match.index) });
    }

    if (match[1]) {
      tokens.push({ type: 'hashtag', value: match[1] });
    } else if (match[2]) {
      tokens.push({ type: 'mention', value: match[2] });
    } else if (match[3]) {
      tokens.push({ type: 'url', value: match[3] });
    }

    lastIndex = regex.lastIndex;
  }

  // Remaining text
  if (lastIndex < text.length) {
    tokens.push({ type: 'text', value: text.slice(lastIndex) });
  }

  return tokens;
}

// ── Color mapping ──
const TOKEN_COLORS: Record<TokenType, string> = {
  text: 'transparent', // Will be overridden per-theme
  hashtag: colors.emerald,
  mention: colors.extended.blue,
  url: colors.gold,
};

interface RichCaptionInputProps {
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  maxLength?: number;
  multiline?: boolean;
  autoFocus?: boolean;
  minHeight?: number;
  accessibilityLabel?: string;
  /** Called when user types # or @ for autocomplete */
  onTriggerAutocomplete?: (type: 'hashtag' | 'mention', query: string) => void;
  /** Called when autocomplete trigger is no longer active */
  onDismissAutocomplete?: () => void;
  style?: object;
}

export interface RichCaptionInputRef {
  focus: () => void;
  blur: () => void;
}

export const RichCaptionInput = forwardRef<RichCaptionInputRef, RichCaptionInputProps>(
  function RichCaptionInput(
    {
      value,
      onChangeText,
      placeholder,
      maxLength,
      multiline = true,
      autoFocus = false,
      minHeight = 120,
      accessibilityLabel,
      onTriggerAutocomplete,
      onDismissAutocomplete,
      style,
    },
    ref
  ) {
    const tc = useThemeColors();
    const inputRef = useRef<TextInput>(null);
    const selectionRef = useRef<{ start: number; end: number }>({ start: 0, end: 0 });
    const [isFocused, setIsFocused] = useState(false);

    useImperativeHandle(ref, () => ({
      focus: () => inputRef.current?.focus(),
      blur: () => inputRef.current?.blur(),
    }));

    const handleSelectionChange = useCallback(
      (event: NativeSyntheticEvent<TextInputSelectionChangeEventData>) => {
        selectionRef.current = event.nativeEvent.selection;
      },
      [],
    );

    const handleChangeText = useCallback((text: string) => {
      onChangeText(text);

      // Detect autocomplete triggers using tracked cursor position
      if (onTriggerAutocomplete && onDismissAutocomplete) {
        const cursorPos = selectionRef.current.start;
        const beforeCursor = text.slice(0, cursorPos || text.length);

        const hashMatch = beforeCursor.match(/#([a-zA-Z0-9_\u0600-\u06FF]*)$/);
        if (hashMatch) {
          onTriggerAutocomplete('hashtag', hashMatch[1]);
          return;
        }

        const mentionMatch = beforeCursor.match(/@([a-zA-Z0-9_.]*)$/);
        if (mentionMatch) {
          onTriggerAutocomplete('mention', mentionMatch[1]);
          return;
        }

        onDismissAutocomplete();
      }
    }, [onChangeText, onTriggerAutocomplete, onDismissAutocomplete]);

    // Tokenize for overlay
    const tokens = tokenize(value);
    const hasContent = value.length > 0;

    return (
      <View style={[styles.container, { minHeight }, style]}>
        {/* Colored text overlay — positioned exactly over the TextInput */}
        <Text
          style={[
            styles.overlay,
            {
              color: tc.text.primary,
              minHeight,
              lineHeight: 23,
            },
          ]}
          pointerEvents="none"
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          {tokens.map((token, i) => (
            <Text
              key={i}
              style={
                token.type !== 'text'
                  ? { color: TOKEN_COLORS[token.type], fontWeight: '600' }
                  : { color: tc.text.primary }
              }
            >
              {token.value}
            </Text>
          ))}
        </Text>

        {/* Actual TextInput — transparent text, captures all editing */}
        <TextInput
          ref={inputRef}
          value={value}
          onChangeText={handleChangeText}
          placeholder={!hasContent ? placeholder : undefined}
          placeholderTextColor={tc.text.tertiary}
          multiline={multiline}
          maxLength={maxLength}
          autoFocus={autoFocus}
          onSelectionChange={handleSelectionChange}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          style={[
            styles.input,
            {
              color: 'transparent', // Text is invisible — overlay shows colored version
              minHeight,
              lineHeight: 23,
            },
          ]}
          accessibilityLabel={accessibilityLabel}
          textAlignVertical="top"
          selectionColor={colors.emerald}
          caretHidden={false}
        />

        {/* Focus indicator — subtle emerald line at bottom */}
        {isFocused && (
          <Animated.View entering={FadeIn.duration(150)} style={styles.focusLine} />
        )}
      </View>
    );
  }
);

const styles = StyleSheet.create({
  container: {
    position: 'relative',
  },
  overlay: {
    position: 'absolute',
    top: 0,
    start: 0,
    end: 0,
    fontSize: fontSize.base,
    fontFamily: fonts.body,
    // Must match TextInput padding exactly
    paddingTop: 0,
    paddingHorizontal: 0,
  },
  input: {
    fontSize: fontSize.base,
    fontFamily: fonts.body,
    paddingTop: 0,
    paddingHorizontal: 0,
    // Transparent text — colored overlay visible through it
    textAlignVertical: 'top',
  },
  focusLine: {
    position: 'absolute',
    bottom: 0,
    start: 0,
    end: 0,
    height: 2,
    backgroundColor: colors.emerald,
    borderRadius: 1,
  },
});
