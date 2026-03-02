import { useEffect } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ClerkProvider, ClerkLoaded, useAuth, useUser } from '@clerk/clerk-expo';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import * as SecureStore from 'expo-secure-store';
import { api } from '@/services/api';

const CLERK_KEY = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY!;

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 1000 * 60, retry: 2 },
  },
});

const tokenCache = {
  async getToken(key: string) {
    return SecureStore.getItemAsync(key);
  },
  async saveToken(key: string, value: string) {
    return SecureStore.setItemAsync(key, value);
  },
};

// Handles auth redirect based on sign-in state
function AuthGuard() {
  const { isSignedIn, isLoaded, getToken } = useAuth();
  const { user } = useUser();
  const segments = useSegments();
  const router = useRouter();

  // Wire Clerk token into the API client
  useEffect(() => {
    api.setTokenGetter(() => getToken());
  }, [getToken]);

  useEffect(() => {
    if (!isLoaded) return;

    const inAuthGroup = segments[0] === '(auth)';
    const inOnboarding = segments[0] === 'onboarding';

    if (!isSignedIn) {
      // Not signed in — go to auth screens
      if (!inAuthGroup) router.replace('/(auth)/sign-in');
    } else {
      // Signed in but no username set → onboarding
      const hasUsername = !!(user?.unsafeMetadata?.onboardingComplete);
      if (!hasUsername && !inOnboarding) {
        router.replace('/onboarding/username');
      } else if (hasUsername && (inAuthGroup || inOnboarding)) {
        router.replace('/(tabs)/saf');
      }
    }
  }, [isSignedIn, isLoaded, segments, user]);

  return null;
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ClerkProvider publishableKey={CLERK_KEY} tokenCache={tokenCache}>
        <ClerkLoaded>
          <QueryClientProvider client={queryClient}>
            <StatusBar style="light" />
            <AuthGuard />
            <Stack screenOptions={{ headerShown: false }}>
              <Stack.Screen name="(tabs)" />
              <Stack.Screen name="(auth)" options={{ presentation: 'modal' }} />
              <Stack.Screen name="onboarding" options={{ gestureEnabled: false }} />
              <Stack.Screen name="(screens)" />
            </Stack>
          </QueryClientProvider>
        </ClerkLoaded>
      </ClerkProvider>
    </GestureHandlerRootView>
  );
}
