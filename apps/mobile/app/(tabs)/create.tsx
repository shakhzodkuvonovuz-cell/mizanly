import { useEffect } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { ScreenErrorBoundary } from '@/components/ui/ScreenErrorBoundary';

// Create tab removed — create flow is now via CreateHeaderButton in the header.
// This file exists as a safety redirect in case anyone deep-links to /create.
export default function CreateScreen() {
  const router = useRouter();
  useEffect(() => { router.back(); }, [router]);
  return (
    <ScreenErrorBoundary>
      <View />
    </ScreenErrorBoundary>
  );
}
