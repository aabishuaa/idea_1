import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { AppText } from './Text';
import { useTheme } from '@/theme/ThemeContext';
import { radius, space } from '@/theme/tokens';

interface ButtonProps {
  title: string;
  onPress?: () => void;
  variant?: 'primary' | 'secondary' | 'text';
  disabled?: boolean;
  loading?: boolean;
  fullWidth?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityHint?: string;
}

/**
 * The three design-system button variants with their full state matrix
 * (default / pressed / disabled / loading).
 */
export function Button({
  title,
  onPress,
  variant = 'primary',
  disabled = false,
  loading = false,
  fullWidth = false,
  style,
  accessibilityHint,
}: ButtonProps) {
  const { colors } = useTheme();
  const inactive = disabled || loading;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: inactive, busy: loading }}
      accessibilityHint={accessibilityHint}
      disabled={inactive}
      onPress={onPress}
      hitSlop={variant === 'text' ? 8 : undefined}
      style={({ pressed }) => {
        const base: ViewStyle = {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: space.s2,
          borderRadius: radius.md,
          paddingVertical: 14,
          paddingHorizontal: space.s5,
          ...(fullWidth && { alignSelf: 'stretch' }),
          opacity: inactive ? 0.5 : 1,
        };
        if (variant === 'primary') {
          return [
            base,
            { backgroundColor: pressed ? colors.primaryHover : colors.primary },
            style,
          ];
        }
        if (variant === 'secondary') {
          return [
            base,
            {
              backgroundColor: pressed ? colors.accentSoft : 'transparent',
              borderWidth: 1,
              borderColor: colors.border,
            },
            style,
          ];
        }
        return [
          base,
          { paddingVertical: space.s2, paddingHorizontal: space.s2, opacity: pressed ? 0.7 : base.opacity },
          style,
        ];
      }}
    >
      {loading && (
        <ActivityIndicator
          size="small"
          color={variant === 'primary' ? '#FFFFFF' : colors.accent}
        />
      )}
      <AppText
        variant="label"
        style={{
          color:
            variant === 'primary'
              ? '#FFFFFF'
              : variant === 'secondary'
                ? colors.text
                : colors.accent,
        }}
      >
        {title}
      </AppText>
    </Pressable>
  );
}
