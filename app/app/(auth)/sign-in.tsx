import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import React, { useState } from 'react';
import { Pressable, View } from 'react-native';

import { BrandLockup } from '@/components/BrandMark';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Screen } from '@/components/ui/Screen';
import { AppText } from '@/components/ui/Text';
import { Stagger, successTap } from '@/components/ui/animated';
import { supabase } from '@/lib/supabase';
import { useTheme } from '@/theme/ThemeContext';
import { space } from '@/theme/tokens';

/** Sign in (design 03): "Welcome back". */
export default function SignInScreen() {
  const { colors } = useTheme();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const signIn = async () => {
    setError(null);
    setNotice(null);
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
    successTap();
    router.replace('/(tabs)');
  };

  const forgotPassword = async () => {
    setError(null);
    if (!email.trim()) {
      setError('Enter your email above first, then tap "Forgot password?" again.');
      return;
    }
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim());
    if (resetError) setError(resetError.message);
    else setNotice('Password reset email sent — check your inbox.');
  };

  return (
    <Screen safeTop>
      <LinearGradient
        colors={[colors.accentSoft, 'transparent']}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 320 }}
        pointerEvents="none"
      />
      <View style={{ gap: space.s5, paddingTop: space.s8 }}>
        <Stagger interval={80} gap={space.s5}>
          {/* Brand mark */}
          <View style={{ alignItems: 'center', gap: space.s2 }}>
            <BrandLockup variant="h1" markSize={52} />
            <AppText variant="overline" color="textMuted">
              Connect. Build. Grow.
            </AppText>
          </View>

          <View style={{ gap: space.s2 }}>
            <AppText variant="h1">Welcome back</AppText>
            <AppText variant="body" color="textMuted">
              Sign in to keep your business moving.
            </AppText>
          </View>

          <View style={{ gap: space.s4 }}>
            <Input
              label="Email"
              icon="mail-outline"
              placeholder="you@example.com"
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              value={email}
              onChangeText={setEmail}
            />
            <View style={{ gap: space.s2 }}>
              <Input
                label="Password"
                icon="lock-closed-outline"
                placeholder="••••••••"
                secureTextEntry
                autoComplete="password"
                value={password}
                onChangeText={setPassword}
                error={error ?? undefined}
                success={notice ?? undefined}
              />
              <Pressable
                accessibilityRole="link"
                onPress={() => void forgotPassword()}
                style={{ alignSelf: 'flex-end' }}
                hitSlop={8}
              >
                <AppText variant="bodySm" color="accent">
                  Forgot password?
                </AppText>
              </Pressable>
            </View>
          </View>

          <Button
            title="Sign in"
            fullWidth
            onPress={() => void signIn()}
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
        </Stagger>
      </View>
    </Screen>
  );
}
