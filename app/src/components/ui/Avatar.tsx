import React from 'react';
import { Image, View } from 'react-native';

import { AppText } from './Text';
import { initials } from '@/lib/format';
import { useTheme } from '@/theme/ThemeContext';

const SIZES = { sm: 32, md: 44, lg: 64, xl: 88 } as const;

interface AvatarProps {
  name: string;
  uri?: string | null;
  size?: keyof typeof SIZES;
  showStatusDot?: boolean;
  online?: boolean;
}

export function Avatar({ name, uri, size = 'md', showStatusDot = false, online = true }: AvatarProps) {
  const { colors } = useTheme();
  const px = SIZES[size];

  return (
    <View style={{ width: px, height: px }}>
      {uri ? (
        <Image
          source={{ uri }}
          style={{ width: px, height: px, borderRadius: px / 2 }}
          accessibilityLabel={`${name} avatar`}
        />
      ) : (
        <View
          style={{
            width: px,
            height: px,
            borderRadius: px / 2,
            backgroundColor: colors.accentSoft,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <AppText
            variant={size === 'sm' ? 'caption' : size === 'md' ? 'label' : 'h3'}
            style={{ color: colors.accent }}
          >
            {initials(name)}
          </AppText>
        </View>
      )}
      {showStatusDot && (
        <View
          style={{
            position: 'absolute',
            right: 0,
            bottom: 0,
            width: Math.max(10, px / 5),
            height: Math.max(10, px / 5),
            borderRadius: px / 10,
            backgroundColor: online ? colors.success : colors.textMuted,
            borderWidth: 2,
            borderColor: colors.surface,
          }}
        />
      )}
    </View>
  );
}
