import React from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '@/theme/ThemeContext';
import { space } from '@/theme/tokens';

interface ScreenProps {
  children: React.ReactNode;
  /** Scrollable content (default) vs fixed layout. */
  scroll?: boolean;
  padded?: boolean;
  /**
   * Add the top safe-area inset. Only needed on screens WITHOUT a native
   * header (tabs, auth, splash) — headered stack screens already clear the
   * notch, so the default is false.
   */
  safeTop?: boolean;
  style?: StyleProp<ViewStyle>;
}

/** Standard screen wrapper: bg token, keyboard avoidance, optional safe top. */
export function Screen({
  children,
  scroll = true,
  padded = true,
  safeTop = false,
  style,
}: ScreenProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  const inner = scroll ? (
    <ScrollView
      contentContainerStyle={[
        padded && { padding: space.s4, paddingBottom: space.s12 },
        style,
      ]}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      {children}
    </ScrollView>
  ) : (
    <View style={[{ flex: 1 }, padded && { padding: space.s4 }, style]}>{children}</View>
  );

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.bg, paddingTop: safeTop ? insets.top : 0 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {inner}
    </KeyboardAvoidingView>
  );
}
