import { useCallback, useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, Pressable,
  FlatList,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import * as Contacts from 'expo-contacts';
import * as Crypto from 'expo-crypto';
import { GlassHeader } from '@/components/ui/GlassHeader';
import { Avatar } from '@/components/ui/Avatar';
import { Icon } from '@/components/ui/Icon';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import { VerifiedBadge } from '@/components/ui/VerifiedBadge';
import { GradientButton } from '@/components/ui/GradientButton';
import { BrandedRefreshControl } from '@/components/ui/BrandedRefreshControl';
import { colors, spacing, fontSize, radius } from '@/theme';
import { showToast } from '@/components/ui/Toast';
import { usersApi, followsApi } from '@/services/api';
import { useContextualHaptic } from '@/hooks/useContextualHaptic';
import { useTranslation } from '@/hooks/useTranslation';
import { useThemeColors } from '@/hooks/useThemeColors';
import { ScreenErrorBoundary } from '@/components/ui/ScreenErrorBoundary';
import { useIsOffline } from '@/hooks/useIsOffline';

type ContactUser = {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  isVerified: boolean;
  isFollowing: boolean;
};

function ContactRow({
  user,
  onToggleFollow,
  followLoading,
  index,
}: {
  user: ContactUser;
  onToggleFollow: () => void;
  followLoading: boolean;
  index: number;
}) {
  const router = useRouter();
  const tc = useThemeColors();
  const { t } = useTranslation();
  const navLockRef = useRef(false);

  const navigateToProfile = useCallback(() => {
    if (navLockRef.current) return;
    navLockRef.current = true;
    router.push(`/(screens)/profile/${user.username}`);
    setTimeout(() => { navLockRef.current = false; }, 500);
  }, [router, user.username]);

  return (
    <Animated.View entering={index < 10 ? FadeInUp.delay(Math.min(index, 15) * 50).duration(400) : undefined}>
      <LinearGradient
        colors={colors.gradient.cardDark}
        style={[styles.row, { borderColor: tc.border }]}
      >
        <Pressable accessibilityRole="button" accessibilityLabel={user.displayName} onPress={navigateToProfile}>
          <Avatar uri={user.avatarUrl} name={user.displayName} size="md" />
        </Pressable>

        <View style={styles.info}>
          <Pressable accessibilityRole="button" accessibilityLabel={`@${user.username}`} onPress={navigateToProfile}>
            <View style={styles.nameRow}>
              <Text style={[styles.name, { color: tc.text.primary }]} numberOfLines={1}>{user.displayName}</Text>
              {user.isVerified && <VerifiedBadge size={13} />}
            </View>
            <Text style={[styles.username, { color: tc.text.secondary }]}>@{user.username}</Text>
          </Pressable>
        </View>

        <View style={styles.actionCol}>
          {user.isFollowing ? (
            <Pressable accessibilityRole="button" accessibilityLabel={t('contactSync.following')} onPress={onToggleFollow} disabled={followLoading} style={[styles.followingBtn, { borderColor: tc.border }]}>
              <Text style={[styles.followingText, { color: tc.text.secondary }]}>{t('contactSync.following')}</Text>
            </Pressable>
          ) : (
            <GradientButton
              label={t('contactSync.follow')}
              onPress={onToggleFollow}
              size="sm"
              loading={followLoading}
            />
          )}
        </View>
      </LinearGradient>
    </Animated.View>
  );
}

export default function ContactSyncScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  const tc = useThemeColors();

  const haptic = useContextualHaptic();
  const isOffline = useIsOffline();
  const backLockRef = useRef(false);
  const handleBack = useCallback(() => {
    if (backLockRef.current) return;
    backLockRef.current = true;
    haptic.tick();
    router.back();
    setTimeout(() => { backLockRef.current = false; }, 500);
  }, [haptic, router]);
  const [contacts, setContacts] = useState<ContactUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [fetchError, setFetchError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [pendingFollowId, setPendingFollowId] = useState<string | null>(null);

  const fetchContacts = useCallback(async () => {
    setLoading(true);
    setFetchError(false);
    try {
      const { status } = await Contacts.requestPermissionsAsync();
      if (status !== 'granted') {
        setPermissionDenied(true);
        setLoading(false);
        return;
      }
      setPermissionDenied(false);

      const { data } = await Contacts.getContactsAsync({
        fields: [Contacts.Fields.PhoneNumbers],
      });

      const phoneNumbers: string[] = [];
      for (const contact of data) {
        if (contact.phoneNumbers) {
          for (const phone of contact.phoneNumbers) {
            if (phone.number) {
              phoneNumbers.push(phone.number);
            }
          }
        }
      }

      if (phoneNumbers.length === 0) {
        setContacts([]);
        setHasLoaded(true);
        setLoading(false);
        return;
      }

      // Privacy: normalize and hash phone numbers before sending to server
      // TODO: Backend findByPhoneNumbers must also hash stored phone numbers for comparison
      const hashedNumbers: string[] = [];
      for (const num of phoneNumbers) {
        const normalized = num.replace(/\D/g, '').slice(-10);
        if (normalized.length >= 7) {
          const hash = await Crypto.digestStringAsync(
            Crypto.CryptoDigestAlgorithm.SHA256,
            normalized,
          );
          hashedNumbers.push(hash);
        }
      }

      if (hashedNumbers.length === 0) {
        setContacts([]);
        setHasLoaded(true);
        setLoading(false);
        return;
      }

      const result = await usersApi.syncContacts(hashedNumbers);
      const users: ContactUser[] = Array.isArray(result) ? result : (result as { data: ContactUser[] }).data ?? [];
      setContacts(users);
      setHasLoaded(true);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : t('common.error');
      showToast({ message: errorMessage, variant: 'error' });
      setFetchError(true);
    } finally {
      setLoading(false);
    }
  }, [t]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchContacts();
    setRefreshing(false);
  }, [fetchContacts]);

  // Auto-fetch on mount
  useEffect(() => {
    fetchContacts();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const followMutation = useMutation({
    mutationFn: async ({ userId, isFollowing }: { userId: string; isFollowing: boolean }) => {
      setPendingFollowId(userId);
      if (isFollowing) {
        return followsApi.unfollow(userId);
      }
      return followsApi.follow(userId);
    },
    onSuccess: (_data, variables) => {
      setContacts(prev =>
        prev.map(u =>
          u.id === variables.userId ? { ...u, isFollowing: !variables.isFollowing } : u,
        ),
      );
      queryClient.invalidateQueries({ queryKey: ['follow-requests'] });
      setPendingFollowId(null);
    },
    onError: (err: Error) => {
      showToast({ message: err.message, variant: 'error' });
      setPendingFollowId(null);
    },
  });

  const handleToggleFollow = useCallback(
    (user: ContactUser) => {
      followMutation.mutate({ userId: user.id, isFollowing: user.isFollowing });
    },
    [followMutation],
  );

  const renderContactItem = useCallback(
    ({ item, index }: { item: ContactUser; index: number }) => (
      <ContactRow
        user={item}
        index={index}
        followLoading={followMutation.isPending && pendingFollowId === item.id}
        onToggleFollow={() => handleToggleFollow(item)}
      />
    ),
    [followMutation.isPending, pendingFollowId, handleToggleFollow],
  );

  if (permissionDenied) {
    return (
      <ScreenErrorBoundary>
        <View style={[styles.container, { backgroundColor: tc.bg }]}>
          <GlassHeader
            title={t('contactSync.title')}
            leftAction={{ icon: 'arrow-left', onPress: handleBack, accessibilityLabel: t('common.back') }}
          />
          <View style={[styles.centeredContent, { paddingTop: insets.top + 80 }]}>
            <EmptyState
              icon="users"
              title={t('contactSync.permissionNeeded')}
              actionLabel={t('common.retry')}
              onAction={fetchContacts}
            />
          </View>
        </View>
      </ScreenErrorBoundary>
    );
  }

  if (fetchError && !loading) {
    return (
      <ScreenErrorBoundary>
        <View style={[styles.container, { backgroundColor: tc.bg }]}>
          <GlassHeader
            title={t('contactSync.title')}
            leftAction={{ icon: 'arrow-left', onPress: handleBack, accessibilityLabel: t('common.back') }}
          />
          <View style={[styles.centeredContent, { paddingTop: insets.top + 80 }]}>
            <EmptyState
              icon="alert-circle"
              title={t('contactSync.errorTitle', 'Failed to load contacts')}
              subtitle={t('common.error.checkConnection', 'Check your connection and try again')}
              actionLabel={t('common.retry')}
              onAction={fetchContacts}
            />
          </View>
        </View>
      </ScreenErrorBoundary>
    );
  }

  return (
    <ScreenErrorBoundary>
      <View style={[styles.container, { backgroundColor: tc.bg }]}>
        <GlassHeader
          title={t('contactSync.title')}
          leftAction={{ icon: 'arrow-left', onPress: handleBack, accessibilityLabel: t('common.back') }}
        />

        {isOffline && (
          <Animated.View entering={FadeInUp.duration(300)} style={[styles.offlineBanner, { backgroundColor: colors.active.gold10, borderColor: colors.gold }]}>
            <Icon name="alert-circle" size="xs" color={colors.gold} />
            <Text style={[styles.offlineText, { color: colors.gold }]}>{t('common.offline', 'You are offline')}</Text>
          </Animated.View>
        )}

        {loading && !refreshing ? (
          <View style={[styles.skeletonList, { paddingTop: insets.top + 52 }]}>
            <Text style={[styles.scanningText, { color: tc.text.secondary }]}>{t('contactSync.scanning')}</Text>
            {Array.from({ length: 6 }).map((_, i) => (
              <View key={i} style={styles.skeletonRow}>
                <Skeleton.Circle size={48} />
                <View style={{ flex: 1, gap: spacing.sm }}>
                  <Skeleton.Rect width={140} height={14} />
                  <Skeleton.Rect width={90} height={11} />
                </View>
                <Skeleton.Rect width={80} height={32} borderRadius={radius.md} />
              </View>
            ))}
          </View>
        ) : (
          <FlatList
            removeClippedSubviews
            data={contacts}
            keyExtractor={(item) => item.id}
            contentContainerStyle={[styles.list, { paddingTop: insets.top + 52 }]}
            refreshControl={
              <BrandedRefreshControl refreshing={refreshing} onRefresh={onRefresh} />
            }
            ListHeaderComponent={
              hasLoaded && contacts.length > 0 ? (
                <Text style={[styles.foundText, { color: tc.text.secondary }]}>
                  {t('contactSync.found', { count: contacts.length })}
                </Text>
              ) : null
            }
            renderItem={renderContactItem}
            ListEmptyComponent={
              hasLoaded ? (
                <EmptyState
                  icon="users"
                  title={t('contactSync.noResults')}
                />
              ) : null
            }
          />
        )}
      </View>
    </ScreenErrorBoundary>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.dark.bg },

  list: { paddingBottom: 40, paddingHorizontal: spacing.base },
  skeletonList: { padding: spacing.base, gap: spacing.md },
  skeletonRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    paddingHorizontal: spacing.md, paddingVertical: spacing.md,
  },

  scanningText: {
    color: colors.text.secondary,
    fontSize: fontSize.sm,
    textAlign: 'center',
    marginBottom: spacing.md,
  },

  foundText: {
    color: colors.text.secondary,
    fontSize: fontSize.sm,
    marginBottom: spacing.md,
  },

  row: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: spacing.md, paddingVertical: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.active.white6,
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  info: { flex: 1 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  name: { color: colors.text.primary, fontSize: fontSize.sm, fontWeight: '700' },
  username: { color: colors.text.secondary, fontSize: fontSize.xs, marginTop: 1 },

  actionCol: { alignItems: 'center' },
  followingBtn: {
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderWidth: 1,
    borderColor: colors.dark.border,
  },
  followingText: {
    color: colors.text.secondary,
    fontSize: fontSize.sm,
    fontWeight: '600',
  },

  centeredContent: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  offlineBanner: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingHorizontal: spacing.base, paddingVertical: spacing.sm,
    marginHorizontal: spacing.base, marginTop: spacing.sm,
    borderRadius: radius.md, borderWidth: 1,
  },
  offlineText: {
    fontSize: fontSize.sm, fontWeight: '600',
  },
});
