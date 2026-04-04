import { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TextInput, Pressable,
  FlatList, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from '@/hooks/useTranslation';
import { useThemeColors } from '@/hooks/useThemeColors';
import { useQuery, useMutation, useQueryClient, useInfiniteQuery } from '@tanstack/react-query';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { Avatar } from '@/components/ui/Avatar';
import { Icon } from '@/components/ui/Icon';
import { GlassHeader } from '@/components/ui/GlassHeader';
import { GradientButton } from '@/components/ui/GradientButton';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { CharCountRing } from '@/components/ui/CharCountRing';
import { BottomSheet, BottomSheetItem } from '@/components/ui/BottomSheet';
import { BrandedRefreshControl } from '@/components/ui/BrandedRefreshControl';
import { ScreenErrorBoundary } from '@/components/ui/ScreenErrorBoundary';
import { showToast } from '@/components/ui/Toast';
import { useContextualHaptic } from '@/hooks/useContextualHaptic';
import { colors, spacing, fontSize, radius, fonts } from '@/theme';
import { altProfileApi } from '@/services/altProfileApi';
import { formatDistanceToNowStrict } from 'date-fns';
import { getDateFnsLocale } from '@/utils/localeFormat';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { rtlFlexRow } from '@/utils/rtl';

type AltProfile = {
  id: string;
  userId: string;
  displayName: string;
  bio?: string;
  avatarUrl?: string;
  createdAt: string;
};

type AltProfileAccess = {
  id: string;
  altProfileId: string;
  userId: string;
  grantedAt: string;
  user?: { id: string; displayName: string; avatarUrl?: string };
};

type AltPost = {
  id: string;
  userId: string;
  content?: string;
  mediaUrls?: string[];
  createdAt: string;
};

export default function FlipsideScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { t, isRTL } = useTranslation();
  const tc = useThemeColors();
  const haptic = useContextualHaptic();
  const insets = useSafeAreaInsets();

  // ── State ──
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [bio, setBio] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [showAccessSheet, setShowAccessSheet] = useState(false);

  // ── Queries ──
  const profileQuery = useQuery({
    queryKey: ['alt-profile'],
    queryFn: () => altProfileApi.get(),
  });

  const accessListQuery = useQuery({
    queryKey: ['alt-profile-access'],
    queryFn: () => altProfileApi.getAccessList(),
    enabled: !!profileQuery.data,
  });

  const postsQuery = useInfiniteQuery({
    queryKey: ['alt-profile-posts'],
    queryFn: ({ pageParam }) => altProfileApi.getOwnPosts(pageParam as string | undefined),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.meta?.hasMore ? last.meta.cursor ?? undefined : undefined,
    enabled: !!profileQuery.data,
  });

  const altProfile = profileQuery.data as AltProfile | null | undefined;
  const accessList: AltProfileAccess[] = (accessListQuery.data as AltProfileAccess[]) ?? [];
  const posts: AltPost[] = postsQuery.data?.pages.flatMap((p) => p.data) ?? [];

  // ── Mutations ──
  const createMutation = useMutation({
    mutationFn: (data: { displayName: string; bio?: string }) =>
      altProfileApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['alt-profile'] });
      setShowCreateForm(false);
      setDisplayName('');
      setBio('');
      showToast({ message: t('common.saved'), variant: 'success' });
    },
    onError: (err: Error) => showToast({ message: err.message, variant: 'error' }),
  });

  const updateMutation = useMutation({
    mutationFn: (data: { displayName?: string; bio?: string }) =>
      altProfileApi.update(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['alt-profile'] });
      setIsEditing(false);
      showToast({ message: t('common.saved'), variant: 'success' });
    },
    onError: (err: Error) => showToast({ message: err.message, variant: 'error' }),
  });

  const deleteMutation = useMutation({
    mutationFn: () => altProfileApi.delete(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['alt-profile'] });
      queryClient.invalidateQueries({ queryKey: ['alt-profile-access'] });
      queryClient.invalidateQueries({ queryKey: ['alt-profile-posts'] });
      showToast({ message: t('common.deleted'), variant: 'success' });
    },
    onError: (err: Error) => showToast({ message: err.message, variant: 'error' }),
  });

  const removeAccessMutation = useMutation({
    mutationFn: (targetUserId: string) => altProfileApi.removeAccess(targetUserId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['alt-profile-access'] });
      showToast({ message: t('common.saved'), variant: 'success' });
    },
    onError: (err: Error) => showToast({ message: err.message, variant: 'error' }),
  });

  // ── Handlers ──
  const handleCreate = () => {
    if (!displayName.trim()) return;
    haptic.tick();
    createMutation.mutate({ displayName: displayName.trim(), bio: bio.trim() || undefined });
  };

  const handleUpdate = () => {
    if (!displayName.trim()) return;
    haptic.tick();
    updateMutation.mutate({ displayName: displayName.trim(), bio: bio.trim() || undefined });
  };

  const handleDelete = () => {
    haptic.delete();
    Alert.alert(
      t('common.delete'),
      t('flipside.deleteConfirm'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('common.delete'), style: 'destructive', onPress: () => deleteMutation.mutate() },
      ],
    );
  };

  const startEditing = () => {
    if (altProfile) {
      setDisplayName(altProfile.displayName);
      setBio(altProfile.bio ?? '');
      setIsEditing(true);
    }
  };

  const handleRefresh = useCallback(() => {
    profileQuery.refetch();
    accessListQuery.refetch();
    postsQuery.refetch();
  }, [profileQuery, accessListQuery, postsQuery]);

  const HEADER_HEIGHT = insets.top + 44;

  // ── Loading ──
  if (profileQuery.isLoading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: tc.bg }]} edges={['top']}>
        <GlassHeader
          title={t('flipside.title')}
          leftAction={{ icon: 'arrow-left', onPress: () => router.back() }}
        />
        <View style={{ marginTop: HEADER_HEIGHT, padding: spacing.base }}>
          <Skeleton.ProfileHeader />
        </View>
      </SafeAreaView>
    );
  }

  // ── Error ──
  if (profileQuery.isError) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: tc.bg }]} edges={['top']}>
        <GlassHeader
          title={t('flipside.title')}
          leftAction={{ icon: 'arrow-left', onPress: () => router.back() }}
        />
        <View style={{ flex: 1, justifyContent: 'center', paddingTop: HEADER_HEIGHT }}>
          <EmptyState
            icon="flag"
            title={t('common.error')}
            subtitle={t('common.errorSubtitle')}
            actionLabel={t('common.retry')}
            onAction={() => profileQuery.refetch()}
          />
        </View>
      </SafeAreaView>
    );
  }

  // ── No profile yet: show create form ──
  if (!altProfile || showCreateForm) {
    return (
      <ScreenErrorBoundary>
        <SafeAreaView style={[styles.container, { backgroundColor: tc.bg }]} edges={['top']}>
          <GlassHeader
            title={t('flipside.title')}
            leftAction={{ icon: 'arrow-left', onPress: () => router.back() }}
          />
          <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={100}>
          <View style={[styles.body, { paddingTop: HEADER_HEIGHT }]}>
            {!showCreateForm && !altProfile ? (
              <View style={styles.emptyContainer}>
                <EmptyState
                  icon="user"
                  title={t('flipside.title')}
                  subtitle={t('flipside.description')}
                  actionLabel={t('flipside.create')}
                  onAction={() => setShowCreateForm(true)}
                />
              </View>
            ) : (
              <Animated.View entering={FadeInUp.duration(400)} style={styles.createForm}>
                <LinearGradient
                  colors={['rgba(45,53,72,0.35)', 'rgba(28,35,51,0.2)']}
                  style={[styles.formCard, { borderColor: tc.border }]}
                >
                  <Text style={[styles.formTitle, { color: tc.text.primary }]}>
                    {t('flipside.create')}
                  </Text>
                  <Text style={[styles.formSubtitle, { color: tc.text.secondary }]}>
                    {t('flipside.description')}
                  </Text>

                  <View style={styles.field}>
                    <Text style={[styles.label, { color: tc.text.secondary }]}>
                      {t('editProfile.displayName')}
                    </Text>
                    <TextInput
                      style={[styles.input, { color: tc.text.primary, borderColor: tc.border, backgroundColor: tc.surface }]}
                      value={displayName}
                      onChangeText={setDisplayName}
                      placeholder={t('editProfile.namePlaceholder')}
                      placeholderTextColor={tc.text.tertiary}
                      maxLength={50}
                    />
                  </View>

                  <View style={styles.field}>
                    <Text style={[styles.label, { color: tc.text.secondary }]}>
                      {t('editProfile.bio')}
                    </Text>
                    <TextInput
                      style={[styles.input, styles.multiline, { color: tc.text.primary, borderColor: tc.border, backgroundColor: tc.surface }]}
                      value={bio}
                      onChangeText={setBio}
                      placeholder={t('editProfile.bioPlaceholder')}
                      placeholderTextColor={tc.text.tertiary}
                      multiline
                      maxLength={500}
                      textAlignVertical="top"
                    />
                    <View style={styles.charCountWrap}>
                      <CharCountRing current={bio.length} max={500} size={24} />
                    </View>
                  </View>

                  <GradientButton
                    label={t('flipside.create')}
                    onPress={handleCreate}
                    loading={createMutation.isPending}
                    disabled={!displayName.trim() || createMutation.isPending}
                  />
                </LinearGradient>
              </Animated.View>
            )}
          </View>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </ScreenErrorBoundary>
    );
  }

  // ── Profile exists: show it ──
  const renderPost = ({ item, index }: { item: AltPost; index: number }) => (
    <Animated.View entering={FadeInUp.delay(Math.min(index * 40, 300)).duration(300)}>
      <LinearGradient
        colors={['rgba(45,53,72,0.3)', 'rgba(28,35,51,0.15)']}
        style={[styles.postCard, { borderColor: tc.border }]}
      >
        {item.content ? (
          <Text style={[styles.postContent, { color: tc.text.primary }]}>{item.content}</Text>
        ) : null}
        <Text style={[styles.postTime, { color: tc.text.tertiary }]}>
          {formatDistanceToNowStrict(new Date(item.createdAt), { addSuffix: true, locale: getDateFnsLocale() })}
        </Text>
      </LinearGradient>
    </Animated.View>
  );

  const listHeader = (
    <View>
      {/* Profile card */}
      <Animated.View entering={FadeInUp.duration(400)}>
        <LinearGradient
          colors={['rgba(45,53,72,0.35)', 'rgba(28,35,51,0.2)']}
          style={[styles.profileCard, { borderColor: tc.border }]}
        >
          <View style={[styles.profileHeader, { flexDirection: rtlFlexRow(isRTL) }]}>
            <Avatar
              uri={altProfile.avatarUrl ?? null}
              name={altProfile.displayName}
              size="xl"
            />
            <View style={styles.profileInfo}>
              <Text style={[styles.profileName, { color: tc.text.primary }]}>
                {altProfile.displayName}
              </Text>
              {altProfile.bio ? (
                <Text style={[styles.profileBio, { color: tc.text.secondary }]}>
                  {altProfile.bio}
                </Text>
              ) : null}
              <Text style={[styles.profileDate, { color: tc.text.tertiary }]}>
                {formatDistanceToNowStrict(new Date(altProfile.createdAt), { addSuffix: true, locale: getDateFnsLocale() })}
              </Text>
            </View>
          </View>

          {/* Edit form inline */}
          {isEditing ? (
            <View style={styles.editForm}>
              <View style={styles.field}>
                <Text style={[styles.label, { color: tc.text.secondary }]}>
                  {t('editProfile.displayName')}
                </Text>
                <TextInput
                  accessibilityLabel={t('accessibility.textInput')}
                  style={[styles.input, { color: tc.text.primary, borderColor: tc.border, backgroundColor: tc.surface }]}
                  value={displayName}
                  onChangeText={setDisplayName}
                  maxLength={50}
                />
              </View>
              <View style={styles.field}>
                <Text style={[styles.label, { color: tc.text.secondary }]}>
                  {t('editProfile.bio')}
                </Text>
                <TextInput
                  accessibilityLabel={t('accessibility.textInput')}
                  style={[styles.input, styles.multiline, { color: tc.text.primary, borderColor: tc.border, backgroundColor: tc.surface }]}
                  value={bio}
                  onChangeText={setBio}
                  multiline
                  maxLength={500}
                  textAlignVertical="top"
                />
              </View>
              <View style={[styles.editActions, { flexDirection: rtlFlexRow(isRTL) }]}>
                                <Pressable
                  accessibilityRole="button"
                  onPress={() => setIsEditing(false)}
                >
                  <Text style={[styles.cancelText, { color: tc.text.secondary }]}>{t('common.cancel')}</Text>
                </Pressable>
                <GradientButton
                  label={t('common.save')}
                  size="sm"
                  onPress={handleUpdate}
                  loading={updateMutation.isPending}
                  disabled={!displayName.trim() || updateMutation.isPending}
                />
              </View>
            </View>
          ) : (
            <View style={[styles.actionRow, { flexDirection: rtlFlexRow(isRTL) }]}>
              <GradientButton
                label={t('profile.editProfile')}
                size="sm"
                variant="secondary"
                icon="pencil"
                onPress={startEditing}
              />
              <Pressable
                style={[styles.accessBtn, { backgroundColor: tc.bgElevated }]}
                onPress={() => setShowAccessSheet(true)}
                accessibilityLabel={t('flipside.manageAccess')}
                accessibilityRole="button"
              >
                <Icon name="users" size="sm" color={tc.text.primary} />
                <Text style={[styles.accessBtnText, { color: tc.text.primary }]}>
                  {accessList.length}
                </Text>
              </Pressable>
              <Pressable
                style={styles.deleteBtn}
                onPress={handleDelete}
                accessibilityLabel={t('common.delete')}
                accessibilityRole="button"
              >
                <Icon name="trash" size="sm" color={colors.error} />
              </Pressable>
            </View>
          )}
        </LinearGradient>
      </Animated.View>

      {/* Posts section header */}
      <View style={[styles.sectionHeader, { borderTopColor: tc.border }]}>
        <Text style={[styles.sectionTitle, { color: tc.text.primary }]}>
          {t('flipside.postAsFlipside')}
        </Text>
      </View>
    </View>
  );

  return (
    <ScreenErrorBoundary>
      <SafeAreaView style={[styles.container, { backgroundColor: tc.bg }]} edges={['top']}>
        <GlassHeader
          title={t('flipside.title')}
          leftAction={{ icon: 'arrow-left', onPress: () => router.back() }}
        />

        <FlatList
          style={{ paddingTop: HEADER_HEIGHT }}
          data={posts}
          keyExtractor={(item) => item.id}
          renderItem={renderPost}
          ListHeaderComponent={listHeader}
          ListEmptyComponent={
            !postsQuery.isLoading ? (
              <EmptyState
                icon="edit"
                title={t('flipside.postAsFlipside')}
                subtitle={t('flipside.description')}
              />
            ) : (
              <View style={{ padding: spacing.base }}>
                <Skeleton.PostCard />
              </View>
            )
          }
          ListFooterComponent={
            postsQuery.isFetchingNextPage ? (
              <Skeleton.Rect width="100%" height={60} />
            ) : null
          }
          onEndReached={() => {
            if (postsQuery.hasNextPage && !postsQuery.isFetchingNextPage) {
              postsQuery.fetchNextPage();
            }
          }}
          onEndReachedThreshold={0.4}
          refreshControl={
            <BrandedRefreshControl
              refreshing={profileQuery.isRefetching || postsQuery.isRefetching}
              onRefresh={handleRefresh}
            />
          }
          contentContainerStyle={{ paddingBottom: spacing.xl }}
        />

        {/* Access list bottom sheet */}
        <BottomSheet visible={showAccessSheet} onClose={() => setShowAccessSheet(false)}>
          <View style={styles.accessSheetHeader}>
            <Text style={[styles.accessSheetTitle, { color: tc.text.primary }]}>
              {t('flipside.manageAccess')}
            </Text>
          </View>
          {accessList.length === 0 ? (
            <View style={styles.accessEmpty}>
              <Text style={[styles.accessEmptyText, { color: tc.text.secondary }]}>
                {t('flipside.addPeople')}
              </Text>
            </View>
          ) : (
            accessList.map((access) => (
              <BottomSheetItem
                key={access.id}
                label={access.user?.displayName ?? access.userId}
                icon={
                  <Avatar
                    uri={access.user?.avatarUrl ?? null}
                    name={access.user?.displayName ?? ''}
                    size="sm"
                  />
                }
                onPress={() => {
                  haptic.delete();
                  Alert.alert(
                    t('flipside.removePerson'),
                    t('flipside.removePersonConfirm', { name: access.user?.displayName ?? access.userId }),
                    [
                      { text: t('common.cancel'), style: 'cancel' },
                      {
                        text: t('flipside.removePerson'),
                        style: 'destructive',
                        onPress: () => removeAccessMutation.mutate(access.userId),
                      },
                    ],
                  );
                }}
                destructive
              />
            ))
          )}
        </BottomSheet>
      </SafeAreaView>
    </ScreenErrorBoundary>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  body: { flex: 1, padding: spacing.base },
  emptyContainer: { flex: 1, justifyContent: 'center' },

  // Create form
  createForm: { padding: spacing.base },
  formCard: {
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.active.white6,
    gap: spacing.md,
  },
  formTitle: { fontSize: fontSize.lg, fontFamily: fonts.bold },
  formSubtitle: { fontSize: fontSize.sm, lineHeight: 20 },
  field: { gap: spacing.xs },
  label: { fontSize: fontSize.sm, fontFamily: fonts.medium },
  input: {
    fontSize: fontSize.base,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderRadius: radius.sm,
  },
  multiline: { minHeight: 80, textAlignVertical: 'top' },
  charCountWrap: { alignItems: 'flex-end', marginTop: spacing.xs },

  // Profile card
  profileCard: {
    margin: spacing.base,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.active.white6,
  },
  profileHeader: { gap: spacing.md, alignItems: 'flex-start' },
  profileInfo: { flex: 1, gap: spacing.xs },
  profileName: { fontSize: fontSize.lg, fontFamily: fonts.bold },
  profileBio: { fontSize: fontSize.base, lineHeight: 20 },
  profileDate: { fontSize: fontSize.xs },

  // Actions
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  accessBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
  },
  accessBtnText: { fontSize: fontSize.sm, fontFamily: fonts.semibold },
  deleteBtn: {
    padding: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: 'rgba(248,81,73,0.1)',
  },

  // Edit form
  editForm: { marginTop: spacing.md, gap: spacing.md },
  editActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: spacing.md,
  },
  cancelText: { fontSize: fontSize.base },

  // Section
  sectionHeader: {
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    borderTopWidth: 0.5,
    borderTopColor: 'rgba(255,255,255,0.06)',
  },
  sectionTitle: { fontSize: fontSize.base, fontFamily: fonts.bold },

  // Post card
  postCard: {
    marginHorizontal: spacing.base,
    marginBottom: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.active.white6,
  },
  postContent: { fontSize: fontSize.base, lineHeight: 22 },
  postTime: { fontSize: fontSize.xs, marginTop: spacing.sm },

  // Access sheet
  accessSheetHeader: { padding: spacing.base },
  accessSheetTitle: { fontSize: fontSize.md, fontFamily: fonts.bold },
  accessEmpty: { padding: spacing.base },
  accessEmptyText: { fontSize: fontSize.base, textAlign: 'center' },
});
