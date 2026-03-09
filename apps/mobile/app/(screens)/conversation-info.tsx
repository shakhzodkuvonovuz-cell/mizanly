import { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Pressable, ScrollView, Alert,
  ActivityIndicator, TextInput, FlatList, RefreshControl,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useUser } from '@clerk/clerk-expo';
import * as ImagePicker from 'expo-image-picker';
import { Avatar } from '@/components/ui/Avatar';
import { Icon } from '@/components/ui/Icon';
import { Skeleton } from '@/components/ui/Skeleton';
import { CharCountRing } from '@/components/ui/CharCountRing';
import { VerifiedBadge } from '@/components/ui/VerifiedBadge';
import { colors, spacing, fontSize, radius } from '@/theme';
import { messagesApi, blocksApi, searchApi, uploadApi } from '@/services/api';
import { BottomSheet, BottomSheetItem } from '@/components/ui/BottomSheet';
import { useHaptic } from '@/hooks/useHaptic';
import type { Conversation, User } from '@/types';

const MAX_GROUP_NAME = 50;

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
  const haptic = useHaptic();

  // Admin state
  const [editNameSheetOpen, setEditNameSheetOpen] = useState(false);
  const [addMembersSheetOpen, setAddMembersSheetOpen] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [newAvatarUri, setNewAvatarUri] = useState<string | undefined>();
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');
  const [selectedNewMembers, setSelectedNewMembers] = useState<User[]>([]);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounce search query
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebouncedSearchQuery(searchQuery), 350);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [searchQuery]);

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

  const updateGroupMutation = useMutation({
    mutationFn: (data: { groupName?: string; groupAvatarUrl?: string }) =>
      messagesApi.updateGroup(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conversation', id] });
    },
  });

  const addMembersMutation = useMutation({
    mutationFn: (memberIds: string[]) => messagesApi.addMembers(id, memberIds),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conversation', id] });
    },
  });

  const removeMemberMutation = useMutation({
    mutationFn: (targetUserId: string) => messagesApi.removeMember(id, targetUserId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conversation', id] });
    },
    onError: (error) => {
      Alert.alert('Error', 'Failed to remove member. Please try again.');
    },
  });

  const pickAvatar = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (!result.canceled) {
      setNewAvatarUri(result.assets[0].uri);
      try {
        // Upload and update group avatar
        const presign = await uploadApi.getPresignUrl('image/jpeg', 'group-avatars');
        const uploadRes = await fetch(presign.uploadUrl, {
          method: 'PUT',
          body: await (await fetch(result.assets[0].uri)).blob(),
          headers: { 'Content-Type': 'image/jpeg' },
        });
        if (!uploadRes.ok) throw new Error('Avatar upload failed');
        updateGroupMutation.mutate({ groupAvatarUrl: presign.publicUrl });
      } catch (err) {
        Alert.alert('Error', 'Failed to upload avatar. Please try again.');
      }
    }
  };

  const handleUpdateGroupName = () => {
    if (!newGroupName.trim()) return;
    updateGroupMutation.mutate({ groupName: newGroupName.trim() });
    setEditNameSheetOpen(false);
    setNewGroupName('');
  };

  const handleAddSelectedMembers = () => {
    const memberIds = selectedNewMembers.map(m => m.id);
    if (memberIds.length === 0) return;
    addMembersMutation.mutate(memberIds);
    setAddMembersSheetOpen(false);
    setSelectedNewMembers([]);
    setSearchQuery('');
    setDebouncedSearchQuery('');
  };

  const [memberActionSheetOpen, setMemberActionSheetOpen] = useState(false);
  const [selectedMember, setSelectedMember] = useState<{ id: string; username: string } | null>(null);

  const handleRemoveMember = (targetUserId: string) => {
    Alert.alert('Remove member?', 'This member will be removed from the group.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => removeMemberMutation.mutate(targetUserId) },
    ]);
  };

  const handleMemberLongPress = (memberId: string, username: string) => {
    haptic.light();
    setSelectedMember({ id: memberId, username });
    setMemberActionSheetOpen(true);
  };

  const handleLeave = () => {
    Alert.alert('Leave group?', 'You will no longer receive messages from this group.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Leave', style: 'destructive', onPress: () => leaveGroupMutation.mutate() },
    ]);
  };

  if (convoQuery.isLoading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <Skeleton.ProfileHeader />
      </SafeAreaView>
    );
  }

  if (!convo) return null;

  const isGroup = convo.isGroup;
  const isCreator = convo.createdById === user?.id;
  const otherMember = !isGroup ? convo.members.find((m) => m.user.id !== user?.id) : null;

  // Member search for adding members
  const memberSearchQuery = useQuery({
    queryKey: ['group-member-search', debouncedSearchQuery],
    queryFn: () => searchApi.search(debouncedSearchQuery),
    enabled: debouncedSearchQuery.trim().length >= 2 && addMembersSheetOpen,
  });

  const searchResults: User[] = (memberSearchQuery.data?.people ?? []).filter(
    p => p.id !== user?.id &&
         !convo.members.find(m => m.user.id === p.id) &&
         !selectedNewMembers.find(m => m.id === p.id)
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={8} accessibilityLabel="Go back">
          <Icon name="arrow-left" size="md" color={colors.text.primary} />
        </Pressable>
        <Text style={styles.headerTitle}>Info</Text>
        <View style={{ width: 32 }} />
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 60 }}>
        {/* Avatar + name */}
        <View style={styles.hero}>
          <TouchableOpacity onPress={isGroup && isCreator ? pickAvatar : undefined} style={{ position: 'relative' }}>
            <Avatar uri={avatarUri} name={name} size="2xl" />
            {isGroup && isCreator && (
              <View style={styles.avatarOverlay}>
                <Icon name="edit" size={16} color={colors.text.primary} />
              </View>
            )}
          </TouchableOpacity>
          <View style={styles.nameRow}>
            <Text style={styles.heroName}>{name}</Text>
            {isGroup && isCreator && (
              <TouchableOpacity onPress={() => setEditNameSheetOpen(true)} style={styles.editNameBtn} accessibilityLabel="Edit group name">
                <Icon name="edit" size={16} color={colors.text.secondary} />
              </TouchableOpacity>
            )}
          </View>
          {isGroup && (
            <Text style={styles.heroSub}>{convo.members.length} members</Text>
          )}
          {!isGroup && otherMember && (
            <Text style={styles.heroSub}>@{otherMember.user.username}</Text>
          )}
          {isGroup && isCreator && (
            <View style={styles.adminActions}>
              <TouchableOpacity style={styles.adminAction} onPress={() => setAddMembersSheetOpen(true)}>
                <Icon name="plus" size="sm" color={colors.emerald} />
                <Text style={styles.adminActionText}>Add members</Text>
              </TouchableOpacity>
            </View>
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
                onLongPress={() => handleMemberLongPress(m.user.id, m.user.username)}
                delayLongPress={500}
                activeOpacity={0.7}
                accessibilityLabel={`${m.user.displayName}, @${m.user.username}`}
                accessibilityHint="Press to view profile, long press to view member actions"
                accessibilityRole="button"
              >
                <Avatar uri={m.user.avatarUrl} name={m.user.displayName} size="md" />
                <View style={styles.memberInfo}>
                  <View style={styles.memberNameRow}>
                    <Text style={styles.memberName}>{m.user.displayName}</Text>
                    {m.user.isVerified && <VerifiedBadge size={13} />}
                    {m.user.id === convo.createdById && (
                      <View style={styles.creatorBadge}>
                        <Text style={styles.creatorBadgeText}>Creator</Text>
                      </View>
                    )}
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
          {isGroup && !isCreator && (
            <TouchableOpacity style={styles.actionRow} onPress={handleLeave}>
              {leaveGroupMutation.isPending
                ? <ActivityIndicator color={colors.error} />
                : <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                    <Icon name="log-out" size="sm" color={colors.error} />
                    <Text style={styles.actionDestructive}>Leave group</Text>
                  </View>
              }
            </TouchableOpacity>
          )}
          {!isGroup && (
            <TouchableOpacity
              style={styles.actionRow}
              onPress={() => {
                const other = convo?.members.find((m) => m.user.id !== user?.id);
                if (!other) return;
                Alert.alert('Block user', 'Are you sure?', [
                  { text: 'Cancel', style: 'cancel' },
                  {
                    text: 'Block', style: 'destructive', onPress: () => {
                      blocksApi.block(other.user.id)
                        .then(() => router.replace('/(tabs)/risalah'))
                        .catch(() => Alert.alert('Error', 'Could not block user.'));
                    },
                  },
                ]);
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                <Icon name="slash" size="sm" color={colors.error} />
                <Text style={styles.actionDestructive}>Block user</Text>
              </View>
            </TouchableOpacity>
          )}
        </View>
      </ScrollView>

      {/* Edit group name BottomSheet */}
      <BottomSheet
        visible={editNameSheetOpen}
        onClose={() => {
          setEditNameSheetOpen(false);
          setNewGroupName('');
        }}
      >
        <View style={styles.sheetContent}>
          <Text style={styles.sheetTitle}>Edit group name</Text>
          <View style={styles.nameInputRow}>
            <TextInput
              style={styles.nameInput}
              value={newGroupName}
              onChangeText={setNewGroupName}
              placeholder="Enter new group name"
              placeholderTextColor={colors.text.tertiary}
              autoFocus
              maxLength={MAX_GROUP_NAME}
            />
            <CharCountRing
              current={newGroupName.length}
              max={MAX_GROUP_NAME}
              size={28}
            />
          </View>
          <TouchableOpacity
            style={[styles.sheetButton, !newGroupName.trim() && styles.sheetButtonDisabled]}
            onPress={handleUpdateGroupName}
            disabled={!newGroupName.trim() || updateGroupMutation.isPending}
          >
            {updateGroupMutation.isPending ? (
              <ActivityIndicator color={colors.text.primary} />
            ) : (
              <Text style={styles.sheetButtonText}>Save</Text>
            )}
          </TouchableOpacity>
        </View>
      </BottomSheet>

      {/* Add members BottomSheet */}
      <BottomSheet
        visible={addMembersSheetOpen}
        onClose={() => {
          setAddMembersSheetOpen(false);
          setSelectedNewMembers([]);
          setSearchQuery('');
          setDebouncedSearchQuery('');
        }}
        snapPoint={0.85}
      >
        <View style={styles.sheetContent}>
          <Text style={styles.sheetTitle}>Add members</Text>

          {/* Selected members chips */}
          {selectedNewMembers.length > 0 && (
            <View style={styles.chipsContainer}>
              <Text style={styles.chipsLabel}>Selected ({selectedNewMembers.length})</Text>
              <View style={styles.chips}>
                {selectedNewMembers.map(member => (
                  <View key={member.id} style={styles.chip}>
                    <Avatar uri={member.avatarUrl} name={member.displayName} size="sm" />
                    <Text style={styles.chipText} numberOfLines={1}>
                      {member.displayName}
                    </Text>
                    <Pressable
                      onPress={() => setSelectedNewMembers(prev => prev.filter(m => m.id !== member.id))}
                      hitSlop={4}
                      style={styles.chipRemove}
                      accessibilityLabel="Remove member"
                    >
                      <Icon name="x" size={12} color={colors.text.secondary} />
                    </Pressable>
                  </View>
                ))}
              </View>
            </View>
          )}

          {/* Search input */}
          <View style={styles.searchWrap}>
            <Icon name="search" size="sm" color={colors.text.secondary} />
            <TextInput
              style={styles.searchInput}
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="Search people…"
              placeholderTextColor={colors.text.tertiary}
              autoCapitalize="none"
              autoCorrect={false}
            />
            {searchQuery.length > 0 && (
              <Pressable onPress={() => setSearchQuery('')} hitSlop={8} accessibilityLabel="Clear search">
                <Icon name="x" size="xs" color={colors.text.secondary} />
              </Pressable>
            )}
          </View>

          {/* Search results */}
          {memberSearchQuery.isLoading ? (
            <ActivityIndicator color={colors.emerald} style={styles.loader} />
          ) : (
            <FlatList
              data={searchResults}
              style={styles.resultsList}
              keyExtractor={(item) => item.id}
              refreshControl={<RefreshControl refreshing={memberSearchQuery.isFetching} onRefresh={() => memberSearchQuery.refetch()} tintColor={colors.emerald} />}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.userRow}
                  onPress={() => setSelectedNewMembers(prev => [...prev, item])}
                  disabled={addMembersMutation.isPending}
                  activeOpacity={0.7}
                >
                  <Avatar uri={item.avatarUrl} name={item.displayName} size="md" />
                  <View style={styles.userInfo}>
                    <View style={styles.nameRow}>
                      <Text style={styles.name}>{item.displayName}</Text>
                      {item.isVerified && <VerifiedBadge size={13} />}
                    </View>
                    <Text style={styles.handle}>@{item.username}</Text>
                  </View>
                  <Icon name="plus" size="sm" color={colors.emerald} />
                </TouchableOpacity>
              )}
              ListEmptyComponent={() =>
                debouncedSearchQuery.trim().length >= 2 ? (
                  <View style={styles.empty}>
                    <Text style={styles.emptyText}>No users found for "{debouncedSearchQuery}"</Text>
                  </View>
                ) : (
                  <View style={styles.hint}>
                    <Text style={styles.hintText}>Search by name or username</Text>
                  </View>
                )
              }
            />
          )}

          {/* Add button */}
          <TouchableOpacity
            style={[styles.sheetButton, selectedNewMembers.length === 0 && styles.sheetButtonDisabled]}
            onPress={handleAddSelectedMembers}
            disabled={selectedNewMembers.length === 0 || addMembersMutation.isPending}
          >
            {addMembersMutation.isPending ? (
              <ActivityIndicator color={colors.text.primary} />
            ) : (
              <Text style={styles.sheetButtonText}>
                Add {selectedNewMembers.length > 0 ? `(${selectedNewMembers.length})` : ''}
              </Text>
            )}
          </TouchableOpacity>
        </View>
      </BottomSheet>

      {/* Member action BottomSheet */}
      <BottomSheet
        visible={memberActionSheetOpen}
        onClose={() => {
          setMemberActionSheetOpen(false);
          setSelectedMember(null);
        }}
      >
        {selectedMember && (
          <>
            {isCreator && selectedMember.id !== user?.id && (
              <BottomSheetItem
                label="Remove from group"
                icon={<Icon name="x" size="sm" color={colors.error} />}
                onPress={() => {
                  setMemberActionSheetOpen(false);
                  handleRemoveMember(selectedMember.id);
                }}
                destructive
                disabled={removeMemberMutation.isPending}
              />
            )}
            <BottomSheetItem
              label="View profile"
              icon={<Icon name="user" size="sm" color={colors.text.primary} />}
              onPress={() => {
                setMemberActionSheetOpen(false);
                router.push(`/(screens)/profile/${selectedMember.username}`);
              }}
            />
          </>
        )}
      </BottomSheet>
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
  memberNameRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  memberName: { color: colors.text.primary, fontSize: fontSize.base, fontWeight: '600' },
  memberHandle: { color: colors.text.secondary, fontSize: fontSize.sm, marginTop: 1 },
  youLabel: { color: colors.text.tertiary, fontSize: fontSize.xs },
  creatorBadge: {
    backgroundColor: colors.active.gold10, // gold with 10% opacity
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
    borderRadius: radius.sm,
  },
  creatorBadgeText: {
    color: colors.gold,
    fontSize: fontSize.xs,
    fontWeight: '600',
  },

  actionRow: {
    paddingHorizontal: spacing.base, paddingVertical: spacing.md + 2,
    borderBottomWidth: 0.5, borderBottomColor: colors.dark.border,
  },
  actionDestructive: { color: colors.error, fontSize: fontSize.base },

  // Admin styles
  avatarOverlay: {
    position: 'absolute', bottom: 0, right: 0,
    width: 32, height: 32, borderRadius: radius.full,
    backgroundColor: colors.emerald, alignItems: 'center', justifyContent: 'center',
  },
  nameRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.xs,
  },
  editNameBtn: {
    padding: spacing.xs,
  },
  adminActions: {
    flexDirection: 'row', justifyContent: 'center', gap: spacing.lg,
    marginTop: spacing.sm,
  },
  adminAction: {
    alignItems: 'center', gap: spacing.xs,
  },
  adminActionText: {
    color: colors.emerald, fontSize: fontSize.sm, fontWeight: '500',
  },

  // BottomSheet styles
  sheetContent: {
    paddingHorizontal: spacing.base, paddingTop: spacing.base, paddingBottom: spacing.lg,
  },
  sheetTitle: {
    color: colors.text.primary, fontSize: fontSize.lg, fontWeight: '700',
    marginBottom: spacing.lg,
  },
  nameInputRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  nameInput: {
    flex: 1, color: colors.text.primary, fontSize: fontSize.lg, fontWeight: '600',
    paddingVertical: spacing.xs,
  },
  sheetButton: {
    backgroundColor: colors.emerald, borderRadius: radius.full,
    paddingVertical: spacing.md, alignItems: 'center',
    marginTop: spacing.lg,
  },
  sheetButtonDisabled: {
    backgroundColor: colors.dark.border,
  },
  sheetButtonText: {
    color: colors.text.primary, fontSize: fontSize.base, fontWeight: '600',
  },

  // Chips styles
  chipsContainer: {
    marginBottom: spacing.lg,
  },
  chipsLabel: {
    color: colors.text.secondary, fontSize: fontSize.sm, fontWeight: '600',
    marginBottom: spacing.sm,
  },
  chips: {
    flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm,
  },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.xs,
    backgroundColor: colors.dark.bgCard, paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs, borderRadius: radius.full,
    maxWidth: 160,
  },
  chipText: {
    color: colors.text.primary, fontSize: fontSize.xs, fontWeight: '500',
    flexShrink: 1,
  },
  chipRemove: { marginLeft: 'auto' },

  // Search styles
  searchWrap: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    backgroundColor: colors.dark.bgCard, borderRadius: radius.full,
    marginBottom: spacing.md,
  },
  searchInput: {
    flex: 1, color: colors.text.primary, fontSize: fontSize.base,
  },
  loader: {
    marginVertical: spacing.xl,
  },
  resultsList: {
    maxHeight: 300,
  },
  userRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    paddingHorizontal: spacing.sm, paddingVertical: spacing.md,
    borderBottomWidth: 0.5, borderBottomColor: colors.dark.border,
  },
  userInfo: {
    flex: 1,
  },
  name: {
    color: colors.text.primary, fontSize: fontSize.base, fontWeight: '600',
  },
  handle: {
    color: colors.text.secondary, fontSize: fontSize.sm, marginTop: 1,
  },
  empty: {
    alignItems: 'center', paddingTop: 40,
  },
  emptyText: {
    color: colors.text.secondary, fontSize: fontSize.base,
  },
  hint: {
    alignItems: 'center', paddingTop: 40,
  },
  hintText: {
    color: colors.text.tertiary, fontSize: fontSize.base,
  },
});
