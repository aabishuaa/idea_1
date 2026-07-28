import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useEffect, useRef } from 'react';
import { Animated, Easing, View } from 'react-native';

import { AppText } from './ui/Text';
import { useTheme } from '@/theme/ThemeContext';
import { radius, space } from '@/theme/tokens';

/**
 * The myB rocket, in a diamond-blue roundel. Drawn rather than imported so the
 * brand mark is theme-aware and needs no raster asset at any density — the
 * app icon files can follow later without holding this up.
 */
export function RocketMark({ size = 64 }: { size?: number }) {
  const { colors } = useTheme();
  return (
    <LinearGradient
      colors={[colors.primary, colors.accent]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.3,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {/* -45° so the rocket points up-right, the way it flies. */}
      <Ionicons
        name="rocket"
        size={size * 0.55}
        color="#FFFFFF"
        style={{ transform: [{ rotate: '-45deg' }] }}
      />
    </LinearGradient>
  );
}

/** "myB." — the dot is always the accent. */
export function Wordmark({ variant = 'h1' }: { variant?: 'display' | 'h1' | 'h2' | 'h3' }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
      <AppText variant={variant} style={{ letterSpacing: -0.5 }}>
        myB
      </AppText>
      <AppText variant={variant} color="accent">
        .
      </AppText>
    </View>
  );
}

/**
 * Launch sequence for the splash: the rocket shudders on the pad, fires, then
 * climbs away as the wordmark rises into its place.
 *
 * Everything is transform + opacity so it runs on the native driver — this
 * plays while JavaScript is busy restoring the session, which is exactly when
 * a JS-driven animation would stutter.
 */
export function RocketLaunch({ onDone }: { onDone?: () => void }) {
  const { colors } = useTheme();
  const shake = useRef(new Animated.Value(0)).current;
  const lift = useRef(new Animated.Value(0)).current;
  const flame = useRef(new Animated.Value(0)).current;
  const word = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.sequence([
      // 1. Ignition: a short rattle on the pad.
      Animated.parallel([
        Animated.timing(flame, {
          toValue: 1,
          duration: 260,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.loop(
          Animated.sequence([
            Animated.timing(shake, {
              toValue: 1,
              duration: 45,
              useNativeDriver: true,
            }),
            Animated.timing(shake, {
              toValue: -1,
              duration: 45,
              useNativeDriver: true,
            }),
          ]),
          { iterations: 5 },
        ),
      ]),
      // 2. Liftoff.
      Animated.timing(lift, {
        toValue: 1,
        duration: 620,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
      // 3. The wordmark arrives where the rocket was.
      Animated.timing(word, {
        toValue: 1,
        duration: 380,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start(() => onDone?.());
  }, [shake, lift, flame, word, onDone]);

  return (
    <View style={{ alignItems: 'center', justifyContent: 'center', gap: space.s4 }}>
      <View style={{ height: 120, alignItems: 'center', justifyContent: 'center' }}>
        <Animated.View
          style={{
            alignItems: 'center',
            opacity: lift.interpolate({ inputRange: [0, 0.7, 1], outputRange: [1, 1, 0] }),
            transform: [
              {
                translateX: shake.interpolate({
                  inputRange: [-1, 1],
                  outputRange: [-1.5, 1.5],
                }),
              },
              {
                translateY: lift.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, -420],
                }),
              },
              {
                scale: lift.interpolate({
                  inputRange: [0, 1],
                  outputRange: [1, 0.55],
                }),
              },
            ],
          }}
        >
          <RocketMark size={84} />

          {/* Exhaust: a tapering plume that stretches as it climbs. */}
          <Animated.View
            style={{
              position: 'absolute',
              top: 78,
              width: 16,
              height: 46,
              borderRadius: radius.full,
              opacity: flame,
              transform: [
                { scaleY: lift.interpolate({ inputRange: [0, 1], outputRange: [1, 3.2] }) },
                { translateY: lift.interpolate({ inputRange: [0, 1], outputRange: [0, 18] }) },
              ],
            }}
          >
            <LinearGradient
              colors={[colors.accent, 'rgba(59,158,255,0)']}
              style={{ flex: 1, borderRadius: radius.full }}
            />
          </Animated.View>
        </Animated.View>

        {/* The wordmark settles into the space the rocket left. */}
        <Animated.View
          style={{
            position: 'absolute',
            alignItems: 'center',
            opacity: word,
            transform: [
              { translateY: word.interpolate({ inputRange: [0, 1], outputRange: [18, 0] }) },
            ],
          }}
        >
          <AppText variant="display">myB</AppText>
        </Animated.View>
      </View>

      <Animated.View style={{ opacity: word, alignItems: 'center', gap: space.s1 }}>
        <AppText variant="body" color="textMuted">
          Mind yuh business.
        </AppText>
      </Animated.View>
    </View>
  );
}
