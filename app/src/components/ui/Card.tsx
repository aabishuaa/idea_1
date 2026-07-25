import React from 'react';
import { Pressable, View, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme } from '@/theme/ThemeContext';
import { elevation, radius, space } from '@/theme/tokens';

interface CardProps {
  children: React.ReactNode;
  onPress?: () => void;
  level?: 1 | 2 | 3;
  raised?: boolean;
  style?: StyleProp<ViewStyle>;
}

/** Surface card: e1 by default; dark theme uses border+glow, light uses shadow. */
export function Card({ children, onPress, level = 1, raised = false, style }: CardProps) {
  const { colors, isDark } = useTheme();
  const base: StyleProp<ViewStyle> = [
    {
      backgroundColor: raised ? colors.surfaceRaised : colors.surface,
      borderRadius: radius.lg,
      padding: space.s4,
    },
    elevation(level, colors, isDark),
    style,
  ];

  if (onPress) {
    return (
      <Pressable
        accessibilityRole="button"
        onPress={onPress}
        style={({ pressed }) => [base, pressed && { opacity: 0.85 }]}
      >
        {children}
      </Pressable>
    );
  }
  return <View style={base}>{children}</View>;
}
