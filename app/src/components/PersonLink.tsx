import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React from 'react';
import { Pressable, View } from 'react-native';

import { Avatar } from './ui/Avatar';
import { Badge } from './ui/badges';
import { AppText } from './ui/Text';
import { lightTap } from './ui/animated';
import { useTheme } from '@/theme/ThemeContext';
import { radius, space } from '@/theme/tokens';

interface PersonLinkProps {
  id: string;
  name: string;
  avatarUrl?: string | null;
  /** Line under the name — role, headline, "asked 3h ago". */
  subtitle?: string;
  verified?: boolean;
  size?: 'sm' | 'md' | 'lg';
  /** Row (default) or a compact inline name for detail tables. */
  variant?: 'row' | 'inline';
}

/**
 * A person, that you can actually open.
 *
 * Names were printed as plain text all over the app — "With: Andre Campbell",
 * the customer on a request, the author of a review — which is a dead end at
 * exactly the moment somebody wants to know who they are dealing with. One
 * component so every one of them behaves the same, announces itself the same
 * to a screen reader, and has a tap target big enough to hit.
 *
 * Routes to /person/[id], which hands over to the full portfolio profile when
 * the person is a worker.
 */
export function PersonLink({
  id,
  name,
  avatarUrl,
  subtitle,
  verified = false,
  size = 'md',
  variant = 'row',
}: PersonLinkProps) {
  const { colors } = useTheme();

  const open = () => {
    lightTap();
    router.push({ pathname: '/person/[id]', params: { id } });
  };

  if (variant === 'inline') {
    return (
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={`${name}. Open profile.`}
        onPress={open}
        hitSlop={8}
        style={({ pressed }) => ({
          flexDirection: 'row',
          alignItems: 'center',
          gap: space.s1,
          opacity: pressed ? 0.6 : 1,
        })}
      >
        <AppText variant="bodySm" color="accent" numberOfLines={1}>
          {name}
        </AppText>
        {verified && <Ionicons name="shield-checkmark" size={12} color={colors.success} />}
        <Ionicons name="chevron-forward" size={12} color={colors.accent} />
      </Pressable>
    );
  }

  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={`${name}${verified ? ', verified' : ''}. Open profile.`}
      accessibilityHint="Shows their identity and history on myB"
      onPress={open}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.s3,
        // A comfortable target: rows this size were previously text only.
        minHeight: 48,
        paddingVertical: space.s1,
        borderRadius: radius.md,
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <Avatar name={name} uri={avatarUrl} size={size} />
      <View style={{ flex: 1, gap: 2 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.s2 }}>
          <AppText variant="label" numberOfLines={1} style={{ flexShrink: 1 }}>
            {name}
          </AppText>
          {verified && <Badge kind="verified" compact />}
        </View>
        {subtitle ? (
          <AppText variant="caption" color="textMuted" numberOfLines={1}>
            {subtitle}
          </AppText>
        ) : null}
      </View>
      <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
    </Pressable>
  );
}
