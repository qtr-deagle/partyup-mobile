import { DarkTheme, DefaultTheme, ThemeProvider } from 'expo-router/react-navigation';
import { Stack, useRootNavigationState, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';
import '../global.css';
import '@/lib/location-task';

import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  Inter_800ExtraBold,
  Inter_900Black,
  useFonts,
} from '@expo-google-fonts/inter';
import { Poppins_600SemiBold, Poppins_700Bold, Poppins_800ExtraBold, useFonts as usePoppinsFonts } from '@expo-google-fonts/poppins';
import ActiveSosBanner from '@/components/ActiveSosBanner';
import WarningModeBanner from '@/components/WarningModeBanner';
import InAppNotifier from '@/components/InAppNotifier';
import SosAlertOverlay from '@/components/SosAlertOverlay';
import SosEdgeTab from '@/components/SosEdgeTab';
import { AuthProvider, useAuth } from '@/hooks/auth-provider';
import { ThemePreferenceProvider, useColorScheme } from '@/hooks/use-color-scheme';
import { preloadSounds } from '@/lib/sounds';
import { useEffect } from 'react';
import { ActivityIndicator, LogBox, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

// Dev-only noise: expo-sqlite (our Supabase session storage) opens an Expo
// DevTools websocket to the dev server, and when the phone can't reach it
// (Metro stopped, laptop asleep, Wi-Fi changed) it gives up after ~5 min with
// "Error happened from the WebSocket connection: Exceeded max retries".
// Harmless (release builds never open it), so keep it off the LogBox overlay;
// it still prints in the Metro terminal.
LogBox.ignoreLogs(['Error happened from the WebSocket connection']);

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemePreferenceProvider>
          <AuthProvider>
            <RootLayoutContent />
          </AuthProvider>
        </ThemePreferenceProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

// Navigation theme backgrounds match the tab scenes, so the gutter around
// the floating tab bar blends into the screen instead of showing grey.
const APP_LIGHT_THEME = { ...DefaultTheme, colors: { ...DefaultTheme.colors, background: '#F8FAFC' } };
const APP_DARK_THEME = { ...DarkTheme, colors: { ...DarkTheme.colors, background: '#0B1220' } };

function RootLayoutContent() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const { loading } = useAuth();
  const [interLoaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    Inter_800ExtraBold,
    Inter_900Black,
  });
  const [poppinsLoaded] = usePoppinsFonts({
    Poppins_600SemiBold,
    Poppins_700Bold,
    Poppins_800ExtraBold,
  });

  useEffect(() => {
    preloadSounds();
  }, []);

  if (loading || !interLoaded || !poppinsLoaded) {
    return (
      <View className="flex-1 items-center justify-center bg-[#0B1220]">
        <ActivityIndicator size="large" color="#3B82F6" />
      </View>
    );
  }

  return (
    <ThemeProvider value={isDark ? APP_DARK_THEME : APP_LIGHT_THEME}>
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false, header: () => null, title: '' }} />
        <Stack.Screen name="(auth)" options={{ headerShown: false }} />
        <Stack.Screen name="vehicles" options={{ presentation: 'fullScreenModal', headerShown: false }} />
        <Stack.Screen name="verify-id" options={{ presentation: 'fullScreenModal', headerShown: false }} />
        <Stack.Screen name="verification-required" options={{ headerShown: false, gestureEnabled: false }} />
        <Stack.Screen name="account-suspended" options={{ headerShown: false, gestureEnabled: false }} />
        <Stack.Screen name="verify-vehicle" options={{ presentation: 'fullScreenModal', headerShown: false }} />
        <Stack.Screen name="modal" options={{ presentation: 'modal', headerShown: false }} />
        <Stack.Screen name="friends" options={{ headerShown: false }} />
        <Stack.Screen name="trusted-circle" options={{ headerShown: false }} />
        <Stack.Screen name="blocked-users" options={{ headerShown: false }} />
        <Stack.Screen name="guild" options={{ headerShown: false }} />
        <Stack.Screen name="guild/[id]" options={{ headerShown: false }} />
        <Stack.Screen name="guild/chat" options={{ headerShown: false }} />
        <Stack.Screen name="rewards" options={{ headerShown: false }} />
        <Stack.Screen name="support/index" options={{ headerShown: false }} />
        <Stack.Screen name="support/new" options={{ headerShown: false }} />
        <Stack.Screen name="support/[id]" options={{ headerShown: false }} />
        <Stack.Screen name="edit-profile" options={{ headerShown: false }} />
        <Stack.Screen name="id-review" options={{ headerShown: false }} />
        <Stack.Screen name="vehicle-review" options={{ headerShown: false }} />
        <Stack.Screen name="profile/[id]" options={{ headerShown: false }} />
        <Stack.Screen name="trip/create" options={{ headerShown: false }} />
        <Stack.Screen name="trip/create-tour" options={{ headerShown: false }} />
        <Stack.Screen name="trip/[id]" options={{ headerShown: false }} />
        <Stack.Screen name="trip/chat/[id]" options={{ headerShown: false }} />
        <Stack.Screen name="trip/join/[code]" options={{ headerShown: false }} />
      </Stack>
      <VerificationGate />
      <InAppNotifier />
      <SosEdgeTab />
      <WarningModeBanner />
      <ActiveSosBanner />
      <SosAlertOverlay />
      <StatusBar style={isDark ? 'light' : 'dark'} />
    </ThemeProvider>
  );
}

// Screens an unverified traveler may still reach: signing in/out and the
// verification flow itself.
const VERIFICATION_EXEMPT_SEGMENTS = new Set(['(auth)', 'verification-required', 'verify-id']);

// ID verification and a Bulacan residence are required to use the app. Staff/admin accounts are
// exempt; travelers without an approved ID are held on the
// verification-required screen until staff approve them.
function VerificationGate() {
  const router = useRouter();
  const segments = useSegments();
  const navigationState = useRootNavigationState();
  const { session, profile, profileReady } = useAuth();

  const currentSegment = segments[0] ?? '';
  // PartyUp is for Bulacan residents only, so a missing municipality (accounts
  // from before that rule) holds the traveler here too.
  const needsVerification =
    Boolean(session) &&
    profile !== null &&
    profile.role === 'traveler' &&
    (profile.verification_status !== 'approved' || !profile.city);
  // Staff suspend accounts from the website by clearing is_active. Admins
  // can't be suspended, so only travelers and Guild Leaders are held here.
  const isSuspended = Boolean(session) && profile !== null && !profile.is_active && profile.role !== 'admin';

  useEffect(() => {
    if (!navigationState?.key || !profileReady) {
      return;
    }

    if (!session) {
      if (currentSegment === 'verification-required' || currentSegment === 'account-suspended') {
        router.replace('/(auth)/sign-in');
      }
      return;
    }

    if (isSuspended) {
      if (currentSegment !== 'account-suspended') {
        router.replace('/account-suspended');
      }
      return;
    }
    if (currentSegment === 'account-suspended') {
      router.replace(needsVerification ? '/verification-required' : '/(tabs)');
      return;
    }

    if (needsVerification && !VERIFICATION_EXEMPT_SEGMENTS.has(currentSegment)) {
      router.replace('/verification-required');
    } else if (!needsVerification && currentSegment === 'verification-required') {
      router.replace('/(tabs)');
    }
  }, [currentSegment, isSuspended, navigationState?.key, needsVerification, profileReady, router, session]);

  return null;
}
