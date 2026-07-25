import React from 'react';
import { View } from 'react-native';

import { Avatar } from './ui/Avatar';
import { Badge } from './ui/badges';
import { Card } from './ui/Card';
import { Rating } from './ui/Rating';
import { AppText } from './ui/Text';
import { formatRate } from '@/lib/format';
import { space } from '@/theme/tokens';
import type { MatchedWorker } from '@/types/db';

interface WorkerCardProps {
  worker: MatchedWorker;
  onPress: () => void;
}

/** The pro card pattern from the design system (Marcus A. mockup). */
export function WorkerCard({ worker, onPress }: WorkerCardProps) {
  return (
    <Card onPress={onPress}>
      <View style={{ flexDirection: 'row', gap: space.s3, alignItems: 'center' }}>
        <Avatar name={worker.full_name} uri={worker.avatar_url} size="lg" />
        <View style={{ flex: 1, gap: space.s1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.s2, flexWrap: 'wrap' }}>
            <AppText variant="h3">{worker.full_name}</AppText>
            {worker.tier_skill && <Badge kind="topPro" />}
            {worker.identity_verified && <Badge kind="verified" />}
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.s2, flexWrap: 'wrap' }}>
            <Rating value={Number(worker.rating_avg)} />
            <AppText variant="bodySm" color="textMuted">
              · {worker.jobs_completed} jobs · {worker.service_title}
            </AppText>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.s2 }}>
            <AppText variant="label" color="accent">
              {formatRate(worker.rate_min_jmd, worker.rate_max_jmd, worker.rate_unit)}
            </AppText>
            {worker.distance_km != null && (
              <AppText variant="caption" color="textMuted">
                {worker.distance_km} km · {worker.parish}
              </AppText>
            )}
          </View>
        </View>
      </View>
    </Card>
  );
}
