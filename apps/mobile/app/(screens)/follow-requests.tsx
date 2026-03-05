import { useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Pressable,
  FlatList, ActivityIndicator, Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Avatar } from '@/components/ui/Avatar';
import { Icon } from '@/components/ui/Icon';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import { colors, spacing, fontSize } from '@/theme';
import { followsApi } from '@/services/api';
import type { FollowRequest } from '@/types';

function RequestRow({
  request,
  onAccept,
  onDecline,
  loading,
}: {
  request: FollowRequest;
  onAccept: () => void;
  onDecline: () => void;
  loading: boolean;
}) {
  const router = useRouter();
  const { follower } = request;

  return (
    <View style={styles.row}>
      <TouchableOpacity onPress={() => router.push(`/(screens)/profile/${follower.username}`)}>
        <Avatar uri={follower.avatarUrl} name={follower.displayName} size="md" />
      </TouchableOpacity>

      <View style={styles.info}>
        <TouchableOpacity onPress={() => router.push(`/(screens)/profile/${follower.username}`)}>
          <Text style={styles.name}>{follower.displayName}</Text>
          <Text style={styles.username}>@{follower.username}</Text>
          {follower.bio ? (
            <Text style={styles.bio} numberOfLines={1}>{follower.bio}</Text>
          ) : null}
        </TouchableOpacity>
      </View>

      <View style={styles.actions}>
        {loading ? (
          <ActivityIndicator color={colors.emerald} size="small" />
        ) : (
          <>
            <TouchableOpacity style={styles.acceptBtn} onPress={onAccept}>
              <Text style={styles.acceptText}>Confirm</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.declineBtn} onPress={onDecline}>
              <Text style={styles.declineText}>Delete</Text>
            </TouchableOpacity>
          </>
        )}
      </View>
    </View>
  );
}

export default function FollowRequestsScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();

  const requestsQuery = useQuery({
    queryKey: ['follow-requests'],
    queryFn: () => followsApi.getRequests(),
  });

  const requests: FollowRequest[] = requestsQuery.data?.data ?? [];

  const acceptMutation = useMutation({
    mutationFn: (id: string) => followsApi.acceptRequest(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['follow-requests'] }),
    onError: (err: Error) => Alert.alert('Error', err.message),
  });

  const declineMutation = useMutation({
    mutationFn: (id: string) => followsApi.declineRequest(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['follow-requests'] }),
    onError: (err: Error) => Alert.alert('Error', err.message),
  });

  const pendingId = acceptMutation.variables ?? declineMutation.variables;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={8} style={styles.backBtn}>
          <Icon name="arrow-left" size="md" color={colors.text.primary} />
        </Pressable>
        <Text style={styles.headerTitle}>Follow Requests</Text>
        <View style={{ width: 36 }} />
      </View>

      {requestsQuery.isLoading ? (
        <View style={styles.skeletonList}>
          {Array.from({ length: 5 }).map((_, i) => (
            <View key={i} style={styles.skeletonRow}>
              <Skeleton.Circle size={48} />
              <View style={{ flex: 1, gap: 6 }}>
                <Skeleton.Rect width={120} height={14} />
                <Skeleton.Rect width={80} height={11} />
              </View>
            </View>
          ))}
        </View>
      ) : (
        <FlatList
          data={requests}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <RequestRow
              request={item}
              loading={
                (acceptMutation.isPending || declineMutation.isPending) && pendingId === item.id
              }
              onAccept={() => acceptMutation.mutate(item.id)}
              onDecline={() => declineMutation.mutate(item.id)}
            />
          )}
          ListEmptyComponent={() => (
            <EmptyState
              icon="user"
              title="No pending requests"
              subtitle="Follow requests from people who want to follow your private account will appear here."
            />
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.dark.bg },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.base, paddingVertical: spacing.sm,
    borderBottomWidth: 0.5, borderBottomColor: colors.dark.border,
  },
  backBtn: { width: 36 },
  headerTitle: { color: colors.text.primary, fontSize: fontSize.base, fontWeight: '700' },

  list: { paddingBottom: 40 },
  skeletonList: { padding: spacing.base, gap: spacing.md },
  skeletonRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    paddingHorizontal: spacing.base, paddingVertical: spacing.md,
  },

  row: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: spacing.base, paddingVertical: spacing.md,
    borderBottomWidth: 0.5, borderBottomColor: colors.dark.border,
    gap: spacing.sm,
  },
  info: { flex: 1 },
  name: { color: colors.text.primary, fontSize: fontSize.sm, fontWeight: '700' },
  username: { color: colors.text.secondary, fontSize: fontSize.xs, marginTop: 1 },
  bio: { color: colors.text.secondary, fontSize: fontSize.xs, marginTop: 3 },

  actions: { alignItems: 'center', gap: spacing.xs },
  acceptBtn: {
    backgroundColor: colors.emerald, borderRadius: 8,
    paddingHorizontal: spacing.md, paddingVertical: spacing.xs + 1,
  },
  acceptText: { color: '#fff', fontSize: fontSize.sm, fontWeight: '700' },
  declineBtn: {
    backgroundColor: colors.dark.bgElevated, borderRadius: 8,
    paddingHorizontal: spacing.md, paddingVertical: spacing.xs + 1,
  },
  declineText: { color: colors.text.primary, fontSize: fontSize.sm, fontWeight: '600' },

});
