import { useEffect, useState } from 'react';
import { View, Text, FlatList, StyleSheet, TouchableOpacity } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useUser } from '@clerk/clerk-expo';
import { formatDistanceToNowStrict } from 'date-fns';
import { Avatar } from '@/components/ui/Avatar';
import { colors, spacing, fontSize } from '@/theme';
import { useStore } from '@/store';
import { messagesApi } from '@/services/api';
import type { Conversation } from '@/types';

type TabKey = 'chats' | 'groups';

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
  const { user } = useUser();
  const setUnreadMessages = useStore((s) => s.setUnreadMessages);
  const [activeTab, setActiveTab] = useState<TabKey>('chats');

  const { data: conversations } = useQuery({
    queryKey: ['conversations'],
    queryFn: () => messagesApi.getConversations(),
  });

  const all: Conversation[] = (conversations as Conversation[]) ?? [];

  // Keep the tab badge in sync with total unread across all conversations
  useEffect(() => {
    const total = all.reduce((sum, c) => sum + (c.unreadCount ?? 0), 0);
    setUnreadMessages(total);
  }, [all, setUnreadMessages]);
  const filtered = all.filter((c) =>
    activeTab === 'groups' ? c.isGroup : !c.isGroup,
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.logo}>Risalah</Text>
        <TouchableOpacity hitSlop={8} onPress={() => router.push('/(screens)/new-conversation')}>
          <Text style={styles.headerIcon}>✏️</Text>
        </TouchableOpacity>
      </View>

      {/* Tabs */}
      <View style={styles.tabs}>
        {(['chats', 'groups'] as TabKey[]).map((t) => (
          <TouchableOpacity
            key={t}
            style={styles.tabBtn}
            onPress={() => setActiveTab(t)}
            activeOpacity={0.7}
          >
            <Text style={[styles.tab, activeTab === t && styles.tabActive]}>
              {t === 'chats' ? 'Chats' : 'Groups'}
            </Text>
            {activeTab === t && <View style={styles.tabIndicator} />}
          </TouchableOpacity>
        ))}
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => {
          const name = conversationName(item, user?.id);
          const avi = conversationAvatar(item, user?.id);
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
            <Text style={styles.emptyTitle}>
              {activeTab === 'groups' ? 'No groups yet' : 'No conversations'}
            </Text>
            <Text style={styles.emptyText}>
              {activeTab === 'groups'
                ? 'Create a group to chat with multiple people'
                : 'Message someone to get started'}
            </Text>
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
  tabs: { flexDirection: 'row', borderBottomWidth: 0.5, borderBottomColor: colors.dark.border },
  tabBtn: { flex: 1, alignItems: 'center', paddingTop: spacing.sm, paddingBottom: 0 },
  tab: { color: colors.text.secondary, fontSize: fontSize.base, fontWeight: '600', paddingBottom: spacing.sm },
  tabActive: { color: colors.text.primary },
  tabIndicator: { height: 2, width: '60%', backgroundColor: colors.emerald, borderRadius: 1, marginBottom: -0.5 },
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
  empty: { alignItems: 'center', paddingTop: 80, gap: spacing.sm, paddingHorizontal: spacing.xl },
  emptyTitle: { color: colors.text.primary, fontSize: fontSize.lg, fontWeight: '600' },
  emptyText: { color: colors.text.secondary, fontSize: fontSize.base, textAlign: 'center' },
});
