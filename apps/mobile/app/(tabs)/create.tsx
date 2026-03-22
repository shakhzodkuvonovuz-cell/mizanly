import { useEffect } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { ScreenErrorBoundary } from '@/components/ui/ScreenErrorBoundary';

// This screen is never shown — the tab button is overridden with a custom CreateButton
// that opens a bottom sheet. If the route is somehow navigated to directly, redirect back.
export default function CreateScreen() {
  const router = useRouter();
  useEffect(() => { router.back(); }, [router]);
  return (
    <ScreenErrorBoundary>
      <View />
    </ScreenErrorBoundary>
  );
}
