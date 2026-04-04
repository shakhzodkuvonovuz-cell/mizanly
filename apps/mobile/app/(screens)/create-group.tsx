import { useState, useEffect, useRef, useMemo } from 'react';
import {
  View, Text, StyleSheet, Pressable,
  TextInput, FlatList,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery, useMutation } from '@tanstack/react-query';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useUser } from '@clerk/clerk-expo';
import * as ImagePicker from 'expo-image-picker';
import { Avatar } from '@/components/ui/Avatar';
import { Icon } from '@/components/ui/Icon';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { VerifiedBadge } from '@/components/ui/VerifiedBadge';
import { CharCountRing } from '@/components/ui/CharCountRing';
import { GlassHeader } from '@/components/ui/GlassHeader';
import { GradientButton } from '@/components/ui/GradientButton';
import { colors, spacing, fontSize, radius } from '@/theme';
import { searchApi, messagesApi, uploadApi } from '@/services/api';
import { useContextualHaptic } from '@/hooks/useContextualHaptic';
import { useTranslation } from '@/hooks/useTranslation';
import { useThemeColors } from '@/hooks/useThemeColors';
import { BrandedRefreshControl } from '@/components/ui/BrandedRefreshControl';
import { showToast } from '@/components/ui/Toast';
import type { User } from '@/types';
import { ScreenErrorBoundary } from '@/components/ui/ScreenErrorBoundary';

const MAX_GROUP_NAME = 50;
const MIN_MEMBERS = 2;

export default function CreateGroupScreen() {
  const router = useRouter();
  const tc = useThemeColors();
  const styles = useMemo(() => createStyles(tc), [tc]);
  const { user } = useUser();
  const haptic = useContextualHaptic();
  const { t } = useTranslation();
  const [groupName, setGroupName] = useState('');
  const [avatarUri, setAvatarUri] = useState<string | undefined>();
  const [selectedMembers, setSelectedMembers] = useState<User[]>([]);
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [validationError, setValidationError] = useState('');
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
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
      exif: false,
    });
    if (!result.canceled) {
      setAvatarUri(result.assets[0].uri);
    }
  };

  const createLockRef = useRef(false);
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
    onError: (err: Error) => {
      if (err.message.includes(`at least ${MIN_MEMBERS} members`)) {
        setValidationError(err.message);
      } else {
        showToast({ message: err.message || t('groups.couldNotCreateGroup'), variant: 'error' });
      }
    },
    onSettled: () => { createLockRef.current = false; },
  });

  const handleAddMember = (user: User) => {
    haptic.follow();
    setSelectedMembers(prev => [...prev, user]);
    setQuery('');
    setDebouncedQuery('');
    setValidationError('');
  };

  const handleRemoveMember = (userId: string) => {
    haptic.delete();
    setSelectedMembers(prev => prev.filter(m => m.id !== userId));
    setValidationError('');
  };


  return (
    <ScreenErrorBoundary>
      <SafeAreaView style={[styles.container, { backgroundColor: tc.bg }]} edges={['top', 'bottom']}>
        {/* Header */}
        <GlassHeader
          title={t('groups.createGroup')}
          leftAction={{ icon: <Icon name="arrow-left" size="md" color={tc.text.primary} />, onPress: () => router.back() }}
        />

        <View style={styles.content}>
          {/* Group name */}
          <View style={styles.section}>
            <Text style={[styles.label, { color: tc.text.secondary }]}>{t('groups.groupName')}</Text>
            <View style={styles.nameRow}>
              <TextInput
                style={[styles.nameInput, { color: tc.text.primary }]}
                value={groupName}
                onChangeText={setGroupName}
                placeholder={t('groups.enterGroupName')}
                placeholderTextColor={tc.text.tertiary}
                autoFocus
                maxLength={MAX_GROUP_NAME}
                accessibilityLabel={t('groups.groupName')}
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
            <Text style={[styles.label, { color: tc.text.secondary }]}>{t('groups.groupAvatarOptional')}</Text>
            <Pressable style={styles.avatarPicker} onPress={pickAvatar} accessibilityLabel={t('groups.chooseGroupAvatar')} accessibilityRole="button">
              {avatarUri ? (
                <Avatar uri={avatarUri} name={groupName || t('common.group')} size="2xl" />
              ) : (
                <View style={[styles.avatarPlaceholder, { backgroundColor: tc.bgCard }]}>
                  <Icon name="camera" size={32} color={tc.text.secondary} />
                </View>
              )}
              <View style={styles.avatarOverlay}>
                <Icon name="edit" size={16} color={tc.text.primary} />
              </View>
            </Pressable>
            <Pressable
              onPress={() => setAvatarUri(undefined)}
              disabled={createMutation.isPending}
              style={styles.skipBtn}
              accessibilityLabel={t('groups.skipGroupAvatar')}
              accessibilityRole="button"
            >
              <Text style={[styles.skipText, createMutation.isPending && styles.skipDisabled]}>
                {t('common.skipForNow')}
              </Text>
            </Pressable>
          </View>

          {/* Selected members chips */}
          {selectedMembers.length > 0 && (
            <View style={styles.section}>
              <Text style={[styles.label, { color: tc.text.secondary }]}>
                {t('groups.members', { count: selectedMembers.length })}
              </Text>
              <View style={styles.chips}>
                {selectedMembers.map(member => (
                  <View key={member.id} style={[styles.chip, { backgroundColor: tc.bgCard }]}>
                    <Avatar uri={member.avatarUrl} name={member.displayName} size="sm" />
                    <Text style={[styles.chipText, { color: tc.text.primary }]} numberOfLines={1}>
                      {member.displayName}
                    </Text>
                    <Pressable
                      onPress={() => handleRemoveMember(member.id)}
                      hitSlop={8}
                      style={styles.chipRemove}
                      accessibilityLabel={t('groups.removeMember', { name: member.displayName })}
                      accessibilityRole="button"
                    >
                      <Icon name="x" size={12} color={tc.text.secondary} />
                    </Pressable>
                  </View>
                ))}
              </View>
            </View>
          )}

          {/* Member search */}
          <View style={styles.section}>
            <Text style={[styles.label, { color: tc.text.secondary }]}>{t('groups.addMembers')}</Text>
            <View style={[styles.searchWrap, { backgroundColor: tc.bgCard }]}>
              <Icon name="search" size="sm" color={tc.text.secondary} />
              <TextInput
                style={[styles.searchInput, { color: tc.text.primary }]}
                value={query}
                onChangeText={handleQueryChange}
                placeholder={t('common.searchPeople')}
                placeholderTextColor={tc.text.tertiary}
                autoCapitalize="none"
                autoCorrect={false}
                accessibilityLabel={t('common.searchPeople')}
              />
              {query.length > 0 && (
                <Pressable onPress={() => { setQuery(''); setDebouncedQuery(''); }} hitSlop={8} accessibilityLabel={t('accessibility.clearSearch')} accessibilityRole="button">
                  <Icon name="x" size="xs" color={tc.text.secondary} />
                </Pressable>
              )}
            </View>

            {searchQuery.isLoading ? (
              <View style={styles.loader}>
                <Skeleton.Rect width="100%" height={56} borderRadius={radius.sm} />
                <Skeleton.Rect width="100%" height={56} borderRadius={radius.sm} />
                <Skeleton.Rect width="100%" height={56} borderRadius={radius.sm} />
              </View>
            ) : (
              <FlatList
                data={people}
                scrollEnabled={true}
                keyExtractor={(item) => item.id}
                removeClippedSubviews={true}
                keyboardShouldPersistTaps="handled"
                refreshControl={<BrandedRefreshControl refreshing={searchQuery.isFetching} onRefresh={() => searchQuery.refetch()} />}
                renderItem={({ item }) => (
                  <Pressable
                    style={[styles.userRow, { borderBottomColor: tc.border }]}
                    onPress={() => handleAddMember(item)}
                    disabled={createMutation.isPending}

                    accessibilityLabel={t('groups.addMember', { name: item.displayName })}
                    accessibilityRole="button"
                  >
                    <Avatar uri={item.avatarUrl} name={item.displayName} size="md" />
                    <View style={styles.userInfo}>
                      <View style={styles.userNameRow}>
                        <Text style={[styles.name, { color: tc.text.primary }]}>{item.displayName}</Text>
                        {item.isVerified && <VerifiedBadge size={13} />}
                      </View>
                      <Text style={[styles.handle, { color: tc.text.secondary }]}>@{item.username}</Text>
                    </View>
                    <Icon name="plus" size="sm" color={colors.emerald} />
                  </Pressable>
                )}
                ListEmptyComponent={() =>
                  debouncedQuery.trim().length >= 2 ? (
                    <EmptyState
                      icon="search"
                      title={t('messages.noUsersFound', { query: debouncedQuery })}
                    />
                  ) : (
                    <EmptyState
                      icon="user"
                      title={t('messages.searchByNameOrUsername')}
                    />
                  )
                }
              />
            )}
          </View>

          {/* Minimum requirement note */}
          <Text style={[styles.note, { color: tc.text.tertiary }]}>
            {t('groups.minMembersRequired', { count: MIN_MEMBERS })}
          </Text>

          {/* Create button */}
          <View style={{ marginTop: spacing.lg, marginHorizontal: spacing.base }}>
            <GradientButton
              label={t('common.create')}
              onPress={() => {
                if (createLockRef.current) return;
                createLockRef.current = true;
                createMutation.mutate();
              }}
              loading={createMutation.isPending}
              disabled={groupName.trim().length === 0 || selectedMembers.length < MIN_MEMBERS}
            />
          </View>

          {/* Validation error */}
          {validationError ? <Text style={styles.error}>{validationError}</Text> : null}
        </View>
      </SafeAreaView>
  
    </ScreenErrorBoundary>
  );
}

const createStyles = (tc: ReturnType<typeof useThemeColors>) => StyleSheet.create({
  container: { flex: 1, backgroundColor: tc.bg },
  content: { paddingVertical: spacing.lg, paddingHorizontal: spacing.base },

  section: { marginBottom: spacing.xl },
  label: {
    color: tc.text.secondary, fontSize: fontSize.sm, fontWeight: '600',
    marginBottom: spacing.sm,
  },

  nameRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  nameInput: {
    flex: 1, color: tc.text.primary, fontSize: fontSize.lg, fontWeight: '600',
    paddingVertical: spacing.xs,
  },

  avatarPicker: { alignSelf: 'center', position: 'relative', marginTop: spacing.sm },
  avatarPlaceholder: {
    width: 96, height: 96, borderRadius: radius.full,
    backgroundColor: tc.bgCard, alignItems: 'center', justifyContent: 'center',
  },
  avatarOverlay: {
    position: 'absolute', bottom: 0, end: 0,
    width: 32, height: 32, borderRadius: radius.full,
    backgroundColor: colors.emerald, alignItems: 'center', justifyContent: 'center',
  },
  skipBtn: { marginTop: spacing.sm, alignItems: 'center' },
  skipText: { color: tc.text.secondary, fontSize: fontSize.sm },
  skipDisabled: { color: tc.text.tertiary },

  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.xs,
    backgroundColor: tc.bgCard, paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs, borderRadius: radius.full,
    maxWidth: 160,
  },
  chipText: {
    color: tc.text.primary, fontSize: fontSize.xs, fontWeight: '500',
    flexShrink: 1,
  },
  chipRemove: { marginStart: 'auto' },

  searchWrap: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    backgroundColor: tc.bgCard, borderRadius: radius.full,
    marginBottom: spacing.md,
  },
  searchInput: { flex: 1, color: tc.text.primary, fontSize: fontSize.base },

  loader: { marginVertical: spacing.xl, gap: spacing.sm },
  userRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    paddingHorizontal: spacing.sm, paddingVertical: spacing.md,
    borderBottomWidth: 0.5, borderBottomColor: tc.border,
  },
  userInfo: { flex: 1 },
  userNameRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  name: { color: tc.text.primary, fontSize: fontSize.base, fontWeight: '600' },
  handle: { color: tc.text.secondary, fontSize: fontSize.sm, marginTop: 1 },

  empty: { alignItems: 'center', paddingTop: 40 },
  emptyText: { color: tc.text.secondary, fontSize: fontSize.base },
  hint: { alignItems: 'center', paddingTop: 40 },
  hintText: { color: tc.text.tertiary, fontSize: fontSize.base },

  error: {
    color: colors.error, fontSize: fontSize.sm, textAlign: 'center',
    marginTop: spacing.sm, paddingHorizontal: spacing.base,
  },
  note: {
    color: tc.text.tertiary, fontSize: fontSize.xs, textAlign: 'center',
    marginTop: spacing.xl, paddingHorizontal: spacing.base,
  },
});