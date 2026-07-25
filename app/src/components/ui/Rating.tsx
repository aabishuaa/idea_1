import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Pressable, View } from 'react-native';

import { AppText } from './Text';
import { useTheme } from '@/theme/ThemeContext';
import { space } from '@/theme/tokens';

interface RatingProps {
  value: number;
  count?: number;
  size?: number;
  /** Interactive star picker (review form) when provided. */
  onChange?: (value: number) => void;
}

export function Rating({ value, count, size = 14, onChange }: RatingProps) {
  const { colors } = useTheme();
  const stars = [1, 2, 3, 4, 5];

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.s1 }}>
      <View style={{ flexDirection: 'row', gap: 2 }}>
        {stars.map((star) => {
          const icon =
            value >= star ? 'star' : value >= star - 0.5 ? 'star-half' : 'star-outline';
          const glyph = (
            <Ionicons
              key={star}
              name={icon}
              size={onChange ? Math.max(size, 28) : size}
              color={colors.star}
            />
          );
          if (!onChange) return glyph;
          return (
            <Pressable
              key={star}
              accessibilityRole="button"
              accessibilityLabel={`${star} star${star > 1 ? 's' : ''}`}
              onPress={() => onChange(star)}
              hitSlop={4}
            >
              {glyph}
            </Pressable>
          );
        })}
      </View>
      {!onChange && (
        <>
          <AppText variant="label">{value.toFixed(1)}</AppText>
          {count != null && (
            <AppText variant="caption" color="textMuted">
              ({count})
            </AppText>
          )}
        </>
      )}
    </View>
  );
}
