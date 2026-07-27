import { router, useFocusEffect } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { View } from 'react-native';

import { Card } from '@/components/ui/Card';
import { Chip, StatusPill } from '@/components/ui/badges';
import { Screen } from '@/components/ui/Screen';
import { AppText } from '@/components/ui/Text';
import { EmptyState, LoadingState } from '@/components/ui/states';
import { formatDateTime } from '@/lib/format';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/AuthProvider';
import { space } from '@/theme/tokens';
import type { Job } from '@/types/db';

type RoleFilter = 'hiring' | 'working';

/** Bookings: the job lifecycle list (FR-JOB-2), both sides of the market. */
export default function BookingsScreen() {
  const { session, profile } = useAuth();
  const [role, setRole] = useState<RoleFilter>('hiring');
  const [jobs, setJobs] = useState<Job[] | null>(null);

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

  return (
    <Screen safeTop>
      <View style={{ gap: space.s5 }}>
        <AppText variant="h2">Bookings</AppText>

        {profile?.is_worker && (
          <View style={{ flexDirection: 'row', gap: space.s2 }}>
            <Chip label="Hiring" selected={role === 'hiring'} onPress={() => setRole('hiring')} />
            <Chip label="Working" selected={role === 'working'} onPress={() => setRole('working')} />
          </View>
        )}

        {jobs === null ? (
          <LoadingState />
        ) : jobs.length === 0 ? (
          <EmptyState
            title="No bookings yet"
            message={
              role === 'hiring'
                ? 'Find a pro and your first job will show up here.'
                : 'Job requests from customers will show up here.'
            }
            actionTitle={role === 'hiring' ? 'Browse pros' : undefined}
            onAction={role === 'hiring' ? () => router.push('/search') : undefined}
          />
        ) : (
          <View style={{ gap: space.s4 }}>
            {jobs.map((job) => (
              <Card key={job.id} onPress={() => router.push(`/job/${job.id}`)}>
                <View style={{ gap: space.s2 }}>
                  <View
                    style={{
                      flexDirection: 'row',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    <AppText variant="label" style={{ flex: 1 }} numberOfLines={1}>
                      {job.title}
                    </AppText>
                    <StatusPill status={job.status} />
                  </View>
                  <AppText variant="caption" color="textMuted">
                    {formatDateTime(job.requested_at)}
                    {job.parish ? ` · ${job.parish}` : ''}
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
