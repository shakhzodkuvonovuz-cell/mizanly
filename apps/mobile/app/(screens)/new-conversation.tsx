import { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  TextInput, FlatList, ActivityIndicator, Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery, useMutation } from '@tanstack/react-query';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Avatar } from '@/components/ui/Avatar';
import { colors, spacing, fontSize } from '@/theme';
import { searchApi, messagesApi } from '@/services/api';
import type { User } from '@/types';

export default function NewConversationScreen() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [debounceTimer, setDebounceTimer] = useState<ReturnType<typeof setTimeout> | null>(null);

  const handleQueryChange = (text: string) => {
    setQuery(text);
    if (debounceTimer) clearTimeout(debounceTimer);
    const t = setTimeout(() => setDebouncedQuery(text), 350);
    setDebounceTimer(t);
  };

  const searchQuery = useQuery({
    queryKey: ['dm-search', debouncedQuery],
    queryFn: () => searchApi.search(debouncedQuery),
    enabled: debouncedQuery.trim().length >= 2,
  });

  const people: User[] = searchQuery.data?.people ?? [];

  const dmMutation = useMutation({
    mutationFn: (targetUserId: string) => messagesApi.createDM(targetUserId),
    onSuccess: (convo) => {
      router.replace(`/(screens)/conversation/${convo.id}`);
    },
    onError: (err: Error) => Alert.alert('Error', err.message || 'Could not start conversation'),
  });

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={8} style={styles.backBtn}>
          <Text style={styles.backIcon}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>New Message</Text>
        <View style={{ width: 36 }} />
      </View>

      {/* Search box */}
      <View style={styles.searchWrap}>
        <Text style={styles.toLabel}>To:</Text>
        <TextInput
          style={styles.searchInput}
          value={query}
          onChangeText={handleQueryChange}
          placeholder="Search people…"
          placeholderTextColor={colors.text.tertiary}
          autoFocus
          autoCapitalize="none"
          autoCorrect={false}
        />
        {query.length > 0 && (
          <TouchableOpacity onPress={() => { setQuery(''); setDebouncedQuery(''); }} hitSlop={8}>
            <Text style={styles.clearIcon}>✕</Text>
          </TouchableOpacity>
        )}
      </View>

      {searchQuery.isLoading ? (
        <ActivityIndicator color={colors.emerald} style={styles.loader} />
      ) : (
        <FlatList
          data={people}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.userRow}
              onPress={() => dmMutation.mutate(item.id)}
              disabled={dmMutation.isPending}
              activeOpacity={0.7}
            >
              <Avatar uri={item.avatarUrl} name={item.displayName} size="md" />
              <View style={styles.userInfo}>
                <View style={styles.nameRow}>
                  <Text style={styles.name}>{item.displayName}</Text>
                  {item.isVerified && <Text style={styles.verified}>✓</Text>}
                </View>
                <Text style={styles.handle}>@{item.username}</Text>
              </View>
              {dmMutation.isPending && dmMutation.variables === item.id ? (
                <ActivityIndicator color={colors.emerald} size="small" />
              ) : (
                <Text style={styles.messageIcon}>✉️</Text>
              )}
            </TouchableOpacity>
          )}
          ListEmptyComponent={() =>
            debouncedQuery.trim().length >= 2 ? (
              <View style={styles.empty}>
                <Text style={styles.emptyText}>No users found for "{debouncedQuery}"</Text>
              </View>
            ) : (
              <View style={styles.hint}>
                <Text style={styles.hintText}>Search by name or username</Text>
              </View>
            )
          }
        />
      )}
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

  searchWrap: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingHorizontal: spacing.base, paddingVertical: spacing.md,
    borderBottomWidth: 0.5, borderBottomColor: colors.dark.border,
  },
  toLabel: { color: colors.text.secondary, fontSize: fontSize.base, fontWeight: '600' },
  searchInput: { flex: 1, color: colors.text.primary, fontSize: fontSize.base },
  clearIcon: { color: colors.text.secondary, fontSize: fontSize.sm },
  loader: { marginTop: 60 },

  userRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    paddingHorizontal: spacing.base, paddingVertical: spacing.md,
    borderBottomWidth: 0.5, borderBottomColor: colors.dark.border,
  },
  userInfo: { flex: 1 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  name: { color: colors.text.primary, fontSize: fontSize.base, fontWeight: '600' },
  verified: { color: colors.emerald, fontSize: fontSize.xs },
  handle: { color: colors.text.secondary, fontSize: fontSize.sm, marginTop: 1 },
  messageIcon: { fontSize: 18 },

  empty: { alignItems: 'center', paddingTop: 60 },
  emptyText: { color: colors.text.secondary, fontSize: fontSize.base },
  hint: { alignItems: 'center', paddingTop: 80 },
  hintText: { color: colors.text.tertiary, fontSize: fontSize.base },
});
