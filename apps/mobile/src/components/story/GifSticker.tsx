import { useState, useCallback, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Pressable,
  FlatList,
  Dimensions,
  StyleProp,
  ViewStyle,
} from 'react-native';
import Animated, {
  FadeIn,
  FadeInDown,
} from 'react-native-reanimated';
import { Image } from 'expo-image';
import { Icon } from '@/components/ui/Icon';
import { Skeleton } from '@/components/ui/Skeleton';
import { colors, spacing, fontSize, radius, fonts } from '@/theme';
import { useThemeColors } from '@/hooks/useThemeColors';
import { useTranslation } from '@/hooks/useTranslation';
import { useContextualHaptic } from '@/hooks/useContextualHaptic';
import { searchGiphy, GIPHY_CATEGORIES, type GiphyMediaItem } from '@/services/giphyService';

const { width: SCREEN_W } = Dimensions.get('window');
const GIF_COLUMN_COUNT = 2;
const GIF_ITEM_GAP = spacing.sm;
const GIF_ITEM_WIDTH = (SCREEN_W - spacing.base * 2 - GIF_ITEM_GAP) / GIF_COLUMN_COUNT;

// ── GIPHY-compatible types ──
export interface GifItem {
  id: string;
  url: string; // Full-size GIF URL
  previewUrl: string; // Low-res preview
  width: number;
  height: number;
  title: string;
}

export interface GifStickerData {
  gifUrl: string;
  gifPreviewUrl: string;
  gifWidth: number;
  gifHeight: number;
  gifTitle: string;
}

// ── Trending categories for GIF search (icons + i18n label keys from service) ──
const GIF_CATEGORY_ICONS: Record<string, string> = {
  trending: 'trending-up',
  reactions: 'smile',
  love: 'heart',
  happy: 'star',
  sad: 'eye',
  celebrate: 'star',
  islamic: 'star',
  funny: 'smile',
};

// ── Adapter: GiphyMediaItem → GifItem ──
function toGifItem(item: GiphyMediaItem): GifItem {
  return {
    id: item.id,
    url: item.url,
    previewUrl: item.previewUrl,
    width: item.width,
    height: item.height,
    title: item.title,
  };
}

interface GifSearchProps {
  onSelect: (gif: GifItem) => void;
  onClose: () => void;
  style?: StyleProp<ViewStyle>;
}

/**
 * GIF Search panel — slides up as BottomSheet content.
 * Provides category chips, search input, and masonry grid of results.
 */
export function GifSearch({ onSelect, onClose, style }: GifSearchProps) {
  const tc = useThemeColors();
  const { t } = useTranslation();
  const haptic = useContextualHaptic();
  const [query, setQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState('trending');
  const [gifs, setGifs] = useState<GifItem[]>([]);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Fetch GIFs via giphyService (API or SDK depending on availability)
  const fetchGifs = useCallback(async (searchTerm: string) => {
    setLoading(true);
    const results = await searchGiphy({ query: searchTerm || '', type: 'gifs', limit: 20 });
    setGifs(results.map(toGifItem));
    setLoading(false);
  }, []);

  useEffect(() => {
    const cat = GIPHY_CATEGORIES.find(c => c.id === activeCategory);
    fetchGifs(cat?.searchTerm || '');
  }, [activeCategory, fetchGifs]);

  const handleSearchChange = useCallback((text: string) => {
    setQuery(text);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      if (text.trim()) {
        fetchGifs(text.trim());
      } else {
        const cat = GIPHY_CATEGORIES.find(c => c.id === activeCategory);
        fetchGifs(cat?.searchTerm || '');
      }
    }, 400);
  }, [activeCategory, fetchGifs]);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const handleSelectGif = useCallback((gif: GifItem) => {
    haptic.tick();
    onSelect(gif);
  }, [haptic, onSelect]);

  const handleCategoryPress = useCallback((catId: string) => {
    haptic.tick();
    setActiveCategory(catId);
    setQuery('');
  }, [haptic]);

  const renderGifItem = useCallback(({ item, index }: { item: GifItem; index: number }) => {
    const aspectRatio = item.width / item.height;
    return (
      <Animated.View entering={FadeInDown.delay(index * 30).duration(200)}>
        <Pressable
          onPress={() => handleSelectGif(item)}
          style={[styles.gifItem, { width: GIF_ITEM_WIDTH }]}
          accessibilityLabel={item.title}
          accessibilityRole="button"
        >
          <Image
            source={{ uri: item.previewUrl }}
            style={[styles.gifImage, { aspectRatio: Math.max(0.5, Math.min(2, aspectRatio)) }]}
            contentFit="cover"
            transition={200}
          />
        </Pressable>
      </Animated.View>
    );
  }, [handleSelectGif]);

  return (
    <View style={[styles.searchContainer, style]}>
      {/* Search input */}
      <View style={[styles.searchBar, { backgroundColor: tc.bgElevated, borderColor: tc.borderLight }]}>
        <Icon name="search" size="sm" color={tc.text.tertiary} />
        <TextInput
          style={[styles.searchInput, { color: tc.text.primary }]}
          placeholder={t('stories.searchGifs')}
          placeholderTextColor={tc.text.tertiary}
          value={query}
          onChangeText={handleSearchChange}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
          accessibilityLabel={t('stories.searchGifs')}
        />
        {query.length > 0 && (
          <Pressable onPress={() => handleSearchChange('')} hitSlop={8}>
            <Icon name="x" size="sm" color={tc.text.tertiary} />
          </Pressable>
        )}
      </View>

      {/* Category chips */}
      <FlatList
        horizontal
        data={GIPHY_CATEGORIES}
        keyExtractor={item => item.id}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.categoryList}
        renderItem={({ item }) => {
          const isActive = item.id === activeCategory && !query;
          const iconName = (GIF_CATEGORY_ICONS[item.id] || 'star') as never;
          return (
            <Pressable
              onPress={() => handleCategoryPress(item.id)}
              style={[
                styles.categoryChip,
                { backgroundColor: isActive ? colors.emerald : tc.bgElevated },
              ]}
              accessibilityRole="button"
              accessibilityState={{ selected: isActive }}
              accessibilityLabel={t(item.labelKey)}
            >
              <Icon name={iconName} size={14} color={isActive ? '#fff' : tc.text.secondary} />
              <Text style={[styles.categoryLabel, { color: isActive ? '#fff' : tc.text.secondary }]}>
                {t(item.labelKey)}
              </Text>
            </Pressable>
          );
        }}
      />

      {/* GIF grid */}
      {loading ? (
        <View style={styles.loadingContainer}>
          <View style={{ flexDirection: 'row', gap: GIF_ITEM_GAP }}>
            <Skeleton.Rect width={GIF_ITEM_WIDTH} height={120} />
            <Skeleton.Rect width={GIF_ITEM_WIDTH} height={120} />
          </View>
          <View style={{ flexDirection: 'row', gap: GIF_ITEM_GAP, marginTop: GIF_ITEM_GAP }}>
            <Skeleton.Rect width={GIF_ITEM_WIDTH} height={90} />
            <Skeleton.Rect width={GIF_ITEM_WIDTH} height={90} />
          </View>
        </View>
      ) : (
        <FlatList
          data={gifs}
          numColumns={GIF_COLUMN_COUNT}
          keyExtractor={item => item.id}
          renderItem={renderGifItem}
          contentContainerStyle={styles.gifGrid}
          columnWrapperStyle={styles.gifRow}
          showsVerticalScrollIndicator={false}
        />
      )}

      {/* GIPHY attribution */}
      <View style={styles.attribution}>
        <Text style={styles.attributionText}>{t('stories.poweredByGiphy')}</Text>
      </View>
    </View>
  );
}

// ── Display sticker (on story canvas & viewer) ──
interface GifStickerDisplayProps {
  data: GifStickerData;
  style?: StyleProp<ViewStyle>;
}

export function GifStickerDisplay({ data, style }: GifStickerDisplayProps) {
  const aspectRatio = data.gifWidth / data.gifHeight;
  return (
    <Animated.View entering={FadeIn.duration(300)} style={style}>
      <Image
        source={{ uri: data.gifUrl }}
        style={[styles.displayGif, { aspectRatio: Math.max(0.5, Math.min(2, aspectRatio)) }]}
        contentFit="contain"
        transition={200}
        accessibilityLabel={data.gifTitle}
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  searchContainer: {
    flex: 1,
    maxHeight: 500,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.md,
    borderWidth: 1,
    height: 44,
    gap: spacing.sm,
  },
  searchInput: {
    flex: 1,
    fontSize: fontSize.base,
    fontFamily: fonts.body,
    paddingVertical: 0,
  },
  categoryList: {
    paddingBottom: spacing.md,
    gap: spacing.sm,
  },
  categoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
  },
  categoryLabel: {
    fontSize: fontSize.sm,
    fontFamily: fonts.bodyMedium,
    fontWeight: '500',
  },
  gifGrid: {
    paddingBottom: spacing.base,
  },
  gifRow: {
    gap: GIF_ITEM_GAP,
    marginBottom: GIF_ITEM_GAP,
  },
  gifItem: {
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  gifImage: {
    width: '100%',
    borderRadius: radius.md,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: 200,
  },
  attribution: {
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  attributionText: {
    color: colors.text.tertiary,
    fontSize: fontSize.xs,
    fontFamily: fonts.body,
  },
  displayGif: {
    width: 200,
    maxWidth: '100%',
    borderRadius: radius.sm,
  },
});
