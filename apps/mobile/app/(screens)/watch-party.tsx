import React, { useState } from 'react';
import { View, Text, StyleSheet, FlatList, RefreshControl, Pressable, TextInput } from 'react-native';
import Animated, { FadeInUp, FadeIn } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { GlassHeader } from '@/components/ui/GlassHeader';
import { Icon } from '@/components/ui/Icon';
import { Avatar } from '@/components/ui/Avatar';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { BottomSheet, BottomSheetItem } from '@/components/ui/BottomSheet';
import { ScreenErrorBoundary } from '@/components/ui/ScreenErrorBoundary';
import { useTranslation } from '@/hooks/useTranslation';
import { colors, spacing, fontSize, radius } from '@/theme';
import { useHaptic } from '@/hooks/useHaptic';
import { useThemeColors } from '@/hooks/useThemeColors';
import { api } from '@/services/api';

export default function WatchPartyScreen() {
  const tc = useThemeColors();
  const styles = createStyles(tc);
  const router = useRouter();
  const { t } = useTranslation();
  const haptic = useHaptic();
  const queryClient = useQueryClient();
  const [createSheetOpen, setCreateSheetOpen] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newVideoId, setNewVideoId] = useState('');

  const partiesQuery = useQuery({
    queryKey: ['watch-parties'],
    queryFn: () => api.get<Array<Record<string, unknown>>>('/watch-parties'),
  });

  const createMutation = useMutation({
    mutationFn: () => api.post<Record<string, unknown>>('/watch-parties', { videoId: newVideoId, title: newTitle }),
    onSuccess: () => {
      setCreateSheetOpen(false);
      setNewTitle('');
      setNewVideoId('');
      queryClient.invalidateQueries({ queryKey: ['watch-parties'] });
      haptic.success();
    },
  });

  const parties = Array.isArray(partiesQuery.data) ? partiesQuery.data : [];

  const renderParty = ({ item, index }: { item: Record<string, unknown>; index: number }) => {
    const host = item.host as Record<string, unknown> | undefined;
    const isLive = item.isActive as boolean;

    return (
      <Animated.View entering={FadeInUp.delay(index * 60).duration(300)}>
        <Pressable
          style={styles.partyCard}
          onPress={() => {
            haptic.light();
            router.push(`/(screens)/watch-party/${item.id}` as never);
          }}
        >
          <View style={styles.partyHeader}>
            {isLive && (
              <View style={styles.liveBadge}>
                <View style={styles.liveDot} />
                <Text style={styles.liveText}>LIVE</Text>
              </View>
            )}
            <Text style={styles.partyTitle}>{item.title as string}</Text>
          </View>

          <View style={styles.partyInfo}>
            {host && (
              <View style={styles.hostRow}>
                <Avatar uri={host.avatarUrl as string | null} name={host.displayName as string || ''} size="sm" />
                <Text style={styles.hostName}>{t('community.hostedBy', { name: host.displayName as string })}</Text>
              </View>
            )}
            <View style={styles.viewerRow}>
              <Icon name="eye" size="xs" color={colors.text.tertiary} />
              <Text style={styles.viewerCount}>{t('community.watchingCount', { count: item.viewerCount as number })}</Text>
            </View>
          </View>

          <Pressable
            style={styles.joinBtn}
            onPress={() => {
              haptic.medium();
              router.push(`/(screens)/watch-party/${item.id}` as never);
            }}
            accessibilityRole="button"
          >
            <LinearGradient colors={[colors.emerald, '#0D9B63']} style={styles.joinBtnGradient}>
              <Icon name="play" size="sm" color="#FFF" />
              <Text style={styles.joinBtnText}>{t('community.joinParty')}</Text>
            </LinearGradient>
          </Pressable>
        </Pressable>
      </Animated.View>
    );
  };

  return (
    <ScreenErrorBoundary>
      <View style={styles.container}>
        <GlassHeader
          title={t('community.watchParties')}
          leftAction={{ icon: 'arrow-left', onPress: () => router.back() }}
          rightAction={{ icon: 'plus', onPress: () => { setCreateSheetOpen(true); haptic.light(); } }}
        />

        <FlatList
          data={parties}
          renderItem={renderParty}
          keyExtractor={(item) => item.id as string}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl refreshing={partiesQuery.isRefetching} onRefresh={() => partiesQuery.refetch()} tintColor={colors.emerald} />
          }
          ListEmptyComponent={
            partiesQuery.isLoading ? (
              <View style={styles.skeletons}>
                {[1, 2, 3].map(i => <Skeleton.Rect key={i} width="100%" height={160} borderRadius={radius.lg} />)}
              </View>
            ) : (
              <EmptyState icon="video" title={t('community.noWatchParties')} subtitle={t('community.watchPartyHint')} actionLabel={t('community.startParty')} onAction={() => setCreateSheetOpen(true)} />
            )
          }
        />

        {/* Create Sheet */}
        <BottomSheet visible={createSheetOpen} onClose={() => setCreateSheetOpen(false)}>
          <View style={styles.createForm}>
            <Text style={styles.createTitle}>{t('community.startParty')}</Text>
            <TextInput
              style={styles.createInput}
              value={newTitle}
              onChangeText={setNewTitle}
              placeholder={t('community.partyNamePlaceholder')}
              placeholderTextColor={colors.text.tertiary}
            />
            <TextInput
              style={styles.createInput}
              value={newVideoId}
              onChangeText={setNewVideoId}
              placeholder={t('community.videoIdPlaceholder')}
              placeholderTextColor={colors.text.tertiary}
            />
            <Pressable
              accessibilityRole="button"
              style={[styles.createBtn, (!newTitle || !newVideoId) && { opacity: 0.5 }]}
              onPress={() => createMutation.mutate()}
              disabled={!newTitle || !newVideoId || createMutation.isPending}
            >
              <LinearGradient colors={[colors.emerald, '#0D9B63']} style={styles.createBtnGradient}>
                <Text style={styles.createBtnText}>{t('community.start')}</Text>
              </LinearGradient>
            </Pressable>
          </View>
        </BottomSheet>
      </View>
    </ScreenErrorBoundary>
  );
}

const createStyles = (tc: ReturnType<typeof useThemeColors>) => StyleSheet.create({
  container: { flex: 1, backgroundColor: tc.bg },
  list: { paddingHorizontal: spacing.base, paddingBottom: spacing['2xl'] },
  skeletons: { gap: spacing.md },
  partyCard: { backgroundColor: tc.bgCard, borderRadius: radius.lg, padding: spacing.base, borderWidth: 1, borderColor: tc.border, marginBottom: spacing.md },
  partyHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.md },
  liveBadge: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, backgroundColor: '#F85149' + '20', paddingHorizontal: spacing.sm, paddingVertical: 2, borderRadius: radius.full },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#F85149' },
  liveText: { color: '#F85149', fontSize: fontSize.xs, fontWeight: '700' },
  partyTitle: { color: colors.text.primary, fontSize: fontSize.md, fontWeight: '600', flex: 1 },
  partyInfo: { gap: spacing.sm, marginBottom: spacing.md },
  hostRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  hostName: { color: colors.text.secondary, fontSize: fontSize.sm },
  viewerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  viewerCount: { color: colors.text.tertiary, fontSize: fontSize.sm },
  joinBtn: { borderRadius: radius.md, overflow: 'hidden' },
  joinBtnGradient: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, paddingVertical: spacing.md, borderRadius: radius.md },
  joinBtnText: { color: '#FFF', fontSize: fontSize.base, fontWeight: '600' },
  createForm: { padding: spacing.base, gap: spacing.md },
  createTitle: { color: colors.text.primary, fontSize: fontSize.lg, fontWeight: '700' },
  createInput: { backgroundColor: tc.bgCard, borderRadius: radius.md, borderWidth: 1, borderColor: tc.border, padding: spacing.md, color: colors.text.primary, fontSize: fontSize.base },
  createBtn: { borderRadius: radius.md, overflow: 'hidden', marginTop: spacing.sm },
  createBtnGradient: { paddingVertical: spacing.md, alignItems: 'center', borderRadius: radius.md },
  createBtnText: { color: '#FFF', fontSize: fontSize.md, fontWeight: '700' },
});
