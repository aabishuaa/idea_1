import { Ionicons } from '@expo/vector-icons';
import React, { useRef, useState } from 'react';
import { Pressable, TextInput, type TextInputProps, View } from 'react-native';

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
  style,
  onFocus,
  onBlur,
  ...rest
}: InputProps) {
  const { colors } = useTheme();
  const [focused, setFocused] = useState(false);
  // Password fields get a show/hide toggle automatically.
  const [hidden, setHidden] = useState(secureTextEntry === true);
  const field = useRef<TextInput>(null);

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
      {/* The whole field is the tap target, not just the glyphs inside it —
          tapping the padding used to do nothing, which reads as "broken". */}
      <Pressable
        accessible={false}
        onPress={() => field.current?.focus()}
        style={{
          flexDirection: 'row',
          alignItems: rest.multiline ? 'flex-start' : 'center',
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
        {/*
          `rest` is spread FIRST and style is merged rather than replaced.
          Spreading last meant any caller passing `style` (every multiline
          field: "About you", the job description, the chat composer) silently
          replaced the whole text style — losing `color: colors.text`, so the
          text fell back to platform black and vanished in dark mode. It also
          replaced onFocus/onBlur, so those fields never showed a focus ring.
        */}
        <TextInput
          ref={field}
          {...rest}
          style={[
            {
              flex: 1,
              fontFamily: fonts.regular,
              fontSize: 16,
              color: colors.text,
              paddingVertical: 0,
            },
            style,
          ]}
          placeholderTextColor={colors.textMuted}
          selectionColor={colors.accent}
          cursorColor={colors.accent}
          editable={editable}
          secureTextEntry={secureTextEntry ? hidden : false}
          onFocus={(event) => {
            setFocused(true);
            onFocus?.(event);
          }}
          onBlur={(event) => {
            setFocused(false);
            onBlur?.(event);
          }}
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
      </Pressable>
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
