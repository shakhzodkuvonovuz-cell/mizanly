import { useState, useEffect, useRef, useCallback, memo } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator } from 'react-native';
import Animated, {
  useAnimatedStyle,
  withTiming,
  useSharedValue,
} from 'react-native-reanimated';
import { Avatar } from '@/components/ui/Avatar';
import { useThemeColors } from '@/hooks/useThemeColors';
import { useContextualHaptic } from '@/hooks/useContextualHaptic';
import { searchApi } from '@/services/api';
import { colors, spacing, fontSize, radius, fonts, shadow } from '@/theme';
import type { User } from '@/types';

// ── Types ──

interface MentionUser {
  username: string;
  displayName: string;
  avatarUrl?: string | null;
  isVerified?: boolean;
}

interface MentionAutocompleteProps {
  /** Text typed after the @ symbol */
  query: string;
  /** Called when a user is selected from the suggestions */
  onSelect: (user: { username: string; displayName: string }) => void;
  /** Whether the autocomplete dropdown should be visible */
  visible: boolean;
}

// ── Constants ──

const MAX_RESULTS = 5;
const DEBOUNCE_MS = 300;
const ITEM_HEIGHT = 52;

// ── Suggestion row ──

const SuggestionRow = memo(function SuggestionRow({
  user,
  onPress,
}: {
  user: MentionUser;
  onPress: (user: MentionUser) => void;
}) {
  const tc = useThemeColors();
  const haptic = useContextualHaptic();

  const handlePress = () => {
    haptic.tick();
    onPress(user);
  };

  return (
    <Pressable
      style={({ pressed }) => [
        styles.suggestionRow,
        pressed && { backgroundColor: tc.surfaceHover },
      ]}
      onPress={handlePress}
      accessibilityLabel={`Select ${user.displayName}`}
      accessibilityRole="button"
    >
      <Avatar
        uri={user.avatarUrl}
        name={user.displayName}
        size="sm"
      />
      <View style={styles.userInfo}>
        <View style={styles.nameRow}>
          <Text
            style={[styles.displayName, { color: tc.text.primary }]}
            numberOfLines={1}
          >
            {user.displayName}
          </Text>
          {user.isVerified && (
            <View style={styles.verifiedBadge}>
              <Text style={styles.verifiedIcon}>{'\u2713'}</Text>
            </View>
          )}
        </View>
        <Text
          style={[styles.username, { color: tc.text.secondary }]}
          numberOfLines={1}
        >
          @{user.username}
        </Text>
      </View>
    </Pressable>
  );
});

// ── Main component ──

export function MentionAutocomplete({ query, onSelect, visible }: MentionAutocompleteProps) {
  const tc = useThemeColors();
  const [suggestions, setSuggestions] = useState<MentionUser[]>([]);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestQueryRef = useRef(query);
  const opacity = useSharedValue(0);

  // Animate visibility
  useEffect(() => {
    if (visible && suggestions.length > 0) {
      opacity.value = withTiming(1, { duration: 150 });
    } else {
      opacity.value = withTiming(0, { duration: 100 });
    }
  }, [visible, suggestions.length, opacity]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    // Hide from layout when fully transparent
    pointerEvents: opacity.value > 0 ? 'auto' as const : 'none' as const,
  }));

  // Debounced search
  useEffect(() => {
    latestQueryRef.current = query;

    if (!visible || query.length === 0) {
      setSuggestions([]);
      setLoading(false);
      return;
    }

    setLoading(true);

    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    debounceRef.current = setTimeout(async () => {
      try {
        const result = await searchApi.search(query, 'people');
        // Only update if the query hasn't changed during the fetch
        if (latestQueryRef.current !== query) return;

        const people: User[] = result?.data?.people ?? result?.people ?? [];
        const mapped: MentionUser[] = people.slice(0, MAX_RESULTS).map((u) => ({
          username: u.username,
          displayName: u.displayName,
          avatarUrl: u.avatarUrl,
          isVerified: u.isVerified,
        }));
        setSuggestions(mapped);
      } catch {
        // Network error — clear suggestions silently
        if (latestQueryRef.current === query) {
          setSuggestions([]);
        }
      } finally {
        if (latestQueryRef.current === query) {
          setLoading(false);
        }
      }
    }, DEBOUNCE_MS);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [query, visible]);

  const handleSelect = useCallback((user: MentionUser) => {
    onSelect({
      username: user.username,
      displayName: user.displayName,
    });
    setSuggestions([]);
  }, [onSelect]);

  // Don't render if not visible or nothing to show
  if (!visible) return null;

  const showContent = loading || suggestions.length > 0;
  if (!showContent && query.length === 0) return null;

  return (
    <Animated.View
      style={[
        styles.container,
        {
          backgroundColor: tc.bgCard,
          borderColor: tc.border,
        },
        shadow.md,
        animatedStyle,
      ]}
    >
      {loading && suggestions.length === 0 ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="small" color={colors.emerald} />
        </View>
      ) : (
        suggestions.map((user) => (
          <SuggestionRow
            key={user.username}
            user={user}
            onPress={handleSelect}
          />
        ))
      )}
    </Animated.View>
  );
}

// ── Styles ──

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    start: 0,
    end: 0,
    bottom: '100%',
    marginBottom: spacing.xs,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    maxHeight: ITEM_HEIGHT * MAX_RESULTS,
  },
  loadingContainer: {
    height: ITEM_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  suggestionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: spacing.md,
    height: ITEM_HEIGHT,
  },
  userInfo: {
    flex: 1,
    justifyContent: 'center',
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  displayName: {
    fontSize: fontSize.base,
    fontFamily: fonts.bodyMedium,
    flexShrink: 1,
  },
  verifiedBadge: {
    width: 16,
    height: 16,
    borderRadius: radius.full,
    backgroundColor: colors.emerald,
    alignItems: 'center',
    justifyContent: 'center',
  },
  verifiedIcon: {
    color: colors.extended.white,
    fontSize: 10,
    fontWeight: '700',
  },
  username: {
    fontSize: fontSize.sm,
    fontFamily: fonts.body,
    marginTop: 1,
  },
});
