import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import React, { useState } from 'react';
import { Image, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Screen } from '@/components/ui/Screen';
import { AppText } from '@/components/ui/Text';
import { AiServiceError, embedIdImage } from '@/lib/ai';
import { radius, space } from '@/theme/tokens';

/**
 * Gate 1 (FR-VER-1): pick/photograph the government ID. The AI service
 * detects + crops the face and stores only its embedding.
 */
export default function IdUploadScreen() {
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [phase, setPhase] = useState<'idle' | 'uploading'>('idle');
  const [error, setError] = useState<string | null>(null);

  const pick = async (useCamera: boolean) => {
    setError(null);
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

  const upload = async () => {
    if (!imageUri) return;
    setPhase('uploading');
    setError(null);
    try {
      await embedIdImage(imageUri);
      router.replace('/verification/liveness');
    } catch (err) {
      if (err instanceof AiServiceError) {
        if (err.detail === 'no_face_detected') {
          setError("We couldn't find a face on that photo. Try a clearer shot of the ID.");
        } else if (err.detail === 'consent_required') {
          setError('Consent is required first.');
          router.replace('/verification/consent');
          return;
        } else if (err.status === 'network' || err.status === 503) {
          setError(
            'The verification service is waking up (this can take a minute on the free tier). Please try again shortly.',
          );
        } else {
          setError('Upload failed. Please try again.');
        }
      } else {
        setError('Upload failed. Please try again.');
      }
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
      </View>
    </Screen>
  );
}
