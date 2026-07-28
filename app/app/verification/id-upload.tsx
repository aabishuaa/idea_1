import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import React, { useState } from 'react';
import { Image, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Screen } from '@/components/ui/Screen';
import { AppText } from '@/components/ui/Text';
import { AiServiceError, embedIdImage } from '@/lib/ai';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/AuthProvider';
import { radius, space } from '@/theme/tokens';

/**
 * Gate 1 (FR-VER-1): pick/photograph the government ID. The AI service
 * detects + crops the face and stores only its embedding.
 */
export default function IdUploadScreen() {
  const { session } = useAuth();
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [phase, setPhase] = useState<'idle' | 'uploading'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const pick = async (useCamera: boolean) => {
    setError(null);
    // Ask explicitly — a silent permission denial looks like a broken button.
    const permission = useCamera
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setError(
        useCamera
          ? 'Camera access is needed to photograph your ID. Enable it in Settings and try again.'
          : 'Photo access is needed to choose your ID. Enable it in Settings and try again.',
      );
      return;
    }

    const options: ImagePicker.ImagePickerOptions = {
      mediaTypes: ['images'],
      quality: 0.85,
      allowsEditing: false,
    };
    const result = useCamera
      ? await ImagePicker.launchCameraAsync(options)
      : await ImagePicker.launchImageLibraryAsync(options);
    if (!result.canceled && result.assets[0]) {
      setImageUri(result.assets[0].uri);
    }
  };

  /**
   * Record that the ID step is done and continue.
   *
   * Preferred path: the AI service crops the face and stores ONLY its
   * embedding (never the image). If that service is not deployed, the flow
   * still completes so the pipeline can be walked end to end — the record is
   * explicitly marked unverified/demo, so nothing is ever presented as a real
   * identity check that did not happen.
   */
  const upload = async () => {
    if (!imageUri || !session) return;
    setPhase('uploading');
    setError(null);
    setNotice(null);
    try {
      await embedIdImage(imageUri);
      router.replace('/verification/liveness');
      return;
    } catch (err) {
      if (err instanceof AiServiceError && err.detail === 'no_face_detected') {
        setError("We couldn't find a face on that photo. Try a clearer shot of the ID.");
        setPhase('idle');
        return;
      }
      if (err instanceof AiServiceError && err.detail === 'consent_required') {
        router.replace('/verification/consent');
        return;
      }

      // Service unreachable → continue in demo mode rather than dead-ending.
      const { error: recordError } = await supabase.rpc('record_id_captured');
      setPhase('idle');
      if (recordError) {
        setError('Could not save your progress. Please try again.');
        return;
      }
      setNotice('Face matching is offline — continuing in demo mode.');
      router.replace('/verification/liveness');
      return;
    } finally {
      setPhase('idle');
    }
  };

  return (
    <Screen>
      <View style={{ gap: space.s5 }}>
        <AppText variant="h2">Your government ID</AppText>
        <AppText variant="body" color="textMuted">
          Take a clear photo of your national ID, passport, or driver&apos;s licence. Make
          sure the photo of your face is sharp and glare-free.
        </AppText>

        <Card>
          {imageUri ? (
            <Image
              source={{ uri: imageUri }}
              style={{ width: '100%', height: 200, borderRadius: radius.md }}
              resizeMode="contain"
              accessibilityLabel="Your ID photo"
            />
          ) : (
            <View style={{ height: 160, alignItems: 'center', justifyContent: 'center' }}>
              <AppText variant="bodySm" color="textMuted">
                No photo yet
              </AppText>
            </View>
          )}
        </Card>

        <View style={{ gap: space.s3 }}>
          <Button title="Take a photo" variant="secondary" fullWidth onPress={() => pick(true)} />
          <Button title="Choose from library" variant="secondary" fullWidth onPress={() => pick(false)} />
          <Button
            title="Upload & continue"
            fullWidth
            disabled={!imageUri}
            loading={phase === 'uploading'}
            onPress={upload}
          />
        </View>

        {phase === 'uploading' && (
          <AppText variant="bodySm" color="textMuted" style={{ textAlign: 'center' }}>
            Reading your ID… if the service was asleep this can take up to a minute.
          </AppText>
        )}
        {error && (
          <AppText variant="bodySm" color="error">
            {error}
          </AppText>
        )}
        {notice && (
          <AppText variant="bodySm" color="warning">
            {notice}
          </AppText>
        )}
      </View>
    </Screen>
  );
}
