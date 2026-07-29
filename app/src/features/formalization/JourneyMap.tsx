import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useRef } from 'react';
import { Animated, Easing, Pressable, View } from 'react-native';

import { AppText } from '@/components/ui/Text';
import { lightTap } from '@/components/ui/animated';
import { useTheme } from '@/theme/ThemeContext';
import { radius, space } from '@/theme/tokens';
import type { StageProgress } from './stages';

interface JourneyMapProps {
  stages: StageProgress[];
  currentKey: string | null;
  onSelectStep: (stepId: number) => void;
}

/**
 * The road from hustle to registered business, drawn as a road.
 *
 * This screen used to be a list of forms, which is exactly what makes people
 * give up on formalizing: it looks like paperwork, so it feels like paperwork.
 * Seeing four stages with your position on them — and what each one opens up —
 * turns the same information into a route you are already partway along.
 */
export function JourneyMap({ stages, currentKey, onSelectStep }: JourneyMapProps) {
  const { colors } = useTheme();

  return (
    <View>
      {stages.map((stage, index) => {
        const isCurrent = stage.key === currentKey;
        const isLast = index === stages.length - 1;
        const tone = stage.complete
          ? colors.success
          : isCurrent
            ? colors.accent
            : colors.textMuted;

        return (
          <View key={stage.key} style={{ flexDirection: 'row', gap: space.s3 }}>
            {/* The road itself */}
            <View style={{ alignItems: 'center', width: 36 }}>
              <StageNode
                icon={stage.complete ? 'checkmark' : stage.icon}
                tone={tone}
                filled={stage.complete || isCurrent}
                pulsing={isCurrent}
              />
              {!isLast && (
                <View
                  style={{
                    flex: 1,
                    width: 2,
                    minHeight: 24,
                    backgroundColor: stage.complete ? colors.success : colors.border,
                  }}
                />
              )}
            </View>

            <View style={{ flex: 1, paddingBottom: isLast ? 0 : space.s5, gap: space.s2 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.s2 }}>
                <AppText variant="label" style={{ color: tone, flex: 1 }}>
                  {stage.label}
                </AppText>
                <AppText variant="caption" color="textMuted">
                  {stage.done}/{stage.steps.length}
                </AppText>
              </View>

              <AppText variant="caption" color="textMuted">
                {stage.blurb}
              </AppText>

              {/* What finishing this stage buys you — the reason to do it. */}
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'flex-start',
                  gap: space.s2,
                  padding: space.s2,
                  borderRadius: radius.sm,
                  backgroundColor: stage.complete ? colors.successSoft : colors.accentSoft,
                }}
              >
                <Ionicons
                  name={stage.complete ? 'lock-open' : 'key-outline'}
                  size={13}
                  color={stage.complete ? colors.success : colors.accent}
                />
                <AppText
                  variant="caption"
                  style={{ flex: 1, color: stage.complete ? colors.success : colors.accent }}
                >
                  {stage.unlocks}
                </AppText>
              </View>

              {/* The current stage opens up; finished and future ones stay shut
                  so the screen reads as one thing to do, not sixteen. */}
              {isCurrent && (
                <View style={{ gap: space.s2, paddingTop: space.s1 }}>
                  {stage.steps.map((step) => (
                    <Pressable
                      key={step.id}
                      accessibilityRole="button"
                      accessibilityState={{ checked: step.done }}
                      onPress={() => {
                        lightTap();
                        onSelectStep(step.id);
                      }}
                      style={({ pressed }) => ({
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: space.s3,
                        padding: space.s3,
                        borderRadius: radius.md,
                        borderWidth: 1,
                        borderColor: step.done ? colors.border : colors.accent,
                        backgroundColor: step.done ? 'transparent' : colors.surface,
                        opacity: pressed ? 0.75 : 1,
                      })}
                    >
                      <Ionicons
                        name={step.done ? 'checkmark-circle' : 'ellipse-outline'}
                        size={20}
                        color={step.done ? colors.success : colors.accent}
                      />
                      <View style={{ flex: 1, gap: 1 }}>
                        <AppText
                          variant="bodySm"
                          color={step.done ? 'textMuted' : 'text'}
                          numberOfLines={1}
                          style={step.done ? { textDecorationLine: 'line-through' } : undefined}
                        >
                          {step.title}
                        </AppText>
                        <AppText variant="caption" color="textMuted" numberOfLines={1}>
                          {step.agency}
                          {step.required === false ? ' · optional' : ''}
                        </AppText>
                      </View>
                      <Ionicons name="chevron-forward" size={15} color={colors.textMuted} />
                    </Pressable>
                  ))}
                </View>
              )}
            </View>
          </View>
        );
      })}
    </View>
  );
}

function StageNode({
  icon,
  tone,
  filled,
  pulsing,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  tone: string;
  filled: boolean;
  pulsing: boolean;
}) {
  const { colors } = useTheme();
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!pulsing) {
      pulse.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 1100,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 1100,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulsing, pulse]);

  return (
    <View style={{ alignItems: 'center', justifyContent: 'center' }}>
      {pulsing && (
        <Animated.View
          style={{
            position: 'absolute',
            width: 44,
            height: 44,
            borderRadius: 22,
            backgroundColor: colors.accentSoft,
            opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.35, 1] }),
            transform: [
              { scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.8, 1.15] }) },
            ],
          }}
        />
      )}
      <View
        style={{
          width: 34,
          height: 34,
          borderRadius: 17,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: filled ? tone : colors.surface,
          borderWidth: 1,
          borderColor: filled ? tone : colors.border,
        }}
      >
        <Ionicons name={icon} size={17} color={filled ? '#FFFFFF' : colors.textMuted} />
      </View>
    </View>
  );
}
