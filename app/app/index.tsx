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
 * The hold covers the whole sequence plus a beat to actually READ the name —
 * the launch alone runs ~1.5s, and cutting away the moment it finished meant
 * the brand flashed past before anyone could take it in. The redirect still
 * waits on the session restore too, so a slow network never truncates it.
 */
export default function SplashScreen() {
  const { session, loading } = useAuth();
  const { colors } = useTheme();
  const [minDelayDone, setMinDelayDone] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setMinDelayDone(true), 3200);
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
        <FadeSlideIn delay={1900} duration={600} from="none">
          <AppText variant="overline" color="textMuted">
            All you need. One place.
          </AppText>
        </FadeSlideIn>
      </View>
    </View>
  );
}
