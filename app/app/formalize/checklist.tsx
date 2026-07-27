import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import { Linking, Pressable, View } from 'react-native';

import { Card } from '@/components/ui/Card';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { Screen } from '@/components/ui/Screen';
import { AppText } from '@/components/ui/Text';
import { FadeSlideIn, successTap, lightTap } from '@/components/ui/animated';
import { LoadingState } from '@/components/ui/states';
import { formatJmd } from '@/lib/format';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/AuthProvider';
import { useTheme } from '@/theme/ThemeContext';
import { radius, space } from '@/theme/tokens';
import type { ChecklistStep } from '@/types/db';

/**
 * The four stages of going formal. Grouping matters: the old flat list of
 * seven items read as homework. As a journey it reads as progress, and it
 * tells the worker what each stage actually buys them.
 */
const STAGES: {
  key: string;
  title: string;
  blurb: string;
  icon: keyof typeof Ionicons.glyphMap;
}[] = [
  {
    key: 'identity',
    title: 'Get identified',
    blurb: 'The two things every other step depends on.',
    icon: 'person-circle-outline',
  },
  {
    key: 'register',
    title: 'Make it official',
    blurb: 'One form at the Companies Office does most of this at once.',
    icon: 'document-text-outline',
  },
  {
    key: 'operate',
    title: 'Run it properly',
    blurb: 'Protect yourself and build the record lenders ask for.',
    icon: 'shield-checkmark-outline',
  },
  {
    key: 'grow',
    title: 'Go after bigger work',
    blurb: 'Optional — for company and government contracts.',
    icon: 'trending-up-outline',
  },
];

/**
 * Trade/parish document checklist (FR-BIZ-3). Resolved by
 * get_worker_checklist() from config tables — deterministic, never RAG.
 * Completing every required step marks the pathway complete → business tier.
 */
export default function ChecklistScreen() {
  const { session } = useAuth();
  const { colors } = useTheme();
  const [steps, setSteps] = useState<ChecklistStep[] | null>(null);
  const [expanded, setExpanded] = useState<number | null>(null);

  const load = useCallback(async () => {
    if (!session) return;
    const { data } = await supabase.rpc('get_worker_checklist', {
      p_user: session.user.id,
    });
    setSteps((data as ChecklistStep[] | null) ?? []);
  }, [session]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const toggle = async (step: ChecklistStep) => {
    if (!session) return;
    const nowDone = !step.done;
    if (nowDone) successTap();
    else lightTap();
    // Optimistic: the tick should feel instant.
    setSteps(
      (current) =>
        current?.map((row) => (row.id === step.id ? { ...row, done: nowDone } : row)) ?? null,
    );
    await supabase.from('checklist_progress').upsert({
      user_id: session.user.id,
      item_id: step.id,
      done: nowDone,
      done_at: nowDone ? new Date().toISOString() : null,
    });
    void load();
  };

  const grouped = useMemo(() => {
    if (!steps) return [];
    return STAGES.map((stage) => ({
      ...stage,
      items: steps.filter((step) => (step.stage ?? 'identity') === stage.key),
    })).filter((stage) => stage.items.length > 0);
  }, [steps]);

  if (steps === null) {
    return (
      <Screen scroll={false}>
        <LoadingState />
      </Screen>
    );
  }

  const required = steps.filter((step) => step.required !== false);
  const doneRequired = required.filter((step) => step.done).length;
  const totalCost = steps
    .filter((step) => !step.done)
    .reduce((sum, step) => sum + Number(step.est_cost_jmd ?? 0), 0);
  const nextStep = steps.find((step) => !step.done && step.required !== false);

  return (
    <Screen>
      <View style={{ gap: space.s5 }}>
        {/* Progress + the single next action */}
        <Card raised level={2}>
          <View style={{ gap: space.s4 }}>
            <ProgressBar
              label="Your pathway to formal"
              trailing={`${doneRequired} / ${required.length}`}
              progress={required.length > 0 ? doneRequired / required.length : 0}
              helper={
                totalCost > 0
                  ? `About ${formatJmd(totalCost)} left in official fees`
                  : 'No fees left to pay'
              }
            />
            {nextStep && (
              <View style={{ flexDirection: 'row', gap: space.s3, alignItems: 'center' }}>
                <View
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: radius.md,
                    backgroundColor: colors.accentSoft,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Ionicons name="arrow-forward" size={18} color={colors.accent} />
                </View>
                <View style={{ flex: 1 }}>
                  <AppText variant="caption" color="textMuted">
                    Do this next
                  </AppText>
                  <AppText variant="label" numberOfLines={1}>
                    {nextStep.title}
                  </AppText>
                </View>
              </View>
            )}
          </View>
        </Card>

        {grouped.map((stage, stageIndex) => {
          const stageDone = stage.items.filter((step) => step.done).length;
          return (
            <FadeSlideIn key={stage.key} delay={stageIndex * 80}>
              <View style={{ gap: space.s3 }}>
                {/* Stage header */}
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.s3 }}>
                  <View
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: radius.full,
                      backgroundColor:
                        stageDone === stage.items.length ? colors.successSoft : colors.surface,
                      borderWidth: 1,
                      borderColor:
                        stageDone === stage.items.length ? colors.success : colors.border,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Ionicons
                      name={stageDone === stage.items.length ? 'checkmark' : stage.icon}
                      size={16}
                      color={stageDone === stage.items.length ? colors.success : colors.accent}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <AppText variant="h3">{stage.title}</AppText>
                    <AppText variant="caption" color="textMuted">
                      {stage.blurb}
                    </AppText>
                  </View>
                  <AppText variant="caption" color="textMuted">
                    {stageDone}/{stage.items.length}
                  </AppText>
                </View>

                {stage.items.map((step) => {
                  const open = expanded === step.id;
                  return (
                    <Card key={step.id}>
                      <View style={{ gap: space.s3 }}>
                        <View style={{ flexDirection: 'row', gap: space.s3, alignItems: 'flex-start' }}>
                          <Pressable
                            accessibilityRole="checkbox"
                            accessibilityState={{ checked: step.done }}
                            accessibilityLabel={step.title}
                            onPress={() => void toggle(step)}
                            hitSlop={8}
                          >
                            <Ionicons
                              name={step.done ? 'checkmark-circle' : 'ellipse-outline'}
                              size={26}
                              color={step.done ? colors.success : colors.textMuted}
                            />
                          </Pressable>

                          <Pressable
                            style={{ flex: 1, gap: 4 }}
                            onPress={() => setExpanded(open ? null : step.id)}
                          >
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.s2 }}>
                              <AppText
                                variant="label"
                                style={{
                                  flex: 1,
                                  textDecorationLine: step.done ? 'line-through' : 'none',
                                  opacity: step.done ? 0.6 : 1,
                                }}
                              >
                                {step.title}
                              </AppText>
                              {step.required === false && (
                                <View
                                  style={{
                                    backgroundColor: colors.surfaceRaised,
                                    borderRadius: radius.full,
                                    paddingHorizontal: space.s2,
                                    paddingVertical: 1,
                                  }}
                                >
                                  <AppText variant="caption" color="textMuted" style={{ fontSize: 10 }}>
                                    Optional
                                  </AppText>
                                </View>
                              )}
                            </View>

                            {/* The payoff, not just the task */}
                            {step.benefit ? (
                              <AppText variant="bodySm" color="accent" numberOfLines={open ? undefined : 2}>
                                {step.benefit}
                              </AppText>
                            ) : null}

                            <View style={{ flexDirection: 'row', gap: space.s3, flexWrap: 'wrap' }}>
                              {step.agency ? (
                                <AppText variant="caption" color="textMuted">
                                  🏛 {step.agency}
                                </AppText>
                              ) : null}
                              <AppText variant="caption" color="textMuted">
                                💰 {Number(step.est_cost_jmd ?? 0) > 0 ? formatJmd(step.est_cost_jmd) : 'Free'}
                              </AppText>
                              {step.est_days != null ? (
                                <AppText variant="caption" color="textMuted">
                                  ⏱ {step.est_days} day{step.est_days === 1 ? '' : 's'}
                                </AppText>
                              ) : null}
                            </View>
                          </Pressable>

                          <Ionicons
                            name={open ? 'chevron-up' : 'chevron-down'}
                            size={16}
                            color={colors.textMuted}
                          />
                        </View>

                        {/* Detail: how to do it + what to bring */}
                        {open && (
                          <View
                            style={{
                              gap: space.s3,
                              paddingTop: space.s3,
                              borderTopWidth: 1,
                              borderTopColor: colors.border,
                            }}
                          >
                            <AppText variant="bodySm" color="textMuted">
                              {step.description}
                            </AppText>

                            {step.documents.length > 0 && (
                              <View style={{ gap: space.s2 }}>
                                <AppText variant="caption" color="textMuted">
                                  WHAT TO BRING
                                </AppText>
                                {step.documents.map((document) => (
                                  <View
                                    key={document}
                                    style={{ flexDirection: 'row', gap: space.s2, alignItems: 'center' }}
                                  >
                                    <Ionicons name="document-outline" size={14} color={colors.accent} />
                                    <AppText variant="bodySm" style={{ flex: 1 }}>
                                      {document}
                                    </AppText>
                                  </View>
                                ))}
                              </View>
                            )}

                            {step.official_url ? (
                              <Pressable
                                accessibilityRole="link"
                                onPress={() => Linking.openURL(step.official_url as string)}
                                style={{ flexDirection: 'row', alignItems: 'center', gap: space.s1 }}
                              >
                                <Ionicons name="open-outline" size={14} color={colors.accent} />
                                <AppText variant="bodySm" color="accent">
                                  Official {step.agency || 'agency'} page
                                </AppText>
                              </Pressable>
                            ) : null}
                          </View>
                        )}
                      </View>
                    </Card>
                  );
                })}
              </View>
            </FadeSlideIn>
          );
        })}

        <AppText variant="caption" color="textMuted" style={{ textAlign: 'center' }}>
          Fees and timelines are guidance, not legal advice. Confirm with the agency
          before you travel.
        </AppText>
      </View>
    </Screen>
  );
}
