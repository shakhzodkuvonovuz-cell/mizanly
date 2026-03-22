import { Component, type ReactNode } from 'react';
import i18next from 'i18next';
import { View, StyleSheet } from 'react-native';
import { EmptyState } from '@/components/ui/EmptyState';
import { colors, spacing } from '@/theme';

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
    console.error('[ScreenErrorBoundary] Caught error:', error.message);
    console.error('[ScreenErrorBoundary] Component stack:', info.componentStack);
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: undefined });
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    if (this.props.fallback) {
      return this.props.fallback;
    }

    return (
      <View style={styles.container}>
        <EmptyState
          icon="slash"
          title={i18next.t('common.error')}
          subtitle={this.state.error?.message ?? 'An unexpected error occurred. Please try again.'}
          actionLabel={i18next.t('common.retry')}
          onAction={this.handleRetry}
        />
      </View>
    );
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.dark.bg,
    justifyContent: 'center',
    paddingBottom: spacing['3xl'],
  },
});
