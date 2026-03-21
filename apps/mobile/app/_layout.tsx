import { useEffect, useState, useCallback } from 'react';
import { I18nManager, Alert, AppState, AppStateStatus, Platform, View, Text, StyleSheet, TextInput } from 'react-native';
import { Stack, useRouter, useSegments, useRootNavigationState } from 'expo-router';
import { useTranslation } from '@/hooks/useTranslation';
import { StatusBar } from 'expo-status-bar';
import { ClerkProvider, ClerkLoaded, useAuth, useUser } from '@clerk/clerk-expo';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import * as SecureStore from 'expo-secure-store';
import * as SplashScreen from 'expo-splash-screen';
import type { AuthenticateResult } from 'expo-local-authentication';
import * as LocalAuthentication from 'expo-local-authentication';
import { useFonts } from 'expo-font';
import { PlayfairDisplay_700Bold } from "@expo-google-fonts/playfair-display";
import { DMSans_400Regular, DMSans_500Medium, DMSans_700Bold } from "@expo-google-fonts/dm-sans";
import { NotoNaskhArabic_400Regular, NotoNaskhArabic_700Bold } from "@expo-google-fonts/noto-naskh-arabic";
import * as Linking from 'expo-linking';
import { setupDeepLinkListeners } from '@/utils/deepLinking';
import { api } from '@/services/api';
import { widgetData } from '@/services/widgetData';
import { usePushNotifications } from '@/hooks/usePushNotifications';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { OfflineBanner } from '@/components/ui/OfflineBanner';
import { Icon } from '@/components/ui/Icon';
import { GradientButton } from '@/components/ui/GradientButton';
import { MiniPlayer } from '@/components/ui/MiniPlayer';
import { TTSMiniPlayer } from '@/components/ui/TTSMiniPlayer';
import { useStore } from '@/store';
import { colors } from '@/theme';
import { useIslamicTheme, useIsEidToday } from '@/hooks/useIslamicTheme';
import { initSentry, setSentryUser } from '@/config/sentry';

// Allow the OS to flip layouts to RTL for Arabic and other RTL languages.
// Most React Native flex layouts auto-mirror when this is enabled.
I18nManager.allowRTL(true);

// Cap font scaling at 1.5x to prevent extreme scaling that breaks layout.
// Users who need larger text get 50% larger while layouts remain intact.
if (Text.defaultProps == null) Text.defaultProps = {};
Text.defaultProps.maxFontSizeMultiplier = 1.5;
if (TextInput.defaultProps == null) TextInput.defaultProps = {};
(TextInput.defaultProps as Record<string, unknown>).maxFontSizeMultiplier = 1.5;

// Initialize Sentry crash reporting (no-op if package not installed or no DSN)
initSentry();

// Keep the splash screen visible until fonts are loaded
SplashScreen.preventAutoHideAsync();

const CLERK_KEY = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY!;

/**
 * Islamic calendar theme banner.
 * Shows Eid/Ramadan banners — respects user's islamicThemeEnabled setting.
 */
function IslamicThemeBanner() {
  const theme = useIslamicTheme();
  const { t } = useTranslation();
  if (!theme || !theme.bannerTextKey) return null;

  return (
    <View style={{
      backgroundColor: theme.accentColor,
      paddingVertical: 6,
      paddingHorizontal: 16,
      alignItems: 'center',
    }}>
      <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>
        {theme.bannerTextKey === 'themes.eidMubarak'
          ? t('themes.eidMubarak')
          : t('themes.ramadanKareem')}
      </Text>
    </View>
  );
}

/**
 * Eid celebration overlay — shows a brief celebration on first open per day.
 * Uses AsyncStorage to prevent repeat shows.
 */
function EidCelebrationOverlay() {
  const isEid = useIsEidToday();
  const [showCelebration, setShowCelebration] = useState(false);
  const { t } = useTranslation();

  useEffect(() => {
    if (!isEid) return;
    const checkAndShow = async () => {
      const today = new Date().toISOString().split('T')[0];
      const lastShown = await SecureStore.getItemAsync('lastEidCelebrationDate');
      if (lastShown !== today) {
        setShowCelebration(true);
        await SecureStore.setItemAsync('lastEidCelebrationDate', today);
        // Auto-dismiss after 3 seconds
        setTimeout(() => setShowCelebration(false), 3000);
      }
    };
    checkAndShow();
  }, [isEid]);

  if (!showCelebration) return null;

  return (
    <View style={{
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'rgba(0,0,0,0.7)',
      justifyContent: 'center',
      alignItems: 'center',
      zIndex: 10000,
    }}>
      <Text style={{ fontSize: 48 }}>🎉</Text>
      <Text style={{ color: colors.gold, fontSize: 28, fontWeight: '700', marginTop: 16 }}>
        {t('themes.eidMubarak')}
      </Text>
      <Text style={{ color: colors.text.secondary, fontSize: 16, marginTop: 8 }}>
        {t('themes.eidGreeting')}
      </Text>
    </View>
  );
}

// Query cache persistence deferred — requires @tanstack/react-query-persist-client package install
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutes
      retry: 3,
      retryDelay: (attemptIndex: number) => Math.min(1000 * 2 ** attemptIndex, 30000),
    },
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

  // Set Sentry user context when signed in
  useEffect(() => {
    if (isSignedIn && user?.id) {
      setSentryUser(user.id, user.username ?? undefined);
    }
  }, [isSignedIn, user?.id, user?.username]);

  useEffect(() => {
    if (!isLoaded) return;
    if (!navigationState?.key) return;

    const inAuthGroup = segments[0] === '(auth)';
    const inOnboarding = segments[0] === 'onboarding';

    if (!isSignedIn) {
      // Allow anonymous browsing of feed tabs — only redirect to auth if in onboarding
      if (inOnboarding) router.replace('/(auth)/sign-in');
      // If user is already in auth screens or tabs, let them stay
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
        // Only refetch queries that are stale, not all queries
        queryClient.invalidateQueries({ stale: true, refetchType: 'active' });

        // Sync widget data on foreground
        const storeState = useStore.getState();
        widgetData.updateUnreadCounts({
          unreadMessages: storeState.unreadMessages,
          unreadNotifications: storeState.unreadNotifications,
          userName: storeState.user?.displayName ?? '',
          avatarUrl: storeState.user?.avatarUrl ?? '',
        });
      }
    });
    return () => subscription.remove();
  }, [queryClient]);

  return null;
}

function BiometricLockOverlay() {
  const { t } = useTranslation();
  const biometricLockEnabled = useStore((s) => s.biometricLockEnabled);
  const [isLocked, setIsLocked] = useState(false);

  const authenticate = useCallback(async () => {
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: t('biometric.unlockPrompt'),
      fallbackLabel: t('common.cancel'),
    });
    setIsLocked(!result.success);
  }, [t]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', async (state: AppStateStatus) => {
      if (state === 'active' && biometricLockEnabled) {
        setIsLocked(true);
        const result = await LocalAuthentication.authenticateAsync({
          promptMessage: t('biometric.unlockPrompt'),
          fallbackLabel: t('common.cancel'),
        });
        setIsLocked(!result.success);
      }
    });
    return () => sub.remove();
  }, [biometricLockEnabled, t]);

  if (!isLocked) return null;

  return (
    <View style={lockStyles.overlay}>
      <Icon name="lock" size="xl" color={colors.emerald} />
      <Text style={lockStyles.text}>{t('common.unlock')}</Text>
      <View style={lockStyles.buttonWrap}>
        <GradientButton label={t('common.unlock')} onPress={authenticate} />
      </View>
    </View>
  );
}

const lockStyles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.dark.bg,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 9999,
  },
  text: {
    color: colors.text.secondary,
    fontSize: 16,
    marginTop: 16,
    marginBottom: 24,
  },
  buttonWrap: {
    marginTop: 8,
  },
});

/** Handles deep links (mizanly:// and https://mizanly.com URLs) */
function DeepLinkHandler() {
  useEffect(() => {
    const cleanup = setupDeepLinkListeners();
    return cleanup;
  }, []);
  return null;
}

/** Routes incoming share intents (text, images, videos from other apps) to the share-receive screen. */
function ShareIntentHandler() {
  const router = useRouter();

  useEffect(() => {
    const handleUrl = (event: { url: string }) => {
      const parsed = Linking.parse(event.url);
      const params = parsed.queryParams ?? {};
      if (params.sharedText || params.sharedImage || params.sharedVideo || params.sharedUrl) {
        router.push({
          pathname: '/(screens)/share-receive' as never,
          params: params as Record<string, string>,
        } as never);
      }
    };

    const subscription = Linking.addEventListener('url', handleUrl);

    // Check initial URL in case the app was cold-launched via a share intent
    Linking.getInitialURL().then((url) => {
      if (url) handleUrl({ url });
    });

    return () => subscription.remove();
  }, [router]);

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
              <IslamicThemeBanner />
              <AuthGuard />
              <AppStateHandler />
              <ShareIntentHandler />
              <DeepLinkHandler />
              <BiometricLockOverlay />
              <EidCelebrationOverlay />
              <Stack screenOptions={{ headerShown: false }}>
                <Stack.Screen name="(tabs)" />
                <Stack.Screen name="(auth)" options={{ presentation: 'modal' }} />
                <Stack.Screen name="onboarding" options={{ gestureEnabled: false }} />
                <Stack.Screen name="(screens)" />
              </Stack>
              <MiniPlayer />
              <TTSMiniPlayer />
            </QueryClientProvider>
          </ClerkLoaded>
        </ClerkProvider>
      </ErrorBoundary>
    </GestureHandlerRootView>
  );
}
