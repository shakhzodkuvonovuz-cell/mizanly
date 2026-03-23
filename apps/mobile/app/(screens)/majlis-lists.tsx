import { useState, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable, TextInput, Alert, Switch } from 'react-native';
import { showToast } from '@/components/ui/Toast';
import { useRouter } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';

import { GlassHeader } from '@/components/ui/GlassHeader';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Icon } from '@/components/ui/Icon';
import { GradientButton } from '@/components/ui/GradientButton';
import { colors, spacing, fontSize, radius } from '@/theme';
import { majlisListsApi } from '@/services/api';
import type { MajlisList } from '@/types';
import { useContextualHaptic } from '@/hooks/useContextualHaptic';
import { BrandedRefreshControl } from '@/components/ui/BrandedRefreshControl';
import { ScreenErrorBoundary } from '@/components/ui/ScreenErrorBoundary';
import { useTranslation } from '@/hooks/useTranslation';
import { useThemeColors } from '@/hooks/useThemeColors';
import { navigate } from '@/utils/navigation';

export default function MajlisListsScreen() {
  const { t, isRTL } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const haptic = useContextualHaptic();
  const queryClient = useQueryClient();

  const [refreshing, setRefreshing] = useState(false);
  const [isSheetVisible, setIsSheetVisible] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [isPublic, setIsPublic] = useState(false);
  const tc = useThemeColors();

  const { data: lists, isLoading, isError, refetch } = useQuery({
    queryKey: ['majlis-lists'],
    queryFn: () => majlisListsApi.getLists(),
  });

  const createMutation = useMutation({
    mutationFn: (data: { name: string; description?: string; isPublic: boolean }) =>
      majlisListsApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['majlis-lists'] });
      setIsSheetVisible(false);
      setNewName('');
      setNewDesc('');
      setIsPublic(false);
      haptic.success();
    },
    onError: () => {
      haptic.error();
      showToast({ message: t('screens.majlis-lists.errorCreate'), variant: 'error' });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => majlisListsApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['majlis-lists'] });
      haptic.success();
    },
    onError: () => {
      haptic.error();
      showToast({ message: t('screens.majlis-lists.errorDelete'), variant: 'error' });
    },
  });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    haptic.navigate();
    await refetch();
    setRefreshing(false);
  }, [refetch, haptic]);

  const handleCreate = () => {
    if (!newName.trim()) {
      showToast({ message: t('screens.majlis-lists.requiredName'), variant: 'error' });
      return;
    }
    createMutation.mutate({ name: newName.trim(), description: newDesc.trim() || undefined, isPublic });
  };

  const confirmDelete = (id: string, name: string) => {
    Alert.alert(
      t('screens.majlis-lists.deleteConfirmTitle'),
      t('screens.majlis-lists.deleteConfirmMessage', { name }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('common.delete'), style: 'destructive', onPress: () => deleteMutation.mutate(id) },
      ]
    );
  };

  const renderItem = ({ item, index }: { item: MajlisList; index: number }) => (
    <Animated.View entering={FadeInUp.delay(index * 50).duration(400)}>
      <Pressable accessibilityRole="button" accessibilityLabel={item.name} onPress={() => navigate(`/(screens)/majlis-list/${item.id}`)}>
        <LinearGradient
          colors={colors.gradient.cardDark}
          style={styles.card}
        >
          <LinearGradient
            colors={['rgba(10,123,79,0.2)', 'rgba(200,150,62,0.1)']}
            style={styles.iconBg}
          >
            <Icon name="users" size="md" color={colors.emerald} />
          </LinearGradient>
          <View style={styles.cardInfo}>
            <View style={styles.titleRow}>
              {!item.isPublic && (
                <Icon name="lock" size={14} color={tc.text.tertiary} />
              )}
              <Text style={[styles.name, { color: tc.text.primary }]} numberOfLines={1}>{item.name}</Text>
            </View>
            {!!item.description && (
              <Text style={[styles.desc, { color: tc.text.secondary }]} numberOfLines={2}>{item.description}</Text>
            )}
            <LinearGradient
              colors={['rgba(10,123,79,0.15)', 'rgba(200,150,62,0.1)']}
              style={styles.membersBadge}
            >
              <Icon name="users" size="xs" color={colors.gold} />
              <Text style={styles.membersText}>
                {item.membersCount || 0} {t('screens.majlis-lists.members')}
              </Text>
            </LinearGradient>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${t('common.delete')} ${item.name}`}
            hitSlop={8}
            onPress={() => confirmDelete(item.id, item.name)}
          >
            <LinearGradient
              colors={['rgba(248,81,73,0.2)', 'rgba(248,81,73,0.1)']}
              style={styles.deleteButton}
            >
              <Icon name="trash" size={18} color={colors.error} />
            </LinearGradient>
          </Pressable>
        </LinearGradient>
      </Pressable>
    </Animated.View>
  );

  if (isError) {
    return (
      <View style={[styles.container, { backgroundColor: tc.bg }]}>
        <GlassHeader
          title={t('screens.majlis-lists.title')}
          leftAction={{ icon: 'arrow-left', onPress: () => router.back(), accessibilityLabel: t('common.back') }}
        />
        <View style={{ height: insets.top + 52 }} />
        <EmptyState
          icon="users"
          title={t('screens.majlis-lists.errorTitle')}
          subtitle={t('screens.majlis-lists.errorSubtitle')}
          actionLabel={t('common.retry')}
          onAction={() => refetch()}
        />
      </View>
    );
  }

  if (isLoading && !lists) {
    return (
      <View style={[styles.container, { backgroundColor: tc.bg }]}>
        <GlassHeader
          title={t('screens.majlis-lists.title')}
          leftAction={{ icon: 'arrow-left', onPress: () => router.back(), accessibilityLabel: t('common.back') }}
        />
        <View style={{ height: insets.top + 52 }} />
        <View style={{ padding: spacing.base, gap: spacing.md }}>
          <Skeleton.Rect width="100%" height={80} borderRadius={radius.md} />
          <Skeleton.Rect width="100%" height={80} borderRadius={radius.md} />
        </View>
      </View>
    );
  }

  return (
    <ScreenErrorBoundary>
      <View style={[styles.container, { backgroundColor: tc.bg }]}>
        <GlassHeader
          title={t('screens.majlis-lists.title')}
          leftAction={{ icon: 'arrow-left', onPress: () => router.back(), accessibilityLabel: t('common.back') }}
          rightAction={{ icon: 'plus', onPress: () => setIsSheetVisible(true), accessibilityLabel: t('screens.majlis-lists.createList') }}
        />
      
        <FlatList
          data={lists || []}
          renderItem={renderItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={[styles.listContent, { paddingTop: insets.top + 52 + spacing.md }]}
          removeClippedSubviews={true}
          refreshControl={
            <BrandedRefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
          ListEmptyComponent={
            <View style={styles.emptyWrap}>
              <EmptyState
                icon="users"
                title={t('screens.majlis-lists.emptyTitle')}
                subtitle={t('screens.majlis-lists.emptySubtitle')}
                actionLabel={t('screens.majlis-lists.createList')}
                onAction={() => setIsSheetVisible(true)}
              />
            </View>
          }
        />

        <BottomSheet visible={isSheetVisible} onClose={() => setIsSheetVisible(false)}>
          <View style={styles.sheetContent}>
            <Text style={[styles.sheetTitle, { color: tc.text.primary }]}>{t('screens.majlis-lists.createNew')}</Text>

            <Text style={[styles.inputLabel, { color: tc.text.secondary }]}>{t('screens.majlis-lists.name')}</Text>
            <TextInput
              style={[styles.input, { backgroundColor: tc.surface }]}
              placeholder={t('screens.majlis-lists.namePlaceholder')}
              placeholderTextColor={tc.text.secondary}
              value={newName}
              onChangeText={setNewName}
            />

            <Text style={[styles.inputLabel, { color: tc.text.secondary }]}>{t('screens.majlis-lists.descriptionOptional')}</Text>
            <TextInput
              style={[styles.input, { backgroundColor: tc.surface }, styles.textArea]}
              placeholder={t('screens.majlis-lists.descPlaceholder')}
              placeholderTextColor={tc.text.secondary}
              value={newDesc}
              onChangeText={setNewDesc}
              multiline
              numberOfLines={3}
            />

            <View style={styles.toggleRow}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.toggleTitle, { color: tc.text.primary }]}>{t('screens.majlis-lists.publicList')}</Text>
                <Text style={[styles.toggleDesc, { color: tc.text.secondary }]}>{t('screens.majlis-lists.publicListDesc')}</Text>
              </View>
              <Switch
                value={isPublic}
                onValueChange={setIsPublic}
                trackColor={{ false: tc.surface, true: colors.emerald }}
                thumbColor={tc.text.primary}
                accessibilityRole="switch"
                accessibilityLabel={t('screens.majlis-lists.publicList')}
                accessibilityState={{ checked: isPublic }}
              />
            </View>

            <View style={{ marginTop: spacing.xl }}>
              <GradientButton 
                label={createMutation.isPending ? t('screens.majlis-lists.creating') : t('screens.majlis-lists.createList')}
                onPress={handleCreate}
                disabled={createMutation.isPending || newName.trim().length === 0}
              />
            </View>
          </View>
        </BottomSheet>
      </View>
  
    </ScreenErrorBoundary>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.dark.bg
  },
  listContent: {
    paddingBottom: spacing['2xl'],
    paddingHorizontal: spacing.base,
    gap: spacing.md,
  },
  emptyWrap: {
    marginTop: spacing['2xl'],
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.base,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.active.white6,
    gap: spacing.md,
  },
  iconBg: {
    width: 44,
    height: 44,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardInfo: {
    flex: 1,
    gap: 4,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  name: {
    fontSize: fontSize.base,
    fontWeight: '600',
    color: colors.text.primary,
  },
  desc: {
    fontSize: fontSize.sm,
    color: colors.text.secondary,
  },
  membersBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.sm,
    marginTop: 4,
  },
  membersText: {
    fontSize: fontSize.xs,
    color: colors.gold,
    fontWeight: '600',
  },
  deleteButton: {
    padding: spacing.sm,
    borderRadius: radius.full,
  },
  sheetContent: {
    padding: spacing.base,
    paddingBottom: spacing['2xl'],
  },
  sheetTitle: {
    fontSize: fontSize.lg,
    fontWeight: '700',
    color: colors.text.primary,
    marginBottom: spacing.xl,
  },
  inputLabel: {
    fontSize: fontSize.sm,
    fontWeight: '500',
    color: colors.text.secondary,
    marginBottom: spacing.xs,
  },
  input: {
    backgroundColor: colors.dark.surface,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    color: colors.text.primary,
    fontSize: fontSize.base,
    marginBottom: spacing.md,
  },
  textArea: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.md,
    paddingVertical: spacing.sm,
  },
  toggleTitle: {
    fontSize: fontSize.base,
    fontWeight: '500',
    color: colors.text.primary,
  },
  toggleDesc: {
    fontSize: fontSize.xs,
    color: colors.text.secondary,
    marginTop: 2,
  },
});
