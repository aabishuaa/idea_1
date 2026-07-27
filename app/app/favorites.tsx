import { router, useFocusEffect } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { View } from 'react-native';

import { WorkerCard } from '@/components/WorkerCard';
import { Screen } from '@/components/ui/Screen';
import { AppText } from '@/components/ui/Text';
import { FadeSlideIn, Skeleton } from '@/components/ui/animated';
import { EmptyState } from '@/components/ui/states';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/AuthProvider';
import { radius, space } from '@/theme/tokens';
import type { MatchedWorker } from '@/types/db';

/** Saved pros (FR-DISC-8) — one tap to re-hire someone you trust. */
export default function FavoritesScreen() {
  const { session } = useAuth();
  const [workers, setWorkers] = useState<MatchedWorker[] | null>(null);

  const load = useCallback(async () => {
    if (!session) return;
    // Dedicated RPC rather than match_workers: that one caps at 50 rows, which
    // would silently drop a saved pro ranked below the cut.
    const { data } = await supabase.rpc('get_favorite_workers');
    setWorkers((data as MatchedWorker[] | null) ?? []);
  }, [session]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  if (workers === null) {
    return (
      <Screen>
        <View style={{ gap: space.s4 }}>
          <Skeleton height={110} radius={radius.lg} />
          <Skeleton height={110} radius={radius.lg} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <View style={{ gap: space.s4 }}>
        {workers.length === 0 ? (
          <EmptyState
            title="No saved pros yet"
            message="Tap the heart on any pro's profile to keep them here for next time."
            actionTitle="Find a pro"
            onAction={() => router.push('/search')}
          />
        ) : (
          <>
            <AppText variant="bodySm" color="textMuted">
              {workers.length} saved pro{workers.length === 1 ? '' : 's'}
            </AppText>
            {workers.map((worker, index) => (
              <FadeSlideIn key={worker.worker_id} delay={index * 60}>
                <WorkerCard
                  worker={worker}
                  onPress={() => router.push(`/worker/${worker.worker_id}`)}
                />
              </FadeSlideIn>
            ))}
          </>
        )}
      </View>
    </Screen>
  );
}
