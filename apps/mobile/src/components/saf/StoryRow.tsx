import { FlatList, View, StyleSheet } from 'react-native';
import { useUser } from '@clerk/clerk-expo';
import { StoryBubble } from './StoryBubble';
import { colors, spacing } from '@/theme';
import type { StoryGroup } from '@/types';

interface Props {
  groups: StoryGroup[];
  onPressGroup: (group: StoryGroup, index: number) => void;
  onPressOwn: () => void;
}

export function StoryRow({ groups, onPressGroup, onPressOwn }: Props) {
  const { user } = useUser();

  // Build own story slot — use API data if available so ring shows when they have stories
  const apiOwnGroup = groups.find((g) => g.user.id === user?.id);
  const ownGroup: StoryGroup = {
    user: {
      id: user?.id ?? '',
      username: user?.username ?? '',
      displayName: user?.fullName ?? '',
      avatarUrl: user?.imageUrl,
      isVerified: false,
      isPrivate: false,
      createdAt: '',
    },
    stories: apiOwnGroup?.stories ?? [],
    hasUnread: false, // Own story never shows unread ring
  };

  const items = [ownGroup, ...groups.filter((g) => g.user.id !== user?.id)];

  return (
    <FlatList
            removeClippedSubviews={true}
      data={items}
      keyExtractor={(item) => item.user.id}
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.content}
      renderItem={({ item, index }) => (
        <StoryBubble
          group={item}
          isOwn={index === 0}
          onPress={() => index === 0 ? onPressOwn() : onPressGroup(item, index - 1)}
        />
      )}
      style={styles.row}
    />
  );
}

const styles = StyleSheet.create({
  row: { borderBottomWidth: 0.5, borderBottomColor: colors.dark.border },
  content: { paddingHorizontal: spacing.base, paddingVertical: spacing.md, gap: spacing.base },
});
