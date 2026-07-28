import * as Haptics from 'expo-haptics';
import React, { useEffect, useRef } from 'react';
import {
  Animated,
  Easing,
  Pressable,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { isExpoGo } from '@/lib/runtime';
import { useTheme } from '@/theme/ThemeContext';
import { radius as radiusTokens } from '@/theme/tokens';

/**
 * Motion primitives for the myB design system, built on the RN Animated API
 * so they run identically in Expo Go and dev builds (no extra native deps).
 * Durations follow the "snappy" feel: 260–420ms, cubic ease-out.
 */

export function lightTap() {
  // Haptics are a no-op on web/simulators; guard Expo Go Android quirks.
  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
}

export function successTap() {
  void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
}

interface FadeSlideInProps {
  children: React.ReactNode;
  /** Delay in ms before the entrance starts (stagger sections with this). */
  delay?: number;
  duration?: number;
  /** Direction the content slides in FROM. */
  from?: 'bottom' | 'top' | 'left' | 'right' | 'none';
  distance?: number;
  style?: StyleProp<ViewStyle>;
}

/** Fade + slide entrance for screen sections. */
export function FadeSlideIn({
  children,
  delay = 0,
  duration = 360,
  from = 'bottom',
  distance = 16,
  style,
}: FadeSlideInProps) {
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(progress, {
      toValue: 1,
      duration,
      delay,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [progress, delay, duration]);

  // A transform array must contain exactly one property per entry — for
  // from='none' it must be empty, never [{}].
  const transform =
    from === 'none'
      ? []
      : from === 'left' || from === 'right'
        ? [
            {
              translateX: progress.interpolate({
                inputRange: [0, 1],
                outputRange: [from === 'left' ? -distance : distance, 0],
              }),
            },
          ]
        : [
            {
              translateY: progress.interpolate({
                inputRange: [0, 1],
                outputRange: [from === 'top' ? -distance : distance, 0],
              }),
            },
          ];

  return (
    <Animated.View style={[{ opacity: progress, transform: transform as never }, style]}>
      {children}
    </Animated.View>
  );
}

/** Staggers each direct child with an incremental entrance delay. */
export function Stagger({
  children,
  base = 0,
  interval = 70,
  from = 'bottom',
  gap,
}: {
  children: React.ReactNode;
  base?: number;
  interval?: number;
  from?: FadeSlideInProps['from'];
  gap?: number;
}) {
  const items = React.Children.toArray(children);
  return (
    <>
      {items.map((child, index) => (
        <FadeSlideIn
          key={index}
          delay={base + index * interval}
          from={from}
          style={gap != null && index > 0 ? { marginTop: gap } : undefined}
        >
          {child}
        </FadeSlideIn>
      ))}
    </>
  );
}

interface ScalePressProps extends Omit<PressableProps, 'style'> {
  children: React.ReactNode;
  /** Layout for the outer touchable — use this for flex inside a row. */
  containerStyle?: StyleProp<ViewStyle>;
  /** Scale while pressed. */
  to?: number;
  haptic?: boolean;
  style?: StyleProp<ViewStyle>;
}

/** Pressable that springs down slightly — the standard press feedback. */
export function ScalePress({
  children,
  to = 0.97,
  haptic = false,
  style,
  containerStyle,
  ...rest
}: ScalePressProps) {
  const scale = useRef(new Animated.Value(1)).current;

  const animateTo = (value: number) =>
    Animated.spring(scale, {
      toValue: value,
      speed: 40,
      bounciness: 5,
      useNativeDriver: true,
    }).start();

  return (
    /*
      Layout lives on the Pressable, visuals on the animated box inside it.
      `style` alone went onto the inner view, so `style={{ flex: 1 }}` on a
      ScalePress inside a row did nothing: the Pressable stayed content-sized
      and the two "Dashboard / Earnings" tiles bunched up on the left instead
      of splitting the width. containerStyle is the outer one.
    */
    <Pressable
      {...rest}
      style={containerStyle}
      onPressIn={(event) => {
        animateTo(to);
        if (haptic) lightTap();
        rest.onPressIn?.(event);
      }}
      onPressOut={(event) => {
        animateTo(1);
        rest.onPressOut?.(event);
      }}
    >
      <Animated.View
        style={[{ transform: [{ scale }] }, containerStyle ? { flex: 1 } : null, style]}
      >
        {children}
      </Animated.View>
    </Pressable>
  );
}

/** Shimmering placeholder block for loading states. */
export function Skeleton({
  width,
  height = 16,
  radius = radiusTokens.sm,
  style,
}: {
  width?: number | `${number}%`;
  height?: number;
  radius?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors } = useTheme();
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 700,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 700,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  return (
    <Animated.View
      style={[
        {
          width: width ?? '100%',
          height,
          borderRadius: radius,
          backgroundColor: colors.surfaceRaised,
          opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.45, 0.95] }),
        },
        style,
      ]}
    />
  );
}

/**
 * Pulsing "typing" dots for chat (BizBot). Three dots looping with a phase
 * offset — no worklets required.
 */
export function TypingDots() {
  const { colors } = useTheme();
  const phase = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(phase, {
        toValue: 3,
        duration: 900,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [phase]);

  return (
    <Animated.View style={{ flexDirection: 'row', gap: 4, padding: 2 }}>
      {[0, 1, 2].map((index) => (
        <Animated.View
          key={index}
          style={{
            width: 6,
            height: 6,
            borderRadius: 3,
            backgroundColor: colors.textMuted,
            opacity: 0.7,
            transform: [
              {
                translateY: phase.interpolate({
                  inputRange: [index, index + 0.5, index + 1],
                  outputRange: [0, -3, 0],
                  extrapolate: 'clamp',
                }),
              },
            ],
          }}
        />
      ))}
    </Animated.View>
  );
}

export { isExpoGo };
