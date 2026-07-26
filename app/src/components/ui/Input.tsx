import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { TextInput, type TextInputProps, View } from 'react-native';

import { AppText } from './Text';
import { useTheme } from '@/theme/ThemeContext';
import { fonts, radius, space } from '@/theme/tokens';

interface InputProps extends TextInputProps {
  label?: string;
  error?: string;
  success?: string;
  icon?: keyof typeof Ionicons.glyphMap;
}

/**
 * Design-system text field: default / focused (accent ring) / error / success /
 * disabled states, plus optional leading icon (search etc.).
 */
export function Input({
  label,
  error,
  success,
  icon,
  editable = true,
  secureTextEntry,
  ...rest
}: InputProps) {
  const { colors } = useTheme();
  const [focused, setFocused] = useState(false);
  // Password fields get a show/hide toggle automatically.
  const [hidden, setHidden] = useState(secureTextEntry === true);

  const borderColor = error
    ? colors.error
    : success
      ? colors.success
      : focused
        ? colors.accent
        : colors.border;

  return (
    <View style={{ gap: space.s2 }}>
      {label ? (
        <AppText variant="label" color="textMuted">
          {label}
        </AppText>
      ) : null}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: space.s2,
          backgroundColor: colors.surface,
          borderWidth: focused ? 2 : 1,
          borderColor,
          borderRadius: radius.md,
          paddingHorizontal: space.s4,
          paddingVertical: focused ? 11 : 12,
          opacity: editable ? 1 : 0.5,
        }}
      >
        {icon ? <Ionicons name={icon} size={18} color={colors.textMuted} /> : null}
        <TextInput
          style={{
            flex: 1,
            fontFamily: fonts.regular,
            fontSize: 16,
            color: colors.text,
            paddingVertical: 0,
          }}
          placeholderTextColor={colors.textMuted}
          editable={editable}
          secureTextEntry={secureTextEntry ? hidden : false}
          onFocus={(event) => {
            setFocused(true);
            rest.onFocus?.(event);
          }}
          onBlur={(event) => {
            setFocused(false);
            rest.onBlur?.(event);
          }}
          {...rest}
        />
        {secureTextEntry ? (
          <Ionicons
            name={hidden ? 'eye-outline' : 'eye-off-outline'}
            size={20}
            color={colors.textMuted}
            accessibilityRole="button"
            accessibilityLabel={hidden ? 'Show password' : 'Hide password'}
            onPress={() => setHidden((current) => !current)}
            suppressHighlighting
          />
        ) : null}
      </View>
      {error ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.s1 }}>
          <Ionicons name="alert-circle" size={14} color={colors.error} />
          <AppText variant="caption" color="error">
            {error}
          </AppText>
        </View>
      ) : success ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.s1 }}>
          <Ionicons name="checkmark-circle" size={14} color={colors.success} />
          <AppText variant="caption" color="success">
            {success}
          </AppText>
        </View>
      ) : null}
    </View>
  );
}
