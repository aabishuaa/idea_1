import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useState } from 'react';
import { View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Screen } from '@/components/ui/Screen';
import { SuccessOverlay } from '@/components/ui/SuccessOverlay';
import { AppText } from '@/components/ui/Text';
import { useTheme } from '@/theme/ThemeContext';
import { radius, space } from '@/theme/tokens';

export default function VerificationResultScreen() {
  const { passed, similarity, demo } = useLocalSearchParams<{
    passed?: string;
    similarity?: string;
    demo?: string;
  }>();
  const { colors } = useTheme();

  const isDemo = demo === '1';
  const success = passed === '1';
  // Celebrate a genuine pass with the same moment the rest of the app uses.
  const [celebrating, setCelebrating] = useState(success && !isDemo);

  return (
    <Screen scroll={false} style={{ justifyContent: 'center' }}>
      <SuccessOverlay
        visible={celebrating}
        icon="shield-checkmark"
        title="You're verified!"
        message="Your Verified badge is live. Customers can see that myB confirmed your identity."
        actionTitle="Done"
        onAction={() => setCelebrating(false)}
      />
      <View style={{ alignItems: 'center', gap: space.s4 }}>
        <View
          style={{
            width: 88,
            height: 88,
            borderRadius: radius.full,
            backgroundColor: isDemo
              ? colors.warningSoft
              : success
                ? colors.successSoft
                : colors.errorSoft,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Ionicons
            name={isDemo ? 'flask' : success ? 'shield-checkmark' : 'close'}
            size={40}
            color={isDemo ? colors.warning : success ? colors.success : colors.error}
          />
        </View>

        <AppText variant="h1" style={{ textAlign: 'center' }}>
          {isDemo ? 'Demo complete' : success ? "You're verified!" : 'Match failed'}
        </AppText>

        <AppText variant="body" color="textMuted" style={{ textAlign: 'center' }}>
          {isDemo
            ? 'Liveness was recorded in demo mode. Run a development build for the real camera challenge and face match.'
            : success
              ? 'Both checks passed — your profile now shows the verified badge, and customers can trust it really is you.'
              : "The selfie didn't match your ID closely enough. Good lighting and a straight-on angle help — you can try again."}
        </AppText>

        {similarity && !isDemo && (
          <AppText variant="caption" color="textMuted">
            similarity {Number(similarity).toFixed(2)}
          </AppText>
        )}

        <View style={{ gap: space.s3, alignSelf: 'stretch', paddingTop: space.s4 }}>
          {!success && !isDemo && (
            <Button
              title="Try again"
              fullWidth
              onPress={() => router.replace('/verification/liveness')}
            />
          )}
          <Button
            title="Back to profile"
            variant={success ? 'primary' : 'secondary'}
            fullWidth
            onPress={() => router.dismissAll()}
          />
        </View>
      </View>
    </Screen>
  );
}
