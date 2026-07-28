import { Redirect } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { View } from 'react-native';

import { RocketLaunch } from '@/components/BrandMark';
import { AppText } from '@/components/ui/Text';
import { FadeSlideIn } from '@/components/ui/animated';
import { useAuth } from '@/providers/AuthProvider';
import { useTheme } from '@/theme/ThemeContext';
import { space } from '@/theme/tokens';

/**
 * Splash: the rocket launches, the wordmark lands, then we route.
 *
 * The hold is long enough to see the launch through (~1.9s) but the redirect
 * still waits on the session restore, so a slow network never truncates it and
 * a fast one never makes it feel like a stutter.
 */
export default function SplashScreen() {
  const { session, loading } = useAuth();
  const { colors } = useTheme();
  const [minDelayDone, setMinDelayDone] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setMinDelayDone(true), 1900);
    return () => clearTimeout(timer);
  }, []);

  if (!loading && minDelayDone) {
    return <Redirect href={session ? '/(tabs)' : '/(auth)/onboarding'} />;
  }

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: colors.bg,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <RocketLaunch />
      <View style={{ position: 'absolute', bottom: space.s16 }}>
        <FadeSlideIn delay={1400} duration={500} from="none">
          <AppText variant="overline" color="textMuted">
            All you need. One place.
          </AppText>
        </FadeSlideIn>
      </View>
    </View>
  );
}
