import { Stack } from 'expo-router';
import { useThemeColors } from '@/hooks/useThemeColors';

export default function ScreensLayout() {
  const tc = useThemeColors();
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: tc.bg },
        animation: 'slide_from_right',
      }}
    />
  );
}
