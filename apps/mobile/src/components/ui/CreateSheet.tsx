import { useState, useCallback } from 'react';
import { View, Text, StyleSheet, Pressable, Platform } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withSequence,
  FadeInDown,
  FadeIn,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Icon } from '@/components/ui/Icon';
import { colors, spacing, fontSize, radius, animation, fonts, fontSizeExt } from '@/theme';
import { useThemeColors } from '@/hooks/useThemeColors';
import { useTranslation } from '@/hooks/useTranslation';
import { useContextualHaptic } from '@/hooks/useContextualHaptic';
import { navigate } from '@/utils/navigation';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

type IconName = React.ComponentProps<typeof Icon>['name'];

// ── Create options ──
interface CreateOption {
  id: string;
  route: string;
  icon: IconName;
  color: string;
  gradientColors: [string, string];
  labelKey: string;
  descKey: string;
}

const CREATE_OPTIONS: CreateOption[] = [
  {
    id: 'post',
    route: '/(screens)/create-post',
    icon: 'image',
    color: colors.emerald,
    gradientColors: ['rgba(10,123,79,0.25)', 'rgba(10,123,79,0.05)'],
    labelKey: 'createSheet.post',
    descKey: 'createSheet.postDesc',
  },
  {
    id: 'story',
    route: '/(screens)/create-story',
    icon: 'circle-plus',
    color: colors.extended.purple,
    gradientColors: ['rgba(163,113,247,0.25)', 'rgba(163,113,247,0.05)'],
    labelKey: 'createSheet.story',
    descKey: 'createSheet.storyDesc',
  },
  {
    id: 'reel',
    route: '/(screens)/create-reel',
    icon: 'video',
    color: colors.extended.orangeLight,
    gradientColors: ['rgba(255,166,87,0.25)', 'rgba(255,166,87,0.05)'],
    labelKey: 'createSheet.reel',
    descKey: 'createSheet.reelDesc',
  },
  {
    id: 'thread',
    route: '/(screens)/create-thread',
    icon: 'message-circle',
    color: colors.extended.blue,
    gradientColors: ['rgba(88,166,255,0.25)', 'rgba(88,166,255,0.05)'],
    labelKey: 'createSheet.thread',
    descKey: 'createSheet.threadDesc',
  },
  {
    id: 'video',
    route: '/(screens)/create-video',
    icon: 'play',
    color: colors.gold,
    gradientColors: ['rgba(200,150,62,0.20)', 'rgba(200,150,62,0.05)'],
    labelKey: 'createSheet.longVideo',
    descKey: 'createSheet.longVideoDesc',
  },
  {
    id: 'live',
    route: '/(screens)/go-live',
    icon: 'globe',
    color: colors.live,
    gradientColors: ['rgba(255,59,59,0.20)', 'rgba(255,59,59,0.05)'],
    labelKey: 'createSheet.goLive',
    descKey: 'createSheet.goLiveDesc',
  },
  {
    id: 'voice',
    route: '/(screens)/voice-post-create',
    icon: 'mic',
    color: colors.extended.greenBright,
    gradientColors: ['rgba(63,185,80,0.20)', 'rgba(63,185,80,0.05)'],
    labelKey: 'createSheet.voicePost',
    descKey: 'createSheet.voicePostDesc',
  },
];

// ── Animated grid card with Reanimated spring press ──
function GridCard({ opt, index, onSelect, tc, t }: {
  opt: CreateOption;
  index: number;
  onSelect: (route: string) => void;
  tc: ReturnType<typeof useThemeColors>;
  t: (key: string) => string;
}) {
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <Animated.View
      entering={FadeInDown.delay(index * 80).duration(350).springify().damping(14).stiffness(120)}
      style={styles.gridItem}
    >
      <AnimatedPressable
        onPress={() => onSelect(opt.route)}
        onPressIn={() => { scale.value = withSpring(0.92, { damping: 15, stiffness: 400 }); }}
        onPressOut={() => { scale.value = withSpring(1, { damping: 12, stiffness: 200 }); }}
        style={[styles.gridCard, animatedStyle]}
        accessibilityRole="button"
        accessibilityLabel={t(opt.labelKey)}
        accessibilityHint={t(opt.descKey)}
      >
        {/* Gradient background */}
        <LinearGradient
          colors={opt.gradientColors}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[StyleSheet.absoluteFill, { borderRadius: radius.xl }]}
        />

        {/* Subtle top-left glow */}
        <View style={[styles.glowAccent, { backgroundColor: `${opt.color}12` }]} />

        {/* Icon with gradient circle */}
        <LinearGradient
          colors={[`${opt.color}35`, `${opt.color}10`]}
          style={styles.gridIconWrap}
        >
          <Icon name={opt.icon} size="xl" color={opt.color} />
        </LinearGradient>

        <Text style={[styles.gridLabel, { color: tc.text.primary }]} numberOfLines={1}>
          {t(opt.labelKey)}
        </Text>
        <Text style={[styles.gridDesc, { color: tc.text.secondary }]} numberOfLines={1}>
          {t(opt.descKey)}
        </Text>
      </AnimatedPressable>
    </Animated.View>
  );
}

// ── Animated secondary row with spring press ──
function SecondaryRow({ opt, index, onSelect, tc, t }: {
  opt: CreateOption;
  index: number;
  onSelect: (route: string) => void;
  tc: ReturnType<typeof useThemeColors>;
  t: (key: string) => string;
}) {
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <Animated.View entering={FadeInDown.delay((index + 4) * 80).duration(300).springify()}>
      <AnimatedPressable
        onPress={() => onSelect(opt.route)}
        onPressIn={() => { scale.value = withSpring(0.97, { damping: 15, stiffness: 400 }); }}
        onPressOut={() => { scale.value = withSpring(1, { damping: 12, stiffness: 200 }); }}
        style={[styles.secondaryItem, { backgroundColor: tc.bgElevated, borderColor: tc.border }, animatedStyle]}
        accessibilityRole="button"
        accessibilityLabel={t(opt.labelKey)}
        accessibilityHint={t(opt.descKey)}
      >
        <LinearGradient
          colors={[`${opt.color}25`, `${opt.color}08`]}
          style={styles.secondaryIcon}
        >
          <Icon name={opt.icon} size="md" color={opt.color} />
        </LinearGradient>
        <View style={styles.secondaryText}>
          <Text style={[styles.secondaryLabel, { color: tc.text.primary }]}>
            {t(opt.labelKey)}
          </Text>
          <Text style={[styles.secondaryDesc, { color: tc.text.tertiary }]} numberOfLines={1}>
            {t(opt.descKey)}
          </Text>
        </View>
        <Icon name="chevron-right" size="sm" color={tc.text.tertiary} />
      </AnimatedPressable>
    </Animated.View>
  );
}

interface CreateSheetProps {
  visible: boolean;
  onClose: () => void;
}

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
        <Animated.View entering={FadeIn.duration(250)} style={styles.header}>
          <View style={styles.handleBar} />
          <Text style={[styles.title, { color: tc.text.primary }]}>
            {t('common.create')}
          </Text>
          <Text style={[styles.subtitle, { color: tc.text.secondary }]}>
            {t('createSheet.whatWouldYouLikeToShare')}
          </Text>
        </Animated.View>

        {/* Primary grid: 2×2 with depth */}
        <View style={styles.gridRow}>
          {CREATE_OPTIONS.slice(0, 4).map((opt, index) => (
            <GridCard key={opt.id} opt={opt} index={index} onSelect={handleSelect} tc={tc} t={t} />
          ))}
        </View>

        {/* Secondary: compact rows */}
        <View style={styles.secondaryRow}>
          {CREATE_OPTIONS.slice(4).map((opt, index) => (
            <SecondaryRow key={opt.id} opt={opt} index={index} onSelect={handleSelect} tc={tc} t={t} />
          ))}
        </View>
      </View>
    </BottomSheet>
  );
}

/**
 * Header "+" button — opens the CreateSheet.
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
      withSpring(0.8, { damping: 15, stiffness: 500 }),
      withSpring(1, { damping: 10, stiffness: 200 }),
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
          <Icon name="plus" size="sm" color={colors.text.onColor} strokeWidth={3} />
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
    marginBottom: spacing.xl,
  },
  handleBar: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.dark.borderLight,
    marginBottom: spacing.lg,
  },
  title: {
    fontSize: fontSize.xl,
    fontFamily: fonts.heading,
    fontWeight: '700',
    letterSpacing: 0.3,
    marginBottom: spacing.xs,
  },
  subtitle: {
    fontSize: fontSize.sm,
    fontFamily: fonts.body,
  },

  // ── Grid cards ──
  gridRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  gridItem: {
    width: '47.5%',
  },
  gridCard: {
    borderRadius: radius.xl,
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    minHeight: 140,
    justifyContent: 'center',
    overflow: 'hidden',
    // Shadow for depth
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 6,
    backgroundColor: colors.dark.bgCard,
  },
  glowAccent: {
    position: 'absolute',
    top: -20,
    start: -20,
    width: 80,
    height: 80,
    borderRadius: 40,
  },
  gridIconWrap: {
    width: 60,
    height: 60,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  gridLabel: {
    fontSize: fontSize.md,
    fontFamily: fonts.bodyBold,
    fontWeight: '700',
    marginBottom: 3,
  },
  gridDesc: {
    fontSize: fontSize.xs,
    fontFamily: fonts.body,
  },

  // ── Secondary rows ──
  secondaryRow: {
    gap: spacing.sm,
  },
  secondaryItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: spacing.md,
  },
  secondaryIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryText: {
    flex: 1,
  },
  secondaryLabel: {
    fontSize: fontSize.base,
    fontFamily: fonts.bodyBold,
    fontWeight: '600',
  },
  secondaryDesc: {
    fontSize: fontSizeExt.tiny,
    fontFamily: fonts.body,
    marginTop: 2,
  },

  // ── Header button ──
  headerButton: {
    width: 34,
    height: 34,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    // Subtle glow
    shadowColor: colors.emerald,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 4,
  },
});
