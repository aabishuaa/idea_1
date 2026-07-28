import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import React, { useMemo, useRef } from 'react';
import { Animated, PanResponder, View } from 'react-native';

import { AppText } from './ui/Text';
import { lightTap } from './ui/animated';
import { useAuth } from '@/providers/AuthProvider';
import { useTheme } from '@/theme/ThemeContext';
import { radius, space } from '@/theme/tokens';

/** How far a leftward drag must travel before it counts as "open BizBot". */
const TRIGGER = 90;

/**
 * Swipe right-to-left anywhere in the tabs to open BizBot.
 *
 * Workers only: BizBot answers business-formalization questions, which a
 * customer-only account has no use for — the same gating as the drawer and the
 * home card.
 *
 * Built on PanResponder rather than a gesture library because the app runs in
 * Expo Go, and it only claims the gesture on a clearly horizontal drag
 * (|dx| > 2·|dy|) so vertical scrolling inside every tab keeps working.
 */
export function SwipeToBizBot({ children }: { children: React.ReactNode }) {
  const { profile } = useAuth();
  const { colors } = useTheme();
  const drag = useRef(new Animated.Value(0)).current;
  const enabled = profile?.is_worker === true;

  const responder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_event, gesture) =>
          enabled &&
          gesture.dx < -12 &&
          Math.abs(gesture.dx) > Math.abs(gesture.dy) * 2,
        onPanResponderMove: (_event, gesture) => {
          if (gesture.dx < 0) drag.setValue(Math.min(-gesture.dx, TRIGGER * 1.4));
        },
        onPanResponderRelease: (_event, gesture) => {
          const opened = -gesture.dx >= TRIGGER;
          Animated.spring(drag, {
            toValue: 0,
            speed: 20,
            bounciness: 6,
            useNativeDriver: true,
          }).start();
          if (opened) {
            lightTap();
            router.push('/formalize/bizbot');
          }
        },
        onPanResponderTerminate: () => {
          Animated.spring(drag, { toValue: 0, speed: 20, useNativeDriver: true }).start();
        },
      }),
    [enabled, drag],
  );

  if (!enabled) return <>{children}</>;

  return (
    <View style={{ flex: 1 }} {...responder.panHandlers}>
      {/* The peeking edge: shows what the gesture is about to do. */}
      <Animated.View
        pointerEvents="none"
        style={{
          position: 'absolute',
          right: 0,
          top: '38%',
          zIndex: 5,
          opacity: drag.interpolate({
            inputRange: [0, 24, TRIGGER],
            outputRange: [0, 0.7, 1],
            extrapolate: 'clamp',
          }),
          transform: [
            {
              translateX: drag.interpolate({
                inputRange: [0, TRIGGER],
                outputRange: [70, 0],
                extrapolate: 'clamp',
              }),
            },
          ],
        }}
      >
        <LinearGradient
          colors={[colors.primary, colors.accent]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{
            alignItems: 'center',
            gap: 2,
            paddingVertical: space.s4,
            paddingHorizontal: space.s3,
            borderTopLeftRadius: radius.lg,
            borderBottomLeftRadius: radius.lg,
          }}
        >
          <Ionicons name="sparkles" size={20} color="#FFFFFF" />
          <AppText variant="caption" style={{ color: '#FFFFFF', fontSize: 10 }}>
            BizBot
          </AppText>
        </LinearGradient>
      </Animated.View>

      {/* The screen slides with the finger, so the gesture feels connected. */}
      <Animated.View
        style={{
          flex: 1,
          transform: [
            {
              translateX: drag.interpolate({
                inputRange: [0, TRIGGER * 1.4],
                outputRange: [0, -28],
                extrapolate: 'clamp',
              }),
            },
          ],
        }}
      >
        {children}
      </Animated.View>
    </View>
  );
}
