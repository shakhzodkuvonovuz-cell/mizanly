import { View, Text, StyleSheet, TouchableOpacity, Pressable, ScrollView, Alert, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useUser } from '@clerk/clerk-expo';
import { Avatar } from '@/components/ui/Avatar';
import { Icon } from '@/components/ui/Icon';
import { VerifiedBadge } from '@/components/ui/VerifiedBadge';
import { colors, spacing, fontSize } from '@/theme';
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

export default function ConversationInfoScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user } = useUser();
  const queryClient = useQueryClient();

  const convoQuery = useQuery({
    queryKey: ['conversation', id],
    queryFn: () => messagesApi.getConversation(id),
  });

  const convo = convoQuery.data;
  const name = convo ? conversationName(convo, user?.id) : '…';
  const avatarUri = convo ? conversationAvatar(convo, user?.id) : undefined;

  const leaveGroupMutation = useMutation({
    mutationFn: () => messagesApi.leaveGroup(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      router.replace('/(tabs)/risalah');
    },
  });

  const handleLeave = () => {
    Alert.alert('Leave group?', 'You will no longer receive messages from this group.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Leave', style: 'destructive', onPress: () => leaveGroupMutation.mutate() },
    ]);
  };

  if (convoQuery.isLoading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <ActivityIndicator color={colors.emerald} style={styles.loader} />
      </SafeAreaView>
    );
  }

  if (!convo) return null;

  const isGroup = convo.isGroup;
  const otherMember = !isGroup ? convo.members.find((m) => m.user.id !== user?.id) : null;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <Icon name="arrow-left" size="md" color={colors.text.primary} />
        </Pressable>
        <Text style={styles.headerTitle}>Info</Text>
        <View style={{ width: 32 }} />
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 60 }}>
        {/* Avatar + name */}
        <View style={styles.hero}>
          <Avatar uri={avatarUri} name={name} size="2xl" />
          <Text style={styles.heroName}>{name}</Text>
          {isGroup && (
            <Text style={styles.heroSub}>{convo.members.length} members</Text>
          )}
          {!isGroup && otherMember && (
            <Text style={styles.heroSub}>@{otherMember.user.username}</Text>
          )}
        </View>

        {/* Quick actions */}
        {!isGroup && otherMember && (
          <View style={styles.quickActions}>
            <TouchableOpacity
              style={styles.quickAction}
              onPress={() => router.push(`/(screens)/profile/${otherMember.user.username}`)}
            >
              <Icon name="user" size={28} color={colors.text.primary} />
              <Text style={styles.quickActionLabel}>Profile</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Members list (group only) */}
        {isGroup && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Members</Text>
            {convo.members.map((m) => (
              <TouchableOpacity
                key={m.user.id}
                style={styles.memberRow}
                onPress={() => router.push(`/(screens)/profile/${m.user.username}`)}
                activeOpacity={0.7}
              >
                <Avatar uri={m.user.avatarUrl} name={m.user.displayName} size="md" />
                <View style={styles.memberInfo}>
                  <View style={styles.memberNameRow}>
                    <Text style={styles.memberName}>{m.user.displayName}</Text>
                    {m.user.isVerified && <VerifiedBadge size={13} />}
                  </View>
                  <Text style={styles.memberHandle}>@{m.user.username}</Text>
                </View>
                {m.user.id === user?.id && (
                  <Text style={styles.youLabel}>You</Text>
                )}
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Actions */}
        <View style={styles.section}>
          {isGroup && (
            <TouchableOpacity style={styles.actionRow} onPress={handleLeave}>
              {leaveGroupMutation.isPending
                ? <ActivityIndicator color="#FF453A" />
                : <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                    <Icon name="log-out" size="sm" color="#FF453A" />
                    <Text style={styles.actionDestructive}>Leave group</Text>
                  </View>
              }
            </TouchableOpacity>
          )}
          {!isGroup && (
            <TouchableOpacity
              style={styles.actionRow}
              onPress={() => Alert.alert('Block user', 'Are you sure?', [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Block', style: 'destructive', onPress: () => {} },
              ])}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                <Icon name="slash" size="sm" color="#FF453A" />
                <Text style={styles.actionDestructive}>Block user</Text>
              </View>
            </TouchableOpacity>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.dark.bg },
  loader: { flex: 1, marginTop: 80 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.base, paddingVertical: spacing.sm,
    borderBottomWidth: 0.5, borderBottomColor: colors.dark.border,
  },
  headerTitle: { color: colors.text.primary, fontSize: fontSize.base, fontWeight: '700' },

  hero: { alignItems: 'center', paddingVertical: spacing.xl, gap: spacing.sm },
  heroName: { color: colors.text.primary, fontSize: fontSize.xl, fontWeight: '700' },
  heroSub: { color: colors.text.secondary, fontSize: fontSize.sm },

  quickActions: { flexDirection: 'row', justifyContent: 'center', marginBottom: spacing.lg },
  quickAction: { alignItems: 'center', gap: spacing.xs, paddingHorizontal: spacing.xl },
  quickActionLabel: { color: colors.text.secondary, fontSize: fontSize.xs },

  section: {
    borderTopWidth: 0.5, borderTopColor: colors.dark.border,
    marginTop: spacing.lg,
  },
  sectionTitle: {
    color: colors.text.secondary, fontSize: fontSize.xs, fontWeight: '600',
    paddingHorizontal: spacing.base, paddingVertical: spacing.sm,
    textTransform: 'uppercase', letterSpacing: 0.5,
  },
  memberRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    paddingHorizontal: spacing.base, paddingVertical: spacing.md,
    borderBottomWidth: 0.5, borderBottomColor: colors.dark.border,
  },
  memberInfo: { flex: 1 },
  memberNameRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  memberName: { color: colors.text.primary, fontSize: fontSize.base, fontWeight: '600' },
  memberHandle: { color: colors.text.secondary, fontSize: fontSize.sm, marginTop: 1 },
  youLabel: { color: colors.text.tertiary, fontSize: fontSize.xs },

  actionRow: {
    paddingHorizontal: spacing.base, paddingVertical: spacing.md + 2,
    borderBottomWidth: 0.5, borderBottomColor: colors.dark.border,
  },
  actionDestructive: { color: '#FF453A', fontSize: fontSize.base },
});
