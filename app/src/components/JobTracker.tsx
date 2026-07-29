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

/**
 * How many of the four steps are FINISHED at each status.
 *
 * This used to be "index of the current step", which meant a completed job sat
 * at index 3 with step 3 merely *current* — so the last rail stayed grey and
 * the track never actually reached Completed. Counting finished steps makes
 * the terminal state a full track, which is what the screen is claiming.
 */
const DONE_THROUGH: Record<JobStatus, number> = {
  requested: 1,
  accepted: 2,
  in_progress: 3,
  completed: 4,
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
  const doneThrough = DONE_THROUGH[job.status];
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
  }, [fill, doneThrough]);

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
          const done = index < doneThrough;
          const current = index === doneThrough;
          const last = index === STEPS.length - 1;
          const tint = done || current ? colors.accent : colors.textMuted;
          const stamp = step.at(job);

          return (
            <View key={step.key} style={{ flex: 1, alignItems: 'center', gap: space.s2 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', alignSelf: 'stretch' }}>
                {/* Rail in: filled once this step has been reached at all. */}
                <Animated.View
                  style={{
                    flex: 1,
                    height: 2,
                    borderRadius: 1,
                    backgroundColor:
                      index > 0 && (done || current) ? colors.accent : colors.border,
                    opacity: index === 0 ? 0 : done || current ? fill : 1,
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
                      backgroundColor: done || current ? colors.accent : colors.surfaceRaised,
                      borderWidth: 1,
                      borderColor: done || current ? colors.accent : colors.border,
                    }}
                  >
                    {/* The finish line keeps its trophy; the rest tick off. */}
                    <Ionicons
                      name={done && !last ? 'checkmark' : step.icon}
                      size={14}
                      color={done || current ? '#FFFFFF' : colors.textMuted}
                    />
                  </View>
                </View>
                {/* Rail out: filled once the NEXT step has been reached. */}
                <Animated.View
                  style={{
                    flex: 1,
                    height: 2,
                    borderRadius: 1,
                    backgroundColor: index < doneThrough ? colors.accent : colors.border,
                    opacity: last ? 0 : index < doneThrough ? fill : 1,
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
                {stamp && (done || current) ? (
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
