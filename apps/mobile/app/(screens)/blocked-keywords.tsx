import { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, Pressable, FlatList,
  TextInput, TouchableOpacity, Alert, KeyboardAvoidingView, Platform,
  RefreshControl,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Icon } from '@/components/ui/Icon';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { GlassHeader } from '@/components/ui/GlassHeader';
import { colors, spacing, fontSize, radius } from '@/theme';
import { settingsApi } from '@/services/api';
import type { BlockedKeyword } from '@/types';

export default function BlockedKeywordsScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [newWord, setNewWord] = useState('');

  const [refreshing, setRefreshing] = useState(false);

  const { data: keywords = [], isLoading, isError, refetch } = useQuery<BlockedKeyword[]>({
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

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  const handleDelete = useCallback((id: string, word: string) => {
    Alert.alert('Remove keyword', `Remove "${word}" from blocked keywords?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => deleteMutation.mutate(id) },
    ]);
  }, [deleteMutation]);

  if (isError) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <GlassHeader
          title="Blocked Keywords"
          leftAction={{ icon: 'arrow-left', onPress: () => router.back() }}
        />
        <EmptyState
          icon="flag"
          title="Couldn't load content"
          subtitle="Check your connection and try again"
          actionLabel="Retry"
          onAction={() => refetch()}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <GlassHeader
        title="Blocked Keywords"
        leftAction={{ icon: 'arrow-left', onPress: () => router.back() }}
      />

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
            removeClippedSubviews={true}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.emerald} />
            }
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
  hint: {
    color: colors.text.secondary, fontSize: fontSize.sm,
    paddingHorizontal: spacing.base, paddingTop: 100, paddingBottom: spacing.sm,
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
    borderRadius: radius.md, borderWidth: 0.5, borderColor: colors.dark.border,
  },
  addBtn: {
    backgroundColor: colors.emerald,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    borderRadius: radius.md,
  },
  addBtnDisabled: { opacity: 0.4 },
  addBtnText: { color: '#FFF', fontWeight: '700', fontSize: fontSize.sm },
  keywordRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.base, paddingVertical: spacing.md,
    backgroundColor: colors.dark.bgCard,
  },
  keywordText: { color: colors.text.primary, fontSize: fontSize.base },
  divider: { height: 0.5, backgroundColor: colors.dark.border },
});
