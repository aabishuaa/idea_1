import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { Linking, Pressable, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { Screen } from '@/components/ui/Screen';
import { AppText } from '@/components/ui/Text';
import { Stagger } from '@/components/ui/animated';
import { LoadingState } from '@/components/ui/states';
import { logEvent } from '@/lib/events';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/AuthProvider';
import { useTheme } from '@/theme/ThemeContext';
import { space } from '@/theme/tokens';
import type { ChecklistStep, FormalizationProgress, Partner } from '@/types/db';

/**
 * Formalization dashboard (FR-BIZ-2): position on the journey, readiness score,
 * checklist progress, partners. Everything here is deterministic config/SQL —
 * BizBot (RAG) only answers the open questions (CLAUDE.md §4.3).
 * Activation is always the worker's explicit choice (FR-BIZ-6/7).
 */
export default function FormalizeScreen() {
  const { session } = useAuth();
  const { colors } = useTheme();
  const [progress, setProgress] = useState<FormalizationProgress | null | 'none'>(null);
  const [steps, setSteps] = useState<ChecklistStep[]>([]);
  const [partners, setPartners] = useState<Partner[]>([]);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!session) return;
    const [progressRes, stepsRes, partnersRes] = await Promise.all([
      supabase
        .from('formalization_progress')
        .select('*')
        .eq('user_id', session.user.id)
        .maybeSingle(),
      supabase.rpc('get_worker_checklist', { p_user: session.user.id }),
      supabase.from('partners').select('*').order('name'),
    ]);
    setProgress((progressRes.data as FormalizationProgress | null) ?? 'none');
    setSteps((stepsRes.data as ChecklistStep[] | null) ?? []);
    setPartners((partnersRes.data as Partner[] | null) ?? []);
  }, [session]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  if (progress === null) {
    return (
      <Screen scroll={false}>
        <LoadingState />
      </Screen>
    );
  }

  const status = progress === 'none' ? 'not_started' : progress.status;
  const active = status === 'active' || status === 'completed';
  const doneCount = steps.filter((step) => step.done).length;

  const activate = async () => {
    setBusy(true);
    await supabase.rpc('activate_formalization');
    logEvent('formalization_activated');
    setBusy(false);
    void load();
  };

  return (
    <Screen>
      <View style={{ gap: space.s5 }}>
        <Stagger interval={70} gap={space.s5}>
        <Card raised>
          <View style={{ gap: space.s3 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.s3 }}>
              <Ionicons name="ribbon" size={28} color={colors.accent} />
              <View style={{ flex: 1 }}>
                <AppText variant="h3">
                  {status === 'completed'
                    ? 'Business tier unlocked 🎉'
                    : active
                      ? 'Your formalization journey'
                      : status === 'suggested'
                        ? "You're ready to formalize"
                        : 'Make your business official'}
                </AppText>
                <AppText variant="bodySm" color="textMuted">
                  {active
                    ? `${doneCount} of ${steps.length} steps done`
                    : 'Registering unlocks bigger jobs, loans, and contracts — one step at a time, at your pace.'}
                </AppText>
              </View>
            </View>

            {active && steps.length > 0 && (
              <ProgressBar progress={doneCount / steps.length} />
            )}

            {!active && (
              <Button
                title={status === 'suggested' ? 'Yes, start my pathway' : 'Start the pathway'}
                fullWidth
                loading={busy}
                onPress={activate}
              />
            )}
          </View>
        </Card>

        {/* Readiness questionnaire (deterministic scoring) */}
        <Card onPress={() => router.push('/formalize/questionnaire')}>
          <MenuItem
            icon="clipboard-outline"
            title="Readiness check"
            subtitle={
              progress !== 'none' && progress.readiness_score != null
                ? `Score: ${progress.readiness_score}/16 — retake any time`
                : '2 minutes · see where you stand'
            }
          />
        </Card>

        {/* Trade/parish checklist (config-driven, never RAG) */}
        <Card onPress={() => router.push('/formalize/checklist')}>
          <MenuItem
            icon="list-outline"
            title="Your document checklist"
            subtitle={`${steps.length} steps tailored to your trade and parish`}
          />
        </Card>

        {/* BizBot Q&A (RAG with citations) */}
        <Card onPress={() => router.push('/formalize/bizbot')}>
          <MenuItem
            icon="chatbubble-ellipses-outline"
            title="Ask BizBot"
            subtitle='"What is GCT?" · "Do I need a TRN?" — plain answers, official sources'
          />
        </Card>

        {partners.length > 0 && (
          <View style={{ gap: space.s3 }}>
            <AppText variant="h3">Partners who can help</AppText>
            {partners.map((partner) => (
              <Card key={partner.id}>
                <Pressable
                  accessibilityRole="link"
                  disabled={!partner.url}
                  onPress={() => partner.url && Linking.openURL(partner.url)}
                >
                  <View style={{ gap: 2 }}>
                    <AppText variant="label">{partner.name}</AppText>
                    <AppText variant="caption" color="textMuted">
                      {partner.description}
                    </AppText>
                  </View>
                </Pressable>
              </Card>
            ))}
          </View>
        )}
        </Stagger>
      </View>
    </Screen>
  );
}

function MenuItem({
  icon,
  title,
  subtitle,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle: string;
}) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.s3 }}>
      <Ionicons name={icon} size={24} color={colors.accent} />
      <View style={{ flex: 1, gap: 2 }}>
        <AppText variant="label">{title}</AppText>
        <AppText variant="caption" color="textMuted">
          {subtitle}
        </AppText>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
    </View>
  );
}
