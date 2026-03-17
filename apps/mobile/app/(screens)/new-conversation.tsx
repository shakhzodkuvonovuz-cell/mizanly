import { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Pressable,
  TextInput, FlatList, ActivityIndicator, Alert, RefreshControl,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery, useMutation } from '@tanstack/react-query';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { Avatar } from '@/components/ui/Avatar';
import { Icon } from '@/components/ui/Icon';
import { VerifiedBadge } from '@/components/ui/VerifiedBadge';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { GlassHeader } from '@/components/ui/GlassHeader';
import { colors, spacing, fontSize, radius } from '@/theme';
import { useTranslation } from '@/hooks/useTranslation';
import { searchApi, messagesApi } from '@/services/api';
import type { User } from '@/types';
import { ScreenErrorBoundary } from '@/components/ui/ScreenErrorBoundary';

export default function NewConversationScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, []);

  const handleQueryChange = (text: string) => {
    setQuery(text);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebouncedQuery(text), 350);
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
    onError: (err: Error) => Alert.alert(t('common.error'), err.message || t('messages.couldNotStartConversation')),
  });

  return (
    <ScreenErrorBoundary>
      <SafeAreaView style={styles.container} edges={['top']}>
        {/* Header */}
        <GlassHeader
          title={t('messages.newMessage')}
          leftAction={{ 
            icon: 'arrow-left', 
            onPress: () => router.back(),
            accessibilityLabel: 'Go back'
          }}
        />

        {/* Search box — Glassmorphism wrapper */}
        <Animated.View entering={FadeInUp.delay(0).duration(400)}>
          <LinearGradient
            colors={['rgba(45,53,72,0.4)', 'rgba(28,35,51,0.2)']}
            style={styles.searchWrap}
          >
            <LinearGradient
              colors={['rgba(10,123,79,0.2)', 'rgba(200,150,62,0.1)']}
              style={styles.searchIconBg}
            >
              <Icon name="search" size="xs" color={colors.emerald} />
            </LinearGradient>
            <TextInput
              style={styles.searchInput}
              value={query}
              onChangeText={handleQueryChange}
              placeholder={t('common.searchPeople')}
              placeholderTextColor={colors.text.tertiary}
              autoFocus
              autoCapitalize="none"
              autoCorrect={false}
              accessibilityLabel={t('accessibility.searchPeopleInput')}
            />
            {query.length > 0 && (
              <Pressable
                onPress={() => { setQuery(''); setDebouncedQuery(''); }}
                hitSlop={8}
                accessibilityLabel={t('accessibility.clearSearchQuery')}
                accessibilityRole="button"
              >
                <Icon name="x" size="xs" color={colors.text.secondary} />
              </Pressable>
            )}
          </LinearGradient>
        </Animated.View>

        {searchQuery.isLoading ? (
          <View style={styles.skeletonList}>
            {Array.from({ length: 5 }).map((_, i) => (
              <View key={i} style={styles.skeletonRow}>
                <Skeleton.Circle size={40} />
                <View style={{ flex: 1, gap: 6 }}>
                  <Skeleton.Rect width={120} height={14} />
                  <Skeleton.Rect width={80} height={11} />
                </View>
              </View>
            ))}
          </View>
        ) : searchQuery.isError ? (
          <EmptyState
            icon="flag"
            title={t('messages.searchFailed')}
            subtitle={t('common.checkConnectionAndRetry')}
            actionLabel={t('common.retry')}
            onAction={() => searchQuery.refetch()}
          />
        ) : (
          <FlatList
            removeClippedSubviews={true}
            data={people}
            keyExtractor={(item) => item.id}
            refreshControl={
              <RefreshControl
                refreshing={false}
                onRefresh={() => searchQuery.refetch()}
                tintColor={colors.emerald}
              />
            }
            renderItem={({ item, index }) => (
              <Animated.View entering={FadeInUp.delay(index * 80).duration(400)}>
                <TouchableOpacity
                  style={styles.userRow}
                  onPress={() => dmMutation.mutate(item.id)}
                  disabled={dmMutation.isPending}
                  activeOpacity={0.7}
                  accessibilityLabel={t('messages.chatWith', { name: item.displayName })}
                  accessibilityRole="button"
                >
                  <Avatar uri={item.avatarUrl} name={item.displayName} size="md" />
                  <View style={styles.userInfo}>
                    <View style={styles.nameRow}>
                      <Text style={styles.name}>{item.displayName}</Text>
                      {item.isVerified && <VerifiedBadge size={13} />}
                    </View>
                    <Text style={styles.handle}>@{item.username}</Text>
                  </View>
                  {dmMutation.isPending && dmMutation.variables === item.id ? (
                    <ActivityIndicator color={colors.emerald} size="small" />
                  ) : (
                    <LinearGradient
                      colors={['rgba(10,123,79,0.2)', 'rgba(200,150,62,0.1)']}
                      style={styles.mailIconBg}
                    >
                      <Icon name="mail" size="xs" color={colors.emerald} />
                    </LinearGradient>
                  )}
                </TouchableOpacity>
              </Animated.View>
            )}
            ListEmptyComponent={() =>
              debouncedQuery.trim().length >= 2 ? (
                <View style={styles.empty}>
                  <Text style={styles.emptyText}>{t('messages.noUsersFound', { query: debouncedQuery })}</Text>
                </View>
              ) : (
                <View style={styles.hint}>
                  <Text style={styles.hintText}>{t('messages.searchByNameOrUsername')}</Text>
                </View>
              )
            }
          />
        )}
      </SafeAreaView>
  
    </ScreenErrorBoundary>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.dark.bg },
  searchWrap: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingHorizontal: spacing.base, paddingVertical: spacing.md,
    marginHorizontal: spacing.base,
    marginTop: spacing.md,
    marginBottom: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  searchIconBg: {
    width: 36, height: 36, borderRadius: radius.sm,
    alignItems: 'center', justifyContent: 'center',
  },
  toLabel: { color: colors.text.secondary, fontSize: fontSize.base, fontWeight: '600' },
  searchInput: { flex: 1, color: colors.text.primary, fontSize: fontSize.base },
  skeletonList: { padding: spacing.base, gap: spacing.md },
  skeletonRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    paddingHorizontal: spacing.base, paddingVertical: spacing.md,
  },

  userRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    paddingHorizontal: spacing.base, paddingVertical: spacing.md,
    marginHorizontal: spacing.base,
    marginBottom: spacing.sm,
    backgroundColor: colors.dark.bgCard,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  userInfo: { flex: 1 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  name: { color: colors.text.primary, fontSize: fontSize.base, fontWeight: '600' },
  handle: { color: colors.text.secondary, fontSize: fontSize.sm, marginTop: 1 },
  mailIconBg: {
    width: 36, height: 36, borderRadius: radius.sm,
    alignItems: 'center', justifyContent: 'center',
  },

  empty: { alignItems: 'center', paddingTop: 60 },
  emptyText: { color: colors.text.secondary, fontSize: fontSize.base },
  hint: { alignItems: 'center', paddingTop: 80 },
  hintText: { color: colors.text.tertiary, fontSize: fontSize.base },
});
