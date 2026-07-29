import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React from 'react';
import { Pressable } from 'react-native';

import { lightTap } from './ui/animated';
import { useTheme } from '@/theme/ThemeContext';
import { radius, space } from '@/theme/tokens';

/**
 * A back arrow that is always there.
 *
 * The native one only appears when the stack has somewhere to go, and several
 * flows land you on a screen via router.replace — sending a request, accepting
 * one, finishing verification — so the arrow simply vanished and the screen
 * became a dead end. This falls back to the tabs when there is no history,
 * which is the right destination in every one of those cases.
 */
export function HeaderBack() {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Go back"
      hitSlop={12}
      onPress={() => {
        lightTap();
        if (router.canGoBack()) router.back();
        else router.replace('/(tabs)');
      }}
      style={({ pressed }) => ({
        paddingRight: space.s3,
        opacity: pressed ? 0.6 : 1,
      })}
    >
      <Ionicons name="chevron-back" size={26} color={colors.text} />
    </Pressable>
  );
}

/**
 * A way home from any stack screen.
 *
 * Deep flows (verification → liveness → result, formalize → checklist → step)
 * stack up several screens, and tapping back four times to reach the tabs is
 * not navigation. The gesture-driven sidebar covers the tabs; this covers
 * everywhere else.
 */
export function HeaderHome() {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Go to home"
      hitSlop={12}
      onPress={() => {
        lightTap();
        router.replace('/(tabs)');
      }}
      style={({ pressed }) => ({
        width: 32,
        height: 32,
        borderRadius: radius.full,
        backgroundColor: colors.accentSoft,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: pressed ? 0.6 : 1,
      })}
    >
      <Ionicons name="home" size={17} color={colors.accent} />
    </Pressable>
  );
}
