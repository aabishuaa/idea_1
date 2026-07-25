import Constants, { ExecutionEnvironment } from 'expo-constants';
import { router } from 'expo-router';
import React, { useState } from 'react';
import { View } from 'react-native';

import type { LivenessMetadata } from '@/features/liveness/LivenessCamera';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Screen } from '@/components/ui/Screen';
import { AppText } from '@/components/ui/Text';
import { LoadingState } from '@/components/ui/states';
import { AiServiceError, matchSelfie } from '@/lib/ai';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/AuthProvider';
import { space } from '@/theme/tokens';

// Native ML Kit modules don't exist inside Expo Go — load the camera flow only
// in a custom dev build (SETUP.md §3.2). The `any` casts confine the dynamic
// require to this one boundary.
const isExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let LivenessCamera: React.ComponentType<any> | null = null;
if (!isExpoGo) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    LivenessCamera = require('@/features/liveness/LivenessCamera').LivenessCamera;
  } catch {
    LivenessCamera = null;
  }
}

/**
 * Gate 2 (on-device liveness) + gate 4 handoff (selfie → server face match).
 * The gates stay separate: liveness is recorded first, then the selfie is
 * matched — cosine similarity never substitutes for liveness (CLAUDE.md §5).
 */
export default function LivenessScreen() {
  const { session, refreshProfile } = useAuth();
  const [phase, setPhase] = useState<'challenge' | 'matching'>('challenge');
  const [error, setError] = useState<string | null>(null);

  const completeLiveness = async (metadata: LivenessMetadata, selfiePath: string | null) => {
    if (!session) return;
    setError(null);

    // Record the on-device liveness outcome (gate 2).
    const { error: updateError } = await supabase
      .from('verification_records')
      .update({
        liveness_passed: true,
        liveness_at: new Date().toISOString(),
        liveness_metadata: metadata,
        status: 'liveness_passed',
      })
      .eq('user_id', session.user.id);
    if (updateError) {
      setError(updateError.message);
      return;
    }

    if (!selfiePath) {
      // Demo mode (Expo Go): no frame to match — result screen explains.
      router.replace({ pathname: '/verification/result', params: { demo: '1' } });
      return;
    }

    // Gate 4: server-side face match against the stored ID embedding.
    setPhase('matching');
    try {
      const result = await matchSelfie(selfiePath);
      await refreshProfile();
      router.replace({
        pathname: '/verification/result',
        params: {
          passed: result.passed ? '1' : '0',
          similarity: String(result.similarity),
        },
      });
    } catch (err) {
      setPhase('challenge');
      if (err instanceof AiServiceError && (err.status === 'network' || err.status === 503)) {
        setError(
          'The matching service is waking up (free tier). Give it a minute and try again — your liveness result is saved.',
        );
      } else if (err instanceof AiServiceError && err.detail === 'id_embedding_missing') {
        setError('Your ID needs to be uploaded first.');
        router.replace('/verification/id-upload');
      } else {
        setError('Face match failed to run. Please try again.');
      }
    }
  };

  if (phase === 'matching') {
    return (
      <Screen scroll={false}>
        <LoadingState label="Matching your selfie to your ID…" />
      </Screen>
    );
  }

  if (!LivenessCamera) {
    return (
      <Screen>
        <View style={{ gap: space.s5 }}>
          <AppText variant="h2">Liveness check</AppText>
          <Card>
            <View style={{ gap: space.s3 }}>
              <AppText variant="label">Development build required</AppText>
              <AppText variant="bodySm" color="textMuted">
                The camera liveness challenge uses native ML Kit modules that aren't
                available in Expo Go. Build the dev client to run the real check:
              </AppText>
              <AppText variant="bodySm" color="accent">
                cd app && npx expo run:android
              </AppText>
            </View>
          </Card>
          <Button
            title="Continue in demo mode"
            variant="secondary"
            fullWidth
            onPress={() =>
              completeLiveness(
                {
                  demo: true,
                  max_yaw_left: 0,
                  max_yaw_right: 0,
                  blink_detected: false,
                  frames_sampled: 0,
                },
                null,
              )
            }
          />
          <AppText variant="caption" color="textMuted" style={{ textAlign: 'center' }}>
            Demo mode marks liveness as passed with a clearly-flagged demo record —
            for flow testing only, never production.
          </AppText>
          {error && (
            <AppText variant="bodySm" color="error">
              {error}
            </AppText>
          )}
        </View>
      </Screen>
    );
  }

  return (
    <Screen scroll={false}>
      <LivenessCamera
        onPassed={(metadata: LivenessMetadata, selfiePath: string) =>
          void completeLiveness(metadata, selfiePath)
        }
      />
      {error && (
        <AppText variant="bodySm" color="error" style={{ textAlign: 'center', padding: space.s3 }}>
          {error}
        </AppText>
      )}
    </Screen>
  );
}
