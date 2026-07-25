import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import { WorkerCard } from '@/components/WorkerCard';
import { Avatar } from '@/components/ui/Avatar';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/badges';
import { Input } from '@/components/ui/Input';
import { Screen } from '@/components/ui/Screen';
import { AppText } from '@/components/ui/Text';
import { LoadingState } from '@/components/ui/states';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/AuthProvider';
import { useTheme } from '@/theme/ThemeContext';
import { space } from '@/theme/tokens';
import type { AppNotification, MatchedWorker, Trade } from '@/types/db';

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

/** Home (design 04): greeting, search, category chips, top pros near you. */
export default function HomeScreen() {
  const { profile } = useAuth();
  const { colors } = useTheme();
  const [trades, setTrades] = useState<Trade[]>([]);
  const [topPros, setTopPros] = useState<MatchedWorker[] | null>(null);
  const [suggestion, setSuggestion] = useState<AppNotification | null>(null);

  const load = useCallback(async () => {
    const [tradesRes, prosRes, suggestionRes] = await Promise.all([
      supabase.from('trades').select('*').order('label'),
      supabase.rpc('match_workers', { p_limit: 6 }),
      supabase
        .from('notifications')
        .select('*')
        .eq('type', 'formalization_suggestion')
        .is('read_at', null)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);
    setTrades((tradesRes.data as Trade[] | null) ?? []);
    setTopPros((prosRes.data as MatchedWorker[] | null) ?? []);
    setSuggestion((suggestionRes.data as AppNotification | null) ?? null);
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const firstName = profile?.full_name.split(' ')[0] ?? 'there';

  return (
    <Screen safeTop>
      <View style={{ gap: space.s5 }}>
        {/* Header */}
        <View
          style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
        >
          <View>
            <AppText variant="caption" color="textMuted">
              {greeting()}
            </AppText>
            <AppText variant="h2">Hi, {firstName} 👋</AppText>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.s3 }}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Messages"
              onPress={() => router.push('/messages')}
              hitSlop={8}
            >
              <Ionicons name="chatbubbles-outline" size={24} color={colors.text} />
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Your profile"
              onPress={() => router.push('/(tabs)/profile')}
            >
              <Avatar name={profile?.full_name ?? ''} uri={profile?.avatar_url} size="sm" />
            </Pressable>
          </View>
        </View>

        {/* Search */}
        <Pressable accessibilityRole="button" onPress={() => router.push('/(tabs)/search')}>
          <View pointerEvents="none">
            <Input icon="search" placeholder="Search plumbers, electricians…" editable={false} />
          </View>
        </Pressable>

        {/* Formalization suggestion card (FR-BIZ-6: suggest, never enroll) */}
        {suggestion && (
          <Card
            raised
            onPress={async () => {
              await supabase
                .from('notifications')
                .update({ read_at: new Date().toISOString() })
                .eq('id', suggestion.id);
              router.push('/formalize');
            }}
          >
            <View style={{ flexDirection: 'row', gap: space.s3, alignItems: 'center' }}>
              <Ionicons name="ribbon" size={28} color={colors.accent} />
              <View style={{ flex: 1, gap: 2 }}>
                <AppText variant="label">{suggestion.title}</AppText>
                <AppText variant="bodySm" color="textMuted">
                  {suggestion.body}
                </AppText>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
            </View>
          </Card>
        )}

        {/* Category chips */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={{ flexDirection: 'row', gap: space.s2 }}>
            <Chip label="All" selected onPress={() => router.push('/(tabs)/search')} />
            {trades.map((trade) => (
              <Chip
                key={trade.slug}
                label={`${trade.emoji} ${trade.label}`}
                onPress={() =>
                  router.push({ pathname: '/(tabs)/search', params: { trade: trade.slug } })
                }
              />
            ))}
          </View>
        </ScrollView>

        {/* Top pros */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <AppText variant="h3">Top pros near you</AppText>
          <Pressable accessibilityRole="link" onPress={() => router.push('/(tabs)/search')}>
            <AppText variant="bodySm" color="accent">
              See all
            </AppText>
          </Pressable>
        </View>

        {topPros === null ? (
          <LoadingState label="Finding pros…" />
        ) : (
          <View style={{ gap: space.s4 }}>
            {topPros.map((worker) => (
              <WorkerCard
                key={worker.worker_id}
                worker={worker}
                onPress={() => router.push(`/worker/${worker.worker_id}`)}
              />
            ))}
            {topPros.length === 0 && (
              <AppText variant="bodySm" color="textMuted">
                No workers yet — check back soon, or become the first pro in your
                parish from your profile.
              </AppText>
            )}
          </View>
        )}
      </View>
    </Screen>
  );
}
