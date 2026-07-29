import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useFocusEffect } from 'expo-router';
import React, { useCallback, useMemo, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Screen } from '@/components/ui/Screen';
import { SuccessOverlay } from '@/components/ui/SuccessOverlay';
import { AppText } from '@/components/ui/Text';
import { FadeSlideIn, ScalePress } from '@/components/ui/animated';
import { LoadingState } from '@/components/ui/states';
import { JourneyMap } from '@/features/formalization/JourneyMap';
import { buildJourney } from '@/features/formalization/stages';
import { logEvent } from '@/lib/events';
import { formatJmd } from '@/lib/format';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/AuthProvider';
import { useTheme } from '@/theme/ThemeContext';
import { radius, space } from '@/theme/tokens';
import type { ChecklistStep, FormalizationProgress } from '@/types/db';

/**
 * The formalization pathway (FR-BIZ-2) — the third pillar of the product, and
 * the one that turns a marketplace into a route out of the informal economy.
 *
 * Rebuilt from a menu of forms into a journey: where you are, the single next
 * action, what it costs, and what finishing each stage unlocks. The
 * information was always here — presenting it as paperwork is what made people
 * bounce off it.
 *
 * Everything on this screen is deterministic config + SQL. BizBot (RAG) only
 * answers the open questions asked along the way; it never decides what the
 * steps are (CLAUDE.md §4.3). Activation is always the worker's explicit
 * choice (FR-BIZ-6/7).
 */
export default function FormalizeScreen() {
  const { session } = useAuth();
  const { colors, isDark } = useTheme();
  const [progress, setProgress] = useState<FormalizationProgress | null | 'none'>(null);
  const [steps, setSteps] = useState<ChecklistStep[]>([]);
  const [busy, setBusy] = useState(false);
  const [milestone, setMilestone] = useState<string | null>(null);
  // Remembered so finishing a stage is recognised as a TRANSITION, not a state.
  const completedStages = useRef<Set<string> | null>(null);

  const load = useCallback(async () => {
    if (!session) return;
    const [progressRes, stepsRes] = await Promise.all([
      supabase
        .from('formalization_progress')
        .select('*')
        .eq('user_id', session.user.id)
        .maybeSingle(),
      supabase.rpc('get_worker_checklist', { p_user: session.user.id }),
    ]);
    const rows = (stepsRes.data as ChecklistStep[] | null) ?? [];
    const built = buildJourney(rows);

    // A stage that was incomplete last time and is complete now → celebrate.
    const nowComplete = new Set(
      built.stages.filter((stage) => stage.complete).map((stage) => stage.key),
    );
    if (completedStages.current) {
      const fresh = [...nowComplete].find((key) => !completedStages.current?.has(key));
      if (fresh) {
        setMilestone(built.stages.find((stage) => stage.key === fresh)?.unlocks ?? null);
      }
    }
    completedStages.current = nowComplete;

    setProgress((progressRes.data as FormalizationProgress | null) ?? 'none');
    setSteps(rows);
  }, [session]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const journey = useMemo(() => buildJourney(steps), [steps]);

  if (progress === null) {
    return (
      <Screen scroll={false}>
        <LoadingState label="Loading your pathway…" />
      </Screen>
    );
  }

  const status = progress === 'none' ? 'not_started' : progress.status;
  const active = status === 'active' || status === 'completed';
  const pct = journey.totalRequired > 0 ? journey.totalDone / journey.totalRequired : 0;
  const allDone = journey.currentStage === null && journey.totalRequired > 0;

  const activate = async () => {
    setBusy(true);
    await supabase.rpc('activate_formalization');
    logEvent('formalization_activated');
    setBusy(false);
    void load();
  };

  /* ── Not started: make the argument before asking for anything ────────── */
  if (!active) {
    return (
      <Screen>
        <View style={{ gap: space.s5 }}>
          <FadeSlideIn>
            <LinearGradient
              colors={[colors.primary, colors.accent]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={{ borderRadius: radius.lg, padding: space.s5, gap: space.s3 }}
            >
              <Ionicons name="ribbon" size={30} color="#FFFFFF" />
              <AppText variant="h1" style={{ color: '#FFFFFF' }}>
                From hustle{'\n'}to business.
              </AppText>
              <AppText variant="body" style={{ color: 'rgba(255,255,255,0.9)' }}>
                {status === 'suggested'
                  ? "Your record says you're ready. Eight steps, at your pace, and myB walks you through every one."
                  : 'Registering turns steady work into a business banks, companies and government agencies can deal with. Eight steps, at your pace.'}
              </AppText>
            </LinearGradient>
          </FadeSlideIn>

          {/* The argument, not the paperwork. */}
          <FadeSlideIn delay={80}>
            <View style={{ gap: space.s3 }}>
              {[
                {
                  icon: 'cash-outline' as const,
                  title: 'Loans stop being a maybe',
                  body: 'Your myB job history is already a record of income. Registering turns it into evidence a lender accepts.',
                },
                {
                  icon: 'business-outline' as const,
                  title: 'Bigger customers can hire you',
                  body: 'Companies and government agencies cannot pay an unregistered contractor. Registration is the gate.',
                },
                {
                  icon: 'shield-checkmark-outline' as const,
                  title: 'You get a safety net',
                  body: 'NIS is a pension and injury cover. Working for yourself, nobody else provides it.',
                },
                {
                  icon: 'happy-outline' as const,
                  title: '“Tax man a go come fi mi”',
                  body: 'Income below the threshold owes no income tax, and GCT only starts at J$15 million in sales. For most people the real cost of being formal is small.',
                },
              ].map((item) => (
                <Card key={item.title}>
                  <View style={{ flexDirection: 'row', gap: space.s3 }}>
                    <Ionicons name={item.icon} size={22} color={colors.accent} />
                    <View style={{ flex: 1, gap: 2 }}>
                      <AppText variant="label">{item.title}</AppText>
                      <AppText variant="bodySm" color="textMuted">
                        {item.body}
                      </AppText>
                    </View>
                  </View>
                </Card>
              ))}
            </View>
          </FadeSlideIn>

          <FadeSlideIn delay={160}>
            <View style={{ gap: space.s3 }}>
              <Button
                title={status === 'suggested' ? "Yes, I'm ready" : 'Start my pathway'}
                icon="rocket-outline"
                fullWidth
                loading={busy}
                onPress={activate}
              />
              <Button
                title="Ask BizBot a question first"
                variant="secondary"
                icon="sparkles"
                fullWidth
                onPress={() => router.push('/formalize/bizbot')}
              />
              <AppText variant="caption" color="textMuted" style={{ textAlign: 'center' }}>
                Nothing is filed on your behalf. myB shows you what to do and tracks what you
                have done — every step stays yours to take.
              </AppText>
            </View>
          </FadeSlideIn>
        </View>
      </Screen>
    );
  }

  /* ── Active: the journey ──────────────────────────────────────────────── */
  return (
    <Screen>
      {milestone && (
        <SuccessOverlay
          visible
          icon="lock-open"
          title="Stage complete!"
          message={milestone}
          actionTitle="Keep going"
          onAction={() => setMilestone(null)}
        />
      )}

      <View style={{ gap: space.s5 }}>
        {/* Where you are, in one glance */}
        <FadeSlideIn>
          <LinearGradient
            colors={isDark ? [colors.primary, '#0B0E16'] : [colors.primary, colors.accent]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={{ borderRadius: radius.lg, padding: space.s5, gap: space.s4 }}
          >
            <View style={{ gap: space.s1 }}>
              <AppText variant="overline" style={{ color: 'rgba(255,255,255,0.75)' }}>
                {allDone ? 'Journey complete' : `Stage ${stageNumber(journey)} of 4`}
              </AppText>
              <AppText variant="h2" style={{ color: '#FFFFFF' }}>
                {allDone ? "You're a registered business" : journey.currentStage?.label}
              </AppText>
            </View>

            {/* Drawn here rather than reusing ProgressBar so it can sit on the
                gradient without fighting that component's own colour tokens. */}
            <View
              style={{
                height: 8,
                borderRadius: radius.full,
                backgroundColor: 'rgba(255,255,255,0.25)',
                overflow: 'hidden',
              }}
            >
              <View
                style={{
                  width: `${Math.round(pct * 100)}%`,
                  height: '100%',
                  borderRadius: radius.full,
                  backgroundColor: '#FFFFFF',
                }}
              />
            </View>

            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <AppText variant="caption" style={{ color: 'rgba(255,255,255,0.9)' }}>
                {journey.totalDone} of {journey.totalRequired} required steps
              </AppText>
              <AppText variant="caption" style={{ color: 'rgba(255,255,255,0.9)' }}>
                {Math.round(pct * 100)}%
              </AppText>
            </View>
          </LinearGradient>
        </FadeSlideIn>

        {/* What is left, in money and days — the two questions everybody has */}
        {!allDone && (
          <FadeSlideIn delay={60}>
            <View style={{ flexDirection: 'row', gap: space.s3 }}>
              <Metric
                icon="cash-outline"
                value={journey.remainingCostJmd > 0 ? formatJmd(journey.remainingCostJmd) : 'Free'}
                label="left to spend"
              />
              <Metric
                icon="time-outline"
                value={journey.remainingDays > 0 ? `${journey.remainingDays} days` : 'Same day'}
                label="of waiting"
              />
            </View>
          </FadeSlideIn>
        )}

        {/* The single next action */}
        {journey.nextStep && (
          <FadeSlideIn delay={120}>
            <ScalePress
              haptic
              onPress={() =>
                router.push({
                  pathname: '/formalize/step/[id]',
                  params: { id: String(journey.nextStep?.id) },
                })
              }
            >
              <View
                style={{
                  borderRadius: radius.lg,
                  borderWidth: 1,
                  borderColor: colors.accent,
                  backgroundColor: colors.surface,
                  padding: space.s4,
                  gap: space.s3,
                }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.s2 }}>
                  <View
                    style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: colors.accent }}
                  />
                  <AppText variant="overline" color="accent">
                    Do this next
                  </AppText>
                </View>
                <AppText variant="h3">{journey.nextStep.title}</AppText>
                <AppText variant="bodySm" color="textMuted" numberOfLines={2}>
                  {journey.nextStep.benefit || journey.nextStep.description}
                </AppText>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.s4 }}>
                  <Tag icon="business-outline" label={journey.nextStep.agency} />
                  {journey.nextStep.est_cost_jmd != null && (
                    <Tag
                      icon="cash-outline"
                      label={
                        Number(journey.nextStep.est_cost_jmd) > 0
                          ? formatJmd(journey.nextStep.est_cost_jmd)
                          : 'Free'
                      }
                    />
                  )}
                  {journey.nextStep.est_days != null && (
                    <Tag icon="time-outline" label={`${journey.nextStep.est_days}d`} />
                  )}
                </View>
              </View>
            </ScalePress>
          </FadeSlideIn>
        )}

        {/* The road */}
        <FadeSlideIn delay={180}>
          <View style={{ gap: space.s4 }}>
            <AppText variant="overline" color="textMuted">
              Your route
            </AppText>
            <JourneyMap
              stages={journey.stages}
              currentKey={journey.currentStage?.key ?? null}
              onSelectStep={(stepId) =>
                router.push({
                  pathname: '/formalize/step/[id]',
                  params: { id: String(stepId) },
                })
              }
            />
          </View>
        </FadeSlideIn>

        {/* BizBot, in context rather than as a separate destination */}
        <FadeSlideIn delay={240}>
          <ScalePress haptic onPress={() => router.push('/formalize/bizbot')}>
            <LinearGradient
              colors={[colors.primary, colors.accent]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={{
                borderRadius: radius.lg,
                padding: space.s4,
                flexDirection: 'row',
                alignItems: 'center',
                gap: space.s3,
              }}
            >
              <Ionicons name="sparkles" size={22} color="#FFFFFF" />
              <View style={{ flex: 1, gap: 2 }}>
                <AppText variant="label" style={{ color: '#FFFFFF' }}>
                  Stuck on something?
                </AppText>
                <AppText variant="caption" style={{ color: 'rgba(255,255,255,0.85)' }}>
                  BizBot answers from the official documents, and cites them.
                </AppText>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#FFFFFF" />
            </LinearGradient>
          </ScalePress>
        </FadeSlideIn>

        <Pressable
          accessibilityRole="button"
          onPress={() => router.push('/formalize/checklist')}
          style={({ pressed }) => ({ alignItems: 'center', opacity: pressed ? 0.6 : 1 })}
        >
          <AppText variant="bodySm" color="accent">
            See every step and document
          </AppText>
        </Pressable>

        <Pressable
          accessibilityRole="button"
          onPress={() => router.push('/formalize/questionnaire')}
          style={({ pressed }) => ({ alignItems: 'center', opacity: pressed ? 0.6 : 1 })}
        >
          <AppText variant="caption" color="textMuted">
            {progress !== 'none' && progress.readiness_score != null
              ? `Readiness score ${progress.readiness_score}/16 · retake`
              : 'Take the readiness check'}
          </AppText>
        </Pressable>
      </View>
    </Screen>
  );
}

/** 1-based stage number for the hero, clamped so "complete" never reads 5. */
function stageNumber(journey: ReturnType<typeof buildJourney>): number {
  const index = journey.stages.findIndex((stage) => stage.key === journey.currentStage?.key);
  return index < 0 ? journey.stages.length : index + 1;
}

function Metric({
  icon,
  value,
  label,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  value: string;
  label: string;
}) {
  const { colors } = useTheme();
  return (
    <View
      style={{
        flex: 1,
        gap: 2,
        padding: space.s4,
        borderRadius: radius.lg,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.surface,
      }}
    >
      <Ionicons name={icon} size={16} color={colors.accent} />
      <AppText variant="h3" numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </AppText>
      <AppText variant="caption" color="textMuted">
        {label}
      </AppText>
    </View>
  );
}

function Tag({ icon, label }: { icon: keyof typeof Ionicons.glyphMap; label: string }) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.s1, flexShrink: 1 }}>
      <Ionicons name={icon} size={12} color={colors.textMuted} />
      <AppText variant="caption" color="textMuted" numberOfLines={1}>
        {label}
      </AppText>
    </View>
  );
}
