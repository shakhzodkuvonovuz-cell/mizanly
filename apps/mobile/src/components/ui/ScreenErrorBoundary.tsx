import { Component, type ReactNode } from 'react';
import i18next from 'i18next';
import { Appearance, View, Text, Pressable, StyleSheet } from 'react-native';
import { EmptyState } from '@/components/ui/EmptyState';
import { Icon } from '@/components/ui/Icon';
import { colors, spacing, fontSize, radius, fonts } from '@/theme';
import * as Linking from 'expo-linking';

interface ScreenErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
}

interface ScreenErrorBoundaryState {
  hasError: boolean;
  error?: Error;
}

export class ScreenErrorBoundary extends Component<ScreenErrorBoundaryProps, ScreenErrorBoundaryState> {
  state: ScreenErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(error: Error): ScreenErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    if (__DEV__) console.error('[ScreenErrorBoundary] Caught error:', error.message);
    if (__DEV__) console.error('[ScreenErrorBoundary] Component stack:', info.componentStack);
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: undefined });
  };

  handleGoHome = () => {
    // Use Linking to navigate to home tab — works from class component without useRouter
    Linking.openURL(Linking.createURL('/(tabs)/saf'));
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    if (this.props.fallback) {
      return this.props.fallback;
    }

    const isDark = Appearance.getColorScheme() !== 'light';
    const bgColor = isDark ? colors.dark.bg : colors.light.bg;
    const secondaryTextColor = isDark ? colors.text.secondary : colors.textLight.secondary;
    const borderColor = isDark ? colors.dark.border : colors.light.border;

    return (
      <View style={[styles.container, { backgroundColor: bgColor }]}>
        <EmptyState
          icon="slash"
          title={i18next.t('common.error')}
          subtitle={this.state.error?.message ?? i18next.t('errorBoundary.unexpectedError')}
          actionLabel={i18next.t('common.retry')}
          onAction={this.handleRetry}
        />
        <Pressable
          style={[styles.goHomeButton, { borderColor }]}
          onPress={this.handleGoHome}
          accessibilityRole="button"
          accessibilityLabel={i18next.t('errorBoundary.goHome')}
          hitSlop={8}
        >
          <Icon name="home" size="sm" color={secondaryTextColor} />
          <Text style={[styles.goHomeText, { color: secondaryTextColor }]}>
            {i18next.t('errorBoundary.goHome')}
          </Text>
        </Pressable>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    paddingBottom: spacing['3xl'],
  },
  goHomeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    marginTop: spacing.lg,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    alignSelf: 'center',
    borderRadius: radius.full,
    borderWidth: 1,
  },
  goHomeText: {
    fontFamily: fonts.bodyMedium,
    fontSize: fontSize.sm,
  },
});
