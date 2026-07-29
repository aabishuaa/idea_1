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
 * Splash: the rocket launches, the logo lands, then we route.
 *
 * The hold covers the whole sequence plus a beat to actually READ the name.
 * The launch runs ~2.8s (ignition, a held beat, liftoff, the logo settling),
 * and the hold gives it another ~2.6s to land before we route away — cutting
 * at the end of the animation meant the brand was gone the instant it
 * arrived. The redirect still waits on the session restore as well, so a slow
 * network never truncates the sequence.
 */
/** Long enough for the launch to finish and the wordmark to be read. */
const SPLASH_HOLD_MS = 5400;
export default function SplashScreen() {
  const { session, loading } = useAuth();
  const { colors } = useTheme();
  const [minDelayDone, setMinDelayDone] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setMinDelayDone(true), SPLASH_HOLD_MS);
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
        {/* Arrives after the logo has settled, so the two do not compete. */}
        <FadeSlideIn delay={3100} duration={700} from="none">
          <AppText variant="overline" color="textMuted">
            All you need. One place.
          </AppText>
        </FadeSlideIn>
      </View>
    </View>
  );
}
