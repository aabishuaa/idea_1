import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { useEffect } from 'react';
import { Platform } from 'react-native';

import { supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/AuthProvider';

/**
 * Registers the device for Expo push notifications (FR-MSG-2) and stores the
 * token in push_tokens. Skips gracefully when running without an EAS project
 * id (SETUP.md §3.3) or on simulators.
 */
export function usePushRegistration(): void {
  const { session } = useAuth();

  useEffect(() => {
    if (!session || !Device.isDevice) return;

    const projectId: string | undefined =
      Constants.expoConfig?.extra?.eas?.projectId;
    if (!projectId || projectId.includes('REPLACE_ME')) {
      console.log('[myB] Push disabled: run `eas init` to set an EAS projectId.');
      return;
    }

    let cancelled = false;

    (async () => {
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
