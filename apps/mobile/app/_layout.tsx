import { useEffect } from 'react';
import { I18nManager, Alert, AppState, AppStateStatus, Platform } from 'react-native';
import { Stack, useRouter, useSegments, useRootNavigationState } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ClerkProvider, ClerkLoaded, useAuth, useUser } from '@clerk/clerk-expo';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import * as SecureStore from 'expo-secure-store';
import * as SplashScreen from 'expo-splash-screen';
import { useFonts } from 'expo-font';
import { PlayfairDisplay_700Bold } from "@expo-google-fonts/playfair-display";
import { DMSans_400Regular, DMSans_500Medium, DMSans_700Bold } from "@expo-google-fonts/dm-sans";
import { NotoNaskhArabic_400Regular, NotoNaskhArabic_700Bold } from "@expo-google-fonts/noto-naskh-arabic";
import { api } from '@/services/api';
import { usePushNotifications } from '@/hooks/usePushNotifications';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { OfflineBanner } from '@/components/ui/OfflineBanner';

// Allow the OS to flip layouts to RTL for Arabic and other RTL languages.
// Most React Native flex layouts auto-mirror when this is enabled.
I18nManager.allowRTL(true);

// Keep the splash screen visible until fonts are loaded
SplashScreen.preventAutoHideAsync();

const CLERK_KEY = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY!;

// Query cache persistence deferred — requires @tanstack/react-query-persist-client package install
const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 1000 * 60, retry: 2 },
    mutations: {
      onError: (error: Error) => {
        // Show a toast/alert for failed mutations
        Alert.alert('Error', error.message);
      },
      retry: (failureCount, error) => {
        // Retry network errors up to 3 times
        if (error.message?.includes('Network') && failureCount < 3) return true;
        return false;
      },
    },
  },
});

const tokenCache = Platform.OS === 'web'
  ? {
      async getToken(key: string) { return localStorage.getItem(key); },
      async saveToken(key: string, value: string) { localStorage.setItem(key, value); },
    }
  : {
      async getToken(key: string) { return SecureStore.getItemAsync(key); },
      async saveToken(key: string, value: string) { return SecureStore.setItemAsync(key, value); },
    };

// Handles auth redirect based on sign-in state
function AuthGuard() {
  const { isSignedIn, isLoaded, getToken } = useAuth();
  const { user } = useUser();
  const segments = useSegments();
  const router = useRouter();
  const navigationState = useRootNavigationState();

  // Wire Clerk token into the API client
  useEffect(() => {
    api.setTokenGetter(async () => {
      const token = await getToken();
      if (!token) console.warn('[API] No auth token from Clerk');
      return token;
    });
  }, [getToken]);

  // Register push notification token once signed in
  usePushNotifications(!!isSignedIn);

  useEffect(() => {
    if (!isLoaded) return;
    if (!navigationState?.key) return;

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
  }, [isSignedIn, isLoaded, segments, user, navigationState?.key]);

  return null;
}

function AppStateHandler() {
  const queryClient = useQueryClient();

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState: AppStateStatus) => {
      if (nextState === 'active') {
        queryClient.invalidateQueries(); // Refetch stale queries
      }
    });
    return () => subscription.remove();
  }, [queryClient]);

  return null;
}

export default function RootLayout() {

  const [fontsLoaded] = useFonts({
    PlayfairDisplay_700Bold,
    DMSans_400Regular,
    DMSans_500Medium,
    DMSans_700Bold,
    NotoNaskhArabic_400Regular,
    NotoNaskhArabic_700Bold,
  });
  useEffect(() => {
    if (fontsLoaded) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded]);

  useNetworkStatus();

  if (!fontsLoaded) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ErrorBoundary>
        <ClerkProvider publishableKey={CLERK_KEY} tokenCache={tokenCache}>
          <ClerkLoaded>
            <QueryClientProvider client={queryClient}>
              <StatusBar style="light" />
              <OfflineBanner />
              <AuthGuard />
              <AppStateHandler />
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
