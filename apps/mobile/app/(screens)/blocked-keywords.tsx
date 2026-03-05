import { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, Pressable, FlatList,
  TextInput, TouchableOpacity, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Icon } from '@/components/ui/Icon';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { colors, spacing, fontSize } from '@/theme';
import { settingsApi } from '@/services/api';
import type { BlockedKeyword } from '@/types';

export default function BlockedKeywordsScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [newWord, setNewWord] = useState('');

  const { data: keywords = [], isLoading } = useQuery<BlockedKeyword[]>({
    queryKey: ['blocked-keywords'],
    queryFn: () => settingsApi.getBlockedKeywords(),
  });

  const addMutation = useMutation({
    mutationFn: (word: string) => settingsApi.addBlockedKeyword(word),
    onSuccess: () => {
      setNewWord('');
      queryClient.invalidateQueries({ queryKey: ['blocked-keywords'] });
    },
    onError: (err: Error) => Alert.alert('Error', err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => settingsApi.deleteBlockedKeyword(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['blocked-keywords'] }),
    onError: (err: Error) => Alert.alert('Error', err.message),
  });

  const handleAdd = useCallback(() => {
    const word = newWord.trim();
    if (!word) return;
    addMutation.mutate(word);
  }, [newWord, addMutation]);

  const handleDelete = useCallback((id: string, word: string) => {
    Alert.alert('Remove keyword', `Remove "${word}" from blocked keywords?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => deleteMutation.mutate(id) },
    ]);
  }, [deleteMutation]);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={8} style={styles.backBtn}>
          <Icon name="arrow-left" size="md" color={colors.text.primary} />
        </Pressable>
        <Text style={styles.headerTitle}>Blocked Keywords</Text>
        <View style={{ width: 40 }} />
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Text style={styles.hint}>
          Comments and replies containing these words will be hidden automatically.
        </Text>

        {/* Add new keyword row */}
        <View style={styles.addRow}>
          <TextInput
            style={styles.input}
            placeholder="Add a keyword…"
            placeholderTextColor={colors.text.tertiary}
            value={newWord}
            onChangeText={setNewWord}
            onSubmitEditing={handleAdd}
            returnKeyType="done"
            autoCapitalize="none"
            maxLength={50}
          />
          <TouchableOpacity
            style={[styles.addBtn, (!newWord.trim() || addMutation.isPending) && styles.addBtnDisabled]}
            onPress={handleAdd}
            disabled={!newWord.trim() || addMutation.isPending}
          >
            <Text style={styles.addBtnText}>Add</Text>
          </TouchableOpacity>
        </View>

        {/* Keywords list */}
        {isLoading ? (
          <View style={{ padding: spacing.base, gap: spacing.sm }}>
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton.Rect key={i} width="100%" height={44} />
            ))}
          </View>
        ) : (
          <FlatList
            data={keywords}
            keyExtractor={(item) => item.id}
            contentContainerStyle={{ paddingBottom: 40 }}
            renderItem={({ item }) => (
              <View style={styles.keywordRow}>
                <Text style={styles.keywordText}>{item.word}</Text>
                <TouchableOpacity
                  onPress={() => handleDelete(item.id, item.word)}
                  hitSlop={8}
                  disabled={deleteMutation.isPending}
                >
                  <Icon name="x" size="sm" color={colors.text.tertiary} />
                </TouchableOpacity>
              </View>
            )}
            ItemSeparatorComponent={() => <View style={styles.divider} />}
            ListEmptyComponent={
              <EmptyState
                icon="slash"
                title="No blocked keywords"
                subtitle="Add words above to filter out unwanted comments"
              />
            }
          />
        )}
      </KeyboardAvoidingView>
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
  backBtn: { width: 40, alignItems: 'flex-start' },
  headerTitle: { color: colors.text.primary, fontSize: fontSize.base, fontWeight: '700' },
  hint: {
    color: colors.text.secondary, fontSize: fontSize.sm,
    paddingHorizontal: spacing.base, paddingTop: spacing.md, paddingBottom: spacing.sm,
    lineHeight: 19,
  },
  addRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingHorizontal: spacing.base, paddingVertical: spacing.sm,
    borderBottomWidth: 0.5, borderBottomColor: colors.dark.border,
  },
  input: {
    flex: 1, color: colors.text.primary, fontSize: fontSize.base,
    backgroundColor: colors.dark.bgElevated,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    borderRadius: 10, borderWidth: 0.5, borderColor: colors.dark.border,
  },
  addBtn: {
    backgroundColor: colors.emerald,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    borderRadius: 10,
  },
  addBtnDisabled: { opacity: 0.4 },
  addBtnText: { color: '#FFF', fontWeight: '700', fontSize: fontSize.sm },
  keywordRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.base, paddingVertical: spacing.md,
    backgroundColor: colors.dark.bgElevated,
  },
  keywordText: { color: colors.text.primary, fontSize: fontSize.base },
  divider: { height: 0.5, backgroundColor: colors.dark.border },
});
