import { router } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { View } from 'react-native';

import { Chip } from '@/components/ui/badges';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { Screen } from '@/components/ui/Screen';
import { AppText } from '@/components/ui/Text';
import { LoadingState } from '@/components/ui/states';
import { supabase } from '@/lib/supabase';
import { space } from '@/theme/tokens';
import type { QuestionnaireItem } from '@/types/db';

/**
 * Readiness questionnaire (FR-BIZ-1). Questions and scoring are config tables;
 * submit_questionnaire() computes the score deterministically in SQL — one
 * clear action per step with visible progress (SR-21).
 */
export default function QuestionnaireScreen() {
  const [items, setItems] = useState<QuestionnaireItem[] | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [index, setIndex] = useState(0);
  const [busy, setBusy] = useState(false);
  const [score, setScore] = useState<number | null>(null);

  useEffect(() => {
    supabase
      .from('questionnaire_items')
      .select('*')
      .order('sort_order')
      .then(({ data }) => setItems((data as QuestionnaireItem[] | null) ?? []));
  }, []);

  if (items === null) {
    return (
      <Screen scroll={false}>
        <LoadingState />
      </Screen>
    );
  }

  if (score !== null) {
    const level =
      score >= 12 ? 'Ready to register' : score >= 7 ? 'Nearly there' : 'Early days — no problem';
    return (
      <Screen scroll={false} style={{ justifyContent: 'center' }}>
        <View style={{ alignItems: 'center', gap: space.s4 }}>
          <AppText variant="display">{score}/16</AppText>
          <AppText variant="h3">{level}</AppText>
          <AppText variant="body" color="textMuted" style={{ textAlign: 'center' }}>
            Your checklist is tailored to exactly where you are. Every step you finish
            moves you up.
          </AppText>
          <Button title="See my checklist" fullWidth onPress={() => router.replace('/formalize/checklist')} />
          <Button title="Back to dashboard" variant="text" onPress={() => router.back()} />
        </View>
      </Screen>
    );
  }

  const item = items[index];
  if (!item) {
    return (
      <Screen scroll={false}>
        <LoadingState />
      </Screen>
    );
  }

  const submit = async (finalAnswers: Record<string, string>) => {
    setBusy(true);
    const { data } = await supabase.rpc('submit_questionnaire', { p_answers: finalAnswers });
    setBusy(false);
    setScore(typeof data === 'number' ? data : 0);
  };

  const choose = (label: string) => {
    const next = { ...answers, [String(item.id)]: label };
    setAnswers(next);
    if (index + 1 < items.length) {
      setIndex(index + 1);
    } else {
      void submit(next);
    }
  };

  return (
    <Screen>
      <View style={{ gap: space.s6 }}>
        <ProgressBar
          progress={index / items.length}
          label={`Question ${index + 1} of ${items.length}`}
        />

        <Card>
          <View style={{ gap: space.s3 }}>
            <AppText variant="h3">{item.question}</AppText>
            {item.help_text ? (
              <AppText variant="bodySm" color="textMuted">
                {item.help_text}
              </AppText>
            ) : null}
          </View>
        </Card>

        <View style={{ gap: space.s3 }}>
          {item.options.map((option) => (
            <Chip
              key={option.label}
              label={option.label}
              selected={answers[String(item.id)] === option.label}
              onPress={() => choose(option.label)}
            />
          ))}
        </View>

        {busy && <LoadingState label="Scoring…" />}
        {index > 0 && (
          <Button title="Back" variant="text" onPress={() => setIndex(index - 1)} />
        )}
      </View>
    </Screen>
  );
}
