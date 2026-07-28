import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useRef } from 'react';
import { Animated, Easing, View } from 'react-native';

import { AppText } from './ui/Text';
import { useTheme } from '@/theme/ThemeContext';
import { radius, space } from '@/theme/tokens';
import type { Job, JobStatus } from '@/types/db';

interface Step {
  key: JobStatus;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  at: (job: Job) => string | null;
}

const STEPS: Step[] = [
  {
    key: 'requested',
    label: 'Requested',
    icon: 'paper-plane',
    at: (job) => job.requested_at,
  },
  {
    key: 'accepted',
    label: 'Confirmed',
    icon: 'checkmark-circle',
    at: (job) => job.responded_at,
  },
  { key: 'in_progress', label: 'In progress', icon: 'hammer', at: () => null },
  {
    key: 'completed',
    label: 'Completed',
    icon: 'trophy',
    at: (job) => job.completed_at,
  },
];

/** How far along the four-step track each status sits. */
const REACHED: Record<JobStatus, number> = {
  requested: 0,
  accepted: 1,
  in_progress: 2,
  completed: 3,
  declined: 0,
  cancelled: 0,
};

/**
 * Where a booking has got to, for both sides.
 *
 * The whole promise of the app is that agreeing work in the informal economy
 * stops being a phone call nobody can point back to — so once a job is
 * accepted it is visibly tracked, with the time each step happened.
 */
export function JobTracker({ job }: { job: Job }) {
  const { colors } = useTheme();
  const reached = REACHED[job.status];
  const ended = job.status === 'declined' || job.status === 'cancelled';

  const fill = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fill, {
      toValue: 1,
      duration: 480,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [fill, reached]);

  useEffect(() => {
    if (ended || job.status === 'completed') {
      pulse.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 1000,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 1000,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse, ended, job.status]);

  if (ended) {
    return (
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: space.s3,
          padding: space.s4,
          borderRadius: radius.lg,
          backgroundColor: colors.errorSoft,
        }}
      >
        <Ionicons name="close-circle-outline" size={20} color={colors.error} />
        <View style={{ flex: 1 }}>
          <AppText variant="label" style={{ color: colors.error }}>
            {job.status === 'declined' ? 'Request declined' : 'Booking cancelled'}
          </AppText>
          <AppText variant="caption" color="textMuted">
            {job.status === 'declined'
              ? 'The pro could not take this one on.'
              : 'This booking is no longer active.'}
          </AppText>
        </View>
      </View>
    );
  }

  return (
    <View
      style={{
        padding: space.s4,
        borderRadius: radius.lg,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.surface,
        gap: space.s3,
      }}
    >
      <AppText variant="overline" color="textMuted">
        Progress
      </AppText>

      <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
        {STEPS.map((step, index) => {
          const passed = index < reached;
          const current = index === reached;
          const tint = passed || current ? colors.accent : colors.textMuted;
          const stamp = step.at(job);

          return (
            <View key={step.key} style={{ flex: 1, alignItems: 'center', gap: space.s2 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', alignSelf: 'stretch' }}>
                {/* rail in */}
                <Animated.View
                  style={{
                    flex: 1,
                    height: 2,
                    borderRadius: 1,
                    backgroundColor: index > 0 && passed ? colors.accent : colors.border,
                    opacity: index === 0 ? 0 : passed ? fill : 1,
                  }}
                />
                <View style={{ alignItems: 'center', justifyContent: 'center' }}>
                  {current && (
                    <Animated.View
                      style={{
                        position: 'absolute',
                        width: 34,
                        height: 34,
                        borderRadius: 17,
                        backgroundColor: colors.accentSoft,
                        opacity: pulse.interpolate({
                          inputRange: [0, 1],
                          outputRange: [0.3, 1],
                        }),
                        transform: [
                          {
                            scale: pulse.interpolate({
                              inputRange: [0, 1],
                              outputRange: [0.85, 1.25],
                            }),
                          },
                        ],
                      }}
                    />
                  )}
                  <View
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: 14,
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: passed || current ? colors.accent : colors.surfaceRaised,
                      borderWidth: 1,
                      borderColor: passed || current ? colors.accent : colors.border,
                    }}
                  >
                    <Ionicons
                      name={passed ? 'checkmark' : step.icon}
                      size={14}
                      color={passed || current ? '#FFFFFF' : colors.textMuted}
                    />
                  </View>
                </View>
                {/* rail out */}
                <Animated.View
                  style={{
                    flex: 1,
                    height: 2,
                    borderRadius: 1,
                    backgroundColor: index < reached ? colors.accent : colors.border,
                    opacity: index === STEPS.length - 1 ? 0 : index < reached ? fill : 1,
                  }}
                />
              </View>

              <View style={{ alignItems: 'center', gap: 1 }}>
                <AppText
                  variant="caption"
                  style={{ color: tint, textAlign: 'center' }}
                  numberOfLines={2}
                >
                  {step.label}
                </AppText>
                {stamp && (passed || current) ? (
                  <AppText variant="caption" color="textMuted" style={{ fontSize: 10 }}>
                    {new Date(stamp).toLocaleDateString('en-JM', {
                      day: 'numeric',
                      month: 'short',
                    })}
                  </AppText>
                ) : null}
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
}
