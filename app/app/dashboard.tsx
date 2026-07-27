import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { View } from 'react-native';

import { Card } from '@/components/ui/Card';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { Screen } from '@/components/ui/Screen';
import { AppText } from '@/components/ui/Text';
import { Chip, StatusPill } from '@/components/ui/badges';
import { FadeSlideIn, Skeleton, Stagger } from '@/components/ui/animated';
import { EmptyState } from '@/components/ui/states';
import { formatDateTime, formatJmd } from '@/lib/format';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/AuthProvider';
import { useTheme } from '@/theme/ThemeContext';
import { radius, space } from '@/theme/tokens';
import type { Job, WorkerProfile } from '@/types/db';

type Lens = 'hiring' | 'working';

/** One number + label, the design system's stat tile. */
function StatTile({
  icon,
  value,
  label,
  tone = 'accent',
}: {
  icon: keyof typeof Ionicons.glyphMap;
  value: string;
  label: string;
  tone?: 'accent' | 'success' | 'warning';
}) {
  const { colors } = useTheme();
  const fg = tone === 'success' ? colors.success : tone === 'warning' ? colors.warning : colors.accent;
  const bg =
    tone === 'success' ? colors.successSoft : tone === 'warning' ? colors.warningSoft : colors.accentSoft;

  return (
    <Card style={{ flex: 1, minWidth: 150 }}>
      <View style={{ gap: space.s2 }}>
        <View
          style={{
            width: 32,
            height: 32,
            borderRadius: radius.sm,
            backgroundColor: bg,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Ionicons name={icon} size={17} color={fg} />
        </View>
        <AppText variant="h2" numberOfLines={1} adjustsFontSizeToFit>
          {value}
        </AppText>
        <AppText variant="caption" color="textMuted" numberOfLines={2}>
          {label}
        </AppText>
      </View>
    </Card>
  );
}

/**
 * Activity dashboard — the "money in / money out" view from the sidebar.
 * Customers see what they have spent and booked; workers can flip to the
 * earning side. Every figure is derived from the jobs table, never stored.
 */
export default function DashboardScreen() {
  const { session, profile } = useAuth();
  const { colors } = useTheme();
  const [lens, setLens] = useState<Lens>('hiring');
  const [jobs, setJobs] = useState<Job[] | null>(null);
  const [worker, setWorker] = useState<WorkerProfile | null>(null);
  const [favorites, setFavorites] = useState(0);

  const load = useCallback(async () => {
    if (!session) return;
    const userId = session.user.id;
    const column = lens === 'hiring' ? 'customer_id' : 'worker_id';
    const [jobsRes, workerRes, favRes] = await Promise.all([
      supabase
        .from('jobs')
        .select('*')
        .eq(column, userId)
        .order('requested_at', { ascending: false }),
      profile?.is_worker
        ? supabase.from('worker_profiles').select('*').eq('user_id', userId).maybeSingle()
        : Promise.resolve({ data: null }),
      supabase.from('favorites').select('worker_id', { count: 'exact', head: true }).eq('user_id', userId),
    ]);
    setJobs((jobsRes.data as Job[] | null) ?? []);
    setWorker((workerRes.data as WorkerProfile | null) ?? null);
    setFavorites(('count' in favRes ? favRes.count : 0) ?? 0);
  }, [session, lens, profile?.is_worker]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  if (jobs === null) {
    return (
      <Screen>
        <View style={{ gap: space.s4 }}>
          <Skeleton height={96} radius={radius.lg} />
          <Skeleton height={96} radius={radius.lg} />
          <Skeleton height={180} radius={radius.lg} />
        </View>
      </Screen>
    );
  }

  const completed = jobs.filter((job) => job.status === 'completed');
  const active = jobs.filter((job) =>
    ['requested', 'accepted', 'in_progress'].includes(job.status),
  );
  const total = completed.reduce((sum, job) => sum + Number(job.agreed_price_jmd ?? 0), 0);

  const now = new Date();
  const monthTotal = (offset: number) => {
    const from = new Date(now.getFullYear(), now.getMonth() - offset, 1);
    const to = new Date(now.getFullYear(), now.getMonth() - offset + 1, 1);
    return completed
      .filter((job) => {
        if (!job.completed_at) return false;
        const at = new Date(job.completed_at);
        return at >= from && at < to;
      })
      .reduce((sum, job) => sum + Number(job.agreed_price_jmd ?? 0), 0);
  };

  const thisMonth = monthTotal(0);
  const lastMonth = monthTotal(1);
  const delta = lastMonth > 0 ? Math.round(((thisMonth - lastMonth) / lastMonth) * 100) : null;
  const pending = active.reduce((sum, job) => sum + Number(job.agreed_price_jmd ?? 0), 0);
  const avgJob = completed.length > 0 ? total / completed.length : 0;

  // Trades this user hires most (or works most).
  const byTrade = new Map<string, number>();
  completed.forEach((job) => {
    if (!job.trade_slug) return;
    byTrade.set(job.trade_slug, (byTrade.get(job.trade_slug) ?? 0) + 1);
  });
  const topTrades = [...byTrade.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);

  const series = [5, 4, 3, 2, 1, 0].map((offset) => {
    const month = new Date(now.getFullYear(), now.getMonth() - offset, 1);
    return {
      label: month.toLocaleDateString('en-JM', { month: 'short' }),
      value: monthTotal(offset),
    };
  });
  const max = Math.max(1, ...series.map((point) => point.value));

  const spendWord = lens === 'hiring' ? 'spent' : 'earned';
  const xp = Math.round(Number(worker?.reputation ?? 0) * 10);
  const level = Math.min(4, Math.floor(xp / 250) + 1);

  return (
    <Screen>
      <View style={{ gap: space.s5 }}>
        <Stagger interval={60} gap={space.s5}>
          {/* Workers can flip between the two sides of the market. */}
          {profile?.is_worker && (
            <View style={{ flexDirection: 'row', gap: space.s2 }}>
              <Chip
                label="Money out (hiring)"
                selected={lens === 'hiring'}
                onPress={() => setLens('hiring')}
              />
              <Chip
                label="Money in (working)"
                selected={lens === 'working'}
                onPress={() => setLens('working')}
              />
            </View>
          )}

          {/* Headline figure */}
          <Card raised level={2}>
            <View style={{ gap: space.s2 }}>
              <AppText variant="caption" color="textMuted">
                Total {spendWord} this month
              </AppText>
              <AppText variant="display" numberOfLines={1} adjustsFontSizeToFit>
                {formatJmd(thisMonth)}
              </AppText>
              {delta != null ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.s1 }}>
                  <Ionicons
                    name={delta >= 0 ? 'trending-up' : 'trending-down'}
                    size={16}
                    color={
                      lens === 'hiring'
                        ? delta >= 0
                          ? colors.warning
                          : colors.success
                        : delta >= 0
                          ? colors.success
                          : colors.error
                    }
                  />
                  <AppText variant="caption" color="textMuted">
                    {delta >= 0 ? '+' : ''}
                    {delta}% vs last month
                  </AppText>
                </View>
              ) : (
                <AppText variant="caption" color="textMuted">
                  {formatJmd(total)} all time
                </AppText>
              )}
            </View>
          </Card>

          {/* Stat tiles */}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.s3 }}>
            <StatTile
              icon="checkmark-done"
              value={String(completed.length)}
              label={lens === 'hiring' ? 'Jobs completed' : 'Jobs delivered'}
              tone="success"
            />
            <StatTile
              icon="time-outline"
              value={String(active.length)}
              label="In progress"
              tone="warning"
            />
            <StatTile icon="cash-outline" value={formatJmd(avgJob)} label={`Average job`} />
            <StatTile
              icon={lens === 'hiring' ? 'heart-outline' : 'star-outline'}
              value={
                lens === 'hiring'
                  ? String(favorites)
                  : Number(worker?.rating_avg ?? 0).toFixed(1)
              }
              label={lens === 'hiring' ? 'Saved pros' : 'Average rating'}
            />
          </View>

          {pending > 0 && (
            <Card>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.s3 }}>
                <Ionicons name="hourglass-outline" size={22} color={colors.warning} />
                <View style={{ flex: 1 }}>
                  <AppText variant="label">{formatJmd(pending)} committed</AppText>
                  <AppText variant="caption" color="textMuted">
                    Across {active.length} booking{active.length === 1 ? '' : 's'} not yet completed
                  </AppText>
                </View>
              </View>
            </Card>
          )}

          {/* Worker level progress */}
          {lens === 'working' && worker && (
            <Card onPress={() => router.push('/formalize')}>
              <ProgressBar
                label={`Level ${level} · ${level >= 3 ? 'Trusted Pro' : 'Rising'}`}
                trailing={`${xp} / ${level * 250} XP`}
                progress={(xp % 250) / 250}
                helper={`${worker.jobs_completed} jobs · ${worker.rating_count} reviews`}
              />
            </Card>
          )}

          {/* 6-month trend */}
          <Card>
            <View style={{ gap: space.s3 }}>
              <AppText variant="label" color="textMuted">
                Last 6 months
              </AppText>
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'flex-end',
                  height: 120,
                  gap: space.s2,
                }}
              >
                {series.map((point, index) => (
                  <View key={point.label} style={{ flex: 1, alignItems: 'center', gap: space.s1 }}>
                    <FadeSlideIn delay={index * 70} from="bottom" distance={8}>
                      <View
                        style={{
                          width: 22,
                          height: Math.max(4, (point.value / max) * 92),
                          borderRadius: radius.sm,
                          backgroundColor: point.value === 0 ? colors.accentSoft : colors.accent,
                        }}
                      />
                    </FadeSlideIn>
                    <AppText variant="caption" color="textMuted">
                      {point.label}
                    </AppText>
                  </View>
                ))}
              </View>
            </View>
          </Card>

          {/* Where the money goes */}
          {topTrades.length > 0 && (
            <Card>
              <View style={{ gap: space.s3 }}>
                <AppText variant="label" color="textMuted">
                  {lens === 'hiring' ? 'What you book most' : 'What you work most'}
                </AppText>
                {topTrades.map(([slug, count]) => (
                  <View
                    key={slug}
                    style={{ flexDirection: 'row', justifyContent: 'space-between' }}
                  >
                    <AppText variant="bodySm" style={{ textTransform: 'capitalize' }}>
                      {slug.replace(/-/g, ' ')}
                    </AppText>
                    <AppText variant="bodySm" color="textMuted">
                      {count} job{count === 1 ? '' : 's'}
                    </AppText>
                  </View>
                ))}
              </View>
            </Card>
          )}

          {/* Booking history */}
          <View
            style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
          >
            <AppText variant="h3">Booking history</AppText>
            <AppText variant="caption" color="textMuted">
              {jobs.length} total
            </AppText>
          </View>

          {jobs.length === 0 ? (
            <EmptyState
              title="Nothing here yet"
              message={
                lens === 'hiring'
                  ? 'Book your first pro and your history will build here.'
                  : 'Job requests you accept will show up here.'
              }
              actionTitle={lens === 'hiring' ? 'Find a pro' : undefined}
              onAction={lens === 'hiring' ? () => router.push('/search') : undefined}
            />
          ) : (
            <View style={{ gap: space.s3 }}>
              {jobs.slice(0, 12).map((job) => (
                <Card key={job.id} onPress={() => router.push(`/job/${job.id}`)}>
                  <View style={{ gap: space.s2 }}>
                    <View
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: space.s2,
                      }}
                    >
                      <AppText variant="label" style={{ flex: 1 }} numberOfLines={1}>
                        {job.title}
                      </AppText>
                      <StatusPill status={job.status} />
                    </View>
                    <View
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: space.s2,
                      }}
                    >
                      <AppText variant="caption" color="textMuted" numberOfLines={1} style={{ flex: 1 }}>
                        {formatDateTime(job.requested_at)}
                        {job.parish ? ` · ${job.parish}` : ''}
                      </AppText>
                      {job.agreed_price_jmd != null && (
                        <AppText
                          variant="caption"
                          color={lens === 'hiring' ? 'text' : 'success'}
                        >
                          {lens === 'hiring' ? '' : '+ '}
                          {formatJmd(job.agreed_price_jmd)}
                        </AppText>
                      )}
                    </View>
                  </View>
                </Card>
              ))}
            </View>
          )}
        </Stagger>
      </View>
    </Screen>
  );
}
