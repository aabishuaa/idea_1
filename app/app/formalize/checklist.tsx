import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { Pressable, View } from 'react-native';

import { Card } from '@/components/ui/Card';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { Screen } from '@/components/ui/Screen';
import { AppText } from '@/components/ui/Text';
import { LoadingState } from '@/components/ui/states';
import { formatJmd } from '@/lib/format';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/AuthProvider';
import { useTheme } from '@/theme/ThemeContext';
import { space } from '@/theme/tokens';
import type { ChecklistStep } from '@/types/db';

/**
 * Trade/parish document checklist (FR-BIZ-3). Resolved by
 * get_worker_checklist() from config tables — deterministic, never RAG.
 * Completing every step marks the pathway complete → business tier.
 */
export default function ChecklistScreen() {
  const { session } = useAuth();
  const { colors } = useTheme();
  const [steps, setSteps] = useState<ChecklistStep[] | null>(null);

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

  if (steps === null) {
    return (
      <Screen scroll={false}>
        <LoadingState />
      </Screen>
    );
  }

  const doneCount = steps.filter((step) => step.done).length;

  const toggle = async (step: ChecklistStep) => {
    if (!session) return;
    const nowDone = !step.done;
    await supabase.from('checklist_progress').upsert({
      user_id: session.user.id,
      item_id: step.id,
      done: nowDone,
      done_at: nowDone ? new Date().toISOString() : null,
    });

    // All steps done → pathway complete (unlocks the business tier in SQL).
    if (nowDone && doneCount + 1 === steps.length) {
      await supabase
        .from('formalization_progress')
        .update({ status: 'completed' })
        .eq('user_id', session.user.id);
    }
    void load();
  };

  return (
    <Screen>
      <View style={{ gap: space.s5 }}>
        <ProgressBar
          progress={steps.length ? doneCount / steps.length : 0}
          label="Your pathway"
          trailing={`${doneCount}/${steps.length} done`}
          helper={
            doneCount === steps.length && steps.length > 0
              ? 'All done — your business tier is unlocked! 🎉'
              : 'Tick each step as you complete it. Amounts are estimates — confirm current fees with the agency.'
          }
        />

        {steps.map((step) => (
          <Card key={step.id}>
            <Pressable
              accessibilityRole="checkbox"
              accessibilityState={{ checked: step.done }}
              onPress={() => void toggle(step)}
            >
              <View style={{ flexDirection: 'row', gap: space.s3 }}>
                <Ionicons
                  name={step.done ? 'checkbox' : 'square-outline'}
                  size={24}
                  color={step.done ? colors.success : colors.textMuted}
                />
                <View style={{ flex: 1, gap: space.s2 }}>
                  <AppText
                    variant="label"
                    style={step.done ? { textDecorationLine: 'line-through' } : undefined}
                  >
                    {step.step_order}. {step.title}
                  </AppText>
                  <AppText variant="bodySm" color="textMuted">
                    {step.description}
                  </AppText>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.s3 }}>
                    {step.agency ? (
                      <AppText variant="caption" color="accent">
                        {step.agency}
                      </AppText>
                    ) : null}
                    {step.est_cost_jmd != null && (
                      <AppText variant="caption" color="textMuted">
                        ~{formatJmd(step.est_cost_jmd)}
                      </AppText>
                    )}
                    {step.est_days != null && (
                      <AppText variant="caption" color="textMuted">
                        ~{step.est_days} day{step.est_days === 1 ? '' : 's'}
                      </AppText>
                    )}
                  </View>
                  {Array.isArray(step.documents) && step.documents.length > 0 && (
                    <View style={{ gap: 2 }}>
                      <AppText variant="caption" color="textMuted">
                        Bring:
                      </AppText>
                      {step.documents.map((doc) => (
                        <AppText key={doc} variant="caption" color="textMuted">
                          • {doc}
                        </AppText>
                      ))}
                    </View>
                  )}
                </View>
              </View>
            </Pressable>
          </Card>
        ))}
      </View>
    </Screen>
  );
}
