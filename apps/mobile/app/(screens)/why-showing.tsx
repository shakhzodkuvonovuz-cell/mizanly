import { useState, useEffect, useCallback } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet, Alert } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { GlassHeader } from '@/components/ui/GlassHeader';
import { Icon } from '@/components/ui/Icon';
import type { IconName } from '@/components/ui/Icon';
import { Skeleton } from '@/components/ui/Skeleton';
import { ScreenErrorBoundary } from '@/components/ui/ScreenErrorBoundary';
import { colors, spacing, fontSize, radius, fonts, shadow } from '@/theme';
import { useTranslation } from '@/hooks/useTranslation';
import { feedApi, postsApi } from '@/services/api';
import type { Post } from '@/types';

interface ReasonItem {
  icon: IconName;
  label: string;
  detail: string;
}

const REASON_MAP: Record<string, { icon: IconName; label: string }> = {
  follow: { icon: 'user', label: 'You follow this creator' },
  trending: { icon: 'trending-up', label: 'Trending in your region' },
  popular: { icon: 'heart', label: 'Popular with people you follow' },
  interests: { icon: 'check-circle', label: 'Based on your interests' },
  similar: { icon: 'layers', label: 'Similar to content you like' },
  hashtag: { icon: 'hash', label: 'From a topic you follow' },
};

function WhyShowingContent() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const params = useLocalSearchParams<{ postId: string; postType: string }>();

  const [loading, setLoading] = useState(true);
  const [post, setPost] = useState<Post | null>(null);
  const [reasons, setReasons] = useState<ReasonItem[]>([]);

  useEffect(() => {
    let cancelled = false;
    async function loadData() {
      try {
        if (params.postId) {
          const postData = await postsApi.getById(params.postId);
          if (!cancelled) setPost(postData as Post);
        }
        // Build reasons based on post data — in production, backend would provide these
        const defaultReasons: ReasonItem[] = [
          {
            icon: 'user',
            label: t('whyShowing.reasonFollow', 'You follow this creator'),
            detail: t('whyShowing.reasonFollowDetail', 'Content from accounts you follow appears in your feed'),
          },
          {
            icon: 'trending-up',
            label: t('whyShowing.reasonTrending', 'Trending content'),
            detail: t('whyShowing.reasonTrendingDetail', 'This post is getting high engagement in your community'),
          },
          {
            icon: 'check-circle',
            label: t('whyShowing.reasonInterests', 'Based on your interests'),
            detail: t('whyShowing.reasonInterestsDetail', 'You have engaged with similar content before'),
          },
        ];
        if (!cancelled) setReasons(defaultReasons);
      } catch {
        // Use fallback reasons
        if (!cancelled) {
          setReasons([
            {
              icon: 'eye',
              label: t('whyShowing.reasonGeneral', 'Recommended for you'),
              detail: t('whyShowing.reasonGeneralDetail', 'Our algorithm thinks you might enjoy this'),
            },
          ]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    loadData();
    return () => { cancelled = true; };
  }, [params.postId, t]);

  const handleNotInterested = useCallback(async () => {
    try {
      if (params.postId) {
        await feedApi.reportNotInterested(params.postId, params.postType ?? 'post');
      }
      Alert.alert(
        t('whyShowing.notInterestedTitle', 'Got it'),
        t('whyShowing.notInterestedMsg', "We'll show less content like this"),
      );
      router.back();
    } catch {
      Alert.alert(
        t('whyShowing.errorTitle', 'Error'),
        t('whyShowing.errorMsg', 'Something went wrong. Please try again.'),
      );
    }
  }, [params.postId, params.postType, router, t]);

  const handleSeeLess = useCallback(async () => {
    try {
      if (params.postId) {
        await feedApi.dismiss({
          postId: params.postId,
          reason: 'see_less',
        });
      }
      Alert.alert(
        t('whyShowing.seeLessTitle', 'Updated'),
        t('whyShowing.seeLessMsg', "You'll see less content like this"),
      );
      router.back();
    } catch {
      Alert.alert(
        t('whyShowing.errorTitle', 'Error'),
        t('whyShowing.errorMsg', 'Something went wrong. Please try again.'),
      );
    }
  }, [params.postId, router, t]);

  if (loading) {
    return (
      <View style={[styles.screen, { paddingTop: insets.top + 60 }]}>
        <GlassHeader
          title={t('whyShowing.title', "Why you're seeing this")}
          leftAction={{ icon: 'arrow-left', onPress: () => router.back() }}
        />
        <View style={styles.skeletonContainer}>
          <Skeleton.Rect width="100%" height={80} borderRadius={radius.md} />
          <View style={{ gap: spacing.md, marginTop: spacing.lg }}>
            {Array.from({ length: 3 }).map((_, i) => (
              <View key={`skel-${i}`} style={styles.skeletonReasonRow}>
                <Skeleton.Circle size={36} />
                <View style={{ flex: 1, gap: spacing.xs }}>
                  <Skeleton.Rect width={180} height={14} borderRadius={radius.sm} />
                  <Skeleton.Rect width={240} height={12} borderRadius={radius.sm} />
                </View>
              </View>
            ))}
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <GlassHeader
        title={t('whyShowing.title', "Why you're seeing this")}
        leftAction={{ icon: 'arrow-left', onPress: () => router.back() }}
      />
      <ScrollView
        contentContainerStyle={{
          paddingTop: insets.top + 60,
          paddingBottom: insets.bottom + spacing['2xl'],
          paddingHorizontal: spacing.base,
        }}
        showsVerticalScrollIndicator={false}
      >
        {/* Post Preview */}
        {post ? (
          <Animated.View entering={FadeInDown.duration(300)} style={styles.postPreview}>
            <View style={styles.postPreviewHeader}>
              <View style={styles.postTypeTag}>
                <Text style={styles.postTypeText}>
                  {params.postType === 'reel'
                    ? t('whyShowing.reel', 'Reel')
                    : params.postType === 'thread'
                      ? t('whyShowing.thread', 'Thread')
                      : t('whyShowing.post', 'Post')}
                </Text>
              </View>
            </View>
            <Text style={styles.postContent} numberOfLines={3}>
              {post.content}
            </Text>
          </Animated.View>
        ) : null}

        {/* Reasons Section */}
        <Text style={styles.sectionTitle}>
          {t('whyShowing.reasonsTitle', 'Reasons this appeared in your feed')}
        </Text>

        {reasons.map((reason, index) => (
          <Animated.View
            key={`reason-${index}`}
            entering={FadeInDown.delay(index * 80).duration(300)}
            style={styles.reasonCard}
          >
            <View style={styles.reasonIconContainer}>
              <Icon name={reason.icon} size="md" color={colors.emerald} />
            </View>
            <View style={styles.reasonContent}>
              <Text style={styles.reasonLabel}>{reason.label}</Text>
              <Text style={styles.reasonDetail}>{reason.detail}</Text>
            </View>
          </Animated.View>
        ))}

        {/* Action Buttons */}
        <View style={styles.actionsContainer}>
          <Pressable
            style={styles.actionButton}
            onPress={handleNotInterested}
            accessibilityRole="button"
          >
            <Icon name="x" size="sm" color={colors.error} />
            <Text style={styles.actionButtonText}>
              {t('whyShowing.notInterested', 'Not interested')}
            </Text>
          </Pressable>

          <Pressable
            style={styles.actionButtonSecondary}
            onPress={handleSeeLess}
            accessibilityRole="button"
          >
            <Icon name="eye-off" size="sm" color={colors.text.secondary} />
            <Text style={styles.actionButtonSecondaryText}>
              {t('whyShowing.seeLess', 'See less like this')}
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

export default function WhyShowingScreen() {
  return (
    <ScreenErrorBoundary>
      <WhyShowingContent />
    </ScreenErrorBoundary>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.dark.bg,
  },
  skeletonContainer: {
    padding: spacing.base,
  },
  skeletonReasonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  postPreview: {
    backgroundColor: colors.dark.bgCard,
    borderRadius: radius.md,
    borderWidth: 0.5,
    borderColor: colors.glass.border,
    padding: spacing.base,
    marginBottom: spacing.xl,
  },
  postPreviewHeader: {
    flexDirection: 'row',
    marginBottom: spacing.sm,
  },
  postTypeTag: {
    backgroundColor: colors.active.emerald10,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.sm,
  },
  postTypeText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSize.xs,
    color: colors.emerald,
    textTransform: 'uppercase',
  },
  postContent: {
    fontFamily: fonts.body,
    fontSize: fontSize.base,
    color: colors.text.primary,
    lineHeight: 22,
  },
  sectionTitle: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSize.md,
    color: colors.text.primary,
    marginBottom: spacing.base,
  },
  reasonCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: colors.dark.bgCard,
    borderRadius: radius.md,
    borderWidth: 0.5,
    borderColor: colors.dark.border,
    padding: spacing.base,
    marginBottom: spacing.md,
    gap: spacing.md,
  },
  reasonIconContainer: {
    width: 36,
    height: 36,
    borderRadius: radius.full,
    backgroundColor: colors.active.emerald10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reasonContent: {
    flex: 1,
    gap: spacing.xs,
  },
  reasonLabel: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSize.base,
    color: colors.text.primary,
  },
  reasonDetail: {
    fontFamily: fonts.body,
    fontSize: fontSize.sm,
    color: colors.text.secondary,
    lineHeight: 20,
  },
  actionsContainer: {
    marginTop: spacing.xl,
    gap: spacing.md,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.active.error10,
    borderRadius: radius.md,
    paddingVertical: spacing.base,
  },
  actionButtonText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSize.base,
    color: colors.error,
  },
  actionButtonSecondary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.dark.bgCard,
    borderRadius: radius.md,
    borderWidth: 0.5,
    borderColor: colors.dark.border,
    paddingVertical: spacing.base,
  },
  actionButtonSecondaryText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSize.base,
    color: colors.text.secondary,
  },
});
