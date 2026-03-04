import { Component, type ReactNode } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { colors, spacing, fontSize } from '@/theme';

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

  handleReset = () => {
    this.setState({ hasError: false, error: undefined });
  };

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <View style={styles.container}>
        <Text style={styles.emoji}>🕌</Text>
        <Text style={styles.title}>Something went wrong</Text>
        <Text style={styles.message} numberOfLines={3}>
          {this.state.error?.message ?? 'An unexpected error occurred.'}
        </Text>
        <Pressable style={styles.btn} onPress={this.handleReset}>
          <Text style={styles.btnText}>Try again</Text>
        </Pressable>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1, backgroundColor: colors.dark.bg,
    alignItems: 'center', justifyContent: 'center',
    padding: spacing.xl,
  },
  emoji: { fontSize: 48, marginBottom: spacing.lg },
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
    borderRadius: 999, paddingHorizontal: spacing.xl, paddingVertical: spacing.md,
  },
  btnText: { color: '#fff', fontSize: fontSize.base, fontWeight: '700' },
});
