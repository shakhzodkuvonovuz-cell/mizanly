import { View, Text, StyleSheet } from 'react-native';
import { useStore } from '@/store';
import { Icon } from '@/components/ui/Icon';
import { colors, spacing, fontSize } from '@/theme';

export function OfflineBanner() {
  const isOffline = useStore((s) => s.isOffline);
  if (!isOffline) return null;

  return (
    <View style={styles.banner}>
      <Icon name="globe" size="xs" color={colors.text.primary} />
      <Text style={styles.text}>No internet connection</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    width: '100%',
    height: 36,
    backgroundColor: colors.error,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.base,
    gap: spacing.sm,
  },
  text: {
    color: colors.text.primary,
    fontSize: fontSize.sm,
    fontWeight: '500',
  },
});