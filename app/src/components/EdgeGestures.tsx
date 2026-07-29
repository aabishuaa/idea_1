import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import React, { useMemo, useRef } from 'react';
import { Animated, PanResponder, View } from 'react-native';

import { AppText } from './ui/Text';
import { lightTap } from './ui/animated';
import { useAuth } from '@/providers/AuthProvider';
import { useDrawer } from '@/providers/DrawerProvider';
import { useTheme } from '@/theme/ThemeContext';
import { radius, space } from '@/theme/tokens';

/** How far a leftward drag must travel before it counts as "open BizBot". */
const TRIGGER = 90;

/**
 * Horizontal swipes anywhere in the tabs.
 *
 *   ← right-to-left  opens BizBot (workers only — a customer-only account has
 *                    no use for business-formalization answers, the same
 *                    gating as the drawer and the home card)
 *   → left-to-right  opens the sidebar, which is the way to everything else
 *                    including Home
 *
 * PanResponder rather than a gesture library because the app runs in Expo Go.
 * The gesture is only claimed on a clearly horizontal drag (|dx| > 2·|dy|), so
 * vertical scrolling inside every tab keeps working untouched.
 */
export function EdgeGestures({ children }: { children: React.ReactNode }) {
  const { profile } = useAuth();
  const { openDrawer } = useDrawer();
  const { colors } = useTheme();
  const drag = useRef(new Animated.Value(0)).current;
  const bizbotEnabled = profile?.is_worker === true;

  const responder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_event, gesture) => {
          const horizontal = Math.abs(gesture.dx) > Math.abs(gesture.dy) * 2;
          if (!horizontal) return false;
          if (gesture.dx > 12) return true; // → sidebar, for everyone
          return bizbotEnabled && gesture.dx < -12; // ← BizBot, workers only
        },
        onPanResponderMove: (_event, gesture) => {
          // Only the leftward drag gets a live preview; the sidebar has its
          // own entrance animation and fires on release.
          if (gesture.dx < 0) drag.setValue(Math.min(-gesture.dx, TRIGGER * 1.4));
        },
        onPanResponderRelease: (_event, gesture) => {
          Animated.spring(drag, {
            toValue: 0,
            speed: 20,
            bounciness: 6,
            useNativeDriver: true,
          }).start();

          if (gesture.dx >= TRIGGER) {
            lightTap();
            openDrawer();
            return;
          }
          if (bizbotEnabled && -gesture.dx >= TRIGGER) {
            lightTap();
            router.push('/formalize/bizbot');
          }
        },
        onPanResponderTerminate: () => {
          Animated.spring(drag, { toValue: 0, speed: 20, useNativeDriver: true }).start();
        },
      }),
    [bizbotEnabled, openDrawer, drag],
  );

  return (
    <View style={{ flex: 1 }} {...responder.panHandlers}>
      {/* The peeking edge: shows what the leftward gesture is about to do. */}
      <Animated.View
        pointerEvents="none"
        style={{
          position: 'absolute',
          right: 0,
          top: '38%',
          zIndex: 5,
          display: bizbotEnabled ? 'flex' : 'none',
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
