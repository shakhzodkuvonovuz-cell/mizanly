import { useState, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, RefreshControl, Pressable, TextInput, Alert, Switch } from 'react-native';
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
import { useHaptic } from '@/hooks/useHaptic';
import { ScreenErrorBoundary } from '@/components/ui/ScreenErrorBoundary';

export default function MajlisListsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const haptic = useHaptic();
  const queryClient = useQueryClient();

  const [refreshing, setRefreshing] = useState(false);
  const [isSheetVisible, setIsSheetVisible] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [isPublic, setIsPublic] = useState(false);

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
      Alert.alert('Error', 'Failed to create list.');
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
      Alert.alert('Error', 'Failed to delete list.');
    },
  });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    haptic.light();
    await refetch();
    setRefreshing(false);
  }, [refetch, haptic]);

  const handleCreate = () => {
    if (!newName.trim()) {
      Alert.alert('Required', 'Please enter a name for the list.');
      return;
    }
    createMutation.mutate({ name: newName.trim(), description: newDesc.trim() || undefined, isPublic });
  };

  const confirmDelete = (id: string, name: string) => {
    Alert.alert(
      'Delete List',
      `Are you sure you want to delete "${name}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => deleteMutation.mutate(id) },
      ]
    );
  };

  const renderItem = ({ item, index }: { item: MajlisList; index: number }) => (
    <Animated.View entering={FadeInUp.delay(index * 50).duration(400)}>
      <Pressable onPress={() => router.push(`/(screens)/majlis-list/${item.id}` as never)}>
        <LinearGradient
          colors={['rgba(45,53,72,0.4)', 'rgba(28,35,51,0.2)']}
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
                <Icon name="lock" size={14} color={colors.text.tertiary} />
              )}
              <Text style={styles.name} numberOfLines={1}>{item.name}</Text>
            </View>
            {!!item.description && (
              <Text style={styles.desc} numberOfLines={2}>{item.description}</Text>
            )}
            <LinearGradient
              colors={['rgba(10,123,79,0.15)', 'rgba(200,150,62,0.1)']}
              style={styles.membersBadge}
            >
              <Icon name="users" size="xs" color={colors.gold} />
              <Text style={styles.membersText}>
                {item.membersCount || 0} members
              </Text>
            </LinearGradient>
          </View>
          <Pressable
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
      <View style={styles.container}>
        <GlassHeader 
          title="Majlis Lists" 
          leftAction={{ icon: 'arrow-left', onPress: () => router.back(), accessibilityLabel: 'Go back' }} 
        />
        <View style={{ height: insets.top + 52 }} />
        <EmptyState 
          icon="users" 
          title="Couldn't load lists" 
          subtitle="Check your connection and try again" 
          actionLabel="Retry" 
          onAction={() => refetch()} 
        />
      </View>
    );
  }

  if (isLoading && !lists) {
    return (
      <View style={styles.container}>
        <GlassHeader 
          title="Majlis Lists" 
          leftAction={{ icon: 'arrow-left', onPress: () => router.back(), accessibilityLabel: 'Go back' }} 
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
      <View style={styles.container}>
        <GlassHeader 
          title="Majlis Lists" 
          leftAction={{ icon: 'arrow-left', onPress: () => router.back(), accessibilityLabel: 'Go back' }} 
          rightAction={{ icon: 'plus', onPress: () => setIsSheetVisible(true), accessibilityLabel: 'Create list' }}
        />
      
        <FlatList
          data={lists || []}
          renderItem={renderItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={[styles.listContent, { paddingTop: insets.top + 52 + spacing.md }]}
          removeClippedSubviews={true}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.emerald} />
          }
          ListEmptyComponent={
            <View style={styles.emptyWrap}>
              <EmptyState 
                icon="users" 
                title="No lists" 
                subtitle="Create a list to curate threads" 
                actionLabel="Create List"
                onAction={() => setIsSheetVisible(true)}
              />
            </View>
          }
        />

        <BottomSheet visible={isSheetVisible} onClose={() => setIsSheetVisible(false)}>
          <View style={styles.sheetContent}>
            <Text style={styles.sheetTitle}>Create New List</Text>
          
            <Text style={styles.inputLabel}>Name</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. Friends, Tech news"
              placeholderTextColor={colors.text.secondary}
              value={newName}
              onChangeText={setNewName}
            />
          
            <Text style={styles.inputLabel}>Description (Optional)</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              placeholder="What's this list about?"
              placeholderTextColor={colors.text.secondary}
              value={newDesc}
              onChangeText={setNewDesc}
              multiline
              numberOfLines={3}
            />
          
            <View style={styles.toggleRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.toggleTitle}>Public List</Text>
                <Text style={styles.toggleDesc}>Anyone can see and subscribe to this list</Text>
              </View>
              <Switch 
                value={isPublic}
                onValueChange={setIsPublic}
                trackColor={{ false: colors.dark.surface, true: colors.emerald }}
                thumbColor={colors.dark.text}
              />
            </View>

            <View style={{ marginTop: spacing.xl }}>
              <GradientButton 
                title={createMutation.isPending ? "Creating..." : "Create List"}
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
    borderColor: 'rgba(255,255,255,0.06)',
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
