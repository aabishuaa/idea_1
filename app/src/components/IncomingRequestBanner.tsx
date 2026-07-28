import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router, usePathname } from 'expo-router';
import React, { useCallback, useEffect, useRef } from 'react';
import { Animated, Easing, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar } from './ui/Avatar';
import { AppText } from './ui/Text';
import { successTap } from './ui/animated';
import { formatJmd } from '@/lib/format';
import { playChime } from '@/lib/sound';
import { useRequests } from '@/providers/RequestsProvider';
import { useTheme } from '@/theme/ThemeContext';
import { radius, space } from '@/theme/tokens';

const VISIBLE_MS = 8000;

/**
 * "You have a job!" — the banner that drops from the top of whatever screen
 * the worker is on the instant a customer sends them a request.
 *
 * Mounted once at the root so it works everywhere, including mid-chat or
 * mid-BizBot. Tapping goes straight to the decision screen; otherwise it
 * retreats after a few seconds and the request waits in Bookings.
 */
export function IncomingRequestBanner() {
  const { arrival, dismissArrival } = useRequests();
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const pathname = usePathname();
  const drop = useRef(new Animated.Value(0)).current;

  // Already looking at the request? Then the banner is noise.
  const suppressed = pathname?.startsWith('/request') ?? false;
  const request = suppressed ? null : arrival;

  const retreat = useCallback(
    (then?: () => void) => {
      Animated.timing(drop, {
        toValue: 0,
        duration: 220,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }).start(() => {
        dismissArrival();
        then?.();
      });
    },
    [drop, dismissArrival],
  );

  useEffect(() => {
    if (!request) return;

    successTap();
    playChime();
    Animated.spring(drop, {
      toValue: 1,
      speed: 13,
      bounciness: 9,
      useNativeDriver: true,
    }).start();

    const timer = setTimeout(() => retreat(), VISIBLE_MS);
    return () => clearTimeout(timer);
  }, [request, drop, retreat]);

  useEffect(() => {
    if (suppressed && arrival) dismissArrival();
  }, [suppressed, arrival, dismissArrival]);

  if (!request) return null;

  const budget = request.budget_max_jmd ?? request.budget_min_jmd;

  return (
    <Animated.View
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        paddingTop: insets.top + space.s2,
        paddingHorizontal: space.s3,
        opacity: drop,
        transform: [
          { translateY: drop.interpolate({ inputRange: [0, 1], outputRange: [-160, 0] }) },
        ],
      }}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`New job request from ${request.customer_name}. Tap to review.`}
        onPress={() =>
          retreat(() => router.push({ pathname: '/request/[id]', params: { id: request.id } }))
        }
      >
        {({ pressed }) => (
          <View
            style={{
              borderRadius: radius.lg,
              overflow: 'hidden',
              opacity: pressed ? 0.92 : 1,
              ...(isDark
                ? { borderWidth: 1, borderColor: colors.accent }
                : {
                    shadowColor: '#101828',
                    shadowOpacity: 0.22,
                    shadowRadius: 20,
                    shadowOffset: { width: 0, height: 8 },
                    elevation: 12,
                  }),
            }}
          >
            <LinearGradient
              colors={[colors.primary, colors.accent]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={{ padding: space.s4, gap: space.s3 }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.s2 }}>
                <Ionicons name="notifications" size={14} color="#FFFFFF" />
                <AppText
                  variant="overline"
                  style={{ color: 'rgba(255,255,255,0.9)', flex: 1 }}
                >
                  New job request
                </AppText>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Dismiss"
                  hitSlop={10}
                  onPress={() => retreat()}
                >
                  <Ionicons name="close" size={16} color="rgba(255,255,255,0.8)" />
                </Pressable>
              </View>

              <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.s3 }}>
                <Avatar name={request.customer_name} uri={request.customer_avatar} size="md" />
                <View style={{ flex: 1, gap: 2 }}>
                  <AppText
                    variant="label"
                    style={{ color: '#FFFFFF' }}
                    numberOfLines={1}
                  >
                    {request.customer_name}
                  </AppText>
                  <AppText
                    variant="bodySm"
                    style={{ color: 'rgba(255,255,255,0.88)' }}
                    numberOfLines={1}
                  >
                    {request.title}
                  </AppText>
                </View>
                {budget != null && (
                  <AppText variant="label" style={{ color: '#FFFFFF' }}>
                    {formatJmd(budget)}
                  </AppText>
                )}
              </View>

              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'flex-end',
                  gap: space.s1,
                }}
              >
                <AppText variant="caption" style={{ color: '#FFFFFF' }}>
                  Tap to review
                </AppText>
                <Ionicons name="arrow-forward" size={13} color="#FFFFFF" />
              </View>
            </LinearGradient>
          </View>
        )}
      </Pressable>
    </Animated.View>
  );
}
