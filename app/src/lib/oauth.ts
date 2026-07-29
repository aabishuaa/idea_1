import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';

import { supabase } from './supabase';

export type OAuthProvider = 'google' | 'apple';

export const PROVIDER_LABEL: Record<OAuthProvider, string> = {
  google: 'Google',
  apple: 'Apple',
};

export type OAuthResult =
  | { ok: true }
  | { ok: false; cancelled: true }
  | { ok: false; cancelled?: false; message: string; needsSetup: boolean };

/**
 * Supabase says this when a provider exists in the client but has not been
 * switched on in the dashboard. Worth detecting precisely: it is a
 * configuration state, not a user-facing failure, and it is exactly the state
 * this project is in until the keys are added.
 */
function looksUnconfigured(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes('provider is not enabled') ||
    m.includes('unsupported provider') ||
    m.includes('validation_failed')
  );
}

/**
 * Sign in with Google or Apple.
 *
 * Uses Supabase's OAuth via the system browser rather than a native SDK: the
 * browser flow needs no native module, so it runs in Expo Go, and it is one code
 * path for both providers on both platforms. A native Google/Apple SDK would
 * mean a custom dev build, which is the thing we have deliberately avoided so
 * the app can be demonstrated from a QR code.
 *
 * REQUIRES DASHBOARD CONFIGURATION. Nothing here works until the provider is
 * enabled in Supabase → Authentication → Providers, with `myb://auth/callback`
 * added to the allowed redirect URLs. Apple additionally requires a paid Apple
 * Developer account to issue the Services ID and key. Until then this returns
 * `needsSetup: true` and the caller says so plainly rather than showing a raw
 * error — see SETUP.md.
 */
export async function signInWithProvider(provider: OAuthProvider): Promise<OAuthResult> {
  // Same scheme as app.json, so the browser can hand control back to the app.
  const redirectTo = Linking.createURL('/auth/callback');

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo,
      // We open the browser ourselves so we can await the redirect back; letting
      // the SDK navigate would leave us with no way to know it finished.
      skipBrowserRedirect: true,
    },
  });

  if (error) {
    return {
      ok: false,
      message: error.message,
      needsSetup: looksUnconfigured(error.message),
    };
  }
  if (!data?.url) {
    return {
      ok: false,
      message: 'Supabase did not return a sign-in URL.',
      needsSetup: true,
    };
  }

  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo, {
    // Keeps the flow inside the app's own browser session on iOS.
    preferEphemeralSession: Platform.OS === 'ios',
  });

  if (result.type === 'cancel' || result.type === 'dismiss') {
    return { ok: false, cancelled: true };
  }
  if (result.type !== 'success') {
    return { ok: false, message: 'Sign-in did not complete.', needsSetup: false };
  }

  return completeOAuth(result.url);
}

/**
 * Turn the redirect URL into a session.
 *
 * Supabase can hand back either an implicit-flow fragment (#access_token=…) or
 * a PKCE `?code=…`, depending on how the project is configured. Both are
 * handled because getting this wrong presents as a silent no-op: the browser
 * closes, nothing happens, and the user assumes the button is broken.
 */
export async function completeOAuth(url: string): Promise<OAuthResult> {
  const parsed = Linking.parse(url);
  const params = (parsed.queryParams ?? {}) as Record<string, string | undefined>;

  // Fragment params are not in queryParams — pull them out by hand.
  const fragment = url.includes('#') ? url.slice(url.indexOf('#') + 1) : '';
  const fragmentParams = new URLSearchParams(fragment);

  const accessToken = fragmentParams.get('access_token') ?? params.access_token;
  const refreshToken = fragmentParams.get('refresh_token') ?? params.refresh_token;
  const code = params.code ?? fragmentParams.get('code');
  const errorDescription =
    params.error_description ?? fragmentParams.get('error_description') ?? undefined;

  if (errorDescription) {
    return { ok: false, message: errorDescription, needsSetup: false };
  }

  if (accessToken && refreshToken) {
    const { error } = await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });
    return error
      ? { ok: false, message: error.message, needsSetup: false }
      : { ok: true };
  }

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    return error
      ? { ok: false, message: error.message, needsSetup: false }
      : { ok: true };
  }

  return {
    ok: false,
    message: 'The sign-in link came back without a session.',
    needsSetup: false,
  };
}

/**
 * Apple requires a paid Apple Developer account to configure, so on Android
 * — where nobody expects an Apple button anyway — we do not offer it.
 */
export function providersFor(): OAuthProvider[] {
  return Platform.OS === 'ios' ? ['google', 'apple'] : ['google'];
}
