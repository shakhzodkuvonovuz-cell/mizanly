import { Tabs, useRouter } from 'expo-router';
import { View, Text, Pressable, StyleSheet, Platform } from 'react-native';
import { useTranslation } from '@/hooks/useTranslation';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { BlurView } from 'expo-blur';
import { Icon } from '@/components/ui/Icon';
import { Badge } from '@/components/ui/Badge';
// BottomSheet removed — create flow now uses CreateSheet component
import { WebLayout } from '@/components/web/WebLayout';
import { useContextualHaptic } from '@/hooks/useContextualHaptic';
import { useResponsive } from '@/hooks/useResponsive';
import { useWebKeyboardShortcuts } from '@/hooks/useWebKeyboardShortcuts';
import { colors, tabBar, spacing, fontSize, animation, radius, fontSizeExt } from '@/theme';
import { useStore } from '@/store';
import { navigate as navTo } from '@/utils/navigation';
// useState removed — create state now in CreateSheet
import { useThemeColors } from '@/hooks/useThemeColors';

type TabName = 'saf' | 'bakra' | 'minbar' | 'majlis' | 'risalah';

function TabIcon({ name, focused, badge }: { name: TabName; focused: boolean; badge?: number }) {
  const { t } = useTranslation();
  const tc = useThemeColors();
  const iconMap: Record<TabName, { icon: React.ComponentProps<typeof Icon>['name']; label: string }> = {
    saf: { icon: 'home', label: t('tabs.saf') },
    bakra: { icon: 'play', label: t('tabs.bakra') },
    minbar: { icon: 'video', label: t('tabs.minbar') },
    majlis: { icon: 'message-circle', label: t('tabs.majlis') },
    risalah: { icon: 'mail', label: t('tabs.risalah') },
  };

  const { icon } = iconMap[name];

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
        color={focused ? colors.emerald : tc.text.secondary}
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

export default function TabLayout() {
  const { t } = useTranslation();
  const haptic = useContextualHaptic();
  const unreadNotifications = useStore(s => s.unreadNotifications);
  const unreadMessages = useStore(s => s.unreadMessages);
  const { isDesktop, isTablet } = useResponsive();
  const tc = useThemeColors();
  const isWebWide = Platform.OS === 'web' && (isDesktop || isTablet);

  // Register web keyboard shortcuts (no-op on native)
  useWebKeyboardShortcuts();

  return (
    <WebLayout>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarShowLabel: false,
          tabBarStyle: isWebWide ? styles.tabBarHidden : styles.tabBar,
          tabBarActiveTintColor: colors.emerald,
          tabBarInactiveTintColor: tc.text.secondary,
          tabBarLabelStyle: styles.tabLabel,
          tabBarBackground: () =>
            isWebWide ? null : (
              Platform.OS === 'ios' ? (
                <BlurView
                  intensity={80}
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
          listeners={{ tabPress: () => haptic.tick() }}
          options={{
            title: t('tabs.saf'),
            tabBarAccessibilityLabel: t('tabs.accessibility.homeFeed'),
            tabBarIcon: ({ focused }) => <TabIcon name="saf" focused={focused} badge={unreadNotifications || undefined} />,
          }}
        />
        <Tabs.Screen
          name="bakra"
          listeners={{ tabPress: () => haptic.tick() }}
          options={{
            title: t('tabs.bakra'),
            tabBarAccessibilityLabel: t('tabs.accessibility.shortVideos'),
            tabBarIcon: ({ focused }) => <TabIcon name="bakra" focused={focused} />,
          }}
        />
        <Tabs.Screen
          name="minbar"
          listeners={{ tabPress: () => haptic.tick() }}
          options={{
            title: t('tabs.minbar'),
            tabBarAccessibilityLabel: t('tabs.accessibility.videos'),
            tabBarIcon: ({ focused }) => <TabIcon name="minbar" focused={focused} />,
          }}
        />
        <Tabs.Screen
          name="majlis"
          listeners={{ tabPress: () => haptic.tick() }}
          options={{
            title: t('tabs.majlis'),
            tabBarAccessibilityLabel: t('tabs.accessibility.threads'),
            tabBarIcon: ({ focused }) => <TabIcon name="majlis" focused={focused} />,
          }}
        />
        <Tabs.Screen
          name="risalah"
          listeners={{ tabPress: () => haptic.tick() }}
          options={{
            title: t('tabs.risalah'),
            tabBarAccessibilityLabel: t('tabs.accessibility.messages'),
            tabBarIcon: ({ focused }) => <TabIcon name="risalah" focused={focused} badge={unreadMessages || undefined} />,
          }}
        />
      </Tabs>
    </WebLayout>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    position: 'absolute',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.08)',
    height: tabBar.height,
    paddingTop: 8,
    backgroundColor: 'transparent',
    elevation: 0,
  },
  tabBarHidden: {
    display: 'none',
    height: 0,
  },
  tabBarBg: {
    borderTopWidth: 0, // Handled by tabBar
  },
  tabBarBgAndroid: {
    backgroundColor: 'rgba(13, 17, 23, 0.92)',
    borderTopWidth: 0, // Handled by tabBar
  },
  tabLabel: { fontSize: fontSizeExt.tiny, fontWeight: '600', marginTop: -2 },
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
    end: 0,
  },
  // createButton styles removed — now in CreateSheet.tsx
    fontWeight: '700',
  },
});
