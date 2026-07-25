import React from 'react';
import { Text, type TextProps } from 'react-native';

import { useTheme } from '@/theme/ThemeContext';
import { type } from '@/theme/tokens';

type Variant =
  | 'display'
  | 'h1'
  | 'h2'
  | 'h3'
  | 'body'
  | 'bodySm'
  | 'label'
  | 'caption'
  | 'overline';

interface AppTextProps extends TextProps {
  variant?: Variant;
  color?: 'text' | 'textMuted' | 'accent' | 'success' | 'warning' | 'error' | 'primary';
}

export function AppText({
  variant = 'body',
  color = 'text',
  style,
  ...rest
}: AppTextProps) {
  const { colors } = useTheme();
  return <Text style={[type[variant], { color: colors[color] }, style]} {...rest} />;
}
