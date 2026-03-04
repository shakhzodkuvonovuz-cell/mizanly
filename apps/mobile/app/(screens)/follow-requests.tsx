import { useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Pressable,
  FlatList, ActivityIndicator, Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { Icon } from '@/components/ui/Icon';
import { EmptyState } from '@/components/ui/EmptyState';
import { colors, spacing, fontSize } from '@/theme';
import { followsApi } from '@/services/api';

interface FollowRequest {
  id: string;
  createdAt: string;
  follower: {
    id: string;
    username: string;
    displayName: string;
    avatarUrl?: string;
    bio?: string;
  };
}

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
        {follower.avatarUrl ? (
          <Image source={{ uri: follower.avatarUrl }} style={styles.avatar} contentFit="cover" />
        ) : (
          <View style={[styles.avatar, styles.avatarFallback]}>
            <Text style={styles.avatarLetter}>{follower.displayName[0]?.toUpperCase()}</Text>
          </View>
        )}
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

  const requests: FollowRequest[] = (requestsQuery.data as any)?.requests ?? (requestsQuery.data as any) ?? [];

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
        <ActivityIndicator color={colors.emerald} style={styles.loader} />
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

  loader: { marginTop: 60 },
  list: { paddingBottom: 40 },

  row: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: spacing.base, paddingVertical: spacing.md,
    borderBottomWidth: 0.5, borderBottomColor: colors.dark.border,
    gap: spacing.sm,
  },
  avatar: { width: 48, height: 48, borderRadius: 24 },
  avatarFallback: { backgroundColor: colors.dark.surface, alignItems: 'center', justifyContent: 'center' },
  avatarLetter: { color: colors.text.primary, fontSize: fontSize.lg, fontWeight: '700' },
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
