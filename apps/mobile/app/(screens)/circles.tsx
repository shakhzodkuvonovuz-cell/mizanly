import { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  FlatList, ActivityIndicator, Alert, TextInput, Modal, Pressable,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, spacing, fontSize } from '@/theme';
import { circlesApi } from '@/services/api';

const EMOJIS = ['⭕', '⭐', '🌙', '🤝', '💚', '🕌', '📿', '🏠', '💼', '🎓'];

interface Circle {
  id: string;
  name: string;
  emoji?: string;
  _count?: { members: number };
}

function CreateModal({
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
    <Modal visible={visible} transparent animationType="slide">
      <Pressable style={styles.modalOverlay} onPress={onClose}>
        <Pressable style={styles.sheet}>
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
        </Pressable>
      </Pressable>
    </Modal>
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
        <TouchableOpacity onPress={() => router.back()} hitSlop={8} style={styles.backBtn}>
          <Text style={styles.backIcon}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Circles</Text>
        <TouchableOpacity onPress={() => setShowCreate(true)} hitSlop={8}>
          <Text style={styles.addIcon}>＋</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.subtitle}>
        Share posts with specific groups of people
      </Text>

      {circlesQuery.isLoading ? (
        <ActivityIndicator color={colors.emerald} style={styles.loader} />
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
                <Text style={styles.deleteBtnText}>🗑️</Text>
              </TouchableOpacity>
            </View>
          )}
          ListEmptyComponent={() => (
            <View style={styles.empty}>
              <Text style={styles.emptyIcon}>⭕</Text>
              <Text style={styles.emptyTitle}>No circles yet</Text>
              <Text style={styles.emptyText}>
                Create circles to share posts with specific groups
              </Text>
              <TouchableOpacity
                style={styles.createFirstBtn}
                onPress={() => setShowCreate(true)}
              >
                <Text style={styles.createFirstBtnText}>Create your first circle</Text>
              </TouchableOpacity>
            </View>
          )}
        />
      )}

      <CreateModal
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
  backIcon: { color: colors.text.primary, fontSize: 22 },
  headerTitle: { color: colors.text.primary, fontSize: fontSize.base, fontWeight: '700' },
  addIcon: { color: colors.emerald, fontSize: 24, fontWeight: '300', width: 36, textAlign: 'right' },

  subtitle: {
    color: colors.text.secondary, fontSize: fontSize.sm,
    paddingHorizontal: spacing.base, paddingTop: spacing.md, paddingBottom: spacing.sm,
  },

  loader: { marginTop: 60 },
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
  deleteBtnText: { fontSize: 18 },

  empty: { alignItems: 'center', paddingTop: 80, gap: spacing.md, paddingHorizontal: spacing.xl },
  emptyIcon: { fontSize: 48 },
  emptyTitle: { color: colors.text.primary, fontSize: fontSize.lg, fontWeight: '700' },
  emptyText: { color: colors.text.secondary, fontSize: fontSize.base, textAlign: 'center' },
  createFirstBtn: {
    backgroundColor: colors.emerald, borderRadius: 24,
    paddingHorizontal: spacing.xl, paddingVertical: spacing.md,
    marginTop: spacing.md,
  },
  createFirstBtnText: { color: '#fff', fontSize: fontSize.base, fontWeight: '700' },

  // Modal
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.dark.bgSheet, borderTopLeftRadius: 20, borderTopRightRadius: 20,
    paddingHorizontal: spacing.base, paddingTop: spacing.lg, paddingBottom: spacing.xl,
  },
  sheetTitle: {
    color: colors.text.primary, fontSize: fontSize.lg, fontWeight: '700',
    textAlign: 'center', marginBottom: spacing.lg,
  },
  emojiRow: {
    flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm,
    justifyContent: 'center', marginBottom: spacing.lg,
  },
  emojiBtn: {
    width: 44, height: 44, borderRadius: 22, borderWidth: 1.5,
    borderColor: 'transparent', alignItems: 'center', justifyContent: 'center',
  },
  emojiBtnActive: { borderColor: colors.emerald, backgroundColor: 'rgba(10,123,79,0.1)' },
  emojiText: { fontSize: 24 },
  nameInput: {
    backgroundColor: colors.dark.bgElevated, borderRadius: 12,
    paddingHorizontal: spacing.md, paddingVertical: spacing.md,
    color: colors.text.primary, fontSize: fontSize.base,
    marginBottom: spacing.lg,
  },
  createBtn: {
    backgroundColor: colors.emerald, borderRadius: 24,
    paddingVertical: spacing.md, alignItems: 'center',
  },
  createBtnDisabled: { backgroundColor: colors.dark.surface },
  createBtnText: { color: '#fff', fontSize: fontSize.base, fontWeight: '700' },
});
