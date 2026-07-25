/**
 * Active liveness challenge (gate 2 — FR-VER-2/3, SR-5).
 * Runs entirely on-device: ML Kit face detection via vision-camera frame
 * processors. Verifies head Euler-Y swing (left + right) and a blink
 * (eye-open probability dip) across frames — a printed photo fails this.
 *
 * IMPORTANT: this module imports native code and must only be loaded in a
 * custom dev build — the route gates the require() behind an Expo Go check.
 * Liveness is a separate gate from face matching; keep them separate.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import {
  Camera,
  useCameraDevice,
  useCameraPermission,
  useFrameProcessor,
} from 'react-native-vision-camera';
import {
  useFaceDetector,
  type Face,
} from 'react-native-vision-camera-face-detector';
import { Worklets } from 'react-native-worklets-core';

import { Button } from '@/components/ui/Button';
import { AppText } from '@/components/ui/Text';
import { useTheme } from '@/theme/ThemeContext';
import { radius, space } from '@/theme/tokens';

export interface LivenessMetadata {
  demo: boolean;
  max_yaw_left: number;
  max_yaw_right: number;
  blink_detected: boolean;
  frames_sampled: number;
}

interface LivenessCameraProps {
  onPassed: (metadata: LivenessMetadata, selfiePath: string) => void;
}

type Step = 'center' | 'left' | 'right' | 'blink' | 'capture';

const YAW_THRESHOLD = 18; // degrees of head turn required
const EYE_CLOSED = 0.3;
const EYE_OPEN = 0.7;

const STEP_COPY: Record<Step, { title: string; hint: string }> = {
  center: { title: 'Look straight ahead', hint: 'Fit your face in the frame' },
  left: { title: 'Turn your head left', hint: 'Slowly, until the step completes' },
  right: { title: 'Now turn right', hint: 'Nice and slow' },
  blink: { title: 'Blink', hint: 'Close and open both eyes' },
  capture: { title: 'Hold still…', hint: 'Taking your photo' },
};

export function LivenessCamera({ onPassed }: LivenessCameraProps) {
  const { colors } = useTheme();
  const device = useCameraDevice('front');
  const { hasPermission, requestPermission } = useCameraPermission();
  const cameraRef = useRef<Camera>(null);

  const [step, setStep] = useState<Step>('center');
  const [faceVisible, setFaceVisible] = useState(false);

  // Challenge progress lives in refs — frame callbacks are hot paths.
  const progress = useRef({
    centerFrames: 0,
    leftSign: 0,
    maxLeft: 0,
    maxRight: 0,
    eyesWereClosed: false,
    blinkDetected: false,
    frames: 0,
    capturing: false,
  });

  const { detectFaces } = useFaceDetector({
    performanceMode: 'fast',
    classificationMode: 'all', // needed for eye-open probabilities
    landmarkMode: 'none',
  });

  useEffect(() => {
    if (!hasPermission) void requestPermission();
  }, [hasPermission, requestPermission]);

  const capture = useCallback(async () => {
    if (progress.current.capturing) return;
    progress.current.capturing = true;
    try {
      const photo = await cameraRef.current?.takePhoto({ flash: 'off' });
      if (photo) {
        const state = progress.current;
        onPassed(
          {
            demo: false,
            max_yaw_left: Math.round(state.maxLeft),
            max_yaw_right: Math.round(state.maxRight),
            blink_detected: state.blinkDetected,
            frames_sampled: state.frames,
          },
          `file://${photo.path}`,
        );
      } else {
        progress.current.capturing = false;
      }
    } catch {
      progress.current.capturing = false;
    }
  }, [onPassed]);

  const onFace = Worklets.createRunOnJS((face: Face | null) => {
    const state = progress.current;
    state.frames += 1;
    setFaceVisible(face !== null);
    if (!face) return;

    const yaw = face.yawAngle ?? 0;
    const leftEye = face.leftEyeOpenProbability ?? 1;
    const rightEye = face.rightEyeOpenProbability ?? 1;

    setStep((current) => {
      switch (current) {
        case 'center':
          if (Math.abs(yaw) < 10) {
            state.centerFrames += 1;
            if (state.centerFrames > 5) return 'left';
          }
          return current;
        case 'left':
          if (Math.abs(yaw) > YAW_THRESHOLD) {
            // Record which sign this device/camera reports for "left";
            // "right" must then swing the opposite way.
            state.leftSign = Math.sign(yaw);
            state.maxLeft = Math.max(state.maxLeft, Math.abs(yaw));
            return 'right';
          }
          return current;
        case 'right':
          if (Math.abs(yaw) > YAW_THRESHOLD && Math.sign(yaw) === -state.leftSign) {
            state.maxRight = Math.max(state.maxRight, Math.abs(yaw));
            return 'blink';
          }
          return current;
        case 'blink':
          if (Math.abs(yaw) < 12) {
            if (leftEye < EYE_CLOSED && rightEye < EYE_CLOSED) {
              state.eyesWereClosed = true;
            } else if (state.eyesWereClosed && leftEye > EYE_OPEN && rightEye > EYE_OPEN) {
              state.blinkDetected = true;
              return 'capture';
            }
          }
          return current;
        case 'capture':
          return current;
      }
    });
  });

  const frameProcessor = useFrameProcessor(
    (frame) => {
      'worklet';
      const faces = detectFaces(frame);
      onFace(faces.length > 0 ? faces[0] ?? null : null);
    },
    [detectFaces, onFace],
  );

  useEffect(() => {
    if (step === 'capture') void capture();
  }, [step, capture]);

  if (!hasPermission) {
    return (
      <View style={{ alignItems: 'center', gap: space.s4, padding: space.s6 }}>
        <AppText variant="body" color="textMuted" style={{ textAlign: 'center' }}>
          myB needs camera access for the liveness check.
        </AppText>
        <Button title="Allow camera" onPress={() => void requestPermission()} />
      </View>
    );
  }

  if (!device) {
    return (
      <AppText variant="body" color="textMuted" style={{ textAlign: 'center' }}>
        No front camera found on this device.
      </AppText>
    );
  }

  const copy = STEP_COPY[step];
  const stepIndex = ['center', 'left', 'right', 'blink', 'capture'].indexOf(step);

  return (
    <View style={{ flex: 1, gap: space.s4 }}>
      <View
        style={{
          flex: 1,
          borderRadius: radius.xl,
          overflow: 'hidden',
          borderWidth: 2,
          borderColor: faceVisible ? colors.accent : colors.border,
        }}
      >
        <Camera
          ref={cameraRef}
          style={{ flex: 1 }}
          device={device}
          isActive
          photo
          frameProcessor={frameProcessor}
        />
      </View>

      <View style={{ alignItems: 'center', gap: space.s2 }}>
        <View style={{ flexDirection: 'row', gap: space.s2 }}>
          {[0, 1, 2, 3].map((index) => (
            <View
              key={index}
              style={{
                width: 24,
                height: 4,
                borderRadius: radius.full,
                backgroundColor: index < stepIndex ? colors.success : colors.border,
              }}
            />
          ))}
        </View>
        <AppText variant="h3">{copy.title}</AppText>
        <AppText variant="bodySm" color="textMuted">
          {faceVisible ? copy.hint : 'Bring your face into view'}
        </AppText>
      </View>
    </View>
  );
}
