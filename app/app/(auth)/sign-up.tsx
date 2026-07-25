import { router } from 'expo-router';
import React, { useState } from 'react';
import { Pressable, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Screen } from '@/components/ui/Screen';
import { AppText } from '@/components/ui/Text';
import { supabase } from '@/lib/supabase';
import { space } from '@/theme/tokens';

export default function SignUpScreen() {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const signUp = async () => {
    setError(null);
    setBusy(true);
    const { data, error: authError } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { data: { full_name: fullName.trim() } },
    });
    setBusy(false);
    if (authError) {
      setError(authError.message);
      return;
    }
    // With email confirmation disabled (SETUP.md §1.3) a session exists now;
    // otherwise tell the user to confirm first.
    if (data.session) {
      router.replace('/(tabs)');
    } else {
      setNotice('Check your inbox to confirm your email, then sign in.');
    }
  };

  return (
    <Screen safeTop>
      <View style={{ gap: space.s6, paddingTop: space.s10 }}>
        <View style={{ gap: space.s2 }}>
          <AppText variant="h1">Create your account</AppText>
          <AppText variant="body" color="textMuted">
            One account to find work and get work done.
          </AppText>
        </View>

        <View style={{ gap: space.s4 }}>
          <Input
            label="Full name"
            placeholder="John Brown"
            autoComplete="name"
            value={fullName}
            onChangeText={setFullName}
          />
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
            placeholder="At least 8 characters"
            secureTextEntry
            autoComplete="new-password"
            value={password}
            onChangeText={setPassword}
            error={error ?? undefined}
            success={notice ?? undefined}
          />
        </View>

        <Button
          title="Get started"
          fullWidth
          onPress={signUp}
          loading={busy}
          disabled={!fullName.trim() || !email.trim() || password.length < 8}
        />

        <View style={{ flexDirection: 'row', justifyContent: 'center', gap: space.s1 }}>
          <AppText variant="bodySm" color="textMuted">
            Already have an account?
          </AppText>
          <Pressable accessibilityRole="link" onPress={() => router.replace('/(auth)/sign-in')}>
            <AppText variant="bodySm" color="accent">
              Sign in
            </AppText>
          </Pressable>
        </View>
      </View>
    </Screen>
  );
}
