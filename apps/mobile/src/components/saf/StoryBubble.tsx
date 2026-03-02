import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Avatar } from '@/components/ui/Avatar';
import { colors, spacing, fontSize } from '@/theme';
import type { StoryGroup } from '@/types';

interface Props {
  group: StoryGroup;
  onPress: () => void;
  isOwn?: boolean;
}

export function StoryBubble({ group, onPress, isOwn }: Props) {
  const { user, hasUnread } = group;

  return (
    <TouchableOpacity style={styles.wrap} onPress={onPress} activeOpacity={0.8}>
      <Avatar
        uri={user.avatarUrl}
        name={user.displayName}
        size="lg"
        showRing={hasUnread}
        ringColor={colors.emerald}
      />
      {isOwn && (
        <View style={styles.addBtn}>
          <Text style={styles.addBtnText}>+</Text>
        </View>
      )}
      <Text style={styles.name} numberOfLines={1}>
        {isOwn ? 'Your Story' : user.username}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', gap: spacing.xs, width: 68 },
  addBtn: {
    position: 'absolute',
    bottom: 18,
    right: 0,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.emerald,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.dark.bg,
  },
  addBtnText: { color: '#fff', fontSize: 14, fontWeight: '700', lineHeight: 18, marginTop: -1 },
  name: { color: colors.text.secondary, fontSize: fontSize.xs, textAlign: 'center' },
});
