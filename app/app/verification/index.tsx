import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Screen } from '@/components/ui/Screen';
import { AppText } from '@/components/ui/Text';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/AuthProvider';
import { useTheme } from '@/theme/ThemeContext';
import { space } from '@/theme/tokens';
import type { VerificationRecord, WorkerProfile } from '@/types/db';

/**
 * Verification overview (FR-VER-6): the two identity gates plus the
 * progressive tiers (phone, skill, business) that unlock visibility.
 */
export default function VerificationScreen() {
  const { session, profile } = useAuth();
  const { colors } = useTheme();
  const [record, setRecord] = useState<VerificationRecord | null>(null);
  const [worker, setWorker] = useState<WorkerProfile | null>(null);

  const load = useCallback(async () => {
    if (!session) return;
    const [recordRes, workerRes] = await Promise.all([
      supabase
        .from('verification_records')
        .select(
          'user_id, status, consent_given_at, id_captured_at, liveness_passed, liveness_at, face_match_score, face_match_passed',
        )
        .eq('user_id', session.user.id)
        .maybeSingle(),
      supabase.from('worker_profiles').select('*').eq('user_id', session.user.id).maybeSingle(),
    ]);
    setRecord((recordRes.data as VerificationRecord | null) ?? null);
    setWorker((workerRes.data as WorkerProfile | null) ?? null);
  }, [session]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const verified = profile?.identity_verified === true;

  const steps = [
    {
      label: 'Consent',
      done: !!record?.consent_given_at,
      hint: 'Your permission before anything is captured',
    },
    {
      label: 'Government ID',
      done: !!record?.id_captured_at,
      hint: 'We keep a face template, not your photo',
    },
    {
      label: 'Liveness check',
      done: record?.liveness_passed === true,
      hint: 'Turn your head and blink — proves a real person',
    },
    {
      label: 'Face match',
      done: record?.face_match_passed === true,
      hint: 'Confirms you match your ID',
    },
  ];

  const tiers = [
    { label: 'Identity', done: verified, hint: 'Unlocks booking and messaging' },
    { label: 'Phone', done: worker?.tier_phone ?? profile?.phone_verified ?? false, hint: 'Adds a contact signal' },
    { label: 'Skill', done: worker?.tier_skill ?? false, hint: '5+ jobs at 4.0★ or better' },
    { label: 'Business', done: worker?.tier_business ?? false, hint: 'Complete the formalization pathway' },
  ];

  return (
    <Screen>
      <View style={{ gap: space.s5 }}>
        <Card raised>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.s3 }}>
            <Ionicons
              name={verified ? 'shield-checkmark' : 'shield-outline'}
              size={32}
              color={verified ? colors.success : colors.accent}
            />
            <View style={{ flex: 1 }}>
              <AppText variant="h3">
                {verified ? "You're verified" : 'Verify your identity'}
              </AppText>
              <AppText variant="bodySm" color="textMuted">
                {verified
                  ? 'Customers see the verified badge on your profile.'
                  : 'Two quick checks: your ID, and a short camera challenge.'}
              </AppText>
            </View>
          </View>
        </Card>

        <View style={{ gap: space.s3 }}>
          <AppText variant="h3">Identity check</AppText>
          {steps.map((step) => (
            <Card key={step.label}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.s3 }}>
                <Ionicons
                  name={step.done ? 'checkmark-circle' : 'ellipse-outline'}
                  size={22}
                  color={step.done ? colors.success : colors.textMuted}
                />
                <View style={{ flex: 1 }}>
                  <AppText variant="label">{step.label}</AppText>
                  <AppText variant="caption" color="textMuted">
                    {step.hint}
                  </AppText>
                </View>
              </View>
            </Card>
          ))}
          {!verified && (
            <Button
              title={record?.consent_given_at ? 'Continue verification' : 'Start verification'}
              fullWidth
              onPress={() =>
                router.push(
                  !record?.consent_given_at
                    ? '/verification/consent'
                    : !record.id_captured_at
                      ? '/verification/id-upload'
                      : '/verification/liveness',
                )
              }
            />
          )}
        </View>

        <View style={{ gap: space.s3 }}>
          <AppText variant="h3">Trust tiers</AppText>
          {tiers.map((tier) => (
            <Card key={tier.label}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.s3 }}>
                <Ionicons
                  name={tier.done ? 'checkmark-circle' : 'lock-closed-outline'}
                  size={22}
                  color={tier.done ? colors.success : colors.textMuted}
                />
                <View style={{ flex: 1 }}>
                  <AppText variant="label">{tier.label}</AppText>
                  <AppText variant="caption" color="textMuted">
                    {tier.hint}
                  </AppText>
                </View>
              </View>
            </Card>
          ))}
        </View>
      </View>
    </Screen>
  );
}
