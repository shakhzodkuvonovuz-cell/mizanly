import React, { useState, useRef } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable, TextInput, Alert } from 'react-native';
import Animated, { FadeInUp, FadeIn } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { GlassHeader } from '@/components/ui/GlassHeader';
import { Icon } from '@/components/ui/Icon';
import type { IconName } from '@/components/ui/Icon';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { BottomSheet, BottomSheetItem } from '@/components/ui/BottomSheet';
import { ScreenErrorBoundary } from '@/components/ui/ScreenErrorBoundary';
import { colors, spacing, fontSize, radius, fonts } from '@/theme';
import { useContextualHaptic } from '@/hooks/useContextualHaptic';
import { useTranslation } from '@/hooks/useTranslation';
import { useThemeColors } from '@/hooks/useThemeColors';
import { BrandedRefreshControl } from '@/components/ui/BrandedRefreshControl';
import { showToast } from '@/components/ui/Toast';
import { api } from '@/services/api';

const FOLDER_ICONS: IconName[] = ['users', 'heart', 'globe', 'layers', 'bell', 'bookmark', 'flag', 'lock'];
const FOLDER_COLORS = [colors.emerald, colors.gold, colors.extended.blue, colors.extended.violet, colors.extended.red, colors.extended.purple, colors.extended.orange, colors.extended.greenBright];

interface PredefinedFilter {
  key: string;
  labelKey: string;
  icon: IconName;
  color: string;
  filter: (conv: Record<string, unknown>) => boolean;
}

const PREDEFINED_FILTERS: PredefinedFilter[] = [
  {
    key: 'unread',
    labelKey: 'risalah.unread',
    icon: 'bell',
    color: colors.extended.blue,
    filter: (c) => ((c.unreadCount as number) ?? 0) > 0,
  },
  {
    key: 'groups',
    labelKey: 'risalah.groups',
    icon: 'users',
    color: colors.emerald,
    filter: (c) => c.isGroup === true,
  },
  {
    key: 'channels',
    labelKey: 'risalah.channels',
    icon: 'globe',
    color: colors.gold,
    filter: (c) => c.isChannel === true,
  },
  {
    key: 'personal',
    labelKey: 'risalah.personal',
    icon: 'user',
    color: colors.extended.violet,
    filter: (c) => c.isGroup !== true && c.isChannel !== true,
  },
];

export default function ChatFoldersScreen() {
  const router = useRouter();
  const tc = useThemeColors();
  const haptic = useContextualHaptic();
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const [createMode, setCreateMode] = useState(false);
  const [newName, setNewName] = useState('');
  const [selectedIcon, setSelectedIcon] = useState(0);
  const [editingFolder, setEditingFolder] = useState<Record<string, unknown> | null>(null);
  const [menuFolder, setMenuFolder] = useState<Record<string, unknown> | null>(null);

  const foldersQuery = useQuery({
    queryKey: ['chat-folders'],
    queryFn: () => api.get<Array<Record<string, unknown>>>('/chat-folders'),
  });

  const createMutation = useMutation({
    mutationFn: () => api.post<Record<string, unknown>>('/chat-folders', { name: newName, icon: FOLDER_ICONS[selectedIcon] }),
    onSuccess: () => {
      setCreateMode(false);
      setNewName('');
      queryClient.invalidateQueries({ queryKey: ['chat-folders'] });
      haptic.success();
    },
    onError: () => {
      haptic.error();
      showToast({ message: t('risalah.errorCreateFolder', 'Failed to create folder'), variant: 'error' });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ folderId, name, icon }: { folderId: string; name: string; icon: string }) =>
      api.patch<Record<string, unknown>>(`/chat-folders/${folderId}`, { name, icon }),
    onSuccess: () => {
      setEditingFolder(null);
      setNewName('');
      queryClient.invalidateQueries({ queryKey: ['chat-folders'] });
      haptic.success();
    },
    onError: () => {
      haptic.error();
      showToast({ message: t('risalah.errorUpdateFolder', 'Failed to update folder'), variant: 'error' });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/chat-folders/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['chat-folders'] });
      setMenuFolder(null);
      haptic.delete();
      showToast({ message: t('risalah.folderDeleted'), variant: 'success' });
    },
    onError: () => {
      haptic.error();
      showToast({ message: t('risalah.errorDeleteFolder', 'Failed to delete folder'), variant: 'error' });
    },
  });

  const folders = Array.isArray(foldersQuery.data) ? foldersQuery.data : [];

  const renderFolder = ({ item, index }: { item: Record<string, unknown>; index: number }) => {
    const iconName = ((item.icon as string) || FOLDER_ICONS[index % FOLDER_ICONS.length]) as IconName;
    const color = FOLDER_COLORS[index % FOLDER_COLORS.length];
    const convCount = ((item.conversationIds as string[]) || []).length;

    return (
      <Animated.View entering={FadeInUp.delay(Math.min(index, 15) * 60).duration(300)}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={item.name as string}
          style={[styles.folderCard, { backgroundColor: tc.bgCard, borderColor: tc.border }]}
          onPress={() => {
            haptic.navigate();
            router.push(`/(screens)/chat-folder-view?filter=folder&folderId=${item.id as string}` as never);
          }}
          onLongPress={() => { setMenuFolder(item); haptic.longPress(); }}
        >
          <View style={[styles.folderIcon, { backgroundColor: color + '15' }]}>
            <Icon name={iconName} size="md" color={color} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.folderName, { color: tc.text.primary }]}>{item.name as string}</Text>
            <Text style={[styles.folderMeta, { color: tc.text.tertiary }]}>
              {t('risalah.chatCount', { count: convCount })}
              {Boolean(item.includeGroups) && ` · ${t('risalah.groups')}`}
              {Boolean(item.includeChannels) && ` · ${t('risalah.channels')}`}
            </Text>
          </View>
          <Icon name="chevron-right" size="sm" color={tc.text.tertiary} />
        </Pressable>
      </Animated.View>
    );
  };

  return (
    <ScreenErrorBoundary>
      <View style={[styles.container, { backgroundColor: tc.bg }]}>
        <GlassHeader
          title={t('risalah.chatFolders')}
          leftAction={{ icon: 'arrow-left', onPress: () => router.back() }}
          rightAction={{ icon: 'plus', onPress: () => { setCreateMode(true); haptic.tick(); } }}
        />

        {/* Info */}
        <Animated.View entering={FadeIn.duration(300)} style={styles.infoCard}>
          <LinearGradient colors={[colors.emerald + '10', 'transparent']} style={styles.infoGradient}>
            <Icon name="layers" size="sm" color={colors.emerald} />
            <Text style={[styles.infoText, { color: tc.text.secondary }]}>
              {t('risalah.chatFoldersDescription')}
            </Text>
          </LinearGradient>
        </Animated.View>

        {/* Predefined filters */}
        <View style={styles.predefinedSection}>
          <Text style={[styles.sectionLabel, { color: tc.text.secondary }]}>{t('risalah.quickFilters')}</Text>
          <View style={styles.predefinedGrid}>
            {PREDEFINED_FILTERS.map((pf) => (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t(pf.labelKey)}
                key={pf.key}
                style={[styles.predefinedCard, { backgroundColor: tc.bgCard, borderColor: tc.border }]}
                onPress={() => {
                  haptic.navigate();
                  router.push(`/(screens)/chat-folder-view?filter=${pf.key}` as never);
                }}
              >
                <View style={[styles.predefinedIconWrap, { backgroundColor: pf.color + '15' }]}>
                  <Icon name={pf.icon} size="sm" color={pf.color} />
                </View>
                <Text style={[styles.predefinedLabel, { color: tc.text.primary }]}>{t(pf.labelKey)}</Text>
              </Pressable>
            ))}
          </View>
        </View>

        {/* Custom folders label */}
        <View style={styles.predefinedSection}>
          <Text style={[styles.sectionLabel, { color: tc.text.secondary }]}>{t('risalah.customFolders')}</Text>
        </View>

        {/* Create form */}
        {createMode && (
          <Animated.View entering={FadeIn.duration(200)} style={[styles.createCard, { backgroundColor: tc.bgCard }]}>
            <Text style={[styles.createTitle, { color: tc.text.primary }]}>{editingFolder ? t('risalah.editFolder') : t('risalah.newFolder')}</Text>

            <TextInput
              style={[styles.createInput, { backgroundColor: tc.surface, borderColor: tc.border, color: tc.text.primary }]}
              value={newName}
              onChangeText={setNewName}
              placeholder={t('risalah.folderNamePlaceholder')}
              placeholderTextColor={tc.text.tertiary}
              maxLength={50}
              autoFocus
            />

            <Text style={[styles.iconLabel, { color: tc.text.secondary }]}>{t('risalah.icon')}</Text>

            <View style={styles.iconGrid}>
              {FOLDER_ICONS.map((icon, i) => (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={icon}
                  key={icon}
                  style={[styles.iconOption, { backgroundColor: tc.surface }, selectedIcon === i && { borderColor: FOLDER_COLORS[i] }]}
                  onPress={() => { setSelectedIcon(i); haptic.tick(); }}
                >
                  <Icon name={icon} size="sm" color={selectedIcon === i ? FOLDER_COLORS[i] : tc.text.secondary} />
                </Pressable>
              ))}
            </View>

            <View style={styles.createActions}>
              <Pressable accessibilityRole="button" accessibilityLabel={t('common.cancel')} onPress={() => { setCreateMode(false); setEditingFolder(null); setNewName(''); haptic.tick(); }} style={[styles.cancelBtn, { backgroundColor: tc.surface }]}>
                <Text style={[styles.cancelText, { color: tc.text.secondary }]}>{t('common.cancel')}</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={editingFolder ? t('common.save') : t('common.create')}
                style={[styles.createBtn, !newName.trim() && { opacity: 0.5 }]}
                onPress={() => {
                  if (!newName.trim()) return;
                  if (editingFolder) {
                    updateMutation.mutate({
                      folderId: editingFolder.id as string,
                      name: newName.trim(),
                      icon: FOLDER_ICONS[selectedIcon],
                    });
                  } else {
                    createMutation.mutate();
                  }
                }}
                disabled={!newName.trim() || createMutation.isPending || updateMutation.isPending}
              >
                <LinearGradient colors={[colors.emerald, colors.emeraldDark]} style={styles.createBtnGradient}>
                  <Text style={styles.createBtnText}>{editingFolder ? t('common.save') : t('common.create')}</Text>
                </LinearGradient>
              </Pressable>
            </View>
          </Animated.View>
        )}

        {/* Folders list */}
        <FlatList
          data={folders}
          renderItem={renderFolder}
          keyExtractor={(item) => item.id as string}
          contentContainerStyle={styles.list}
          refreshControl={
            <BrandedRefreshControl refreshing={foldersQuery.isRefetching} onRefresh={() => foldersQuery.refetch()} />
          }
          ListEmptyComponent={
            foldersQuery.isLoading ? (
              <View style={styles.skeletons}>
                {[1, 2, 3].map(i => <Skeleton.Rect key={i} width="100%" height={72} borderRadius={radius.lg} />)}
              </View>
            ) : (
              <EmptyState
                icon="layers"
                title={t('risalah.noFoldersYet')}
                subtitle={t('risalah.createFoldersHint')}
                actionLabel={t('risalah.createFolder')}
                onAction={() => setCreateMode(true)}
              />
            )
          }
        />

        {/* Context menu */}
        <BottomSheet visible={!!menuFolder} onClose={() => setMenuFolder(null)}>
          <BottomSheetItem
            label={t('risalah.editFolder')}
            icon={<Icon name="pencil" size="sm" color={tc.text.primary} />}
            onPress={() => {
              const folder = menuFolder;
              setMenuFolder(null);
              if (folder) {
                setEditingFolder(folder);
                setNewName((folder.name as string) || '');
                const iconIdx = FOLDER_ICONS.indexOf((folder.icon as IconName) || 'users');
                setSelectedIcon(iconIdx >= 0 ? iconIdx : 0);
                setCreateMode(true);
              }
            }}
          />
          <BottomSheetItem
            label={t('risalah.deleteFolder')}
            icon={<Icon name="trash" size="sm" color={colors.error} />}
            destructive
            onPress={() => {
              if (!menuFolder) return;
              const folderId = menuFolder.id as string;
              const folderName = (menuFolder.name as string) || t('risalah.folder');
              setMenuFolder(null);
              Alert.alert(
                t('risalah.deleteFolderTitle', 'Delete Folder'),
                t('risalah.deleteFolderMessage', { name: folderName }),
                [
                  { text: t('common.cancel', 'Cancel'), style: 'cancel' },
                  {
                    text: t('common.delete', 'Delete'),
                    style: 'destructive',
                    onPress: () => deleteMutation.mutate(folderId),
                  },
                ],
              );
            }}
          />
        </BottomSheet>
      </View>
    </ScreenErrorBoundary>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  infoCard: { marginHorizontal: spacing.base, marginBottom: spacing.md, borderRadius: radius.md, overflow: 'hidden' },
  infoGradient: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.md, borderRadius: radius.md },
  infoText: { fontSize: fontSize.xs, fontFamily: fonts.body, flex: 1, lineHeight: 18 },
  createCard: { marginHorizontal: spacing.base, marginBottom: spacing.md, borderRadius: radius.lg, padding: spacing.base, borderWidth: 1, borderColor: colors.emerald + '30' },
  createTitle: { fontSize: fontSize.md, fontFamily: fonts.bodyBold, marginBottom: spacing.md },
  createInput: { borderRadius: radius.md, padding: spacing.md, fontSize: fontSize.base, fontFamily: fonts.body, borderWidth: 1, marginBottom: spacing.md },
  iconLabel: { fontSize: fontSize.sm, fontFamily: fonts.bodyMedium, marginBottom: spacing.sm },
  iconGrid: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap', marginBottom: spacing.md },
  iconOption: { width: 40, height: 40, borderRadius: radius.md, justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: 'transparent' },
  createActions: { flexDirection: 'row', gap: spacing.md },
  cancelBtn: { flex: 1, paddingVertical: spacing.md, alignItems: 'center', borderRadius: radius.md },
  cancelText: { fontSize: fontSize.base, fontFamily: fonts.bodyMedium },
  createBtn: { flex: 1, borderRadius: radius.md, overflow: 'hidden' },
  createBtnGradient: { paddingVertical: spacing.md, alignItems: 'center', borderRadius: radius.md },
  createBtnText: { color: colors.extended.white, fontSize: fontSize.base, fontFamily: fonts.bodyBold },
  list: { paddingHorizontal: spacing.base, paddingBottom: spacing['2xl'] },
  skeletons: { gap: spacing.sm },
  folderCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.base, borderRadius: radius.lg, borderWidth: 1, marginBottom: spacing.sm },
  folderIcon: { width: 48, height: 48, borderRadius: radius.md, justifyContent: 'center', alignItems: 'center' },
  folderName: { fontSize: fontSize.base, fontFamily: fonts.bodySemiBold },
  folderMeta: { fontSize: fontSize.xs, fontFamily: fonts.body, marginTop: 2 },
  predefinedSection: { paddingHorizontal: spacing.base, marginBottom: spacing.md },
  sectionLabel: { fontSize: fontSize.sm, fontFamily: fonts.bodySemiBold, marginBottom: spacing.sm, textTransform: 'uppercase' as const, letterSpacing: 0.5 },
  predefinedGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  predefinedCard: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md, paddingVertical: spacing.md,
    borderWidth: 1,
    width: '48%' as unknown as number,
  },
  predefinedIconWrap: { width: 36, height: 36, borderRadius: radius.sm, justifyContent: 'center', alignItems: 'center' },
  predefinedLabel: { fontSize: fontSize.sm, fontFamily: fonts.bodySemiBold, flex: 1 },
});
