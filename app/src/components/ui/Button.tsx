import { Ionicons } from '@expo/vector-icons';
import React, { useRef } from 'react';
import {
  ActivityIndicator,
  Animated,
  Pressable,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { AppText } from './Text';
import { lightTap } from './animated';
import { useTheme } from '@/theme/ThemeContext';
import { radius, space } from '@/theme/tokens';

interface ButtonProps {
  title: string;
  onPress?: () => void;
  variant?: 'primary' | 'secondary' | 'text';
  icon?: keyof typeof Ionicons.glyphMap;
  disabled?: boolean;
  loading?: boolean;
  fullWidth?: boolean;
  style?: StyleProp<ViewStyle>;
  /** Overrides the variant's label colour (e.g. on a coloured background). */
  textColor?: string;
  accessibilityHint?: string;
}

/**
 * The three design-system button variants with their full state matrix
 * (default / pressed / disabled / loading), plus the snappy press spring
 * and a light haptic tap on primary actions.
 */
export function Button({
  title,
  onPress,
  variant = 'primary',
  icon,
  disabled = false,
  loading = false,
  fullWidth = false,
  style,
  textColor,
  accessibilityHint,
}: ButtonProps) {
  const { colors } = useTheme();
  const inactive = disabled || loading;
  const scale = useRef(new Animated.Value(1)).current;

  const springTo = (value: number) =>
    Animated.spring(scale, {
      toValue: value,
      speed: 40,
      bounciness: 6,
      useNativeDriver: true,
    }).start();

  const contentColor =
    textColor ??
    (variant === 'primary' ? '#FFFFFF' : variant === 'secondary' ? colors.text : colors.accent);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: inactive, busy: loading }}
      accessibilityHint={accessibilityHint}
      disabled={inactive}
      onPress={onPress}
      onPressIn={() => {
        springTo(0.96);
        if (variant === 'primary') lightTap();
      }}
      onPressOut={() => springTo(1)}
      hitSlop={variant === 'text' ? 8 : undefined}
      style={fullWidth ? { alignSelf: 'stretch' } : undefined}
    >
      {({ pressed }) => {
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
        const variantStyle: ViewStyle =
          variant === 'primary'
            ? { backgroundColor: pressed ? colors.primaryHover : colors.primary }
            : variant === 'secondary'
              ? {
                  backgroundColor: pressed ? colors.accentSoft : 'transparent',
                  borderWidth: 1,
                  borderColor: colors.border,
                }
              : {
                  paddingVertical: space.s2,
                  paddingHorizontal: space.s2,
                  opacity: pressed ? 0.7 : inactive ? 0.5 : 1,
                };
        return (
          <Animated.View style={[base, variantStyle, { transform: [{ scale }] }, style]}>
            {loading && <ActivityIndicator size="small" color={contentColor} />}
            {!loading && icon ? <Ionicons name={icon} size={18} color={contentColor} /> : null}
            <AppText variant="label" style={{ color: contentColor }}>
              {title}
            </AppText>
          </Animated.View>
        );
      }}
    </Pressable>
  );
}
