import { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Pressable,
  TextInput, FlatList, ActivityIndicator, Alert, ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery, useMutation } from '@tanstack/react-query';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useUser } from '@clerk/clerk-expo';
import * as ImagePicker from 'expo-image-picker';
import { Avatar } from '@/components/ui/Avatar';
import { Icon } from '@/components/ui/Icon';
import { VerifiedBadge } from '@/components/ui/VerifiedBadge';
import { CharCountRing } from '@/components/ui/CharCountRing';
import { colors, spacing, fontSize, radius } from '@/theme';
import { searchApi, messagesApi, uploadApi } from '@/services/api';
import type { User } from '@/types';

const MAX_GROUP_NAME = 50;
const MIN_MEMBERS = 2;

export default function CreateGroupScreen() {
  const router = useRouter();
  const { user } = useUser();
  const [groupName, setGroupName] = useState('');
  const [avatarUri, setAvatarUri] = useState<string | undefined>();
  const [selectedMembers, setSelectedMembers] = useState<User[]>([]);
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, []);

  const handleQueryChange = (text: string) => {
    setQuery(text);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebouncedQuery(text), 350);
  };

  const searchQuery = useQuery({
    queryKey: ['group-search', debouncedQuery],
    queryFn: () => searchApi.search(debouncedQuery),
    enabled: debouncedQuery.trim().length >= 2,
  });

  const people: User[] = (searchQuery.data?.people ?? []).filter(
    p => p.id !== user?.id && !selectedMembers.find(m => m.id === p.id)
  );

  const pickAvatar = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (!result.canceled) {
      setAvatarUri(result.assets[0].uri);
    }
  };

  const createMutation = useMutation({
    mutationFn: async () => {
      // Upload avatar if selected
      let groupAvatarUrl: string | undefined;
      if (avatarUri) {
        const presign = await uploadApi.getPresignUrl('image/jpeg', 'group-avatars');
        const uploadRes = await fetch(presign.uploadUrl, {
          method: 'PUT',
          body: await (await fetch(avatarUri)).blob(),
          headers: { 'Content-Type': 'image/jpeg' },
        });
        if (!uploadRes.ok) throw new Error('Avatar upload failed');
        groupAvatarUrl = presign.publicUrl;
      }

      const memberIds = selectedMembers.map(m => m.id);
      if (memberIds.length < MIN_MEMBERS) {
        throw new Error(`Please add at least ${MIN_MEMBERS} members.`);
      }

      return messagesApi.createGroup(groupName.trim(), memberIds, groupAvatarUrl);
    },
    onSuccess: (convo) => {
      router.replace(`/(screens)/conversation/${convo.id}`);
    },
    onError: (err: Error) => Alert.alert('Error', err.message || 'Could not create group'),
  });

  const handleAddMember = (user: User) => {
    setSelectedMembers(prev => [...prev, user]);
    setQuery('');
    setDebouncedQuery('');
  };

  const handleRemoveMember = (userId: string) => {
    setSelectedMembers(prev => prev.filter(m => m.id !== userId));
  };

  const canCreate = groupName.trim().length > 0 && selectedMembers.length >= MIN_MEMBERS;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={8} style={styles.backBtn}>
          <Icon name="arrow-left" size="md" color={colors.text.primary} />
        </Pressable>
        <Text style={styles.headerTitle}>New Group</Text>
        <TouchableOpacity
          onPress={() => createMutation.mutate()}
          disabled={!canCreate || createMutation.isPending}
          style={styles.createBtn}
        >
          {createMutation.isPending ? (
            <ActivityIndicator color={colors.emerald} size="small" />
          ) : (
            <Text style={[styles.createBtnText, !canCreate && styles.createBtnDisabled]}>
              Create
            </Text>
          )}
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* Group name */}
        <View style={styles.section}>
          <Text style={styles.label}>Group name</Text>
          <View style={styles.nameRow}>
            <TextInput
              style={styles.nameInput}
              value={groupName}
              onChangeText={setGroupName}
              placeholder="Enter group name"
              placeholderTextColor={colors.text.tertiary}
              autoFocus
              maxLength={MAX_GROUP_NAME}
            />
            <CharCountRing
              current={groupName.length}
              max={MAX_GROUP_NAME}
              size={28}
            />
          </View>
        </View>

        {/* Avatar picker */}
        <View style={styles.section}>
          <Text style={styles.label}>Group avatar (optional)</Text>
          <TouchableOpacity style={styles.avatarPicker} onPress={pickAvatar}>
            {avatarUri ? (
              <Avatar uri={avatarUri} name={groupName || 'Group'} size="2xl" />
            ) : (
              <View style={styles.avatarPlaceholder}>
                <Icon name="camera" size={32} color={colors.text.secondary} />
              </View>
            )}
            <View style={styles.avatarOverlay}>
              <Icon name="edit" size={16} color=colors.text.primary />
            </View>
          </TouchableOpacity>
        </View>

        {/* Selected members chips */}
        {selectedMembers.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.label}>
              Members ({selectedMembers.length})
            </Text>
            <View style={styles.chips}>
              {selectedMembers.map(member => (
                <View key={member.id} style={styles.chip}>
                  <Avatar uri={member.avatarUrl} name={member.displayName} size="sm" />
                  <Text style={styles.chipText} numberOfLines={1}>
                    {member.displayName}
                  </Text>
                  <Pressable
                    onPress={() => handleRemoveMember(member.id)}
                    hitSlop={4}
                    style={styles.chipRemove}
                  >
                    <Icon name="x" size={12} color={colors.text.secondary} />
                  </Pressable>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Member search */}
        <View style={styles.section}>
          <Text style={styles.label}>Add members</Text>
          <View style={styles.searchWrap}>
            <Icon name="search" size="sm" color={colors.text.secondary} />
            <TextInput
              style={styles.searchInput}
              value={query}
              onChangeText={handleQueryChange}
              placeholder="Search people…"
              placeholderTextColor={colors.text.tertiary}
              autoCapitalize="none"
              autoCorrect={false}
            />
            {query.length > 0 && (
              <Pressable onPress={() => { setQuery(''); setDebouncedQuery(''); }} hitSlop={8}>
                <Icon name="x" size="xs" color={colors.text.secondary} />
              </Pressable>
            )}
          </View>

          {searchQuery.isLoading ? (
            <ActivityIndicator color={colors.emerald} style={styles.loader} />
          ) : (
            <FlatList
              data={people}
              scrollEnabled={false}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.userRow}
                  onPress={() => handleAddMember(item)}
                  disabled={createMutation.isPending}
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
                debouncedQuery.trim().length >= 2 ? (
                  <View style={styles.empty}>
                    <Text style={styles.emptyText}>No users found for "{debouncedQuery}"</Text>
                  </View>
                ) : (
                  <View style={styles.hint}>
                    <Text style={styles.hintText}>Search by name or username</Text>
                  </View>
                )
              }
            />
          )}
        </View>

        {/* Minimum requirement note */}
        <Text style={styles.note}>
          At least {MIN_MEMBERS} members (excluding yourself) are required.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.dark.bg },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.base, paddingVertical: spacing.sm,
    borderBottomWidth: 0.5, borderBottomColor: colors.dark.border,
  },
  backBtn: { width: 36 },
  headerTitle: { color: colors.text.primary, fontSize: fontSize.base, fontWeight: '700' },
  createBtn: { width: 64, alignItems: 'center', paddingVertical: 4 },
  createBtnText: { color: colors.emerald, fontSize: fontSize.base, fontWeight: '600' },
  createBtnDisabled: { color: colors.text.tertiary },

  content: { paddingVertical: spacing.lg, paddingHorizontal: spacing.base },

  section: { marginBottom: spacing.xl },
  label: {
    color: colors.text.secondary, fontSize: fontSize.sm, fontWeight: '600',
    marginBottom: spacing.sm,
  },

  nameRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  nameInput: {
    flex: 1, color: colors.text.primary, fontSize: fontSize.lg, fontWeight: '600',
    paddingVertical: spacing.xs,
  },

  avatarPicker: { alignSelf: 'center', position: 'relative', marginTop: spacing.sm },
  avatarPlaceholder: {
    width: 96, height: 96, borderRadius: radius.full,
    backgroundColor: colors.dark.bgCard, alignItems: 'center', justifyContent: 'center',
  },
  avatarOverlay: {
    position: 'absolute', bottom: 0, right: 0,
    width: 32, height: 32, borderRadius: radius.full,
    backgroundColor: colors.emerald, alignItems: 'center', justifyContent: 'center',
  },

  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
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

  searchWrap: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    backgroundColor: colors.dark.bgCard, borderRadius: radius.full,
    marginBottom: spacing.md,
  },
  searchInput: { flex: 1, color: colors.text.primary, fontSize: fontSize.base },

  loader: { marginVertical: spacing.xl },
  userRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    paddingHorizontal: spacing.sm, paddingVertical: spacing.md,
    borderBottomWidth: 0.5, borderBottomColor: colors.dark.border,
  },
  userInfo: { flex: 1 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  name: { color: colors.text.primary, fontSize: fontSize.base, fontWeight: '600' },
  handle: { color: colors.text.secondary, fontSize: fontSize.sm, marginTop: 1 },

  empty: { alignItems: 'center', paddingTop: 40 },
  emptyText: { color: colors.text.secondary, fontSize: fontSize.base },
  hint: { alignItems: 'center', paddingTop: 40 },
  hintText: { color: colors.text.tertiary, fontSize: fontSize.base },

  note: {
    color: colors.text.tertiary, fontSize: fontSize.xs, textAlign: 'center',
    marginTop: spacing.xl, paddingHorizontal: spacing.base,
  },
});