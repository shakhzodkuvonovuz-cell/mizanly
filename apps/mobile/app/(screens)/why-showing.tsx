import { useState, useEffect, useCallback } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { GlassHeader } from '@/components/ui/GlassHeader';
import { Icon } from '@/components/ui/Icon';
import type { IconName } from '@/components/ui/Icon';
import { Skeleton } from '@/components/ui/Skeleton';
import { ScreenErrorBoundary } from '@/components/ui/ScreenErrorBoundary';
import { colors, spacing, fontSize, radius, fonts } from '@/theme';
import { useTranslation } from '@/hooks/useTranslation';
import { useThemeColors } from '@/hooks/useThemeColors';
import { useContextualHaptic } from '@/hooks/useContextualHaptic';
import { feedApi, postsApi } from '@/services/api';
import { showToast } from '@/components/ui/Toast';
import { useQueryClient } from '@tanstack/react-query';
import type { Post } from '@/types';

interface ReasonItem {
  icon: IconName;
  label: string;
  detail: string;
}

function WhyShowingContent() {
  const tc = useThemeColors();
  const styles = createStyles(tc);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const haptic = useContextualHaptic();
  const queryClient = useQueryClient();
  const params = useLocalSearchParams<{ postId: string; postType: string }>();
  const [isActioning, setIsActioning] = useState(false);

  const [loading, setLoading] = useState(true);
  const [post, setPost] = useState<Post | null>(null);
  const [reasons, setReasons] = useState<ReasonItem[]>([]);

  // Map backend reason keys to icons — defined at module scope for perf
  const reasonIconMap: Record<string, IconName> = {
    follow: 'user',
    trending: 'trending-up',
    popular: 'heart',
    interests: 'check-circle',
    similar: 'layers',
    hashtag: 'hash',
    engagement: 'bar-chart-2',
    recommended: 'eye',
  };

  useEffect(() => {
    let cancelled = false;
    async function loadData() {
      try {
        const [postData, explainData] = await Promise.all([
          params.postId ? postsApi.getById(params.postId) : null,
          params.postId ? feedApi.explainPost(params.postId).catch(() => null) : null,
        ]);
        if (cancelled) return;
        if (postData) setPost(postData as Post);

        // Use real reasons from backend if available
        if (explainData?.reasons?.length) {
          const mapped: ReasonItem[] = explainData.reasons.map((reason: string) => {
            const key = reason.toLowerCase().replace(/\s+/g, '_');
            return {
              icon: reasonIconMap[key] ?? 'eye',
              label: reason,
              detail: t('whyShowing.algorithmDetail', 'This signal contributed to showing you this content'),
            };
          });
          setReasons(mapped);
        } else {
          // Fallback to default reasons if backend doesn't provide them
          setReasons([
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
          ]);
        }
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
    if (isActioning) return;
    setIsActioning(true);
    haptic.send();
    try {
      if (params.postId) {
        await feedApi.reportNotInterested(params.postId, params.postType ?? 'post');
      }
      haptic.success();
      queryClient.invalidateQueries({ queryKey: ['feed'] });
      showToast({ message: t('whyShowing.notInterestedMsg', "We'll show less content like this"), variant: 'success' });
      router.back();
    } catch {
      haptic.error();
      showToast({ message: t('whyShowing.errorMsg', 'Something went wrong. Please try again.'), variant: 'error' });
    } finally {
      setIsActioning(false);
    }
  }, [params.postId, params.postType, router, t, haptic, queryClient, isActioning]);

  const handleSeeLess = useCallback(async () => {
    if (isActioning) return;
    setIsActioning(true);
    haptic.send();
    try {
      if (params.postId) {
        await feedApi.dismiss(params.postType ?? 'post', params.postId);
      }
      haptic.success();
      queryClient.invalidateQueries({ queryKey: ['feed'] });
      showToast({ message: t('whyShowing.seeLessMsg', "You'll see less content like this"), variant: 'success' });
      router.back();
    } catch {
      haptic.error();
      showToast({ message: t('whyShowing.errorMsg', 'Something went wrong. Please try again.'), variant: 'error' });
    } finally {
      setIsActioning(false);
    }
  }, [params.postId, params.postType, router, t, haptic, queryClient, isActioning]);

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
            style={[styles.actionButton, isActioning && { opacity: 0.5 }]}
            onPress={handleNotInterested}
            disabled={isActioning}
            accessibilityRole="button"
          >
            <Icon name="x" size="sm" color={colors.error} />
            <Text style={styles.actionButtonText}>
              {t('whyShowing.notInterested', 'Not interested')}
            </Text>
          </Pressable>

          <Pressable
            style={[styles.actionButtonSecondary, isActioning && { opacity: 0.5 }]}
            onPress={handleSeeLess}
            disabled={isActioning}
            accessibilityRole="button"
          >
            <Icon name="eye-off" size="sm" color={tc.text.secondary} />
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

const createStyles = (tc: ReturnType<typeof useThemeColors>) => StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: tc.bg,
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
    backgroundColor: tc.bgCard,
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
    color: tc.text.primary,
    lineHeight: 22,
  },
  sectionTitle: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSize.md,
    color: tc.text.primary,
    marginBottom: spacing.base,
  },
  reasonCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: tc.bgCard,
    borderRadius: radius.md,
    borderWidth: 0.5,
    borderColor: tc.border,
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
    color: tc.text.primary,
  },
  reasonDetail: {
    fontFamily: fonts.body,
    fontSize: fontSize.sm,
    color: tc.text.secondary,
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
    backgroundColor: tc.bgCard,
    borderRadius: radius.md,
    borderWidth: 0.5,
    borderColor: tc.border,
    paddingVertical: spacing.base,
  },
  actionButtonSecondaryText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSize.base,
    color: tc.text.secondary,
  },
});
