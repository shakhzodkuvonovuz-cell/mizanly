import { View, Text, FlatList, StyleSheet, TouchableOpacity } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, spacing, fontSize } from '@/theme';
import { messagesApi } from '@/services/api';

export default function RisalahScreen() {
  const { data: conversations } = useQuery({
    queryKey: ['conversations'],
    queryFn: () => messagesApi.getConversations(),
  });

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.logo}>Risalah</Text>
        <Text style={styles.headerIcon}>✏️</Text>
      </View>

      {/* Tabs */}
      <View style={styles.tabs}>
        <Text style={[styles.tab, styles.tabActive]}>Chats</Text>
        <Text style={styles.tab}>Groups</Text>
        <Text style={styles.tab}>Channels</Text>
      </View>

      <FlatList
        data={(conversations as any[]) || []}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.chatItem} activeOpacity={0.7}>
            <View style={styles.chatAvatar}>
              <View style={styles.onlineDot} />
            </View>
            <View style={styles.chatInfo}>
              <View style={styles.chatTopRow}>
                <Text style={styles.chatName}>{item.name || 'Chat'}</Text>
                <Text style={styles.chatTime}>{item.lastMessageAt || ''}</Text>
              </View>
              <Text style={styles.chatPreview} numberOfLines={1}>
                {item.messages?.[0]?.content || 'No messages yet'}
              </Text>
            </View>
          </TouchableOpacity>
        )}
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
  headerIcon: { fontSize: 20 },
  tabs: { flexDirection: 'row', justifyContent: 'center', gap: spacing.lg, paddingVertical: spacing.sm, borderBottomWidth: 0.5, borderBottomColor: colors.dark.border },
  tab: { color: colors.text.secondary, fontSize: fontSize.base, fontWeight: '600', paddingVertical: spacing.xs, paddingHorizontal: spacing.sm },
  tabActive: { color: colors.emerald, borderBottomWidth: 2, borderBottomColor: colors.emerald },
  chatItem: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.base, paddingVertical: spacing.md, gap: spacing.md },
  chatAvatar: { width: 52, height: 52, borderRadius: 26, backgroundColor: colors.dark.surface },
  onlineDot: { position: 'absolute', bottom: 2, right: 2, width: 12, height: 12, borderRadius: 6, backgroundColor: colors.online, borderWidth: 2, borderColor: colors.dark.bg },
  chatInfo: { flex: 1 },
  chatTopRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  chatName: { color: colors.text.primary, fontWeight: '600', fontSize: fontSize.base },
  chatTime: { color: colors.text.secondary, fontSize: fontSize.xs },
  chatPreview: { color: colors.text.secondary, fontSize: fontSize.sm },
  empty: { alignItems: 'center', paddingTop: 80 },
  emptyTitle: { color: colors.text.primary, fontSize: fontSize.lg, fontWeight: '600', marginBottom: spacing.sm },
  emptyText: { color: colors.text.secondary, fontSize: fontSize.base },
});
