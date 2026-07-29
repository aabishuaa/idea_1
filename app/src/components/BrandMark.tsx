import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useEffect, useRef } from 'react';
import { Animated, Easing, Image, View } from 'react-native';

import { AppText } from './ui/Text';
import { useTheme } from '@/theme/ThemeContext';
import { radius, space } from '@/theme/tokens';

type MarkVariant = 'display' | 'h1' | 'h2' | 'h3';

/** The dot is a drawn circle, so it stays perfectly round at every size. */
const DOT_SIZE: Record<MarkVariant, number> = {
  display: 10,
  h1: 8,
  h2: 7,
  h3: 6,
};

/**
 * How far ABOVE the baseline the dot sits. A true full stop rests on the
 * baseline, which put the dot visually below the "B" and made the lockup look
 * like it was sagging; lifting it aligns the dot with the letter's optical
 * bottom instead.
 */
const DOT_LIFT: Record<MarkVariant, number> = {
  display: 9,
  h1: 7,
  h2: 6,
  h3: 5,
};

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

/**
 * "myB" followed by the blue dot.
 *
 * The dot is a View, not a typed full stop: a period rendered in Plus Jakarta
 * Sans is a small rounded square that sits on the baseline, and at h3 it read
 * as a speck of dirt rather than the brand's dot.
 */
export function Wordmark({ variant = 'h1' }: { variant?: MarkVariant }) {
  const { colors } = useTheme();
  const size = DOT_SIZE[variant];
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end' }}>
      <AppText variant={variant} style={{ letterSpacing: -0.5 }}>
        myB
      </AppText>
      <View
        accessibilityElementsHidden
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: colors.accent,
          marginLeft: 3,
          marginBottom: DOT_LIFT[variant],
        }}
      />
    </View>
  );
}

/**
 * The full lockup: the myB mark, then the wordmark.
 *
 * The mark is the shipped `home-logo.png` asset, not the drawn rocket. The
 * rocket is the SPLASH — it is the motion that delivers the brand — but
 * everywhere the name is simply present, the real logo belongs beside it.
 * Pass `rocket` to use the drawn mark instead (the launch sequence does).
 */
export function BrandLockup({
  variant = 'h2',
  markSize,
  rocket = false,
}: {
  variant?: MarkVariant;
  markSize?: number;
  rocket?: boolean;
}) {
  const fallback: Record<MarkVariant, number> = { display: 56, h1: 40, h2: 26, h3: 22 };
  const size = markSize ?? fallback[variant];
  return (
    <View
      accessibilityRole="image"
      accessibilityLabel="myB"
      style={{ flexDirection: 'row', alignItems: 'center', gap: space.s2 }}
    >
      {rocket ? (
        <RocketMark size={size} />
      ) : (
        <Image
          source={require('../../assets/home-logo.png')}
          style={{ width: size, height: size, borderRadius: size * 0.24 }}
          resizeMode="contain"
        />
      )}
      <Wordmark variant={variant} />
    </View>
  );
}

/**
 * Launch sequence for the splash: the rocket shudders on the pad, fires,
 * climbs away — and the myB logo is revealed in the space it leaves behind.
 *
 * Everything is transform + opacity so it runs on the native driver: this
 * plays while JavaScript is busy restoring the session, which is exactly when
 * a JS-driven animation would stutter.
 */
export function RocketLaunch() {
  const { colors } = useTheme();
  const shake = useRef(new Animated.Value(0)).current;
  const lift = useRef(new Animated.Value(0)).current;
  const flame = useRef(new Animated.Value(0)).current;
  const logo = useRef(new Animated.Value(0)).current;

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
            Animated.timing(shake, { toValue: 1, duration: 45, useNativeDriver: true }),
            Animated.timing(shake, { toValue: -1, duration: 45, useNativeDriver: true }),
          ]),
          { iterations: 5 },
        ),
      ]),
      // 2. Liftoff.
      Animated.timing(lift, {
        toValue: 1,
        duration: 600,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
      // 3. The logo is revealed where the rocket was.
      Animated.spring(logo, {
        toValue: 1,
        speed: 11,
        bounciness: 9,
        useNativeDriver: true,
      }),
    ]).start();
  }, [shake, lift, flame, logo]);

  return (
    <View style={{ alignItems: 'center', justifyContent: 'center', gap: space.s4 }}>
      <View style={{ height: 130, alignItems: 'center', justifyContent: 'center' }}>
        {/* The rocket that flies away */}
        <Animated.View
          style={{
            alignItems: 'center',
            opacity: lift.interpolate({ inputRange: [0, 0.7, 1], outputRange: [1, 1, 0] }),
            transform: [
              { translateX: shake.interpolate({ inputRange: [-1, 1], outputRange: [-1.5, 1.5] }) },
              { translateY: lift.interpolate({ inputRange: [0, 1], outputRange: [0, -440] }) },
              { scale: lift.interpolate({ inputRange: [0, 1], outputRange: [1, 0.5] }) },
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

        {/*
          …and the real myB logo takes its place. Deliberately the shipped
          asset (assets/home-logo.png), not the drawn rocket: the rocket is
          the motion, the logo is the brand. It scales up from roughly the
          rocket's size as the rocket shrinks away, so the two read as one
          shape becoming another rather than a swap.
        */}
        <Animated.View
          style={{
            position: 'absolute',
            alignItems: 'center',
            opacity: logo,
            transform: [
              { scale: logo.interpolate({ inputRange: [0, 1], outputRange: [0.55, 1] }) },
              {
                rotate: logo.interpolate({
                  inputRange: [0, 1],
                  outputRange: ['-12deg', '0deg'],
                }),
              },
            ],
          }}
        >
          <Image
            source={require('../../assets/home-logo.png')}
            style={{ width: 96, height: 96 }}
            resizeMode="contain"
            accessibilityLabel="myB logo"
          />
        </Animated.View>
      </View>

      <Animated.View
        style={{
          opacity: logo,
          alignItems: 'center',
          gap: space.s2,
          transform: [
            { translateY: logo.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) },
          ],
        }}
      >
        <Wordmark variant="display" />
        <AppText variant="body" color="textMuted">
          Mind yuh business.
        </AppText>
      </Animated.View>
    </View>
  );
}
