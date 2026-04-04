import { useState, useCallback, useMemo, useEffect } from 'react';
import {
  View, Text, StyleSheet, Pressable,
  FlatList, Alert, TextInput,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect } from '@react-navigation/native';
import { GlassHeader } from '@/components/ui/GlassHeader';
import { Icon } from '@/components/ui/Icon';
import { EmptyState } from '@/components/ui/EmptyState';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Skeleton } from '@/components/ui/Skeleton';
import { colors, spacing, fontSize, radius, fonts } from '@/theme';
import { showToast } from '@/components/ui/Toast';
import { circlesApi } from '@/services/api';
import { BrandedRefreshControl } from '@/components/ui/BrandedRefreshControl';
import { useTranslation } from '@/hooks/useTranslation';
import { useThemeColors } from '@/hooks/useThemeColors';
import { useContextualHaptic } from '@/hooks/useContextualHaptic';
import { ScreenErrorBoundary } from '@/components/ui/ScreenErrorBoundary';

const EMOJIS = ['⭕', '⭐', '🌙', '🤝', '💚', '🕌', '📿', '🏠', '💼', '🎓'];

interface Circle {
  id: string;
  name: string;
  emoji?: string;
  _count?: { members: number };
}

function CreateSheet({
  visible,
  onClose,
  onCreated,
}: {
  visible: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState('');
  const tc = useThemeColors();
  const [emoji, setEmoji] = useState('⭕');
  const { t } = useTranslation();
  const haptic = useContextualHaptic();

  const createMutation = useMutation({
    mutationFn: () => circlesApi.create(name.trim(), emoji),
    onSuccess: () => {
      haptic.success();
      showToast({ message: t('screens.circles.createdToast'), variant: 'success' });
      setName('');
      setEmoji('⭕');
      onCreated();
      onClose();
    },
    onError: (err: Error) => showToast({ message: err.message, variant: 'error' }),
  });

  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <Text style={[styles.sheetTitle, { color: tc.text.primary }]}>{t('screens.circles.newCircleTitle')}</Text>

      {/* Emoji picker */}
      <View style={styles.emojiRow}>
        {EMOJIS.map((e) => (
          <Pressable
            accessibilityRole="button"
            key={e}
            style={[styles.emojiBtn, emoji === e && styles.emojiBtnActive]}
            onPress={() => setEmoji(e)}
          >
            <LinearGradient
              colors={emoji === e ? ['rgba(10,123,79,0.3)', 'rgba(200,150,62,0.2)'] : ['transparent', 'transparent']}
              style={styles.emojiGradient}
            >
              <Text style={styles.emojiText}>{e}</Text>
            </LinearGradient>
          </Pressable>
        ))}
      </View>

      {/* Name input */}
      <TextInput
        style={[styles.nameInput, { backgroundColor: tc.bgElevated, color: tc.text.primary }]}
        value={name}
        onChangeText={setName}
        placeholder={t('screens.circles.circleNamePlaceholder')}
        placeholderTextColor={tc.text.tertiary}
        maxLength={40}
        autoFocus
      />

      <Pressable
        accessibilityRole="button"
        style={[styles.createBtnWrapper, (!name.trim() || createMutation.isPending) && styles.createBtnDisabled]}
        onPress={() => createMutation.mutate()}
        disabled={!name.trim() || createMutation.isPending}
      >
        <LinearGradient
          colors={!name.trim() || createMutation.isPending ? ['rgba(45,53,72,0.6)', 'rgba(28,35,51,0.4)'] : [colors.emerald, colors.gold]}
          style={styles.createBtnGradient}
        >
          {createMutation.isPending ? (
            <Skeleton.Rect width={24} height={24} borderRadius={radius.full} />
          ) : (
            <Text style={styles.createBtnText}>{t('screens.circles.createCircleButton')}</Text>
          )}
        </LinearGradient>
      </Pressable>
    </BottomSheet>
  );
}

export default function CirclesScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const headerOffset = insets.top + spacing['4xl'] + spacing.xs;
  const { t } = useTranslation();
  const tc = useThemeColors();
  const queryClient = useQueryClient();
  const haptic = useContextualHaptic();
  const [showCreate, setShowCreate] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = async () => {
    setRefreshing(true);
    await circlesQuery.refetch();
    setRefreshing(false);
  };

  const circlesQuery = useQuery({
    queryKey: ['my-circles'],
    queryFn: () => circlesApi.getMyCircles(),
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });

  const circles: Circle[] = (circlesQuery.data as Circle[]) ?? [];

  // Refetch when screen gains focus (e.g., returning from circle edit)
  useFocusEffect(
    useCallback(() => {
      circlesQuery.refetch();
    }, []) // eslint-disable-line react-hooks/exhaustive-deps
  );

  const deleteMutation = useMutation({
    mutationFn: (id: string) => circlesApi.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['my-circles'] }),
    onError: (err: Error) => showToast({ message: err.message, variant: 'error' }),
  });

  const handleDelete = (circle: Circle) => {
    haptic.delete();
    Alert.alert(
      t('screens.circles.deleteAlertTitle', { name: circle.name }),
      t('screens.circles.deleteAlertMessage'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('screens.circles.deleteButton'), style: 'destructive',
          onPress: () => deleteMutation.mutate(circle.id),
        },
      ],
    );
  };

  const listEmpty = useMemo(() => (
    <EmptyState
      icon="users"
      title={t('screens.circles.emptyTitle')}
      subtitle={t('screens.circles.emptySubtitle')}
      actionLabel={t('screens.circles.createFirstCircleButton')}
      onAction={() => setShowCreate(true)}
    />
  ), [t]);

  const renderCircleItem = useCallback(
    ({ item, index }: { item: Circle; index: number }) => (
      <Animated.View entering={FadeInUp.delay(Math.min(index, 15) * 50).duration(400)}>
                <Pressable
          accessibilityRole="button"
          style={({ pressed }) => [pressed && { opacity: 0.7 }]}
        >
        <LinearGradient
          colors={colors.gradient.cardDark}
          style={styles.circleCard}
        >
          <View style={styles.circleIcon}>
            <LinearGradient
              colors={['rgba(10,123,79,0.3)', 'rgba(200,150,62,0.2)']}
              style={styles.circleIconGradient}
            >
              <Text style={styles.circleEmoji}>{item.emoji ?? '⭕'}</Text>
            </LinearGradient>
          </View>
          <View style={styles.circleInfo}>
            <Text style={[styles.circleName, { color: tc.text.primary }]}>{item.name}</Text>
            <View style={styles.memberBadge}>
              <Icon name="users" size="xs" color={tc.text.tertiary} />
              <Text style={[styles.circleMemberCount, { color: tc.text.tertiary }]}>
                {t('screens.circles.memberCount', { count: item._count?.members ?? 0 })}
              </Text>
            </View>
          </View>
          <Pressable
            accessibilityLabel={t('accessibility.delete')}
            accessibilityRole="button"
            hitSlop={8}
            onPress={() => handleDelete(item)}
            style={styles.deleteBtn}
          >
            <LinearGradient
              colors={['rgba(248,81,73,0.1)', 'transparent']}
              style={styles.deleteBtnGradient}
            >
              <Icon name="trash" size="sm" color={colors.error} />
            </LinearGradient>
          </Pressable>
        </LinearGradient>
        </Pressable>
      </Animated.View>
    ),
    [handleDelete, tc.text.primary, tc.text.tertiary, t],
  );

  if (circlesQuery.isError) {
    return (
      <View style={[styles.container, { backgroundColor: tc.bg }]}>
        <GlassHeader
          title={t('screens.circles.title')}
          leftAction={{ icon: 'arrow-left', onPress: () => router.back(), accessibilityLabel: t('common.back') }}
        />
        <EmptyState
          icon="flag"
          title={t('screens.circles.errorTitle')}
          subtitle={t('screens.circles.errorSubtitle')}
          actionLabel={t('common.retry')}
          onAction={() => circlesQuery.refetch()}
        />
      </View>
    );
  }

  return (
    <ScreenErrorBoundary>
      <View style={[styles.container, { backgroundColor: tc.bg }]}>
        <GlassHeader
          title={t('screens.circles.title')}
          leftAction={{ icon: 'arrow-left', onPress: () => router.back(), accessibilityLabel: t('common.back') }}
          rightActions={[{ icon: 'plus', onPress: () => setShowCreate(true), accessibilityLabel: t('screens.circles.createCircleLabel') }]}
        />

        <Text style={[styles.subtitle, { marginTop: headerOffset, color: tc.text.secondary }]}>
          {t('screens.circles.subtitle')}
        </Text>

        {circlesQuery.isLoading ? (
          <View style={styles.skeletonList}>
            {Array.from({ length: 4 }).map((_, i) => (
              <View key={i} style={styles.skeletonRow}>
                <Skeleton.Circle size={48} />
                <View style={{ flex: 1, gap: 6 }}>
                  <Skeleton.Rect width={130} height={14} />
                  <Skeleton.Rect width={80} height={11} />
                </View>
              </View>
            ))}
          </View>
        ) : (
          <FlatList
            removeClippedSubviews={true}
            data={circles}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.list}
            refreshControl={
              <BrandedRefreshControl refreshing={refreshing} onRefresh={onRefresh} />
            }
            renderItem={renderCircleItem}
            ListEmptyComponent={listEmpty}
          />
        )}

        <CreateSheet
          visible={showCreate}
          onClose={() => setShowCreate(false)}
          onCreated={() => queryClient.invalidateQueries({ queryKey: ['my-circles'] })}
        />
      </View>
  
    </ScreenErrorBoundary>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },

  subtitle: {
    fontSize: fontSize.sm, fontFamily: fonts.body,
    paddingHorizontal: spacing.base, paddingTop: spacing.md, paddingBottom: spacing.sm,
  },

  skeletonList: { paddingHorizontal: spacing.base, paddingTop: spacing.lg, gap: spacing.lg },
  skeletonRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  list: { paddingHorizontal: spacing.base, paddingBottom: 40, gap: spacing.md },

  circleCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 0.5,
    borderColor: colors.active.white6,
  },
  circleIcon: {
    width: 48,
    height: 48,
    borderRadius: radius.full,
    overflow: 'hidden',
  },
  circleIconGradient: {
    width: 48,
    height: 48,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  circleEmoji: { fontSize: 24 },
  circleInfo: { flex: 1 },
  circleName: { fontSize: fontSize.base, fontFamily: fonts.bodySemiBold },
  memberBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: 2,
  },
  circleMemberCount: { fontSize: fontSize.sm, fontFamily: fonts.body },
  deleteBtn: {
    padding: spacing.xs,
    borderRadius: radius.full,
    overflow: 'hidden',
  },
  deleteBtnGradient: {
    padding: spacing.sm,
    borderRadius: radius.full,
  },


  // Sheet content
  sheetTitle: {
    fontSize: fontSize.base, fontFamily: fonts.bodyBold,
    textAlign: 'center', marginBottom: spacing.lg,
    paddingHorizontal: spacing.base,
  },
  emojiRow: {
    flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm,
    justifyContent: 'center', marginBottom: spacing.lg,
    paddingHorizontal: spacing.base,
  },
  emojiBtn: {
    width: 48, height: 48, borderRadius: radius.full,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.active.white6,
  },
  emojiGradient: {
    width: 48, height: 48,
    alignItems: 'center', justifyContent: 'center',
  },
  emojiBtnActive: { borderColor: colors.emerald },
  emojiText: { fontSize: 24 },
  nameInput: {
    borderRadius: radius.md,
    paddingHorizontal: spacing.md, paddingVertical: spacing.md,
    fontSize: fontSize.base, fontFamily: fonts.body,
    marginBottom: spacing.lg, marginHorizontal: spacing.base,
    borderWidth: 1,
    borderColor: colors.active.white6,
  },
  createBtnWrapper: {
    borderRadius: radius.full,
    overflow: 'hidden',
    marginHorizontal: spacing.base,
  },
  createBtnGradient: {
    paddingVertical: spacing.md,
    alignItems: 'center',
    borderRadius: radius.full,
  },
  createBtnDisabled: { opacity: 0.6 },
  createBtnText: { color: '#fff', fontSize: fontSize.base, fontFamily: fonts.bodyBold },
});
