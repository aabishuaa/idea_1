import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useEffect, useRef } from 'react';
import { Animated, Easing, Modal, View, useWindowDimensions } from 'react-native';

import { Button } from './Button';
import { AppText } from './Text';
import { successTap } from './animated';
import { playChime } from '@/lib/sound';
import { useTheme } from '@/theme/ThemeContext';
import { space } from '@/theme/tokens';

interface SuccessOverlayProps {
  visible: boolean;
  title: string;
  message?: string;
  /** Primary action label. Omit for an auto-dismissing overlay. */
  actionTitle?: string;
  onAction?: () => void;
  secondaryTitle?: string;
  onSecondary?: () => void;
  /** Auto-dismiss after this many ms when no action is given. */
  autoDismissMs?: number;
  onDismiss?: () => void;
  icon?: keyof typeof Ionicons.glyphMap;
  /** Play the signature chime. On for the big moments, off for small ones. */
  sound?: boolean;
}

/**
 * The app's confirmation moment: the screen floods with brand blue, a tick
 * springs in, then the copy rises underneath.
 *
 * Deliberately one shared component rather than a per-screen animation, so
 * booking a job, passing verification, finishing a checklist step and leaving
 * a review all celebrate identically. Built on the RN Animated API so it runs
 * in Expo Go.
 */
export function SuccessOverlay({
  visible,
  title,
  message,
  actionTitle,
  onAction,
  secondaryTitle,
  onSecondary,
  autoDismissMs,
  onDismiss,
  icon = 'checkmark',
  sound = true,
}: SuccessOverlayProps) {
  const { colors } = useTheme();
  const { width, height } = useWindowDimensions();

  // One driver per stage so they can overlap slightly.
  const wash = useRef(new Animated.Value(0)).current;
  const tick = useRef(new Animated.Value(0)).current;
  const ring = useRef(new Animated.Value(0)).current;
  const copy = useRef(new Animated.Value(0)).current;

  // The circle has to cover the corners, so use the diagonal.
  const radius = Math.sqrt(width * width + height * height);

  useEffect(() => {
    if (!visible) {
      wash.setValue(0);
      tick.setValue(0);
      ring.setValue(0);
      copy.setValue(0);
      return;
    }

    successTap();
    if (sound) playChime();
    Animated.sequence([
      // 1. Blue floods out from the centre.
      Animated.timing(wash, {
        toValue: 1,
        duration: 420,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.parallel([
        // 2. Tick springs in…
        Animated.spring(tick, {
          toValue: 1,
          speed: 12,
          bounciness: 12,
          useNativeDriver: true,
        }),
        // …with a ring pulsing outward behind it.
        Animated.timing(ring, {
          toValue: 1,
          duration: 700,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
      // 3. Copy rises.
      Animated.timing(copy, {
        toValue: 1,
        duration: 320,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();

    if (autoDismissMs && onDismiss) {
      const timer = setTimeout(onDismiss, autoDismissMs);
      return () => clearTimeout(timer);
    }
  }, [visible, sound, wash, tick, ring, copy, autoDismissMs, onDismiss]);

  if (!visible) return null;

  return (
    <Modal transparent visible animationType="none" statusBarTranslucent onRequestClose={onDismiss}>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        {/* Expanding brand-blue wash */}
        <Animated.View
          style={{
            position: 'absolute',
            width: radius * 2,
            height: radius * 2,
            borderRadius: radius,
            transform: [
              { scale: wash.interpolate({ inputRange: [0, 1], outputRange: [0, 1] }) },
            ],
            opacity: wash.interpolate({ inputRange: [0, 0.15, 1], outputRange: [0, 1, 1] }),
          }}
        >
          <LinearGradient
            colors={[colors.primary, colors.accent]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={{ flex: 1, borderRadius: radius }}
          />
        </Animated.View>

        <View style={{ alignItems: 'center', paddingHorizontal: space.s6, gap: space.s5 }}>
          <View style={{ alignItems: 'center', justifyContent: 'center' }}>
            {/* Pulse ring */}
            <Animated.View
              style={{
                position: 'absolute',
                width: 108,
                height: 108,
                borderRadius: 54,
                borderWidth: 2,
                borderColor: '#FFFFFF',
                opacity: ring.interpolate({ inputRange: [0, 0.4, 1], outputRange: [0, 0.5, 0] }),
                transform: [
                  { scale: ring.interpolate({ inputRange: [0, 1], outputRange: [0.8, 1.9] }) },
                ],
              }}
            />
            {/* Tick */}
            <Animated.View
              style={{
                width: 108,
                height: 108,
                borderRadius: 54,
                backgroundColor: 'rgba(255,255,255,0.16)',
                borderWidth: 2,
                borderColor: 'rgba(255,255,255,0.5)',
                alignItems: 'center',
                justifyContent: 'center',
                transform: [{ scale: tick }],
              }}
            >
              <Ionicons name={icon} size={54} color="#FFFFFF" />
            </Animated.View>
          </View>

          <Animated.View
            style={{
              alignItems: 'center',
              gap: space.s2,
              opacity: copy,
              transform: [
                { translateY: copy.interpolate({ inputRange: [0, 1], outputRange: [14, 0] }) },
              ],
            }}
          >
            <AppText variant="h1" style={{ color: '#FFFFFF', textAlign: 'center' }}>
              {title}
            </AppText>
            {message ? (
              <AppText
                variant="body"
                style={{ color: 'rgba(255,255,255,0.85)', textAlign: 'center' }}
              >
                {message}
              </AppText>
            ) : null}
          </Animated.View>

          {(actionTitle || secondaryTitle) && (
            <Animated.View
              style={{
                alignSelf: 'stretch',
                gap: space.s3,
                opacity: copy,
                transform: [
                  { translateY: copy.interpolate({ inputRange: [0, 1], outputRange: [18, 0] }) },
                ],
              }}
            >
              {actionTitle && onAction && (
                <Button
                  title={actionTitle}
                  fullWidth
                  onPress={onAction}
                  style={{ backgroundColor: '#FFFFFF' }}
                  textColor={colors.primary}
                />
              )}
              {secondaryTitle && onSecondary && (
                <Button
                  title={secondaryTitle}
                  variant="text"
                  fullWidth
                  onPress={onSecondary}
                  textColor="#FFFFFF"
                />
              )}
            </Animated.View>
          )}
        </View>
      </View>
    </Modal>
  );
}
