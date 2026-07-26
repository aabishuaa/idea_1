import React, { useRef } from 'react';
import {
  Animated,
  Pressable,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

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
  const scale = useRef(new Animated.Value(1)).current;
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
    const springTo = (value: number) =>
      Animated.spring(scale, {
        toValue: value,
        speed: 40,
        bounciness: 4,
        useNativeDriver: true,
      }).start();
    return (
      <Pressable
        accessibilityRole="button"
        onPress={onPress}
        onPressIn={() => springTo(0.98)}
        onPressOut={() => springTo(1)}
      >
        {({ pressed }) => (
          <Animated.View style={[base, { transform: [{ scale }] }, pressed && { opacity: 0.92 }]}>
            {children}
          </Animated.View>
        )}
      </Pressable>
    );
  }
  return <View style={base}>{children}</View>;
}
