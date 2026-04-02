import { Stack } from 'expo-router';
import { useThemeColors } from '@/hooks/useThemeColors';
import { useTranslation } from '@/hooks/useTranslation';

export default function ScreensLayout() {
  const tc = useThemeColors();
  const { isRTL } = useTranslation();
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: tc.bg },
        animation: isRTL ? 'slide_from_left' : 'slide_from_right',
      }}
    />
  );
}
