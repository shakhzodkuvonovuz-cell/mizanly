import { Tabs, useRouter } from 'expo-router';
import { View, Text, Pressable, StyleSheet, Platform } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withSequence,
} from 'react-native-reanimated';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { Icon } from '@/components/ui/Icon';
import { Badge } from '@/components/ui/Badge';
import { BottomSheet, BottomSheetItem } from '@/components/ui/BottomSheet';
import { useHaptic } from '@/hooks/useHaptic';
import { colors, tabBar, spacing, fontSize, animation, radius, glass } from '@/theme';
import { useStore } from '@/store';
import { useState } from 'react';

type TabName = 'saf' | 'bakra' | 'minbar' | 'majlis' | 'risalah';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

function TabIcon({ name, focused, badge }: { name: TabName; focused: boolean; badge?: number }) {
  const iconMap: Record<TabName, { icon: React.ComponentProps<typeof Icon>['name']; label: string }> = {
    saf: { icon: 'home', label: 'Saf' },
    bakra: { icon: 'play', label: 'Bakra' },
    minbar: { icon: 'video', label: 'Minbar' },
    majlis: { icon: 'message-circle', label: 'Majlis' },
    risalah: { icon: 'mail', label: 'Risalah' },
  };

  const { icon } = iconMap[name];
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: withSpring(focused ? 1.1 : 1, animation.spring.responsive) }],
  }));

  const activePillStyle = useAnimatedStyle(() => ({
    opacity: withTiming(focused ? 1 : 0, { duration: 200 }),
    transform: [{ scale: withSpring(focused ? 1 : 0.8, animation.spring.bouncy) }],
  }));

  return (
    <Animated.View style={[styles.iconWrap, animatedStyle]}>
      <Animated.View style={[styles.activePill, activePillStyle]} />
      <Icon
        name={icon}
        size="md"
        color={focused ? colors.emerald : colors.text.secondary}
        strokeWidth={focused ? 2.5 : 2}
      />
      {badge !== undefined && badge > 0 && (
        <Badge
          count={badge}
          size="sm"
          style={styles.badge}
        />
      )}
    </Animated.View>
  );
}

function CreateButton() {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const haptic = useHaptic();
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePress = () => {
    haptic.medium();
    scale.value = withSequence(
      withSpring(0.85, animation.spring.bouncy),
      withSpring(1, animation.spring.bouncy),
    );
    setOpen(true);
  };

  const navigate = (path: string) => {
    haptic.light();
    setOpen(false);
    router.push(path as `/${string}`);
  };

  return (
    <>
      <AnimatedPressable style={[styles.createButton, animatedStyle]} onPress={handlePress} accessibilityLabel="Create new post" accessibilityRole="button">
        <LinearGradient
          colors={[colors.emeraldLight, colors.emeraldDark]}
          style={styles.createGradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        >
          <Icon name="plus" size="md" color="#FFF" strokeWidth={3} />
        </LinearGradient>
      </AnimatedPressable>

      <BottomSheet visible={open} onClose={() => setOpen(false)}>
        <View style={styles.sheetHeader}>
          <Text style={styles.sheetTitle}>Create</Text>
        </View>
        <BottomSheetItem
          label="Photo or Video Post"
          icon={<Icon name="image" size="sm" color={colors.text.primary} />}
          onPress={() => navigate('/(screens)/create-post')}
        />
        <BottomSheetItem
          label="Start a Thread"
          icon={<Icon name="message-circle" size="sm" color={colors.text.primary} />}
          onPress={() => navigate('/(screens)/create-thread')}
        />
        <BottomSheetItem
          label="Share a Story"
          icon={<Icon name="circle-plus" size="sm" color={colors.text.primary} />}
          onPress={() => navigate('/(screens)/create-story')}
        />
        <BottomSheetItem
          label="Short Video (Reel)"
          icon={<Icon name="video" size="sm" color={colors.text.primary} />}
          onPress={() => navigate('/(screens)/create-reel')}
        />
      </BottomSheet>
    </>
  );
}

export default function TabLayout() {
  const unreadNotifications = useStore(s => s.unreadNotifications);
  const unreadMessages = useStore(s => s.unreadMessages);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarShowLabel: false,
        tabBarStyle: styles.tabBar,
        tabBarActiveTintColor: colors.emerald,
        tabBarInactiveTintColor: colors.text.secondary,
        tabBarLabelStyle: styles.tabLabel,
        tabBarBackground: () => (
          Platform.OS === 'ios' ? (
            <BlurView
              intensity={glass.ultra.blurIntensity}
              tint="dark"
              style={[StyleSheet.absoluteFill, styles.tabBarBg]}
            />
          ) : (
            <View style={[StyleSheet.absoluteFill, styles.tabBarBgAndroid]} />
          )
        ),
      }}
    >
      <Tabs.Screen
        name="saf"
        options={{
          title: 'Saf',
          tabBarAccessibilityLabel: "Home feed",
          tabBarIcon: ({ focused }) => <TabIcon name="saf" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="bakra"
        options={{
          title: 'Bakra',
          tabBarAccessibilityLabel: "Short videos",
          tabBarIcon: ({ focused }) => <TabIcon name="bakra" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="minbar"
        options={{
          title: 'Minbar',
          tabBarAccessibilityLabel: "Videos",
          tabBarIcon: ({ focused }) => <TabIcon name="minbar" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="create"
        options={{
          title: '',
          tabBarButton: () => <CreateButton />,
        }}
      />
      <Tabs.Screen
        name="majlis"
        options={{
          title: 'Majlis',
          tabBarAccessibilityLabel: "Threads",
          tabBarIcon: ({ focused }) => <TabIcon name="majlis" focused={focused} badge={unreadNotifications || undefined} />,
        }}
      />
      <Tabs.Screen
        name="risalah"
        options={{
          title: 'Risalah',
          tabBarAccessibilityLabel: "Messages",
          tabBarIcon: ({ focused }) => <TabIcon name="risalah" focused={focused} badge={unreadMessages || undefined} />,
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    position: 'absolute',
    borderTopWidth: glass.ultra.borderWidth,
    borderTopColor: glass.ultra.borderColor,
    height: tabBar.height,
    paddingTop: 8,
    backgroundColor: 'transparent',
    elevation: 0,
  },
  tabBarBg: {
    borderTopWidth: 0, // Handled by tabBar
  },
  tabBarBgAndroid: {
    backgroundColor: glass.ultra.overlayColor,
    borderTopWidth: 0, // Handled by tabBar
  },
  tabLabel: { fontSize: 10, fontWeight: '600', marginTop: -2 },
  iconWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 48,
    height: 48,
  },
  activePill: {
    position: 'absolute',
    width: 48,
    height: 48,
    borderRadius: radius.full,
    backgroundColor: colors.active.emerald10,
  },
  badge: {
    position: 'absolute',
    top: 4,
    right: 0,
  },
  createButton: {
    marginTop: spacing.xs,
  },
  createGradient: {
    width: 52,
    height: 52,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    ...shadow.glow,
  },
  sheetHeader: {
    alignItems: 'center',
    paddingBottom: spacing.sm,
  },
  sheetTitle: {
    color: colors.text.secondary,
    fontSize: fontSize.sm,
    fontWeight: '700',
  },
});
