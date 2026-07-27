import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { router } from 'expo-router';
import React from 'react';
import { Linking, Pressable, Switch, View } from 'react-native';

import { Card } from '@/components/ui/Card';
import { Screen } from '@/components/ui/Screen';
import { AppText } from '@/components/ui/Text';
import { Badge } from '@/components/ui/badges';
import { Stagger, lightTap } from '@/components/ui/animated';
import { isExpoGo } from '@/lib/runtime';
import { useAuth } from '@/providers/AuthProvider';
import { useTheme } from '@/theme/ThemeContext';
import { radius, space } from '@/theme/tokens';

interface Row {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  detail?: string;
  onPress?: () => void;
  toggle?: { value: boolean; onChange: (value: boolean) => void };
}

function SettingsGroup({ title, rows }: { title: string; rows: Row[] }) {
  const { colors } = useTheme();
  return (
    <View style={{ gap: space.s2 }}>
      <AppText variant="overline" color="textMuted">
        {title}
      </AppText>
      <Card style={{ padding: 0 }}>
        {rows.map((row, index) => (
          <Pressable
            key={row.label}
            accessibilityRole={row.toggle ? 'switch' : 'button'}
            disabled={!row.onPress && !row.toggle}
            onPress={() => {
              if (row.toggle) {
                row.toggle.onChange(!row.toggle.value);
                return;
              }
              row.onPress?.();
            }}
            style={({ pressed }) => ({
              flexDirection: 'row',
              alignItems: 'center',
              gap: space.s3,
              padding: space.s4,
              borderTopWidth: index === 0 ? 0 : 1,
              borderTopColor: colors.border,
              opacity: pressed && row.onPress ? 0.7 : 1,
            })}
          >
            <Ionicons name={row.icon} size={20} color={colors.accent} />
            <AppText variant="body" style={{ flex: 1 }} numberOfLines={1}>
              {row.label}
            </AppText>
            {row.toggle ? (
              <Switch
                value={row.toggle.value}
                onValueChange={row.toggle.onChange}
                trackColor={{ true: colors.primary, false: colors.border }}
                thumbColor="#FFFFFF"
              />
            ) : (
              <>
                {row.detail ? (
                  <AppText variant="caption" color="textMuted" numberOfLines={1}>
                    {row.detail}
                  </AppText>
                ) : null}
                {row.onPress ? (
                  <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
                ) : null}
              </>
            )}
          </Pressable>
        ))}
      </Card>
    </View>
  );
}

/** Settings: account, appearance, privacy and app info. */
export default function SettingsScreen() {
  const { profile, signOut } = useAuth();
  const { colors, isDark, preference, setPreference } = useTheme();

  const version = Constants.expoConfig?.version ?? '0.1.0';

  return (
    <Screen>
      <View style={{ gap: space.s5 }}>
        <Stagger interval={70} gap={space.s5}>
          {/* Identity summary */}
          <Card>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.s3 }}>
              <View
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: radius.md,
                  backgroundColor: colors.accentSoft,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Ionicons name="person" size={22} color={colors.accent} />
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <AppText variant="label" numberOfLines={1}>
                  {profile?.full_name || 'Your account'}
                </AppText>
                <AppText variant="caption" color="textMuted" numberOfLines={1}>
                  {profile?.parish ?? 'Jamaica'} · {profile?.is_worker ? 'Pro' : 'Customer'}
                </AppText>
              </View>
              {profile?.identity_verified && <Badge kind="verified" />}
            </View>
          </Card>

          <SettingsGroup
            title="Account"
            rows={[
              {
                icon: 'person-circle-outline',
                label: 'Edit profile',
                onPress: () => router.push('/worker-setup'),
              },
              {
                icon: 'shield-checkmark-outline',
                label: 'Identity verification',
                detail: profile?.identity_verified ? 'Verified' : 'Not verified',
                onPress: () => router.push('/verification'),
              },
              {
                icon: 'call-outline',
                label: 'Phone number',
                detail: profile?.phone ?? 'Not added',
                onPress: () => router.push('/worker-setup'),
              },
            ]}
          />

          <SettingsGroup
            title="Appearance"
            rows={[
              {
                icon: isDark ? 'moon-outline' : 'sunny-outline',
                label: 'Dark theme',
                toggle: {
                  value: isDark,
                  onChange: (value) => {
                    lightTap();
                    setPreference(value ? 'dark' : 'light');
                  },
                },
              },
              {
                icon: 'phone-portrait-outline',
                label: 'Follow system theme',
                toggle: {
                  value: preference === 'system',
                  onChange: (value) => {
                    lightTap();
                    setPreference(value ? 'system' : isDark ? 'dark' : 'light');
                  },
                },
              },
            ]}
          />

          <SettingsGroup
            title="Notifications"
            rows={[
              {
                icon: 'notifications-outline',
                label: 'Push notifications',
                detail: isExpoGo ? 'Needs a dev build' : 'On',
                onPress: () => router.push('/notifications'),
              },
            ]}
          />

          <SettingsGroup
            title="Privacy & data"
            rows={[
              {
                icon: 'lock-closed-outline',
                label: 'How we handle your data',
                detail: 'Jamaica DPA',
                onPress: () => router.push('/verification/consent'),
              },
              {
                icon: 'document-text-outline',
                label: 'Formalization sources',
                onPress: () => Linking.openURL('https://www.jamaicatax.gov.jm'),
              },
            ]}
          />

          <SettingsGroup
            title="About"
            rows={[
              { icon: 'information-circle-outline', label: 'Version', detail: version },
              { icon: 'people-outline', label: 'Built by', detail: 'Bit-by-Bit' },
            ]}
          />

          <Pressable
            accessibilityRole="button"
            onPress={() => void signOut()}
            style={({ pressed }) => ({
              alignItems: 'center',
              paddingVertical: space.s4,
              borderRadius: radius.md,
              backgroundColor: pressed ? colors.errorSoft : 'transparent',
            })}
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
