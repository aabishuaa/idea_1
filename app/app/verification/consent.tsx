import { router } from 'expo-router';
import React, { useState } from 'react';
import { View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Screen } from '@/components/ui/Screen';
import { AppText } from '@/components/ui/Text';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/AuthProvider';
import { space } from '@/theme/tokens';

const CONSENT_VERSION = 'v1-2026';

/**
 * Explicit consent BEFORE any biometric/ID capture (SR-16, Jamaica DPA).
 * NOTE FOR THE TEAM: this copy is a development draft — have it reviewed
 * against current DPA guidance before launch (CLAUDE.md §5).
 */
export default function ConsentScreen() {
  const { session } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const agree = async () => {
    if (!session) return;
    setBusy(true);
    setError(null);
    const { error: upsertError } = await supabase.from('verification_records').upsert({
      user_id: session.user.id,
      status: 'consented',
      consent_given_at: new Date().toISOString(),
      consent_text_version: CONSENT_VERSION,
    });
    setBusy(false);
    if (upsertError) {
      setError(upsertError.message);
      return;
    }
    router.replace('/verification/id-upload');
  };

  return (
    <Screen>
      <View style={{ gap: space.s5 }}>
        <AppText variant="h2">Before we start</AppText>
        <AppText variant="body" color="textMuted">
          To verify it's really you, myB needs your permission to:
        </AppText>

        <Card>
          <View style={{ gap: space.s3 }}>
            <AppText variant="bodySm">
              1. <AppText variant="label">Read your government ID photo</AppText> — we
              detect the face on your ID and keep only a mathematical template (an
              embedding). The ID image itself is deleted after matching.
            </AppText>
            <AppText variant="bodySm">
              2. <AppText variant="label">Use your camera for a short challenge</AppText> —
              turn your head left, right, and blink. This runs on your phone and proves
              a live person is present.
            </AppText>
            <AppText variant="bodySm">
              3. <AppText variant="label">Compare one selfie to your ID template</AppText> —
              a similarity score decides the match. We store the score, not the selfie.
            </AppText>
          </View>
        </Card>

        <AppText variant="bodySm" color="textMuted">
          Your biometric data is sensitive personal data under the Jamaica Data
          Protection Act. We keep the minimum needed, restrict who can access it, and
          you can ask us to delete it at any time from Profile → Account. We never sell
          or share it.
        </AppText>

        <Button title="I agree — continue" fullWidth loading={busy} onPress={agree} />
        <Button title="Not now" variant="text" onPress={() => router.back()} />
        {error && (
          <AppText variant="bodySm" color="error">
            {error}
          </AppText>
        )}
      </View>
    </Screen>
  );
}
