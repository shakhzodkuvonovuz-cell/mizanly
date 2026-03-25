import { View, Text, StyleSheet, Share, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { GlassHeader } from '@/components/ui/GlassHeader';
import { Icon } from '@/components/ui/Icon';
import { GradientButton } from '@/components/ui/GradientButton';
import { ScreenErrorBoundary } from '@/components/ui/ScreenErrorBoundary';
import { showToast } from '@/components/ui/Toast';
import { useTranslation } from '@/hooks/useTranslation';
import { useThemeColors } from '@/hooks/useThemeColors';
import { useContextualHaptic } from '@/hooks/useContextualHaptic';
import { usersApi } from '@/services/api';
import { colors, spacing, fontSize, radius, fonts } from '@/theme';
import * as Clipboard from 'expo-clipboard';

function InviteContent() {
  const router = useRouter();
  const { t } = useTranslation();
  const tc = useThemeColors();
  const haptic = useContextualHaptic();

  const { data: referralData } = useQuery({
    queryKey: ['referral-code'],
    queryFn: () => usersApi.getReferralCode(),
  });

  const shareUrl = (referralData as Record<string, unknown>)?.shareUrl as string ?? 'https://mizanly.app';
  const referralCode = (referralData as Record<string, unknown>)?.referralCode as string ?? '';

  const handleShare = async () => {
    haptic.send();
    try {
      await Share.share({
        message: t('invite.shareMessage', {
          defaultValue: `Join me on Mizanly - the social app for the Muslim community! Download now: ${shareUrl}`,
        }),
      });
    } catch {}
  };

  const handleCopyLink = async () => {
    haptic.tick();
    await Clipboard.setStringAsync(shareUrl);
    showToast({ message: t('common.copiedToClipboard', 'Link copied!'), variant: 'success' });
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: tc.bg }]} edges={['top']}>
      <GlassHeader
        title={t('invite.title', 'Invite Friends')}
        leftAction={{ icon: 'arrow-left', onPress: () => router.back(), accessibilityLabel: t('common.goBack') }}
      />
      <View style={styles.content}>
        <Animated.View entering={FadeInUp.duration(400)} style={styles.hero}>
          <View style={[styles.iconCircle, { backgroundColor: `${colors.emerald}15` }]}>
            <Icon name="users" size="xl" color={colors.emerald} />
          </View>
          <Text style={[styles.heroTitle, { color: tc.text.primary }]}>
            {t('invite.heroTitle', 'Grow the Ummah')}
          </Text>
          <Text style={[styles.heroSubtitle, { color: tc.text.secondary }]}>
            {t('invite.heroSubtitle', 'Invite your friends and family to join Mizanly - a safe, Islamic-values social platform.')}
          </Text>
        </Animated.View>

        {referralCode ? (
          <Animated.View entering={FadeInUp.delay(200).duration(300)} style={[styles.codeCard, { backgroundColor: tc.bgCard, borderColor: tc.border }]}>
            <Text style={[styles.codeLabel, { color: tc.text.secondary }]}>
              {t('invite.yourCode', 'Your referral code')}
            </Text>
            <Text style={[styles.codeText, { color: colors.emerald }]}>{referralCode}</Text>
            <Pressable onPress={handleCopyLink} style={styles.copyBtn} hitSlop={8}>
              <Icon name="link" size="xs" color={tc.text.secondary} />
              <Text style={[styles.copyText, { color: tc.text.secondary }]}>{t('invite.copyLink', 'Copy link')}</Text>
            </Pressable>
          </Animated.View>
        ) : null}

        <Animated.View entering={FadeInUp.delay(300).duration(300)}>
          <GradientButton
            label={t('invite.shareButton', 'Share with friends')}
            onPress={handleShare}
            size="lg"
          />
        </Animated.View>
      </View>
    </SafeAreaView>
  );
}

export default function InviteFriendsScreen() {
  return <ScreenErrorBoundary><InviteContent /></ScreenErrorBoundary>;
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { flex: 1, padding: spacing.xl, justifyContent: 'center', gap: spacing.xl },
  hero: { alignItems: 'center', gap: spacing.md },
  iconCircle: { width: 80, height: 80, borderRadius: 40, alignItems: 'center', justifyContent: 'center' },
  heroTitle: { fontFamily: fonts.headingBold, fontSize: fontSize.xl, textAlign: 'center' },
  heroSubtitle: { fontFamily: fonts.body, fontSize: fontSize.sm, textAlign: 'center', lineHeight: 20, paddingHorizontal: spacing.base },
  codeCard: { alignItems: 'center', padding: spacing.lg, borderRadius: radius.lg, borderWidth: 1, gap: spacing.sm },
  codeLabel: { fontFamily: fonts.body, fontSize: fontSize.xs },
  codeText: { fontFamily: fonts.bodyBold, fontSize: 28, letterSpacing: 4 },
  copyBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  copyText: { fontFamily: fonts.body, fontSize: fontSize.xs },
});
