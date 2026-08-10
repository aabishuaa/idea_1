import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { Alert, Pressable, View } from 'react-native';

import { AppText } from './ui/Text';
import { lightTap } from './ui/animated';
import {
  PROVIDER_LABEL,
  providersFor,
  signInWithProvider,
  type OAuthProvider,
} from '@/lib/oauth';
import { useTheme } from '@/theme/ThemeContext';
import { radius, space } from '@/theme/tokens';

const ICON: Record<OAuthProvider, keyof typeof Ionicons.glyphMap> = {
  google: 'logo-google',
  apple: 'logo-apple',
};

/**
 * "Continue with Google / Apple".
 *
 * One fewer password to invent is a real accessibility win for the users this is
 * built for — a forgotten password on a shared phone is a lost account, and a
 * lost account takes the worker's reputation with it.
 *
 * The buttons are always shown, and an unconfigured provider says so in plain
 * language instead of surfacing a raw API error. Hiding them until the keys
 * exist would mean nobody notices the setup was never finished.
 */
export function SocialSignIn({ onSignedIn }: { onSignedIn: () => void }) {
  const { colors } = useTheme();
  const [busy, setBusy] = useState<OAuthProvider | null>(null);

  const start = async (provider: OAuthProvider) => {
    lightTap();
    setBusy(provider);
    const result = await signInWithProvider(provider);
    setBusy(null);

    if (result.ok) {
      onSignedIn();
      return;
    }
    if (result.cancelled) return;

    Alert.alert(
      result.needsSetup
        ? `${PROVIDER_LABEL[provider]} sign-in isn’t switched on yet`
        : `Could not sign in with ${PROVIDER_LABEL[provider]}`,
      result.needsSetup
        ? `${PROVIDER_LABEL[provider]} needs to be enabled for this myB project before it will work. Use your email and password for now.`
        : result.message,
    );
  };

  return (
    <View style={{ gap: space.s3 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.s3 }}>
        <View style={{ flex: 1, height: 1, backgroundColor: colors.border }} />
        <AppText variant="caption" color="textMuted">
          or continue with
        </AppText>
        <View style={{ flex: 1, height: 1, backgroundColor: colors.border }} />
      </View>

      <View style={{ flexDirection: 'row', gap: space.s3 }}>
        {providersFor().map((provider) => (
          <Pressable
            key={provider}
            accessibilityRole="button"
            accessibilityLabel={`Continue with ${PROVIDER_LABEL[provider]}`}
            accessibilityState={{ busy: busy === provider, disabled: busy != null }}
            disabled={busy != null}
            onPress={() => void start(provider)}
            style={({ pressed }) => ({
              flex: 1,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: space.s2,
              height: 50,
              borderRadius: radius.md,
              borderWidth: 1,
              borderColor: colors.border,
              backgroundColor: colors.surface,
              opacity: pressed || busy != null ? 0.7 : 1,
            })}
          >
            <Ionicons name={ICON[provider]} size={18} color={colors.text} />
            <AppText variant="label">
              {busy === provider ? 'Opening…' : PROVIDER_LABEL[provider]}
            </AppText>
          </Pressable>
        ))}
      </View>
    </View>
  );
}
