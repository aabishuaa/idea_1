import { Redirect } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Image, View } from 'react-native';

import { AppText } from '@/components/ui/Text';
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
      <Image
        source={require('../assets/splash-icon.png')}
        style={{ width: 96, height: 96 }}
        accessibilityLabel="myB logo"
      />
      <AppText variant="display">myB</AppText>
      <AppText variant="body" color="textMuted">
        Mind yuh business.
      </AppText>
      <View style={{ position: 'absolute', bottom: space.s16 }}>
        <AppText variant="overline" color="textMuted">
          All you need. One place.
        </AppText>
      </View>
    </View>
  );
}
