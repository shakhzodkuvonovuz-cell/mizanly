import { Redirect } from 'expo-router';
import { ScreenErrorBoundary } from '@/components/ui/ScreenErrorBoundary';

export default function Index() {
  return (
    <ScreenErrorBoundary>
      <Redirect href="/(tabs)/saf" />
    </ScreenErrorBoundary>
  );
}
