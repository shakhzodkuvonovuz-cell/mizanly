import { View, Text, StyleSheet, ScrollView, Pressable, Linking } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { GlassHeader } from '@/components/ui/GlassHeader';
import { Icon, type IconName } from '@/components/ui/Icon';
import { ScreenErrorBoundary } from '@/components/ui/ScreenErrorBoundary';
import { useTranslation } from '@/hooks/useTranslation';
import { useThemeColors } from '@/hooks/useThemeColors';
import { useContextualHaptic } from '@/hooks/useContextualHaptic';
import { colors, spacing, fontSize, radius, fonts } from '@/theme';

interface SafetyItem {
  icon: IconName;
  title: string;
  subtitle: string;
  action: () => void;
}

function SafetyCenterContent() {
  const router = useRouter();
  const { t } = useTranslation();
  const tc = useThemeColors();
  const haptic = useContextualHaptic();

  const items: SafetyItem[] = [
    {
      icon: 'flag',
      title: t('safety.reportContent', 'Report Content'),
      subtitle: t('safety.reportContentSub', 'Report posts, messages, or users that violate our guidelines'),
      action: () => router.push('/(screens)/report' as never),
    },
    {
      icon: 'lock',
      title: t('safety.privacySettings', 'Privacy Settings'),
      subtitle: t('safety.privacySettingsSub', 'Control who can see your content and message you'),
      action: () => router.push('/(screens)/status-privacy' as never),
    },
    {
      icon: 'eye-off',
      title: t('safety.blockedUsers', 'Blocked Users'),
      subtitle: t('safety.blockedUsersSub', 'Manage users you have blocked'),
      action: () => router.push('/(screens)/blocked-users' as never),
    },
    {
      icon: 'shield',
      title: t('safety.communityGuidelines', 'Community Guidelines'),
      subtitle: t('safety.communityGuidelinesSub', 'Learn what is and isn\'t allowed on Mizanly'),
      action: () => router.push('/(screens)/community-guidelines' as never),
    },
    {
      icon: 'heart',
      title: t('safety.wellbeing', 'Wellbeing'),
      subtitle: t('safety.wellbeingSub', 'Screen time controls, take-a-break reminders, content filters'),
      action: () => router.push('/(screens)/screen-time' as never),
    },
    {
      icon: 'phone',
      title: t('safety.crisisResources', 'Crisis Resources'),
      subtitle: t('safety.crisisResourcesSub', 'If you or someone you know needs help'),
      action: () => Linking.openURL('https://findahelpline.com/'),
    },
  ];

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: tc.bg }]} edges={['top']}>
      <GlassHeader
        title={t('safety.title', 'Safety Center')}
        leftAction={{ icon: 'arrow-left', onPress: () => router.back(), accessibilityLabel: t('common.goBack') }}
      />
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={[styles.intro, { color: tc.text.secondary }]}>
          {t('safety.intro', 'Your safety matters. Use these tools to protect yourself and others in the Mizanly community.')}
        </Text>
        {items.map((item, i) => (
          <Animated.View key={item.title} entering={FadeInUp.delay(i * 60).duration(250)}>
            <Pressable
              style={[styles.itemRow, { backgroundColor: tc.bgCard, borderColor: tc.border }]}
              onPress={() => { haptic.navigate(); item.action(); }}
              accessibilityRole="button"
              accessibilityLabel={item.title}
            >
              <View style={[styles.iconWrap, { backgroundColor: `${colors.emerald}12` }]}>
                <Icon name={item.icon} size="md" color={colors.emerald} />
              </View>
              <View style={styles.textWrap}>
                <Text style={[styles.title, { color: tc.text.primary }]}>{item.title}</Text>
                <Text style={[styles.subtitle, { color: tc.text.secondary }]}>{item.subtitle}</Text>
              </View>
              <Icon name="chevron-right" size="sm" color={tc.text.tertiary} />
            </Pressable>
          </Animated.View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

export default function SafetyCenterScreen() {
  return <ScreenErrorBoundary><SafetyCenterContent /></ScreenErrorBoundary>;
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { padding: spacing.base, gap: spacing.sm },
  intro: { fontFamily: fonts.body, fontSize: fontSize.sm, lineHeight: 20, marginBottom: spacing.md },
  itemRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.base, borderRadius: radius.md, borderWidth: 1 },
  iconWrap: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  textWrap: { flex: 1, gap: 2 },
  title: { fontFamily: fonts.bodyMedium, fontSize: fontSize.base },
  subtitle: { fontFamily: fonts.body, fontSize: fontSize.xs, lineHeight: 16 },
});
