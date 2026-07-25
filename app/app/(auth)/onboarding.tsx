import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React from 'react';
import { Pressable, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Screen } from '@/components/ui/Screen';
import { AppText } from '@/components/ui/Text';
import { useTheme } from '@/theme/ThemeContext';
import { radius, space } from '@/theme/tokens';

const TRADE_TILES: { icon: keyof typeof Ionicons.glyphMap; label: string }[] = [
  { icon: 'water', label: 'Plumbing' },
  { icon: 'flash', label: 'Electrical' },
  { icon: 'hammer', label: 'Carpentry' },
  { icon: 'color-palette', label: 'Painting' },
];

/** Onboarding (design 02): "All you need. One place." */
export default function OnboardingScreen() {
  const { colors } = useTheme();

  return (
    <Screen safeTop scroll={false} style={{ justifyContent: 'space-between' }}>
      <View style={{ flex: 1, justifyContent: 'center', gap: space.s6 }}>
        <View
          style={{
            flexDirection: 'row',
            flexWrap: 'wrap',
            gap: space.s3,
            justifyContent: 'center',
          }}
        >
          {TRADE_TILES.map(({ icon, label }) => (
            <View
              key={label}
              accessibilityLabel={label}
              style={{
                width: 64,
                height: 64,
                borderRadius: radius.lg,
                backgroundColor: colors.surface,
                borderWidth: 1,
                borderColor: colors.border,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Ionicons name={icon} size={26} color={colors.accent} />
            </View>
          ))}
        </View>

        <View style={{ gap: space.s3 }}>
          <AppText variant="h1" style={{ textAlign: 'center' }}>
            All you need.{'\n'}One place.
          </AppText>
          <AppText variant="body" color="textMuted" style={{ textAlign: 'center' }}>
            Find trusted professionals for any job — plumbing, electrical, carpentry
            and more.
          </AppText>
        </View>
      </View>

      <View style={{ gap: space.s4, paddingBottom: space.s6 }}>
        <Button title="Get started" fullWidth onPress={() => router.push('/(auth)/sign-up')} />
        <View style={{ flexDirection: 'row', justifyContent: 'center', gap: space.s1 }}>
          <AppText variant="bodySm" color="textMuted">
            Already have an account?
          </AppText>
          <Pressable accessibilityRole="link" onPress={() => router.push('/(auth)/sign-in')}>
            <AppText variant="bodySm" color="accent">
              Sign in
            </AppText>
          </Pressable>
        </View>
      </View>
    </Screen>
  );
}
