import { Redirect } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Image, View } from 'react-native';

import { AppText } from '@/components/ui/Text';
import { FadeSlideIn } from '@/components/ui/animated';
import { useAuth } from '@/providers/AuthProvider';
import { useTheme } from '@/theme/ThemeContext';
import { space } from '@/theme/tokens';

/**
 * Splash (design 01): m mark · myB · "Mind yuh business." · overline.
 * Shows briefly while the session restores, then routes.
 */
export default function SplashScreen() {
  const { session, loading } = useAuth();
  const { colors } = useTheme();
  const [minDelayDone, setMinDelayDone] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setMinDelayDone(true), 900);
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
        gap: space.s3,
      }}
    >
      <FadeSlideIn from="bottom" distance={20} duration={500} style={{ alignItems: 'center', gap: space.s3 }}>
        <Image
          source={require('../assets/splash-icon.png')}
          style={{ width: 96, height: 96 }}
          accessibilityLabel="myB logo"
        />
        <AppText variant="display">myB</AppText>
        <AppText variant="body" color="textMuted">
          Mind yuh business.
        </AppText>
      </FadeSlideIn>
      <View style={{ position: 'absolute', bottom: space.s16 }}>
        <FadeSlideIn delay={400} duration={500} from="none">
          <AppText variant="overline" color="textMuted">
            All you need. One place.
          </AppText>
        </FadeSlideIn>
      </View>
    </View>
  );
}
