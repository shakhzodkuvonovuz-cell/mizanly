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
const CHANGELOG = [
  {
    version: '1.0.0',
    date: '2026-03-25',
    items: [
      { icon: 'video' as const, title: 'Video Editor', description: 'CapCut-level editor with 10 tool tabs, FFmpeg processing, multi-clip recording' },
      { icon: 'image' as const, title: 'Photo Carousel', description: 'Multi-photo posts with up to 35 slides, music, per-slide text' },
      { icon: 'pencil' as const, title: 'Story Drawing', description: 'Pen, highlighter, neon glow, eraser tools with 24-color palette' },
      { icon: 'heart' as const, title: 'Interactive Stickers', description: '10 story sticker types — poll, quiz, countdown, GIF, music, location' },
      { icon: 'globe' as const, title: 'Islamic Features', description: 'Prayer times, Quran rooms, dhikr counter, Ramadan mode, mosque finder' },
      { icon: 'shield' as const, title: 'Safety', description: 'AI content moderation, word filters, kindness reminders, report system' },
      { icon: 'bell' as const, title: 'Smart Notifications', description: 'Batched notifications, per-type controls, push for likes and follows' },
      { icon: 'trending-up' as const, title: 'For You Feed', description: '3-stage AI ranking with Islamic boost, exploration slots, hashtag diversity' },
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
                  <Text style={[styles.itemTitle, { color: tc.text.primary }]}>{item.title}</Text>
                  <Text style={[styles.itemDesc, { color: tc.text.secondary }]}>{item.description}</Text>
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
