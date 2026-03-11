import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TextInput, StyleSheet, TouchableOpacity,
  FlatList, Keyboard,
} from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withTiming } from 'react-native-reanimated';
import { Avatar } from './Avatar';
import { Icon } from './Icon';
import { Skeleton } from './Skeleton';
import { colors, spacing, fontSize, radius } from '@/theme';
import { searchApi } from '@/services/api';
import type { User } from '@/types';

interface HashtagResult {
  id: string;
  name: string;
  postsCount: number;
}

interface AutocompleteProps {
  visible: boolean;
  type: 'hashtag' | 'mention';
  query: string;
  onSelect: (value: string) => void;
  onClose: () => void;
}

export function Autocomplete({ visible, type, query, onSelect, onClose }: AutocompleteProps) {
  const [results, setResults] = useState<User[] | HashtagResult[]>([]);
  const [loading, setLoading] = useState(false);
  const translateY = useSharedValue(-10);
  const opacity = useSharedValue(0);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
    opacity: opacity.value,
  }));

  useEffect(() => {
    if (visible) {
      translateY.value = withTiming(0, { duration: 200 });
      opacity.value = withTiming(1, { duration: 200 });
    } else {
      translateY.value = withTiming(-10, { duration: 150 });
      opacity.value = withTiming(0, { duration: 150 });
    }
  }, [visible, translateY, opacity]);

  const fetchResults = useCallback(async (searchQuery: string) => {
    if (!searchQuery.trim() || searchQuery.length < 1) {
      setResults([]);
      return;
    }

    setLoading(true);
    try {
      if (type === 'hashtag') {
        // Search for hashtags
        const data = await searchApi.search(searchQuery, 'hashtag');
        setResults(data.hashtags ?? []);
      } else {
        // Search for users/mentions
        const data = await searchApi.search(searchQuery, 'user');
        setResults(data.people ?? []);
      }
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, [type]);

  useEffect(() => {
    const timer = setTimeout(() => fetchResults(query), 300);
    return () => clearTimeout(timer);
  }, [query, fetchResults]);

  if (!visible) return null;

  const handleSelect = (item: User | HashtagResult) => {
    if (type === 'hashtag') {
      onSelect(`#${(item as HashtagResult).name}`);
    } else {
      onSelect(`@${(item as User).username}`);
    }
    onClose();
  };

  const renderItem = ({ item }: { item: User | HashtagResult }) => {
    if (type === 'hashtag') {
      const hashtag = item as HashtagResult;
      return (
        <TouchableOpacity style={styles.item} onPress={() => handleSelect(item)}>
          <View style={styles.hashtagIcon}>
            <Icon name="hash" size="md" color={colors.emerald} />
          </View>
          <View style={styles.itemContent}>
            <Text style={styles.itemTitle}>#{hashtag.name}</Text>
            <Text style={styles.itemSubtitle}>
              {hashtag.postsCount.toLocaleString()} posts
            </Text>
          </View>
        </TouchableOpacity>
      );
    }

    const user = item as User;
    return (
      <TouchableOpacity style={styles.item} onPress={() => handleSelect(item)}>
        <Avatar uri={user.avatarUrl} name={user.displayName} size="md" />
        <View style={styles.itemContent}>
          <Text style={styles.itemTitle}>{user.displayName}</Text>
          <Text style={styles.itemSubtitle}>@{user.username}</Text>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <Animated.View style={[styles.container, animatedStyle]}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>
          {type === 'hashtag' ? 'Hashtags' : 'People'}
        </Text>
        <TouchableOpacity onPress={onClose} hitSlop={8}>
          <Icon name="x" size="sm" color={colors.text.secondary} />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.loader}>
          <Skeleton.Rect width="80%" height={14} />
          <Skeleton.Rect width="60%" height={11} />
        </View>
      ) : results.length === 0 && query.length > 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>
            {type === 'hashtag'
              ? `No hashtags found for "${query}"`
              : `No users found for "${query}"`}
          </Text>
          {type === 'hashtag' && (
            <TouchableOpacity
              style={styles.createTag}
              onPress={() => {
                onSelect(`#${query.replace(/^#/, '')}`);
                onClose();
              }}
            >
              <Text style={styles.createTagText}>
                Create #{query.replace(/^#/, '')}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      ) : (
        <FlatList
            removeClippedSubviews={true}
          data={results}
          keyExtractor={(item) =>
            type === 'hashtag' ? (item as HashtagResult).id : (item as User).id
          }
          renderItem={renderItem}
          keyboardShouldPersistTaps="handled"
          style={styles.list}
        />
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.dark.bgElevated,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.dark.border,
    marginHorizontal: spacing.base,
    marginBottom: spacing.md,
    maxHeight: 280,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.dark.border,
  },
  headerTitle: {
    color: colors.text.primary,
    fontSize: fontSize.sm,
    fontWeight: '600',
  },
  list: {
    maxHeight: 220,
  },
  loader: {
    paddingVertical: spacing.xl,
    alignItems: 'center',
  },
  empty: {
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
  },
  emptyText: {
    color: colors.text.secondary,
    fontSize: fontSize.sm,
    textAlign: 'center',
  },
  createTag: {
    marginTop: spacing.sm,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.active.emerald10,
    borderRadius: radius.sm,
  },
  createTagText: {
    color: colors.emerald,
    fontSize: fontSize.sm,
    fontWeight: '600',
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.dark.border,
  },
  hashtagIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.full,
    backgroundColor: colors.active.emerald10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemContent: {
    marginLeft: spacing.sm,
    flex: 1,
  },
  itemTitle: {
    color: colors.text.primary,
    fontSize: fontSize.base,
    fontWeight: '600',
  },
  itemSubtitle: {
    color: colors.text.secondary,
    fontSize: fontSize.xs,
    marginTop: 2,
  },
});
