import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { View } from 'react-native';

import { AppText } from './ui/Text';
import { passwordStrength } from '@/lib/password';
import { useTheme } from '@/theme/ThemeContext';
import { radius, space } from '@/theme/tokens';

/** Live strength read-out — rules visible while typing, not after submitting. */
export function PasswordMeter({
  password,
  checks,
}: {
  password: string;
  checks: { label: string; met: boolean }[];
}) {
  const { colors } = useTheme();
  const strength = passwordStrength(password);
  const tone =
    strength.score >= 4 ? colors.success : strength.score >= 3 ? colors.warning : colors.error;

  return (
    <View style={{ gap: space.s2 }}>
      <View style={{ flexDirection: 'row', gap: space.s1 }}>
        {[0, 1, 2, 3].map((segment) => (
          <View
            key={segment}
            style={{
              flex: 1,
              height: 4,
              borderRadius: radius.full,
              backgroundColor: segment < strength.score ? tone : colors.border,
            }}
          />
        ))}
      </View>
      <AppText variant="caption" style={{ color: tone }}>
        {strength.label}
      </AppText>
      <View style={{ gap: 2 }}>
        {checks.map((check) => (
          <View
            key={check.label}
            style={{ flexDirection: 'row', alignItems: 'center', gap: space.s2 }}
          >
            <Ionicons
              name={check.met ? 'checkmark-circle' : 'ellipse-outline'}
              size={13}
              color={check.met ? colors.success : colors.textMuted}
            />
            <AppText variant="caption" color={check.met ? 'success' : 'textMuted'}>
              {check.label}
            </AppText>
          </View>
        ))}
      </View>
    </View>
  );
}
