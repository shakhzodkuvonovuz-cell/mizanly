import { useState } from 'react';
import { View, Text, StyleSheet, TextInput, Switch, Alert, ScrollView } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GlassHeader } from '@/components/ui/GlassHeader';
import { CharCountRing } from '@/components/ui/CharCountRing';
import { GradientButton } from '@/components/ui/GradientButton';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { colors, spacing, fontSize, radius } from '@/theme';
import { playlistsApi, channelsApi } from '@/services/api';
import { useHaptic } from '@/hooks/useHaptic';

export default function CreatePlaylistScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ channelId?: string }>();
  const insets = useSafeAreaInsets();
  const haptic = useHaptic();
  const queryClient = useQueryClient();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [isPublic, setIsPublic] = useState(true);

  const MAX_TITLE = 50;
  const MAX_DESC = 150;

  // Fetch user's channels to get the default channelId if not provided
  const { data: channels, isLoading: isChannelsLoading, isError: isChannelsError } = useQuery({
    queryKey: ['my-channels'],
    queryFn: () => channelsApi.getMyChannels(),
    enabled: !params.channelId,
  });

  const channelId = params.channelId || (channels?.[0]?.id);

  const createMutation = useMutation({
    mutationFn: (data: { channelId: string; title: string; description?: string; isPublic: boolean }) =>
      playlistsApi.create(data),
    onSuccess: (newPlaylist) => {
      haptic.success();
      queryClient.invalidateQueries({ queryKey: ['playlists', channelId] });
      router.back();
    },
    onError: () => {
      haptic.error();
      Alert.alert('Error', 'Failed to create playlist. Please try again.');
    },
  });

  const handleCreate = () => {
    if (!title.trim()) {
      Alert.alert('Required', 'Please enter a title for the playlist.');
      return;
    }
    if (!channelId) {
      Alert.alert('Error', 'Channel not found. Cannot create playlist.');
      return;
    }
    createMutation.mutate({
      channelId,
      title: title.trim(),
      description: description.trim() || undefined,
      isPublic,
    });
  };

  if (isChannelsError) {
    return (
      <View style={styles.container}>
        <GlassHeader 
          title="New Playlist" 
          leftAction={{ icon: 'arrow-left', onPress: () => router.back(), accessibilityLabel: 'Go back' }} 
        />
        <View style={{ height: insets.top + 52 }} />
        <EmptyState 
          icon="flag"
          title="Could not load channel" 
          subtitle="You need a channel to create a playlist." 
          actionLabel="Go Back" 
          onAction={() => router.back()} 
        />
      </View>
    );
  }

  if (isChannelsLoading) {
    return (
      <View style={styles.container}>
        <GlassHeader 
          title="New Playlist" 
          leftAction={{ icon: 'arrow-left', onPress: () => router.back(), accessibilityLabel: 'Go back' }} 
        />
        <View style={{ height: insets.top + 52 }} />
        <View style={{ padding: spacing.base, gap: spacing.md }}>
          <Skeleton.Rect width="100%" height={80} borderRadius={radius.md} />
          <Skeleton.Rect width="100%" height={120} borderRadius={radius.md} />
          <Skeleton.Rect width="100%" height={60} borderRadius={radius.md} />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <GlassHeader 
        title="New Playlist" 
        leftAction={{ icon: 'arrow-left', onPress: () => router.back(), accessibilityLabel: 'Go back' }} 
      />
      
      <ScrollView 
        contentContainerStyle={[
          styles.content, 
          { paddingTop: insets.top + 52 + spacing.md, paddingBottom: insets.bottom + spacing['2xl'] }
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.label}>Title</Text>
        <View style={styles.inputWrap}>
          <TextInput
            style={styles.input}
            placeholder="e.g., Favorite Nasheeds"
            placeholderTextColor={colors.text.secondary}
            value={title}
            onChangeText={(text) => text.length <= MAX_TITLE && setTitle(text)}
          />
          <View style={styles.ringWrap}>
             <CharCountRing current={title.length} max={MAX_TITLE} size={24} />
          </View>
        </View>

        <Text style={styles.label}>Description (Optional)</Text>
        <View style={[styles.inputWrap, styles.textAreaWrap]}>
          <TextInput
            style={[styles.input, styles.textArea]}
            placeholder="What's this playlist about?"
            placeholderTextColor={colors.text.secondary}
            value={description}
            onChangeText={(text) => text.length <= MAX_DESC && setDescription(text)}
            multiline
            numberOfLines={4}
            textAlignVertical="top"
          />
          <View style={styles.ringWrapBottom}>
             <CharCountRing current={description.length} max={MAX_DESC} size={24} />
          </View>
        </View>

        <View style={styles.toggleRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.toggleTitle}>Public Playlist</Text>
            <Text style={styles.toggleDesc}>Anyone can search for and view this playlist</Text>
          </View>
          <Switch 
            value={isPublic}
            onValueChange={setIsPublic}
            trackColor={{ false: colors.dark.surface, true: colors.emerald }}
            thumbColor={colors.dark.text}
          />
        </View>

        <View style={styles.buttonWrap}>
          <GradientButton 
            title={createMutation.isPending ? "Creating..." : "Create Playlist"}
            onPress={handleCreate}
            disabled={createMutation.isPending || title.trim().length === 0 || !channelId}
          />
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.dark.bg,
  },
  content: {
    paddingHorizontal: spacing.base,
  },
  label: {
    fontSize: fontSize.sm,
    fontWeight: '500',
    color: colors.text.secondary,
    marginBottom: spacing.xs,
    marginTop: spacing.lg,
  },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.dark.surface,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    height: 52,
  },
  textAreaWrap: {
    height: 120,
    alignItems: 'flex-start',
    paddingVertical: spacing.md,
  },
  input: {
    flex: 1,
    color: colors.text.primary,
    fontSize: fontSize.base,
    height: '100%',
  },
  textArea: {
    height: '100%',
  },
  ringWrap: {
    paddingLeft: spacing.sm,
  },
  ringWrapBottom: {
    position: 'absolute',
    bottom: spacing.xs,
    right: spacing.sm,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.xl,
    paddingVertical: spacing.sm,
    backgroundColor: colors.dark.surface,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
  },
  toggleTitle: {
    fontSize: fontSize.base,
    fontWeight: '500',
    color: colors.text.primary,
  },
  toggleDesc: {
    fontSize: fontSize.xs,
    color: colors.text.secondary,
    marginTop: 2,
  },
  buttonWrap: {
    marginTop: spacing['2xl'],
  },
});
