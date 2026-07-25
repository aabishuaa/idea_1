import { router } from 'expo-router';
import React, { useState } from 'react';
import { Pressable, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Screen } from '@/components/ui/Screen';
import { AppText } from '@/components/ui/Text';
import { supabase } from '@/lib/supabase';
import { space } from '@/theme/tokens';

/** Sign in (design 03): "Welcome back". */
export default function SignInScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const signIn = async () => {
    setError(null);
    setBusy(true);
    const { error: authError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    setBusy(false);
    if (authError) {
      setError(
        authError.message === 'Invalid login credentials'
          ? 'Email or password incorrect. Try again.'
          : authError.message,
      );
      return;
    }
    router.replace('/(tabs)');
  };

  return (
    <Screen safeTop>
      <View style={{ gap: space.s6, paddingTop: space.s10 }}>
        <View style={{ gap: space.s2 }}>
          <AppText variant="h1">Welcome back</AppText>
          <AppText variant="body" color="textMuted">
            Sign in to keep your business moving.
          </AppText>
        </View>

        <View style={{ gap: space.s4 }}>
          <Input
            label="Email"
            placeholder="you@example.com"
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
          />
          <Input
            label="Password"
            placeholder="••••••••"
            secureTextEntry
            autoComplete="password"
            value={password}
            onChangeText={setPassword}
            error={error ?? undefined}
          />
        </View>

        <Button
          title="Sign in"
          fullWidth
          onPress={signIn}
          loading={busy}
          disabled={!email.trim() || !password}
        />

        <View style={{ flexDirection: 'row', justifyContent: 'center', gap: space.s1 }}>
          <AppText variant="bodySm" color="textMuted">
            New to myB?
          </AppText>
          <Pressable accessibilityRole="link" onPress={() => router.replace('/(auth)/sign-up')}>
            <AppText variant="bodySm" color="accent">
              Create an account
            </AppText>
          </Pressable>
        </View>
      </View>
    </Screen>
  );
}
