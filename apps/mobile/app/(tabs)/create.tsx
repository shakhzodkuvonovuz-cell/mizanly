import { useEffect } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { ScreenErrorBoundary } from '@/components/ui/ScreenErrorBoundary';
import { colors } from '@/theme';

// Create tab removed — create flow is now via CreateHeaderButton in the header.
// This file exists as a safety redirect in case anyone deep-links to /create.
export default function CreateScreen() {
  const router = useRouter();
  useEffect(() => {
    // D42-#27/#29: Use replace instead of back() to handle cold deep-links safely
    router.replace('/(tabs)/saf');
  }, [router]);
  return (
    <ScreenErrorBoundary>
      <View style={createStyles.container}>
        <ActivityIndicator color={colors.emerald} />
      </View>
    </ScreenErrorBoundary>
  );
}

const createStyles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center' },
});
