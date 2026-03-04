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

type TabName = 'saf' | 'bakra' | 'majlis' | 'risalah';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

function TabIcon({ name, focused, badge }: { name: TabName; focused: boolean; badge?: number }) {
  const iconMap: Record<TabName, { icon: React.ComponentProps<typeof Icon>['name']; label: string }> = {
    saf: { icon: 'home', label: 'Saf' },
    bakra: { icon: 'play', label: 'Bakra' },
    majlis: { icon: 'message-circle', label: 'Majlis' },
    risalah: { icon: 'mail', label: 'Risalah' },
  };

  const { icon } = iconMap[name];
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <Animated.View style={[styles.iconWrap, animatedStyle]}>
      <Icon
        name={icon}
        size="md"
        color={focused ? colors.emerald : colors.text.secondary}
        strokeWidth={focused ? 2 : 1.75}
      />
      {focused && <View style={styles.activeDot} />}
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
    router.push(path as any);
  };

  return (
    <>
      <AnimatedPressable style={[styles.createButton, animatedStyle]} onPress={handlePress}>
        <LinearGradient
          colors={[colors.emeraldLight, colors.emerald]}
          style={styles.createGradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        >
          <Icon name="plus" size="md" color="#FFF" strokeWidth={2.5} />
        </LinearGradient>
      </AnimatedPressable>

      <BottomSheet visible={open} onClose={() => setOpen(false)}>
        <View style={styles.sheetHeader}>
          <Text style={styles.sheetTitle}>Create</Text>
        </View>
        <BottomSheetItem
          label="Post"
          icon={<Icon name="image" size="sm" color={colors.text.primary} />}
          onPress={() => navigate('/(screens)/create-post')}
        />
        <BottomSheetItem
          label="Thread"
          icon={<Icon name="message-circle" size="sm" color={colors.text.primary} />}
          onPress={() => navigate('/(screens)/create-thread')}
        />
        <BottomSheetItem
          label="Story"
          icon={<Icon name="circle-plus" size="sm" color={colors.text.primary} />}
          onPress={() => navigate('/(screens)/create-story')}
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
        tabBarStyle: styles.tabBar,
        tabBarActiveTintColor: colors.emerald,
        tabBarInactiveTintColor: colors.text.secondary,
        tabBarLabelStyle: styles.tabLabel,
        tabBarBackground: () => (
          Platform.OS === 'ios' ? (
            <BlurView
              intensity={glass.heavy.blurIntensity}
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
          tabBarIcon: ({ focused }) => <TabIcon name="saf" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="bakra"
        options={{
          title: 'Bakra',
          tabBarIcon: ({ focused }) => <TabIcon name="bakra" focused={focused} />,
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
          tabBarIcon: ({ focused }) => <TabIcon name="majlis" focused={focused} badge={unreadNotifications || undefined} />,
        }}
      />
      <Tabs.Screen
        name="risalah"
        options={{
          title: 'Risalah',
          tabBarIcon: ({ focused }) => <TabIcon name="risalah" focused={focused} badge={unreadMessages || undefined} />,
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    position: 'absolute',
    borderTopWidth: 0.5,
    borderTopColor: colors.glass.border,
    height: tabBar.height,
    paddingTop: 6,
    backgroundColor: 'transparent',
    elevation: 0,
  },
  tabBarBg: {
    borderTopWidth: 0.5,
    borderTopColor: colors.glass.border,
  },
  tabBarBgAndroid: {
    backgroundColor: 'rgba(13,17,23,0.97)',
    borderTopWidth: 0.5,
    borderTopColor: colors.dark.border,
  },
  tabLabel: { fontSize: 10, fontWeight: '600', marginTop: -2 },
  iconWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 32,
    height: 32,
  },
  activeDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.emerald,
    marginTop: 2,
  },
  badge: {
    position: 'absolute',
    top: -4,
    right: -10,
  },
  createButton: {
    marginTop: 4,
  },
  createGradient: {
    width: 48,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.emerald,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 6,
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
