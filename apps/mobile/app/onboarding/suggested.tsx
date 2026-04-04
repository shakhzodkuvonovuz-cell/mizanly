import { useState, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable, ActivityIndicator } from 'react-native';
import { BrandedRefreshControl } from '@/components/ui/BrandedRefreshControl';
import { useRouter } from 'expo-router';
import { useUser } from '@clerk/clerk-expo';
import { useQuery } from '@tanstack/react-query';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Avatar } from '@/components/ui/Avatar';
import { Skeleton } from '@/components/ui/Skeleton';
import { colors, spacing, fontSize, radius } from '@/theme';
import { useThemeColors } from '@/hooks/useThemeColors';
import { useTranslation } from '@/hooks/useTranslation';
import { authApi, followsApi } from '@/services/api';
import type { User } from '@/types';
import { ScreenErrorBoundary } from '@/components/ui/ScreenErrorBoundary';

function SuggestedScreenContent() {
  const router = useRouter();
  const { user } = useUser();
  const { t } = useTranslation();
  const tc = useThemeColors();
  const [following, setFollowing] = useState<Set<string>>(new Set());
  const [finishing, setFinishing] = useState(false);

  const { data: suggested, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['suggested-onboarding'],
    queryFn: () => authApi.suggestedUsers(),
  });

  const handleFollow = useCallback(async (userId: string) => {
    const wasFollowing = following.has(userId);
    // Optimistic update
    setFollowing((prev) => {
      const n = new Set(prev);
      wasFollowing ? n.delete(userId) : n.add(userId);
      return n;
    });
    try {
      if (wasFollowing) {
        await followsApi.unfollow(userId);
      } else {
        await followsApi.follow(userId);
      }
    } catch {
      // Rollback on error
      setFollowing((prev) => {
        const n = new Set(prev);
        wasFollowing ? n.add(userId) : n.delete(userId);
        return n;
      });
    }
  }, [following]);

  const renderSuggestedUser = useCallback(
    ({ item }: { item: User }) => {
      const isFollowingUser = following.has(item.id);
      return (
        <View style={styles.row}>
          <Avatar uri={item.avatarUrl} name={item.displayName} size="lg" />
          <View style={styles.info}>
            <Text style={[styles.name, { color: tc.text.primary }]}>{item.displayName}</Text>
            <Text style={[styles.handle, { color: tc.text.secondary }]}>@{item.username}</Text>
            {item.bio ? <Text style={[styles.bio, { color: tc.text.tertiary }]} numberOfLines={1}>{item.bio}</Text> : null}
          </View>
          <Pressable
            accessibilityLabel={t('accessibility.follow')}
            accessibilityRole="button"
            style={[styles.followBtn, isFollowingUser && [styles.followingBtn, { borderColor: tc.border }]]}
            onPress={() => handleFollow(item.id)}
          >
            <Text style={[styles.followBtnText, isFollowingUser && styles.followingBtnText, isFollowingUser && { color: tc.text.secondary }]}>
              {isFollowingUser ? t('onboarding.suggested.following') : t('onboarding.suggested.follow')}
            </Text>
          </Pressable>
        </View>
      );
    },
    [following, handleFollow, tc.text.primary, tc.text.secondary, tc.text.tertiary, tc.border, t],
  );

  const handleFinish = async () => {
    setFinishing(true);
    try {
      // Mark onboarding complete in Clerk user metadata
      await user?.update({ unsafeMetadata: { onboardingComplete: true } });
      router.replace('/(tabs)/saf');
    } catch {
      router.replace('/(tabs)/saf');
    } finally {
      setFinishing(false);
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: tc.bg }]}>
      <View style={styles.progress}>
        {[1, 2].map((i) => (
          <View key={i} style={[styles.dot, { backgroundColor: tc.border }, styles.dotActive]} />
        ))}
      </View>

      <View style={styles.header}>
        <Text style={[styles.title, { color: tc.text.primary }]}>{t('onboarding.suggested.title')}</Text>
        <Text style={[styles.subtitle, { color: tc.text.secondary }]}>{t('onboarding.suggested.subtitle')}</Text>
      </View>

      {isLoading ? (
        <View style={styles.skeletonList}>
          {Array.from({ length: 5 }).map((_, i) => (
            <View key={i} style={styles.skeletonRow}>
              <Skeleton.Circle size={52} />
              <View style={{ flex: 1, gap: 6 }}>
                <Skeleton.Rect width={120} height={14} />
                <Skeleton.Rect width={80} height={11} />
              </View>
            </View>
          ))}
        </View>
      ) : (
        <FlatList
          data={suggested || []}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          refreshControl={
            <BrandedRefreshControl
              refreshing={isRefetching}
              onRefresh={() => refetch()}
            />
          }
          renderItem={renderSuggestedUser}
        />
      )}

      <View style={styles.footer}>
        <Pressable
          accessibilityRole="button"
          style={styles.btn}
          onPress={handleFinish}
          disabled={finishing}
        >
          {finishing ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.btnText}>{t('onboarding.suggested.getStarted')}</Text>}
        </Pressable>
        <Pressable accessibilityRole="button" onPress={handleFinish}>
          <Text style={[styles.skip, { color: tc.text.secondary }]}>{t('onboarding.suggested.skipForNow')}</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

export default function SuggestedScreen() {
  return (
    <ScreenErrorBoundary>
      <SuggestedScreenContent />
    </ScreenErrorBoundary>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  progress: { flexDirection: 'row', gap: spacing.sm, marginHorizontal: spacing.xl, marginTop: spacing['2xl'], marginBottom: spacing.xl },
  dot: { flex: 1, height: 3, borderRadius: 2 },
  dotActive: { backgroundColor: colors.emerald },
  header: { paddingHorizontal: spacing.xl, marginBottom: spacing.lg },
  title: { color: colors.text.primary, fontSize: fontSize.xl, fontWeight: '700', marginBottom: spacing.sm },
  subtitle: { color: colors.text.secondary, fontSize: fontSize.base },
  skeletonList: { flex: 1, padding: spacing.base, gap: spacing.md },
  skeletonRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  list: { paddingHorizontal: spacing.base },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.md, gap: spacing.md },
  info: { flex: 1 },
  name: { color: colors.text.primary, fontWeight: '600', fontSize: fontSize.base },
  handle: { color: colors.text.secondary, fontSize: fontSize.sm },
  bio: { color: colors.text.tertiary, fontSize: fontSize.xs, marginTop: 2 },
  followBtn: {
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
    backgroundColor: colors.emerald,
  },
  followingBtn: { backgroundColor: 'transparent', borderWidth: 1 },
  followBtnText: { color: '#fff', fontSize: fontSize.sm, fontWeight: '600' },
  followingBtnText: { color: colors.text.secondary },
  footer: { paddingHorizontal: spacing.xl, paddingBottom: spacing.xl, gap: spacing.md },
  btn: {
    backgroundColor: colors.emerald,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  btnText: { color: '#fff', fontSize: fontSize.base, fontWeight: '700' },
  skip: { color: colors.text.secondary, fontSize: fontSize.sm, textAlign: 'center' },
});
