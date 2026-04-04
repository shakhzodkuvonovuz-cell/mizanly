import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  View, Text, StyleSheet, Pressable,
  TextInput, FlatList, SectionList, Platform, KeyboardAvoidingView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useUser } from '@clerk/clerk-expo';
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
import { useContextualHaptic } from '@/hooks/useContextualHaptic';
import { useTranslation } from '@/hooks/useTranslation';
import { useThemeColors } from '@/hooks/useThemeColors';
import { rtlFlexRow } from '@/utils/rtl';
import { searchApi, messagesApi, followsApi } from '@/services/api';
import { BrandedRefreshControl } from '@/components/ui/BrandedRefreshControl';
import type { User, Conversation } from '@/types';
import { ScreenErrorBoundary } from '@/components/ui/ScreenErrorBoundary';
import { showToast } from '@/components/ui/Toast';

/** Extract the "other user" from a 1:1 conversation */
function extractContact(convo: Conversation, myId?: string): User | null {
  if (convo.isGroup) return null;
  if (convo.otherUser) {
    return {
      id: convo.otherUser.id,
      username: convo.otherUser.username,
      displayName: convo.otherUser.displayName ?? convo.otherUser.username,
      avatarUrl: convo.otherUser.avatarUrl,
    } as User;
  }
  const other = convo.members?.find((m) => m.user?.id !== myId);
  if (!other?.user) return null;
  return {
    id: other.user.id,
    username: other.user.username,
    displayName: other.user.displayName ?? other.user.username,
    avatarUrl: other.user.avatarUrl,
    isVerified: other.user.isVerified,
  } as User;
}

interface RecentContact extends User {
  lastMessageText?: string;
  lastMessageAt?: string;
  conversationId: string;
}

export default function NewConversationScreen() {
  const tc = useThemeColors();
  const styles = useMemo(() => createStyles(tc), [tc]);
  const router = useRouter();
  const { t, isRTL } = useTranslation();
  const haptic = useContextualHaptic();
  const { user } = useUser();
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

  // Fetch recent conversations to show contacts the user has chatted with
  const recentConversationsQuery = useQuery({
    queryKey: ['recent-conversations'],
    queryFn: () => messagesApi.getConversations(),
    staleTime: 30 * 1000, // 30s — recent conversations
  });

  const suggestionsQuery = useQuery({
    queryKey: ['dm-suggestions'],
    queryFn: () => followsApi.suggestions(),
    enabled: debouncedQuery.trim().length < 2,
  });

  const isSearching = debouncedQuery.trim().length >= 2;
  const people: User[] = searchQuery.data?.people ?? [];
  const suggestions: User[] = suggestionsQuery.data ?? [];

  // Extract recent contacts from conversations (deduped, sorted by most recent message)
  const recentContacts: RecentContact[] = useMemo(() => {
    const conversations = recentConversationsQuery.data ?? [];
    const contacts: RecentContact[] = [];
    const seenIds = new Set<string>();
    for (const convo of conversations) {
      const contact = extractContact(convo, user?.id);
      if (contact && !seenIds.has(contact.id)) {
        seenIds.add(contact.id);
        contacts.push({
          ...contact,
          lastMessageText: convo.lastMessageText,
          lastMessageAt: convo.lastMessageAt,
          conversationId: convo.id,
        });
      }
    }
    return contacts;
  }, [recentConversationsQuery.data, user?.id]);

  // When not searching, filter recent contacts and suggestions by typed text for instant filtering
  const filteredRecentContacts = useMemo(() => {
    if (isSearching) return [];
    if (!query.trim()) return recentContacts;
    const q = query.trim().toLowerCase();
    return recentContacts.filter(
      (c) => c.displayName?.toLowerCase().includes(q) || c.username?.toLowerCase().includes(q),
    );
  }, [recentContacts, query, isSearching]);

  const filteredSuggestions = useMemo(() => {
    if (isSearching) return [];
    if (!query.trim()) return suggestions;
    const q = query.trim().toLowerCase();
    return suggestions.filter(
      (s) =>
        s.displayName?.toLowerCase().includes(q) || s.username?.toLowerCase().includes(q),
    );
  }, [suggestions, query, isSearching]);

  const dmMutation = useMutation({
    mutationFn: (targetUserId: string) => messagesApi.createDM(targetUserId),
    onSuccess: (convo) => {
      haptic.success();
      router.push(`/(screens)/conversation/${convo.id}`);
    },
    onError: (err: Error) => showToast({ message: err.message || t('messages.couldNotStartConversation'), variant: 'error' }),
  });

  const handleContactPress = (contactItem: RecentContact) => {
    router.push(`/(screens)/conversation/${contactItem.conversationId}`);
  };

  const isLoading = isSearching
    ? searchQuery.isLoading
    : recentConversationsQuery.isLoading && suggestionsQuery.isLoading;

  // Build sections for non-search mode
  const sections = useMemo(() => {
    if (isSearching) return [];
    const result: Array<{ title: string; data: Array<RecentContact | User>; type: 'recent' | 'suggestions' }> = [];
    if (filteredRecentContacts.length > 0) {
      result.push({
        title: t('newConversation.recentContacts'),
        data: filteredRecentContacts,
        type: 'recent',
      });
    }
    // Filter out suggestions that are already shown in recent contacts
    const recentIds = new Set(filteredRecentContacts.map((c) => c.id));
    const uniqueSuggestions = filteredSuggestions.filter((s) => !recentIds.has(s.id));
    if (uniqueSuggestions.length > 0) {
      result.push({
        title: t('messages.suggestions'),
        data: uniqueSuggestions,
        type: 'suggestions',
      });
    }
    return result;
  }, [isSearching, filteredRecentContacts, filteredSuggestions, t]);

  const renderUserRow = useCallback((item: User | RecentContact, index: number) => {
    const isRecent = 'conversationId' in item;
    return (
      <Animated.View entering={FadeInUp.delay(Math.min(index, 10) * 60).duration(400)}>
        <Pressable
          style={({ pressed }) => [styles.userRow, { flexDirection: rtlFlexRow(isRTL) }, pressed && { opacity: 0.85 }]}
          onPress={() => {
            haptic.navigate();
            isRecent ? handleContactPress(item as RecentContact) : dmMutation.mutate(item.id);
          }}
          android_ripple={{ color: colors.active.emerald10 }}
          disabled={dmMutation.isPending}
          accessibilityLabel={t('messages.chatWith', { name: item.displayName })}
          accessibilityRole="button"
          accessibilityState={{ disabled: dmMutation.isPending }}
        >
          <Avatar uri={item.avatarUrl} name={item.displayName ?? ''} size="md" />
          <View style={styles.userInfo}>
            <View style={[styles.nameRow, { flexDirection: rtlFlexRow(isRTL) }]}>
              <Text style={styles.name}>{item.displayName}</Text>
              {item.isVerified && <VerifiedBadge size={13} />}
            </View>
            {isRecent && (item as RecentContact).lastMessageText ? (
              <Text style={styles.handle} numberOfLines={1}>
                {(item as RecentContact).lastMessageText}
              </Text>
            ) : (
              <Text style={styles.handle}>@{item.username}</Text>
            )}
          </View>
          {dmMutation.isPending && dmMutation.variables === item.id ? (
            <Skeleton.Circle size={36} />
          ) : (
            <LinearGradient
              colors={['rgba(10,123,79,0.2)', 'rgba(200,150,62,0.1)']}
              style={styles.mailIconBg}
            >
              <Icon name={isRecent ? 'message-circle' : 'mail'} size="xs" color={colors.emerald} />
            </LinearGradient>
          )}
        </Pressable>
      </Animated.View>
    );
  }, [isRTL, haptic, handleContactPress, dmMutation, t]);

  const renderUserRowItem = useCallback(
    ({ item, index }: { item: User | RecentContact; index: number }) => renderUserRow(item, index),
    [renderUserRow],
  );

  const searchListEmpty = useMemo(() => (
    <EmptyState
      icon="search"
      title={t('messages.noUsersFound', { query: debouncedQuery })}
    />
  ), [t, debouncedQuery]);

  const sectionListEmpty = useMemo(() => (
    <EmptyState
      icon="user"
      title={t('newConversation.noContacts')}
      subtitle={t('messages.searchByNameOrUsername')}
    />
  ), [t]);

  return (
    <ScreenErrorBoundary>
      <SafeAreaView style={styles.container} edges={['top']}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        {/* Header */}
        <GlassHeader
          title={t('messages.newMessage')}
          leftAction={{
            icon: 'arrow-left',
            onPress: () => router.back(),
            accessibilityLabel: t('common.back')
          }}
        />

        {/* Search box */}
        <Animated.View entering={FadeInUp.delay(0).duration(400)}>
          <LinearGradient
            colors={colors.gradient.cardDark}
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
              placeholderTextColor={tc.text.tertiary}
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
                <Icon name="x" size="xs" color={tc.text.secondary} />
              </Pressable>
            )}
          </LinearGradient>
        </Animated.View>

        {isLoading ? (
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
        ) : searchQuery.isError && isSearching ? (
          <EmptyState
            icon="flag"
            title={t('messages.searchFailed')}
            subtitle={t('common.checkConnectionAndRetry')}
            actionLabel={t('common.retry')}
            onAction={() => searchQuery.refetch()}
          />
        ) : isSearching ? (
          <FlatList
            removeClippedSubviews={true}
            data={people}
            keyExtractor={(item) => item.id}
            keyboardDismissMode="on-drag"
            keyboardShouldPersistTaps="handled"
            refreshControl={
              <BrandedRefreshControl
                refreshing={false}
                onRefresh={() => searchQuery.refetch()}
              />
            }
            renderItem={renderUserRowItem}
            ListEmptyComponent={searchListEmpty}
          />
        ) : (
          <SectionList
            sections={sections}
            keyExtractor={(item) => item.id}
            keyboardDismissMode="on-drag"
            keyboardShouldPersistTaps="handled"
            refreshControl={
              <BrandedRefreshControl
                refreshing={false}
                onRefresh={() => {
                  recentConversationsQuery.refetch();
                  suggestionsQuery.refetch();
                }}
              />
            }
            renderSectionHeader={({ section }) => (
              <Text style={styles.sectionLabel}>{section.title}</Text>
            )}
            renderItem={renderUserRowItem}
            stickySectionHeadersEnabled={false}
            ListEmptyComponent={sectionListEmpty}
          />
        )}
      </KeyboardAvoidingView>
      </SafeAreaView>
    </ScreenErrorBoundary>
  );
}

const createStyles = (tc: ReturnType<typeof useThemeColors>) => StyleSheet.create({
  container: { flex: 1, backgroundColor: tc.bg },
  searchWrap: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingHorizontal: spacing.base, paddingVertical: spacing.md,
    marginHorizontal: spacing.base,
    marginTop: spacing.md,
    marginBottom: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.active.white6,
  },
  searchIconBg: {
    width: 36, height: 36, borderRadius: radius.sm,
    alignItems: 'center', justifyContent: 'center',
  },
  toLabel: { color: tc.text.secondary, fontSize: fontSize.base, fontWeight: '600' },
  searchInput: { flex: 1, color: tc.text.primary, fontSize: fontSize.base },
  skeletonList: { padding: spacing.base, gap: spacing.md },
  skeletonRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    paddingHorizontal: spacing.base, paddingVertical: spacing.md,
  },

  userRow: {
    alignItems: 'center', gap: spacing.md,
    paddingHorizontal: spacing.base, paddingVertical: spacing.md,
    marginHorizontal: spacing.base,
    marginBottom: spacing.sm,
    backgroundColor: tc.bgCard,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.active.white6,
  },
  userInfo: { flex: 1 },
  nameRow: { alignItems: 'center', gap: spacing.xs },
  name: { color: tc.text.primary, fontSize: fontSize.base, fontWeight: '600' },
  handle: { color: tc.text.secondary, fontSize: fontSize.sm, marginTop: 1 },
  mailIconBg: {
    width: 36, height: 36, borderRadius: radius.sm,
    alignItems: 'center', justifyContent: 'center',
  },

  sectionLabel: {
    color: tc.text.secondary, fontSize: fontSize.sm, fontWeight: '600',
    textTransform: 'uppercase' as const, letterSpacing: 0.5,
    paddingHorizontal: spacing.base, paddingTop: spacing.md, paddingBottom: spacing.sm,
  },
  suggestionsLabel: {
    color: tc.text.secondary, fontSize: fontSize.sm, fontWeight: '600',
    textTransform: 'uppercase' as const, letterSpacing: 0.5,
    paddingHorizontal: spacing.base, paddingTop: spacing.md, paddingBottom: spacing.sm,
  },
  empty: { alignItems: 'center', paddingTop: 60 },
  emptyText: { color: tc.text.secondary, fontSize: fontSize.base },
  hint: { alignItems: 'center', paddingTop: 80 },
  hintText: { color: tc.text.tertiary, fontSize: fontSize.base },
});
