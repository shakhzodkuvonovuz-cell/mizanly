import { Stack } from 'expo-router';
import { colors } from '@/theme';

export default function ScreensLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.dark.bg },
        animation: 'slide_from_right',
      }}
    />
  );
}
