import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Modal,
  Pressable,
  ScrollView,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar } from './ui/Avatar';
import { ProgressBar } from './ui/ProgressBar';
import { AppText } from './ui/Text';
import { Badge } from './ui/badges';
import { lightTap } from './ui/animated';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/AuthProvider';
import { useDrawer } from '@/providers/DrawerProvider';
import { useTheme } from '@/theme/ThemeContext';
import { radius, space } from '@/theme/tokens';
import type { WorkerProfile } from '@/types/db';

interface NavItem {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  href: string;
  badge?: number;
  hint?: string;
}

/**
 * The slide-out sidebar from the design mockups (the ☰ in the header).
 * Everything that does not earn a bottom tab lives here: the activity
 * dashboard, money in/out, favourites, BizBot, the formalization pathway,
 * verification and settings.
 */
export function AppDrawer() {
  const { open, closeDrawer } = useDrawer();
  const { profile, session, signOut } = useAuth();
  const { colors, isDark, setPreference } = useTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();

  const panelWidth = Math.min(320, width * 0.86);
  const progress = useRef(new Animated.Value(0)).current;
  const [mounted, setMounted] = useState(false);
  const [worker, setWorker] = useState<WorkerProfile | null>(null);
  const [unreadMessages, setUnreadMessages] = useState(0);
  const [unreadAlerts, setUnreadAlerts] = useState(0);

  // Load the sidebar's live numbers each time it opens.
  const load = useCallback(async () => {
    if (!session) return;
    const userId = session.user.id;
    const [workerRes, messagesRes, alertsRes] = await Promise.all([
      profile?.is_worker
        ? supabase.from('worker_profiles').select('*').eq('user_id', userId).maybeSingle()
        : Promise.resolve({ data: null }),
      supabase
        .from('messages')
        .select('id', { count: 'exact', head: true })
        .is('read_at', null)
        .neq('sender_id', userId),
      supabase
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .is('read_at', null),
    ]);
    setWorker((workerRes.data as WorkerProfile | null) ?? null);
    setUnreadMessages(('count' in messagesRes ? messagesRes.count : 0) ?? 0);
    setUnreadAlerts(('count' in alertsRes ? alertsRes.count : 0) ?? 0);
  }, [session, profile?.is_worker]);

  useEffect(() => {
    if (open) {
      setMounted(true);
      void load();
      Animated.timing(progress, {
        toValue: 1,
        duration: 280,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
    } else if (mounted) {
      Animated.timing(progress, {
        toValue: 0,
        duration: 220,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) setMounted(false);
      });
    }
  }, [open, progress, load, mounted]);

  const go = (href: string) => {
    lightTap();
    closeDrawer();
    // Let the close animation start before the navigation transition.
    setTimeout(() => router.push(href as never), 60);
  };

  if (!mounted) return null;

  const isWorker = profile?.is_worker === true;
  // Level from the portable reputation score (same rule as Profile/Home).
  const xp = Math.round(Number(worker?.reputation ?? 0) * 10);
  const level = Math.min(4, Math.floor(xp / 250) + 1);

  const primaryNav: NavItem[] = [
    { icon: 'home-outline', label: 'Home', href: '/(tabs)' },
    { icon: 'grid-outline', label: 'Dashboard', href: '/dashboard', hint: 'Your activity at a glance' },
    { icon: 'calendar-outline', label: 'Bookings', href: '/(tabs)/bookings' },
    {
      icon: 'chatbubbles-outline',
      label: 'Messages',
      href: '/(tabs)/messages',
      badge: unreadMessages,
    },
    { icon: 'heart-outline', label: 'Favourites', href: '/favorites', hint: 'Pros you saved' },
    {
      icon: 'notifications-outline',
      label: 'Notifications',
      href: '/notifications',
      badge: unreadAlerts,
    },
  ];

  const growNav: NavItem[] = [
    isWorker
      ? { icon: 'wallet-outline', label: 'Earnings', href: '/earnings', hint: 'What you have made' }
      : { icon: 'wallet-outline', label: 'Spending', href: '/dashboard', hint: 'What you have spent' },
    {
      icon: 'sparkles-outline',
      label: 'Ask BizBot',
      href: '/formalize/bizbot',
      hint: 'TRN, GCT, registration — plain answers',
    },
    {
      icon: 'ribbon-outline',
      label: 'Level Up',
      href: '/formalize',
      hint: 'Make your business official',
    },
    {
      icon: 'shield-checkmark-outline',
      label: 'Verification',
      href: '/verification',
      hint: profile?.identity_verified ? 'Verified' : 'Not verified yet',
    },
  ];

  const accountNav: NavItem[] = [
    { icon: 'person-outline', label: 'Profile', href: '/(tabs)/profile' },
    ...(isWorker
      ? [{ icon: 'briefcase-outline' as const, label: 'Worker profile', href: '/worker-setup' }]
      : [
          {
            icon: 'construct-outline' as const,
            label: 'Become a pro',
            href: '/worker-setup',
            hint: 'Offer your skills',
          },
        ]),
    { icon: 'settings-outline', label: 'Settings', href: '/settings' },
  ];

  const renderItem = (item: NavItem) => (
    <Pressable
      key={item.label}
      accessibilityRole="link"
      accessibilityLabel={item.label}
      onPress={() => go(item.href)}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.s3,
        paddingVertical: space.s3,
        paddingHorizontal: space.s3,
        borderRadius: radius.md,
        backgroundColor: pressed ? colors.accentSoft : 'transparent',
      })}
    >
      <Ionicons name={item.icon} size={20} color={colors.accent} />
      <View style={{ flex: 1 }}>
        <AppText variant="label">{item.label}</AppText>
        {item.hint ? (
          <AppText variant="caption" color="textMuted" numberOfLines={1}>
            {item.hint}
          </AppText>
        ) : null}
      </View>
      {item.badge != null && item.badge > 0 ? (
        <View
          style={{
            minWidth: 20,
            height: 20,
            borderRadius: 10,
            paddingHorizontal: 5,
            backgroundColor: colors.primary,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <AppText variant="caption" style={{ color: '#FFFFFF', fontSize: 11, lineHeight: 14 }}>
            {item.badge > 9 ? '9+' : item.badge}
          </AppText>
        </View>
      ) : (
        <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
      )}
    </Pressable>
  );

  const sectionLabel = (text: string) => (
    <AppText variant="overline" color="textMuted" style={{ paddingHorizontal: space.s3 }}>
      {text}
    </AppText>
  );

  return (
    <Modal transparent visible animationType="none" onRequestClose={closeDrawer} statusBarTranslucent>
      {/* Backdrop */}
      <Animated.View
        style={{
          ...(({ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 } as const)),
          backgroundColor: '#000',
          opacity: progress.interpolate({ inputRange: [0, 1], outputRange: [0, 0.55] }),
        }}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close menu"
          style={{ flex: 1 }}
          onPress={closeDrawer}
        />
      </Animated.View>

      {/* Panel */}
      <Animated.View
        style={{
          position: 'absolute',
          top: 0,
          bottom: 0,
          left: 0,
          width: panelWidth,
          backgroundColor: colors.bg,
          borderRightWidth: 1,
          borderRightColor: colors.border,
          transform: [
            {
              translateX: progress.interpolate({
                inputRange: [0, 1],
                outputRange: [-panelWidth, 0],
              }),
            },
          ],
        }}
      >
        <LinearGradient
          colors={[colors.accentSoft, 'transparent']}
          style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 220 }}
          pointerEvents="none"
        />

        <ScrollView
          contentContainerStyle={{
            paddingTop: insets.top + space.s4,
            paddingBottom: insets.bottom + space.s6,
            paddingHorizontal: space.s3,
            gap: space.s4,
          }}
          showsVerticalScrollIndicator={false}
        >
          {/* Identity */}
          <Pressable
            accessibilityRole="link"
            onPress={() => go('/(tabs)/profile')}
            style={{ flexDirection: 'row', alignItems: 'center', gap: space.s3, padding: space.s2 }}
          >
            <Avatar name={profile?.full_name ?? ''} uri={profile?.avatar_url} size="md" />
            <View style={{ flex: 1, gap: 2 }}>
              <AppText variant="h3" numberOfLines={1}>
                {profile?.full_name || 'Your account'}
              </AppText>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.s2 }}>
                <AppText variant="caption" color="textMuted" numberOfLines={1}>
                  {isWorker ? worker?.headline || 'Pro' : 'Customer'}
                  {profile?.parish ? ` · ${profile.parish}` : ''}
                </AppText>
                {profile?.identity_verified && <Badge kind="verified" />}
              </View>
            </View>
          </Pressable>

          {/* Worker level progress — the mockup's "Level Up Your Business" card */}
          {isWorker && worker && (
            <Pressable
              accessibilityRole="link"
              onPress={() => go('/formalize')}
              style={{
                backgroundColor: colors.surface,
                borderWidth: 1,
                borderColor: colors.border,
                borderRadius: radius.lg,
                padding: space.s4,
                gap: space.s3,
              }}
            >
              <ProgressBar
                label={`Level ${level} · ${level >= 3 ? 'Trusted Pro' : 'Rising'}`}
                trailing={`${xp} / ${level * 250} XP`}
                progress={(xp % 250) / 250}
                helper={`${worker.jobs_completed} jobs · ${Number(worker.rating_avg).toFixed(1)}★`}
              />
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.s1 }}>
                <AppText variant="caption" color="accent">
                  Level up your business
                </AppText>
                <Ionicons name="arrow-forward" size={12} color={colors.accent} />
              </View>
            </Pressable>
          )}

          <View style={{ gap: 2 }}>
            {sectionLabel('Navigate')}
            {primaryNav.map(renderItem)}
          </View>

          <View style={{ gap: 2 }}>
            {sectionLabel('Money & growth')}
            {growNav.map(renderItem)}
          </View>

          <View style={{ gap: 2 }}>
            {sectionLabel('Account')}
            {accountNav.map(renderItem)}
          </View>

          {/* Theme + sign out */}
          <View style={{ gap: 2, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: space.s3 }}>
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                lightTap();
                setPreference(isDark ? 'light' : 'dark');
              }}
              style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                gap: space.s3,
                paddingVertical: space.s3,
                paddingHorizontal: space.s3,
                borderRadius: radius.md,
                backgroundColor: pressed ? colors.accentSoft : 'transparent',
              })}
            >
              <Ionicons
                name={isDark ? 'sunny-outline' : 'moon-outline'}
                size={20}
                color={colors.accent}
              />
              <AppText variant="label" style={{ flex: 1 }}>
                {isDark ? 'Light theme' : 'Dark theme'}
              </AppText>
            </Pressable>

            <Pressable
              accessibilityRole="button"
              onPress={() => {
                closeDrawer();
                void signOut();
              }}
              style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                gap: space.s3,
                paddingVertical: space.s3,
                paddingHorizontal: space.s3,
                borderRadius: radius.md,
                backgroundColor: pressed ? colors.errorSoft : 'transparent',
              })}
            >
              <Ionicons name="log-out-outline" size={20} color={colors.error} />
              <AppText variant="label" color="error" style={{ flex: 1 }}>
                Log out
              </AppText>
            </Pressable>
          </View>
        </ScrollView>
      </Animated.View>
    </Modal>
  );
}
