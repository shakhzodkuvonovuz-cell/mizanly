import { useEffect } from 'react';
import { I18nManager } from 'react-native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ClerkProvider, ClerkLoaded, useAuth, useUser } from '@clerk/clerk-expo';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import * as SecureStore from 'expo-secure-store';
import * as SplashScreen from 'expo-splash-screen';
import { useFonts } from 'expo-font';
import { api } from '@/services/api';
import { usePushNotifications } from '@/hooks/usePushNotifications';
import { ErrorBoundary } from '@/components/ErrorBoundary';

// Allow the OS to flip layouts to RTL for Arabic and other RTL languages.
// Most React Native flex layouts auto-mirror when this is enabled.
I18nManager.allowRTL(true);

// Keep the splash screen visible until fonts are loaded
SplashScreen.preventAutoHideAsync();

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

  // Register push notification token once signed in
  usePushNotifications(!!isSignedIn);

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
  // TODO: Install font packages:
  //   npx expo install @expo-google-fonts/playfair-display @expo-google-fonts/dm-sans @expo-google-fonts/noto-naskh-arabic
  // Then replace the empty object with the imported font map:
  //   import { useFonts, PlayfairDisplay_700Bold } from '@expo-google-fonts/playfair-display';
  //   import { DMSans_400Regular, DMSans_500Medium } from '@expo-google-fonts/dm-sans';
  //   import { NotoNaskhArabic_400Regular } from '@expo-google-fonts/noto-naskh-arabic';
  const [fontsLoaded] = useFonts({
    // PlayfairDisplay_700Bold,
    // DMSans_400Regular,
    // DMSans_500Medium,
    // NotoNaskhArabic_400Regular,
  });

  useEffect(() => {
    if (fontsLoaded) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded]);

  if (!fontsLoaded) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ErrorBoundary>
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
      </ErrorBoundary>
    </GestureHandlerRootView>
  );
}
