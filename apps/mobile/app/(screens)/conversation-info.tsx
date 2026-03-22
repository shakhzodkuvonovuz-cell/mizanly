import { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, Pressable, ScrollView, Alert,
  TextInput, FlatList, RefreshControl, Switch,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { navigate } from '@/utils/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useUser } from '@clerk/clerk-expo';
import * as ImagePicker from 'expo-image-picker';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { Avatar } from '@/components/ui/Avatar';
import { Icon } from '@/components/ui/Icon';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { CharCountRing } from '@/components/ui/CharCountRing';
import { VerifiedBadge } from '@/components/ui/VerifiedBadge';
import { GlassHeader } from '@/components/ui/GlassHeader';
import { colors, spacing, fontSize, radius, fontSizeExt } from '@/theme';
import { messagesApi, blocksApi, searchApi, uploadApi } from '@/services/api';
import { BottomSheet, BottomSheetItem } from '@/components/ui/BottomSheet';
import { useHaptic } from '@/hooks/useHaptic';
import { useTranslation } from '@/hooks/useTranslation';
import { useThemeColors } from '@/hooks/useThemeColors';
import type { Conversation, User } from '@/types';
import { ScreenErrorBoundary } from '@/components/ui/ScreenErrorBoundary';

const MAX_GROUP_NAME = 50;

function conversationName(convo: Conversation, myId?: string, t?: (key: string) => string): string {
  if (convo.isGroup) return convo.groupName ?? (t ? t('common.group') : 'Group');
  const other = convo.members.find((m) => m.user.id !== myId);
  return other?.user.displayName ?? (t ? t('common.chat') : 'Chat');
}

function conversationAvatar(convo: Conversation, myId?: string): string | undefined {
  if (convo.isGroup) return convo.groupAvatarUrl;
  const other = convo.members.find((m) => m.user.id !== myId);
  return other?.user.avatarUrl;
}

export default function ConversationInfoScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const tc = useThemeColors();
  const router = useRouter();
  const { user } = useUser();
  const queryClient = useQueryClient();
  const haptic = useHaptic();
  const { t } = useTranslation();

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
  const name = convo ? conversationName(convo, user?.id, t) : '…';
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
      Alert.alert(t('common.error'), t('conversation.failedToRemoveMember'));
    },
  });

  const muteMutation = useMutation({
    mutationFn: (muted: boolean) => messagesApi.mute(id, muted),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conversation', id] });
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
    },
  });

  const handleToggleMute = () => {
    haptic.light();
    const newMuted = !convo?.isMuted;
    muteMutation.mutate(newMuted);
  };

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
        Alert.alert(t('common.error'), t('conversation.failedToUploadAvatar'));
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
    Alert.alert(t('conversation.removeMemberConfirmTitle'), t('conversation.removeMemberConfirmMessage'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('common.remove'), style: 'destructive', onPress: () => removeMemberMutation.mutate(targetUserId) },
    ]);
  };

  const handleMemberLongPress = (memberId: string, username: string) => {
    haptic.light();
    setSelectedMember({ id: memberId, username });
    setMemberActionSheetOpen(true);
  };

  const handleLeave = () => {
    Alert.alert(t('conversation.leaveGroupConfirmTitle'), t('conversation.leaveGroupConfirmMessage'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('common.leave'), style: 'destructive', onPress: () => leaveGroupMutation.mutate() },
    ]);
  };

  if (convoQuery.isLoading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: tc.bg }]} edges={['top']}>
        <Skeleton.ProfileHeader />
      </SafeAreaView>
    );
  }

  if (convoQuery.isError) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: tc.bg }]} edges={['top']}>
        <GlassHeader
          title={t('conversation.chatInfo')}
          leftAction={{ icon: <Icon name="arrow-left" size="md" color={colors.text.primary} />, onPress: () => router.back() }}
        />
        <View style={{ flex: 1, justifyContent: 'center' }}>
          <EmptyState
            icon="flag"
            title={t('conversation.couldNotLoadChatInfo')}
            subtitle={t('common.checkConnectionAndRetry')}
            actionLabel={t('common.retry')}
            onAction={() => convoQuery.refetch()}
          />
        </View>
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
    <ScreenErrorBoundary>
      <SafeAreaView style={[styles.container, { backgroundColor: tc.bg }]} edges={['top']}>
        {/* Header */}
        <GlassHeader
          title={t('conversation.chatInfo')}
          leftAction={{ icon: <Icon name="arrow-left" size="md" color={colors.text.primary} />, onPress: () => router.back() }}
        />

        <ScrollView contentContainerStyle={{ paddingBottom: 60 }}>
          {/* Avatar + name — Glassmorphism Card */}
          <Animated.View entering={FadeInUp.delay(0).duration(400)}>
            <LinearGradient
              colors={colors.gradient.cardDark}
              style={styles.heroCard}
            >
              <Pressable onPress={isGroup && isCreator ? pickAvatar : undefined} style={{ position: 'relative' }}>
                <Avatar uri={avatarUri} name={name} size="2xl" />
                {isGroup && isCreator && (
                  <LinearGradient
                    colors={[colors.emerald, colors.emeraldDark]}
                    style={styles.avatarOverlayGradient}
                  >
                    <Icon name="edit" size={16} color={colors.text.primary} />
                  </LinearGradient>
                )}
              </Pressable>
              <View style={styles.nameRow}>
                <Text style={styles.heroName}>{name}</Text>
                {isGroup && isCreator && (
                  <Pressable onPress={() => setEditNameSheetOpen(true)} style={styles.editNameBtn} accessibilityLabel={t('accessibility.editGroupName')}>
                    <Icon name="edit" size={16} color={colors.text.secondary} />
                  </Pressable>
                )}
              </View>
              {isGroup && (
                <Text style={styles.heroSub}>{t('conversation.members', { count: convo.members.length })}</Text>
              )}
              {!isGroup && otherMember && (
                <Text style={styles.heroSub}>@{otherMember.user.username}</Text>
              )}
              {isGroup && isCreator && (
                <View style={styles.adminActions}>
                  <Pressable style={styles.adminAction} onPress={() => setAddMembersSheetOpen(true)}>
                    <LinearGradient
                      colors={['rgba(10,123,79,0.2)', 'rgba(200,150,62,0.1)']}
                      style={styles.adminActionIconBg}
                    >
                      <Icon name="plus" size="xs" color={colors.emerald} />
                    </LinearGradient>
                    <Text style={styles.adminActionText}>{t('groups.addMembers')}</Text>
                  </Pressable>
                </View>
              )}
            </LinearGradient>
          </Animated.View>

          {/* Quick actions */}
          {!isGroup && otherMember && (
            <Animated.View entering={FadeInUp.delay(80).duration(400)} style={styles.quickActions}>
              <Pressable
                style={styles.quickAction}
                onPress={() => router.push(`/(screens)/profile/${otherMember.user.username}`)}
              >
                <LinearGradient
                  colors={['rgba(10,123,79,0.2)', 'rgba(200,150,62,0.1)']}
                  style={styles.quickActionIconBg}
                >
                  <Icon name="user" size="md" color={colors.emerald} />
                </LinearGradient>
                <Text style={styles.quickActionLabel}>{t('common.profile')}</Text>
              </Pressable>
            </Animated.View>
          )}

          {/* Members list (group only) */}
          {isGroup && (
            <Animated.View entering={FadeInUp.delay(160).duration(400)}>
              <LinearGradient
                colors={colors.gradient.cardDark}
                style={[styles.section, styles.optionsCardGlass]}
              >
                <View style={styles.sectionHeader}>
                  <LinearGradient
                    colors={['rgba(10,123,79,0.2)', 'rgba(200,150,62,0.1)']}
                    style={styles.sectionIconBg}
                  >
                    <Icon name="users" size="xs" color={colors.emerald} />
                  </LinearGradient>
                  <Text style={styles.sectionTitle}>{t('conversation.membersTitle')}</Text>
                </View>
                {convo.members.map((m, index) => (
                  <Animated.View key={m.user.id} entering={FadeInUp.delay(index * 80).duration(400)}>
                    <Pressable
                      style={[styles.memberRow, { borderBottomColor: tc.border }]}
                      onPress={() => router.push(`/(screens)/profile/${m.user.username}`)}
                      onLongPress={() => handleMemberLongPress(m.user.id, m.user.username)}
                      delayLongPress={500}
                     
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
                            <LinearGradient
                              colors={[colors.emerald, colors.gold]}
                              style={styles.creatorBadgeGradient}
                            >
                              <Text style={styles.creatorBadgeText}>{t('conversation.creator')}</Text>
                            </LinearGradient>
                          )}
                          {(m as { tag?: string | null }).tag && (
                            <View style={{ backgroundColor: tc.surface, borderRadius: radius.full, paddingHorizontal: spacing.xs, paddingVertical: 1 }}>
                              <Text style={{ color: colors.text.secondary, fontSize: fontSizeExt.tiny, fontWeight: '500' }}>{(m as { tag?: string | null }).tag}</Text>
                            </View>
                          )}
                        </View>
                        <Text style={styles.memberHandle}>@{m.user.username}</Text>
                      </View>
                      {m.user.id === user?.id && (
                        <Text style={styles.youLabel}>{t('common.you')}</Text>
                      )}
                    </Pressable>
                  </Animated.View>
                ))}
              </LinearGradient>
            </Animated.View>
          )}

          {/* Mute toggle */}
          <Animated.View entering={FadeInUp.delay(200).duration(400)}>
            <LinearGradient
              colors={colors.gradient.cardDark}
              style={styles.optionsCardGlass}
            >
              <View style={styles.muteRow}>
                <View style={styles.muteLeft}>
                  <LinearGradient
                    colors={['rgba(10,123,79,0.2)', 'rgba(200,150,62,0.1)']}
                    style={styles.actionIconBg}
                  >
                    <Icon name="volume-x" size="xs" color={colors.emerald} />
                  </LinearGradient>
                  <View style={styles.muteTextWrap}>
                    <Text style={styles.muteLabel}>
                      {convo.isMuted ? t('muteConversation.unmute') : t('muteConversation.mute')}
                    </Text>
                    <Text style={styles.muteHint}>{t('muteConversation.hint')}</Text>
                  </View>
                </View>
                <Switch
                  value={convo.isMuted ?? false}
                  onValueChange={handleToggleMute}
                  disabled={muteMutation.isPending}
                  trackColor={{ false: tc.surface, true: colors.emerald }}
                  thumbColor={colors.text.primary}
                />
              </View>
            </LinearGradient>
          </Animated.View>

          {/* Chat Options */}
          <Animated.View entering={FadeInUp.delay(250).duration(400)}>
            <LinearGradient
              colors={colors.gradient.cardDark}
              style={styles.optionsCardGlass}
            >
              <Pressable style={[styles.actionRow, { borderBottomColor: tc.border }]} onPress={() => navigate(`/(screens)/starred-messages?conversationId=${convo?.id}`)}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                  <LinearGradient colors={['rgba(200,150,62,0.2)', 'rgba(200,150,62,0.1)']} style={styles.actionIconBg}>
                    <Icon name="bookmark" size="xs" color={colors.gold} />
                  </LinearGradient>
                  <Text style={styles.actionText}>{t('screens.starred-messages.title')}</Text>
                </View>
              </Pressable>
              <Pressable style={[styles.actionRow, { borderBottomColor: tc.border }]} onPress={() => navigate(`/(screens)/pinned-messages?conversationId=${convo?.id}`)}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                  <LinearGradient colors={['rgba(10,123,79,0.2)', 'rgba(10,123,79,0.1)']} style={styles.actionIconBg}>
                    <Icon name="map-pin" size="xs" color={colors.emerald} />
                  </LinearGradient>
                  <Text style={styles.actionText}>{t('screens.pinned-messages.title')}</Text>
                </View>
              </Pressable>
              <Pressable style={[styles.actionRow, { borderBottomColor: tc.border }]} onPress={() => navigate(`/(screens)/conversation-media?id=${convo?.id}`)}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                  <LinearGradient colors={['rgba(200,150,62,0.2)', 'rgba(200,150,62,0.1)']} style={styles.actionIconBg}>
                    <Icon name="image" size="xs" color={colors.gold} />
                  </LinearGradient>
                  <Text style={styles.actionText}>{t('risalah.media')}</Text>
                </View>
              </Pressable>
              <Pressable style={[styles.actionRow, { borderBottomColor: tc.border }]} onPress={() => navigate(`/(screens)/chat-export?conversationId=${convo?.id}`)}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                  <LinearGradient colors={['rgba(10,123,79,0.2)', 'rgba(10,123,79,0.1)']} style={styles.actionIconBg}>
                    <Icon name="share" size="xs" color={colors.emerald} />
                  </LinearGradient>
                  <Text style={styles.actionText}>{t('settings.export')}</Text>
                </View>
              </Pressable>
              <Pressable style={[styles.actionRow, { borderBottomColor: tc.border }]} onPress={() => navigate(`/(screens)/disappearing-settings?conversationId=${convo?.id}`)}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                  <LinearGradient colors={['rgba(200,150,62,0.2)', 'rgba(200,150,62,0.1)']} style={styles.actionIconBg}>
                    <Icon name="clock" size="xs" color={colors.gold} />
                  </LinearGradient>
                  <Text style={styles.actionText}>{t('risalah.disappearingMessages')}</Text>
                </View>
              </Pressable>
              <Pressable style={[styles.actionRow, { borderBottomColor: tc.border }]} onPress={() => navigate(`/(screens)/chat-wallpaper?conversationId=${convo?.id}`)}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                  <LinearGradient colors={['rgba(10,123,79,0.2)', 'rgba(10,123,79,0.1)']} style={styles.actionIconBg}>
                    <Icon name="image" size="xs" color={colors.emerald} />
                  </LinearGradient>
                  <Text style={styles.actionText}>{t('settings.appearance')}</Text>
                </View>
              </Pressable>
              <Pressable style={[styles.actionRow, { borderBottomColor: tc.border }]} onPress={() => navigate(`/(screens)/chat-theme-picker?conversationId=${convo?.id}`)}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                  <LinearGradient colors={['rgba(200,150,62,0.2)', 'rgba(200,150,62,0.1)']} style={styles.actionIconBg}>
                    <Icon name="eye" size="xs" color={colors.gold} />
                  </LinearGradient>
                  <Text style={styles.actionText}>{t('settings.theme')}</Text>
                </View>
              </Pressable>
              <Pressable style={[styles.actionRow, { borderBottomColor: tc.border }]} onPress={() => navigate(`/(screens)/chat-lock?conversationId=${convo?.id}`)}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                  <LinearGradient colors={['rgba(10,123,79,0.2)', 'rgba(10,123,79,0.1)']} style={styles.actionIconBg}>
                    <Icon name="lock" size="xs" color={colors.emerald} />
                  </LinearGradient>
                  <Text style={styles.actionText}>{t('biometric.settingsLabel')}</Text>
                </View>
              </Pressable>
              <Pressable style={[styles.actionRow, { borderBottomColor: tc.border }]} onPress={() => navigate(`/(screens)/verify-encryption?conversationId=${convo?.id}`)}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                  <LinearGradient colors={['rgba(200,150,62,0.2)', 'rgba(200,150,62,0.1)']} style={styles.actionIconBg}>
                    <Icon name="check-circle" size="xs" color={colors.gold} />
                  </LinearGradient>
                  <Text style={styles.actionText}>{t('risalah.endToEndEncryption')}</Text>
                </View>
              </Pressable>
            </LinearGradient>
          </Animated.View>

          {/* Actions */}
          <Animated.View entering={FadeInUp.delay(280).duration(400)}>
            <LinearGradient
              colors={colors.gradient.cardDark}
              style={styles.optionsCardGlass}
            >
              {isGroup && !isCreator && (
                <Pressable style={[styles.actionRow, { borderBottomColor: tc.border }]} onPress={handleLeave}>
                  {leaveGroupMutation.isPending
                    ? <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                        <Skeleton.Rect width={24} height={24} borderRadius={radius.full} />
                      </View>
                    : <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                        <LinearGradient
                          colors={['rgba(248,81,73,0.2)', 'rgba(248,81,73,0.1)']}
                          style={styles.actionIconBg}
                        >
                          <Icon name="log-out" size="xs" color={colors.error} />
                        </LinearGradient>
                        <Text style={styles.actionDestructive}>{t('conversation.leaveGroup')}</Text>
                      </View>
                  }
                </Pressable>
              )}
              {!isGroup && (
                <Pressable
                  accessibilityRole="button"
                  style={[styles.actionRow, { borderBottomColor: tc.border }]}
                  onPress={() => {
                    const other = convo?.members.find((m) => m.user.id !== user?.id);
                    if (!other) return;
                    Alert.alert(t('conversation.blockUser'), t('conversation.blockConfirm'), [
                      { text: t('common.cancel'), style: 'cancel' },
                      {
                        text: t('common.block'), style: 'destructive', onPress: () => {
                          blocksApi.block(other.user.id)
                            .then(() => router.replace('/(tabs)/risalah'))
                            .catch(() => Alert.alert(t('common.error'), t('errors.blockUserFailed')));
                        },
                      },
                    ]);
                  }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                    <LinearGradient
                      colors={['rgba(248,81,73,0.2)', 'rgba(248,81,73,0.1)']}
                      style={styles.actionIconBg}
                    >
                      <Icon name="slash" size="xs" color={colors.error} />
                    </LinearGradient>
                    <Text style={styles.actionDestructive}>{t('conversation.blockUser')}</Text>
                  </View>
                </Pressable>
              )}
            </LinearGradient>
          </Animated.View>
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
            <Text style={styles.sheetTitle}>{t('conversation.editGroupName')}</Text>
            <View style={styles.nameInputRow}>
              <TextInput
                style={styles.nameInput}
                value={newGroupName}
                onChangeText={setNewGroupName}
                placeholder={t('groups.enterNewGroupName')}
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
            <Pressable
              accessibilityRole="button"
              style={[styles.sheetButton, !newGroupName.trim() && styles.sheetButtonDisabled]}
              onPress={handleUpdateGroupName}
              disabled={!newGroupName.trim() || updateGroupMutation.isPending}
            >
              {updateGroupMutation.isPending ? (
                <Skeleton.Rect width={24} height={24} borderRadius={radius.full} />
              ) : (
                <Text style={styles.sheetButtonText}>{t('common.save')}</Text>
              )}
            </Pressable>
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
            <Text style={styles.sheetTitle}>{t('groups.addMembers')}</Text>

            {/* Selected members chips */}
            {selectedNewMembers.length > 0 && (
              <View style={styles.chipsContainer}>
                <Text style={styles.chipsLabel}>{t('groups.selected', { count: selectedNewMembers.length })}</Text>
                <View style={styles.chips}>
                  {selectedNewMembers.map(member => (
                    <View key={member.id} style={[styles.chip, { backgroundColor: tc.bgCard }]}>
                      <Avatar uri={member.avatarUrl} name={member.displayName} size="sm" />
                      <Text style={styles.chipText} numberOfLines={1}>
                        {member.displayName}
                      </Text>
                      <Pressable
                        accessibilityRole="button"
                        onPress={() => setSelectedNewMembers(prev => prev.filter(m => m.id !== member.id))}
                        hitSlop={4}
                        style={styles.chipRemove}
                        accessibilityLabel={t('groups.removeMember')}
                      >
                        <Icon name="x" size={12} color={colors.text.secondary} />
                      </Pressable>
                    </View>
                  ))}
                </View>
              </View>
            )}

            {/* Search input */}
            <View style={[styles.searchWrap, { backgroundColor: tc.bgCard }]}>
              <Icon name="search" size="sm" color={colors.text.secondary} />
              <TextInput
                style={styles.searchInput}
                value={searchQuery}
                onChangeText={setSearchQuery}
                placeholder={t('common.searchPeople')}
                placeholderTextColor={colors.text.tertiary}
                autoCapitalize="none"
                autoCorrect={false}
              />
              {searchQuery.length > 0 && (
                <Pressable onPress={() => setSearchQuery('')} hitSlop={8} accessibilityLabel={t('accessibility.clearSearch')}>
                  <Icon name="x" size="xs" color={colors.text.secondary} />
                </Pressable>
              )}
            </View>

            {/* Search results */}
            {memberSearchQuery.isLoading ? (
              <View style={styles.loader}>
                <Skeleton.Rect width="100%" height={56} borderRadius={radius.sm} />
                <Skeleton.Rect width="100%" height={56} borderRadius={radius.sm} />
                <Skeleton.Rect width="100%" height={56} borderRadius={radius.sm} />
              </View>
            ) : (
              <FlatList
                data={searchResults}
                style={styles.resultsList}
                keyExtractor={(item) => item.id}
                removeClippedSubviews={true}
                refreshControl={<RefreshControl refreshing={memberSearchQuery.isFetching} onRefresh={() => memberSearchQuery.refetch()} tintColor={colors.emerald} />}
                renderItem={({ item }) => (
                  <Pressable
                    accessibilityRole="button"
                    style={[styles.userRow, { borderBottomColor: tc.border }]}
                    onPress={() => setSelectedNewMembers(prev => [...prev, item])}
                    disabled={addMembersMutation.isPending}
                   
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
                  </Pressable>
                )}
                ListEmptyComponent={() =>
                  debouncedSearchQuery.trim().length >= 2 ? (
                    <View style={styles.empty}>
                      <Text style={styles.emptyText}>{t('messages.noUsersFound', { query: debouncedSearchQuery })}</Text>
                    </View>
                  ) : (
                    <View style={styles.hint}>
                      <Text style={styles.hintText}>{t('messages.searchByNameOrUsername')}</Text>
                    </View>
                  )
                }
              />
            )}

            {/* Add button */}
            <Pressable
              accessibilityRole="button"
              style={[styles.sheetButton, selectedNewMembers.length === 0 && styles.sheetButtonDisabled]}
              onPress={handleAddSelectedMembers}
              disabled={selectedNewMembers.length === 0 || addMembersMutation.isPending}
            >
              {addMembersMutation.isPending ? (
                <Skeleton.Rect width={24} height={24} borderRadius={radius.full} />
              ) : (
                <Text style={styles.sheetButtonText}>
                  {t('common.add')} {selectedNewMembers.length > 0 ? `(${selectedNewMembers.length})` : ''}
                </Text>
              )}
            </Pressable>
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
                  label={t('conversation.removeFromGroup')}
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
                label={t('conversation.viewProfile')}
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
  
    </ScreenErrorBoundary>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.dark.bg },
  loader: { flex: 1, marginTop: 80 },
  optionsCard: {
    backgroundColor: colors.dark.bgCard,
    borderRadius: radius.lg,
    borderWidth: 0.5,
    borderColor: colors.dark.border,
    overflow: 'hidden' as const,
    marginHorizontal: spacing.base,
    marginBottom: spacing.md,
  },
  optionsCardGlass: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.active.white6,
    overflow: 'hidden' as const,
    marginHorizontal: spacing.base,
    marginBottom: spacing.md,
    padding: spacing.md,
  },

  heroCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.active.white6,
    padding: spacing.xl,
    marginHorizontal: spacing.base,
    marginTop: spacing.md,
    marginBottom: spacing.lg,
    alignItems: 'center',
    gap: spacing.sm,
  },
  heroName: { color: colors.text.primary, fontSize: fontSize.xl, fontWeight: '700' },
  heroSub: { color: colors.text.secondary, fontSize: fontSize.sm },

  quickActions: { flexDirection: 'row', justifyContent: 'center', marginBottom: spacing.lg },
  quickAction: { alignItems: 'center', gap: spacing.xs, paddingHorizontal: spacing.xl },
  quickActionIconBg: {
    width: 44, height: 44, borderRadius: radius.sm,
    alignItems: 'center', justifyContent: 'center',
  },
  quickActionLabel: { color: colors.text.secondary, fontSize: fontSize.xs },

  section: {
    borderTopWidth: 0.5, borderTopColor: colors.dark.border,
    marginTop: spacing.lg,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  sectionIconBg: {
    width: 32, height: 32, borderRadius: radius.sm,
    alignItems: 'center', justifyContent: 'center',
  },
  sectionTitle: {
    color: colors.text.secondary, fontSize: fontSize.xs, fontWeight: '600',
    textTransform: 'uppercase', letterSpacing: 0.5,
  },
  memberRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: 0.5, borderBottomColor: colors.dark.border,
  },
  memberInfo: { flex: 1 },
  memberNameRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  memberName: { color: colors.text.primary, fontSize: fontSize.base, fontWeight: '600' },
  memberHandle: { color: colors.text.secondary, fontSize: fontSize.sm, marginTop: 1 },
  youLabel: { color: colors.text.tertiary, fontSize: fontSize.xs },
  creatorBadge: {
    backgroundColor: colors.active.gold10,
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
    borderRadius: radius.sm,
  },
  creatorBadgeGradient: {
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
    borderRadius: radius.sm,
  },
  creatorBadgeText: {
    color: colors.text.primary,
    fontSize: fontSize.xs,
    fontWeight: '600',
  },

  muteRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  muteLeft: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flex: 1,
  },
  muteTextWrap: {
    flex: 1,
  },
  muteLabel: {
    color: colors.text.primary, fontSize: fontSize.base, fontWeight: '500',
  },
  muteHint: {
    color: colors.text.tertiary, fontSize: fontSize.xs, marginTop: 2,
  },

  actionRow: {
    paddingVertical: spacing.md + 2,
    borderBottomWidth: 0.5, borderBottomColor: colors.dark.border,
  },
  actionDestructive: { color: colors.error, fontSize: fontSize.base },
  actionIconBg: {
    width: 36, height: 36, borderRadius: radius.sm,
    alignItems: 'center', justifyContent: 'center',
  },

  // Admin styles
  avatarOverlay: {
    position: 'absolute', bottom: 0, right: 0,
    width: 32, height: 32, borderRadius: radius.full,
    backgroundColor: colors.emerald, alignItems: 'center', justifyContent: 'center',
  },
  avatarOverlayGradient: {
    position: 'absolute', bottom: 0, right: 0,
    width: 32, height: 32, borderRadius: radius.full,
    alignItems: 'center', justifyContent: 'center',
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
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
  },
  adminActionIconBg: {
    width: 32, height: 32, borderRadius: radius.sm,
    alignItems: 'center', justifyContent: 'center',
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
  searchLoader: {
    marginVertical: spacing.xl,
    gap: spacing.sm,
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
