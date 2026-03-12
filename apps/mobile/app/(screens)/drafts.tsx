import { useState, useCallback } from 'react';
import { View, Text, FlatList, StyleSheet, Pressable, RefreshControl, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { formatDistanceToNowStrict } from 'date-fns';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { Icon } from '@/components/ui/Icon';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import { GlassHeader } from '@/components/ui/GlassHeader';
import { colors, spacing, fontSize, radius } from '@/theme';
import { draftsApi } from '@/services/api';

type DraftItem = {
  id: string;
  space: string;
  data: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

const SPACE_LABELS: Record<string, string> = {
  SAF: 'Post',
  MAJLIS: 'Thread',
  BAKRA: 'Reel',
  MINBAR: 'Video',
};

const SPACE_ICONS: Record<string, React.ComponentProps<typeof Icon>['name']> = {
  SAF: 'image',
  MAJLIS: 'message-circle',
  BAKRA: 'play',
  MINBAR: 'video',
};

export default function DraftsScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);

  const { data: drafts, isLoading, isError, refetch } = useQuery({
    queryKey: ['drafts'],
    queryFn: () => draftsApi.getAll(),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => draftsApi.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['drafts'] }),
  });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await queryClient.invalidateQueries({ queryKey: ['drafts'] });
    setRefreshing(false);
  }, [queryClient]);

  const handleDelete = (id: string) => {
    Alert.alert('Delete draft?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deleteMutation.mutate(id) },
    ]);
  };

  const handleOpen = (draft: DraftItem) => {
    const screenMap: Record<string, string> = {
      SAF: '/(screens)/create-post',
      MAJLIS: '/(screens)/create-thread',
      BAKRA: '/(screens)/create-reel',
      MINBAR: '/(screens)/create-video',
    };
    const screen = screenMap[draft.space] ?? '/(screens)/create-post';
    router.push({ pathname: screen, params: { draftId: draft.id } } as never);
  };

  const renderDraft = ({ item, index }: { item: DraftItem; index: number }) => {
    const data = item.data as Record<string, string>;
    const preview = data.content ?? data.caption ?? data.title ?? 'Untitled draft';
    const time = formatDistanceToNowStrict(new Date(item.updatedAt), { addSuffix: true });

    return (
      <Animated.View entering={FadeInUp.delay(index * 50).duration(400)}>
        <Pressable
          onPress={() => handleOpen(item)}
          accessibilityLabel={`Draft: ${preview}`}
          accessibilityRole="button"
        >
          <LinearGradient
            colors={['rgba(45,53,72,0.4)', 'rgba(28,35,51,0.2)']}
            style={styles.draftItem}
          >
            <LinearGradient
              colors={['rgba(10,123,79,0.2)', 'rgba(200,150,62,0.1)']}
              style={styles.draftIcon}
            >
              <Icon name={SPACE_ICONS[item.space] ?? 'image'} size="sm" color={colors.emerald} />
            </LinearGradient>
            <View style={styles.draftContent}>
              <Text style={styles.draftType}>{SPACE_LABELS[item.space] ?? 'Draft'}</Text>
              <Text style={styles.draftPreview} numberOfLines={2}>{preview}</Text>
              <Text style={styles.draftTime}>{time}</Text>
            </View>
            <Pressable
              style={styles.draftDeleteBtn}
              onPress={() => handleDelete(item.id)}
              hitSlop={8}
              accessibilityLabel="Delete draft"
              accessibilityRole="button"
            >
              <LinearGradient
                colors={['rgba(248,81,73,0.2)', 'rgba(248,81,73,0.1)']}
                style={styles.deleteBtnGradient}
              >
                <Icon name="trash" size="sm" color={colors.error} />
              </LinearGradient>
            </Pressable>
          </LinearGradient>
        </Pressable>
      </Animated.View>
    );
  };

  if (isError) {
    return (
      <View style={styles.container}>
        <GlassHeader
          title="Drafts"
          leftAction={{ icon: 'arrow-left', onPress: () => router.back(), accessibilityLabel: 'Go back' }}
        />
        <View style={styles.headerSpacer} />
        <EmptyState
          icon="flag"
          title="Couldn't load content"
          subtitle="Check your connection and try again"
          actionLabel="Retry"
          onAction={() => refetch()}
        />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <GlassHeader
        title="Drafts"
        leftAction={{ icon: 'arrow-left', onPress: () => router.back(), accessibilityLabel: 'Go back' }}
      />
      <View style={styles.headerSpacer} />

      {isLoading ? (
        <View style={styles.skeletonWrap}>
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton.Rect key={i} width="100%" height={80} borderRadius={radius.md} style={{ marginBottom: spacing.sm }} />
          ))}
        </View>
      ) : !drafts?.length ? (
        <EmptyState
          icon="layers"
          title="No drafts saved yet"
          subtitle="When you start creating and save for later, your drafts will appear here"
        />
      ) : (
        <FlatList
          removeClippedSubviews={true}
          data={drafts}
          keyExtractor={(item) => item.id}
          renderItem={renderDraft}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.emerald} />
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.dark.bg },
  headerSpacer: { height: 100 },
  list: { padding: spacing.base },
  skeletonWrap: { padding: spacing.base },
  draftItem: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.md,
    padding: spacing.base,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  draftIcon: {
    width: 40, height: 40, borderRadius: radius.md,
    alignItems: 'center', justifyContent: 'center',
    marginRight: spacing.md,
  },
  draftContent: { flex: 1 },
  draftType: {
    color: colors.gold, fontSize: fontSize.xs,
    fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5,
  },
  draftPreview: { color: colors.text.primary, fontSize: fontSize.base, marginTop: 2 },
  draftTime: { color: colors.text.tertiary, fontSize: fontSize.xs, marginTop: 2 },
  draftDeleteBtn: { marginLeft: spacing.sm },
  deleteBtnGradient: {
    width: 32, height: 32, borderRadius: radius.md,
    alignItems: 'center', justifyContent: 'center',
  },
});