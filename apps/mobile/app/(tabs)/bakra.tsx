import { View, Text, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Icon } from '@/components/ui/Icon';
import { colors, fontSize } from '@/theme';

export default function BakraScreen() {
  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.center}>
        <Icon name="video" size="xl" color={colors.text.secondary} />
        <Text style={styles.title}>Bakra</Text>
        <Text style={styles.subtitle}>Short videos coming in V1.1</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.dark.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 },
  title: { color: colors.text.primary, fontSize: fontSize.xl, fontWeight: '700', marginBottom: 8 },
  subtitle: { color: colors.text.secondary, fontSize: fontSize.base },
});
