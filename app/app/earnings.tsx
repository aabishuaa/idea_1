import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useState } from 'react';
import { View } from 'react-native';
import { useFocusEffect } from 'expo-router';

import { Card } from '@/components/ui/Card';
import { Screen } from '@/components/ui/Screen';
import { AppText } from '@/components/ui/Text';
import { EmptyState, LoadingState } from '@/components/ui/states';
import { formatJmd, timeAgo } from '@/lib/format';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/AuthProvider';
import { useTheme } from '@/theme/ThemeContext';
import { radius, space } from '@/theme/tokens';
import type { DemandInsight } from '@/types/db';

interface CompletedJob {
  id: string;
  title: string;
  agreed_price_jmd: number | null;
  completed_at: string;
}

/** Earnings (design 09): monthly stat card, trend, recent payouts, 6-month chart. */
export default function EarningsScreen() {
  const { session, profile } = useAuth();
  const { colors } = useTheme();
  const [jobs, setJobs] = useState<CompletedJob[] | null>(null);
  const [demand, setDemand] = useState<DemandInsight[]>([]);

  const load = useCallback(async () => {
    if (!session) return;
    const since = new Date();
    since.setMonth(since.getMonth() - 6);
    const [jobsRes, demandRes] = await Promise.all([
      supabase
        .from('jobs')
        .select('id, title, agreed_price_jmd, completed_at')
        .eq('worker_id', session.user.id)
        .eq('status', 'completed')
        .gte('completed_at', since.toISOString())
        .order('completed_at', { ascending: false }),
      // Local demand insight (FR-DISC-7): what customers are asking for nearby.
      supabase.rpc('get_demand_insights', { p_parish: profile?.parish ?? null }),
    ]);
    setJobs((jobsRes.data as CompletedJob[] | null) ?? []);
    setDemand((demandRes.data as DemandInsight[] | null) ?? []);
  }, [session, profile?.parish]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  if (jobs === null) {
    return (
      <Screen scroll={false}>
        <LoadingState label="Loading earnings…" />
      </Screen>
    );
  }

  const now = new Date();
  const monthTotal = (offset: number) => {
    const month = new Date(now.getFullYear(), now.getMonth() - offset, 1);
    const next = new Date(now.getFullYear(), now.getMonth() - offset + 1, 1);
    return jobs
      .filter((job) => {
        const completed = new Date(job.completed_at);
        return completed >= month && completed < next;
      })
      .reduce((sum, job) => sum + Number(job.agreed_price_jmd ?? 0), 0);
  };

  const thisMonth = monthTotal(0);
  const lastMonth = monthTotal(1);
  const delta =
    lastMonth > 0 ? Math.round(((thisMonth - lastMonth) / lastMonth) * 100) : null;

  const series = [5, 4, 3, 2, 1, 0].map((offset) => {
    const month = new Date(now.getFullYear(), now.getMonth() - offset, 1);
    return {
      label: month.toLocaleDateString('en-JM', { month: 'short' }),
      value: monthTotal(offset),
    };
  });
  const max = Math.max(1, ...series.map((point) => point.value));

  return (
    <Screen>
      <View style={{ gap: space.s5 }}>
        {/* Stat card (design pattern) */}
        <Card raised level={2}>
          <View style={{ gap: space.s2 }}>
            <AppText variant="caption" color="textMuted">
              This month
            </AppText>
            <AppText variant="display">{formatJmd(thisMonth)}</AppText>
            {delta != null && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.s1 }}>
                <Ionicons
                  name={delta >= 0 ? 'trending-up' : 'trending-down'}
                  size={16}
                  color={delta >= 0 ? colors.success : colors.error}
                />
                <AppText variant="caption" color={delta >= 0 ? 'success' : 'error'}>
                  {delta >= 0 ? '+' : ''}
                  {delta}% vs last month
                </AppText>
              </View>
            )}
          </View>
        </Card>

        {/* 6-month bar chart on the accent token */}
        <Card>
          <View style={{ gap: space.s3 }}>
            <AppText variant="label" color="textMuted">
              Last 6 months
            </AppText>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'flex-end',
                justifyContent: 'space-between',
                height: 120,
                gap: space.s2,
              }}
            >
              {series.map((point) => (
                <View key={point.label} style={{ flex: 1, alignItems: 'center', gap: space.s1 }}>
                  <View
                    style={{
                      width: '70%',
                      height: Math.max(4, (point.value / max) * 100),
                      borderRadius: radius.sm,
                      backgroundColor: point.value === 0 ? colors.accentSoft : colors.accent,
                    }}
                  />
                  <AppText variant="caption" color="textMuted">
                    {point.label}
                  </AppText>
                </View>
              ))}
            </View>
          </View>
        </Card>

        {/* Local demand insights (FR-DISC-7) */}
        {demand.length > 0 && (
          <Card>
            <View style={{ gap: space.s3 }}>
              <AppText variant="label" color="textMuted">
                In demand near you (last 30 days)
              </AppText>
              {demand.slice(0, 5).map((insight) => (
                <View
                  key={insight.trade_slug}
                  style={{ flexDirection: 'row', justifyContent: 'space-between' }}
                >
                  <AppText variant="bodySm">{insight.trade_label}</AppText>
                  <AppText variant="bodySm" color="textMuted">
                    {insight.job_count} job{insight.job_count === 1 ? '' : 's'}
                    {insight.avg_budget_jmd != null
                      ? ` · avg ${formatJmd(insight.avg_budget_jmd)}`
                      : ''}
                  </AppText>
                </View>
              ))}
            </View>
          </Card>
        )}

        {/* Recent payouts */}
        <AppText variant="h3">Recent jobs</AppText>
        {jobs.length === 0 ? (
          <EmptyState
            title="No earnings yet"
            message="Completed jobs and their payouts will show up here."
          />
        ) : (
          <View style={{ gap: space.s3 }}>
            {jobs.slice(0, 10).map((job) => (
              <Card key={job.id}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.s3 }}>
                  <View
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: radius.md,
                      backgroundColor: colors.successSoft,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Ionicons name="checkmark" size={18} color={colors.success} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <AppText variant="label" numberOfLines={1}>
                      {job.title}
                    </AppText>
                    <AppText variant="caption" color="textMuted">
                      {timeAgo(job.completed_at)}
                    </AppText>
                  </View>
                  <AppText variant="label" color="success">
                    + {formatJmd(job.agreed_price_jmd).replace('JMD ', '')}
                  </AppText>
                </View>
              </Card>
            ))}
          </View>
        )}
      </View>
    </Screen>
  );
}
