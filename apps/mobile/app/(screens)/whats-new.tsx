import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { GlassHeader } from '@/components/ui/GlassHeader';
import { Icon } from '@/components/ui/Icon';
import { ScreenErrorBoundary } from '@/components/ui/ScreenErrorBoundary';
import { useTranslation } from '@/hooks/useTranslation';
import { useThemeColors } from '@/hooks/useThemeColors';
import { colors, spacing, fontSize, radius, fonts } from '@/theme';
import { rtlFlexRow } from '@/utils/rtl';

// Changelog entries — add new ones at the top
// Keys reference i18n whatsNew.changelog.* for translated title/description
const CHANGELOG = [
  {
    version: '1.0.0',
    date: '2026-03-25',
    items: [
      { icon: 'video' as const, titleKey: 'whatsNew.changelog.videoEditor.title', descKey: 'whatsNew.changelog.videoEditor.description' },
      { icon: 'image' as const, titleKey: 'whatsNew.changelog.photoCarousel.title', descKey: 'whatsNew.changelog.photoCarousel.description' },
      { icon: 'pencil' as const, titleKey: 'whatsNew.changelog.storyDrawing.title', descKey: 'whatsNew.changelog.storyDrawing.description' },
      { icon: 'heart' as const, titleKey: 'whatsNew.changelog.interactiveStickers.title', descKey: 'whatsNew.changelog.interactiveStickers.description' },
      { icon: 'globe' as const, titleKey: 'whatsNew.changelog.islamicFeatures.title', descKey: 'whatsNew.changelog.islamicFeatures.description' },
      { icon: 'shield' as const, titleKey: 'whatsNew.changelog.safety.title', descKey: 'whatsNew.changelog.safety.description' },
      { icon: 'bell' as const, titleKey: 'whatsNew.changelog.smartNotifications.title', descKey: 'whatsNew.changelog.smartNotifications.description' },
      { icon: 'trending-up' as const, titleKey: 'whatsNew.changelog.forYouFeed.title', descKey: 'whatsNew.changelog.forYouFeed.description' },
    ],
  },
];

function ChangelogContent() {
  const router = useRouter();
  const { t, isRTL } = useTranslation();
  const tc = useThemeColors();

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: tc.bg }]} edges={['top']}>
      <GlassHeader
        title={t('settings.whatsNew', "What's New")}
        leftAction={{ icon: 'arrow-left', onPress: () => router.back(), accessibilityLabel: t('common.goBack') }}
      />
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {CHANGELOG.map((release, ri) => (
          <Animated.View key={release.version} entering={FadeInUp.delay(ri * 100).duration(300)}>
            <View style={[styles.versionHeader, { borderBottomColor: tc.border, flexDirection: rtlFlexRow(isRTL) }]}>
              <Text style={[styles.versionText, { color: colors.emerald }]}>v{release.version}</Text>
              <Text style={[styles.dateText, { color: tc.text.tertiary }]}>{release.date}</Text>
            </View>
            {release.items.map((item, ii) => (
              <Animated.View
                key={ii}
                entering={FadeInUp.delay(ri * 100 + ii * 50).duration(250)}
                style={[styles.itemRow, { borderBottomColor: tc.border, flexDirection: rtlFlexRow(isRTL) }]}
              >
                <View style={[styles.iconWrap, { backgroundColor: `${colors.emerald}1F` }]}>
                  <Icon name={item.icon} size="sm" color={colors.emerald} />
                </View>
                <View style={styles.itemText}>
                  <Text style={[styles.itemTitle, { color: tc.text.primary }]}>{t(item.titleKey)}</Text>
                  <Text style={[styles.itemDesc, { color: tc.text.secondary }]}>{t(item.descKey)}</Text>
                </View>
              </Animated.View>
            ))}
          </Animated.View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

export default function WhatsNewScreen() {
  return <ScreenErrorBoundary><ChangelogContent /></ScreenErrorBoundary>;
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { padding: spacing.base },
  versionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: spacing.md, borderBottomWidth: StyleSheet.hairlineWidth, marginBottom: spacing.sm },
  versionText: { fontFamily: fonts.bodyBold, fontSize: fontSize.lg },
  dateText: { fontFamily: fonts.body, fontSize: fontSize.xs },
  itemRow: { flexDirection: 'row', gap: spacing.md, paddingVertical: spacing.md, borderBottomWidth: StyleSheet.hairlineWidth },
  iconWrap: { width: 36, height: 36, borderRadius: radius.full, alignItems: 'center', justifyContent: 'center' },
  itemText: { flex: 1, gap: 2 },
  itemTitle: { fontFamily: fonts.bodyMedium, fontSize: fontSize.base },
  itemDesc: { fontFamily: fonts.body, fontSize: fontSize.xs, lineHeight: 16 },
});
