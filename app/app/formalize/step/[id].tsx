import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { Linking, Pressable, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Screen } from '@/components/ui/Screen';
import { SuccessOverlay } from '@/components/ui/SuccessOverlay';
import { AppText } from '@/components/ui/Text';
import { FadeSlideIn, lightTap } from '@/components/ui/animated';
import { ErrorState, LoadingState } from '@/components/ui/states';
import { STAGES } from '@/features/formalization/stages';
import { formatJmd } from '@/lib/format';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/AuthProvider';
import { useTheme } from '@/theme/ThemeContext';
import { radius, space } from '@/theme/tokens';
import type { ChecklistStep } from '@/types/db';

/**
 * One step of the pathway, in full.
 *
 * The checklist could only ever say a step's name and tick it. That is fine
 * for a to-do list and useless for something you have never done before: the
 * questions are what IS this, why should I bother, what do I bring, what does
 * it cost, and where do I go. All of that is already in the config — this
 * screen is where it finally gets shown.
 *
 * Documents are tracked locally as you gather them. That is deliberately not
 * persisted: it is a packing list for a trip to an agency, not a record.
 */
export default function FormalizeStepScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useAuth();
  const { colors } = useTheme();

  const [step, setStep] = useState<ChecklistStep | null>(null);
  const [phase, setPhase] = useState<'loading' | 'ready' | 'missing'>('loading');
  const [gathered, setGathered] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [celebrating, setCelebrating] = useState(false);

  const load = useCallback(async () => {
    if (!session || !id) {
      setPhase('missing');
      return;
    }
    const { data } = await supabase.rpc('get_worker_checklist', { p_user: session.user.id });
    const found =
      ((data as ChecklistStep[] | null) ?? []).find((row) => String(row.id) === id) ?? null;
    setStep(found);
    setPhase(found ? 'ready' : 'missing');
  }, [session, id]);

  useEffect(() => {
    void load();
  }, [load]);

  if (phase === 'loading') {
    return (
      <Screen scroll={false}>
        <LoadingState label="Loading this step…" />
      </Screen>
    );
  }

  if (phase === 'missing' || !step) {
    return (
      <Screen scroll={false}>
        <ErrorState
          title="Step not found"
          message="This step is not part of your pathway."
          actionTitle="Back to the pathway"
          onAction={() => router.replace('/formalize')}
        />
      </Screen>
    );
  }

  const stage = STAGES.find((item) => item.key === (step.stage ?? 'identity'));
  const documents = Array.isArray(step.documents) ? step.documents : [];
  const cost = Number(step.est_cost_jmd ?? 0);

  const toggleDone = async () => {
    if (!session) return;
    const nowDone = !step.done;
    setBusy(true);
    await supabase.from('checklist_progress').upsert({
      user_id: session.user.id,
      item_id: step.id,
      done: nowDone,
      done_at: nowDone ? new Date().toISOString() : null,
    });
    setBusy(false);
    setStep({ ...step, done: nowDone });
    if (nowDone) setCelebrating(true);
    else void load();
  };

  return (
    <Screen>
      {celebrating && (
        <SuccessOverlay
          visible
          icon="checkmark-done"
          title="Step done"
          message={step.benefit || 'One step closer to a registered business.'}
          actionTitle="Back to my pathway"
          onAction={() => {
            setCelebrating(false);
            router.replace('/formalize');
          }}
          secondaryTitle="Stay here"
          onSecondary={() => setCelebrating(false)}
        />
      )}

      <View style={{ gap: space.s5 }}>
        <FadeSlideIn>
          <View style={{ gap: space.s3 }}>
            {stage && (
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: space.s2,
                  alignSelf: 'flex-start',
                  paddingHorizontal: space.s3,
                  paddingVertical: space.s1,
                  borderRadius: radius.full,
                  backgroundColor: colors.accentSoft,
                }}
              >
                <Ionicons name={stage.icon} size={13} color={colors.accent} />
                <AppText variant="caption" color="accent">
                  {stage.label}
                </AppText>
              </View>
            )}
            <AppText variant="h1">{step.title}</AppText>
            {step.required === false && (
              <AppText variant="caption" color="textMuted">
                Optional — worth doing, but nothing is blocked without it.
              </AppText>
            )}
          </View>
        </FadeSlideIn>

        {/* Why bother. This is the part that decides whether anyone does it. */}
        {step.benefit ? (
          <FadeSlideIn delay={60}>
            <View
              style={{
                flexDirection: 'row',
                gap: space.s3,
                padding: space.s4,
                borderRadius: radius.lg,
                backgroundColor: colors.successSoft,
              }}
            >
              <Ionicons name="key" size={18} color={colors.success} />
              <AppText variant="bodySm" style={{ flex: 1, color: colors.success }}>
                {step.benefit}
              </AppText>
            </View>
          </FadeSlideIn>
        ) : null}

        <FadeSlideIn delay={100}>
          <AppText variant="body" color="textMuted">
            {step.description}
          </AppText>
        </FadeSlideIn>

        {/* The facts, at a glance */}
        <FadeSlideIn delay={140}>
          <Card>
            <View style={{ gap: space.s3 }}>
              <Fact icon="business-outline" label="Where" value={step.agency} />
              <Fact
                icon="cash-outline"
                label="Cost"
                value={cost > 0 ? formatJmd(cost) : 'Free'}
                tone={cost > 0 ? undefined : 'success'}
              />
              <Fact
                icon="time-outline"
                label="How long"
                value={
                  step.est_days == null || step.est_days === 0
                    ? 'Same day'
                    : `About ${step.est_days} working day${step.est_days === 1 ? '' : 's'}`
                }
              />
            </View>
          </Card>
        </FadeSlideIn>

        {/* What to bring — tickable, because you gather these over days */}
        {documents.length > 0 && (
          <FadeSlideIn delay={180}>
            <View style={{ gap: space.s3 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.s2 }}>
                <Ionicons name="folder-open-outline" size={16} color={colors.textMuted} />
                <AppText variant="overline" color="textMuted" style={{ flex: 1 }}>
                  What to bring
                </AppText>
                <AppText variant="caption" color="textMuted">
                  {gathered.size}/{documents.length}
                </AppText>
              </View>
              {documents.map((document) => {
                const has = gathered.has(document);
                return (
                  <Pressable
                    key={document}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: has }}
                    onPress={() => {
                      lightTap();
                      setGathered((current) => {
                        const next = new Set(current);
                        if (next.has(document)) next.delete(document);
                        else next.add(document);
                        return next;
                      });
                    }}
                    style={({ pressed }) => ({
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: space.s3,
                      padding: space.s3,
                      borderRadius: radius.md,
                      borderWidth: 1,
                      borderColor: has ? colors.success : colors.border,
                      backgroundColor: has ? colors.successSoft : 'transparent',
                      opacity: pressed ? 0.7 : 1,
                    })}
                  >
                    <Ionicons
                      name={has ? 'checkbox' : 'square-outline'}
                      size={20}
                      color={has ? colors.success : colors.textMuted}
                    />
                    <AppText variant="bodySm" style={{ flex: 1 }}>
                      {document}
                    </AppText>
                  </Pressable>
                );
              })}
              <AppText variant="caption" color="textMuted">
                Ticks here are just for you while you gather things — they are not saved.
              </AppText>
            </View>
          </FadeSlideIn>
        )}

        {/* Ask about THIS step, rather than opening a blank chat */}
        <FadeSlideIn delay={220}>
          <Card
            onPress={() =>
              router.push({
                pathname: '/formalize/bizbot',
                params: { q: `${step.title} — what exactly do I need to do?` },
              })
            }
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.s3 }}>
              <Ionicons name="sparkles" size={20} color={colors.accent} />
              <View style={{ flex: 1, gap: 2 }}>
                <AppText variant="label">Ask BizBot about this step</AppText>
                <AppText variant="caption" color="textMuted">
                  Answers come from the official documents, with the source cited.
                </AppText>
              </View>
              <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
            </View>
          </Card>
        </FadeSlideIn>

        <FadeSlideIn delay={260}>
          <View style={{ gap: space.s3 }}>
            {step.official_url ? (
              <Button
                title={`Open ${step.agency}`}
                variant="secondary"
                icon="open-outline"
                fullWidth
                onPress={() => void Linking.openURL(step.official_url as string)}
              />
            ) : null}
            <Button
              title={step.done ? 'Mark as not done' : "I've done this"}
              icon={step.done ? 'arrow-undo-outline' : 'checkmark-circle'}
              variant={step.done ? 'secondary' : 'primary'}
              fullWidth
              loading={busy}
              onPress={toggleDone}
            />
          </View>
        </FadeSlideIn>
      </View>
    </Screen>
  );
}

function Fact({
  icon,
  label,
  value,
  tone,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  tone?: 'success';
}) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.s3 }}>
      <Ionicons name={icon} size={16} color={colors.textMuted} />
      <AppText variant="bodySm" color="textMuted" style={{ width: 84 }}>
        {label}
      </AppText>
      <AppText
        variant="bodySm"
        style={{ flex: 1, color: tone === 'success' ? colors.success : colors.text }}
      >
        {value}
      </AppText>
    </View>
  );
}
