import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TextInput, ScrollView, Pressable, Alert } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';

import { GlassHeader } from '@/components/ui/GlassHeader';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { Avatar } from '@/components/ui/Avatar';
import { Icon } from '@/components/ui/Icon';
import { GradientButton } from '@/components/ui/GradientButton';
import { CharCountRing } from '@/components/ui/CharCountRing';
import { colors, spacing, fontSize, radius } from '@/theme';
import { channelsApi } from '@/services/api';
import { useHaptic } from '@/hooks/useHaptic';

export default function EditChannelScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const haptic = useHaptic();
  const queryClient = useQueryClient();

  // If a handle is passed, use it, otherwise fetch the user's channels and pick the first one
  const params = useLocalSearchParams<{ handle?: string }>();

  const { data: channels, isLoading: isChannelsLoading, isError: isChannelsError } = useQuery({
    queryKey: ['my-channels'],
    queryFn: () => channelsApi.getMyChannels(),
    enabled: !params.handle,
  });

  const handle = params.handle || (channels?.[0]?.handle);

  const { data: channel, isLoading: isChannelLoading, isError: isChannelError } = useQuery({
    queryKey: ['channel', handle],
    queryFn: () => channelsApi.getByHandle(handle!),
    enabled: !!handle,
  });

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  const MAX_NAME = 50;
  const MAX_DESC = 150;

  useEffect(() => {
    if (channel) {
      setName(channel.name || '');
      setDescription(channel.description || '');
      setAvatarUrl(channel.avatarUrl || null);
    }
  }, [channel]);

  const updateMutation = useMutation({
    mutationFn: (data: { name: string; description?: string; avatarUrl?: string }) =>
      channelsApi.update(handle!, data),
    onSuccess: () => {
      haptic.success();
      queryClient.invalidateQueries({ queryKey: ['channel', handle] });
      queryClient.invalidateQueries({ queryKey: ['my-channels'] });
      router.back();
    },
    onError: () => {
      haptic.error();
      Alert.alert('Error', 'Failed to update channel. Please try again.');
    },
  });

  const pickImage = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]) {
        setAvatarUrl(result.assets[0].uri);
        haptic.light();
      }
    } catch (e) {
      Alert.alert('Error', 'Failed to pick image');
    }
  };

  const handleSave = () => {
    if (!name.trim()) {
      Alert.alert('Required', 'Please enter a name for the channel.');
      return;
    }
    updateMutation.mutate({
      name: name.trim(),
      description: description.trim() || undefined,
      avatarUrl: avatarUrl || undefined,
    });
  };

  const isLoading = isChannelsLoading || isChannelLoading;
  const isError = isChannelsError || isChannelError;

  if (isError) {
    return (
      <View style={styles.container}>
        <GlassHeader 
          title="Edit Channel" 
          leftAction={{ icon: 'arrow-left', onPress: () => router.back(), accessibilityLabel: 'Go back' }} 
        />
        <View style={{ height: insets.top + 52 }} />
        <EmptyState 
          icon="flag"
          title="Could not load channel" 
          subtitle="Check your connection and try again" 
          actionLabel="Go Back" 
          onAction={() => router.back()} 
        />
      </View>
    );
  }

  if (isLoading || !channel) {
    return (
      <View style={styles.container}>
        <GlassHeader 
          title="Edit Channel" 
          leftAction={{ icon: 'arrow-left', onPress: () => router.back(), accessibilityLabel: 'Go back' }} 
        />
        <View style={{ height: insets.top + 52 }} />
        <View style={{ padding: spacing.base, gap: spacing.md, alignItems: 'center' }}>
          <Skeleton.Circle size={100} />
          <Skeleton.Rect width="100%" height={56} borderRadius={radius.md} />
          <Skeleton.Rect width="100%" height={120} borderRadius={radius.md} />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <GlassHeader
        title="Edit Channel"
        leftAction={{ icon: 'arrow-left', onPress: () => router.back(), accessibilityLabel: 'Go back' }}
      />

      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + 52 + spacing.xl, paddingBottom: insets.bottom + spacing['2xl'] }
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <Animated.View entering={FadeInUp.delay(0).duration(400)} style={styles.avatarSection}>
          <Pressable onPress={pickImage} style={styles.avatarWrap}>
            <LinearGradient
              colors={['rgba(10,123,79,0.2)', 'rgba(200,150,62,0.1)']}
              style={styles.avatarBg}
            >
              <Avatar uri={avatarUrl || undefined} name={name || 'Channel'} size="3xl" />
            </LinearGradient>
            <LinearGradient
              colors={['rgba(10,123,79,0.6)', 'rgba(10,123,79,0.4)']}
              style={styles.editIconBadge}
            >
              <Icon name="camera" size={16} color="#fff" />
            </LinearGradient>
          </Pressable>
          <Text style={styles.avatarHint}>Tap to change photo</Text>
        </Animated.View>

        <Animated.View entering={FadeInUp.delay(100).duration(400)}>
          <LinearGradient
            colors={['rgba(45,53,72,0.4)', 'rgba(28,35,51,0.2)']}
            style={styles.card}
          >
            <Text style={styles.label}>Channel Name</Text>
            <View style={styles.inputWrap}>
              <TextInput
                style={styles.input}
                placeholder="e.g., Quran Recitations"
                placeholderTextColor={colors.text.secondary}
                value={name}
                onChangeText={(text) => text.length <= MAX_NAME && setName(text)}
              />
              <View style={styles.ringWrap}>
                 <CharCountRing current={name.length} max={MAX_NAME} size={24} />
              </View>
            </View>
          </LinearGradient>
        </Animated.View>

        <Animated.View entering={FadeInUp.delay(200).duration(400)}>
          <LinearGradient
            colors={['rgba(45,53,72,0.4)', 'rgba(28,35,51,0.2)']}
            style={styles.card}
          >
            <Text style={styles.label}>Description (Optional)</Text>
            <View style={[styles.inputWrap, styles.textAreaWrap]}>
              <TextInput
                style={[styles.input, styles.textArea]}
                placeholder="Tell viewers about your channel..."
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
          </LinearGradient>
        </Animated.View>

        <Animated.View entering={FadeInUp.delay(300).duration(400)} style={styles.buttonWrap}>
          <GradientButton
            title={updateMutation.isPending ? "Saving..." : "Save Changes"}
            onPress={handleSave}
            disabled={updateMutation.isPending || name.trim().length === 0}
          />
        </Animated.View>
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
    gap: spacing.lg,
  },
  avatarSection: {
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  avatarWrap: {
    position: 'relative',
  },
  avatarBg: {
    padding: spacing.xs,
    borderRadius: radius.full,
  },
  editIconBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 32,
    height: 32,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: colors.dark.bg,
  },
  avatarHint: {
    fontSize: fontSize.sm,
    color: colors.text.secondary,
    marginTop: spacing.sm,
  },
  card: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    padding: spacing.md,
  },
  label: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.text.primary,
    marginBottom: spacing.sm,
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
  buttonWrap: {
    marginTop: spacing.xl,
  },
});
