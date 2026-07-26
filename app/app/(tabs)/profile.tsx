import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { Pressable, View } from 'react-native';

import { Avatar } from '@/components/ui/Avatar';
import { Badge } from '@/components/ui/badges';
import { Card } from '@/components/ui/Card';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { Screen } from '@/components/ui/Screen';
import { AppText } from '@/components/ui/Text';
import { Stagger } from '@/components/ui/animated';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/AuthProvider';
import { useTheme } from '@/theme/ThemeContext';
import { space } from '@/theme/tokens';
import type { WorkerProfile } from '@/types/db';

interface MenuRow {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  detail?: string;
  onPress: () => void;
}

/** Profile (design 10): identity, level progress, account menu. */
export default function ProfileScreen() {
  const { profile, signOut, refreshProfile } = useAuth();
  const { colors, isDark, setPreference } = useTheme();
  const [workerProfile, setWorkerProfile] = useState<WorkerProfile | null>(null);

  const load = useCallback(async () => {
    await refreshProfile();
    if (!profile?.id) return;
    const { data } = await supabase
      .from('worker_profiles')
      .select('*')
      .eq('user_id', profile.id)
      .maybeSingle<WorkerProfile>();
    setWorkerProfile(data ?? null);
    // refreshProfile intentionally omitted from deps: focus-triggered reload only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  if (!profile) return <Screen safeTop scroll={false}>{null}</Screen>;

  // Level from the portable reputation score (deterministic, explainable):
  // XP = reputation × 10 (0–1000), 250 XP per level.
  const xp = Math.round(Number(workerProfile?.reputation ?? 0) * 10);
  const level = Math.min(4, Math.floor(xp / 250) + 1);
  const nextLevelXp = level * 250;

  const rows: MenuRow[] = [
    {
      icon: 'person-circle-outline',
      label: 'Account',
      onPress: () => router.push('/worker-setup'),
    },
    {
      icon: 'shield-checkmark-outline',
      label: 'Verification',
      detail: profile.identity_verified ? 'Verified' : 'Not verified',
      onPress: () => router.push('/verification'),
    },
    ...(profile.is_worker
      ? ([
          {
            icon: 'briefcase-outline',
            label: 'Worker profile & services',
            onPress: () => router.push('/worker-setup'),
          },
          {
            icon: 'wallet-outline',
            label: 'Earnings',
            onPress: () => router.push('/earnings'),
          },
          {
            icon: 'ribbon-outline',
            label: 'Formalize your business',
            onPress: () => router.push('/formalize'),
          },
        ] satisfies MenuRow[])
      : ([
          {
            icon: 'construct-outline',
            label: 'Become a worker',
            detail: 'Offer your skills',
            onPress: () => router.push('/worker-setup'),
          },
        ] satisfies MenuRow[])),
    {
      icon: isDark ? 'sunny-outline' : 'moon-outline',
      label: isDark ? 'Switch to light theme' : 'Switch to dark theme',
      onPress: () => setPreference(isDark ? 'light' : 'dark'),
    },
  ];

  return (
    <Screen safeTop>
      <View style={{ gap: space.s6 }}>
        <Stagger interval={70} gap={space.s6}>
        {/* Identity header */}
        <View style={{ alignItems: 'center', gap: space.s3, paddingTop: space.s4 }}>
          <Avatar name={profile.full_name} uri={profile.avatar_url} size="xl" />
          <View style={{ alignItems: 'center', gap: space.s1 }}>
            <AppText variant="h2">{profile.full_name}</AppText>
            <AppText variant="bodySm" color="textMuted">
              {workerProfile?.headline || (profile.parish ?? 'Jamaica')}
            </AppText>
            <View style={{ flexDirection: 'row', gap: space.s2 }}>
              {profile.identity_verified && <Badge kind="verified" />}
              {workerProfile?.tier_skill && <Badge kind="topPro" />}
              {workerProfile?.tier_business && <Badge kind="pro" />}
            </View>
          </View>
        </View>

        {/* Level / reputation progress (worker) */}
        {workerProfile && (
          <Card>
            <ProgressBar
              label={`Level ${level} · ${level >= 3 ? 'Pro' : 'Rising'}`}
              trailing={`${xp} / ${nextLevelXp} XP`}
              progress={(xp % 250) / 250}
              helper={`Reputation ${Number(workerProfile.reputation).toFixed(0)} · ${workerProfile.jobs_completed} jobs completed`}
            />
          </Card>
        )}

        {/* Menu */}
        <Card style={{ padding: 0 }}>
          {rows.map((row, index) => (
            <Pressable
              key={row.label}
              accessibilityRole="button"
              onPress={row.onPress}
              style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                gap: space.s3,
                padding: space.s4,
                borderTopWidth: index === 0 ? 0 : 1,
                borderTopColor: colors.border,
                opacity: pressed ? 0.7 : 1,
              })}
            >
              <Ionicons name={row.icon} size={22} color={colors.accent} />
              <AppText variant="body" style={{ flex: 1 }}>
                {row.label}
              </AppText>
              {row.detail && (
                <AppText variant="caption" color="textMuted">
                  {row.detail}
                </AppText>
              )}
              <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
            </Pressable>
          ))}
        </Card>

        <Pressable
          accessibilityRole="button"
          onPress={() => void signOut()}
          style={({ pressed }) => ({ alignItems: 'center', opacity: pressed ? 0.7 : 1 })}
        >
          <AppText variant="label" color="error">
            Log out
          </AppText>
        </Pressable>
        </Stagger>
      </View>
    </Screen>
  );
}
