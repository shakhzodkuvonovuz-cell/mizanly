import { useState, useCallback } from 'react';
import { View, Text, FlatList, StyleSheet, Pressable, RefreshControl, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { formatDistanceToNowStrict } from 'date-fns';
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

  const renderDraft = ({ item }: { item: DraftItem }) => {
    const data = item.data as Record<string, string>;
    const preview = data.content ?? data.caption ?? data.title ?? 'Untitled draft';
    const time = formatDistanceToNowStrict(new Date(item.updatedAt), { addSuffix: true });

    return (
      <Pressable
        style={styles.draftItem}
        onPress={() => handleOpen(item)}
        accessibilityLabel={`Draft: ${preview}`}
        accessibilityRole="button"
      >
        <View style={styles.draftIcon}>
          <Icon name={SPACE_ICONS[item.space] ?? 'image'} size="sm" color={colors.emerald} />
        </View>
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
          <Icon name="trash" size="sm" color={colors.error} />
        </Pressable>
      </Pressable>
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
    backgroundColor: colors.dark.bgCard,
    borderRadius: radius.md,
    padding: spacing.base,
    marginBottom: spacing.sm,
  },
  draftIcon: {
    width: 40, height: 40, borderRadius: radius.full,
    backgroundColor: colors.active.emerald10,
    alignItems: 'center', justifyContent: 'center',
    marginRight: spacing.md,
  },
  draftContent: { flex: 1 },
  draftType: {
    color: colors.emerald, fontSize: fontSize.xs,
    fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5,
  },
  draftPreview: { color: colors.text.primary, fontSize: fontSize.base, marginTop: 2 },
  draftTime: { color: colors.text.tertiary, fontSize: fontSize.xs, marginTop: 2 },
  draftDeleteBtn: { padding: spacing.xs, marginLeft: spacing.sm },
});