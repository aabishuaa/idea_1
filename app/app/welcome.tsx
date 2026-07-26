import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import React, { useState } from 'react';
import { View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Screen } from '@/components/ui/Screen';
import { AppText } from '@/components/ui/Text';
import { ScalePress, Stagger, successTap } from '@/components/ui/animated';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/AuthProvider';
import { useTheme } from '@/theme/ThemeContext';
import { radius, space } from '@/theme/tokens';

type Role = 'customer' | 'worker' | 'both';

const ROLES: {
  key: Role;
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  body: string;
}[] = [
  {
    key: 'customer',
    icon: 'search',
    title: 'Hire skilled pros',
    body: 'Find trusted, rated workers for jobs around your home or business.',
  },
  {
    key: 'worker',
    icon: 'construct',
    title: 'Work & earn',
    body: 'Offer your skills, get booked, and build a reputation that opens doors.',
  },
  {
    key: 'both',
    icon: 'swap-horizontal',
    title: 'A bit of both',
    body: 'Hire help when you need it and offer your own skills too.',
  },
];

/**
 * Post-signup role selection (marketplace onboarding pattern): the user
 * declares their purpose, we set the profile flags, and workers continue
 * straight into worker setup. Roles can be changed later from Profile.
 */
export default function WelcomeScreen() {
  const { profile, refreshProfile, session } = useAuth();
  const { colors } = useTheme();
  const [role, setRole] = useState<Role | null>(null);
  const [busy, setBusy] = useState(false);

  const firstName = profile?.full_name.split(' ')[0] ?? 'there';

  const submit = async () => {
    if (!role || !session) return;
    setBusy(true);
    const { error } = await supabase
      .from('profiles')
      .update({
        is_customer: role !== 'worker',
        is_worker: role !== 'customer',
      })
      .eq('id', session.user.id);
    setBusy(false);
    if (error) return; // stay put; user can retry
    successTap();
    await refreshProfile();
    if (role === 'customer') router.replace('/(tabs)');
    else router.replace('/worker-setup');
  };

  return (
    <Screen safeTop scroll={false}>
      <LinearGradient
        colors={[colors.accentSoft, 'transparent']}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 320 }}
        pointerEvents="none"
      />
      <View style={{ flex: 1, justifyContent: 'center', gap: space.s4 }}>
        <Stagger interval={90} gap={space.s4}>
          <View style={{ gap: space.s2, marginBottom: space.s2 }}>
            <AppText variant="h1">Welcome, {firstName}! 👋</AppText>
            <AppText variant="body" color="textMuted">
              How will you use myB? You can change this anytime from your profile.
            </AppText>
          </View>

          {ROLES.map((item) => {
            const selected = role === item.key;
            return (
              <ScalePress
                key={item.key}
                haptic
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                onPress={() => setRole(item.key)}
              >
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: space.s4,
                    backgroundColor: selected ? colors.accentSoft : colors.surface,
                    borderWidth: selected ? 2 : 1,
                    borderColor: selected ? colors.accent : colors.border,
                    borderRadius: radius.lg,
                    padding: space.s4,
                  }}
                >
                  <View
                    style={{
                      width: 48,
                      height: 48,
                      borderRadius: radius.md,
                      backgroundColor: selected ? colors.primary : colors.surfaceRaised,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Ionicons
                      name={item.icon}
                      size={24}
                      color={selected ? '#FFFFFF' : colors.accent}
                    />
                  </View>
                  <View style={{ flex: 1, gap: 2 }}>
                    <AppText variant="h3">{item.title}</AppText>
                    <AppText variant="bodySm" color="textMuted">
                      {item.body}
                    </AppText>
                  </View>
                  <Ionicons
                    name={selected ? 'checkmark-circle' : 'ellipse-outline'}
                    size={22}
                    color={selected ? colors.accent : colors.border}
                  />
                </View>
              </ScalePress>
            );
          })}
        </Stagger>
      </View>

      <View style={{ paddingBottom: space.s6 }}>
        <Button
          title={role === 'customer' ? 'Start exploring' : role ? 'Set up my worker profile' : 'Continue'}
          fullWidth
          disabled={!role}
          loading={busy}
          onPress={() => void submit()}
        />
      </View>
    </Screen>
  );
}
