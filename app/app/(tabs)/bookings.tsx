import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import { AppHeader } from '@/components/AppHeader';
import { Card } from '@/components/ui/Card';
import { Chip, StatusPill } from '@/components/ui/badges';
import { Screen } from '@/components/ui/Screen';
import { AppText } from '@/components/ui/Text';
import { FadeSlideIn, Skeleton, lightTap } from '@/components/ui/animated';
import { EmptyState } from '@/components/ui/states';
import { formatDateTime, formatJmd } from '@/lib/format';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/AuthProvider';
import { useTheme } from '@/theme/ThemeContext';
import { radius, space } from '@/theme/tokens';
import type { Job, JobStatus } from '@/types/db';

type RoleFilter = 'hiring' | 'working';
type SortKey = 'recent' | 'oldest' | 'value';

/** Status groups, in the order a booking actually moves through them. */
const STATUS_FILTERS: { key: 'all' | JobStatus; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'requested', label: 'Pending' },
  { key: 'accepted', label: 'Confirmed' },
  { key: 'in_progress', label: 'In progress' },
  { key: 'completed', label: 'Completed' },
  { key: 'cancelled', label: 'Cancelled' },
];

const SORTS: { key: SortKey; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: 'recent', label: 'Newest first', icon: 'arrow-down' },
  { key: 'oldest', label: 'Oldest first', icon: 'arrow-up' },
  { key: 'value', label: 'Highest value', icon: 'cash-outline' },
];

const PAGE_SIZE = 15;

/**
 * Bookings (FR-JOB-2) — both sides of the market.
 *
 * A flat dump of every job was unusable once an account had real history, so
 * this filters by status (with live counts), sorts, and pages in batches
 * rather than rendering everything at once.
 */
export default function BookingsScreen() {
  const { session, profile } = useAuth();
  const { colors } = useTheme();
  const [role, setRole] = useState<RoleFilter>('hiring');
  const [status, setStatus] = useState<'all' | JobStatus>('all');
  const [sort, setSort] = useState<SortKey>('recent');
  const [sortOpen, setSortOpen] = useState(false);
  const [jobs, setJobs] = useState<Job[] | null>(null);
  const [visible, setVisible] = useState(PAGE_SIZE);

  const load = useCallback(async () => {
    if (!session) return;
    const column = role === 'hiring' ? 'customer_id' : 'worker_id';
    const { data } = await supabase
      .from('jobs')
      .select('*')
      .eq(column, session.user.id)
      .order('requested_at', { ascending: false });
    setJobs((data as Job[] | null) ?? []);
  }, [session, role]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  // Counts per status drive the filter chips, so they are informative before
  // you tap them.
  const counts = useMemo(() => {
    const map = new Map<string, number>();
    (jobs ?? []).forEach((job) => map.set(job.status, (map.get(job.status) ?? 0) + 1));
    return map;
  }, [jobs]);

  const filtered = useMemo(() => {
    const rows = (jobs ?? []).filter((job) => status === 'all' || job.status === status);
    const sorted = [...rows];
    if (sort === 'recent') {
      sorted.sort((a, b) => +new Date(b.requested_at) - +new Date(a.requested_at));
    } else if (sort === 'oldest') {
      sorted.sort((a, b) => +new Date(a.requested_at) - +new Date(b.requested_at));
    } else {
      sorted.sort(
        (a, b) =>
          Number(b.agreed_price_jmd ?? b.budget_max_jmd ?? 0) -
          Number(a.agreed_price_jmd ?? a.budget_max_jmd ?? 0),
      );
    }
    return sorted;
  }, [jobs, status, sort]);

  const page = filtered.slice(0, visible);
  const hasMore = filtered.length > page.length;
  const activeSort = SORTS.find((option) => option.key === sort);

  return (
    <Screen safeTop>
      <View style={{ gap: space.s4 }}>
        <AppHeader />

        <View
          style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
        >
          <AppText variant="h2">Bookings</AppText>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Sort: ${activeSort?.label}`}
            onPress={() => {
              lightTap();
              setSortOpen((open) => !open);
            }}
            style={({ pressed }) => ({
              flexDirection: 'row',
              alignItems: 'center',
              gap: space.s1,
              paddingHorizontal: space.s3,
              paddingVertical: space.s2,
              borderRadius: radius.full,
              borderWidth: 1,
              borderColor: colors.border,
              opacity: pressed ? 0.7 : 1,
            })}
          >
            <Ionicons name="swap-vertical" size={15} color={colors.accent} />
            <AppText variant="caption" color="accent">
              {activeSort?.label}
            </AppText>
          </Pressable>
        </View>

        {sortOpen && (
          <FadeSlideIn from="top" distance={8}>
            <Card style={{ padding: 0 }}>
              {SORTS.map((option, index) => (
                <Pressable
                  key={option.key}
                  accessibilityRole="button"
                  onPress={() => {
                    setSort(option.key);
                    setSortOpen(false);
                    setVisible(PAGE_SIZE);
                  }}
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
                  <Ionicons name={option.icon} size={16} color={colors.accent} />
                  <AppText variant="body" style={{ flex: 1 }}>
                    {option.label}
                  </AppText>
                  {sort === option.key && (
                    <Ionicons name="checkmark" size={16} color={colors.accent} />
                  )}
                </Pressable>
              ))}
            </Card>
          </FadeSlideIn>
        )}

        {/* Which side of the market (workers only) */}
        {profile?.is_worker && (
          <View style={{ flexDirection: 'row', gap: space.s2 }}>
            <Chip
              label="Jobs I booked"
              selected={role === 'hiring'}
              onPress={() => {
                setRole('hiring');
                setVisible(PAGE_SIZE);
              }}
            />
            <Chip
              label="Work I'm doing"
              selected={role === 'working'}
              onPress={() => {
                setRole('working');
                setVisible(PAGE_SIZE);
              }}
            />
          </View>
        )}

        {/* Status filters with live counts */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={{ flexDirection: 'row', gap: space.s2, paddingRight: space.s4 }}>
            {STATUS_FILTERS.map((option) => {
              const count =
                option.key === 'all' ? (jobs?.length ?? 0) : (counts.get(option.key) ?? 0);
              if (option.key !== 'all' && count === 0) return null;
              return (
                <Chip
                  key={option.key}
                  label={`${option.label} (${count})`}
                  selected={status === option.key}
                  onPress={() => {
                    setStatus(option.key);
                    setVisible(PAGE_SIZE);
                  }}
                />
              );
            })}
          </View>
        </ScrollView>

        {jobs === null ? (
          <View style={{ gap: space.s3 }}>
            <Skeleton height={86} radius={radius.lg} />
            <Skeleton height={86} radius={radius.lg} />
            <Skeleton height={86} radius={radius.lg} />
          </View>
        ) : filtered.length === 0 ? (
          <EmptyState
            title={status === 'all' ? 'No bookings yet' : 'Nothing here'}
            message={
              role === 'hiring'
                ? 'Find a pro and your first job will show up here.'
                : 'Job requests from customers will show up here.'
            }
            actionTitle={role === 'hiring' ? 'Find a pro' : undefined}
            onAction={role === 'hiring' ? () => router.push('/search') : undefined}
          />
        ) : (
          <View style={{ gap: space.s3 }}>
            {page.map((job, index) => (
              <FadeSlideIn key={job.id} delay={Math.min(index, 8) * 40}>
                <Card
                  onPress={() => router.push({ pathname: '/job/[id]', params: { id: job.id } })}
                >
                  <View style={{ gap: space.s2 }}>
                    <View
                      style={{
                        flexDirection: 'row',
                        justifyContent: 'space-between',
                        alignItems: 'center',
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
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        gap: space.s2,
                      }}
                    >
                      <AppText
                        variant="caption"
                        color="textMuted"
                        numberOfLines={1}
                        style={{ flex: 1 }}
                      >
                        {formatDateTime(job.requested_at)}
                        {job.parish ? ` · ${job.parish}` : ''}
                      </AppText>
                      {(job.agreed_price_jmd ?? job.budget_max_jmd) != null && (
                        <AppText variant="caption" color="accent">
                          {formatJmd(job.agreed_price_jmd ?? job.budget_max_jmd)}
                        </AppText>
                      )}
                    </View>
                  </View>
                </Card>
              </FadeSlideIn>
            ))}

            {hasMore && (
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  lightTap();
                  setVisible((count) => count + PAGE_SIZE);
                }}
                style={({ pressed }) => ({
                  alignItems: 'center',
                  paddingVertical: space.s4,
                  borderRadius: radius.md,
                  borderWidth: 1,
                  borderColor: colors.border,
                  opacity: pressed ? 0.7 : 1,
                })}
              >
                <AppText variant="label" color="accent">
                  Show {Math.min(PAGE_SIZE, filtered.length - page.length)} more
                </AppText>
              </Pressable>
            )}

            <AppText variant="caption" color="textMuted" style={{ textAlign: 'center' }}>
              Showing {page.length} of {filtered.length}
            </AppText>
          </View>
        )}
      </View>
    </Screen>
  );
}
