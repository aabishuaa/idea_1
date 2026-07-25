import React from 'react';
import { View } from 'react-native';

import { AppText } from './Text';
import { useTheme } from '@/theme/ThemeContext';
import { radius, space } from '@/theme/tokens';

interface ProgressBarProps {
  /** 0..1 */
  progress: number;
  label?: string;
  trailing?: string;
  helper?: string;
}

export function ProgressBar({ progress, label, trailing, helper }: ProgressBarProps) {
  const { colors } = useTheme();
  const clamped = Math.min(1, Math.max(0, progress));

  return (
    <View style={{ gap: space.s2 }}>
      {(label || trailing) && (
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          {label ? <AppText variant="label">{label}</AppText> : <View />}
          {trailing ? (
            <AppText variant="caption" color="textMuted">
              {trailing}
            </AppText>
          ) : null}
        </View>
      )}
      <View
        accessibilityRole="progressbar"
        accessibilityValue={{ min: 0, max: 100, now: Math.round(clamped * 100) }}
        style={{
          height: 8,
          borderRadius: radius.full,
          backgroundColor: colors.accentSoft,
          overflow: 'hidden',
        }}
      >
        <View
          style={{
            width: `${clamped * 100}%`,
            height: '100%',
            borderRadius: radius.full,
            backgroundColor: colors.accent,
          }}
        />
      </View>
      {helper ? (
        <AppText variant="caption" color="textMuted">
          {helper}
        </AppText>
      ) : null}
    </View>
  );
}
