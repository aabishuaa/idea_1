import {
  PlusJakartaSans_400Regular,
  PlusJakartaSans_500Medium,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
  PlusJakartaSans_800ExtraBold,
  useFonts,
} from '@expo-google-fonts/plus-jakarta-sans';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AppDrawer } from '@/components/AppDrawer';
import { AuthProvider } from '@/providers/AuthProvider';
import { DrawerProvider } from '@/providers/DrawerProvider';
import { ThemeProvider, useTheme } from '@/theme/ThemeContext';

void SplashScreen.preventAutoHideAsync();

function RootStack() {
  const { colors, isDark } = useTheme();
  return (
    <>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.bg },
          headerTintColor: colors.text,
          headerTitleStyle: { fontFamily: 'PlusJakartaSans_600SemiBold' },
          headerShadowVisible: false,
          contentStyle: { backgroundColor: colors.bg },
        }}
      >
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="(auth)" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="welcome" options={{ headerShown: false, gestureEnabled: false }} />
        <Stack.Screen name="search" options={{ title: 'Find a pro' }} />
        <Stack.Screen name="dashboard" options={{ title: 'Dashboard' }} />
        <Stack.Screen name="favorites" options={{ title: 'Favourites' }} />
        <Stack.Screen name="notifications" options={{ title: 'Notifications' }} />
        <Stack.Screen name="settings" options={{ title: 'Settings' }} />
        <Stack.Screen name="worker/[id]" options={{ title: 'Profile' }} />
        <Stack.Screen name="job/new" options={{ title: 'Request a job' }} />
        <Stack.Screen name="job/[id]" options={{ title: 'Booking' }} />
        <Stack.Screen name="thread/[id]" options={{ title: 'Chat' }} />
        <Stack.Screen name="earnings" options={{ title: 'Earnings' }} />
        <Stack.Screen name="worker-setup" options={{ title: 'Your worker profile' }} />
        <Stack.Screen name="verification/index" options={{ title: 'Verification' }} />
        <Stack.Screen name="verification/consent" options={{ title: 'Consent' }} />
        <Stack.Screen name="verification/id-upload" options={{ title: 'Your ID' }} />
        <Stack.Screen name="verification/liveness" options={{ title: 'Liveness check' }} />
        <Stack.Screen name="verification/result" options={{ title: 'Result' }} />
        <Stack.Screen name="formalize/index" options={{ title: 'Formalize' }} />
        <Stack.Screen name="formalize/questionnaire" options={{ title: 'Readiness check' }} />
        <Stack.Screen name="formalize/checklist" options={{ title: 'Your checklist' }} />
        <Stack.Screen name="formalize/bizbot" options={{ title: 'BizBot' }} />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    PlusJakartaSans_400Regular,
    PlusJakartaSans_500Medium,
    PlusJakartaSans_600SemiBold,
    PlusJakartaSans_700Bold,
    PlusJakartaSans_800ExtraBold,
  });

  useEffect(() => {
    if (fontsLoaded) void SplashScreen.hideAsync();
  }, [fontsLoaded]);

  if (!fontsLoaded) return null;

  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <AuthProvider>
          <DrawerProvider>
            <RootStack />
            {/* Global sidebar — reachable from every screen's ☰ button. */}
            <AppDrawer />
          </DrawerProvider>
        </AuthProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
