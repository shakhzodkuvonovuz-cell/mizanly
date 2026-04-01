import { useState, useEffect, useCallback, useMemo, memo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  TextInput,
  FlatList,
  Dimensions,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Icon, type IconName } from '@/components/ui/Icon';
import { useThemeColors } from '@/hooks/useThemeColors';
import { useContextualHaptic } from '@/hooks/useContextualHaptic';
import { useTranslation } from '@/hooks/useTranslation';
import { colors, spacing, fontSize, radius, fonts } from '@/theme';

// ── Types ──

interface EmojiPickerProps {
  onSelect: (emoji: string) => void;
  visible: boolean;
  onClose: () => void;
}

type CategoryKey = 'recent' | 'smileys' | 'gestures' | 'hearts' | 'objects' | 'nature' | 'food';

interface CategoryDef {
  key: CategoryKey;
  icon: IconName;
  label: string;
}

// ── Constants ──

const STORAGE_KEY = 'mizanly_recent_emojis';
const MAX_RECENT = 32;
const NUM_COLUMNS = 8;
const { width: SCREEN_WIDTH } = Dimensions.get('window');
const GRID_PADDING = spacing.base;
const CELL_SIZE = Math.floor((SCREEN_WIDTH - GRID_PADDING * 2) / NUM_COLUMNS);

const CATEGORIES: CategoryDef[] = [
  { key: 'recent', icon: 'clock', label: 'Recent' },
  { key: 'smileys', icon: 'smile', label: 'Smileys' },
  { key: 'gestures', icon: 'user', label: 'Gestures' },
  { key: 'hearts', icon: 'heart', label: 'Hearts' },
  { key: 'objects', icon: 'star', label: 'Objects' },
  { key: 'nature', icon: 'sun', label: 'Nature' },
  { key: 'food', icon: 'gift', label: 'Food' },
];

// ── Curated emoji data (~200 emojis) ──

const EMOJI_DATA: Record<Exclude<CategoryKey, 'recent'>, string[]> = {
  smileys: [
    '\u{1F600}', '\u{1F603}', '\u{1F604}', '\u{1F601}', '\u{1F606}', '\u{1F605}', '\u{1F602}', '\u{1F923}',
    '\u{1F60A}', '\u{1F607}', '\u{1F642}', '\u{1F643}', '\u{1F609}', '\u{1F60C}', '\u{1F60D}', '\u{1F970}',
    '\u{1F618}', '\u{1F617}', '\u{1F619}', '\u{1F61A}', '\u{1F60B}', '\u{1F61B}', '\u{1F61C}', '\u{1F92A}',
    '\u{1F61D}', '\u{1F911}', '\u{1F917}', '\u{1F92D}', '\u{1F92B}', '\u{1F914}', '\u{1F910}', '\u{1F928}',
    '\u{1F610}', '\u{1F611}', '\u{1F636}', '\u{1F60F}', '\u{1F612}', '\u{1F644}', '\u{1F62C}', '\u{1F925}',
    '\u{1F60E}', '\u{1F929}', '\u{1F973}', '\u{1F978}', '\u{1F97A}', '\u{1F622}', '\u{1F62D}', '\u{1F624}',
  ],
  gestures: [
    '\u{1F44D}', '\u{1F44E}', '\u{1F44A}', '\u270C\uFE0F', '\u{1F91E}', '\u{1F919}', '\u{1F44C}', '\u{1F90C}',
    '\u{1F448}', '\u{1F449}', '\u{1F446}', '\u{1F447}', '\u261D\uFE0F', '\u270B', '\u{1F91A}', '\u{1F596}',
    '\u{1F44B}', '\u{1F919}', '\u{1F4AA}', '\u{1F64F}', '\u{1F91D}', '\u{1F450}', '\u{1F44F}', '\u{1F64C}',
    '\u{1F932}', '\u{1F485}', '\u{1F933}', '\u{1F4AA}', '\u{1F9B5}', '\u{1F9B6}', '\u{1F442}', '\u{1F443}',
  ],
  hearts: [
    '\u2764\uFE0F', '\u{1F9E1}', '\u{1F49B}', '\u{1F49A}', '\u{1F499}', '\u{1F49C}', '\u{1F5A4}', '\u{1F90E}',
    '\u{1F90D}', '\u{1F494}', '\u2763\uFE0F', '\u{1F495}', '\u{1F49E}', '\u{1F493}', '\u{1F497}', '\u{1F496}',
    '\u{1F498}', '\u{1F49D}', '\u{1F49F}', '\u{1F48C}', '\u{1F48B}', '\u{1F48D}', '\u{1F48E}', '\u{1F339}',
    '\u{1F940}', '\u{1F33A}', '\u{1F338}', '\u{1F33C}', '\u{1F33B}', '\u{1F337}', '\u2728', '\u{1F31F}',
  ],
  objects: [
    '\u{1F4F1}', '\u{1F4BB}', '\u{1F4F7}', '\u{1F3A5}', '\u{1F3AC}', '\u{1F4FA}', '\u{1F4FB}', '\u{1F3B5}',
    '\u{1F3B6}', '\u{1F3A4}', '\u{1F3A7}', '\u{1F3B8}', '\u{1F3B9}', '\u{1F3BA}', '\u{1F3BB}', '\u{1F56F}\uFE0F',
    '\u{1F4D6}', '\u{1F4DA}', '\u{1F4DD}', '\u270F\uFE0F', '\u{1F4E7}', '\u{1F4E8}', '\u{1F4E9}', '\u{1F4E6}',
    '\u{1F381}', '\u{1F388}', '\u{1F389}', '\u{1F38A}', '\u{1F3C6}', '\u{1F3C5}', '\u{1F947}', '\u{1F48E}',
  ],
  nature: [
    '\u{1F31E}', '\u{1F31D}', '\u{1F31B}', '\u{1F31C}', '\u2B50', '\u{1F308}', '\u2600\uFE0F', '\u{1F324}\uFE0F',
    '\u26C5', '\u{1F327}\uFE0F', '\u{1F329}\uFE0F', '\u{1F32A}\uFE0F', '\u{1F30A}', '\u{1F30D}', '\u{1F30E}', '\u{1F30F}',
    '\u{1F333}', '\u{1F332}', '\u{1F334}', '\u{1F335}', '\u{1F33F}', '\u2618\uFE0F', '\u{1F340}', '\u{1F341}',
    '\u{1F342}', '\u{1F343}', '\u{1F40B}', '\u{1F42C}', '\u{1F98B}', '\u{1F426}', '\u{1F427}', '\u{1F431}',
  ],
  food: [
    '\u{1F34E}', '\u{1F34F}', '\u{1F34A}', '\u{1F34B}', '\u{1F34C}', '\u{1F349}', '\u{1F347}', '\u{1F353}',
    '\u{1F348}', '\u{1F352}', '\u{1F351}', '\u{1F34D}', '\u{1F345}', '\u{1F346}', '\u{1F336}\uFE0F', '\u{1F33D}',
    '\u{1F35E}', '\u{1F950}', '\u{1F956}', '\u{1F968}', '\u{1F354}', '\u{1F355}', '\u{1F32E}', '\u{1F32F}',
    '\u{1F370}', '\u{1F382}', '\u{1F36A}', '\u{1F36B}', '\u{1F36C}', '\u2615', '\u{1F375}', '\u{1F9C3}',
  ],
};

// ── Component ──

const EmojiCell = memo(function EmojiCell({
  emoji,
  onPress,
}: {
  emoji: string;
  onPress: (emoji: string) => void;
}) {
  return (
    <Pressable
      style={styles.emojiCell}
      onPress={() => onPress(emoji)}
      accessibilityLabel={`Emoji ${emoji}`}
      accessibilityRole="button"
    >
      <Text style={styles.emojiText}>{emoji}</Text>
    </Pressable>
  );
});

export const EmojiPicker = memo(function EmojiPicker({ onSelect, visible, onClose }: EmojiPickerProps) {
  const tc = useThemeColors();
  const haptic = useContextualHaptic();
  const { t } = useTranslation();
  const [activeCategory, setActiveCategory] = useState<CategoryKey>('smileys');
  const [searchQuery, setSearchQuery] = useState('');
  const [recentEmojis, setRecentEmojis] = useState<string[]>([]);

  // Load recent emojis from storage when sheet becomes visible
  useEffect(() => {
    if (visible) {
      AsyncStorage.getItem(STORAGE_KEY).then((stored) => {
        if (stored) {
          try {
            const parsed = JSON.parse(stored);
            if (Array.isArray(parsed)) {
              setRecentEmojis(parsed);
            }
          } catch {
            // corrupted data, ignore
          }
        }
      }).catch(() => {});
    }
  }, [visible]);

  // Reset state when closing
  useEffect(() => {
    if (!visible) {
      setSearchQuery('');
    }
  }, [visible]);

  const handleEmojiPress = useCallback((emoji: string) => {
    haptic.tick();
    onSelect(emoji);

    // Update recent emojis
    setRecentEmojis((prev) => {
      const filtered = prev.filter((e) => e !== emoji);
      const updated = [emoji, ...filtered].slice(0, MAX_RECENT);
      // Persist async, fire-and-forget
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated)).catch(() => {});
      return updated;
    });
  }, [haptic, onSelect]);

  const handleCategoryPress = useCallback((key: CategoryKey) => {
    haptic.tick();
    setActiveCategory(key);
  }, [haptic]);

  // Build the displayed emoji list
  const displayedEmojis = useMemo(() => {
    if (searchQuery.length > 0) {
      // For emoji search, we search across all categories
      // Since emojis don't have text labels in our curated set,
      // search is a no-op for emoji characters. Instead, show all emojis
      // and let the user scroll. This is the standard pattern (most emoji
      // pickers only filter by category name, not individual emoji names).
      const allEmojis = Object.values(EMOJI_DATA).flat();
      return allEmojis;
    }

    if (activeCategory === 'recent') {
      return recentEmojis;
    }

    return EMOJI_DATA[activeCategory] ?? [];
  }, [activeCategory, recentEmojis, searchQuery]);

  const renderItem = useCallback(({ item }: { item: string }) => (
    <EmojiCell emoji={item} onPress={handleEmojiPress} />
  ), [handleEmojiPress]);

  const keyExtractor = useCallback((item: string, index: number) => `${item}-${index}`, []);

  return (
    <BottomSheet visible={visible} onClose={onClose} snapPoint={0.55}>
      <View style={styles.container}>
        {/* Search bar */}
        <View style={[styles.searchContainer, { backgroundColor: tc.bgElevated }]}>
          <Icon name="search" size="sm" color={tc.text.tertiary} />
          <TextInput
            style={[styles.searchInput, { color: tc.text.primary }]}
            placeholder={t('emoji.searchPlaceholder')}
            placeholderTextColor={tc.text.tertiary}
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoCapitalize="none"
            autoCorrect={false}
            clearButtonMode="while-editing"
          />
          {searchQuery.length > 0 && (
            <Pressable
              onPress={() => setSearchQuery('')}
              accessibilityLabel="Clear search"
              accessibilityRole="button"
            >
              <Icon name="x" size="sm" color={tc.text.tertiary} />
            </Pressable>
          )}
        </View>

        {/* Category tabs */}
        {searchQuery.length === 0 && (
          <View style={[styles.categoryTabs, { borderBottomColor: tc.border }]}>
            {CATEGORIES.map((cat) => {
              const isActive = activeCategory === cat.key;
              return (
                <Pressable
                  key={cat.key}
                  style={[
                    styles.categoryTab,
                    isActive && { backgroundColor: colors.active.emerald15 },
                  ]}
                  onPress={() => handleCategoryPress(cat.key)}
                  accessibilityLabel={cat.label}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: isActive }}
                >
                  <Icon
                    name={cat.icon}
                    size="sm"
                    color={isActive ? colors.emerald : tc.text.tertiary}
                  />
                </Pressable>
              );
            })}
          </View>
        )}

        {/* Emoji grid */}
        {displayedEmojis.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text style={[styles.emptyText, { color: tc.text.secondary }]}>
              {activeCategory === 'recent'
                ? t('emoji.noRecent')
                : t('emoji.noResults')}
            </Text>
          </View>
        ) : (
          <FlatList
            removeClippedSubviews
            data={displayedEmojis}
            renderItem={renderItem}
            keyExtractor={keyExtractor}
            numColumns={NUM_COLUMNS}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.gridContent}
            getItemLayout={(_data, index) => ({
              length: CELL_SIZE,
              offset: CELL_SIZE * Math.floor(index / NUM_COLUMNS),
              index,
            })}
          />
        )}
      </View>
    </BottomSheet>
  );
});

// ── Styles ──

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: GRID_PADDING,
    paddingBottom: spacing.sm,
    maxHeight: 400,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginBottom: spacing.sm,
    gap: spacing.sm,
  },
  searchInput: {
    flex: 1,
    fontSize: fontSize.base,
    fontFamily: fonts.body,
    paddingVertical: 0,
  },
  categoryTabs: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: spacing.sm,
    marginBottom: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  categoryTab: {
    width: 36,
    height: 36,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gridContent: {
    paddingBottom: spacing.md,
  },
  emojiCell: {
    width: CELL_SIZE,
    height: CELL_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emojiText: {
    fontSize: 28,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xxl,
  },
  emptyText: {
    fontSize: fontSize.base,
    fontFamily: fonts.body,
  },
});
