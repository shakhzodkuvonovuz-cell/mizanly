import { useState, useRef } from 'react';
import { View, Text, StyleSheet, TextInput, Switch, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';

import { GlassHeader } from '@/components/ui/GlassHeader';
import { CharCountRing } from '@/components/ui/CharCountRing';
import { GradientButton } from '@/components/ui/GradientButton';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { Icon } from '@/components/ui/Icon';
import { colors, spacing, fontSize, radius } from '@/theme';
import { playlistsApi, channelsApi } from '@/services/api';
import { useContextualHaptic } from '@/hooks/useContextualHaptic';
import { useTranslation } from '@/hooks/useTranslation';
import { useThemeColors } from '@/hooks/useThemeColors';
import { ScreenErrorBoundary } from '@/components/ui/ScreenErrorBoundary';
import { showToast } from '@/components/ui/Toast';

export default function CreatePlaylistScreen() {
  const router = useRouter();
  const tc = useThemeColors();
  const styles = createStyles(tc);
  const params = useLocalSearchParams<{ channelId?: string }>();
  const insets = useSafeAreaInsets();
  const haptic = useContextualHaptic();
  const { t } = useTranslation();
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

  const createLockRef = useRef(false);
  const createMutation = useMutation({
    mutationFn: (data: { channelId: string; title: string; description?: string; isPublic: boolean }) =>
      playlistsApi.create(data),
    onSuccess: (newPlaylist) => {
      haptic.success();
      queryClient.invalidateQueries({ queryKey: ['channel-playlists', channelId] });
      router.back();
    },
    onError: () => {
      haptic.error();
      showToast({ message: t('createPlaylist.createError'), variant: 'error' });
    },
    onSettled: () => { createLockRef.current = false; },
  });

  const handleCreate = () => {
    if (createLockRef.current) return;
    if (!title.trim()) {
      showToast({ message: t('createPlaylist.titleRequired'), variant: 'error' });
      return;
    }
    if (!channelId) {
      showToast({ message: t('createPlaylist.channelNotFound'), variant: 'error' });
      return;
    }
    createLockRef.current = true;
    createMutation.mutate({
      channelId,
      title: title.trim(),
      description: description.trim() || undefined,
      isPublic,
    });
  };

  if (isChannelsError) {
    return (
      <View style={[styles.container, { backgroundColor: tc.bg }]}>
        <GlassHeader 
          title={t('createPlaylist.title')} 
          leftAction={{ icon: 'arrow-left', onPress: () => router.back(), accessibilityLabel: t('common.back') }} 
        />
        <View style={{ height: insets.top + 52 }} />
        <EmptyState 
          icon="flag"
          title={t('createPlaylist.errorTitle')} 
          subtitle={t('createPlaylist.errorSubtitle')} 
          actionLabel={t('common.goBack')} 
          onAction={() => router.back()} 
        />
      </View>
    );
  }

  if (isChannelsLoading) {
    return (
      <View style={[styles.container, { backgroundColor: tc.bg }]}>
        <GlassHeader 
          title={t('createPlaylist.title')} 
          leftAction={{ icon: 'arrow-left', onPress: () => router.back(), accessibilityLabel: t('common.back') }} 
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
    <ScreenErrorBoundary>
      <View style={[styles.container, { backgroundColor: tc.bg }]}>
        <GlassHeader 
          title={t('createPlaylist.title')} 
          leftAction={{ icon: 'arrow-left', onPress: () => router.back(), accessibilityLabel: t('common.back') }} 
        />
      
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={[
            styles.content,
            { paddingTop: insets.top + 52 + spacing.md, paddingBottom: insets.bottom + spacing['2xl'] }
          ]}
          keyboardShouldPersistTaps="handled"
        >
          {/* Title Section */}
          <Animated.View entering={FadeInUp.delay(100).duration(400)}>
            <View style={styles.sectionHeader}>
              <LinearGradient
                colors={['rgba(10,123,79,0.2)', 'rgba(200,150,62,0.1)']}
                style={styles.sectionIcon}
              >
                <Icon name="edit" size="sm" color={colors.gold} />
              </LinearGradient>
              <Text style={styles.label}>{t('createPlaylist.label.title')}</Text>
            </View>
            <LinearGradient
              colors={colors.gradient.cardDark}
              style={styles.inputWrap}
            >
              <TextInput
                style={styles.input}
                placeholder={t('createPlaylist.placeholder.title')}
                placeholderTextColor={tc.text.tertiary}
                value={title}
                onChangeText={(text) => text.length <= MAX_TITLE && setTitle(text)}
              />
              <View style={styles.ringWrap}>
                 <CharCountRing current={title.length} max={MAX_TITLE} size={24} />
              </View>
            </LinearGradient>
          </Animated.View>

          {/* Description Section */}
          <Animated.View entering={FadeInUp.delay(200).duration(400)}>
            <View style={styles.sectionHeader}>
              <LinearGradient
                colors={['rgba(10,123,79,0.2)', 'rgba(200,150,62,0.1)']}
                style={styles.sectionIcon}
              >
                <Icon name="file-text" size="sm" color={colors.gold} />
              </LinearGradient>
              <Text style={styles.label}>{t('createPlaylist.label.description')}</Text>
            </View>
            <LinearGradient
              colors={colors.gradient.cardDark}
              style={[styles.inputWrap, styles.textAreaWrap]}
            >
              <TextInput
                style={[styles.input, styles.textArea]}
                placeholder={t('createPlaylist.placeholder.description')}
                placeholderTextColor={tc.text.tertiary}
                value={description}
                onChangeText={(text) => text.length <= MAX_DESC && setDescription(text)}
                multiline
                numberOfLines={4}
                textAlignVertical="top"
              />
              <View style={styles.ringWrapBottom}>
                 <CharCountRing current={description.length} max={MAX_DESC} size={24} />
              </View>
            </LinearGradient>
          </Animated.View>

          {/* Privacy Toggle */}
          <Animated.View entering={FadeInUp.delay(300).duration(400)}>
            <LinearGradient
              colors={colors.gradient.cardDark}
              style={styles.toggleRow}
            >
              <View style={styles.toggleIconBg}>
                <LinearGradient
                  colors={isPublic ? ['rgba(10,123,79,0.3)', 'rgba(10,123,79,0.1)'] : ['rgba(100,100,100,0.2)', 'transparent']}
                  style={styles.toggleIconGradient}
                >
                  <Icon name={isPublic ? "globe" : "lock"} size="sm" color={isPublic ? colors.emerald : tc.text.tertiary} />
                </LinearGradient>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.toggleTitle}>{t(isPublic ? 'createPlaylist.toggle.publicTitle' : 'createPlaylist.toggle.privateTitle')}</Text>
                <Text style={styles.toggleDesc}>
                  {t(isPublic ? 'createPlaylist.toggle.publicDescription' : 'createPlaylist.toggle.privateDescription')}
                </Text>
              </View>
              <Switch
                value={isPublic}
                onValueChange={setIsPublic}
                trackColor={{ false: tc.border, true: colors.emerald }}
                thumbColor={tc.text.primary}
              />
            </LinearGradient>
          </Animated.View>

          {/* Create Button */}
          <Animated.View entering={FadeInUp.delay(400).duration(400)} style={styles.buttonWrap}>
            <GradientButton
              label={createMutation.isPending ? t('createPlaylist.creating') : t('createPlaylist.create')}
              onPress={handleCreate}
              disabled={createMutation.isPending || title.trim().length === 0 || !channelId}
            />
          </Animated.View>
        </ScrollView>
        </KeyboardAvoidingView>
      </View>

    </ScreenErrorBoundary>
  );
}

const createStyles = (tc: ReturnType<typeof useThemeColors>) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: tc.bg,
  },
  content: {
    paddingHorizontal: spacing.base,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.xs,
    marginTop: spacing.lg,
  },
  sectionIcon: {
    width: 28,
    height: 28,
    borderRadius: radius.full,
    justifyContent: 'center',
    alignItems: 'center',
  },
  label: {
    fontSize: fontSize.sm,
    fontWeight: '500',
    color: tc.text.secondary,
  },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    height: 56,
    borderWidth: 0.5,
    borderColor: colors.active.white6,
  },
  textAreaWrap: {
    height: 120,
    alignItems: 'flex-start',
    paddingVertical: spacing.md,
  },
  input: {
    flex: 1,
    color: tc.text.primary,
    fontSize: fontSize.base,
    height: '100%',
  },
  textArea: {
    height: '100%',
  },
  ringWrap: {
    paddingStart: spacing.sm,
  },
  ringWrapBottom: {
    position: 'absolute',
    bottom: spacing.xs,
    end: spacing.sm,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.xl,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 0.5,
    borderColor: colors.active.white6,
  },
  toggleIconBg: {
    marginEnd: spacing.md,
  },
  toggleIconGradient: {
    width: 40,
    height: 40,
    borderRadius: radius.full,
    justifyContent: 'center',
    alignItems: 'center',
  },
  toggleTitle: {
    fontSize: fontSize.base,
    fontWeight: '500',
    color: tc.text.primary,
  },
  toggleDesc: {
    fontSize: fontSize.xs,
    color: tc.text.secondary,
    marginTop: 2,
  },
  buttonWrap: {
    marginTop: spacing['2xl'],
  },
});
