import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { ActivityIndicator, View } from 'react-native';

import { Button } from './Button';
import { AppText } from './Text';
import { useTheme } from '@/theme/ThemeContext';
import { radius, space } from '@/theme/tokens';

/** Empty / error / loading system patterns from the design system. */

interface StateProps {
  title: string;
  message?: string;
  actionTitle?: string;
  onAction?: () => void;
}

function StateBase({
  icon,
  tint,
  title,
  message,
  actionTitle,
  onAction,
}: StateProps & { icon: keyof typeof Ionicons.glyphMap; tint: 'accent' | 'error' }) {
  const { colors } = useTheme();
  const color = tint === 'accent' ? colors.accent : colors.error;
  const softColor = tint === 'accent' ? colors.accentSoft : colors.errorSoft;

  return (
    <View style={{ alignItems: 'center', gap: space.s3, padding: space.s6 }}>
      <View
        style={{
          width: 64,
          height: 64,
          borderRadius: radius.full,
          backgroundColor: softColor,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Ionicons name={icon} size={28} color={color} />
      </View>
      <AppText variant="h3" style={{ textAlign: 'center' }}>
        {title}
      </AppText>
      {message ? (
        <AppText variant="bodySm" color="textMuted" style={{ textAlign: 'center' }}>
          {message}
        </AppText>
      ) : null}
      {actionTitle && onAction ? (
        <Button title={actionTitle} onPress={onAction} variant="secondary" />
      ) : null}
    </View>
  );
}

export function EmptyState(props: StateProps) {
  return <StateBase icon="calendar-outline" tint="accent" {...props} />;
}

export function ErrorState(props: StateProps) {
  return <StateBase icon="cloud-offline-outline" tint="error" {...props} />;
}

export function LoadingState({ label = 'Loading…' }: { label?: string }) {
  const { colors } = useTheme();
  return (
    <View style={{ alignItems: 'center', gap: space.s3, padding: space.s8 }}>
      <ActivityIndicator size="large" color={colors.accent} />
      <AppText variant="bodySm" color="textMuted">
        {label}
      </AppText>
    </View>
  );
}
