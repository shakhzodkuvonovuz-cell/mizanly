import { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, RefreshControl, Pressable,
  TextInput, Alert,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ProgressiveImage } from '@/components/ui/ProgressiveImage';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { Icon } from '@/components/ui/Icon';
import { GlassHeader } from '@/components/ui/GlassHeader';
import { GradientButton } from '@/components/ui/GradientButton';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { CharCountRing } from '@/components/ui/CharCountRing';
import { ScreenErrorBoundary } from '@/components/ui/ScreenErrorBoundary';
import { colors, spacing, fontSize, radius, fonts } from '@/theme';
import { postsApi } from '@/services/api';
import { useTranslation } from '@/hooks/useTranslation';
import { useThemeColors } from '@/hooks/useThemeColors';
import { useContextualHaptic } from '@/hooks/useContextualHaptic';
import { rtlFlexRow, rtlTextAlign } from '@/utils/rtl';

const SPACES = [
  { key: 'SAF', icon: 'image' as const, tKey: 'crossPost.saf' },
  { key: 'MAJLIS', icon: 'message-circle' as const, tKey: 'crossPost.majlis' },
  { key: 'BAKRA', icon: 'video' as const, tKey: 'crossPost.bakra' },
  { key: 'MINBAR', icon: 'play' as const, tKey: 'crossPost.minbar' },
];

const CAPTION_MAX = 2000;

function CrossPostContent() {
  const { t, isRTL } = useTranslation();
  const tc = useThemeColors();
  const { postId } = useLocalSearchParams<{ postId: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const haptic = useContextualHaptic();
  const [refreshing, setRefreshing] = useState(false);
  const [selectedSpaces, setSelectedSpaces] = useState<Set<string>>(new Set());
  const [captionOverride, setCaptionOverride] = useState('');

  const postQuery = useQuery({
    queryKey: ['post', postId],
    queryFn: () => postsApi.getById(postId),
    enabled: !!postId,
  });

  const post = postQuery.data;

  const crossPostMutation = useMutation({
    mutationFn: () =>
      postsApi.crossPost(postId, {
        targetSpaces: Array.from(selectedSpaces),
        captionOverride: captionOverride.trim() || undefined,
      }),
    onSuccess: () => {
      haptic.success();
      Alert.alert(t('crossPost.title'), t('crossPost.success'));
      router.back();
    },
    onError: () => {
      haptic.error();
    },
  });

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    postQuery.refetch().finally(() => setRefreshing(false));
  }, [postQuery]);

  const toggleSpace = (key: string) => {
    haptic.tick();
    setSelectedSpaces(prev => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const handleCrossPost = () => {
    if (selectedSpaces.size === 0) {
      Alert.alert(t('crossPost.noSpaces'));
      return;
    }
    haptic.send();
    crossPostMutation.mutate();
  };

  // Available spaces (exclude the post's current space)
  const currentSpace = post?.space;
  const availableSpaces = SPACES.filter(s => s.key !== currentSpace);

  if (postQuery.isLoading) {
    return (
      <View style={[styles.container, { backgroundColor: tc.bg }]}>
        <GlassHeader
          title={t('crossPost.title')}
          leftAction={{ icon: 'arrow-left', onPress: () => router.back() }}
        />
        <View style={styles.content}>
          <Skeleton.PostCard />
          <View style={{ marginTop: spacing.xl }}>
            <Skeleton.Rect width={200} height={20} borderRadius={radius.sm} />
            <View style={{ marginTop: spacing.base }}>
              {[1, 2, 3, 4].map(i => (
                <Skeleton.Rect key={i} width="100%" height={56} borderRadius={radius.md} style={{ marginBottom: spacing.sm }} />
              ))}
            </View>
          </View>
        </View>
      </View>
    );
  }

  if (!post) {
    return (
      <View style={[styles.container, { backgroundColor: tc.bg }]}>
        <GlassHeader
          title={t('crossPost.title')}
          leftAction={{ icon: 'arrow-left', onPress: () => router.back() }}
        />
        <EmptyState
          icon="slash"
          title={t('common.notFound')}
          subtitle={t('common.mayBeDeleted')}
        />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: tc.bg }]}>
      <GlassHeader
        title={t('crossPost.title')}
        leftAction={{ icon: 'arrow-left', onPress: () => router.back() }}
      />
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 100 }]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.emerald}
          />
        }
      >
        {/* Source post preview */}
        <Animated.View entering={FadeInUp.duration(300)}>
          <LinearGradient
            colors={[tc.bgCard, tc.bgElevated]}
            style={[styles.previewCard, { borderColor: tc.border }]}
          >
            <View style={[styles.previewRow, { flexDirection: rtlFlexRow(isRTL) }]}>
              {post.thumbnailUrl || (post.mediaUrls && post.mediaUrls.length > 0) ? (
                <ProgressiveImage
                  uri={post.thumbnailUrl || post.mediaUrls[0]}
                  width={72}
                  height={72}
                  borderRadius={radius.md}
                />
              ) : null}
              <View style={styles.previewText}>
                <Text
                  style={[styles.previewContent, { textAlign: rtlTextAlign(isRTL) }]}
                  numberOfLines={3}
                >
                  {post.content || ''}
                </Text>
                <Text style={[styles.previewMeta, { textAlign: rtlTextAlign(isRTL) }]}>
                  {post.user?.username ? `@${post.user.username}` : ''}
                </Text>
              </View>
            </View>
          </LinearGradient>
        </Animated.View>

        {/* Space selection */}
        <Animated.View entering={FadeInUp.duration(300).delay(100)}>
          <Text style={[styles.sectionTitle, { textAlign: rtlTextAlign(isRTL) }]}>
            {t('crossPost.selectSpaces')}
          </Text>
          {availableSpaces.map(space => {
            const isSelected = selectedSpaces.has(space.key);
            return (
              <Pressable
                accessibilityRole="button"
                key={space.key}
                style={[
                  styles.spaceOption,
                  isSelected && styles.spaceOptionSelected,
                  { flexDirection: rtlFlexRow(isRTL) },
                ]}
                onPress={() => toggleSpace(space.key)}
              >
                <View style={[styles.spaceIconWrap, isSelected && styles.spaceIconWrapSelected]}>
                  <Icon
                    name={space.icon}
                    size="md"
                    color={isSelected ? colors.emerald : tc.text.secondary}
                  />
                </View>
                <Text style={[styles.spaceLabel, isSelected && styles.spaceLabelSelected]}>
                  {t(space.tKey)}
                </Text>
                <View style={styles.spacer} />
                <View style={[styles.checkbox, isSelected && styles.checkboxSelected]}>
                  {isSelected && <Icon name="check" size="xs" color="#fff" />}
                </View>
              </Pressable>
            );
          })}
        </Animated.View>

        {/* Caption override */}
        <Animated.View entering={FadeInUp.duration(300).delay(200)}>
          <View style={[styles.captionHeader, { flexDirection: rtlFlexRow(isRTL) }]}>
            <Text style={[styles.sectionTitle, { textAlign: rtlTextAlign(isRTL), marginBottom: 0 }]}>
              {t('crossPost.captionOverride')}
            </Text>
            <View style={styles.spacer} />
            <CharCountRing current={captionOverride.length} max={CAPTION_MAX} size={28} />
          </View>
          <LinearGradient
            colors={[tc.bgCard, tc.bgElevated]}
            style={[styles.captionInputWrap, { borderColor: tc.border }]}
          >
            <TextInput
              style={[styles.captionInput, { textAlign: rtlTextAlign(isRTL) }]}
              placeholder={t('crossPost.captionPlaceholder')}
              placeholderTextColor={tc.text.tertiary}
              value={captionOverride}
              onChangeText={setCaptionOverride}
              maxLength={CAPTION_MAX}
              multiline
              numberOfLines={4}
            />
          </LinearGradient>
        </Animated.View>
      </ScrollView>

      {/* Bottom action */}
      <View style={[styles.bottomBar, { paddingBottom: insets.bottom + spacing.base }]}>
        <GradientButton
          label={crossPostMutation.isPending ? t('crossPost.posting') : t('crossPost.post')}
          onPress={handleCrossPost}
          loading={crossPostMutation.isPending}
          disabled={selectedSpaces.size === 0}
          icon="layers"
        />
      </View>
    </View>
  );
}

export default function CrossPostScreen() {
  return (
    <ScreenErrorBoundary>
      <CrossPostContent />
    </ScreenErrorBoundary>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.dark.bg,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: spacing.base,
  },
  previewCard: {
    borderRadius: radius.lg,
    padding: spacing.base,
    marginBottom: spacing.xl,
    borderWidth: 1,
    borderColor: colors.dark.border,
  },
  previewRow: {
    alignItems: 'center',
    gap: spacing.md,
  },
  previewImage: {
    width: 72,
    height: 72,
    borderRadius: radius.md,
    backgroundColor: colors.dark.surface,
  },
  previewText: {
    flex: 1,
  },
  previewContent: {
    color: colors.text.primary,
    fontSize: fontSize.base,
    fontFamily: fonts.bodyMedium,
    lineHeight: 22,
  },
  previewMeta: {
    color: colors.text.secondary,
    fontSize: fontSize.sm,
    marginTop: spacing.xs,
  },
  sectionTitle: {
    color: colors.text.primary,
    fontSize: fontSize.md,
    fontFamily: fonts.bodySemiBold,
    marginBottom: spacing.md,
  },
  spaceOption: {
    alignItems: 'center',
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.dark.bgCard,
    borderWidth: 1,
    borderColor: colors.dark.border,
    marginBottom: spacing.sm,
    gap: spacing.md,
  },
  spaceOptionSelected: {
    borderColor: colors.emerald,
    backgroundColor: colors.active.emerald10,
  },
  spaceIconWrap: {
    width: 40,
    height: 40,
    borderRadius: radius.full,
    backgroundColor: colors.dark.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  spaceIconWrapSelected: {
    backgroundColor: colors.active.emerald10,
  },
  spaceLabel: {
    color: colors.text.secondary,
    fontSize: fontSize.base,
    fontFamily: fonts.bodyMedium,
  },
  spaceLabelSelected: {
    color: colors.text.primary,
  },
  spacer: {
    flex: 1,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: radius.sm,
    borderWidth: 2,
    borderColor: colors.dark.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxSelected: {
    backgroundColor: colors.emerald,
    borderColor: colors.emerald,
  },
  captionHeader: {
    alignItems: 'center',
    marginTop: spacing.xl,
    marginBottom: spacing.md,
  },
  captionInputWrap: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.dark.border,
    padding: spacing.md,
  },
  captionInput: {
    color: colors.text.primary,
    fontSize: fontSize.base,
    minHeight: 100,
    textAlignVertical: 'top',
  },
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: spacing.base,
    paddingTop: spacing.md,
    backgroundColor: colors.dark.bg,
    borderTopWidth: 1,
    borderTopColor: colors.dark.border,
  },
});
