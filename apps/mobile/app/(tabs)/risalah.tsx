import { View, Text, FlatList, StyleSheet, TouchableOpacity } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { formatDistanceToNowStrict } from 'date-fns';
import { Avatar } from '@/components/ui/Avatar';
import { colors, spacing, fontSize, avatar as avatarSize } from '@/theme';
import { messagesApi } from '@/services/api';
import type { Conversation } from '@/types';

function conversationName(convo: Conversation, myId?: string): string {
  if (convo.isGroup) return convo.groupName ?? 'Group';
  const other = convo.members.find((m) => m.user.id !== myId);
  return other?.user.displayName ?? 'Chat';
}

function conversationAvatar(convo: Conversation, myId?: string): string | undefined {
  if (convo.isGroup) return convo.groupAvatarUrl;
  const other = convo.members.find((m) => m.user.id !== myId);
  return other?.user.avatarUrl;
}

export default function RisalahScreen() {
  const router = useRouter();
  const { data: conversations } = useQuery({
    queryKey: ['conversations'],
    queryFn: () => messagesApi.getConversations(),
  });

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.logo}>Risalah</Text>
        <TouchableOpacity hitSlop={8}>
          <Text style={styles.headerIcon}>✏️</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.tabs}>
        <Text style={[styles.tab, styles.tabActive]}>Chats</Text>
        <Text style={styles.tab}>Groups</Text>
        <Text style={styles.tab}>Channels</Text>
      </View>

      <FlatList
        data={(conversations as Conversation[]) || []}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => {
          const name = conversationName(item);
          const avi = conversationAvatar(item);
          const time = item.lastMessageAt
            ? formatDistanceToNowStrict(new Date(item.lastMessageAt), { addSuffix: false })
            : '';

          return (
            <TouchableOpacity
              style={styles.chatItem}
              activeOpacity={0.7}
              onPress={() => router.push(`/(screens)/conversation/${item.id}`)}
            >
              <View style={styles.avatarWrap}>
                <Avatar uri={avi} name={name} size="lg" />
                {item.unreadCount && item.unreadCount > 0 ? (
                  <View style={styles.unreadBadge}>
                    <Text style={styles.unreadText}>
                      {item.unreadCount > 99 ? '99+' : item.unreadCount}
                    </Text>
                  </View>
                ) : null}
              </View>
              <View style={styles.chatInfo}>
                <View style={styles.chatTopRow}>
                  <Text style={styles.chatName} numberOfLines={1}>{name}</Text>
                  <Text style={styles.chatTime}>{time}</Text>
                </View>
                <Text style={styles.chatPreview} numberOfLines={1}>
                  {item.lastMessageText || 'No messages yet'}
                </Text>
              </View>
              {item.isMuted && <Text style={styles.muted}>🔇</Text>}
            </TouchableOpacity>
          );
        }}
        ListEmptyComponent={() => (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>No conversations</Text>
            <Text style={styles.emptyText}>Message someone to get started</Text>
          </View>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.dark.bg },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: spacing.base, paddingVertical: spacing.sm },
  logo: { color: colors.text.primary, fontSize: fontSize.xl, fontWeight: '700' },
  headerIcon: { fontSize: 22 },
  tabs: { flexDirection: 'row', justifyContent: 'center', gap: spacing.lg, paddingVertical: spacing.sm, borderBottomWidth: 0.5, borderBottomColor: colors.dark.border },
  tab: { color: colors.text.secondary, fontSize: fontSize.base, fontWeight: '600', paddingVertical: spacing.xs, paddingHorizontal: spacing.sm },
  tabActive: { color: colors.emerald, borderBottomWidth: 2, borderBottomColor: colors.emerald },
  chatItem: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.base, paddingVertical: spacing.md, gap: spacing.md },
  avatarWrap: { position: 'relative' },
  unreadBadge: {
    position: 'absolute', bottom: -2, right: -2,
    backgroundColor: colors.emerald, borderRadius: 10,
    minWidth: 18, height: 18, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 4, borderWidth: 2, borderColor: colors.dark.bg,
  },
  unreadText: { color: '#fff', fontSize: 10, fontWeight: '700' },
  chatInfo: { flex: 1 },
  chatTopRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  chatName: { color: colors.text.primary, fontWeight: '600', fontSize: fontSize.base, flex: 1, marginRight: spacing.sm },
  chatTime: { color: colors.text.secondary, fontSize: fontSize.xs },
  chatPreview: { color: colors.text.secondary, fontSize: fontSize.sm },
  muted: { fontSize: 14 },
  empty: { alignItems: 'center', paddingTop: 80, gap: spacing.sm },
  emptyTitle: { color: colors.text.primary, fontSize: fontSize.lg, fontWeight: '600' },
  emptyText: { color: colors.text.secondary, fontSize: fontSize.base },
});
