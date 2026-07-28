import Constants from 'expo-constants';
import * as Device from 'expo-device';
import { useEffect } from 'react';
import { Platform } from 'react-native';

import { isExpoGo } from '@/lib/runtime';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/AuthProvider';

/**
 * Registers the device for Expo push notifications (FR-MSG-2) and stores the
 * token in push_tokens. Skips gracefully in Expo Go (remote push needs a dev
 * build since SDK 53), without an EAS project id (SETUP.md §3.3), or on
 * simulators.
 */
// The effect re-runs on every session change and the hook is mounted by the
// tabs layout, so an unconditional log printed the same line four times on
// boot. Say each reason once per app run.
let noticed = false;

export function usePushRegistration(): void {
  const { session } = useAuth();

  useEffect(() => {
    if (!session || !Device.isDevice) return;

    if (isExpoGo) {
      if (!noticed) {
        noticed = true;
        console.log('[myB] Push disabled in Expo Go — remote notifications need a dev build.');
      }
      return;
    }

    const projectId: string | undefined =
      Constants.expoConfig?.extra?.eas?.projectId;
    if (!projectId || projectId.includes('REPLACE_ME')) {
      if (!noticed) {
        noticed = true;
        console.log('[myB] Push disabled: run `eas init` to set an EAS projectId.');
      }
      return;
    }

    let cancelled = false;

    (async () => {
      // Imported lazily so Expo Go never loads the module (it warns loudly
      // at import time since SDK 53 removed remote push from Go).
      const Notifications = await import('expo-notifications');
      const { status: existing } = await Notifications.getPermissionsAsync();
      let status = existing;
      if (existing !== 'granted') {
        const request = await Notifications.requestPermissionsAsync();
        status = request.status;
      }
      if (status !== 'granted' || cancelled) return;

      try {
        const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
        await supabase.from('push_tokens').upsert({
          user_id: session.user.id,
          token,
          platform: Platform.OS === 'ios' ? 'ios' : 'android',
          updated_at: new Date().toISOString(),
        });
      } catch (error) {
        console.warn('[myB] Push registration failed:', error);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [session]);
}
