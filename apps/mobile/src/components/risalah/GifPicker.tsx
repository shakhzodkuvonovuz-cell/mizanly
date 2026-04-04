import React, { useState, useEffect, useCallback } from 'react';
import { View, TextInput, FlatList, Pressable, Platform, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { ProgressiveImage } from '@/components/ui/ProgressiveImage';
import { Skeleton } from '@/components/ui/Skeleton';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Icon } from '@/components/ui/Icon';
import { showToast } from '@/components/ui/Toast';
import { useThemeColors } from '@/hooks/useThemeColors';
import { colors, spacing, fontSize, radius } from '@/theme';
import { searchGiphy, getTrending, type GiphyMediaItem } from '@/services/giphyService';

interface GifPickerProps {
  visible: boolean;
  onClose: () => void;
  onSelect: (gifUrl: string) => void;
}

export function GifPicker({ visible, onClose, onSelect }: GifPickerProps) {
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<GiphyMediaItem[]>([]);
  const [loading, setLoading] = useState(false);
  const { t } = useTranslation();
  const tc = useThemeColors();

  const fetchGifs = useCallback(async (query: string) => {
    setLoading(true);
    try {
      const data = query.trim()
        ? await searchGiphy({ query, type: 'gifs', limit: 30 })
        : await getTrending('gifs', 30);
      setResults(data);
      if (data.length === 0 && !process.env.EXPO_PUBLIC_GIPHY_API_KEY) {
        showToast({ message: t('errors.gifServiceNotConfigured'), variant: 'error' });
      }
    } catch {
      showToast({ message: t('errors.gifLoadFailed'), variant: 'error' });
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    if (visible) {
      fetchGifs('');
    }
  }, [visible, fetchGifs]);

  const renderGifItem = useCallback(
    ({ item }: { item: GiphyMediaItem }) => (
      <Pressable
        style={[styles.gifItem, { backgroundColor: tc.bgElevated }]}
        onPress={() => onSelect(item.url)}
        accessibilityRole="button"
        accessibilityLabel={t('gif.selectGif')}
      >
        <ProgressiveImage
          uri={item.previewUrl || item.url}
          width="100%"
          height={150}
          blurhash={null}
        />
      </Pressable>
    ),
    [onSelect, tc.bgElevated, t],
  );

  const handleSearch = useCallback(() => {
    fetchGifs(search);
  }, [search, fetchGifs]);

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      snapPoint={400}
    >
      <View style={styles.gifPicker}>
        <View style={[styles.gifSearchRow, { borderBottomColor: tc.border }]}>
          <TextInput
            style={[styles.gifSearchInput, { backgroundColor: tc.bgElevated, borderColor: tc.border }]}
            placeholder={t('gif.searchPlaceholder')}
            placeholderTextColor={tc.text.tertiary}
            accessibilityLabel={t('gif.search')}
            value={search}
            onChangeText={setSearch}
            onSubmitEditing={handleSearch}
            returnKeyType="search"
          />
          <Pressable onPress={handleSearch} style={styles.gifSearchButton} accessibilityRole="button" accessibilityLabel={t('gif.search')}>
            <Icon name="search" size="sm" color={tc.text.secondary} />
          </Pressable>
        </View>
        {loading ? (
          <View style={styles.gifLoader}>
            <Skeleton.Rect width={120} height={120} borderRadius={radius.sm} />
            <Skeleton.Rect width={120} height={120} borderRadius={radius.sm} />
          </View>
        ) : (
          <FlatList
            data={results}
            keyExtractor={(item) => item.id}
            numColumns={2}
            contentContainerStyle={styles.gifGrid}
            renderItem={renderGifItem}
          />
        )}
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  gifPicker: {
    flex: 1,
    maxHeight: 400,
  },
  gifSearchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.dark.border,
    gap: spacing.sm,
  },
  gifSearchInput: {
    flex: 1,
    color: colors.text.primary,
    fontSize: fontSize.base,
    backgroundColor: colors.dark.bgElevated,
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: Platform.OS === 'ios' ? spacing.sm : 6,
    borderWidth: 0.5,
    borderColor: colors.dark.border,
  },
  gifSearchButton: {
    padding: spacing.sm,
  },
  gifLoader: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xl,
  },
  gifGrid: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
  },
  gifItem: {
    flex: 1,
    margin: spacing.xs,
    aspectRatio: 1,
    borderRadius: radius.md,
    overflow: 'hidden' as const,
    backgroundColor: colors.dark.bgElevated,
  },
});
