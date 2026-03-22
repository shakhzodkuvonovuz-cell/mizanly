import React from 'react';
import { View, Text, Pressable, StyleSheet, Platform, Dimensions } from 'react-native';
import { usePathname } from 'expo-router';
import { Icon } from '@/components/ui/Icon';
import { Badge } from '@/components/ui/Badge';
import { useStore } from '@/store';
import { useResponsive } from '@/hooks/useResponsive';
import { useTranslation } from '@/hooks/useTranslation';
import { colors, spacing, fontSize, radius, fontWeight, shadow } from '@/theme';
import { useThemeColors } from '@/hooks/useThemeColors';
import { navigate } from '@/utils/navigation';

type IconName = React.ComponentProps<typeof Icon>['name'];

interface NavItem {
  key: string;
  icon: IconName;
  label: string;
  route: string;
  badge?: number;
}

interface WebSidebarProps {
  collapsed?: boolean;
}

export function WebSidebar({ collapsed = false }: WebSidebarProps) {
  const { t } = useTranslation();
  const tc = useThemeColors();
  const pathname = usePathname();
  const unreadNotifications = useStore(s => s.unreadNotifications);
  const unreadMessages = useStore(s => s.unreadMessages);
  const user = useStore(s => s.user);

  if (Platform.OS !== 'web') return null;

  const mainNavItems: NavItem[] = [
    { key: 'saf', icon: 'home', label: t('tabs.saf'), route: '/(tabs)/saf' },
    { key: 'majlis', icon: 'message-circle', label: t('tabs.majlis'), route: '/(tabs)/majlis' },
    { key: 'risalah', icon: 'mail', label: t('tabs.risalah'), route: '/(tabs)/risalah', badge: unreadMessages || undefined },
    { key: 'bakra', icon: 'play', label: t('tabs.bakra'), route: '/(tabs)/bakra' },
    { key: 'minbar', icon: 'video', label: t('tabs.minbar'), route: '/(tabs)/minbar' },
  ];

  const secondaryNavItems: NavItem[] = [
    { key: 'search', icon: 'search', label: t('common.search'), route: '/(screens)/search' },
    { key: 'create', icon: 'plus', label: t('common.create'), route: '/(screens)/create-post' },
    { key: 'notifications', icon: 'bell', label: t('common.notifications'), route: '/(screens)/notifications', badge: unreadNotifications || undefined },
    { key: 'profile', icon: 'user', label: t('common.profile'), route: `/(screens)/profile/${user?.username || 'me'}` },
    { key: 'settings', icon: 'settings', label: t('common.settings'), route: '/(screens)/settings' },
  ];

  const isActive = (route: string, key: string): boolean => {
    if (key === 'saf') return pathname === '/' || pathname === '/saf' || pathname.startsWith('/(tabs)/saf');
    return pathname.includes(key);
  };

  const handleNav = (route: string) => {
    navigate(route);
  };

  const renderNavItem = (item: NavItem) => {
    const active = isActive(item.route, item.key);

    return (
      <Pressable
        key={item.key}
        style={({ hovered }) => [
          styles.navItem,
          collapsed && styles.navItemCollapsed,
          active && styles.navItemActive,
          hovered && !active && styles.navItemHover,
        ]}
        onPress={() => handleNav(item.route)}
        accessibilityRole="link"
        accessibilityLabel={item.label}
      >
        <View style={styles.iconContainer}>
          <Icon
            name={item.icon}
            size="md"
            color={active ? colors.emerald : colors.text.secondary}
            strokeWidth={active ? 2.5 : 2}
          />
          {item.badge !== undefined && item.badge > 0 && (
            <Badge count={item.badge} size="sm" style={styles.badge} />
          )}
        </View>
        {!collapsed && (
          <Text
            style={[
              styles.navLabel,
              active && styles.navLabelActive,
            ]}
            numberOfLines={1}
          >
            {item.label}
          </Text>
        )}
      </Pressable>
    );
  };

  return (
    <View style={[styles.sidebar, { backgroundColor: tc.bgElevated, borderRightColor: tc.border }, collapsed && styles.sidebarCollapsed]}>
      {/* Logo */}
      <Pressable
        style={[styles.logoContainer, collapsed && styles.logoContainerCollapsed]}
        onPress={() => handleNav('/(tabs)/saf')}
        accessibilityRole="link"
        accessibilityLabel={t('common.home')}
      >
        <View style={styles.logoMark}>
          <Text style={styles.logoLetter}>M</Text>
        </View>
        {!collapsed && (
          <Text style={styles.logoText}>Mizanly</Text>
        )}
      </Pressable>

      {/* Main nav */}
      <View style={styles.navSection}>
        {mainNavItems.map(renderNavItem)}
      </View>

      {/* Divider */}
      <View style={[styles.divider, { backgroundColor: tc.border }]} />

      {/* Secondary nav */}
      <View style={styles.navSection}>
        {secondaryNavItems.map(renderNavItem)}
      </View>

      {/* Spacer */}
      <View style={styles.spacer} />

      {/* Keyboard shortcut hints */}
      {!collapsed && (
        <View style={styles.shortcutsSection}>
          <View style={styles.shortcutRow}>
            <Text style={styles.shortcutKey}>Ctrl+K</Text>
            <Text style={styles.shortcutLabel}>Search</Text>
          </View>
          <View style={styles.shortcutRow}>
            <Text style={styles.shortcutKey}>Ctrl+N</Text>
            <Text style={styles.shortcutLabel}>New Post</Text>
          </View>
          <View style={styles.shortcutRow}>
            <Text style={styles.shortcutKey}>Esc</Text>
            <Text style={styles.shortcutLabel}>Go Back</Text>
          </View>
        </View>
      )}
    </View>
  );
}

const SIDEBAR_WIDTH = 240;
const SIDEBAR_COLLAPSED_WIDTH = 68;

export { SIDEBAR_WIDTH, SIDEBAR_COLLAPSED_WIDTH };

const styles = StyleSheet.create({
  sidebar: {
    width: SIDEBAR_WIDTH,
    backgroundColor: colors.dark.bgElevated,
    borderRightWidth: 1,
    borderRightColor: colors.dark.border,
    paddingTop: spacing.xl,
    paddingBottom: spacing.base,
    height: Dimensions.get('window').height,
  },
  sidebarCollapsed: {
    width: SIDEBAR_COLLAPSED_WIDTH,
    alignItems: 'center',
  },
  logoContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.base,
    paddingBottom: spacing['2xl'],
    gap: spacing.md,
  },
  logoContainerCollapsed: {
    paddingHorizontal: 0,
    justifyContent: 'center',
  },
  logoMark: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    backgroundColor: colors.emerald,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.glow,
  },
  logoLetter: {
    color: colors.text.onColor,
    fontSize: fontSize.lg,
    fontWeight: fontWeight.bold,
  },
  logoText: {
    color: colors.text.primary,
    fontSize: fontSize.xl,
    fontWeight: fontWeight.bold,
    letterSpacing: -0.5,
  },
  navSection: {
    paddingHorizontal: spacing.sm,
    gap: spacing.xs,
  },
  navItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    gap: spacing.md,
  },
  navItemCollapsed: {
    justifyContent: 'center',
    paddingHorizontal: 0,
    width: 48,
  },
  navItemActive: {
    backgroundColor: colors.active.emerald10,
  },
  navItemHover: {
    backgroundColor: colors.active.white5,
  },
  iconContainer: {
    position: 'relative',
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    top: -6,
    right: -8,
  },
  navLabel: {
    color: colors.text.secondary,
    fontSize: fontSize.base,
    fontWeight: fontWeight.medium,
  },
  navLabelActive: {
    color: colors.emerald,
    fontWeight: fontWeight.semibold,
  },
  divider: {
    height: 1,
    backgroundColor: colors.dark.border,
    marginHorizontal: spacing.base,
    marginVertical: spacing.base,
  },
  spacer: {
    flex: 1,
  },
  shortcutsSection: {
    paddingHorizontal: spacing.base,
    gap: spacing.sm,
    opacity: 0.5,
  },
  shortcutRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  shortcutKey: {
    color: colors.text.tertiary,
    fontSize: fontSize.xs,
    fontWeight: fontWeight.medium,
    backgroundColor: colors.dark.surface,
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
    borderRadius: radius.sm,
    overflow: 'hidden',
  },
  shortcutLabel: {
    color: colors.text.tertiary,
    fontSize: fontSize.xs,
  },
});
