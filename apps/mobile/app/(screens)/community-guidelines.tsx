import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { GlassHeader } from '@/components/ui/GlassHeader';
import { Icon, type IconName } from '@/components/ui/Icon';
import { ScreenErrorBoundary } from '@/components/ui/ScreenErrorBoundary';
import { useTranslation } from '@/hooks/useTranslation';
import { useThemeColors } from '@/hooks/useThemeColors';
import { colors, spacing, fontSize, radius, fonts } from '@/theme';

const GUIDELINES: Array<{ icon: IconName; title: string; rules: string[] }> = [
  {
    icon: 'heart',
    title: 'Respect & Kindness',
    rules: [
      'Treat everyone with dignity and respect',
      'No hate speech, discrimination, or harassment',
      'No bullying, threats, or intimidation',
      'Be mindful of cultural and religious sensitivities',
    ],
  },
  {
    icon: 'shield',
    title: 'Safety',
    rules: [
      'No content promoting violence or self-harm',
      'No sharing of private information without consent',
      'Report concerning content immediately',
      'Protect minors — no inappropriate content involving children',
    ],
  },
  {
    icon: 'eye-off',
    title: 'Appropriate Content',
    rules: [
      'No nudity or sexually explicit content',
      'No graphic violence or gore',
      'No spam, scams, or misleading content',
      'No copyright infringement',
    ],
  },
  {
    icon: 'globe',
    title: 'Islamic Values',
    rules: [
      'Respect Islamic teachings and scholarship',
      'Verify religious claims with authentic sources',
      'No sectarian attacks or takfir',
      'Be truthful — no spreading of misinformation',
    ],
  },
  {
    icon: 'lock',
    title: 'Authenticity',
    rules: [
      'No impersonation of real people or organizations',
      'No fake engagement (bought followers, likes, comments)',
      'Be transparent about sponsored or branded content',
      'One account per person',
    ],
  },
];

function GuidelinesContent() {
  const router = useRouter();
  const { t } = useTranslation();
  const tc = useThemeColors();

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: tc.bg }]} edges={['top']}>
      <GlassHeader
        title={t('safety.communityGuidelines', 'Community Guidelines')}
        leftAction={{ icon: 'arrow-left', onPress: () => router.back(), accessibilityLabel: t('common.goBack') }}
      />
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={[styles.intro, { color: tc.text.secondary }]}>
          {t('guidelines.intro', 'Mizanly is a community built on Islamic values of respect, kindness, and truthfulness. These guidelines help maintain a safe and welcoming space for all.')}
        </Text>
        {GUIDELINES.map((section, si) => (
          <Animated.View key={section.title} entering={FadeInUp.delay(si * 80).duration(300)} style={[styles.section, { backgroundColor: tc.bgCard, borderColor: tc.border }]}>
            <View style={styles.sectionHeader}>
              <Icon name={section.icon} size="md" color={colors.emerald} />
              <Text style={[styles.sectionTitle, { color: tc.text.primary }]}>{section.title}</Text>
            </View>
            {section.rules.map((rule, ri) => (
              <View key={ri} style={styles.ruleRow}>
                <Text style={[styles.bullet, { color: colors.emerald }]}>•</Text>
                <Text style={[styles.ruleText, { color: tc.text.secondary }]}>{rule}</Text>
              </View>
            ))}
          </Animated.View>
        ))}
        <Text style={[styles.footer, { color: tc.text.tertiary }]}>
          {t('guidelines.footer', 'Violations may result in content removal, account suspension, or permanent ban. Appeals can be submitted through Settings > Account > Appeals.')}
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

export default function CommunityGuidelinesScreen() {
  return <ScreenErrorBoundary><GuidelinesContent /></ScreenErrorBoundary>;
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { padding: spacing.base, gap: spacing.md },
  intro: { fontFamily: fonts.body, fontSize: fontSize.sm, lineHeight: 20, marginBottom: spacing.sm },
  section: { borderRadius: radius.md, borderWidth: 1, padding: spacing.base, gap: spacing.sm },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.xs },
  sectionTitle: { fontFamily: fonts.bodyBold, fontSize: fontSize.md },
  ruleRow: { flexDirection: 'row', gap: spacing.sm, paddingStart: spacing.xs },
  bullet: { fontSize: 16, lineHeight: 20 },
  ruleText: { fontFamily: fonts.body, fontSize: fontSize.sm, lineHeight: 20, flex: 1 },
  footer: { fontFamily: fonts.body, fontSize: fontSize.xs, lineHeight: 16, textAlign: 'center', marginTop: spacing.md },
});
