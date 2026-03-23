import { useState, useCallback } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withSequence,
  FadeIn,
  FadeInDown,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Icon } from '@/components/ui/Icon';
import { colors, spacing, fontSize, radius, animation, fonts, fontSizeExt } from '@/theme';
import { useThemeColors } from '@/hooks/useThemeColors';
import { useTranslation } from '@/hooks/useTranslation';
import { useContextualHaptic } from '@/hooks/useContextualHaptic';
import { navigate } from '@/utils/navigation';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

// ── Create options with visual hierarchy ──
const CREATE_OPTIONS = [
  {
    id: 'post',
    route: '/(screens)/create-post',
    icon: 'image' as const,
    color: colors.emerald,
    bgColor: colors.active.emerald10,
    labelKey: 'createSheet.post',
    descKey: 'createSheet.postDesc',
  },
  {
    id: 'story',
    route: '/(screens)/create-story',
    icon: 'circle-plus' as const,
    color: colors.extended.purple,
    bgColor: 'rgba(163, 113, 247, 0.1)',
    labelKey: 'createSheet.story',
    descKey: 'createSheet.storyDesc',
  },
  {
    id: 'reel',
    route: '/(screens)/create-reel',
    icon: 'video' as const,
    color: colors.extended.orangeLight,
    bgColor: 'rgba(255, 166, 87, 0.1)',
    labelKey: 'createSheet.reel',
    descKey: 'createSheet.reelDesc',
  },
  {
    id: 'thread',
    route: '/(screens)/create-thread',
    icon: 'message-circle' as const,
    color: colors.extended.blue,
    bgColor: 'rgba(88, 166, 255, 0.1)',
    labelKey: 'createSheet.thread',
    descKey: 'createSheet.threadDesc',
  },
  {
    id: 'video',
    route: '/(screens)/create-video',
    icon: 'play' as const,
    color: colors.gold,
    bgColor: colors.active.gold10,
    labelKey: 'createSheet.longVideo',
    descKey: 'createSheet.longVideoDesc',
  },
  {
    id: 'live',
    route: '/(screens)/go-live',
    icon: 'globe' as const,
    color: colors.live,
    bgColor: 'rgba(255, 59, 59, 0.1)',
    labelKey: 'createSheet.goLive',
    descKey: 'createSheet.goLiveDesc',
  },
  {
    id: 'voice',
    route: '/(screens)/voice-post-create',
    icon: 'mic' as const,
    color: colors.extended.greenBright,
    bgColor: 'rgba(63, 185, 80, 0.1)',
    labelKey: 'createSheet.voicePost',
    descKey: 'createSheet.voicePostDesc',
  },
] as const;

interface CreateSheetProps {
  visible: boolean;
  onClose: () => void;
}

/**
 * Premium Create Sheet — replaces the old plain text list
 * with visual icons, descriptions, and staggered entrance animations.
 */
export function CreateSheet({ visible, onClose }: CreateSheetProps) {
  const tc = useThemeColors();
  const { t } = useTranslation();
  const haptic = useContextualHaptic();

  const handleSelect = useCallback((route: string) => {
    haptic.navigate();
    onClose();
    navigate(route);
  }, [haptic, onClose]);

  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.handleBar} />
          <Text style={[styles.title, { color: tc.text.primary }]}>
            {t('common.create')}
          </Text>
          <Text style={[styles.subtitle, { color: tc.text.secondary }]}>
            {t('createSheet.whatWouldYouLikeToShare')}
          </Text>
        </View>

        {/* Options grid — 2 columns for top 4, then list for rest */}
        <View style={styles.gridRow}>
          {CREATE_OPTIONS.slice(0, 4).map((opt, index) => (
            <Animated.View
              key={opt.id}
              entering={FadeInDown.delay(index * 60).duration(250).springify()}
              style={styles.gridItem}
            >
              <Pressable
                onPress={() => handleSelect(opt.route)}
                style={({ pressed }) => [
                  styles.gridCard,
                  { backgroundColor: pressed ? opt.bgColor : tc.bgElevated },
                ]}
                accessibilityRole="button"
                accessibilityLabel={t(opt.labelKey)}
              >
                <View style={[styles.gridIconWrap, { backgroundColor: opt.bgColor }]}>
                  <Icon name={opt.icon} size="lg" color={opt.color} />
                </View>
                <Text style={[styles.gridLabel, { color: tc.text.primary }]} numberOfLines={1}>
                  {t(opt.labelKey)}
                </Text>
                <Text style={[styles.gridDesc, { color: tc.text.tertiary }]} numberOfLines={1}>
                  {t(opt.descKey)}
                </Text>
              </Pressable>
            </Animated.View>
          ))}
        </View>

        {/* Secondary options — compact row */}
        <View style={styles.secondaryRow}>
          {CREATE_OPTIONS.slice(4).map((opt, index) => (
            <Animated.View
              key={opt.id}
              entering={FadeInDown.delay((index + 4) * 60).duration(250).springify()}
            >
              <Pressable
                onPress={() => handleSelect(opt.route)}
                style={({ pressed }) => [
                  styles.secondaryItem,
                  { backgroundColor: pressed ? opt.bgColor : tc.bgElevated },
                ]}
                accessibilityRole="button"
                accessibilityLabel={t(opt.labelKey)}
              >
                <View style={[styles.secondaryIcon, { backgroundColor: opt.bgColor }]}>
                  <Icon name={opt.icon} size="sm" color={opt.color} />
                </View>
                <View style={styles.secondaryText}>
                  <Text style={[styles.secondaryLabel, { color: tc.text.primary }]}>
                    {t(opt.labelKey)}
                  </Text>
                  <Text style={[styles.secondaryDesc, { color: tc.text.tertiary }]} numberOfLines={1}>
                    {t(opt.descKey)}
                  </Text>
                </View>
                <Icon name="chevron-right" size="sm" color={tc.text.tertiary} />
              </Pressable>
            </Animated.View>
          ))}
        </View>
      </View>
    </BottomSheet>
  );
}

/**
 * Create button for header — emerald gradient "+" icon.
 * Opens the CreateSheet when pressed.
 */
export function CreateHeaderButton() {
  const { t } = useTranslation();
  const haptic = useContextualHaptic();
  const [open, setOpen] = useState(false);
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePress = () => {
    haptic.tick();
    scale.value = withSequence(
      withSpring(0.85, animation.spring.bouncy),
      withSpring(1, animation.spring.bouncy),
    );
    setOpen(true);
  };

  return (
    <>
      <AnimatedPressable
        onPress={handlePress}
        style={animatedStyle}
        hitSlop={8}
        accessibilityLabel={t('common.create')}
        accessibilityRole="button"
      >
        <LinearGradient
          colors={[colors.emeraldLight, colors.emeraldDark]}
          style={styles.headerButton}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        >
          <Icon name="plus" size="sm" color="#fff" strokeWidth={3} />
        </LinearGradient>
      </AnimatedPressable>
      <CreateSheet visible={open} onClose={() => setOpen(false)} />
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: spacing.base,
    paddingBottom: spacing.xl,
  },
  header: {
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  handleBar: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.dark.borderLight,
    marginBottom: spacing.md,
  },
  title: {
    fontSize: fontSize.lg,
    fontFamily: fonts.bodyBold,
    fontWeight: '700',
    marginBottom: spacing.xs,
  },
  subtitle: {
    fontSize: fontSize.sm,
    fontFamily: fonts.body,
  },

  // ── Top 4: 2×2 grid ──
  gridRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  gridItem: {
    width: '48.5%',
  },
  gridCard: {
    borderRadius: radius.lg,
    padding: spacing.lg,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.dark.border,
    minHeight: 120,
    justifyContent: 'center',
  },
  gridIconWrap: {
    width: 48,
    height: 48,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  gridLabel: {
    fontSize: fontSize.base,
    fontFamily: fonts.bodyBold,
    fontWeight: '700',
    marginBottom: 2,
  },
  gridDesc: {
    fontSize: fontSizeExt.tiny,
    fontFamily: fonts.body,
  },

  // ── Bottom 3: compact rows ──
  secondaryRow: {
    gap: spacing.sm,
  },
  secondaryItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.dark.border,
    gap: spacing.md,
  },
  secondaryIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryText: {
    flex: 1,
  },
  secondaryLabel: {
    fontSize: fontSize.sm,
    fontFamily: fonts.bodyBold,
    fontWeight: '600',
  },
  secondaryDesc: {
    fontSize: fontSizeExt.tiny,
    fontFamily: fonts.body,
    marginTop: 1,
  },

  // ── Header button ──
  headerButton: {
    width: 32,
    height: 32,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
