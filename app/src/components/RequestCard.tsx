import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useRef } from 'react';
import { Animated, Easing, Pressable, View } from 'react-native';

import { Avatar } from './ui/Avatar';
import { Badge } from './ui/badges';
import { AppText } from './ui/Text';
import { formatJmd, timeAgo } from '@/lib/format';
import { useTheme } from '@/theme/ThemeContext';
import { radius, space } from '@/theme/tokens';
import type { IncomingRequest, JobUrgency } from '@/types/db';

const URGENCY: Record<JobUrgency, { label: string; icon: keyof typeof Ionicons.glyphMap }> = {
  low: { label: 'Flexible', icon: 'time-outline' },
  normal: { label: 'Normal', icon: 'time-outline' },
  high: { label: 'Urgent', icon: 'flash-outline' },
  emergency: { label: 'Emergency', icon: 'warning-outline' },
};

interface RequestCardProps {
  request: IncomingRequest;
  /** Just arrived — breathe, so the worker's eye goes straight to it. */
  fresh?: boolean;
  onPress: () => void;
}

/**
 * An unanswered job request on the worker's device.
 *
 * Heavier than a normal booking row on purpose: this is a decision, not a
 * history entry, so it leads with who is asking (and whether they are
 * verified), then what and when, then the money.
 */
export function RequestCard({ request, fresh = false, onPress }: RequestCardProps) {
  const { colors, isDark } = useTheme();
  const glow = useRef(new Animated.Value(0)).current;
  const enter = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(enter, {
      toValue: 1,
      duration: 320,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [enter]);

  useEffect(() => {
    if (!fresh) {
      glow.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(glow, {
          toValue: 1,
          duration: 900,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(glow, {
          toValue: 0,
          duration: 900,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [fresh, glow]);

  const urgency = URGENCY[request.urgency];
  const budget = request.budget_max_jmd ?? request.budget_min_jmd;

  return (
    <Animated.View
      style={{
        opacity: enter,
        transform: [
          { translateY: enter.interpolate({ inputRange: [0, 1], outputRange: [14, 0] }) },
        ],
      }}
    >
      <Pressable accessibilityRole="button" onPress={onPress}>
        {({ pressed }) => (
          <View
            style={{
              backgroundColor: colors.surfaceRaised,
              borderRadius: radius.lg,
              borderWidth: 1,
              borderColor: fresh ? colors.accent : colors.border,
              overflow: 'hidden',
              opacity: pressed ? 0.92 : 1,
            }}
          >
            {/* Pulsing accent wash while the request is brand new. */}
            <Animated.View
              pointerEvents="none"
              style={{
                position: 'absolute',
                left: 0,
                right: 0,
                top: 0,
                bottom: 0,
                backgroundColor: colors.accentSoft,
                opacity: glow.interpolate({ inputRange: [0, 1], outputRange: [0, 0.9] }),
              }}
            />

            <View style={{ padding: space.s4, gap: space.s3 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.s3 }}>
                <Avatar name={request.customer_name} uri={request.customer_avatar} size="md" />
                <View style={{ flex: 1, gap: 2 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.s2 }}>
                    <AppText variant="label" numberOfLines={1} style={{ flexShrink: 1 }}>
                      {request.customer_name}
                    </AppText>
                    {request.customer_verified && <Badge kind="verified" compact />}
                  </View>
                  <AppText variant="caption" color="textMuted">
                    asked {timeAgo(request.requested_at)}
                  </AppText>
                </View>
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: space.s1,
                    paddingHorizontal: space.s2,
                    paddingVertical: 3,
                    borderRadius: radius.full,
                    backgroundColor:
                      request.urgency === 'emergency' || request.urgency === 'high'
                        ? colors.warningSoft
                        : colors.accentSoft,
                  }}
                >
                  <Ionicons
                    name={urgency.icon}
                    size={11}
                    color={
                      request.urgency === 'emergency' || request.urgency === 'high'
                        ? colors.warning
                        : colors.accent
                    }
                  />
                  <AppText
                    variant="caption"
                    style={{
                      color:
                        request.urgency === 'emergency' || request.urgency === 'high'
                          ? colors.warning
                          : colors.accent,
                    }}
                  >
                    {urgency.label}
                  </AppText>
                </View>
              </View>

              <View style={{ gap: space.s1 }}>
                <AppText variant="body" numberOfLines={1}>
                  {request.title}
                </AppText>
                {request.description ? (
                  <AppText variant="bodySm" color="textMuted" numberOfLines={2}>
                    {request.description}
                  </AppText>
                ) : null}
              </View>

              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: space.s2,
                }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.s1, flex: 1 }}>
                  <Ionicons name="location-outline" size={13} color={colors.textMuted} />
                  <AppText variant="caption" color="textMuted" numberOfLines={1}>
                    {request.parish ?? 'Jamaica'}
                  </AppText>
                </View>
                {budget != null && (
                  <AppText variant="label" color="accent">
                    {formatJmd(budget)}
                  </AppText>
                )}
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: space.s1,
                    paddingLeft: space.s2,
                  }}
                >
                  <AppText variant="caption" style={{ color: colors.accent }}>
                    Review
                  </AppText>
                  <Ionicons name="chevron-forward" size={14} color={colors.accent} />
                </View>
              </View>
            </View>

            {/* Accent rail: this card is an action, not a record. */}
            <View
              style={{
                position: 'absolute',
                left: 0,
                top: 0,
                bottom: 0,
                width: 3,
                backgroundColor: isDark ? colors.accent : colors.primary,
              }}
            />
          </View>
        )}
      </Pressable>
    </Animated.View>
  );
}
