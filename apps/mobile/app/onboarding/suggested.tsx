import { useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { useUser } from '@clerk/clerk-expo';
import { useQuery } from '@tanstack/react-query';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Avatar } from '@/components/ui/Avatar';
import { Skeleton } from '@/components/ui/Skeleton';
import { GradientButton } from '@/components/ui/GradientButton';
import { colors, spacing, fontSize, radius } from '@/theme';
import { authApi, followsApi } from '@/services/api';
import type { User } from '@/types';

export default function SuggestedScreen() {
  const router = useRouter();
  const { user } = useUser();
  const [following, setFollowing] = useState<Set<string>>(new Set());
  const [finishing, setFinishing] = useState(false);

  const { data: suggested, isLoading } = useQuery({
    queryKey: ['suggested-onboarding'],
    queryFn: () => authApi.suggestedUsers(),
  });

  const handleFollow = async (userId: string) => {
    try {
      if (following.has(userId)) {
        await followsApi.unfollow(userId);
        setFollowing((prev) => { const n = new Set(prev); n.delete(userId); return n; });
      } else {
        await followsApi.follow(userId);
        setFollowing((prev) => new Set([...prev, userId]));
      }
    } catch {}
  };

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
    <SafeAreaView style={styles.container}>
      <View style={styles.progress}>
        {[1, 2, 3, 4].map((i) => (
          <View key={i} style={[styles.dot, styles.dotActive]} />
        ))}
      </View>

      <View style={styles.header}>
        <Text style={styles.title}>Follow some people</Text>
        <Text style={styles.subtitle}>Get started with a personalised feed</Text>
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
          renderItem={({ item }: { item: User }) => {
            const isFollowing = following.has(item.id);
            return (
              <View style={styles.row}>
                <Avatar uri={item.avatarUrl} name={item.displayName} size="lg" />
                <View style={styles.info}>
                  <Text style={styles.name}>{item.displayName}</Text>
                  <Text style={styles.handle}>@{item.username}</Text>
                  {item.bio ? <Text style={styles.bio} numberOfLines={1}>{item.bio}</Text> : null}
                </View>
                <TouchableOpacity
                  style={[styles.followBtn, isFollowing && styles.followingBtn]}
                  onPress={() => handleFollow(item.id)}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.followBtnText, isFollowing && styles.followingBtnText]}>
                    {isFollowing ? 'Following' : 'Follow'}
                  </Text>
                </TouchableOpacity>
              </View>
            );
          }}
        />
      )}

      <View style={styles.footer}>
        <TouchableOpacity
          style={styles.btn}
          onPress={handleFinish}
          disabled={finishing}
          activeOpacity={0.8}
        >
          {finishing ? <ActivityIndicator color={colors.text.primary} /> : <Text style={styles.btnText}>Get Started</Text>}
        </TouchableOpacity>
        <TouchableOpacity onPress={handleFinish}>
          <Text style={styles.skip}>Skip for now</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.dark.bg },
  progress: { flexDirection: 'row', gap: spacing.sm, marginHorizontal: spacing.xl, marginTop: spacing['2xl'], marginBottom: spacing.xl },
  dot: { flex: 1, height: 3, borderRadius: 2, backgroundColor: colors.dark.border },
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
  followingBtn: { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.dark.border },
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
