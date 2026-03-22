import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Pressable,
  RefreshControl, ActivityIndicator, Alert,
} from 'react-native';
import Animated, { FadeInUp, FadeIn } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { GlassHeader } from '@/components/ui/GlassHeader';
import { Icon } from '@/components/ui/Icon';
import type { IconName } from '@/components/ui/Icon';
import { Avatar } from '@/components/ui/Avatar';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { ScreenErrorBoundary } from '@/components/ui/ScreenErrorBoundary';
import { colors, spacing, fontSize, radius, fonts } from '@/theme';
import { aiApi, usersApi } from '@/services/api';
import { useStore } from '@/store';
import { useHaptic } from '@/hooks/useHaptic';
import { useTranslation } from '@/hooks/useTranslation';
import { useThemeColors } from '@/hooks/useThemeColors';
import type { AiAvatar } from '@/types';

const STYLES: { id: string; label: string; icon: IconName; color: string }[] = [
  { id: 'default', label: 'ai.avatar.styleDefault', icon: 'user', color: colors.emerald },
  { id: 'anime', label: 'ai.avatar.styleAnime', icon: 'smile', color: '#EC4899' },
  { id: 'watercolor', label: 'ai.avatar.styleWatercolor', icon: 'image', color: colors.info },
  { id: 'islamic_art', label: 'ai.avatar.styleIslamic', icon: 'globe', color: colors.gold },
];

export default function AiAvatarScreen() {
  const router = useRouter();
  const tc = useThemeColors();
  const haptic = useHaptic();
  const { t, isRTL } = useTranslation();
  const queryClient = useQueryClient();
  const user = useStore(s => s.user);

  const [selectedStyle, setSelectedStyle] = useState('default');

  const avatarsQuery = useQuery({
    queryKey: ['ai-avatars'],
    queryFn: () => aiApi.getAvatars(),
  });

  const generateMutation = useMutation({
    mutationFn: () => aiApi.generateAvatar(user?.avatarUrl || '', selectedStyle),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai-avatars'] });
      haptic.success();
    },
  });

  const setProfileMutation = useMutation({
    mutationFn: (avatarUrl: string) => usersApi.updateMe({ avatarUrl }),
    onSuccess: (_data, avatarUrl) => {
      // Update the Zustand store with the new avatar
      const currentUser = useStore.getState().user;
      if (currentUser) {
        useStore.getState().setUser({ ...currentUser, avatarUrl });
      }
      haptic.success();
    },
  });

  const avatars = (avatarsQuery.data as AiAvatar[] | undefined) || [];

  const renderAvatar = ({ item, index }: { item: AiAvatar; index: number }) => (
    <Animated.View entering={FadeInUp.delay(index * 60).duration(300)} style={[styles.avatarCard, { backgroundColor: tc.bgCard, borderColor: tc.border }]}>
      <Image source={{ uri: item.avatarUrl }} style={styles.avatarImage} contentFit="cover" />
      <View style={styles.avatarInfo}>
        <View style={[styles.styleBadge, { backgroundColor: (STYLES.find(s => s.id === item.style)?.color || colors.emerald) + '20' }]}>
          <Text style={[styles.styleBadgeText, { color: STYLES.find(s => s.id === item.style)?.color || colors.emerald }]}>
            {item.style}
          </Text>
        </View>
        <Pressable
          style={styles.setProfileBtn}
          onPress={() => {
            setProfileMutation.mutate(item.avatarUrl);
          }}
          disabled={setProfileMutation.isPending}
        >
          <Text style={styles.setProfileText}>{t('ai.avatar.setProfile')}</Text>
        </Pressable>
      </View>
    </Animated.View>
  );

  return (
    <ScreenErrorBoundary>
      <View style={[styles.container, { backgroundColor: tc.bg }]}>
        <GlassHeader
          title={t('ai.avatar.title')}
          leftAction={{ icon: 'arrow-left', onPress: () => router.back() }}
        />

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.content}
          refreshControl={<RefreshControl refreshing={avatarsQuery.isRefetching} onRefresh={() => avatarsQuery.refetch()} tintColor={colors.emerald} />}
        >
          {/* Current avatar preview */}
          <Animated.View entering={FadeInUp.duration(300)} style={styles.previewSection}>
            <View style={styles.previewCard}>
              <Avatar uri={user?.avatarUrl || null} name={user?.displayName || ''} size="3xl" />
              <Text style={styles.previewLabel}>{t('ai.avatar.currentPhoto')}</Text>
            </View>
          </Animated.View>

          {/* Style selector */}
          <Animated.View entering={FadeInUp.delay(100).duration(300)}>
            <Text style={styles.sectionTitle}>{t('ai.avatar.selectStyle')}</Text>
            <View style={styles.styleGrid}>
              {STYLES.map((style) => (
                <Pressable
                  accessibilityRole="button"
                  key={style.id}
                  onPress={() => { setSelectedStyle(style.id); haptic.light(); }}
                  style={[styles.styleCard, selectedStyle === style.id && { borderColor: style.color }]}
                >
                  <View style={[styles.styleIconWrap, { backgroundColor: style.color + '20' }]}>
                    <Icon name={style.icon} size="md" color={style.color} />
                  </View>
                  <Text style={[styles.styleLabel, selectedStyle === style.id && { color: style.color }]}>
                    {t(style.label)}
                  </Text>
                </Pressable>
              ))}
            </View>
          </Animated.View>

          {/* Generate button */}
          <Animated.View entering={FadeInUp.delay(200).duration(300)} style={styles.generateSection}>
            {!user?.avatarUrl && (
              <Text style={styles.noAvatarHint}>{t('ai.avatar.uploadFirst')}</Text>
            )}
            <Pressable
              accessibilityRole="button"
              onPress={() => generateMutation.mutate()}
              disabled={generateMutation.isPending || !user?.avatarUrl}
              style={[styles.generateBtn, (generateMutation.isPending || !user?.avatarUrl) && { opacity: 0.5 }]}
            >
              <LinearGradient colors={[colors.emerald, '#0D9B63']} style={styles.generateGradient}>
                {generateMutation.isPending ? (
                  <ActivityIndicator color="#FFF" size="small" />
                ) : (
                  <>
                    <Icon name="loader" size="sm" color="#FFF" />
                    <Text style={styles.generateText}>{t('ai.avatar.generate')}</Text>
                  </>
                )}
              </LinearGradient>
            </Pressable>
          </Animated.View>

          {/* Gallery */}
          {avatarsQuery.isLoading ? (
            <View style={styles.skeletonRow}>
              <Skeleton.Rect width={160} height={200} borderRadius={radius.lg} />
              <Skeleton.Rect width={160} height={200} borderRadius={radius.lg} />
            </View>
          ) : avatars.length > 0 ? (
            <View>
              <Text style={styles.sectionTitle}>{t('ai.avatar.gallery')}</Text>
              <View style={styles.avatarGrid}>
                {avatars.map((avatar, i) => (
                  <View key={avatar.id} style={{ width: '48%' }}>
                    {renderAvatar({ item: avatar, index: i })}
                  </View>
                ))}
              </View>
            </View>
          ) : (
            <Animated.View entering={FadeIn.delay(300).duration(300)} style={styles.emptyWrap}>
              <EmptyState
                icon="user"
                title={t('ai.avatar.empty')}
                subtitle={t('ai.avatar.emptySubtitle')}
              />
            </Animated.View>
          )}
        </ScrollView>
      </View>
    </ScreenErrorBoundary>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.dark.bg },
  scroll: { flex: 1 },
  content: { padding: spacing.base, paddingBottom: spacing['2xl'] },
  previewSection: { alignItems: 'center', marginBottom: spacing.xl },
  previewCard: { alignItems: 'center', gap: spacing.md },
  previewLabel: { color: colors.text.secondary, fontSize: fontSize.sm },
  sectionTitle: {
    color: colors.text.secondary,
    fontSize: fontSize.sm,
    fontFamily: fonts.bodySemiBold,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: spacing.md,
  },
  styleGrid: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.xl },
  styleCard: {
    flex: 1,
    alignItems: 'center',
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 2,
    borderColor: colors.dark.border,
    backgroundColor: colors.dark.bgCard,
    gap: spacing.sm,
  },
  styleIconWrap: {
    width: 48,
    height: 48,
    borderRadius: radius.full,
    justifyContent: 'center',
    alignItems: 'center',
  },
  styleLabel: { color: colors.text.secondary, fontSize: fontSize.xs, fontFamily: fonts.bodyMedium, textAlign: 'center' },
  generateSection: { marginBottom: spacing.xl },
  generateBtn: { borderRadius: radius.md, overflow: 'hidden' },
  generateGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.base,
    borderRadius: radius.md,
  },
  generateText: { color: '#FFF', fontSize: fontSize.md, fontFamily: fonts.bodyBold },
  skeletonRow: { flexDirection: 'row', gap: spacing.md },
  avatarGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  avatarCard: {
    borderRadius: radius.lg,
    overflow: 'hidden',
    backgroundColor: colors.dark.bgCard,
    borderWidth: 1,
    borderColor: colors.dark.border,
  },
  avatarImage: { width: '100%', aspectRatio: 1, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg },
  avatarInfo: {
    padding: spacing.sm,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  styleBadge: { paddingHorizontal: spacing.sm, paddingVertical: 2, borderRadius: radius.full },
  styleBadgeText: { fontSize: fontSize.xs, fontFamily: fonts.bodyMedium, textTransform: 'capitalize' },
  setProfileBtn: { paddingHorizontal: spacing.sm, paddingVertical: 2 },
  setProfileText: { color: colors.emerald, fontSize: fontSize.xs, fontFamily: fonts.bodySemiBold },
  noAvatarHint: { color: colors.text.secondary, fontSize: fontSize.sm, fontFamily: fonts.body, textAlign: 'center', marginBottom: spacing.sm },
  emptyWrap: { marginTop: spacing.xl },
});
