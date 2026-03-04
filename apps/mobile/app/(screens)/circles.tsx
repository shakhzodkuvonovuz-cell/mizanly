import { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Pressable,
  FlatList, ActivityIndicator, Alert, TextInput,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Icon } from '@/components/ui/Icon';
import { EmptyState } from '@/components/ui/EmptyState';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Skeleton } from '@/components/ui/Skeleton';
import { colors, spacing, fontSize, radius } from '@/theme';
import { circlesApi } from '@/services/api';

const EMOJIS = ['⭕', '⭐', '🌙', '🤝', '💚', '🕌', '📿', '🏠', '💼', '🎓'];

interface Circle {
  id: string;
  name: string;
  emoji?: string;
  _count?: { members: number };
}

function CreateSheet({
  visible,
  onClose,
  onCreated,
}: {
  visible: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState('');
  const [emoji, setEmoji] = useState('⭕');

  const createMutation = useMutation({
    mutationFn: () => circlesApi.create(name.trim(), emoji),
    onSuccess: () => {
      setName('');
      setEmoji('⭕');
      onCreated();
      onClose();
    },
    onError: (err: Error) => Alert.alert('Error', err.message),
  });

  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <Text style={styles.sheetTitle}>New Circle</Text>

      {/* Emoji picker */}
      <View style={styles.emojiRow}>
        {EMOJIS.map((e) => (
          <TouchableOpacity
            key={e}
            style={[styles.emojiBtn, emoji === e && styles.emojiBtnActive]}
            onPress={() => setEmoji(e)}
          >
            <Text style={styles.emojiText}>{e}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Name input */}
      <TextInput
        style={styles.nameInput}
        value={name}
        onChangeText={setName}
        placeholder="Circle name (e.g. Family, Close Friends)"
        placeholderTextColor={colors.text.tertiary}
        maxLength={40}
        autoFocus
      />

      <TouchableOpacity
        style={[styles.createBtn, (!name.trim() || createMutation.isPending) && styles.createBtnDisabled]}
        onPress={() => createMutation.mutate()}
        disabled={!name.trim() || createMutation.isPending}
      >
        {createMutation.isPending ? (
          <ActivityIndicator color="#fff" size="small" />
        ) : (
          <Text style={styles.createBtnText}>Create Circle</Text>
        )}
      </TouchableOpacity>
    </BottomSheet>
  );
}

export default function CirclesScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);

  const circlesQuery = useQuery({
    queryKey: ['my-circles'],
    queryFn: () => circlesApi.getMyCircles(),
  });

  const circles: Circle[] = (circlesQuery.data as Circle[]) ?? [];

  const deleteMutation = useMutation({
    mutationFn: (id: string) => circlesApi.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['my-circles'] }),
    onError: (err: Error) => Alert.alert('Error', err.message),
  });

  const handleDelete = (circle: Circle) => {
    Alert.alert(
      `Delete "${circle.name}"?`,
      'This will remove the circle and all its members.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete', style: 'destructive',
          onPress: () => deleteMutation.mutate(circle.id),
        },
      ],
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={8} style={styles.backBtn}>
          <Icon name="arrow-left" size="md" color={colors.text.primary} />
        </Pressable>
        <Text style={styles.headerTitle}>Circles</Text>
        <Pressable onPress={() => setShowCreate(true)} hitSlop={8}>
          <Icon name="plus" size="md" color={colors.emerald} />
        </Pressable>
      </View>

      <Text style={styles.subtitle}>
        Share posts with specific groups of people
      </Text>

      {circlesQuery.isLoading ? (
        <View style={styles.skeletonList}>
          {Array.from({ length: 4 }).map((_, i) => (
            <View key={i} style={styles.skeletonRow}>
              <Skeleton.Circle size={48} />
              <View style={{ flex: 1, gap: 6 }}>
                <Skeleton.Rect width={130} height={14} />
                <Skeleton.Rect width={80} height={11} />
              </View>
            </View>
          ))}
        </View>
      ) : (
        <FlatList
          data={circles}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <View style={styles.circleRow}>
              <View style={styles.circleIcon}>
                <Text style={styles.circleEmoji}>{item.emoji ?? '⭕'}</Text>
              </View>
              <View style={styles.circleInfo}>
                <Text style={styles.circleName}>{item.name}</Text>
                <Text style={styles.circleMemberCount}>
                  {item._count?.members ?? 0} members
                </Text>
              </View>
              <TouchableOpacity
                hitSlop={8}
                onPress={() => handleDelete(item)}
                style={styles.deleteBtn}
              >
                <Icon name="trash" size="sm" color={colors.text.tertiary} />
              </TouchableOpacity>
            </View>
          )}
          ListEmptyComponent={() => (
            <EmptyState
              icon="users"
              title="No circles yet"
              subtitle="Create circles to share posts with specific groups"
              actionLabel="Create your first circle"
              onAction={() => setShowCreate(true)}
            />
          )}
        />
      )}

      <CreateSheet
        visible={showCreate}
        onClose={() => setShowCreate(false)}
        onCreated={() => queryClient.invalidateQueries({ queryKey: ['my-circles'] })}
      />
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

  subtitle: {
    color: colors.text.secondary, fontSize: fontSize.sm,
    paddingHorizontal: spacing.base, paddingTop: spacing.md, paddingBottom: spacing.sm,
  },

  skeletonList: { paddingHorizontal: spacing.base, paddingTop: spacing.lg, gap: spacing.lg },
  skeletonRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  list: { paddingHorizontal: spacing.base, paddingBottom: 40 },

  circleRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: 0.5, borderBottomColor: colors.dark.border,
  },
  circleIcon: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: 'rgba(10,123,79,0.12)',
    alignItems: 'center', justifyContent: 'center',
  },
  circleEmoji: { fontSize: 24 },
  circleInfo: { flex: 1 },
  circleName: { color: colors.text.primary, fontSize: fontSize.base, fontWeight: '600' },
  circleMemberCount: { color: colors.text.secondary, fontSize: fontSize.sm, marginTop: 2 },
  deleteBtn: { padding: 4 },


  // Sheet content
  sheetTitle: {
    color: colors.text.primary, fontSize: fontSize.base, fontWeight: '700',
    textAlign: 'center', marginBottom: spacing.lg,
    paddingHorizontal: spacing.base,
  },
  emojiRow: {
    flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm,
    justifyContent: 'center', marginBottom: spacing.lg,
    paddingHorizontal: spacing.base,
  },
  emojiBtn: {
    width: 44, height: 44, borderRadius: 22, borderWidth: 1.5,
    borderColor: 'transparent', alignItems: 'center', justifyContent: 'center',
  },
  emojiBtnActive: { borderColor: colors.emerald, backgroundColor: 'rgba(10,123,79,0.1)' },
  emojiText: { fontSize: 24 },
  nameInput: {
    backgroundColor: colors.dark.bgElevated, borderRadius: radius.md,
    paddingHorizontal: spacing.md, paddingVertical: spacing.md,
    color: colors.text.primary, fontSize: fontSize.base,
    marginBottom: spacing.lg, marginHorizontal: spacing.base,
  },
  createBtn: {
    backgroundColor: colors.emerald, borderRadius: radius.full,
    paddingVertical: spacing.md, alignItems: 'center',
    marginHorizontal: spacing.base,
  },
  createBtnDisabled: { backgroundColor: colors.dark.surface },
  createBtnText: { color: '#fff', fontSize: fontSize.base, fontWeight: '700' },
});
