import { Redirect, Stack } from 'expo-router';
import React from 'react';

import { useAuth } from '@/providers/AuthProvider';

export default function AuthLayout() {
  const { session, loading } = useAuth();
  if (!loading && session) return <Redirect href="/(tabs)" />;

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="onboarding" />
      <Stack.Screen name="sign-in" />
      <Stack.Screen name="sign-up" />
    </Stack>
  );
}
