import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { GlassHeader } from '@/components/ui/GlassHeader';
import { Icon, type IconName } from '@/components/ui/Icon';
import { ScreenErrorBoundary } from '@/components/ui/ScreenErrorBoundary';
import { useContextualHaptic } from '@/hooks/useContextualHaptic';
import { useTranslation } from '@/hooks/useTranslation';
import { useThemeColors } from '@/hooks/useThemeColors';
import { colors, spacing, fontSize, radius, fonts } from '@/theme';

// i18n key-based guidelines — titles and rules use t() in the component
const GUIDELINES: Array<{ icon: IconName; titleKey: string; ruleKeys: string[] }> = [
  {
    icon: 'heart',
    titleKey: 'guidelines.respect.title',
    ruleKeys: [
      'guidelines.respect.rule1',
      'guidelines.respect.rule2',
      'guidelines.respect.rule3',
      'guidelines.respect.rule4',
    ],
  },
  {
    icon: 'shield',
    titleKey: 'guidelines.safety.title',
    ruleKeys: [
      'guidelines.safety.rule1',
      'guidelines.safety.rule2',
      'guidelines.safety.rule3',
      'guidelines.safety.rule4',
    ],
  },
  {
    icon: 'eye-off',
    titleKey: 'guidelines.content.title',
    ruleKeys: [
      'guidelines.content.rule1',
      'guidelines.content.rule2',
      'guidelines.content.rule3',
      'guidelines.content.rule4',
    ],
  },
  {
    icon: 'globe',
    titleKey: 'guidelines.islamic.title',
    ruleKeys: [
      'guidelines.islamic.rule1',
      'guidelines.islamic.rule2',
      'guidelines.islamic.rule3',
      'guidelines.islamic.rule4',
    ],
  },
  {
    icon: 'lock',
    titleKey: 'guidelines.authenticity.title',
    ruleKeys: [
      'guidelines.authenticity.rule1',
      'guidelines.authenticity.rule2',
      'guidelines.authenticity.rule3',
      'guidelines.authenticity.rule4',
    ],
  },
];

function GuidelinesContent() {
  const router = useRouter();
  const { t } = useTranslation();
  const tc = useThemeColors();
  const haptic = useContextualHaptic();

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: tc.bg }]} edges={['top']}>
      <GlassHeader
        title={t('safety.communityGuidelines', 'Community Guidelines')}
        leftAction={{ icon: 'arrow-left', onPress: () => { haptic.tick(); router.back(); }, accessibilityLabel: t('common.goBack') }}
      />
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={[styles.intro, { color: tc.text.secondary }]}>
          {t('guidelines.intro', 'Mizanly is a community built on Islamic values of respect, kindness, and truthfulness. These guidelines help maintain a safe and welcoming space for all.')}
        </Text>
        {GUIDELINES.map((section, si) => (
          <Animated.View key={section.titleKey} entering={FadeInUp.delay(si * 80).duration(300)} style={[styles.section, { backgroundColor: tc.bgCard, borderColor: tc.border }]}>
            <View style={styles.sectionHeader}>
              <Icon name={section.icon} size="md" color={colors.emerald} />
              <Text style={[styles.sectionTitle, { color: tc.text.primary }]}>
                {t(section.titleKey)}
              </Text>
            </View>
            {section.ruleKeys.map((ruleKey, ri) => (
              <View key={ri} style={styles.ruleRow}>
                <Text style={[styles.bullet, { color: colors.emerald }]}>•</Text>
                <Text style={[styles.ruleText, { color: tc.text.secondary }]}>
                  {t(ruleKey)}
                </Text>
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
