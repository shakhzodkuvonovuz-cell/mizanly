import { Component, type ReactNode } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { colors, spacing, fontSize, radius } from '@/theme';
import { Icon } from '@/components/ui/Icon';
import i18next from 'i18next';
import { captureException } from '@/config/sentry';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: { componentStack?: string | null }) {
    captureException(error, { componentStack: info.componentStack ?? 'unknown' });
  }

  handleReset = () => {
    this.setState({ hasError: false, error: undefined });
  };

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <View style={styles.container}>
        <Icon name="slash" size="xl" color={colors.text.secondary} />
        <Text style={styles.title}>{i18next.t('common.somethingWentWrong')}</Text>
        <Text style={styles.message} numberOfLines={3}>
          {this.state.error?.message ?? i18next.t('common.error')}
        </Text>
        <Pressable style={styles.btn} onPress={this.handleReset}>
          <Text style={styles.btnText}>{i18next.t('common.retry')}</Text>
        </Pressable>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  // TODO: colors.dark.bg cannot be replaced with useThemeColors() — ErrorBoundary is a class component.
  // Convert to a function component wrapper with useThemeColors() to make this theme-aware.
  container: {
    flex: 1, backgroundColor: colors.dark.bg,
    alignItems: 'center', justifyContent: 'center',
    padding: spacing.xl,
  },
  title: {
    color: colors.text.primary, fontSize: fontSize.xl,
    fontWeight: '700', marginBottom: spacing.sm, textAlign: 'center',
  },
  message: {
    color: colors.text.secondary, fontSize: fontSize.sm,
    textAlign: 'center', marginBottom: spacing.xl,
  },
  btn: {
    backgroundColor: colors.emerald,
    borderRadius: radius.full, paddingHorizontal: spacing.xl, paddingVertical: spacing.md,
  },
  btnText: { color: colors.text.primary, fontSize: fontSize.base, fontWeight: '700' },
});
