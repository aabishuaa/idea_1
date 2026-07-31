import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import React, { useState } from 'react';
import { Pressable, View } from 'react-native';

import { PasswordMeter } from '@/components/PasswordMeter';
import { BrandLockup } from '@/components/BrandMark';
import { SocialSignIn } from '@/components/SocialSignIn';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Screen } from '@/components/ui/Screen';
import { AppText } from '@/components/ui/Text';
import { Stagger, successTap } from '@/components/ui/animated';
import { isEmailShaped, passwordChecks, passwordStrength } from '@/lib/password';
import { supabase } from '@/lib/supabase';
import { useTheme } from '@/theme/ThemeContext';
import { radius, space } from '@/theme/tokens';

export default function SignUpScreen() {
  const { colors } = useTheme();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const checks = passwordChecks(password);
  const strength = passwordStrength(password);
  const emailOk = email.trim().length === 0 || isEmailShaped(email);
  const ready =
    fullName.trim().length > 1 &&
    isEmailShaped(email) &&
    strength.score >= 3 &&
    password === confirm;

  const signUp = async () => {
    setError(null);

    // Checked here as well as on the button so the reason is always sayable.
    if (!isEmailShaped(email)) {
      setError('That email address does not look right.');
      return;
    }
    if (strength.score < 3) {
      setError('Please choose a stronger password.');
      return;
    }
    if (password !== confirm) {
      setError('The two passwords do not match.');
      return;
    }

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
    // With email confirmation disabled (SETUP.md §1.3) a session exists now —
    // continue into role selection; otherwise ask the user to confirm first.
    if (data.session) {
      successTap();
      router.replace('/welcome');
    } else {
      setNotice('Check your inbox to confirm your email, then sign in.');
    }
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
          <View style={{ alignItems: 'center', gap: space.s3 }}>
            <BrandLockup variant="h1" markSize={52} />
            <AppText variant="overline" color="textMuted">
              Connect. Build. Grow.
            </AppText>
          </View>

          <View style={{ gap: space.s2 }}>
            <AppText variant="h1">Create your account</AppText>
            <AppText variant="body" color="textMuted">
              One account to find work and get work done.
            </AppText>
          </View>

          <View style={{ gap: space.s4 }}>
            <Input
              label="Full name"
              icon="person-outline"
              placeholder="John Brown"
              autoComplete="name"
              value={fullName}
              onChangeText={setFullName}
            />
            <Input
              label="Email"
              icon="mail-outline"
              placeholder="you@example.com"
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              value={email}
              onChangeText={setEmail}
              error={emailOk ? undefined : 'That does not look like an email address'}
            />
            <Input
              label="Password"
              icon="lock-closed-outline"
              placeholder="At least 8 characters"
              secureTextEntry
              autoComplete="new-password"
              value={password}
              onChangeText={setPassword}
            />
            {password.length > 0 && <PasswordMeter password={password} checks={checks} />}
            <Input
              label="Confirm password"
              icon="lock-closed-outline"
              placeholder="Type it again"
              secureTextEntry
              autoComplete="new-password"
              value={confirm}
              onChangeText={setConfirm}
              error={
                confirm.length > 0 && confirm !== password
                  ? 'Passwords do not match'
                  : undefined
              }
              success={
                confirm.length > 0 && confirm === password && strength.score >= 3
                  ? 'Looks good'
                  : undefined
              }
            />
          </View>

          {/* What the account gets you — the reason to finish the form. */}
          <View
            style={{
              gap: space.s2,
              padding: space.s4,
              borderRadius: radius.lg,
              backgroundColor: colors.accentSoft,
            }}
          >
            {[
              'Book trusted, rated pros in your parish',
              'Build a reputation you own and take with you',
              'Free guidance to formalize when you are ready',
            ].map((line) => (
              <View
                key={line}
                style={{ flexDirection: 'row', alignItems: 'center', gap: space.s2 }}
              >
                <Ionicons name="checkmark-circle" size={15} color={colors.accent} />
                <AppText variant="caption" color="accent" style={{ flex: 1 }}>
                  {line}
                </AppText>
              </View>
            ))}
          </View>

          {error && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.s2 }}>
              <Ionicons name="alert-circle" size={16} color={colors.error} />
              <AppText variant="bodySm" color="error" style={{ flex: 1 }}>
                {error}
              </AppText>
            </View>
          )}
          {notice && (
            <AppText variant="bodySm" color="success">
              {notice}
            </AppText>
          )}

          <Button
            title="Get started"
            icon="rocket-outline"
            fullWidth
            onPress={() => void signUp()}
            loading={busy}
            disabled={!ready}
          />

          {/* Same flow as sign-in: for Google and Apple there is no meaningful
              difference between signing up and signing in, and presenting them
              as two different things is how people end up with two accounts. */}
          <SocialSignIn onSignedIn={() => router.replace('/(tabs)')} />

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
        </Stagger>
      </View>
    </Screen>
  );
}
