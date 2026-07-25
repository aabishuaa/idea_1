import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Pressable, View } from 'react-native';

import { AppText } from './Text';
import { useTheme } from '@/theme/ThemeContext';
import { radius, space } from '@/theme/tokens';
import type { JobStatus } from '@/types/db';

/** Status pills on the semantic status tokens (Confirmed/Pending/…). */
export function StatusPill({ status }: { status: JobStatus }) {
  const { colors } = useTheme();
  const map: Record<JobStatus, { label: string; bg: string; fg: string }> = {
    requested: { label: 'Pending', bg: colors.warningSoft, fg: colors.warning },
    accepted: { label: 'Confirmed', bg: colors.successSoft, fg: colors.success },
    declined: { label: 'Declined', bg: colors.errorSoft, fg: colors.error },
    in_progress: { label: 'In progress', bg: colors.accentSoft, fg: colors.accent },
    completed: { label: 'Completed', bg: colors.successSoft, fg: colors.success },
    cancelled: { label: 'Cancelled', bg: colors.errorSoft, fg: colors.error },
  };
  const { label, bg, fg } = map[status];
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.s1,
        backgroundColor: bg,
        borderRadius: radius.full,
        paddingHorizontal: space.s3,
        paddingVertical: space.s1,
        alignSelf: 'flex-start',
      }}
    >
      <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: fg }} />
      <AppText variant="caption" style={{ color: fg }}>
        {label}
      </AppText>
    </View>
  );
}

type BadgeKind = 'topPro' | 'verified' | 'new' | 'pro';

export function Badge({ kind }: { kind: BadgeKind }) {
  const { colors } = useTheme();
  const config: Record<
    BadgeKind,
    { label: string; icon?: keyof typeof Ionicons.glyphMap; bg: string; fg: string }
  > = {
    topPro: { label: 'Top Pro', icon: 'trophy', bg: colors.warningSoft, fg: colors.warning },
    verified: {
      label: 'Verified',
      icon: 'shield-checkmark',
      bg: colors.successSoft,
      fg: colors.success,
    },
    new: { label: 'New', bg: colors.accentSoft, fg: colors.accent },
    pro: { label: 'PRO', bg: colors.accentSoft, fg: colors.accent },
  };
  const { label, icon, bg, fg } = config[kind];
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.s1,
        backgroundColor: bg,
        borderRadius: radius.full,
        paddingHorizontal: space.s2,
        paddingVertical: 2,
        alignSelf: 'flex-start',
      }}
    >
      {icon ? <Ionicons name={icon} size={11} color={fg} /> : null}
      <AppText variant="caption" style={{ color: fg }}>
        {label}
      </AppText>
    </View>
  );
}

/** Category chips — default & selected states (Plumbing / Electrical / …). */
export function Chip({
  label,
  selected = false,
  onPress,
}: {
  label: string;
  selected?: boolean;
  onPress?: () => void;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => ({
        backgroundColor: selected ? colors.accentSoft : colors.surface,
        borderWidth: 1,
        borderColor: selected ? colors.accent : colors.border,
        borderRadius: radius.full,
        paddingHorizontal: space.s4,
        paddingVertical: space.s2,
        opacity: pressed ? 0.8 : 1,
      })}
    >
      <AppText variant="caption" style={{ color: selected ? colors.accent : colors.textMuted }}>
        {label}
      </AppText>
    </Pressable>
  );
}
