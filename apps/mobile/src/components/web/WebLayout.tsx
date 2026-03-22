import React from 'react';
import { View, StyleSheet, Platform, Dimensions } from 'react-native';
import { WebSidebar, SIDEBAR_WIDTH, SIDEBAR_COLLAPSED_WIDTH } from './WebSidebar';
import { useResponsive } from '@/hooks/useResponsive';
import { colors } from '@/theme';
import { useThemeColors } from '@/hooks/useThemeColors';

interface WebLayoutProps {
  children: React.ReactNode;
  /** Optional right panel content (e.g., trending, suggestions) */
  rightPanel?: React.ReactNode;
}

/**
 * Responsive web layout wrapper.
 * - Desktop (>= 1024px): sidebar + main content + optional right panel
 * - Tablet (768-1023px): collapsed sidebar + main content
 * - Mobile / Native: just children (no sidebar)
 */
export function WebLayout({ children, rightPanel }: WebLayoutProps) {
  const { isDesktop, isTablet } = useResponsive();
  const tc = useThemeColors();

  // On native or mobile web, render children directly
  if (Platform.OS !== 'web' || (!isDesktop && !isTablet)) {
    return <>{children}</>;
  }

  const collapsed = isTablet;

  return (
    <View style={[styles.container, { backgroundColor: tc.bg }]}>
      <WebSidebar collapsed={collapsed} />
      <View
        style={[
          styles.main,
          {
            marginLeft: collapsed ? SIDEBAR_COLLAPSED_WIDTH : SIDEBAR_WIDTH,
          },
        ]}
      >
        <View style={styles.content}>
          {children}
        </View>
        {isDesktop && rightPanel && (
          <View style={[styles.rightPanel, { borderLeftColor: tc.border }]}>
            {rightPanel}
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: colors.dark.bg,
    height: Dimensions.get('window').height,
  },
  main: {
    flex: 1,
    flexDirection: 'row',
    height: Dimensions.get('window').height,
  },
  content: {
    flex: 1,
    maxWidth: 640,
    alignSelf: 'flex-start',
    height: Dimensions.get('window').height,
  },
  rightPanel: {
    width: 320,
    borderLeftWidth: 1,
    borderLeftColor: colors.dark.border,
    height: Dimensions.get('window').height,
  },
});
