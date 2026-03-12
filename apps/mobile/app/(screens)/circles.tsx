import { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  FlatList, ActivityIndicator, Alert, TextInput, RefreshControl,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { GlassHeader } from '@/components/ui/GlassHeader';
import { Icon } from '@/components/ui/Icon';
import { EmptyState } from '@/components/ui/EmptyState';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Skeleton } from '@/components/ui/Skeleton';
import { colors, spacing, fontSize, radius } from '@/theme';
import { circlesApi } from '@/services/api';

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
  const [emoji, setEmoji] = useState('⭕');

  const createMutation = useMutation({
    mutationFn: () => circlesApi.create(name.trim(), emoji),
    onSuccess: () => {
      setName('');
      setEmoji('⭕');
      onCreated();
      onClose();
    },
    onError: (err: Error) => Alert.alert('Error', err.message),
  });

  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <Text style={styles.sheetTitle}>New Circle</Text>

      {/* Emoji picker */}
      <View style={styles.emojiRow}>
        {EMOJIS.map((e) => (
          <TouchableOpacity
            key={e}
            style={[styles.emojiBtn, emoji === e && styles.emojiBtnActive]}
            onPress={() => setEmoji(e)}
            activeOpacity={0.8}
          >
            <LinearGradient
              colors={emoji === e ? ['rgba(10,123,79,0.3)', 'rgba(200,150,62,0.2)'] : ['transparent', 'transparent']}
              style={styles.emojiGradient}
            >
              <Text style={styles.emojiText}>{e}</Text>
            </LinearGradient>
          </TouchableOpacity>
        ))}
      </View>

      {/* Name input */}
      <TextInput
        style={styles.nameInput}
        value={name}
        onChangeText={setName}
        placeholder="Circle name (e.g. Family, Close Friends)"
        placeholderTextColor={colors.text.tertiary}
        maxLength={40}
        autoFocus
      />

      <TouchableOpacity
        style={[styles.createBtnWrapper, (!name.trim() || createMutation.isPending) && styles.createBtnDisabled]}
        onPress={() => createMutation.mutate()}
        disabled={!name.trim() || createMutation.isPending}
        activeOpacity={0.8}
      >
        <LinearGradient
          colors={!name.trim() || createMutation.isPending ? ['rgba(45,53,72,0.6)', 'rgba(28,35,51,0.4)'] : [colors.emerald, colors.gold]}
          style={styles.createBtnGradient}
        >
          {createMutation.isPending ? (
            <ActivityIndicator color={colors.text.primary} size="small" />
          ) : (
            <Text style={styles.createBtnText}>Create Circle</Text>
          )}
        </LinearGradient>
      </TouchableOpacity>
    </BottomSheet>
  );
}

export default function CirclesScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
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
  });

  const circles: Circle[] = (circlesQuery.data as Circle[]) ?? [];

  const deleteMutation = useMutation({
    mutationFn: (id: string) => circlesApi.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['my-circles'] }),
    onError: (err: Error) => Alert.alert('Error', err.message),
  });

  const handleDelete = (circle: Circle) => {
    Alert.alert(
      `Delete "${circle.name}"?`,
      'This will remove the circle and all its members.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete', style: 'destructive',
          onPress: () => deleteMutation.mutate(circle.id),
        },
      ],
    );
  };

  if (circlesQuery.isError) {
    return (
      <View style={styles.container}>
        <GlassHeader
          title="Circles"
          leftAction={{ icon: 'arrow-left', onPress: () => router.back(), accessibilityLabel: 'Back' }}
        />
        <EmptyState
          icon="flag"
          title="Couldn't load content"
          subtitle="Check your connection and try again"
          actionLabel="Retry"
          onAction={() => circlesQuery.refetch()}
        />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <GlassHeader
        title="Circles"
        leftAction={{ icon: 'arrow-left', onPress: () => router.back(), accessibilityLabel: 'Back' }}
        rightActions={[{ icon: 'plus', onPress: () => setShowCreate(true), accessibilityLabel: 'Create circle' }]}
      />

      <Text style={[styles.subtitle, { marginTop: insets.top + 52 }]}>
        Share posts with specific groups of people
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
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.emerald} />
          }
          renderItem={({ item, index }) => (
            <Animated.View entering={FadeInUp.delay(index * 50).duration(400)}>
              <LinearGradient
                colors={['rgba(45,53,72,0.4)', 'rgba(28,35,51,0.2)']}
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
                  <Text style={styles.circleName}>{item.name}</Text>
                  <View style={styles.memberBadge}>
                    <Icon name="users" size="xs" color={colors.text.tertiary} />
                    <Text style={styles.circleMemberCount}>
                      {item._count?.members ?? 0} members
                    </Text>
                  </View>
                </View>
                <TouchableOpacity
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
                </TouchableOpacity>
              </LinearGradient>
            </Animated.View>
          )}
          ListEmptyComponent={() => (
            <EmptyState
              icon="users"
              title="No circles yet"
              subtitle="Create circles to share posts with specific groups"
              actionLabel="Create your first circle"
              onAction={() => setShowCreate(true)}
            />
          )}
        />
      )}

      <CreateSheet
        visible={showCreate}
        onClose={() => setShowCreate(false)}
        onCreated={() => queryClient.invalidateQueries({ queryKey: ['my-circles'] })}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.dark.bg },

  subtitle: {
    color: colors.text.secondary, fontSize: fontSize.sm,
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
    borderColor: 'rgba(255,255,255,0.06)',
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
  circleName: { color: colors.text.primary, fontSize: fontSize.base, fontWeight: '600' },
  memberBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: 2,
  },
  circleMemberCount: { color: colors.text.tertiary, fontSize: fontSize.sm },
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
    color: colors.text.primary, fontSize: fontSize.base, fontWeight: '700',
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
    borderColor: 'rgba(255,255,255,0.06)',
  },
  emojiGradient: {
    width: 48, height: 48,
    alignItems: 'center', justifyContent: 'center',
  },
  emojiBtnActive: { borderColor: colors.emerald },
  emojiText: { fontSize: 24 },
  nameInput: {
    backgroundColor: colors.dark.bgElevated, borderRadius: radius.md,
    paddingHorizontal: spacing.md, paddingVertical: spacing.md,
    color: colors.text.primary, fontSize: fontSize.base,
    marginBottom: spacing.lg, marginHorizontal: spacing.base,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
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
  createBtnText: { color: '#fff', fontSize: fontSize.base, fontWeight: '700' },
});
